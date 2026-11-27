# Radar Tehran GIS Foundation — Architecture Record

**Status:** PARTIALLY VERIFIED — implementation exists in several layers; production profile integration remains blocked.  
**Scope:** GIS foundation and neighborhood profile integration. Supplements, and does not replace, the canonical NIPS neighborhood-profile reference design.

## Authority and ownership

- IRNI Geographic Registry is the sole canonical owner of geographic entity IDs, canonical names, lineage, identity anchors, aliases, publication revisions and checksums.
- Radar consumes canonical geography through the internal `IRNI_GEOGRAPHY` Cloudflare Workers Service Binding. Radar must not read shared geography D1 directly, publish canonical registry records, or infer identity from names, coordinates, proximity or bare legacy IDs.
- Radar may own market-area concepts and local product extensions, but may link them to IRNI entities only through approved, evidence-backed crosswalks.
- The Worker IRNI v2 client and neighborhood identity resolver exist. The Worker Service Binding is not automatically available to the separate Express API process.

## Neighborhood identity and profile

Keep three capabilities separate:

1. Identity: canonical IRNI entity, verified aliases, parent hierarchy and lifecycle.
2. Spatial: independently reviewed active boundary version with explicit CRS, geometry hash, provenance and review evidence.
3. Analytical: typed variables and observations with source, temporal, spatial, unit, method and quality semantics.

A point-only neighborhood may have an identity profile. It must not receive a fabricated polygon, measured area or polygon-dependent metric. Missing, unavailable, stale, suppressed, not-applicable and observed-zero remain distinct.

The existing NIPS V2 reference design is authoritative for profile gates, source/evidence ownership, boundary review, publication states, API contracts and known blockers:
`docs/engineering/NIPS-NEIGHBORHOOD-PROFILE-V2/NEIGHBORHOOD-PROFILE-REFERENCE-DESIGN-V2.md`.

## Geometry and coordinate contract

- GeoJSON positions are `[longitude, latitude]`; Leaflet tuples are `[latitude, longitude]`. Conversion must be explicit.
- The current geometry engine declares canonical WGS84 as `EPSG:4326`, supports transformations from `EPSG:3857`, `EPSG:32639` and `EPSG:32640`, and rejects Tehran-range swapped coordinate pairs rather than silently swapping them.
- Current validation checks coordinate ranges, ring closure, ring self-intersection and hole containment. It does not yet prove complete topology validity: hole-ring intersections, MultiPolygon component overlaps and cross-neighborhood gaps/overlaps need explicit checks and fixtures.
- Preserve source geometry separately from simplified display geometry. Display simplification is never analytical authority.
- Worker route `POST /api/neighborhood-boundaries/resolve` creates a `computed_hex_fallback`. It is visualization-only and must never satisfy boundary evidence, area, assignment or analytical gates.

## Database and spatial indexing

Cloudflare D1 is the current relational runtime, but must not be treated as PostGIS or assumed to expose arbitrary SQLite extensions.

Cloudflare's D1 SQL documentation lists FTS5, JSON and math functions in its supported extension subset; it does not list RTree, Geopoly or SpatiaLite. The November 2026 D1 export changelog mentions exporting databases containing RTree virtual tables, but export compatibility is not proof that RTree can be created or queried in the live D1 Worker runtime.

Until a real D1 runtime probe proves otherwise:
- Do not issue `CREATE VIRTUAL TABLE ... USING rtree` migrations.
- Do not claim SQL-native point-in-polygon, geometry predicates or spatial indexes in D1.
- Keep exact geometry validation and predicates in tested Worker/TypeScript code with strict candidate bounds and query limits.
- Consider H3/cell coverings only after workload benchmarks and a verified resolution/error contract. Do not add another database without measured requirements.

A local SQLite test is not evidence of D1 compatibility. Required verification is a non-destructive disposable/staging Worker-binding probe and bounded query benchmarks. Production database mutation is not authorized.

## Current persistence and API boundary

The Geospatial service currently persists boundary history, POIs, overlays, import batches and spatial listing indexes through `AtomicJsonRepository('geospatial-state.json')`, with remote repository-snapshot hydration/persistence when that facility is active. This is not a relational D1 schema and does not provide relational constraints, SQL queryability or transactional spatial indexing. The current `wrangler.backend.jsonc` declares user and researcher D1 bindings plus the IRNI service binding; it does not declare a Radar-owned GIS D1 binding.

Do not migrate this state to a D1 database until ownership, retention, write authorization, migration/rollback and the canonical-vs-product-data boundary are explicitly settled. IRNI remains the owner of canonical geography; Radar boundary-review artifacts and product observations need an explicitly approved storage owner.

The NIPS V2 scaffold stores boundary geometry hash and explicit CRS and fails closed unless canonical identity and trusted source resolvers are configured. The production Express factory currently omits those resolvers and the approval authorization dependencies. The read model must remain BLOCKED and approval must remain denied. An authenticated, version-pinned Worker/API bridge or Worker-native route composition is required; direct geography D1 access and public unauthenticated IRNI HTTP are prohibited.

## Immediate engineering sequence

1. Preserve the fail-closed profile read model and verify production composition.
2. Design and implement the authenticated Worker-to-API identity bridge pinned to the IRNI v2 contract and registry revision/checksum.
3. Implement trusted source-registry resolution as a separate dependency.
4. Inject independently verified admin authorization for boundary approval.
5. Add topology tests for hole intersections, MultiPolygon overlaps, boundary edge/vertex semantics and cross-neighborhood topology.
6. Probe actual D1 RTree capability in a disposable/staging database before any RTree schema decision.
7. Resolve the storage owner and migration design for Radar-owned boundary-review records and typed profile observations.
8. Pilot one source-verified neighborhood boundary; never manufacture neighborhood polygons or indicators.

## Explicit non-goals

No production migration, production data replacement, canonical IRNI writes, deployment, merge or release. No PostGIS, SpatiaLite, RTree, H3 or paid service adoption without measured and runtime-verified justification.
