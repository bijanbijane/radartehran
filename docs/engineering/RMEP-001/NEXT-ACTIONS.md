# Next Actions — RMEP-001 Backend

Updated: 2026-11-27
Active branch: `feat/nips-backend-runtime-foundation-2026-11-26`
PR: #67 (Draft)
Main baseline: `456dcacb387b908797756863b10da1f7104b658e`
Active branch head: `9180bffe91577e9a53460fcf54e0058549813f0d`

## Ordered execution queue

1. **Resolve Actions execution visibility.** Latest PR #67 runs #45977620112, #45977620069, #45977619999, #45977620151 and #45977620040 all concluded FAILURE. Rerunning the root quality-gate job succeeded as an API operation but produced another failed job (`140435161931`) with no steps and `BlobNotFound` logs. Inspect GitHub Actions UI/runner availability; do not patch application code without a reproducible command failure.
2. **Verify the NIPS domain foundation.** Run `npm run test:nips`, applicable TypeScript checks, architecture checks and security gates in an executable environment. Source presence and PR metadata do not count as test execution.
3. **Reconcile adjacent CI PRs.** PR #69 corrects the auth test script; PR #70 removes the stale Bun lockfile. Keep both Draft until GitHub Actions executes actual steps and Cloudflare preview install/build confirms npm selection and successful builds.
4. **Implement the paired IRNI NIPS storage RPC.** This is owner-side work in `bijanbijane/Iran-Neighborhood-Intelligence`: version pinning, service authentication, least-privilege operations, request validation, idempotency, bounded payloads and transactional publication activation.
5. **Implement the Radar adapter.** Keep the domain boundary runtime-neutral. Radar must call the IRNI storage RPC; it must not bind directly to the shared IRNI D1 database.
6. **Add migration and adapter tests.** Use the approved `migrations/neighborhood-d1` ownership path; verify immutable snapshots, constraints, transactional CAS, rollback and retry semantics in local/staging only.
7. **Add read API and authorization.** Expose only approved public snapshots through the allow-list serializer. Add separately authorized internal/admin operations; do not mount write routes before ownership and authorization tests pass.
8. **Prove neighborhood coverage.** Enumerate all eligible canonical neighborhoods from the approved registry revision. Create structural profiles with explicit gaps only after runtime and storage are verified. Never invent observations or treat the Golden Reference as real data.
9. **Reconcile execution records.** Update state, progress, remediation, blockers and next-action records after each verified work package.

## Immediate next action

Open the failed rerun job `140435161931` in GitHub Actions and establish why the job has no returned steps/log artifact. If this is a runner/platform failure, restore CI execution first; then rerun the five PR #67 workflows and diagnose the first real command-level failure.


## CHK-197 — Current exact next actions

1. **Resolve GitHub Actions execution visibility.** Latest PR #67 head is `ee2023a59128a9bad17f37e144995b5a6d67bc1f`. All five associated workflows conclude FAILURE, but jobs return empty/null steps and logs return `BlobNotFound`. Inspect GitHub Actions UI/runner availability or obtain valid log access; do not modify application code based on a failure with no executed-step evidence.
2. **Verify the two CI/build remediations.** The native-auth workflow now uses the existing `npm run test:auth` script. The stale `bun.lock` is removed and `.npmrc` aligns npm 10 installation with the committed lockfile. Both changes are committed but not yet verified by CI/Cloudflare preview on PR #67.
3. **Execute local gates when a runner is available:** `npm run test:nips`, `npm run typecheck`, `npm run arch:check`, `npm run test:auth`, `npm run test:cloudflare`, and the D1 triad/write-pause tests.
4. **Continue NIPS persistence only through the IRNI owner boundary.** Build the authenticated/versioned NIPS storage RPC and its owner-side additive migration in IRNI; Radar must not receive a direct D1 binding to the shared neighborhood database.
5. **Implement Radar's RPC adapter only after the owner contract is executable.** Add request validation, service identity, idempotency, bounded payloads, immutable snapshot writes, CAS publication activation and integration tests.
6. Keep PR #67 Draft; no merge, production deployment, remote migration, or secret change without explicit approval.


## CHK-198 — updated immediate queue

1. Resolve Actions runner/job initialization and restore step/log visibility; the latest run set still fails with null steps and `BlobNotFound`.
2. Re-run the exact workflow commands after runner access is restored: `npm run test:auth`, `npm run test:irni-geographic-rpc`, `npm run typecheck:irni-geographic-rpc`, `npm run test:geography-catalog`, plus the root CI and D1 triad suites.
3. Run NIPS foundation tests, TypeScript and architecture gates; fix only reproducible failures.
4. Continue the IRNI-owned NIPS storage RPC and Radar RPC adapter only within the approved ownership boundary. No direct Radar D1 binding.
