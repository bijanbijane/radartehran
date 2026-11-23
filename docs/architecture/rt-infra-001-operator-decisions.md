# RT-INFRA-001 — Operator decisions (recorded defaults)

| ID | Topic | Decision (implementation default) | Status |
|----|--------|-----------------------------------|--------|
| OD-01 | Production routing for unmigrated APIs | Worker returns **501** unless `STRANGLER_FALLBACK_ENABLED=true` + `STRANGLER_ORIGIN_URL` (HTTPS) proxies to Express/Container | **IMPLEMENTED** in `worker/router.ts` |
| OD-02 | CF Containers account entitlement | **UNKNOWN** — operator must confirm Workers Paid + Containers on account | BLOCKED |
| OD-03 | Dev ports | **Unified default:** `npm run dev` → :3000. **Split optional:** `npm run dev:split` → API :3001 + Vite :5173 with proxy | IMPLEMENTED |
| OD-04 | Dirty working tree (telemetry/dgov WIP) | RT-INFRA changes isolated under `apps/`, `packages/`, `docs/architecture/`; pre-existing module edits untouched | OPERATOR_AWARE |
| OD-05 | `expressRouteCatalog` ownership | Remains under `src/utils/` (api-owned); **not** in `@radartehran/contracts` | IMPLEMENTED |
| OD-06 | Edge `src/data` imports | **DEFERRED** — Worker still imports repo-root `src/data` until slim edge DTO package approved | DEFERRED |
| OD-07 | Physical `server/modules` relocation | **DEFERRED** — modules stay at `server/modules/`; entry moved to `apps/api/server.ts` | PARTIAL |