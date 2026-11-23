/**
 * Global Express API mutation write-block middleware (D-H2-01).
 * Decisions come exclusively from D1 via authenticated Worker RPC — not the Express journal.
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
import { queryWriteAdmissionViaWorkerRpc } from './expressWriteAdmissionRpcClient.ts';

/**
 * Applies D1-authoritative write admission to authenticated user mutations on `/api/*`.
 * Unauthenticated mutations pass to route handlers (those routes must enforce auth separately).
 */
export type VerifyFirebaseUserAuthorizationFn = typeof verifyFirebaseUserAuthorization;

export interface ExpressMutationWriteBlockMiddlewareOptions {
  readonly verifyUserAuth?: VerifyFirebaseUserAuthorizationFn;
  readonly resolveAdmission?: (uid: string) => ReturnType<typeof queryWriteAdmissionViaWorkerRpc>;
}

export function createExpressMutationWriteBlockMiddleware(
  options?: ExpressMutationWriteBlockMiddlewareOptions,
) {
  const verifyUserAuth = options?.verifyUserAuth ?? verifyFirebaseUserAuthorization;
  const resolveAdmission =
    options?.resolveAdmission ??
    ((uid: string) => queryWriteAdmissionViaWorkerRpc({ targetUid: uid }));

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