/**
 * @file server/modules/geography/aliases.ts
 * @description Persian Text Normalization, Alias Registry, and Ambiguity Detection Engine.
 */

import { NeighborhoodAlias, SupportedCityId } from './types';

/**
 * Normalizes Persian text for resilient matching:
 * - Unifies Arabic/Persian Yeh and Kaf (`ي` -> `ی`, `ك` -> `ک`).
 * - Strips Arabic diacritics (harakat).
 * - Standardizes Zero-Width Non-Joiner (ZWNJ / نیم‌فاصله) vs standard space.
 */
export function normalizePersianText(input: string): string {
  if (!input) return '';
  return input
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove diacritics
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627') // Alef with madda/hamza to bare Alef
    .replace(/\u064A/g, '\u06CC') // Arabic Yeh to Persian
    .replace(/\u0643/g, '\u06A9') // Arabic Kaf to Persian
    .replace(/\u0629/g, '\u0647') // Teh Marbuta to Heh
    .replace(/\u06C0/g, '\u0647') // Heh with Yeh above to Heh
    .replace(/\u200C/g, ' ') // ZWNJ to space for comparison
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Strips common Persian geographic prefixes and affixes for root-name matching.
 */
export function extractRootGeographicName(input: string): string {
  const normalized = normalizePersianText(input);
  return normalized
    .replace(/^(محله|شهرک|خیابان|بلوار|میدان|کوی)\s+/g, '')
    .trim();
}

/**
 * Canonical registered aliases and colloquial names across supported cities.
 */
export const CANONICAL_ALIASES: NeighborhoodAlias[] = [
  // --- Tehran ---
  {
    alias: 'سعادت اباد',
    normalizedAlias: normalizePersianText('سعادت اباد'),
    targetHoodId: 3,
    targetCityId: 'tehran',
    kind: 'zwnj_variant',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'شهرک قدس',
    normalizedAlias: normalizePersianText('شهرک قدس'),
    targetHoodId: 4,
    targetCityId: 'tehran',
    kind: 'colloquial',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'جنت اباد',
    normalizedAlias: normalizePersianText('جنت اباد'),
    targetHoodId: 6,
    targetCityId: 'tehran',
    kind: 'zwnj_variant',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'آریاشهر',
    normalizedAlias: normalizePersianText('آریاشهر'),
    targetHoodId: 7,
    targetCityId: 'tehran',
    kind: 'colloquial',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'اریارشهر',
    normalizedAlias: normalizePersianText('اریارشهر'),
    targetHoodId: 7,
    targetCityId: 'tehran',
    kind: 'spelling_variant',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'تهران پارس',
    normalizedAlias: normalizePersianText('تهران پارس'),
    targetHoodId: 10,
    targetCityId: 'tehran',
    kind: 'zwnj_variant',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'سلطنت آباد',
    normalizedAlias: normalizePersianText('سلطنت آباد'),
    targetHoodId: 11,
    targetCityId: 'tehran',
    kind: 'colloquial',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'کوی نصر',
    normalizedAlias: normalizePersianText('کوی نصر'),
    targetHoodId: 14,
    targetCityId: 'tehran',
    kind: 'colloquial',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'سهروردی',
    normalizedAlias: normalizePersianText('سهروردی'),
    targetHoodId: 19,
    targetCityId: 'tehran',
    kind: 'colloquial',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'دولت آباد ری',
    normalizedAlias: normalizePersianText('دولت آباد ری'),
    targetHoodId: 23,
    targetCityId: 'tehran',
    kind: 'sub_area',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'ستارخان',
    normalizedAlias: normalizePersianText('ستارخان'),
    targetHoodId: 28,
    targetCityId: 'tehran',
    kind: 'spelling_variant',
    isAmbiguousAcrossCities: true, // Also exists in Shiraz (id: 404)
  },

  // --- Karaj ---
  {
    alias: 'گوهردشت',
    normalizedAlias: normalizePersianText('گوهردشت'),
    targetHoodId: 103,
    targetCityId: 'karaj',
    kind: 'colloquial',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'رجایی شهر',
    normalizedAlias: normalizePersianText('رجایی شهر'),
    targetHoodId: 103,
    targetCityId: 'karaj',
    kind: 'zwnj_variant',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'طالقانی شمالی',
    normalizedAlias: normalizePersianText('طالقانی شمالی'),
    targetHoodId: 101,
    targetCityId: 'karaj',
    kind: 'sub_area',
    isAmbiguousAcrossCities: false,
  },

  // --- Mashhad ---
  {
    alias: 'ملک آباد',
    normalizedAlias: normalizePersianText('ملک آباد'),
    targetHoodId: 201,
    targetCityId: 'mashhad',
    kind: 'sub_area',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'احمد اباد',
    normalizedAlias: normalizePersianText('احمد اباد'),
    targetHoodId: 202,
    targetCityId: 'mashhad',
    kind: 'zwnj_variant',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'کوهسنگی',
    normalizedAlias: normalizePersianText('کوهسنگی'),
    targetHoodId: 203,
    targetCityId: 'mashhad',
    kind: 'zwnj_variant',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'وکیل اباد',
    normalizedAlias: normalizePersianText('وکیل اباد'),
    targetHoodId: 204,
    targetCityId: 'mashhad',
    kind: 'zwnj_variant',
    isAmbiguousAcrossCities: false,
  },

  // --- Isfahan ---
  {
    alias: 'چهارباغ بالا',
    normalizedAlias: normalizePersianText('چهارباغ بالا'),
    targetHoodId: 301,
    targetCityId: 'isfahan',
    kind: 'sub_area',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'شیخ صدوق',
    normalizedAlias: normalizePersianText('شیخ صدوق'),
    targetHoodId: 302,
    targetCityId: 'isfahan',
    kind: 'colloquial',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'پل خواجو',
    normalizedAlias: normalizePersianText('پل خواجو'),
    targetHoodId: 304,
    targetCityId: 'isfahan',
    kind: 'colloquial',
    isAmbiguousAcrossCities: false,
  },

  // --- Shiraz ---
  {
    alias: 'قصردشت',
    normalizedAlias: normalizePersianText('قصردشت'),
    targetHoodId: 401,
    targetCityId: 'shiraz',
    kind: 'spelling_variant',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'معالی اباد',
    normalizedAlias: normalizePersianText('معالی اباد'),
    targetHoodId: 402,
    targetCityId: 'shiraz',
    kind: 'zwnj_variant',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'عفیف اباد',
    normalizedAlias: normalizePersianText('عفیف اباد'),
    targetHoodId: 403,
    targetCityId: 'shiraz',
    kind: 'zwnj_variant',
    isAmbiguousAcrossCities: false,
  },
  {
    alias: 'ستارخان',
    normalizedAlias: normalizePersianText('ستارخان'),
    targetHoodId: 404,
    targetCityId: 'shiraz',
    kind: 'spelling_variant',
    isAmbiguousAcrossCities: true, // Also exists in Tehran (id: 28)
  },
];

/**
 * Searches aliases matching a normalized query string.
 */
export function findMatchingAliases(rawQuery: string): NeighborhoodAlias[] {
  const norm = normalizePersianText(rawQuery);
  const root = extractRootGeographicName(rawQuery);
  if (!norm) return [];

  return CANONICAL_ALIASES.filter(
    (a) => a.normalizedAlias === norm || a.normalizedAlias === root
  );
}

/**
 * Returns all registered aliases for a specific neighborhood.
 */
export function getAliasesForNeighborhood(cityId: SupportedCityId, hoodId: number): string[] {
  return CANONICAL_ALIASES.filter(
    (a) => a.targetCityId === cityId && a.targetHoodId === hoodId
  ).map((a) => a.alias);
}
