/**
 * @file src/platform/search/query/QuerySuggestions.ts
 * @description Generates ranked autocomplete and multi-intent suggestions without auto-forcing ambiguous filters.
 */

import type { SearchScope } from '../core/SearchTypes';
import { resolveQueryEntities, type KnownPlaceDirectoryEntry } from './EntityResolver';
import { classifySearchQueryIntent } from './QueryIntent';

export interface SearchQuerySuggestionItem {
  id: string;
  labelFa: string;
  subtitleFa: string;
  targetScope: SearchScope;
  queryText: string;
  entityId?: string;
  cityId?: string;
  kind: 'entity' | 'intent_branch' | 'recent' | 'saved';
}

export function buildQuerySuggestions(params: {
  rawQuery: string;
  recentQueries?: readonly string[];
  directory?: readonly KnownPlaceDirectoryEntry[];
  limit?: number;
}): SearchQuerySuggestionItem[] {
  const { rawQuery, recentQueries = [], directory, limit = 8 } = params;
  const trimmed = (rawQuery || '').trim();
  const results: SearchQuerySuggestionItem[] = [];

  if (!trimmed) {
    for (const recent of recentQueries.slice(0, limit)) {
      results.push({
        id: `recent:${recent}`,
        labelFa: recent,
        subtitleFa: 'جست‌وجوی اخیر شما در این فضای کاری',
        targetScope: 'all',
        queryText: recent,
        kind: 'recent',
      });
    }
    return results;
  }

  const entityOutcome = resolveQueryEntities(trimmed, directory);
  const intent = classifySearchQueryIntent(trimmed);

  for (const entity of entityOutcome.entities) {
    if (entity.confidence === 'UNKNOWN') continue;
    results.push({
      id: `entity:${entity.type}:${entity.id}`,
      labelFa: entity.canonicalNameFa,
      subtitleFa:
        entity.type === 'city'
          ? 'کلانشهر'
          : entity.type === 'district'
            ? 'منطقه شهری (مشاهده محله‌ها و آمار)'
            : entity.type === 'analytic_metric'
              ? 'گزارش تحلیلی و روند قیمت'
              : 'پروفایل محله و آگهی‌ها',
      targetScope:
        entity.type === 'analytic_metric'
          ? 'market-analytics'
          : entity.type === 'neighborhood'
            ? 'neighborhoods'
            : 'all',
      queryText: entity.canonicalNameFa,
      entityId: entity.id,
      cityId: entity.cityId,
      kind: 'entity',
    });
  }

  if (intent.isAmbiguousMultiIntent) {
    results.push(
      {
        id: `branch:analytics:${trimmed}`,
        labelFa: `تحلیل بازار و قیمت برای «${trimmed}»`,
        subtitleFa: 'نمایش نمودار روند، میانگین قیمت و شاخص‌های منطقه',
        targetScope: 'market-analytics',
        queryText: trimmed,
        kind: 'intent_branch',
      },
      {
        id: `branch:listings:${trimmed}`,
        labelFa: `آگهی‌های فروش و اجاره در «${trimmed}»`,
        subtitleFa: 'فهرست املاک و آگهی‌های فعال',
        targetScope: 'listings',
        queryText: trimmed,
        kind: 'intent_branch',
      }
    );
  }

  return results.slice(0, limit);
}
