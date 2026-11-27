# Backend Next Actions

Updated: 2026-11-27

1. Restore an online local execution environment or make GitHub Actions job logs accessible.
2. Inspect the exact failed checks on PR #71 and related open PRs #69/#70; fix only the verified root cause on the appropriate existing branch.
3. Run the narrow failing test first, then the relevant D1 triad/write-pause suites and backend typecheck.
4. Continue the residual Express Firestore-to-D1 migration by identifying one live adapter and its domain owner, then implement a backward-compatible replacement with regression coverage.
5. Review account deletion outbox concurrency: prove whether inbox idempotency plus current outbox updates are safe under overlapping scheduled invocations; add claim/lease only if a test demonstrates a correctness gap.
6. Restore Docker Worker + USER_DB and verify the actual Google OAuth callback.
7. Keep Phase 6 PARTIALLY_VERIFIED. No merge/deploy/production data mutation without explicit approval.

8. Verify CI diagnostics for run 45980515216 (detect) and the Cloudflare radartehran-frontend build check without rerunning deployment actions.
9. Execute tests/rt-db-triad-001.test.ts and targeted Worker typecheck on head 0f1818e488e12580bfc9c01356cd9de04d3970fc when local runtime is available.
10. Add a deterministic overlapping-delivery test that forces both workers past the initial inbox read before serialized D1 batches; do not claim concurrency verified from sequential replay coverage.

11. Execute tests/rt-db-triad-001.test.ts and targeted Worker typecheck against code head 2b71c9a1eac38f02255f58c8676926de49a490de when a runtime is available.
12. Diagnose run IDs 45986000419, 45986000574, 45986000519, and 45986000654 from actual job output; do not infer root causes from empty metadata.
13. Review processPendingResearchErasureOutbox for concurrent USER_DB status regression (e.g. a failed worker overwriting a successful COMPLETED state with RETRY_PENDING); add a regression before deciding whether a durable claim/lease is required.
14. Continue the residual Express Firestore adapter inventory and migrate one bounded live adapter at a time, with domain-specific tests.

15. Run the full RT-DB-TRIAD-001 test and Worker typecheck against head 043e25c7c044cf4375fd40b68bbd62bb02c8831a.
16. Inspect CI run IDs 45986606294, 45986606317, 45986606333, and 45986606330 using actual logs/annotations when available; no inferred root causes.
17. Audit outbox attempt_count lost-update behavior and whether a lease/claim is still needed; retain status fencing regardless.

18. Add/verify unavailable-RESEARCH_DB completion race test in tests/rt-db-triad-001.test.ts (new test committed at 34e2aaad37ba4b3793df7a9a5eecd8e364de6b15).
19. Run the focused RT-DB triad suite and Worker typecheck when a local runtime is online; retrieve actionable diagnostics for CI run IDs 45987376314, 45987376378, 45987376493, and 45987376397.
20. After CI is diagnosable, continue one live Express Firestore adapter migration at a time; do not remove historical Firebase compatibility files or rules merely because their names contain Firebase/Firestore.


## Live Express Firestore adapter triage (2026-11-27)
- `server/modules/property-viewings` is not the first migration target: repository search found its facade only in its module and tests, and `apps/api/server.ts` does not mount it.
- `server/modules/legal-regulatory` is a confirmed live Express target: `apps/api/server.ts` imports and mounts `registerLegalRegulatoryRoutes`; `routes.ts` constructs `FirestoreLegalRegulatoryStore`; its repository spans 10 domain collections (plus the transactional/idempotency contract).
- No legal-regulatory-specific D1 migration currently exists under `migrations/` (tree inventory checked). Do not swap the store or remove Firestore yet. First define the D1 schema, transactional repository contract, indexes/pagination, migration strategy, and parity tests for the mounted routes.


## Legal-regulatory D1 migration design (2026-11-27)
- Confirmed the mounted live dependency chain: apps/api/server.ts → registerLegalRegulatoryRoutes → FirestoreLegalRegulatoryStore → FirestoreLegalRegulatoryTransactionRunner.
- Added LEGAL-REGULATORY-D1-MIGRATION-DESIGN.md defining the ten-table model, required indexes, conditional transaction-guard protocol, parity gates, data reconciliation, and no-fallback cutover sequence.
- **Blocker:** D1 database ownership/binding is not confirmed for this domain. radar_researcher_db is only a candidate; do not use user or neighborhood DB. No migration or store replacement has been implemented.
- Next exact action: confirm intended D1 binding and D1 batch SQL semantics; then implement the D1 transaction runner behind LegalRegulatoryStore and prove it against the existing Firestore transaction test contract before changing the production composition root.


21. **[IMPLEMENTED — NOT VERIFIED] RT-DB-TRIAD-003 runtime barrier.** HTTP/Queue permits, consent revision/fence checks, durable revocation outbox, lease draining, revision-scoped erasure, receipt reconciliation, privacy routes, deterministic identities, expected-revision CAS and post-drain registry rescan are committed. Seven scenarios cover the runtime and the late-registry race.
22. **[IMPLEMENTED — NOT VERIFIED] TRIAD test activation.** `npm test` invokes `npm run test:triad`, which runs TRIAD-001/002/003; the dedicated Backend Triad workflow path filters include TRIAD-001 and TRIAD-003 test files.
23. **Verify the complete DB triad and retry regressions.** Run `npm test`, `npm run typecheck`, and the Worker/API bundle/route-contract checks against the exact latest PR #78 head once a runner is assigned. Confirm the seven TRIAD-003 scenarios and atomic outbox retry counter regression pass; no execution evidence exists yet.
24. **Resolve hosted runner allocation through issue #49.** Do not repeatedly rerun unchanged workflows, weaken permissions, or attribute failures to application code until GitHub account-level Actions entitlement/billing/policy is checked.

25. Reconnect MacBook-Air.local or resolve the GitHub Actions hosted-runner allocation blocker tracked in issue #49; do not rerun unchanged workflows until runner assignment works.
26. Run npm run test:triad (TRIAD-001, TRIAD-002, TRIAD-003) and the AGENTS.md Worker/API typecheck gates on the latest PR #78 head. Capture actual output and fix only demonstrated failures.
27. Verify the new account route through migration register and API contract tests; confirm migrations user-d1/0007 and research-d1/0003 are applied only in a non-production test/staging environment after explicit authorization.
28. After TRIAD-003 passes, resume the next bounded backend item: audit one mounted Express Firestore adapter and establish its D1 schema/transaction parity before replacing it.

29. After restoring a runner, run npm test (which now begins with all three DB triad suites), npm run typecheck, and the Worker bundle/API route-contract checks.
30. Verify migration 0008 applies cleanly after user-d1/0007 in an isolated local SQLite/D1 test database; never apply it to production without separate authorization.
31. Inspect the TRIAD-002 updated race test and all six TRIAD-003 scenarios for runtime outcomes; fix only actual failures.

31. Re-check the latest CI run metadata after issue #49 is resolved. Do not rerun unchanged workflows while runner_id remains 0 or the job has zero steps.

32. Verify direct consent-revocation bypass tests in TRIAD-001 and the updated HTTP/Queue race and stale-revision assertions in TRIAD-002.
33. Run npm test and npm run typecheck only after runner assignment is restored; then run Wrangler local D1/Worker integration against isolated databases with migrations 0007 and 0008.
34. Do not proceed to Firestore adapter replacement until TRIAD-001/002/003 pass and their runtime behavior is evidenced.


35. **Next live Firestore adapter identified (audit only; no migration started):** community is mounted by apps/api/server.ts through registerCommunityRoutes. communityUnifiedRepository defaults to createDefaultCommunityDatabaseStore, which selects FirestoreAdminCommunityStore in production, emulator, or credentialed environments. It owns 16 social collections and transactional/idempotent operations. After TRIAD tests pass, map every community collection, transaction boundary, rate-limit/idempotency key, query/order/cursor and route contract before designing USER_DB/D1 migration. Do not change its store until D1 parity tests and an approved migration/rollback plan exist.
36. Legal-regulatory is another mounted Firestore-backed module and remains a later candidate; it has explicit transaction and audit semantics and must not be replaced with a naive CRUD adapter.
