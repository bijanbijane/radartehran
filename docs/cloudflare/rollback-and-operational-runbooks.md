# Rollback Procedures & Operational Runbooks (Phase 9)
## Tehran Radar — Incident Response & Staging Deployment Runbooks

**Document Reference**: `docs/cloudflare/rollback-and-operational-runbooks.md`  
**Evaluation Date**: November 2026  
**Auditor**: Site Reliability Engineering & Operations Architecture Team  
**Evaluation Status**: `READY_WITH_DOCUMENTED_LIMITATIONS`

---

## 1. Fast Rollback Runbooks (Recovery Time < 5 Minutes)

In the event of an outage, catastrophic edge bug, or unhandled exception spike after deploying to Staging or Production, follow these deterministic runbooks.

### Runbook 1: Instant Route Disablement (DNS / Edge Bypass)
**Trigger**: Error rate $\ge 2\%$ on Cloudflare Worker or severe routing loop.  
**Execution Time**: `< 60 seconds`.  
**Steps**:
1. Run CLI command:
   ```bash
   npx wrangler rollback --message "Emergency rollback to previous stable deployment"
   ```
2. Or via Cloudflare Dashboard:
   - Navigate to **Workers & Pages** -> `tehran-radar-edge-worker` -> **Deployments**.
   - Click **Rollback** on the preceding successful deployment.
3. If Worker isolate runtime itself is failing:
   - Navigate to **Websites** -> `radartehran.ir` -> **DNS** or **Workers Routes**.
   - Disable route: `radartehran.ir/*`.
   - Traffic routes directly to origin Node.js Express server.

---

### Runbook 2: Strangler Fallback Force Route
**Trigger**: A specific migrated route group (e.g., Group 1B Hedonic engine or Group 1A Health/Config) behaves unexpectedly.  
**Execution Time**: `< 2 minutes`.  
**Steps**:
1. In `worker/router.ts`, set the emergency override flag or remove route regex from `MIGRATED_ROUTES` map.
2. The Worker will automatically proxy the request to the upstream Node.js origin:
   ```typescript
   // worker/router.ts
   // To force fallback, return null from matchMigratedRoute()
   return null; // All requests immediately fall through to Express origin
   ```
3. Deploy Worker update:
   ```bash
   npm run deploy:worker
   ```

---

### Runbook 3: D1 Database Failover to Firestore
**Trigger**: D1 read-replica divergence or sqlite table lock.  
**Execution Time**: Instantaneous (Automatic).  
**Steps**:
1. Firestore is the primary authoritative master. D1 is read-only for reporting and caching.
2. In `worker/db/d1Client.ts`, toggle `FEATURE_D1_READS_ENABLED=false` in Wrangler environment variables.
3. The system defaults immediately to direct Firestore queries.

---

### Runbook 4: R2 Storage Fallback
**Trigger**: Cloudflare R2 bucket inaccessible or credential failure.  
**Execution Time**: `< 3 minutes`.  
**Steps**:
1. In `worker/storage/index.ts`, switch adapter mode from `r2` to `simulated` (local storage / Express proxy).
2. Existing uploaded files on R2 remain untouched.

---

## 2. Operational Health Check & Incident Response Checklist

During any operational anomaly, verify the following telemetry indicators:

1. **Edge Error Rates**: Inspect Cloudflare Workers Analytics for HTTP 1101 (Worker threw exception), 520 (Origin error), or 524 (Origin timeout).
2. **Queue Health**: Check `tehran-radar-jobs-dlq` (Dead-letter queue) message count. If DLQ count $> 0$, inspect poison payloads:
   ```bash
   npx wrangler queues consumer info tehran-radar-jobs-dlq
   ```
3. **KV Quotas**: Verify read/write rate limits in Cloudflare Dashboard under **Workers KV**.
4. **Hedonic Valuation Invariant**: Verify that all valuation calls emit $\text{FAST\_SALE\_FACTOR} = 0.88$.
