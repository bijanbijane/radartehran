import {
  getRadarBottomNavCopy, getRadarCompareCopy, getRadarGlobalNavCopy, getRadarInspectorCopy, getRadarLegendCopy, getRadarTopBarCopy,
  type PlannedRadarLocale, type RadarBottomNavCopy, type RadarCompareCopy, type RadarGlobalNavCopy,
  type RadarInspectorCopy, type RadarLegendCopy, type RadarTopBarCopy, type SupportedRadarLocale,
} from './i18n/radarCopies';
import {
  evaluateSingleLocaleCandidate, isPlannedRadarLocale, isSupportedRadarLocale,
  resolveRadarLocaleContract, syncLocaleToDocumentRoot, type LocaleResolutionResult,
} from '../platform/locale';

export type { PlannedRadarLocale, SupportedRadarLocale, LocaleResolutionResult };
export { isPlannedRadarLocale, isSupportedRadarLocale, resolveRadarLocaleContract };

export type AreaUnit = 'sqm' | 'sqft';
export type RadarLocale = SupportedRadarLocale | PlannedRadarLocale;
export type IntlCurrencyCode = 'IRT' | 'USD' | 'EUR' | 'AED';
export type RadarExperienceMode = 'simple' | 'pro';
export type PrimaryViewId =
  | 'home' | 'discover' | 'intelligence' | 'properties' | 'tools'
  | 'userspace' | 'services' | 'knowledge' | 'contributions' | 'map' | 'admin' | 'not_found';

export interface RuntimeExchangeRateReference {
  usdToTomanRate: number;
  recordedAtIso?: string;
  source?: string;
  isStaleWarningFa?: string;
}

export const SQM_TO_SQFT = 10.7639104167;
export const AREA_UNIT_STORAGE_KEY = 'radar_area_unit_v1';
export const RADAR_LOCALE_STORAGE_KEY = 'radar_locale_v1';
export const RADAR_CURRENCY_STORAGE_KEY = 'radar_intl_currency_v1';
export const RADAR_EXPERIENCE_MODE_STORAGE_KEY = 'radar_experience_mode_v1';

/** @deprecated Legacy reference table; live UI display must use validated snapshot from /api/v1/commerce/catalog. */
export const MILLION_TOMAN_PER_FX_UNIT: Record<Exclude<IntlCurrencyCode, 'IRT'>, number> = {
  USD: 0.0685,
  EUR: 0.074,
  AED: 0.0186,
};

let currentMemoryAreaUnit: AreaUnit = 'sqm';
let currentMemoryLocale: SupportedRadarLocale = 'fa';
let currentMemoryCurrency: IntlCurrencyCode = 'IRT';
let currentMemoryExperienceMode: RadarExperienceMode = 'simple';
let runtimeExchangeRateSnapshot: RuntimeExchangeRateReference | null = null;
let lastLocaleResolutionState: LocaleResolutionResult = resolveRadarLocaleContract();
const listeners = new Set<() => void>();

function notifyAllListeners(): void {
  listeners.forEach((listener) => {
    try { listener(); } catch { /* Ignore listener errors */ }
  });
}

function normalizeSupportedLocale(raw?: string | null): SupportedRadarLocale | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const code = raw.trim().toLowerCase();
  if (code === 'en' || code.startsWith('en-')) return 'en';
  if (code === 'fa' || code.startsWith('fa-')) return 'fa';
  return undefined;
}

export function getLastLocaleResolutionState(): LocaleResolutionResult {
  return lastLocaleResolutionState;
}

export function setRuntimeExchangeRateSnapshot(snapshot: RuntimeExchangeRateReference | null): void {
  runtimeExchangeRateSnapshot =
    snapshot && Number.isFinite(snapshot.usdToTomanRate) && snapshot.usdToTomanRate > 0 ? snapshot : null;
  notifyAllListeners();
}

export function getRuntimeExchangeRateSnapshot(): RuntimeExchangeRateReference | null {
  return runtimeExchangeRateSnapshot;
}

export function getStoredExperienceMode(): RadarExperienceMode {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(RADAR_EXPERIENCE_MODE_STORAGE_KEY);
      if (raw === 'simple' || raw === 'pro') { currentMemoryExperienceMode = raw; return raw; }
    }
  } catch { /* Ignore */ }
  return currentMemoryExperienceMode;
}

export function setStoredExperienceMode(next: RadarExperienceMode): void {
  const valid: RadarExperienceMode = next === 'pro' ? 'pro' : 'simple';
  currentMemoryExperienceMode = valid;
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(RADAR_EXPERIENCE_MODE_STORAGE_KEY, valid);
  } catch { /* Ignore */ }
  notifyAllListeners();
}

export function toggleStoredExperienceMode(): RadarExperienceMode {
  const next: RadarExperienceMode = getStoredExperienceMode() === 'simple' ? 'pro' : 'simple';
  setStoredExperienceMode(next);
  return next;
}

export function getStoredAreaUnit(): AreaUnit {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(AREA_UNIT_STORAGE_KEY);
      if (raw === 'sqm' || raw === 'sqft') { currentMemoryAreaUnit = raw; return raw; }
    }
  } catch { /* Ignore */ }
  return currentMemoryAreaUnit;
}

export function setStoredAreaUnit(next: AreaUnit): void {
  const valid: AreaUnit = next === 'sqft' ? 'sqft' : 'sqm';
  currentMemoryAreaUnit = valid;
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(AREA_UNIT_STORAGE_KEY, valid);
  } catch { /* Ignore */ }
  notifyAllListeners();
}

export function toggleStoredAreaUnit(): AreaUnit {
  const next: AreaUnit = getStoredAreaUnit() === 'sqft' ? 'sqm' : 'sqft';
  setStoredAreaUnit(next);
  return next;
}

export function subscribeAreaUnit(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function detectBrowserLocaleFromNavigator(languages?: readonly string[]): SupportedRadarLocale {
  const list = languages ?? (typeof navigator !== 'undefined' && Array.isArray(navigator.languages) ? navigator.languages : undefined);
  if (Array.isArray(list)) {
    for (const lang of list) {
      const matched = normalizeSupportedLocale(lang);
      if (matched) return matched;
    }
  }
  return 'fa';
}

export function getRadarLocaleDirection(locale: RadarLocale): 'rtl' | 'ltr' {
  return locale === 'en' ? 'ltr' : 'rtl';
}

export function parseUrlIntlParams(search?: string): { lang?: SupportedRadarLocale; currency?: IntlCurrencyCode; unit?: AreaUnit } {
  if (!search || typeof search !== 'string') return { lang: undefined, currency: undefined, unit: undefined };
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const rawLang = params.get('lang');
    if (rawLang) {
      lastLocaleResolutionState = evaluateSingleLocaleCandidate(rawLang, 'url') ?? lastLocaleResolutionState;
    }
    const lang = normalizeSupportedLocale(rawLang);
    const rawUnit = (params.get('unit') || '').trim().toLowerCase();
    const rawCurrency = (params.get('currency') || '').trim().toUpperCase();
    const unit: AreaUnit | undefined = rawUnit === 'sqm' || rawUnit === 'sqft' ? rawUnit : undefined;
    const currency: IntlCurrencyCode | undefined = rawCurrency === 'IRT' || rawCurrency === 'USD' ? rawCurrency : undefined;
    return { lang, currency, unit };
  } catch {
    return { lang: undefined, currency: undefined, unit: undefined };
  }
}

export function resolveInitialRadarLocale(options?: {
  savedLocale?: string | null; urlLang?: string | null; navigatorLanguages?: readonly string[]; enableAutoBrowserDetect?: boolean;
}): SupportedRadarLocale {
  const resolved = resolveRadarLocaleContract(options);
  lastLocaleResolutionState = resolved;
  return resolved.activeLocale;
}

export function getStoredRadarLocale(): SupportedRadarLocale {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const rawItem = window.localStorage.getItem(RADAR_LOCALE_STORAGE_KEY);
      if (rawItem) {
        const evalRes = evaluateSingleLocaleCandidate(rawItem, 'storage');
        if (evalRes) {
          lastLocaleResolutionState = evalRes;
          currentMemoryLocale = evalRes.activeLocale;
          return evalRes.activeLocale;
        }
      }
    }
  } catch { /* Ignore */ }
  return currentMemoryLocale;
}

export function setStoredRadarLocale(next: RadarLocale): void {
  const evalRes = evaluateSingleLocaleCandidate(String(next), 'storage') ?? resolveRadarLocaleContract();
  lastLocaleResolutionState = evalRes;
  const valid: SupportedRadarLocale = evalRes.activeLocale;
  currentMemoryLocale = valid;
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(RADAR_LOCALE_STORAGE_KEY, valid);
    syncLocaleToDocumentRoot(valid);
  } catch { /* Ignore */ }
  notifyAllListeners();
}

export function getStoredIntlCurrency(): IntlCurrencyCode {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(RADAR_CURRENCY_STORAGE_KEY);
      if (raw === 'IRT' || raw === 'USD') { currentMemoryCurrency = raw; return raw; }
    }
  } catch { /* Ignore */ }
  return currentMemoryCurrency === 'USD' ? 'USD' : 'IRT';
}

export function setStoredIntlCurrency(next: IntlCurrencyCode): void {
  const valid: IntlCurrencyCode = next === 'USD' ? 'USD' : 'IRT';
  currentMemoryCurrency = valid;
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(RADAR_CURRENCY_STORAGE_KEY, valid);
  } catch { /* Ignore */ }
  notifyAllListeners();
}

export function formatMillionTomanAsIntlCurrency(
  millionToman: number,
  currency: IntlCurrencyCode = 'IRT',
  locale: RadarLocale = 'fa',
  exchangeRateRef?: RuntimeExchangeRateReference | null,
): string {
  const safeMillion = Number.isFinite(millionToman) ? Math.max(0, millionToman) : 0;
  const isEn = locale === 'en';
  if (currency === 'EUR' || currency === 'AED') {
    return isEn ? 'No valid reference rate recorded for this currency' : 'نرخ مرجع معتبر برای این ارز ثبت نشده است';
  }
  if (currency === 'USD') {
    const rate = exchangeRateRef?.usdToTomanRate ?? runtimeExchangeRateSnapshot?.usdToTomanRate;
    if (!rate || !Number.isFinite(rate) || rate <= 0) {
      return isEn ? 'FX reference rate unavailable' : 'نرخ مرجع تبدیل ارز در دسترس نیست';
    }
    const usdValue = (safeMillion * 1_000_000) / rate;
    const maxDigits = usdValue > 0 && usdValue < 1000 ? 2 : 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: maxDigits, maximumFractionDigits: maxDigits,
    }).format(usdValue);
  }
  if (safeMillion < 1000) {
    return isEn ? `${Math.round(safeMillion).toLocaleString('en-US')}M Toman` : `${Math.round(safeMillion).toLocaleString('fa-IR')} میلیون تومان`;
  }
  const billions = Number((safeMillion / 1000).toFixed(1));
  return isEn ? `${billions.toLocaleString('en-US')}B Toman` : `${billions.toLocaleString('fa-IR')} میلیارد تومان`;
}

export { getRadarBottomNavCopy, getRadarCompareCopy, getRadarGlobalNavCopy, getRadarInspectorCopy, getRadarLegendCopy, getRadarTopBarCopy };
export type { RadarBottomNavCopy, RadarCompareCopy, RadarGlobalNavCopy, RadarInspectorCopy, RadarLegendCopy, RadarTopBarCopy };

export function sqmToSqft(sqm: number): number {
  return Number(((Number.isFinite(sqm) ? Math.max(0, sqm) : 0) * SQM_TO_SQFT).toFixed(2));
}
export function sqftToSqm(sqft: number): number {
  return Number(((Number.isFinite(sqft) ? Math.max(0, sqft) : 0) / SQM_TO_SQFT).toFixed(2));
}
export function convertAreaFromSqm(sqm: number, unit: AreaUnit = 'sqm'): number {
  const safeSqm = Number.isFinite(sqm) ? Math.max(0, sqm) : 0;
  return unit === 'sqft' ? sqmToSqft(safeSqm) : Math.round(safeSqm);
}
export function convertPricePerSqmToUnitRaw(pricePerSqmMillion: number, unit: AreaUnit = 'sqm'): number {
  const safePrice = Number.isFinite(pricePerSqmMillion) ? Math.max(0, pricePerSqmMillion) : 0;
  return unit === 'sqft' ? safePrice / SQM_TO_SQFT : safePrice;
}
export function convertPricePerSqmToUnit(pricePerSqmMillion: number, unit: AreaUnit = 'sqm'): number {
  return Math.round(convertPricePerSqmToUnitRaw(pricePerSqmMillion, unit) * 10) / 10;
}
export function formatAreaNumber(value: number, persianDigits = true): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString(persianDigits ? 'fa-IR' : 'en-US');
}
export function formatAreaValue(sqm: number, unit: AreaUnit = 'sqm', persianDigits?: boolean): string {
  const useFaDigits = persianDigits ?? getStoredRadarLocale() !== 'en';
  const formatted = formatAreaNumber(convertAreaFromSqm(sqm, unit), useFaDigits);
  if (!useFaDigits) return unit === 'sqft' ? `${formatted} sq ft (ft²)` : `${formatted} sq m (m²)`;
  return unit === 'sqft' ? `${formatted} فوت مربع` : `${formatted} متر مربع`;
}
export function formatAreaShort(sqm: number, unit: AreaUnit = 'sqm', persianDigits?: boolean): string {
  const useFaDigits = persianDigits ?? getStoredRadarLocale() !== 'en';
  const formatted = formatAreaNumber(convertAreaFromSqm(sqm, unit), useFaDigits);
  if (!useFaDigits) return unit === 'sqft' ? `${formatted} ft²` : `${formatted} m²`;
  return unit === 'sqft' ? `${formatted} فوت مربع` : `${formatted} متری`;
}
export function formatAreaUnitLabel(unit: AreaUnit = 'sqm', locale?: RadarLocale): string {
  const isEn = (locale ?? getStoredRadarLocale()) === 'en';
  if (isEn) return unit === 'sqft' ? 'Square Feet (ft²)' : 'Square Meters (m²)';
  return unit === 'sqft' ? 'فوت مربع' : 'متر مربع';
}
export function formatUnitBuyPriceTitle(unit: AreaUnit = 'sqm', locale?: RadarLocale): string {
  const isEn = (locale ?? getStoredRadarLocale()) === 'en';
  if (isEn) return unit === 'sqft' ? 'Avg Price / ft²' : 'Avg Price / m²';
  return unit === 'sqft' ? 'میانگین خرید هر فوت مربع' : 'میانگین خرید هر متر';
}
