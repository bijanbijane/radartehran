# radartehran-frontend

React 19 SPA and Cloudflare Worker static-asset / edge routing.

## Owned paths

| Path | Role |
|------|------|
| [src/](../../src/) | UI, features, client Firebase (shared `src/data` with API until domain package split) |
| [index.html](../../index.html) | HTML shell |
| [vite.config.ts](../../vite.config.ts) | Vite + optional Cloudflare plugin |
| [worker/](../../worker/) | Edge Worker entry (`wrangler.jsonc` at repo root) |
| [public/](../../public/) | Static public assets |

## Environment

- `VITE_API_BASE_URL` — absolute API origin in production (e.g. `https://api.example.com`)
- `RADAR_DEV_SPLIT=1` — enable Vite `/api` proxy to `VITE_API_PROXY_TARGET` (default `http://127.0.0.1:3001`)

Worker production proxy to Express: `STRANGLER_FALLBACK_ENABLED=true` and `STRANGLER_ORIGIN_URL=https://...` in Wrangler vars.

## Production build (workspace)

```bash
npm run build -w radartehran-frontend
# Artifact: dist/ at repository root (Vite outDir; shared with root `npm run build` until paths migrate)
```

Workspace build runs sitemap generation and Vite using root `vite.config.ts`; it does **not** call the root package `build` script.