import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type NumericParseStatus = 'empty' | 'intermediate' | 'valid' | 'invalid'; export interface ParsedMultiScriptNumber { status: NumericParseStatus; raw: string; normalizedString: string; value: number | null; errorFa?: string; } export interface ParseMultiScriptOptions { allowNegative?: boolean; allowDecimal?: boolean; }
const PERSIAN_AND_ARABIC_DIGIT_MAP: Readonly<Record<string, string>> = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', }; const WESTERN_TO_PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']; export function toPersianDigitsString(value: string | number): string { return String(value).replace(/\d/g, (d) => WESTERN_TO_PERSIAN_DIGITS[Number(d)] || d); } export function normalizeMultiScriptDigits(raw: string): string { if (typeof raw !== 'string') return ''; return raw
    .replace(/[۰-۹٠-٩]/g, (ch) => PERSIAN_AND_ARABIC_DIGIT_MAP[ch] ?? ch)
    .replace(/\u2212/g, '-')
    .replace(/[\u200c\u200e\u200f\u00a0\s]+/g, '')
    .replace(/٫/g, '.')
    .replace(/[٬,]/g, ','); } export function parseMultiScriptNumericInput( rawInput: string | number | null | undefined, options?: ParseMultiScriptOptions, ): ParsedMultiScriptNumber { const allowNegative = options?.allowNegative ?? false; const allowDecimal = options?.allowDecimal ?? true; if (rawInput === null || rawInput === undefined) { return { status: 'empty', raw: '', normalizedString: '', value: null }; } if (typeof rawInput === 'number') { if (!Number.isFinite(rawInput) || Math.abs(rawInput) > Number.MAX_SAFE_INTEGER) {
      return { status: 'invalid', raw: String(rawInput), normalizedString: '', value: null, errorFa: 'مقدار عددی معتبر نیست.' }; }
    const normVal = Object.is(rawInput, -0) ? 0 : rawInput;
    if (!allowNegative && normVal < 0) return { status: 'invalid', raw: String(rawInput), normalizedString: String(normVal), value: null, errorFa: 'مقدار منفی برای این فیلد مجاز نیست.' };
    if (!allowDecimal && !Number.isInteger(normVal)) return { status: 'invalid', raw: String(rawInput), normalizedString: String(normVal), value: null, errorFa: 'این فیلد فقط عدد صحیح می‌پذیرد.' };
    return { status: 'valid', raw: String(rawInput), normalizedString: String(normVal), value: normVal }; }
  const raw = String(rawInput); if (raw.trim().length === 0) return { status: 'empty', raw, normalizedString: '', value: null }; if (raw.length > 64) return { status: 'invalid', raw: raw.slice(0, 64), normalizedString: '', value: null, errorFa: 'طول رشته عددی بیش از حد مجاز است.' }; const normalizedWithCommas = normalizeMultiScriptDigits(raw); if ((normalizedWithCommas.match(/\./g) || []).length > 1) { return { status: 'invalid', raw, normalizedString: normalizedWithCommas, value: null, errorFa: 'فرمت اعشار نامعتبر است (بیش از یک ممیز وارد شده است).' }; }
  if (normalizedWithCommas.includes(',')) { const [intPartWithCommas] = normalizedWithCommas.replace(/^[+-]/, '').split('.');
    if (/(^,|,$|,,)/.test(intPartWithCommas) || normalizedWithCommas.split('.')[1]?.includes(',')) { return { status: 'invalid', raw, normalizedString: normalizedWithCommas, value: null, errorFa: 'جداکننده هزارگان در محل نادرست قرار گرفته است.' }; } }
  const clean = normalizedWithCommas.replace(/,/g, ''); if (
    (allowNegative && clean === '-') || (allowDecimal && (clean === '.' || clean === '-.' || /^\d+\.$/.test(clean) || /^-\d+\.$/.test(clean)))
  ) { const partialNum = clean.endsWith('.') && clean.length > 1 ? Number(clean.slice(0, -1)) : null; return { status: 'intermediate', raw, normalizedString: clean, value: partialNum !== null && Number.isFinite(partialNum) ? partialNum : null }; }
  if (!allowNegative && clean.startsWith('-')) { return { status: 'invalid', raw, normalizedString: clean, value: null, errorFa: 'مقدار منفی برای این فیلد مجاز نیست.' }; }
  if (!allowDecimal && clean.includes('.')) { return { status: 'invalid', raw, normalizedString: clean, value: null, errorFa: 'این فیلد فقط عدد صحیح می‌پذیرد.' }; }
  if (!/^[+-]?\d+(\.\d+)?$/.test(clean)) { return { status: 'invalid', raw, normalizedString: clean, value: null, errorFa: 'لطفاً فقط ارقام معتبر (فارسی، عربی یا انگلیسی) وارد کنید.' }; }
  const parsed = Number(clean); if (!Number.isFinite(parsed) || Math.abs(parsed) > Number.MAX_SAFE_INTEGER) { return { status: 'invalid', raw, normalizedString: clean, value: null, errorFa: 'عدد واردشده خارج از محدوده قابل محاسبه است.' }; }
  return { status: 'valid', raw, normalizedString: clean, value: Object.is(parsed, -0) ? 0 : parsed }; }
export type CanonicalUnitCode = 'RIAL' | 'TOMAN' | 'THOUSAND_TOMAN' | 'MILLION_TOMAN' | 'BILLION_TOMAN' | 'MILLION_TOMAN_PER_SQM' | 'MONTHLY_MILLION_TOMAN' | 'ANNUAL_MILLION_TOMAN' | 'FULL_RAHN_MILLION_TOMAN' | 'SQM' | 'PERCENT' | 'ANNUAL_PERCENT' | 'YEAR' | 'MONTH' | 'HOUR' | 'COUNT' | 'KM' | 'PPM' | 'DB' | 'SCORE_10' | 'SCORE_100' | 'USD' | 'GOLD_GRAM' | 'GOLD_COIN';
export interface CanonicalUnitMetadata {
  code: CanonicalUnitCode; labelFa: string; shortLabelFa: string;
  dimension: 'currency' | 'rate_per_area' | 'periodic_currency' | 'area' | 'percentage' | 'duration' | 'count' | 'distance' | 'environmental' | 'score' | 'asset';
  tomanMultiplier?: number; timeBasis?: 'monthly' | 'annual' | 'one_time';
}
export const CANONICAL_UNIT_METADATA: Readonly<Record<CanonicalUnitCode, CanonicalUnitMetadata>> = {
  RIAL: { code: 'RIAL', labelFa: 'ریال', shortLabelFa: 'ریال', dimension: 'currency', tomanMultiplier: 0.1, timeBasis: 'one_time' },
  TOMAN: { code: 'TOMAN', labelFa: 'تومان', shortLabelFa: 'تومان', dimension: 'currency', tomanMultiplier: 1, timeBasis: 'one_time' },
  THOUSAND_TOMAN: { code: 'THOUSAND_TOMAN', labelFa: 'هزار تومان', shortLabelFa: 'هزار تومان', dimension: 'currency', tomanMultiplier: 1_000, timeBasis: 'one_time' },
  MILLION_TOMAN: { code: 'MILLION_TOMAN', labelFa: 'میلیون تومان', shortLabelFa: 'میلیون تومان', dimension: 'currency', tomanMultiplier: 1_000_000, timeBasis: 'one_time' },
  BILLION_TOMAN: { code: 'BILLION_TOMAN', labelFa: 'میلیارد تومان', shortLabelFa: 'میلیارد تومان', dimension: 'currency', tomanMultiplier: 1_000_000_000, timeBasis: 'one_time' },
  MILLION_TOMAN_PER_SQM: { code: 'MILLION_TOMAN_PER_SQM', labelFa: 'میلیون تومان بر مترمربع', shortLabelFa: 'میلیون/مترمربع', dimension: 'rate_per_area', timeBasis: 'one_time' },
  MONTHLY_MILLION_TOMAN: { code: 'MONTHLY_MILLION_TOMAN', labelFa: 'میلیون تومان در ماه', shortLabelFa: 'میلیون/ماه', dimension: 'periodic_currency', timeBasis: 'monthly' },
  ANNUAL_MILLION_TOMAN: { code: 'ANNUAL_MILLION_TOMAN', labelFa: 'میلیون تومان در سال', shortLabelFa: 'میلیون/سال', dimension: 'periodic_currency', timeBasis: 'annual' },
  FULL_RAHN_MILLION_TOMAN: { code: 'FULL_RAHN_MILLION_TOMAN', labelFa: 'میلیون تومان رهن کامل', shortLabelFa: 'میلیون رهن کامل', dimension: 'currency', tomanMultiplier: 1_000_000, timeBasis: 'one_time' },
  SQM: { code: 'SQM', labelFa: 'مترمربع', shortLabelFa: 'متر', dimension: 'area' },
  PERCENT: { code: 'PERCENT', labelFa: 'درصد', shortLabelFa: '٪', dimension: 'percentage' },
  ANNUAL_PERCENT: { code: 'ANNUAL_PERCENT', labelFa: 'درصد در سال', shortLabelFa: '٪ سالانه', dimension: 'percentage', timeBasis: 'annual' },
  YEAR: { code: 'YEAR', labelFa: 'سال', shortLabelFa: 'سال', dimension: 'duration' },
  MONTH: { code: 'MONTH', labelFa: 'ماه', shortLabelFa: 'ماه', dimension: 'duration' },
  HOUR: { code: 'HOUR', labelFa: 'ساعت', shortLabelFa: 'ساعت', dimension: 'duration' },
  COUNT: { code: 'COUNT', labelFa: 'عدد / واحد', shortLabelFa: 'عدد', dimension: 'count' },
  KM: { code: 'KM', labelFa: 'کیلومتر', shortLabelFa: 'کیلومتر', dimension: 'distance' },
  PPM: { code: 'PPM', labelFa: 'میلی‌گرم بر لیتر (PPM)', shortLabelFa: 'PPM', dimension: 'environmental' },
  DB: { code: 'DB', labelFa: 'دسی‌بل (dB)', shortLabelFa: 'دسی‌بل', dimension: 'environmental' },
  SCORE_10: { code: 'SCORE_10', labelFa: 'امتیاز از ۱۰', shortLabelFa: '/ ۱۰', dimension: 'score' },
  SCORE_100: { code: 'SCORE_100', labelFa: 'امتیاز از ۱۰۰', shortLabelFa: '/ ۱۰۰', dimension: 'score' },
  USD: { code: 'USD', labelFa: 'دلار آمریکا', shortLabelFa: 'دلار', dimension: 'asset' },
  GOLD_GRAM: { code: 'GOLD_GRAM', labelFa: 'گرم طلای ۱۸ عیار', shortLabelFa: 'گرم طلا', dimension: 'asset' },
  GOLD_COIN: { code: 'GOLD_COIN', labelFa: 'سکه تمام بهار آزادی', shortLabelFa: 'سکه', dimension: 'asset' },
};
export function formatCanonicalUnitValueFa(
  value: number | null | undefined,
  unit: CanonicalUnitCode,
  options?: { decimals?: number; includeUnitLabel?: boolean; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode },
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'نامشخص';
  const meta = CANONICAL_UNIT_METADATA[unit];
  const decimals = options?.decimals ?? (Number.isInteger(value) ? 0 : 2);
  const rounded = decimals > 0 ? Number(value.toFixed(decimals)) : Math.round(value);
  const parts = String(rounded).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  const formattedNumber = toPersianDigitsString(parts.join('٫'));
  if (options?.includeUnitLabel === false) return formattedNumber;
  const unitLabel = unit === 'SQM' && options?.areaUnit ? formatAreaUnitLabel(options.areaUnit) : meta.labelFa;
  const intlSuffix = unit === 'MILLION_TOMAN' && options?.intlCurrency && options.intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(rounded, options.intlCurrency)})` : '';
  return `${formattedNumber} ${unitLabel}${intlSuffix}`;
}
export function convertCanonicalCurrencyExplicit(
  value: number,
  fromUnit: 'RIAL' | 'TOMAN' | 'THOUSAND_TOMAN' | 'MILLION_TOMAN' | 'BILLION_TOMAN',
  toUnit: 'RIAL' | 'TOMAN' | 'THOUSAND_TOMAN' | 'MILLION_TOMAN' | 'BILLION_TOMAN',
): number {
  if (!Number.isFinite(value)) throw new Error('INVALID_CURRENCY_VALUE');
  if (fromUnit === toUnit) return Object.is(value, -0) ? 0 : value;
  const fromMult = CANONICAL_UNIT_METADATA[fromUnit].tomanMultiplier;
  const toMult = CANONICAL_UNIT_METADATA[toUnit].tomanMultiplier;
  if (!fromMult || !toMult) throw new Error(`UNSUPPORTED_CURRENCY_CONVERSION:${fromUnit}->${toUnit}`);
  const result = (value * fromMult) / toMult;
  return Object.is(result, -0) ? 0 : Number(result.toFixed(6));
}
export type CalculatorValidationOutcome = 'valid' | 'missing_required' | 'invalid_format' | 'out_of_range' | 'inconsistent_inputs' | 'unsupported_combination';
export interface CalculatorFieldRule {
  fieldKey: string;
  labelFa: string;
  unit: CanonicalUnitCode;
  required?: boolean;
  min?: number;
  max?: number;
  integerOnly?: boolean;
}
export interface CalculatorFieldValidationResult {
  fieldKey: string;
  outcome: CalculatorValidationOutcome;
  valid: boolean;
  numericValue: number | null;
  messageFa?: string;
}
export function validateCalculatorFieldDomain(
  rawInput: string | number | null | undefined,
  rule: CalculatorFieldRule,
): CalculatorFieldValidationResult {
  const parsed = parseMultiScriptNumericInput(rawInput, {
    allowNegative: (rule.min ?? 0) < 0,
    allowDecimal: !rule.integerOnly,
  });
  if (parsed.status === 'empty') {
    if (rule.required !== false) {
      return {
        fieldKey: rule.fieldKey,
        outcome: 'missing_required',
        valid: false,
        numericValue: null,
        messageFa: `وارد کردن «${rule.labelFa}» الزامی است.`,
      };
    }
    return {
      fieldKey: rule.fieldKey,
      outcome: 'valid',
      valid: true,
      numericValue: null,
    };
  }
  if (parsed.status === 'invalid' || parsed.status === 'intermediate' || parsed.value === null) {
    return {
      fieldKey: rule.fieldKey,
      outcome: 'invalid_format',
      valid: false,
      numericValue: null,
      messageFa: parsed.errorFa || `مقدار واردشده برای «${rule.labelFa}» معتبر نیست.`,
    };
  }
  const val = parsed.value;
  const unitLabel = CANONICAL_UNIT_METADATA[rule.unit].labelFa;
  if (rule.integerOnly && !Number.isInteger(val)) {
    return {
      fieldKey: rule.fieldKey,
      outcome: 'invalid_format',
      valid: false,
      numericValue: val,
      messageFa: `«${rule.labelFa}» باید یک عدد صحیح باشد.`,
    };
  }
  if (rule.min !== undefined && val < rule.min) {
    return {
      fieldKey: rule.fieldKey,
      outcome: 'out_of_range',
      valid: false,
      numericValue: val,
      messageFa: `حداقل مقدار مجاز برای «${rule.labelFa}» برابر با ${toPersianDigitsString(rule.min)} ${unitLabel} است.`,
    };
  }
  if (rule.max !== undefined && val > rule.max) {
    return {
      fieldKey: rule.fieldKey,
      outcome: 'out_of_range',
      valid: false,
      numericValue: val,
      messageFa: `حداکثر مقدار مجاز برای «${rule.labelFa}» برابر با ${toPersianDigitsString(rule.max)} ${unitLabel} است.`,
    };
  }
  return {
    fieldKey: rule.fieldKey,
    outcome: 'valid',
    valid: true,
    numericValue: val,
  };
}
export type CalculationExecutionStatus =
  | 'not_calculated'
  | 'calculating'
  | 'current_result'
  | 'outdated_result'
  | 'failed_calculation';
export interface CalculationResultEnvelope<TInput, TOutput> {
  calculatorId: string;
  inputSnapshot: TInput;
  inputSignature: string;
  sequenceId: number;
  computedAtIso: string;
  output: TOutput;
}
export function computeInputSnapshotSignature(inputs: unknown, depth = 0): string {
  if (depth > 8) return '[max_depth]';
  if (inputs === null || inputs === undefined) return 'null';
  if (typeof inputs !== 'object') return `${typeof inputs}:${String(inputs).slice(0, 200)}`;
  if (Array.isArray(inputs)) {
    return `[${inputs.slice(0, 64).map((item) => computeInputSnapshotSignature(item, depth + 1)).join(',')}]`;
  }
  const obj = inputs as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).filter((k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype').sort().slice(0, 64);
  return `{${sortedKeys.map((k) => `${k}:${computeInputSnapshotSignature(obj[k], depth + 1)}`).join('|')}}`;
}
export function createCalculationResultEnvelope<TInput, TOutput>(
  calculatorId: string,
  inputSnapshot: TInput,
  output: TOutput,
  sequenceId: number = 1,
): CalculationResultEnvelope<TInput, TOutput> {
  const safeId = String(calculatorId || 'calc').replace(/[^A-Za-z0-9_:-]/g, '').slice(0, 80) || 'calc';
  return {
    calculatorId: safeId,
    inputSnapshot: structuredClone ? structuredClone(inputSnapshot) : JSON.parse(JSON.stringify(inputSnapshot)),
    inputSignature: computeInputSnapshotSignature(inputSnapshot),
    sequenceId,
    computedAtIso: new Date().toISOString(),
    output,
  };
}
export function evaluateCalculationResultFreshness<TInput, TOutput>(
  envelope: CalculationResultEnvelope<TInput, TOutput> | null | undefined,
  currentInputs: TInput,
  options?: { isCalculating?: boolean; hasError?: boolean; latestSequenceId?: number },
): {
  status: CalculationExecutionStatus;
  isCurrent: boolean;
  labelFa: string;
} {
  if (options?.hasError) {
    return {
      status: 'failed_calculation',
      isCurrent: false,
      labelFa: 'خطا در انجام محاسبه — لطفاً ورودی‌ها را بررسی کنید',
    };
  }
  if (options?.isCalculating) {
    return {
      status: 'calculating',
      isCurrent: false,
      labelFa: 'در حال محاسبه نتیجه جدید...',
    };
  }
  if (!envelope) {
    return {
      status: 'not_calculated',
      isCurrent: false,
      labelFa: 'هنوز محاسبه‌ای انجام نشده است',
    };
  }
  if (options?.latestSequenceId !== undefined && envelope.sequenceId < options.latestSequenceId) {
    return {
      status: 'outdated_result',
      isCurrent: false,
      labelFa: 'ورودی‌ها تغییر کرده‌اند — نتیجه قبلی منقضی شده است',
    };
  } const currentSig = computeInputSnapshotSignature(currentInputs); if (currentSig !== envelope.inputSignature) { return { status: 'outdated_result', isCurrent: false, labelFa: 'ورودی‌ها تغییر کرده‌اند — نتیجه نمایش‌داده‌شده مربوط به مقادیر قبلی است', }; } return { status: 'current_result', isCurrent: true, labelFa: 'نتیجه منطبق با آخرین ورودی‌های فعلی است', }; }