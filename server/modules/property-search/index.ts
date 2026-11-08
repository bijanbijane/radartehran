/**
 * Property Search & Discovery Module Entry Point & Barrel Exports
 * (`server/modules/property-search/index.ts`)
 * Exclusive ownership: `server/modules/property-search/`
 */

// Core Types
export type {
  ConstructionStatus,
  GeoBoundingBoxFilter,
  GeoProximityFilter,
  PropertyCategory,
  PropertyRenovationCondition,
  PropertySearchQueryFilters,
  PropertySearchRequest,
  PropertySearchResponse,
  PropertySubtype,
  SaveSearchInput,
  SearchAnalyticsEvent,
  SearchDealType,
  SearchPerformanceMetricsSummary,
  SearchPropertyItem,
  SearchResultAggregations,
  SearchResultFacetBucket,
  SearchSortMode,
  SearchSuggestionItem,
  SearchSuggestionType,
  SearchSuggestionsRequest,
  SponsoredSearchPlacement,
  StoredPropertySavedSearch,
  StoredSearchHistoryRecord,
  UpdateSavedSearchInput,
} from './types';

// Integration Contracts & Adapter Interfaces
export type {
  GeographySearchAdapter,
  ListingDataSourceAdapter,
  PropertySearchDependencies,
  SavedSearchRepositoryAdapter,
  SearchAnalyticsSinkAdapter,
  SearchCacheAdapter,
  SearchHistoryRepositoryAdapter,
  SponsorsSearchAdapter,
  ValuationSearchAdapter,
} from './contracts';

// Validation & Normalization
export {
  PropertySearchValidationError,
  SearchQueryValidator,
  normalizePersianText,
  validateAndNormalizeSearchFilters,
  validatePropertySearchRequest,
  validateSaveSearchInput,
  validateSearchSuggestionsRequest,
  validateUpdateSavedSearchInput,
} from './validation';

// Ranking & Sorting
export {
  calculateDistanceMeters,
  calculateOrganicRelevanceScore,
  resolveComparablePrice,
  sortSearchResults,
} from './rankingAndSorting';

// Query Execution & Pagination
export {
  buildSearchResultAggregations,
  decodeCursor,
  encodeCursor,
  executePropertySearchPipeline,
  matchesSearchFilters,
} from './queryExecutor';

// Suggestions & Saved Searches
export { SuggestionsAndHistoryService } from './suggestionsAndHistoryService';

// Main Service & Caching Facade
export {
  InMemorySearchCacheAdapter,
  PropertySearchService,
} from './service';
