# Radar Tehran GIS Next Actions

**Updated:** 2026-11-27  
**Active branch:** `feat/gis-spatial-integrity-2026-11-27`  
**Review PR:** [#72 — Draft](https://github.com/bijanbijane/radartehran/pull/72)

1. Restore an online runner and usable GitHub Actions logs. Re-run `npm run test:geospatial` and `npm run typecheck` on code revision `76b27e99840dcd486375c5fb5be76e85027ec041`; identify the first real failing step before changing code. Then rerun `npm run test:unit`, lint, architecture checks, repository typechecks and build. Do not mark the work VERIFIED until exact-SHA checks pass.
2. Audit every consumer of `resolvePointToGeography`. Align the meaning of `resolved` with `RESOLVED_ON_EDGE` and `AMBIGUOUS_OVERLAP`; do not let non-valuation consumers use an arbitrary hood ID.
3. Persisted snapshot validation now rejects multiple ACTIVE versions, malformed histories/records, key/entity mismatch, duplicate boundary IDs and non-monotonic version sequences; bbox diagnostics skip multi-active histories. Next, verify the validator against actual hydrated durable snapshots and audit every remaining resolver consumer and explicit legacy-history remediation path.
4. Run the newly added hole-topology and MultiPolygon component regression tests through `.github/workflows/gis-spatial-integrity.yml`. The component validator now rejects touching/intersecting/overlapping components and permits a separate component inside a valid hole. Then audit collinear ring-touch and malformed-component fixtures.
5. Complete CRS policy and transformations from source metadata. Verify Tehran measurement CRS against actual source datasets before choosing a projected EPSG code; do not infer a universal city CRS.
6. Formalize source registry records including authority, licensing, provenance, retrieval date, coverage, checksum, coordinate reference system and validation status.
7. Reconcile GIS runtime persistence with the NIPS ownership model: IRNI remains canonical geography owner; NIPS profile persistence belongs in the proposed dedicated `radar-profile-db`, shared by the two NIPS backend implementations and separate from IRNI, USER_DB and RESEARCH_DB. Do not add `nips_*` tables to `radar-neighborhood-db`. Confirm owner/writer policy before provisioning.
8. Use validated GeoJSON plus indexed bounding-box prefilters as the D1 baseline. Prove RTree support in an isolated Worker/D1 test before adopting it; the REST API probe did not establish runtime support.
9. Build a repeatable staged ingestion path with idempotency, validation, invalid-record isolation, import logs, source tracking and rollback/recovery tests.
10. Only after staging verification and explicit authorization, plan any production binding, database creation, migration or deployment changes.
