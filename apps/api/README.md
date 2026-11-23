# radartehran-api

Express backend for Tehran Radar.

## Owned paths (RT-INFRA-001)

| Path | Role |
|------|------|
| [apps/api/server.ts](./server.ts) | HTTP entry |
| [server/modules](../../server/modules/) | Domain route modules |
| [src/utils/server*.ts](../../src/utils/server*.ts) | Express route handlers & engines |
| [src/cells/*/*Routes.ts](../../src/cells/) | Legacy route cells mounted from server |
| [src/utils/expressRouteCatalog.ts](../../src/utils/expressRouteCatalog.ts) | Backend-only route catalog (not shared package) |

## Development

```bash
# From repository root (unified Vite + API on :3000)
npm run dev

# API-only on :3001
npm run dev:api

# Split: API :3001 + Vite :5173 with /api proxy
npm run dev:split
```

## Production build (workspace)

```bash
npm run build -w radartehran-api
# Artifact: apps/api/dist/server.mjs (+ build-metadata.json)
# Run: npm run start:prod -w radartehran-api (sets NODE_ENV=production and RADAR_API_ONLY=1 by default)
# Combined static+API in production: RADAR_SERVE_FRONTEND=1 npm run start:prod -w radartehran-api
```

Typecheck (optional, may surface pre-existing module debt): `npm run typecheck -w radartehran-api`