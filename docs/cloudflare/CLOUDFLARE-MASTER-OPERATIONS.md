# Cloudflare Master Operations, 3-Tier Least-Privilege Authorization & Staging Runbook (`bijanbijane/radartehran`)

> **Target Account Subdomain (Expected)**: `bijanbijane-1.workers.dev`
> **Protected Production Worker**: `radartehran` (DO NOT OVERWRITE OR DEPLOY WITHOUT EXPLICIT OPERATOR CUTOVER)
> **Authorized Staging Worker**: `radartehran-staging` (`https://radartehran-staging.bijanbijane-1.workers.dev`)
> **Authoritative D1 Migration Ledger**: `d1_migrations` (managed exclusively by Wrangler D1 Migrations)
> **Firebase Project / Firestore Authority**: `gen-lang-client-0713157837` / `ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a`

---

## 1. Three-Tier Isolated Cloudflare Authorization Model (Bootstrap vs. Protected D1 Migration vs. Routine Deploy)

Because Cloudflare API tokens do not currently support single-database resource scoping for D1 (`D1 Write` is account-scoped), granting `D1 Write` to the routine application deployment token would expose other D1 databases in the same Cloudflare account. Therefore, Tehran Radar enforces a **three-tier operational separation**:

1. **One-Time Staging Bootstrap** (`.github/workflows/bootstrap-staging.yml` $\rightarrow$ Environment `staging-bootstrap` $\rightarrow$ Secret `CF_BOOTSTRAP_API_TOKEN`, revoked immediately after bootstrap).
2. **Explicitly Approved Staging D1 Migrations** (`.github/workflows/migrate-staging-d1.yml` $\rightarrow$ Protected Environment `staging-migrations` $\rightarrow$ Secret `CF_STAGING_MIGRATION_TOKEN`).
3. **Routine Least-Privilege Application Deployment** (`.github/workflows/deploy-staging.yml` $\rightarrow$ Environment `staging-deploy` $\rightarrow$ Secret `CF_DEPLOY_API_TOKEN` with **zero `D1 Write`**, **zero resource creation**, and **`Workers Editor` scoped exclusively to `radartehran-staging`**).

### A. Tier 1: One-Time Staging Bootstrap Matrix (`.github/workflows/bootstrap-staging.yml` — `CF_BOOTSTRAP_API_TOKEN`)
| Operation & Command | Auth Mechanism | Exact Accepted Role / API Permission Group | Narrowest Supported Scope |
| :--- | :--- | :--- | :--- |
| Verify account (`wrangler whoami`) | API Token (`CF_BOOTSTRAP_API_TOKEN`) | API Permission Group: **`Account Settings Read`** (`Account > Account Settings > Read`) | Account (`CLOUDFLARE_ACCOUNT_ID`) |
| Create initial Worker (`wrangler deploy --env staging` & `wrangler secret put --env staging`) | API Token (`CF_BOOTSTRAP_API_TOKEN`) | Developer Platform Role: **`Workers Admin`** (`Account > Workers > Admin`) — *`Workers Scripts Edit` (`Editor`) cannot create a new Worker* | **Workers product scope** (`Account > Workers`) because `radartehran-staging` does not exist yet |
| Create or reuse KV namespace (`wrangler kv namespace create radartehran-staging-kv`) | API Token (`CF_BOOTSTRAP_API_TOKEN`) | API Permission Group: **`Workers KV Storage Write`** (`Account > Workers KV Storage > Edit`) / Developer Platform `Admin` covering KV | Account (`CLOUDFLARE_ACCOUNT_ID`) |
| Create or reuse D1 database & apply initial migrations (`wrangler d1 create radartehran-staging-db` & `d1 migrations apply --remote`) | API Token (`CF_BOOTSTRAP_API_TOKEN`) | API Permission Group: **`D1 Write`** (`Account > D1 > Edit`) | Account (`CLOUDFLARE_ACCOUNT_ID`) |
| Create or reuse R2 bucket (`wrangler r2 bucket create radartehran-staging-media`) | API Token (`CF_BOOTSTRAP_API_TOKEN`) | API Permission Group: **`Workers R2 Storage Write`** (`Account > Workers R2 Storage > Edit`) | Account (`CLOUDFLARE_ACCOUNT_ID`) |
| Create or reuse Queues (`wrangler queues create radartehran-staging-queue` & `radartehran-staging-dlq`) | API Token (`CF_BOOTSTRAP_API_TOKEN`) | API Permission Group: **`Queues Write`** (`Account > Queues > Edit`) | Account (`CLOUDFLARE_ACCOUNT_ID`) |

### B. Tier 2: Dedicated Protected Staging D1 Migration Matrix (`.github/workflows/migrate-staging-d1.yml` — `CF_STAGING_MIGRATION_TOKEN`)
- **Explicit Scope Disclosure**: Cloudflare API tokens do not currently support per-database resource scoping for D1. Because `D1 Write` (`Account > D1 > Edit`) is account-scoped in Cloudflare's API token architecture, `CF_STAGING_MIGRATION_TOKEN` has technical capability across D1 databases in the account. To mitigate this, `CF_STAGING_MIGRATION_TOKEN` is isolated inside the `staging-migrations` GitHub Environment (requiring manual reviewer approval), has **zero** Worker deploy, R2, KV, Queue, or DNS permissions, and is only consumed by `scripts/cloudflare/migrate-staging-d1.mjs`, which hard-codes `radartehran-staging-db` and verifies its exact committed UUID before executing SQL.

| Operation & Command (`scripts/cloudflare/migrate-staging-d1.mjs --apply-remote`) | Auth Mechanism | Exact Accepted Role / API Permission Group | Narrowest Supported Scope |
| :--- | :--- | :--- | :--- |
| Verify account (`wrangler whoami`) | API Token (`CF_STAGING_MIGRATION_TOKEN`) | API Permission Group: **`Account Settings Read`** (`Account > Account Settings > Read`) | Account (`CLOUDFLARE_ACCOUNT_ID`) |
| Verify `radartehran-staging-db` UUID, list pending migrations, apply `migrations/d1/*.sql`, and verify `d1_migrations` & `sqlite_master` | API Token (`CF_STAGING_MIGRATION_TOKEN`) | API Permission Group: **`D1 Write`** (`Account > D1 > Edit`) | Account (`CLOUDFLARE_ACCOUNT_ID` — isolated in `staging-migrations` behind manual approval and hard-coded UUID verification; **zero Worker deploy/R2/KV/Queue permissions**) |

### C. Tier 3: Routine Least-Privilege Staging Deployment Matrix (`.github/workflows/deploy-staging.yml` — `CF_DEPLOY_API_TOKEN`)
- **Zero D1 Write Guarantee**: Routine deployments **never** apply D1 migrations, **never** execute remote D1 write queries, **never** create or delete resources, and **never** reference `CF_STAGING_MIGRATION_TOKEN` or `CF_BOOTSTRAP_API_TOKEN`.

| Operation & Command | Auth Mechanism | Exact Accepted Role / API Permission Group | Narrowest Supported Scope |
| :--- | :--- | :--- | :--- |
| Verify account & committed non-placeholder bindings (`provision-staging.mjs --mode=verify-only --require-remote --reject-placeholder-ids`) | API Token (`CF_DEPLOY_API_TOKEN`) | API Permission Group: **`Account Settings Read`** (`Account > Account Settings > Read`) | Account (`CLOUDFLARE_ACCOUNT_ID`) |
| Deploy code update to existing Staging Worker (`npx wrangler deploy --env staging`) | API Token (`CF_DEPLOY_API_TOKEN`) | Developer Platform Role: **`Workers Editor`** | **Resource-scoped to single Worker `radartehran-staging`** (`https://developers.cloudflare.com/workers/authorization/workers/`) |
| Post-deploy HTTP smoke & read-only D1 migration readiness check (`smoke-test-staging.mjs --url https://radartehran-staging.<subdomain>.workers.dev` $\rightarrow$ `GET /api/health/readiness`) | Deployed Worker Runtime Bindings (`env.DB`, `env.MEDIA_BUCKET`, `env.RADAR_KV`, `env.RADAR_QUEUE`) | **Zero D1, R2, KV, or Queue API Token permissions required** (`GET /api/health/readiness` performs a read-only `SELECT` on `d1_migrations` via `env.DB` and returns `503 REQUIRED_D1_MIGRATION_PENDING` if any canonical migration is unapplied) | Bound at runtime solely to `radartehran-staging` |

---

## 2. Operational Release Sequence

1. **One-time bootstrap** (`.github/workflows/bootstrap-staging.yml` in `staging-bootstrap`): Provision the 5 Staging resources, commit the real `env.staging.d1_databases[0].database_id` and `env.staging.kv_namespaces[0].id` from the `radartehran-staging-resource-manifest` artifact into `wrangler.jsonc`, and immediately **revoke `CF_BOOTSTRAP_API_TOKEN`**.
2. **Explicitly approved Staging D1 migrations** (`.github/workflows/migrate-staging-d1.yml` in `staging-migrations`): Whenever canonical SQL files in `migrations/d1` are added or updated, manually dispatch `migrate-staging-d1.yml` and approve the `staging-migrations` review gate.
3. **Routine Staging application deployment** (`.github/workflows/deploy-staging.yml` in `staging-deploy`): Deploy Worker updates using `CF_DEPLOY_API_TOKEN`. If a required D1 migration has not been applied, `/api/health/readiness` returns `503 REQUIRED_D1_MIGRATION_PENDING` and the deployment smoke check fails closed.
