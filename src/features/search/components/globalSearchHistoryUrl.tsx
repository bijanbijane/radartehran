import React from 'react';
import type { SearchFilterSet, SearchScope, SearchSortOption, SearchViewMode } from '../models/search.types';
import { mergeSearchUrlStateIntoSearch } from '../services/searchNormalizerAndPlanner';
import { commitManagedHistoryTransition, isPopStateRestorationActive } from '../../../navigation/url/historySingleWriter';
import { sanitizeNavigationHash } from '../../../navigation/url/navigationUrlContract';

export function syncSearchHistoryUrl(
  historyObj: Pick<History, 'pushState' | 'replaceState'> | undefined,
  pathname: string,
  currentSearch: string,
  nextState: { q: string; scope: SearchScope; sort: SearchSortOption; viewMode: SearchViewMode; filters: SearchFilterSet },
  mode: 'push' | 'replace',
  isPopStateRestore = false,
  currentHash = '',
): { committedUrl: string; methodCalled: 'pushState' | 'replaceState' | 'none' } {
  const normalizedCurrentSearch = currentSearch ? (currentSearch.startsWith('?') ? currentSearch : `?${currentSearch}`) : '';
  const safeHash = sanitizeNavigationHash(currentHash);
  const currentUrl = `${pathname}${normalizedCurrentSearch}${safeHash}`;
  if (isPopStateRestore || isPopStateRestorationActive() || !historyObj) return { committedUrl: currentUrl, methodCalled: 'none' };
  const mergedQs = mergeSearchUrlStateIntoSearch(normalizedCurrentSearch, nextState);
  const nextUrl = `${pathname}${mergedQs ? `?${mergedQs}` : ''}${safeHash}`;
  const res = commitManagedHistoryTransition({
    domain: 'search_query',
    mode,
    targetUrl: nextUrl,
    isPopStateRestore,
    historyObj,
    locationObj: { pathname, search: normalizedCurrentSearch, hash: safeHash },
  });
  return { committedUrl: res.finalUrl, methodCalled: res.method };
}

export function GlobalSearchLoadErrorBanner({ messageFa }: { messageFa: string }) {
  return (
    <div
      role="alert"
      data-testid="global-search-load-error"
      className="rounded-xl border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 px-3 py-2 text-[11px] font-bold"
    >
      {messageFa}
    </div>
  );
}