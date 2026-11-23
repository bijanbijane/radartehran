import type { SearchExecutionResponse, SearchFilterSet, SearchScope, SearchSortOption } from '../models/search.types';
import { buildSearchPlan, INITIAL_SYNONYM_REGISTRY } from '../services/searchNormalizerAndPlanner';
import { executePlatformApiRequest } from '../../../platform/api/client/apiClient';

export interface CanonicalSearchRequestBody {
  requestId?: string;
  query: string;
  scope: SearchScope;
  sort: SearchSortOption;
  filters: SearchFilterSet;
  cursor?: string;
  limit?: number;
  degradedScopes?: SearchScope[];
}

let requestVersion = 0;
let activeAbort: AbortController | null = null;

export function createInitialEmptySearchResponse(
  rawQuery = '',
  scope: SearchScope = 'ALL',
  filters: SearchFilterSet = {},
  sort: SearchSortOption = 'RELEVANCE',
): SearchExecutionResponse {
  const plan = buildSearchPlan(rawQuery, INITIAL_SYNONYM_REGISTRY, filters.cityId);
  return {
    requestId: 'req-pending',
    plan,
    activeScope: scope,
    appliedFilters: filters,
    sort,
    totalCount: 0,
    results: [],
    groupedCounts: {
      ALL: 0, PROPERTIES: 0, LISTINGS: 0, NEIGHBORHOODS: 0, MARKET: 0,
      VALUATION: 0, SERVICES: 0, PROVIDERS: 0, KNOWLEDGE: 0, COMMUNITY: 0, MAP: 0, ACCOUNT: 0,
    },
    facets: {
      scopes: [],
      districts: [],
      propertyTypes: [],
      transactionTypes: [],
      verifiedCount: 0,
    },
    rankingPolicyVersion: 'v2-canonical',
    latencyMs: 0,
  };
}

export async function postCanonicalSearchQuery(
  body: CanonicalSearchRequestBody,
): Promise<SearchExecutionResponse> {
  const version = ++requestVersion;
  activeAbort?.abort();
  activeAbort = new AbortController();

  const response = await executePlatformApiRequest<SearchExecutionResponse, CanonicalSearchRequestBody>({
    path: '/api/v2/search/query',
    method: 'POST',
    body,
    signal: activeAbort.signal,
  });

  if (version !== requestVersion) {
    throw new Error('STALE_SEARCH_RESPONSE');
  }
  return response;
}