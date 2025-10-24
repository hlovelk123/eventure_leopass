# syntax=docker/dockerfile:1.7

FROM node:20-slim AS base
WORKDIR /srv/app
ENV NODE_ENV=production

FROM node:20-slim AS deps
WORKDIR /srv/app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci --include-workspace-root=false --workspace api

FROM node:20-slim AS builder
WORKDIR /srv/app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY . .
RUN npm run build --workspace api

FROM node:20-slim AS development
WORKDIR /srv/app
ENV NODE_ENV=development
COPY --from=builder /srv/app ./
CMD ["npm", "run", "start:dev", "--workspace", "api"]

FROM node:20-slim AS production
WORKDIR /srv/app
ENV NODE_ENV=production
COPY --from=builder /srv/app/api/dist ./dist
COPY --from=deps /srv/app/node_modules ./node_modules
COPY api/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/main.js"]
