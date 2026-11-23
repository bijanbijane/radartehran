import React from 'react';
import { RadarAlert } from '../../../components/common/RadarAlert';
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
    <RadarAlert tone="warning" testId="global-search-load-error">
      {messageFa}
    </RadarAlert>
  );
}