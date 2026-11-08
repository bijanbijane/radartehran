# Comprehensive Backend Audit, Data Integrity & Inter-Module Contract Verification Plan

## User Review & Critical Decisions

Following the interactive requirements clarification in Turn 1, the user established two core directives:
1. **Scope**: Comprehensive audit of the entire server runtime and all 18 backend domain modules (`server/modules/*` + `server.ts`).
2. **Primary Objective**: Verify end-to-end data integrity, inter-module contract consistency, and strict prevention of data leakage between bounded contexts.

---

## 1. Overview & Core Concept

Tehran Radar's backend is a modular distributed monolith serving real estate valuation, spatial search, market analytics, sponsor reservations, and external data ingestion. Over recent development phases, multiple domain modules (such as `geography`, `property-search`, `data-ingestion`, `valuation`, `bargains`, `buyer-alerts`, and `media`) were implemented or enhanced with explicit module isolation rules.

This comprehensive audit and debugging plan systematically verifies:
- **Contract Parity**: Interfaces, adapters, and data transfer objects (DTOs) between modules communicate through typed contracts without leaky abstractions or direct database access across boundaries.
- **Data Integrity & Invariants**: Monotonic pricing rules, separate transaction types (mortgage/rent vs. sale), coordinates and CRS transformations (`EPSG:4326`, `EPSG:3857`, `EPSG:32639`), and sanitized Persian text inputs.
- **Security & Privacy Invariants**: Zero leakage of seller PII (phone numbers, national IDs, precise residential coordinates) to public projections, and atomic disk writes with restricted permissions (`0o600`).
- **Route Catalog & Schema Alignment**: Synchronization between `server.ts`, `API_ENDPOINT_CONTRACTS` (`serverConfigValidator.ts`), `RADAR_API_ROUTE_INVENTORY`, and the OpenAPI 3.1 specification.

---

## 2. User & Developer Experience (Contracts & Diagnostics)

While the backend operates headless, its developer and operator experience directly impacts system stability, observability, and client error handling:

- **Consistent Error Envelope**: Every backend route must return standardized JSON errors (`error`, `code`, `details`, `timestamp`) with proper HTTP status codes (400 for validation, 401/403 for authentication/authorization, 404 for missing entities, 429 for rate-limits, and 500 for unexpected runtime faults).
- **Graceful Degradation & Fallbacks**: Spatial queries and map lookups must fall back gracefully (e.g. bounding box fallback when spatial polygons or H3 indexes are unavailable) without crashing the server.
- **Contract Transparency**: Search, valuation, and market analytics payloads must provide explicit explainability breakdowns without exposing private pricing factors or internal database keys.

---

## 3. Key Architectural Decisions & Trade-Offs

| Decision | Selected Strategy | Rationale & Trade-off |
| :--- | :--- | :--- |
| **Cross-Module Communication** | Explicit Adapter Pattern (`*Adapter.ts`) | Modules never import internal database collections or private entities of other modules. Eliminates tight coupling at the cost of lightweight mapper boilerplate. |
| **Transaction Separation** | Strict separation of Sale (`salePrice`) and Rental (`deposit` + `monthlyRent`) | Combining them into a single polymorphic number field causes pricing distortion and hedonic calculation corruption. |
| **Spatial Privacy** | Redacted `toPublicSafeAddressView` for client payloads | Exposes neighborhood-level centroid and jittered bounds to unauthenticated users; exact address is gated behind verified authorization. |
| **Line-Count Governance** | Strict `< 500` lines ratchet per file (`AGENTS.md`) | Prevents monolithic module rot and keeps files easily reviewable and maintainable. |
| **Route Registration** | Centralized in `server.ts` + typed contracts in `expressRouteCatalog.ts` | Disallows ad-hoc route mounting inside submodules; all routes are cataloged, typed, and validated against OpenAPI contracts. |

---

## 4. Technical Architecture & Module Topology

```
+--------------------------------------------------------------------------------------------------+
|                                    Express Backend (server.ts)                                   |
|             Port 3000 | Middleware Mode | Security Headers | Rate Limiters | Auth Guard           |
+--------------------------------------------------------------------------------------------------+
                                                 |
         +---------------------------------------+---------------------------------------+
         |                                       |                                       |
+------------------+                   +--------------------+                  +--------------------+
|  Property Search |                   |     Geography      |                  |     Valuation      |
|  & Discovery     |<---[GeoAdapter]---|  & Spatial Intel   |---[ValAdapter]-->|  Hedonic Engine    |
| (property-search)|                   |    (geography)     |                  |    (valuation)     |
+------------------+                   +--------------------+                  +--------------------+
         |                                       |                                       |
         | [ListingAdapter]                      | [SpatialResolution]                   | [MarketPriceData]
         v                                       v                                       v
+------------------+                   +--------------------+                  +--------------------+
|     Bargains     |                   |   Data Ingestion   |                  |  Market Analytics  |
|  & Market Pulse  |<--[IngestAdapter]-|   & Connectors     |----------------->|    & Telemetry     |
|    (bargains)    |                   |  (data-ingestion)  |                  | (market-analytics) |
+------------------+                   +--------------------+                  +--------------------+
         |                                       |                                       |
         v                                       v                                       v
+------------------+                   +--------------------+                  +--------------------+
| Buyer Alerts &   |                   | Sponsor Placement  |                  | Professional Verif |
| Notifications    |                   | & Safe Projections |                  | & Account Lifecycle|
|  (buyer-alerts)  |                   |    (sponsors)      |                  | (professional-ver) |
+------------------+                   +--------------------+                  +--------------------+
```

### Module Responsibilities & Audit Checklist

1. **`server/modules/geography`**:
   - 265 Canonical neighborhoods across 5 key cities (Tehran, Karaj, Mashhad, Isfahan, Shiraz).
   - Coordinate Reference Systems: `EPSG:4326` (WGS84), `EPSG:3857` (Web Mercator), `EPSG:32639` / `32640` (UTM Zones).
   - Address privacy projection: `toPublicSafeAddressView` stripping precise coordinates from unauthenticated responses.
2. **`server/modules/property-search`**:
   - Multi-category discovery: residential, commercial, office, land.
   - Separate transaction pricing: `salePrice` vs `deposit` & `monthlyRent`.
   - Persian text normalization and query validation via `domain/SearchQueryValidator`.
   - Cursor-based deterministic pagination and saved-search user isolation.
3. **`server/modules/valuation`**:
   - Single source of truth for hedonic valuation: `calculateHedonicValuation` with `FAST_SALE_FACTOR = 0.88`.
   - Monotonic property age, floor level, and elevator penalty factors.
4. **`server/modules/data-ingestion`**:
   - SSRF protection on external connectors (`validateSafeExternalUrl` blocking private RFC 1918 IPs).
   - Quarantine import pipeline preventing unverified external records from poisoning canonical datasets.
5. **`server/modules/sponsors` & `bargains`**:
   - Sponsor placement deduplication, slot reservation locks, and strict public/private projection separation.
   - Publisher bargain verification, moderation transitions, and cascade cleanup.
6. **`server/modules/buyer-alerts` & `notifications`**:
   - Rate-limited notification queues, idempotency keys, and subscriber ownership checks.
7. **`server/modules/account-lifecycle` & `professional-verification`**:
   - Soft-delete cascades, cryptographic audit trails, and minimum-disclosure public credentials.

---

## 5. Step-by-Step Diagnostic & Execution Plan

### Step 1: Comprehensive Test Execution Across All 18 Modules
- Execute all 16 module test suites in `server/modules/**` and root test suites (`test:contracts`, `test:unit`, `test:storage`, `test:security`).
- Catalog any failing assertions, edge cases, or timing race conditions.

### Step 2: Inter-Module Adapter & Data Contract Audit
- Verify that adapters (`ListingDataSourceAdapter`, `GeographySearchAdapter`, `ValuationSearchAdapter`, `SponsorsSearchAdapter`) strictly isolate module domains.
- Validate that zero modules bypass adapter interfaces or make direct calls to private collections of other modules.
- Ensure that property categories (residential, commercial, office, land) conform to the shared schemas.

### Step 3: Express Route Catalog & Contract Parity Check
- Verify `server.ts` routes against `API_ENDPOINT_CONTRACTS` in `src/utils/serverConfigValidator.ts` and `RADAR_API_ROUTE_INVENTORY` in `src/utils/apiContractsAndSerializationEngine.ts`.
- Ensure all route parameter schemas, error responses, and payload validators (`validateApiRequestPayload`) match expected types.

### Step 4: Security, Privacy & Invariant Verification
- Confirm SSRF protections, atomic disk writes (`0o600`), and zero PII leakage in public search results and listing views.
- Verify `escapeHtmlAttr()` usage on any server-generated dynamic HTML attributes.
- Ensure no raw API keys or secrets are written to runtime configuration or logs.

### Step 5: Architecture & Ratchet Compliance
- Run `npm run arch:check` to ensure all files remain strictly `< 500` lines and conform to the architectural boundary ratchet.
- Co-execute `compile_applet` and `lint_applet` for full zero-error TypeScript validation.

---

## 6. Verification Criteria & Deliverables

1. All module unit and integration tests passing (`server/modules/**/__tests__/*.ts`).
2. Core contract test suites passing (`test:contracts`, `test:unit`, `test:storage`, `test:security`).
3. `npm run arch:check` passing with zero line-count violations or illegal import boundaries.
4. `compile_applet` and `lint_applet` passing with zero TypeScript and ESLint errors.
5. Diagnostic report summarizing all verified modules, contracts, and data invariants.
