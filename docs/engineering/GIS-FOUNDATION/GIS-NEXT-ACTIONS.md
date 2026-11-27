# GIS Next Actions

1. **Inspect composition and persistence** — trace `apps/api/server.ts`, `moduleFactory.ts`, `geospatialRepository.ts`, and `durableRepositorySnapshotStore`; document actual runtime durability and failure behavior.
2. **Define Worker/API identity bridge** — authenticated internal route/Service Binding composition, strict IRNI v2 DTO validation, registry revision/checksum pinning, timeout and fail-closed behavior. Do not expose public unauthenticated IRNI HTTP.
3. **Implement source resolver** — independent trusted source registry resolution, authority class, source reference, CRS, license/redistribution status and verification status.
4. **Secure approval** — inject production admin authorization and independent-review policy; approval must not be available to anonymous callers.
5. **Topology regression verification** — run the committed hole-ring, MultiPolygon component, boundary edge/vertex and computed-fallback exclusion regressions on the exact branch HEAD; cross-neighborhood topology remains a separate acceptance check.
6. **Storage decision** — establish who owns Radar boundary-review records and typed observations; then design relational persistence/migration/rollback. Do not migrate canonical IRNI data into Radar.
7. **D1 capability probe** — test RTree creation/query against disposable/staging D1 Worker binding; local SQLite is insufficient.
8. **Variable catalog** — define versioned typed variable metadata and observation lifecycle using authoritative NIPS/source/evidence contracts.
9. **Pilot** — one source-verified Tehran neighborhood; no synthetic values or polygons.
10. **Verification and state sync** — first obtain usable hosted-runner diagnostics or an authorized real checkout; run `tests/neighborhood-profile-boundary-read-model.test.ts`, `npm run test:geospatial`, `npm run test:valuation-location`, and `npm run typecheck` on the exact branch HEAD; record command output and update execution state/progress log. Keep PR #72 Draft until checks are verified.

No production mutation, deployment, merge or release is authorized by this workstream record.
