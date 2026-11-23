# RT-IRNI-READ-CONTRACT-MAPPING-001

**Status:** Repository-grounded mapping; implementation blocked pending IRNI contract acceptance and durable runtime verification  
**Audit date:** 2026-11-23  
**Radar base at audit:** `main` — `ebe79be4a7a3381e0e724af4de454eb2e499eed0`  
**IRNI contract candidate:** PR #11, `feat/radar-geographic-read-contract-v1`  
**Related tracking issue:** Radar #4 — `RT-IRNI-INTEGRATION-001`; IRNI #4 — `IRNI-CHECKPOINT-004`

## 1. Decision summary

The target boundary is **IRNI-owned canonical geography, read by Radar through an internal Cloudflare Workers Service Binding using typed RPC**.

The IRNI contract candidate in PR #11 defines `RadarGeographicReadPortV1` and a `WorkerEntrypoint` implementation with five read methods. The current RPC methods deliberately return `STORAGE_UNAVAILABLE`; the Worker has no D1 binding and no Service Binding. This is a contract/scaffold, not a live integration.

The Radar implementation on `main` is not yet aligned with that boundary:

- `worker/routes/geographicRegistryRoutes.ts` resolves `NEIGHBORHOOD_DB` directly for both `/api/v1/geography/*` and `/api/internal/geography/*`.
- The same module contains the signed publisher ingress and SQL writes to geographic staging tables.
- The browser-side alias attachment currently looks up `String(neighborhood.id)`, whereas the new IRNI contract accepts only explicitly versioned, namespaced legacy aliases.
- `worker/irni/irniNeighborhoodClient.ts` remains an external HTTPS + bearer-token DTO client. Its companion `handleIrniReferenceRoute` is not imported by the active `worker/router.ts` dispatcher.

These are separate integration paths. They must not be treated as one working RPC integration.

## 2. Existing Radar DTOs and their loss

The current server-side DTOs are defined in `worker/irni/irniTypes.ts`.

| Existing DTO | Existing fields | Canonical contract target | Mapping rule |
|---|---|---|---|
| `IrniProvince` | `id`, `code`, `nameFa`, `nameEn` | `CanonicalGeographicEntity` | `id` must become the exact `geographicEntityId`; never assume a generic `id` is canonical. `nameFa` maps to `canonicalNameFa`; `nameEn` maps to `nameEn`. `code` must be preserved as a source-native identifier with its namespace, classification system, dataset and version; it is not a globally unique ID. |
| `IrniCounty` | `id`, `provinceId`, `code`, `nameFa`, `nameEn` | Entity + explicit relationship | Preserve the county's canonical ID. The province link must be represented by the canonical parent/province references and the corresponding verified relationship; do not copy an old province ID into a canonical ID field. |
| `IrniCity` | `id`, `provinceId`, `countyId`, `code`, names, `centerLat`, `centerLng` | Entity + relationships + boundary metadata | Preserve canonical entity identity and exact county/province relationships. City center coordinates are point metadata, not polygon boundaries. They require an explicit boundary version, CRS and coordinate semantics before being treated as verified spatial data. |
| `IrniNeighborhood` | `id`, `cityId`, optional county/province IDs, `districtCode`, names, `slug`, center coordinates, `populationEstimate`, `updatedAtIso` | Entity + relationships + separately governed attributes | `cityId` and other parent links must resolve to canonical entities. `districtCode` requires an identified classification system. `slug` is a presentation alias, not identity. Population is not a field on the canonical identity entity and must remain a separately sourced/validated dataset attribute. `updatedAtIso` must not be relabelled as `recordedAt` or `lastVerifiedAt` without matching semantics. |

The four old DTOs omit or collapse information required by the canonical model:

- Canonical identity: `geographicEntityId`, `identityAnchor`, and `identityAnchorType`.
- Classification: `entityType` and `classificationSystemId`.
- Names and source assertions: `alternativeNamesFa`, `originalSourceNames`, and their language/source classification.
- Full lineage: `sourceNativeIdentifiers`, `sourceDatasetReferences`, `sourceRecordReferences`, and `provenanceReferences`.
- Governance: `identityStatus`, `verificationStatus`, and `lifecycleStatus`.
- Spatial quality: `boundaryStatus` and `boundaryVersionReferences`.
- Revision semantics: canonical registry revision and checksum, which must accompany a read snapshot.

No DTO conversion may invent these fields, substitute a display label, or turn a missing value into an authoritative default.

## 3. Canonical entity and relationship contract

The contract candidate imports the actual IRNI domain types rather than defining a second geographic identity model.

### Canonical entity

The canonical entity carries:

- Identity: `geographicEntityId`, `identityAnchor`, `identityAnchorType`.
- Classification: `entityType`, `classificationSystemId`.
- Names: `canonicalNameFa`, `alternativeNamesFa`, `originalSourceNames`, `nameEn`.
- Hierarchy: `parentGeographicEntityId`, `provinceGeographicEntityId`.
- Source traceability: `sourceNativeIdentifiers`, `sourceDatasetReferences`, `sourceRecordReferences`, `provenanceReferences`.
- Lifecycle and validity: `validFrom`, `validTo`, `recordedAt`, `supersededAt`, `identityStatus`, `verificationStatus`, `lifecycleStatus`.
- Spatial metadata: `boundaryStatus`, `boundaryVersionReferences`.
- Schema and audit metadata: `schemaVersion`, `createdAt`, `lastVerifiedAt`, `isSyntheticFixture`.

Radar must preserve the received entity and its provenance. It may create separate presentation extensions, but those extensions must not be written back as canonical IRNI identity fields.

### Relationships

IRNI `GeographicRelationship` carries `relationshipId`, source and target canonical IDs, `relationshipType`, classification system, source dataset, evidence reference, validity dates, recorded/superseded times, verification status and schema version.

Radar must not infer relationships from names, coordinates, a numeric ID range or a frontend city grouping. It must use returned, verified relationships and preserve their revision/checksum envelope.

## 4. Legacy alias reconciliation — current defect

IRNI PR #11 defines the exact alias namespace and format:

| Prefix | Suffix pattern | Source meaning |
|---|---|---|
| `radar:city-hood:v1:` | `<cityId>:<positiveNumericHoodId>` | Existing `(city_id, hood_id)` key |
| `radar:geography-catalog:v1:` | `hood%3A<cityId>%3A<positiveNumericHoodId>` | Versioned legacy geography-catalog key |
| `radar:urban-intelligence:v1:` | `<cityId>%3Ahood%3A<positiveNumericHoodId>` | Versioned legacy urban-intelligence key |

The lookup envelope is exactly `{ legacySystemCode: 'TEHRAN_RADAR', legacyIdentifierValue }`. IRNI treats the value as opaque and matches it exactly. It does not trim, case-fold, decode, or perform fuzzy/name-based matching.

The current Radar browser code does not satisfy this contract:

1. `src/data/irniGeographyClient.ts` downloads alias rows and builds a map keyed by each row's `legacyIdentifierValue`.
2. `attachIrniCanonicalIdentities()` queries that map with `String(item.id)` only.
3. The `Neighborhood` model retains a numeric ID but does not carry a canonical identity source key. The helper `resolveCityIdForNeighborhood()` uses fixed numeric ranges and is not an approved canonical identity resolver.

Therefore, the current attachment path cannot resolve the new namespaced alias formats as written. The correction must use an explicit, source-backed key for each legacy record and the IRNI `resolveIdentifier()` operation. Do not manufacture the city component from a numeric range or use a bare numeric alias. Unresolved identities must remain unresolved.

## 5. Actual route and runtime topology on Radar `main`

| Path/component | Current implementation | Finding |
|---|---|---|
| Browser alias refresh | `src/data/irniGeographyClient.ts` calls `GET /api/v1/geography/legacy-aliases?legacySystemCode=TEHRAN_RADAR` | Reads the Radar-side D1-backed registry route, not the new IRNI RPC method. |
| Geographic registry route | `worker/router.ts` dispatches to `handleGeographicRegistryRoute()` in `worker/routes/geographicRegistryRoutes.ts` | The handler calls `requireNeighborhoodDb()` for geographic reads and internal publisher routes. |
| Geographic publisher ingress | `POST /api/internal/geography/publish/start`, `batch`, `finalize` | The handler performs direct D1 staging/activation SQL through the Radar Worker binding. This must be removed from the final architecture after a verified IRNI-owned runtime is available. |
| External HTTPS client | `worker/irni/irniNeighborhoodClient.ts` | Requires `IRNI_API_BASE_URL` and `IRNI_API_TOKEN`; returns reduced DTOs. It is not the accepted internal RPC boundary. |
| Old HTTP proxy handler | `worker/routes/irniReferenceRoutes.ts` | Defines `/api/v1/reference/irni/*`, but `worker/router.ts` does not import or dispatch this handler. It must not be mistaken for an active integration. |

The target runtime should be:

`radartehran-frontend` → `radartehran-api` → **IRNI Service Binding (typed RPC)** → IRNI's verified read repository.

The Radar Worker must not bind `radar-neighborhood-db`, issue SQL against IRNI-owned tables, or host the canonical publisher. Canonical mutations remain inside IRNI. The current `NEIGHBORHOOD_DB` binding and direct D1 routes are contrary to this target and remain a cutover blocker.

## 6. Version, pagination and failure semantics

The IRNI contract candidate uses:

- Contract version `1.0.0`.
- `getApprovedRegistryMetadata()`.
- `getApprovedEntityByCanonicalId(geographicEntityId, expectedRegistryRevision)`.
- `resolveIdentifier(query, expectedRegistryRevision)`.
- `listApprovedEntitiesPaginated(filter, page, expectedRegistryRevision)`.
- `listApprovedRelationshipsForEntity(geographicEntityId, expectedRegistryRevision)`.

A page and its relationships must be pinned to the same registry revision. Revision and checksum must be carried through the response and checked by Radar. A changed revision must return a version conflict; an unverified registry or unsupported contract version must fail closed. Do not synthesize `totalItems`, `totalPages`, `contractVersion`, or a successful fallback record when the provider omits them.

The new RPC entrypoint in IRNI PR #11 deliberately returns `STORAGE_UNAVAILABLE` until its durable repository and schema/migration-ledger audit are complete. That is the correct safe state; it is not a reason to enable an alternate direct-D1 or public-HTTPS path.

## 7. Transport decision and staged blockers

**Transport:** Cloudflare Workers RPC via a Service Binding to an IRNI `WorkerEntrypoint`. This keeps the read API internal and type-safe. IRNI PR #11 supplies the default `WorkerEntrypoint` scaffold and the versioned method interface; its RPC methods are not yet operational.

Do not add a live Service Binding, D1 adapter, schema migration, secret, queue, public endpoint or deployment in this mapping stage. The IRNI checkpoint explicitly blocks those until:

1. The contract and field/alias mapping are accepted by both repositories.
2. Both repositories have matching fixtures and contract tests for canonical IDs, alias resolution, relationship preservation, revision/checksum, pagination, and fail-closed behavior.
3. The actual shared-D1 schema and full migration ledger are verified under the approved IRNI-owned process.
4. The IRNI durable read repository and internal Worker RPC implementation pass their own tests.

This document records the current evidence and the intended mapping. It does not authorize a production cutover or make the RPC operational.
