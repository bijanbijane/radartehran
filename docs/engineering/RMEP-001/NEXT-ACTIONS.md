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
