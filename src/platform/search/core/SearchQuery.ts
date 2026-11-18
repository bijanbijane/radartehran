/**
 * @file src/platform/search/core/SearchQuery.ts
 * @description Canonical SearchRequest builder, defaults, and deterministic hashing.
 */

import type { SearchFilter, SearchGeoBounds, SearchPagination, SearchRequest, SearchScope, SearchSort } from './SearchTypes';
import { normalizePersianSearchQuery } from './SearchNormalizer';

export const DEFAULT_SEARCH_SORT: SearchSort = {
  field: 'relevance',
  direction: 'desc',
};

export const DEFAULT_SEARCH_PAGINATION: SearchPagination = {
  page: 1,
  pageSize: 20,
  cursor: null,
};

export interface CreateSearchRequestInput {
  rawQuery?: string;
  scope?: SearchScope;
  cityId?: string;
  neighborhoodIds?: string[];
  bounds?: SearchGeoBounds;
  filters?: SearchFilter[];
  sort?: Partial<SearchSort>;
  pagination?: Partial<SearchPagination>;
  workspaceId?: string;
  userId?: string | null;
  permissionVersion?: number;
}

export function createCanonicalSearchRequest(input: CreateSearchRequestInput = {}): SearchRequest {
  const rawQuery = typeof input.rawQuery === 'string' ? input.rawQuery : '';
  const normalizedQuery = normalizePersianSearchQuery(rawQuery);
  const page = Math.max(1, Math.floor(input.pagination?.page ?? DEFAULT_SEARCH_PAGINATION.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pagination?.pageSize ?? DEFAULT_SEARCH_PAGINATION.pageSize)));

  return {
    rawQuery,
    normalizedQuery,
    scope: input.scope ?? 'all',
    cityId: input.cityId,
    neighborhoodIds: input.neighborhoodIds ? Array.from(new Set(input.neighborhoodIds)) : undefined,
    bounds: input.bounds,
    filters: Array.isArray(input.filters) ? [...input.filters] : [],
    sort: {
      field: input.sort?.field ?? DEFAULT_SEARCH_SORT.field,
      direction: input.sort?.direction ?? DEFAULT_SEARCH_SORT.direction,
    },
    pagination: {
      page,
      pageSize,
      cursor: input.pagination?.cursor ?? null,
    },
    workspaceId: input.workspaceId,
    userId: input.userId ?? null,
    permissionVersion: input.permissionVersion ?? 1,
  };
}

export function computeDeterministicHash(input: unknown): string {
  const json = JSON.stringify(input) || '';
  let hash = 2166136261;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
