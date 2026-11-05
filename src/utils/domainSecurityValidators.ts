import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './areaUnit.ts'; export const BOOTSTRAP_ADMIN_EMAILS = [ 'masirsalamatt@gmail.com', 'radio837isf@gmail.com', 'bijanbijane.1@gmail.com', 'eskandar8dll@gmail.com', ] as const; export const PRIMARY_BOOTSTRAP_ADMIN_EMAIL = 'radio837isf@gmail.com'; const BOOTSTRAP_ADMIN_SET: ReadonlySet<string> = new Set(BOOTSTRAP_ADMIN_EMAILS.map((e) => e.toLowerCase())); export function sanitizeInput(input: unknown, maxLength = 500): string { if (input === null || input === undefined) return ''; const raw = typeof input === 'string' ? input : String(input); const safeMax = Number.isFinite(maxLength) && maxLength > 0 ? Math.min(10_000, Math.floor(maxLength)) : 500; return raw
    .slice(0, Math.min(Math.max(safeMax * 4, 512), 16_384))
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\/?\s*(script|iframe|object|embed|svg|style|link|meta|base|form|applet)[^>]*>/gi, '')
    .replace(/(?:javascript|vbscript)\s*:/gi, '')
    .replace(/data\s*:\s*text\/(html|javascript)/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, safeMax); } export function normalizeCanonicalEmailIdentity(email: unknown): string | null { if (typeof email !== 'string') return null; const trimmed = email.trim(); if (trimmed.length < 5 || trimmed.length > 160 || !/^[\x21-\x7E]+$/.test(trimmed)) return null; const lower = trimmed.toLowerCase(); const parts = lower.split('@'); if (parts.length !== 2) return null; const [local, domain] = parts; if (!local || !domain || domain.startsWith('.') || domain.endsWith('.') || !domain.includes('.')) return null; if (local.includes('..') || domain.includes('..')) return null; return lower; }
export function isBootstrapAdminEmail(email: unknown): boolean { const normalized = normalizeCanonicalEmailIdentity(email); return Boolean(normalized && BOOTSTRAP_ADMIN_SET.has(normalized)); } export function validateSafeReturnPath(rawReturnUrl: unknown, fallback = '/'): string { if (typeof rawReturnUrl !== 'string') return fallback; const trimmed = rawReturnUrl.trim(); if (trimmed.length === 0 || trimmed.length > 512 || /[\u0000-\u001F\u007F\\]/.test(trimmed)) return fallback; try { const decoded = decodeURIComponent(trimmed); if (/[\u0000-\u001F\u007F\\]/.test(decoded) || decoded.startsWith('//') || decoded.includes('\\') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) return fallback;
  } catch { return fallback; }
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback; try {
    const base = new URL('https://radar.internal');
    const resolved = new URL(trimmed, base); if (resolved.origin !== base.origin) return fallback; return resolved.pathname + resolved.search + resolved.hash; } catch { return fallback; }
} export function buildCanonicalNotificationUrl(canonicalAppUrl: string | null | undefined, relativePath: string): string | null { if (!canonicalAppUrl || typeof canonicalAppUrl !== 'string') return null; try { const parsedOrigin = new URL(canonicalAppUrl.trim()); if (parsedOrigin.protocol !== 'https:' && parsedOrigin.protocol !== 'http:') return null; if (parsedOrigin.username || parsedOrigin.password) return null; const safeRel = validateSafeReturnPath(relativePath, '/'); const finalUrl = new URL(safeRel, parsedOrigin.origin); for (const key of Array.from(finalUrl.searchParams.keys())) { if (/token|secret|key|auth|password/i.test(key)) finalUrl.searchParams.delete(key); }
    return finalUrl.toString(); } catch { return null; } }
export function validateGeoJsonPolygonRing( ring: unknown, maxVertices = 250, ): { valid: boolean; reason?: string } {
  if (!Array.isArray(ring) || ring.length < 4) return { valid: false, reason: 'RING_TOO_SHORT' }; if (ring.length > maxVertices) return { valid: false, reason: 'POLYGON_COMPLEXITY_EXCEEDED' }; for (const pt of ring) { if (!Array.isArray(pt) || pt.length < 2) return { valid: false, reason: 'INVALID_COORDINATE_TUPLE' };
    const [a, b] = pt; if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) { return { valid: false, reason: 'NON_FINITE_COORDINATE' }; }
    const isLatLng = a >= 24 && a <= 41 && b >= 43 && b <= 64; const isLngLat = b >= 24 && b <= 41 && a >= 43 && a <= 64; if (!isLatLng && !isLngLat) return { valid: false, reason: 'COORDINATE_OUT_OF_BOUNDS' }; }
  return { valid: true }; }
export function isValidFirestoreDocId(id: unknown, maxLength = 128): boolean { if (typeof id !== 'string') return false; const trimmed = id.trim(); if (trimmed.length === 0 || trimmed.length > maxLength || trimmed !== id) return false;
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('..')) return false; if (/[\\/\u0000-\u001F\u007F]/.test(trimmed)) return false; return /^[A-Za-z0-9_.:@-]+$/.test(trimmed);
}
export function parseSafeNullPrototypeNumberMap(raw: string | null | undefined): Record<string, number> { const safeMap: Record<string, number> = Object.create(null);
  if (typeof raw !== 'string' || raw.trim().length === 0 || raw.length > 100_000) return safeMap; try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return safeMap;
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length > 500) return safeMap;
    for (const [key, val] of entries) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      if (key.length === 0 || key.length > 128) continue;
      if (typeof val === 'number' && Number.isFinite(val) && val >= 0) safeMap[key] = val;
    }
  } catch {
  }
  return safeMap;
}
export const parseSafeNumberRecord = parseSafeNullPrototypeNumberMap;
export interface SanitizedSponsorData {
  name: string; phone: string; specialty: string; experienceYears: number;
  verified?: boolean; planMonths?: 1 | 3; monthlyTariffMillion?: number;
  totalPayableMillion?: number; trackingCode?: string; expiresAtIso?: string;
}
export function sanitizeSponsorRecord(
  raw: unknown,
  fallback: Partial<SanitizedSponsorData> = {},
): SanitizedSponsorData {
  const base: SanitizedSponsorData = {
    name: fallback.name ?? '',
    phone: fallback.phone ?? '',
    specialty: fallback.specialty ?? 'مسکونی و سرمایه‌گذاری',
    experienceYears: fallback.experienceYears ?? 5,
    verified: fallback.verified !== undefined ? Boolean(fallback.verified) : true,
    ...(fallback.planMonths === 1 || fallback.planMonths === 3 ? { planMonths: fallback.planMonths } : {}),
    ...(typeof fallback.monthlyTariffMillion === 'number' && Number.isFinite(fallback.monthlyTariffMillion) ? { monthlyTariffMillion: fallback.monthlyTariffMillion } : {}),
    ...(typeof fallback.totalPayableMillion === 'number' && Number.isFinite(fallback.totalPayableMillion) ? { totalPayableMillion: fallback.totalPayableMillion } : {}),
    ...(typeof fallback.trackingCode === 'string' && fallback.trackingCode ? { trackingCode: fallback.trackingCode } : {}),
    ...(typeof fallback.expiresAtIso === 'string' && fallback.expiresAtIso ? { expiresAtIso: fallback.expiresAtIso } : {}),
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const candidate = raw as Record<string, unknown>;
  const rawName = typeof candidate.name === 'string' ? candidate.name : typeof candidate.agencyName === 'string' ? candidate.agencyName : '';
  const cleanName = rawName.replace(/[<>]/g, '').trim().slice(0, 100);
  const cleanPhone = typeof candidate.phone === 'string' ? candidate.phone.replace(/[<>]/g, '').trim().slice(0, 30) : '';
  const cleanSpecialty = typeof candidate.specialty === 'string' ? candidate.specialty.replace(/[<>]/g, '').trim().slice(0, 120) : '';
  const expNum =
    typeof candidate.experienceYears === 'number' && Number.isFinite(candidate.experienceYears)
      ? Math.min(80, Math.max(1, Math.round(candidate.experienceYears)))
      : base.experienceYears;
  const out: SanitizedSponsorData = {
    name: cleanName || base.name,
    phone: cleanPhone || base.phone,
    specialty: cleanSpecialty || base.specialty,
    experienceYears: expNum,
    verified: typeof candidate.verified === 'boolean' ? candidate.verified : base.verified,
  };
  if (candidate.planMonths === 1 || candidate.planMonths === 3) out.planMonths = candidate.planMonths;
  else if (base.planMonths) out.planMonths = base.planMonths;
  if (typeof candidate.monthlyTariffMillion === 'number' && Number.isFinite(candidate.monthlyTariffMillion) && candidate.monthlyTariffMillion >= 1 && candidate.monthlyTariffMillion <= 500) {
    out.monthlyTariffMillion = candidate.monthlyTariffMillion;
  } else if (base.monthlyTariffMillion !== undefined) {
    out.monthlyTariffMillion = base.monthlyTariffMillion;
  }
  if (typeof candidate.totalPayableMillion === 'number' && Number.isFinite(candidate.totalPayableMillion) && candidate.totalPayableMillion >= 1 && candidate.totalPayableMillion <= 1500) {
    out.totalPayableMillion = candidate.totalPayableMillion;
  } else if (base.totalPayableMillion !== undefined) {
    out.totalPayableMillion = base.totalPayableMillion;
  }
  if (typeof candidate.trackingCode === 'string') {
    const cleanCode = candidate.trackingCode.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    if (cleanCode) out.trackingCode = cleanCode;
  } else if (base.trackingCode) {
    out.trackingCode = base.trackingCode;
  }
  if (typeof candidate.expiresAtIso === 'string' && candidate.expiresAtIso.length >= 10 && candidate.expiresAtIso.length <= 40) {
    const parsedMs = Date.parse(candidate.expiresAtIso);
    if (Number.isFinite(parsedMs)) out.expiresAtIso = new Date(parsedMs).toISOString();
  } else if (base.expiresAtIso) {
    out.expiresAtIso = base.expiresAtIso;
  }
  return out;
}
export const MIN_BUY_PER_SQM_MILLION = 10;
export const MAX_BUY_PER_SQM_MILLION = 5000;
export const MIN_RAHN_80M_MILLION = 50;
export const MAX_RAHN_80M_MILLION = 100000;
export type PriceValidationOutcome =
  | { ok: true; value: number }
  | { ok: false; code: string; messageFa: string };
export function validateStrictPriceNumber(
  raw: unknown,
  min: number,
  max: number,
  fieldLabelFa: string,
): PriceValidationOutcome {
  if (raw === null || raw === undefined || typeof raw === 'boolean' || typeof raw === 'object') {
    return { ok: false, code: 'INVALID_PRICE_TYPE', messageFa: `مقدار ${fieldLabelFa} نامعتبر است و نباید خالی یا غیرعددی باشد.` };
  }
  const num = typeof raw === 'string' ? (raw.trim().length === 0 ? NaN : Number(raw.trim())) : typeof raw === 'number' ? raw : NaN;
  if (typeof raw === 'string' && raw.trim().length === 0) {
    return { ok: false, code: 'EMPTY_PRICE_STRING', messageFa: `مقدار ${fieldLabelFa} نمی‌تواند خالی باشد.` };
  }
  if (!Number.isFinite(num)) {
    return { ok: false, code: 'NON_FINITE_PRICE', messageFa: `مقدار ${fieldLabelFa} باید یک عدد متناهی معتبر باشد.` };
  }
  if (num < min || num > max) {
    return { ok: false, code: 'PRICE_OUT_OF_RANGE', messageFa: `مقدار ${fieldLabelFa} باید بین ${min} تا ${max} میلیون تومان باشد.` };
  }
  return { ok: true, value: Math.round(num * 100) / 100 };
}
export function validateBuyPerSqmInput(raw: unknown): PriceValidationOutcome {
  return validateStrictPriceNumber(raw, MIN_BUY_PER_SQM_MILLION, MAX_BUY_PER_SQM_MILLION, 'قیمت هر متر خرید');
}
export function validateRahn80mInput(raw: unknown): PriceValidationOutcome {
  return validateStrictPriceNumber(raw, MIN_RAHN_80M_MILLION, MAX_RAHN_80M_MILLION, 'رهن کامل ۸۰ متری');
}
export function computeCanonicalSponsorPricing(
  monthlyTariffMillion: number,
  rawPlanMonths: unknown,
): { planMonths: 1 | 3; monthlyTariffMillion: number; totalPayableMillion: number; durationDays: 30 | 90 } {
  const safeMonthly = Math.min(25, Math.max(5, Math.round(Number(monthlyTariffMillion) || 5)));
  const planMonths: 1 | 3 = rawPlanMonths === 3 || rawPlanMonths === '3' ? 3 : 1;
  const rawTotal = safeMonthly * planMonths;
  const totalPayableMillion = planMonths === 3 ? Math.round(rawTotal * 0.8 * 10) / 10 : safeMonthly;
  return { planMonths, monthlyTariffMillion: safeMonthly, totalPayableMillion, durationDays: planMonths === 3 ? 90 : 30 };
}
export function computeSponsorExpirationIso(arg1: number, arg2?: number): string {
  const isFirstPlan = arg1 === 1 || arg1 === 3;
  const planMonths: 1 | 3 = isFirstPlan ? (arg1 as 1 | 3) : arg2 === 3 ? 3 : 1;
  const approvalTimeMs = isFirstPlan ? (arg2 ?? Date.now()) : arg1;
  const safeBaseMs = Number.isFinite(approvalTimeMs) && approvalTimeMs > 0 ? approvalTimeMs : Date.now();
  const durationDays = planMonths === 3 ? 90 : 30;
  return new Date(safeBaseMs + durationDays * 24 * 60 * 60 * 1000).toISOString();
}
export function computeExtendedSponsorExpirationIso(
  currentExpiresAtIso: string | null | undefined,
  nowOrDays: number,
  extensionDaysOrNow = 30,
): string {
  const isSecondDays = nowOrDays <= 365;
  const safeNow = isSecondDays
    ? Number.isFinite(extensionDaysOrNow) && extensionDaysOrNow > 365 ? extensionDaysOrNow : Date.now()
    : Number.isFinite(nowOrDays) && nowOrDays > 0 ? nowOrDays : Date.now();
  const rawDays = isSecondDays ? nowOrDays : extensionDaysOrNow;
  const parsedCurrent = typeof currentExpiresAtIso === 'string' && currentExpiresAtIso ? Date.parse(currentExpiresAtIso) : NaN;
  const baseMs = Number.isFinite(parsedCurrent) && parsedCurrent > safeNow ? parsedCurrent : safeNow;
  const safeDays = Math.min(90, Math.max(1, Math.round(rawDays)));
  return new Date(baseMs + safeDays * 24 * 60 * 60 * 1000).toISOString();
}
export function computeCanonicalBargainFinancials(params: {
  dealType: 'خرید' | 'رهن و اجاره'; sqm: number; offeredTotalMillion: number; benchmarkBuyPerSqm: number; benchmarkRahn80m: number;
}): {
  valid: boolean; code?: string; discountPercent: number; buyerProfitMillion: number;
  offeredPerSqmMillion: number; benchmarkTotalMillion: number; isEligible: boolean;
  displayAreaUnitLabel?: string; offeredTotalIntlText?: string;
} {
  const safeSqm = Number(params.sqm);
  const safeOffered = Number(params.offeredTotalMillion);
  if (!Number.isFinite(safeSqm) || safeSqm < 20 || safeSqm > 2000) {
    return { valid: false, code: 'INVALID_SQM', discountPercent: 0, buyerProfitMillion: 0, offeredPerSqmMillion: 0, benchmarkTotalMillion: 0, isEligible: false };
  }
  if (!Number.isFinite(safeOffered) || safeOffered < 50 || safeOffered > 1_000_000) {
    return { valid: false, code: 'INVALID_OFFERED_PRICE', discountPercent: 0, buyerProfitMillion: 0, offeredPerSqmMillion: 0, benchmarkTotalMillion: 0, isEligible: false };
  }
  const benchmarkTotalMillion = params.dealType === 'خرید' ? Math.max(10, Number(params.benchmarkBuyPerSqm) || 100) * safeSqm : (Math.max(50, Number(params.benchmarkRahn80m) || 1000) / 80) * safeSqm;
  const rawProfit = Math.max(0, Math.round(benchmarkTotalMillion - safeOffered));
  const rawDiscount = benchmarkTotalMillion > 0 ? Math.round(((benchmarkTotalMillion - safeOffered) / benchmarkTotalMillion) * 100) : 5;
  const discountPercent = Math.min(60, Math.max(1, rawDiscount > 0 ? rawDiscount : 5));
  const offeredPerSqmMillion = Math.max(1, Math.round(safeOffered / safeSqm));
  return {
    valid: true, discountPercent, buyerProfitMillion: rawProfit,
    offeredPerSqmMillion, benchmarkTotalMillion: Math.round(benchmarkTotalMillion), isEligible: discountPercent >= 10,
    displayAreaUnitLabel: formatAreaUnitLabel(getStoredAreaUnit()),
    offeredTotalIntlText: formatMillionTomanAsIntlCurrency(safeOffered, getStoredIntlCurrency()),
  };
}
export function calculateCanonicalBargainFinancials(
  dealType: 'خرید' | 'رهن و اجاره', benchmarkPerSqm: number, offeredPerSqm: number, sqm: number,
) {
  return computeCanonicalBargainFinancials({
    dealType, sqm, offeredTotalMillion: offeredPerSqm * sqm,
    benchmarkBuyPerSqm: benchmarkPerSqm, benchmarkRahn80m: benchmarkPerSqm * 80,
  });
}
export function calculateCanonicalSponsorPricing(hoodTierOrTariff: number, planMonths: 1 | 3) {
  const baseTariff = hoodTierOrTariff <= 3 ? 15 : hoodTierOrTariff;
  return computeCanonicalSponsorPricing(baseTariff, planMonths);
}
export type BargainLifecycleStatus = 'pending' | 'approved' | 'rejected';
export function isValidBargainStateTransition(
  fromStatus: string | undefined,
  toStatus: string,
  isActorAdmin: boolean,
): boolean {
  const current: BargainLifecycleStatus =
    fromStatus === 'approved' || fromStatus === 'rejected' ? fromStatus : 'pending';
  if (!isActorAdmin) return toStatus === 'pending';
  return (
    (current === 'pending' || current === 'approved' || current === 'rejected') &&
    (toStatus === 'approved' || toStatus === 'rejected' || toStatus === 'pending')
  );
}
export const validateBargainStatusTransition = isValidBargainStateTransition;
export function validateFirestoreDocumentId(id: unknown, maxLength = 128): { valid: boolean } {
  return { valid: isValidFirestoreDocId(id, maxLength) };
}
export const validateIranGeoJsonPolygonRing = validateGeoJsonPolygonRing;
export function generateSecureRandomHex(byteLength = 16): string {
  const safeLen = Math.min(64, Math.max(8, Math.floor(byteLength)));
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const buf = new Uint8Array(safeLen);
    globalThis.crypto.getRandomValues(buf);
    let hex = '';
    for (let i = 0; i < buf.length; i++) hex += buf[i].toString(16).padStart(2, '0');
    return hex;
  }
  throw new Error('CSPRNG_UNAVAILABLE');
}
export const generateCryptographicHexId = generateSecureRandomHex;
export function validateTrustedPostMessageEvent(
  event: { origin?: unknown; data?: unknown },
  allowedOrigins: readonly string[],
): { valid: boolean; reason?: string; type?: string; payload?: Record<string, unknown> } {
  const origin = typeof event.origin === 'string' ? event.origin.trim() : '';
  if (!origin || origin === '*' || !allowedOrigins.includes(origin)) return { valid: false, reason: 'UNTRUSTED_POSTMESSAGE_ORIGIN' };
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return { valid: false, reason: 'INVALID_POSTMESSAGE_SCHEMA' };
  const rec = event.data as Record<string, unknown>;
  if (typeof rec.type !== 'string' || !/^[A-Z0-9_:-]{2,64}$/i.test(rec.type)) return { valid: false, reason: 'INVALID_POSTMESSAGE_TYPE' };
  for (const forbidden of ['isAdmin', 'adminUnlocked', 'role', 'customClaims', '__proto__', 'constructor', 'prototype']) {
    if (Object.prototype.hasOwnProperty.call(rec, forbidden)) return { valid: false, reason: 'PRIVILEGE_ASSERTION_FORBIDDEN' };
  }
  return { valid: true, type: rec.type, payload: rec };
}
export function getSafeExternalLinkProps(
  rawUrl: unknown,
  allowedDomains?: readonly string[],
): { href: string; target: '_blank'; rel: 'noopener noreferrer' } | null {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.startsWith('[') || /\.(?:local|internal|localhost)$/.test(host) || /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) return null;
    if (allowedDomains && allowedDomains.length > 0 && !allowedDomains.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`))) return null;
    return { href: parsed.toString(), target: '_blank', rel: 'noopener noreferrer' };
  } catch {
    return null;
  }
}
export function renderSafeNotificationMessage(params: {
  subject: string;
  hoodName: string;
  summaryText: string;
  canonicalAppUrl?: string | null;
  relativePath?: string;
}): { safeSubject: string; htmlBody: string; textBody: string; canonicalUrl: string | null } { const escHtml = (s: string) =>
    s.replace(/[\r\n\u0000]/g, ' ').slice(0, 500).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); const safeSubject = params.subject.replace(/[\r\n\u0000<>]/g, ' ').trim().slice(0, 140); const canonicalUrl = buildCanonicalNotificationUrl(params.canonicalAppUrl, params.relativePath || '/');
  const linkHtml = canonicalUrl ? `<a href="${escHtml(canonicalUrl)}" rel="noopener noreferrer">مشاهده در رادار</a>` : '';
  return { safeSubject,
    htmlBody: `<div><strong>${escHtml(params.hoodName || '')}</strong><p>${escHtml(params.summaryText || '')}</p>${linkHtml}</div>`,
    textBody: `${safeSubject} - ${params.hoodName.replace(/[\r\n<>]/g, ' ').slice(0, 80)}: ${params.summaryText.replace(/[\r\n<>]/g, ' ').slice(0, 300)}${canonicalUrl ? ` (${canonicalUrl})` : ''}`,
    canonicalUrl, }; } export function validateSafeExternalUrl(rawUrl: unknown, allowedDomains?: readonly string[]): string | null { return getSafeExternalLinkProps(rawUrl, allowedDomains)?.href ?? null; }
export function validateSafeNotificationUrl(rawUrl: unknown, canonicalOrigin = 'https://radartehran.ir'): string | null {
  return typeof rawUrl === 'string' ? buildCanonicalNotificationUrl(canonicalOrigin, rawUrl) : null; }