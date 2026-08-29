# Use exact pinned digest for reproducibility (node:18-alpine)
FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS base

# Stage 1: Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Install all dependencies (including dev) to compile TS
RUN npm ci

# Stage 2: Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Run TypeScript compilation (assumes tsc outputs to /dist)
RUN npm run build
# Remove devDependencies to keep the final image clean and small
RUN npm ci --omit=dev

# Stage 3: Runner
FROM base AS runner
WORKDIR /app

# Ensure we run securely as a non-root user
USER node

# Copy only the compiled output and production dependencies
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./

# Add an explicit HEALTHCHECK so the orchestrator can natively detect container failure
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3005/health || exit 1

EXPOSE 3005

# Use explicit node invocation (avoids npm script overhead and signal swallowing)
CMD ["node", "dist/index.js"]
