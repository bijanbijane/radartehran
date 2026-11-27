# Backend Engineering Blockers

Updated: 2026-11-27

1. **Local execution unavailable — BLOCKED.** The connected MacBook execution device reported Offline. Therefore no npm scripts, TypeScript checks, local D1 tests, or builds were run in this session.
2. **CI failure root cause unavailable — BLOCKED.** PR #71 has failed GitHub checks and skipped E2E, but the GitHub connector returned `BlobNotFound` for job logs and empty step metadata/annotations. No failure cause is inferred.
3. **Worker/OAuth integration remains unverified — BLOCKED.** CHK-194 records Docker local Worker + USER_DB runtime and the real Google OAuth callback as unfinished.

These blockers do not authorize merging, production deployment, production database writes, secret rotation, or paid-service activation.

4. **PR #78 CI diagnosis — BLOCKED.** Latest workflow run 45980515216 failed in detect; api/frontend/contracts jobs were skipped. The radartehran-frontend Cloudflare Workers Builds check also failed. Logs/annotations remain unavailable (BlobNotFound), so root causes are unknown.
5. **Research erasure identity hardening — IMPLEMENTED_BUT_NOT_VERIFIED.** Completed inbox replays now validate subject key and key version against the stored row; regression assertion added but not executed.

6. **Latest CI reruns after the code hardening — BLOCKED.** On head e7053f53d8c69605ee6bf0037c9442650c95e7cf, Tehran Radar CI run 45982446365 failed in its TypeScript/Architecture/Unit/Storage/Stress/Build job; E2E was skipped. Cloudflare Native Auth Validation run 45982446011 failed in native-auth. Job step metadata is empty and log downloads remain unavailable, so neither failure is attributed to the latest source change.

7. **Latest CI on head 2b71c9a1eac38f02255f58c8676926de49a490de — BLOCKED.** Runs 45986000419 (Tehran Radar CI Quality Gates), 45986000574 (Cloudflare Native Auth Validation), 45986000519 (Tehran Radar Path-Filtered Checks), and 45986000654 (Radar Backend Triad) all concluded failure. E2E and downstream path-filtered gates were skipped. Job-step arrays are empty and log downloads return BlobNotFound, so no root cause is attributed.
8. **Concurrent erasure regression — NOT EXECUTED.** A deterministic overlapping-read test and guarded-delete fix are committed, but the local MacBook remains Offline and CI logs do not reveal whether the test executed.

9. **Latest CI on head 043e25c7c044cf4375fd40b68bbd62bb02c8831a — BLOCKED.** Runs 45986606294 (Tehran Radar CI Quality Gates), 45986606317 (Cloudflare Native Auth Validation), 45986606333 (Tehran Radar Path-Filtered Checks), and 45986606330 (Radar Backend Triad) all failed. Job logs and step metadata remain unavailable; failure root causes are unknown.
10. **Lifecycle concurrency fixes — NOT VERIFIED.** Deterministic regressions now cover cross-subject inbox identity collision and stale-worker retry downgrade, but neither test nor Worker typecheck has been executed in this session.

11. **Unavailable-RESEARCH_DB stale-worker race — IMPLEMENTED_BUT_NOT_VERIFIED.** Commit 0bd488a fences the retry update to PENDING/RETRY_PENDING and preserves a concurrently committed COMPLETED state; commit 34e2aad adds a SQLite-backed regression. Neither test nor typecheck has run locally.
12. **Latest CI on head 34e2aaad37ba4b3793df7a9a5eecd8e364de6b15 — BLOCKED.** Run 45987376314 detect failed; run 45987376378 TypeScript/Architecture/Unit/Storage/Stress/Build failed; run 45987376493 D1 domain isolation/Worker bundle failed; run 45987376397 native-auth failed. Downstream API/frontend/contracts and E2E jobs were skipped. Connector job step metadata is null and log downloads are unavailable; exact root causes remain unknown.

7. **Legal-regulatory D1 cutover — BLOCKED pending database ownership and implementation.** The live Express route chain is confirmed and the migration design is documented in LEGAL-REGULATORY-D1-MIGRATION-DESIGN.md. The candidate researcher binding is not approved for this domain; no migration or D1 store implementation exists. Current production composition still constructs FirestoreLegalRegulatoryStore. No Firestore removal or fallback is permitted until D1 transaction parity and data reconciliation pass.


13. **RT-DB-TRIAD-003 consent revocation barrier — IMPLEMENTED_BUT_NOT_VERIFIED.** Direct HTTP and Queue ingestion use leased permits; research writes persist consent_revision and enforce RESEARCH_DB fences; durable revocation jobs/outbox drain permits, recover expired leases, perform revision-scoped erasure and reconcile receipts. PATCH and recent-authenticated POST reconcile routes are active. Deterministic revocation/outbox IDs, expected-revision CAS, stale-intent cleanup and a post-drain registry rescan close concurrent-revoke and late-registry races. Seven regression scenarios are wired into `npm test` via `npm run test:triad`. No test/typecheck has executed because hosted runners fail before assignment and the local executor is Offline.
14. **Concurrent retry attempt counter — IMPLEMENTED_BUT_NOT_VERIFIED.** The failure path previously assigned a stale scanned `attempt_count`, so overlapping failed workers could lose increments. Both retry paths now increment in SQL, calculate exponential backoff from the current row value, and preserve the later retry time with `MAX`; successful completion is also status-fenced and increments atomically. A deterministic overlapping-worker regression was added to `tests/rt-db-triad-001.test.ts`. No execution result is available yet.
15. **Latest CI on PR #78 code head `d0faff86e79dde909faeb3cacbfa57e65e55ae37` — BLOCKED before runner allocation.** Runs 45990057254, 45990057424, 45990057265, and 45990057325 all failed. Their primary jobs report `runner_id=0`, empty runner name, and zero steps; Playwright and downstream path-filtered jobs were skipped. These runs did not execute the new test or any source checks. Account-level Actions diagnosis remains tracked in issue #49.

7. **RT-DB-TRIAD-003 — IMPLEMENTED_BUT_NOT_VERIFIED.** Permit acquisition/release, revision-tagged research writes, subject fences, durable revocation job/outbox, revision-scoped erasure, retry recovery, re-grant gating, account reconcile route and six-scenario test activation are committed. No test/typecheck has run yet.
8. **Hosted runner allocation — BLOCKED (account-level).** Latest runs on code head f5b2df10ba734461332af7e7c51b16919d8f69b9: Quality Gates 45994140283, Backend Triad 45994140162, Native Auth 45994140401. The Quality Gates job has runner_id=0, empty runner_name and zero steps; backend/native-auth job step metadata is null. This matches open issue #49. Do not attribute these failures to source code without runner output.
9. **Local executor — BLOCKED.** Remote Desktop Commander reports MacBook-Air.local Offline (last seen 21h ago). Focused tests and typechecks remain unexecuted.

10. **TRIAD-003 follow-up hardening — IMPLEMENTED_BUT_NOT_VERIFIED.** Added migration 0008 unique revocation identity and outbox retry index; deterministic IDs; expected consent-revision CAS and cleanup for stale intent; blocked unrelated consent mutation while draining. Updated TRIAD-002 race expectation to permit-drain semantics and included triad suites in npm test.
11. **Latest runner evidence:** On head 14151ae7dfcb2afdeeaabb1268e2265f986f8d3c, Quality Gates run 45995787426 job 140494716436 has runner_id=0, empty runner name and zero steps; Backend Triad run 45995787483 and Native Auth run 45995787609 expose null step metadata. E2E skipped. Issue #49 remains the operational blocker.


17. **Latest CI on PR #78 head `7b4330e19603327aca6c662e3b43db2f8b606cf7` — BLOCKED before runner allocation.** Quality Gates run 45996050993 (job 140495589525), Backend Triad run 45996051002 (job 140495589489), Native Auth run 45996050998 (job 140495589170), and Path-Filtered Checks run 45996051233 (detect job 140495590567) report runner_id=0, empty runner_name and zero steps; downstream jobs were skipped. No checkout, install, test, typecheck or build ran. Issue #49 updated; do not infer source failure.


18. **Latest CI reproduction on PR #78 head `91226a55389ccf77e25b1dc070678d3f6c1fb9cd` — BLOCKED before runner allocation.** Backend Triad run 45996474063 job 140497002675, Quality Gates run 45996473971 job 140497002393, Native Auth run 45996473979 job 140497001806, and Path-Filtered Checks run 45996473964 detect job 140497002382 all report runner_id=0, empty runner_name and zero steps; downstream E2E/API/frontend/contracts jobs skipped. No code-level check executed. Issue #49 updated.


19. **Latest CI reproduction on exact PR #78 head `1a33b00db205303dfd2603698cceea051c424398` — BLOCKED before runner allocation.** Backend Triad run 45996787222 job 140498058219, Quality Gates run 45996787220 job 140498058177, Native Auth run 45996787126 job 140498057995, and Path-Filtered Checks run 45996787006 detect job 140498057224 all report runner_id=0, empty runner_name and zero steps. E2E/API/contracts/frontend jobs were skipped. No source-level check executed. Issue #49 updated.


20. **Latest CI reproduction on exact PR #78 head `d622a1958d567140731f7ac87d6aa3140ed4a44e` — BLOCKED before runner allocation.** Backend Triad run 45997297157 job 140499788635, Quality Gates run 45997297169 job 140499789069, Native Auth run 45997297190 job 140499788433, and Path-Filtered Checks run 45997297120 detect job 140499788458 all report runner_id=0, empty runner_name and zero steps. Downstream jobs skipped. The TRIAD-003 test-only commit triggered the workflow but no test step ran. Issue #49 updated.

13. **Direct consent-revocation bypass — IMPLEMENTED_BUT_NOT_VERIFIED.** updateUserPrivacyConsentInD1 now rejects direct true→false transitions unless a durable revocation intent exists and the barrier/reconcile path performs the CAS. TRIAD-001 verifies the bypass is rejected; TRIAD-002 uses the barrier for both HTTP and Queue race cases.
14. **Queue stale revision semantics:** completed consent-revocation outbox rows now return CONSENT_REVISION_STALE_OR_REVOKED for a message whose revision is at or below the revoked-through revision. TRIAD-002 asserts this contract.
15. **Latest CI remains runner-blocked:** Quality Gates run 45997297169 job 140499789069 has runner_id=0 and zero steps; Backend Triad 45997297157 and Native Auth 45997297190 have null step metadata. E2E skipped. No source-level failure has been diagnosed.


21. **Latest CI reproduction on PR #78 head `7a54aebecd72cd7425c00cd3a635a2a74fff16ba` (code head `fbb09b96e29680af67ad68eafc4910cead925e9a`) — BLOCKED before runner allocation.** Backend Triad run 45997942625 job 140501967719; Quality Gates run 45997942616 job 140501967682; Native Auth run 45997942633 job 140501967269; Path-Filtered Checks run 45997942737 detect job 140501968108; Geographic RPC Contract run 45997942650 job 140501967316; Frontend Bundle Budget run 45997942637 job 140501967999; Shadow Registry Safety run 45997942605 job 140501968226. Every primary job reports runner_id=0, empty runner_name and zero steps. Downstream jobs skipped. Issue #49 updated. No code-level validation ran.


22. **Runner allocation still blocked on latest documentation-only PR #78 head `b8e5e4a1e499c890a9de90cf9fd4c7fede123433`.** Backend Triad run 45998616590 job 140504252762, Quality Gates run 45998616563 job 140504251169, Path-Filtered Checks run 45998616641 detect job 140504251265, Geographic RPC Contract run 45998616575 job 140504250476, Native Auth run 45998616562 job 140504250681 and Frontend Bundle Budget run 45998616558 job 140504251010 all report runner_id=0, empty runner_name and zero steps. Downstream jobs skipped. Issue #49 updated. No code-level validation ran.
