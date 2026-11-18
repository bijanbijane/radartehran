/**
 * @file src/platform/search/core/SearchNormalizer.ts
 * @description Persian/Arabic normalization, digit conversion, exact AreaUnit (1 sqm = 10.7639104167 sqft) and unambiguous MoneyValue formatting.
 */

import { EXACT_SQM_TO_SQFT, type AreaUnit, type AreaValue, type MoneyValue } from './SearchTypes';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeDigitsToAscii(input: string): string {
  if (!input) return '';
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const pIdx = PERSIAN_DIGITS.indexOf(ch);
    if (pIdx !== -1) {
      out += String(pIdx);
      continue;
    }
    const aIdx = ARABIC_DIGITS.indexOf(ch);
    if (aIdx !== -1) {
      out += String(aIdx);
      continue;
    }
    out += ch;
  }
  return out;
}

export function formatAsciiToPersianDigits(input: string | number): string {
  const str = String(input ?? '');
  return str.replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] || d);
}

/**
 * Normalizes Persian/Arabic characters, ZWNJ (\u200c), Kashida (\u0640), diacritics, and digits
 * while callers keep `rawQuery` untouched for input display.
 */
export function normalizePersianSearchQuery(rawQuery: string): string {
  if (typeof rawQuery !== 'string') return '';
  const asciiDigits = normalizeDigitsToAscii(rawQuery);
  return asciiDigits
    .replace(/[\u064A\u0649\u06CC\u06D2]/g, 'ی')
    .replace(/[\u0643\u06A9]/g, 'ک')
    .replace(/[\u0629]/g, 'ه')
    .replace(/[\u0623\u0625\u0622]/g, 'ا')
    .replace(/[\u0640\u064B-\u065F\u0670]/g, '')
    .replace(/[\u200C\u200D\u200E\u200F\u00A0]/g, ' ')
    .replace(/[^\p{L}\p{N}\s.\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function convertAreaBetweenUnits(value: number, fromUnit: AreaUnit, toUnit: AreaUnit): AreaValue {
  if (!Number.isFinite(value) || value < 0) {
    return { value: 0, unit: toUnit };
  }
  if (fromUnit === toUnit) {
    return { value: Number(value.toFixed(4)), unit: toUnit };
  }
  if (fromUnit === 'sqm' && toUnit === 'sqft') {
    return { value: Number((value * EXACT_SQM_TO_SQFT).toFixed(4)), unit: 'sqft' };
  }
  return { value: Number((value / EXACT_SQM_TO_SQFT).toFixed(4)), unit: 'sqm' };
}

export function formatAreaValueFa(area: AreaValue | null | undefined): string {
  if (!area || !Number.isFinite(area.value) || area.value <= 0) return 'نامشخص';
  const rounded = area.unit === 'sqm' ? Math.round(area.value * 10) / 10 : Math.round(area.value);
  const unitLabel = area.unit === 'sqm' ? 'مترمربع' : 'فوت‌مربع';
  return `${formatAsciiToPersianDigits(rounded.toLocaleString('en-US'))} ${unitLabel}`;
}

/**
 * Formats MoneyValue with explicit, unambiguous units (never uses ambiguous «م.ت»).
 */
export function formatMoneyValueFa(money: MoneyValue | null | undefined): string {
  if (!money || !Number.isFinite(money.amount) || money.amount < 0) {
    return 'نامشخص';
  }
  if (money.currency === 'USD') {
    const formatted = Math.round(money.amount).toLocaleString('en-US');
    return `${ formatted } دلار آمریکا`;
  }

  // Amount is normalized in Tomans when currency === 'IRR' unless displayUnit === 'rial'
  const val = money.amount;
  if (money.displayUnit === 'rial') {
    return `${formatAsciiToPersianDigits(Math.round(val).toLocaleString('en-US'))} ریال`;
  }
  if (money.displayUnit === 'billion') {
    const num = Number(val.toFixed(2));
    return `${formatAsciiToPersianDigits(num)} میلیارد تومان`;
  }
  if (money.displayUnit === 'million') {
    const num = Number(val.toFixed(1));
    return `${formatAsciiToPersianDigits(num)} میلیون تومان`;
  }
  return `${formatAsciiToPersianDigits(Math.round(val).toLocaleString('en-US'))} تومان`;
}

export function createMoneyFromMillionToman(millionToman: number | null | undefined): MoneyValue | null {
  if (typeof millionToman !== 'number' || !Number.isFinite(millionToman) || millionToman <= 0) {
    return null;
  }
  if (millionToman >= 1000) {
    return {
      amount: Number((millionToman / 1000).toFixed(3)),
      currency: 'IRR',
      displayUnit: 'billion',
    };
  }
  return {
    amount: Number(millionToman.toFixed(2)),
    currency: 'IRR',
    displayUnit: 'million',
  };
}
