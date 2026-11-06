import { FeatureFlags } from '../types/models'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; import { DEFAULT_FEATURE_FLAGS, normalizePersianSearchText, sanitizeInput } from './security'; export const PERSIAN_AND_FINGLISH_HOOD_ALIASES: Readonly<Record<string, string>> = { vanak: 'ونک', 'saadat abad': 'سعادت اباد', saadatabad: 'سعادت اباد', pasdaran: 'پاسداران', ekbatan: 'اکباتان', punak: 'پونک', poonak: 'پونک', tajrish: 'تجریش', niavaran: 'نیاوران', zaferanieh: 'زعفرانیه', velenjak: 'ولنجک', shahrak: 'شهرک غرب', 'شهرک قدس': 'شهرک غرب', 'کوی نصر': 'گیشا', gisha: 'گیشا', narmak: 'نارمک', tehranpars: 'تهرانپارس', yousefabad: 'یوسف اباد', chitgar: 'چیتگر', 'دریاچه چیتگر': 'چیتگر', farmanieh: 'فرمانیه', elahieh: 'الهیه', jordan: 'جردن', lavasan: 'لواسان', damavand: 'دماوند', pardis: 'پردیس', parand: 'پرند', shahriar: 'شهریار', eslamshahr: 'اسلامشهر', varamin: 'ورامین', pakdasht: 'پاکدشت', karaj: 'کرج', azimieh: 'عظیمیه', mehrshahr: 'مهرشهر', gohardasht: 'گوهردشت', 'رجایی شهر': 'گوهردشت', jahanshahr: 'جهانشهر', fardis: 'فردیس', hashtgerd: 'هشتگرد', kordan: 'کردان', taleghan: 'طالقان', mashhad: 'مشهد', vakilabad: 'وکیل اباد', sajjad: 'سجاد', elahiehmashhad: 'الهیه مشهد', torghabeh: 'طرقبه', shandiz: 'شاندیز', neyshabur: 'نیشابور', sabzevar: 'سبزوار', isfahan: 'اصفهان', esfahan: 'اصفهان', mardavij: 'مرداویج', jolfa: 'جلفا', sepahanshahr: 'سپاهان شهر', baharestan: 'بهارستان', shahreza: 'شهرضا', kashan: 'کاشان', najafabad: 'نجف اباد', shiraz: 'شیراز', maaliabad: 'معالی اباد', afifabad: 'عفیف اباد', ghasrodasht: 'قصرالدشت', sadra: 'صدرا', marvdasht: 'مرودشت', jahrom: 'جهرم', fasa: 'فسا', lar: 'لار', kazerun: 'کازرون', tabriz: 'تبریز', elgoli: 'ائل گلی', 'شاه گلی': 'ائل گلی', valiasr: 'ولیعصر', maragheh: 'مراغه', marand: 'مرند', rasht: 'رشت', golsar: 'گلسار', anzali: 'بندر انزلی', lahijan: 'لاهیجان', ramsar: 'رامسر', chalus: 'چالوس', nowshahr: 'نوشهر', nur: 'نور', mahmudabad: 'محموداباد', babolsar: 'بابلسر', babol: 'بابل', amol: 'امل', sari: 'ساری', ghaemshahr: 'قائم شهر', gorgan: 'گرگان', gonbad: 'گنبد کاووس', urmia: 'ارومیه', khoy: 'خوی', mahabad: 'مهاباد', ardabil: 'اردبیل', sarein: 'سرعین', zanjan: 'زنجان', qazvin: 'قزوین', hamedan: 'همدان', kermanshah: 'کرمانشاه', sanandaj: 'سنندج', marivan: 'مریوان', baneh: 'بانه', qom: 'قم', pardisan: 'پردیسان', arak: 'اراک', saveh: 'ساوه', khorramabad: 'خرم اباد', borujerd: 'بروجرد', shahrekord: 'شهرکرد', ilam: 'ایلام', yasuj: 'یاسوج', yazd: 'یزد', ardakan: 'اردکان', meybod: 'میبد', kerman: 'کرمان', sirjan: 'سیرجان', rafsanjan: 'رفسنجان', bam: 'بم', jiroft: 'جیرفت', zahedan: 'زاهدان', chabahar: 'چابهار', birjand: 'بیرجند', bojnurd: 'بجنورد', semnan: 'سمنان', shahrud: 'شاهرود', ahvaz: 'اهواز', kianpars: 'کیانپارس', abadan: 'ابادان', khorramshahr: 'خرمشهر', dezful: 'دزفول', mahshahr: 'بندر ماهشهر', bushehr: 'بوشهر', asalooyeh: 'عسلویه', bandarabbas: 'بندرعباس', kish: 'کیش', qeshm: 'قشم', }; export function computeBoundedLevenshteinDistance(a: string, b: string, maxDistance = 2): number { if (a === b) return 0; const lenA = a.length, lenB = b.length; if (Math.abs(lenA - lenB) > maxDistance) return maxDistance + 1; const prev = new Array<number>(lenB + 1), curr = new Array<number>(lenB + 1);
  for (let j = 0; j <= lenB; j++) prev[j] = j; for (let i = 1; i <= lenA; i++) { curr[0] = i; let rowMin = curr[0]; for (let j = 1; j <= lenB; j++) { const cost = a[i - 1] === b[j - 1] ? 0 : 1; curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost); if (curr[j] < rowMin) rowMin = curr[j]; }
    if (rowMin > maxDistance) return maxDistance + 1; for (let j = 0; j <= lenB; j++) prev[j] = curr[j]; } return prev[lenB]; } export type NeighborhoodMatchTier = 'EXACT_NAME' | 'COMPACT_OR_ALIAS' | 'PREFIX_NAME' | 'MULTI_TOKEN' | 'SUBSTRING_NAME' | 'TYPO_TOLERANT_DISTANCE_1' | 'ZONE_MATCH'; export interface RankedNeighborhoodSearchHit<T extends { id: number; name: string; zone?: string; overallScore?: number }> { item: T; relevanceScore: number; matchTier: NeighborhoodMatchTier; }
export function executeUnifiedNeighborhoodSearch<
  T extends { id: number; name: string; zone?: string; pros?: string; bargains?: readonly { street?: string }[]; overallScore?: number }, >( candidates: readonly T[], rawQuery: string, options?: { enableTypoTolerance?: boolean }, ): RankedNeighborhoodSearchHit<T>[] { const normQ = normalizePersianSearchText(rawQuery); if (!normQ) return candidates.map((item) => ({ item, relevanceScore: 100, matchTier: 'EXACT_NAME' })); const mappedQuery = PERSIAN_AND_FINGLISH_HOOD_ALIASES[normQ] ?? normQ; const compactQ = mappedQuery.replace(/\s+/g, ''); const tokens = mappedQuery.split(' ').filter(Boolean); const isPurelyNumeric = /^\d+$/.test(compactQ); const allowTypo = (options?.enableTypoTolerance ?? true) && !isPurelyNumeric && compactQ.length >= 4; const hits: RankedNeighborhoodSearchHit<T>[] = []; const seenIds = new Set<number>(); for (const item of candidates) {
    if (seenIds.has(item.id)) continue; seenIds.add(item.id); const normName = normalizePersianSearchText(item.name); const compactName = normName.replace(/\s+/g, ''); const normZone = normalizePersianSearchText(item.zone ?? ''); const normPros = normalizePersianSearchText(item.pros ?? ''); const normStreet = normalizePersianSearchText(item.bargains?.[0]?.street ?? ''); if (normName === mappedQuery) { hits.push({ item, relevanceScore: 100, matchTier: 'EXACT_NAME' });
    } else if (compactName === compactQ) { hits.push({ item, relevanceScore: 95, matchTier: 'COMPACT_OR_ALIAS' }); } else if (normName.startsWith(mappedQuery) || compactName.startsWith(compactQ)) { hits.push({ item, relevanceScore: 85, matchTier: 'PREFIX_NAME' }); } else if (tokens.length > 1 && tokens.every((tk) => normName.includes(tk) || normZone.includes(tk) || normPros.includes(tk))) { hits.push({ item, relevanceScore: 75, matchTier: 'MULTI_TOKEN' }); } else if (normName.includes(mappedQuery) || compactName.includes(compactQ)) { hits.push({ item, relevanceScore: 65, matchTier: 'SUBSTRING_NAME' }); } else if (allowTypo && computeBoundedLevenshteinDistance(compactName, compactQ, 1) <= 1) {
      hits.push({ item, relevanceScore: 55, matchTier: 'TYPO_TOLERANT_DISTANCE_1' }); } else if ((normZone && normZone.includes(mappedQuery)) || (!isPurelyNumeric && mappedQuery.length >= 2 && (normPros.includes(mappedQuery) || normStreet.includes(mappedQuery)))) { hits.push({ item, relevanceScore: 50, matchTier: 'ZONE_MATCH' }); } }
  return hits.sort( (a, b) =>
      b.relevanceScore - a.relevanceScore || (b.item.overallScore ?? 0) - (a.item.overallScore ?? 0) ||
      a.item.id - b.item.id, ); }
export interface SearchableFeatureCatalogEntry { featureId: string; displayNameFa: string; keywordsFa: readonly string[]; aliasesEn: readonly string[]; shortDescriptionFa: string; category: 'VALUATION' | 'DISCOVERY' | 'LEGAL_FINANCE' | 'B2B_CRM' | 'ADMIN'; actionTarget: string;
  requiresAdmin: boolean; featureFlagKey?: keyof FeatureFlags; }
export const SEARCHABLE_RADAR_FEATURE_CATALOG: readonly SearchableFeatureCatalogEntry[] = [
  { featureId: 'hedonic_valuator', displayNameFa: 'ماشین‌حساب قیمت‌گذاری هدونیک ملک', keywordsFa: ['قیمت گذاری', 'ارزش گذاری', 'تخمین قیمت', 'هدونیک', 'متری چند', 'محاسبه قیمت آپارتمان'],
    aliasesEn: ['hedonic', 'valuation', 'price calculator'], shortDescriptionFa: 'محاسبه دقیق ارزش منصفانه و قیمت فروش فوری ملک بر اساس سن، طبقه، امکانات و محله',
    category: 'VALUATION', actionTarget: 'modal:hedonic',
    requiresAdmin: false,
    featureFlagKey: 'enableAiValuation',
  },
  {
    featureId: 'smart_suggest',
    displayNameFa: 'پیشنهاد هوشمند محله متناسب با بودجه',
    keywordsFa: ['پیشنهاد محله', 'بهترین محله', 'کجا خانه بخرم', 'بودجه من', 'مشاور هوشمند'],
    aliasesEn: ['smart suggest', 'recommendation'],
    shortDescriptionFa: 'معرفی ۳ محله برتر هم‌خوان با بودجه، مترو، کیفیت هوا و فاصله تا محل کار',
    category: 'DISCOVERY',
    actionTarget: 'modal:smart_suggest',
    requiresAdmin: false,
  },
  {
    featureId: 'neighborhood_compare',
    displayNameFa: 'مقایسه دو‌به‌دو و ماتریس محله‌ها',
    keywordsFa: ['مقایسه محله', 'ماتریس مقایسه', 'کدام محله بهتر است', 'جدول مقایسه'],
    aliasesEn: ['compare', 'shortlist matrix'],
    shortDescriptionFa: 'مقایسه هم‌زمان شاخص‌های قیمت، رهن، مترو، امنیت و کیفیت هوای محله‌ها',
    category: 'DISCOVERY',
    actionTarget: 'modal:compare',
    requiresAdmin: false,
  },
  {
    featureId: 'buyer_price_alerts',
    displayNameFa: 'ثبت هشدار شکار فایل زیر قیمت',
    keywordsFa: ['هشدار قیمت', 'فایل شکار', 'زیر قیمت', 'اطلاع رسانی خرید', 'پیامک شکار'],
    aliasesEn: ['buyer alert', 'bargain alert'],
    shortDescriptionFa: 'ثبت درخواست اطلاع‌رسانی فوری هنگام ثبت آپارتمان ۱۰ تا ۶۰ درصد زیر میانگین محله',
    category: 'DISCOVERY',
    actionTarget: 'modal:buyer_alert',
    requiresAdmin: false,
  },
  {
    featureId: 'contract_legal_advisor',
    displayNameFa: 'کارشناس حقوقی قرارداد و کمیسیون املاک',
    keywordsFa: ['کمیسیون', 'حقوق مستاجر', 'قرارداد اجاره', 'مبایعه نامه', 'قانونی'],
    aliasesEn: ['legal advisor', 'commission calculator', 'contract'],
    shortDescriptionFa: 'محاسبه تعرفه قانونی کمیسیون، بررسی بندهای پرریسک قرارداد و حقوق مستأجر',
    category: 'LEGAL_FINANCE',
    actionTarget: 'modal:super_modules:legal',
    requiresAdmin: false,
    featureFlagKey: 'enableAiContractCheck',
  },
  {
    featureId: 'property_swap_tradeup',
    displayNameFa: 'شبیه‌ساز معاوضه و ارتقای ملک (Trade-Up)',
    keywordsFa: ['معاوضه ملک', 'تبدیل به احسن', 'ارتقای خانه', 'فروش و خرید همزمان'],
    aliasesEn: ['trade up', 'swap'],
    shortDescriptionFa: 'بررسی محله‌های قابل ارتقا با فروش ملک فعلی، افزودن نقدینگی، وام و کسر رهن مستأجر',
    category: 'VALUATION',
    actionTarget: 'modal:trade_up',
    requiresAdmin: false,
    featureFlagKey: 'enablePropertySwap',
  },
  {
    featureId: 'admin_crm_panel',
    displayNameFa: 'پنل مدیریت CRM، سلامت سرور و پشتیبان‌گیری',
    keywordsFa: ['مدیریت', 'ادمین', 'پشتیبان گیری', 'سلامت سرور', 'لاگ امنیتی'],
    aliasesEn: ['admin', 'crm', 'backup'],
    shortDescriptionFa: 'مدیریت حامیان املاک، ممیزی دیتابیس و پشتیبان‌گیری رمزنگاری‌شده ویژه مدیران',
    category: 'ADMIN',
    actionTarget: 'modal:admin',
    requiresAdmin: true,
  },
];
export function searchApplicationFeatures(params: {
  rawQuery: string;
  isVerifiedAdmin: boolean;
  featureFlags?: FeatureFlags;
}): SearchableFeatureCatalogEntry[] {
  const flags = params.featureFlags ?? DEFAULT_FEATURE_FLAGS;
  const normQ = normalizePersianSearchText(params.rawQuery);
  const permitted = SEARCHABLE_RADAR_FEATURE_CATALOG.filter((entry) => {
    if (entry.requiresAdmin && !params.isVerifiedAdmin) return false;
    if (entry.featureFlagKey && !flags[entry.featureFlagKey]) return false;
    return true;
  });
  if (!normQ) return permitted;
  return permitted.filter((entry) => {
    if (normalizePersianSearchText(entry.displayNameFa).includes(normQ)) return true;
    if (normalizePersianSearchText(entry.shortDescriptionFa).includes(normQ)) return true;
    if (entry.keywordsFa.some((k) => normalizePersianSearchText(k).includes(normQ))) return true;
    if (entry.aliasesEn.some((a) => normalizePersianSearchText(a).includes(normQ))) return true;
    return false;
  });
}
export type EmptySearchCause = 'BACKEND_OR_NETWORK_ERROR' | 'RESTRICTIVE_ACTIVE_FILTERS' | 'TYPO_CORRECTION_AVAILABLE' | 'GENUINE_ZERO_RESULTS';
export function diagnoseEmptySearchState(
  params: {
    rawQuery: string;
    backendErrorOccurred: boolean;
    hasActiveRestrictiveFilters: boolean;
    unfilteredMatchesCount: number;
    typoSuggestedNames: readonly string[];
  },
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()
): {
  cause: EmptySearchCause;
  userTitleFa: string;
  recoveryActionLabelFa: string;
  suggestedCorrections: readonly string[];
  canOfferFilterReset: boolean;
  canOfferRetry: boolean;
  displayAreaUnitLabel: string;
  defaultBudgetFilterBenchmarkIntlText: string;
} {
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const defaultBudgetFilterBenchmarkIntlText = formatMillionTomanAsIntlCurrency(8500, intlCurrency);
  if (params.backendErrorOccurred) {
    return {
      cause: 'BACKEND_OR_NETWORK_ERROR', userTitleFa: 'اختلال موقت در ارتباط با سرور؛ نتایج جست‌وجو قابل بارگذاری نیست.',
      recoveryActionLabelFa: 'تلاش مجدد', suggestedCorrections: [], canOfferFilterReset: false, canOfferRetry: true,
      displayAreaUnitLabel, defaultBudgetFilterBenchmarkIntlText,
    };
  }
  if (params.hasActiveRestrictiveFilters && params.unfilteredMatchesCount > 0) {
    return {
      cause: 'RESTRICTIVE_ACTIVE_FILTERS', userTitleFa: 'محله منطبق با نام وجود دارد، اما فیلترهای بودجه/مترو/طرح ترافیک آن را پنهان کرده‌اند.',
      recoveryActionLabelFa: 'بازنشانی فیلترها', suggestedCorrections: [], canOfferFilterReset: true, canOfferRetry: false,
      displayAreaUnitLabel, defaultBudgetFilterBenchmarkIntlText,
    };
  }
  if (params.typoSuggestedNames.length > 0) {
    return {
      cause: 'TYPO_CORRECTION_AVAILABLE', userTitleFa: `محله‌ای با عبارت دقیق «${sanitizeInput(params.rawQuery, 40)}» یافت نشد. شاید منظورتان یکی از موارد زیر است:`,
      recoveryActionLabelFa: 'انتخاب محله مشابه', suggestedCorrections: params.typoSuggestedNames.slice(0, 3), canOfferFilterReset: false, canOfferRetry: false,
      displayAreaUnitLabel, defaultBudgetFilterBenchmarkIntlText,
    };
  }
  return {
    cause: 'GENUINE_ZERO_RESULTS', userTitleFa: 'محله‌ای با این مشخصات در این شهر یافت نشد.',
    recoveryActionLabelFa: 'مشاهده محله‌های پرطرفدار', suggestedCorrections: [], canOfferFilterReset: params.hasActiveRestrictiveFilters, canOfferRetry: false,
    displayAreaUnitLabel, defaultBudgetFilterBenchmarkIntlText,
  };
}
export function paginateSearchResultsWithCursor<T extends { id: number | string }>(params: {
  items: readonly T[];
  pageSize: number;
  afterCursor?: string | null;
}): {
  pageItems: T[];
  nextCursor: string | null;
  hasMore: boolean;
  cursorValid: boolean;
} {
  const safePageSize = Math.max(1, Math.min(50, Math.floor(params.pageSize || 10)));
  let startIndex = 0;
  let cursorValid = true;
  if (params.afterCursor) {
    const decodedId = params.afterCursor.startsWith('cur:') ? params.afterCursor.slice(4) : '';
    const foundIdx = params.items.findIndex((it) => String(it.id) === decodedId);
    if (foundIdx === -1) {
      cursorValid = false;
      return { pageItems: [], nextCursor: null, hasMore: false, cursorValid: false };
    }
    startIndex = foundIdx + 1;
  }
  const pageItems = params.items.slice(startIndex, startIndex + safePageSize);
  const hasMore = startIndex + safePageSize < params.items.length;
  const lastItem = pageItems[pageItems.length - 1];
  const nextCursor = hasMore && lastItem ? `cur:${String(lastItem.id)}` : null;
  return {
    pageItems,
    nextCursor,
    hasMore,
    cursorValid,
  };
}
export function validateSearchQuerySecurity(input: {
  rawQuery: string;
  requestedPageSize?: number;
  requestedAdminScope?: boolean;
  isVerifiedAdmin?: boolean;
}): {
  allowed: boolean;
  sanitizedQuery: string;
  safePageSize: number;
  rejectionReason:
    | null
    | 'QUERY_TOO_LONG'
    | 'UNAUTHORIZED_ADMIN_SEARCH_SCOPE'
    | 'EXCESSIVE_PAGE_SIZE'
    | 'MALICIOUS_QUERY_PATTERN';
} {
  if (input.requestedAdminScope && !input.isVerifiedAdmin) {
    return {
      allowed: false,
      sanitizedQuery: '',
      safePageSize: 0,
      rejectionReason: 'UNAUTHORIZED_ADMIN_SEARCH_SCOPE',
    };
  }
  if (typeof input.rawQuery === 'string' && input.rawQuery.length > 120) {
    return {
      allowed: false,
      sanitizedQuery: '',
      safePageSize: 0,
      rejectionReason: 'QUERY_TOO_LONG',
    };
  }
  if (typeof input.requestedPageSize === 'number' && input.requestedPageSize > 100) {
    return {
      allowed: false,
      sanitizedQuery: '',
      safePageSize: 0,
      rejectionReason: 'EXCESSIVE_PAGE_SIZE',
    };
  }
  const deobfuscated = String(input.rawQuery || '').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');
  if (/<script|javascript:|__proto__|constructor|prototype|\$where|\$regex|\$ne|\$gt/i.test(deobfuscated)) {
    return { allowed: false, sanitizedQuery: '', safePageSize: 0, rejectionReason: 'MALICIOUS_QUERY_PATTERN' };
  }
  return {
    allowed: true,
    sanitizedQuery: sanitizeInput(deobfuscated, 120),
    safePageSize: Math.max(1, Math.min(50, Math.floor(input.requestedPageSize ?? 20))),
    rejectionReason: null,
  };
}
export class DeterministicSearchCache<V> {
  private readonly store = new Map<string, { value: V; expiresAtMs: number }>();
  private hits = 0;
  private misses = 0;
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  constructor(options?: { maxEntries?: number; ttlMs?: number }) {
    const rawMax = options?.maxEntries ?? 64;
    this.maxEntries = Number.isFinite(rawMax) ? Math.max(1, Math.min(1000, Math.trunc(rawMax))) : 64;
    const rawTtl = options?.ttlMs ?? 60_000;
    this.ttlMs = Number.isFinite(rawTtl) ? Math.max(1000, Math.min(3_600_000, Math.trunc(rawTtl))) : 60_000;
  }
  static buildIsolatedCacheKey(params: {
    cityId: string;
    mode: 'rent' | 'buy';
    actorRole: 'public' | 'admin';
    rawQuery: string;
    filterDigest: string;
  }): string {
    const safeRole = params.actorRole === 'admin' ? 'admin' : 'public';
    const safeCity = String(params.cityId || 'tehran').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'tehran';
    const safeMode = params.mode === 'rent' ? 'rent' : 'buy';
    const safeDigest = String(params.filterDigest || 'default').replace(/[:\u0000-\u001F\u007F]/g, '_').slice(0, 64);
    const normQ = normalizePersianSearchText(params.rawQuery).replace(/:/g, '');
    return `${safeRole}:${safeCity}:${safeMode}:${safeDigest}:${normQ}`;
  }
  get(key: string, nowMs = Date.now()): V | undefined {
    const entry = this.store.get(key);
    if (!entry) { this.misses += 1; return undefined; }
    if (nowMs > entry.expiresAtMs) { this.store.delete(key); this.misses += 1; return undefined; }
    this.hits += 1;
    return entry.value;
  }
  set(key: string, value: V, nowMs = Date.now()): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAtMs: nowMs + this.ttlMs }); } invalidateAll(): void { this.store.clear(); } getStats(): { hits: number; misses: number; size: number; hitRatePercent: number } { const total = this.hits + this.misses; return { hits: this.hits, misses: this.misses, size: this.store.size, hitRatePercent: total > 0 ? Number(((this.hits / total) * 100).toFixed(2)) : 0, }; } }