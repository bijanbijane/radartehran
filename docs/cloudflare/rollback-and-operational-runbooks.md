# Rollback Procedures & Operational Runbooks (Phase 9.1 Reconciled)
## Tehran Radar — Incident Response & Staging Deployment Runbooks

**Document Reference**: `docs/cloudflare/rollback-and-operational-runbooks.md`  
**Evaluation Date**: November 2026 (Updated Phase 9.1)  
**Auditor**: Site Reliability Engineering & Operations Architecture Team  
**Evaluation Status**: `READY_WITH_DOCUMENTED_LIMITATIONS`

---

## 1. Operational Recovery Architecture & Invariant Rules

In Phase 9.1, operational runbooks have been updated to reflect the verified behavior of the edge router:
- **No Indiscriminate Write Retries**: Never automatically retry failed POST, PATCH, or DELETE requests across runtimes without explicit idempotency tokens. Doing so risks duplicate financial or lead creation.
- **Failover Mechanism**: Failover from Cloudflare Workers to Express occurs at the **Cloudflare Edge Route / DNS layer**, not via in-worker dynamic HTTP reverse-proxying.

---

## 2. Emergency Runbooks

### Runbook 1: Edge Route Disablement (Complete Origin Bypass)
- **Trigger**: Error rate $\ge 2\%$ on Worker isolate, script compilation errors, or unhandled 500 loops.
- **Implementation Status**: `PROCEDURAL_DESIGN` (Cloudflare platform feature).
- **Procedure**:
  1. Open Cloudflare Dashboard -> **Websites** -> `radartehran.ir` -> **Workers Routes**.
  2. Disable the wildcard route binding: `radartehran.ir/* -> radartehran`.
  3. Traffic immediately routes directly to the containerized origin server without hitting Worker code.
  4. Estimated operational turnaround: `< 60 seconds`.

---

### Runbook 2: Instant Worker Version Rollback
- **Trigger**: A new staging deployment introduces a regression in Group 1A/1B handlers.
- **Implementation Status**: `PROCEDURAL_DESIGN` (Built-in Wrangler feature).
- **Procedure**:
  1. Execute via CLI:
     ```bash
     npx wrangler rollback --message "Emergency rollback to previous stable staging release"
     ```
  2. Or navigate in Dashboard to **Workers & Pages** -> `radartehran-staging` -> **Deployments**, locate the preceding green deployment, and click **Rollback**.

---

### Runbook 3: D1 Safety & Schema Isolation
- **Trigger**: D1 read query failure or schema divergence.
- **Implementation Status**: `VERIFIED_INVARIANT`
- **Procedure**:
  1. Firestore is the **authoritative master**.
  2. D1 reads are **not active** in production or staging.
  3. Any issue with D1 does not impact user traffic or application mutations because all authoritative business operations query Firestore directly.

---

### Runbook 4: Queue Poison Message Isolation
- **Trigger**: Spike in `radar-dead-letter` queue depth.
- **Implementation Status**: `TESTED_LOCALLY` (Tested via `tests/cloudflare-phase6-queues-and-cron.test.ts`).
- **Procedure**:
  1. Messages that fail 3 consecutive processing attempts are automatically isolated to `radar-dead-letter`.
  2. Inspect message payload and stack trace:
     ```bash
     npx wrangler queues consumer info radar-dead-letter
     ```
  3. Poison messages never head-of-line block the primary queue.

---

## 3. Telemetry Indicators & Health Thresholds

During staging verification in Phase 10, monitor the following signals:

1. **Edge Status Codes**:
   - `500 Internal Worker Error`: Must be $< 0.1\%$ of total requests.
   - `1101 / 1102 Worker Exception`: Indicates script crash; trigger Runbook 1 immediately if $> 0.5\%$.
2. **Hedonic Pricing Invariant**:
   - Verify all valuation certificate signatures emit `FAST_SALE_FACTOR = 0.88`. Any drift $\ge 1\%$ triggers an immediate P0 rollback.
3. **Queue DLQ Counter**:
   - Normal threshold: 0 messages.
