# Radar Tehran GIS Test Register

**Status date:** 2026-11-27

## Registered commands

| Command | Coverage | Current status in this session |
|---|---|---|
| `npm run test:geospatial` | New valuation assignment tests; existing GIS module tests; neighborhood-profile boundary evidence tests; boundary approval regression | NOT VERIFIED on HEAD `2d6c707303dc2e48723c3a8869e59984199c9608` — latest dedicated GIS jobs failed with no step metadata and logs unavailable |
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


## MultiPolygon component regression additions

- Distinct components with overlapping filled areas must report `MULTIPOLYGON_COMPONENT_OVERLAP`.
- Components sharing/touching a boundary must report `MULTIPOLYGON_COMPONENT_OVERLAP`.
- Disjoint components are accepted.
- A separate component fully contained in another component's valid hole is accepted.
- These additions are committed but are not marked passed until the dedicated GitHub Actions workflow completes successfully.

## Dedicated CI

`.github/workflows/gis-spatial-integrity.yml` runs `npm run test:geospatial` and `npm run typecheck` independently. The broader repository workflows have been failing before exposing step-level logs; the focused workflow is intended to isolate GIS regressions from unrelated backend/auth/Worker gates.


## Dedicated GIS workflow — exact HEAD evidence

**Branch HEAD:** `24e4c66af8c67195b46f7d3878d1cc846b6bdf8c`  
**Workflow run:** `45979096386` — `GIS Spatial Integrity` — FAILURE

| Job | Job ID | Result | Evidence |
|---|---:|---|---|
| GIS module TypeScript typecheck | 140438143889 | FAILURE | No step metadata; log retrieval `BlobNotFound` |
| GIS geometry and boundary regression | 140438144408 | FAILURE | No step metadata; log retrieval `BlobNotFound` |

The checks are failed, but no evidence identifies whether the underlying commands executed. Do not report the GIS suite or TypeScript check as passing or as a confirmed code-level test failure until rerun with accessible logs. The other repository CI workflows at the same HEAD also concluded failure.


## Current PR HEAD — `039ad4f17d70042f83cd67754a4f22b049ccd1c3`

| Trigger | Run ID | Job | Job ID | Conclusion |
|---|---:|---|---:|---|
| Push | 45979357361 | GIS module TypeScript typecheck | 140439007297 | FAILURE |
| Push | 45979357361 | GIS geometry and boundary regression | 140439007696 | FAILURE |
| Pull request | 45979368572 | GIS module TypeScript typecheck | 140439046307 | FAILURE |
| Pull request | 45979368572 | GIS geometry and boundary regression | 140439046895 | FAILURE |

Every job record has `steps=null`; log retrieval returns `BlobNotFound`. The broader repository workflows at this HEAD also failed before exposing usable steps. It is not established whether checkout, dependency installation, GIS tests or typecheck began. Keep both focused checks **NOT VERIFIED** until rerun with usable diagnostics.


## Current code revision — `76b27e99840dcd486375c5fb5be76e85027ec041`

| Workflow | Run ID | Job | Job ID | Result |
|---|---:|---|---:|---|
| GIS Spatial Integrity (pull request) | 45980072524 | GIS module TypeScript typecheck | 140441432099 | FAILURE, no steps |
| GIS Spatial Integrity (pull request) | 45980072524 | GIS geometry and boundary regression | 140441432442 | FAILURE, no steps |
| Path-Filtered Checks | 45980072523 | detect | 140441432615 | FAILURE, downstream gates skipped |

Log retrieval for the focused GIS jobs returned `BlobNotFound`. A failed check with no step metadata does not establish that `npm ci`, `npm run typecheck` or `npm run test:geospatial` started. These checks remain **NOT VERIFIED**, not passed and not a confirmed assertion failure.

### Newly added recovery and boundary-read-model coverage

- Persisted recovery rejects duplicate ACTIVE boundary histories, key/entity mismatch, malformed history and record values, and invalid version sequences.
- Validation includes histories beyond the former first-50 entity and first-20-version slices.
- Bbox overlap diagnostics skip duplicate-ACTIVE entity histories rather than selecting the first record.
- Tests are committed but remain unexecuted until the focused workflow can expose usable diagnostics.


## Durable snapshot integrity additions — 2026-11-27

- Canonical persisted Polygon/MultiPolygon geometry is revalidated during snapshot recovery using the same spatial topology validator.
- Persisted bounding boxes are recomputed from canonical geometry and must match within 1e-6 degrees; plausible but stale boxes are rejected.
- Persisted simplified geometry is independently validated before a snapshot can be activated.
- Regression cases cover an unclosed canonical ring, a stale/mismatched bounding box (which must block recovery), and malformed simplified geometry.
- Status: committed, NOT RUN / NOT VERIFIED. Exact-head GIS jobs failed without exposing steps; job logs returned BlobNotFound.


## Latest exact-HEAD verification — `1ccf9411a4d945fcd4baad0ec11ac7b956b16382`

| Run | Attempt | Job | Job ID | Result |
|---|---:|---|---:|---|
| 45980564390 | 1 | GIS geometry and boundary regression | 140443084579 | FAILURE; steps unavailable |
| 45980564390 | 1 | GIS module TypeScript typecheck | 140443084890 | FAILURE; steps unavailable |
| 45980564390 | 2 (rerun) | GIS module TypeScript typecheck | 140443495137 | FAILURE; steps unavailable |
| 45980564390 | 2 (rerun) | GIS geometry and boundary regression | 140443495590 | FAILURE; steps unavailable |

GitHub log retrieval remains unavailable. Issue #49 records a matching hosted-runner allocation failure pattern on both project repositories, but the current job records do not expose runner IDs. Treat runner allocation as suspected, not confirmed. Both focused checks remain **NOT VERIFIED**; there is no passing evidence.


## Additional consumer regression coverage — 2026-11-27

- Valuation rejects missing/invalid boundary version identity instead of synthesizing a version.
- Spatial market summary returns null boundary version metadata when no unique ACTIVE boundary is present.
- A sub-neighborhood edge point does not inherit a sub-neighborhood ID and does not qualify for valuation interior assignment.
- Branch HEAD reviewed: `2d6c707303dc2e48723c3a8869e59984199c9608`. CI failure remains undiagnosed because GitHub exposes no job steps and logs are unavailable.


## Sub-neighborhood edge regression — latest HEAD `2d6c707303dc2e48723c3a8869e59984199c9608`

- A point strictly inside a parent neighborhood but exactly on the edge of a matched sub-neighborhood must be classified `RESOLVED_ON_EDGE`.
- The resolver must not emit the sub-neighborhood ID for that edge match.
- Valuation feature generation must reject the non-interior result.
- Dedicated workflow run `45980848999`: GIS regression job `140444049218` and typecheck job `140444048835` concluded FAILURE; both expose no steps and logs return `BlobNotFound`. The regression is committed but NOT VERIFIED.
- Retry of previous GIS run `45980295987` also failed (new job IDs `140442697746`, `140442699939`) with empty steps and unavailable logs.
