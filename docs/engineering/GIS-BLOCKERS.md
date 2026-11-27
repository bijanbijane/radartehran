# Radar Tehran GIS Blockers

**Status date:** 2026-11-27  
**Active review:** [Draft PR #72](https://github.com/bijanbijane/radartehran/pull/72)  
**Latest reviewed code revision:** `2d6c707303dc2e48723c3a8869e59984199c9608`

1. **No usable execution runner or CI diagnostics.** Latest focused GIS run [45980848999](https://github.com/bijanbijane/radartehran/actions/runs/45980848999) failed both regression and TypeScript jobs (`140444049218`, `140444048835`). Both expose `steps=null`; log retrieval returns `BlobNotFound`. Path-filtered run `45980848859` failed at `detect`; broader quality, D1/Worker, IRNI RPC and native-auth workflows also failed. A retry of the prior GIS jobs produced new failed job IDs `140442697746` and `140442699939`, again with empty steps and `BlobNotFound`. The authorized Desktop Commander MacBook is offline. The first failing command and whether tests started remain unknown. Repository issue [#49](https://github.com/bijanbijane/radartehran/issues/49) tracks the wider hosted-runner allocation problem.
2. **Canonical geography provider integration.** The NIPS/profile boundary contract requires an IRNI-owned, version-pinned, read-only geography provider. The intended Worker Service Binding is not verified as deployed/configured for the Radar API.
3. **NIPS durable storage is absent.** The connected Cloudflare inventory contains `radar-neighborhood-db`, `radar-user-db` and `radar-researcher-db`, but no `radar-profile-db`. Read-only schema inspection found no `nips_*` tables in any of the three Radar databases. The NIPS module defines contracts and validation only; it has no repository, migration, binding or write path. The NIPS ERD proposes a dedicated `radar-profile-db` shared by the independent IRNI and Radar NIPS backends, separate from the three existing databases. Its owner/writer policy and provisioning require a separate architecture decision; do not create NIPS tables in IRNI's `geo_*` database.
4. **D1 RTree capability is unverified.** Read-only probes confirmed basic SELECT, JSON and math functions. The Cloudflare D1 REST query surface denied `PRAGMA module_list` and `EXPLAIN CREATE VIRTUAL TABLE ... USING rtree` with `SQLITE_AUTH`; no existing virtual tables were found in `radar-neighborhood-db`. Do not infer RTree runtime support from D1 export behavior. A non-production Worker-binding compatibility test is required.
5. **Authoritative data and licensing.** Production boundary and POI datasets, source references, licenses, retrieval dates and CRS metadata have not been assembled and verified by this work package.
6. **Topology verification is blocked by CI.** The code validates hole containment/overlap and MultiPolygon component touching/intersection/filled-area overlap; persisted recovery also validates complete boundary-history identity/version/ACTIVE invariants. Regression cases are registered, but the focused workflow exposes no step logs, so none is verified as passing. CRS-aware topology and independent fixtures derived from trusted source data remain outstanding.
7. **Active-boundary integrity is only partially hardened.** Point resolution and profile reads fail closed for relevant duplicate ACTIVE histories. Auto-approved writes are blocked; a pending version can be submitted and an independent reviewer can approve it to supersede previous ACTIVE versions. Historical snapshots are not automatically rewritten. Durable snapshot validation now checks malformed histories, key/entity agreement, duplicate IDs and version sequences, and multiple ACTIVE records across every history. Bbox diagnostics skip corrupt multi-active histories. End-to-end hydration against a real snapshot backend and all remaining consumers still require verification.
8. **CRS and metric calculations.** A verified local projected CRS and source-specific transformation policy have not been established. Do not guess a Tehran EPSG code or treat degrees as meters.

No production deployment, remote migration, live binding change, secret change, database creation, production data replacement or paid service activation was performed.


## New integrity finding (2026-11-27)

Snapshot recovery previously checked that a boundary bbox was numerically plausible and within Iran, but did not validate the persisted canonical/simplified geometry or compare the bbox against the canonical geometry. This could let a stale but plausible bbox exclude a polygon from spatial lookup. The recovery validator now rejects invalid canonical geometry, invalid simplified geometry, and bbox/geometry mismatches. Regression tests are committed but not verified until a functioning runner is available.


## Current runner diagnosis — 2026-11-27

The latest dedicated GIS run `45980564390` and its rerun attempt 2 both fail both jobs without step metadata; logs are unavailable. Open repository issue [#49](https://github.com/bijanbijane/radartehran/issues/49) documents earlier failures across unrelated Radar and IRNI workflows where `runner_id=0`, runner name was empty and zero steps were recorded. This makes hosted-runner allocation the leading operational hypothesis. However, the current GIS job payloads omit runner metadata, so do not state that the precise cause is confirmed. Check GitHub Actions enablement, account/organization hosted-runner access, usage limits/billing enforcement and repository policies before changing application code.


## Additional point-resolution integrity finding — 2026-11-27

A parent-neighborhood interior match previously masked a point that lay exactly on the edge of a matched sub-neighborhood. The resolver could therefore return the sub-neighborhood ID even though that finer assignment was not strictly interior. Point resolution now reports `RESOLVED_ON_EDGE` whenever any matched active boundary is an edge match, and emits a sub-neighborhood ID only for a strictly interior sub-neighborhood match. Valuation feature generation rejects this edge result. Regression coverage is committed; execution remains unverified because the focused workflow has no usable logs.


## Bbox diagnostic integrity correction — 2026-11-27

A second audit found that bbox overlap diagnostics counted ACTIVE records only after filtering by city and boundary level. A corrupt history with two ACTIVE records carrying inconsistent city/level metadata could therefore be reduced to one apparently valid record and enter the overlap scan. The scan now checks the complete entity history first and excludes any history whose total ACTIVE count is not exactly one; city/level filtering is applied only after lifecycle uniqueness is established. A regression test covers this mixed-metadata case. The new test is committed but not yet verified by an accessible CI run.


## Valuation-to-GIS integration gap — 2026-11-27

A branch-head audit of `apps/api/server.ts` confirms that the production bootstrap imports and mounts `createProductionGeospatialModule()` at `/api/v1/geospatial`, but does not import or mount `createValuationService()` or `createValuationRouter()`. No `/api/v1/valuation` route is registered in this API bootstrap. The standalone valuation service accepts optional coordinates and previously did not spatially validate them.

The valuation service now has an explicit `ValuationLocationResolver` dependency contract. Coordinate-bearing estimates fail closed with HTTP 409 when no resolver is configured, and also fail closed if the resolver's canonical city/neighborhood differs from the request. On successful resolution, district and sub-neighborhood IDs are taken from the resolver result. Regression cases cover missing resolver, successful resolution, and mismatched neighborhood identity.

The focused workflow now includes `npm run test:valuation-location` alongside `npm run test:geospatial`, and watches the valuation service/types and valuation regression test paths.

**Production integration remains unresolved:** the API bootstrap still does not construct or mount the valuation module, and no production resolver is wired. Do not claim a production valuation endpoint or coordinate guard is live until a real canonical read-only resolver is composed with a registered route and tested at the public API boundary.

The exact-head GIS workflow run [45987033491](https://github.com/bijanbijane/radartehran/actions/runs/45987033491) failed both jobs; the job records returned `steps=null` and no logs URL. Test and typecheck execution remain unverified.
