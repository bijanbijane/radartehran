# 02 — Session Management & Single-Flight Refresh

## Enforced Invariants (`src/platform/auth/session/sessionManager.ts`)
- `maxConcurrentRefresh`: `1` (Single-Flight lock).
- `maxQueuedRequests`: `50` requests max queued during active refresh.
- `refreshTimeoutMs`: `15,000 ms`.
- `maxGetRetryAfterRefresh`: `1` automatic retry for `GET` requests.
- `autoRetryPostWithoutIdempotency`: `0` (mutations without `idempotencyKey` are never auto-retried).
- Form Draft Preservation: `100%` of form state and return route saved via `preserveSessionDraftOnExpiry` before transitioning to `SESSION_EXPIRED`.
- Post-Logout Stale Retries: `0` (all queued requests immediately rejected on logout).
