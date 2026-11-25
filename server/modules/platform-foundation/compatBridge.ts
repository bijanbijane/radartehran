import type { NextFunction, Request, Response } from 'express';
import { verifyAdminApiAuthorization } from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  CoreApiError as BaseCoreApiError,
  decodePaginationCursor,

  encodePaginationCursor,
  normalizePaginationParams,
} from '../core/index.ts';
import {
  createPlatformExecutionContext,
  PlatformApplicationError,
  toCanonicalErrorResponse,
  toCanonicalSuccessResponse,
  type RequestWithPlatformContext,
} from './contextAndErrors.ts';
import { getDefaultPlatformFoundationStore } from './registriesAndPersistence.ts';

export class CoreApiError extends BaseCoreApiError {
  constructor(
    code: string,
    second: string | number,
    third?: number | string,
    details?: unknown,
  ) {
    const status = typeof second === 'number' ? second : typeof third === 'number' ? third : 400;
    const rawMsg = typeof second === 'string' ? second : typeof third === 'string' ? third : code;
    const msgWithCode = rawMsg.includes(code) ? rawMsg : `${code}: ${rawMsg}`;
    super(code as any, status, msgWithCode, details as any);
  }
}


export interface RequestTraceContext {
  requestId: string;
  correlationId: string;
  ctx: ReturnType<typeof createPlatformExecutionContext>;
}

export function getRequestTraceContext(req: Request): RequestTraceContext {
  const r = req as RequestWithPlatformContext;
  const ctx =
    r.platformContext ??
    createPlatformExecutionContext({
      correlationId: req.headers['x-correlation-id'] ?? req.headers['x-request-id'],
      sourceModule: 'platform-admin-router',
      operationName: `${req.method} ${req.path}`,
    });
  return {
    requestId: ctx.requestId,
    correlationId: ctx.correlationId,
    ctx,
  };
}

interface VerifiedPlatformAdminContext {
  actorId: string;
  actorRole: 'primary_admin' | 'read_only_admin';
  permissions: string[];
}

type RequestWithVerifiedPlatformAdmin = Request & {
  verifiedPlatformAdminContext?: VerifiedPlatformAdminContext;
};

/**
 * Verifies administrator identity before legacy platform routers are reached.
 * Client-supplied x-actor-id, x-admin-role and x-admin-role-scope are never trusted.
 */
export function verifiedAdminContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void (async () => {
    const auth = await verifyAdminApiAuthorization(req);
    if (!auth.authorized) {
      res.status(auth.statusCode === 401 ? 401 : 403).json({
        status: 'error',
        code: auth.statusCode === 401 ? 'AUTHENTICATION_REQUIRED' : 'PERMISSION_DENIED',
      });
      return;
    }

    const isPrimary = auth.reason === 'AUTHORIZED_BOOTSTRAP_ADMIN' ||
      auth.reason === 'AUTHORIZED_SERVER_SECRET';
    (req as RequestWithVerifiedPlatformAdmin).verifiedPlatformAdminContext = {
      actorId: auth.actorUid || auth.uid || 'verified-platform-admin',
      actorRole: isPrimary ? 'primary_admin' : 'read_only_admin',
      permissions: isPrimary
        ? ['*']
        : ['platform.modules.read', 'platform.config.read', 'platform.health.read'],
    };
    next();
  })().catch(next);
}

export function requireAdminPermission(
  req: Request,
  requiredPerm: string,
): { actorId: string; actorRole: string } {
  const context = (req as RequestWithVerifiedPlatformAdmin).verifiedPlatformAdminContext;
  if (!context) {
    throw new PlatformApplicationError({
      code: 'AUTHENTICATION_REQUIRED',
      category: 'AUTHENTICATION',
      httpStatus: 401,
      message: `Verified administrator authentication is required for '${requiredPerm}'.`,
    });
  }

  if (!context.permissions.includes('*') && !context.permissions.includes(requiredPerm)) {
    throw new PlatformApplicationError({
      code: 'PERMISSION_DENIED',
      category: 'AUTHORIZATION',
      httpStatus: 403,
      message: `Verified administrator does not have permission '${requiredPerm}'.`,
    });
  }

  return { actorId: context.actorId, actorRole: context.actorRole };
}

export function clampPageSize(raw: unknown, defaultLimit = 25, maxLimit = 50): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return defaultLimit;
  return Math.min(maxLimit, Math.max(1, Math.floor(n)));
}

export function paginateArray<T extends Record<string, any>>(
  items: T[],
  pageSize: number,
  cursor: string | undefined,
  idKey: keyof T,
  direction: 'asc' | 'desc' = 'asc',
): {
  items: T[];
  pageInfo: { pageSize: number; hasNextPage: boolean; nextCursor: string | null };
} {
  const page = normalizePaginationParams({ limit: pageSize, cursor }, { defaultLimit: 25, maxLimit: 50 });
  const decoded = page.cursor ? decodePaginationCursor(page.cursor) : null;
  const sorted = [...items].sort((a, b) => {
    const cmp = String(a[idKey]).localeCompare(String(b[idKey]));
    return direction === 'asc' ? cmp : -cmp;
  });
  const filtered = decoded
    ? sorted.filter((item) =>
        direction === 'asc'
          ? String(item[idKey]) > decoded.docId
          : String(item[idKey]) < decoded.docId,
      )
    : sorted;
  const slice = filtered.slice(0, page.limit);
  const hasNextPage = filtered.length > page.limit;
  const last = slice[slice.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodePaginationCursor({
          sortValue: String(last[idKey]),
          docId: String(last[idKey]),
          direction,
        })
      : null;

  return {
    items: slice,
    pageInfo: {
      pageSize: page.limit,
      hasNextPage,
      nextCursor,
    },
  };
}

export function sendCanonicalSuccess<T>(
  res: Response,
  trace: RequestTraceContext,
  data: T,
  statusCode = 200,
  pageInfo?: { nextCursor?: string | null },
): void {
  res
    .status(statusCode)
    .json(toCanonicalSuccessResponse(data, trace.ctx, pageInfo?.nextCursor ?? null));
}

export function sendCanonicalError(
  res: Response,
  trace: RequestTraceContext,
  err: unknown,
): void {
  const mapped = toCanonicalErrorResponse(err, trace.ctx);
  res.status(mapped.statusCode).json(mapped.body);
}

const extraAuditEntries: Array<Record<string, unknown>> = [];

export const PlatformFoundationStore = {
  listModules() {
    return getDefaultPlatformFoundationStore().listModules({ limit: 50 }).items;
  },
  appendAuditLog(entry: Record<string, unknown>) {
    extraAuditEntries.push({
      ...entry,
      recordedAt: new Date().toISOString(),
    });
  },
  listExtraAuditLogs() {
    return [...extraAuditEntries];
  },
};
