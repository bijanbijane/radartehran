export type AreaUnit = 'sqm' | 'sqft';
export type RadarLocale = 'fa' | 'en' | 'ar' | 'tr';
export type IntlCurrencyCode = 'IRT' | 'USD' | 'EUR' | 'AED';

export const SQM_TO_SQFT = 10.7639104;
export const AREA_UNIT_STORAGE_KEY = 'radar_area_unit_v1';
export const RADAR_LOCALE_STORAGE_KEY = 'radar_locale_v1';
export const RADAR_CURRENCY_STORAGE_KEY = 'radar_intl_currency_v1';

// Reference exchange rates (Million Toman per 1 unit of foreign currency) for international comparison
export const MILLION_TOMAN_PER_FX_UNIT: Record<Exclude<IntlCurrencyCode, 'IRT'>, number> = {
  USD: 0.065, // 1 USD ≈ 65,000 Toman (0.065 Million Toman)
  EUR: 0.070, // 1 EUR ≈ 70,000 Toman
  AED: 0.0177, // 1 AED ≈ 17,700 Toman
};

let currentMemoryAreaUnit: AreaUnit = 'sqm';
let currentMemoryLocale: RadarLocale = 'fa';
let currentMemoryCurrency: IntlCurrencyCode = 'IRT';
const listeners = new Set<() => void>();

function notifyAllListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch { /* Ignore listener errors */ }
  });
}

function readInitialAreaUnit(): AreaUnit {
  try {
    const urlUnit = parseUrlIntlParams().unit;
    if (urlUnit) { currentMemoryAreaUnit = urlUnit; return urlUnit; }
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(AREA_UNIT_STORAGE_KEY);
      if (raw === 'sqm' || raw === 'sqft') { currentMemoryAreaUnit = raw; return raw; }
    }
  } catch { /* Ignore storage access errors in restricted environments */ }
  return currentMemoryAreaUnit;
}

export function getStoredAreaUnit(): AreaUnit { return readInitialAreaUnit(); }

export function setStoredAreaUnit(next: AreaUnit): void {
  const normalized: AreaUnit = next === 'sqft' ? 'sqft' : 'sqm';
  currentMemoryAreaUnit = normalized;
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(AREA_UNIT_STORAGE_KEY, normalized);
  } catch { /* Ignore storage errors */ }
  notifyAllListeners();
}

export function toggleStoredAreaUnit(): AreaUnit {
  const next: AreaUnit = getStoredAreaUnit() === 'sqm' ? 'sqft' : 'sqm';
  setStoredAreaUnit(next);
  return next;
}

export function subscribeAreaUnit(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function detectBrowserLocaleFromNavigator(languages?: readonly string[]): RadarLocale {
  const candidates =
    languages && languages.length > 0
      ? languages
      : typeof navigator !== 'undefined'
        ? navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : ['fa']
        : ['fa'];
  for (const raw of candidates) {
    const tag = String(raw || '').trim().toLowerCase();
    if (tag.startsWith('fa') || tag.startsWith('pes') || tag.startsWith('prs')) return 'fa';
    if (tag.startsWith('ar')) return 'ar';
    if (tag.startsWith('tr')) return 'tr';
    if (tag.startsWith('en')) return 'en';
  }
  return 'fa';
}

export function getRadarLocaleDirection(locale: RadarLocale): 'rtl' | 'ltr' {
  return locale === 'fa' || locale === 'ar' ? 'rtl' : 'ltr';
}

export function parseUrlIntlParams(search?: string): { lang?: RadarLocale; currency?: IntlCurrencyCode; unit?: AreaUnit } {
  const rawSearch = typeof search === 'string' ? search : typeof window !== 'undefined' ? window.location?.search || '' : '';
  if (!rawSearch) return {};
  const params = new URLSearchParams(rawSearch.startsWith('?') ? rawSearch : `?${rawSearch}`);
  const rawLang = params.get('lang')?.trim().toLowerCase();
  const rawCurrency = params.get('currency')?.trim().toUpperCase();
  const rawUnit = params.get('unit')?.trim().toLowerCase();
  return {
    lang: rawLang === 'fa' || rawLang === 'en' || rawLang === 'ar' || rawLang === 'tr' ? rawLang : undefined,
    currency: rawCurrency === 'IRT' || rawCurrency === 'USD' || rawCurrency === 'EUR' || rawCurrency === 'AED' ? rawCurrency : undefined,
    unit: rawUnit === 'sqm' || rawUnit === 'sqft' ? rawUnit : undefined,
  };
}

export function resolveInitialRadarLocale(options?: {
  savedLocale?: string | null;
  urlLang?: string | null;
  navigatorLanguages?: readonly string[];
  enableAutoBrowserDetect?: boolean;
}): RadarLocale {
  const urlCandidate = options?.urlLang?.trim().toLowerCase();
  if (urlCandidate === 'fa' || urlCandidate === 'en' || urlCandidate === 'ar' || urlCandidate === 'tr') return urlCandidate;
  const savedCandidate = options?.savedLocale?.trim().toLowerCase();
  if (savedCandidate === 'fa' || savedCandidate === 'en' || savedCandidate === 'ar' || savedCandidate === 'tr') return savedCandidate;
  if (options?.enableAutoBrowserDetect) return detectBrowserLocaleFromNavigator(options.navigatorLanguages);
  return 'fa';
}

export function getStoredRadarLocale(): RadarLocale {
  try {
    const urlLang = parseUrlIntlParams().lang;
    if (urlLang) { currentMemoryLocale = urlLang; return urlLang; }
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(RADAR_LOCALE_STORAGE_KEY);
      if (raw === 'fa' || raw === 'en' || raw === 'ar' || raw === 'tr') {
        currentMemoryLocale = raw;
        return raw;
      }
    }
  } catch { /* Ignore storage errors */ }
  return currentMemoryLocale;
}

export function setStoredRadarLocale(next: RadarLocale): void {
  const valid: RadarLocale = next === 'en' || next === 'ar' || next === 'tr' ? next : 'fa';
  currentMemoryLocale = valid;
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(RADAR_LOCALE_STORAGE_KEY, valid);
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-radar-locale', valid);
      document.documentElement.lang = valid;
      document.documentElement.dir = getRadarLocaleDirection(valid);
    }
  } catch { /* Ignore DOM/storage errors */ }
  notifyAllListeners();
}

export function getStoredIntlCurrency(): IntlCurrencyCode {
  try {
    const urlCurrency = parseUrlIntlParams().currency;
    if (urlCurrency) { currentMemoryCurrency = urlCurrency; return urlCurrency; }
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(RADAR_CURRENCY_STORAGE_KEY);
      if (raw === 'IRT' || raw === 'USD' || raw === 'EUR' || raw === 'AED') {
        currentMemoryCurrency = raw;
        return raw;
      }
    }
  } catch { /* Ignore storage errors */ }
  return currentMemoryCurrency;
}

export function setStoredIntlCurrency(next: IntlCurrencyCode): void {
  const valid: IntlCurrencyCode = next === 'USD' || next === 'EUR' || next === 'AED' ? next : 'IRT';
  currentMemoryCurrency = valid;
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(RADAR_CURRENCY_STORAGE_KEY, valid);
  } catch { /* Ignore storage errors */ }
  notifyAllListeners();
}

export function formatMillionTomanAsIntlCurrency(
  millionToman: number,
  currency: IntlCurrencyCode = 'IRT',
  locale: RadarLocale = 'fa'
): string {
  const safeMillion = Number.isFinite(millionToman) ? Math.max(0, millionToman) : 0;
  const numLocale = locale === 'fa' ? 'fa-IR' : locale === 'ar' ? 'ar-AE' : 'en-US';
  if (currency === 'IRT') {
    const billions = (safeMillion / 1000).toFixed(1);
    return locale === 'fa' ? `${Number(billions).toLocaleString('fa-IR')} میلیارد تومان` : `${billions}B IRT`;
  }
  const rate = MILLION_TOMAN_PER_FX_UNIT[currency];
  const converted = Math.round(safeMillion / rate);
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'AED ';
  return `${symbol}${converted.toLocaleString(numLocale)}`;
}

export interface RadarTopBarCopy { searchPlaceholder: string; filterBtnLabel: string; toolsBtnLabel: string; }

const TOP_BAR_COPY: Record<RadarLocale, RadarTopBarCopy> = {
  fa: { searchPlaceholder: 'جست‌وجوی شهر، استان یا محله...', filterBtnLabel: 'فیلتر بودجه و وام', toolsBtnLabel: 'ابزارها' },
  en: { searchPlaceholder: 'Search city, province or neighborhood...', filterBtnLabel: 'Budget & Loan', toolsBtnLabel: 'Tools' },
  ar: { searchPlaceholder: 'ابحث عن المدينة أو المحافظة أو الحي...', filterBtnLabel: 'الميزانية والقرض', toolsBtnLabel: 'الأدوات' },
  tr: { searchPlaceholder: 'Şehir, eyalet veya mahalle ara...', filterBtnLabel: 'Bütçe ve Kredi', toolsBtnLabel: 'Araçlar' },
};

export function getRadarTopBarCopy(locale: RadarLocale): RadarTopBarCopy {
  return TOP_BAR_COPY[locale] || TOP_BAR_COPY.fa;
}

export type PrimaryViewId = 'home' | 'discover' | 'intelligence' | 'tools' | 'userspace' | 'map' | 'admin';

export interface RadarGlobalNavCopy {
  home: string; discover: string; intelligence: string; tools: string; userspace: string; map: string; searchPlaceholder: string; admin: string;
}

const GLOBAL_NAV_COPY: Record<RadarLocale, RadarGlobalNavCopy> = {
  fa: { home: 'خانه و مرور', discover: 'کشف محله‌ها', intelligence: 'نبض و هوش بازار', tools: 'جعبه‌ابزار هوشمند', userspace: 'فضای شخصی', map: 'نقشه تعاملی', searchPlaceholder: 'جست‌وجوی محله، منطقه یا شهر...', admin: 'مدیریت و مانیتورینگ' },
  en: { home: 'Home', discover: 'Discover', intelligence: 'Market Pulse', tools: 'Smart Tools', userspace: 'My Space', map: 'Interactive Map', searchPlaceholder: 'Search neighborhood, district or city...', admin: 'Admin & Monitor' },
  ar: { home: 'الرئيسية', discover: 'اكتشاف الأحياء', intelligence: 'ذكاء السوق', tools: 'الأدوات الذكية', userspace: 'مساحتي', map: 'الخريطة التفاعلية', searchPlaceholder: 'ابحث عن الحي، المنطقة أو المدينة...', admin: 'الإدارة والمراقبة' },
  tr: { home: 'Ana Sayfa', discover: 'Keşfet', intelligence: 'Piyasa Analizi', tools: 'Akıllı Araçlar', userspace: 'Kullanıcı Alanı', map: 'Harita', searchPlaceholder: 'Mahalle, bölge veya şehir ara...', admin: 'Yönetim ve İzleme' },
};

export function getRadarGlobalNavCopy(locale: RadarLocale): RadarGlobalNavCopy { return GLOBAL_NAV_COPY[locale] || GLOBAL_NAV_COPY.fa; }

export interface RadarBottomNavCopy { mapLabel: string; filterLabel: string; suggestLabel: string; compareLabel: string; toolsLabel: string; submitLabel: string; }

const BOTTOM_NAV_COPY: Record<RadarLocale, RadarBottomNavCopy> = {
  fa: { mapLabel: 'نقشه', filterLabel: 'فیلتر بودجه', suggestLabel: 'پیشنهادها', compareLabel: 'مقایسه', toolsLabel: 'ابزارها', submitLabel: 'ثبت ملک' },
  en: { mapLabel: 'Map', filterLabel: 'Budget', suggestLabel: 'Suggest', compareLabel: 'Compare', toolsLabel: 'Tools', submitLabel: 'Submit' },
  ar: { mapLabel: 'الخريطة', filterLabel: 'الميزانية', suggestLabel: 'مقترحات', compareLabel: 'مقارنة', toolsLabel: 'الأدوات', submitLabel: 'إضافة عقار' },
  tr: { mapLabel: 'Harita', filterLabel: 'Bütçe', suggestLabel: 'Öneriler', compareLabel: 'Karşılaştır', toolsLabel: 'Araçlar', submitLabel: 'İlan Ekle' },
};

export function getRadarBottomNavCopy(locale: RadarLocale): RadarBottomNavCopy {
  return BOTTOM_NAV_COPY[locale] || BOTTOM_NAV_COPY.fa;
}

export interface RadarInspectorCopy { headerTitle: string; scorecardTab: string; marketTab: string; bargainsTabPrefix: string; reviewsTab: string; voteTab: string; hedonicCta: string; }

const INSPECTOR_COPY: Record<RadarLocale, RadarInspectorCopy> = {
  fa: { headerTitle: 'کارنامه و راهنمای محله', scorecardTab: 'کارنامه', marketTab: 'بازار و نمودار', bargainsTabPrefix: 'فایل‌های زیر قیمت', reviewsTab: 'نظرات ساکنان', voteTab: 'امکانات', hedonicCta: 'ماشین‌حساب هوشمند قیمت‌گذاری ملک (Hedonic)' },
  en: { headerTitle: 'Neighborhood Scorecard', scorecardTab: 'Scorecard & Traffic', marketTab: 'Market & Charts', bargainsTabPrefix: 'Bargain Deals', reviewsTab: 'Resident Reviews', voteTab: 'Amenities & Votes', hedonicCta: 'Smart Hedonic Property Valuation' },
  ar: { headerTitle: 'بطاقة تقييم ودليل الحي', scorecardTab: 'التقييم والمرور', marketTab: 'السوق والرسوم', bargainsTabPrefix: 'عقارات بسعر لقطة', reviewsTab: 'آراء السكان', voteTab: 'المرافق والتصويت', hedonicCta: 'حاسبة التقييم العقاري الذكية (Hedonic)' },
  tr: { headerTitle: 'Mahalle Karnesi ve Rehberi', scorecardTab: 'Karne ve Trafik', marketTab: 'Piyasa ve Grafik', bargainsTabPrefix: 'Fırsat İlanları', reviewsTab: 'Sakin Yorumları', voteTab: 'Olanaklar ve Oy', hedonicCta: 'Akıllı Hedonik Konut Değerleme' },
};

export function getRadarInspectorCopy(locale: RadarLocale): RadarInspectorCopy {
  return INSPECTOR_COPY[locale] || INSPECTOR_COPY.fa;
}

export interface RadarLegendCopy { legendBtnLabel: string; legendHeaderTitle: string; metroPillLabel: string; trafficPillLabel: string; greenTitle: string; yellowTitle: string; redTitle: string; }

const LEGEND_COPY: Record<RadarLocale, RadarLegendCopy> = {
  fa: { legendBtnLabel: 'راهنمای نقشه', legendHeaderTitle: 'راهنمای رنگ‌ها و لایه‌های نقشه', metroPillLabel: '🚇 مترو', trafficPillLabel: '🚦 طرح ترافیک', greenTitle: 'سبز (مناسب بودجه)', yellowTitle: 'زرد (مرزی / قابل مذاکره)', redTitle: 'قرمز (فراتر از بودجه)' },
  en: { legendBtnLabel: 'Map Legend', legendHeaderTitle: 'Map Colors & GIS Layers', metroPillLabel: '🚇 Metro', trafficPillLabel: '🚦 Traffic Zone', greenTitle: 'Green (Within Budget)', yellowTitle: 'Yellow (Borderline / Negotiable)', redTitle: 'Red (Above Budget)' },
  ar: { legendBtnLabel: 'دليل الخريطة', legendHeaderTitle: 'دليل الألوان وطبقات الخريطة', metroPillLabel: '🚇 المترو', trafficPillLabel: '🚦 نطاق المرور', greenTitle: 'أخضر (مناسب للميزانية)', yellowTitle: 'أصفر (حدودي / قابل للتفاوض)', redTitle: 'أحمر (أعلى من الميزانية)' },
  tr: { legendBtnLabel: 'Harita Rehberi', legendHeaderTitle: 'Harita Renkleri ve Katmanlar', metroPillLabel: '🚇 Metro', trafficPillLabel: '🚦 Trafik Bölgesi', greenTitle: 'Yeşil (Bütçeye Uygun)', yellowTitle: 'Sarı (Sınırda / Pazarlık)', redTitle: 'Kırmızı (Bütçe Üstü)' },
};

export function getRadarLegendCopy(locale: RadarLocale): RadarLegendCopy {
  return LEGEND_COPY[locale] || LEGEND_COPY.fa;
}

export interface RadarCompareCopy { modalTitle: string; inlineTitle: string; metricHeader: string; swapBtnLabel: string; printBtnLabel: string; }

const COMPARE_COPY: Record<RadarLocale, RadarCompareCopy> = {
  fa: { modalTitle: 'مقایسه رخ‌به‌رخ دو محله', inlineTitle: 'مقایسه رودرروی محله‌ها', metricHeader: 'شاخص مقایسه', swapBtnLabel: 'جابه‌جایی', printBtnLabel: 'چاپ / PDF' },
  en: { modalTitle: 'Head-to-Head Neighborhood Comparison', inlineTitle: 'Head-to-Head Comparison', metricHeader: 'Comparison Metric', swapBtnLabel: 'Swap', printBtnLabel: 'Print / PDF' },
  ar: { modalTitle: 'مقارنة مباشرة بين حيين', inlineTitle: 'مقارنة الأحياء وجهاً لوجه', metricHeader: 'مؤشر المقارنة', swapBtnLabel: 'تبديل', printBtnLabel: 'طباعة / PDF' },
  tr: { modalTitle: 'İki Mahalle Karşılaştırması', inlineTitle: 'Birebir Mahalle Karşılaştırma', metricHeader: 'Karşılaştırma Ölçütü', swapBtnLabel: 'Değiştir', printBtnLabel: 'Yazdır / PDF' },
};

export function getRadarCompareCopy(locale: RadarLocale): RadarCompareCopy { return COMPARE_COPY[locale] || COMPARE_COPY.fa; }
export function sqmToSqft(sqm: number): number { return Math.round((Number.isFinite(sqm) ? Math.max(0, sqm) : 0) * SQM_TO_SQFT); }
export function sqftToSqm(sqft: number): number { return Math.round((Number.isFinite(sqft) ? Math.max(0, sqft) : 0) / SQM_TO_SQFT); }
export function convertAreaFromSqm(sqm: number, unit: AreaUnit): number {
  const safeSqm = Number.isFinite(sqm) ? Math.max(0, sqm) : 0;
  return unit === 'sqft' ? sqmToSqft(safeSqm) : Math.round(safeSqm);
}
export function convertPricePerSqmToUnit(pricePerSqmMillion: number, unit: AreaUnit): number {
  const safePrice = Number.isFinite(pricePerSqmMillion) ? Math.max(0, pricePerSqmMillion) : 0;
  return unit === 'sqft' ? Math.round((safePrice / SQM_TO_SQFT) * 100) / 100 : Math.round(safePrice * 10) / 10;
}
export function formatAreaNumber(value: number, persianDigits = true): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString(persianDigits ? 'fa-IR' : 'en-US');
}
export function formatAreaValue(sqm: number, unit: AreaUnit, persianDigits = true): string {
  const formatted = formatAreaNumber(convertAreaFromSqm(sqm, unit), persianDigits);
  return unit === 'sqft' ? `${formatted} فوت مربع (ft²)` : `${formatted} متر مربع`;
}
export function formatAreaShort(sqm: number, unit: AreaUnit, persianDigits = true): string {
  const formatted = formatAreaNumber(convertAreaFromSqm(sqm, unit), persianDigits);
  return unit === 'sqft' ? `${formatted} ft²` : `${formatted} متری`;
}
export function formatAreaUnitLabel(unit: AreaUnit): string { return unit === 'sqft' ? 'فوت مربع (ft²)' : 'متر مربع (m²)'; }
export function formatUnitBuyPriceTitle(unit: AreaUnit): string { return unit === 'sqft' ? 'میانگین خرید هر فوت مربع (ft²)' : 'میانگین خرید هر متر'; }
