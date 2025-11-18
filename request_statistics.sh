# ──────────────────────────────────────────────────────────────
# Nginx Log Format 변경 전
# log_format main  '$remote_addr - $remote_user [$time_local] "$request" '
#                  '$status $body_bytes_sent "$http_referer" '
#                  '"$http_user_agent" "$http_x_forwarded_for"';

# Nginx Log Format 변경 후 (time_iso8601 적용)
# log_format main  '$remote_addr - $remote_user [$time_iso8601] "$request" '
#                  '$status $body_bytes_sent "$http_referer" '
#                  '"$http_user_agent" "$http_x_forwarded_for"';
# ──────────────────────────────────────────────────────────────

#!/bin/bash

IMG_LOG_DIR="${IMG_LOG_DIR:-/app/logs}"
NGINX_LOG_DIR="/var/log/nginx"

echo -e "DATE\t\tCACHE_SET\tNGINX_GET\tUNIQUE_CLIENTS"

# 현재(압축되지 않은) 이미지 프록시 로그만 대상으로 집계
log_files=$(find "$IMG_LOG_DIR" -maxdepth 1 -type f -name 'image-proxy-*.log' 2>/dev/null | sort)

if [ -z "$log_files" ]; then
  echo "No image-proxy logs found in $IMG_LOG_DIR" >&2
  exit 0
fi

for file in $log_files; do
  fname=$(basename "$file")
  date=$(echo "$fname" | sed -E 's/image-proxy-([0-9]{4}-[0-9]{2}-[0-9]{2}).*/\1/')

  # Cache set count
  cache_count=$(grep -h "Cache set:" "$file" 2>/dev/null | wc -l)

  # Nginx GET count - only root path ("/" or "/?") requests
  nginx_count=$(grep -h "$date" "$NGINX_LOG_DIR"/access.log* 2>/dev/null \
                | grep -E '"GET /(\?| HTTP/)' \
                | wc -l)

  # Unique client IP count - only for root path requests
  unique_clients=$(grep -h "$date" "$NGINX_LOG_DIR"/access.log* 2>/dev/null \
                    | grep -E '"GET /(\?| HTTP/)' \
                    | awk '{print $1}' \
                    | sort -u \
                    | wc -l)

  echo -e "$date\t$cache_count\t\t$nginx_count\t\t$unique_clients"
done
