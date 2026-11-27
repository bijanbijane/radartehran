# Radar Tehran GIS Foundation — Architecture Record

**Status:** PARTIALLY VERIFIED — implementation exists in several layers; production profile integration remains blocked  
**Scope:** GIS foundation and neighborhood profile integration. This record supplements, and does not replace, the canonical NIPS neighborhood-profile reference design.

## Authority and ownership

- IRNI Geographic Registry is the sole canonical owner of geographic entity IDs, canonical names, lineage, identity anchors, aliases, publication revisions and checksums.
- Radar consumes canonical geography through the internal `IRNI_GEOGRAPHY` Cloudflare Workers Service Binding. Radar must not read the shared geography D1 directly, publish canonical registry records, or infer identity from names, coordinates, proximity or bare legacy IDs.
- Radar may own market-area concepts and local product extensions, but may link them to IRNI entities only through approved, evidence-backed crosswalks.
- The existing Worker IRNI v2 client verifies registry metadata/revision/checksum and uses namespaced legacy alias contracts. The Worker-side neighborhood identity resolver is not automatically available to the separate Express API process.

## Neighborhood identity and profile

The product profile is a read model, not a second canonical geography database. Keep these capabilities separate:

1. Identity: canonical IRNI entity, verified aliases, parent hierarchy and lifecycle.
2. Spatial: independently reviewed active boundary version with explicit CRS, geometry hash, provenance and review evidence.
3. Analytical: typed variables and observations with source, temporal, spatial, unit, method and quality semantics.

A point-only neighborhood may have an identity profile. It must not receive a fabricated polygon, measured area or polygon-dependent metric. Missing, unavailable, stale, suppressed, not-applicable and observed-zero remain distinct.

The existing NIPS V2 reference design is authoritative for profile gates, source/evidence ownership, boundary review, publication states, API contracts and known blockers:
`docs/engineering/NIPS-NEIGHBORHOOD-PROFILE-V2/NEIGHBORHOOD-PROFILE-REFERENCE-DESIGN-V2.md`.

## Geometry and coordinate contract

- GeoJSON positions are `[longitude, latitude]`; Leaflet tuples are `[latitude, longitude]`. Conversion must be explicit.
- The current geometry engine declares canonical WGS84 as `EPSG:4326`, supports explicit transformations from `EPSG:3857`, `EPSG:32639` and `EPSG:32640`, and rejects Tehran-range swapped coordinate pairs rather than silently swapping them.
- The geometry validator checks coordinate ranges, ring closure, ring self-intersection and hole containment. This is not yet proof of complete topology validity: hole-ring intersections, overlaps between MultiPolygon components, and cross-neighborhood gaps/overlaps require explicit additional checks and fixtures.
- Preserve source geometry separately from simplified display geometry. Display simplification is never analytical authority.
- The Worker route `POST /api/neighborhood-boundaries/resolve` creates a computed hex fallback. Its source is `computed_hex_fallback`; it is visualization-only and must never satisfy boundary evidence, area, assignment or analytical gates.

## Database and spatial indexing decision

Cloudflare D1 is the current relational runtime, but must not be treated as PostGIS or assumed to expose arbitrary SQLite extensions.

Cloudflare's D1 SQL documentation lists FTS5, JSON and math functions in its supported extension subset; it does not list RTree, Geopoly or SpatiaLite. A November 2026 D1 export changelog mentions exporting databases containing RTree virtual tables, but export compatibility is not proof that RTree can be created or queried in the live D1 Worker runtime.

Until an actual D1 runtime probe proves otherwise:
- Do not issue `CREATE VIRTUAL TABLE ... USING rtree` migrations.
- Do not claim SQL-native point-in-polygon, geometry predicates or spatial indexes in D1.
- Keep canonical geometry as validated GeoJSON in the boundary domain and use bounded relational prefilters only where measured and indexed.
- Perform exact geometry validation and predicates in tested Worker/TypeScript spatial code, with strict candidate bounds and query limits.
- Consider H3/cell coverings only after workload benchmarks and a verified cell-resolution/error contract. Do not add a second database without measured requirements.

A local SQLite test is not evidence of D1 runtime compatibility. Required verification is a non-destructive staging/runtime capability probe followed by bounded query benchmarks; production database mutation is not authorized by this record.

## Current integration boundary

The NIPS V2 design and code establish a boundary-version review/read-model scaffold, geometry SHA-256 and explicit CRS. The production Express factory currently creates the Geospatial module without the canonical IRNI identity resolver, trusted source-registry resolver, or approval authorization dependencies. Therefore the read model must remain BLOCKED and approval must remain denied. The Worker Service Binding cannot be passed to Express as an environment variable; an authenticated, version-pinned Worker/API bridge or a Worker-native route composition is required.

Do not bypass this boundary with direct geography D1 access, public unauthenticated IRNI HTTP, local static catalog fallback, or request-supplied trust assertions.

## Immediate engineering sequence

1. Preserve the fail-closed profile read model and test the production factory's BLOCKED behavior.
2. Design and implement the authenticated Worker-to-API bridge for identity resolution, pinned to the IRNI v2 contract and registry revision/checksum.
3. Implement the trusted source-registry resolver as a separate dependency; do not conflate identity with source authority.
4. Inject an independently verified admin authorization dependency for boundary approval.
5. Add complete topology tests (hole intersections, MultiPolygon component overlap, boundary edge/vertex semantics, cross-neighborhood overlap/gap checks).
6. Probe actual D1 RTree capability in a disposable/staging database before any RTree schema decision.
7. Define typed profile-variable catalog and observation adapters only against authoritative NIPS/source/evidence registries.
8. Pilot one source-verified neighborhood boundary; never manufacture Tehran neighborhood polygons or indicators.

## Explicit non-goals

- No production migration, production data replacement, canonical IRNI writes, deployment, merge or release.
- No adoption of PostGIS, SpatiaLite, RTree, H3 or paid services without measured and runtime-verified justification.
