# 08 — Authorization & Session Error Matrix

| Status / Condition | Category | UI Behavior (`resolveAccessErrorMatrix`) |
|---|---|---|
| `401` | `UNAUTHENTICATED` | Trigger single-flight refresh; if refresh fails, preserve draft and prompt login (`preserveDraft: true`). |
| `403` | `FORBIDDEN` | Show clear Persian access denied state without logging user out (`preserveDraft: true`). |
| `423` | `LOCKED` | Transition to `ACCESS_DENIED` and display support contact guidance. |
| `404` | `NOT_FOUND` | Show resource not found fallback without leaking existence of private entities. |
| `429` | `RATE_LIMITED` | Show cooldown notice (`retryable: true`). |
| `5xx` | `SERVER_ERROR` | Preserve user form draft and offer retry (`retryable: true, preserveDraft: true`). |
| `featureDisabled` | `FEATURE_DISABLED` | Gracefully hide/disable feature with explanatory message. |
