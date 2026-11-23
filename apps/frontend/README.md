# radartehran-frontend

React 19 SPA and **independent** Cloudflare Worker (`radartehran-frontend`) for static assets, SPA routing, and edge SEO.

## Owned paths

| Path | Role |
|------|------|
| [src/](../../src/) | UI, features, client Firebase (shared `src/data` with API until domain package split) |
| [index.html](../../index.html) | HTML shell |
| [vite.config.ts](./vite.config.ts) | Frontend Vite build + optional Cloudflare plugin (`configPath`: `./wrangler.jsonc`) |
| [wrangler.jsonc](./wrangler.jsonc) | Independent frontend Worker config (`name`: `radartehran-frontend`) |
| [worker/](./worker/) | Frontend-only edge entry (no API registry, no queue/cron) |
| [public/](../../public/) | Static public assets |

Legacy combined Worker remains at repo root: [wrangler.jsonc](../../wrangler.jsonc) + [worker/](../../worker/).

## Environment

- `VITE_API_BASE_URL` — absolute API origin in split production (required before promoting `radartehran-api`; unset keeps relative `/api` for unified local/legacy same-origin)
- `RADAR_DEV_SPLIT=1` — enable Vite `/api` proxy to `VITE_API_PROXY_TARGET` (default `http://127.0.0.1:3001`)

## Production build (workspace)

```bash
npm run build -w radartehran-frontend
# Artifact: dist/ at repository root
```

## Cloudflare Workers Builds (Dashboard)

| Setting | Value |
|---------|--------|
| Repository | `bijanbijane/radartehran` |
| Root directory | `/` |
| Build command | `npm run build -w radartehran-frontend` |
| Deploy command | `npx wrangler deploy --config apps/frontend/wrangler.jsonc` |

Use an explicit deploy command so the dashboard never falls back to root `wrangler.jsonc` (`radartehran` combined Worker).

Production promotion should set Worker vars `APP_URL` and build-time `VITE_API_BASE_URL` to the live `radartehran-api` origin when the operator has provisioned it (no invented hostnames in repo).

## Local validation

```bash
npm run build -w radartehran-frontend
npx wrangler deploy --dry-run --config apps/frontend/wrangler.jsonc
```