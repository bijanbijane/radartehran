import { assertWriteAdmissionPermitsMutation } from '../../server/modules/account-lifecycle/writeAdmissionAuthority.ts';
import {
  isLifecycleExemptPath,
  MUTATION_HTTP_METHODS,
} from '../../server/modules/account-lifecycle/mutationWriteBlockGuard.ts';
import { resolveWriteAdmissionFromD1 } from './d1WriteAdmissionResolver.ts';
import { requireUserDb } from '../db/bindingResolver.ts';
import type { WorkerRequestContext, D1Database } from '../types.ts';
import type { D1DatabaseBinding } from '../db/types.ts';
import { jsonWorkerResponse } from '../contextAndSecurity.ts';
import {
  acquireMutationPermitInD1,
  releaseMutationPermitInD1,
} from './d1MutationPermit.ts';

const ACTIVE_PERMITS = new WeakMap<Request, { permitId: string; userDb: D1Database }>();

export async function enforceWorkerMutationWriteBlock(
  ctx: WorkerRequestContext,
  authenticatedUid: string | undefined,
): Promise<Response | null> {
  if (!authenticatedUid) return null;
  if (isLifecycleExemptPath(ctx.pathname, ctx.method)) return null;

  const userDbResult = requireUserDb(ctx.env);
  if (userDbResult.ok === false) {
    return jsonWorkerResponse(ctx, 503, {
      status: 'error',
      code: userDbResult.code,
      correlationId: ctx.correlationId,
      message: 'Cannot verify write-block state; mutation refused.',
    });
  }

  const userDb = userDbResult.db;
  try {
    const decision = await resolveWriteAdmissionFromD1(
      userDb as unknown as D1DatabaseBinding,
      authenticatedUid,
    );
    assertWriteAdmissionPermitsMutation(decision);

    if (MUTATION_HTTP_METHODS.has(ctx.method.toUpperCase())) {
      const permit = await acquireMutationPermitInD1({
        userDb,
        uid: authenticatedUid,
        operationName: `${ctx.method.toUpperCase()} ${ctx.pathname}`,
      });
      if (permit.ok === false) {
        throw Object.assign(new Error(permit.code), {
          code: permit.code,
          httpStatus: permit.statusCode,
        });
      }
      ACTIVE_PERMITS.set(ctx.request, { permitId: permit.permitId, userDb });
    }
    return null;
  } catch (err) {
    const hasHttpStatus = Boolean(err && typeof err === 'object' && 'httpStatus' in err);
    const code = err && typeof err === 'object' && 'code' in err
      ? String((err as { code: string }).code)
      : 'WRITE_ADMISSION_UNAVAILABLE';
    const status = hasHttpStatus
      ? Number((err as { httpStatus: number }).httpStatus)
      : 503;
    return jsonWorkerResponse(ctx, status, {
      status: 'error',
      code,
      correlationId: ctx.correlationId,
      message: 'Account mutation blocked because write admission could not be verified.',
    });
  }
}

export async function releaseWorkerMutationPermitIfHeld(ctx: WorkerRequestContext): Promise<void> {
  const held = ACTIVE_PERMITS.get(ctx.request);
  if (!held) return;
  ACTIVE_PERMITS.delete(ctx.request);
  try {
    await releaseMutationPermitInD1({
      userDb: held.userDb,
      permitId: held.permitId,
    });
  } catch {
    /* permit may already be released or expired */
  }
}
