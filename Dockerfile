# ==============================================================================
# WRouter Dockerfile — Multi-stage build (Node.js 20 Alpine)
# ==============================================================================

# ---------------------- Stage 1: Dependencies ----------------------
FROM node:20-alpine AS deps

# Install native build toolchain for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy only package manifests first (leverage Docker layer caching)
COPY package.json package-lock.json ./

# Clean install — reproducible, no devDependencies in production…
# …but we need devDeps for the build stage, so use `npm ci` (full install)
RUN npm ci

# ---------------------- Stage 2: Builder ---------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Re-use the fully-installed node_modules from deps
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the source tree
COPY . .

# Build the Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------- Stage 3: Runner ----------------------------
# Because better-sqlite3 is a native addon, we keep node_modules intact
# rather than trying to use Next.js standalone output (which would miss
# the compiled .node binary).
FROM node:20-alpine AS runner

# Runtime-only system deps (wget for healthcheck)
RUN apk add --no-cache wget

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

WORKDIR /app

# Copy built artefacts and runtime dependencies
COPY --from=builder --chown=nextjs:nodejs /app/package.json        ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules        ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next               ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public              ./public

# Create the data directory for SQLite persistence and set ownership
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Switch to non-root user
USER nextjs

# Environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"

EXPOSE 20128

# Health check — lightweight probe via wget (no curl in Alpine)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:20128/api/health || exit 1

CMD ["npm", "start"]
