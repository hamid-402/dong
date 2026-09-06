# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS pruner
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY . .
RUN pnpm dlx turbo@2.10.12 prune @dang/web --docker

FROM node:24-alpine AS builder
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo build --filter=@dang/web...

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S dang && adduser -S dang -G dang
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
USER dang
EXPOSE 3005
ENV PORT=3005
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
