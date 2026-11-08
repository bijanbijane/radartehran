# Staging Data Governance & Synthetic Fixtures Policy (Phase 10-A)
## Tehran Radar — Data Privacy, Synthetic Generation & Retention Rules

**Document Reference**: `docs/cloudflare/staging-data-policy.md`  
**Phase**: 10-A (Staging Environment Preparation & Deployment Preflight)  
**Evaluation Date**: November 2026  
**Status**: `PREPARED_WITH_DOCUMENTED_LIMITATIONS`  
**Privacy Mandate**: Absolute prohibition of production PII or real transaction records in staging.

---

## 1. Zero Production PII Policy

Staging environments must **never** ingest, clone, or mirror live production user accounts, phone numbers, Iranian national IDs, banking cards, or confidential lead submissions.

All data in the staging environment must be:
1. **100% Synthetic**: Generated algorithmically using known test templates.
2. **Explicitly Tagged**: All database records and JSON payloads must include `is_synthetic: true` and `data_tier: "STAGING_TEST"`.
3. **Visually Distinct**: Property titles in staging must be prefixed with `[تستی - استیجینگ]` to prevent search engine indexing or public confusion with live listings.

---

## 2. Staging Persona & Actor Strategy

| Persona | Staging Identifier | Authentication Method | Permissions Granted | Scope of Action |
|---|---|---|---|---|
| **Synthetic Public User** | `user_synth_001@example.com` | Firebase Staging Auth (Test Phone / Password) | `USER` | Search, compare neighborhoods, view synthetic listings. |
| **Synthetic Real Estate Agent**| `agent_synth_tehran@example.com` | Firebase Staging Auth | `AGENT` | Create synthetic listing drafts, test media uploads to staging R2. |
| **Synthetic Staging Admin** | `admin_staging_audit@example.com` | Staging Auth + `ADMIN_API_SECRET` | `ADMIN` | Test administrative endpoints, verify queue health, inspect staging logs. |

*Rule*: Staging administrators have zero access or authority in production Firestore or production Cloudflare Workers.

---

## 3. Synthetic Data Categories & Fixtures

### 3.1 Synthetic Listings & Benchmarks
- Neighborhood price benchmarks in D1/Firestore staging are seeded from deterministic mock datasets (e.g. `tests/fixtures/synthetic-benchmarks.json`).
- Synthetic listing coordinates are constrained to public district centers (e.g. District 1, 2, 3, 5, 6) with randomized slight offsets ($\pm 0.005^{\circ}$).

### 3.2 Media Fixtures Policy (Staging R2)
- Upload tests must only use synthetic test fixtures (e.g. 1x1 test PNGs, sample floorplan drawings).
- Staging R2 bucket objects must be tagged with `Environment: Staging` and `Synthetic: True`.

### 3.3 Test Data Retention & Automatic Cleanup
- **Automatic Purge Cycle**: Staging media files and temporary queue records older than **14 days** are purged via scheduled cleanup scripts.
- **On-Demand Wipe**: The operator can trigger a complete wipe of the staging D1 database and staging R2 bucket without impacting any production service:
  ```bash
  # Drops and recreates staging D1 schema in Phase 10-B
  npx wrangler d1 execute radartehran-staging-db --file=worker/db/migrations/0001_initial_schema.sql
  ```

---

## 4. Legal-Hold & Production Data Isolation
Staging data is explicitly excluded from enterprise legal holds, financial audits, and public Hedonic statistical reporting. Hedonic model telemetry in staging is classified as `RESTRICTED_OPERATIONAL` and does not feed production pricing models.
