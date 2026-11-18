/**
 * Stage 29 — Locale & Regional Preference Integrity Engine
 * Spec ID: RT-FE-REBUILD-LOCALE-REGIONAL-PREFERENCE-INTEGRITY-029
 *
 * Unifies the contract between SupportedRadarLocale ('fa' | 'en') and
 * PlannedRadarLocale ('ar' | 'tr'), enforces deterministic resolution
 * precedence (URL -> LocalStorage -> Browser -> Default 'fa'), prevents
 * silent coercion of planned/invalid locales without explicit fallback
 * reporting, synchronizes DOM lang/dir attributes, and guards regional
 * number, date, area, and currency formatting.
 */

export const RT_FE_LOCALE_REGIONAL_INTEGRITY_SPEC_ID =
  'RT-FE-REBUILD-LOCALE-REGIONAL-PREFERENCE-INTEGRITY-029' as const;
export const RT_FE_LOCALE_REGIONAL_INTEGRITY_READY =
  'RT_FE_STAGE29_LOCALE_REGIONAL_INTEGRITY_READY' as const;

export type SupportedRadarLocale = 'fa' | 'en';
export type PlannedRadarLocale = 'ar' | 'tr';
export type RadarLocale = SupportedRadarLocale | PlannedRadarLocale;

export const SUPPORTED_RADAR_LOCALES: readonly SupportedRadarLocale[] = ['fa', 'en'] as const;
export const PLANNED_RADAR_LOCALES: readonly PlannedRadarLocale[] = ['ar', 'tr'] as const;

export type LocaleResolutionSource = 'url' | 'storage' | 'browser' | 'default';
export type LocaleResolutionStatus =
  | 'ACTIVE_SUPPORTED'
  | 'FALLBACK_PLANNED_LOCALE'
  | 'FALLBACK_INVALID_LOCALE'
  | 'DEFAULT_LOCALE';

export interface LocaleResolutionResult {
  requestedLocale: string | null;
  activeLocale: SupportedRadarLocale;
  status: LocaleResolutionStatus;
  fallbackApplied: boolean;
  fallbackReason?: string;
  source: LocaleResolutionSource;
  direction: 'rtl' | 'ltr';
  langAttr: SupportedRadarLocale;
}

export interface CurrencyIntegrityEvaluation {
  requestedCurrency: string;
  effectiveCurrency: 'IRT' | 'USD';
  supportedInRuntime: boolean;
  requiresServerRate: boolean;
  hasValidServerRate: boolean;
  fallbackApplied: boolean;
  reasonFa: string;
  reasonEn: string;
}

export function isSupportedRadarLocale(value: unknown): value is SupportedRadarLocale {
  return value === 'fa' || value === 'en';
}

export function isPlannedRadarLocale(value: unknown): value is PlannedRadarLocale {
  return value === 'ar' || value === 'tr';
}

export function extractBaseLocaleCode(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return undefined;
  const match = /^([a-z]{2})(?:-[a-z0-9]+)*$/i.exec(trimmed);
  return match ? match[1].toLowerCase() : trimmed;
}

export function getActiveLocaleDirection(locale: SupportedRadarLocale): 'rtl' | 'ltr' {
  return locale === 'en' ? 'ltr' : 'rtl';
}

export function evaluateSingleLocaleCandidate(
  rawCandidate: string | null | undefined,
  source: LocaleResolutionSource,
): LocaleResolutionResult | null {
  if (rawCandidate === null || rawCandidate === undefined || rawCandidate.trim() === '') {
    return null;
  }
  const code = extractBaseLocaleCode(rawCandidate);
  if (code === 'fa' || code === 'en') {
    return {
      requestedLocale: rawCandidate,
      activeLocale: code,
      status: 'ACTIVE_SUPPORTED',
      fallbackApplied: false,
      source,
      direction: getActiveLocaleDirection(code),
      langAttr: code,
    };
  }
  if (code === 'ar' || code === 'tr') {
    return {
      requestedLocale: rawCandidate,
      activeLocale: 'fa',
      status: 'FALLBACK_PLANNED_LOCALE',
      fallbackApplied: true,
      fallbackReason: `زبان «${code}» در فهرست برنامه‌ریزی‌شده (PlannedRadarLocale) قرار دارد و هنوز در زمان اجرا فعال نیست؛ بازگشت صریح به «fa» اعمال شد.`,
      source,
      direction: 'rtl',
      langAttr: 'fa',
    };
  }
  return {
    requestedLocale: rawCandidate,
    activeLocale: 'fa',
    status: 'FALLBACK_INVALID_LOCALE',
    fallbackApplied: true,
    fallbackReason: `کد زبان «${String(rawCandidate).slice(0, 24)}» معتبر یا پشتیبانی‌شده نیست؛ بازگشت امن به «fa» اعمال شد.`,
    source,
    direction: 'rtl',
    langAttr: 'fa',
  };
}

export function resolveRadarLocaleContract(options?: {
  urlLang?: string | null;
  savedLocale?: string | null;
  navigatorLanguages?: readonly string[];
  enableAutoBrowserDetect?: boolean;
}): LocaleResolutionResult {
  // 1. URL parameter (?lang=...) has highest priority
  const urlEval = evaluateSingleLocaleCandidate(options?.urlLang, 'url');
  if (urlEval) {
    if (urlEval.status === 'ACTIVE_SUPPORTED') return urlEval;
    // If URL had an invalid or planned locale, check if storage has a valid supported locale before defaulting to 'fa'
    const savedBackup = evaluateSingleLocaleCandidate(options?.savedLocale, 'storage');
    if (savedBackup && savedBackup.status === 'ACTIVE_SUPPORTED') {
      return {
        ...savedBackup,
        requestedLocale: options?.urlLang ?? savedBackup.requestedLocale,
        fallbackApplied: true,
        fallbackReason: urlEval.fallbackReason,
      };
    }
    return urlEval;
  }

  // 2. LocalStorage saved preference
  const storageEval = evaluateSingleLocaleCandidate(options?.savedLocale, 'storage');
  if (storageEval && storageEval.status === 'ACTIVE_SUPPORTED') {
    return storageEval;
  }

  // 3. Browser navigator.languages (when enabled)
  if (options?.enableAutoBrowserDetect && Array.isArray(options?.navigatorLanguages)) {
    for (const candidate of options.navigatorLanguages) {
      const code = extractBaseLocaleCode(candidate);
      if (code === 'fa' || code === 'en') {
        return {
          requestedLocale: storageEval?.requestedLocale ?? candidate,
          activeLocale: code,
          status: storageEval ? storageEval.status : 'ACTIVE_SUPPORTED',
          fallbackApplied: storageEval ? true : false,
          fallbackReason: storageEval?.fallbackReason,
          source: 'browser',
          direction: getActiveLocaleDirection(code),
          langAttr: code,
        };
      }
    }
  }

  if (storageEval) {
    return storageEval;
  }

  // 4. Default ('fa')
  return {
    requestedLocale: null,
    activeLocale: 'fa',
    status: 'DEFAULT_LOCALE',
    fallbackApplied: false,
    source: 'default',
    direction: 'rtl',
    langAttr: 'fa',
  };
}

export function syncLocaleToDocumentRoot(
  locale: SupportedRadarLocale,
  doc?: Document | null,
): { lang: SupportedRadarLocale; dir: 'rtl' | 'ltr'; dataRadarLocale: SupportedRadarLocale } {
  const valid: SupportedRadarLocale = locale === 'en' ? 'en' : 'fa';
  const dir = getActiveLocaleDirection(valid);
  const targetDoc = doc !== undefined ? doc : (typeof document !== 'undefined' ? document : null);
  try {
    if (targetDoc && targetDoc.documentElement) {
      targetDoc.documentElement.setAttribute('data-radar-locale', valid);
      targetDoc.documentElement.lang = valid;
      targetDoc.documentElement.dir = dir;
    }
  } catch {
    // Ignore DOM mutation errors in non-browser environments
  }
  return { lang: valid, dir, dataRadarLocale: valid };
}

export function formatLocaleNumber(value: number, locale: SupportedRadarLocale = 'fa'): string {
  if (!Number.isFinite(value)) return locale === 'en' ? '—' : 'نامشخص';
  return value.toLocaleString(locale === 'en' ? 'en-US' : 'fa-IR');
}

export function formatLocaleDate(
  isoString: string | null | undefined,
  locale: SupportedRadarLocale = 'fa',
): string {
  if (!isoString || typeof isoString !== 'string') {
    return locale === 'en' ? 'Unknown date' : 'تاریخ نامشخص';
  }
  const ms = Date.parse(isoString);
  if (!Number.isFinite(ms)) {
    return locale === 'en' ? 'Invalid date' : 'تاریخ نامعتبر';
  }
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'fa-IR-u-ca-persian', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export function evaluateCurrencyPreferenceIntegrity(
  requestedCurrency: unknown,
  usdToTomanRate?: number | null,
): CurrencyIntegrityEvaluation {
  const raw = typeof requestedCurrency === 'string' ? requestedCurrency.trim().toUpperCase() : 'IRT';
  const hasValidUsd = typeof usdToTomanRate === 'number' && Number.isFinite(usdToTomanRate) && usdToTomanRate > 0;

  if (raw === 'EUR' || raw === 'AED') {
    return {
      requestedCurrency: raw,
      effectiveCurrency: 'IRT',
      supportedInRuntime: false,
      requiresServerRate: true,
      hasValidServerRate: false,
      fallbackApplied: true,
      reasonFa: 'نرخ مرجع معتبر سرور برای این ارز ثبت نشده است؛ نمایش بر پایه تومان انجام می‌شود.',
      reasonEn: 'No valid server reference rate is recorded for this currency; falling back to Toman.',
    };
  }

  if (raw === 'USD') {
    if (!hasValidUsd) {
      return {
        requestedCurrency: 'USD',
        effectiveCurrency: 'USD',
        supportedInRuntime: true,
        requiresServerRate: true,
        hasValidServerRate: false,
        fallbackApplied: true,
        reasonFa: 'نرخ مرجع تبدیل دلار در حال حاضر از سرور در دسترس نیست.',
        reasonEn: 'Server USD reference exchange rate is currently unavailable.',
      };
    }
    return {
      requestedCurrency: 'USD',
      effectiveCurrency: 'USD',
      supportedInRuntime: true,
      requiresServerRate: true,
      hasValidServerRate: true,
      fallbackApplied: false,
      reasonFa: 'نرخ مرجع معتبر دلار از سرور دریافت شده است.',
      reasonEn: 'Valid server USD reference rate active.',
    };
  }

  return {
    requestedCurrency: raw === 'IRT' ? 'IRT' : raw,
    effectiveCurrency: 'IRT',
    supportedInRuntime: raw === 'IRT',
    requiresServerRate: false,
    hasValidServerRate: true,
    fallbackApplied: raw !== 'IRT',
    reasonFa: 'واحد پایه تومان (IRT) فعال است.',
    reasonEn: 'Base currency Toman (IRT) is active.',
  };
}
