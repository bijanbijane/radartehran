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
