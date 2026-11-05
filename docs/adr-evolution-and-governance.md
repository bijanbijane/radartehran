# Architectural Decision Records (ADRs), Evolution Roadmap & Module Governance Inventory

## 1. Current Architecture Assessment & Maturity Summary (Prompts 150 & 600)

- **Frontend (`React 19 + TypeScript + Vite + Tailwind + Leaflet + Recharts`)**:
  - Appropriate for interactive spatial analytics across 190 multi-city neighborhoods.
  - Enforced Guardrails: All non-legacy files are strictly capped at `< 500` lines via `scripts/check-architecture.ts`.
- **Backend (`Express + TypeScript + S3-Compatible Object Storage + Firestore`)**:
  - Cohesive modular monolith on port `3000`. Background market pulse updates and orphan media sweeps run on bounded singleton timers (`ProcessResourceLifecycleManager`) with `SIGTERM`/`SIGINT` graceful shutdown.
  - Microservices, Kubernetes, distributed message brokers (Redis/BullMQ), and vector databases are **explicitly postponed** until sustained concurrent write throughput exceeds 500 req/s.

---

## 2. Retrospective Architectural Decision Records (Prompts 434 & 550)

| ADR ID | Title | Status | Core Decision & Evidence |
| :--- | :--- | :--- | :--- |
| **ADR-001** | Modular Monolith with Unidirectional Layer Ratchet | `ACCEPTED` | Single-process Express + Vite SPA governed by `scripts/check-architecture.ts` (`src/App.tsx` / `server.ts` → `src/components/*` → `src/data/*` → `src/utils/*` → `src/types/*`). |
| **ADR-002** | Single Source of Truth for Hedonic Property Valuation | `ACCEPTED` | `src/data/hedonicPricingEngine.ts` (`calculateHedonicValuation`, `FAST_SALE_FACTOR = 0.88`) is the sole canonical formula, verified by `buildReproducibleValuationTrace`. |
| **ADR-003** | Separation of Observational AQI vs. Algorithmic Traffic | `ACCEPTED` | Open-Meteo AQI carries station distance & observation timestamps (`src/data/driftRankingConsentAndEnvironment.ts`), whereas traffic is labeled `ALGORITHMIC_TIME_OF_DAY_MODEL_NOT_LIVE_SENSOR`. |
| **ADR-004** | Dual-Backend Object Storage with Two-Phase Deletion Journal | `ACCEPTED` | `src/utils/serverObjectStorage.ts` & `src/utils/deletionJournal.ts` validate magic bytes, transcode via Sharp (`<=800px` WebP), and enforce two-phase deletion recovery. |
| **ADR-005** | Privacy-Preserving Split Ownership for Public Bargain Listings | `ACCEPTED` | Public `/bargains/{id}` documents never store `userId`; ownership is isolated in private `/bargainOwners/{id}` and verified via batch writes in `firestore.rules`. |
| **ADR-006** | Debounced Atomic `0o600` Server Disk Persistence Without PII | `ACCEPTED` | `.cache-data.json` and `.runtime-config.json` write via PID+timestamp temp files + `fs.promises.rename` (`0o600`) and strictly exclude `SECRET_ENV_KEYS` and `buyerLeads`. |
| **ADR-007** | Multi-Provider Map Tile Proxy with Keyless OSM/SVG Failover | `ACCEPTED` | `/api/neshan-tile/:z/:x/:y` injects `VITE_NESHAN_API_KEY` server-side and falls back seamlessly to `/api/osm-tile/:z/:x/:y` and deterministic SVG tiles. |
| **ADR-008** | Automated Documentation-Drift & Release Quality Gate | `ACCEPTED` | `src/utils/documentationGovernanceAndDriftEngine.ts` and `npm test` block drift between Express routes, OpenAPI contracts, `.env.example`, `firestore.rules`, and Markdown docs. |

---

## 3. Module Governance & Ownership Inventory (Prompts 155 & 553)

| Module | Owner Group | Security Sensitivity | Primary Verification Suite |
| :--- | :--- | :--- | :--- |
| `src/data/hedonicPricingEngine.ts` | `CORE_PRICING` | `HIGH` | `tests/hedonic-and-627-debug.test.ts` |
| `src/data/valuationTraceAndComparables.ts` | `CORE_PRICING` | `HIGH` | `tests/prompts-106-to-145.test.ts` |
| `src/data/listingFraudAndAddressEngine.ts` | `CORE_PRICING` | `HIGH` | `tests/prompts-106-to-145.test.ts` |
| `src/data/driftRankingConsentAndEnvironment.ts` | `CORE_PRICING` | `STANDARD` | `tests/prompts-106-to-145.test.ts` |
| `src/utils/security.ts` | `SECURITY_AND_STORAGE` | `CRITICAL` | `tests/fifty-step-audit.test.ts` |
| `src/utils/serverIdempotencyAndConcurrency.ts` | `SECURITY_AND_STORAGE` | `CRITICAL` | `tests/prompts-106-to-145.test.ts` |
| `src/utils/serverForensicsAndIncidentResponse.ts` | `SECURITY_AND_STORAGE` | `CRITICAL` | `tests/prompts-106-to-145.test.ts` |
| `src/utils/serverAdminSodAndBackupSecurity.ts` | `SECURITY_AND_STORAGE` | `CRITICAL` | `tests/prompts-106-to-145.test.ts` |
| `src/utils/serverStoragePortabilityAndTracing.ts` | `SECURITY_AND_STORAGE` | `HIGH` | `tests/prompts-106-to-145.test.ts` |
| `src/utils/financialPrecisionAndUnits.ts` | `CORE_PRICING` | `CRITICAL` | `tests/prompts-106-to-145.test.ts` |
| `src/utils/aiGovernanceAndObservability.ts` | `AI_GOVERNANCE` | `HIGH` | `tests/prompts-106-to-145.test.ts` |
| `src/utils/engineeringAndMigrationGovernance.ts` | `SECURITY_AND_STORAGE` | `HIGH` | `tests/prompts-106-to-145.test.ts` |
| `src/utils/documentationGovernanceAndDriftEngine.ts` | `ARCHITECTURE_AND_DOCS` | `HIGH` | `tests/prompts-541-to-600-docs-ux-and-architecture.test.ts` |
| `src/utils/uxJourneyAndTrustAuditEngine.ts` | `UX_AND_ACCESSIBILITY` | `STANDARD` | `tests/prompts-541-to-600-docs-ux-and-architecture.test.ts` |
| `src/utils/architectureSolidAndMaturityEngine.ts` | `ARCHITECTURE_AND_DOCS` | `HIGH` | `tests/prompts-541-to-600-docs-ux-and-architecture.test.ts` |

---

## 4. Standardized Release Changelog & Prioritized Roadmaps (Prompts 555, 560, 580, 600)

### Release `v2.5.0` (2026-11-01)
- **Security & Governance**: Synchronized `API_ENDPOINT_CONTRACTS` (`/api/openapi.json`), `firestore.rules` documentation, and automated documentation-drift checks across all Markdown docs.
- **UX & Trust Transparency**: Codified the 10 core user-journey audits, 12-state interface completeness matrix, plain-Persian financial/calculator terminology, and data provenance badges (observational Open-Meteo AQI vs. user submissions vs. algorithmic estimates).
- **Architecture & Lifecycle**: Added deterministic `SIGTERM`/`SIGINT` graceful shutdown and `.unref()` background timer management in `server.ts`, plus pragmatic SOLID, concurrency, cache, and 12-dimension maturity verification in `src/utils/architectureSolidAndMaturityEngine.ts`.

