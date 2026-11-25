/** Public, read-only HTTP facade over the internal IRNI Workers RPC v2 binding. */
import { jsonWorkerResponse } from '../contextAndSecurity';
import { createIrniGeographicRpcV2ClientFromEnv } from '../irni/irniGeographicRpcV2Client';
import type { IrniRpcError } from '../irni/irniGeographicRpcV2Types';
import type { WorkerRequestContext } from '../types';

const PREFIX = '/api/v2/reference/irni/canonical';
const MAX_ID = 256;
const MAX_CURSOR = 2048;
const MAX_PAGE = 100;
type RpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: IrniRpcError };

function statusFor(code: IrniRpcError['code']): number {
  switch (code) {
    case 'NOT_FOUND': return 404;
    case 'VALIDATION_FAILURE': return 400;
    case 'PERMISSION_DENIED': return 403;
    case 'DUPLICATE':
    case 'VERSION_CONFLICT':
    case 'IDEMPOTENCY_CONFLICT': return 409;
    default: return 503;
  }
}
function respond<T>(ctx: WorkerRequestContext, result: RpcResult<T>): Response {
  if (result.ok) {
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      contractVersion: '2.0.0',
      data: result.value,
      correlationId: ctx.correlationId,
    }, { cacheControl: 'no-store' });
  }
  return jsonWorkerResponse(ctx, statusFor(result.error.code), {
    status: 'error',
    code: result.error.code,
    message: result.error.messageFa,
    retryable: result.error.retryable,
    details: result.error.details ?? null,
    correlationId: ctx.correlationId,
  }, { cacheControl: 'no-store' });
}
function badRequest(ctx: WorkerRequestContext, message: string): Response {
  return jsonWorkerResponse(ctx, 400, {
    status: 'error',
    code: 'IRNI_RPC_INVALID_PARAMETERS',
    message,
    correlationId: ctx.correlationId,
  }, { cacheControl: 'no-store' });
}
function positiveInteger(ctx: WorkerRequestContext, key: string, required: boolean, max = Number.MAX_SAFE_INTEGER):
  { readonly ok: true; readonly value: number | undefined } |
  { readonly ok: false; readonly response: Response } {
  const raw = ctx.url.searchParams.get(key);
  if (raw === null && !required) return { ok: true, value: undefined };
  if (raw === null || !/^[1-9][0-9]*$/.test(raw)) {
    return { ok: false, response: badRequest(ctx, 'پارامتر ' + key + ' باید عدد صحیح مثبت باشد.') };
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > max) {
    return { ok: false, response: badRequest(ctx, 'مقدار پارامتر ' + key + ' خارج از محدوده مجاز است.') };
  }
  return { ok: true, value };
}
function optionalString(ctx: WorkerRequestContext, key: string, max: number):
  { readonly ok: true; readonly value: string | undefined } |
  { readonly ok: false; readonly response: Response } {
  if (!ctx.url.searchParams.has(key)) return { ok: true, value: undefined };
  const value = ctx.url.searchParams.get(key);
  if (value === null || value.length === 0 || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    return { ok: false, response: badRequest(ctx, 'پارامتر ' + key + ' معتبر نیست.') };
  }
  return { ok: true, value };
}
function parseIdentifier(ctx: WorkerRequestContext) {
  const kind = ctx.url.searchParams.get('kind');
  if (kind === 'CANONICAL_OR_RETIRED_IDENTIFIER') {
    const identifier = ctx.url.searchParams.get('identifier');
    if (!identifier || identifier.length > MAX_ID || identifier.trim() !== identifier) return null;
    return { kind, identifier } as const;
  }
  if (kind === 'RADAR_LEGACY_ALIAS') {
    const legacyIdentifierValue = ctx.url.searchParams.get('legacyIdentifierValue');
    if (!legacyIdentifierValue || legacyIdentifierValue.length > MAX_ID || legacyIdentifierValue.trim() !== legacyIdentifierValue) return null;
    return { kind, alias: { legacySystemCode: 'TEHRAN_RADAR' as const, legacyIdentifierValue } } as const;
  }
  return null;
}
function parsePathId(raw: string): string | null {
  try {
    const id = decodeURIComponent(raw);
    if (!id || id.length > MAX_ID || id.trim() !== id || id.includes('/') || /[\u0000-\u001f\u007f]/.test(id)) return null;
    return id;
  } catch { return null; }
}

export async function handleIrniCanonicalRpcV2Route(ctx: WorkerRequestContext): Promise<Response | null> {
  if (ctx.pathname !== PREFIX && !ctx.pathname.startsWith(PREFIX + '/')) return null;
  if (ctx.method !== 'GET') {
    return jsonWorkerResponse(ctx, 405, {
      status: 'error',
      code: 'IRNI_CANONICAL_REFERENCE_READ_ONLY',
      message: 'مرجع canonical جغرافیایی IRNI فقط خواندنی است.',
      correlationId: ctx.correlationId,
    }, { cacheControl: 'no-store' });
  }
  const client = createIrniGeographicRpcV2ClientFromEnv(ctx.env);
  const resource = ctx.pathname === PREFIX ? '' : ctx.pathname.slice(PREFIX.length + 1);

  if (resource === 'metadata') return respond(ctx, await client.getApprovedRegistryMetadata());

  if (resource === 'resolve') {
    const query = parseIdentifier(ctx);
    const revision = positiveInteger(ctx, 'expectedRevision', true);
    if (!query) return badRequest(ctx, 'نوع یا مقدار شناسه برای حل canonical نامعتبر است.');
    if (!revision.ok) return revision.response;
    return respond(ctx, await client.resolveIdentifier(query, revision.value!));
  }

  if (resource === 'aliases') {
    const revision = positiveInteger(ctx, 'expectedRevision', true);
    if (!revision.ok) return revision.response;
    const system = optionalString(ctx, 'legacySystemCode', 128);
    if (!system.ok) return system.response;
    return respond(ctx, await client.listApprovedLegacyAliases(system.value, revision.value!));
  }

  if (resource === 'entities') {
    const revision = positiveInteger(ctx, 'expectedRevision', true);
    if (!revision.ok) return revision.response;
    const limit = positiveInteger(ctx, 'limit', false, MAX_PAGE);
    if (!limit.ok) return limit.response;
    const cursor = optionalString(ctx, 'cursor', MAX_CURSOR);
    if (!cursor.ok) return cursor.response;
    const sortBy = optionalString(ctx, 'sortBy', 64);
    if (!sortBy.ok) return sortBy.response;
    if (sortBy.value && !['canonicalNameFa', 'geographicEntityId'].includes(sortBy.value)) {
      return badRequest(ctx, 'فیلد مرتب‌سازی در allowlist مجاز نیست.');
    }
    const sortDirection = ctx.url.searchParams.get('sortDirection') || undefined;
    if (sortDirection !== undefined && sortDirection !== 'ASC' && sortDirection !== 'DESC') {
      return badRequest(ctx, 'sortDirection فقط می‌تواند ASC یا DESC باشد.');
    }
    const entityType = optionalString(ctx, 'entityType', 128);
    if (!entityType.ok) return entityType.response;
    const classification = optionalString(ctx, 'classificationSystemId', 256);
    if (!classification.ok) return classification.response;
    const parent = optionalString(ctx, 'parentGeographicEntityId', MAX_ID);
    if (!parent.ok) return parent.response;
    const province = optionalString(ctx, 'provinceGeographicEntityId', MAX_ID);
    if (!province.ok) return province.response;
    return respond(ctx, await client.listApprovedEntitiesPaginated(
      {
        ...(entityType.value ? { entityType: entityType.value } : {}),
        ...(classification.value ? { classificationSystemId: classification.value } : {}),
        ...(parent.value ? { parentGeographicEntityId: parent.value } : {}),
        ...(province.value ? { provinceGeographicEntityId: province.value } : {}),
      },
      {
        ...(cursor.value ? { cursor: cursor.value } : {}),
        ...(limit.value !== undefined ? { limit: limit.value } : {}),
        ...(sortBy.value ? { sortBy: sortBy.value as 'canonicalNameFa' | 'geographicEntityId' } : {}),
        ...(sortDirection ? { sortDirection } : {}),
      },
      revision.value!,
    ));
  }

  if (resource.startsWith('entities/')) {
    const segments = resource.split('/');
    if (segments.length !== 2 && !(segments.length === 3 && segments[2] === 'relationships')) {
      return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'IRNI_CANONICAL_ROUTE_NOT_FOUND', correlationId: ctx.correlationId }, { cacheControl: 'no-store' });
    }
    const id = parsePathId(segments[1] || '');
    if (!id) return badRequest(ctx, 'شناسه canonical در مسیر نامعتبر است.');
    const revision = positiveInteger(ctx, 'expectedRevision', true);
    if (!revision.ok) return revision.response;
    if (segments.length === 3) return respond(ctx, await client.listApprovedRelationshipsForEntity(id, revision.value!));
    return respond(ctx, await client.getApprovedEntityByCanonicalId(id, revision.value!));
  }

  return jsonWorkerResponse(ctx, 404, {
    status: 'error',
    code: 'IRNI_CANONICAL_ROUTE_NOT_FOUND',
    correlationId: ctx.correlationId,
  }, { cacheControl: 'no-store' });
}
