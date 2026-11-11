/**
 * @file src/utils/fxInflationDriftEngine.ts
 * @description Dynamic FX and CPI Inflation Drift Engine for Iranian Real Estate.
 * Solves temporal data decay by adjusting nominal property prices against exchange rate and inflation shocks.
 */
import { toPersianNum } from '../data/neighborhoods';

export type MacroInflationRegime = 'CALM' | 'MODERATE' | 'CURRENCY_SHOCK';

export interface FxDriftParameters {
  basePriceSqm: number;
  dataAgeDays: number;
  cityZone: string;
  usdRateChangePct?: number;
  annualInflationPct?: number;
}

export interface FxDriftOutput {
  nominalOriginalPriceSqm: number;
  adjustedCurrentPriceSqm: number;
  driftMultiplier: number;
  driftPercent: number;
  regime: MacroInflationRegime;
  betaSensitivity: number;
  daysStale: number;
  isStaleData: boolean;
  explanationFa: string;
  riskNoticeFa: string;
}

/**
 * Empirical sensitivity (Beta) of Iranian property zones to currency/gold shocks:
 * High-end northern zones have high dollar elasticity (~0.85-0.95),
 * Southern and peripheral zones follow general consumer wages/CPI (~0.55-0.70).
 */
function normalizeDigits(str: string): string {
  return str
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

export function getZoneCurrencyBeta(zone: string): number {
  const normalized = normalizeDigits(zone);
  const z = normalized.replace(/[^\d]/g, '');
  const zoneNum = parseInt(z, 10);
  if (zoneNum >= 1 && zoneNum <= 3) return 0.90;
  if (zoneNum >= 4 && zoneNum <= 6) return 0.80;
  if (zoneNum >= 7 && zoneNum <= 12) return 0.70;
  if (zoneNum >= 13 && zoneNum <= 22) return 0.60;
  // Suburbs, satellite cities
  if (zone.includes('شمیرانات') || zone.includes('لواسان')) return 0.92;
  if (zone.includes('پردیس') || zone.includes('اندیشه')) return 0.65;
  return 0.75;
}

export function computeInflationAdjustedPrice(params: FxDriftParameters): FxDriftOutput {
  const days = Math.max(0, Math.min(365, params.dataAgeDays));
  const rawPrice = Math.max(1, params.basePriceSqm);
  const beta = getZoneCurrencyBeta(params.cityZone);

  // Default macroeconomic baseline for Iran: 42% annualized general inflation, 12% quarterly FX drift
  const annualInflation = params.annualInflationPct ?? 42;
  const usdChangePct = params.usdRateChangePct ?? 10;

  // Blended daily drift rate
  const annualExpectedGrowthPct = annualInflation * 0.4 + usdChangePct * 4 * 0.6 * beta;
  const dailyGrowthRate = annualExpectedGrowthPct / 365 / 100;

  const driftMultiplier = Math.max(1.0, 1.0 + dailyGrowthRate * days);
  const adjustedPrice = Math.round(rawPrice * driftMultiplier);
  const driftPercent = Number(((driftMultiplier - 1.0) * 100).toFixed(1));

  let regime: MacroInflationRegime = 'MODERATE';
  if (usdChangePct > 15) regime = 'CURRENCY_SHOCK';
  else if (usdChangePct < 5) regime = 'CALM';

  const isStale = days > 25;

  const explanationFa = isStale
    ? `داده قیمت این منطقه مربوط به ${toPersianNum(days)} روز پیش است. با احتساب ضریب بتای ارزی ${toPersianNum(beta)}، ارزش ذاتی به روز حدود متری ${toPersianNum(adjustedPrice)} م.ت برآورد می‌شود (+${toPersianNum(driftPercent)}٪ تعدیل تورمی).`
    : `داده‌های قیمتی تازه است (${toPersianNum(days)} روز اخیر) و با واقعیت ریالی روز همخوانی دارد.`;

  const riskNoticeFa = isStale
    ? 'هشدار کسپر: به دلیل فرسایش زمانی دیتای خام، در اتاق نشست قیمت را با شاخص طلا و دلار ۷۲ ساعت اخیر بسنجید.'
    : 'اعتبار زمانی داده‌ها مورد تایید است.';

  return {
    nominalOriginalPriceSqm: rawPrice,
    adjustedCurrentPriceSqm: adjustedPrice,
    driftMultiplier,
    driftPercent,
    regime,
    betaSensitivity: beta,
    daysStale: days,
    isStaleData: isStale,
    explanationFa,
    riskNoticeFa,
  };
}
