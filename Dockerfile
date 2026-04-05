# Multi-stage Dockerfile for Apogee ERP
# Stage 1: deps — install all workspace dependencies
# Stage 2: build — (future: compile if needed; currently Bun runs TS directly)
# Stage 3: runtime — minimal image with only what's needed to run the server

# ── Stage 1: deps ─────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/

# Install all dependencies (including devDependencies for type-checking at build time)
RUN bun install --frozen-lockfile

# ── Stage 2: source ────────────────────────────────────────────────────────────
FROM deps AS source

# Copy source code for all workspace packages
COPY tsconfig.json biome.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/server/ ./packages/server/

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS runtime

# Install dumb-init for proper signal handling and PID 1 behaviour
RUN apk add --no-cache dumb-init

# Use non-root user provided by the base image
USER bun

WORKDIR /app

# Copy workspace manifests and lockfile
COPY --from=deps --chown=bun:bun /app/package.json /app/bun.lock ./
COPY --from=deps --chown=bun:bun /app/packages/shared/package.json ./packages/shared/
COPY --from=deps --chown=bun:bun /app/packages/server/package.json ./packages/server/

# Copy installed node_modules — root (devDependencies) and per-package.
# Bun workspaces install each package's dependencies into its own node_modules.
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=deps --chown=bun:bun /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps --chown=bun:bun /app/packages/server/node_modules ./packages/server/node_modules

# Copy compiled / source packages needed at runtime
COPY --from=source --chown=bun:bun /app/packages/shared/src ./packages/shared/src
COPY --from=source --chown=bun:bun /app/packages/server/src ./packages/server/src

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    LOG_LEVEL=info

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:${PORT}/health/live || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["bun", "packages/server/src/index.ts"]
