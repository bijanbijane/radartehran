/**
 * @file src/utils/forms/formInputHelpers.ts
 * @description Pure, framework-free input normalization, live text sanitization,
 * localized number parsing, and feedback classification helpers for all frontend forms.
 */

const PERSIAN_ZERO = 0x06f0;
const ARABIC_ZERO = 0x0660;

export function normalizeDigitsToAscii(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - PERSIAN_ZERO))
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - ARABIC_ZERO));
}

/**
 * Sanitizes live user text input WITHOUT calling `.trim()`, so users can freely
 * type trailing spaces between words while still blocking HTML/script tags and
 * control characters. Use `sanitizeInput()` from `security.ts` on blur/submit.
 */
export function sanitizeLiveText(input: unknown, maxLength = 500): string {
  if (input === null || input === undefined) return '';
  const raw = typeof input === 'string' ? input : String(input);
  const safeMax = Number.isFinite(maxLength) && maxLength > 0 ? Math.min(10_000, Math.floor(maxLength)) : 500;
  return raw
    .slice(0, Math.min(Math.max(safeMax * 4, 512), 16_384))
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/[<>]/g, '')
    .replace(/javascript\s*:|vbscript\s*:|data\s*:\s*text\/html/gi, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, safeMax);
}

/**
 * Normalizes Iranian mobile input across Persian/Arabic digits, separators,
 * and international prefixes (+98 / 0098 / 98).
 */
export function normalizeIranianMobileInput(raw: unknown): string {
  const ascii = normalizeDigitsToAscii(raw).trim();
  const hasPlus = ascii.startsWith('+');
  const digits = ascii.replace(/[^0-9]/g, '');
  if (!digits) return '';

  if (digits.startsWith('0098') && digits.length >= 13) {
    return `0${digits.slice(4)}`.slice(0, 15);
  }
  if ((hasPlus || digits.length === 12) && digits.startsWith('989')) {
    return `0${digits.slice(2)}`.slice(0, 15);
  }
  if (digits.length === 10 && digits.startsWith('9')) {
    return `0${digits}`;
  }
  return digits.slice(0, 15);
}

export function isValidNormalizedIranianMobile(raw: unknown): boolean {
  return /^09\d{9}$/.test(normalizeIranianMobileInput(raw));
}

/**
 * Normalizes Iranian mobile or landline phone numbers (supports +98 / 0098 and Persian/Arabic digits).
 */
export function normalizeIranianPhoneDigits(raw: unknown): string {
  const ascii = normalizeDigitsToAscii(raw).trim();
  const hasPlus = ascii.startsWith('+');
  const digits = ascii.replace(/[^0-9]/g, '');
  if (!digits) return '';

  if (digits.startsWith('0098') && digits.length >= 12) {
    return `0${digits.slice(4)}`.slice(0, 15);
  }
  if (hasPlus && digits.startsWith('98') && digits.length >= 10) {
    return `0${digits.slice(2)}`.slice(0, 15);
  }
  if (digits.length === 12 && digits.startsWith('98')) {
    return `0${digits.slice(2)}`;
  }
  return digits.slice(0, 15);
}

export function isValidIranianContactPhone(raw: unknown): boolean {
  const normalized = normalizeIranianPhoneDigits(raw);
  return /^09\d{9}$/.test(normalized) || /^0[1-8]\d{8,9}$/.test(normalized);
}

/**
 * Parses numbers containing ASCII, Persian, or Arabic digits, Persian decimal
 * separators (`٫` or `/`), thousands separators (`,`, `٬`, `،`), and Unicode minus.
 * Returns `NaN` for empty or malformed strings (never silently returns 0 for `""`).
 */
export function parseLocalizedNumber(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  if (raw === null || raw === undefined) return NaN;

  const cleaned = normalizeDigitsToAscii(raw)
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/[\u066B/]/g, '.')
    .replace(/[,٬،\s_]/g, '')
    .trim();

  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
    return NaN;
  }
  if (!/^[+-]?\d*(\.\d+)?$/.test(cleaned)) {
    return NaN;
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

export interface NumericCommitOptions {
  min: number;
  max: number;
  fallback: number;
  allowDecimal?: boolean;
  nullable?: boolean;
}

export function commitNumericDraft(raw: string, opts: NumericCommitOptions): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    if (opts.nullable) return null;
    return Math.min(opts.max, Math.max(opts.min, opts.fallback));
  }
  const parsed = parseLocalizedNumber(trimmed);
  if (!Number.isFinite(parsed)) {
    return opts.nullable ? null : Math.min(opts.max, Math.max(opts.min, opts.fallback));
  }
  const normalized = opts.allowDecimal ? parsed : Math.round(parsed);
  return Math.min(opts.max, Math.max(opts.min, normalized));
}

export type FeedbackTone = 'error' | 'info' | 'success';

const ERROR_KEYWORDS = [
  'لطفاً',
  'لطفا',
  'خطا',
  'نامعتبر',
  'نیازمند',
  'انجام نشد',
  'برقرار نشد',
  'ثبت نشد',
  'تایید نشد',
  'یافت نشد',
  'پیدا نشد',
  'مجاز نیست',
  'ممنوع',
  'محدودیت',
  'ناقص',
  'وارد کنید',
  'انتخاب کنید',
  'حداقل',
  'حداکثر',
  'امکان‌پذیر نیست',
  'ناموفق',
];

const INFO_KEYWORDS = ['در حال ذخیره', 'در حال ارسال', 'در حال ثبت', 'در حال بررسی', 'لطفاً صبر'];

/**
 * Classifies Persian form status strings into semantic tones so errors are never
 * mistakenly displayed with green success styling.
 */
export function classifyFeedbackTone(message: string | null | undefined): FeedbackTone {
  const text = (message ?? '').trim();
  if (!text) return 'info';
  if (INFO_KEYWORDS.some((kw) => text.includes(kw))) return 'info';
  if (ERROR_KEYWORDS.some((kw) => text.includes(kw))) return 'error';
  return 'success';
}

export function validateAdminLockPassword(isVerifiedAdmin: boolean, rawPass: string): string | null {
  if (!isVerifiedAdmin) {
    return 'خطا: برای تغییر قفل مدیریت ابتدا وارد پنل ادمین شوید.';
  }
  const trimmed = rawPass.trim();
  if (!trimmed) {
    return 'لطفاً رمز عبور جدید مدیریت را وارد کنید.';
  }
  if (trimmed.length < 4) {
    return 'رمز عبور مدیریت باید حداقل ۴ کاراکتر باشد.';
  }
  return null;
}

export function validateTelegramPostText(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return 'لطفاً متن پیام تلگرام را وارد کنید.';
  }
  if (trimmed.length < 3) {
    return 'متن پیام تلگرام باید حداقل ۳ کاراکتر باشد.';
  }
  return null;
}

export function validateCrowdClaimDraft(
  title: string,
  body: string,
): { ok: true } | { ok: false; error: string } {
  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  if (cleanTitle.length < 4) {
    return { ok: false, error: 'لطفاً عنوان گزارش محلی را با حداقل ۴ کاراکتر وارد کنید.' };
  }
  if (cleanBody.length < 8) {
    return { ok: false, error: 'لطفاً جزئیات و توضیح گزارش را با حداقل ۸ کاراکتر وارد کنید.' };
  }
  return { ok: true };
}

export function computeBargainDefaultForDealType(
  hood: { buyPerSqm?: number; rentPerMonth?: number } | undefined,
  dealType: 'خرید' | 'اجاره',
): { proposedPrice: number; min: number; max: number } {
  if (dealType === 'اجاره') {
    const baseDeposit = hood?.rentPerMonth ? Math.max(50, Math.round(hood.rentPerMonth * 100 * 0.9)) : 450;
    return { proposedPrice: baseDeposit, min: 10, max: 200000 };
  }
  const baseBuy = hood?.buyPerSqm ? Math.max(10, Math.round(hood.buyPerSqm * 0.9)) : 120;
  return { proposedPrice: baseBuy, min: 10, max: 10000 };
}

