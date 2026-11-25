/**
 * Official /api/v1/account/lifecycle/* namespace.
 *
 * The Stage-D orchestrator and its dedicated D1 schema are not present in this
 * branch. The USER_DB lifecycle implementation is exposed separately under
 * /api/account/*; routing these Stage-D endpoints into that incompatible store
 * would risk cross-schema writes. Keep the namespace explicitly fail-closed
 * until the dedicated runtime and dual-D1 binding are integrated.
 */
import { ACCOUNT_LIFECYCLE_API_PREFIX } from '../../server/modules/account-lifecycle/officialApiContract.ts';
import { jsonWorkerResponse } from '../contextAndSecurity.ts';
import type { WorkerRequestContext } from '../types.ts';

export function isAccountLifecyclePath(pathname: string): boolean {
  return pathname === ACCOUNT_LIFECYCLE_API_PREFIX ||
    pathname.startsWith(`${ACCOUNT_LIFECYCLE_API_PREFIX}/`);
}

export async function handleAccountLifecycleRoute(ctx: WorkerRequestContext): Promise<Response | null> {
  if (!isAccountLifecyclePath(ctx.pathname)) return null;

  return jsonWorkerResponse(ctx, 503, {
    status: 'error',
    code: 'ACCOUNT_LIFECYCLE_STAGE_D_RUNTIME_NOT_CONFIGURED',
    correlationId: ctx.correlationId,
    message: 'This lifecycle API namespace is disabled until its dedicated Stage-D runtime and database are configured.',
  });
}
