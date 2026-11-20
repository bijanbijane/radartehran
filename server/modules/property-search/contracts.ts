/**
 * Property Search & Discovery Backend Integration Contracts & Adapter Interfaces
 * (`server/modules/property-search/contracts.ts`)
 * Exclusive ownership: `server/modules/property-search/`
 */

import type {
  PropertyCategory,
  PropertySearchQueryFilters,
  PropertySearchResponse,
  SearchAnalyticsEvent,
  SearchDealType,
  SearchPerformanceMetricsSummary,
  SearchPropertyItem,
  SponsoredSearchPlacement,
  StoredPropertySavedSearch,
  StoredSearchHistoryRecord,
} from './types';

/**
 * Adapter contract for reading public, approved, non-expired property listings from source modules
 * (e.g. Bargains or Platform Listings) without coupling to Firestore or internal databases directly.
 */
export interface ListingDataSourceAdapter {
  queryApprovedListings(params: {
    category?: PropertyCategory;
    dealType?: SearchDealType;
    cityId?: string;
    neighborhoodIds?: number[];
    limit: number;
    offset?: number;
    minAskingPriceMillion?: number;
    maxAskingPriceMillion?: number;
    minAreaSqm?: number;
    maxAreaSqm?: number;
    bedroomsMin?: number;
    constructionStatus?: string;
    verifiedOnly?: boolean;
    boundingBox?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  }): Promise<{
    listings: SearchPropertyItem[];
    totalEstimated: number;
    sourceExhausted?: boolean;
  }>;

  getListingById(id: string): Promise<SearchPropertyItem | null>;
}

/**
 * Adapter contract for consuming authoritative geographic resolutions from the Geography module.
 */
export interface GeographySearchAdapter {
  resolveLocation(
    text: string,
    cityScopeId?: string,
  ): Promise<{
    resolved: boolean;
    cityId?: string;
    districtId?: string;
    hoodId?: number;
    displayNameFa?: string;
    matchType?: string;
  }>;

  getNeighborhoodInfo(
    cityId: string,
    hoodId: number,
  ): Promise<{
    cityId: string;
    hoodId: number;
    hoodNameFa: string;
    districtNumber?: number;
    center?: { lat: number; lng: number };
    boundingBox?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  } | null>;

  getNeighborhoodsInDistrict(cityId: string, districtIdOrNum: string | number): Promise<number[]>;

  getNearbyNeighborhoods(lat: number, lng: number, radiusMeters: number): Promise<number[]>;

  getAllSupportedCities(): Promise<{ id: string; nameFa: string; nameEn: string }[]>;
}

/**
 * Adapter contract for consuming valuation benchmarks from the Valuation module.
 * Explicit invariant: Estimated values are only used for comparison metrics, never substituted for asking prices.
 */
export interface ValuationSearchAdapter {
  getValuationBenchmark(params: {
    cityId: string;
    hoodId: number;
    category: PropertyCategory;
    dealType: SearchDealType;
    sqm: number;
  }): Promise<{
    estimatedMarketValueMillion: number;
    confidence: 'high' | 'moderate' | 'low';
    benchmarkDateIso: string;
  } | null>;
}

/**
 * Adapter contract for consuming sponsored placements from the Sponsors module.
 * Invariant: Placements are strictly partitioned from organic search scores.
 */
export interface SponsorsSearchAdapter {
  getActivePlacementsForSlot(cityId: string, hoodId: number): Promise<SponsoredSearchPlacement[]>;
}

/**
 * Pluggable caching adapter.
 * Invariant: Cache is never the authoritative source of truth.
 * Public and private results do not share cache entries.
 */
export interface SearchCacheAdapter {
  isConfigured: boolean;
  get(key: string): Promise<PropertySearchResponse | null>;
  set(key: string, value: PropertySearchResponse, ttlSeconds?: number): Promise<void>;
  invalidateForNeighborhood(cityId: string, hoodId: number): Promise<void>;
  invalidateForListing(listingId: string): Promise<void>;
}

/**
 * Persistence adapter for user-owned saved searches.
 * Owned exclusively by the property-search module.
 */
export interface SavedSearchRepositoryAdapter {
  createSavedSearch(record: StoredPropertySavedSearch): Promise<void>;
  getSavedSearchById(id: string): Promise<StoredPropertySavedSearch | null>;
  listSavedSearchesByOwner(ownerUid: string, limit?: number): Promise<StoredPropertySavedSearch[]>;
  updateSavedSearch(
    id: string,
    ownerUid: string,
    updates: Partial<Pick<StoredPropertySavedSearch, 'titleFa' | 'filters' | 'sortMode' | 'notifyOnNewMatches'>>,
  ): Promise<StoredPropertySavedSearch | null>;
  deleteSavedSearch(id: string, ownerUid: string): Promise<boolean>;
}

/**
 * Persistence adapter for user search history.
 * Requires user consent; strictly stores query metadata without sensitive PII.
 */
export interface SearchHistoryRepositoryAdapter {
  recordQuery(record: StoredSearchHistoryRecord): Promise<void>;
  getRecentQueries(userUid: string, limit?: number): Promise<StoredSearchHistoryRecord[]>;
  clearHistory(userUid: string): Promise<void>;
}

/**
 * Analytics sink for search telemetry (zero-result rate, latency, popular filters).
 */
export interface SearchAnalyticsSinkAdapter {
  recordSearchEvent(event: SearchAnalyticsEvent): Promise<void>;
  getMetricsSummary(periodStartIso: string, periodEndIso: string): Promise<SearchPerformanceMetricsSummary>;
}

/**
 * Dependency container for PropertySearchModule.
 */
export interface PropertySearchDependencies {
  listingDataSource: ListingDataSourceAdapter;
  geographyAdapter: GeographySearchAdapter;
  valuationAdapter?: ValuationSearchAdapter;
  sponsorsAdapter?: SponsorsSearchAdapter;
  cacheAdapter?: SearchCacheAdapter;
  savedSearchRepo?: SavedSearchRepositoryAdapter;
  searchHistoryRepo?: SearchHistoryRepositoryAdapter;
  analyticsSink?: SearchAnalyticsSinkAdapter;
  nowFn?: () => number;
}
