import { isLifecycleExemptPath, MUTATION_HTTP_METHODS } from '../../server/modules/account-lifecycle/mutationWriteBlockGuard.ts';
import { resolveUserDb } from '../db/bindingResolver.ts';
import type { WorkerRequestContext } from '../types.ts';
import { jsonWorkerResponse } from '../contextAndSecurity.ts';
import { acquireMutationPermitInD1, releaseMutationPermitInD1 } from './d1MutationPermit.ts';

const ACTIVE_PERMITS = new WeakMap<Request, { permitId: string; targetUid: string }>();

export async function enforceWorkerMutationWriteBlock(
  ctx: WorkerRequestContext,
  authenticatedUid: string | undefined,
): Promise<Response | null> {
  if (!authenticatedUid || isLifecycleExemptPath(ctx.pathname, ctx.method)) return null;
  if (!MUTATION_HTTP_METHODS.has(ctx.method.toUpperCase())) return null;

  const userDb = resolveUserDb(ctx.env);
  if (!userDb) {
    return jsonWorkerResponse(ctx, 503, {
      status: 'error',
      code: 'USER_DB_UNAVAILABLE',
      correlationId: ctx.correlationId,
      message: 'Cannot verify write-block state; mutation refused.',
    });
  }

  try {
    // The USER_DB schema uses uid/job_id/released_at_iso. This single SQL
    // statement atomically checks the active block and acquires the permit.
    const permit = await acquireMutationPermitInD1({
      userDb,
      uid: authenticatedUid,
      operationName: `${ctx.method.toUpperCase()} ${ctx.pathname}`,
      ttlMs: 30_000,
    });
    if (!permit.ok) {
      return jsonWorkerResponse(ctx, 423, {
        status: 'error',
        code: 'ACCOUNT_WRITE_BLOCKED',
        correlationId: ctx.correlationId,
        message: 'Account mutation blocked during deletion.',
      });
    }
    ACTIVE_PERMITS.set(ctx.request, { permitId: permit.permitId, targetUid: authenticatedUid });
    return null;
  } catch {
    // Missing tables, schema drift, and D1 read/write failures must never
    // be interpreted as permission to mutate.
    return jsonWorkerResponse(ctx, 503, {
      status: 'error',
      code: 'WRITE_ADMISSION_UNAVAILABLE',
      correlationId: ctx.correlationId,
      message: 'Cannot verify write-block state; mutation refused.',
    });
  }
}

export async function releaseWorkerMutationPermitIfHeld(ctx: WorkerRequestContext): Promise<void> {
  const held = ACTIVE_PERMITS.get(ctx.request);
  if (!held) return;
  ACTIVE_PERMITS.delete(ctx.request);
  const userDb = resolveUserDb(ctx.env);
  if (!userDb) return;
  try {
    await releaseMutationPermitInD1({ userDb, permitId: held.permitId });
  } catch {
    // Expired or already released permits are reclaimed by the durable TTL gate.
  }
}
