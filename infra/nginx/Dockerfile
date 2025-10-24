FROM nginx:1.27-alpine

COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf

RUN apk add --no-cache bash openssl && \
    mkdir -p /etc/nginx/certs /var/www/html

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
