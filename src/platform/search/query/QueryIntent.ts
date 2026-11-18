/**
 * @file src/platform/search/query/QueryIntent.ts
 * @description Multi-domain intent classification supporting ambiguous queries without forced single-filter lock-in.
 */

import type { SearchScope } from '../core/SearchTypes';
import { parseSearchQueryTokens } from './QueryParser';

export interface SearchQueryIntentResult {
  primaryScope: SearchScope;
  candidateScopes: SearchScope[];
  isAmbiguousMultiIntent: boolean;
  explanationFa: string;
}

export function classifySearchQueryIntent(rawQuery: string, explicitScope: SearchScope = 'all'): SearchQueryIntentResult {
  if (explicitScope !== 'all') {
    return {
      primaryScope: explicitScope,
      candidateScopes: [explicitScope],
      isAmbiguousMultiIntent: false,
      explanationFa: `جست‌وجو در دامنه انتخاب‌شده (${explicitScope})`,
    };
  }

  const parsed = parseSearchQueryTokens(rawQuery);
  const q = parsed.normalizedQuery;

  if (!q) {
    return {
      primaryScope: 'all',
      candidateScopes: ['neighborhoods', 'properties', 'listings', 'market-analytics'],
      isAmbiguousMultiIntent: false,
      explanationFa: 'نمایش جامع تمام دامنه‌های رادار',
    };
  }

  // Ambiguous query like «قیمت منطقه ۵» or «سعادت آباد»: user may want neighborhood profile, market analytics, OR listings!
  if (parsed.isAnalyticalQuestion && (parsed.extractedDistrictNumber || q.length > 3)) {
    return {
      primaryScope: 'all',
      candidateScopes: ['market-analytics', 'neighborhoods', 'listings', 'properties'],
      isAmbiguousMultiIntent: true,
      explanationFa: 'عبارت چندمنظوره تشخیص داده شد: نمایش همزمان تحلیل قیمت، محله‌ها و آگهی‌های مرتبط',
    };
  }

  if (/\b(اسباب کشی|بازسازی|کارشناسی|وکیل|قرارداد|مبایعه نامه|تعمیرات)\b/.test(q)) {
    return {
      primaryScope: 'services',
      candidateScopes: ['services', 'neighborhoods'],
      isAmbiguousMultiIntent: false,
      explanationFa: 'جست‌وجوی خدمات ملکی و کارشناسی',
    };
  }

  if (/\b(ساختمان|برج|مجتمع|پلاک ثبتی)\b/.test(q)) {
    return {
      primaryScope: 'buildings',
      candidateScopes: ['buildings', 'properties', 'listings'],
      isAmbiguousMultiIntent: true,
      explanationFa: 'جست‌وجوی ساختمان و واحدهای مرتبط',
    };
  }

  if (parsed.extractedArea || parsed.extractedBedrooms || parsed.transactionModeHint) {
    return {
      primaryScope: 'listings',
      candidateScopes: ['listings', 'properties', 'neighborhoods'],
      isAmbiguousMultiIntent: false,
      explanationFa: 'جست‌وجوی آگهی‌ها و املاک بر اساس مشخصات ملکی',
    };
  }

  return {
    primaryScope: 'all',
    candidateScopes: ['neighborhoods', 'listings', 'properties', 'buildings', 'services', 'market-analytics'],
    isAmbiguousMultiIntent: true,
    explanationFa: 'جست‌وجوی یکپارچه در محله‌ها، املاک، آگهی‌ها و تحلیل بازار',
  };
}
