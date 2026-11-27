# Backend Blockers — RMEP-001

Updated: 2026-11-27
Active branch: `feat/nips-backend-runtime-foundation-2026-11-26`
Latest inspected main: `456dcacb387b908797756863b10da1f7104b658e`

## BLOCKED

### B-001 — CI failure diagnostics unavailable
- PR: #67
- Path-filtered workflow run: #45932044356, attempt 2 — failed at `detect`.
- Related failed runs on the same head commit:
  - #45932044268 — D1 domain isolation / Worker bundle / frontend RPC binding
  - #45932044250 — IRNI RPC contract
  - #45932044243 — native auth
  - #45932044234 — TypeScript / architecture / unit / storage / stress / build
- GitHub job step responses were empty. Log retrieval returned `BlobNotFound`.
- A rerun of the failed `detect` job also failed.
- **Next:** obtain raw Actions logs through an available GitHub UI/API session or reproduce the workflow locally. Do not guess the failing command.

### B-002 — Shared NIPS persistence provider
- The recorded owner decision is to reuse the existing physical `radar-neighborhood-db`, not create a fourth D1 database.
- Radar API must not receive a direct D1 binding to that database.
- Persistence must be exposed by the database-owning IRNI Worker through an authenticated, versioned NIPS storage RPC.
- **Next:** paired IRNI Worker RPC, owner-side migration, auth contract, request/response versioning, idempotency, and transactional CAS acceptance tests.

### B-003 — Canonical identity/boundary provider
- The NIPS runtime requires confirmed canonical identity and reviewed boundary evidence.
- The recorded target is the version-pinned, read-only `IRNI_GEOGRAPHY` Service Binding.
- The PR states that the intended `irni-api` service is not deployed and the binding is absent from the live Radar Production Worker.
- **Next:** verify live Cloudflare state and implement the Node/Express-compatible provider boundary only after the service contract is available.

## Explicitly not blockers

- No user approval is needed for ordinary branch code, test, or documentation changes.
- Production deployment, destructive production database operations, irreversible data changes, secret rotation/disclosure, and paid-service activation remain approval-gated.
