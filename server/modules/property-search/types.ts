/**
 * Property Search & Discovery Backend Types
 * (`server/modules/property-search/types.ts`)
 * Exclusive ownership: `server/modules/property-search/`
 */

export type PropertyCategory = 'residential' | 'commercial' | 'office' | 'land';

export type PropertySubtype =
  // Residential
  | 'apartment'
  | 'villa'
  | 'penthouse'
  | 'residential_complex'
  // Commercial
  | 'shop'
  | 'commercial_unit'
  | 'mall_booth'
  | 'showroom'
  // Office
  | 'administrative_office'
  | 'medical_office'
  | 'commercial_office'
  // Land
  | 'residential_plot'
  | 'commercial_plot'
  | 'agricultural_land'
  | 'industrial_land';

export type SearchDealType = 'sale' | 'rent';

export type SearchSortMode =
  | 'newest'
  | 'oldest'
  | 'price_asc'
  | 'price_desc'
  | 'area_asc'
  | 'area_desc'
  | 'relevance'
  | 'geo_proximity';

export type PropertyRenovationCondition =
  | 'luxury_renovated'
  | 'renovated'
  | 'standard'
  | 'needs_renovation';

export type ConstructionStatus = 'completed' | 'under_construction' | 'presale';

export interface GeoBoundingBoxFilter {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface GeoProximityFilter {
  lat: number;
  lng: number;
  radiusMeters: number;
}

/**
 * Validated search request filters.
 * Missing numbers are strictly distinct from zero.
 */
export interface PropertySearchQueryFilters {
  keyword?: string;
  category?: PropertyCategory;
  subtype?: PropertySubtype;
  dealType?: SearchDealType;
  cityId?: string;
  districtId?: string;
  neighborhoodIds?: number[];
  boundingBox?: GeoBoundingBoxFilter;
  nearLocation?: GeoProximityFilter;
  // Advertised asking prices (million Toman)
  minAskingPriceMillion?: number;
  maxAskingPriceMillion?: number;
  minMonthlyRentMillion?: number;
  maxMonthlyRentMillion?: number;
  minDepositMillion?: number;
  maxDepositMillion?: number;
  minPricePerSqmMillion?: number;
  maxPricePerSqmMillion?: number;
  // Valuation comparison analytical filter (asking price / estimated market value)
  maxPriceToValuationRatio?: number;
  // Physical characteristics
  minAreaSqm?: number;
  maxAreaSqm?: number;
  minRooms?: number;
  maxRooms?: number;
  minBuildingAgeYears?: number;
  maxBuildingAgeYears?: number;
  minFloor?: number;
  maxFloor?: number;
  hasParking?: boolean;
  hasElevator?: boolean;
  hasStorage?: boolean;
  hasBalcony?: boolean;
  renovationCondition?: PropertyRenovationCondition;
  constructionStatus?: ConstructionStatus;
  // Commercial & Office characteristics
  minShopFrontageMeters?: number;
  hasCommercialLicense?: boolean;
  suitableForMedical?: boolean;
  // Publication and verification
  publishedAfterIso?: string;
  publishedBeforeIso?: string;
  onlyVerified?: boolean;
}

export interface PropertySearchRequest {
  filters: PropertySearchQueryFilters;
  sort?: SearchSortMode;
  limit?: number;
  cursor?: string;
  requestCaller?: {
    uid?: string;
    isAdmin?: boolean;
  };
}

/**
 * Publicly discoverable property listing representation.
 * Excludes private owner identities, moderator UIDs, and unverified data.
 */
export interface SearchPropertyItem {
  id: string;
  sourceModule: 'bargains' | 'platform_listings';
  category: PropertyCategory;
  subtype?: PropertySubtype;
  dealType: SearchDealType;
  cityId: string;
  districtId?: string;
  hoodId: number;
  hoodNameFa?: string;
  title: string;
  descriptionSnippetFa?: string;
  areaSqm: number;
  // Prices in million Toman
  askingPriceTotalMillion?: number;
  askingPricePerSqmMillion?: number;
  monthlyRentMillion?: number;
  depositMillion?: number;
  // Human readable display text
  priceDisplayTextFa: string;
  // Features
  rooms?: number;
  buildingAgeYears?: number;
  floor?: number;
  totalFloors?: number;
  hasParking?: boolean;
  hasElevator?: boolean;
  hasStorage?: boolean;
  hasBalcony?: boolean;
  renovationCondition?: PropertyRenovationCondition;
  constructionStatus?: ConstructionStatus;
  // Commercial / Office
  shopFrontageMeters?: number;
  hasCommercialLicense?: boolean;
  suitableForMedical?: boolean;
  // Location
  street?: string;
  coordinates?: {
    lat: number;
    lng: number;
    isApproximate: boolean;
  };
  // Media
  primaryImageUrl?: string;
  imageUrls?: string[];
  // Status & Timestamps
  isVerifiedListing: boolean;
  verificationSource?: string;
  publishedAtIso: string;
  updatedAtIso: string;
  // Analytical comparison from valuation, if present and authorized
  valuationBenchmark?: {
    estimatedMarketValueMillion: number;
    valuationConfidence: 'high' | 'moderate' | 'low';
    differencePercent: number; // Positive = above estimate, negative = below estimate (bargain)
  };
  // Relevance score for ranked results (0 - 100)
  relevanceScore?: number;
}

/**
 * Separately projected sponsor placement.
 * Guaranteed never to masquerade as organic search relevance.
 */
export interface SponsoredSearchPlacement {
  sponsorshipId: string;
  agencyNameFa: string;
  specialtyFa: string;
  phone: string;
  cityId: string;
  hoodId: number;
  hoodNameFa: string;
  badgeLabelFa: string; // e.g. "حامی املاک محله"
  expiresAtIso: string;
}

export interface SearchResultFacetBucket {
  key: string;
  labelFa: string;
  count: number;
}

export interface SearchResultAggregations {
  totalMatches: number;
  categoryBuckets: SearchResultFacetBucket[];
  dealTypeBuckets: SearchResultFacetBucket[];
  priceRangeBuckets: SearchResultFacetBucket[];
  areaRangeBuckets: SearchResultFacetBucket[];
  topNeighborhoodBuckets: SearchResultFacetBucket[];
}

export type PropertySearchCountAccuracy = 'EXACT_TOTAL' | 'ESTIMATED_TOTAL' | 'BOUNDED_PARTIAL_TOTAL';

export interface PropertySearchResponse {
  items: SearchPropertyItem[];
  sponsoredPlacements?: SponsoredSearchPlacement[];
  totalEstimatedCount: number;
  countAccuracy?: PropertySearchCountAccuracy;
  sourceExhausted?: boolean;
  nextCursor?: string;
  hasMore: boolean;
  appliedSort: SearchSortMode;
  appliedFilters: PropertySearchQueryFilters;
  aggregations?: SearchResultAggregations;
  executionMetrics: {
    durationMs: number;
    cacheHit: boolean;
  };
}

// ============================================================================
// SEARCH SUGGESTIONS
// ============================================================================

export type SearchSuggestionType =
  | 'city'
  | 'district'
  | 'neighborhood'
  | 'property_category'
  | 'common_filter'
  | 'recent_query';

export interface SearchSuggestionItem {
  id: string;
  type: SearchSuggestionType;
  titleFa: string;
  subtitleFa?: string;
  filterPatch: Partial<PropertySearchQueryFilters>;
}

export interface SearchSuggestionsRequest {
  prefix: string;
  cityId?: string;
  limit?: number;
  userUid?: string;
  includeRecent?: boolean;
}

// ============================================================================
// SAVED SEARCHES & SEARCH HISTORY
// ============================================================================

export interface StoredPropertySavedSearch {
  savedSearchId: string;
  ownerUid: string;
  titleFa: string;
  filters: PropertySearchQueryFilters;
  sortMode?: SearchSortMode;
  notifyOnNewMatches: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SaveSearchInput {
  titleFa: string;
  filters: PropertySearchQueryFilters;
  sortMode?: SearchSortMode;
  notifyOnNewMatches?: boolean;
}

export interface UpdateSavedSearchInput {
  titleFa?: string;
  filters?: PropertySearchQueryFilters;
  sortMode?: SearchSortMode;
  notifyOnNewMatches?: boolean;
}

export interface StoredSearchHistoryRecord {
  historyId: string;
  userUid: string;
  querySummaryFa: string;
  filters: PropertySearchQueryFilters;
  resultCountSnapshot: number;
  recordedAtIso: string;
}

// ============================================================================
// SEARCH ANALYTICS & MONITORING
// ============================================================================

export interface SearchAnalyticsEvent {
  eventId: string;
  queryFingerprint: string;
  category?: PropertyCategory;
  dealType?: SearchDealType;
  cityId?: string;
  neighborhoodIds?: number[];
  filterCount: number;
  resultCount: number;
  isZeroResult: boolean;
  sortMode: SearchSortMode;
  durationMs: number;
  cacheHit: boolean;
  timestampIso: string;
}

export interface SearchPerformanceMetricsSummary {
  periodStartIso: string;
  periodEndIso: string;
  totalSearchCount: number;
  zeroResultSearchCount: number;
  zeroResultRatePercent: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  cacheHitRatePercent: number;
  topSearchedCities: { cityId: string; count: number }[];
  topSearchedNeighborhoods: { hoodId: number; count: number }[];
  topFilterUsage: { filterName: string; count: number }[];
}
