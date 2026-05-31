# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Allow build-time API URL injection
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# Server-side /api proxy target. Next.js bakes rewrites() destinations
# into the build manifest at BUILD time, so this MUST be present here —
# setting it only at runtime (compose `environment:`) has no effect.
# Defaults to the compose service name, which is "backend" in both the
# local and prod compose files, so the baked value is correct for both.
ARG BACKEND_INTERNAL_URL=http://backend:5000
ENV BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL}
# Ensure /app/public exists even if the repo has no static assets — the
# runner stage unconditionally copies it.
RUN mkdir -p public && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S app && adduser -S -G app app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/ >/dev/null 2>&1 || exit 1

CMD ["npm", "run", "start"]
