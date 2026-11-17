# 05 — Route, Component & Action Authorization

## Three-Tier Access Policy (`src/platform/auth/authorization/accessPolicy.ts`)
1. **Route-Level (`evaluateRouteAccess`)**: Guards `/admin`, `/agency`, `/service`, `/escrow`, `/profile`, `/saved-searches`.
2. **Component-Level (`evaluateComponentAccess`)**: Hides or disables restricted UI sections when permissions are missing.
3. **Action-Level (`evaluateActionAccess`)**: Blocks unauthorized mutations and flags sensitive actions requiring Step-Up verification.
