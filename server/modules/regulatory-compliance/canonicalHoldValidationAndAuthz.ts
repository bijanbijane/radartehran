import crypto from 'crypto';
import {
  CanonicalApiErrorEnvelope,
  CanonicalApiSuccessEnvelope,
  CanonicalErrorCode,
  CanonicalHoldActor,
  CanonicalHoldPermission,
  CanonicalLegalHold,
  CanonicalLegalHoldScope,
} from './canonicalHoldModels';

const ERROR_STATUS_MAP: Record<CanonicalErrorCode, { status: number; retryable: boolean }> = {
  VALIDATION_ERROR: { status: 400, retryable: false },
  UNAUTHENTICATED: { status: 401, retryable: false },
  FORBIDDEN: { status: 403, retryable: false },
  RESOURCE_NOT_FOUND: { status: 404, retryable: false },
  VERSION_CONFLICT: { status: 409, retryable: false },
  INVALID_STATE_TRANSITION: { status: 409, retryable: false },
  ACTIVE_LEGAL_HOLD: { status: 409, retryable: false },
  RETENTION_OBLIGATION_ACTIVE: { status: 409, retryable: false },
  DISPOSITION_NOT_APPROVED: { status: 409, retryable: false },
  EVALUATION_STALE: { status: 409, retryable: true },
  CONFLICTING_PRESERVATION_INSTRUCTIONS: { status: 409, retryable: false },
  LEGAL_BASIS_UNVERIFIED: { status: 422, retryable: false },
  SCOPE_INVALID: { status: 422, retryable: false },
  RETENTION_SERVICE_UNAVAILABLE: { status: 503, retryable: true },
  SOURCE_MODULE_UNAVAILABLE: { status: 503, retryable: true },
};

const UNTRUSTED_CLIENT_AUTH_FIELDS = new Set([
  'actorId',
  'actorRole',
  'permissions',
  'roles',
  'isAdmin',
  'isSuperAdmin',
  'bypassAuth',
]);

export class CanonicalHoldApiError extends Error {
  public readonly code: CanonicalErrorCode;
  public readonly statusCode: number;
  public readonly details: Array<Record<string, unknown>>;
  public readonly retryable: boolean;

  constructor(
    code: CanonicalErrorCode,
    message: string,
    details: Array<Record<string, unknown>> = [],
  ) {
    super(message);
    this.name = 'CanonicalHoldApiError';
    this.code = code;
    const mapped = ERROR_STATUS_MAP[code] ?? { status: 400, retryable: false };
    this.statusCode = mapped.status;
    this.retryable = mapped.retryable;
    this.details = details;
  }
}

export function sanitizePublicMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(secret|token|password|private_key)\s*[:=]\s*\S+/gi, '$1=[REDACTED]');
}

export function buildCanonicalSuccessEnvelope<T>(
  data: T,
  correlationId?: string,
  requestId?: string,
): CanonicalApiSuccessEnvelope<T> {
  const corr = correlationId || `corr_${crypto.randomBytes(6).toString('hex')}`;
  const reqId = requestId || `req_${crypto.randomBytes(6).toString('hex')}`;
  return {
    success: true,
    data,
    meta: {
      requestId: reqId,
      correlationId: corr,
      timestamp: new Date().toISOString(),
    },
  };
}

export function buildCanonicalErrorEnvelope(
  err: unknown,
  correlationId?: string,
  requestId?: string,
): { statusCode: number; body: CanonicalApiErrorEnvelope } {
  const corr = correlationId || `corr_${crypto.randomBytes(6).toString('hex')}`;
  const reqId = requestId || `req_${crypto.randomBytes(6).toString('hex')}`;
  if (err instanceof CanonicalHoldApiError) {
    return {
      statusCode: err.statusCode,
      body: {
        success: false,
        error: {
          code: err.code,
          message: sanitizePublicMessage(err.message),
          details: err.details,
          retryable: err.retryable,
        },
        meta: {
          requestId: reqId,
          correlationId: corr,
          timestamp: new Date().toISOString(),
        },
      },
    };
  }
  return {
    statusCode: 400,
    body: {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err instanceof Error ? sanitizePublicMessage(err.message) : 'Invalid request.',
        details: [],
        retryable: false,
      },
      meta: {
        requestId: reqId,
        correlationId: corr,
        timestamp: new Date().toISOString(),
      },
    },
  };
}

export function requireCanonicalHoldPermission(
  actor: CanonicalHoldActor | null | undefined,
  permission: CanonicalHoldPermission,
): CanonicalHoldActor {
  if (!actor || !actor.actorId || !actor.tenantId) {
    throw new CanonicalHoldApiError('UNAUTHENTICATED', 'Authenticated actor context with tenant scope is required.');
  }
  if (!Array.isArray(actor.permissions) || !actor.permissions.includes(permission)) {
    throw new CanonicalHoldApiError(
      'FORBIDDEN',
      `Actor '${actor.actorId}' lacks required permission '${permission}'.`,
      [{ requiredPermission: permission }],
    );
  }
  return actor;
}

export function assertTenantAccess(
  actor: CanonicalHoldActor,
  recordTenantId: string | null,
): void {
  if (recordTenantId !== null && recordTenantId !== actor.tenantId) {
    throw new CanonicalHoldApiError(
      'FORBIDDEN',
      'Cross-organization access is prohibited.',
      [{ actorTenantId: actor.tenantId }],
    );
  }
}

export function rejectUntrustedIdentityFields(payload: unknown): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  const obj = payload as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (UNTRUSTED_CLIENT_AUTH_FIELDS.has(key)) {
      throw new CanonicalHoldApiError(
        'FORBIDDEN',
        `Client-supplied identity or authorization field '${key}' is forbidden.`,
        [{ field: key }],
      );
    }
  }
}

export function computeCanonicalScopeFingerprint(scopeInput: {
  scopeType: string;
  entityTypes: string[];
  entityIds: string[];
  dataCategories: string[];
  sourceModuleIds: string[];
  includeFutureMatchingRecords: boolean;
  maximumExpansionCount: number;
  maximumRelationshipDepth: number;
}): string {
  const canonicalPayload = JSON.stringify({
    scopeType: scopeInput.scopeType,
    entityTypes: [...scopeInput.entityTypes].sort(),
    entityIds: [...scopeInput.entityIds].sort(),
    dataCategories: [...scopeInput.dataCategories].sort(),
    sourceModuleIds: [...scopeInput.sourceModuleIds].sort(),
    includeFutureMatchingRecords: Boolean(scopeInput.includeFutureMatchingRecords),
    maximumExpansionCount: scopeInput.maximumExpansionCount,
    maximumRelationshipDepth: scopeInput.maximumRelationshipDepth,
  });
  return `sha256-${crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex')}`;
}

export function validateScopeDefinitionInput(rawScope: Record<string, unknown> | undefined): {
  scopeType: CanonicalLegalHoldScope['scopeType'];
  entityTypes: string[];
  entityIds: string[];
  dataCategories: string[];
  sourceModuleIds: string[];
  relationshipRules: CanonicalLegalHoldScope['relationshipRules'];
  boundedQuery: CanonicalLegalHoldScope['boundedQuery'];
  includeFutureMatchingRecords: boolean;
  maximumExpansionCount: number;
  maximumRelationshipDepth: number;
  scopeFingerprint: string;
} {
  if (!rawScope || typeof rawScope !== 'object') {
    throw new CanonicalHoldApiError('SCOPE_INVALID', 'A structured scope object is required.');
  }
  if ('rawQuery' in rawScope || 'sql' in rawScope || 'expression' in rawScope || 'eval' in rawScope) {
    throw new CanonicalHoldApiError(
      'SCOPE_INVALID',
      'Arbitrary executable query expressions are prohibited in legal hold scopes.',
    );
  }
  const allowedScopeTypes: CanonicalLegalHoldScope['scopeType'][] = [
    'EXPLICIT_RECORDS',
    'ENTITY',
    'ENTITY_RELATIONSHIP',
    'DATA_CATEGORY',
    'SOURCE_MODULE',
    'BOUNDED_QUERY',
  ];
  const scopeType = rawScope.scopeType as CanonicalLegalHoldScope['scopeType'];
  if (!allowedScopeTypes.includes(scopeType)) {
    throw new CanonicalHoldApiError('SCOPE_INVALID', `Unsupported scopeType '${String(rawScope.scopeType)}'.`);
  }

  const entityTypes = Array.isArray(rawScope.entityTypes) ? (rawScope.entityTypes as string[]) : [];
  const entityIds = Array.isArray(rawScope.entityIds) ? (rawScope.entityIds as string[]) : [];
  const dataCategories = Array.isArray(rawScope.dataCategories) ? (rawScope.dataCategories as string[]) : [];
  const sourceModuleIds = Array.isArray(rawScope.sourceModuleIds) ? (rawScope.sourceModuleIds as string[]) : [];
  const relationshipRules = Array.isArray(rawScope.relationshipRules)
    ? (rawScope.relationshipRules as CanonicalLegalHoldScope['relationshipRules'])
    : [];

  if (entityTypes.length === 0 || sourceModuleIds.length === 0) {
    throw new CanonicalHoldApiError(
      'SCOPE_INVALID',
      'Scope must specify non-empty entityTypes and sourceModuleIds.',
    );
  }
  if (scopeType === 'EXPLICIT_RECORDS' && entityIds.length === 0) {
    throw new CanonicalHoldApiError(
      'SCOPE_INVALID',
      'EXPLICIT_RECORDS scope requires at least one entityId.',
    );
  }

  const maximumExpansionCount =
    typeof rawScope.maximumExpansionCount === 'number' ? rawScope.maximumExpansionCount : 1000;
  const maximumRelationshipDepth =
    typeof rawScope.maximumRelationshipDepth === 'number' ? rawScope.maximumRelationshipDepth : 2;

  if (maximumExpansionCount <= 0 || maximumExpansionCount > 5000) {
    throw new CanonicalHoldApiError(
      'SCOPE_INVALID',
      'maximumExpansionCount must be between 1 and 5000.',
    );
  }
  if (maximumRelationshipDepth < 0 || maximumRelationshipDepth > 5) {
    throw new CanonicalHoldApiError(
      'SCOPE_INVALID',
      'maximumRelationshipDepth must be between 0 and 5.',
    );
  }

  const includeFutureMatchingRecords = Boolean(rawScope.includeFutureMatchingRecords);
  const scopeFingerprint = computeCanonicalScopeFingerprint({
    scopeType,
    entityTypes,
    entityIds,
    dataCategories,
    sourceModuleIds,
    includeFutureMatchingRecords,
    maximumExpansionCount,
    maximumRelationshipDepth,
  });

  return {
    scopeType,
    entityTypes,
    entityIds,
    dataCategories,
    sourceModuleIds,
    relationshipRules,
    boundedQuery: (rawScope.boundedQuery as CanonicalLegalHoldScope['boundedQuery']) ?? null,
    includeFutureMatchingRecords,
    maximumExpansionCount,
    maximumRelationshipDepth,
    scopeFingerprint,
  };
}

export function sanitizeHoldForCaller(
  hold: CanonicalLegalHold,
  actor: CanonicalHoldActor,
): Partial<CanonicalLegalHold> & { id: string; holdNumber: string; status: CanonicalLegalHold['status'] } {
  const hasFullHoldRead = actor.permissions.includes('legal_hold.read');
  if (hasFullHoldRead) {
    return { ...hold };
  }
  return {
    id: hold.id,
    tenantId: hold.tenantId,
    holdNumber: hold.holdNumber,
    title: 'Restricted Legal Hold',
    description: null,
    holdType: hold.holdType,
    status: hold.status,
    priority: hold.priority,
    effectiveAt: hold.effectiveAt,
    version: hold.version,
  };
}

export function paginateCollection<T extends { id: string }>(
  items: T[],
  options?: { limit?: number | string; cursor?: string | null },
): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  const parsedLimit = Number(options?.limit ?? 25);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(1, Math.trunc(parsedLimit)), 100) : 25;
  let startIndex = 0;
  if (options?.cursor) {
    const idx = items.findIndex((item) => item.id === options.cursor);
    if (idx >= 0) startIndex = idx + 1;
  }
  const slice = items.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < items.length;
  const nextCursor = hasMore && slice.length > 0 ? slice[slice.length - 1].id : null;
  return { items: slice, nextCursor, hasMore };
}
