# RT-FE-REBUILD-FOUNDATION-001 — Frontend 5-Layer Architecture

## 1. Layer Dependency Hierarchy
```text
src/design-system  (Layer 1: Tokens, Themes, Typography, Primitives)
       ▲
src/shared         (Layer 2: Shared Types, Utilities, Contracts, Hooks, UI, Geo-UI)
       ▲
src/platform       (Layer 3: Auth, API Client, Storage, Error Handling, Telemetry, Feature Flags, Localization, Geo)
       ▲
src/features       (Layer 4: Domain Features — Map, Valuation, Property, Neighborhood, Onboarding, etc.)
       ▲
src/app            (Layer 5: Bootstrap, Providers, Router, Application Shell Layouts)
```

## 2. Application Shell Layouts (Max 4)
1. `PublicLayout`: Public/guest entry pages.
2. `AuthenticatedLayout`: Logged-in buyer/seller/agency/service workspaces.
3. `AdminLayout`: Governance and operator administration shell.
4. `MainLayout`: Spatial radar map + synchronized side panel shell.

## 3. API & Storage Contracts
- Normal API request timeout: `15,000 ms`; heavy computation timeout: `30,000 ms`.
- Error payload cap: `2,048 bytes` (`2 KB`), sensitive fields redacted.
- Retry policy: `GET` max `2` retries; `POST/PUT/DELETE` `0` automatic retries without `idempotencyKey`.
- Storage namespaces: `rt:v1:{session|prefs|cache|temp}:*` with automatic `QuotaExceededError` eviction of expired/cache entries.
