# Employee 5: Telemetry and Data Processing Backend

Module Directory: `/server/modules/telemetry/`

## Architecture Overview
The Telemetry & Data Processing module provides a privacy-first, memory-bounded, durable ingestion and aggregation pipeline for Radartehran.

### Key Components
1. **Schema Validation & PII Neutralization (`telemetryValidator.ts`)**:
   - Rejects illegal PII keys (e.g. `uid`, `phone`, `email`, `national_id`, `iban`, `token`, `coordinates`).
   - Deep-scans dimensions and metadata against regex patterns for Iranian mobile numbers, national IDs, and payment card numbers.
   - Rotates daily anonymous salts for pseudonymized session hashing.
2. **Durable Buffer Queue (`telemetryBufferQueue.ts`)**:
   - Write-ahead append-only NDJSON disk journaling (`0o600` permissions) partitioned by Tehran date keys.
   - In-memory LRU deduplication window preventing duplicate event processing across server restarts.
   - Bounded partition file size limit (16MB hard limit) preventing disk exhaustion.
3. **Bounded Aggregator & k-Anonymity (`telemetryAggregator.ts`)**:
   - Aggregates raw micro-events into neighborhood and city-level metrics (sum, avg, p50, p95).
   - Enforces strict k-anonymity: aggregated metrics for any cell are completely redacted if distinct sessions are fewer than 15 (`minDistinctSessionsForKAnonymity: 15`).
   - Bounded capacity (max 2,000 buckets) preventing unbounded RAM growth.
4. **Master Service Orchestrator (`telemetryService.ts`)**:
   - Coordinates validation, durable queue enqueueing, and aggregation updates.
   - Provides operational error metrics, queue size inspection, and partition retention purging.
5. **Express Route Handlers (`telemetryRoutes.ts`)**:
   - `POST /api/v2/telemetry/events`: Bounded batch ingestion with rate limiting.
   - `GET /api/v2/telemetry/aggregates`: Reads aggregated analytics with k-anonymity guarantees.
   - `GET /api/v2/telemetry/diagnostics`: Operational status, error counts, and queue buffer health.
   - `POST /api/v2/telemetry/retention/purge`: Purges expired NDJSON journal partitions past retention limit.

## Integration Handoff
To mount this module in the main application:
```typescript
import { registerTelemetryModuleRoutes } from './modules/telemetry';

// Inside server setup:
registerTelemetryModuleRoutes(app, { checkRateLimit, getClientIp });
```
