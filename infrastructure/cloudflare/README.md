# Cloudflare infrastructure

- Worker entry: [worker/index.ts](../../worker/index.ts)
- Wrangler config: [wrangler.jsonc](../../wrangler.jsonc)
- Staging scripts: [scripts/cloudflare/](../../scripts/cloudflare/)

Deployment is triggered from the repository root (`npm run cf:build`, `wrangler deploy`). This directory holds RT-INFRA-001 documentation and future split deploy manifests.