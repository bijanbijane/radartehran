# Data Acquisition Methodology — Tehran Radar
## Systematic Ingestion, Provenance, Normalization & Quality Assurance Lifecycle

- **Methodology Version**: `2.0`
- **Framework**: Bounded ETL / Event-Driven SWR Architecture
- **Compliance**: Zero PII, RFC-3986 URL safety, XSS-neutralizing sanitizer

---

## 1. Ten-Step Acquisition Lifecycle

```
[1. Discovery] ──► [2. Transport & Politeness] ──► [3. Size & Format Guard]
                                                             │
[6. Deduplication] ◄── [5. Range Validation] ◄── [4. Strict Schema Parse]
        │
        ▼
[7. Provenance Tagging] ──► [8. Non-Destructive Update] ──► [9. Atomic Persistence] ──► [10. Audit Log]
```

1. **Discovery & Verification**:
   - Verify that the target source URL, endpoint, or document catalogue exists before initiating network calls.
   - Never infer schema from page title or assume undocumented routes.
2. **Transport & Politeness**:
   - Use standard HTTP `GET` with bounded timeouts (`AbortSignal.timeout(4500)`).
   - Send legitimate, descriptive user-agent headers.
   - Enforce minimum interval cooldowns between consecutive fetches.
3. **Payload Size & Format Guard**:
   - Check `Content-Length` header before consuming body.
   - Reject any upstream response exceeding 350 KB for HTML/text or 256 KB for JSON.
4. **Strict Schema Parsing**:
   - Explicitly extract and cast typed fields. Never use blind object spreading (`{ ...upstreamData }`).
   - Sanitize all strings using `sanitizeInput(str, maxLength)` to strip `<script>`, HTML tags, and attribute breakout quotes.
5. **Numeric Range & Domain Validation**:
   - Clamping and boundary verification:
     - Real estate price per sqm: `5,000,000` to `500,000,000` Tomans.
     - Metric area: `30` to `500` m².
     - Air Quality Index (AQI): `0` to `500`.
     - PM2.5: `0` to `1000` µg/m³.
6. **Deduplication & Anomaly Detection**:
   - Detect duplicate listings or records by calculating deterministic hashing (e.g., token or normalized title + price + sqm).
   - Filter out deceptive presale, mortgage-only, or non-residential records via regex filters.
7. **Provenance & Attribution Tagging**:
   - Attach mandatory metadata to every record:
     - `sourceId`: e.g., `'cbi_monthly'`, `'data_tehran_yearbook'`, `'open_meteo'`, `'tgju_gold'`
     - `fetchedAtIso`: Exact UTC timestamp
     - `qualityStatus`: `'verified_live'` | `'cached_or_fallback'`
     - `attribution`: Official publisher entity
8. **Non-Destructive Historical Preservation**:
   - Never overwrite historical time-series observations.
   - Retain previous valid snapshot if upstream fetch fails (Circuit Breaker pattern).
9. **Atomic Persistence**:
   - Persist memory state to disk using atomic two-phase write: write to `.tmp.${pid}.${Date.now()}` with `0o600` permissions, then atomic rename to target `.cache-data.json`.
10. **Telemetry & Audit Logging**:
    - Record success, warning, or failure in circular `serverAuditLogs` buffer (max 200 entries).
