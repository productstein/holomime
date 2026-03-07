# HoloMime Self-Hosted
# Build: docker build -t holomime .
# Run:   docker run -p 4321:4321 --env-file .env holomime

FROM node:22-slim AS base
WORKDIR /app

# ─── Install dependencies ────────────────────────────────────
FROM base AS deps
COPY site/package.json site/package-lock.json* ./
RUN npm ci --omit=dev
# Also install the Node adapter for self-hosted mode
RUN npm install @astrojs/node

# ─── Build ───────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY site/ ./
# Use the Docker-specific Astro config (Node adapter instead of Cloudflare)
COPY site/astro.config.docker.mjs ./astro.config.mjs
RUN npm run build

# ─── Runtime ─────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
