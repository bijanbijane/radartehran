# Radar Tehran GIS Blockers

**Status date:** 2026-11-27  
**Active review:** [Draft PR #72](https://github.com/bijanbijane/radartehran/pull/72)  
**Latest reviewed code revision:** `9c791ab7488542e4cccb0e9c382b807a47ab42be`

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

## Hosted runner allocation evidence — 2026-11-27

The GitHub Actions Jobs API was queried directly for the latest GIS, IRNI RPC consumer and Radar Worker bundle runs listed above. All four job records report `runner_id=0`, an empty `runner_name`, and an empty `steps` array; each job completed as `failure` within approximately 1–3 seconds of its start timestamp. This confirms that no job step was recorded and strongly indicates failure before a hosted runner began executing the workflow. It does not identify the account/repository-level reason (for example, runner entitlement, usage/billing enforcement, repository Actions policy or service-side dispatch failure). Treat this as a runner-allocation/dispatch blocker, not an application test failure, until GitHub account and repository Actions diagnostics identify the cause. No code change can be justified from these empty job records.


## Cloudflare D1 marketplace write-route repair — 2026-11-27

A route-to-handler mismatch was found in `worker/routes/marketplaceRoutes.ts`:

- The frontend `createBargainWithOwner` calls `POST /api/v1/market/bargains` with listing fields (`title`, `type`, `sqm`, `priceMillions`, `discountPercent`, etc.).
- Before this repair, that Worker path executed the sponsor-request workflow: it required `agencyName`, `phone` and `experienceYears`, and inserted into `sponsor_requests`. A valid bargain payload therefore could not create a bargain.
- The frontend sponsor repository calls `POST /api/v1/market/sponsor-requests`, but the sponsor handler was not mounted at that path.

The handler has now been split:

1. `POST /api/v1/market/bargains` validates a bargain against the D1 neighborhood projection, requires a verified Worker session and idempotency key, then inserts the `bargains` row and `bargain_projections` row in the same idempotent D1 batch. New listings begin in `pending`; only the existing admin approval path can move them to `approved`.
2. The sponsor-request handler now matches `POST /api/v1/market/sponsor-requests`, the path used by the frontend repository and declared in the route register.
3. The bargain route explicitly rejects media/video references while R2-backed media attachment is deferred. It does not silently drop those references or claim a successful attachment.
4. A new route regression test covers the D1 bargain create response and the fail-closed media behavior.

### Remaining integration gaps (not solved by this route repair)

- The D1 marketplace state read exposes approved bargains, but the production Property Search adapter still reads the legacy `serverPublishedBargains` Map. The GIS spatial index has no consumer of D1 bargain writes. The new D1 write path is therefore not yet reflected in those two read models.
- `src/features/properties/services/listingService.ts` stores user-submitted property records in UID-scoped browser storage. This is a separate listing model from the D1 marketplace bargains.
- The legacy `/api/my-bargains` endpoints still mutate the Express process-local Map and disk-cache snapshot. They are not transactionally connected to the D1 marketplace tables.
- `syncPublishedBargainToExpressServer` targets `POST /api/bargains`, but the active Worker/Express route inventory reviewed here has no corresponding create handler; repository search finds only the helper definition and a test invocation, not a production call site. Its unit test uses a mocked fetch response and does not establish a real dual-write.
- Consequently, do not yet declare one end-to-end canonical listing lifecycle across D1, Property Search, GIS and the browser property explorer.

### Next acceptance criteria

1. Add D1-backed read adapters for Property Search and GIS, with approved-only publication semantics and exact, independently verified coordinates.
2. Define whether the separate browser-storage `PropertyListingRecord` flow is to be migrated into the D1 bargain model or retired; do not silently merge unlike schemas.
3. Retire or explicitly isolate the legacy `/api/my-bargains` Map and the unused Express dual-write helper after client migration.
4. Add integration tests proving create → pending → admin approval → public state/search/GIS visibility, plus rejection, deletion, idempotent replay, owner isolation and restart durability.
5. Keep R2 media attachment unavailable until object ownership, target binding, cleanup and deletion are implemented and tested.

No D1 migration was applied, no live database was written, and no deployment was performed. The new code and regression test are committed; hosted CI evidence is still required before treating them as passing.


## Upstream IRNI runtime-contract verification — 2026-11-27

A read-only inspection of the connected source repository `bijanbijane/Iran-Neighborhood-Intelligence`, default branch `main`, file `src/services/geographic-registry/radar-read-port-v1.ts`, found an explicit upstream status declaration:

- `RADAR_GEOGRAPHIC_READ_CONTRACT_STATE` is `CONTRACT_FINALIZED_RUNTIME_NOT_IMPLEMENTED`.
- The contract comments state that no runtime adapter is implemented and that the Worker MUST continue reporting RPC unavailable until the durable IRNI repository and live shared-D1 schema/ledger have been verified.
- The v1 port exposes approved canonical identity, identifier resolution, relationships and paginated entity reads. It exposes no polygon/MultiPolygon geometry payload or geometry retrieval method.
- The Radar-side v2 RPC client and structural DTOs are client/contract code; their existence is not evidence that the upstream runtime adapter, shared persistence, or live Service Binding is operational. The current Radar v2 entity shape likewise carries a boundary reference and optional point/area metadata, not an authoritative geometry artifact.

This is stronger evidence than the prior Radar-only code inspection: the upstream contract itself explicitly marks runtime implementation as incomplete. Do not interpret a Wrangler service-binding declaration, mock binding test, successful DTO validation, or identity-resolution test as proof of a live canonical geography service. No production geometry bridge or valuation resolver can be completed safely from the currently published contract.

### Revised dependency order

1. In the IRNI repository, complete and independently verify its durable canonical registry read adapter and live shared-D1 schema/ledger before changing the contract state to ACTIVE. This workstream does not authorize modifications to IRNI from the Radar branch.
2. Extend the upstream read contract through an explicitly versioned, read-only geometry method/artifact, including canonical entity ID, geometry version/hash, CRS, source dataset/version, provenance/evidence, approval/lifecycle state, and registry revision/checksum. Identity references alone are insufficient.
3. Verify the deployed IRNI WorkerEntrypoint and Service Binding against that active contract with non-production end-to-end tests; preserve fail-closed behavior when absent, stale, disputed or unverified.
4. Only then implement the Radar-side ingestion/refresh and runtime bridge, followed by public valuation composition and HTTP integration tests.

Until those upstream gates are met, the correct Radar behavior is to keep coordinate-based valuation unavailable and retain the current local GIS snapshot strictly as a separately governed, non-authoritative dataset. No application code, binding, database, secret, deployment or upstream repository was changed by this verification.


### Latest code and CI observation — 2026-11-27

The D1 marketplace route repair and new bargain-write regression test are present in the active Draft PR branch. Latest reviewed commit: `7bd7dddf2d61fcc6a8e7c17d83a956211fecfa4b`. The latest GIS run `45991071956` and quality-gate run `45991071728` both failed before exposing any job steps or logs (`steps=null`, `logs_url=null`). The marketplace regression test has not been confirmed as executed. Do not interpret these workflow conclusions as test failures inside the application; runner dispatch remains unverified.


### Latest marketplace regression registration — 2026-11-27

The new D1 bargain-write regression file is now included in `npm run test:cloudflare` (`tests/cloudflare-marketplace-bargain-write.test.ts`). Exact-head GIS run `45991392520` and quality-gate run `45991392542` still expose no job steps/logs (`steps=null`, `logs_url=null`); therefore neither the focused GIS suite nor the new marketplace test is confirmed as executed.

## Production neighborhood-profile evidence route — resolver wiring gate — 2026-11-27

A branch-head composition trace confirms the following:

- `apps/api/server.ts` calls `createProductionGeospatialModule()` with no dependency argument and mounts its router at `/api/v1/geospatial`.
- `createProductionGeospatialModule` forwards its default empty dependency object to `createGeospatialService` and `createGeospatialRouter`.
- The profile-evidence route is `GET /api/v1/geospatial/neighborhood-boundaries/:cityId/:hoodId/profile-evidence`.
- `buildNeighborhoodProfileBoundaryReadModel` requires both `resolveIdentity` and `resolveSource`. With the current production composition neither resolver is configured. Therefore the route cannot produce a `READY` evidence object, even if its local snapshot contains a valid, independently approved boundary. It returns a structured `BLOCKED` result with `CANONICAL_IDENTITY_RESOLVER_NOT_CONFIGURED` and `BOUNDARY_SOURCE_REGISTRY_NOT_CONFIGURED`.
- The Worker IRNI identity resolver is not an Express dependency and does not provide geometry or a source-registry resolver. Importing it into Express would not bridge the Cloudflare Service Binding.

A regression was added to `tests/neighborhood-profile-boundary-read-model.test.ts`: it creates and independently approves a local polygon through the default service composition, calls the HTTP profile-evidence endpoint, and asserts that the response remains blocked with null evidence until both trusted resolvers are wired. This strengthens the previous no-boundary test and prevents a local approval from being mistaken for canonical profile readiness.

This is an intentional fail-closed state, not a defect to bypass by weakening the resolver requirement. The remaining implementation gate is a supported server-side bridge to an active IRNI identity contract plus an independently verified source registry; the upstream IRNI geometry contract and runtime adapter remain incomplete as recorded above. No route, production dependency, database, binding, secret, deployment or external repository was changed.


## Worker-to-Express neighborhood-profile identity bridge — blocked

**Audit:** 2026-11-27  
**Decision record:** [RT-IRNI-EXPRESS-BRIDGE-001](../architecture/RT-IRNI-EXPRESS-BRIDGE-001.md)

- Radar's `IRNI_GEOGRAPHY` is available only in the Cloudflare Worker runtime as a Service Binding. The Express API process cannot access it through `process.env` or by importing the Worker client.
- The Worker-side profile identity resolver is implemented, but no production composition call site was found in the reviewed Radar repository.
- The public `/api/v2/reference/irni/canonical/*` facade is a public read-only reference API, not a private authenticated bridge. Express must not use it as an implicit trust channel.
- The IRNI v2 entity response carries a boundary reference, not authoritative geometry or a source-registry evidence record.
- The Express profile evidence read model requires independent identity and source resolvers. Neither is wired in production composition; BLOCKED with null evidence is the correct behavior.
- A future bridge requires a dedicated versioned contract, Worker-minted request authentication, isolated key material, durable nonce replay defense, strict DTO validation and end-to-end negative security tests. The existing session HMAC key must not be reused as a geography-bridge key.
- Even after identity bridging, READY remains prohibited until the upstream owner supplies a version-pinned authoritative geometry/source contract and Radar implements trusted source-registry verification.

**Release gate:** Keep profile evidence fail-closed. Do not add a mock resolver, public-HTTP shortcut, approximate geometry, or unverified source mapping.


## Additional security constraint — existing session assertion is not a geography RPC

The existing Worker-to-Express session assertion is bound to method, exact path/query, correlation ID, and Worker-hop marker with a 30-second maximum lifetime. Inspection found no signed body digest and no one-time nonce/replay-store check in its payload/verifier. It is therefore not single-use and does not cryptographically bind the assertion to one exact request body during its validity window. It also authenticates a user session principal, not the Worker service identity or IRNI canonical identity.

Do not repurpose this assertion or its `AUTH_INTERNAL_HMAC_SECRET` for the geography bridge. A dedicated RPC must bind contract version, method/path, timestamp, nonce, and canonical body digest, and durably consume the nonce before processing. The current authentication bridge was not modified in this GIS work.


## Latest exact-head runner dispatch verification — 2026-11-27

The active Draft PR branch currently points to `adfa8b15851c7b6c1e35e5505a233f72160e3c81`. All seven PR-triggered workflows for that commit concluded failure. Raw GitHub Jobs API inspection of GIS run `46017942983`, IRNI Geographic RPC run `46017943177`, and backend triad run `46017943056` confirms the sampled jobs have `runner_id=0`, empty `runner_name`, and zero recorded steps. The two GIS jobs started and completed within approximately two seconds without executing a step. This is confirmed pre-step runner allocation/dispatch failure, not a GIS assertion, test, install, or TypeScript failure. No application test execution is evidenced. Repeated workflow reruns are not useful until runner availability is restored. No repository source code, CI configuration, account settings, or production resources were changed during this verification.


## Durable recovery cache isolation — 2026-11-27

**Implemented on Draft PR #72, commit `39e5bde28ef6cec7441058abf1a0b301810cd57d`:**

- Repository reads return a non-authoritative empty view while GIS persistence health is not `READY`; the rejected in-memory snapshot is not re-exposed.
- Synchronous and awaited repository writes reject in every non-`READY` health state (`BLOCKED`, `DEGRADED` or `RECOVERING`), preventing default/partial runtime state from replacing the authoritative snapshot.
- The mounted GIS router returns HTTP 503 with `GEOSPATIAL_PERSISTENCE_UNAVAILABLE` until recovery is `READY`; the response includes the recovery requirement and validation diagnostics.
- The regression test primes a real temporary cached snapshot, transitions recovery to `BLOCKED`, verifies the cached records are not returned, and verifies writes are rejected. Temporary repository files are removed in a `finally` block.

**Verification:** GitHub read-back confirms the changed source/test files and PR head. Exact-head GIS workflow results remain unusable: the prior run `46024395473` failed both jobs with `steps=null` and no logs URL. The follow-up test commit `39e5bde28ef6cec7441058abf1a0b301810cd57d` has no workflow run returned by the commit-run query yet. Tests and typecheck are therefore **NOT VERIFIED**.

The PR remains Draft and unmerged. No production deployment, migration, authoritative data replacement, or IRNI write was performed.


## Public spatial listing coordinate eligibility hardening — 2026-11-28

A focused review of `SpatialPublishableListing` and `isListingEligibleForPublicSpatialSearch` found that the public projection required `PUBLISHED`, `VERIFIED`, and `available === true`, but the record contract had no coordinate-quality field. The index accepted every numerically valid Iran-bounded coordinate. This meant an approximate neighborhood centroid or a legacy record with unknown coordinate precision could pass the GIS public eligibility gate if its publication and listing-verification flags were set.

**Implemented on `fix/gis-exact-coordinate-eligibility-2026-11-28`:**
- Added optional `coordinateAccuracy` metadata to `SpatialPublishableListing` with explicit values `EXACT_VERIFIED`, `APPROXIMATE`, and `UNVERIFIED`.
- Public spatial eligibility now additionally requires `coordinateAccuracy === 'EXACT_VERIFIED'`. Missing/legacy values fail closed, preserving backward compatibility for persisted snapshots while preventing their public exposure.
- Updated the spatial-search regression fixtures to mark exact-coordinate controls explicitly and added approximate and legacy-coordinate records that must not appear in public results.

**Boundary of this fix:** this field is an eligibility assertion carried by the internal listing projection; it does not itself establish the underlying evidence or replace an authoritative coordinate-verification workflow. The canonical listing producer and evidence source remain disconnected from the GIS index, as documented above. No approximate coordinate was promoted, no data backfill was run, and no production index was modified.

**Verification:** GitHub read-back confirms the type, public projection, and regression-test changes. Local test/typecheck execution is unavailable in this session; hosted workflow execution must be checked against the exact PR head. Status: **IMPLEMENTED — NOT VERIFIED**.


## CI-driven GIS remediation — 2026-11-28

The first hosted validation of PR #98 exposed three GIS test defects and baseline TypeScript/architecture issues. The failures were inspected from the actual GitHub Actions job logs rather than inferred from check summaries.

**Remediations committed:**
- Updated the public-projection test fixture to explicitly declare its exact verified coordinate accuracy.
- Restored the pickActiveBoundaryVersion compatibility export expected by the neighborhood boundary read-model test.
- Corrected polygon simplification stride sampling so the requested stride vertices are retained; invalid simplified topology falls back to the canonical geometry.
- Updated the duplicate-active-boundary approval test to assert against the current Map entry after the copy-on-write mutation, rather than a stale array reference.
- Registered the existing GEOSPATIAL_PERSISTENCE_UNAVAILABLE API error code in the canonical error-code union.
- Restored missing shared neighborhood-profile validation exports/imports and made the metric-count reducer accumulator explicitly numeric.
- Split the geospatial distance calculations and persisted-snapshot validation into focused modules. Both former oversized GIS files are now below the 500-line architecture ceiling; the architecture guard subsequently reported **0 blocking errors**.

**Hosted results observed for intermediate head e357251:**
- Architecture guard: PASS (0 errors).
- Native Auth contracts, frontend bundle, and Worker dry-run: PASS.
- GIS regression and TypeScript were still failing because the extraction had missed shared constants/default snapshot factory; these were corrected in subsequent commits.
- API contract suite failed on a frontend map-filter focus-indicator static assertion. The three dismissal buttons already had visible focus classes, but the assertion's JSX tag matcher stopped at the => in an earlier onClick attribute. Attribute order was adjusted so the existing focus classes are visible to the check; no interaction behavior changed.

The above are intermediate results only. The latest head is being revalidated by fresh GitHub Actions runs. No check is treated as passed for the latest head until its own run completes.


## Verified transaction evidence eligibility — 2026-11-28

The hosted GIS/valuation regression exposed a baseline with zero verified samples even after ingesting a record explicitly typed as VERIFIED_COMPLETED_TRANSACTION. Root cause: resolveInitialEvidenceVerificationStatus returned PENDING_REVIEW for every non-outlier source, including explicitly verified completed transactions and rental contracts. This contradicted the source-type contract and caused official baseline eligibility to discard authoritative transaction evidence.

Implemented on the current PR branch: VERIFIED_COMPLETED_TRANSACTION and VERIFIED_RENTAL_CONTRACT now receive VERIFIED status on ingestion unless outlier detection flags the record; all other source types remain PENDING_REVIEW by default. Added a regression assertion for the completed-transaction status. The existing reviewer correction path remains unchanged. Fresh CI is required to verify this fix.


## Latest validation follow-up — 2026-11-28

The hosted GIS regression suite passed on head cc0c920 after the exact-coordinate fixture, boundary-history assertion, polygon simplification, and valuation source-status fixes. The hosted API architecture and contract checks also passed on that head. Both the GIS module typecheck and frontend lint then exposed one remaining reference to the old defaultEmpty helper in geospatialSnapshotValidation.ts; this final reference was changed to createEmptyGeospatialState() in commit 4ea0ecad. The new head requires fresh CI confirmation; previous results are not being carried forward as proof for the new commit.


## Canonical listing lifecycle and coordinate provenance audit — 2026-11-28

A read-only trace of the current property submission flow confirms that the missing GIS producer is not just an unconnected event hook:

- `src/features/properties/submission/ListingSubmissionPage.tsx` exposes a location-precision selector, but the submission draft contract (`ListingSubmissionDraft`) contains no latitude/longitude coordinate input, device-geolocation result, coordinate source, or verification evidence.
- `submitDraftAsPropertyListing` in `src/features/properties/services/listingService.ts` persists user submissions through UID-scoped browser storage (`saveMyListings` / `loadMyListings`), not a canonical server-side listing repository.
- The same function copies `hood.lat` / `hood.lng` into the property record for every precision except `unavailable`. It then preserves the user's selected precision and assigns a 30 m privacy radius for `exact`, 250 m for `approximate`, or 600 m otherwise. The form does not collect a property point, so the selected `exact` value currently describes a neighborhood reference point as if it were an exact recorded point.
- Repository code search for `indexListingForSpatialSearch` and `removeListingFromSpatialSearch` found only the geospatial service definition/export, its tests, and this blocker document; no listing create/update/moderation/archive/expiry producer calls either operation.

**Data-integrity decision:** do not connect this browser-storage record directly to public GIS and do not set `coordinateAccuracy: EXACT_VERIFIED` from `locationPrecision`. A selected privacy label is not coordinate evidence. The existing PR #98 eligibility gate remains fail-closed.

**Required upstream contract before integration:**
1. Establish the authoritative server-side listing repository and lifecycle events for create, edit, moderation, publish, archive, removal and expiry.
2. Define a trusted coordinate-evidence record that carries the actual WGS84 point, capture/source provenance, precision class, verification actor/process, verification timestamp, and listing/version binding. Client-supplied flags alone must not establish verification.
3. Keep neighborhood-centroid fallback explicitly neighborhood-level; do not label it exact or approximate street-level. If no point evidence exists, do not index the listing in exact public spatial search.
4. Make the lifecycle projection idempotent and reconcile removals/status changes, then test event replay, stale versions, city changes, coordinate changes and withdrawal.

No frontend record, coordinate, browser storage, GIS index, database or production data was modified in this audit.
