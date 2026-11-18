/**
 * @file src/features/search/state/searchStateStore.ts
 * @description Manages Map <-> List <-> URL synchronization, hover/select coordination, and return-from-detail state recovery.
 */

import {
  createCanonicalSearchRequest,
  deserializeUrlParamsToSearchRequest,
  serializeSearchRequestToUrlParams,
  type SearchFilter,
  type SearchGeoBounds,
  type SearchRequest,
  type SearchScope,
  type SearchSort,
} from '../../../platform/search';

export interface SearchNavigationSnapshot {
  request: SearchRequest;
  hoveredResultId: string | null;
  selectedResultId: string | null;
  scrollOffsetY: number;
  searchInBoundsEnabled: boolean;
}

export class UnifiedSearchStateStore {
  private state: SearchNavigationSnapshot;
  private readonly listeners = new Set<(state: SearchNavigationSnapshot) => void>();

  constructor(initialQueryString = '') {
    const initialRequest = initialQueryString
      ? deserializeUrlParamsToSearchRequest(initialQueryString)
      : createCanonicalSearchRequest();

    this.state = {
      request: initialRequest,
      hoveredResultId: null,
      selectedResultId: null,
      scrollOffsetY: 0,
      searchInBoundsEnabled: Boolean(initialRequest.bounds),
    };
  }

  getState(): SearchNavigationSnapshot {
    return this.state;
  }

  subscribe(listener: (state: SearchNavigationSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(next: SearchNavigationSnapshot): void {
    this.state = next;
    for (const l of this.listeners) {
      l(this.state);
    }
  }

  setQuery(rawQuery: string): void {
    this.emit({
      ...this.state,
      request: createCanonicalSearchRequest({
        ...this.state.request,
        rawQuery,
        pagination: { ...this.state.request.pagination, page: 1, cursor: null },
      }),
    });
  }

  setScope(scope: SearchScope): void {
    this.emit({
      ...this.state,
      request: createCanonicalSearchRequest({
        ...this.state.request,
        scope,
        pagination: { ...this.state.request.pagination, page: 1, cursor: null },
      }),
    });
  }

  setFilters(filters: SearchFilter[]): void {
    this.emit({
      ...this.state,
      request: createCanonicalSearchRequest({
        ...this.state.request,
        filters,
        pagination: { ...this.state.request.pagination, page: 1, cursor: null },
      }),
    });
  }

  setSort(sort: SearchSort): void {
    this.emit({
      ...this.state,
      request: createCanonicalSearchRequest({
        ...this.state.request,
        sort,
        pagination: { ...this.state.request.pagination, page: 1, cursor: null },
      }),
    });
  }

  setPage(page: number): void {
    this.emit({
      ...this.state,
      request: createCanonicalSearchRequest({
        ...this.state.request,
        pagination: { ...this.state.request.pagination, page: Math.max(1, Math.floor(page)) },
      }),
    });
  }

  setMapBounds(bounds: SearchGeoBounds | undefined, searchInBoundsEnabled = true): void {
    this.emit({
      ...this.state,
      searchInBoundsEnabled,
      request: createCanonicalSearchRequest({
        ...this.state.request,
        bounds: searchInBoundsEnabled ? bounds : undefined,
        pagination: { ...this.state.request.pagination, page: 1, cursor: null },
      }),
    });
  }

  setHoveredResult(resultId: string | null): void {
    if (this.state.hoveredResultId === resultId) return;
    this.emit({
      ...this.state,
      hoveredResultId: resultId,
    });
  }

  setSelectedResult(resultId: string | null, scrollOffsetY = this.state.scrollOffsetY): void {
    this.emit({
      ...this.state,
      selectedResultId: resultId,
      scrollOffsetY,
    });
  }

  toUrlSearchString(): string {
    return serializeSearchRequestToUrlParams(this.state.request);
  }

  restoreFromUrlSearchString(queryString: string): void {
    const recovered = deserializeUrlParamsToSearchRequest(queryString);
    this.emit({
      ...this.state,
      request: recovered,
      searchInBoundsEnabled: Boolean(recovered.bounds),
    });
  }
}
