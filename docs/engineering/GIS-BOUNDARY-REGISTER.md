# Radar Tehran GIS Boundary Register

**Status date:** 2026-11-27

## Supported boundary entity levels

Current source type supports `city`, `district`, `neighborhood`, and `sub_neighborhood`.

## Geometry and version contract

- Geometry types: `Polygon` and `MultiPolygon`.
- Coordinate order: GeoJSON `[longitude, latitude]`.
- Declared coordinate system: `EPSG:4326` for current profile-eligible boundary records; legacy/unknown CRS must remain ineligible until verified.
- Canonical geometry and simplified display geometry are stored separately.
- Geometry hash and source provenance are retained on the version record.
- Each entity history stores versions and lifecycle status; approval of a pending version supersedes prior active records in the mutation path.
- Boundaries used for profile evidence also require independent source and canonical identity resolution.

## Current integrity controls

- Polygon structural validation checks all rings for minimum vertices, closure, valid Iran-coordinate positions, non-zero area and per-ring self-intersection.
- Point-in-polygon now evaluates holes: points inside an interior ring are outside the polygon; points on exterior or interior ring edges are classified `ON_EDGE`.
- Valuation feature generation accepts only a `RESOLVED_INSIDE` neighborhood result with a resolved city and integer neighborhood ID.
- It rejects caller-supplied neighborhood IDs that disagree with the geometric resolution.

## Known gaps

- Hole containment, ring-to-ring intersections, nested/overlapping holes, and MultiPolygon component topology are not yet fully validated.
- Duplicate `ACTIVE` versions inside a single entity history are not yet blocked by the snapshot validator; some readers select the first active version.
- Bounding-box overlap is only a coarse candidate signal, not proof of polygon overlap.
- No authoritative production boundary dataset has been re-imported and independently verified in this work package.
- Boundary version metadata does not yet guarantee a complete source license/provenance record.
