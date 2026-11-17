# 04 — Multi-Role Workspace Model

## Workspace Isolation (`src/platform/auth/workspace/`)
- Supported workspace types: `personal`, `agency`, `service`, `admin`.
- Every workspace cache entry is namespaced via `ws:${userId}:${workspaceId}:v${permissionVersion}`.
- Switching workspaces via `WorkspaceSwitcher.switchWorkspace()`:
  1. Aborts all in-flight `AbortController` requests belonging to the previous workspace.
  2. Clears previous workspace temporary selection state.
  3. Re-evaluates current route access and redirects to `/` if the active route is unauthorized for the new role.
