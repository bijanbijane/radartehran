/**
 * RT-UI-SEARCH-001 | Persian Query Understanding, Normalization, Synonym & Intent Planner
 * Deterministic pipeline: Raw Query -> Validation -> Persian Normalization -> Tokenization
 * -> Typo/Synonym Expansion -> Multi-City Entity Recognition -> Intent Detection -> Filter Extraction
 */

import { MULTI_CITY_CONFIGS, type CityId } from '../../../data/multiCityData';
import {
  ExtractedSearchPlan,
  IntentConfidenceLevel,
  NormalizedQueryResult,
  RecognizedEntity,
  SearchErrorCode,
  SearchFilterSet,
  SearchIntent,
  SearchScope,
  SearchSortOption,
  SearchSynonymRecord,
  SearchViewMode,
} from '../models/search.types';

export const MAX_SEARCH_QUERY_LENGTH = 200;

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const COMPOUND_CANONICAL_MAP: Array<[RegExp, string]> = [
  [/سعادت[\s\u200c]*آباد|سعادت[\s\u200c]*اباد/g, 'سعادت‌آباد'],
  [/تهران[\s\u200c]*پارس/g, 'تهران‌پارس'],
  [/امیر[\s\u200c]*آباد|امیر[\s\u200c]*اباد/g, 'امیرآباد'],
  [/مرز[\s\u200c]*داران/g, 'مرزداران'],
  [/شهرک[\s\u200c]+غرب/g, 'شهرک غرب'],
  [/ارزش[\s\u200c]*گذاری/g, 'ارزش‌گذاری'],
  [/یک[\s\u200c]*خوابه|۱[\s\u200c]*خوابه|1[\s\u200c]*خوابه/g, '۱خوابه'],
  [/دو[\s\u200c]*خوابه|۲[\s\u200c]*خوابه|2[\s\u200c]*خوابه/g, '۲خوابه'],
  [/سه[\s\u200c]*خوابه|۳[\s\u200c]*خوابه|3[\s\u200c]*خوابه/g, '۳خوابه'],
  [/چهار[\s\u200c]*خوابه|۴[\s\u200c]*خوابه|4[\s\u200c]*خوابه/g, '۴خوابه'],
];

const TYPO_DICTIONARY: Record<string, string> = {
  'سعات آباد': 'سعادت‌آباد',
  'سعات‌آباد': 'سعادت‌آباد',
  'سعادتاباد': 'سعادت‌آباد',
  'نیاورون': 'نیاوران',
  'پاسدارن': 'پاسداران',
  'فرمانیهه': 'فرمانیه',
  'ونکک': 'ونک',
  'ارزشگزاری': 'ارزش‌گذاری',
};

export const INITIAL_SYNONYM_REGISTRY: SearchSynonymRecord[] = [
  { id: 'syn-1', canonicalTerm: 'خانه', variants: ['خونه', 'منزل', 'مسکن'], domainScope: 'PROPERTIES', active: true, updatedBy: 'system', updatedAt: '2026-04-01T00:00:00Z' },
  { id: 'syn-2', canonicalTerm: 'آپارتمان', variants: ['واحد مسکونی', 'واحد آپارتمانی', 'اپارتمان'], domainScope: 'PROPERTIES', active: true, updatedBy: 'system', updatedAt: '2026-04-01T00:00:00Z' },
  { id: 'syn-3', canonicalTerm: 'رهن کامل', variants: ['رهن بدون اجاره', 'تمام رهن'], domainScope: 'LISTINGS', active: true, updatedBy: 'system', updatedAt: '2026-04-01T00:00:00Z' },
  { id: 'syn-4', canonicalTerm: 'نوساز', variants: ['کلیدنخورده', 'کلید نخورده', 'صفر'], domainScope: 'PROPERTIES', active: true, updatedBy: 'system', updatedAt: '2026-04-01T00:00:00Z' },
  { id: 'syn-5', canonicalTerm: 'کلنگی', variants: ['ملک تخریبی', 'مناسب ساخت', 'مشارکت در ساخت'], domainScope: 'PROPERTIES', active: true, updatedBy: 'system', updatedAt: '2026-04-01T00:00:00Z' },
  { id: 'syn-6', canonicalTerm: 'کارشناس ارزیابی', variants: ['کارشناس رسمی دادگستری', 'ارزیاب ملک', 'کارشناس قیمت‌گذاری'], domainScope: 'SERVICES', active: true, updatedBy: 'system', updatedAt: '2026-04-01T00:00:00Z' },
];

export interface CanonicalPlaceEntry {
  id: string;
  canonicalName: string;
  district?: number;
  cityId?: CityId;
  hoodNumericId?: number;
  aliases: string[];
  hierarchyPath: string[];
}

export const PLACE_HIERARCHY_REGISTRY: CanonicalPlaceEntry[] = [
  { id: 'niavaran', canonicalName: 'نیاوران', district: 1, cityId: 'tehran', hoodNumericId: 1, aliases: ['محله نیاوران', 'کاخ نیاوران'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۱', 'نیاوران'] },
  { id: 'farmanieh', canonicalName: 'فرمانیه', district: 1, cityId: 'tehran', hoodNumericId: 2, aliases: ['محله فرمانیه', 'اندرزگو'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۱', 'فرمانیه'] },
  { id: 'saadat-abad', canonicalName: 'سعادت‌آباد', district: 2, cityId: 'tehran', hoodNumericId: 5, aliases: ['سعادت آباد', 'سعادت اباد', 'محله سعادت‌آباد'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۲', 'سعادت‌آباد'] },
  { id: 'shahrak-gharb', canonicalName: 'شهرک غرب', district: 2, cityId: 'tehran', hoodNumericId: 6, aliases: ['شهرک قدس', 'محله شهرک غرب'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۲', 'شهرک غرب'] },
  { id: 'marzdaran', canonicalName: 'مرزداران', district: 2, cityId: 'tehran', hoodNumericId: 14, aliases: ['بلوار مرزداران', 'محله مرزداران'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۲', 'مرزداران'] },
  { id: 'vanak', canonicalName: 'ونک', district: 3, cityId: 'tehran', hoodNumericId: 7, aliases: ['میدان ونک', 'محله ونک', 'ملاصدرا'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۳', 'ونک'] },
  { id: 'pasdaran', canonicalName: 'پاسداران', district: 3, cityId: 'tehran', hoodNumericId: 4, aliases: ['خیابان پاسداران', 'دروس'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۳', 'پاسداران'] },
  { id: 'tehranpars', canonicalName: 'تهران‌پارس', district: 4, cityId: 'tehran', hoodNumericId: 11, aliases: ['تهرانپارس', 'تهران پارس', 'فلکه اول تهرانپارس'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۴', 'تهران‌پارس'] },
  { id: 'punak', canonicalName: 'پونک', district: 5, cityId: 'tehran', hoodNumericId: 13, aliases: ['محله پونک', 'اشرفی اصفهانی', 'جنت‌آباد'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۵', 'پونک'] },
  { id: 'amir-abad', canonicalName: 'امیرآباد', district: 6, cityId: 'tehran', hoodNumericId: 9, aliases: ['امیر آباد', 'کارگر شمالی', 'یوسف‌آباد'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۶', 'امیرآباد'] },
];

export function normalizeDigitsToAscii(input: string): string {
  let out = input;
  for (let i = 0; i < 10; i++) {
    out = out.replaceAll(PERSIAN_DIGITS[i], String(i)).replaceAll(ARABIC_DIGITS[i], String(i));
  }
  return out;
}

export function extractValidDistrictNumber(zoneText?: string): number | undefined {
  if (!zoneText) return undefined;
  const m = normalizeDigitsToAscii(zoneText).match(/منطقه\s*([0-9]{1,2})/);
  if (!m) return undefined;
  const d = Number(m[1]);
  return Number.isInteger(d) && d >= 1 && d <= 22 ? d : undefined;
}

const CITY_PLACE_CACHE = new Map<CityId, CanonicalPlaceEntry[]>();

export function getPlaceHierarchyForCity(cityId: CityId = 'tehran'): CanonicalPlaceEntry[] {
  const cached = CITY_PLACE_CACHE.get(cityId);
  if (cached) return cached;
  const cfg = MULTI_CITY_CONFIGS[cityId] || MULTI_CITY_CONFIGS.tehran;
  const entries: CanonicalPlaceEntry[] = [];
  const seenNames = new Set<string>();

  if (cityId === 'tehran') {
    for (const p of PLACE_HIERARCHY_REGISTRY) {
      entries.push(p);
      seenNames.add(p.canonicalName);
    }
  }

  for (const hood of cfg.neighborhoods) {
    if (seenNames.has(hood.name)) continue;
    seenNames.add(hood.name);
    const district = extractValidDistrictNumber(hood.zone);
    const id = cityId === 'tehran' ? `tehran-${hood.id}` : `${cityId}-${hood.id}`;
    const hierarchyPath = ['ایران', `شهر ${cfg.nameFa}`, ...(district !== undefined ? [`منطقه ${district}`] : []), hood.name];
    entries.push({
      id,
      canonicalName: hood.name,
      ...(district !== undefined ? { district } : {}),
      cityId,
      hoodNumericId: hood.id,
      aliases: [`محله ${hood.name}`, String(hood.id)],
      hierarchyPath,
    });
  }

  CITY_PLACE_CACHE.set(cityId, entries);
  return entries;
}

export function validateRawSearchQuery(rawQuery: unknown): { valid: boolean; errorCode?: SearchErrorCode; messageFa?: string } {
  if (typeof rawQuery !== 'string') return { valid: false, errorCode: 'INVALID_QUERY', messageFa: 'عبارت جست‌وجو نامعتبر است.' };
  if (rawQuery.length > MAX_SEARCH_QUERY_LENGTH) {
    return { valid: false, errorCode: 'QUERY_TOO_LONG', messageFa: `طول عبارت جست‌وجو نباید بیش از ${MAX_SEARCH_QUERY_LENGTH} کاراکتر باشد.` };
  }
  return { valid: true };
}

export function normalizePersianSearchQuery(
  rawQuery: string,
  synonymRegistry: SearchSynonymRecord[] = INITIAL_SYNONYM_REGISTRY
): NormalizedQueryResult {
  const preservedRaw = rawQuery;
  let text = rawQuery
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ي|ى/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/إ|أ/g, 'ا');

  text = normalizeDigitsToAscii(text);

  let typoSuggestion: NormalizedQueryResult['typoSuggestion'] | undefined;
  for (const [typo, canonical] of Object.entries(TYPO_DICTIONARY)) {
    if (text.includes(typo)) {
      typoSuggestion = {
        originalToken: typo,
        suggestedToken: canonical,
        suggestedQuery: text.replace(typo, canonical),
        promptFa: `منظورتان «${canonical}» است؟`,
      };
      break;
    }
  }

  for (const [pattern, replacement] of COMPOUND_CANONICAL_MAP) {
    text = text.replace(pattern, replacement);
  }

  text = text
    .replace(/1خوابه/g, '۱خوابه').replace(/2خوابه/g, '۲خوابه').replace(/3خوابه/g, '۳خوابه').replace(/4خوابه/g, '۴خوابه')
    .replace(/\u200c{2,}/g, '\u200c').replace(/\s+/g, ' ').trim();

  const tokens = text ? text.split(' ').filter(Boolean) : [];
  const expandedSet = new Set<string>(tokens);

  for (const syn of synonymRegistry) {
    if (!syn.active) continue;
    const allTerms = [syn.canonicalTerm, ...syn.variants];
    if (allTerms.some((term) => text.includes(term))) {
      expandedSet.add(syn.canonicalTerm);
      syn.variants.forEach((v) => expandedSet.add(v));
    }
  }

  return { rawQuery: preservedRaw, normalizedQuery: text, tokens, expandedTerms: Array.from(expandedSet), typoSuggestion };
}

export function buildSearchPlan(
  rawQuery: string,
  synonymRegistry: SearchSynonymRecord[] = INITIAL_SYNONYM_REGISTRY,
  activeCity?: CityId
): ExtractedSearchPlan {
  const norm = normalizePersianSearchQuery(rawQuery, synonymRegistry);
  const q = norm.normalizedQuery;
  const recognizedEntities: RecognizedEntity[] = [];
  const extractedFilters: SearchFilterSet = activeCity ? { cityId: activeCity } : {};
  const cityPlaces = getPlaceHierarchyForCity(activeCity || 'tehran');

  const isWordChar = (ch: string | undefined): boolean => Boolean(ch && /[\u0600-\u06FF\u200cA-Za-z0-9]/.test(ch));
  const matchesTermAtWordBoundary = (haystack: string, needle: string): boolean => {
    if (needle.length < 2 || /^\d+$/.test(needle)) return false;
    let start = 0;
    while (start <= haystack.length - needle.length) {
      const idx = haystack.indexOf(needle, start);
      if (idx === -1) return false;
      if (!isWordChar(haystack[idx - 1]) && !isWordChar(haystack[idx + needle.length])) return true;
      start = idx + 1;
    }
    return false;
  };
  let bestPlaceMatch: { place: CanonicalPlaceEntry; termLen: number } | null = null;
  for (const place of cityPlaces) {
    for (const term of [place.canonicalName, ...place.aliases]) {
      if (matchesTermAtWordBoundary(q, term) && (!bestPlaceMatch || term.length > bestPlaceMatch.termLen)) {
        bestPlaceMatch = { place, termLen: term.length };
      }
    }
  }
  if (bestPlaceMatch) {
    const place = bestPlaceMatch.place;
    recognizedEntities.push({ text: place.canonicalName, canonicalName: place.canonicalName, entityType: 'PLACE', entityId: place.id, confidence: 0.96 });
    extractedFilters.neighborhoodId = place.id;
    extractedFilters.neighborhoodName = place.canonicalName;
    if (place.district !== undefined) extractedFilters.districtNumber = place.district;
  }

  const districtMatch = q.match(/منطقه\s*([0-9]{1,2})/);
  if (districtMatch) {
    const dNum = Number(districtMatch[1]);
    if (dNum >= 1 && dNum <= 22) {
      extractedFilters.districtNumber = dNum;
      recognizedEntities.push({ text: `منطقه ${dNum}`, canonicalName: `منطقه ${dNum}`, entityType: 'DISTRICT', entityId: `district-${dNum}`, confidence: 0.95 });
    }
  }

  if (/رهن کامل|تمام رهن/.test(q)) extractedFilters.transactionType = 'FULL_MORTGAGE';
  else if (/اجاره|رهن/.test(q)) extractedFilters.transactionType = 'RENT';
  else if (/خرید|فروش/.test(q)) extractedFilters.transactionType = 'BUY';

  if (/آپارتمان|اپارتمان|واحد مسکونی/.test(q)) extractedFilters.propertyType = 'APARTMENT';
  else if (/ویلایی|ویلا/.test(q)) extractedFilters.propertyType = 'VILLA';
  else if (/اداری|دفتر کار/.test(q)) extractedFilters.propertyType = 'OFFICE';
  else if (/تجاری|مغازه/.test(q)) extractedFilters.propertyType = 'COMMERCIAL';
  else if (/کلنگی|ملک تخریبی/.test(q)) extractedFilters.propertyType = 'OLD_HOUSE';

  if (q.includes('۱خوابه')) extractedFilters.bedrooms = 1;
  else if (q.includes('۲خوابه')) extractedFilters.bedrooms = 2;
  else if (q.includes('۳خوابه')) extractedFilters.bedrooms = 3;
  else if (q.includes('۴خوابه')) extractedFilters.bedrooms = 4;

  const billionMatch = q.match(/(?:زیر|تا|حداکثر)?\s*([0-9]+(?:\.[0-9]+)?)\s*میلیارد/);
  if (billionMatch) extractedFilters.maxPriceMillionToman = Math.round(Number(billionMatch[1]) * 1000);
  const millionMatch = q.match(/(?:زیر|تا|حداکثر)?\s*([0-9]+)\s*میلیون/);
  if (millionMatch && !billionMatch) extractedFilters.maxPriceMillionToman = Number(millionMatch[1]);

  const areaMatch = q.match(/([0-9]{2,4})\s*متر/);
  if (areaMatch) {
    const sqm = Number(areaMatch[1]);
    extractedFilters.minAreaSqm = Math.max(30, sqm - 15);
    extractedFilters.maxAreaSqm = sqm + 25;
  }

  let primaryIntent: SearchIntent = 'GENERAL_SEARCH';
  const secondaryIntents: SearchIntent[] = [];
  let confidenceScore = 0.55;

  if (/کارشناس|وکیل|بازسازی|مشاور|خدمات|متخصص|نقشه\u200cبرداری|داور/.test(q)) {
    primaryIntent = 'SERVICE_DISCOVERY'; confidenceScore = 0.92;
  } else if (/میانگین قیمت|شاخص|روند قیمت|تورم|بازده|تحلیل بازار|حباب/.test(q)) {
    primaryIntent = 'MARKET_ANALYSIS'; secondaryIntents.push('NEIGHBORHOOD_LOOKUP'); confidenceScore = 0.91;
  } else if (/ارزش‌گذاری|تخمین قیمت|برآورد ارزش|قیمت‌گذاری هدونیک/.test(q)) {
    primaryIntent = 'VALUATION_INTENT'; secondaryIntents.push('MARKET_ANALYSIS'); confidenceScore = 0.93;
  } else if (/پرسش|تجربه|نظرات کاربران|سند مشاع|مشارکت جمعی|بحث/.test(q)) {
    primaryIntent = 'COMMUNITY_SEARCH'; secondaryIntents.push('KNOWLEDGE_LOOKUP'); confidenceScore = 0.9;
  } else if (/تاریخچه|مقاله|پژوهش|گزارش تخصصی|روش‌شناسی|واژه‌نامه|فرونشست|گسل/.test(q)) {
    primaryIntent = 'KNOWLEDGE_LOOKUP'; secondaryIntents.push('NEIGHBORHOOD_LOOKUP'); confidenceScore = 0.89;
  } else if (extractedFilters.propertyType || extractedFilters.bedrooms || extractedFilters.transactionType || extractedFilters.maxPriceMillionToman) {
    primaryIntent = 'PROPERTY_SEARCH';
    if (extractedFilters.neighborhoodId) secondaryIntents.push('NEIGHBORHOOD_LOOKUP');
    confidenceScore = 0.92;
  } else if (extractedFilters.neighborhoodId || extractedFilters.districtNumber || /محله|منطقه/.test(q)) {
    primaryIntent = 'NEIGHBORHOOD_LOOKUP'; secondaryIntents.push('PROPERTY_SEARCH', 'MARKET_ANALYSIS'); confidenceScore = 0.88;
  } else if (/خوب|مناسب|ارزان|شمال|جنوب|شرق|غرب/.test(q) || norm.tokens.length <= 1) {
    primaryIntent = 'GENERAL_SEARCH'; confidenceScore = 0.42;
  }

  const confidence: IntentConfidenceLevel = confidenceScore >= 0.85 ? 'HIGH' : confidenceScore >= 0.65 ? 'MEDIUM' : 'LOW';
  const autoAppliedFilters: SearchFilterSet = confidence === 'HIGH' ? { ...extractedFilters } : activeCity ? { cityId: activeCity } : {};
  const suggestedFilters: SearchFilterSet = confidence !== 'HIGH' ? { ...extractedFilters } : {};
  const targetScopes = resolveTargetScopesForIntent(primaryIntent);

  return {
    rawQuery: norm.rawQuery, normalizedQuery: norm.normalizedQuery, tokens: norm.tokens, expandedTerms: norm.expandedTerms,
    recognizedEntities, primaryIntent, secondaryIntents, confidence, confidenceScore,
    extractedFilters, autoAppliedFilters, suggestedFilters, targetScopes, typoSuggestion: norm.typoSuggestion,
  };
}

function resolveTargetScopesForIntent(intent: SearchIntent): SearchScope[] {
  if (intent === 'PROPERTY_SEARCH') return ['PROPERTIES', 'LISTINGS', 'NEIGHBORHOODS'];
  if (intent === 'NEIGHBORHOOD_LOOKUP') return ['NEIGHBORHOODS', 'MARKET', 'PROPERTIES', 'KNOWLEDGE'];
  if (intent === 'MARKET_ANALYSIS') return ['MARKET', 'NEIGHBORHOODS', 'KNOWLEDGE'];
  if (intent === 'VALUATION_INTENT') return ['VALUATION', 'MARKET', 'SERVICES'];
  if (intent === 'SERVICE_DISCOVERY') return ['SERVICES', 'PROVIDERS', 'KNOWLEDGE'];
  if (intent === 'KNOWLEDGE_LOOKUP') return ['KNOWLEDGE', 'COMMUNITY', 'NEIGHBORHOODS'];
  if (intent === 'COMMUNITY_SEARCH') return ['COMMUNITY', 'KNOWLEDGE', 'NEIGHBORHOODS'];
  return ['ALL', 'PROPERTIES', 'NEIGHBORHOODS', 'MARKET', 'SERVICES', 'KNOWLEDGE', 'COMMUNITY'];
}

export function encodeSearchUrlState(params: {
  q?: string; scope?: SearchScope; sort?: SearchSortOption; viewMode?: SearchViewMode;
  page?: number; pageSize?: number; filters?: SearchFilterSet;
}): string {
  const sp = new URLSearchParams();
  if (params.q && params.q.trim()) sp.set('q', params.q.trim().slice(0, MAX_SEARCH_QUERY_LENGTH));
  if (params.scope && params.scope !== 'ALL') sp.set('scope', params.scope);
  if (params.sort && params.sort !== 'RELEVANCE') sp.set('sort', params.sort);
  if (params.viewMode && params.viewMode !== 'LIST') sp.set('sview', params.viewMode);
  if (params.page && params.page > 1) sp.set('spage', String(params.page));
  if (params.pageSize && params.pageSize !== 12) sp.set('ssize', String(params.pageSize));
  const f = params.filters;
  if (f?.neighborhoodId) sp.set('hood', f.neighborhoodId);
  if (f?.districtNumber) sp.set('district', String(f.districtNumber));
  if (f?.propertyType) sp.set('ptype', f.propertyType);
  if (f?.transactionType) sp.set('tx', f.transactionType);
  if (f?.bedrooms) sp.set('beds', String(f.bedrooms));
  if (f?.maxPriceMillionToman) sp.set('maxPrice', String(f.maxPriceMillionToman));
  if (f?.boundingBox) {
    const b = f.boundingBox;
    sp.set('bbox', `${b.south.toFixed(4)},${b.west.toFixed(4)},${b.north.toFixed(4)},${b.east.toFixed(4)}`);
  }
  return sp.toString();
}

export function mergeSearchUrlStateIntoSearch(
  currentSearch: string,
  params: {
    q?: string; scope?: SearchScope; sort?: SearchSortOption; viewMode?: SearchViewMode;
    page?: number; pageSize?: number; filters?: SearchFilterSet;
  }
): string {
  const sp = new URLSearchParams(currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch);
  const searchOwnedKeys = ['q', 'scope', 'sort', 'sview', 'spage', 'ssize', 'shood', 'district', 'ptype', 'tx', 'beds', 'maxPrice', 'bbox'];
  for (const k of searchOwnedKeys) sp.delete(k);
  if (params.q && params.q.trim()) sp.set('q', params.q.trim().slice(0, MAX_SEARCH_QUERY_LENGTH));
  if (params.scope && params.scope !== 'ALL') sp.set('scope', params.scope);
  if (params.sort && params.sort !== 'RELEVANCE') sp.set('sort', params.sort);
  if (params.viewMode && params.viewMode !== 'LIST') sp.set('sview', params.viewMode);
  if (params.page && params.page > 1) sp.set('spage', String(params.page));
  if (params.pageSize && params.pageSize !== 12) sp.set('ssize', String(params.pageSize));
  const f = params.filters;
  if (f?.neighborhoodId) sp.set('shood', f.neighborhoodId);
  if (f?.districtNumber) sp.set('district', String(f.districtNumber));
  if (f?.propertyType) sp.set('ptype', f.propertyType);
  if (f?.transactionType) sp.set('tx', f.transactionType);
  if (f?.bedrooms) sp.set('beds', String(f.bedrooms));
  if (f?.maxPriceMillionToman) sp.set('maxPrice', String(f.maxPriceMillionToman));
  if (f?.boundingBox) {
    const b = f.boundingBox;
    sp.set('bbox', `${b.south.toFixed(4)},${b.west.toFixed(4)},${b.north.toFixed(4)},${b.east.toFixed(4)}`);
  }
  return sp.toString();
}

export function decodeSearchUrlState(queryString: string): {
  q: string; scope: SearchScope; sort: SearchSortOption; viewMode: SearchViewMode;
  page: number; pageSize: number; filters: SearchFilterSet;
} {
  const sp = new URLSearchParams(queryString.startsWith('?') ? queryString.slice(1) : queryString);
  const rawQ = (sp.get('q') || '').slice(0, MAX_SEARCH_QUERY_LENGTH).replace(/[<>]/g, '');
  const validScopes: SearchScope[] = ['ALL', 'PROPERTIES', 'LISTINGS', 'NEIGHBORHOODS', 'MARKET', 'VALUATION', 'SERVICES', 'PROVIDERS', 'KNOWLEDGE', 'COMMUNITY', 'MAP', 'ACCOUNT'];
  const rawScope = (sp.get('scope') || 'ALL') as SearchScope;
  const scope = validScopes.includes(rawScope) ? rawScope : 'ALL';
  const validSorts: SearchSortOption[] = ['RELEVANCE', 'NEWEST', 'PRICE_ASC', 'PRICE_DESC', 'PRICE_PER_SQM_ASC', 'AREA_DESC', 'DISTANCE_ASC', 'POPULARITY_DESC', 'RATING_DESC', 'QUALITY_SCORE_DESC'];
  const rawSort = (sp.get('sort') || 'RELEVANCE') as SearchSortOption;
  const sort = validSorts.includes(rawSort) ? rawSort : 'RELEVANCE';
  const rawView = (sp.get('sview') || 'LIST') as SearchViewMode;
  const viewMode: SearchViewMode = rawView === 'MAP' || rawView === 'SPLIT' ? rawView : 'LIST';
  const rawPage = Number(sp.get('spage'));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(sp.get('ssize'));
  const pageSize = rawSize === 24 || rawSize === 48 ? rawSize : 12;
  const filters: SearchFilterSet = {};
  const shood = sp.get('shood') || sp.get('hood');
  if (shood && /^[a-z0-9-]+$/i.test(shood) && !/^\d+$/.test(shood)) filters.neighborhoodId = shood;
  const district = Number(sp.get('district'));
  if (Number.isInteger(district) && district >= 1 && district <= 22) filters.districtNumber = district;
  const ptype = sp.get('ptype') as SearchFilterSet['propertyType'];
  if (ptype && ['APARTMENT', 'VILLA', 'OFFICE', 'COMMERCIAL', 'OLD_HOUSE'].includes(ptype)) filters.propertyType = ptype;
  const tx = sp.get('tx') as SearchFilterSet['transactionType'];
  if (tx && ['BUY', 'RENT', 'FULL_MORTGAGE'].includes(tx)) filters.transactionType = tx;
  const beds = Number(sp.get('beds'));
  if (Number.isInteger(beds) && beds >= 1 && beds <= 6) filters.bedrooms = beds;
  const maxPrice = Number(sp.get('maxPrice'));
  if (Number.isFinite(maxPrice) && maxPrice > 0 && maxPrice <= 500_000) filters.maxPriceMillionToman = maxPrice;
  const bboxRaw = sp.get('bbox');
  if (bboxRaw) {
    const parts = bboxRaw.split(',').map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > parts[0] && parts[3] > parts[1]) {
      filters.boundingBox = { south: parts[0], west: parts[1], north: parts[2], east: parts[3] };
    }
  }
  return { q: rawQ, scope, sort, viewMode, page, pageSize, filters };
}
