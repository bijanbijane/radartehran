/**
 * @file src/utils/apiContractsAndSerializationEngine.ts
 * @description API Route Inventory, Standardized Request/Response Contracts, Centralized Input
 * Validation, Error Mapping, Operation Timeout Policies, Safe Firestore/JSON Serialization &
 * Environment-Aware CORS Policy Engine (Section 21 — Prompts 401 to 420).
 */
import { cleanIranianMobile, isValidIranianMobile, sanitizeInput } from './security';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
const VALID_CITY_IDS = new Set(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']);
// ============================================================================
// 1. PROMPT 401 — COMPLETE REPOSITORY-BACKED API ENDPOINT INVENTORY
// ============================================================================
export type { RegisteredApiRoute as ApiEndpointInventoryItem } from './expressRouteCatalog';
export { RADAR_API_ROUTE_INVENTORY } from './expressRouteCatalog';
// ============================================================================
// 2. PROMPTS 402 & 404 — STANDARDIZED API RESPONSE & ERROR CONTRACTS
// ============================================================================
export type StandardApiErrorCode = 'VALIDATION_FAILED' | 'AUTHENTICATION_REQUIRED' | 'FORBIDDEN_INSUFFICIENT_ROLE' | 'RESOURCE_NOT_FOUND' | 'IDEMPOTENCY_OR_VERSION_CONFLICT' | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE' | 'RATE_LIMIT_EXCEEDED' | 'UPSTREAM_TIMEOUT' | 'INTERNAL_SERVER_ERROR';
export interface StandardApiSuccessEnvelope<T> { status: 'ok'; correlationId: string; timestampIso: string; data: T; }
export interface StandardApiErrorEnvelope { status: 'error';
  code: StandardApiErrorCode; message: string;
  correlationId: string; retryable: boolean;
  fieldErrors?: Record<string, string>;
}
export function buildStandardApiSuccess<T>(
  data: T,
  correlationId = 'req-default',
  nowIso = new Date().toISOString(),
): StandardApiSuccessEnvelope<T> {
  return {
    status: 'ok',
    correlationId: sanitizeInput(correlationId, 64),
    timestampIso: nowIso,
    data,
  };
}
export function mapExceptionToStandardApiResponse(params: {
  errorCategory: StandardApiErrorCode;
  userMessageFa: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
}): {
  httpStatus: number;
  body: StandardApiErrorEnvelope;
} {
  const statusMap: Record<StandardApiErrorCode, { status: number; retryable: boolean }> = {
    VALIDATION_FAILED: { status: 400, retryable: false },
    AUTHENTICATION_REQUIRED: { status: 401, retryable: false },
    FORBIDDEN_INSUFFICIENT_ROLE: { status: 403, retryable: false },
    RESOURCE_NOT_FOUND: { status: 404, retryable: false },
    IDEMPOTENCY_OR_VERSION_CONFLICT: { status: 409, retryable: false },
    PAYLOAD_TOO_LARGE: { status: 413, retryable: false },
    UNSUPPORTED_MEDIA_TYPE: { status: 415, retryable: false },
    RATE_LIMIT_EXCEEDED: { status: 429, retryable: true },
    UPSTREAM_TIMEOUT: { status: 503, retryable: true },
    INTERNAL_SERVER_ERROR: { status: 500, retryable: true },
  };
  const mapped = statusMap[params.errorCategory] ?? statusMap.INTERNAL_SERVER_ERROR;
  return {
    httpStatus: mapped.status,
    body: {
      status: 'error',
      code: params.errorCategory,
      message: sanitizeInput(params.userMessageFa, 240),
      correlationId: sanitizeInput(params.correlationId ?? 'req-untracked', 64),
      retryable: mapped.retryable,
      ...(params.fieldErrors ? { fieldErrors: params.fieldErrors } : {}),
    },
  };
}
// ============================================================================
// 3. PROMPT 403 — CENTRALIZED API INPUT & SCHEMA VALIDATOR
// ============================================================================
export function validateApiRequestPayload(input: {
  rawBody: unknown;
  allowedFields: readonly string[];
  requiredFields: readonly string[];
  numericBounds?: Record<string, { min: number; max: number; integerOnly?: boolean }>;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}): {
  valid: boolean;
  sanitizedBody: Record<string, unknown>;
  fieldErrors: Record<string, string>;
  rejectedUnknownFields: string[];
  displayAreaUnitLabel?: string;
  priceFieldIntlText?: string;
} {
  const fieldErrors: Record<string, string> = {};
  const rejectedUnknownFields: string[] = [];
  const sanitizedBody: Record<string, unknown> = {};
  if (!input.rawBody || typeof input.rawBody !== 'object' || Array.isArray(input.rawBody)) {
    return { valid: false, sanitizedBody: {}, fieldErrors: { _root: 'INVALID_JSON_OBJECT_ROOT' }, rejectedUnknownFields: [] };
  }
  const allowedSet = new Set(input.allowedFields);
  const rawObj = input.rawBody as Record<string, unknown>;
  for (const key of Object.keys(rawObj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype' || !allowedSet.has(key)) {
      rejectedUnknownFields.push(key);
      continue;
    }
    const val = rawObj[key];
    const bounds = input.numericBounds?.[key];
    if (bounds) {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        fieldErrors[key] = 'MUST_BE_FINITE_NUMBER';
        continue;
      }
      if (bounds.integerOnly && !Number.isInteger(val)) {
        fieldErrors[key] = 'MUST_BE_INTEGER';
        continue;
      }
      if (val < bounds.min || val > bounds.max) {
        fieldErrors[key] = `OUT_OF_RANGE_${bounds.min}_TO_${bounds.max}`;
        continue;
      }
      sanitizedBody[key] = val;
    } else if (key === 'city' && typeof val === 'string') {
      if (!VALID_CITY_IDS.has(val.trim().toLowerCase())) {
        fieldErrors[key] = 'INVALID_CITY_ID';
      } else {
        sanitizedBody[key] = val.trim().toLowerCase();
      }
    } else if (key === 'phone' && typeof val === 'string') {
      const clean = cleanIranianMobile(val);
      if (!isValidIranianMobile(clean)) {
        fieldErrors[key] = 'INVALID_IRAN_MOBILE';
      } else {
        sanitizedBody[key] = clean;
      }
    } else if (typeof val === 'string') {
      sanitizedBody[key] = sanitizeInput(val, 500);
    } else if (typeof val === 'boolean') {
      sanitizedBody[key] = val;
    } else if (typeof val === 'number') {
      if (!Number.isFinite(val)) {
        fieldErrors[key] = 'NON_FINITE_NUMBER_FORBIDDEN';
      } else {
        sanitizedBody[key] = val;
      }
    } else {
      fieldErrors[key] = 'UNSUPPORTED_FIELD_TYPE';
    }
  }
  for (const reqKey of input.requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(sanitizedBody, reqKey) || sanitizedBody[reqKey] === '' || sanitizedBody[reqKey] === null || sanitizedBody[reqKey] === undefined) {
      if (!fieldErrors[reqKey]) fieldErrors[reqKey] = 'REQUIRED_FIELD_MISSING';
    }
  }
  const resolvedUnit = input.areaUnit ?? getStoredAreaUnit();
  const resolvedCurrency = input.intlCurrency ?? getStoredIntlCurrency();
  const numericPrice = typeof sanitizedBody.pricePerSqm === 'number' ? sanitizedBody.pricePerSqm : typeof sanitizedBody.buyPerSqm === 'number' ? sanitizedBody.buyPerSqm : 180;
  return {
    valid: Object.keys(fieldErrors).length === 0 && rejectedUnknownFields.length === 0,
    sanitizedBody,
    fieldErrors,
    rejectedUnknownFields,
    displayAreaUnitLabel: formatAreaUnitLabel(resolvedUnit),
    priceFieldIntlText: formatMillionTomanAsIntlCurrency(numericPrice, resolvedCurrency),
  };
}
// ============================================================================
export type ApiOperationClass =
  | 'FAST_READ_API'
  | 'MARKET_PULSE_SYNC'
  | 'AI_CONTRACT_CHECK'
  | 'TELEGRAM_DISPATCH'
  | 'OBJECT_STORAGE_UPLOAD'
  | 'OSM_BOUNDARY_RESOLVE';
export const API_OPERATION_TIMEOUT_POLICIES: Record<ApiOperationClass, number> = {
  FAST_READ_API: 5_000,
  MARKET_PULSE_SYNC: 8_000,
  AI_CONTRACT_CHECK: 8_000,
  TELEGRAM_DISPATCH: 10_000,
  OBJECT_STORAGE_UPLOAD: 20_000,
  OSM_BOUNDARY_RESOLVE: 5_000,
};
export function serializeFirestoreAndDomainPayloadSafely(
  input: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (depth > 12) return '[MAX_DEPTH_EXCEEDED]';
  if (input === null || input === undefined) return null;
  if (typeof input === 'boolean' || typeof input === 'string') return input;
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.round(input * 10_000) / 10_000 : null;
  }
  if (input instanceof Date) {
    return Number.isFinite(input.getTime()) ? input.toISOString() : null;
  }
  if (typeof input === 'object') {
    if (seen.has(input as object)) return '[CIRCULAR_REF_STRIPPED]';
    seen.add(input as object);
    const candidate = input as Record<string, unknown>;
    if (typeof candidate.toDate === 'function') {
      try {
        const d = (candidate.toDate as () => Date)();
        return d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString() : null;
      } catch {
        return null;
      }
    }
    if (typeof candidate.seconds === 'number' && typeof candidate.nanoseconds === 'number' && Object.keys(candidate).length <= 2) {
      if (!Number.isFinite(candidate.seconds) || !Number.isFinite(candidate.nanoseconds)) return null;
      const d = new Date(candidate.seconds * 1000 + Math.round(candidate.nanoseconds / 1e6));
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    if (typeof candidate.latitude === 'number' && typeof candidate.longitude === 'number' && Object.keys(candidate).length === 2) {
      if (!Number.isFinite(candidate.latitude) || !Number.isFinite(candidate.longitude)) return null;
      return { lat: Number(candidate.latitude.toFixed(6)), lng: Number(candidate.longitude.toFixed(6)) };
    }
    if (Array.isArray(input)) {
      return input.slice(0, 500).map((item) => serializeFirestoreAndDomainPayloadSafely(item, seen, depth + 1));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(candidate)) {
      if (v === undefined || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (/^_firestore|password|secret|private[_-]?key|api[_-]?key|bot[_-]?token|access[_-]?token|refresh[_-]?token|authorization|cookie/i.test(k)) continue;
      out[k] = serializeFirestoreAndDomainPayloadSafely(v, seen, depth + 1);
    }
    return out;
  }
  return null;
}
export function evaluateCorsOriginPolicy(params: {
  requestOrigin: string | undefined;
  trustedOrigins: readonly string[];
  allowCredentials: boolean;
}): {
  originAllowed: boolean;
  accessControlAllowOriginHeader: string | null;
  wildcardWithCredentialsBlocked: boolean;
} {
  if (!params.requestOrigin) {
    return {
      originAllowed: true,
      accessControlAllowOriginHeader: null,
      wildcardWithCredentialsBlocked: false,
    };
  }
  const normalizedOrigin = params.requestOrigin.trim().replace(/\/+$/, '');
  const normalizedLower = normalizedOrigin.toLowerCase();
  if (normalizedLower === 'null') {
    return {
      originAllowed: false,
      accessControlAllowOriginHeader: null,
      wildcardWithCredentialsBlocked: false,
    };
  }
  if (normalizedOrigin === '*' && params.allowCredentials) {
    return {
      originAllowed: false,
      accessControlAllowOriginHeader: null,
      wildcardWithCredentialsBlocked: true,
    };
  }
  const trustedMap = new Map<string, string>();
  for (const o of params.trustedOrigins) {
    const clean = o.trim().replace(/\/+$/, '');
    if (clean.toLowerCase() !== 'null') trustedMap.set(clean.toLowerCase(), clean);
  }
  const canonicalOrigin = trustedMap.get(normalizedLower);
  if (!canonicalOrigin) {
    return {
      originAllowed: false,
      accessControlAllowOriginHeader: null,
      wildcardWithCredentialsBlocked: false,
    };
  }
  return {
    originAllowed: true,
    accessControlAllowOriginHeader: canonicalOrigin,
    wildcardWithCredentialsBlocked: false,
  };
}