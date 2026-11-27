# Radar Tehran GIS Blockers

**Status date:** 2026-11-27  
**Active review:** [Draft PR #72](https://github.com/bijanbijane/radartehran/pull/72)  
**Latest reviewed code revision:** `2e1bdecb73f5fd99ea08c464843dc6e68a804800`

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


## Listing lifecycle and spatial index integration gap — 2026-11-27

The geospatial service now exposes explicit spatial listing removal, and its focused tests cover status replacement, removal idempotency and persistence after rehydration. This is an index-level capability, not proof of integration with the canonical listing lifecycle.

A repository-wide search of the reviewed branch found:
- `indexListingForSpatialSearch` only at its geospatial service definition and in geospatial tests; no production listing lifecycle caller was found.
- `removeListingFromSpatialSearch` has no production caller.
- `SearchIntelligenceService.synchronizeCanonicalPropertyToIndex` is defined and exercised in tests, but no production caller or event consumer was found.
- `createSearchIntelligenceRouter` exposes query, interpretation, similar-property, recommendations and ranking-policy routes; it does not expose or internally consume canonical listing synchronization events.

Consequently, current GIS and Search Intelligence indexes are not demonstrated to be fed by the same authoritative listing lifecycle. The production public search must not be represented as synchronized with live listing inventory.

The Search Intelligence public filter currently rejects non-public visibility, unpublished records and `OFF_MARKET`, but allows `UNDER_OFFER`, `SOLD` and `RENTED` records through this status gate. Whether these statuses should remain discoverable (for example, with explicit labels) or be excluded from active inventory requires an explicit product policy; no silent behavior change is made in this GIS workstream.

Follow-up acceptance criteria:
1. Identify the canonical listing write model and its authoritative event/outbox producer.
2. Define a versioned, idempotent event contract for create/update, price, availability, publication, verification, expiry and deletion/restriction.
3. Add a production consumer that updates Search Intelligence and the spatial index from the same canonical event, with retry/dead-letter and replay behavior.
4. Ensure deletion/restriction and every non-public state fail closed in public queries before asynchronous index convergence.
5. Add integration tests from canonical listing mutation through public API search, including out-of-order versions, duplicate events, retries and city/coordinate changes.
6. Obtain an explicit product decision for `UNDER_OFFER`, `SOLD` and `RENTED` visibility.

No producer, consumer, live data backfill or production index mutation is introduced by this blocker record.


## Canonical listing write-path audit — 2026-11-27

The production API bootstrap registers both `registerPublisherAndPlatformRoutes(app)` and `registerProductionPropertySearchRoutes(app)`, and separately constructs/mounts the geospatial module. The listing and search path currently evidenced by those registrations is:

1. `src/utils/serverPublisherBargains.ts` defines the process-local `serverPublishedBargains` Map and registers persistence export/import hooks.
2. `POST /api/my-bargains` creates or replaces a record in that Map and calls `saveDiskPersistedCache()`.
3. `PATCH /api/my-bargains/:id` mutates lifecycle state and listing fields in the same Map, then persists the cache.
4. `DELETE /api/my-bargains/:id` removes the record from the Map and persists the cache.
5. `server/modules/property-search/productionBargainListingDataSource.ts` reads that same Map directly. This is a live in-process read, not a versioned event-driven projection.
6. The geospatial module is separately constructed in `apps/api/server.ts`; no listing mutation hook or event consumer connects the Map to `indexListingForSpatialSearch` / `removeListingFromSpatialSearch`.

This establishes the currently mounted legacy Express Map as the effective write/read source for the `/api/my-bargains` + production Property Search path. It does **not** establish a durable, transactional canonical listing repository: the source is a process-local Map persisted through the legacy disk-cache hooks, with no atomic outbox, monotonic listing revision or replayable domain event.

A second model exists under `server/modules/bargains/`: its service uses transaction-runner abstractions and separate bargain/owner/moderation records with revisioned moderation transitions. However, `server/modules/bargains/routes.ts` explicitly documents that its router is exported for integration and is **not registered in `server.ts`**. It is therefore not the active production write path evidenced by the API bootstrap. Do not wire it as canonical without an explicit migration/ownership decision.

### Search projection integrity correction

The legacy `ServerPublishedBargainRecord` has no independent verification-status field, but the production Property Search adapter previously projected every such record as `isVerifiedListing: true`. That was unsupported by the source schema. The adapter now sets this flag to `false` until a verifiable evidence field and verification workflow are connected.

The same adapter derives coordinates from a neighborhood center and explicitly marks them `isApproximate: true`. Property Search's bounding-box and proximity filters previously consumed these approximate centroids as if they were precise listing locations. Those filters now reject approximate coordinates; exact-coordinate records continue to participate. A regression test covers both filters and the exact-coordinate control case. These changes are committed, but execution remains unverified because the focused hosted workflow still returns no usable job steps/logs.

### Updated acceptance criteria

1. Make an explicit architecture decision whether the legacy `serverPublishedBargains` Map or the newer `server/modules/bargains` transactional model is to be retired/migrated; there must be one canonical write model.
2. Move canonical listing persistence to the approved Cloudflare-native durable store; do not treat a process-local Map plus disk-cache snapshot as the long-term source of truth.
3. Emit a transactional outbox event from the canonical write transaction with listing ID, monotonic revision, event schema version, occurred-at timestamp, and a minimal allowlisted projection.
4. Consume that event idempotently for Property Search and GIS. Reject stale/out-of-order revisions; support retries, dead-letter inspection and replay.
5. Keep listings without independently verified exact coordinates out of precise spatial queries and the GIS spatial index. Neighborhood centroids may be exposed only as explicitly approximate neighborhood context, never as property coordinates.
6. Keep unverified listings out of verified-only results. A published lifecycle state is not evidence of identity, ownership or property verification.
7. Enforce deletion, withdrawal, expiry, moderation rejection and privacy restrictions fail-closed at the canonical read boundary, not only after asynchronous projection convergence.
8. Add API integration tests from canonical create/update/state-transition/delete through public Property Search and GIS query, including duplicate/out-of-order events, cache invalidation, city changes and restart/recovery.
9. Resolve the duplicate `server/modules/bargains` vs legacy publisher model and document the chosen ownership boundary before adding another event producer.

No listing data was mutated, no migration was run, and no production route/binding/deployment was changed by this audit.

## IRNI RPC, authoritative geometry and valuation composition — 2026-11-27

A focused re-audit of the current branch distinguishes the existing identity RPC from the missing spatial/valuation integration:

- Radar has a Worker-native, read-only IRNI RPC v2 client at `worker/irni/irniGeographicRpcV2Client.ts`, exposed through `/api/v2/reference/irni/canonical/*`. It uses the `IRNI_GEOGRAPHY` Service Binding, validates response DTOs, gates reads on an ACTIVE/integrity-verified registry metadata record, and checks expected revision/checksum consistency.
- The RPC v2 entity DTO contains canonical identity, hierarchy, point coordinates, and a `boundaryReference`; it does not expose a polygon/MultiPolygon geometry payload or a versioned geometry artifact suitable for point-in-polygon valuation assignment. The identity resolver in `worker/irni/neighborhoodProfileIdentityResolver.ts` is not a geometry resolver.
- The Worker endpoint `/api/neighborhood-boundaries/resolve` in `worker/routes/neighborhoodBoundaryRoutes.ts` generates bounded approximate hexagons from submitted centers/radii. Its response explicitly labels them as visualization-only and not official/registered boundaries. It must never be wired as the valuation boundary authority.
- The Express GIS service in `server/modules/geospatial/service.ts` resolves points against its in-process boundary-history store. That store hydrates/persists through `server/modules/geospatial/geospatialRepository.ts` and `AtomicJsonRepository('geospatial-state.json')`, with a durable snapshot adapter in production mode. The inspected path does not establish that those boundary records are populated from the approved IRNI registry or a verified IRNI geometry feed.
- `apps/api/server.ts` mounts the GIS router but does not construct `createValuationService` or mount `createValuationRouter`. The valuation module also requires a `ValuationDataConsumerAdapter`; no production adapter/composition for that service was established by this audit.
- The new `ValuationLocationResolver` is a service-level fail-closed seam, not a production resolver. The cross-module regression test injects the local `GeospatialService`; it does not prove Worker Service Binding, IRNI geometry provenance, Express production composition, or public HTTP behavior.

### Required integration gates

1. IRNI must publish a read-only, version-pinned geometry contract (or an independently governed geometry provider must be selected) that returns authoritative boundary geometry, CRS, source/provenance, lifecycle status, geometry version and registry revision/checksum. Identity-only DTOs and approximate visualization rings are insufficient.
2. Radar must validate the geometry contract and prove each boundary is linked to exactly one approved canonical IRNI entity. Retired, disputed, unverified, missing, overlapping or revision-drifted records must fail closed.
3. The production GIS repository must have an explicit, auditable ingestion/refresh path for those approved geometries; its current snapshot store must not be assumed to be IRNI-backed.
4. A real production `ValuationDataConsumerAdapter` and `ValuationLocationResolver` must be constructed in the chosen runtime. If valuation is Worker-native, do not import the Express/Node GIS module into the Worker; implement a Worker-compatible adapter against the approved geometry contract. If it remains Express-hosted, define a secure server-side IRNI read path and lifecycle/revision policy.
5. Register the valuation HTTP route only after dependencies are complete; add public API integration tests for missing binding, registry revision drift, missing geometry, edge/outside/overlap cases, mismatched caller IDs, and successful strictly-interior resolution.
6. Keep the endpoint disabled/not registered until all of the above are verified. Do not use approximate geometry, neighborhood centers, legacy numeric IDs, names or proximity as canonical identity or official boundaries.

No code path, binding, database, secret or deployment was changed by this audit. The current exact-head GIS, IRNI RPC and Worker bundle workflows still fail with `steps=null` and no logs URL; execution of their commands is not established.
