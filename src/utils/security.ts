import type { CityId, FeatureFlags } from '../types/models'; import { isValidCityId } from '../types/models'; import { recordDiagnosticEvent, getDiagnosticSnapshots, createExecutionTimer, subscribeDiagnostics, clearDiagnosticEvents, getDiagnosticPerformanceMetrics, type DiagnosticEventEntry, type PerformanceMetricSummary } from './diagnostics'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export type { FeatureFlags }; export { recordDiagnosticEvent, getDiagnosticSnapshots, createExecutionTimer, subscribeDiagnostics, clearDiagnosticEvents, getDiagnosticPerformanceMetrics, type DiagnosticEventEntry, type PerformanceMetricSummary }; const PERSIAN_DIGITS: readonly string[] = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']; const ARABIC_DIGITS: readonly string[] = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
export function normalizeDigitsToEnglish(input: unknown): string { if (input === null || input === undefined) return ''; try { let result = typeof input === 'string' ? input : String(input); for (let i = 0; i < 10; i++) { result = result.replace(new RegExp(PERSIAN_DIGITS[i], 'g'), String(i)).replace(new RegExp(ARABIC_DIGITS[i], 'g'), String(i)); }
    return result; } catch { return ''; } } export function formatDigitsToPersian(input: number | string | null | undefined): string { if (input === null || input === undefined) return '۰'; try { return String(input).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit); } catch { return '۰'; }
} export function sanitizeInput(input: unknown, maxLength = 500): string { if (input === null || input === undefined) return ''; try { const raw = typeof input === 'string' ? input : String(input); const safeMax = Number.isFinite(maxLength) && maxLength > 0 ? Math.min(10_000, Math.floor(maxLength)) : 500; const bounded = raw.slice(0, Math.min(Math.max(safeMax * 4, 512), 16_384)); return bounded
      .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
      .replace(/<\/?\s*(script|iframe|object|embed|svg|style|link|meta|base|form|applet)[^>]*>/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/vbscript\s*:/gi, '')
      .replace(/data\s*:\s*text\/(html|javascript)/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/[<>]/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
      .slice(0, safeMax); } catch { recordDiagnosticEvent('Security', 'sanitizeInput fallback triggered', 'fallback'); return ''; } }
export function sanitizePayload<T>(payload: T, depth = 0): T { try { if (depth > 6) throw new Error('PAYLOAD_MAX_DEPTH_EXCEEDED'); if (payload === null || payload === undefined) return payload; if (typeof payload === 'string') return sanitizeInput(payload, 2000) as unknown as T; if (typeof payload === 'number') { if (!Number.isFinite(payload)) throw new Error('PAYLOAD_NON_FINITE_NUMBER'); return payload; }
    if (typeof payload === 'boolean') return payload; if (Array.isArray(payload)) { if (payload.length > 500) throw new Error('PAYLOAD_ARRAY_TOO_LARGE'); const result = payload.map((item) => {
        if (item === undefined) throw new Error('PAYLOAD_UNDEFINED_ARRAY_ITEM'); return sanitizePayload(item, depth + 1); }); return result as unknown as T; }
    if (typeof payload === 'object') { const prototype = Object.getPrototypeOf(payload); if (prototype !== Object.prototype && prototype !== null) { throw new Error('PAYLOAD_NON_PLAIN_OBJECT'); }
      const cleaned: Record<string, unknown> = {}; for (const [key, value] of Object.entries(payload as Record<string, unknown>)) { if (value === undefined) continue; if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue; const safeKey = sanitizeInput(key, 100); if (!safeKey) continue;
        cleaned[safeKey] = sanitizePayload(value, depth + 1); }
      return cleaned as T; }
    throw new Error('PAYLOAD_UNSUPPORTED_VALUE_TYPE'); } catch (error) { recordDiagnosticEvent('Security', 'sanitizePayload rejected a payload', 'blocked'); throw new Error('PAYLOAD_SANITIZATION_FAILED', { cause: error });
  } }
export function prepareFirestorePayload<T extends Record<string, unknown>>(data: T): T {
  try {
    const sanitized = sanitizePayload(data);
    if (sanitized === null || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
      throw new Error('INVALID_SANITIZED_PAYLOAD');
    }
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(sanitized)) {
      if (value !== undefined) cleaned[key] = value;
    }
    return cleaned as T;
  } catch {
    recordDiagnosticEvent('Firestore', 'Payload rejected before write', 'blocked');
    throw new Error('FIRESTORE_PAYLOAD_SANITIZATION_FAILED');
  }
}

const REPAIRABLE_FIRESTORE_COLLECTIONS = new Set(['neighborhoodOverrides', 'bargains', 'votes', 'sponsorRequests', 'buyerAlerts']);

export function isFirestoreDocumentOperationAllowed(collectionName: string, docId: string): boolean {
  if (typeof docId !== 'string' || !docId.trim() || docId.includes('/')) return false;
  if (docId.startsWith('sim_')) return true;
  return REPAIRABLE_FIRESTORE_COLLECTIONS.has(collectionName);
}

export function isValidIranianMobile(phone: unknown): boolean {
  if (typeof phone !== 'string' && typeof phone !== 'number') return false;
  const normalized = normalizeDigitsToEnglish(phone).replace(/[\s\-()]/g, '');
  return /^09[0-9]{9}$/.test(normalized);
}
export const isValidIranMobilePhone = isValidIranianMobile;
export function validatePersianText(input: unknown, maxLength = 200): string {
  return sanitizeInput(input, maxLength);
}
export function isValidAgencyPhone(phone: unknown): boolean {
  if (typeof phone !== 'string' && typeof phone !== 'number') return false;
  const digitsOnly = normalizeDigitsToEnglish(phone).replace(/[^0-9]/g, '');
  return digitsOnly.length >= 8 && digitsOnly.length <= 15 && digitsOnly.startsWith('0');
}
export function cleanIranianMobile(phone: unknown): string {
  return normalizeDigitsToEnglish(sanitizeInput(phone, 24)).replace(/[^0-9]/g, '').slice(0, 15);
}
export function isValidTelegramBotToken(token: unknown): boolean {
  if (typeof token !== 'string') return false;
  return /^\d{6,16}:[A-Za-z0-9_-]{20,80}$/.test(token.trim());
}
export function isValidTelegramChannelId(channelId: unknown): boolean {
  if (typeof channelId !== 'string') return false;
  return /^(@[A-Za-z0-9_]{4,64}|-?\d{6,20})$/.test(channelId.trim());
}
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  try {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max || !Number.isFinite(fallback)) {
      return fallback;
    }
    const parsed = typeof value === 'number'
      ? value
      : Number(normalizeDigitsToEnglish(String(value ?? '')).replace(/[,٬،\u066C\u060C]/g, '').replace(/[٫\u066B]/g, '.').trim());
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  } catch {
    return fallback;
  }
}
export function validateNeighborhoodId(id: unknown, fallbackOrAllowed: number | readonly number[] = 1): number {
  if (Array.isArray(fallbackOrAllowed)) {
    const parsed = Math.round(Number(normalizeDigitsToEnglish(String(id ?? '')).trim()));
    return Number.isInteger(parsed) && fallbackOrAllowed.includes(parsed) ? parsed : 0;
  }
  const safeFallback = Number.isInteger(fallbackOrAllowed) ? Math.min(999, Math.max(1, fallbackOrAllowed as number)) : 1;
  return Math.round(clampNumber(id, 1, 999, safeFallback));
}
export function validateBudgetAmount(amount: unknown, fallback = 6500): number {
  const safeFallback = Number.isFinite(fallback) ? Math.min(250_000, Math.max(50, fallback)) : 6500;
  return Math.round(clampNumber(amount, 50, 250_000, safeFallback));
}
export function validateSqmAmount(sqm: unknown, fallback = 80): number {
  const safeFallback = Number.isFinite(fallback) ? Math.min(1000, Math.max(25, fallback)) : 80;
  return Math.round(clampNumber(sqm, 25, 1000, safeFallback));
}
export function validateScoreRange(score: unknown, fallback = 7.5): number {
  const safeFallback = Number.isFinite(fallback) ? Math.min(10, Math.max(1, fallback)) : 7.5;
  const value = clampNumber(score, 1, 10, safeFallback);
  return Math.round(value * 10) / 10;
}
export function validateCityParam(raw: unknown, fallback: CityId = 'tehran'): CityId {
  if (typeof raw === 'string') {
    const cleaned = raw.trim().toLowerCase();
    if (isValidCityId(cleaned)) return cleaned;
  }
  return fallback;
}
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    const parsed = JSON.parse(raw, (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
      return value;
    });
    return (parsed ?? fallback) as T;
  } catch {
    recordDiagnosticEvent('Storage', 'safeJsonParse recovered from malformed JSON', 'fallback');
    return fallback;
  }
}
export function safeLocalStorageGet<T>(
  key: string,
  fallback: T,
  validator?: (value: unknown) => value is T,
): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = safeJsonParse<unknown>(raw, fallback);
    if (validator && !validator(parsed)) {
      recordDiagnosticEvent('Storage', `Validator rejected corrupted key: ${key}`, 'fallback');
      return fallback;
    }
    return (parsed as T) ?? fallback;
  } catch {
    recordDiagnosticEvent('Storage', `safeLocalStorageGet failed for key: ${key}`, 'fallback');
    return fallback;
  }
}
/** Safely write a value to LocalStorage. */
export function safeLocalStorageSet(key: string, value: unknown): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (serialized === undefined) return false;
    window.localStorage.setItem(key, serialized);
    return true;
  } catch {
    recordDiagnosticEvent('Storage', `safeLocalStorageSet quota/access error for key: ${key}`, 'fallback');
    return false;
  }
}
/** Safely remove a LocalStorage entry. */
export function safeLocalStorageRemove(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
/** Default feature flags. These flags are UI/application defaults only. They must not be used as authorization rules. */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableCommissionCalc: true, enableMultiCity: true, enableSponsorBilling: false, enableAiContractCheck: true,
  enableTelegramFeed: true, enableAiValuation: true, enableFakeAdDetector: true, enableMortgageSimulator: true,
  enableTenantRights: true, enableMunicipalityCalc: true, enablePropertySwap: true, enableVisitChecklist: true,
  enableSchoolRadar: true, enableRealtorStudio: true, enableRenovationCalc: true, enableInvestmentSim: true,
  enableSafetyRadar: true, enableCommercialRadar: true, enableSuburbRadar: true, enablePreSaleRadar: true,
  enableMovingPlanner: true, enableFractionalInvest: true, enableTrafficZoneCalc: true, enableSeoContentGen: true,
};
/** Load feature flags from LocalStorage, merging them with defaults. */
export function loadValidatedFeatureFlags(storageKey = 'tehran_radar_feature_flags_v1'): FeatureFlags {
  try {
    const raw = safeLocalStorageGet<Partial<FeatureFlags> | null>(storageKey, null);
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_FEATURE_FLAGS };
    const merged: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS };
    for (const key of Object.keys(DEFAULT_FEATURE_FLAGS) as (keyof FeatureFlags)[]) {
      if (typeof raw[key] === 'boolean') merged[key] = raw[key];
    }
    return merged;
  } catch {
    return { ...DEFAULT_FEATURE_FLAGS };
  }
}
/** Escape special HTML characters before interpolation into an HTML string, attribute, Leaflet tooltip or divIcon. */
export function escapeHtmlAttr(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export interface DivarUrlOptions {
  targetSqm?: number;
  buyTotalBudget?: number;
  deposit?: number;
  monthlyRent?: number;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}
/** Build a city-aware external Divar search URL. */
export function buildExternalDivarUrl(city: CityId | string, mode: 'rent' | 'buy', hoodName: string, opts?: DivarUrlOptions): string {
  const validCity: CityId = isValidCityId(city) ? city : 'tehran';
  const dealCategory = mode === 'rent' ? 'rent-apartment' : 'buy-apartment';
  const cleanName = sanitizeInput(hoodName, 80).trim();
  const base = `https://divar.ir/s/${validCity}/${dealCategory}/${encodeURIComponent(cleanName)}`;
  if (!opts) return base;
  const params = new URLSearchParams();
  if (Number.isFinite(opts.targetSqm) && (opts.targetSqm ?? 0) >= 25) {
    const target = opts.targetSqm as number;
    params.set('size', `${Math.max(25, target - 15)}-${target + 20}`);
  }
  if (mode === 'buy' && Number.isFinite(opts.buyTotalBudget) && (opts.buyTotalBudget ?? 0) >= 500) {
    const budget = opts.buyTotalBudget as number;
    params.set('price', `${Math.max(0, budget - 500) * 1_000_000}-${(budget + 500) * 1_000_000}`);
  } else if (mode === 'rent' && Number.isFinite(opts.deposit) && (opts.deposit ?? 0) > 0) {
    params.set('credit', `0-${((opts.deposit as number) + 100) * 1_000_000}`);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
export function buildSponsorWhatsAppUrl(
  phone: string,
  hoodName: string,
  mode: 'rent' | 'buy',
  budgetSummary: string,
  areaUnit: AreaUnit = 'sqm',
  intlCurrency: IntlCurrencyCode = 'IRT',
  referenceValuationMillionToman = 0,
): string {
  const cleanHood = sanitizeInput(hoodName, 60);
  const cleanBudget = sanitizeInput(budgetSummary, 80);
  const dealLabel = mode === 'rent' ? 'رهن و اجاره' : 'خرید آپارتمان';
  const intlNote = intlCurrency !== 'IRT' && referenceValuationMillionToman > 0 ? ` [${formatAreaUnitLabel(areaUnit)} | ${formatMillionTomanAsIntlCurrency(referenceValuationMillionToman, intlCurrency, 'en')}]` : '';
  const message = `سلام، از طریق سامانه «رادارتهران» جهت استعلام فایلهای ${dealLabel} در محله ${cleanHood} (${cleanBudget})${intlNote} پیام میدهم.`;
  const digits = normalizeDigitsToEnglish(phone).replace(/[^0-9]/g, '');
  return /^0\d{9,10}$/.test(digits)
    ? `https://wa.me/98${digits.slice(1)}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
}
export function escapeCsvCell(value: unknown): string {
  const source = value === null || value === undefined ? '' : String(value);
  const cleaned = source.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  const needsFormulaGuard = /^[\s\u0000-\u001F]*[=+\-@\t\r|]/.test(cleaned) && !/^-?\d+(\.\d+)?$/.test(cleaned.trim());
  const safe = needsFormulaGuard ? `'${cleaned}` : cleaned;
  return `"${safe.replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;
}
export function normalizePersianSearchText(input: unknown): string {
  if (input === null || input === undefined) return '';
  return normalizeDigitsToEnglish(String(input))
    .toLowerCase()
    .replace(/[\u064A\u0649\u0626]/g, 'ی')
    .replace(/\u0643/g, 'ک')
    .replace(/\u0629/g, 'ه')
    .replace(/\u0624/g, 'و')
    .replace(/[\u0622\u0623\u0625]/g, 'ا')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[\u200C-\u200F\u202A-\u202E]/g, ' ')
    .replace(/[،,;؛.\-_()/\\«»"']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function matchesPersianSearch(candidate: unknown, query: unknown): boolean {
  const normQuery = normalizePersianSearchText(query);
  if (!normQuery) return true;
  const normCandidate = normalizePersianSearchText(candidate);
  if (!normCandidate) return false;
  if (normCandidate.includes(normQuery)) return true;
  const tokens = normQuery.split(' ').filter(Boolean);
  if (tokens.length > 1 && tokens.every((tk) => normCandidate.includes(tk))) return true;
  const compactQuery = normQuery.replace(/\s+/g, '');
  const compactCandidate = normCandidate.replace(/\s+/g, '');
  return compactQuery.length > 0 && compactCandidate.includes(compactQuery);
}
export function normalizePriceToMillionToman(
  rawAmount: unknown,
  unit: 'million_toman' | 'toman' | 'rial' = 'million_toman',
): number | null {
  const cleaned = normalizeDigitsToEnglish(String(rawAmount ?? '')).replace(/[,٬،\u066C\u060C]/g, '').replace(/[٫\u066B]/g, '.').trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0) return null;
  const inMillionToman = unit === 'rial' ? num / 10_000_000 : unit === 'toman' ? num / 1_000_000 : num;
  if (!Number.isFinite(inMillionToman) || inMillionToman <= 0 || inMillionToman > 1_000_000) return null;
  return Math.round(inMillionToman * 100) / 100;
}
const PROMPT_INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above|system)\s+(instructions|prompts|rules)/i,
  /disregard\s+(all\s+)?(previous|prior|above|system)/i,
  /system\s*prompt|you\s+are\s+now\s+|act\s+as\s+(?!a\s+tenant|a\s+buyer|a\s+seller)/i,
  /<\s*\/?\s*(system|instruction|prompt|untrusted_contract_clause)\s*>/i, /نادیده\s*بگیر|دستورات\s+قبلی\s+را\s+فراموش\s+کن|پرامپت\s*سیستم/i, ]; export function detectPromptInjection(input: unknown): { blocked: boolean; reason: string | null } { const text = (typeof input === 'string' ? input : String(input ?? '')).slice(0, 8192).replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '').replace(/[\u064A\u0649]/g, 'ی').replace(/\u0643/g, 'ک'); for (const pattern of PROMPT_INJECTION_PATTERNS) { if (pattern.test(text)) return { blocked: true, reason: 'PROMPT_INJECTION_PATTERN_DETECTED' }; } return { blocked: false, reason: null }; } export * from './domainSecurityValidators';