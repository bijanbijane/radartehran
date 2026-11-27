# RMEP-001 Next Actions

1. **Verify OP-194**: In an online checkout, run `npx tsx --test tests/cloudflare-worker-queue-entrypoint.test.ts`. Confirm legacy `firestore_d1_projection_sync` is dead-lettered with `FIRESTORE_SOURCE_ADAPTER_UNAVAILABLE` and `neighborhood_projections` remains unchanged.
2. Run `npm run test:triad`, `npx --test worker/db/writePause.test.ts`, `npm run test:auth`, and the focused Worker/queue suites; record actual outputs and failures.
3. Inspect all Cron envelope producers and Cloudflare queue configuration for stale `firestore_d1_projection_sync` scheduling. Remove obsolete scheduling only after confirming no valid upstream publisher remains; keep DLQ compatibility for in-flight messages.
4. Port the next live Express Firestore-backed domain adapter to D1 in a small slice. Start with a bounded inventory and choose the highest-risk active write path; preserve transactional and authorization invariants.
5. Continue Firebase retirement: remove residual client/server dependencies only after import graph and build/typecheck prove no remaining consumers.
6. Restore an online local Worker + USER_DB runtime and verify the real Google OIDC callback. Keep Phase 6 `PARTIALLY_VERIFIED` until all acceptance gates pass.

Do not merge to `main`, deploy, or mutate production data without explicit approval.


## RT-DB-TRIAD-003 follow-up

1. Run npm run test:triad and focused account/research queue tests in a working runner.
2. Run TypeScript typecheck and Worker/API builds; inspect the exact CI check annotations.
3. Validate migration 0008 against an isolated copy of USER_DB, including duplicate (uid, revoked_consent_revision) detection before index creation.
4. Do not apply migration 0008 to Production until its data preconditions, backup, and rollback plan are verified.
5. Continue legal-regulatory D1 ownership review from LEGAL-REGULATORY-D1-MIGRATION-DESIGN.md; no binding or migration is authorized by that design document.
