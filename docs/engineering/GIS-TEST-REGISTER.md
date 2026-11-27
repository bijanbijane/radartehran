# Radar Tehran GIS Test Register

**Status date:** 2026-11-27

## Registered commands

| Command | Coverage | Current status in this session |
|---|---|---|
| `npm run test:geospatial` | New valuation assignment tests; existing GIS module tests; neighborhood-profile boundary evidence tests; boundary approval regression | Registered; NOT VERIFIED on HEAD b2c7265fda504af48726a19317c420058efbeef7 — workflow failures are confirmed, but GIS test execution is not |
| `npm run test:unit` | Existing unit gates plus `test:geospatial` | Updated to include geospatial suite; NOT RUN by this session |
| `npm run lint` | Repository lint | NOT RUN |
| `npm run arch:check` | Architecture rules | NOT RUN |
| `npm run build` | Production build | NOT RUN |
| `npx tsc --noEmit` / workspace typechecks | Static typing | NOT RUN |

## Geospatial test files

- `tests/geospatial-valuation-location-assignment.test.ts` — no-boundary fallback, unique interior assignment, caller-ID mismatch, point on edge, overlapping neighborhoods, city mismatch, polygon holes, ring closure, hole containment, boundary contact, hole overlap and nesting.
- `tests/geospatial-gis-module.test.ts` — coordinate normalization, polygon validation, boundary versions, point resolution, overlap classification, spatial search, POIs, imports and overlays.
- `tests/neighborhood-profile-boundary-read-model.test.ts` — identity/source resolver, CRS, geometry digest, independent-review requirements and exactly-one-active boundary selection.
- `tests/geospatial-boundary-approval.test.ts` — pending boundary cannot become active without approval; duplicate active histories cannot be auto-replaced and can be repaired only through independent pending approval.

## Verification rule

Source changes and registered tests are not proof of correctness until the command has actually executed successfully on the branch. CI results must be tied to the exact commit SHA. No production dataset or database was modified by these tests.


## Latest unexecuted additions

The 2026-11-27 increment adds explicit assertions for `HOLE_OUTSIDE_OUTER` and `HOLE_OVERLAP`. These tests are committed on the GIS branch but remain NOT RUN. The exact verification command remains `npm run test:geospatial`.


## CI evidence (2026-11-27)

- PR-triggered runs associated with `ee1e5b259dea69809545eacc9dbf0b6991ae70a4` and `825fde0c4095361c7f9a08827746684bc8ee0421` returned failed check conclusions.
- The path-detect, broad TypeScript/unit/build, D1/Worker binding, IRNI RPC and native-auth jobs failed; dependent frontend/contracts/API/E2E gates were skipped.
- GitHub job-log retrieval returned `BlobNotFound`. No test is recorded as passed, and it is not established that the GIS test command actually ran.


## Exact-SHA CI evidence — 2026-11-27

**Branch HEAD:** `b2c7265fda504af48726a19317c420058efbeef7`

| Workflow | Run ID | Result | Relevant job |
|---|---:|---|---|
| Tehran Radar Path-Filtered Checks | 45978860143 | FAILURE | `detect` failed; contracts/API/frontend jobs skipped |
| Tehran Radar CI Quality Gates | 45978860142 | FAILURE | TypeScript/Architecture/Unit/Storage/Stress/Build failed; Playwright skipped |
| Radar Backend Triad & Frontend Service Binding | 45978860503 | FAILURE | D1/Worker binding job failed |
| Cloudflare Native Auth Validation | 45978860128 | FAILURE | `native-auth` failed |
| IRNI Geographic RPC Consumer Contract | 45978860069 | FAILURE | `irni-rpc-contract` failed |

GitHub log retrieval returned `BlobNotFound`. The current Desktop Commander device is offline. It is not established whether any workflow reached an actual test step. Consequently `npm run test:geospatial`, typecheck, lint, architecture checks and build remain NOT VERIFIED.
