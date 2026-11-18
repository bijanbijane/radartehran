/**
 * @file src/platform/search/index.ts
 * @description Barrel export for Stage 5 Search & Discovery Platform (RT-FE-REBUILD-SEARCH-DISCOVERY-005).
 */

export * from './core/SearchTypes';
export * from './core/SearchQuery';
export * from './core/SearchResult';
export * from './core/SearchNormalizer';
export * from './core/SearchValidation';

export * from './query/QueryParser';
export * from './query/QueryIntent';
export * from './query/EntityResolver';
export * from './query/QuerySuggestions';

export * from './filters/FilterRegistry';
export * from './filters/FilterNormalizer';
export * from './filters/FilterSerializer';
export * from './filters/FilterValidation';

export * from './results/ResultAdapter';
export * from './results/ResultGrouping';
export * from './results/ResultDeduplication';

export * from './cache/SearchCacheKey';
export * from './cache/SearchCache';

export * from './orchestration/SearchCancellation';
export * from './orchestration/SearchRequestManager';
export * from './orchestration/SearchCoordinator';

export * from './history/SearchHistory';
export * from './history/SavedSearchAdapter';
