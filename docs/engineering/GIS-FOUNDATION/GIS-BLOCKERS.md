# GIS Blockers

| ID | Severity | Blocker | Exit condition |
|---|---|---|---|
| GIS-BLK-001 | Critical | Express profile read model has no authenticated, version-pinned bridge to the IRNI Worker identity RPC. The Worker Service Binding is not directly available to the separate Express process. | Supported internal transport/adapter, authenticated service identity, strict IRNI v2 DTO validation, registry revision/checksum pinning, timeout/retry policy and fail-closed integration tests |
| GIS-BLK-002 | Critical | Trusted source-registry resolver is not implemented or injected into production composition. | Resolver backed by an authoritative source registry with source reference, publisher, license/redistribution policy, CRS, authority and verification status; negative and stale-source tests |
| GIS-BLK-003 | High | Approval route contains admin verification and independent-review checks, but `apps/api/server.ts` calls `createProductionGeospatialModule()` without `tokenVerifier` or `adminStore`; approval therefore fails closed in production. | Wire existing verified auth adapters into production composition; prove anonymous/non-admin denial, creator self-approval denial and independent admin approval in HTTP integration tests |
| GIS-BLK-004 | High | IRNI neighborhood records currently provide point identity anchors; no source-verified Tehran neighborhood polygon dataset is available in the inspected source register. | Obtain legally usable polygons with documented publisher, license, retrieval date, coverage, source CRS, geometry validation and independent review |
| GIS-BLK-005 | High | D1 RTree virtual-table runtime support has not been demonstrated against an actual D1 Worker binding. | Non-destructive disposable/staging D1 Worker probe for create/insert/query/drop and bounded query measurements; do not infer from local SQLite or export support |
| GIS-BLK-006 | Medium | Cross-neighborhood topology checks (overlap/gap/containment policy) are not established. Existing ring/hole/MultiPolygon unit regressions are committed but have not been executed on the current branch head because hosted jobs fail before recording steps. | Define adjacency/topology policy and fixtures; execute existing geometry suites plus cross-neighborhood tests on an operational runner |
| GIS-BLK-007 | High | Radar geospatial state uses JSON repository snapshots, not relational D1; storage owner, retention, access policy and migration boundary for Radar-owned GIS review records remain unresolved. | Explicit ownership, retention, authorization, concurrency, migration/rollback and operational durability decision |

## Verification evidence — 2026-11-27

- Exact branch head inspected: `0c69135b50b0ed59416f1f471ef18da64fbbbb6c`.
- GIS workflow run [46005295667](https://github.com/bijanbijane/radartehran/actions/runs/46005295667) was retried (attempt 2) through GitHub Actions.
- Attempt 2 again concluded `failure`; both job summaries returned `steps=null` and `logs_url=null`. The run metadata shows no test-step evidence. This is consistent with a runner/dispatch failure before steps, not evidence of failing GIS assertions or TypeScript diagnostics.
- No local checkout or executable test runner was available in this session. No test/typecheck pass is claimed.
- PR #72 remains Draft. No production migration, data mutation, deployment, merge or release was performed.

Do not bypass blockers with local static geography, guessed source metadata, synthetic polygons, direct IRNI D1 access or unauthenticated public endpoints.
