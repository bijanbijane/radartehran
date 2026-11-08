/**
 * Main Property Search & Discovery Service Facade
 * (`server/modules/property-search/service.ts`)
 * Exclusive ownership: `server/modules/property-search/`
 */

import { createHash } from 'node:crypto';
import type {
  PropertySearchDependencies,
  SearchCacheAdapter,
} from './contracts';
import { executePropertySearchPipeline } from './queryExecutor';
import { SuggestionsAndHistoryService } from './suggestionsAndHistoryService';
import type {
  PropertySearchRequest,
  PropertySearchResponse,
  SaveSearchInput,
  SearchAnalyticsEvent,
  SearchPerformanceMetricsSummary,
  SearchPropertyItem,
  SearchSuggestionItem,
  SearchSuggestionsRequest,
  StoredPropertySavedSearch,
  StoredSearchHistoryRecord,
  UpdateSavedSearchInput,
} from './types';
import {
  validatePropertySearchRequest,
  validateSaveSearchInput,
  validateSearchSuggestionsRequest,
  validateUpdateSavedSearchInput,
} from './validation';

/**
 * Standard in-memory fallback cache adapter when Redis or external cache is unconfigured.
 * Strictly adheres to rule: Cache is never the authoritative source of truth.
 */
export class InMemorySearchCacheAdapter implements SearchCacheAdapter {
  public readonly isConfigured = true;
  private readonly store = new Map<string, { value: PropertySearchResponse; expiresAtMs: number }>();
  private readonly hoodIndex = new Map<string, Set<string>>();

  public async get(key: string): Promise<PropertySearchResponse | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAtMs) {
      this.store.delete(key);
      return null;
    }
    return JSON.parse(JSON.stringify(entry.value));
  }

  public async set(key: string, value: PropertySearchResponse, ttlSeconds = 60): Promise<void> {
    const expiresAtMs = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value: JSON.parse(JSON.stringify(value)), expiresAtMs });

    if (value.appliedFilters.cityId && value.appliedFilters.neighborhoodIds) {
      for (const hid of value.appliedFilters.neighborhoodIds) {
        const hoodKey = `${value.appliedFilters.cityId}_${hid}`;
        const keys = this.hoodIndex.get(hoodKey) ?? new Set();
        keys.add(key);
        this.hoodIndex.set(hoodKey, keys);
      }
    }
  }

  public async invalidateForNeighborhood(cityId: string, hoodId: number): Promise<void> {
    const hoodKey = `${cityId}_${hoodId}`;
    const keys = this.hoodIndex.get(hoodKey);
    if (keys) {
      for (const k of keys) this.store.delete(k);
      this.hoodIndex.delete(hoodKey);
    }
  }

  public async invalidateForListing(_listingId: string): Promise<void> {
    // Flush active cache on listing state change
    this.store.clear();
    this.hoodIndex.clear();
  }
}

export class PropertySearchService {
  private readonly suggestionsAndHistory: SuggestionsAndHistoryService;
  private readonly cacheAdapter?: SearchCacheAdapter;
  private readonly nowFn: () => number;

  constructor(private readonly deps: PropertySearchDependencies) {
    this.nowFn = deps.nowFn ?? Date.now;
    this.cacheAdapter = deps.cacheAdapter;
    this.suggestionsAndHistory = new SuggestionsAndHistoryService(
      deps.geographyAdapter,
      deps.savedSearchRepo,
      deps.searchHistoryRepo,
      this.nowFn,
    );
  }

  /**
   * Generates a deterministic, partition-safe cache key incorporating filters, sort, cursor, and auth scope.
   */
  public generateCacheKey(request: PropertySearchRequest): string {
    const authScope = request.requestCaller?.isAdmin ? 'admin' : request.requestCaller?.uid ? `user_${request.requestCaller.uid}` : 'public';
    const payload = JSON.stringify({
      filters: request.filters,
      sort: request.sort,
      limit: request.limit,
      cursor: request.cursor,
      authScope,
    });
    return `psearch_${createHash('sha256').update(payload).digest('hex')}`;
  }

  /**
   * Executes public or authenticated property search with validation, caching, and analytics instrumentation.
   */
  public async searchProperties(rawRequest: unknown): Promise<PropertySearchResponse> {
    const validatedRequest = validatePropertySearchRequest(rawRequest);
    const startTime = this.nowFn();
    const cacheKey = this.generateCacheKey(validatedRequest);

    // 1. Check cache
    if (this.cacheAdapter?.isConfigured) {
      try {
        const cached = await this.cacheAdapter.get(cacheKey);
        if (cached) {
          cached.executionMetrics = {
            durationMs: this.nowFn() - startTime,
            cacheHit: true,
          };
          this.recordAnalyticsEvent(validatedRequest, cached, true, cached.executionMetrics.durationMs);
          return cached;
        }
      } catch {
        // Cache read failure falls back safely to execution pipeline
      }
    }

    // 2. Execute pipeline
    const response = await executePropertySearchPipeline(validatedRequest, {
      listingDataSource: this.deps.listingDataSource,
      geographyAdapter: this.deps.geographyAdapter,
      valuationAdapter: this.deps.valuationAdapter,
      sponsorsAdapter: this.deps.sponsorsAdapter,
      nowFn: this.nowFn,
    });

    // 3. Populate cache if configured
    if (this.cacheAdapter?.isConfigured) {
      try {
        await this.cacheAdapter.set(cacheKey, response, 60);
      } catch {
        // Cache write errors are non-fatal
      }
    }

    // 4. Record analytics
    this.recordAnalyticsEvent(validatedRequest, response, false, response.executionMetrics.durationMs);

    // 5. Record user search history if authenticated and consented
    if (validatedRequest.requestCaller?.uid) {
      const summaryFa = validatedRequest.filters.keyword
        ? `جست‌وجوی "${validatedRequest.filters.keyword}"`
        : validatedRequest.filters.category
        ? `جست‌وجوی املاک ${validatedRequest.filters.category}`
        : 'جست‌وجوی عمومی املاک';

      void this.suggestionsAndHistory.recordHistory({
        userUid: validatedRequest.requestCaller.uid,
        querySummaryFa: summaryFa,
        filters: validatedRequest.filters,
        resultCountSnapshot: response.totalEstimatedCount,
      });
    }

    return response;
  }

  public async getSuggestions(rawParams: Record<string, unknown>): Promise<SearchSuggestionItem[]> {
    const request = validateSearchSuggestionsRequest(rawParams);
    return this.suggestionsAndHistory.getSuggestions(request);
  }

  public async saveSearch(ownerUid: string, rawInput: unknown): Promise<StoredPropertySavedSearch> {
    const input: SaveSearchInput = validateSaveSearchInput(rawInput);
    return this.suggestionsAndHistory.saveSearch(ownerUid, input);
  }

  public async listUserSavedSearches(ownerUid: string, limit?: number): Promise<StoredPropertySavedSearch[]> {
    return this.suggestionsAndHistory.listUserSavedSearches(ownerUid, limit);
  }

  public async updateSavedSearch(ownerUid: string, savedSearchId: string, rawInput: unknown): Promise<StoredPropertySavedSearch> {
    const input: UpdateSavedSearchInput = validateUpdateSavedSearchInput(rawInput);
    return this.suggestionsAndHistory.updateSavedSearch(ownerUid, savedSearchId, input);
  }

  public async deleteSavedSearch(ownerUid: string, savedSearchId: string): Promise<boolean> {
    return this.suggestionsAndHistory.deleteSavedSearch(ownerUid, savedSearchId);
  }

  public async getUserSearchHistory(userUid: string, limit?: number): Promise<StoredSearchHistoryRecord[]> {
    return this.suggestionsAndHistory.listUserHistory(userUid, limit);
  }

  public async clearUserSearchHistory(userUid: string): Promise<void> {
    return this.suggestionsAndHistory.clearUserHistory(userUid);
  }

  public async invalidateCacheForNeighborhood(cityId: string, hoodId: number): Promise<void> {
    if (this.cacheAdapter?.isConfigured) {
      await this.cacheAdapter.invalidateForNeighborhood(cityId, hoodId);
    }
  }

  public async invalidateCacheForListing(listingId: string): Promise<void> {
    if (this.cacheAdapter?.isConfigured) {
      await this.cacheAdapter.invalidateForListing(listingId);
    }
  }

  public async getPerformanceMetrics(periodStartIso: string, periodEndIso: string): Promise<SearchPerformanceMetricsSummary> {
    if (!this.deps.analyticsSink) {
      return {
        periodStartIso,
        periodEndIso,
        totalSearchCount: 0,
        zeroResultSearchCount: 0,
        zeroResultRatePercent: 0,
        averageLatencyMs: 0,
        p95LatencyMs: 0,
        cacheHitRatePercent: 0,
        topSearchedCities: [],
        topSearchedNeighborhoods: [],
        topFilterUsage: [],
      };
    }
    return this.deps.analyticsSink.getMetricsSummary(periodStartIso, periodEndIso);
  }

  private recordAnalyticsEvent(
    req: PropertySearchRequest,
    res: PropertySearchResponse,
    cacheHit: boolean,
    durationMs: number,
  ): void {
    if (!this.deps.analyticsSink) return;
    const filterCount = Object.keys(req.filters).length;
    const event: SearchAnalyticsEvent = {
      eventId: `sevt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      queryFingerprint: this.generateCacheKey(req),
      category: req.filters.category,
      dealType: req.filters.dealType,
      cityId: req.filters.cityId,
      neighborhoodIds: req.filters.neighborhoodIds,
      filterCount,
      resultCount: res.totalEstimatedCount,
      isZeroResult: res.totalEstimatedCount === 0,
      sortMode: res.appliedSort,
      durationMs,
      cacheHit,
      timestampIso: new Date(this.nowFn()).toISOString(),
    };
    void this.deps.analyticsSink.recordSearchEvent(event).catch(() => undefined);
  }
}
