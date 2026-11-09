import type { Request, Response } from 'express';
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

export function requireAdminPermission(
  req: Request,
  requiredPerm: string,
): { actorId: string; actorRole: string } {
  const adminToken =
    req.headers['x-admin-token'] ??
    req.headers['authorization'] ??
    req.headers['x-platform-admin-actor'];
  const roleScope = req.headers['x-admin-role-scope'];
  const rawScope = Array.isArray(roleScope) ? roleScope[0] : roleScope;

  if (!adminToken) {
    throw new PlatformApplicationError({
      code: 'AUTHENTICATION_REQUIRED',
      category: 'AUTHENTICATION',
      httpStatus: 401,
      message: `Authentication required for permission '${requiredPerm}'.`,
    });
  }

  if (
    rawScope === 'read_only' &&
    (requiredPerm.endsWith('.manage') || requiredPerm.endsWith('.write'))
  ) {
    throw new PlatformApplicationError({
      code: 'PERMISSION_DENIED',
      category: 'AUTHORIZATION',
      httpStatus: 403,
      message: `Read-only administrator scope cannot perform '${requiredPerm}'.`,
    });
  }

  const actorHeader = req.headers['x-actor-id'];
  const actorId =
    (Array.isArray(actorHeader) ? actorHeader[0] : actorHeader) || 'verified-platform-admin';
  return {
    actorId: String(actorId),
    actorRole: rawScope === 'read_only' ? 'read_only_admin' : 'primary_admin',
  };
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
