# Radar Tehran GIS Architecture

**Status date:** 2026-11-27  
**Baseline:** `main` at `456dcacb387b908797756863b10da1f7104b658e`  
**Active work branch:** `feat/gis-spatial-integrity-2026-11-27`

## 1. Current runtime boundaries

- The GIS domain service is `server/modules/geospatial/service.ts`; Express mounts its router at `/api/v1/geospatial`.
- Geometry and coordinate primitives are in `coordinateAndPolygonEngine.ts`.
- Boundary lifecycle operations are in `geospatialBoundaryMutations.ts`; point-to-boundary resolution is in `geospatialPointResolution.ts`.
- The current runtime state is hydrated and persisted through `geospatialRepository.ts` and `geospatialRuntimePersistence.ts`, using the repository's atomic JSON/durable snapshot path. This is not a D1 spatial query engine.
- Canonical neighborhood identity and registry authority belong to IRNI. NIPS profile storage and GIS identity reads must not be implemented by giving the Radar API direct write access to IRNI-owned tables.

## 2. Geographic data flow

1. Input latitude/longitude is normalized and constrained to the supported Iran coverage.
2. Polygon vertices use GeoJSON position order `[longitude, latitude]`; runtime coordinate objects use `{ lat, lng }`.
3. Boundary versions are retained in per-entity history with a status, version, source-provenance token, geometry digest, declared CRS, bounds and reviewer metadata.
4. Point resolution prefilters candidate boundaries by bounding box, then evaluates polygon containment.
5. Valuation location features may now be derived only from a unique, strictly interior neighborhood match. Edge, overlap, outside-coverage, city mismatch and caller-ID mismatch cases fail closed.
6. NIPS neighborhood profiles remain a separate domain contract. Their identity/geography evidence must come from approved IRNI providers; profile values are not generated from geometry alone.

## 3. Geometry representation

- Supported persisted boundary geometry: GeoJSON `Polygon` and `MultiPolygon`.
- Persisted canonical coordinate declaration: `EPSG:4326` (WGS 84) when set on a boundary record.
- The original geometry is retained separately from `simplifiedGeometry`; simplification is for display and must not be used for authoritative spatial assignment or measurement.
- Geometry SHA-256 is calculated from the persisted geometry for profile-boundary evidence checks.
- Point-on-edge and overlapping-neighborhood classifications remain explicit; they are not a unique assignment.

## 4. Persistence and ownership decisions

- Do not assume that D1 provides PostGIS-like geometry operators or an enabled SQLite spatial extension.
- The existing `radar-neighborhood-db` is IRNI-owned. The repository's recorded owner decision requires NIPS storage access through a separately versioned, authenticated IRNI Worker RPC and `nips_`-prefixed tables.
- The Radar API must not receive a direct binding for writes to IRNI-owned geographic registry tables. The read-only geography provider and NIPS storage provider are distinct scopes.
- No new spatial database, PostGIS service, H3 index, vector-tile service or paid dependency is approved by this increment.
- The current GIS runtime's JSON snapshot persistence and the IRNI canonical D1 registry are separate systems; do not describe either as a completed spatial database migration.

## 5. Current limitations

- A complete authoritative source registry and verified import dataset are not yet demonstrated by the current runtime types.
- The polygon validator checks ring closure, coordinate validity, degeneracy, per-ring self-intersection, strict hole containment, and hole-to-hole overlap/nesting. The new hole-topology tests are committed but have not yet been executed in a local or CI runner. Intersections between separate MultiPolygon components and component overlap remain outstanding.
- Point resolution still needs a broader audit for duplicate active versions within one entity history and for ambiguous result semantics across all consumers. Valuation feature derivation is fail-closed in this branch.
- CRS transformation workflows and local metric projection policy are not yet established for all source datasets.


## 6. 2026-11-27 GIS increment

- Added `HOLE_OUTSIDE_OUTER` and `HOLE_OVERLAP` validation issue codes.
- Interior rings must be strictly inside the exterior ring; touching, crossing, overlapping, or nested holes are rejected.
- Regression coverage added for exterior escape, boundary contact, overlapping holes, and nested holes.
- Verification state: source and test files were re-fetched from GitHub after commit; automated execution remains pending because no online local runner or GitHub check run was available during this session.
- No production data, D1 schema, Worker binding, or deployment was changed.
