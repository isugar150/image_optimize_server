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

IMG_LOG_DIR="/app/image_optimize_server/logs"
NGINX_LOG_DIR="/var/log/nginx"

echo -e "DATE\t\tCACHE_SET\tNGINX_GET\tUNIQUE_CLIENTS"

for file in "$IMG_LOG_DIR"/image-proxy-*.log*; do
  fname=$(basename "$file")
  date=$(echo "$fname" | sed -E 's/image-proxy-([0-9]{4}-[0-9]{2}-[0-9]{2}).*/\1/')

  # Cache set count
  cache_count=$(zgrep -h "$date" "$file" 2>/dev/null \
                | grep -o "Cache set:" \
                | wc -l)

  # Nginx GET count
  nginx_count=$(zgrep -h "$date" "$NGINX_LOG_DIR"/access.log* 2>/dev/null \
                | grep -o "\"GET /" \
                | wc -l)

  # Unique client IP count
  unique_clients=$(zgrep -h "$date" "$NGINX_LOG_DIR"/access.log* 2>/dev/null \
                    | awk '{print $1}' \
                    | sort -u \
                    | wc -l)

  echo -e "$date\t$cache_count\t\t$nginx_count\t\t$unique_clients"
done
