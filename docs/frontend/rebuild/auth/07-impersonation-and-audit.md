# 07 — Operator Impersonation & Security Guard

## Controls (`src/platform/auth/impersonation/`)
- Visible persistent `ImpersonationBanner` displaying target user, target role, operator email, and an immediate exit action.
- `evaluateImpersonationGuard` blocks all sensitive financial/security operations (`settlement:withdraw`, `escrow:release`, `account:change_phone`, `payment:submit`, etc.) while impersonation is active.
- Automatic session expiry after TTL (`30 minutes` default).
