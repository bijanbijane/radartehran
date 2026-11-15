export type AreaUnit = 'sqm' | 'sqft';
export type RadarLocale = 'fa' | 'en' | 'ar' | 'tr';
export type IntlCurrencyCode = 'IRT' | 'USD' | 'EUR' | 'AED';
export type RadarExperienceMode = 'simple' | 'pro';

export const SQM_TO_SQFT = 10.7639104;
export const AREA_UNIT_STORAGE_KEY = 'radar_area_unit_v1';
export const RADAR_LOCALE_STORAGE_KEY = 'radar_locale_v1';
export const RADAR_CURRENCY_STORAGE_KEY = 'radar_intl_currency_v1';
export const RADAR_EXPERIENCE_MODE_STORAGE_KEY = 'radar_experience_mode_v1';

// Reference exchange rates (Million Toman per 1 unit of foreign currency) for international comparison
export const MILLION_TOMAN_PER_FX_UNIT: Record<Exclude<IntlCurrencyCode, 'IRT'>, number> = {
  USD: 0.065, // 1 USD ≈ 65,000 Toman (0.065 Million Toman)
  EUR: 0.070, // 1 EUR ≈ 70,000 Toman
  AED: 0.0177, // 1 AED ≈ 17,700 Toman
};

let currentMemoryAreaUnit: AreaUnit = 'sqm';
let currentMemoryLocale: RadarLocale = 'fa';
let currentMemoryCurrency: IntlCurrencyCode = 'IRT';
let currentMemoryExperienceMode: RadarExperienceMode = 'simple';
const listeners = new Set<() => void>();

function notifyAllListeners(): void {
  listeners.forEach((listener) => {
    try { listener(); } catch { /* Ignore listener errors */ }
  });
}

export function getStoredExperienceMode(): RadarExperienceMode {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(RADAR_EXPERIENCE_MODE_STORAGE_KEY);
      if (raw === 'simple' || raw === 'pro') { currentMemoryExperienceMode = raw; return raw; }
    }
  } catch { /* Ignore storage errors */ }
  return currentMemoryExperienceMode;
}

export function setStoredExperienceMode(next: RadarExperienceMode): void {
  const valid: RadarExperienceMode = next === 'pro' ? 'pro' : 'simple';
  currentMemoryExperienceMode = valid;
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(RADAR_EXPERIENCE_MODE_STORAGE_KEY, valid);
  } catch { /* Ignore storage errors */ }
  notifyAllListeners();
}

export function toggleStoredExperienceMode(): RadarExperienceMode {
  const next: RadarExperienceMode = getStoredExperienceMode() === 'simple' ? 'pro' : 'simple';
  setStoredExperienceMode(next);
  return next;
}

function readInitialAreaUnit(): AreaUnit {
  currentMemoryAreaUnit = 'sqm';
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(AREA_UNIT_STORAGE_KEY, 'sqm');
    }
  } catch { /* Ignore storage access errors in restricted environments */ }
  return 'sqm';
}

export function getStoredAreaUnit(): AreaUnit { return readInitialAreaUnit(); }

export function setStoredAreaUnit(_next: AreaUnit): void {
  currentMemoryAreaUnit = 'sqm';
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(AREA_UNIT_STORAGE_KEY, 'sqm');
  } catch { /* Ignore storage errors */ }
  notifyAllListeners();
}

export function toggleStoredAreaUnit(): AreaUnit {
  setStoredAreaUnit('sqm');
  return 'sqm';
}

export function subscribeAreaUnit(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function detectBrowserLocaleFromNavigator(_languages?: readonly string[]): RadarLocale {
  return 'fa';
}

export function getRadarLocaleDirection(_locale: RadarLocale): 'rtl' | 'ltr' {
  return 'rtl';
}

export function parseUrlIntlParams(_search?: string): { lang?: RadarLocale; currency?: IntlCurrencyCode; unit?: AreaUnit } {
  return { lang: undefined, currency: undefined, unit: undefined };
}

export function resolveInitialRadarLocale(_options?: {
  savedLocale?: string | null; urlLang?: string | null; navigatorLanguages?: readonly string[]; enableAutoBrowserDetect?: boolean;
}): RadarLocale {
  return 'fa';
}

export function getStoredRadarLocale(): RadarLocale {
  currentMemoryLocale = 'fa';
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(RADAR_LOCALE_STORAGE_KEY, 'fa');
    }
  } catch { /* Ignore storage errors */ }
  return 'fa';
}

export function setStoredRadarLocale(_next: RadarLocale): void {
  currentMemoryLocale = 'fa';
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(RADAR_LOCALE_STORAGE_KEY, 'fa');
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-radar-locale', 'fa');
      document.documentElement.lang = 'fa';
      document.documentElement.dir = 'rtl';
    }
  } catch { /* Ignore DOM/storage errors */ }
  notifyAllListeners();
}

export function getStoredIntlCurrency(): IntlCurrencyCode {
  currentMemoryCurrency = 'IRT';
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(RADAR_CURRENCY_STORAGE_KEY, 'IRT');
    }
  } catch { /* Ignore storage errors */ }
  return 'IRT';
}

export function setStoredIntlCurrency(_next: IntlCurrencyCode): void {
  currentMemoryCurrency = 'IRT';
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(RADAR_CURRENCY_STORAGE_KEY, 'IRT');
  } catch { /* Ignore storage errors */ }
  notifyAllListeners();
}

export function formatMillionTomanAsIntlCurrency(millionToman: number, _currency: IntlCurrencyCode = 'IRT', _locale: RadarLocale = 'fa'): string {
  const safeMillion = Number.isFinite(millionToman) ? Math.max(0, millionToman) : 0;
  if (safeMillion < 1000) {
    return `${Math.round(safeMillion).toLocaleString('fa-IR')} میلیون تومان`;
  }
  const billions = Number((safeMillion / 1000).toFixed(1));
  return `${billions.toLocaleString('fa-IR')} میلیارد تومان`;
}

export interface RadarTopBarCopy { searchPlaceholder: string; filterBtnLabel: string; toolsBtnLabel: string; }
const TOP_BAR_COPY_FA: RadarTopBarCopy = { searchPlaceholder: 'جست‌وجوی شهر، استان یا محله...', filterBtnLabel: 'فیلتر بودجه و وام', toolsBtnLabel: 'ابزارها' };
export function getRadarTopBarCopy(_locale: RadarLocale = 'fa'): RadarTopBarCopy { return TOP_BAR_COPY_FA; }

export type PrimaryViewId =
  | 'home'
  | 'discover'
  | 'intelligence'
  | 'properties'
  | 'tools'
  | 'userspace'
  | 'services'
  | 'knowledge'
  | 'contributions'
  | 'map'
  | 'admin'
  | 'not_found';
export interface RadarGlobalNavCopy {
  home: string;
  discover: string;
  intelligence: string;
  properties: string;
  tools: string;
  more: string;
  userspace: string;
  map: string;
  searchPlaceholder: string;
  admin: string;
}
const GLOBAL_NAV_COPY_FA: RadarGlobalNavCopy = {
  home: 'خانه',
  discover: 'محله‌ها',
  intelligence: 'بازار',
  properties: 'املاک',
  tools: 'ابزارها',
  more: 'بیشتر',
  userspace: 'حساب کاربری',
  map: 'نقشه',
  searchPlaceholder: 'جست‌وجوی محله، ملک یا گزارش...',
  admin: 'مدیریت سیستم',
};
export function getRadarGlobalNavCopy(_locale: RadarLocale = 'fa'): RadarGlobalNavCopy { return GLOBAL_NAV_COPY_FA; }

export interface RadarBottomNavCopy { mapLabel: string; filterLabel: string; suggestLabel: string; compareLabel: string; toolsLabel: string; submitLabel: string; }
const BOTTOM_NAV_COPY_FA: RadarBottomNavCopy = { mapLabel: 'نقشه', filterLabel: 'فیلتر بودجه', suggestLabel: 'پیشنهادها', compareLabel: 'مقایسه', toolsLabel: 'ابزارها', submitLabel: 'ثبت ملک' };
export function getRadarBottomNavCopy(_locale: RadarLocale = 'fa'): RadarBottomNavCopy { return BOTTOM_NAV_COPY_FA; }

export interface RadarInspectorCopy { headerTitle: string; scorecardTab: string; marketTab: string; bargainsTabPrefix: string; reviewsTab: string; voteTab: string; hedonicCta: string; }
const INSPECTOR_COPY_FA: RadarInspectorCopy = { headerTitle: 'کارنامه و راهنمای محله', scorecardTab: 'کارنامه', marketTab: 'بازار و نمودار', bargainsTabPrefix: 'فایل‌های زیر قیمت', reviewsTab: 'نظرات ساکنان', voteTab: 'امکانات', hedonicCta: 'ماشین‌حساب هوشمند قیمت‌گذاری ملک (Hedonic)' };
export function getRadarInspectorCopy(_locale: RadarLocale = 'fa'): RadarInspectorCopy { return INSPECTOR_COPY_FA; }

export interface RadarLegendCopy { legendBtnLabel: string; legendHeaderTitle: string; metroPillLabel: string; trafficPillLabel: string; greenTitle: string; yellowTitle: string; redTitle: string; }
const LEGEND_COPY_FA: RadarLegendCopy = { legendBtnLabel: 'راهنمای نقشه', legendHeaderTitle: 'راهنمای رنگ‌ها و لایه‌های نقشه', metroPillLabel: '🚇 مترو', trafficPillLabel: '🚦 طرح ترافیک', greenTitle: 'سبز (مناسب بودجه)', yellowTitle: 'زرد (مرزی / قابل مذاکره)', redTitle: 'قرمز (فراتر از بودجه)' };
export function getRadarLegendCopy(_locale: RadarLocale = 'fa'): RadarLegendCopy { return LEGEND_COPY_FA; }

export interface RadarCompareCopy { modalTitle: string; inlineTitle: string; metricHeader: string; swapBtnLabel: string; printBtnLabel: string; }
const COMPARE_COPY_FA: RadarCompareCopy = { modalTitle: 'مقایسه رخ‌به‌رخ دو محله', inlineTitle: 'مقایسه رودرروی محله‌ها', metricHeader: 'شاخص مقایسه', swapBtnLabel: 'جابه‌جایی', printBtnLabel: 'چاپ / PDF' };
export function getRadarCompareCopy(_locale: RadarLocale = 'fa'): RadarCompareCopy { return COMPARE_COPY_FA; }
export function sqmToSqft(sqm: number): number { return Math.round(Number.isFinite(sqm) ? Math.max(0, sqm) : 0); }
export function sqftToSqm(sqft: number): number { return Math.round(Number.isFinite(sqft) ? Math.max(0, sqft) : 0); }
export function convertAreaFromSqm(sqm: number, _unit: AreaUnit = 'sqm'): number {
  const safeSqm = Number.isFinite(sqm) ? Math.max(0, sqm) : 0;
  return Math.round(safeSqm);
}
export function convertPricePerSqmToUnit(pricePerSqmMillion: number, _unit: AreaUnit = 'sqm'): number {
  const safePrice = Number.isFinite(pricePerSqmMillion) ? Math.max(0, pricePerSqmMillion) : 0;
  return Math.round(safePrice * 10) / 10;
}
export function formatAreaNumber(value: number, persianDigits = true): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString(persianDigits ? 'fa-IR' : 'en-US');
}
export function formatAreaValue(sqm: number, _unit: AreaUnit = 'sqm', persianDigits = true): string {
  const formatted = formatAreaNumber(convertAreaFromSqm(sqm, 'sqm'), persianDigits);
  return `${formatted} متر مربع`;
}
export function formatAreaShort(sqm: number, _unit: AreaUnit = 'sqm', persianDigits = true): string {
  const formatted = formatAreaNumber(convertAreaFromSqm(sqm, 'sqm'), persianDigits);
  return `${formatted} متری`;
}
export function formatAreaUnitLabel(_unit: AreaUnit = 'sqm'): string { return 'متر مربع (m²)'; }
export function formatUnitBuyPriceTitle(_unit: AreaUnit = 'sqm'): string { return 'میانگین خرید هر متر'; }
