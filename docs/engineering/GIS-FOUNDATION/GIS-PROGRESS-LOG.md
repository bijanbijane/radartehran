# GIS Progress Log

## 2026-11-27 — GIS foundation reconnaissance

- Inspected repository instructions, architecture policy, persistent engineering memory and execution state.
- Located existing geography engines, geospatial service, boundary version scaffold, profile evidence read model, Worker IRNI v2 identity resolver and profile tests.
- Confirmed canonical geography ownership is IRNI; Radar reads through the internal Workers Service Binding.
- Confirmed the Express profile read model remains fail-closed because identity and source-registry resolvers are not injected; approval remains denied without admin dependencies.
- Confirmed `computed_hex_fallback` is a visualization-only geometry and must not become analytical evidence.
- Confirmed geospatial state uses `AtomicJsonRepository('geospatial-state.json')` with optional remote snapshots, not a relational D1 schema. No GIS D1 binding appears in `wrangler.backend.jsonc`.
- Reviewed current Cloudflare D1 extension documentation. RTree runtime support remains unverified; no RTree migration is justified.
- Created this GIS workstream's architecture and execution-state records on the existing GIS branch.
- No tests, migrations, D1 probes, production writes, deployment, merge or release were executed.

## Next checkpoint

Resolve the storage owner and authenticated Worker/API bridge. Then add targeted regression coverage for the production fail-closed composition and approximate-geometry exclusion.

## 2026-11-27 — GIS-GUARD-001

- Implemented a defense-in-depth block in `buildNeighborhoodProfileBoundaryReadModel`: `sourceProvenance === 'computed_hex_fallback'` now produces `BOUNDARY_SOURCE_NON_AUTHORITATIVE` before any resolver can make the record publishable.
- Added a regression test that deliberately supplies a source resolver claiming `OFFICIAL_PRIMARY`; the fallback must still return BLOCKED with `evidence: null`.
- GitHub confirmed both source and test file updates on the GIS branch. The test was not executed in this session; it remains IMPLEMENTED_NOT_TESTED.


## 2026-11-27 — Branch-head reconciliation and GIS-GUARD-001 verification boundary

- Verified PR #72 remains open and Draft; its exact head at inspection was `439224c0ad44b4d80b8c2f735873a0a198049923`.
- Reconciled `GIS-EXECUTION-STATE.json` with that branch-head evidence in commit `40edd489763b2901cda896ede80737ceeadfb6d4`.
- Re-inspected `neighborhoodProfileBoundaryReadModel.ts` and its regression: `computed_hex_fallback` is blocked before identity/source resolvers can produce publishable evidence.
- Confirmed the guard test exists, but no local test command was executed and the hosted GIS jobs have no usable step/log diagnostics. Status remains IMPLEMENTED_NOT_TESTED.
- Confirmed Cloudflare's current D1 SQL documentation lists FTS5, JSON and math in its supported extension subset; the 2026-11-12 RTree export announcement does not establish Worker-runtime RTree SQL support. RTree remains UNVERIFIED.
- No production D1 schema, data, binding, deployment, merge or release was changed.
- Next exact action: obtain an executable test environment or usable hosted-runner diagnostics, then run the targeted profile-boundary test, geospatial suite, valuation-location suite and typecheck on the reconciled branch head. Keep PR #72 Draft.
