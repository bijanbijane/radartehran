/**
 * Cross-application API contracts (runtime-independent).
 * Express route catalog remains backend-owned in apps/api / src/utils/expressRouteCatalog.ts.
 */

export type StandardApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN_INSUFFICIENT_ROLE'
  | 'RESOURCE_NOT_FOUND'
  | 'IDEMPOTENCY_OR_VERSION_CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'UPSTREAM_TIMEOUT'
  | 'INTERNAL_SERVER_ERROR';

export interface StandardApiSuccessEnvelope<T> {
  status: 'ok';
  correlationId: string;
  timestampIso: string;
  data: T;
}

export interface StandardApiErrorEnvelope {
  status: 'error';
  code: StandardApiErrorCode;
  message: string;
  correlationId: string;
  retryable: boolean;
  fieldErrors?: Record<string, string>;
}

export function buildStandardApiSuccess<T>(
  data: T,
  correlationId = 'req-default',
  nowIso = new Date().toISOString(),
): StandardApiSuccessEnvelope<T> {
  return {
    status: 'ok',
    correlationId: correlationId.slice(0, 64),
    timestampIso: nowIso,
    data,
  };
}

const STANDARD_API_STATUS_MAP: Record<
  StandardApiErrorCode,
  { status: number; retryable: boolean }
> = {
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

export function mapExceptionToStandardApiResponse(params: {
  errorCategory: StandardApiErrorCode;
  userMessageFa: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
}): {
  httpStatus: number;
  body: StandardApiErrorEnvelope;
} {
  const mapped =
    STANDARD_API_STATUS_MAP[params.errorCategory] ?? STANDARD_API_STATUS_MAP.INTERNAL_SERVER_ERROR;
  const message = params.userMessageFa.slice(0, 240);
  const correlationId = (params.correlationId ?? 'req-untracked').slice(0, 64);
  return {
    httpStatus: mapped.status,
    body: {
      status: 'error',
      code: params.errorCategory,
      message,
      correlationId,
      retryable: mapped.retryable,
      ...(params.fieldErrors ? { fieldErrors: params.fieldErrors } : {}),
    },
  };
}