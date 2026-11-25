/**
 * Public read-only HTTP adapter for IRNI canonical geographic Workers RPC v1.
 *
 * This route is deliberately separate from the legacy HTTPS neighborhood DTO
 * facade. It returns canonical IRNI entities and requires a caller-pinned
 * registry revision for every data read.
 *
 * The Service Binding is optional at deploy time. When absent or inactive, the
 * RPC client returns a controlled 503; this route never falls back to local
 * Radar geography fixtures or the legacy external HTTPS API.
 */
import { jsonWorkerResponse } from '../contextAndSecurity';
import {
  createIrniGeographicRpcClientFromEnv,
  IRNI_GEOGRAPHIC_RPC_CONTRACT_VERSION,
} from '../irni/irniGeographicRpcClient';
import type {
  IrniGeographicPersistenceErrorCode,
  IrniGeographicPersistenceResult,
  IrniGeographicIdentifierQuery,
} from '../irni/irniGeographicRpcTypes';
import type { WorkerRequestContext } from '../types';

const CANONICAL_PREFIX = '/api/v2/reference/irni/canonical/';
const MAX_CANONICAL_ID_LENGTH = 128;
const MAX_CURSOR_LENGTH = 2048;
const MAX_PAGE_SIZE = 100;
const ALLOWED_SORT_FIELDS = new Set([
  'canonicalNameFa',
  'entityType',
  'recordedAt',
  'geographicEntityId',
]);

function httpStatusForPersistenceError(code: IrniGeographicPersistenceErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'VALIDATION_FAILURE':
      return 400;
    case 'PERMISSION_DENIED':
      return 403;
    case 'DUPLICATE':
    case 'VERSION_CONFLICT':
    case 'IDEMPOTENCY_CONFLICT':
      return 409;
    case 'TRANSACTION_FAILURE':
    case 'STORAGE_UNAVAILABLE':
    default:
      return 503;
  }
}

function respondRpcResult<T>(
  ctx: WorkerRequestContext,
  result: IrniGeographicPersistenceResult<T>,
): Response {
  if (result.ok) {
    return jsonWorkerResponse(
      ctx,
      200,
      {
        status: 'ok',
        contractVersion: IRNI_GEOGRAPHIC_RPC_CONTRACT_VERSION,
        data: result.value,
        correlationId: ctx.correlationId,
      },
      { cacheControl: 'no-store' },
    );
  }

  return jsonWorkerResponse(
    ctx,
    httpStatusForPersistenceError(result.error.code),
    {
      status: 'error',
      code: result.error.code,
      message: result.error.messageFa,
      retryable: result.error.retryable,
      details: result.error.details ?? null,
      correlationId: ctx.correlationId,
    },
    { cacheControl: 'no-store' },
  );
}

function badRequest(ctx: WorkerRequestContext, code: string, messageFa: string): Response {
  return jsonWorkerResponse(
    ctx,
    400,
    { status: 'error', code, message: messageFa, correlationId: ctx.correlationId },
    { cacheControl: 'no-store' },
  );
}

function readPositiveInteger(
  ctx: WorkerRequestContext,
  key: string,
  required: boolean,
  maximum = Number.MAX_SAFE_INTEGER,
): { readonly ok: true; readonly value: number | undefined } |
   { readonly ok: false; readonly response: Response } {
  const raw = ctx.url.searchParams.get(key);
  if (raw === null && !required) return { ok: true, value: undefined };
  if (raw === null || !/^[1-9][0-9]*$/.test(raw)) {
    return {
      ok: false,
      response: badRequest(ctx, 'IRNI_RPC_INVALID_PARAMETERS', 'پارامتر ' + key + ' باید عدد صحیح مثبت باشد.'),
    };
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) {
    return {
      ok: false,
      response: badRequest(ctx, 'IRNI_RPC_INVALID_PARAMETERS', 'مقدار پارامتر ' + key + ' خارج از محدوده مجاز است.'),
    };
  }

  return { ok: true, value };
}

function readOptionalString(
  ctx: WorkerRequestContext,
  key: string,
  maximumLength: number,
): { readonly ok: true; readonly value: string | undefined } |
   { readonly ok: false; readonly response: Response } {
  if (!ctx.url.searchParams.has(key)) return { ok: true, value: undefined };
  const value = ctx.url.searchParams.get(key);
  if (
    value === null ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return {
      ok: false,
      response: badRequest(ctx, 'IRNI_RPC_INVALID_PARAMETERS', 'پارامتر ' + key + ' نامعتبر است.'),
    };
  }
  return { ok: true, value };
}

function parseCanonicalId(raw: string): string | null {
  try {
    const decoded = decodeURIComponent(raw);
    if (
      decoded.length === 0 ||
      decoded.length > MAX_CANONICAL_ID_LENGTH ||
      decoded.trim() !== decoded ||
      decoded.includes('/') ||
      /[\u0000-\u001f\u007f]/.test(decoded)
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function parseIdentifierQuery(ctx: WorkerRequestContext): IrniGeographicIdentifierQuery | null {
  const kind = ctx.url.searchParams.get('kind');
  if (kind === 'CANONICAL_OR_RETIRED_IDENTIFIER') {
    const identifier = ctx.url.searchParams.get('identifier');
    if (!identifier || identifier.length > MAX_CANONICAL_ID_LENGTH || identifier.trim() !== identifier) {
      return null;
    }
    return { kind, identifier };
  }

  if (kind === 'RADAR_LEGACY_ALIAS') {
    const legacyIdentifierValue = ctx.url.searchParams.get('legacyIdentifierValue');
    if (
      !legacyIdentifierValue ||
      legacyIdentifierValue.length > 256 ||
      legacyIdentifierValue.trim() !== legacyIdentifierValue
    ) {
      return null;
    }
    return {
      kind,
      alias: {
        legacySystemCode: 'TEHRAN_RADAR',
        legacyIdentifierValue,
      },
    };
  }

  return null;
}

export async function handleIrniCanonicalRpcRoute(
  ctx: WorkerRequestContext,
): Promise<Response | null> {
  if (!ctx.pathname.startsWith(CANONICAL_PREFIX)) return null;

  if (ctx.method !== 'GET') {
    return jsonWorkerResponse(
      ctx,
      405,
      {
        status: 'error',
        code: 'IRNI_CANONICAL_REFERENCE_READ_ONLY',
        message: 'مرجع canonical جغرافیایی IRNI فقط خواندنی است و عملیات تغییر از این مسیر مجاز نیست.',
        correlationId: ctx.correlationId,
      },
      { cacheControl: 'no-store' },
    );
  }

  const client = createIrniGeographicRpcClientFromEnv(ctx.env);
  const resource = ctx.pathname.slice(CANONICAL_PREFIX.length);

  if (resource === 'metadata') {
    return respondRpcResult(ctx, await client.getApprovedRegistryMetadata());
  }

  if (resource === 'resolve') {
    const query = parseIdentifierQuery(ctx);
    const revision = readPositiveInteger(ctx, 'expectedRevision', true);
    if (!query) {
      return badRequest(ctx, 'IRNI_RPC_INVALID_PARAMETERS', 'نوع یا مقدار شناسه برای حل canonical نامعتبر است.');
    }
    if (!revision.ok) return revision.response;
    return respondRpcResult(
      ctx,
      await client.resolveIdentifier(query, revision.value!),
    );
  }

  if (resource === 'entities') {
    const revision = readPositiveInteger(ctx, 'expectedRevision', true);
    if (!revision.ok) return revision.response;

    const limit = readPositiveInteger(ctx, 'limit', false, MAX_PAGE_SIZE);
    if (!limit.ok) return limit.response;
    const cursor = readOptionalString(ctx, 'cursor', MAX_CURSOR_LENGTH);
    if (!cursor.ok) return cursor.response;
    const sortBy = readOptionalString(ctx, 'sortBy', 64);
    if (!sortBy.ok) return sortBy.response;
    const sortDirection = ctx.url.searchParams.get('sortDirection') || undefined;
    if (sortDirection !== undefined && sortDirection !== 'ASC' && sortDirection !== 'DESC') {
      return badRequest(ctx, 'IRNI_RPC_INVALID_PARAMETERS', 'sortDirection فقط می‌تواند ASC یا DESC باشد.');
    }
    if (sortBy.value && !ALLOWED_SORT_FIELDS.has(sortBy.value)) {
      return badRequest(ctx, 'IRNI_RPC_INVALID_PARAMETERS', 'فیلد مرتب‌سازی در allowlist مجاز نیست.');
    }

    const entityType = readOptionalString(ctx, 'entityType', 128);
    if (!entityType.ok) return entityType.response;
    const classificationSystemId = readOptionalString(ctx, 'classificationSystemId', 128);
    if (!classificationSystemId.ok) return classificationSystemId.response;
    const parentGeographicEntityId = readOptionalString(ctx, 'parentGeographicEntityId', MAX_CANONICAL_ID_LENGTH);
    if (!parentGeographicEntityId.ok) return parentGeographicEntityId.response;
    const provinceGeographicEntityId = readOptionalString(ctx, 'provinceGeographicEntityId', MAX_CANONICAL_ID_LENGTH);
    if (!provinceGeographicEntityId.ok) return provinceGeographicEntityId.response;

    return respondRpcResult(
      ctx,
      await client.listApprovedEntitiesPaginated(
        {
          ...(entityType.value ? { entityType: entityType.value } : {}),
          ...(classificationSystemId.value ? { classificationSystemId: classificationSystemId.value } : {}),
          ...(parentGeographicEntityId.value ? { parentGeographicEntityId: parentGeographicEntityId.value } : {}),
          ...(provinceGeographicEntityId.value ? { provinceGeographicEntityId: provinceGeographicEntityId.value } : {}),
        },
        {
          ...(cursor.value ? { cursor: cursor.value } : {}),
          ...(limit.value !== undefined ? { limit: limit.value } : {}),
          ...(sortBy.value ? { sortBy: sortBy.value } : {}),
          ...(sortDirection ? { sortDirection } : {}),
        },
        revision.value!,
      ),
    );
  }

  if (resource.startsWith('entities/')) {
    const segments = resource.split('/');
    if (segments.length !== 2 && !(segments.length === 3 && segments[2] === 'relationships')) {
      return jsonWorkerResponse(
        ctx,
        404,
        { status: 'error', code: 'IRNI_CANONICAL_ROUTE_NOT_FOUND', correlationId: ctx.correlationId },
        { cacheControl: 'no-store' },
      );
    }

    const id = parseCanonicalId(segments[1] || '');
    if (!id) {
      return badRequest(ctx, 'IRNI_RPC_INVALID_PARAMETERS', 'شناسه canonical در مسیر نامعتبر است.');
    }
    const revision = readPositiveInteger(ctx, 'expectedRevision', true);
    if (!revision.ok) return revision.response;

    if (segments.length === 3) {
      return respondRpcResult(
        ctx,
        await client.listApprovedRelationshipsForEntity(id, revision.value!),
      );
    }

    return respondRpcResult(
      ctx,
      await client.getApprovedEntityByCanonicalId(id, revision.value!),
    );
  }

  return jsonWorkerResponse(
    ctx,
    404,
    { status: 'error', code: 'IRNI_CANONICAL_ROUTE_NOT_FOUND', correlationId: ctx.correlationId },
    { cacheControl: 'no-store' },
  );
}
