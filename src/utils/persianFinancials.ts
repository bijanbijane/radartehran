/**
 * Deterministic Persian/Arabic Numeral Sanitizer & Tehran Real Estate Financial Engine
 * Enforces [RULE-08], [RULE-09], [RULE-11], and [RULE-13]
 */

import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from './areaUnit';
import { normalizeDigitsToAscii } from './forms/formInputHelpers';

const PERSIAN_DIGITS = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
const ARABIC_DIGITS = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];

const MAX_MILLION_TOMAN_INPUT = 100_000_000;

export function normalizeFinancialInput(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 && raw <= MAX_MILLION_TOMAN_INPUT ? raw : 0;
  }
  let str = String(raw).trim();
  if (!str || str.length > 64 || /^[-−\u2212]/.test(str)) return 0;

  for (let i = 0; i < 10; i++) {
    str = str.replace(PERSIAN_DIGITS[i], String(i)).replace(ARABIC_DIGITS[i], String(i));
  }

  // Convert Persian decimal separator (٫) to dot, then strip thousand separators (٬), commas, spaces, and non-numeric characters
  const cleaned = str.replace(/[٫\u066B]/g, '.').replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const normalized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_MILLION_TOMAN_INPUT ? parsed : 0;
}



/**
 * Parses a user-facing budget such as "۱۱ میلیارد تومان" or "۱۲۰۰۰ میلیون تومان"
 * into D1's canonical unit: million tomans. Unitless and ambiguous inputs are rejected.
 */
export function parseMillionTomanBudgetInput(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.trim().length === 0 || raw.length > 120) return null;
  const normalized = normalizeDigitsToAscii(raw)
    .replace(/[٫]/g, '.')
    .replace(/[٬،]/g, ',')
    .trim();
  if (/(?:^|[\s(])[-−]\s*[0-9]/.test(normalized)) return null;
  const amountMatch = normalized.match(/(?<![A-Za-z0-9])([0-9]+(?:[.,][0-9]+)?)(?![A-Za-z0-9])/);
  if (!amountMatch) return null;

  const amount = Number(amountMatch[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const text = normalized.toLowerCase();
  const billionUnit = /میلیارد|billion|bn/.test(text);
  const millionUnit = /میلیون|million|mn/.test(text);
  if (billionUnit === millionUnit) return null;

  const millionToman = amount * (billionUnit ? 1000 : 1);
  if (!Number.isFinite(millionToman) || millionToman <= 0 || millionToman > MAX_MILLION_TOMAN_INPUT) return null;
  return Number(millionToman.toFixed(2));
}

export type FinancialInputContext = 'TOTAL_BUY_PRICE' | 'DEPOSIT_OR_UNIT';

export interface UnitScaleDisambiguation {
  normalizedMillionValue: number;
  verbalPersianText: string;
  isLikelyMissingZeros: boolean;
  warningMessage: string | null;
}

/**
 * Converts a value in "Million Tomans" into an unmistakable Persian verbal summary
 * e.g., 6500 -> "معادل ۶ میلیارد و ۵۰۰ میلیون تومان"
 */
export function formatMillionToVerbalPersian(valueInMillions: number): string {
  const safeVal = normalizeFinancialInput(valueInMillions);
  if (safeVal <= 0) return 'مبلغ را به میلیون تومان وارد کنید';

  const totalThousandToman = Math.round(safeVal * 1000);
  if (totalThousandToman <= 0) return 'مبلغ را به میلیون تومان وارد کنید';

  const billions = Math.floor(totalThousandToman / 1_000_000);
  const remAfterBillions = totalThousandToman % 1_000_000;
  const remainingMillions = Math.floor(remAfterBillions / 1000);
  const khordehHezar = remAfterBillions % 1000;

  const fmt = new Intl.NumberFormat('fa-IR');
  const segments: string[] = [];

  if (billions > 0) {
    segments.push(`${fmt.format(billions)} میلیارد`);
  }
  if (remainingMillions > 0) {
    segments.push(`${fmt.format(remainingMillions)} میلیون`);
  }
  if (khordehHezar > 0) {
    segments.push(`${fmt.format(khordehHezar)} هزار`);
  }

  return `معادل ${segments.join(' و ')} تومان`;
}

export function validateAndScaleTomanInput(
  rawInput: string | number,
  context: FinancialInputContext = 'TOTAL_BUY_PRICE'
): UnitScaleDisambiguation {
  const val = normalizeFinancialInput(rawInput);

  if (val === 0) {
    return {
      normalizedMillionValue: 0,
      verbalPersianText: 'مبلغ را وارد کنید (واحد: میلیون تومان)',
      isLikelyMissingZeros: false,
      warningMessage: null,
    };
  }

  // Only warn for total property buy price if user enters < 300 (e.g., typed "12" meaning 12 Billion instead of 12000 Million)
  const isLikelyMissingZeros = context === 'TOTAL_BUY_PRICE' && val > 0 && val < 300;
  const warningMessage = isLikelyMissingZeros
    ? `آیا منظور شما ${new Intl.NumberFormat('fa-IR').format(val)} میلیارد تومان (${new Intl.NumberFormat('fa-IR').format(val * 1000)} میلیون) است؟`
    : null;

  return {
    normalizedMillionValue: val,
    verbalPersianText: formatMillionToVerbalPersian(val),
    isLikelyMissingZeros,
    warningMessage,
  };
}

/**
 * [RULE-13] Non-linear Building Age Depreciation & Kolangi Land-Value Floor
 */
export interface AgeValuationAdjustment {
  multiplier: number;
  regime: 'PRIME_NEW' | 'DEPRECIATING_ACAYAN' | 'KOLANGI_LAND_FLOOR';
  persianLabel: string;
}

export function calculateTehranAgeFactor(
  buildingAgeYears: number,
  landValueFloorRatio = 0.76
): AgeValuationAdjustment {
  const age = Math.max(0, Math.min(60, normalizeFinancialInput(buildingAgeYears)));
  const safeFloorRatio = Number.isFinite(landValueFloorRatio)
    ? Math.min(0.95, Math.max(0.4, landValueFloorRatio))
    : 0.76;

  if (age <= 5) {
    // 0 to 5 years: gentle 0.9% annual reduction
    return {
      multiplier: Number((1 - age * 0.009).toFixed(4)),
      regime: 'PRIME_NEW',
      persianLabel: 'نوساز / کم‌سن (افت جزئی)',
    };
  }

  if (age <= 22) {
    // 6 to 22 years: steeper structural depreciation (~1.55% per year after year 5)
    const raw = 0.955 - (age - 5) * 0.0155;
    return {
      multiplier: Number(Math.max(safeFloorRatio, raw).toFixed(4)),
      regime: 'DEPRECIATING_ACAYAN',
      persianLabel: 'میان‌سال (استهلاک اعیان)',
    };
  }

  // > 22 years: hits Kolangi / Rebuildable Land-Value Floor (قدرالسهم زمین)
  return {
    multiplier: Number(safeFloorRatio.toFixed(4)),
    regime: 'KOLANGI_LAND_FLOOR',
    persianLabel: 'کلنگی / ارزش قدرالسهم زمین (کف استهلاک)',
  };
}

/**
 * [RULE-13] Dynamic Rahn-to-Ejareh (Deposit-to-Rent) & Cap-Rate Calculator
 * Standard Tehran custom: Every 100 Million Toman Deposit = 3 Million Toman Monthly Rent (3% per month / 36% annual)
 */
export interface RentConversionResult {
  fullDepositMillion: number;
  depositMillion: number;
  monthlyRentMillion: number;
  monthlyRatePercent: number;
  annualCapRatePercent: number;
}

export function computeRentConversion(
  estimatedPropertyValueMillion: number,
  districtTier: 'NORTH_LUXURY' | 'CENTRAL_BALANCED' | 'SOUTH_HIGH_YIELD',
  depositShareRatio = 0.5, // 0 = all rent, 1 = Rahn-e Kamel (full deposit)
  monthlyConversionRatePercent = 3.0 // Adjustable 1.5% to 4.0%
): RentConversionResult {
  const safeVal = Math.max(0, normalizeFinancialInput(estimatedPropertyValueMillion));
  const safeRate = Math.min(4.0, Math.max(1.5, monthlyConversionRatePercent));
  const safeShare = Math.min(1, Math.max(0, depositShareRatio));

  // Annual Rahn-e Kamel ratio relative to property price varies by Tehran socio-economic region
  const rahnToPriceRatio =
    districtTier === 'NORTH_LUXURY' ? 0.14 : districtTier === 'CENTRAL_BALANCED' ? 0.18 : 0.22;

  const fullDepositMillion = Math.round(safeVal * rahnToPriceRatio);
  const depositMillion = Math.round(fullDepositMillion * safeShare);
  const remainingRahnForRent = fullDepositMillion - depositMillion;

  // Monthly rent in Millions
  const monthlyRentMillion = Number(((remainingRahnForRent * safeRate) / 100).toFixed(2));
  const annualEquivalentRent = fullDepositMillion * (safeRate / 100) * 12;
  const annualCapRatePercent =
    safeVal > 0 ? Number(((annualEquivalentRent / safeVal) * 100).toFixed(2)) : 0;

  return {
    fullDepositMillion,
    depositMillion,
    monthlyRentMillion,
    monthlyRatePercent: safeRate,
    annualCapRatePercent,
  };
}

/**
 * [RULE-11] Jalali Calendar Formatter from UTC Unix Timestamp
 */
export function formatJalaliMonthYear(utcTimestampMs: number): string {
  const safeTs = Number.isFinite(utcTimestampMs) && utcTimestampMs > 0 ? utcTimestampMs : Date.now();
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      month: 'short',
      year: 'numeric',
    }).format(new Date(safeTs));
  } catch {
    return new Date(safeTs).toLocaleDateString('fa-IR');
  }
}

export function formatMillionWithIntlEquivalence(millionToman: number, currency: IntlCurrencyCode = 'USD'): string {
  return `${formatMillionToVerbalPersian(millionToman)} (${formatMillionTomanAsIntlCurrency(millionToman, currency)})`;
}
