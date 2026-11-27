# Radar Tehran GIS Architecture

**Status date:** 2026-11-27  
**Baseline:** `main` at `456dcacb387b908797756863b10da1f7104b658e`  
**Active work branch:** `feat/gis-spatial-integrity-2026-11-27`  
**Review PR:** [#72 — Draft](https://github.com/bijanbijane/radartehran/pull/72)

## 1. Current runtime boundaries

- The GIS domain service is `server/modules/geospatial/service.ts`; Express mounts its router at `/api/v1/geospatial`.
- Geometry and coordinate primitives are in `coordinateAndPolygonEngine.ts`.
- Boundary lifecycle operations are in `geospatialBoundaryMutations.ts`; point-to-boundary resolution is in `geospatialPointResolution.ts`.
- The current runtime state is hydrated and persisted through `geospatialRepository.ts` and `geospatialRuntimePersistence.ts`, using the repository's atomic JSON/durable snapshot path. This is not a D1 spatial query engine.
- Canonical neighborhood identity and registry authority belong to IRNI. Radar must consume approved identity and boundary evidence through the authorized read-only provider; it must not write to IRNI-owned `geo_*` tables.
- NIPS profile contracts currently exist in `server/modules/neighborhood-profile`, but this module has no repository, migration, database binding, or write path.

## 2. Geographic data flow

1. Input latitude/longitude is normalized and constrained to the supported Iran coverage.
2. Polygon vertices use GeoJSON position order `[longitude, latitude]`; runtime coordinate objects use `{ lat, lng }`.
3. Boundary versions are retained in per-entity history with a status, version, source-provenance token, geometry digest, declared CRS, bounds and reviewer metadata.
4. Point resolution prefilters candidate boundaries by bounding box, then evaluates polygon containment.
5. Valuation location features may now be derived only from a unique, strictly interior neighborhood match. Edge, overlap, outside-coverage, city mismatch, caller-ID mismatch and duplicate ACTIVE versions in a relevant entity history fail closed.
6. Boundary reads require exactly one ACTIVE version per entity. A duplicate ACTIVE lifecycle is never resolved by choosing the first stored row.
7. NIPS neighborhood profiles remain a separate domain contract. Their identity/geography evidence must come from approved IRNI providers; profile values are not generated from geometry alone.

## 3. Geometry representation

- Supported persisted boundary geometry: GeoJSON `Polygon` and `MultiPolygon`.
- Persisted canonical coordinate declaration: `EPSG:4326` (WGS 84) when set on a boundary record.
- The original geometry is retained separately from `simplifiedGeometry`; simplification is for display and must not be used for authoritative spatial assignment or measurement.
- Geometry SHA-256 is calculated from the persisted geometry for profile-boundary evidence checks.
- Point-on-edge and overlapping-neighborhood classifications remain explicit; they are not a unique assignment.

## 4. Persistence and ownership decisions

### Live D1 inventory — read-only inspection, 2026-11-27

- `radar-neighborhood-db`: 19 application tables; five applied migrations through `0005_irni_identity_anchor_entity_uniqueness.sql`. Its application tables are the IRNI `geo_*` registry and staging/publication tables. No `nips_*` tables were found.
- `radar-user-db`: 29 application tables, including the legacy `neighborhood_projections` projection. No `nips_*` tables were found.
- `radar-researcher-db`: 9 application tables. No `nips_*` tables were found.
- No `radar-profile-db` exists in the connected Cloudflare account inventory.
- These inspections used read-only SQL against `sqlite_master` and `d1_migrations`; query metadata reported zero rows written and `changed_db=false`.

### NIPS storage ownership — do not conflate databases

- The current NIPS ERD proposes a dedicated D1 profile store named `radar-profile-db`, separate from IRNI's `radar-neighborhood-db`, `radar-user-db`, and `radar-researcher-db`.
- NIPS-1.0.0 describes one shared profile database used by the independent IRNI and Radar NIPS backend implementations. In this context, shared means shared profile storage between those backends; it does **not** mean adding NIPS tables to IRNI's canonical geography database.
- Canonical geographic IDs, identity anchors, aliases and boundary authority remain owned by IRNI. NIPS stores external canonical IDs, registry revisions and boundary references; it must not duplicate or re-author the IRNI geography master.
- The NIPS schema file is explicitly DESIGN ONLY. The proposed `radar-profile-db`, its owner/writer policy, bindings, migrations and RPC/API contracts have not been provisioned or verified.
- An earlier GIS note suggesting `nips_*` tables inside `radar-neighborhood-db` conflicts with the NIPS ERD and backend profile README. That approach is superseded by the dedicated-store proposal and must not be implemented.
- No direct Radar write binding to IRNI-owned geographic registry tables is permitted. The canonical geography read provider and NIPS profile persistence provider are distinct interfaces with separately authorized scopes.
- No new database, PostGIS service, H3 index, vector-tile service or paid dependency is approved by this increment.

### D1 spatial capability findings

- Live read-only probes against D1 confirmed basic `SELECT`, JSON functions (`json_valid`, `json_extract`) and math functions (`sqrt`) execute successfully.
- The connected D1 REST query surface rejected `sqlite_version()`, `PRAGMA module_list`, and `EXPLAIN CREATE VIRTUAL TABLE ... USING rtree` with authorization errors. These results do not establish whether the Worker binding runtime supports RTree.
- No virtual tables were found in the inspected `radar-neighborhood-db` schema.
- Cloudflare's current SQL documentation lists FTS5, JSON and math among supported SQLite extensions. Its November 12, 2026 changelog discusses exporting virtual tables such as RTree; export support alone is not proof that RTree creation/querying is supported in the D1 runtime.
- Baseline design: store canonical GeoJSON as validated text and use scalar bounding-box columns with ordinary indexes for candidate filtering. Do not depend on RTree until an isolated, non-production Worker/D1 compatibility test proves it.

The current GIS runtime's JSON snapshot persistence and the IRNI canonical D1 registry are separate systems; neither is a completed D1 spatial persistence migration.

## 5. Current limitations

- A complete authoritative source registry and verified import dataset are not yet demonstrated by the current runtime types.
- The polygon validator checks ring closure, coordinate validity, degeneracy, per-ring self-intersection, strict hole containment, and hole-to-hole overlap/nesting. The new hole-topology tests have not yet been executed in a local or CI runner. Intersections and overlap between separate MultiPolygon components remain outstanding.
- Historical duplicate ACTIVE versions are not automatically rewritten. Coordinate resolution reports `MULTIPLE_ACTIVE_BOUNDARY_VERSIONS`; profile boundary reads return no selected active record. Repair requires a pending boundary version and independent approval.
- CRS transformation workflows and local metric projection policy are not yet established for all source datasets.
- NIPS persistence and the production canonical geography provider remain unimplemented/unverified.

## 6. 2026-11-27 GIS increment

- Added `HOLE_OUTSIDE_OUTER` and `HOLE_OVERLAP` validation issue codes.
- Interior rings must be strictly inside the exterior ring; touching, crossing, overlapping, or nested holes are rejected.
- Regression coverage added for exterior escape, boundary contact, overlapping holes, and nested holes.
- Valuation feature generation now rejects unresolved, edge, overlapping, city-mismatched and caller-ID-mismatched assignments.
- Duplicate ACTIVE versions now fail closed in point resolution and profile boundary reads; historical duplicates are not silently rewritten.
- CI status for inspected PR head `f601b15715d2221c4b7a48d016f9350fcd685d25`: five GitHub Actions workflows concluded `failure`; their jobs exposed no steps and log retrieval returned `BlobNotFound`. It is not established whether GIS test commands started. Treat CI as FAILED / UNDIAGNOSED, not as a GIS test regression.
- Live D1 schema inspection was read-only. No production data, D1 schema, Worker binding, database, or deployment was changed.


## 5. MultiPolygon component topology

- Each MultiPolygon component is validated independently for ring closure, coordinate validity, self-intersection and Polygon interior-ring rules.
- Distinct components are rejected when any of their rings intersect or touch, or when one component's outer-ring vertex lies in the filled area of another component.
- A component fully contained by a valid interior hole of another component is permitted; this represents a disjoint island in the hole rather than overlapping filled area.
- Validation issue: `MULTIPOLYGON_COMPONENT_OVERLAP`.
- Regression coverage includes overlapping components, shared-boundary contact, disjoint components and a component inside a valid hole.

## 6. Focused verification workflow

`.github/workflows/gis-spatial-integrity.yml` runs the dedicated `npm run test:geospatial` suite and repository TypeScript check for the GIS work branch. Its push trigger is intentionally scoped to the active GIS branch; it does not deploy or mutate runtime data.
