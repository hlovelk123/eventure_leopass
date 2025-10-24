# syntax=docker/dockerfile:1.7

FROM node:20-slim AS deps
WORKDIR /srv/app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci --include-workspace-root=false --workspace web

FROM node:20-slim AS builder
WORKDIR /srv/app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY . .
RUN npm run build --workspace web

FROM node:20-slim AS development
WORKDIR /srv/app
ENV NODE_ENV=development
COPY --from=builder /srv/app ./
CMD ["npm", "run", "dev", "--workspace", "web", "--", "--host", "0.0.0.0"]

FROM nginx:1.27-alpine AS production
WORKDIR /usr/share/nginx/html
COPY --from=builder /srv/app/web/dist ./
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
