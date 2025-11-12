# 이미지 최적화 프록시 서버

이미지를 프록시로 받아 WebP로 변환하고 Redis에 캐싱하는 Express 서버입니다. 허용된 도메인만 통신하며, Sharp/Redis/Winston을 이용해 최적화·캐시·로깅을 처리합니다.

## 빠른 시작
1. **패키지 설치**
   ```bash
   npm install
   ```
2. **환경 변수 준비**
   - 로컬용: `.env.example`를 `.env`로 복사 후 값 수정 (특히 `ALLOWED_DOMAINS`).
   - 운영용: `.env.production.example` → `.env.production`으로 복사 후 비밀번호 등 실서비스 값 입력.
3. **서버 실행**
   ```bash
   npm start
   ```
   기본 포트는 `3000`이며 `PORT`로 변경할 수 있습니다.
4. **PM2 실행(옵션)**
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 logs img-optimize
   ```

## 환경 변수
| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `3000` | Express 서버 포트 |
| `REDIS_HOST` | `127.0.0.1` | Redis 호스트 |
| `REDIS_PORT` | `6379` | Redis 포트 |
| `REDIS_PASSWORD` | _(없음)_ | Redis 비밀번호 (필요 시) |
| `REDIS_DB` | `0` | Redis 논리 DB 인덱스 |
| `ALLOWED_DOMAINS` | _필수_ | 허용 원본 도메인 또는 URL 접두어(쉼표 구분). |
| `REDIS_TTL_SECONDS` | `3600` | 최적화 이미지 캐시 TTL(초) |
| `LOCK_TTL_SECONDS` | `30` | Redis 락 유지 시간(초) |
| `LOCK_WAIT_TIMEOUT_MS` | `10000` | 다른 워커의 락을 기다리는 최대 시간(밀리초) |
| `LOCK_RETRY_DELAY_MS` | `150` | 락 재시도 간격(밀리초) |
| `LOG_LEVEL` | `info` | Winston 로그 레벨 |
| `ORIGIN_TIMEOUT_MS` | `5000` | 원본 서버 응답 타임아웃(밀리초). 초과 시 504 응답 |
| `ORIGIN_MAX_BYTES` | `10485760` | 원본 다운로드 최대 바이트(10MB). 초과 시 413 응답 |
| `OUTPUT_MAX_BYTES` | `10485760` | 최적화 결과 최대 바이트(10MB). 초과 시 413 응답 |
| `SHARP_MAX_PIXELS` | `16000000` | Sharp 입력 픽셀 상한(약 16MP). 초과 시 거부 |

> 개발 모드에서는 `.env`, 운영 모드(`NODE_ENV=production`)에서는 `.env.production`을 자동으로 불러옵니다.

## ALLOWED_DOMAINS 설정
```bash
ALLOWED_DOMAINS=cafe24img.poxo.com,https://img.yourbrand.com/,https://cdn.yourbrand.com/
```
- URL Prefix 또는 도메인 둘 다 허용합니다.
  - 도메인만 지정하면 호스트 일치로 판단하며 `http://`, `https://`, `//` 형태의 요청 모두 허용됩니다.
  - URL Prefix(예: `https://img.yourbrand.com/`)를 쓰면 `startsWith`로 더 엄격히 매칭합니다.
- 값이 비어 있으면 서버가 즉시 종료되어 오픈 프록시 구성을 방지합니다.
- 신규 도메인을 추가할 때마다 `.env` / `.env.production`을 업데이트하세요.

## 요청 흐름
```
GET /?u=<image-url>&w=<width>&h=<height>&ref=<referer>
```
- `u` (필수): 원본 이미지 URL. 프로토콜이 없으면 자동으로 HTTPS로 보정합니다.
- `w`, `h` (선택): 목표 가로/세로. 비워 두면 원본 URL에 있는 파라미터를 재사용합니다.
- `ref` (선택): 원본 서버로 전달할 Referer.
- 응답은 항상 WebP(`Content-Type: image/webp`)이며, Redis 상태에 따라 `X-Cache` 헤더로 HIT/MISS/락 대기 정보를 제공합니다.
- 허용 목록(`ALLOWED_DOMAINS` 또는 구버전 `ALLOWED_PREFIXES`)에 속하지 않는 URL은 즉시 400으로 차단됩니다.
- Redis 락을 이용해 동일 이미지에 대한 중복 처리 없이 하나의 워커만 fetch/resize하도록 보장합니다.

## 로깅
- `logs/` 디렉터리에 Daily Rotate 로그(`image-proxy-YYYY-MM-DD.log`)가 생성됩니다.
- 콘솔과 파일 모두 Asia/Seoul 타임스탬프를 사용하며, 예외/Unhandled rejection 전용 로그도 분리 저장됩니다.

## 샘플 클라이언트
`sample/` 폴더에는 브라우저 예제가 포함됩니다.
- `sample/index.html`: 사용 가이드와 데모 이미지.
- `sample/proxy-loader.js`: `<img data-origin="...">` 속성을 읽어 프록시 URL(`/?u=...&w=...`)을 자동으로 구성.

로컬 테스트 순서:
1. `npm start`로 서버 실행.
2. `sample/index.html`을 브라우저에서 열기.
3. 서버 주소가 다르면 `proxy-loader.js`의 `PROXY_BASE_URL` 또는 `window.PROXY_BASE_URL`을 수정.

## PM2 배포 가이드
1. 서버에 `.env.production`을 배치하고 실제 값으로 채웁니다.
2. 의존성 설치:
   ```bash
   npm ci
   ```
3. PM2로 실행:
   ```bash
   pm2 start ecosystem.config.cjs --env production
   pm2 logs img-optimize
   ```
4. 재부팅 대비 저장/부팅 스크립트 설정:
   ```bash
   pm2 save
   pm2 startup   # 출력되는 명령을 그대로 실행
   ```

### PM2 최적화 옵션
- `ecosystem.config.cjs`에 기본 운영 보호 설정이 포함되어 있습니다.
  - `max_memory_restart: '512M'`: 프로세스 메모리가 512MB를 초과하면 자동 재시작합니다.
  - `exp_backoff_restart_delay: 100`: 재시작 루프를 지수 백오프로 완화합니다.
- 필요 시 메모리 한도를 인프라 사양에 맞게 조정하세요.

## 리소스 가드/타임아웃 동작
- 원본 타임아웃: `ORIGIN_TIMEOUT_MS`(기본 5초) 초과 시 원본 요청을 중단하고 `504`를 반환합니다.
- 원본 크기 제한: 응답 `Content-Length` 또는 스트림 누적 크기가 `ORIGIN_MAX_BYTES`(기본 10MB)를 넘으면 즉시 중단하고 `413`을 반환합니다.
- 변환 픽셀 제한: `SHARP_MAX_PIXELS`를 넘는 입력은 Sharp에서 거부됩니다.
- 결과 크기 제한: 변환 결과가 `OUTPUT_MAX_BYTES`를 초과하면 `413`을 반환합니다.

## 배포 팁
- 허용되지 않은 도메인은 400으로 차단되므로 도메인 변경 시 즉시 `ALLOWED_DOMAINS`를 갱신하세요.
- Redis 캐시는 TTL에 따라 메모리를 사용하므로 인스턴스 용량에 맞게 `REDIS_TTL_SECONDS`를 조정하세요.
- 추후 자동화 테스트를 추가한다면 Jest + Supertest 조합을 권장합니다 (`npm test`).
