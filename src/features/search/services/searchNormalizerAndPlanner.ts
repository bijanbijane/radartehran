/**
 * RT-UI-SEARCH-001 | Persian Query Understanding, Normalization, Synonym & Intent Planner
 * Deterministic pipeline: Raw Query -> Validation -> Persian Normalization -> Tokenization
 * -> Typo/Synonym Expansion -> Entity Recognition -> Intent Detection -> Filter Extraction
 */

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
  district: number;
  aliases: string[];
  hierarchyPath: string[];
}

export const PLACE_HIERARCHY_REGISTRY: CanonicalPlaceEntry[] = [
  { id: 'niavaran', canonicalName: 'نیاوران', district: 1, aliases: ['محله نیاوران', 'کاخ نیاوران'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۱', 'نیاوران'] },
  { id: 'farmanieh', canonicalName: 'فرمانیه', district: 1, aliases: ['محله فرمانیه', 'اندرزگو'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۱', 'فرمانیه'] },
  { id: 'saadat-abad', canonicalName: 'سعادت‌آباد', district: 2, aliases: ['سعادت آباد', 'سعادت اباد', 'محله سعادت‌آباد'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۲', 'سعادت‌آباد'] },
  { id: 'shahrak-gharb', canonicalName: 'شهرک غرب', district: 2, aliases: ['شهرک قدس', 'محله شهرک غرب'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۲', 'شهرک غرب'] },
  { id: 'marzdaran', canonicalName: 'مرزداران', district: 2, aliases: ['بلوار مرزداران', 'محله مرزداران'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۲', 'مرزداران'] },
  { id: 'vanak', canonicalName: 'ونک', district: 3, aliases: ['میدان ونک', 'محله ونک', 'ملاصدرا'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۳', 'ونک'] },
  { id: 'pasdaran', canonicalName: 'پاسداران', district: 3, aliases: ['خیابان پاسداران', 'دروس'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۳', 'پاسداران'] },
  { id: 'tehranpars', canonicalName: 'تهران‌پارس', district: 4, aliases: ['تهرانپارس', 'تهران پارس', 'فلکه اول تهرانپارس'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۴', 'تهران‌پارس'] },
  { id: 'punak', canonicalName: 'پونک', district: 5, aliases: ['محله پونک', 'اشرفی اصفهانی', 'جنت‌آباد'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۵', 'پونک'] },
  { id: 'amir-abad', canonicalName: 'امیرآباد', district: 6, aliases: ['امیر آباد', 'کارگر شمالی', 'یوسف‌آباد'], hierarchyPath: ['ایران', 'استان تهران', 'شهر تهران', 'منطقه ۶', 'امیرآباد'] },
];

export function validateRawSearchQuery(rawQuery: unknown): { valid: boolean; errorCode?: SearchErrorCode; messageFa?: string } {
  if (typeof rawQuery !== 'string') return { valid: false, errorCode: 'INVALID_QUERY', messageFa: 'عبارت جست‌وجو نامعتبر است.' };
  if (rawQuery.length > MAX_SEARCH_QUERY_LENGTH) {
    return { valid: false, errorCode: 'QUERY_TOO_LONG', messageFa: `طول عبارت جست‌وجو نباید بیش از ${MAX_SEARCH_QUERY_LENGTH} کاراکتر باشد.` };
  }
  return { valid: true };
}

export function normalizeDigitsToAscii(input: string): string {
  let out = input;
  for (let i = 0; i < 10; i++) {
    out = out.replaceAll(PERSIAN_DIGITS[i], String(i)).replaceAll(ARABIC_DIGITS[i], String(i));
  }
  return out;
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
  synonymRegistry: SearchSynonymRecord[] = INITIAL_SYNONYM_REGISTRY
): ExtractedSearchPlan {
  const norm = normalizePersianSearchQuery(rawQuery, synonymRegistry);
  const q = norm.normalizedQuery;
  const recognizedEntities: RecognizedEntity[] = [];
  const extractedFilters: SearchFilterSet = {};

  for (const place of PLACE_HIERARCHY_REGISTRY) {
    if ([place.canonicalName, ...place.aliases].some((term) => q.includes(term))) {
      recognizedEntities.push({ text: place.canonicalName, canonicalName: place.canonicalName, entityType: 'PLACE', entityId: place.id, confidence: 0.96 });
      extractedFilters.neighborhoodId = place.id;
      extractedFilters.neighborhoodName = place.canonicalName;
      extractedFilters.districtNumber = place.district;
      break;
    }
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
  const autoAppliedFilters: SearchFilterSet = confidence === 'HIGH' ? { ...extractedFilters } : {};
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

export function encodeSearchUrlState(params: { q?: string; scope?: SearchScope; sort?: SearchSortOption; filters?: SearchFilterSet }): string {
  const sp = new URLSearchParams();
  if (params.q && params.q.trim()) sp.set('q', params.q.trim().slice(0, MAX_SEARCH_QUERY_LENGTH));
  if (params.scope && params.scope !== 'ALL') sp.set('scope', params.scope);
  if (params.sort && params.sort !== 'RELEVANCE') sp.set('sort', params.sort);
  const f = params.filters;
  if (f?.neighborhoodId) sp.set('hood', f.neighborhoodId);
  if (f?.districtNumber) sp.set('district', String(f.districtNumber));
  if (f?.propertyType) sp.set('ptype', f.propertyType);
  if (f?.transactionType) sp.set('tx', f.transactionType);
  if (f?.bedrooms) sp.set('beds', String(f.bedrooms));
  if (f?.maxPriceMillionToman) sp.set('maxPrice', String(f.maxPriceMillionToman));
  return sp.toString();
}

export function decodeSearchUrlState(queryString: string): { q: string; scope: SearchScope; sort: SearchSortOption; filters: SearchFilterSet } {
  const sp = new URLSearchParams(queryString.startsWith('?') ? queryString.slice(1) : queryString);
  const rawQ = (sp.get('q') || '').slice(0, MAX_SEARCH_QUERY_LENGTH).replace(/[<>]/g, '');
  const validScopes: SearchScope[] = ['ALL', 'PROPERTIES', 'LISTINGS', 'NEIGHBORHOODS', 'MARKET', 'VALUATION', 'SERVICES', 'PROVIDERS', 'KNOWLEDGE', 'COMMUNITY', 'MAP', 'ACCOUNT'];
  const rawScope = (sp.get('scope') || 'ALL') as SearchScope;
  const scope = validScopes.includes(rawScope) ? rawScope : 'ALL';
  const validSorts: SearchSortOption[] = ['RELEVANCE', 'NEWEST', 'PRICE_ASC', 'PRICE_DESC', 'PRICE_PER_SQM_ASC', 'AREA_DESC', 'DISTANCE_ASC', 'POPULARITY_DESC', 'RATING_DESC', 'QUALITY_SCORE_DESC'];
  const rawSort = (sp.get('sort') || 'RELEVANCE') as SearchSortOption;
  const sort = validSorts.includes(rawSort) ? rawSort : 'RELEVANCE';
  const filters: SearchFilterSet = {};
  const hood = sp.get('hood');
  if (hood && /^[a-z0-9-]+$/i.test(hood)) filters.neighborhoodId = hood;
  const district = Number(sp.get('district'));
  if (Number.isInteger(district) && district >= 1 && district <= 22) filters.districtNumber = district;
  const beds = Number(sp.get('beds'));
  if (Number.isInteger(beds) && beds >= 1 && beds <= 6) filters.bedrooms = beds;
  const maxPrice = Number(sp.get('maxPrice'));
  if (Number.isFinite(maxPrice) && maxPrice > 0 && maxPrice <= 500_000) filters.maxPriceMillionToman = maxPrice;
  return { q: rawQ, scope, sort, filters };
}
