# Backend Next Actions

Updated: 2026-11-27

1. Restore an online local execution environment or make GitHub Actions job logs accessible.
2. Inspect the exact failed checks on PR #71 and related open PRs #69/#70; fix only the verified root cause on the appropriate existing branch.
3. Run the narrow failing test first, then the relevant D1 triad/write-pause suites and backend typecheck.
4. Continue the residual Express Firestore-to-D1 migration by identifying one live adapter and its domain owner, then implement a backward-compatible replacement with regression coverage.
5. Review account deletion outbox concurrency: prove whether inbox idempotency plus current outbox updates are safe under overlapping scheduled invocations; add claim/lease only if a test demonstrates a correctness gap.
6. Restore Docker Worker + USER_DB and verify the actual Google OAuth callback.
7. Keep Phase 6 PARTIALLY_VERIFIED. No merge/deploy/production data mutation without explicit approval.
