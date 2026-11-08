# Property Search & Discovery Backend Architecture & Handoff Report

- **Module Path:** `server/modules/property-search/`
- **Target Branch:** `feature/backend-property-search`
- **Version:** `v1.0.0`

---

## 1. Module Boundaries & Data Ownership

### What this module owns:
- Search request schemas (`PropertySearchRequest`, `PropertySearchQueryFilters`)
- Search query normalization and validation (`PropertySearchValidationError`, `validateAndNormalizeSearchFilters`)
- Search execution orchestration pipeline (`executePropertySearchPipeline`)
- Search ranking and sorting algorithms (`calculateOrganicRelevanceScore`, `sortSearchResults`)
- Search-result cursor pagination (`encodeCursor`, `decodeCursor`)
- Multi-modal search suggestions (`SuggestionsAndHistoryService`)
- Search analytics contracts and performance telemetry aggregation
- Search-specific caching policies (`InMemorySearchCacheAdapter`, auth-scoped key generation)
- User-owned saved searches and permitted search history (`StoredPropertySavedSearch`, `StoredSearchHistoryRecord`)

### What this module does NOT own:
- **Property Listings & Moderation:** Owned by `server/modules/bargains/` and platform listings. Search consumes approved, non-expired listings via `ListingDataSourceAdapter`.
- **Geographic Hierarchy:** Owned by `server/modules/geography/`. Search resolves cities, districts, neighborhoods, bounding boxes, and proximities via `GeographySearchAdapter`.
- **Property Valuation:** Owned by `server/modules/valuation/`. Search consumes benchmark estimates via `ValuationSearchAdapter` strictly for comparison metrics without substituting estimates for asking prices.
- **Sponsorship & Ad Slots:** Owned by `server/modules/sponsors/`. Search queries active neighborhood placements via `SponsorsSearchAdapter` and returns them segregated in `sponsoredPlacements`.
- **Buyer Alerts:** Owned by `server/modules/buyer-alerts/`. Saved searches represent stored query parameters for a user; notification subscriptions belong to Buyer Alerts.
- **User Authentication:** Verified principal identities are obtained through Core token verification contracts (`ownerUid`).

---

## 2. Integration Contracts & Adapter Interfaces

To prevent cross-module collection coupling and circular dependencies, `server/modules/property-search/` defines explicit adapter interfaces in `contracts.ts`:

1. **`ListingDataSourceAdapter`**:
   - `queryApprovedListings(params)`: Queries public, moderated listings with bounded batch limits.
   - `getListingById(id)`: Reads an individual listing by ID.
2. **`GeographySearchAdapter`**:
   - `resolveLocation(text, cityScopeId)`: Normalizes Persian location text and maps to canonical city/district/hood.
   - `getNeighborhoodInfo(cityId, hoodId)`: Returns center coordinates and bounding boxes.
   - `getNeighborhoodsInDistrict(cityId, districtIdOrNum)`: Expands a district into member neighborhood IDs.
   - `getNearbyNeighborhoods(lat, lng, radiusMeters)`: Returns neighborhood IDs within proximity radius.
   - `getAllSupportedCities()`: Returns supported cities (Tehran, Karaj, Mashhad, Isfahan, Shiraz).
3. **`ValuationSearchAdapter`**:
   - `getValuationBenchmark(params)`: Returns estimated market value and confidence score for analytical filtering.
4. **`SponsorsSearchAdapter`**:
   - `getActivePlacementsForSlot(cityId, hoodId)`: Returns active verified sponsor placements for a neighborhood.
5. **`SearchCacheAdapter`**:
   - Partition-safe cache interface with `get`, `set`, and targeted invalidation methods.
6. **`SavedSearchRepositoryAdapter` & `SearchHistoryRepositoryAdapter`**:
   - Persistent storage operations for search-owned collections with ownership verification.

---

## 3. Ranking Model & Anti-Slop Integrity

Organic relevance scoring (`calculateOrganicRelevanceScore`) is deterministic, reproducible, and ranges from 0 to 100 points:
1. **Keyword Text Match (Weight: 35 points):** Exact phrase match in title (35 pts), in street/description (25 pts), or token matches (10-20 pts).
2. **Category & Subtype Specificity (Weight: 20 points):** Exact category and subtype match (20 pts), category match (15 pts).
3. **Geographic Specificity (Weight: 20 points):** Exact neighborhood target match (20 pts), city match (10 pts).
4. **Valuation Attractiveness Benchmark (Weight: 15 points):** Verified bargain (asking price <= 95% of valuation estimate) receives 15 pts; fair price receives 10 pts.
5. **Verified Listing Status (Weight: 10 points):** Listing carries verified official/cadastral status (10 pts).

**Sponsored Placement Separation:**
Sponsored items are returned in the dedicated field `sponsoredPlacements` (with agency name, phone, specialty, and official neighborhood badge label). They are **never** injected into the `items` array or given artificial organic relevance points.

---

## 4. Pagination & Query Safety

- **Cursor-Based Pagination:** Encodes `{ offset: number }` in URL-safe base64.
- **Deterministic Ordering:** Every sort mode employs `publishedAtIso` (descending) followed by `id` (ascending) as tie-breakers. This guarantees that pagination across pages never produces duplicate items or shifts items between pages.
- **Bounded Query Limits:** Request `limit` is validated to `[1, 100]` (default 20). Unbounded collection scans are prevented.

---

## 5. Security & Privacy Guarantees

1. **Visibility Enforcement:** Only approved, non-expired listings are discoverable through public search.
2. **Owner-Scoped Saved Searches:** All mutation and retrieval methods (`listUserSavedSearches`, `updateSavedSearch`, `deleteSavedSearch`) verify that `ownerUid` matches the stored record, preventing horizontal privilege escalation.
3. **Cache Partitioning:** Cache keys (`generateCacheKey`) incorporate an authorization scope (`public`, `admin`, or `user_{uid}`) to prevent private search results from being served to public callers.

---

## 6. Route Registration Guidance for Integration Lead

To expose the search module over HTTP, the integration lead should mount the following endpoints in the API router (e.g. `server.ts` or a designated route catalog):

- `POST /api/v1/properties/search` -> `service.searchProperties(req.body)`
- `GET /api/v1/properties/suggestions` -> `service.getSuggestions(req.query)`
- `POST /api/v1/properties/saved-searches` -> `service.saveSearch(req.user.uid, req.body)`
- `GET /api/v1/properties/saved-searches` -> `service.listUserSavedSearches(req.user.uid)`
- `PUT /api/v1/properties/saved-searches/:id` -> `service.updateSavedSearch(req.user.uid, req.params.id, req.body)`
- `DELETE /api/v1/properties/saved-searches/:id` -> `service.deleteSavedSearch(req.user.uid, req.params.id)`
- `GET /api/v1/properties/search-history` -> `service.getUserSearchHistory(req.user.uid)`
- `DELETE /api/v1/properties/search-history` -> `service.clearUserSearchHistory(req.user.uid)`
- `GET /api/v1/properties/search-metrics` -> `service.getPerformanceMetrics(req.query.from, req.query.to)` (Admin only)
