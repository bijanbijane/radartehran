import crypto from 'crypto';
import type { Request, Response } from 'express';
import { UNTRUSTED_REQUEST_IDENTITY_FIELDS } from './authAndAuthz';
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  CanonicalApiErrorCode,
  ExpressHandlerLike,
  FieldValidator,
  NormalizedTimestamp,
  PaginatedApiEnvelope,
  PaginationCursorPayload,
  PaginationParams,
  ValidationIssue,
  ValidationResult,
} from './types';

const SAFE_FIRESTORE_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

export function sanitizeTextInput(raw: string): string {
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

export function requireNonEmptyString(options?: {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}): FieldValidator<string> {
  const minLength = options?.minLength ?? 1;
  const maxLength = options?.maxLength ?? 500;
  return (rawValue: unknown, fieldName: string): ValidationResult<string> => {
    if (typeof rawValue !== 'string') {
      return { ok: false, issues: [{ field: fieldName, code: 'INVALID_TYPE', message: `${fieldName} must be a string.` }] };
    }
    const cleaned = sanitizeTextInput(rawValue);
    if (cleaned.length < minLength) {
      return { ok: false, issues: [{ field: fieldName, code: 'STRING_TOO_SHORT', message: `${fieldName} must be at least ${minLength} characters.` }] };
    }
    if (cleaned.length > maxLength) {
      return { ok: false, issues: [{ field: fieldName, code: 'STRING_TOO_LONG', message: `${fieldName} must be at most ${maxLength} characters.` }] };
    }
    if (options?.pattern && !options.pattern.test(cleaned)) {
      return { ok: false, issues: [{ field: fieldName, code: 'INVALID_FORMAT', message: `${fieldName} has an invalid format.` }] };
    }
    return { ok: true, value: cleaned, issues: [] };
  };
}

export function requireSafeFirestoreId(): FieldValidator<string> {
  return (rawValue: unknown, fieldName: string): ValidationResult<string> => {
    if (typeof rawValue !== 'string') {
      return { ok: false, issues: [{ field: fieldName, code: 'INVALID_TYPE', message: `${fieldName} must be a string ID.` }] };
    }
    const trimmed = rawValue.trim();
    if (!SAFE_FIRESTORE_ID_REGEX.test(trimmed) || trimmed === '.' || trimmed === '..' || trimmed.startsWith('__')) {
      return { ok: false, issues: [{ field: fieldName, code: 'INVALID_FORMAT', message: `${fieldName} is not a valid Firestore document ID.` }] };
    }
    return { ok: true, value: trimmed, issues: [] };
  };
}

export function requireFiniteNumberInRange(options: {
  min: number;
  max: number;
  integerOnly?: boolean;
}): FieldValidator<number> {
  return (rawValue: unknown, fieldName: string): ValidationResult<number> => {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
      return { ok: false, issues: [{ field: fieldName, code: 'INVALID_TYPE', message: `${fieldName} must be a finite number.` }] };
    }
    if (options.integerOnly && !Number.isInteger(rawValue)) {
      return { ok: false, issues: [{ field: fieldName, code: 'INVALID_FORMAT', message: `${fieldName} must be an integer.` }] };
    }
    if (rawValue < options.min || rawValue > options.max) {
      return { ok: false, issues: [{ field: fieldName, code: 'NUMBER_OUT_OF_RANGE', message: `${fieldName} must be between ${options.min} and ${options.max}.` }] };
    }
    return { ok: true, value: rawValue, issues: [] };
  };
}

export function requireEnumValue<T extends string>(allowedValues: readonly T[]): FieldValidator<T> {
  return (rawValue: unknown, fieldName: string): ValidationResult<T> => {
    if (typeof rawValue !== 'string' || !allowedValues.includes(rawValue as T)) {
      return { ok: false, issues: [{ field: fieldName, code: 'INVALID_ENUM_VALUE', message: `${fieldName} must be one of: ${allowedValues.join(', ')}.` }] };
    }
    return { ok: true, value: rawValue as T, issues: [] };
  };
}

export function validateObjectSchema<T extends Record<string, unknown>>(
  rawInput: unknown,
  schema: { [K in keyof T]: FieldValidator<T[K]> },
  options?: {
    optionalFields?: ReadonlyArray<keyof T>;
    allowUnknownFields?: boolean;
    rejectUntrustedIdentityFields?: boolean;
  },
): ValidationResult<T> {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return { ok: false, issues: [{ field: '$root', code: 'INVALID_TYPE', message: 'Request body must be a JSON object.' }] };
  }
  const inputRecord = rawInput as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  const optionalSet = new Set<string>((options?.optionalFields ?? []).map(String));
  const schemaKeys = new Set<string>(Object.keys(schema));
  const rejectIdentity = options?.rejectUntrustedIdentityFields ?? true;

  for (const key of Object.keys(inputRecord)) {
    if (rejectIdentity && UNTRUSTED_REQUEST_IDENTITY_FIELDS.has(key) && !schemaKeys.has(key)) {
      issues.push({
        field: key,
        code: 'UNTRUSTED_IDENTITY_FIELD',
        message: `Field "${key}" cannot be supplied by client; identity/role is derived server-side.`,
      });
    } else if (!options?.allowUnknownFields && !schemaKeys.has(key)) {
      issues.push({ field: key, code: 'UNKNOWN_FIELD_REJECTED', message: `Unknown field "${key}" is not allowed.` });
    }
  }

  const output: Record<string, unknown> = {};
  for (const [key, validator] of Object.entries(schema)) {
    const rawVal = inputRecord[key];
    if (rawVal === undefined || rawVal === null) {
      if (!optionalSet.has(key)) {
        issues.push({ field: key, code: 'REQUIRED_FIELD_MISSING', message: `Field "${key}" is required.` });
      }
      continue;
    }
    const fieldResult = validator(rawVal, key);
    if (!fieldResult.ok) issues.push(...fieldResult.issues);
    else output[key] = fieldResult.value;
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: output as T, issues: [] };
}

export function normalizeFirestoreTimestamp(raw: unknown): NormalizedTimestamp | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return normalizeFirestoreTimestamp(raw.getTime());
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null;
    const ms = Math.trunc(raw);
    return {
      iso: new Date(ms).toISOString(),
      epochMs: ms,
      seconds: Math.floor(ms / 1000),
      nanoseconds: (ms % 1000) * 1_000_000,
    };
  }
  if (typeof raw === 'string') {
    const parsedMs = Date.parse(raw);
    return Number.isFinite(parsedMs) && parsedMs >= 0 ? normalizeFirestoreTimestamp(parsedMs) : null;
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.toMillis === 'function') return normalizeFirestoreTimestamp((obj.toMillis as () => number)());
    const sec = typeof obj.seconds === 'number' ? obj.seconds : typeof obj._seconds === 'number' ? obj._seconds : null;
    const nano = typeof obj.nanoseconds === 'number' ? obj.nanoseconds : typeof obj._nanoseconds === 'number' ? obj._nanoseconds : 0;
    if (sec !== null && Number.isFinite(sec) && Number.isFinite(nano) && sec >= 0 && nano >= 0) {
      const epochMs = Math.trunc(sec * 1000 + Math.floor(nano / 1_000_000));
      return { iso: new Date(epochMs).toISOString(), epochMs, seconds: Math.trunc(sec), nanoseconds: Math.trunc(nano) };
    }
  }
  return null;
}

export function normalizePaginationParams(
  query: Record<string, unknown> | null | undefined,
  options?: { defaultLimit?: number; maxLimit?: number },
): PaginationParams {
  const defaultLimit = options?.defaultLimit ?? 20;
  const maxLimit = options?.maxLimit ?? 100;
  const rawLimit = query?.limit;
  const parsed = typeof rawLimit === 'number' ? rawLimit : typeof rawLimit === 'string' && rawLimit.trim() !== '' ? Number(rawLimit) : defaultLimit;
  const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(maxLimit, Math.trunc(parsed))) : defaultLimit;
  const cursor = typeof query?.cursor === 'string' && query.cursor.trim() ? query.cursor.trim() : null;
  const direction = query?.direction === 'asc' ? 'asc' : 'desc';
  return { limit, cursor, direction };
}

export function encodePaginationCursor(
  payload: PaginationCursorPayload,
  signingSecret = 'radartehran-core-cursor-v1',
): string {
  const bodyB64 = Buffer.from(
    JSON.stringify({ s: payload.sortValue, id: payload.docId, d: payload.direction }),
    'utf8',
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', signingSecret).update(bodyB64, 'utf8').digest('base64url').slice(0, 24);
  return `${bodyB64}.${sig}`;
}

export function decodePaginationCursor(
  cursorToken: string,
  signingSecret = 'radartehran-core-cursor-v1',
): PaginationCursorPayload | null {
  if (typeof cursorToken !== 'string' || !cursorToken.includes('.')) return null;
  const parts = cursorToken.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [bodyB64, providedSig] = parts;
  const expectedSig = crypto.createHmac('sha256', signingSecret).update(bodyB64, 'utf8').digest('base64url').slice(0, 24);
  const bufA = Buffer.from(providedSig, 'utf8');
  const bufB = Buffer.from(expectedSig, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (
      (typeof parsed.s !== 'string' && typeof parsed.s !== 'number') ||
      typeof parsed.id !== 'string' ||
      !SAFE_FIRESTORE_ID_REGEX.test(parsed.id) ||
      (parsed.d !== 'asc' && parsed.d !== 'desc')
    ) {
      return null;
    }
    return { sortValue: parsed.s, docId: parsed.id, direction: parsed.d };
  } catch {
    return null;
  }
}

export class CoreApiError extends Error {
  public readonly code: CanonicalApiErrorCode;
  public readonly status: number;
  public readonly details?: ValidationIssue[] | Record<string, unknown>;

  constructor(
    code: CanonicalApiErrorCode,
    status: number,
    message: string,
    details?: ValidationIssue[] | Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CoreApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function redactSensitiveErrorText(rawMessage: string): string {
  return rawMessage
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]{30,45}/g, '[REDACTED_API_KEY]')
    .replace(/(password|secret|token|authorization)\s*[:=]\s*\S+/gi, '$1=[REDACTED]');
}

export function resolveCorrelationId(req?: Pick<Request, 'headers'>): string {
  const headerVal = req?.headers?.['x-correlation-id'] ?? req?.headers?.['x-request-id'];
  if (typeof headerVal === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(headerVal.trim())) {
    return headerVal.trim();
  }
  return `rt_${crypto.randomUUID()}`;
}

export function applyNoStoreSecurityHeaders(res: Pick<Response, 'setHeader'>, correlationId: string): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Correlation-Id', correlationId);
}

export function buildSuccessEnvelope<T>(
  data: T,
  correlationId: string,
  options?: { idempotentReplay?: boolean; nowIso?: string },
): ApiSuccessEnvelope<T> {
  return {
    ok: true,
    data,
    meta: {
      correlationId,
      timestampIso: options?.nowIso ?? new Date().toISOString(),
      ...(options?.idempotentReplay !== undefined ? { idempotentReplay: options.idempotentReplay } : {}),
    },
  };
}

export function buildPaginatedEnvelope<T>(
  items: T[],
  pagination: { limit: number; hasMore: boolean; nextCursor: string | null; totalCount?: number },
  correlationId: string,
  nowIso?: string,
): PaginatedApiEnvelope<T> {
  return {
    ok: true,
    data: items,
    pagination,
    meta: { correlationId, timestampIso: nowIso ?? new Date().toISOString() },
  };
}

export function buildErrorEnvelope(
  code: CanonicalApiErrorCode,
  message: string,
  correlationId: string,
  details?: ValidationIssue[] | Record<string, unknown>,
  nowIso?: string,
): ApiErrorEnvelope {
  return {
    ok: false,
    error: {
      code,
      message: redactSensitiveErrorText(message),
      correlationId,
      timestampIso: nowIso ?? new Date().toISOString(),
      ...(details ? { details } : {}),
    },
  };
}

export function withStandardErrorBoundary(handler: ExpressHandlerLike): ExpressHandlerLike {
  return async (req: Request, res: Response): Promise<void> => {
    const correlationId = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, correlationId);
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof CoreApiError) {
        res.status(err.status).json(buildErrorEnvelope(err.code, err.message, correlationId, err.details));
        return;
      }
      const fallbackMsg = err instanceof Error ? redactSensitiveErrorText(err.message) : 'Unexpected server error.';
      res.status(500).json(buildErrorEnvelope('INTERNAL_ERROR', fallbackMsg, correlationId));
    }
  };
}
