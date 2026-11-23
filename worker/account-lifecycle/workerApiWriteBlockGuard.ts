/**
 * Global Worker /api mutation write-block (Stage D hardening).
 */

import { MUTATION_HTTP_METHODS, isLifecycleExemptPath } from '../../server/modules/account-lifecycle/mutationWriteBlockGuard.ts';
import { resolveWorkerAuthContext } from '../auth/authorizationPolicy.ts';
import { enforceWorkerMutationWriteBlock } from './writeBlockWorkerGate.ts';
import type { WorkerRequestContext } from '../types.ts';

export async function guardWorkerApiMutationWriteBlock(ctx: WorkerRequestContext): Promise<Response | null> {
  if (!ctx.pathname.startsWith('/api/')) return null;
  if (ctx.pathname.startsWith('/api/internal/v1/lifecycle/')) return null;
  if (!MUTATION_HTTP_METHODS.has(ctx.method.toUpperCase())) return null;
  if (isLifecycleExemptPath(ctx.pathname, ctx.method)) return null;

  const auth = await resolveWorkerAuthContext(ctx.request, {
    expectedProjectId: ctx.env.FIREBASE_PROJECT_ID,
    adminApiSecret: ctx.env.ADMIN_API_SECRET,
    adminEmail: ctx.env.ADMIN_EMAIL,
  });
  if (!auth.authenticated || !auth.principal?.uid) return null;

  return enforceWorkerMutationWriteBlock(ctx, auth.principal.uid);
}