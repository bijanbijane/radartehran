# Dependency Security Audit — 2026-11-27

## Evidence

Source: Cloudflare Workers Build audit command on the pre-remediation dependency graph, build `f993d88e-1b92-4e41-9f62-83b1c3ea34b4`.

`npm audit --json` reported **21 vulnerabilities** across 862 installed dependency nodes:

| Severity | Count |
|---|---:|
| Critical | 2 |
| High | 5 |
| Moderate | 14 |
| Low | 0 |

## Direct dependency findings and actions

| Direct package | Audited version/range | Finding | Action |
|---|---|---|---|
| `vitest` | `3.2.7` (manifest `^3.0.8`) | Critical: vulnerable Vitest/@vitest/mocker and Tinypool dependency chain; npm fix target `5.1.2` is a major upgrade. | Updated root manifest to `^5.1.2`; regenerated lock resolves Vitest and `@vitest/mocker` to `5.1.2`. Runtime tests still pending. |
| `sharp` | `0.33.5` (manifest `^0.33.5`) | High: inherited libvips/libheif/librsvg vulnerabilities (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591, CVE-2026-96889; GHSA-g89c-p67h-r497, GHSA-2jg2-4ch7-h545). | Updated root and `apps/api` manifests to `^0.35.5`; regenerated lock resolves Sharp to `0.35.5`. Runtime/media tests still pending. |
| `firebase` | `^12.12.0` | High through `@firebase/firestore`, `@firebase/firestore-compat` and `@grpc/grpc-js`. npm's suggested `9.14.0` fix is a major-version downgrade and is not accepted. | Not changed. Remove through the existing Cloudflare-native retirement/migration after active imports and data paths are replaced. |
| `firebase-admin` | `^13.7.0` | Moderate transitive findings in `@google-cloud/firestore`, `@google-cloud/storage`, `google-gax`, `retry-request`, `teeny-request` and `uuid`. npm suggests `14.5.1` (major). | Not changed. Retire Firestore-backed modules and then remove the package; do not blindly upgrade or preserve a second identity/data plane. |

## Other transitive findings

- `@grpc/grpc-js` high: GHSA-m9gg-hp2v-232j and GHSA-f596-whhp-79r4.
- `@typescript-eslint/parser`, `@typescript-eslint/rule-tester`, `@typescript-eslint/typescript-estree`, `@typescript-eslint/utils`, `minimatch`, `gaxios`, `google-gax`, `retry-request`, `teeny-request`, and `uuid`: moderate findings.
- The pre-remediation report's exact `fixAvailable` values are preserved in build logs; no `npm audit fix --force` was run.

## Remediation branch

- Branch: `fix/security-deps-audit-2026-11-27`
- Draft PR: #80, stacked on Draft PR #70.
- Root `vitest`: `^5.1.2`.
- Root and `apps/api` `sharp`: `^0.35.5`.
- Lockfile generated using npm 10.9.2 in Cloudflare's build environment; lockfile v3 and manifest consistency were verified. Resolved `vitest=5.1.2`, `@vitest/mocker=5.1.2`, `sharp=0.35.5`.
- Added `scripts/ci/verify-security-dependencies.sh` to run npm ci, npm audit, typecheck, architecture, security/auth, Cloudflare/D1, triad, storage, Vitest and frontend build checks.

## Verification status

- Dependency manifest/lockfile consistency: **COMPLETED_AND_VERIFIED**.
- Typecheck, architecture, auth, Cloudflare/D1, storage, Vitest and build checks: **IN_PROGRESS**. Cloudflare build `433532e7-7cd4-4608-9691-7a081052dfe2` is queued; no test pass is claimed.
- GitHub Actions: runner allocation remains unavailable (empty steps / `BlobNotFound` job logs).
- Firebase/Firestore vulnerabilities remain an open retirement workstream, not silently accepted as fixed.


## Post-remediation audit result

Cloudflare verification build `433532e7-7cd4-4608-9691-7a081052dfe2` completed dependency installation (`npm ci`, 587 packages) and ran `npm audit --json` after the lockfile update:

| Severity | Before | After |
|---|---:|---:|
| Critical | 2 | 0 |
| High | 5 | 4 |
| Moderate | 14 | 8 |
| Total | 21 | 12 |

The Vitest/Tinypool critical findings and Sharp high findings are absent from the post-remediation audit. The remaining four High findings are the Firebase/Firestore chain: `firebase`, `@firebase/firestore`, `@firebase/firestore-compat`, and `@grpc/grpc-js`. The eight Moderate findings remain primarily under `firebase-admin` and its Google Cloud transitive dependencies.

The verification build has reached `npm run typecheck` (`tsc --noEmit`) and remains running. No typecheck, test-suite or build result is claimed yet.


## Test-runner compatibility correction

The first verification build `433532e7-7cd4-4608-9691-7a081052dfe2` passed npm ci, typecheck, architecture, security, auth, Cloudflare/D1, triad and storage checks, then failed in `npm run test:vitest`:

- 83 files failed with `No test suite found in file`; 1 Vitest file passed.
- Root cause: `vitest.config.ts` included `src/**/*.test.ts`, but those source tests import Node's `node:test` API, not Vitest. The repository already runs these files through `tsx --test` in `npm run test:unit`.
- Correction: removed the broad `src/**/*.test.ts` Vitest include; retained `tests/neighborhood-insights.test.ts` and `tests/**/*.vitest.test.ts`. Added `npm run test:unit` to the verification script before `npm run test:vitest`.
- Second verification build `202a7a41-4c8a-4547-bb2d-98160c8b82a3` is queued against commit `8215606f0de0136cd89933030c040ace4c378532`.

This is a test-discovery correction; Vitest 5.1.2 remains in place. No test pass is claimed until the second build completes.
