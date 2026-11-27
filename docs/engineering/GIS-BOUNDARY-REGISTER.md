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

- Polygon structural validation checks all rings for minimum vertices, closure, valid Iran-coordinate positions, non-zero area and per-ring self-intersection. The latest GIS increment also requires every interior ring to be strictly inside its exterior ring and rejects hole touching, crossing, overlap and nesting.
- Point-in-polygon now evaluates holes: points inside an interior ring are outside the polygon; points on exterior or interior ring edges are classified `ON_EDGE`.
- Valuation feature generation accepts only a `RESOLVED_INSIDE` neighborhood result with a resolved city and integer neighborhood ID.
- It rejects caller-supplied neighborhood IDs that disagree with the geometric resolution.

## Known gaps

- MultiPolygon components are checked for touch/intersection and overlapping filled interiors, while a component inside another component's valid hole remains allowed. The associated tests are committed but not verified as passing because CI has no usable step logs.
- Legacy snapshots containing duplicate `ACTIVE` versions are not automatically rewritten. Snapshot validation rejects them; point assignment/profile reads fail closed; automatic upsert is blocked; a pending replacement can be approved by an independent reviewer. Bbox overlap diagnostics omit ambiguous multi-active histories.
- Bounding-box overlap is only a coarse candidate signal, not proof of polygon overlap.
- No authoritative production boundary dataset has been re-imported and independently verified in this work package.
- Boundary version metadata does not yet guarantee a complete source license/provenance record.


## Persisted history integrity

- Each persisted boundary history must be an array keyed by its canonical `entityId`.
- Boundary IDs must be unique; version numbers must be positive, unique, and strictly increasing in stored order.
- A boundary history may have zero ACTIVE versions while awaiting review, but may not have more than one ACTIVE version.
- Snapshot validation checks all histories; it no longer relies on a first-N entity/version sampling window.
- Bbox overlap diagnostics skip a history with multiple ACTIVE versions instead of selecting the first one.
- Historical duplicate records are not silently repaired. A new pending boundary and independent approval are required to supersede prior ACTIVE records.
- The new recovery and read-model regression tests are registered but remain unverified until the focused workflow executes and returns accessible logs.
