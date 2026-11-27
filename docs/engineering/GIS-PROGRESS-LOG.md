# Radar Tehran GIS Progress Log

## 2026-11-27 — First GIS integrity work package

**Repository:** `bijanbijane/radartehran`  
**Base:** `main` at `456dcacb387b908797756863b10da1f7104b658e`  
**Branch:** `feat/gis-spatial-integrity-2026-11-27`

### Verified during source inspection

- Production geospatial service is mounted by the API under `/api/v1/geospatial`.
- The runtime has versioned boundary records, canonical geometry, simplified geometry, bbox, source token, reviewer metadata, geometry digest and CRS field.
- GeoJSON tuples are `[longitude, latitude]`; service coordinate objects are `{lat, lng}`.
- Point resolution reports outside, edge and overlap statuses.
- Valuation feature generation previously fell back from geometric resolution to request-supplied `hoodId`, then to hardcoded `1`, and accepted edge/overlap statuses.
- Polygon classification previously inspected exterior rings only; interior rings were ignored.
- The current geospatial persistence path uses atomic JSON/durable snapshots; this is not a verified D1 spatial adapter.
- Canonical registry and NIPS storage ownership constraints are documented in the repository's NIPS implementation tracker.

### Changes committed to this GIS branch

- Valuation location features now require a uniquely resolved point strictly inside a neighborhood boundary.
- A caller-provided `hoodId` is only a consistency assertion and cannot substitute for geometric resolution.
- City mismatch, missing boundary, edge, overlap and missing neighborhood identity fail with HTTP 409 conflict.
- Polygon point classification now respects interior rings and MultiPolygon components.
- Polygon structural validation now checks every ring for closure, coordinate validity, zero area and per-ring self-intersection.
- Added regression coverage and registered `npm run test:geospatial` in `npm run test:unit`.

### Verification state

- GitHub Contents API confirms commits were written to the dedicated branch.
- No local npm, typecheck, lint or build command has been run in this session.
- CI must be checked against the final branch commit SHA; until then, this work remains IMPLEMENTED / NOT VERIFIED.
- No live database, production geometry, binding, secret, Worker or deployment was changed.
