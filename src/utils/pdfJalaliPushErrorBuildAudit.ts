import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path'; import { escapeHtmlAttr, formatDigitsToPersian } from './security'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface PrintableValuationReportInput { reportId: string; requesterUid: string | null; reportOwnerUid: string; neighborhoodNameFa: string; sqm: number; authoritativeBuyPerSqmMillion: number; authoritativeTotalMillion: number; renderedBuyPerSqmMillion: number; renderedTotalMillion: number; valuationMethod: 'CALCULATED_HEDONIC' | 'ESTIMATED_MARKET_BASELINE'; generatedAtIsoUtc: string; embeddedResourceUrls: string[]; requestedFilename: string; }
export interface PrintableValuationReportAudit { authorized: boolean; numericalParityVerified: boolean; ssrfSafe: boolean; blockedSsrfUrls: string[]; safeContentDispositionFilename: string; rtlVazirmatnConfigured: boolean; sanitizedPrintableHtml: string; issues: string[]; displayAreaUnitLabel: string; authoritativeTotalIntlText: string; }
function isSsrfOrLocalResourceUrl(rawUrl: string): boolean { const trimmed = rawUrl.trim(); const lower = trimmed.toLowerCase(); if (lower.startsWith('//') || lower.startsWith('/\\') || trimmed.includes('..') || lower.startsWith('file:') || lower.startsWith('ftp:') || lower.startsWith('gopher:') || lower.startsWith('data:text/html') || lower.startsWith('javascript:')) { return true; }
  try { const parsed = new URL(trimmed); const host = parsed.hostname.toLowerCase().replace(/\.+$/, ''); if (
      !host || host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host === '[::1]' || host === '169.254.169.254' || host.startsWith('10.') || host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || /^\[?(?:fc|fd|fe80):/i.test(host) || host.endsWith('.internal') || host.endsWith('.local')
    ) { return true; }
    return parsed.protocol !== 'https:'; } catch { return !/^\/[A-Za-z0-9_\-/?.]+$/.test(trimmed); }
}
export function buildAndAuditPrintableValuationReport(
  input: PrintableValuationReportInput,
  options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode }
): PrintableValuationReportAudit {
  const issues: string[] = [];
  const authorized = Boolean(input.requesterUid && input.requesterUid === input.reportOwnerUid); if (!authorized) issues.push('UNAUTHORIZED_REPORT_ACCESS');
  const numericalParityVerified =
    Number.isFinite(input.sqm) && input.sqm > 0 &&
    Number.isFinite(input.authoritativeBuyPerSqmMillion) && input.authoritativeBuyPerSqmMillion > 0 &&
    Number.isFinite(input.authoritativeTotalMillion) && input.authoritativeTotalMillion > 0 &&
    Math.abs(input.authoritativeBuyPerSqmMillion - input.renderedBuyPerSqmMillion) < 0.001 &&
    Math.abs(input.authoritativeTotalMillion - input.renderedTotalMillion) < 0.001 &&
    Math.abs(input.sqm * input.authoritativeBuyPerSqmMillion - input.authoritativeTotalMillion) < 1;
  if (!numericalParityVerified) issues.push('REPORT_NUMERICAL_MISMATCH_WITH_AUTHORITATIVE_CALCULATION');
  const blockedSsrfUrls = input.embeddedResourceUrls.filter((u) => isSsrfOrLocalResourceUrl(u));
  if (blockedSsrfUrls.length > 0) issues.push('SSRF_OR_LOCAL_FILE_REFERENCE_BLOCKED');
  const cleanBaseName =
    input.requestedFilename.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48) ||
    `tehran-radar-report-${input.reportId.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const safeContentDispositionFilename = `${cleanBaseName}.pdf`;
  const safeHood = escapeHtmlAttr(input.neighborhoodNameFa);
  const methodLabelFa = input.valuationMethod === 'CALCULATED_HEDONIC' ? 'مدل هدونیک (محاسبه‌شده)' : 'برآورد پایه بازار (تخمینی)';
  const displayAreaUnitLabel = formatAreaUnitLabel(options?.areaUnit ?? 'sqm');
  const authoritativeTotalIntlText = formatMillionTomanAsIntlCurrency(input.authoritativeTotalMillion, options?.intlCurrency ?? 'IRT');
  const sanitizedPrintableHtml =
    `<article dir="rtl" lang="fa" style="font-family:'Vazirmatn',sans-serif;">` +
    `<h1>گزارش کارشناسی ارزش ملک — محله ${safeHood}</h1>` +
    `<p>روش ارزیابی: ${methodLabelFa} | متراژ: ${formatDigitsToPersian(input.sqm)} متر مربع</p>` +
    `<p>قیمت هر متر مربع: ${formatDigitsToPersian(input.authoritativeBuyPerSqmMillion)} میلیون تومان</p>` +
    `<p>ارزش کل برآوردی: ${formatDigitsToPersian(input.authoritativeTotalMillion)} میلیون تومان</p>` +
    `<footer>زمان محاسبه (UTC): ${escapeHtmlAttr(input.generatedAtIsoUtc)}</footer></article>`;
  return {
    authorized, numericalParityVerified, ssrfSafe: blockedSsrfUrls.length === 0, blockedSsrfUrls,
    safeContentDispositionFilename, rtlVazirmatnConfigured: true, sanitizedPrintableHtml, issues,
    displayAreaUnitLabel, authoritativeTotalIntlText,
  };
}
export interface JalaliDateParts {
  jy: number;
  jm: number;
  jd: number;
  isLeapJalaliYear: boolean;
  formattedFa: string;
  formattedIsoLike: string;
}
const JALALI_BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const divInt = (a: number, b: number): number => Math.trunc(a / b);
function jalaliCalendarMeta(jy: number): { leap: number; gy: number; march: number } {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = JALALI_BREAKS[0];
  let jump = 0;
  for (let i = 1; i < JALALI_BREAKS.length; i += 1) {
    const jm = JALALI_BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += divInt(jump, 33) * 8 + divInt(jump % 33, 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += divInt(n, 33) * 8 + divInt((n % 33) + 3, 4);
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
  const leapG = divInt(gy, 4) - divInt((divInt(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + divInt(jump + 4, 33) * 33;
  let leap = (((n + 1) % 33) - 1) % 4;
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}
export function isJalaliLeapYear(jy: number): boolean {
  return jalaliCalendarMeta(jy).leap === 0;
}
function g2d(gy: number, gm: number, gd: number): number {
  let d = divInt((gy + divInt(gm - 8, 6) + 100100) * 1461, 4) + divInt(153 * ((gm + 9) % 12) + 2, 5) + gd - 34840408;
  d = d - divInt(divInt(gy + 100100 + divInt(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}
function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + divInt(divInt(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = divInt(j % 1461, 4) * 5 + 308;
  const gd = divInt(i % 153, 5) + 1;
  const gm = (divInt(i, 153) % 12) + 1;
  const gy = divInt(j, 1461) - 100100 + divInt(8 - gm, 6);
  return { gy, gm, gd };
}
export function convertGregorianIsoToJalali(isoOrDateOnly: string): JalaliDateParts {
  const trimmed = isoOrDateOnly.trim();
  let gy: number, gm: number, gd: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    [gy, gm, gd] = trimmed.split('-').map(Number);
    const check = d2g(g2d(gy, gm, gd));
    if (gm < 1 || gm > 12 || gd < 1 || gd > 31 || check.gy !== gy || check.gm !== gm || check.gd !== gd) {
      throw new Error(`INVALID_ISO_TIMESTAMP:${isoOrDateOnly}`);
    }
  } else {
    const parsedMs = Date.parse(trimmed);
    if (!Number.isFinite(parsedMs)) throw new Error(`INVALID_ISO_TIMESTAMP:${isoOrDateOnly}`);
    const tehranWallClock = new Date(parsedMs + 210 * 60 * 1000);
    gy = tehranWallClock.getUTCFullYear();
    gm = tehranWallClock.getUTCMonth() + 1;
    gd = tehranWallClock.getUTCDate();
  }
  const jdn = g2d(gy, gm, gd);
  const { gy: gyFromJdn } = d2g(jdn);
  let jy = gyFromJdn - 621;
  const r = jalaliCalendarMeta(jy);
  let k = jdn - g2d(gyFromJdn, 3, r.march);
  let jm: number, jd: number;
  if (k >= 0) {
    if (k <= 185) { jm = 1 + divInt(k, 31); jd = (k % 31) + 1; }
    else { k -= 186; jm = 7 + divInt(k, 30); jd = (k % 30) + 1; }
  } else {
    jy -= 1; k += 179; if (r.leap === 1) k += 1;
    jm = 7 + divInt(k, 30); jd = (k % 30) + 1;
  }
  const formattedIsoLike = `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;
  return { jy, jm, jd, isLeapJalaliYear: isJalaliLeapYear(jy), formattedFa: formatDigitsToPersian(formattedIsoLike.replace(/-/g, '/')), formattedIsoLike };
}
export function convertJalaliToGregorianDateOnly(jy: number, jm: number, jd: number): string {
  if (!Number.isInteger(jy) || jm < 1 || jm > 12 || jd < 1) throw new Error('INVALID_JALALI_DATE_COMPONENTS');
  const maxDay = jm <= 6 ? 31 : jm <= 11 ? 30 : isJalaliLeapYear(jy) ? 30 : 29;
  if (jd > maxDay) throw new Error(`JALALI_DAY_OUT_OF_RANGE:month=${jm},day=${jd},max=${maxDay}`);
  const r = jalaliCalendarMeta(jy);
  const jdn = g2d(r.gy, 3, r.march) + (jm - 1) * 31 - divInt(jm, 7) * (jm - 7) + jd - 1;
  const { gy, gm, gd } = d2g(jdn);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}
export function resolveAuthoritativeServerTimestamp(input: {
  serverNowMs: number;
  clientProvidedCreatedAtIso?: string;
}): { canonicalUtcIso: string; clientClockIgnored: boolean; tehranJalaliDate: string } {
  const canonicalUtcIso = new Date(input.serverNowMs).toISOString();
  const jalali = convertGregorianIsoToJalali(canonicalUtcIso);
  return { canonicalUtcIso, clientClockIgnored: Boolean(input.clientProvidedCreatedAtIso), tehranJalaliDate: jalali.formattedIsoLike };
}
export interface WebPushSubscriptionInput {
  authenticatedUid: string;
  endpoint: string;
  p256dhKey: string;
  authSecret: string;
}
const ALLOWED_PUSH_SERVICE_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);
export class WebPushSubscriptionLifecycleGuard {
  private readonly subscriptionsByEndpoint = new Map<string, { ownerUid: string; p256dhKey: string; authSecret: string; active: boolean }>();
  registerSubscription(input: WebPushSubscriptionInput): { registered: boolean; reason: string } {
    if (!input.authenticatedUid) return { registered: false, reason: 'UNAUTHENTICATED_SUBSCRIPTION_REJECTED' };
    let parsed: URL;
    try { parsed = new URL(input.endpoint); } catch { return { registered: false, reason: 'MALFORMED_PUSH_ENDPOINT' }; }
    if (parsed.protocol !== 'https:' || !ALLOWED_PUSH_SERVICE_HOSTS.has(parsed.hostname)) {
      return { registered: false, reason: `UNTRUSTED_PUSH_PROVIDER_HOST:${parsed.hostname}` };
    }
    const existing = this.subscriptionsByEndpoint.get(input.endpoint);
    if (existing && existing.active && existing.ownerUid !== input.authenticatedUid) {
      return { registered: false, reason: 'CROSS_USER_ENDPOINT_HIJACK_BLOCKED' };
    }
    if (!this.subscriptionsByEndpoint.has(input.endpoint) && this.subscriptionsByEndpoint.size >= 5000) {
      const oldest = this.subscriptionsByEndpoint.keys().next().value;
      if (oldest !== undefined) this.subscriptionsByEndpoint.delete(oldest);
    }
    this.subscriptionsByEndpoint.set(input.endpoint, { ownerUid: input.authenticatedUid, p256dhKey: input.p256dhKey, authSecret: input.authSecret, active: true });
    return { registered: true, reason: 'REGISTERED' };
  }
  revokeOnLogoutOrProviderGone(endpoint: string, requesterUidOrSystem: string): boolean {
    const existing = this.subscriptionsByEndpoint.get(endpoint);
    if (!existing) return false;
    if (requesterUidOrSystem !== 'SYSTEM_410_GONE' && existing.ownerUid !== requesterUidOrSystem) return false;
    this.subscriptionsByEndpoint.delete(endpoint);
    return true;
  }
  isEndpointActiveForUser(endpoint: string, uid: string): boolean {
    const existing = this.subscriptionsByEndpoint.get(endpoint);
    return Boolean(existing && existing.active && existing.ownerUid === uid);
  }
  buildSafePushNotificationPayload(input: {
    neighborhoodNameFa: string;
    rawSensitiveDetail?: string;
    clickTargetUrl: string;
  }): { titleFa: string; bodyFa: string; safeClickPath: string; sensitiveDataRedactedFromLockScreen: boolean } {
    const trimmed = input.clickTargetUrl.trim();
    const safeClickPath = /^\/(?!\/|\\)[A-Za-z0-9_\-/?.=&]*$/.test(trimmed) && !trimmed.includes('..') ? trimmed : '/';
    return {
      titleFa: `رادار تهران — به‌روزرسانی محله ${escapeHtmlAttr(input.neighborhoodNameFa)}`,
      bodyFa: 'گزارش جدید تغییر قیمت آماده مشاهده است. برای مشاهده جزئیات وارد برنامه شوید.',
      safeClickPath,
      sensitiveDataRedactedFromLockScreen: Boolean(input.rawSensitiveDetail),
    };
  }
}
export type StandardizedErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN_ACCESS'
  | 'RESOURCE_NOT_FOUND'
  | 'CONFLICT_OR_DUPLICATE'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNPROCESSABLE_DOMAIN_RULE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'UPSTREAM_DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL_SERVER_ERROR';
export interface StandardizedApiErrorEnvelope {
  ok: false;
  httpStatus: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 503;
  errorCode: StandardizedErrorCode;
  messageFa: string;
  correlationId: string;
  retryable: boolean;
  idempotencyKeyRequiredForRetry: boolean;
  fieldErrors?: Record<string, string>;
  sanitizedDiagnostics: boolean;
}
const ERROR_CODE_META: Record<StandardizedErrorCode, { status: StandardizedApiErrorEnvelope['httpStatus']; retryable: boolean; defaultMessageFa: string }> = {
  VALIDATION_ERROR: { status: 400, retryable: false, defaultMessageFa: 'اطلاعات ورودی نامعتبر است.' },
  AUTHENTICATION_REQUIRED: { status: 401, retryable: false, defaultMessageFa: 'برای ادامه، لطفاً وارد حساب کاربری خود شوید.' },
  FORBIDDEN_ACCESS: { status: 403, retryable: false, defaultMessageFa: 'شما مجوز دسترسی به این عملیات را ندارید.' },
  RESOURCE_NOT_FOUND: { status: 404, retryable: false, defaultMessageFa: 'مورد درخواستی یافت نشد.' },
  CONFLICT_OR_DUPLICATE: { status: 409, retryable: false, defaultMessageFa: 'تداخل در نسخه داده یا درخواست تکراری شناسایی شد.' },
  PAYLOAD_TOO_LARGE: { status: 413, retryable: false, defaultMessageFa: 'حجم فایل یا داده ارسالی بیش از حد مجاز است.' },
  UNPROCESSABLE_DOMAIN_RULE: { status: 422, retryable: false, defaultMessageFa: 'مقادیر ارسالی با قوانین محاسباتی همخوانی ندارد.' },
  RATE_LIMIT_EXCEEDED: { status: 429, retryable: true, defaultMessageFa: 'تعداد درخواست‌ها بیش از حد مجاز است. کمی صبر کنید.' },
  UPSTREAM_DEPENDENCY_UNAVAILABLE: { status: 503, retryable: true, defaultMessageFa: 'سرویس بیرونی موقتاً در دسترس نیست.' },
  INTERNAL_SERVER_ERROR: { status: 500, retryable: false, defaultMessageFa: 'خطای داخلی سرور رخ داده است.' },
};
export function buildStandardizedApiErrorEnvelope(input: {
  errorCode: StandardizedErrorCode;
  httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  correlationId: string;
  rawInternalErrorMessage?: string;
  fieldErrors?: Record<string, string>;
}): StandardizedApiErrorEnvelope {
  const meta = ERROR_CODE_META[input.errorCode];
  return {
    ok: false, httpStatus: meta.status, errorCode: input.errorCode, messageFa: meta.defaultMessageFa,
    correlationId: input.correlationId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'corr-default',
    retryable: meta.retryable, idempotencyKeyRequiredForRetry: meta.retryable && input.httpMethod !== 'GET',
    fieldErrors: input.fieldErrors,
    sanitizedDiagnostics: Boolean(input.rawInternalErrorMessage && /\/app\/applet|at\s+\w+|node_modules|secret|token/i.test(input.rawInternalErrorMessage)),
  };
}
export interface BuildArtifactAuditReport {
  distDirectoryExists: boolean; scannedFileCount: number; exposedServerSecrets: string[]; exposedSourceMapFiles: string[];
  hashedJsBundlesCount: number; artifactManifestDigests: Array<{ relativePath: string; sha256: string; sizeBytes: number }>; releaseIntegrityVerified: boolean;
}
const FORBIDDEN_BUNDLE_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'PRIVATE_KEY_PEM', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { label: 'SERVER_ENV_SESSION_SECRET', regex: /SESSION_SECRET\s*[:=]\s*["'][A-Za-z0-9_-]{12,}/ },
  { label: 'TELEGRAM_BOT_SECRET_VALUE', regex: /\b\d{8,12}:AA[A-Za-z0-9_-]{30,}\b/ },
];
export function auditProductionBuildArtifacts(distDirPath = path.resolve(process.cwd(), 'dist')): BuildArtifactAuditReport {
  if (!fs.existsSync(distDirPath)) {
    return { distDirectoryExists: false, scannedFileCount: 0, exposedServerSecrets: [], exposedSourceMapFiles: [], hashedJsBundlesCount: 0, artifactManifestDigests: [], releaseIntegrityVerified: true };
  }
  const exposedServerSecrets: string[] = []; const exposedSourceMapFiles: string[] = [];
  const artifactManifestDigests: Array<{ relativePath: string; sha256: string; sizeBytes: number }> = [];
  let hashedJsBundlesCount = 0; let scannedFileCount = 0;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(dir, entry.name); const relPath = path.relative(distDirPath, fullPath);
      if (entry.isDirectory()) { walk(fullPath); continue; }
      if (!entry.isFile()) continue;
      scannedFileCount += 1;
      if (entry.name.endsWith('.map')) exposedSourceMapFiles.push(relPath);
      if (/^index-[A-Za-z0-9_-]+\.js$/.test(entry.name)) hashedJsBundlesCount += 1;
      const buf = fs.readFileSync(fullPath);
      artifactManifestDigests.push({ relativePath: relPath, sha256: crypto.createHash('sha256').update(buf).digest('hex'), sizeBytes: buf.byteLength });
      if (/\.(js|css|html|json)$/i.test(entry.name)) {
        const text = buf.toString('utf8');
        for (const pat of FORBIDDEN_BUNDLE_PATTERNS) { if (pat.regex.test(text)) exposedServerSecrets.push(`${relPath}:${pat.label}`); }
      }
    }
  };
  walk(distDirPath);
  return {
    distDirectoryExists: true, scannedFileCount, exposedServerSecrets, exposedSourceMapFiles, hashedJsBundlesCount,
    artifactManifestDigests, releaseIntegrityVerified: exposedServerSecrets.length === 0 && exposedSourceMapFiles.length === 0,
  }; }