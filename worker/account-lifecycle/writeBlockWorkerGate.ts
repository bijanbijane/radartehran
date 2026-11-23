import { assertWriteAdmissionPermitsMutation } from '../../server/modules/account-lifecycle/writeAdmissionAuthority.ts';
import {
  isLifecycleExemptPath,
  MUTATION_HTTP_METHODS,
} from '../../server/modules/account-lifecycle/mutationWriteBlockGuard.ts';
import { resolveWriteAdmissionFromD1 } from './d1WriteAdmissionResolver.ts';
import { resolveWriteAdmissionFromUserDb } from './d1UserWriteAdmissionResolver.ts';
import { requireUserDb } from '../db/bindingResolver.ts';
import { acquireD1MutationPermit, releaseD1MutationPermit } from './d1WriteAdmissionPermit.ts';
import { acquireMutationPermitInD1, releaseMutationPermitInD1 } from './d1MutationPermit.ts';
import type { WorkerRequestContext } from '../types.ts';
import type { D1DatabaseBinding } from '../db/types.ts';
import { jsonWorkerResponse } from '../contextAndSecurity.ts';

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
    const stageDRequested = ctx.env.STAGE_D_LIFECYCLE_ENABLED?.trim().toLowerCase() === 'true';
    if (stageDRequested) {
      const lifecycleDatabaseId = ctx.env.STAGE_D_LIFECYCLE_DATABASE_ID?.trim();
      const userDatabaseId = ctx.env.STAGE_D_USER_DATABASE_ID?.trim();
      if (!ctx.env.DB || !ctx.env.USER_DB || ctx.env.DB === ctx.env.USER_DB ||
          !lifecycleDatabaseId || !userDatabaseId || lifecycleDatabaseId === userDatabaseId) {
        return unavailable(ctx, 'STAGE_D_DUAL_DATABASE_BINDINGS_UNVERIFIED');
      }

      const lifecycleDb = ctx.env.DB as unknown as D1DatabaseBinding;
      const userDbResult = requireUserDb(ctx.env);
      if (userDbResult.ok === false) return unavailable(ctx, userDbResult.code);
      const userDb = userDbResult.db;

      const [userDecision, lifecycleDecision] = await Promise.all([
        resolveWriteAdmissionFromUserDb(userDb, authenticatedUid),
        resolveWriteAdmissionFromD1(lifecycleDb, authenticatedUid),
      ]);
      assertWriteAdmissionPermitsMutation(userDecision);
      assertWriteAdmissionPermitsMutation(lifecycleDecision);

      if (MUTATION_HTTP_METHODS.has(ctx.method.toUpperCase())) {
        const userPermit = await acquireMutationPermitInD1({
          userDb,
          uid: authenticatedUid,
          operationName: ctx.method.toUpperCase() + ' ' + ctx.pathname,
          ttlMs: 120_000,
        });
        if (userPermit.ok === false) {
          throw Object.assign(new Error(userPermit.code), {
            code: userPermit.code,
            httpStatus: userPermit.statusCode,
          });
        }

        try {
          const lifecyclePermit = await acquireD1MutationPermit({
            db: lifecycleDb,
            targetUid: authenticatedUid,
            holderId: ctx.correlationId,
            routeSignature: ctx.method.toUpperCase() + ' ' + ctx.pathname,
          });
          ACTIVE_PERMITS.set(ctx.request, async () => {
            const released = await Promise.allSettled([
              releaseMutationPermitInD1({ userDb, permitId: userPermit.permitId }),
              releaseD1MutationPermit({ db: lifecycleDb, targetUid: authenticatedUid, permitId: lifecyclePermit.permitId }),
            ]);
            if (released.some((result) => result.status === 'rejected')) {
              throw new Error('DUAL_DATABASE_MUTATION_PERMIT_RELEASE_INCOMPLETE');
            }
          });
        } catch (error) {
          await releaseMutationPermitInD1({ userDb, permitId: userPermit.permitId }).catch(() => undefined);
          throw error;
        }
      }
      return null;
    }

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
          operationName: ctx.method.toUpperCase() + ' ' + ctx.pathname,
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

    if (!ctx.env.DB) return unavailable(ctx, 'D1_BINDING_UNAVAILABLE');
    const db = ctx.env.DB as unknown as D1DatabaseBinding;
    const decision = await resolveWriteAdmissionFromD1(db, authenticatedUid);
    assertWriteAdmissionPermitsMutation(decision);

    if (MUTATION_HTTP_METHODS.has(ctx.method.toUpperCase())) {
      const permit = await acquireD1MutationPermit({
        db,
        targetUid: authenticatedUid,
        holderId: ctx.correlationId,
        routeSignature: ctx.method.toUpperCase() + ' ' + ctx.pathname,
      });
      ACTIVE_PERMITS.set(ctx.request, async () => {
        await releaseD1MutationPermit({ db, targetUid: authenticatedUid, permitId: permit.permitId });
      });
    }
    return null;
  } catch (error) {
    const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    const code = typeof record.code === 'string' ? record.code : 'WRITE_ADMISSION_UNAVAILABLE';
    const candidateStatus = typeof record.httpStatus === 'number' ? record.httpStatus : 503;
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
