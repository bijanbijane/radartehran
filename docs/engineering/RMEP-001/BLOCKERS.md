# Backend Blockers — RMEP-001

Updated: 2026-11-27
Active branch: `feat/nips-backend-runtime-foundation-2026-11-26`
Latest inspected main: `456dcacb387b908797756863b10da1f7104b658e`
Active NIPS branch head: `9180bffe91577e9a53460fcf54e0058549813f0d`

## BLOCKED

### B-001 — GitHub Actions jobs fail before exposing executable steps
- PR: #67
- Latest observed workflow runs on head `9180bffe91577e9a53460fcf54e0058549813f0d`:
  - #45977620112 — Tehran Radar CI Quality Gates: FAILURE
  - #45977620069 — Path-Filtered Checks: FAILURE
  - #45977619999 — Backend Triad & Frontend Service Binding: FAILURE
  - #45977620151 — IRNI Geographic RPC Consumer Contract: FAILURE
  - #45977620040 — Cloudflare Native Auth Validation: FAILURE
- Root quality-gate job was rerun successfully as an API operation; rerun job ID `140435161931` also completed with FAILURE.
- GitHub returned an empty step list for the rerun job; downloading its logs returned `BlobNotFound`. No failing command or source-level root cause is currently observable.
- **Next:** inspect the same run/job in GitHub Actions UI or restore usable Actions log access. If it still has no runner/steps, diagnose repository Actions runner availability/configuration before changing application code. Do not guess the failing command.

### B-002 — Shared NIPS persistence provider
- The recorded owner decision is to reuse the existing physical `radar-neighborhood-db`, not create a fourth D1 database.
- Radar API must not receive a direct D1 binding to that database.
- Persistence must be exposed by the database-owning IRNI Worker through an authenticated, versioned NIPS storage RPC.
- **Next:** paired IRNI Worker RPC, owner-side migration, auth contract, request/response versioning, idempotency, and transactional CAS acceptance tests. Radar-side D1 access is prohibited.

### B-003 — Canonical identity/boundary provider
- The NIPS runtime requires confirmed canonical identity and reviewed boundary evidence.
- The recorded target is the version-pinned, read-only `IRNI_GEOGRAPHY` Service Binding.
- The intended `irni-api` service is not deployed and the binding is absent from the inspected live configuration.
- **Next:** verify the owner-side service deployment and implement a version-pinned provider boundary only after the service contract is available.

## Cross-PR build blockers
- PR #69 fixes the native-auth workflow's nonexistent npm script, but its Actions runs also fail without usable step evidence.
- PR #70 removes the stale Bun lockfile; its Actions runs also fail without usable step evidence. Cloudflare preview installation/build has not yet verified the change.
- Both PRs remain Draft; neither is merged.

## Explicitly not blockers
- Ordinary reversible branch code, test, and documentation changes require no additional user approval.
- Production deployment, destructive production database operations, irreversible data changes, secret rotation/disclosure, and paid-service activation remain approval-gated.
 

## CHK-197 update — 2026-11-27

- Active branch head after this checkpoint: `ee2023a59128a9bad17f37e144995b5a6d67bc1f`.
- A reproducible workflow defect was found: `.github/workflows/cloudflare-native-auth-validation.yml` invoked `npm run test:cloudflare-native-auth`, but root `package.json` has no such script. The existing `test:auth` script covers the required native-auth/OIDC/session suites. The workflow now invokes `npm run test:auth` (commit `eb76b22590c70dc81ddff2189fc1cca459099d8d`).
- A separate reproducible Cloudflare preview build defect was confirmed from PR #70's Cloudflare build evidence: the stale root `bun.lock` caused Cloudflare to select `bun install --frozen-lockfile` and fail because the lockfile did not match the npm workspace manifest. On this branch, `bun.lock` was removed and `.npmrc` was added with `legacy-peer-deps=true` (commits `dd28ff9aa9c2946a60ae9fbd34630ac4d6ad5c5f`, `ee2023a59128a9bad17f37e144995b5a6d67bc1f`). PR #70 independently carries the same remediation; no merge was performed.
- The five workflows on the new head `ee2023a59128a9bad17f37e144995b5a6d67bc1f` still conclude FAILURE. Their jobs expose empty/null step lists and log download returns `BlobNotFound`. Thus the workflow changes are committed but not CI-verified; the remaining Actions failure is still not attributable to an application command.
- No local test execution was available in this GitHub-only session. No migration, binding, secret, production deployment, or merge was performed.

**Next:** restore usable Actions runner/log evidence, then execute the NIPS, typecheck, architecture, auth, and D1 isolation suites in an executable environment. Do not guess at the remaining failure.
