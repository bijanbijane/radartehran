/**
 * @file src/platform/search/results/ResultDeduplication.ts
 * @description Deduplicates SearchResultHit[] by (domainType, id) while keeping highest score.
 */

import type { SearchResultHit } from '../core/SearchResult';

export function deduplicateSearchHits(items: readonly SearchResultHit[]): SearchResultHit[] {
  const bestByKey = new Map<string, SearchResultHit>();
  for (const item of items) {
    const key = `${item.domainType}:${item.id}`;
    const existing = bestByKey.get(key);
    if (!existing || item.score > existing.score) {
      bestByKey.set(key, item);
    }
  }
  return Array.from(bestByKey.values());
}
