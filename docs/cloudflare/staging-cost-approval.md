# Staging Cost Model & Billing Preflight Approval (Phase 10-A)
## Tehran Radar — Cloudflare Financial Boundaries & Scenarios

**Document Reference**: `docs/cloudflare/staging-cost-approval.md`  
**Phase**: 10-A (Staging Environment Preparation & Deployment Preflight)  
**Evaluation Date**: November 2026  
**Status**: `ESTIMATED_THEORETICAL_MODEL`  
**Billing Policy**: Zero automated charges. Operator approval required for any resource exceeding free quotas.

---

## 1. Cloudflare Staging Resource Cost Architecture

The staging environment is designed to operate within the **Free Tier allowances** of Cloudflare Workers, or as part of the existing **Workers Paid plan ($5.00/mo base)** shared with production.

| Resource / Binding | Cloudflare Free Allowance | Workers Paid Allowance | Projected Staging Usage | Additional Staging Cost | Required Account Plan |
|---|---|---|---|---|---|
| **Workers Compute** | 100,000 req/day | 10M req/mo + 30ms CPU | ~25,000 req/mo | **$0.00** | Free or Workers Paid ($5/mo) |
| **Static Assets (CDN)** | Unlimited / Fair use | Unlimited / Fair use | ~100,000 requests | **$0.00** | Free or Workers Paid |
| **Cloudflare D1 (Staging)** | 5M rows read/day, 100k written | 25B rows read/mo, 50M written | ~150,000 rows read/mo | **$0.00** | Free or Workers Paid |
| **Cloudflare R2 (Staging)** | 10 GB storage, 1M Class A ops | 10 GB free, $0.015/GB over | ~500 MB (~100 test images) | **$0.00** | Free or Workers Paid |
| **Workers KV (Staging)** | 100,000 reads/day, 1,000 writes | 10M reads/mo, 1M writes | ~20,000 reads/mo | **$0.00** | Free or Workers Paid |
| **Workers Queues (Staging)** | 1,000,000 operations/month | 1M ops included, $0.40/M over | ~10,000 ops/mo | **$0.00** | Workers Paid (Queues requires Paid) |

*Important Account Plan Note*: Cloudflare Queues is a **Workers Paid** feature ($5.00/month). If the target Cloudflare account is on the Free tier, Queue bindings must remain simulated, or the user must explicitly approve upgrading to the $5/month Workers Paid tier in Phase 10-B.

---

## 2. Staging Usage Scenarios & Financial Exposure

### Scenario A: Low-Volume Testing (Developer Smoke Verification)
- Invocations: ~5,000 requests / month.
- R2 Storage: ~50 MB test fixtures.
- D1 Queries: ~10,000 rows.
- **Estimated Cloudflare Cost: $0.00** (100% within free quotas).

### Scenario B: Moderate Staging (Full E2E Automated Integration Tests)
- Invocations: ~50,000 requests / month.
- R2 Storage: ~500 MB media fixtures.
- D1 Queries: ~250,000 rows.
- **Estimated Cloudflare Cost: $0.00** (If account already has Workers Paid for production, incremental cost is $0.00).

### Scenario C: High-Volume Stress / Load Testing
- Invocations: ~1,500,000 requests / month.
- R2 Storage: ~5 GB synthetic files.
- D1 Queries: ~5,000,000 rows.
- **Estimated Cloudflare Cost: $0.00** (Still within 10M Workers Paid allowance).

---

## 3. Financial Guardrails & Billing Protection

1. **Zero Automated Spending**: No commands executed by the agent can provision paid resources or alter Cloudflare billing settings.
2. **Notification Threshold**: Operator is instructed to configure a Cloudflare Billing Alert at the **$10.00/month threshold** before live staging deployment.
3. **Queue Paid Requirement**: Explicit operator sign-off is required before creating remote Cloudflare Queue infrastructure.
