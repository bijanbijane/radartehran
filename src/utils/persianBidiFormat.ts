/** @file src/utils/persianBidiFormat.ts — Pure Persian Numeral, BiDi Isolation & Domain Formatting Utilities */

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

/** Convert ASCII digits to Persian digits and decimal points between digits to Persian Momayyez (٫). */
export function toPersianDigits(input: string | number): string {
  const raw = String(input);
  const withDecimal = raw.replace(/(?<=\d)\.(?=\d)/g, '٫');
  return withDecimal.replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

/** Format a number with Persian thousands separator (٬) and optional fixed decimals using ٫. */
export function formatPersianNumber(value: number, options?: { decimals?: number; isEn?: boolean }): string {
  const safe = Number.isFinite(value) ? value : 0;
  const decimals = options?.decimals;
  if (options?.isEn) {
    return typeof decimals === 'number'
      ? safe.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : Math.round(safe).toLocaleString('en-US');
  }
  const formatted =
    typeof decimals === 'number'
      ? safe.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : Math.round(safe).toLocaleString('en-US');
  return toPersianDigits(formatted.replace(/,/g, '٬'));
}

/** Format a price value (given in Million Toman) cleanly without RTL unit inversion. */
export function formatPersianPrice(
  amountMillion: number,
  unit: 'million' | 'billion' | 'short_m' | (string & {}) = 'million',
  isEn = false,
): string {
  const safe = Number.isFinite(amountMillion) ? amountMillion : 0;
  if (unit === 'billion') {
    const billions = safe / 1000;
    const num = formatPersianNumber(billions, { decimals: billions >= 10 ? 1 : 2, isEn });
    return isEn ? `${num}B Toman` : `${num} میلیارد تومان`;
  }
  const num = formatPersianNumber(Math.round(safe), { isEn });
  if (unit === 'short_m') {
    return isEn ? `${num} M` : `${num} م`;
  }
  if (unit === 'million') {
    return isEn ? `${num} M Toman` : `${num} میلیون تومان`;
  }
  return `${num} ${unit}`;
}

/** Format a neighborhood or livability score unambiguously for RTL (`۸٫۲ از ۱۰`) and LTR (`8.2 / 10`). */
export function formatPersianScore(score: number, max = 10, isEn = false): string {
  const safe = Number.isFinite(score) ? score : 0;
  const hasFraction = Math.abs(safe - Math.round(safe)) > 0.04;
  const scoreText = formatPersianNumber(safe, { decimals: hasFraction ? 1 : 0, isEn });
  const maxText = formatPersianNumber(max, { isEn });
  return isEn ? `${scoreText} / ${maxText}` : `${scoreText} از ${maxText}`;
}

/** Format a signed percentage delta with Unicode BiDi isolation so +/- stays attached to the number in RTL. */
export function formatPersianDeltaPercent(deltaPercent: number, isEn = false): string {
  const safe = Number.isFinite(deltaPercent) ? deltaPercent : 0;
  const sign = safe > 0 ? '+' : safe < 0 ? '−' : '';
  const absVal = Math.abs(safe);
  const hasFraction = Math.abs(absVal - Math.round(absVal)) > 0.04;
  const num = formatPersianNumber(absVal, { decimals: hasFraction ? 1 : 0, isEn });
  const pct = isEn ? '%' : '٪';
  // Wrap in FSI (U+2068) / LRI (U+2066) + PDI (U+2069) so RTL layout never flips the sign to the trailing side
  return `\u2066${sign}${num}${pct}\u2069`;
}

/** Normalize map marker short price label so unit always follows the number cleanly in RTL. */
export function normalizeMapPinPriceText(rawPriceText: string): string {
  const cleaned = String(rawPriceText || '').trim();
  if (!cleaned) return '';
  // Convert compact "۳۲۰م" -> "۳۲۰ م" and keep ASCII digits converted to Persian
  return toPersianDigits(cleaned)
    .replace(/([۰-۹])م(?=\s|$|\|)/g, '$1 م')
    .replace(/([۰-۹])متر/g, '$1 متر');
}
