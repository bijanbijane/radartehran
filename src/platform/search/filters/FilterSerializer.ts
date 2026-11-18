/**
 * @file src/platform/search/filters/FilterSerializer.ts
 * @description Bidirectional URL query-string serialization & recovery for SearchRequest and SearchFilter[].
 */

import { createCanonicalSearchRequest } from '../core/SearchQuery';
import type { SearchFilter, SearchGeoBounds, SearchRequest, SearchScope, SearchSort } from '../core/SearchTypes';
import { deduplicateAndNormalizeFilters } from './FilterNormalizer';

export function serializeSearchRequestToUrlParams(request: SearchRequest): string {
  const params = new URLSearchParams();
  if (request.rawQuery.trim()) params.set('q', request.rawQuery.trim());
  if (request.scope && request.scope !== 'all') params.set('scope', request.scope);
  if (request.cityId) params.set('city', request.cityId);
  if (request.neighborhoodIds && request.neighborhoodIds.length > 0) {
    params.set('hoods', request.neighborhoodIds.join(','));
  }
  if (request.bounds) {
    const b = request.bounds;
    params.set('bbox', `${b.south.toFixed(5)},${b.west.toFixed(5)},${b.north.toFixed(5)},${b.east.toFixed(5)}`);
  }
  if (request.sort.field !== 'relevance' || request.sort.direction !== 'desc') {
    params.set('sort', `${request.sort.field}:${request.sort.direction}`);
  }
  if (request.pagination.page > 1) {
    params.set('page', String(request.pagination.page));
  }
  if (request.pagination.pageSize !== 20) {
    params.set('pageSize', String(request.pagination.pageSize));
  }
  if (request.filters.length > 0) {
    const compact = request.filters.map((f) => ({
      id: f.id,
      f: f.field,
      op: f.operator,
      v: f.value,
      u: f.unit,
      s: f.source,
      c: f.cityScoped,
    }));
    params.set('filters', JSON.stringify(compact));
  }
  return params.toString();
}

export function deserializeUrlParamsToSearchRequest(queryString: string): SearchRequest {
  const clean = queryString.startsWith('?') ? queryString.slice(1) : queryString;
  const params = new URLSearchParams(clean);

  const rawQuery = params.get('q') ?? '';
  const scopeRaw = params.get('scope') as SearchScope | null;
  const validScopes: SearchScope[] = [
    'all',
    'properties',
    'listings',
    'buildings',
    'neighborhoods',
    'services',
    'market-analytics',
  ];
  const scope: SearchScope = scopeRaw && validScopes.includes(scopeRaw) ? scopeRaw : 'all';
  const cityId = params.get('city') || undefined;
  const hoodsRaw = params.get('hoods');
  const neighborhoodIds = hoodsRaw ? hoodsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

  let bounds: SearchGeoBounds | undefined;
  const bboxRaw = params.get('bbox');
  if (bboxRaw) {
    const parts = bboxRaw.split(',').map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [south, west, north, east] = parts;
      if (north >= south && east >= west) {
        bounds = { south, west, north, east };
      }
    }
  }

  let sort: Partial<SearchSort> | undefined;
  const sortRaw = params.get('sort');
  if (sortRaw && sortRaw.includes(':')) {
    const [field, dir] = sortRaw.split(':');
    sort = {
      field: field as SearchSort['field'],
      direction: dir === 'asc' ? 'asc' : 'desc',
    };
  }

  const page = Number(params.get('page') || 1);
  const pageSize = Number(params.get('pageSize') || 20);

  let filters: SearchFilter[] = [];
  const filtersRaw = params.get('filters');
  if (filtersRaw) {
    try {
      const parsed = JSON.parse(filtersRaw);
      if (Array.isArray(parsed)) {
        filters = deduplicateAndNormalizeFilters(
          parsed
            .filter((item) => item && typeof item.f === 'string' && typeof item.op === 'string')
            .map((item) => ({
              id: item.id || `flt:${item.f}:${item.op}`,
              field: item.f,
              operator: item.op,
              value: item.v,
              unit: item.u,
              source: item.s || 'route',
              cityScoped: item.c,
            }))
        );
      }
    } catch {
      // Ignore malformed filter JSON in URL without crashing page recovery
      filters = [];
    }
  }

  return createCanonicalSearchRequest({
    rawQuery,
    scope,
    cityId,
    neighborhoodIds,
    bounds,
    filters,
    sort,
    pagination: {
      page: Number.isFinite(page) && page >= 1 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize >= 1 ? pageSize : 20,
    },
  });
}
