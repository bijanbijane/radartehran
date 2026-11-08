# Staging Secrets & Credentials Inventory (Phase 10-A)
## Tehran Radar — Cryptographic Keys & Access Governance

**Document Reference**: `docs/cloudflare/staging-secrets-inventory.md`  
**Phase**: 10-A (Staging Environment Preparation & Deployment Preflight)  
**Evaluation Date**: November 2026  
**Status**: `PREPARED_WITH_DOCUMENTED_LIMITATIONS`  
**Security Invariant**: Zero secret values stored in documentation or source control.

---

## 1. Separation of Deployment Credentials vs Runtime Application Secrets

To maintain strict least privilege and zero-trust security boundaries, credentials in Tehran Radar are separated into two isolated tiers:

```
[TIER 1: DEPLOYMENT CREDENTIALS] ---> CI/CD Runners & Operator Shell ONLY
   - CLOUDFLARE_API_TOKEN             (Scoped strictly to staging resources)
   - CLOUDFLARE_ACCOUNT_ID            (Platform Account Identifier)

[TIER 2: WORKER RUNTIME SECRETS]  ---> Cloudflare Worker V8 Isolate Memory ONLY
   - ADMIN_API_SECRET                 (Injected via `wrangler secret put`)
   - VALUATION_SEAL_SECRET            (Injected via `wrangler secret put`)
   - FIREBASE_PROJECT_ID              (Set in staging environment vars)
```

---

## 2. Tier 1: Deployment Credentials Specification

| Credential Name | Classification | Scopes Required | Permitted Environments | Storage Location | Exposure Impact |
|---|---|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Public Identifier | None (Account ID string) | Staging, Production | CI/CD env / Wrangler CLI | Low (Identifier only, cannot authorize calls alone) |
| `CLOUDFLARE_API_TOKEN` | Secret Credential | `Workers Scripts: Edit`, `KV Storage: Edit`, `D1: Edit`, `R2 Storage: Edit`, `Queues: Edit` | Staging Runner Only | Encrypted CI/CD Repository Secret | Critical (Enables script deployment and storage mutation) |

*Rule*: The deployment API token must never be bundled into client-side JavaScript or included in any Worker `vars` block.

---

## 3. Tier 2: Worker Runtime Secrets Inventory

| Secret Name | Owning Subsystem | Required in Staging? | Independent Staging Value? | Consuming Worker Modules | Rotation Procedure | Blast Radius & Exposure Impact |
|---|---|:---:|:---:|---|---|---|
| `ADMIN_API_SECRET` | Auth & Administration | **Yes** | **Mandatory** (Must not match Production) | `worker/auth/authorizationPolicy.ts` | Generate high-entropy 256-bit token; execute `wrangler secret put ADMIN_API_SECRET --env staging` | High: Unauthorized administrative inspection or maintenance mode trigger. |
| `VALUATION_SEAL_SECRET` | Hedonic Pricing Engine | **Yes** | **Mandatory** (Must not match Production) | `worker/routes/intelligenceAndCommerceRoutes.ts` | Generate 32-byte hexadecimal key; execute `wrangler secret put VALUATION_SEAL_SECRET --env staging` | High: Forged valuation certificate signatures in staging. |
| `FIREBASE_PROJECT_ID` | Identity & App Check | **Yes** | Recommended (Separate staging project) | `worker/auth/firebaseTokenVerifier.ts`, `worker/auth/appCheckVerifier.ts` | Update `APP_ENV` / `vars` in `wrangler.jsonc` | Medium: Token audience mismatch if misconfigured. |

---

## 4. Secret Provisioning & Audit Protocol (Phase 10-B Execution Plan)

When explicitly authorized in Phase 10-B, the operator will execute the following secret injection workflow:

```bash
# 1. Inject independent staging administrative secret
openssl rand -hex 32 | npx wrangler secret put ADMIN_API_SECRET --env staging

# 2. Inject independent staging valuation seal HMAC key
openssl rand -hex 32 | npx wrangler secret put VALUATION_SEAL_SECRET --env staging

# 3. Verify secrets are registered on Cloudflare without printing plain text
npx wrangler secret list --env staging
```

**Safety Invariant**: Under no circumstances should production keys be copied into staging.
