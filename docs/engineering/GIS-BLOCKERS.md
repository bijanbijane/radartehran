# Radar Tehran GIS Blockers

**Status date:** 2026-11-27

1. **No local execution runner in this session.** Source files were edited through GitHub Contents API. The authorized Desktop Commander MacBook was offline; the GitHub Actions query returned zero branch runs and the inspected commit had zero check-runs. Tests, typecheck and builds remain unexecuted.
2. **Canonical geography provider integration.** The NIPS/profile boundary contract requires an IRNI-owned, version-pinned, read-only geography provider. The existing branch records that the intended Worker Service Binding is not deployed/configured for the Radar API.
3. **NIPS durable storage.** NIPS persistence requires the database-owning IRNI Worker to expose a separately versioned and authenticated RPC. Do not add a direct Radar D1 binding or write into IRNI-owned `geo_*` tables.
4. **Authoritative data and licensing.** Production boundary and POI datasets, source references, licenses, retrieval dates and CRS metadata have not been assembled and verified by this work package.
5. **Topology validation is incomplete.** Strict interior-ring containment and hole-to-hole overlap/nesting checks are now implemented with tests, but tests are unexecuted and MultiPolygon component overlap/intersection remains open.
6. **Active-boundary integrity.** Duplicate active versions within one entity history are not yet consistently rejected by durable snapshot validation and all read paths.
7. **CI diagnostic availability.** PR-triggered checks for branch commits `ee1e5b259dea69809545eacc9dbf0b6991ae70a4` and `825fde0c4095361c7f9a08827746684bc8ee0421` reported failures in the path-detect, TypeScript/unit/build, D1/Worker binding, IRNI RPC and native-auth jobs; dependent frontend/contracts/API/E2E gates were skipped. GitHub job-log retrieval returned `BlobNotFound`, so the root cause and whether GIS tests actually started cannot be established. Treat CI as FAILED / UNDIAGNOSED, not as a GIS regression diagnosis.

No production deployment, remote migration, live binding change, secret change or paid service activation was performed.
