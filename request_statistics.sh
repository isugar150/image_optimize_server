#!/bin/bash

IMG_LOG_DIR="/app/image_optimize_server/logs"
NGINX_LOG_DIR="/var/log/nginx"

echo -e "DATE\tCACHE_SET\tNGINX_GET"

for file in "$IMG_LOG_DIR"/image-proxy-*.log*; do
  fname=$(basename "$file")
  date=$(echo "$fname" | sed -E 's/image-proxy-([0-9]{4}-[0-9]{2}-[0-9]{2}).*/\1/')

  cache_count=$(zgrep -h "$date" "$file" 2>/dev/null \
                | grep -o "Cache set:" \
                | wc -l)

  nginx_count=$(zgrep -h "$date" "$NGINX_LOG_DIR"/access.log* 2>/dev/null \
                | grep -o "\"GET /" \
                | wc -l)

  echo -e "$date\t$cache_count\t$nginx_count"
done