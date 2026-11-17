# 06 — Step-Up Re-Authentication (`src/platform/auth/step-up/`)

## Sensitive Actions Requiring Fresh Verification
- `settlement:withdraw` (5 min TTL)
- `escrow:release` (5 min TTL)
- `account:change_phone` (5 min TTL)
- `account:change_email` (10 min TTL)
- `agency:remove_member` (10 min TTL)
- `agency:transfer_ownership` (5 min TTL)
- `admin:override_commission` (5 min TTL)
- `property:delete_verified` (10 min TTL)
