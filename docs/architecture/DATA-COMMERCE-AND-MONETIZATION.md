# Radar Tehran — Digital Data Commerce, MCP & Monetization Architecture
**Document ID**: `docs/architecture/DATA-COMMERCE-AND-MONETIZATION.md`  
**Verification Date**: `2026-11-01`  
**Authority**: Master Engineering Protocol & Gold Master Cloud/AI/Commerce Architecture v1.0

---

## 1. Data Ownership, Privacy & Redistribution Audit

Before any dataset or API is exposed commercially, `auditDatasetCommercialEligibility` (`src/utils/dataCommerceMcpAndMonetization.ts`) enforces strict legal and privacy boundaries:

| Dataset / Resource | Source & Provenance | Contains PII? | Commercial Redistribution Status | Mandatory Controls |
| :--- | :--- | :--- | :--- | :--- |
| **Tehran & Multi-City Neighborhood Price Indexes** (`INITIAL_NEIGHBORHOODS`, `MULTI_CITY_CONFIGS`) | Radar Tehran curated & aggregated neighborhood baseline (`tehran`, `karaj`, `mashhad`, `isfahan`, `shiraz`). | **No** | `APPROVED_FOR_COMMERCIAL_API` | Include `lastUpdatedIso`, `provenance`, `units` (`MILLION_TOMAN`), and estimation disclaimer. |
| **Deterministic Hedonic Valuation Engine** (`calculateHedonicValuation`) | Radar Tehran proprietary PropTech calculation formula (`src/data/hedonicPricingEngine.ts`). | **No** | `APPROVED_FOR_COMMERCIAL_API_AND_MCP` | Expose via versioned API / MCP tool; never expose internal proprietary weight tables as raw database dumps. |
| **Environmental & AQI Observations** (`/api/air-quality`) | Aggregated public station data (Open-Meteo) + algorithmic time-of-day traffic model. | **No** | `APPROVED_WITH_ATTRIBUTION` | Must retain source attribution and explicit `ALGORITHMIC_TIME_OF_DAY_MODEL_NOT_LIVE_SENSOR` label for traffic. |
| **Buyer Alert Leads (`buyerLeads`)** | User-submitted phone numbers and budgets (`/api/buyer-alerts`). | **Yes (Phone & Name PII)** | `STRICTLY_PROHIBITED` | Bound by 90-day retention consent (`buyer-alert-2026-10-v1`); never exported to commercial APIs, MCP tools, or `.cache-data.json`. |
| **Sponsor CRM & Private Drafts (`sponsorRequests`, `bargainOwners`)** | Realtor CRM applications and user ownership records. | **Yes (Contact PII)** | `STRICTLY_PROHIBITED` | Restricted to verified platform administrators (`verifyAdminApiAuthorization`) and record owners. |

---

## 2. Versioned Commercial APIs & Authorized MCP Server Interface

### 2.1 Commercial API Contracts (`/api/v1/commerce/*`)
- `GET /api/v1/commerce/catalog`: Returns the list of legally distributable data products, schemas, units, update frequencies, and USD/Toman pricing metadata (including exchange rate source, rate, timestamp, and conversion policy).
- `GET /api/v1/commerce/neighborhood-index?city=tehran`: Returns versioned, provenance-tagged neighborhood price indexes (`buyPerSqm`, `rahn80m`, `zone`, `growth6m`) for authorized consumers or issues a standards-compliant `402 Payment Required` challenge.

### 2.2 Authorized MCP Tools (`/api/v1/mcp/execute`)
External AI agents are never granted raw database or SQL access. Only four validated, read-only tools are exposed:
1. `search_approved_market_data`: Filtered search across approved neighborhood indexes by city, maximum budget per sqm, and zone.
2. `get_neighborhood_statistics`: Retrieves provenance-tagged price, rent, and livability indicators for a specific neighborhood.
3. `compare_market_indicators`: Compares two neighborhoods using deterministic Radar Tehran metrics.
4. `compute_hedonic_valuation`: Runs `calculateHedonicValuation` with validated parameters (`basePricePerSqm`, `sqm`, `buildingAge`, `floor`, `totalFloors`, `hasElevator`, `hasParking`, `hasStorage`, `isRenovated`).

---

## 3. Conditional Cloudflare Monetization Gateway (`x402`) & Provider Independence

### 3.1 Eligibility Assessment
- Cloudflare Monetization Gateway / Pay Per Crawl (`x402`) is currently in **Beta / emerging standard status** and requires Cloudflare seller account onboarding and regional payment settlement support.
- Therefore, live Cloudflare Monetization Gateway settlement is classified as **`BLOCKED` (Account & Geographic Settlement Eligibility Unverified in Sandbox)**, while the **provider-independent x402 protocol contract and entitlement layer** are `IMPLEMENTED IN SOURCE` (`src/utils/dataCommerceMcpAndMonetization.ts`).

### 3.2 HTTP `402 Payment Required` (`x402`) Protocol Implementation
When an unentitled client requests a paid commercial resource without valid payment proof or API entitlement:
- Returns HTTP status **`402 Payment Required`** (never `403 Forbidden` as a substitute for payment challenge).
- Emits documented x402 headers:
  - `PAYMENT-REQUIRED`: JSON challenge specifying `version` (`x402-v1`), `productId`, `amountUsdMicros`, `amountToman`, `currency`, `recipient`, and `nonce`.
- When a client supplies `PAYMENT-SIGNATURE` and `PAYMENT-CONTEXT`:
  - The server cryptographically verifies the HMAC/signature and timestamp before granting access.
  - Distinguishes:
    - `402` (`PAYMENT_REQUIRED` / `PAYMENT_REJECTED` / `INVALID_PAYMENT_PROOF`)
    - `401` (`UNAUTHORIZED_ACCESS`)
    - `403` (`FORBIDDEN_RESOURCE` — e.g., attempting to access prohibited PII datasets)
    - `503` (`SERVICE_UNAVAILABLE`)

### 3.3 Strict Separation of Simulation vs. Settled Revenue
- Payment authorizations (`authorizedPaymentsCount`), confirmed settlements (`confirmedSettlementsCount`), and simulated preview transactions (`simulatedTransactionsCount`) are tracked in separate ledgers.
- Every simulated payment response carries the mandatory banner:
  `SIMULATION — NO REAL PAYMENT OR SETTLEMENT`
- Simulated transactions never increment `actualSettledRevenueUsdMicros` or `actualSettledRevenueToman`.
