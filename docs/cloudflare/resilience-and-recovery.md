# Resilience, Fault Tolerance and Disaster Recovery (Phase 9.1 Reconciled)
## Tehran Radar — Edge Runtime Resilience & Fallback Architecture

**Document Reference**: `docs/cloudflare/resilience-and-recovery.md`  
**Evaluation Date**: November 2026 (Updated Phase 9.1)  
**Auditor**: Distributed Systems & Site Reliability Engineering Team  
**Evaluation Status**: `READY_WITH_DOCUMENTED_LIMITATIONS`

---

## 1. Executive Summary & Critical Architecture Corrections

Phase 9.1 audits identified a discrepancy between previous documentation and actual code regarding fallback routing:
1. **No In-Worker Proxy Fallback**: `worker/router.ts` does **not** dynamically proxy failed or unmigrated requests to Express. Unmigrated routes return HTTP 501 `ROUTE_NOT_YET_MIGRATED_TO_WORKER`, unmatched `/api/*` returns HTTP 404, and exceptions return HTTP 500.
2. **Non-Idempotent Write Safety**: Blindly retrying non-idempotent mutations (such as buyer lead submissions or payments) across runtimes after a timeout causes **duplicate write corruption**. Retries are strictly prohibited without cryptographic idempotency tokens.
3. **D1 Read Replica Reality**: D1 is an implemented schema and proposed derived projection, not an active live-synchronized replica. Firestore is the sole authoritative data store.

---

## 2. Failure Modes & Effects Analysis (FMEA)

| Subsystem | Potential Failure Scenario | Detection Mechanism | Mitigation Architecture & Behavior | Design vs Measurement Status |
|---|---|---|---|---|
| **Worker Isolate Crash** | Unhandled runtime exception or memory ceiling exceeded | Cloudflare Edge 1101/1102 or Worker 500 | Worker catches exception, logs `UNHANDLED_WORKER_EXCEPTION`, and returns JSON 500. Cloudflare Page Rule can route traffic to Express origin if Worker fails globally. | `DESIGNED` (Tested locally with injected exceptions) |
| **Unmigrated Route Request** | Request hits route assigned to Express (Group 2–5) | Route registry check in `worker/router.ts` (L38-63) | Returns HTTP 501 with structured JSON payload identifying the authoritative Express module. Client routes directly to origin. | `VERIFIED` |
| **Non-Idempotent Mutation Timeout** | Upstream write succeeds but response network drops | Request timeout / client disconnect | System does **NOT** blindly retry POST/PATCH requests. Client must provide `idempotencyKey` to safely query operation outcome. | `DESIGNED` |
| **KV Cache Degradation** | Cloudflare KV API throttling or outage | Try/catch in `worker/cache/kvCacheManager.ts` | Gracefully falls back to direct execution / source fetch without failing the HTTP request. | `TESTED_LOCALLY` |
| **R2 Storage Write Failure** | Transient network error or R2 service limit | HTTP 503 from R2 API adapter | Upload fails closed with structured error; client retries using a new signed URL. Ephemeral storage is never used as a fake substitute. | `TESTED_LOCALLY` |
| **Queue Poison Message** | Malformed job envelope crashing worker repeatedly | Message attempts check (`attempts >= 3`) | Message is acked and forwarded to `radar-dead-letter` queue, preventing head-of-line blocking. | `TESTED_LOCALLY` |
| **Google JWKS Outage** | Google Accounts public key endpoint unreachable | Network timeout in `jwksClient.ts` | Serves stale cached public keys during grace period (up to 48 hours). | `TESTED_LOCALLY` |
| **Hedonic Model Drift** | External data corruption altering valuation weights | Formula assertion in `marketIntelligenceEngine.ts` | Strict invariant validation ensures $\text{FAST\_SALE\_FACTOR} = 0.88$. Alerts if $MAPE \ge 12\%$. | `VERIFIED` |

---

## 3. Strangler Routing Reality vs Previous Documentation

The actual routing flow implemented in `worker/router.ts` and `worker/index.ts`:

```
[Incoming Request]
        |
  [Cloudflare Worker]
        |
  (Is Path Migrated to Edge? Group 1A / 1B)
       /                                  \
    [Yes]                                 [No]
      |                                     |
(Execute Handler)               (Is Path in Migration Register?)
    /          \                          /                   \
[Success]    [Exception]                [Yes]                 [No]
    |             |                       |                     |
 (Return)    (Return 500 JSON)      (Return 501 JSON)     (Is /api/* ?)
                                    [Identifies Express]     /       \
                                                           [Yes]     [No]
                                                             |         |
                                                        (Return 404) (Serve Static SPA)
```

**Key Distinction**: There is no live reverse-proxying (`fetch(expressOrigin)`) within the Worker code itself. In a multi-origin setup, Cloudflare Workers Routes or Cloudflare Load Balancing handles origin splitting.

---

## 4. Disaster Recovery & Rollback Procedures

### 4.1 Edge Route Bypass (Recovery Time: < 60 seconds)
If an unrecoverable edge defect is introduced:
1. In Cloudflare Dashboard -> **Workers & Pages** -> **Routes**, disable the route pattern:
   `radartehran.ir/*`
2. Traffic immediately falls back directly to the existing containerized Express backend.
3. *Status*: `PROCEDURALLY_DOCUMENTED` (Awaiting live staging network validation).

### 4.2 Worker Version Rollback
1. Execute `npx wrangler rollback` to revert immediately to the previous deployment artifact.
2. *Status*: Built-in Cloudflare feature; depends on live staging deployment in Phase 10.
