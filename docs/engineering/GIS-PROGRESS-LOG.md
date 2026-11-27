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
- Polygon structural validation checks every ring for closure, coordinate validity, zero area and per-ring self-intersection; this session additionally added strict hole containment and rejection of touching, crossing, overlapping or nested interior rings.
- Added regression coverage and registered `npm run test:geospatial` in `npm run test:unit`.

### Verification state

- GitHub Contents API confirms commits were written to the dedicated branch.
- No local npm, typecheck, lint or build command has been run in this session. The Desktop Commander device was offline; GitHub Actions returned no runs for the branch and no check-runs for the inspected commit.
- CI must be checked against the final branch commit SHA; until then, this work remains IMPLEMENTED / NOT VERIFIED.
- No live database, production geometry, binding, secret, Worker or deployment was changed.


### Follow-up committed in the same GIS increment

- Added validation codes `HOLE_OUTSIDE_OUTER` and `HOLE_OVERLAP`.
- Added regression cases for an exterior-escaping hole, a hole touching the exterior, overlapping holes and nested holes.
- Updated `GIS-ARCHITECTURE.md`, `GIS-DATA-DICTIONARY.md`, `GIS-SOURCE-REGISTER.md`, and the GIS execution/quality registers.
- These additional tests are committed but remain NOT RUN. No passing status is claimed.


## 2026-11-27 — Duplicate ACTIVE boundary lifecycle integrity

**Branch HEAD reviewed:** `b2c7265fda504af48726a19317c420058efbeef7`  
**Review PR:** [#72 — Draft](https://github.com/bijanbijane/radartehran/pull/72)

### Changes committed

- Point resolution now returns `MULTIPLE_ACTIVE_BOUNDARY_VERSIONS` and no neighborhood assignment when a query point intersects an entity history containing more than one ACTIVE version.
- Profile boundary selection now returns no selected boundary unless exactly one ACTIVE version exists.
- Auto-approved writes are rejected when a history already contains multiple ACTIVE versions.
- The safe remediation path is retained: submit a `PENDING_REVIEW` version, then require an independent reviewer; approval supersedes all previous ACTIVE versions in that entity history.
- Regression tests cover point-resolution failure, refusal of arbitrary profile reads, blocked auto-approval, and independent repair.

### Verification

- Source and regression test files were re-fetched from the branch after the updates.
- For exact HEAD `b2c7265fda504af48726a19317c420058efbeef7`, the Path-Filtered Checks, CI Quality Gates, Backend Triad/Worker Binding, Native Auth, and IRNI RPC workflows report `failure`.
- Dependent contract/API/frontend/E2E jobs were skipped. GitHub job-log retrieval returned `BlobNotFound`; therefore it is not established that the GIS test command executed.
- The authorized MacBook/Desktop Commander device is offline. No local npm/typecheck/lint/build command was run.
- Automated GIS tests remain **NOT VERIFIED**; no passing test result is claimed.

### Remaining work

- Validate legacy snapshots during hydration and add complete integrity checks for entity/history key agreement, unique version IDs, monotonic version sequences, and one ACTIVE record per entity.
- Audit every point-resolution consumer and add an explicit profile-read reason for duplicate active history.
- Implement tests for overlapping MultiPolygon components; execute endpoint-touch and collinear-overlap fixtures for segment intersection changes.
- No production database, geometry dataset, Worker binding, secret, or deployment was modified by this work package.


## 2026-11-27 — Exact-HEAD GIS workflow result

**Branch HEAD:** `24e4c66af8c67195b46f7d3878d1cc846b6bdf8c`  
**Code revision:** `f601b15715d2221c4b7a48d016f9350fcd685d25`

- The dedicated `GIS Spatial Integrity` workflow run `45979096386` concluded `failure`.
- Job `140438143889` (`GIS module TypeScript typecheck`) concluded `failure`.
- Job `140438144408` (`GIS geometry and boundary regression`) concluded `failure`.
- Both job records exposed no steps; downloading either log returned `BlobNotFound`.
- The result is a failed CI check, not a verified assertion failure. The available evidence does not identify whether setup/runner allocation failed or whether the commands ran and failed.
- The device is offline; no local rerun is possible in this session. GIS regression and typecheck status remain **NOT VERIFIED** pending a rerun with accessible logs.


## 2026-11-27 — Current PR head and repeated GIS workflow result

**Branch / PR HEAD:** `039ad4f17d70042f83cd67754a4f22b049ccd1c3`  
**Code revision:** `039ad4f17d70042f83cd67754a4f22b049ccd1c3`  
**Review:** [Draft PR #72](https://github.com/bijanbijane/radartehran/pull/72)

- The latest code commit `fix(gis): narrow multipolygon outer ring guards` narrows guards before reading exterior rings and uses the validated ring variables for containment checks.
- The current PR description records the broader MultiPolygon component topology behavior: reject touching/intersecting components and overlapping filled interiors, while permitting a separate component contained within another component's valid hole.
- Dedicated GIS push run `45979357361` and PR run `45979368572` both concluded failure for both GIS jobs: module TypeScript typecheck and geometry/boundary regression.
- All four job records expose `steps=null`; GitHub log retrieval returned `BlobNotFound`. Broader PR workflows also concluded failure with no step metadata.
- These are confirmed failed workflow conclusions, not evidence of which command/assertion failed. GIS tests and typecheck remain **NOT VERIFIED**. No passing result is claimed.
- PR #72 remains Draft/open. No merge or production modification occurred.


## 2026-11-27 — Durable boundary-history integrity and bbox diagnostics

**Code revision:** `76b27e99840dcd486375c5fb5be76e85027ec041`  
**Review:** [Draft PR #72](https://github.com/bijanbijane/radartehran/pull/72)

- Persisted snapshot validation now scans every boundary history rather than only the first fixed subset.
- It rejects non-array histories, non-object boundary records, history-key/entity-ID mismatch, duplicate boundary IDs, invalid/duplicate/non-monotonic version sequences, and more than one ACTIVE record per entity.
- Record counting was made defensive for malformed persisted structures so validation can return a controlled error report instead of throwing while counting.
- Boundary bbox overlap diagnostics now use an entity history only when it has exactly one ACTIVE record; corrupt histories are not reduced to an arbitrary first version.
- Regression tests were added for duplicate ACTIVE snapshot recovery, entity mismatch, malformed histories/records, late malformed history, long version histories, and ambiguous-history exclusion in bbox diagnostics.
- Exact-head GIS PR run `45980072524`: both typecheck and geometry/boundary regression jobs failed with `steps=null`; log retrieval returned `BlobNotFound`. Path-filtered detection also failed. It is not established whether any test command executed; results remain **NOT VERIFIED**.


## 2026-11-27 — Durable snapshot geometry integrity

- Audit found that snapshot recovery validated boundary IDs, lifecycle, versions and bbox ranges, but did not validate canonical geometry, simplified geometry, or prove that the persisted bbox matched the canonical polygon. A plausible stale bbox could hide a polygon during point lookup.
- Added canonical Polygon/MultiPolygon topology validation during recovery, bounding-box recomputation/equality check (1e-6 degree tolerance), and simplified geometry validation.
- Added regression tests for invalid canonical geometry, stale bbox, and invalid simplified geometry; a stale bbox must block recovery.
- Exact branch HEAD: `9da716fdd87d4ba412eb4c916076749a4a7fb4a8`.
- GitHub GIS push/PR jobs again reported failure with `steps=null`; logs unavailable (`BlobNotFound`). The tests and typecheck remain NOT VERIFIED. No production data or deployment was changed.


## 2026-11-27 — Latest PR head and GIS retry

**Branch / PR HEAD:** `1ccf9411a4d945fcd4baad0ec11ac7b956b16382`  
**Latest code revision:** `76b27e99840dcd486375c5fb5be76e85027ec041` (the latest branch commit is documentation-only)

- Reviewed the current durable recovery validator: it scans every boundary history; rejects malformed history/record shapes, key/entity mismatches, duplicate boundary IDs, duplicate/non-increasing version sequences, multiple ACTIVE versions, invalid canonical and simplified polygon geometry, and bbox/geometry mismatches.
- The focused GIS workflow run `45980564390` failed on both GIS jobs. A rerun (attempt 2) also failed: jobs `140443495137` and `140443495590`, each with `steps=null`; job logs remain unavailable.
- Open issue [#49](https://github.com/bijanbijane/radartehran/issues/49) documents the same hosted-runner failure pattern across Radar and IRNI, including earlier jobs with `runner_id=0` and zero steps. The current GIS job records do not expose runner metadata, so runner allocation is the leading hypothesis, not a proven diagnosis for these exact attempts.
- The GIS test suite and typecheck remain **NOT VERIFIED**. No test is claimed as passing.
- PR #72 remains Draft/open. No merge, deployment, production binding change or data mutation occurred.
