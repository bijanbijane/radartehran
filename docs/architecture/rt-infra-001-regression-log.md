# RT-INFRA-001 regression log

| When | Command | Exit | Notes |
|------|---------|------|-------|
| Pre-workspace `npm install` | `npx tsx scripts/rt-infra/export-route-inventory.ts` | 0 | 378 rows written |
| Pre-workspace `npm install` | `npm run arch:check` | 0 | 0 errors |
| Pre-workspace `npm install` | `npm run test:worker` | 0 | 10/10 pass |
| Post-change (local env) | `npm run arch:check` / `test:worker` | 1 | `tsx`/`esbuild` spawn `Unknown system error -88` — environment/node_modules; re-run `npm ci` on CI |

Re-verify on operator machine:

```bash
npm ci
npm run arch:check
npm run test:worker
npx tsx scripts/rt-infra/export-route-inventory.ts
```