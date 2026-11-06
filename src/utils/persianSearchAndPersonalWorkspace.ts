import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
const PERSIAN_DIGIT_MAP: Record<string, string> = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', }; export function normalizePersianDisplayText(raw: string): string {
  if (!raw) return ''; return String(raw).slice(0, 500)
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .replace(/[\u064A\u0649\u06CC\u06D2]/g, 'ی')
    .replace(/[\u0643\u06A9]/g, 'ک')
    .replace(/\u06C0/g, 'ه')
    .replace(/\u0629/g, 'ه')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim(); }
export function normalizePersianSearchText(raw: string): string { if (!raw) return ''; return String(raw).slice(0, 500)
    .replace(/[۰-۹٠-٩]/g, (ch) => PERSIAN_DIGIT_MAP[ch] ?? ch)
    .replace(/[\u064A\u0649\u06CC\u06D2]/g, 'ی')
    .replace(/[\u0643\u06A9]/g, 'ک')
    .replace(/[\u0622\u0623\u0625\u0671]/g, 'ا')
    .replace(/\u0624/g, 'و')
    .replace(/\u0626/g, 'ی')
    .replace(/[\u06C0\u0629]/g, 'ه')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[\u200C\u200B\u200D\uFEFF\-_.,/\\()[\]{}<>]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim(); }
export function compactPersianSearchKey(raw: string): string { return normalizePersianSearchText(raw).replace(/\s+/g, ''); }
export function tokenizePersianSearchQuery(raw: string): string[] { const norm = normalizePersianSearchText(raw); return norm ? norm.split(' ').filter(Boolean) : []; }
export const CITY_SCOPED_NEIGHBORHOOD_ALIASES: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>> > = { tehran: { 'امیرآباد': ['کارگر شمالی', 'امیر آباد', 'بلوار آزادگان', 'قزل قلعه'],
    'سعادت‌آباد': ['سعادت اباد', 'کوی فراز', 'میدان کاج', 'شهرک مخابرات', 'بلوار بهزاد'], 'شهرک غرب': ['قدس', 'شهرک قدس', 'ایران زمین', 'دادمان', 'فاز ۱ تا ۶ شهرک غرب'], 'ونک': ['میدان ونک', 'ملاصدرا', 'شیخ بهایی', 'ده ونک', 'برزیل'], 'جردن': ['نلسون ماندلا', 'آفریقا', 'بلوار آفریقا', 'امانیه'],
    'پاسداران': ['بوستان پاسداران', 'گلستان پاسداران', 'دروس', 'احتشامیه', 'ضرابخانه'], 'نیاوران': ['بوکان', 'جمشیدیه', 'کاشانک', 'منظریه', 'حصارک نیاوران'], 'فرمانیه': ['اندرزگو', 'بلوار اندرزگو', 'چیذر', 'کامرانیه', 'دیباجی شمالی'], 'پونک': ['اشرفی اصفهانی', 'عدالت', 'همیلا', 'باغ فیض', 'سردار جنگل'],
    'تهرانپارس': ['فلکه اول تهرانپارس', 'فلکه سوم تهرانپارس', 'تهران پارس', 'حکیمیه', 'قنات کوثر'], 'نارمک': ['هفت حوض', 'میدان نبوت', 'چهارراه سرسبز', 'مدائن', 'دردشت'], 'ستارخان': ['برق آلستوم', 'توحید', 'باقرخان', 'تهران ویلا', 'صادقیه', 'طرشت'], 'یوسف‌آباد': ['یوسف اباد', 'سید جمال الدین اسدآبادی', 'جهان آرا', 'کردستان'],
    'گیشا': ['کوی نصر', 'بزرگراه جلال آل احمد', 'مرزداران'], 'چیتگر': ['دریاچه چیتگر', 'منطقه ۲۲', 'دریاچه شهدای خلیج فارس', 'کوهک', 'ایران مال', 'شهرک راه آهن', 'دهکده المپیک'], 'الهیه': ['فرشته', 'تختی الهیه', 'مریم', 'زعفرانیه'], 'ولنجک': ['دانشگاه شهید بهشتی', 'توچال', 'درکه', 'اوین'], }, mashhad: {
    'وکیل‌آباد': ['وکیل اباد', 'بلوار وکیل آباد', 'هاشمیه', 'کوثر مشهد', 'هفت تیر مشهد'], 'احمدآباد': ['احمد اباد', 'ملاصدرا مشهد', 'کوهسنگی', 'بعثت مشهد', 'راهنمایی'], 'سجاد': ['بلوار سجاد', 'سجادشهر', 'حامد', 'بزرگمهر مشهد', 'فرامرز عباسی'], 'الهیه مشهد': ['امیریه مشهد', 'رحمانیه', 'مجیدیه مشهد', 'میثاق'], },
  isfahan: { 'مرداویج': ['فاربس', 'ملاصدرا اصفهان', 'شیخ صدوق', 'چهارباغ بالا', 'هزارجریب'], 'جلفا': ['خاقانی', 'نظر میانی', 'توحید اصفهان', 'حکیم نظامی', 'سنگتراشها'], 'سپاهان‌شهر': ['سپاهان شهر', 'بهارستان اصفهان', 'صفه'], },
  shiraz: { 'معالی‌آباد': ['معالی اباد', 'بلوار شریعتی شیراز', 'فرهنگ شهر', 'تاچارا', 'گلدشت معالی آباد'], 'عفیف‌آباد': ['عفیف اباد', 'ستارخان شیراز', 'قصرالدشت', 'زرگری', 'خلدبرین'], 'صدرا': ['شهر جدید صدرا', 'گویم', 'گلستان شیراز'],
  }, tabriz: {
    'ولیعصر': ['کوی ولیعصر', 'ولیعصر تبریز', 'رشدیه', 'فرشته تبریز'],
    'ائل‌گلی': ['شاه گلی', 'ایل گلی', 'زعفرانیه تبریز', 'پرواز تبریز', 'گلشهر تبریز'],
  },
  karaj: {
    'مهرشهر': ['بلوار شهرداری', 'فاز ۱ مهرشهر', 'فاز ۲ مهرشهر', 'کوی زنبق', 'کیانمهر'],
    'گوهردشت': ['رجایی شهر', 'فلکه اول گوهردشت', 'داریوش', 'رستاخیز', 'باغستان کرج'],
    'عظیمیه': ['میدان مهران', 'میدان اسبی', 'بلوار کاج عظیمیه', 'جهانشهر', 'مهرویلا'],
  },
};
export function boundedLevenshteinDistance(a: string, b: string, maxDistance = 2): number {
  if (a === b) return 0;
  const lenA = a.length;
  const lenB = b.length;
  if (lenA > 256 || lenB > 256 || Math.abs(lenA - lenB) > maxDistance) return maxDistance + 1;
  const prev = new Array<number>(lenB + 1);
  const curr = new Array<number>(lenB + 1);
  for (let j = 0; j <= lenB; j++) prev[j] = j;
  for (let i = 1; i <= lenA; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= lenB; j++) prev[j] = curr[j];
  }
  return prev[lenB];
}
export interface SearchableNeighborhoodItem {
  id: number; name: string; cityId: string; zone: string; pros?: string; aliases?: readonly string[];
}
export interface RankedSearchMatch<T> {
  item: T; matchTier: 'exact' | 'prefix' | 'alias' | 'token' | 'fuzzy'; score: number; matchedAlias?: string;
}
export function rankNeighborhoodSearchMatches<T extends SearchableNeighborhoodItem>(
  query: string,
  items: T[],
  activeCityId?: string,
  limit = 20,
): RankedSearchMatch<T>[] {
  const normQuery = normalizePersianSearchText(query);
  const compactQuery = compactPersianSearchKey(query);
  if (!normQuery) return [];
  const tokens = tokenizePersianSearchQuery(query);
  const results: RankedSearchMatch<T>[] = [];
  for (const item of items) {
    if (activeCityId && item.cityId && item.cityId !== activeCityId) continue;
    const normName = normalizePersianSearchText(item.name);
    const compactName = compactPersianSearchKey(item.name);
    const cityAliasMap = CITY_SCOPED_NEIGHBORHOOD_ALIASES[item.cityId || 'tehran'] ?? {};
    const matchedCityAliasKey = Object.keys(cityAliasMap).find((k) => k === item.name || compactPersianSearchKey(k) === compactName);
    const cityAliases = matchedCityAliasKey ? cityAliasMap[matchedCityAliasKey] : [];
    const allAliases = [...cityAliases, ...(item.aliases ?? [])];
    if (normName === normQuery || compactName === compactQuery) {
      results.push({ item, matchTier: 'exact', score: 1000 });
      continue;
    }
    if (normName.startsWith(normQuery) || compactName.startsWith(compactQuery)) {
      results.push({ item, matchTier: 'prefix', score: 850 - Math.min(50, normName.length) });
      continue;
    }
    let matchedAlias: string | undefined;
    for (const alias of allAliases) {
      const normAlias = normalizePersianSearchText(alias);
      const compactAlias = compactPersianSearchKey(alias);
      if (normAlias === normQuery || compactAlias === compactQuery || normAlias.includes(normQuery) || compactAlias.includes(compactQuery)) {
        matchedAlias = alias;
        break;
      }
    }
    if (matchedAlias) {
      results.push({ item, matchTier: 'alias', score: 720, matchedAlias });
      continue;
    }
    const normZone = normalizePersianSearchText(item.zone || '');
    const normPros = normalizePersianSearchText(item.pros || '');
    const haystack = `${normName} ${normZone} ${normPros}`;
    if (normName.includes(normQuery) || compactName.includes(compactQuery) || (tokens.length > 0 && tokens.every((t) => haystack.includes(t)))) {
      results.push({ item, matchTier: 'token', score: 580 });
      continue;
    }
    if (compactQuery.length >= 3) {
      const dist = boundedLevenshteinDistance(compactQuery, compactName, 2);
      if (dist <= 2) {
        results.push({ item, matchTier: 'fuzzy', score: 400 - dist * 50 });
      }
    }
  }
  results.sort((a, b) => b.score - a.score || a.item.id - b.item.id);
  return results.slice(0, Math.max(1, limit));
}
export interface PropertySearchFilterCriteria {
  cityId: string; dealType: 'buy' | 'rent'; minBudgetMillions?: number | null; maxBudgetMillions?: number | null;
  minAreaSqm?: number | null; maxAreaSqm?: number | null; selectedZones?: string[]; queryText?: string;
}
export interface ValidatedFilterComposition {
  isValid: boolean; normalized: PropertySearchFilterCriteria; contradictionWarningFa: string | null;
  activeFilterCount: number; displayAreaUnitLabel?: string; maxBudgetIntlText?: string;
}
export function validateAndComposePropertyFilters(
  raw: PropertySearchFilterCriteria,
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
): ValidatedFilterComposition {
  let minBudget = raw.minBudgetMillions !== null && raw.minBudgetMillions !== undefined && Number.isFinite(raw.minBudgetMillions) && raw.minBudgetMillions >= 0 ? Number(raw.minBudgetMillions) : null;
  let maxBudget = raw.maxBudgetMillions !== null && raw.maxBudgetMillions !== undefined && Number.isFinite(raw.maxBudgetMillions) && raw.maxBudgetMillions > 0 ? Number(raw.maxBudgetMillions) : null;
  let minArea = raw.minAreaSqm !== null && raw.minAreaSqm !== undefined && Number.isFinite(raw.minAreaSqm) && raw.minAreaSqm >= 15 ? Number(raw.minAreaSqm) : null;
  let maxArea = raw.maxAreaSqm !== null && raw.maxAreaSqm !== undefined && Number.isFinite(raw.maxAreaSqm) && raw.maxAreaSqm > 0 ? Number(raw.maxAreaSqm) : null;
  let contradictionWarningFa: string | null = null;
  if (minBudget !== null && maxBudget !== null && minBudget > maxBudget) {
    contradictionWarningFa = 'حداقل بودجه بزرگ‌تر از حداکثر بودجه بود؛ بازه بودجه به‌صورت خودکار اصلاح شد.';
    const tmp = minBudget; minBudget = maxBudget; maxBudget = tmp;
  }
  if (minArea !== null && maxArea !== null && minArea > maxArea) {
    contradictionWarningFa = 'حداقل متراژ بزرگ‌تر از حداکثر متراژ بود؛ بازه متراژ به‌صورت خودکار اصلاح شد.';
    const tmp = minArea; minArea = maxArea; maxArea = tmp;
  }
  const zones = Array.isArray(raw.selectedZones)
    ? Array.from(new Set(raw.selectedZones.map((z) => String(z).trim()).filter(Boolean)))
    : [];
  const queryText = normalizePersianDisplayText(raw.queryText || '');
  let activeFilterCount = 0;
  if (minBudget !== null || maxBudget !== null) activeFilterCount++;
  if (minArea !== null || maxArea !== null) activeFilterCount++;
  if (zones.length > 0) activeFilterCount++;
  if (queryText.length > 0) activeFilterCount++;
  return {
    isValid: true,
    normalized: {
      cityId: String(raw.cityId || 'tehran').trim(),
      dealType: raw.dealType === 'rent' ? 'rent' : 'buy',
      minBudgetMillions: minBudget,
      maxBudgetMillions: maxBudget,
      minAreaSqm: minArea,
      maxAreaSqm: maxArea,
      selectedZones: zones,
      queryText,
    },
    contradictionWarningFa,
    activeFilterCount,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    maxBudgetIntlText: formatMillionTomanAsIntlCurrency(maxBudget ?? minBudget ?? 0, intlCurrency),
  };
}
export interface UserPreferencesSnapshot {
  favoriteHoodIds: number[];
  compareIds: number[];
  deletedFavoriteTombstones?: number[];
  updatedAtMs?: number;
}
export function mergeGuestAndCloudPreferences(
  guest: UserPreferencesSnapshot,
  cloud: UserPreferencesSnapshot,
  maxCompareItems = 3,
): UserPreferencesSnapshot {
  const tombstones = new Set<number>([
    ...(Array.isArray(guest.deletedFavoriteTombstones) ? guest.deletedFavoriteTombstones : []),
    ...(Array.isArray(cloud.deletedFavoriteTombstones) ? cloud.deletedFavoriteTombstones : []),
  ]);
  const mergedFavSet = new Set<number>();
  for (const id of [...(cloud.favoriteHoodIds || []), ...(guest.favoriteHoodIds || [])]) {
    if (Number.isFinite(id) && id > 0 && !tombstones.has(id)) {
      mergedFavSet.add(Number(id));
    }
  }
  const mergedCompareSet = new Set<number>();
  for (const id of [...(guest.compareIds || []), ...(cloud.compareIds || [])]) {
    if (Number.isFinite(id) && id > 0 && mergedCompareSet.size < maxCompareItems) {
      mergedCompareSet.add(Number(id));
    }
  }
  return {
    favoriteHoodIds: Array.from(mergedFavSet),
    compareIds: Array.from(mergedCompareSet),
    deletedFavoriteTombstones: Array.from(tombstones),
    updatedAtMs: Math.max(guest.updatedAtMs || 0, cloud.updatedAtMs || 0, Date.now()),
  };
}
export interface InAppNotificationRecord {
  id: string;
  dedupeKey: string;
  category: 'price_alert' | 'bargain_match' | 'listing_status' | 'system_security';
  titleFa: string;
  messageFa: string;
  cityId: string;
  neighborhoodId?: number;
  listingId?: string;
  createdAtIso: string;
  readAtIso: string | null;
}
export function appendDeduplicatedNotification(
  existing: InAppNotificationRecord[],
  incoming: Omit<InAppNotificationRecord, 'id' | 'createdAtIso' | 'readAtIso'> & {
    id?: string;
    createdAtIso?: string;
  },
  maxNotifications = 100,
): { updated: InAppNotificationRecord[]; wasInserted: boolean } {
  const safeDedupe = String(incoming.dedupeKey || '').trim();
  if (!safeDedupe) {
    return { updated: existing, wasInserted: false };
  }
  if (existing.some((item) => item.dedupeKey === safeDedupe)) {
    return { updated: existing, wasInserted: false };
  }
  const record: InAppNotificationRecord = {
    id: incoming.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    dedupeKey: safeDedupe, category: incoming.category, titleFa: normalizePersianDisplayText(incoming.titleFa), messageFa: normalizePersianDisplayText(incoming.messageFa), cityId: incoming.cityId || 'tehran', neighborhoodId: incoming.neighborhoodId, listingId: incoming.listingId, createdAtIso: incoming.createdAtIso || new Date().toISOString(), readAtIso: null, }; return { updated: [record, ...existing].slice(0, maxNotifications), wasInserted: true, }; }