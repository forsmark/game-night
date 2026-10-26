# Game Night container. Build with Podman or Docker:
#   podman build -t game-night .
# The node version matches the homelab (Node 22).

# --- Build: frontend, server bundle, and production packages ---------------
FROM docker.io/library/node:22-bookworm-slim AS build
# better-sqlite3 compiles its native module when no prebuilt binary fits.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build && pnpm build:server

# A second, production-only install for the final image.
RUN rm -rf node_modules && pnpm install --frozen-lockfile --prod

# --- Run -------------------------------------------------------------------
FROM docker.io/library/node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3002 \
    DATABASE_PATH=/app/data/game-night.db

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/drizzle ./drizzle

# The database lives here. Mount a volume on it to keep data between containers.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
USER node

EXPOSE 3002
# Podman keeps this only when building with --format docker. The Quadlet file sets its own.
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3002/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist-server/index.js"]
