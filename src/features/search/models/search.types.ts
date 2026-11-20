/**
 * RT-UI-SEARCH-001 | Global Search, Discovery & Recommendation Architecture
 * Canonical Domain Contracts, Scopes, Intents, Visibility, Location Precision & Governance Types
 */

export type SearchScope =
  | 'ALL' | 'PROPERTIES' | 'LISTINGS' | 'NEIGHBORHOODS' | 'MARKET' | 'VALUATION'
  | 'SERVICES' | 'PROVIDERS' | 'KNOWLEDGE' | 'COMMUNITY' | 'MAP' | 'ACCOUNT';

export type SearchEntityType =
  | 'PROPERTY' | 'LISTING' | 'NEIGHBORHOOD' | 'DISTRICT' | 'MARKET_INDEX' | 'MARKET_REPORT'
  | 'VALUATION_TOOL' | 'VALUATION_GUIDE' | 'SERVICE_CATEGORY' | 'SERVICE_PROVIDER'
  | 'ARTICLE' | 'RESEARCH_REPORT' | 'METHODOLOGY' | 'GLOSSARY_TERM'
  | 'COMMUNITY_QUESTION' | 'COMMUNITY_DISCUSSION' | 'NEIGHBORHOOD_NOTE'
  | 'SAVED_SEARCH' | 'SAVED_ITEM';

export type SearchIntent =
  | 'PROPERTY_SEARCH' | 'NEIGHBORHOOD_LOOKUP' | 'MARKET_ANALYSIS' | 'VALUATION_INTENT'
  | 'SERVICE_DISCOVERY' | 'KNOWLEDGE_LOOKUP' | 'COMMUNITY_SEARCH' | 'MAP_SEARCH'
  | 'ENTITY_LOOKUP' | 'GENERAL_SEARCH';

export type IntentConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type SearchVisibility = 'PUBLIC' | 'AUTHENTICATED' | 'OWNER_ONLY' | 'PARTICIPANTS_ONLY' | 'ADMIN_ONLY' | 'DELETED';
export type LocationPrecision = 'EXACT_AUTHORIZED' | 'APPROXIMATE' | 'NEIGHBORHOOD_BOUNDARY' | 'DISTRICT_BOUNDARY' | 'NONE';
export type GeospatialQueryOperator = 'Within' | 'Intersects' | 'Contains' | 'Near' | 'Distance' | 'Nearest';

export type SearchErrorCode =
  | 'INVALID_QUERY' | 'QUERY_TOO_LONG' | 'INVALID_FILTER' | 'INVALID_GEOMETRY'
  | 'UNSUPPORTED_SORT' | 'UNAUTHORIZED_SCOPE' | 'SOURCE_UNAVAILABLE'
  | 'PARTIAL_SOURCE_TIMEOUT' | 'RATE_LIMITED' | 'SEARCH_ENGINE_ERROR';

export type SearchSortOption =
  | 'RELEVANCE' | 'NEWEST' | 'PRICE_ASC' | 'PRICE_DESC' | 'PRICE_PER_SQM_ASC'
  | 'AREA_DESC' | 'DISTANCE_ASC' | 'POPULARITY_DESC' | 'RATING_DESC' | 'QUALITY_SCORE_DESC';

export type SearchViewMode = 'LIST' | 'MAP' | 'SPLIT';
export type SavedSearchAlertFrequency = 'INSTANT' | 'DAILY' | 'WEEKLY' | 'OFF';
export type RecommendationCategory = 'CONTEXTUAL' | 'SIMILARITY' | 'RELATED_TOPIC' | 'TRENDING_LOCAL' | 'SAVED_SEARCH_MATCH';

export interface SearchBoundingBox { north: number; south: number; east: number; west: number; }
export interface SearchPolygonGeometry { coordinates: Array<{ lat: number; lng: number }>; }

export interface RecognizedEntity {
  text: string;
  canonicalName: string;
  entityType: 'PLACE' | 'DISTRICT' | 'PROPERTY_TYPE' | 'TRANSACTION_TYPE' | 'METRIC' | 'SERVICE_ROLE' | 'CONCEPT';
  entityId?: string;
  confidence: number;
}

export interface NormalizedQueryResult {
  rawQuery: string;
  normalizedQuery: string;
  tokens: string[];
  expandedTerms: string[];
  typoSuggestion?: {
    originalToken: string;
    suggestedToken: string;
    suggestedQuery: string;
    promptFa: string;
  };
}

export type SearchCityId = 'tehran' | 'karaj' | 'mashhad' | 'isfahan' | 'shiraz';

export interface SearchFilterSet {
  cityId?: SearchCityId;
  transactionType?: 'BUY' | 'RENT' | 'FULL_MORTGAGE';
  propertyType?: 'APARTMENT' | 'VILLA' | 'OFFICE' | 'COMMERCIAL' | 'OLD_HOUSE';
  bedrooms?: number;
  neighborhoodId?: string;
  neighborhoodName?: string;
  districtNumber?: number;
  minPriceMillionToman?: number;
  maxPriceMillionToman?: number;
  minAreaSqm?: number;
  maxAreaSqm?: number;
  maxBuildingAgeYears?: number;
  hasElevator?: boolean;
  hasParking?: boolean;
  hasStorage?: boolean;
  verifiedOnly?: boolean;
  boundingBox?: SearchBoundingBox;
  polygon?: SearchPolygonGeometry;
  nearPoint?: { lat: number; lng: number; radiusMeters: number };
}

export interface ExtractedSearchPlan {
  rawQuery: string;
  normalizedQuery: string;
  tokens: string[];
  expandedTerms: string[];
  recognizedEntities: RecognizedEntity[];
  primaryIntent: SearchIntent;
  secondaryIntents: SearchIntent[];
  confidence: IntentConfidenceLevel;
  confidenceScore: number;
  extractedFilters: SearchFilterSet;
  autoAppliedFilters: SearchFilterSet;
  suggestedFilters: SearchFilterSet;
  targetScopes: SearchScope[];
  typoSuggestion?: NormalizedQueryResult['typoSuggestion'];
}

export interface SearchDocument {
  id: string;
  sourceId: string;
  sourceVersion: number;
  indexSchemaVersion: string;
  entityType: SearchEntityType;
  scope: SearchScope;
  cityId?: SearchCityId;
  titleFa: string;
  subtitleFa: string;
  summaryFa: string;
  urlPath: string;
  neighborhoodId?: string;
  neighborhoodName?: string;
  districtNumber?: number;
  priceMillionToman?: number;
  pricePerSqmMillionToman?: number;
  dealPricePerSqmMillionToman?: number;
  hedonicValuationPerSqmMillionToman?: number;
  areaSqm?: number;
  bedrooms?: number;
  buildingAgeYears?: number;
  transactionType?: 'BUY' | 'RENT' | 'FULL_MORTGAGE';
  propertyType?: 'APARTMENT' | 'VILLA' | 'OFFICE' | 'COMMERCIAL' | 'OLD_HOUSE';
  lat?: number;
  lng?: number;
  locationPrecision: LocationPrecision;
  visibility: SearchVisibility;
  ownerUserId?: string;
  verified: boolean;
  qualityScore: number;
  popularityScore: number;
  freshnessTimestamp: string;
  tags: string[];
  metadata?: Record<string, string | number | boolean>;
}

export interface SearchResultItem {
  document: SearchDocument;
  score: number;
  explanationFa: string[];
  matchedTerms: string[];
  distanceMeters?: number;
}

export interface SearchFacetBucket { value: string; labelFa: string; count: number; }

export interface SearchFacetsResponse {
  scopes: SearchFacetBucket[];
  districts: SearchFacetBucket[];
  propertyTypes: SearchFacetBucket[];
  transactionTypes: SearchFacetBucket[];
  verifiedCount: number;
}

export interface ZeroResultSuggestion {
  reasonFa: string;
  relaxedFilterLabelFa?: string;
  suggestedQueries: string[];
  nearbyNeighborhoods: Array<{ id: string; name: string; district?: number }>;
}

export interface SearchExecutionResponse {
  requestId: string;
  plan: ExtractedSearchPlan;
  activeScope: SearchScope;
  appliedFilters: SearchFilterSet;
  sort: SearchSortOption;
  totalCount: number;
  results: SearchResultItem[];
  groupedCounts: Record<SearchScope, number>;
  facets: SearchFacetsResponse;
  partialSourceFailure?: { degradedSources: SearchScope[]; warningFa: string };
  zeroResultAssistant?: ZeroResultSuggestion;
  rankingPolicyVersion: string;
  latencyMs: number;
}

export interface SearchSuggestionItem {
  id: string;
  category: 'RECENT' | 'SAVED' | 'PLACE' | 'POPULAR_QUERY' | 'KNOWLEDGE_OR_SERVICE';
  titleFa: string;
  subtitleFa: string;
  scope: SearchScope;
  queryText: string;
  urlPath?: string;
}

export interface SearchHistoryEntry {
  id: string;
  userId: string;
  rawQuery: string;
  normalizedQuery: string;
  scope: SearchScope;
  filters: SearchFilterSet;
  resultCount: number;
  createdAt: string;
}

export interface SavedSearchRecord {
  id: string;
  userId: string;
  titleFa: string;
  query: string;
  scope: SearchScope;
  filters: SearchFilterSet;
  sort: SearchSortOption;
  alertFrequency: SavedSearchAlertFrequency;
  channels: Array<'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH'>;
  status: 'ACTIVE' | 'PAUSED';
  persistenceScope?: 'SESSION_LOCAL' | 'SERVER_SYNCED';
  notificationStatus?: 'DISABLED' | 'LOCAL_REQUEST_PENDING' | 'CONFIRMED_BY_SERVICE' | 'ALERT_NOT_CONFIGURED' | 'SUBSCRIPTION_REQUIRED';
  matchedCount: number;
  unreadChangesCount: number;
  lastCheckedAt: string;
  createdAt: string;
}

export interface SearchMatchState {
  savedSearchId: string;
  entityType: SearchEntityType;
  entityId: string;
  firstMatchedAt: string;
  lastMatchedAt: string;
  lastNotifiedVersion: number;
  lastKnownPriceMillionToman?: number;
  lastKnownActiveStatus: boolean;
  matchStatus: 'NEW' | 'UPDATED_MEANINGFUL' | 'UNCHANGED' | 'REMOVED';
}

export interface RecommendationCardItem {
  id: string;
  category: RecommendationCategory;
  entityType: SearchEntityType;
  scope: SearchScope;
  titleFa: string;
  subtitleFa: string;
  reasonFa: string;
  urlPath: string;
  metricBadgeFa?: string;
  isDemoSample?: boolean;
}

export interface SearchSynonymRecord {
  id: string;
  canonicalTerm: string;
  variants: string[];
  domainScope: SearchScope;
  active: boolean;
  updatedBy: string;
  updatedAt: string;
}

export interface SearchRankingPolicy {
  version: string;
  scope: SearchScope;
  weights: {
    textualRelevance: number;
    exactEntityMatch: number;
    spatialProximity: number;
    freshness: number;
    qualityAndVerification: number;
    structuredFilterMatch: number;
  };
  active: boolean;
  updatedAt: string;
}

export interface SearchIndexJob {
  id: string;
  jobType: 'INCREMENTAL_UPSERT' | 'TOMBSTONE_DELETE' | 'FULL_REINDEX' | 'SCOPE_REINDEX';
  scope: SearchScope;
  status: 'COMPLETED' | 'RUNNING' | 'FAILED' | 'QUEUED';
  documentsProcessed: number;
  lagMs: number;
  startedAt: string;
  completedAt?: string;
}
