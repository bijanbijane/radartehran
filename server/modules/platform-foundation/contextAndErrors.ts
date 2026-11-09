/**
 * @file server/modules/platform-foundation/contextAndErrors.ts
 * @description Deliverables D04 (Canonical Platform Execution Context) & D05 (Canonical Error Handling).
 */

import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { CoreApiError, type AuthenticatedPrincipal } from '../core';
import { CANONICAL_ERROR_CATALOG } from './seedCatalogs';
import type {
  ExecutionActorType,
  PlatformErrorCatalogEntry,
  PlatformErrorCategory,
  PlatformExecutionContext,
  RuntimeEnvironmentName,
} from './types';

const CORRELATION_ID_REGEX = /^[a-zA-Z0-9._:-]{6,128}$/;
const TRACE_ID_REGEX = /^[a-zA-Z0-9._:-]{8,128}$/;
const TENANT_ID_REGEX = /^[a-zA-Z0-9_-]{3,80}$/;

export const ALL_PLATFORM_ERROR_CATEGORIES: readonly PlatformErrorCategory[] = [
  'VALIDATION',
  'AUTHENTICATION',
  'AUTHORIZATION',
  'TENANT_ISOLATION',
  'NOT_FOUND',
  'CONFLICT',
  'BUSINESS_RULE',
  'DEPENDENCY_UNAVAILABLE',
  'RESOURCE_EXHAUSTED',
  'TIMEOUT',
  'INTEGRITY',
  'COMPLIANCE',
  'SECURITY',
  'INTERNAL',
];

const NON_RETRYABLE_CATEGORIES = new Set<PlatformErrorCategory>([
  'VALIDATION',
  'AUTHENTICATION',
  'AUTHORIZATION',
  'TENANT_ISOLATION',
  'NOT_FOUND',
  'CONFLICT',
  'BUSINESS_RULE',
  'INTEGRITY',
  'COMPLIANCE',
  'SECURITY',
  'INTERNAL',
]);

export function validateCorrelationId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!CORRELATION_ID_REGEX.test(trimmed)) return null;
  return trimmed;
}

export function validateTraceId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!TRACE_ID_REGEX.test(trimmed)) return null;
  return trimmed;
}

export function resolveRuntimeEnvironmentName(rawEnv?: string): RuntimeEnvironmentName {
  const val = (rawEnv ?? process.env.NODE_ENV ?? 'development').trim().toLowerCase();
  if (val === 'production') return 'production';
  if (val === 'staging') return 'staging';
  if (val === 'test') return 'test';
  return 'development';
}

export interface CreateExecutionContextInput {
  correlationId?: unknown;
  traceId?: unknown;
  causationId?: unknown;
  principal?: AuthenticatedPrincipal | null;
  sourceModule?: string;
  operationName?: string;
  environment?: RuntimeEnvironmentName;
  clientRequestedTenantId?: unknown;
  serverVerifiedTenantContext?: {
    tenantId: string;
    organizationId?: string | null;
    membershipId?: string | null;
  } | null;
  // Untrusted client fields that MUST be ignored if passed from external request headers/body
  untrustedClientActorId?: unknown;
  untrustedClientPermissions?: unknown;
}

/**
 * D04 — Creates a trusted server-side PlatformExecutionContext.
 * Always generates a fresh server-side requestId, validates incoming correlationId,
 * and never trusts client-supplied tenantId or actorId as proof of authorization.
 */
export function createPlatformExecutionContext(
  input: CreateExecutionContextInput = {},
): PlatformExecutionContext {
  const requestId = `req_${randomUUID().replace(/-/g, '')}`;
  const validCorrelation = validateCorrelationId(input.correlationId);
  const correlationId = validCorrelation ?? `corr_${randomUUID().replace(/-/g, '')}`;
  const traceId = validateTraceId(input.traceId);
  const causationId = validateCorrelationId(input.causationId);

  const principal = input.principal ?? null;
  let actorType: ExecutionActorType = 'ANONYMOUS';
  let actorId: string | null = null;
  let actorRole = 'anonymous';
  let permissions: string[] = [];

  if (principal && typeof principal.uid === 'string' && principal.uid.trim().length > 0) {
    actorId = principal.uid.trim();
    actorRole = principal.role;
    if (principal.role === 'primary_admin') {
      actorType = 'PRIMARY_ADMIN';
      permissions = ['platform:admin:read', 'platform:admin:write', 'platform:admin:governance'];
    } else if (principal.role === 'delegated_admin' || principal.role === 'server_secret_admin') {
      actorType = 'ADMIN_OPERATOR';
      permissions = ['platform:admin:read', 'platform:admin:write'];
    } else {
      actorType = 'AUTHENTICATED_USER';
      permissions = ['platform:user:read'];
    }
    const claimScopes = (principal.claims as { scopes?: unknown })?.scopes;
    if (Array.isArray(claimScopes)) {
      for (const s of claimScopes) {
        if (typeof s === 'string' && s.trim() && !permissions.includes(s.trim())) {
          permissions.push(s.trim());
        }
      }
    }
  }

  let requestedTenantId: string | null = null;
  if (
    typeof input.clientRequestedTenantId === 'string' &&
    TENANT_ID_REGEX.test(input.clientRequestedTenantId.trim())
  ) {
    requestedTenantId = input.clientRequestedTenantId.trim();
  }

  const verifiedTenant = input.serverVerifiedTenantContext ?? null;

  return {
    requestId,
    correlationId,
    traceId,
    causationId,
    actorId,
    actorType,
    actorRole,
    permissions,
    sourceModule: (input.sourceModule ?? 'platform-integration-resilience').trim(),
    operationName: (input.operationName ?? 'http.request').trim(),
    environment: input.environment ?? resolveRuntimeEnvironmentName(),
    requestedTenantId: verifiedTenant ? verifiedTenant.tenantId : requestedTenantId,
    verifiedTenantId: verifiedTenant ? verifiedTenant.tenantId : null,
    verifiedOrganizationId: verifiedTenant?.organizationId ?? null,
    membershipId: verifiedTenant?.membershipId ?? null,
    tenantResolutionStatus: verifiedTenant
      ? 'SERVER_VERIFIED'
      : requestedTenantId
        ? 'UNVERIFIED_CLIENT_HINT'
        : 'NOT_REQUESTED',
    authorizationVersion: 1,
    resolvedAt: new Date().toISOString(),
  };
}

/**
 * D04 — Propagates execution context across internal service calls or background steps.
 */
export function propagateExecutionContext(
  parent: PlatformExecutionContext,
  nextHop: {
    sourceModule: string;
    operationName: string;
  },
): PlatformExecutionContext {
  return {
    ...parent,
    requestId: `req_${randomUUID().replace(/-/g, '')}`,
    causationId: parent.requestId,
    sourceModule: nextHop.sourceModule.trim(),
    operationName: nextHop.operationName.trim(),
    resolvedAt: new Date().toISOString(),
  };
}

export type RequestWithPlatformContext = Request & {
  platformContext?: PlatformExecutionContext;
};

/**
 * D04 — Express middleware attaching a canonical PlatformExecutionContext to the request.
 */
export function platformExecutionContextMiddleware(
  req: RequestWithPlatformContext,
  res: Response,
  next: NextFunction,
): void {
  const rawCorrelation =
    req.headers['x-correlation-id'] ?? req.headers['x-request-id'] ?? undefined;
  const rawTrace = req.headers['x-trace-id'] ?? req.headers['traceparent'] ?? undefined;
  const rawRequestedTenant = req.headers['x-tenant-id'] ?? undefined;

  const ctx = createPlatformExecutionContext({
    correlationId: Array.isArray(rawCorrelation) ? rawCorrelation[0] : rawCorrelation,
    traceId: Array.isArray(rawTrace) ? rawTrace[0] : rawTrace,
    sourceModule: 'platform-http-gateway',
    operationName: `${req.method} ${req.path}`,
    clientRequestedTenantId: Array.isArray(rawRequestedTenant)
      ? rawRequestedTenant[0]
      : rawRequestedTenant,
  });

  req.platformContext = ctx;
  res.setHeader('X-Request-Id', ctx.requestId);
  res.setHeader('X-Correlation-Id', ctx.correlationId);
  next();
}

/**
 * D05 — Redacts secret patterns, tokens, connection strings, and stack traces from public error strings.
 */
export function redactSensitiveErrorText(rawMessage: string): string {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return 'An unexpected error occurred.';
  }
  return rawMessage
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/sk-[0-9A-Za-z_-]{16,}/g, '[REDACTED_SECRET_KEY]')
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[REDACTED_DB_URI]')
    .replace(/(?:password|secret|token|apiKey)\s*[:=]\s*['"]?[^\s'",;]+['"]?/gi, '[REDACTED_CREDENTIAL]')
    .split('\n')[0]
    .slice(0, 320);
}

/**
 * D05 — Canonical Application Error class with category, HTTP status, retryability, and owning module.
 */
export class PlatformApplicationError extends Error {
  public readonly code: string;
  public readonly category: PlatformErrorCategory;
  public readonly httpStatus: number;
  public readonly retryable: boolean;
  public readonly owningModule: string;
  public readonly correlationId: string | null;
  public readonly details: Record<string, unknown>[];

  constructor(params: {
    code: string;
    category: PlatformErrorCategory;
    message: string;
    httpStatus?: number;
    retryable?: boolean;
    owningModule?: string;
    correlationId?: string | null;
    details?: Record<string, unknown>[];
  }) {
    const safeMsg = redactSensitiveErrorText(params.message);
    super(safeMsg);
    this.name = 'PlatformApplicationError';
    this.code = params.code.trim().toUpperCase();
    this.category = params.category;
    this.httpStatus = params.httpStatus ?? defaultHttpStatusForCategory(params.category);
    // Permanent business, validation, auth, tenant isolation, compliance, and security errors are never retryable
    this.retryable = NON_RETRYABLE_CATEGORIES.has(params.category)
      ? false
      : Boolean(params.retryable ?? true);
    this.owningModule = (params.owningModule ?? 'platform-integration-resilience').trim();
    this.correlationId = params.correlationId ?? null;
    this.details = Array.isArray(params.details) ? params.details : [];
  }
}

export function defaultHttpStatusForCategory(category: PlatformErrorCategory): number {
  switch (category) {
    case 'VALIDATION':
      return 400;
    case 'AUTHENTICATION':
      return 401;
    case 'AUTHORIZATION':
    case 'TENANT_ISOLATION':
    case 'SECURITY':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
    case 'INTEGRITY':
      return 409;
    case 'BUSINESS_RULE':
      return 422;
    case 'COMPLIANCE':
      return 423;
    case 'RESOURCE_EXHAUSTED':
      return 429;
    case 'DEPENDENCY_UNAVAILABLE':
      return 503;
    case 'TIMEOUT':
      return 504;
    case 'INTERNAL':
    default:
      return 500;
  }
}

export function getCanonicalErrorCatalog(): readonly PlatformErrorCatalogEntry[] {
  return CANONICAL_ERROR_CATALOG;
}

export function toCanonicalSuccessResponse<T>(
  data: T,
  ctx?: Partial<PlatformExecutionContext>,
  nextCursor: string | null = null,
) {
  return {
    success: true as const,
    data,
    meta: {
      requestId: ctx?.requestId ?? `req_${randomUUID().replace(/-/g, '')}`,
      correlationId: ctx?.correlationId ?? `corr_${randomUUID().replace(/-/g, '')}`,
      timestamp: new Date().toISOString(),
      nextCursor,
    },
  };
}

export function toCanonicalErrorResponse(
  err: unknown,
  ctx?: Partial<PlatformExecutionContext>,
): {
  statusCode: number;
  body: {
    success: false;
    error: {
      code: string;
      category: PlatformErrorCategory;
      message: string;
      details: Record<string, unknown>[];
      retryable: boolean;
      owningModule: string;
    };
    meta: {
      requestId: string;
      correlationId: string;
      timestamp: string;
    };
  };
} {
  const requestId = ctx?.requestId ?? `req_${randomUUID().replace(/-/g, '')}`;
  const correlationId = ctx?.correlationId ?? `corr_${randomUUID().replace(/-/g, '')}`;
  const timestamp = new Date().toISOString();

  if (err instanceof PlatformApplicationError) {
    return {
      statusCode: err.httpStatus,
      body: {
        success: false,
        error: {
          code: err.code,
          category: err.category,
          message: redactSensitiveErrorText(err.message),
          details: err.details,
          retryable: err.retryable,
          owningModule: err.owningModule,
        },
        meta: {
          requestId,
          correlationId: err.correlationId ?? correlationId,
          timestamp,
        },
      },
    };
  }

  if (err instanceof CoreApiError) {
    const categoryMap: Record<string, PlatformErrorCategory> = {
      AUTH_REQUIRED: 'AUTHENTICATION',
      FORBIDDEN: 'AUTHORIZATION',
      NOT_FOUND: 'NOT_FOUND',
      VALIDATION_FAILED: 'VALIDATION',
      CONFLICT: 'CONFLICT',
      RATE_LIMITED: 'RESOURCE_EXHAUSTED',
      PERSISTENCE_FAILED: 'DEPENDENCY_UNAVAILABLE',
      INTERNAL_ERROR: 'INTERNAL',
    };
    const category = categoryMap[err.code] ?? 'INTERNAL';
    const retryable = !NON_RETRYABLE_CATEGORIES.has(category);
    const normalizedDetails: Record<string, unknown>[] = Array.isArray(err.details)
      ? err.details.map((issue) => ({ ...issue }))
      : err.details
        ? [err.details]
        : [];
    return {
      statusCode: err.status,
      body: {
        success: false,
        error: {
          code: err.code,
          category,
          message: redactSensitiveErrorText(err.message),
          details: normalizedDetails,
          retryable,
          owningModule: ctx?.sourceModule ?? 'platform-integration-resilience',
        },
        meta: { requestId, correlationId, timestamp },
      },
    };
  }

  // Generic unhandled error: never leak internal message or stack trace
  return {
    statusCode: 500,
    body: {
      success: false,
      error: {
        code: 'INTERNAL_PLATFORM_ERROR',
        category: 'INTERNAL',
        message: 'An unexpected internal platform error occurred.',
        details: [],
        retryable: false,
        owningModule: ctx?.sourceModule ?? 'platform-integration-resilience',
      },
      meta: { requestId, correlationId, timestamp },
    },
  };
}
