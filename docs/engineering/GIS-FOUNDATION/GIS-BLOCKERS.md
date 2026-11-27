# GIS Blockers

| ID | Severity | Blocker | Exit condition |
|---|---|---|---|
| GIS-BLK-001 | Critical | Express profile read model has no authenticated, version-pinned bridge to IRNI Worker identity RPC | Authenticated Worker/API contract; revision/checksum validated; fail-closed tests |
| GIS-BLK-002 | Critical | Trusted source-registry resolver is missing | Resolver backed by authoritative source registry and license/authority metadata |
| GIS-BLK-003 | High | Boundary approval route lacks production admin authorization dependencies | Injected verifier/store and independent reviewer tests |
| GIS-BLK-004 | High | IRNI neighborhood records are point-only; verified neighborhood polygons are unavailable | Source-verified polygons with explicit CRS, provenance and review |
| GIS-BLK-005 | High | D1 RTree runtime support is unverified | Non-destructive D1 Worker runtime probe and bounded query test |
| GIS-BLK-006 | Medium | Geometry topology validation is incomplete for hole intersections and MultiPolygon overlaps | Added deterministic fixtures and tests |
| GIS-BLK-007 | High | Radar geospatial state uses JSON repository snapshots, not relational D1; storage owner and migration boundary unresolved | Explicit ownership, retention, auth, migration/rollback decision |

Do not bypass blockers with local static geography, guessed source metadata, synthetic polygons, direct IRNI D1 access or unauthenticated public endpoints.
