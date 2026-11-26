import { resolveWorkerAuthContext } from './authorizationPolicy';
import type { WorkerRequestContext } from '../types';

export interface WorkerRouteAuthCompatibilityResult {
  readonly authenticated: boolean;
  readonly uid: string | null;
  readonly isAdmin: boolean;
  readonly statusCode: 200 | 400 | 401 | 403 | 503;
  readonly reasonCode: string;
}

/** D1 session-only route authentication. The historical module name is retained for imports. */
export async function authenticateWorkerRouteCompat(
  ctx: WorkerRequestContext,
): Promise<WorkerRouteAuthCompatibilityResult> {
  const resolved = await resolveWorkerAuthContext(ctx.request, {
    env: ctx.env,
  });
  const principal = resolved.principal;
  return {
    authenticated: resolved.authenticated && Boolean(principal?.uid),
    uid: principal?.uid || null,
    isAdmin: Boolean(principal?.isPrimaryAdmin),
    statusCode: (resolved.authenticated ? 200 : resolved.failureStatusCode || 401),
    reasonCode: resolved.failureCode || (resolved.authenticated ? 'VERIFIED' : 'UNAUTHORIZED'),
  };
}
