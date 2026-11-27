# Radar Tehran GIS Data Dictionary

**Status date:** 2026-11-27  
**Scope:** Current source-defined GIS types; this is not a claim that every field is populated or verified in production.

## Coordinate and geometry types

| Type / field | Meaning | Current contract |
|---|---|---|
| `Wgs84Coordinate.lat` | Latitude in degrees | WGS 84 coordinate object |
| `Wgs84Coordinate.lng` | Longitude in degrees | WGS 84 coordinate object |
| `LinearRingCoords` | Ordered ring positions | Each position is `[longitude, latitude]` |
| `PolygonGeometry.type` | GeoJSON geometry kind | `Polygon` or `MultiPolygon` |
| `PolygonGeometry.coordinates` | Polygon ring structure | Polygon: exterior ring followed by zero or more interior rings; MultiPolygon: array of polygon ring sets |
| `geometryCrs` | Declared coordinate reference system for a boundary | `EPSG:4326` or `UNKNOWN`; unknown geometry is not eligible for verified profile evidence |

## Boundary version record

The source type is `BoundaryVersionRecord` in `server/modules/geospatial/types.ts`.

| Field | Purpose |
|---|---|
| `id` | Version record identifier |
| `entityId` | Local operational entity key; not a substitute for an IRNI canonical identity |
| `cityId`, `districtId`, `hoodId`, `subNeighborhoodId` | Legacy/application hierarchy references |
| `level` | City, district, neighborhood or sub-neighborhood |
| `nameFa`, `nameEn`, `historicalNames` | Localized and historical labels |
| `version`, `status` | Version sequence and lifecycle status |
| `geometry` | Canonical persisted Polygon/MultiPolygon geometry |
| `geometrySha256` | Server-computed digest of exact persisted geometry |
| `geometryCrs` | CRS declaration |
| `simplifiedGeometry` | Lower-detail display geometry; not authoritative for analysis |
| `boundingBox` | Min/max latitude and longitude prefilter |
| `sourceProvenance` | Source token; full provenance must be independently resolved |
| `createdByUid`, `createdAtIso` | Creation audit metadata |
| `reviewedByUid`, `reviewedAtIso` | Review metadata |
| `previousVersionId` | Previous version reference when known |

## Boundary statuses

Current source type: `ACTIVE`, `SUPERSEDED`, `PENDING_REVIEW`, `REJECTED`.

## Point resolution

Current `PointResolutionResult` includes:

- `resolved`: legacy resolution boolean; audit its meaning against status before consuming it.
- `status`: `RESOLVED_INSIDE`, `RESOLVED_ON_EDGE`, `AMBIGUOUS_OVERLAP`, `OUTSIDE_KNOWN_BOUNDARIES`.
- `confidence`: `high`, `medium`, `none`.
- Resolved city/district/neighborhood identifiers and selected boundary version, where returned.
- `candidateBoundaryIds`: candidate boundary IDs useful for diagnosing uncertainty.

## Distance and measurement conventions

- `calculateGeodesicDistanceMeters` reports straight-line great-circle distance in meters using a Haversine calculation.
- This value is not a network travel time or route distance.
- Do not perform planar metric calculations directly on degree coordinates.
- A verified local projected CRS for each source/measurement workflow remains to be selected and documented from its source metadata.


## Polygon validation issue codes

- `UNCLOSED_RING`: first and last positions do not match within the configured tolerance.
- `TOO_FEW_VERTICES`: a ring has fewer than four positions.
- `SELF_INTERSECTION`: non-adjacent segments in one ring properly intersect.
- `DEGENERATE_ZERO_AREA`: a ring has zero or near-zero signed area.
- `HOLE_OUTSIDE_OUTER`: an interior ring is not strictly contained by its exterior ring or touches/crosses it.
- `HOLE_OVERLAP`: interior rings overlap, touch, or nest within one another.

These are code-level validation semantics; the new regression tests have not yet been executed in this session. Distinct MultiPolygon component overlap remains outside the current validator.

- `HOLE_OUTSIDE_OUTER`: an interior ring is not strictly contained by its exterior ring or touches/crosses it.
- `HOLE_OVERLAP`: two interior rings overlap, touch, or nest.
- `MULTIPOLYGON_COMPONENT_OVERLAP`: distinct MultiPolygon components intersect/touch or have overlapping filled interiors. A component contained in another component's valid hole is not considered overlapping.


## Durable snapshot boundary-integrity error codes

- `BOUNDARY_GEOMETRY_INVALID`: canonical persisted Polygon/MultiPolygon fails coordinate or topology validation.
- `BOUNDARY_BBOX_GEOMETRY_MISMATCH`: persisted bounding box differs from the bounds recomputed from canonical geometry by more than 1e-6 degrees.
- `BOUNDARY_SIMPLIFIED_GEOMETRY_INVALID`: display/simplified geometry fails the same geometry validation before snapshot activation.

These errors block snapshot readiness/activation; recovery does not repair geometry or rewrite canonical records automatically.
