/**
 * @file src/platform/search/orchestration/SearchCoordinator.ts
 * @description Coordinates Search validation, Cache lookup, Entity Resolution, Domain Execution, and Map/List/URL sync.
 */

import { globalSearchResponseCache, SearchResponseCache } from '../cache/SearchCache';
import { createCanonicalSearchRequest, type CreateSearchRequestInput } from '../core/SearchQuery';
import type { SearchHitDomainType, SearchResultHit, UnifiedSearchExecutionResponse } from '../core/SearchResult';
import type { SearchGeoBounds, SearchRequest } from '../core/SearchTypes';
import { validateSearchRequest } from '../core/SearchValidation';
import { deduplicateAndNormalizeFilters, pruneIncompatibleFiltersForCity } from '../filters/FilterNormalizer';
import { resolveQueryEntities, type KnownPlaceDirectoryEntry } from '../query/EntityResolver';
import { adaptRawRecordToSearchHit, type RawDomainSearchRecord } from '../results/ResultAdapter';
import { deduplicateSearchHits } from '../results/ResultDeduplication';
import { groupSearchHitsByDomain } from '../results/ResultGrouping';
import { SearchCancellationController } from './SearchCancellation';
import { SearchRequestManager } from './SearchRequestManager';

export interface DomainDataSourceProvider {
  domainType: SearchHitDomainType;
  fetchItems: (request: SearchRequest, signal: AbortSignal) => Promise<RawDomainSearchRecord[]>;
}

export class SearchCoordinator {
  private readonly cache: SearchResponseCache;
  private readonly cancellation = new SearchCancellationController();
  private readonly requestManager = new SearchRequestManager();
  private readonly providers: DomainDataSourceProvider[];
  private readonly directory?: readonly KnownPlaceDirectoryEntry[];

  constructor(options?: {
    cache?: SearchResponseCache;
    providers?: DomainDataSourceProvider[];
    directory?: readonly KnownPlaceDirectoryEntry[];
  }) {
    this.cache = options?.cache ?? globalSearchResponseCache;
    this.providers = options?.providers ?? [];
    this.directory = options?.directory;
  }

  buildValidatedRequest(input: CreateSearchRequestInput): {
    request: SearchRequest;
    valid: boolean;
    validationMessagesFa: string[];
  } {
    const base = createCanonicalSearchRequest(input);
    const normalizedFilters = deduplicateAndNormalizeFilters(base.filters);
    const request: SearchRequest = {
      ...base,
      filters: normalizedFilters,
    };
    const validation = validateSearchRequest(request);
    return {
      request,
      valid: validation.valid,
      validationMessagesFa: validation.issues.map((i) => i.messageFa),
    };
  }

  switchCityContext(currentRequest: SearchRequest, nextCityId: string): SearchRequest {
    const { retained } = pruneIncompatibleFiltersForCity(currentRequest.filters, nextCityId);
    return createCanonicalSearchRequest({
      ...currentRequest,
      cityId: nextCityId,
      neighborhoodIds: undefined,
      bounds: undefined,
      filters: retained,
      pagination: {
        ...currentRequest.pagination,
        page: 1,
        cursor: null,
      },
    });
  }

  applyMapBoundsFilter(currentRequest: SearchRequest, bounds: SearchGeoBounds | undefined): SearchRequest {
    return createCanonicalSearchRequest({
      ...currentRequest,
      bounds,
      pagination: {
        ...currentRequest.pagination,
        page: 1,
        cursor: null,
      },
    });
  }

  async executeSearch(
    input: CreateSearchRequestInput,
    slotId = 'primary'
  ): Promise<UnifiedSearchExecutionResponse | null> {
    const startMs = performance.now();
    const { request, valid, validationMessagesFa } = this.buildValidatedRequest(input);

    if (!valid) {
      return {
        requestId: 'invalid-request',
        rawQuery: request.rawQuery,
        normalizedQuery: request.normalizedQuery,
        scope: request.scope,
        displayState: 'Error',
        recognizedEntities: [],
        items: [],
        groups: [],
        totalReceivedCount: 0,
        totalServerCount: null,
        page: request.pagination.page,
        pageSize: request.pagination.pageSize,
        appliedFilterCount: request.filters.length,
        activeBounds: request.bounds,
        fromCache: false,
        latencyMs: 0,
        failedDomains: [],
        warningsFa: validationMessagesFa,
      };
    }

    const cached = this.cache.get(request);
    if (cached) {
      return {
        ...cached,
        latencyMs: Math.max(0, Number((performance.now() - startMs).toFixed(2))),
      };
    }

    const token = this.cancellation.issueRequestToken(slotId);

    try {
      const response = await this.requestManager.executeReadSearch(
        request,
        async (req, signal) => this.runDomainProviders(req, token.requestId, signal, startMs),
        token.controller.signal
      );

      // Suppress stale responses so an older slow query never overwrites a newer query
      if (!this.cancellation.isLatestSequence(slotId, token.sequenceNumber)) {
        return null;
      }

      this.cache.set(request, response);
      return response;
    } catch (err) {
      if ((err as Error)?.message === 'SEARCH_ABORTED') {
        return null;
      }
      throw err;
    } finally {
      this.cancellation.completeSlot(slotId, token.sequenceNumber);
    }
  }

  private async runDomainProviders(
    request: SearchRequest,
    requestId: string,
    signal: AbortSignal,
    startMs: number
  ): Promise<UnifiedSearchExecutionResponse> {
    const entityOutcome = resolveQueryEntities(request.rawQuery, this.directory);
    const allHits: SearchResultHit[] = [];
    const failedDomains: SearchHitDomainType[] = [];

    const activeProviders = this.providers.filter((p) => {
      if (request.scope === 'all') return true;
      const scopeMap: Record<string, SearchHitDomainType> = {
        properties: 'property',
        listings: 'listing',
        buildings: 'building',
        neighborhoods: 'neighborhood',
        services: 'service',
        'market-analytics': 'market-analytics',
      };
      return scopeMap[request.scope] === p.domainType;
    });

    await Promise.all(
      activeProviders.map(async (provider) => {
        try {
          const rawItems = await provider.fetchItems(request, signal);
          for (const raw of rawItems) {
            const hit = adaptRawRecordToSearchHit({ ...raw, domainType: provider.domainType });
            if (this.matchesRequestFiltersAndBounds(hit, request)) {
              allHits.push(hit);
            }
          }
        } catch {
          failedDomains.push(provider.domainType);
        }
      })
    );

    const deduped = deduplicateSearchHits(allHits);
    const sorted = this.sortHits(deduped, request);
    const startIdx = (request.pagination.page - 1) * request.pagination.pageSize;
    const pagedItems = sorted.slice(startIdx, startIdx + request.pagination.pageSize);
    const groups = groupSearchHitsByDomain(pagedItems, failedDomains);

    const displayState =
      failedDomains.length > 0 && pagedItems.length > 0
        ? 'PartialResults'
        : failedDomains.length > 0 && pagedItems.length === 0
          ? 'Error'
          : pagedItems.length === 0
            ? 'Empty'
            : 'Success';

    return {
      requestId,
      rawQuery: request.rawQuery,
      normalizedQuery: request.normalizedQuery,
      scope: request.scope,
      displayState,
      recognizedEntities: entityOutcome.entities,
      items: pagedItems,
      groups,
      totalReceivedCount: pagedItems.length,
      totalServerCount: failedDomains.length === 0 ? sorted.length : null,
      page: request.pagination.page,
      pageSize: request.pagination.pageSize,
      appliedFilterCount: request.filters.length,
      activeBounds: request.bounds,
      fromCache: false,
      latencyMs: Math.max(0, Number((performance.now() - startMs).toFixed(2))),
      failedDomains,
      warningsFa:
        failedDomains.length > 0
          ? ['برخی منابع داده پاسخ ندادند؛ نتایج دریافت‌شده فعلی نمایش داده شده است.']
          : [],
    };
  }

  private matchesRequestFiltersAndBounds(hit: SearchResultHit, request: SearchRequest): boolean {
    if (request.cityId && hit.cityId !== request.cityId) return false;
    if (request.neighborhoodIds && request.neighborhoodIds.length > 0) {
      if (!hit.neighborhoodId || !request.neighborhoodIds.includes(hit.neighborhoodId)) return false;
    }
    if (request.bounds && hit.coordinates) {
      const { latitude, longitude } = hit.coordinates;
      if (
        latitude < request.bounds.south ||
        latitude > request.bounds.north ||
        longitude < request.bounds.west ||
        longitude > request.bounds.east
      ) {
        return false;
      }
    }
    return true;
  }

  private sortHits(hits: readonly SearchResultHit[], request: SearchRequest): SearchResultHit[] {
    const dir = request.sort.direction === 'asc' ? 1 : -1;
    return [...hits].sort((a, b) => {
      if (request.sort.field === 'areaSqm') {
        const va = a.area?.value ?? null;
        const vb = b.area?.value ?? null;
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        return (va - vb) * dir;
      }
      return (a.score - b.score) * dir;
    });
  }
}
