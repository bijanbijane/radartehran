# Resilience, Fault Tolerance and Disaster Recovery (Phase 9)
## Tehran Radar — Edge Runtime Resilience & Fallback Architecture

**Document Reference**: `docs/cloudflare/resilience-and-recovery.md`  
**Evaluation Date**: November 2026  
**Auditor**: Distributed Systems & Site Reliability Engineering Team  
**Evaluation Status**: `READY_WITH_DOCUMENTED_LIMITATIONS`

---

## 1. High Availability & Failure Mode Analysis (FMEA)

The Tehran Radar hybrid migration relies on an incremental strangler architecture. Resilience requires graceful degradation across all Cloudflare bindings (KV, D1, R2, Queues) and upstream origin services (Firebase Firestore, Express Node.js backend).

| Subsystem | Potential Failure Scenario | Detection Mechanism | Automated Fallback / Mitigation | Recovery Objective (RTO / RPO) |
|---|---|---|---|---|
| **Worker Isolate Execution** | Edge worker unhandled exception or script crash | Cloudflare Edge 1101/1102 detection | Automatic DNS / Route fallback to Origin Node.js Express server. | RTO: < 100ms  <br>RPO: 0 |
| **KV Cache Outage** | Cloudflare Workers KV degraded or rate limited | Try/catch with error classification in `kvCacheManager.ts` | Bypass cache directly to origin/database without request termination. | RTO: Instant  <br>RPO: 0 |
| **D1 Read Replica Outage** | D1 query timeout or schema lock | Query error interception in `d1Client.ts` | Fallback read to Firestore primary collection. System logs error with circuit-breaker. | RTO: Instant  <br>RPO: 0 |
| **R2 Storage Write Failure** | R2 API throttling or transient network partition | HTTP 503 / timeout caught by `r2Adapter.ts` | Re-queue upload request via Cloudflare Queue; return signed retry payload. | RTO: < 5s  <br>RPO: 0 |
| **Queue Processor Poison Message** | Malformed job payload causing infinite Worker crash | Message retry count inspection (`message.attempts >= 3`) | Automated poison isolation: send to `DLQ_QUEUE` (Dead-Letter Queue), ack original message to prevent queue head-of-line blocking. | RTO: Instant  <br>RPO: 0 |
| **JWKS Key Server Outage** | Google Accounts JWKS endpoint unavailable | HTTP 5xx or fetch timeout in `jwksClient.ts` | Serve cached JWKS public keys past TTL in emergency grace period (up to 48 hours). | RTO: Instant  <br>RPO: 0 |
| **External Divar Sync Outage** | Divar upstream API rate limit or anti-scraping block | Circuit breaker in `serverMarketPulseEngine.ts` | Serve historical snapshot cached in D1/KV; mark indicators as stale (`isStale: true`). | RTO: Instant  <br>RPO: Max 24 hours |

---

## 2. Strangler Fallback & Origin Circuit Breaker

The Worker router (`worker/index.ts`) enforces strict fall-through routing for unmigrated or failing routes:

```
[Client Request]
       |
  [Edge Worker] ---> (Route Migrated & Healthy?)
                          |               \
                        [Yes]             [No / Exception]
                          |                       \
                  [Execute Edge Handler]       [Proxy to Express Origin]
                          |                               |
                 (Handler Succeeded?)             (Origin Returns 2xx/4xx)
                     /          \                         |
                  [Yes]         [No]                      |
                   /              \                       |
              [Return]         [Proxy to Express] --------+
                                  (Fallback)
```

- **Health Ping**: Express health is polled via background Cron Trigger. If the origin is degraded, Edge returns cached read-only data instead of proxy errors.
- **Header Propagation**: Fallback requests append `X-Strangler-Fallback: true` and `X-Request-Trace-Id` to trace origin load.

---

## 3. Disaster Recovery & Emergency Procedures

### 3.1 Instant Edge Route Bypass (Emergency DNS Cutover)
If an unrecoverable bug or memory corruption is discovered in the Worker bundle:
1. Access Cloudflare Dashboard -> **Rules** -> **Page Rules** / **Workers Routes**.
2. Disable the wildcard route: `radartehran.ir/* -> tehran-radar-edge-worker`.
3. Origin traffic flows directly from Cloudflare CDN to the containerized Express/Nginx origin without touching the Worker code.
4. Estimated operational turnaround: **< 30 seconds**.

### 3.2 Data Corruption & Schema Rollback
1. D1 schema changes are versioned sequentially (`0001_initial_schema.sql`, etc.).
2. Firestore remains authoritative for all mutations.
3. If D1 replica state is corrupted, trigger D1 wipe and re-sync via `npm run test:d1` reconciliation script without data loss.
