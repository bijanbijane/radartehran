import { assertWriteAdmissionPermitsMutation } from '../../server/modules/account-lifecycle/writeAdmissionAuthority.ts';
import {
  isLifecycleExemptPath,
  MUTATION_HTTP_METHODS,
} from '../../server/modules/account-lifecycle/mutationWriteBlockGuard.ts';
import { resolveWriteAdmissionFromD1 } from './d1WriteAdmissionResolver.ts';
import { resolveWriteAdmissionFromUserDb } from './d1UserWriteAdmissionResolver.ts';
import { requireUserDb } from '../db/bindingResolver.ts';
import type { WorkerRequestContext } from '../types.ts';
import type { D1DatabaseBinding } from '../db/types.ts';
import { jsonWorkerResponse } from '../contextAndSecurity.ts';
import {
  acquireMutationPermitInD1,
  releaseMutationPermitInD1,
} from './d1MutationPermit.ts';
import {
  acquireD1MutationPermit,
  releaseD1MutationPermit,
} from './d1WriteAdmissionPermit.ts';

type PermitRelease = () => Promise<void>;
const ACTIVE_PERMITS = new WeakMap<Request, PermitRelease>();

function unavailable(ctx: WorkerRequestContext, code: string): Response {
  return jsonWorkerResponse(ctx, 503, {
    status: 'error',
    code,
    correlationId: ctx.correlationId,
    message: 'Cannot verify write-admission state; mutation refused.',
  });
}

export async function enforceWorkerMutationWriteBlock(
  ctx: WorkerRequestContext,
  authenticatedUid: string | undefined,
): Promise<Response | null> {
  if (!authenticatedUid) return null;
  if (isLifecycleExemptPath(ctx.pathname, ctx.method)) return null;

  try {
    if (ctx.env.USER_DB) {
      const userDbResult = requireUserDb(ctx.env);
      if (userDbResult.ok === false) return unavailable(ctx, userDbResult.code);
      const userDb = userDbResult.db;
      const decision = await resolveWriteAdmissionFromUserDb(userDb, authenticatedUid);
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
        ACTIVE_PERMITS.set(ctx.request, async () => {
          await releaseMutationPermitInD1({ userDb, permitId: permit.permitId });
        });
      }
      return null;
    }

    // The non-USER_DB Worker is the Stage D schema in migrations/d1/0004..0009.
    if (!ctx.env.DB) return unavailable(ctx, 'D1_BINDING_UNAVAILABLE');
    const db = ctx.env.DB as unknown as D1DatabaseBinding;
    const decision = await resolveWriteAdmissionFromD1(db, authenticatedUid);
    assertWriteAdmissionPermitsMutation(decision);

    if (MUTATION_HTTP_METHODS.has(ctx.method.toUpperCase())) {
      const permit = await acquireD1MutationPermit({
        db,
        targetUid: authenticatedUid,
        holderId: ctx.correlationId,
        routeSignature: `${ctx.method.toUpperCase()} ${ctx.pathname}`,
      });
      ACTIVE_PERMITS.set(ctx.request, async () => {
        await releaseD1MutationPermit({ db, targetUid: authenticatedUid, permitId: permit.permitId });
      });
    }
    return null;
  } catch (err) {
    const hasHttpStatus = Boolean(err && typeof err === 'object' && 'httpStatus' in err);
    const code = err && typeof err === 'object' && 'code' in err
      ? String((err as { code: string }).code)
      : 'WRITE_ADMISSION_UNAVAILABLE';
    const candidateStatus = hasHttpStatus
      ? Number((err as { httpStatus: number }).httpStatus)
      : 503;
    const status = Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
      ? candidateStatus
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
  const release = ACTIVE_PERMITS.get(ctx.request);
  if (!release) return;
  ACTIVE_PERMITS.delete(ctx.request);
  try {
    await release();
  } catch {
    /* The permit remains bounded by its durable expiry if release fails. */
  }
}
