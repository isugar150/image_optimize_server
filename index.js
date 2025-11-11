import express from 'express';
import fetch from 'node-fetch';
import sharp from 'sharp';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import fs from 'fs';
import path from 'path';
import { createClient } from 'redis';
import dotenv from 'dotenv';

// Load environment variables (.env in dev, .env.production in prod)
const envPath = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
dotenv.config({ path: envPath });

// Configurable variables
const PORT = parseInt(process.env.PORT || '3000', 10);
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_DB = parseInt(process.env.REDIS_DB || '0', 10);
const REDIS_TTL_SECONDS = parseInt(process.env.REDIS_TTL_SECONDS || '3600', 10); // 1 hour
const LOCK_TTL_SECONDS = parseInt(process.env.LOCK_TTL_SECONDS || '30', 10); // lock expires automatically
const LOCK_WAIT_TIMEOUT_MS = parseInt(process.env.LOCK_WAIT_TIMEOUT_MS || '10000', 10);
const LOCK_RETRY_DELAY_MS = parseInt(process.env.LOCK_RETRY_DELAY_MS || '150', 10);

const app = express();

// Allowlist: supports either full URL prefixes (e.g., https://cdn.example.com/dir)
// or plain domains (e.g., cdn.example.com). Domains will match regardless of scheme
// and also work for protocol-relative inputs once normalized.
const preferredAllowed = process.env.ALLOWED_DOMAINS;
if (!preferredAllowed) {
  // Soft deprecation notice to help migration
  console.warn('[DEPRECATION] Use ALLOWED_DOMAINS instead of ALLOWED_PREFIXES. Backward-compatible for now.');
}
const ALLOWED_RAW = (preferredAllowed || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
if (ALLOWED_RAW.length === 0) {
  throw new Error('ALLOWED_DOMAINS env variable is required (comma-separated list).');
}

// Split into explicit URL prefixes and domain-only entries
const ALLOWED_URL_PREFIXES = [];
const ALLOWED_DOMAINS = new Set();
for (const entry of ALLOWED_RAW) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(entry) || entry.startsWith('//')) {
    // Treat protocol-relative as https for comparison
    const normalized = entry.startsWith('//') ? `https:${entry}` : entry;
    ALLOWED_URL_PREFIXES.push(normalized);
  } else {
    // Domain-only rule
    ALLOWED_DOMAINS.add(entry.toLowerCase());
  }
}

// 로그 폴더 준비
const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// 공통 포맷(서울 타임스탬프)
const tzTimestamp = winston.format((info) => {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
  info.timestamp = now;
  return info;
})();

const logFormat = winston.format.printf(({ timestamp, level, message, stack }) => {
  return `[${timestamp}] ${level}: ${stack || message}`;
});

// 일일 롤링 파일 트랜스포트
const rotateTransport = new DailyRotateFile({
  dirname: LOG_DIR,                 // logs/
  filename: 'image-proxy-%DATE%.log',
  datePattern: 'YYYY-MM-DD',        // 매일 새 파일
  zippedArchive: true,              // .gz 압축
  maxFiles: '7d',                   // 7일 보관
  maxSize: '50m',                   // (옵션) 파일 당 최대 크기
  level: process.env.LOG_LEVEL || 'info',
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    tzTimestamp,
    winston.format.errors({ stack: true }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        tzTimestamp,
        winston.format.colorize(),
        logFormat
      )
    }),
    rotateTransport
  ],
  exceptionHandlers: [
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '7d'
    })
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '7d'
    })
  ]
});

// Redis client for cache storage
const redisClient = createClient({
  socket: { host: REDIS_HOST, port: REDIS_PORT },
  password: REDIS_PASSWORD,
  database: REDIS_DB,
});

redisClient.on('error', (err) => {
  logger.error(`Redis error: ${err.message}`);
});

// Ensure Redis connection on startup
try {
  await redisClient.connect();
  logger.info(`Redis connected: ${REDIS_HOST}:${REDIS_PORT} db=${REDIS_DB}`);
} catch (e) {
  logger.error(`Redis connect failed: ${e.message}`);
}

app.get('/', async (req, res) => {
  try {
    let rawUrl = req.query.u;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).send('Missing required parameter: url');
    }

    // Normalize protocol-relative or schemeless inputs
    if (rawUrl.startsWith('//')) {
      rawUrl = 'https:' + rawUrl;
    } else if (!/^https?:\/\//i.test(rawUrl)) {
      rawUrl = 'https://' + rawUrl;
    }

    let originUrl;
    try {
      originUrl = new URL(rawUrl);
    } catch (e) {
      return res.status(400).send('Invalid url');
    }
    if (!['http:', 'https:'].includes(originUrl.protocol)) {
      return res.status(400).send('Only http/https urls are allowed');
    }

    // Check allow rules:
    // - Explicit URL prefixes (string startsWith)
    // - Domain-only match against parsed hostname
    const urlStr = originUrl.toString();
    const hostLower = originUrl.hostname.toLowerCase();
    const allowed =
      (ALLOWED_URL_PREFIXES.length > 0 && ALLOWED_URL_PREFIXES.some((p) => urlStr.startsWith(p))) ||
      (ALLOWED_DOMAINS.size > 0 && ALLOWED_DOMAINS.has(hostLower));
    if (!allowed) {
      logger.warn(`Blocked url (not allowed): ${rawUrl}`);
      return res.status(400).send('URL not allowed');
    }

    let width = req.query.w ? parseInt(req.query.w, 10) : null;
    let height = req.query.h ? parseInt(req.query.h, 10) : null;
    if (!Number.isFinite(width)) width = null;
    if (!Number.isFinite(height)) height = null;

    if (width == null) {
      const ow = originUrl.searchParams.get('w');
      const n = ow ? parseInt(ow, 10) : NaN;
      if (Number.isFinite(n)) width = n;
    }
    if (height == null) {
      const oh = originUrl.searchParams.get('h');
      const n = oh ? parseInt(oh, 10) : NaN;
      if (Number.isFinite(n)) height = n;
    }

    const validExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const extname = path.extname(originUrl.pathname).toLowerCase();
    if (!validExt.includes(extname)) {
      logger.info(`Skip (not image): ${originUrl.toString()}`);
      return res.status(400).send('Not an image url');
    }

    const keyUrl = new URL(originUrl.toString());
    keyUrl.searchParams.set('w', String(width));
    keyUrl.searchParams.set('h', String(height));
    const cacheKey = keyUrl.toString();
    const lockKey = `__lock__:${cacheKey}`;
    const redisReady = redisClient?.isReady === true;
    if (!redisReady) {
      logger.warn(`Redis not ready; skip cache/lock. key=${cacheKey}`);
      res.set('X-Cache', 'SKIP-NO-REDIS');
    } else {
      // Try Redis cache first
      try {
        const cachedImg = await redisClient.sendCommand(['GET', cacheKey], { returnBuffers: true });
        if (cachedImg) {
          const ok = cachedImg.length > 12
           && cachedImg.toString('ascii', 0, 4) === 'RIFF'
           && cachedImg.toString('ascii', 8, 12) === 'WEBP';
          if(!ok) {
            await redisClient.del(cacheKey);
          } else {
            logger.info(`Cache hit: ${cacheKey}`);
            res.set('Content-Type', 'image/webp');
            res.set('Cache-Control', 'public, max-age=31536000');
            res.set('X-Cache', 'HIT');
            return res.send(cachedImg);
          }
        }
      } catch (e) {
        logger.error(`Cache get failed: ${e.message}`);
      }
    }

    // Deduplicate work across cluster via Redis lock
    const tryAcquireLock = async () => {
      try {
        const ok = await redisClient.set(lockKey, '1', { NX: true, EX: LOCK_TTL_SECONDS });
        return ok === 'OK';
      } catch (e) {
        logger.error(`Lock set failed: ${e.message}`);
        return false;
      }
    };
    const releaseLock = async () => {
      try {
        await redisClient.del(lockKey);
      } catch (e) {
        logger.error(`Lock del failed: ${e.message}`);
      }
    };
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    let haveLock = false;
    if (redisReady) haveLock = await tryAcquireLock();
    if (redisReady && !haveLock) {
      // Wait for another worker to populate cache
      const startWait = Date.now();
      logger.info(`Waiting on lock for key=${cacheKey}`);
      while (Date.now() - startWait < LOCK_WAIT_TIMEOUT_MS) {
        try {
          const cached = await redisClient.sendCommand(['GET', cacheKey], { returnBuffers: true });
          if (cached) {
            logger.info(`Cache filled while waiting: ${cacheKey}`);
            res.set('Content-Type', 'image/webp');
            res.set('Cache-Control', 'public, max-age=31536000');
            res.set('X-Cache', 'HIT-WAIT');
            return res.send(cached);
          }
        } catch (_) { /* ignore */ }
        await delay(LOCK_RETRY_DELAY_MS);
      }
      // Try to acquire lock again after waiting
      haveLock = await tryAcquireLock();
    }

    logger.info(`Cache miss: ${cacheKey}, fetching with url: ${originUrl.toString()}`);

    const refererFromClient = typeof req.query.ref === 'string' ? req.query.ref : null;
    const refererHeader = (() => {
      try {
        if (refererFromClient) return new URL(refererFromClient).toString();
      } catch (_) {}
      return originUrl.origin; // safe default to origin host
    })();

    if (redisReady && !haveLock) {
      // Final attempt to read from cache after wait
      try {
        const cachedAfterWait = await redisClient.sendCommand(['GET', cacheKey], { returnBuffers: true });
        if (cachedAfterWait) {
          logger.info(`Cache hit after wait: ${cacheKey}`);
          res.set('Content-Type', 'image/webp');
          res.set('Cache-Control', 'public, max-age=31536000');
          res.set('X-Cache', 'HIT-AFTER-WAIT');
          return res.send(cachedAfterWait);
        }
      } catch (_) { /* ignore */ }

      logger.warn(`Lock wait timeout; not owner. key=${cacheKey}`);
      return res.status(504).send('Image processing in progress, please retry');
    }

    const response = await fetch(originUrl.toString(), {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': refererHeader,
      },
    });
    if (!response.ok) {
      const ct = response.headers.get('content-type');
      logger.error(`Origin fetch failed: ${originUrl.toString()} [${response.status}] ct=${ct || 'n/a'}`);
      return res.status(502).send('Failed to fetch image from origin');
    }
    const imageBuffer = await response.buffer();
    logger.info(`Origin fetched: ${originUrl.toString()}, ${imageBuffer.length} bytes`);

    let transformer = sharp(imageBuffer).webp();
    if (width || height) {
      logger.info(`Resizing: w=${width}, h=${height}`);
      transformer = transformer.resize(width || null, height || null, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    const optimizedBuffer = await transformer.toBuffer();
    logger.info(`Image processed: webp, final size=${optimizedBuffer.length} bytes`);

    // Store in Redis with TTL
    if (redisReady) {
      try {
        await redisClient.setEx(cacheKey, REDIS_TTL_SECONDS, optimizedBuffer);
        logger.info(`Cache set: key=${cacheKey} ttl=${REDIS_TTL_SECONDS}s`);
      } catch (e) {
        logger.error(`Cache set failed: ${e.message}`);
      } finally {
        await releaseLock();
      }
    }
    res.set('Content-Type', 'image/webp');
    if (redisReady) {
      res.set('Cache-Control', 'public, max-age=31536000');
    } else {
      // Do not allow downstream caching when Redis is unavailable
      res.set('Cache-Control', 'no-store');
    }
    if (redisReady) {
      res.set('X-Cache', haveLock ? 'MISS-LOCK' : 'MISS');
    } else {
      res.set('X-Cache', 'MISS-NO-REDIS');
    }
    res.send(optimizedBuffer);
  } catch (err) {
    logger.error(`Error: ${err.toString()}`);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(PORT, () => {
  logger.info(`Image proxy server running on port ${PORT}`);
});
