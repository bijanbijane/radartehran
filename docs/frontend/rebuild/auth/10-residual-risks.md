# 10 — Residual Risks & Operational Notes

1. **Server-Side Token Revocation Propagation**: Client-side proactive refresh occurs 60 seconds prior to token expiry (`TOKEN_REFRESH_LEAD_MS = 60000`), and `401`/`403` responses immediately trigger single-flight refresh or access re-evaluation.
2. **Multi-Tab Workspace Sync**: Workspace cache keys include `userId`, `workspaceId`, and `permissionVersion`, preventing cross-role cache pollution within the active tab and across storage namespaces.
