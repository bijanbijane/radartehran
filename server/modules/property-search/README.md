# Property Search & Discovery Backend Module (`server/modules/property-search/`)

**Exclusive Module Owner:** Employee (Property Search & Discovery Backend)  
**Assigned Branch:** `feature/backend-property-search`  
**Exclusive Directory:** `server/modules/property-search/`

---

## 1. Mission & Responsibilities

`server/modules/property-search/` is the independent, scalable, secure, and deterministic property search and discovery engine for Tehran Radar. It provides high-performance search orchestration across all supported Iranian property types and transaction models without ever acting as a duplicate database of property records.

### Core Capabilities:
1. **Multi-Category Discovery:**
   - Residential properties (Apartment, Villa, Penthouse, Residential Complex)
   - Commercial properties (Shop, Commercial Unit, Mall Booth, Showroom)
   - Office properties (Administrative Office, Medical Office, Commercial Office)
   - Land & Plots (Residential Plot, Commercial Plot, Agricultural Land, Industrial Land)
2. **Transaction Separation:**
   - Sale & Purchase (`sale` / `خرید`) with asking prices and price per square meter.
   - Rental (`rent` / `اجاره`) with monthly rent and security deposit (`رهن`).
3. **Geographic Filtering & Resolution:**
   - City, District, Neighborhood, Bounding Box (`EPSG:4326`), and Proximity search consumed exclusively through the Geography module adapter (`GeographySearchAdapter`).
4. **Deterministic Ranking & Sorting:**
   - Newest, Oldest, Lowest Price, Highest Price, Smallest Area, Largest Area, Proximity, and Organic Relevance.
   - Documented relevance scoring model (0 to 100 points) based on explicit factors: Keyword Match (35), Category & Subtype (20), Geographic Target (20), Valuation Attractiveness (15), and Verified Listing Status (10).
   - Sponsored placements are clearly segregated into `sponsoredPlacements` and strictly forbidden from inflating organic relevance.
5. **Stable Cursor Pagination:**
   - Bounded page limits (1 to 100, default 20) with deterministic tie-breakers (`publishedAtIso` desc, `id` asc) preventing duplicates across pages.
6. **Search Suggestions & History:**
   - Multi-modal suggestions for cities, neighborhoods, property types, and common filter presets.
   - Consent-gated recent search history recording.
7. **Saved Searches:**
   - User-owned saved query configurations with strict ownership isolation (read/update/delete restricted to verified `ownerUid`). Completely distinct from Buyer Alert subscriptions.
8. **Partition-Safe Caching & Telemetry:**
   - Pluggable cache abstraction (`SearchCacheAdapter`) with auth-scoped, normalized cache keys and invalidation triggers on neighborhood/listing changes.
   - Analytics metrics summary for search volume, zero-result rates, latency, and popular filters.

---

## 2. Directory Layout

| File | Description | Line Count |
|---|---|---|
| `types.ts` | Data models, search query filters, aggregations, saved searches, and analytics types | < 450 |
| `contracts.ts` | Adapter interfaces for Listings, Geography, Valuation, Sponsors, Caching, and Repositories | < 350 |
| `validation.ts` | Request schema validation, contradictory range rejection, and Persian text normalizer | < 400 |
| `rankingAndSorting.ts` | Deterministic sorting, Haversine geo-distance, and documented organic relevance model | < 350 |
| `queryExecutor.ts` | Filter evaluation, cursor pagination, facet aggregation, and search pipeline orchestration | < 450 |
| `suggestionsAndHistoryService.ts` | Search suggestions, saved search CRUD with ownership isolation, and history recording | < 400 |
| `service.ts` | `PropertySearchService` facade unifying search, suggestions, saved searches, and cache | < 400 |
| `index.ts` | Module barrel exports | < 150 |
| `__tests__/propertySearch.test.ts` | Comprehensive automated test suite covering all 18 requirements | < 450 |
| `docs/ARCHITECTURE-AND-HANDOFF.md` | In-depth architecture specification and integration lead handoff report | — |

---

## 3. Verification Commands

```bash
# Run property-search unit tests
npx tsx --test server/modules/property-search/__tests__/propertySearch.test.ts

# Run repository lint & architecture rules check
npm run lint
npm run arch:check
```
