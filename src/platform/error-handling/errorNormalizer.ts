/** @file src/platform/error-handling/errorNormalizer.ts — Safe Error Normalization & Secret/Stack Redaction (Max 2 KB) */
import { generateCorrelationId, truncateUtf8Safe } from '../../shared/utilities';
import { ERROR_USER_MESSAGES_FA } from './errorCodes';
import type { ErrorBoundaryLevel, FrontendErrorCategory, NormalizedFrontendError } from './errorTypes';

export const MAX_ERROR_MESSAGE_BYTES = 2048;
export const ERROR_PAYLOAD_MAX_BYTES = MAX_ERROR_MESSAGE_BYTES;

const SENSITIVE_KEY_NAMES = /token|password|secret|authorization|cookie|apikey|api_key/i;

const SECRET_AND_INTERNAL_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /AIza[0-9A-Za-z\-_]{30,}/g,
  /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g,
  /at\s+[^\n]+\([^\n]+\)/g,
  /D1_ERROR:[^\n]*/gi,
  /SQLITE_[A-Z_]+/gi,
];

export function redactSensitiveErrorText(raw: string): string {
  let cleaned = String(raw || '').trim();
  for (const pattern of SECRET_AND_INTERNAL_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return truncateUtf8Safe(cleaned, MAX_ERROR_MESSAGE_BYTES);
}

export function sanitizeErrorDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details || typeof details !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (SENSITIVE_KEY_NAMES.test(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string') {
      out[k] = truncateUtf8Safe(redactSensitiveErrorText(v), 512);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export interface NormalizeErrorInput {
  readonly error: unknown;
  readonly status?: number;
  readonly level?: ErrorBoundaryLevel;
  readonly correlationId?: string;
  readonly retryAfterSeconds?: number;
  readonly lockReasonFa?: string;
  readonly featureDisabled?: boolean;
  readonly details?: Record<string, unknown>;
}

export function normalizeFrontendError(
  input: NormalizeErrorInput
): NormalizedFrontendError & { details?: Record<string, unknown> } {
  const level: ErrorBoundaryLevel = input.level ?? 'request';
  const correlationId = input.correlationId || generateCorrelationId('err');
  const rawMessage =
    input.error instanceof Error
      ? input.error.message
      : typeof input.error === 'string'
        ? input.error
        : typeof (input.error as { message?: string } | null)?.message === 'string'
          ? (input.error as { message: string }).message
          : 'Unknown error';
  const technicalMessage = truncateUtf8Safe(redactSensitiveErrorText(rawMessage), 512);
  const lower = technicalMessage.toLowerCase();

  let category: FrontendErrorCategory = 'UNKNOWN_ERROR';
  let retryable = false;

  if (input.featureDisabled || lower.includes('feature_disabled') || lower.includes('feature disabled')) {
    category = 'FEATURE_DISABLED';
    retryable = false;
  } else if (input.status === 401 || lower.includes('unauthorized') || lower.includes('token_expired')) {
    category = 'UNAUTHORIZED_401';
    retryable = true;
  } else if (input.status === 403 || lower.includes('forbidden') || lower.includes('access_denied')) {
    category = 'FORBIDDEN_403';
    retryable = false;
  } else if (input.status === 404 || lower.includes('not_found')) {
    category = 'NOT_FOUND_404';
    retryable = false;
  } else if (input.status === 423 || lower.includes('locked')) {
    category = 'RESOURCE_LOCKED_423';
    retryable = false;
  } else if (input.status === 429 || lower.includes('rate_limit') || lower.includes('too many requests')) {
    category = 'RATE_LIMITED_429';
    retryable = true;
  } else if ((input.status && input.status >= 500) || lower.includes('502') || lower.includes('503')) {
    category = 'SERVER_ERROR_5XX';
    retryable = true;
  } else if (lower.includes('timeout') || lower.includes('aborted')) {
    category = 'REQUEST_TIMEOUT';
    retryable = true;
  } else if (lower.includes('offline') || lower.includes('failed to fetch') || lower.includes('networkerror')) {
    category = 'NETWORK_OFFLINE';
    retryable = true;
  } else if (lower.includes('quotaexceeded')) {
    category = 'STORAGE_QUOTA';
    retryable = true;
  } else if (lower.includes('chunkloaderror') || lower.includes('dynamically imported module')) {
    category = 'CHUNK_LOAD_ERROR';
    retryable = true;
  } else if (input.status === 400 || input.status === 422 || lower.includes('validation')) {
    category = 'VALIDATION_ERROR';
    retryable = false;
  }

  const retryAfterMs =
    typeof input.retryAfterSeconds === 'number' && input.retryAfterSeconds > 0
      ? Math.min(300_000, Math.round(input.retryAfterSeconds * 1000))
      : undefined;

  const details = sanitizeErrorDetails(
    input.details ?? (input.error as { details?: Record<string, unknown> } | null)?.details
  );

  return {
    code: `RT_${category}`,
    category,
    level,
    status: input.status ?? (input.error as { status?: number } | null)?.status,
    userMessageFa: input.lockReasonFa
      ? `${ERROR_USER_MESSAGES_FA[category]} (${redactSensitiveErrorText(input.lockReasonFa)})`
      : ERROR_USER_MESSAGES_FA[category],
    technicalMessage,
    retryable,
    retryAfterMs,
    correlationId,
    timestampIso: new Date().toISOString(),
    lockReasonFa: input.lockReasonFa,
    ...(details ? { details } : {}),
  };
}

export function normalizeError(
  rawError: unknown,
  context?: Record<string, unknown>
): NormalizedFrontendError & { details?: Record<string, unknown> } {
  const status = (rawError as { status?: number } | null)?.status;
  return normalizeFrontendError({
    error: rawError,
    status,
    details: (rawError as { details?: Record<string, unknown> } | null)?.details ?? context,
  });
}
