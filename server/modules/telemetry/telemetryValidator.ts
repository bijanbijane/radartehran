import crypto from 'node:crypto';
import { sanitizeInput } from '../../../src/utils/security';
import type {
  IngestibleTelemetryBatchItem,
  TelemetryEventCategory,
  TelemetryEventPayload,
  TelemetryEventProvenance,
  TelemetryPrivacyClassification,
  TelemetryValidationResult,
} from './telemetryTypes';

export const PII_KEY_REGEX =
  /uid|user_id|userid|password|passwd|secret|token|id_token|access_token|authorization|auth|cookie|phone|mobile|cellphone|email|national_id|meli_code|iban|card|cvv|exact_lat|exact_lng|raw_query|message|comment/i;

export const PII_VALUE_PATTERNS = [
  /(?:(?:\+|00)?98|0)?9\d{9}\b/, // Iran mobile
  /\b\d{10}\b/, // 10-digit national code or account
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, // Email address
  /\bIR\d{24}\b/i, // Iranian IBAN
  /\b(?:6037|5892|6273|6037|5022|6280)\d{12}\b/, // Iranian debit cards
];

export function toTehranDateKey(timestampMs: number): string {
  const safeMs = Number.isFinite(timestampMs) && timestampMs > 0 ? timestampMs : Date.now();
  return new Date(safeMs + (3 * 60 + 30) * 60_000).toISOString().slice(0, 10);
}

export function detectPiiInValue(val: unknown): boolean {
  if (typeof val === 'string') {
    for (const pattern of PII_VALUE_PATTERNS) {
      if (pattern.test(val)) return true;
    }
  }
  return false;
}

export function computeDailySessionHash(
  rawSeed: string | undefined,
  salt: string,
  dateKey: string
): string {
  const seed = (rawSeed || 'anonymous').slice(0, 64);
  return crypto
    .createHash('sha256')
    .update(`${salt}:${dateKey}:${seed}`)
    .digest('hex')
    .slice(0, 24);
}

export function validateAndSanitizeTelemetryItem(
  item: IngestibleTelemetryBatchItem,
  options: {
    nowMs?: number;
    dailySalt?: string;
    appVersion?: string;
    origin?: 'web_client' | 'mobile_pwa' | 'backend_service';
  } = {}
): TelemetryValidationResult {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { valid: false, errorCode: 'INVALID_PAYLOAD', errorMessageFa: 'قالب ورودی رویداد نامعتبر است.' };
  }

  const rawEventName = typeof item.eventName === 'string' ? item.eventName.trim() : '';
  if (!rawEventName) {
    return { valid: false, errorCode: 'MISSING_EVENT_NAME', errorMessageFa: 'نام رویداد الزامی است.' };
  }
  if (rawEventName.length > 64) {
    return { valid: false, errorCode: 'EVENT_NAME_TOO_LONG', errorMessageFa: 'طول نام رویداد بیش از حد مجاز است.' };
  }

  // Scan top-level keys for PII
  for (const k of Object.keys(item)) {
    if (PII_KEY_REGEX.test(k)) {
      return { valid: false, errorCode: 'ILLEGAL_PII_KEY', errorMessageFa: `کلید حساس (${k}) در بدنه رویداد مجاز نیست.` };
    }
  }

  const cleanEventName = sanitizeInput(rawEventName, 64);
  const nowMs = typeof options.nowMs === 'number' && Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const dateKey = toTehranDateKey(nowMs);
  const clientSentAtMs = typeof item.timestampMs === 'number' && Number.isFinite(item.timestampMs) ? item.timestampMs : undefined;
  const clientTimeDriftMs = clientSentAtMs !== undefined ? Math.abs(nowMs - clientSentAtMs) : undefined;

  const provenance: TelemetryEventProvenance = {
    origin: options.origin || 'web_client',
    appVersion: options.appVersion || '6.0.0',
    tehranDateKey: dateKey,
    ingestedAtMs: nowMs,
    clientSentAtMs,
    clientTimeDriftMs,
  };

  const salt = options.dailySalt || 'default_radar_salt_2026';
  const sessionHash = computeDailySessionHash(item.sessionSeed, salt, dateKey);

  // Validate and sanitize metrics
  const cleanMetrics: Record<string, number> = {};
  if (item.metrics && typeof item.metrics === 'object' && !Array.isArray(item.metrics)) {
    for (const [k, v] of Object.entries(item.metrics)) {
      if (PII_KEY_REGEX.test(k)) {
        return { valid: false, errorCode: 'ILLEGAL_PII_KEY', errorMessageFa: `کلید (${k}) در متریک‌ها مشکوک به PII است.` };
      }
      if (typeof v === 'number' && Number.isFinite(v)) {
        cleanMetrics[sanitizeInput(k, 48)] = Math.round(v * 1000) / 1000;
      }
    }
  }

  // Validate and sanitize dimensions
  const cleanDimensions: Record<string, string> = {};
  const dimCandidates = { ...(item.dimensions || {}), ...(item.metadata || {}) };
  for (const [k, v] of Object.entries(dimCandidates)) {
    if (PII_KEY_REGEX.test(k)) {
      return { valid: false, errorCode: 'ILLEGAL_PII_KEY', errorMessageFa: `کلید (${k}) در ابعاد رویداد مجاز نیست.` };
    }
    if (detectPiiInValue(v)) {
      return { valid: false, errorCode: 'ILLEGAL_PII_VALUE', errorMessageFa: `مقدار کلید (${k}) حاوی اطلاعات حساس شناسایی است.` };
    }
    if (typeof v === 'string') {
      cleanDimensions[sanitizeInput(k, 48)] = sanitizeInput(v, 120);
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      cleanDimensions[sanitizeInput(k, 48)] = String(v);
    } else if (typeof v === 'boolean') {
      cleanDimensions[sanitizeInput(k, 48)] = String(v);
    }
  }

  const hoodId =
    typeof item.hoodId === 'number' && Number.isInteger(item.hoodId) && item.hoodId >= 1 && item.hoodId <= 9999
      ? item.hoodId
      : undefined;
  const cityId = typeof item.cityId === 'string' ? sanitizeInput(item.cityId.toLowerCase(), 32) : undefined;

  const category: TelemetryEventCategory = item.category || 'USER_INTERACTION';
  const privacyClassification: TelemetryPrivacyClassification =
    category === 'FRAUD_SECURITY' || category === 'SYSTEM_HEALTH'
      ? 'RESTRICTED_OPERATIONAL'
      : hoodId !== undefined
        ? 'PUBLIC_AGGREGATE'
        : 'PSEUDONYMOUS_SESSION';

  // Compute canonical deterministic eventId if not provided or to ensure signature integrity
  const rawHashPayload = `${cleanEventName}|${sessionHash}|${hoodId ?? 0}|${cityId ?? ''}|${JSON.stringify(cleanMetrics)}|${JSON.stringify(cleanDimensions)}|${clientSentAtMs ?? nowMs}`;
  const rawPayloadHashSha256 = crypto.createHash('sha256').update(rawHashPayload).digest('hex');
  const eventId = item.eventId && typeof item.eventId === 'string' && item.eventId.length >= 8 && item.eventId.length <= 64
    ? sanitizeInput(item.eventId, 64)
    : `evt_${rawPayloadHashSha256.slice(0, 16)}`;

  const sanitizedEvent: TelemetryEventPayload = {
    eventId,
    eventName: cleanEventName,
    category,
    privacyClassification,
    sessionHash,
    hoodId,
    cityId,
    numericMetrics: cleanMetrics,
    categoricalDimensions: cleanDimensions,
    provenance,
    rawPayloadHashSha256,
  };

  return { valid: true, sanitizedEvent };
}
