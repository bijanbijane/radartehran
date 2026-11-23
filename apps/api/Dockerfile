# RT-INFRA-005 — radartehran-api production image (linux/amd64, API-only, non-root).
# Build from repository root:
#   docker build --platform linux/amd64 -f apps/api/Dockerfile -t radartehran-api:local .

FROM --platform=linux/amd64 node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/contracts/package.json ./packages/contracts/
RUN npm ci --workspace=radartehran-api --workspace=@radartehran/contracts --include-workspace-root --omit=dev

FROM base AS build
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/contracts/package.json ./packages/contracts/
RUN npm ci --workspace=radartehran-api --workspace=@radartehran/contracts --include-workspace-root
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts
COPY server ./server
COPY src ./src
COPY public ./public
COPY tsconfig.json ./
RUN npm run build -w radartehran-api

FROM --platform=linux/amd64 node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    RADAR_API_ONLY=1 \
    PORT=3001
WORKDIR /app

RUN groupadd -r radar --gid 10001 \
  && useradd -r -g radar --uid 10001 -d /app -s /usr/sbin/nologin radar \
  && mkdir -p /app/.cache/repositories /app/.object-storage-bucket /app/public \
  && chown -R radar:radar /app

COPY --from=deps --chown=radar:radar /app/node_modules ./node_modules
COPY --from=build --chown=radar:radar /app/package.json ./package.json
COPY --from=build --chown=radar:radar /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=radar:radar /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=radar:radar /app/apps/api/scripts/start-production.mjs ./apps/api/scripts/start-production.mjs
COPY --from=build --chown=radar:radar /app/packages/contracts ./packages/contracts
COPY --from=build --chown=radar:radar /app/server ./server
COPY --from=build --chown=radar:radar /app/src ./src
COPY --from=build --chown=radar:radar /app/public ./public

USER radar
EXPOSE 3001
CMD ["node", "apps/api/scripts/start-production.mjs", "--port", "3001"]