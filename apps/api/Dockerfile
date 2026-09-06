# syntax=docker/dockerfile:1.7
# Multi-stage build for @dang/api (pnpm monorepo + turbo prune)
FROM node:24-alpine AS pruner
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY . .
RUN pnpm dlx turbo@2.10.12 prune @dang/api --docker

FROM node:24-alpine AS builder
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo build --filter=@dang/api...

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S dang && adduser -S dang -G dang
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/api ./apps/api
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/package.json ./package.json
USER dang
EXPOSE 3006
CMD ["node", "apps/api/dist/main.js"]
