/**
 * @file src/utils/epistemicUiLabels.ts
 * Canonical Persian/English UI labels for price epistemology (CASPER / RMEP — no false transaction certainty).
 * OP-DEC-001 parity: formatMillionTomanAsIntlCurrency (see areaUnit).
 */

import type { MarketDataProvenance } from '../data/realMarketPriceAggregator';

export const LABEL_ASKING_MEDIAN_TODAY_FA = 'میانهٔ آگهی‌های مشابه امروز';
export const LABEL_HEURISTIC_NEGOTIATION_V64_FA = 'سناریوی فرضی مذاکره (v6.4 · غیرثبتی)';
/** Short inline suffix for tables/tooltips (replaces legacy «سناریو v6.4 (غیرثبتی)»). */
export const LABEL_HEURISTIC_V64_SHORT_FA = 'سناریو v6.4 (غیرثبتی)';
export const LABEL_HEURISTIC_V64_SHORT_EN = 'v6.4 scenario (non-registry)';
export const LABEL_INSUFFICIENT_LIVE_SAMPLE_FA = 'امروز آگهی قابل‌خواندن کافی نیست';
export const LABEL_REFERENCE_BASELINE_FA = 'مرجع قدیمی محله (جدول داخلی)';
export const LABEL_ASKING_LISTING_FA = 'قیمت اعلامی آگهی';
export const LABEL_ADS_NOT_TRANSACTIONS_FA = 'این‌ها آگهی‌اند؛ معاملهٔ ثبت‌شده نیستند.';

export const LABEL_ASKING_MEDIAN_TODAY_EN = 'Median of similar listings today';
export const LABEL_HEURISTIC_NEGOTIATION_V64_EN = 'Hypothetical negotiation scenario (v6.4 · not registered)';
export const LABEL_INSUFFICIENT_LIVE_SAMPLE_EN = 'Not enough readable listings today';
export const LABEL_REFERENCE_BASELINE_EN = 'Neighborhood reference baseline (internal table)';

export type RadarUiLocale = 'fa' | 'en';

export type EpistemicPriceLineMode = 'asking_median' | 'heuristic_v64' | 'baseline' | 'insufficient';

/** UI must never show “قطعی معامله” when no verified transactions exist. */
export const FORBIDDEN_DEAL_FACT_LABELS = ['قیمت قطعی', 'معامله قطعی', 'تخمین قطعی معامله'] as const;

export function getDisplayDealLabelFa(_verifiedTransactionCount: number): string {
  return LABEL_HEURISTIC_NEGOTIATION_V64_FA;
}

export function isDealPriceDisplayableAsFact(verifiedTransactionCount: number): boolean {
  return verifiedTransactionCount > 0;
}

export function labelForEpistemicPriceLine(mode: EpistemicPriceLineMode, locale: RadarUiLocale = 'fa'): string {
  if (locale === 'en') {
    if (mode === 'asking_median') return LABEL_ASKING_MEDIAN_TODAY_EN;
    if (mode === 'heuristic_v64') return LABEL_HEURISTIC_NEGOTIATION_V64_EN;
    if (mode === 'baseline') return LABEL_REFERENCE_BASELINE_EN;
    return LABEL_INSUFFICIENT_LIVE_SAMPLE_EN;
  }
  if (mode === 'asking_median') return LABEL_ASKING_MEDIAN_TODAY_FA;
  if (mode === 'heuristic_v64') return LABEL_HEURISTIC_NEGOTIATION_V64_FA;
  if (mode === 'baseline') return LABEL_REFERENCE_BASELINE_FA;
  return LABEL_INSUFFICIENT_LIVE_SAMPLE_FA;
}

export function formatEpistemicPriceLine(
  mode: EpistemicPriceLineMode,
  opts?: { locale?: RadarUiLocale; fetchedAtIso?: string | null; provenance?: MarketDataProvenance },
): string {
  const locale = opts?.locale ?? 'fa';
  const base = labelForEpistemicPriceLine(mode, locale);
  if (!opts?.fetchedAtIso) return base;
  const ts = formatFetchedAtFa(opts.fetchedAtIso);
  return `${base} · خواندن: ${ts}`;
}

function formatFetchedAtFa(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '—';
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(d);
  } catch {
    return '—';
  }
}

export function dealSpreadRowLabelFa(areaUnit: 'sqm' | 'sqft'): string {
  return `${LABEL_HEURISTIC_NEGOTIATION_V64_FA} (${areaUnit === 'sqft' ? 'هر ft²' : 'هر متر'})`;
}

export function dealSpreadRowLabelEn(areaUnit: 'sqm' | 'sqft'): string {
  return `Hypothetical negotiation (v6.4 · not registry) (${areaUnit === 'sqft' ? 'ft²' : 'm²'})`;
}

export function dealFairTotalLabelFa(): string {
  return 'سناریوی فرضی پای مذاکره (غیرثبتی)';
}

/** Replace forbidden «معامله v6.4» inline hints in lists. */
export function inlineHeuristicDealHintFa(): string {
  return LABEL_HEURISTIC_V64_SHORT_FA;
}

export function buildDivarPostUrl(token: string): string {
  const safe = (token || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
  return safe ? `https://divar.ir/v/${safe}` : 'https://divar.ir/';
}
