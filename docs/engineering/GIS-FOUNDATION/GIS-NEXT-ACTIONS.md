# GIS Next Actions

1. **Restore executable verification** — use an operational GitHub Actions runner or an authorized real checkout. The current GIS workflow retry (run `46005295667`, attempt 2) failed before any recorded steps; do not treat it as a test failure or pass.
2. **Run exact-head checks** — on Node.js 22 and exact branch HEAD, run `npm ci --no-audit --no-fund`, `tests/neighborhood-profile-boundary-read-model.test.ts`, `npm run test:geospatial`, `npm run test:valuation-location`, and `npm run typecheck`; record raw command output.
3. **Production admin dependency wiring** — identify the repository's existing Firebase token verifier and delegated-admin store adapters, then inject them into `createProductionGeospatialModule` in `apps/api/server.ts`. Add HTTP integration tests proving anonymous/non-admin denial and independent admin approval. Do not create a new auth system.
4. **Authenticated IRNI identity bridge** — select a supported internal transport from the Express runtime to the IRNI Worker; enforce service authentication, strict v2 DTO validation, revision/checksum pinning, timeout/retry limits and fail-closed behavior. Do not attempt to use a Worker-only Service Binding from Express directly.
5. **Trusted source registry** — identify the authoritative source-registry owner and API. Implement the existing resolver contract with source reference, publisher, license/redistribution status, CRS, authority, verification status and stale/revoked handling.
6. **Topology acceptance** — define cross-neighborhood adjacency, overlap and gap rules; add deterministic fixtures and execute them with existing ring/hole/MultiPolygon tests.
7. **Storage decision** — establish ownership, retention, authorization, concurrency, backup and rollback for Radar-owned boundary-review artifacts and typed profile observations. Do not migrate canonical IRNI data into Radar.
8. **D1 capability probe** — only after an authorized disposable/staging D1 Worker binding is available, test RTree create/insert/query/drop and bounded query behavior. Local SQLite is insufficient.
9. **Authoritative pilot** — ingest one Tehran neighborhood only after its source, license, CRS, canonical IRNI identity and independent review are verified. No synthetic polygons or indicator values.
10. **State synchronization** — update execution state, blockers, registers and progress log with exact commit SHA and reproducible evidence after each work package. Keep PR #72 Draft until required checks and integration gates pass.

No production mutation, deployment, merge or release is authorized by this workstream record.
