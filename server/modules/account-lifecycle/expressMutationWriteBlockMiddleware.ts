/**
 * Global Express API mutation write-block middleware (D-H2-01).
 * Authenticated mutations hold a durable USER_DB permit for their full response lifetime.
 */
import type { Request, Response, NextFunction } from 'express';
import {
  verifyFirebaseUserAuthorization,
} from '../../../src/utils/serverAdminAndTelegramSecurity.ts';
import {
  assertAccountMutationPermittedViaWriteAdmission,
  classifyMutationRoute,
} from './mutationWriteBlockGuard.ts';
import { AccountLifecycleError } from './types.ts';
import {
  acquireMutationPermitViaWorkerRpc,
  queryWriteAdmissionViaWorkerRpc,
  releaseMutationPermitViaWorkerRpc,
} from './expressWriteAdmissionRpcClient.ts';
import type { MutationPermitAcquisition } from './expressWriteAdmissionRpcClient.ts';

export type VerifyFirebaseUserAuthorizationFn = typeof verifyFirebaseUserAuthorization;

export interface ExpressMutationWriteBlockMiddlewareOptions {
  readonly verifyUserAuth?: VerifyFirebaseUserAuthorizationFn;
  readonly resolveAdmission?: (uid: string) => ReturnType<typeof queryWriteAdmissionViaWorkerRpc>;
  readonly acquirePermit?: (uid: string, operationName: string) => Promise<MutationPermitAcquisition>;
  readonly releasePermit?: (uid: string, permitId: string) => Promise<void>;
}

export function createExpressMutationWriteBlockMiddleware(
  options?: ExpressMutationWriteBlockMiddlewareOptions,
) {
  const verifyUserAuth = options?.verifyUserAuth ?? verifyFirebaseUserAuthorization;
  const resolveAdmission = options?.resolveAdmission ??
    ((uid: string) => queryWriteAdmissionViaWorkerRpc({ targetUid: uid }));
  const acquirePermit = options?.acquirePermit ??
    (options?.resolveAdmission ? undefined :
      ((uid: string, operationName: string) =>
        acquireMutationPermitViaWorkerRpc({ targetUid: uid, operationName })));
  const releasePermit = options?.releasePermit ??
    ((uid: string, permitId: string) =>
      releaseMutationPermitViaWorkerRpc({ targetUid: uid, permitId }));

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const path = req.path.startsWith('/api') ? req.path : `/api${req.path}`;
    const kind = classifyMutationRoute(req.method, path);
    if (kind !== 'MUTATION') {
      next();
      return;
    }

    const auth = await verifyUserAuth(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      next();
      return;
    }

    if (acquirePermit) {
      let permit: MutationPermitAcquisition;
      try {
        permit = await acquirePermit(auth.uid, `${req.method.toUpperCase()} ${path}`);
      } catch {
        res.status(503).json({
          status: 'error',
          code: 'WRITE_ADMISSION_PERMIT_ACQUIRE_FAILED',
          message: 'Cannot acquire a durable account mutation permit; mutation refused.',
        });
        return;
      }
      if (!permit.ok) {
        res.status(permit.statusCode).json({
          status: 'error',
          code: permit.code,
          message: 'Account mutation is blocked or write-admission storage is unavailable.',
        });
        return;
      }

      let releasePromise: Promise<void> | undefined;
      const releaseOnce = (): Promise<void> => {
        releasePromise ??= releasePermit(auth.uid!, permit.permitId);
        return releasePromise;
      };
      try {
        res.once('finish', () => {
          void releaseOnce().catch((error) => console.error('Express USER_DB mutation permit release failed:', error));
        });
        res.once('close', () => {
          void releaseOnce().catch((error) => console.error('Express USER_DB mutation permit release failed:', error));
        });
        next();
      } catch (error) {
        await releaseOnce().catch(() => undefined);
        throw error;
      }
      return;
    }

    try {
      await assertAccountMutationPermittedViaWriteAdmission({
        authenticatedUid: auth.uid,
        pathname: path,
        method: req.method,
        resolveAdmission,
      });
      next();
    } catch (err) {
      if (err instanceof AccountLifecycleError) {
        res.status(err.httpStatus).json({
          status: 'error',
          code: err.code,
          message: err.message,
        });
        return;
      }
      res.status(503).json({
        status: 'error',
        code: 'STORE_UNAVAILABLE',
        message: 'Cannot verify account write-block state; mutation refused.',
      });
    }
  };
}
