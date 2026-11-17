# 01 — Auth Lifecycle State Machine (`RT-FE-REBUILD-AUTH-ACCESS-003`)

## Canonical States
1. `INITIALIZING`: Initial session check on bootstrap.
2. `UNAUTHENTICATED`: Guest mode; no active identity token.
3. `AUTHENTICATED`: Firebase/session identity verified; access not yet resolved.
4. `RESOLVING_ACCESS`: Resolving profile, active workspace role, and permissions.
5. `READY`: Identity, profile, role, and workspace permissions ready.
6. `TOKEN_REFRESHING`: Single-flight token refresh in progress.
7. `REAUTH_REQUIRED`: Sensitive action triggered Step-Up verification requirement.
8. `SESSION_EXPIRED`: Token expired and refresh failed; user form drafts preserved.
9. `ACCESS_DENIED`: Account locked or zero permissions for requested workspace.
