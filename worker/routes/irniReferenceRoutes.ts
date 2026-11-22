/**
 * @file worker/routes/irniReferenceRoutes.ts
 * @description Strictly Read-Only Worker HTTP proxy routes for the external IRNI Neighborhood Reference Client.
 * Rejects all non-GET mutations with 405 METHOD_NOT_ALLOWED. Never touches any D1 database.
 */
import { jsonWorkerResponse } from '../contextAndSecurity';
import { createIrniNeighborhoodReferenceClientFromEnv } from '../irni/irniNeighborhoodClient';
import type { IrniClientFailure, IrniClientResult } from '../irni/irniTypes';
import type { WorkerRequestContext } from '../types';

function respondIrniResult<T extends object>(
  ctx: WorkerRequestContext,
  res: IrniClientResult<T>,
): Response {
  if ('data' in res && res.ok) {
    return jsonWorkerResponse(ctx, 200, { status: 'ok', ...res.data });
  }
  const fail = res as IrniClientFailure;
  return jsonWorkerResponse(ctx, fail.statusCode, {
    status: 'error',
    code: fail.code,
    message: fail.messageFa,
    requiredExternalPrerequisites: fail.requiredExternalPrerequisites,
  });
}

export async function handleIrniReferenceRoute(ctx: WorkerRequestContext): Promise<Response | null> {
  const { method, pathname, url, env } = ctx;
  if (!pathname.startsWith('/api/v1/reference/irni/')) return null;

  if (method !== 'GET') {
    return jsonWorkerResponse(ctx, 405, {
      status: 'error',
      code: 'IRNI_REFERENCE_READ_ONLY',
      message: 'دامنه مرجع محله‌های IRNI صرفاً خواندنی است و عملیات نوشتن مجاز نیست.',
    });
  }

  const client = createIrniNeighborhoodReferenceClientFromEnv(env);
  const page = url.searchParams.has('page') ? Number(url.searchParams.get('page')) : undefined;
  const pageSize = url.searchParams.has('pageSize') ? Number(url.searchParams.get('pageSize')) : undefined;
  const cursor = url.searchParams.get('cursor') || undefined;

  if (pathname === '/api/v1/reference/irni/provinces') {
    return respondIrniResult(ctx, await client.getProvinces({ page, pageSize, cursor }));
  }

  if (pathname === '/api/v1/reference/irni/counties') {
    const provinceId = url.searchParams.get('provinceId') || '';
    return respondIrniResult(ctx, await client.getCounties({ provinceId, page, pageSize, cursor }));
  }

  if (pathname === '/api/v1/reference/irni/cities') {
    const provinceId = url.searchParams.get('provinceId') || undefined;
    const countyId = url.searchParams.get('countyId') || undefined;
    return respondIrniResult(ctx, await client.getCities({ provinceId, countyId, page, pageSize, cursor }));
  }

  if (pathname === '/api/v1/reference/irni/neighborhoods') {
    const cityId = url.searchParams.get('cityId') || '';
    const districtCode = url.searchParams.get('districtCode') || undefined;
    return respondIrniResult(ctx, await client.getNeighborhoods({ cityId, districtCode, page, pageSize, cursor }));
  }

  if (pathname.startsWith('/api/v1/reference/irni/neighborhoods/')) {
    const id = decodeURIComponent(pathname.slice('/api/v1/reference/irni/neighborhoods/'.length));
    return respondIrniResult(ctx, await client.getNeighborhoodById(id));
  }

  return null;
}
