# IRNI Canonical Geography Integration

## Authority and invariants

- `bijanbijane/Iran-Neighborhood-Intelligence` is the sole authority for canonical geographic entities, identifiers, identity anchors, issuance order, classification, and relationships.
- Tehran Radar must not mint, rename, reclassify, renumber, merge, or re-parent an IRNI entity.
- Entity matching is by immutable `geographicEntityId`, never by display name alone.
- The source `parentGeographicEntityId` and `provinceGeographicEntityId` are preserved as published. Radar must not infer a city parent where IRNI does not declare one.
- No independent IRNI Worker or IRNI backend is deployed. IRNI remains in Google AI Studio; its GitHub repository publishes signed snapshots to the Radar API Worker.

## Authoritative artifacts

A publication revision is accepted only when all artifacts share the same `registryRevision` and `registryChecksum`:

1. `public/data/geography/national-registry-snapshot.json`
2. `data/geography/normalized/geographic-relationships.json`
3. `data/geography/identity/GEOGRAPHIC-SOURCE-ID-MAPPINGS.json`
4. `data/geography/identity/GEOGRAPHIC-CANONICAL-ID-REGISTRY.json`
5. `data/geography/identity/GEOGRAPHIC-IDENTITY-ANCHOR-REGISTER.json`
6. `data/geography/identity/GEOGRAPHIC-LEGACY-ID-ALIASES.json`

The publisher transfers the canonical entity object unchanged, together with its exact identity-registry entry and anchor record. The Radar database stores these three records in their corresponding tables. `issuedOrderIndex` is sourced from the canonical ID registry and is not recalculated from alphabetical order or entity IDs.

The current legacy-alias artifact is empty. The publisher fails closed if it becomes non-empty until an explicit alias-transfer dataset is implemented.

## Publication protocol

The IRNI GitHub Actions environment `radar-publisher` supplies:

- `RADAR_PUBLISH_URL`: the Radar API Worker origin.
- `RADAR_PUBLISH_HMAC_SECRET`: a secret of at least 32 characters; never committed to Git.

Each request is authenticated with HMAC-SHA256 over:

`timestamp + newline + nonce + newline + SHA256(rawRequestBody)`

The Radar API enforces a five-minute timestamp window, a one-use nonce, strict payload limits, revision monotonicity, per-record validation, referential integrity, and idempotent chunk replay. Transfer batches are staged first. The canonical tables and registry head are replaced in one D1 batch only after every expected record and reference has been verified.

## Radar database

- D1 binding: `NEIGHBORHOOD_DB`
- Database: `radar-neighborhood-db`
- Baseline migration: `migrations/geography-d1/0001_geographic_registry.sql`
- Publication staging migration: `migrations/geography-d1/0002_irni_publication_staging.sql`

The binding is used by the canonical registry repository. The only mutation path is the HMAC-authenticated IRNI publisher route; normal Radar application routes expose read operations only.

## Read API

All read endpoints fail closed until `geo_registry_head.integrity_verified = 1`.

- `GET /api/v2/reference/geography/metadata`
- `GET /api/v2/reference/geography/entities?entityType=URBAN_NEIGHBORHOOD&limit=100&offset=0`
- `GET /api/v2/reference/geography/entities/{geographicEntityId}`
- `GET /api/v2/reference/geography/relationships?sourceGeographicEntityId={id}`

Entity responses keep the source entity, identity-registry entry, and identity anchor as separate records. Entity lists are ordered by IRNI's `issuedOrderIndex`. Parent and province filters accept canonical IRNI IDs only.

The frontend Worker forwards `/api/*` requests through the `RADAR_API` service binding to `radartehran-api`.

## Deployment status

This integration is under review in PR #8. It is not production-active until the PR is merged, the remote migration is applied, the API Worker and frontend Worker are deployed, the IRNI publication workflow completes, and read-back verification matches the source revision and checksums.
