# GIS Data Dictionary — Initial Register

This is a register of fields already evidenced in the repository and required metadata still to be formalized. It does not invent profile values or create a second source of truth.

| Domain | Field / concept | Type / semantics | Current status |
|---|---|---|---|
| Identity | canonical geographic entity ID | Stable IRNI identifier; not a name or legacy integer | IRNI-owned; Radar v2 reader exists |
| Identity | legacy neighborhood ID | Integer compatibility key scoped by city | Non-canonical; requires approved alias |
| Identity | canonical name / aliases | Registry-backed strings with alias type and provenance | IRNI-owned |
| Hierarchy | parent entity ID | Canonical parent reference | IRNI-owned |
| Boundary | boundary version ID | Stable version record identifier | Radar scaffold; storage owner unresolved |
| Boundary | geometry | GeoJSON Polygon / MultiPolygon, positions [lng,lat] | Radar scaffold; source must be verified |
| Boundary | geometry CRS | Explicit CRS; current profile gate requires EPSG:4326 | Implemented |
| Boundary | geometry SHA-256 | Server-computed digest of persisted canonical geometry | Implemented in scaffold |
| Boundary | simplified geometry | Display-only derivative | Implemented; never analytical |
| Boundary | bounding box | Numeric min/max lat/lng prefilter | Implemented |
| Boundary | review status | PENDING_REVIEW / ACTIVE / SUPERSEDED / REJECTED | Implemented in scaffold |
| Profile variable | variable ID, type, unit, validation schema | Versioned catalog definition | Required; NIPS catalog schema not yet formalized |
| Observation | value, status, source, collected/effective dates | Typed, provenance-backed observation | Provider/registry adapter incomplete |
| Observation | confidence / quality | Domain-specific quality metadata | Required only where meaningful; schema pending |
| Spatial assignment | property point, boundary version, method, confidence | Must preserve boundary version and ambiguity | Full persisted assignment contract not verified |

## Required missing-value semantics

Do not collapse these into numeric zero: OBSERVED_ZERO, MISSING, NOT_APPLICABLE, SUPPRESSED, UNAVAILABLE, STALE, UNDER_REVIEW, BLOCKED.

## Ownership rule

IRNI owns canonical geographic identity. Source/evidence registries own source facts and permissions. Radar's geospatial boundary-review records and product observations require an explicit storage owner before schema migration. Profile output is a composed read model.
