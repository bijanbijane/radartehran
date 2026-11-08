# Staging Observability & Telemetry Plan (Phase 10-A)
## Tehran Radar — Edge Monitoring, Error Tracking & Alert Thresholds

**Document Reference**: `docs/cloudflare/staging-observability-plan.md`  
**Phase**: 10-A (Staging Environment Preparation & Deployment Preflight)  
**Evaluation Date**: November 2026  
**Status**: `PREPARED_WITH_DOCUMENTED_LIMITATIONS`  
**Observability Setting**: `"observability": { "enabled": true }` configured in `wrangler.jsonc`.

---

## 1. Observability Architecture & Measurement Sources

To prevent misinterpreting elapsed wall-clock time as billed CPU time, Tehran Radar separates observability into two distinct sources:

```
+-----------------------------------------------------------------------------------------+
|                              OBSERVABILITY DATA STREAMS                                 |
+-----------------------------------------------------------------------------------------+
| [SOURCE A: APPLICATION-LEVEL LOGS]           | [SOURCE B: CLOUDFLARE PLATFORM METRICS]  |
| - Correlation ID (`cf_uuid` / `x-request-id`)| - Billed CPU Time (GraphQL Analytics)    |
| - Wall-Clock Duration (`Date.now() - start`) | - HTTP 1101/1102 Worker Script Crashes   |
| - Zero-PII Sanitized Envelopes               | - Isolate Memory Throttles & Kills       |
| - Structured Error Classifications           | - KV Read/Write Operations & Rate Limits |
| - Authorization Denials (RBAC / App Check)   | - R2 Class A & Class B Operations        |
| - Hedonic Model Drift Assertions             | - Queue Consumer Concurrency & DLQ Depth |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Core Operational Telemetry Indicators

| Metric / Indicator | Measurement Source | Target Threshold (Staging) | Critical Alert Threshold | Action on Breach |
|---|---|---|---|---|
| **Edge HTTP 5xx Rate** | Cloudflare Workers Analytics | $< 0.1\%$ | $\ge 1.0\%$ (over 5m window) | Trigger Runbook 1 (Disable route / rollback) |
| **Worker Script Exceptions** | Cloudflare Edge Error 1101/1102 | 0 occurrences | $\ge 3$ exceptions / 5m | Immediate Worker rollback to previous version |
| **Wall-Clock Latency (p95)** | Application Context (`durationMs`)| $< 120\text{ms}$ | $> 500\text{ms}$ | Inspect slow external JWKS or D1 query locks |
| **Billed CPU Time (p95)** | Cloudflare GraphQL Analytics | $< 5\text{ms}$ | $> 25\text{ms}$ (approaches 30ms limit)| Profile regex and cryptographic operations |
| **Dead-Letter Queue Count** | `radar-dead-letter-staging` depth | 0 messages | $\ge 5$ messages in DLQ | Inspect poison payload in DLQ; isolate sender |
| **Auth Verification Failures**| Application Log (`UNAUTHORIZED`)| Normal user errors | Spike $> 50$ / min | Investigate credential stuffing or expired JWKS |
| **App Check Rejections** | Application Log (`APP_CHECK_FAIL`)| $< 2\%$ | $> 20\%$ | Check client token generation & device attestation |
| **Hedonic Invariant Drift** | `marketIntelligenceEngine.ts` | $0.0\%$ (Must equal $0.88$)| Divergence $\ge 1\%$ | Immediate P0 alert; freeze valuation route |
| **D1 Query Failures** | D1 Error Interceptor | 0 failures | $\ge 2$ errors / min | Verify SQL syntax and migration table integrity |
| **R2 Storage Write Errors** | R2 API Response Catch | 0 failures | $\ge 3$ consecutive 503s | Check R2 bucket quota and permissions |

---

## 3. Structured Error Logging Schema (`worker/contextAndSecurity.ts` L288-308)

All application errors logged by the Worker follow this strict JSON schema:

```json
{
  "requestId": "req_550e8400-e29b-41d4-a716-446655440000",
  "correlationId": "cf_a1b2c3d4-e5f6-7890",
  "routeId": "POST /api/valuation/hedonic",
  "method": "POST",
  "pathname": "/api/valuation/hedonic",
  "status": 500,
  "durationMs": 4.2,
  "migrationStatus": "VERIFIED",
  "errorClassification": "SQL_STATEMENT_FAILED",
  "implementationId": "worker-foundation-v1",
  "timestampIso": "2026-11-08T17:22:00.000Z"
}
```

*Privacy Assurance*: The payload contains zero PII, zero tokens, and zero user phone numbers.
