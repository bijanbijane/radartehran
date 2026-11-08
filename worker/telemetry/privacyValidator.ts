/**
 * @file worker/telemetry/privacyValidator.ts
 * @description Privacy engineering and strict zero-PII sanitization engine for telemetry.
 *
 * Enforces:
 * - Immediate rejection of PII keys (uid, token, phone, email, card, national_id, raw_query).
 * - Immediate rejection of PII values (Iranian mobile numbers, IBANs, emails, cards).
 * - Daily rotating salt hashing for pseudonymous sessions (preventing permanent cross-day user tracking).
 * - Minimal aggregate search demand capture without raw sensitive query strings.
 */

import type {
  TelemetryDomain,
  TelemetryEventEnvelope,
  TelemetryPrivacyClassification,
} from './types';

const PII_KEY_REGEX =
  /uid|user_id|userid|password|passwd|secret|token|id_token|access_token|authorization|auth|cookie|phone|mobile|cellphone|email|national_id|meli_code|iban|card|cvv|exact_lat|exact_lng|raw_query|message|comment/i;

const PII_VALUE_PATTERNS = [
  /(?:(?:\+|00)?98|0)?9\d{9}\b/, // Iran mobile
  /\b\d{10}\b/, // National ID or bank account
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, // Email address
  /\bIR\d{24}\b/i, // Iranian IBAN
  /\b(?:6037|5892|6273|5022|6280)\d{12}\b/, // Iranian debit cards
];

export interface TelemetryValidationResult {
  readonly valid: boolean;
  readonly sanitizedEnvelope?: TelemetryEventEnvelope;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

/**
 * Checks string for embedded PII patterns.
 */
export function containsPiiPattern(val: unknown): boolean {
  if (typeof val === 'string') {
    for (const pattern of PII_VALUE_PATTERNS) {
      if (pattern.test(val)) return true;
    }
  }
  return false;
}

/**
 * Generates a rotating pseudonymous daily session hash using Web Crypto.
 */
export async function computeDailyRotatingSessionHash(
  rawSeed: string | undefined,
  dailySalt: string,
  dateKey: string
): Promise<string> {
  const seed = (rawSeed || 'anon').slice(0, 64);
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(`${dailySalt}:${dateKey}:${seed}`));
  const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 24);
}

/**
 * Validates telemetry payload against privacy constraints, stripping illegal fields.
 */
export async function validateAndSanitizeTelemetryEnvelope(
  rawEvent: any,
  options: {
    environment?: 'development' | 'preview' | 'staging' | 'production';
    dailySalt?: string;
    correlationId?: string;
  } = {}
): Promise<TelemetryValidationResult> {
  if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) {
    return { valid: false, errorCode: 'MALFORMED_EVENT_PAYLOAD', errorMessage: 'Telemetry event must be a JSON object.' };
  }

  const eventName = typeof rawEvent.eventName === 'string' ? rawEvent.eventName.trim() : '';
  if (!eventName || eventName.length > 64) {
    return { valid: false, errorCode: 'INVALID_EVENT_NAME', errorMessage: 'Event name is required and must be <= 64 characters.' };
  }

  // Domain check
  const domain: TelemetryDomain = rawEvent.domain || 'PRODUCT_ANALYTICS';
  const allowedDomains = new Set<TelemetryDomain>([
    'TECHNICAL_RUNTIME',
    'PRODUCT_ANALYTICS',
    'REAL_ESTATE_INTELLIGENCE',
    'DATA_QUALITY',
    'SECURITY_AUDIT',
  ]);
  if (!allowedDomains.has(domain)) {
    return { valid: false, errorCode: 'INVALID_TELEMETRY_DOMAIN', errorMessage: `Unknown telemetry domain: ${domain}` };
  }

  // Scan top-level keys for PII
  for (const key of Object.keys(rawEvent)) {
    if (PII_KEY_REGEX.test(key)) {
      return { valid: false, errorCode: 'ILLEGAL_PII_KEY_DETECTED', errorMessage: `Forbidden sensitive key '${key}' detected in telemetry event.` };
    }
  }

  // Sanitize payload dimensions and metrics
  const cleanPayload: Record<string, unknown> = {};
  const rawPayload = (rawEvent.payload && typeof rawEvent.payload === 'object' && !Array.isArray(rawEvent.payload))
    ? rawEvent.payload
    : {};

  for (const [key, val] of Object.entries(rawPayload)) {
    if (PII_KEY_REGEX.test(key)) {
      return { valid: false, errorCode: 'ILLEGAL_PII_KEY_DETECTED', errorMessage: `Forbidden sensitive key '${key}' inside payload.` };
    }
    if (containsPiiPattern(val)) {
      return { valid: false, errorCode: 'ILLEGAL_PII_VALUE_DETECTED', errorMessage: `Sensitive personal data detected in field '${key}'.` };
    }

    if (typeof val === 'number' && Number.isFinite(val)) {
      cleanPayload[key] = Math.round(val * 1000) / 1000;
    } else if (typeof val === 'string') {
      cleanPayload[key] = val.trim().slice(0, 120);
    } else if (typeof val === 'boolean') {
      cleanPayload[key] = val;
    }
  }

  const env = options.environment || 'production';
  const salt = options.dailySalt || 'radar_default_salt_2026';
  const dateKey = new Date().toISOString().slice(0, 10);
  const sessionHash = await computeDailyRotatingSessionHash(rawEvent.sessionSeed, salt, dateKey);

  const classification: TelemetryPrivacyClassification =
    domain === 'SECURITY_AUDIT'
      ? 'SECURITY_SENSITIVE'
      : domain === 'TECHNICAL_RUNTIME'
      ? 'RESTRICTED_OPERATIONAL'
      : 'PUBLIC_AGGREGATE';

  const sanitizedEnvelope: TelemetryEventEnvelope = {
    eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    eventName,
    domain,
    schemaVersion: 1,
    privacyClassification: classification,
    timestampIso: new Date().toISOString(),
    environment: env,
    correlationId: options.correlationId || `corr-${Date.now()}`,
    sessionHash,
    payload: cleanPayload,
  };

  return {
    valid: true,
    sanitizedEnvelope,
  };
}
