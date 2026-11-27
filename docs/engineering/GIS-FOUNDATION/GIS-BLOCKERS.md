# GIS Blockers

| ID | Severity | Blocker | Exit condition |
|---|---|---|---|
| GIS-BLK-001 | Critical | Express profile read model has no authenticated, version-pinned bridge to the IRNI Worker identity RPC. The Worker Service Binding is not directly available to the separate Express process. | Supported internal transport/adapter, authenticated service identity, strict IRNI v2 DTO validation, registry revision/checksum pinning, timeout/retry policy and fail-closed integration tests |
| GIS-BLK-002 | Critical | Trusted source-registry resolver is not implemented or injected into production composition. | Resolver backed by an authoritative source registry with source reference, publisher, license/redistribution policy, CRS, authority and verification status; negative and stale-source tests |
| GIS-BLK-003 | High | GIS boundary approval consumes the verified request-scoped Cloudflare session context and rejects non-admin sessions without Firebase downgrade. Read-only Cloudflare inspection confirms the deployed `radartehran-api` Worker has neither the `AUTH_INTERNAL_HMAC_SECRET` secret binding nor the `STRANGLER_ORIGIN_URL` variable; `radartehran-api-staging` has neither. The Express process environment remains unverified. The HTTP integration regression is not executed. | Operator-approved provisioning of the same high-entropy secret in the Worker and Express runtimes, verified Express origin configuration and Worker fallback activation in a non-production environment; then execute HTTP tests for anonymous/non-admin denial, creator self-approval denial and independent admin approval |
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


## Cloudflare-native approval integration — 2026-11-27

- Repository inspection found an existing Worker-to-Express HMAC assertion bridge: Worker D1 session verification mints a 30-second request-bound assertion; Express verifies it with constant-time HMAC comparison and exposes the principal through request-scoped AsyncLocalStorage. The Express bootstrap already mounts this middleware globally.
- Updated the GIS approval route to consume that verified Cloudflare session context first. A present session is authoritative: a non-admin session is denied and is never downgraded to the legacy Firebase path. Legacy Firebase adapters remain only as a fallback for requests with no Cloudflare session context.
- Added `tests/geospatial-cloudflare-session-approval.test.ts` for anonymous denial, non-admin denial and independent admin approval; registered it in `npm run test:geospatial`.
- The required shared `AUTH_INTERNAL_HMAC_SECRET` is documented but no evidence confirms provisioning in either runtime. No secret was read, created or changed; no deployment/cutover was performed.
- Exact-head GIS workflow run [46006117704](https://github.com/bijanbijane/radartehran/actions/runs/46006117704) for `f2374ae21de3cb16908d7cc6147f7a3566fd871a` failed; both jobs returned `steps=null` and `logs_url=null`. No test or typecheck execution is evidenced.
- The route integration is IMPLEMENTED_NOT_TESTED. Keep PR #72 Draft until a functioning runner produces diagnostics and the runtime bridge configuration is verified.


## Runtime configuration audit — 2026-11-27

- Inspected the repository's wrangler.backend.jsonc: the backend Worker is named radartehran-api; its staging environment is radartehran-api-staging.
- Read-only Cloudflare Workers API inspection listed script secret binding names only; secret values were not requested or returned. The radartehran-api Worker has IRNI_PUBLISH_HMAC_SECRET and RESEARCH_HMAC_SECRET; it does not have AUTH_INTERNAL_HMAC_SECRET.
- Read-only Worker settings inspection confirmed STRANGLER_ORIGIN_URL is absent from the deployed radartehran-api plain-text variable names.
- The radartehran-api-staging Worker has no secret bindings and no STRANGLER_ORIGIN_URL variable.
- The Worker route explicitly returns AUTH_SESSION_BRIDGE_NOT_CONFIGURED when the HMAC secret is missing, and the fallback path requires STRANGLER_ORIGIN_URL. Therefore the deployed Worker-side session assertion/proxy path cannot be enabled by its current configuration.
- This audit does not inspect or establish the environment of the separate Express process. No secret value was read, provisioned, rotated or changed; no Worker settings, deployment or production resource was modified.
- Exact branch HEAD 062740891fed40bd2bb39aa7ef902bb267eeebc5 has seven pull-request workflow runs concluding failure; the GIS run is https://github.com/bijanbijane/radartehran/actions/runs/46009917366. Both GIS jobs and sampled native-auth/backend-triad jobs report steps=null and logs_url=null; test execution remains unverified.
- The configured Cloudflare Preview builds reported Failed for the current head in the PR deployment status comment. Their build logs have not yet been inspected, so the root cause is unknown.
