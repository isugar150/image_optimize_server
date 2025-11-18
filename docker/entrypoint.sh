#!/bin/sh
set -e

cd /app

# Force production profile inside Docker, regardless of external NODE_ENV
export NODE_ENV=production

# Internal app port (Express)
APP_PORT=3000

# Clean up old exception/rejection logs if any existed from previous runs
rm -f /app/logs/exceptions-*.log /app/logs/rejections-*.log 2>/dev/null || true

# Generate .env.production from container environment
cat > .env.production <<EOF
PORT=${APP_PORT}
ORIGIN_TIMEOUT_MS=${ORIGIN_TIMEOUT_MS:-5000}
ORIGIN_MAX_BYTES=${ORIGIN_MAX_BYTES:-10485760}
OUTPUT_MAX_BYTES=${OUTPUT_MAX_BYTES:-10485760}
SHARP_MAX_PIXELS=${SHARP_MAX_PIXELS:-64000000}

REDIS_HOST=${REDIS_HOST:-127.0.0.1}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_PASSWORD=${REDIS_PASSWORD:-}
REDIS_DB=${REDIS_DB:-0}
REDIS_TTL_SECONDS=${REDIS_TTL_SECONDS:-3600}

ALLOWED_DOMAINS=${ALLOWED_DOMAINS:-}
LOCK_TTL_SECONDS=${LOCK_TTL_SECONDS:-30}
LOCK_WAIT_TIMEOUT_MS=${LOCK_WAIT_TIMEOUT_MS:-10000}
LOCK_RETRY_DELAY_MS=${LOCK_RETRY_DELAY_MS:-150}
LOG_LEVEL=${LOG_LEVEL:-info}
EOF

echo "[entrypoint] Generated .env.production:"
cat .env.production

# Start Node app with PM2 (daemon) and nginx in foreground
pm2 start ecosystem.config.cjs --env production

exec nginx -g 'daemon off;'
