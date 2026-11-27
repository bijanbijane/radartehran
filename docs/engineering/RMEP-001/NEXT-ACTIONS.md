# Next Actions — RMEP-001 Backend

Updated: 2026-11-27
Active branch: `feat/nips-backend-runtime-foundation-2026-11-26`
PR: #67 (Draft)
Main baseline: `456dcacb387b908797756863b10da1f7104b658e`

## Ordered execution queue

1. **Recover CI evidence.** Retrieve/reproduce failed jobs for PR #67. Start with path-filtered `detect`; then separately diagnose D1 triad, IRNI RPC, native-auth, and root CI failures. Record exact failing commands and error output.
2. **Review NIPS foundation.** Re-run `npm run test:nips`, typecheck, architecture checks, and applicable unit/security gates once an executable environment or usable CI logs are available. Do not label the PR verified from source inspection alone.
3. **Verify Cloudflare ownership state.** Confirm the existing neighborhood D1 database, owning IRNI Worker, deployed service name, and absence/presence of the intended Service Bindings. Do not change production configuration.
4. **Implement the paired IRNI NIPS storage RPC.** Require version pinning, service authentication, least-privilege operations, request validation, idempotency, bounded payloads, and transactional publication activation.
5. **Implement the Radar adapter.** Keep it runtime-neutral at the domain boundary. Radar must call the IRNI storage RPC; it must not bind directly to the shared IRNI D1 database.
6. **Add migration and adapter tests.** Use the approved `migrations/neighborhood-d1` ownership path; verify immutable snapshots, constraints, transactional CAS, rollback, and retry semantics in local/staging only.
7. **Add read API and authorization.** Expose only approved public snapshots through the allow-list serializer. Add separately authorized internal/admin operations; do not mount write routes before ownership and authorization tests pass.
8. **Prove neighborhood coverage.** Enumerate all eligible canonical neighborhoods from the approved registry revision. Create structural profiles with explicit gaps only after the runtime and storage provider are verified. Never invent observations or treat the Golden Reference as real data.
9. **Reconcile execution records.** Update this directory's state, progress, remediation, blockers, and next-action records after each verified work package.

## Immediate next action

Recover the raw Actions log or reproduce the failing `detect` job for PR #67. Its root cause is currently unknown; no source-code patch is justified until the failure is observable.
