/**
 * @file worker/research/researchEventContract.ts
 * @description Strict versioned behavioral research event taxonomy, allowlist schema validator,
 * PII rejection engine, payload size/batch limits, and retention policy registry for RESEARCH_DB.
 */

export type AllowedResearchEventType =
  | 'radar.map.neighborhood_select'
  | 'radar.search.query_executed'
  | 'radar.community.tab_view'
  | 'radar.valuation.hedonic_estimate'
  | 'radar.compare.neighborhoods_compared'
  | 'radar.filter.budget_adjusted';

export interface ResearchEventPolicy {
  readonly eventType: AllowedResearchEventType;
  readonly schemaVersion: number;
  readonly domain: 'navigation' | 'search' | 'community' | 'valuation' | 'comparison' | 'filter';
  readonly retentionDays: number;
  readonly aggregationRetentionDays: number;
  readonly minKAnonymity: number;
  readonly allowedPayloadFields: readonly string[];
}

export const RESEARCH_EVENT_POLICIES: Readonly<Record<AllowedResearchEventType, ResearchEventPolicy>> = Object.freeze({
  'radar.map.neighborhood_select': {
    eventType: 'radar.map.neighborhood_select',
    schemaVersion: 1,
    domain: 'navigation',
    retentionDays: 90,
    aggregationRetentionDays: 365,
    minKAnonymity: 10,
    allowedPayloadFields: ['mapZoomBucket', 'viewMode', 'districtNumber', 'sourceSurface'],
  },
  'radar.search.query_executed': {
    eventType: 'radar.search.query_executed',
    schemaVersion: 1,
    domain: 'search',
    retentionDays: 90,
    aggregationRetentionDays: 365,
    minKAnonymity: 10,
    allowedPayloadFields: ['mode', 'resultCountBucket', 'hasPriceFilter', 'hasAreaFilter', 'sortKey'],
  },
  'radar.community.tab_view': {
    eventType: 'radar.community.tab_view',
    schemaVersion: 1,
    domain: 'community',
    retentionDays: 90,
    aggregationRetentionDays: 365,
    minKAnonymity: 10,
    allowedPayloadFields: ['tabName', 'dwellBucketSec'],
  },
  'radar.valuation.hedonic_estimate': {
    eventType: 'radar.valuation.hedonic_estimate',
    schemaVersion: 1,
    domain: 'valuation',
    retentionDays: 90,
    aggregationRetentionDays: 365,
    minKAnonymity: 10,
    allowedPayloadFields: ['sqmBucket', 'ageBucket', 'hasElevator', 'hasParking', 'mode'],
  },
  'radar.compare.neighborhoods_compared': {
    eventType: 'radar.compare.neighborhoods_compared',
    schemaVersion: 1,
    domain: 'comparison',
    retentionDays: 90,
    aggregationRetentionDays: 365,
    minKAnonymity: 10,
    allowedPayloadFields: ['primaryHoodId', 'secondaryHoodId', 'metricFocus'],
  },
  'radar.filter.budget_adjusted': {
    eventType: 'radar.filter.budget_adjusted',
    schemaVersion: 1,
    domain: 'filter',
    retentionDays: 60,
    aggregationRetentionDays: 180,
    minKAnonymity: 10,
    allowedPayloadFields: ['mode', 'budgetBandMillion', 'roomsCount'],
  },
});

export const MAX_RESEARCH_BATCH_SIZE = 25;
export const MAX_RESEARCH_PAYLOAD_BYTES = 2048;
export const MAX_EVENT_PAST_SKEW_MS = 24 * 60 * 60 * 1000;
export const MAX_EVENT_FUTURE_SKEW_MS = 5 * 60 * 1000;

const ALLOWED_CITIES = new Set(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']);

const FORBIDDEN_PII_KEYS = new Set([
  'uid',
  'userid',
  'user_id',
  'firebaseuid',
  'firebase_uid',
  'email',
  'mail',
  'phone',
  'phonenumber',
  'phone_number',
  'mobile',
  'tel',
  'ip',
  'ipaddress',
  'ip_address',
  'clientip',
  'client_ip',
  'token',
  'idtoken',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'password',
  'secret',
  'nationalid',
  'national_id',
  'codemeli',
  'iban',
  'sheba',
  'cardnumber',
  'fullname',
  'full_name',
  'firstname',
  'lastname',
  'address',
  'exactaddress',
  'street',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'rawquery',
]);

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'eventType',
  'schemaVersion',
  'cityId',
  'hoodId',
  'idempotencyKey',
  'occurredAtIso',
  'sessionBucket',
  'payload',
]);

const STRUCTURED_TOKEN_REGEX = /^[a-zA-Z0-9._:-]{1,48}$/;

const PII_VALUE_PATTERNS: readonly RegExp[] = [
  /(?:0|\+?98)9\d{9}/, // Iranian mobile number (normalized ASCII digits)
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // Email
  /\bIR\d{24}\b/i, // Iranian IBAN / Sheba
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, // JWT token
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/, // IPv4 address
  /\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/i, // IPv6 address
  /\b\d{10,16}\b/, // National ID / card / long numeric PII
];

export interface RawResearchEventInput {
  readonly eventType?: unknown;
  readonly schemaVersion?: unknown;
  readonly cityId?: unknown;
  readonly hoodId?: unknown;
  readonly idempotencyKey?: unknown;
  readonly occurredAtIso?: unknown;
  readonly sessionBucket?: unknown;
  readonly payload?: unknown;
}

export interface ValidatedResearchEvent {
  readonly eventType: AllowedResearchEventType;
  readonly schemaVersion: number;
  readonly cityId: string;
  readonly hoodId: number | null;
  readonly idempotencyKey: string;
  readonly sessionBucket: string;
  readonly payload: Record<string, string | number | boolean>;
  readonly payloadJson: string;
  readonly occurredAtIso: string;
  readonly ingestedAtIso: string;
  readonly expiresAtIso: string;
  readonly retentionDays: number;
}

export type ResearchEventValidationResult =
  | { readonly ok: true; readonly event: ValidatedResearchEvent }
  | { readonly ok: false; readonly code: string; readonly detail: string };

function normalizeForPiiInspection(val: string): string {
  // 1. Unicode NFKC normalization (folds fullwidth digits/letters such as ０９１２ or ＠)
  let normalized = val.normalize('NFKC');
  // 2. Strip invisible zero-width and bidirectional override control characters
  normalized = normalized.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
  // 3. Fold Persian (۰-۹) and Eastern Arabic (٠-٩) digits to ASCII 0-9
  normalized = normalized
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  return normalized;
}

function safePercentDecode(val: string): string {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

function containsPiiString(val: string): boolean {
  const candidates = new Set<string>([
    val,
    normalizeForPiiInspection(val),
    normalizeForPiiInspection(safePercentDecode(val)),
  ]);
  for (const candidate of candidates) {
    if (PII_VALUE_PATTERNS.some((pattern) => pattern.test(candidate))) {
      return true;
    }
  }
  return false;
}

function scanObjectForForbiddenKeysOrPii(
  obj: Record<string, unknown>,
  depth = 0,
): { ok: true } | { ok: false; code: string; detail: string } {
  if (depth > 0) {
    return { ok: false, code: 'PAYLOAD_NESTING_FORBIDDEN', detail: 'Nested payload objects are not permitted.' };
  }
  for (const [key, value] of Object.entries(obj)) {
    const normalizedKey = normalizeForPiiInspection(key).trim().toLowerCase();
    if (FORBIDDEN_PII_KEYS.has(normalizedKey)) {
      return { ok: false, code: 'FORBIDDEN_PII_FIELD', detail: `Forbidden field "${key}" rejected.` };
    }
    if (typeof value === 'string' && containsPiiString(value)) {
      return { ok: false, code: 'PII_DETECTED_IN_RESEARCH_PAYLOAD', detail: `Potential PII detected in "${key}".` };
    }
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        return { ok: false, code: 'UNSUPPORTED_PAYLOAD_VALUE_TYPE', detail: `Array values not permitted in "${key}".` };
      }
      return { ok: false, code: 'PAYLOAD_NESTING_FORBIDDEN', detail: `Nested object not permitted in "${key}".` };
    }
  }
  return { ok: true };
}

export function validateAndMinimizeResearchEvent(
  raw: unknown,
  nowMs: number = Date.now(),
): ResearchEventValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, code: 'INVALID_EVENT_OBJECT', detail: 'Event must be a JSON object.' };
  }
  const input = raw as Record<string, unknown>;

  // Reject any top-level forbidden PII/identity keys OR unexpected extra top-level keys
  for (const topKey of Object.keys(input)) {
    const normalizedTopKey = normalizeForPiiInspection(topKey).trim().toLowerCase();
    if (FORBIDDEN_PII_KEYS.has(normalizedTopKey)) {
      return { ok: false, code: 'FORBIDDEN_PII_FIELD', detail: `Top-level PII field "${topKey}" is forbidden.` };
    }
    if (!ALLOWED_TOP_LEVEL_KEYS.has(topKey)) {
      return {
        ok: false,
        code: 'UNEXPECTED_TOP_LEVEL_FIELD',
        detail: `Top-level field "${topKey}" is not permitted on research events.`,
      };
    }
  }

  const eventType = String(input.eventType || '').trim() as AllowedResearchEventType;
  const policy = RESEARCH_EVENT_POLICIES[eventType];
  if (!policy) {
    return { ok: false, code: 'UNKNOWN_RESEARCH_EVENT_TYPE', detail: `Event type "${eventType}" is not allowlisted.` };
  }

  const schemaVersion = input.schemaVersion === undefined ? policy.schemaVersion : Number(input.schemaVersion);
  if (!Number.isInteger(schemaVersion) || schemaVersion !== policy.schemaVersion) {
    return {
      ok: false,
      code: 'UNSUPPORTED_EVENT_SCHEMA_VERSION',
      detail: `Expected schemaVersion=${policy.schemaVersion} for ${eventType}.`,
    };
  }

  const cityId = String(input.cityId || 'tehran').trim().toLowerCase();
  if (!ALLOWED_CITIES.has(cityId)) {
    return { ok: false, code: 'INVALID_RESEARCH_CITY', detail: `Unsupported city "${cityId}".` };
  }

  let hoodId: number | null = null;
  if (input.hoodId !== undefined && input.hoodId !== null) {
    const numHood = Number(input.hoodId);
    if (!Number.isInteger(numHood) || numHood < 1 || numHood > 9999) {
      return { ok: false, code: 'INVALID_RESEARCH_HOOD_ID', detail: 'hoodId must be a valid positive integer.' };
    }
    hoodId = numHood;
  }

  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(idempotencyKey)) {
    return {
      ok: false,
      code: 'INVALID_IDEMPOTENCY_KEY',
      detail: 'idempotencyKey must be 8..128 alphanumeric/._:- characters.',
    };
  }

  const rawSessionBucket = String(input.sessionBucket || new Date(nowMs).toISOString().slice(0, 10)).trim();
  if (
    rawSessionBucket.length < 4 ||
    rawSessionBucket.length > 40 ||
    !/^[a-zA-Z0-9_-]+$/.test(rawSessionBucket) ||
    containsPiiString(rawSessionBucket)
  ) {
    return { ok: false, code: 'INVALID_SESSION_BUCKET', detail: 'sessionBucket must be a sanitized short identifier.' };
  }

  let occurredMs = nowMs;
  if (input.occurredAtIso !== undefined) {
    const parsedMs = Date.parse(String(input.occurredAtIso));
    if (!Number.isFinite(parsedMs)) {
      return { ok: false, code: 'INVALID_OCCURRED_AT_ISO', detail: 'occurredAtIso must be valid ISO-8601.' };
    }
    if (nowMs - parsedMs > MAX_EVENT_PAST_SKEW_MS || parsedMs - nowMs > MAX_EVENT_FUTURE_SKEW_MS) {
      return {
        ok: false,
        code: 'EVENT_TIMESTAMP_OUT_OF_WINDOW',
        detail: 'occurredAtIso exceeds allowed server replay/skew window.',
      };
    }
    occurredMs = parsedMs;
  }

  const rawPayload = input.payload ?? {};
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return { ok: false, code: 'INVALID_PAYLOAD_OBJECT', detail: 'payload must be a flat JSON object.' };
  }
  const payloadObj = rawPayload as Record<string, unknown>;
  const piiScan = scanObjectForForbiddenKeysOrPii(payloadObj);
  if ('code' in piiScan) {
    return { ok: false, code: piiScan.code, detail: piiScan.detail };
  }

  const allowedSet = new Set(policy.allowedPayloadFields);
  const minimizedPayload: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(payloadObj)) {
    if (!allowedSet.has(key)) {
      return {
        ok: false,
        code: 'UNEXPECTED_PAYLOAD_FIELD',
        detail: `Field "${key}" is not allowed for event "${eventType}".`,
      };
    }
    if (typeof value === 'string') {
      const clean = value.trim();
      if (clean.length > 48) {
        return { ok: false, code: 'PAYLOAD_STRING_TOO_LONG', detail: `Field "${key}" exceeds 48 chars.` };
      }
      if (containsPiiString(clean)) {
        return { ok: false, code: 'PII_DETECTED_IN_RESEARCH_PAYLOAD', detail: `PII detected in "${key}".` };
      }
      if (!STRUCTURED_TOKEN_REGEX.test(clean)) {
        return {
          ok: false,
          code: 'FREE_TEXT_NOT_ALLOWED_IN_RESEARCH_PAYLOAD',
          detail: `Field "${key}" must be a structured enum/bucket token (free text and spaces are forbidden).`,
        };
      }
      minimizedPayload[key] = clean;
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return { ok: false, code: 'INVALID_PAYLOAD_NUMBER', detail: `Field "${key}" must be finite.` };
      }
      minimizedPayload[key] = value;
    } else if (typeof value === 'boolean') {
      minimizedPayload[key] = value;
    } else {
      return {
        ok: false,
        code: 'UNSUPPORTED_PAYLOAD_VALUE_TYPE',
        detail: `Field "${key}" must be string, number, or boolean.`,
      };
    }
  }

  const payloadJson = JSON.stringify(minimizedPayload);
  const byteSize = new TextEncoder().encode(payloadJson).byteLength;
  if (byteSize > MAX_RESEARCH_PAYLOAD_BYTES) {
    return {
      ok: false,
      code: 'PAYLOAD_SIZE_EXCEEDED',
      detail: `Payload exceeds ${MAX_RESEARCH_PAYLOAD_BYTES} bytes.`,
    };
  }

  const ingestedAtIso = new Date(nowMs).toISOString();
  const expiresAtIso = new Date(nowMs + policy.retentionDays * 24 * 60 * 60 * 1000).toISOString();

  return {
    ok: true,
    event: {
      eventType,
      schemaVersion,
      cityId,
      hoodId,
      idempotencyKey,
      sessionBucket: rawSessionBucket,
      payload: minimizedPayload,
      payloadJson,
      occurredAtIso: new Date(occurredMs).toISOString(),
      ingestedAtIso,
      expiresAtIso,
      retentionDays: policy.retentionDays,
    },
  };
}
