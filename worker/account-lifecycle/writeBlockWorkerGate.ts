import { assertWriteAdmissionPermitsMutation } from '../../server/modules/account-lifecycle/writeAdmissionAuthority.ts';
import {
  isLifecycleExemptPath,
  MUTATION_HTTP_METHODS,
} from '../../server/modules/account-lifecycle/mutationWriteBlockGuard.ts';
import { resolveWriteAdmissionFromD1 } from './d1WriteAdmissionResolver.ts';
import type { WorkerRequestContext } from '../types.ts';
import type { D1DatabaseBinding } from '../db/types.ts';
import { jsonWorkerResponse } from '../contextAndSecurity.ts';
import { acquireD1MutationPermit, releaseD1MutationPermit } from './d1WriteAdmissionPermit.ts';

const ACTIVE_PERMITS = new WeakMap<Request, { permitId: string; targetUid: string }>();

export async function enforceWorkerMutationWriteBlock(
  ctx: WorkerRequestContext,
  authenticatedUid: string | undefined,
): Promise<Response | null> {
  if (!authenticatedUid) return null;
  if (isLifecycleExemptPath(ctx.pathname, ctx.method)) return null;
  if (!ctx.env.DB) {
    return jsonWorkerResponse(ctx, 503, {
      status: 'error',
      code: 'STORE_UNAVAILABLE',
      correlationId: ctx.correlationId,
      message: 'Cannot verify write-block state; mutation refused.',
    });
  }
  try {
    const db = ctx.env.DB as unknown as D1DatabaseBinding;
    const decision = await resolveWriteAdmissionFromD1(db, authenticatedUid);
    assertWriteAdmissionPermitsMutation(decision);
    if (MUTATION_HTTP_METHODS.has(ctx.method.toUpperCase())) {
      const { permitId } = await acquireD1MutationPermit({
        db,
        targetUid: authenticatedUid,
        holderId: ctx.correlationId,
        routeSignature: `${ctx.method} ${ctx.pathname}`,
      });
      ACTIVE_PERMITS.set(ctx.request, { permitId, targetUid: authenticatedUid });
    }
    return null;
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : 'USER_WRITES_BLOCKED_BY_DELETION';
    const status = err && typeof err === 'object' && 'httpStatus' in err ? Number((err as { httpStatus: number }).httpStatus) : 423;
    return jsonWorkerResponse(ctx, status, {
      status: 'error',
      code,
      correlationId: ctx.correlationId,
      message: 'Account mutation blocked during deletion.',
    });
  }
}

export async function releaseWorkerMutationPermitIfHeld(ctx: WorkerRequestContext): Promise<void> {
  const held = ACTIVE_PERMITS.get(ctx.request);
  if (!held || !ctx.env.DB) return;
  ACTIVE_PERMITS.delete(ctx.request);
  try {
    await releaseD1MutationPermit({
      db: ctx.env.DB as unknown as D1DatabaseBinding,
      targetUid: held.targetUid,
      permitId: held.permitId,
    });
  } catch {
    /* permit may already be released or expired */
  }
}