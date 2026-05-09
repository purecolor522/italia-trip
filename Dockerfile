FROM nginx:alpine

# Copy static files
COPY index.html manifest.webmanifest icon.svg icon-maskable.svg /usr/share/nginx/html/

# Custom nginx config for SPA + caching + correct MIME types
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
