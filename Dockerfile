FROM node:20-alpine

# Install nginx and PM2
RUN apk add --no-cache nginx bash \
  && npm install -g pm2

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Prepare nginx runtime directories
RUN mkdir -p /run/nginx /var/log/nginx

# Copy nginx config and entrypoint
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production \
    APP_ROOT_DIR=/app

EXPOSE 80

CMD ["/entrypoint.sh"]
