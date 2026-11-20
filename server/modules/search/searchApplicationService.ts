import type {
  SearchExecutionResponse,
  SearchFilterSet,
  SearchScope,
  SearchSortOption,
} from '../../../src/features/search/models/search.types';
import { getCanonicalSearchEngine } from './searchCompositionRoot';
import { getSearchWorkspaceRepository } from './searchCompositionRoot';
import { containsSensitivePersonalPattern } from '../../../src/features/search/services/searchWorkspaceService';

export interface CanonicalSearchRequest {
  requestId?: string;
  query: string;
  scope: SearchScope;
  sort: SearchSortOption;
  filters: SearchFilterSet;
  cursor?: string;
  limit?: number;
  degradedScopes?: SearchScope[];
}

export interface SearchAuthContext {
  uid?: string;
  isAdmin: boolean;
}

export function executeCanonicalSearch(
  req: CanonicalSearchRequest,
  auth: SearchAuthContext,
): SearchExecutionResponse {
  const engine = getCanonicalSearchEngine();
  const limit = Math.min(Math.max(req.limit ?? 50, 1), 100);
  const out = engine.executeSearch({
    requestId: req.requestId,
    rawQuery: req.query,
    scope: req.scope,
    explicitFilters: req.filters,
    sort: req.sort,
    degradedScopes: req.degradedScopes,
    caller: {
      userId: auth.uid,
      isAuthenticated: Boolean(auth.uid),
      isAdmin: auth.isAdmin,
    },
    resultLimit: limit,
    paginationCursor: req.cursor,
  });

  if (auth.uid && req.query.trim() && !containsSensitivePersonalPattern(req.query)) {
    const repo = getSearchWorkspaceRepository();
    const prefs = repo.getPreferences(auth.uid);
    if (prefs.historyRecordingEnabled) {
      repo.recordSearchHistory({
        userId: auth.uid,
        rawQuery: req.query,
        scope: req.scope,
        filters: req.filters,
        resultCount: out.totalCount,
      });
    }
  }

  return out;
}