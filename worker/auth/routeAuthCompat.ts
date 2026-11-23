import { resolveWorkerAuthContext } from './authorizationPolicy';
import type { WorkerRequestContext } from '../types';

export interface WorkerRouteAuthCompatibilityResult {
  readonly authenticated: boolean;
  readonly uid: string | null;
  readonly isAdmin: boolean;
  readonly statusCode: 200 | 400 | 401 | 403 | 503;
  readonly reasonCode: string;
}

/**
 * Transitional route authentication for Worker endpoints still serving legacy Firebase
 * clients while browser sessions move to Cloudflare D1.
 *
 * A present Radar session cookie is handled first and fail-closed by
 * resolveWorkerAuthContext; it can never fall back to a Bearer credential.
 * Legacy Firebase Bearer requests continue to require App Check on sensitive routes.
 * Admin-only legacy handlers retain primary-admin-only semantics.
 */
export async function authenticateWorkerRouteCompat(
  ctx: WorkerRequestContext,
  options: { requireAppCheck?: boolean } = {},
): Promise<WorkerRouteAuthCompatibilityResult> {
  const resolved = await resolveWorkerAuthContext(ctx.request, {
    expectedProjectId: ctx.env.FIREBASE_PROJECT_ID,
    requireAppCheck: options.requireAppCheck === true,
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
