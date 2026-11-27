# Radar Tehran GIS Next Actions

**Updated:** 2026-11-27  
**Active branch:** `feat/gis-spatial-integrity-2026-11-27`

1. First obtain an online runner and execute `npm run test:geospatial` on this exact branch. Then run `npm run test:unit`, lint, architecture checks, typechecks and builds. Resolve failures before marking the work VERIFIED.
2. Audit every consumer of `resolvePointToGeography`. Align the meaning of `resolved` with `RESOLVED_ON_EDGE` and `AMBIGUOUS_OVERLAP`; do not let non-valuation consumers use an arbitrary hood ID.
3. Add durable integrity checks for one active boundary per entity, unique version/id sequences, and entity/history key consistency. Fail closed on ambiguous persisted state.
4. Run the newly added hole-topology regression tests. Then complete polygon topology validation for distinct MultiPolygon component overlap/intersection and invalid component relationships; add trusted fixtures.
5. Complete CRS policy and transformations from source metadata. Verify Tehran measurement CRS against actual source datasets before choosing a projected EPSG code; do not infer a universal city CRS.
6. Formalize source registry records including authority, licensing, provenance, retrieval date, coverage, checksum, coordinate reference system and validation status.
7. Reconcile the GIS runtime persistence path with the approved ownership model. Keep IRNI geography read RPC separate from authenticated NIPS storage RPC; do not make Radar a direct writer to the shared IRNI D1.
8. Build a repeatable staged ingestion path with idempotency, validation, invalid-record isolation, import logs, source tracking and rollback/recovery tests.
9. Only after staging verification and explicit authorization, plan any production binding, migration or deployment changes.
