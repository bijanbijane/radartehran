import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; import { sanitizeUntrustedUserText } from './listingLifecycleAndPlatformSecurity'; export type FrontendBootstrapState = 'initializing' | 'ready' | 'ready_degraded' | 'recoverable_failure' | 'fatal_failure';
export interface BootstrapStepResult { stepId: 'local_preferences' | 'theme_and_locale' | 'router_deep_link' | 'firebase_auth' | 'map_runtime'; critical: boolean; ok: boolean; durationMs: number; errorMessage?: string; }
export function evaluateFrontendBootstrapState(steps: BootstrapStepResult[]): { state: FrontendBootstrapState; degradedFeatures: string[]; blockingErrors: string[]; } { const degradedFeatures: string[] = [];
  const blockingErrors: string[] = []; for (const s of steps) { if (!s.ok) { if (s.critical) blockingErrors.push(s.stepId); else degradedFeatures.push(s.stepId); } }
  if (blockingErrors.length > 0) return { state: 'recoverable_failure', degradedFeatures, blockingErrors }; if (degradedFeatures.length > 0) return { state: 'ready_degraded', degradedFeatures, blockingErrors: [] }; return { state: 'ready', degradedFeatures: [], blockingErrors: [] }; }
export type NetworkOperationCategory = | 'short_api_query' | 'search_autocomplete' | 'market_pulse_sync' | 'media_upload'
  | 'ai_analysis' | 'non_idempotent_mutation' | 'idempotent_mutation'; export interface NetworkOperationPolicy { category: NetworkOperationCategory; timeoutMs: number; maxRetries: number; baseBackoffMs: number; cancelOnRouteChange: boolean; retryAllowedWithoutIdempotencyKey: boolean; }
export const NETWORK_OPERATION_POLICIES: Readonly<Record<NetworkOperationCategory, NetworkOperationPolicy>> = { short_api_query: { category: 'short_api_query', timeoutMs: 8_000, maxRetries: 2, baseBackoffMs: 400, cancelOnRouteChange: true, retryAllowedWithoutIdempotencyKey: true },
  search_autocomplete: { category: 'search_autocomplete', timeoutMs: 5_000, maxRetries: 1, baseBackoffMs: 250, cancelOnRouteChange: true, retryAllowedWithoutIdempotencyKey: true }, market_pulse_sync: { category: 'market_pulse_sync', timeoutMs: 12_000, maxRetries: 2, baseBackoffMs: 800, cancelOnRouteChange: false, retryAllowedWithoutIdempotencyKey: true },
  media_upload: { category: 'media_upload', timeoutMs: 45_000, maxRetries: 1, baseBackoffMs: 1200, cancelOnRouteChange: false, retryAllowedWithoutIdempotencyKey: false }, ai_analysis: { category: 'ai_analysis', timeoutMs: 15_000, maxRetries: 0, baseBackoffMs: 0, cancelOnRouteChange: true, retryAllowedWithoutIdempotencyKey: false },
  non_idempotent_mutation: { category: 'non_idempotent_mutation', timeoutMs: 10_000, maxRetries: 0, baseBackoffMs: 0, cancelOnRouteChange: false, retryAllowedWithoutIdempotencyKey: false }, idempotent_mutation: { category: 'idempotent_mutation', timeoutMs: 10_000, maxRetries: 2, baseBackoffMs: 600, cancelOnRouteChange: false, retryAllowedWithoutIdempotencyKey: false },
}; export type RouteAvailabilityStatus =
  | 'available' | 'not_found_404' | 'gone_deleted_or_expired_410' | 'access_denied_403' | 'malformed_identifier_400'; export function classifyUnavailableEntityRouteState(input: {
  rawEntityId: string | null | undefined; existsInStore: boolean;
  lifecycleState?: 'published' | 'expired' | 'withdrawn' | 'deleted' | 'draft' | 'rejected'; isOwnerOrAdmin?: boolean;
}): {
  status: RouteAvailabilityStatus; httpStatus: 200 | 400 | 403 | 404 | 410;
  robotsMeta: 'index, follow' | 'noindex, nofollow'; titleFa: string; messageFa: string;
} {
  const id = String(input.rawEntityId ?? '').trim();
  if (!id || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
    return { status: 'malformed_identifier_400', httpStatus: 400, robotsMeta: 'noindex, nofollow', titleFa: 'شناسه صفحه معتبر نیست', messageFa: 'فرمت آدرس واردشده صحیح نیست. می‌توانید به صفحه اصلی یا جست‌وجوی محلات بازگردید.' };
  }
  if (!input.existsInStore) {
    return { status: 'not_found_404', httpStatus: 404, robotsMeta: 'noindex, nofollow', titleFa: 'صفحه یا آگهی مورد نظر یافت نشد (۴۰۴)', messageFa: 'این صفحه وجود ندارد یا نشانی آن تغییر کرده است.' };
  }
  if (input.lifecycleState === 'expired' || input.lifecycleState === 'deleted' || input.lifecycleState === 'withdrawn') {
    return { status: 'gone_deleted_or_expired_410', httpStatus: 410, robotsMeta: 'noindex, nofollow', titleFa: 'مهلت نمایش این آگهی به پایان رسیده یا واگذار شده است (۴۱۰)', messageFa: 'این ملک دیگر در فهرست آگهی‌های فعال قرار ندارد.' };
  }
  if ((input.lifecycleState === 'draft' || input.lifecycleState === 'rejected') && !input.isOwnerOrAdmin) {
    return { status: 'access_denied_403', httpStatus: 403, robotsMeta: 'noindex, nofollow', titleFa: 'عدم دسترسی به این صفحه', messageFa: 'این محتوا خصوصی است یا مجوز مشاهده آن را ندارید.' };
  }
  return { status: 'available', httpStatus: 200, robotsMeta: 'index, follow', titleFa: 'فعال', messageFa: '' };
}
export function validateTranslationDictionaryCoverage(
  primaryFaDict: Record<string, string>,
  secondaryEnDict: Record<string, string>,
): { valid: boolean; missingInEn: string[]; missingInFa: string[]; placeholderMismatches: string[] } {
  const extractPlaceholders = (text: string): string[] => {
    const matches = String(text || '').match(/\{[a-zA-Z0-9_]+\}/g);
    return matches ? Array.from(new Set(matches)).sort() : [];
  };
  const missingInEn: string[] = []; const missingInFa: string[] = []; const placeholderMismatches: string[] = [];
  for (const key of Object.keys(primaryFaDict)) {
    if (!(key in secondaryEnDict) || !String(secondaryEnDict[key]).trim()) { missingInEn.push(key); continue; }
    if (extractPlaceholders(primaryFaDict[key]).join(',') !== extractPlaceholders(secondaryEnDict[key]).join(',')) {
      placeholderMismatches.push(key);
    }
  }
  for (const key of Object.keys(secondaryEnDict)) {
    if (!(key in primaryFaDict) || !String(primaryFaDict[key]).trim()) missingInFa.push(key);
  }
  return { valid: missingInEn.length === 0 && missingInFa.length === 0 && placeholderMismatches.length === 0, missingInEn, missingInFa, placeholderMismatches };
}
export function isJalaliLeapYear(jy: number): boolean {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  let jp = breaks[0]; let jump = 0;
  for (let i = 1; i < breaks.length; i++) {
    const jm = breaks[i]; jump = jm - jp; if (jy < jm) break; jp = jm;
  }
  let n = jy - jp;
  if (jump - n < 6) n = n - jump + Math.trunc((jump + 4) / 33) * 33;
  let leap = ((n + 1) % 33 - 1) % 4;
  if (leap === -1) leap = 4;
  return leap === 0;
}
export function validateJalaliCalendarDate(jy: number, jm: number, jd: number): { valid: boolean; reasonFa: string | null } {
  if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd)) return { valid: false, reasonFa: 'سال، ماه و روز شمسی باید عدد صحیح باشند.' };
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1) return { valid: false, reasonFa: 'بازه سال یا ماه شمسی معتبر نیست.' };
  const maxDays = jm <= 6 ? 31 : jm <= 11 ? 30 : isJalaliLeapYear(jy) ? 30 : 29;
  if (jd > maxDays) return { valid: false, reasonFa: `ماه ${jm} در سال ${jy} حداکثر ${maxDays} روز دارد.` };
  return { valid: true, reasonFa: null };
}
const DIGIT_NORM_MAP: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};
export function normalizeDigitsToAscii(raw: string): string {
  return String(raw ?? '').replace(/[۰-۹٠-٩]/g, (c) => DIGIT_NORM_MAP[c] ?? c);
}
export function parseContextAwareNumericInput(
  rawInput: string | number | null | undefined,
  fieldKind: 'monetary_amount' | 'area_sqm' | 'integer_count' | 'string_identifier',
  areaUnit?: AreaUnit,
  intlCurrency?: IntlCurrencyCode,
): { isEmpty: boolean; isValid: boolean; numericValue: number | null; identifierText: string | null; errorFa: string | null; displayAreaUnitLabel?: string; monetaryIntlText?: string } {
  const resolvedUnit = areaUnit ?? getStoredAreaUnit(); const resolvedCurrency = intlCurrency ?? getStoredIntlCurrency();
  if (rawInput === null || rawInput === undefined) return { isEmpty: true, isValid: false, numericValue: null, identifierText: null, errorFa: null };
  const ascii = normalizeDigitsToAscii(String(rawInput)).trim();
  if (ascii === '') return { isEmpty: true, isValid: false, numericValue: null, identifierText: null, errorFa: null };
  if (fieldKind === 'string_identifier') {
    const cleanId = ascii.replace(/[\s-]/g, '');
    const validId = /^[a-zA-Z0-9_]+$/.test(cleanId);
    return { isEmpty: false, isValid: validId, numericValue: null, identifierText: validId ? cleanId : null, errorFa: validId ? null : 'شناسه یا شماره واردشده حاوی کاراکتر غیرمجاز است.' };
  }
  const strippedSeparators = ascii.replace(/[,٬،_ ]+/g, '').replace(/٫/g, '.');
  if (!/^-?\d+(\.\d+)?$/.test(strippedSeparators)) {
    return { isEmpty: false, isValid: false, numericValue: null, identifierText: null, errorFa: 'لطفاً یک مقدار عددی معتبر وارد کنید.' };
  }
  const num = Number(strippedSeparators);
  if (!Number.isFinite(num) || num < 0) {
    return { isEmpty: false, isValid: false, numericValue: null, identifierText: null, errorFa: 'مقدار عددی نمی‌تواند منفی یا نامتناهی باشد.' };
  }
  if (fieldKind === 'integer_count' && !Number.isInteger(num)) {
    return { isEmpty: false, isValid: false, numericValue: null, identifierText: null, errorFa: 'این فیلد باید یک عدد صحیح باشد.' };
  }
  return { isEmpty: false, isValid: true, numericValue: num, identifierText: null, errorFa: null, displayAreaUnitLabel: formatAreaUnitLabel(resolvedUnit), monetaryIntlText: formatMillionTomanAsIntlCurrency(num || 1000, resolvedCurrency) };
}
export type SupportedPropertyCategory = 'residential_apartment' | 'villa_house' | 'commercial_shop' | 'office_unit' | 'land_plot';
export interface PropertyCategorySchemaSpec {
  category: SupportedPropertyCategory; labelFa: string; requiredFields: readonly string[]; inapplicableFields: readonly string[];
}
export const PROPERTY_CATEGORY_SCHEMAS: Readonly<Record<SupportedPropertyCategory, PropertyCategorySchemaSpec>> = {
  residential_apartment: { category: 'residential_apartment', labelFa: 'آپارتمان مسکونی', requiredFields: ['areaSqm', 'roomsCount', 'floorNumber', 'buildingAgeYears'], inapplicableFields: ['landAreaSqm', 'shopFrontageMeters'] },
  villa_house: { category: 'villa_house', labelFa: 'ویلایی و خانه حیاط‌دار', requiredFields: ['areaSqm', 'landAreaSqm', 'roomsCount', 'buildingAgeYears'], inapplicableFields: ['floorNumber', 'shopFrontageMeters'] },
  commercial_shop: { category: 'commercial_shop', labelFa: 'مغازه و واحد تجاری', requiredFields: ['areaSqm', 'buildingAgeYears'], inapplicableFields: ['roomsCount'] },
  office_unit: { category: 'office_unit', labelFa: 'واحد اداری و دفتر کار', requiredFields: ['areaSqm', 'roomsCount', 'floorNumber', 'buildingAgeYears'], inapplicableFields: ['landAreaSqm'] },
  land_plot: { category: 'land_plot', labelFa: 'زمین و کلنگی', requiredFields: ['landAreaSqm'], inapplicableFields: ['roomsCount', 'floorNumber', 'hasElevator', 'hasParking'] },
};
/**
 * Human-in-the-Loop Approval Gate for AI-Generated Listing Content (Prompt 1011)
 * & Strict Structured AI JSON Parser (Prompt 1012).
 */
export function computeAiContentApprovalHash(text: string): string {
  const norm = String(text || '').trim().replace(/\s+/g, ' ');
  let hash = 5381;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash * 33) ^ norm.charCodeAt(i);
  }
  return `ai_hash_${(hash >>> 0).toString(16)}`;
}
export function verifyHumanApprovalForAiContent(input: {
  isAiGenerated: boolean;
  currentText: string;
  approvedContentHash: string | null | undefined;
  humanExplicitlyApproved: boolean;
}): { allowedToPublish: boolean; reasonFa: string | null } {
  if (!input.isAiGenerated) {
    return { allowedToPublish: true, reasonFa: null };
  }
  if (!input.humanExplicitlyApproved || !input.approvedContentHash) {
    return {
      allowedToPublish: false,
      reasonFa: 'متن تولیدشده توسط هوش مصنوعی پیش از انتشار نیازمند بررسی و تأیید صریح منتشرکننده است.',
    };
  }
  const currentHash = computeAiContentApprovalHash(input.currentText);
  if (currentHash !== input.approvedContentHash) {
    return {
      allowedToPublish: false,
      reasonFa: 'متن آگهی پس از تأیید قبلی تغییر کرده است؛ لطفاً نسخه نهایی را مجدداً تأیید کنید.',
    };
  }
  return { allowedToPublish: true, reasonFa: null };
}
export function parseAndValidateStructuredAiJson<T extends Record<string, unknown>>(
  rawModelText: string,
  requiredFields: readonly string[],
): {
  ok: boolean; failureType: 'none' | 'empty_output' | 'malformed_json' | 'missing_required_fields'; parsed: T | null;
} {
  const trimmed = String(rawModelText || '').trim();
  if (!trimmed) return { ok: false, failureType: 'empty_output', parsed: null };
  if (trimmed.length > 65536) return { ok: false, failureType: 'malformed_json', parsed: null };
  const strippedFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const obj = JSON.parse(strippedFence, (key, value) =>
      key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value,
    );
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { ok: false, failureType: 'malformed_json', parsed: null };
    }
    for (const reqKey of requiredFields) {
      if (!(reqKey in obj) || obj[reqKey] === undefined || obj[reqKey] === null) {
        return { ok: false, failureType: 'missing_required_fields', parsed: null };
      }
    }
    return { ok: true, failureType: 'none', parsed: obj as T };
  } catch {
    return { ok: false, failureType: 'malformed_json', parsed: null };
  }
}
/**
 * Accessible Textual & Tabular Alternative Generator for Data Visualizations (Prompt 1014).
 */
export function buildAccessibleChartSummaryAndTable(input: {
  chartTitleFa: string; unitFa: string; provenanceBadgeFa: string;
  points: Array<{ labelFa: string; primaryValue: number | null; secondaryValue?: number | null }>;
}): {
  summaryTextFa: string; rows: Array<{ periodFa: string; primaryFormattedFa: string; secondaryFormattedFa: string }>;
} {
  const validPts = input.points.filter(
    (p): p is { labelFa: string; primaryValue: number; secondaryValue?: number | null } =>
      p.primaryValue !== null && Number.isFinite(p.primaryValue),
  );
  if (validPts.length === 0) {
    return {
      summaryTextFa: `${input.chartTitleFa}: داده عددی معتبری برای نمایش در جدول دسترس‌پذیری ثبت نشده است.`,
      rows: [],
    };
  }
  const first = validPts[0];
  const last = validPts[validPts.length - 1];
  const summaryTextFa = `${sanitizeUntrustedUserText(input.chartTitleFa, 120)} (${input.provenanceBadgeFa}) — شروع دوره در ${first.labelFa} با مقدار ${first.primaryValue.toLocaleString('fa-IR')} ${input.unitFa} و آخرین مقدار در ${last.labelFa} برابر با ${last.primaryValue.toLocaleString('fa-IR')} ${input.unitFa}.`;
  const rows = input.points.map((p) => ({
    periodFa: p.labelFa,
    primaryFormattedFa:
      p.primaryValue !== null && Number.isFinite(p.primaryValue)
        ? `${p.primaryValue.toLocaleString('fa-IR')} ${input.unitFa}`
        : 'ثبت نشده',
    secondaryFormattedFa:
      p.secondaryValue !== null && p.secondaryValue !== undefined && Number.isFinite(p.secondaryValue)
        ? `${p.secondaryValue.toLocaleString('fa-IR')} ${input.unitFa}`
        : '—',
  }));
  return { summaryTextFa, rows };
}
/**
 * Moderation Queue Atomic Claim & Lease Coordinator (Prompt 1017).
 */
export interface ModerationTaskClaim {
  taskId: string; claimedByAdminUid: string; claimedAtMs: number; leaseExpiresAtMs: number; taskVersion: number;
}
export class ModerationTaskClaimCoordinator {
  private readonly claims = new Map<string, ModerationTaskClaim>();
  private readonly leaseDurationMs: number;
  constructor(leaseDurationMs = 5 * 60 * 1000) {
    this.leaseDurationMs = Math.max(1000, Math.min(leaseDurationMs, 3_600_000));
  }
  public tryClaimTask(
    taskId: string, adminUid: string, currentTaskVersion: number, nowMs: number = Date.now(),
  ): { claimed: boolean; claim: ModerationTaskClaim | null; conflictReasonFa: string | null } {
    const existing = this.claims.get(taskId);
    if (existing && existing.leaseExpiresAtMs > nowMs && existing.claimedByAdminUid !== adminUid) {
      return { claimed: false, claim: existing, conflictReasonFa: 'این پرونده در حال حاضر توسط مدیر دیگری در حال بررسی است.' };
    }
    if (!this.claims.has(taskId) && this.claims.size >= 2000) {
      for (const [k, v] of this.claims.entries()) { if (v.leaseExpiresAtMs <= nowMs) this.claims.delete(k); }
      if (this.claims.size >= 2000) { const oldest = this.claims.keys().next().value; if (oldest !== undefined) this.claims.delete(oldest); }
    }
    const nextClaim: ModerationTaskClaim = {
      taskId, claimedByAdminUid: adminUid, claimedAtMs: nowMs, leaseExpiresAtMs: nowMs + this.leaseDurationMs, taskVersion: currentTaskVersion,
    };
    this.claims.set(taskId, nextClaim);
    return { claimed: true, claim: nextClaim, conflictReasonFa: null };
  }
  public verifyCanCommitDecision(
    taskId: string, adminUid: string, expectedTaskVersion: number, nowMs: number = Date.now(),
  ): { allowed: boolean; reasonFa: string | null } {
    const existing = this.claims.get(taskId);
    if (!existing || existing.claimedByAdminUid !== adminUid) {
      return { allowed: false, reasonFa: 'مالکیت بررسی این پرونده متعلق به نشست فعلی شما نیست.' };
    }
    if (existing.leaseExpiresAtMs <= nowMs) {
      return { allowed: false, reasonFa: 'مهلت قفل بررسی پرونده منقضی شده است؛ لطفاً مجدداً پرونده را باز کنید.' };
    }
    if (existing.taskVersion !== expectedTaskVersion) {
      return { allowed: false, reasonFa: 'وضعیت این پرونده تغییر کرده است (نسخه قدیمی).' };
    }
    this.claims.delete(taskId);
    return { allowed: true, reasonFa: null };
  }
}