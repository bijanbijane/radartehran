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
