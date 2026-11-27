# Radar Tehran GIS Next Actions

**Updated:** 2026-11-27  
**Active branch:** `feat/gis-spatial-integrity-2026-11-27`  
**Review PR:** [#72 — Draft](https://github.com/bijanbijane/radartehran/pull/72)

1. Restore an online runner and obtain usable logs for GIS workflow run `45979096386`. Re-run `npm run test:geospatial` and `npm run typecheck` on HEAD `24e4c66af8c67195b46f7d3878d1cc846b6bdf8c`; investigate and resolve the failed checks before moving on. Then run `npm run test:unit`, lint, architecture checks, typechecks and builds. Resolve failures before marking the work VERIFIED.
2. Audit every consumer of `resolvePointToGeography`. Align the meaning of `resolved` with `RESOLVED_ON_EDGE` and `AMBIGUOUS_OVERLAP`; do not let non-valuation consumers use an arbitrary hood ID.
3. Complete persisted-snapshot and hydration validation for one ACTIVE boundary per entity, unique version/id sequences, entity/history key consistency, and explicit legacy-history reconciliation. Point resolution, profile reads and boundary mutations now fail closed for duplicate ACTIVE histories.
4. Run the newly added hole-topology and MultiPolygon component regression tests through `.github/workflows/gis-spatial-integrity.yml`. The component validator now rejects touching/intersecting/overlapping components and permits a separate component inside a valid hole. Then audit collinear ring-touch and malformed-component fixtures.
5. Complete CRS policy and transformations from source metadata. Verify Tehran measurement CRS against actual source datasets before choosing a projected EPSG code; do not infer a universal city CRS.
6. Formalize source registry records including authority, licensing, provenance, retrieval date, coverage, checksum, coordinate reference system and validation status.
7. Reconcile GIS runtime persistence with the NIPS ownership model: IRNI remains canonical geography owner; NIPS profile persistence belongs in the proposed dedicated `radar-profile-db`, shared by the two NIPS backend implementations and separate from IRNI, USER_DB and RESEARCH_DB. Do not add `nips_*` tables to `radar-neighborhood-db`. Confirm owner/writer policy before provisioning.
8. Use validated GeoJSON plus indexed bounding-box prefilters as the D1 baseline. Prove RTree support in an isolated Worker/D1 test before adopting it; the REST API probe did not establish runtime support.
9. Build a repeatable staged ingestion path with idempotency, validation, invalid-record isolation, import logs, source tracking and rollback/recovery tests.
10. Only after staging verification and explicit authorization, plan any production binding, database creation, migration or deployment changes.
