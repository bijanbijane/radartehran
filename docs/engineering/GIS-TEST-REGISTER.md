# Radar Tehran GIS Test Register

**Status date:** 2026-11-27

## Registered commands

| Command | Coverage | Current status in this session |
|---|---|---|
| `npm run test:geospatial` | New valuation assignment tests; existing GIS module tests; neighborhood-profile boundary evidence tests; boundary approval regression | Registered; NOT RUN by this session |
| `npm run test:unit` | Existing unit gates plus `test:geospatial` | Updated to include geospatial suite; NOT RUN by this session |
| `npm run lint` | Repository lint | NOT RUN |
| `npm run arch:check` | Architecture rules | NOT RUN |
| `npm run build` | Production build | NOT RUN |
| `npx tsc --noEmit` / workspace typechecks | Static typing | NOT RUN |

## Geospatial test files

- `tests/geospatial-valuation-location-assignment.test.ts` — no-boundary fallback, unique interior assignment, caller-ID mismatch, point on edge, overlapping neighborhoods, city mismatch, polygon holes, ring closure, hole containment, boundary contact, hole overlap and nesting.
- `tests/geospatial-gis-module.test.ts` — coordinate normalization, polygon validation, boundary versions, point resolution, overlap classification, spatial search, POIs, imports and overlays.
- `tests/neighborhood-profile-boundary-read-model.test.ts` — identity/source resolver, CRS, geometry digest and independent-review requirements.
- `tests/geospatial-boundary-approval.test.ts` — pending boundary cannot become active without approval.

## Verification rule

Source changes and registered tests are not proof of correctness until the command has actually executed successfully on the branch. CI results must be tied to the exact commit SHA. No production dataset or database was modified by these tests.


## Latest unexecuted additions

The 2026-11-27 increment adds explicit assertions for `HOLE_OUTSIDE_OUTER` and `HOLE_OVERLAP`. These tests are committed on the GIS branch but remain NOT RUN. The exact verification command remains `npm run test:geospatial`.
