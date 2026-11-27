# GIS Test Register

| Test | Purpose | Repository status | Executed this session |
|---|---|---|---|
| `tests/cloudflare-neighborhood-boundary-route.test.ts` | Confirms fallback geometry is labelled approximate/non-official and rejects malformed requests | Existing | No |
| `tests/neighborhood-profile-boundary-read-model.test.ts` | Checks missing boundary, independent review, identity/source resolver gates, geometry hash, API fail-closed behavior, and computed fallback rejection | Existing + new regression | No |
| `server/modules/geography/__tests__/employee18Geography.test.ts` | Checks CRS transformations, swapped coordinates and geometry validation | Existing | No |

## Required additions

- Hole ring crossing/touching exterior and other holes.
- MultiPolygon component overlap and duplicate component geometry.
- Point exactly on polygon edge and vertex; explicit boundary ambiguity policy.
- Cross-neighborhood polygon overlap/gap diagnostics using verified source fixtures.
- Explicit exclusion of `computed_hex_fallback` from profile evidence and property assignment.
- Property assignment provenance: coordinates, coordinate source, confidence, boundary version, method and manual correction.
- Idempotent dataset import and invalid-record quarantine.
- Actual D1 Worker-binding capability test for RTree, run only against disposable/staging resources.

No test command was run in this session; do not infer passing status from test source inspection.
