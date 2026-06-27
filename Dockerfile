# syntax=docker/dockerfile:1
# One image per Multi-Zone app. Build with:
#   docker build --build-arg ZONE=commerce -t atpost/web-commerce .
#
# Multi-stage: bun installs the whole workspace, turbo builds just the target
# zone (Next standalone output), and a slim node runner ships server.js +
# static. Next auto-detects the monorepo tracing root from the lockfile; if a
# zone's standalone is missing workspace files, set `outputFileTracingRoot` to
# the repo root in that zone's next.config.ts.
ARG ZONE=commerce

# ── deps ──────────────────────────────────────────────────────────
FROM oven/bun:1.1 AS deps
WORKDIR /app
COPY package.json bun.lock* turbo.json ./
COPY apps ./apps
COPY packages ./packages
RUN bun install --frozen-lockfile

# ── build ─────────────────────────────────────────────────────────
FROM oven/bun:1.1 AS builder
ARG ZONE
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx turbo run build --filter=@atpost/${ZONE}

# ── runner ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
ARG ZONE
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    ZONE=${ZONE}
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs
# Standalone bundle (server + traced node_modules) + the static chunks.
COPY --from=builder --chown=nextjs:nodejs /app/apps/${ZONE}/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/${ZONE}/.next/static ./apps/${ZONE}/.next/static
USER nextjs
EXPOSE 3000
# Shell form so $ZONE expands at runtime.
CMD node apps/$ZONE/server.js
