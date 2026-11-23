/**
 * Official /api/v1/account/lifecycle/* Worker handlers (Stage D).
 */

import { ACCOUNT_LIFECYCLE_API_PREFIX, OFFICIAL_ACCOUNT_LIFECYCLE_ROUTES } from '../../server/modules/account-lifecycle/officialApiContract.ts';
import { resolveWorkerAuthContext, evaluateWorkerAuthorization } from '../auth/authorizationPolicy.ts';
import { jsonWorkerResponse } from '../contextAndSecurity.ts';
import type { WorkerRequestContext } from '../types.ts';
import { createD1AccountLifecycleStore } from '../../server/modules/account-lifecycle/storeFactory.ts';
import {
  buildLifecycleActorFromPrincipal,
  initiateWorkerAccountDeletion,
  mapLifecycleErrorToHttp,
  requireWorkerLifecycleBindings,
  createWorkerLifecycleOrchestrator,
} from '../account-lifecycle/workerLifecycleRuntime.ts';

export function isAccountLifecyclePath(pathname: string): boolean {
  return pathname.startsWith(ACCOUNT_LIFECYCLE_API_PREFIX);
}

function matchDeletionJobId(pathname: string): string | null {
  const prefix = `${ACCOUNT_LIFECYCLE_API_PREFIX}/deletion/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const segment = rest.split('/')[0];
  if (!segment || segment.includes('..')) return null;
  return decodeURIComponent(segment);
}

export async function handleAccountLifecycleRoute(ctx: WorkerRequestContext): Promise<Response | null> {
  if (!isAccountLifecyclePath(ctx.pathname)) return null;

  try {
    requireWorkerLifecycleBindings(ctx.env);
  } catch (err) {
    const mapped = mapLifecycleErrorToHttp(err);
    return jsonWorkerResponse(ctx, mapped.status, {
      status: 'error',
      code: mapped.code,
      correlationId: ctx.correlationId,
      message: mapped.message,
    });
  }

  const auth = await resolveWorkerAuthContext(ctx.request, {
    expectedProjectId: ctx.env.FIREBASE_PROJECT_ID,
    adminApiSecret: ctx.env.ADMIN_API_SECRET,
    adminEmail: ctx.env.ADMIN_EMAIL,
    requireAppCheck: true,
    env: ctx.env,
  });
  if (!auth.authenticated || !auth.principal) {
    return jsonWorkerResponse(ctx, auth.failureStatusCode ?? 401, {
      status: 'error',
      code: auth.failureCode ?? 'UNAUTHENTICATED',
      correlationId: ctx.correlationId,
      message: auth.failureReason ?? 'Authentication required.',
    });
  }

  if (ctx.method === 'POST' && ctx.pathname === `${ACCOUNT_LIFECYCLE_API_PREFIX}/deletion`) {
    const actor = buildLifecycleActorFromPrincipal({
      uid: auth.principal.uid,
      email: auth.principal.email,
      isAdmin: auth.principal.isPrimaryAdmin || auth.principal.isDelegatedAdmin,
      authTimeSeconds: auth.principal.authTimeSeconds,
    });
    if (!actor.freshAuthVerified) {
      return jsonWorkerResponse(ctx, 403, {
        status: 'error',
        code: 'FRESH_AUTH_REQUIRED',
        correlationId: ctx.correlationId,
        message: 'Recent re-authentication is required for account deletion.',
      });
    }
    try {
      const result = await initiateWorkerAccountDeletion({
        env: ctx.env,
        actor,
        correlationId: ctx.correlationId,
      });
      return jsonWorkerResponse(ctx, 202, {
        status: 'accepted',
        jobId: result.jobId,
        jobState: result.state,
        createdNew: result.createdNew,
        queueDispatchConfirmed: result.queued,
        correlationId: ctx.correlationId,
      });
    } catch (err) {
      const mapped = mapLifecycleErrorToHttp(err);
      return jsonWorkerResponse(ctx, mapped.status, { status: 'error', code: mapped.code, correlationId: ctx.correlationId, message: mapped.message });
    }
  }

  if (ctx.method === 'GET' && ctx.pathname.startsWith(`${ACCOUNT_LIFECYCLE_API_PREFIX}/deletion/`)) {
    const jobId = matchDeletionJobId(ctx.pathname);
    if (!jobId || ctx.pathname.includes('/continue')) return null;
    const actor = buildLifecycleActorFromPrincipal({
      uid: auth.principal.uid,
      email: auth.principal.email,
      isAdmin: auth.principal.isPrimaryAdmin || auth.principal.isDelegatedAdmin,
    });
    try {
      const orchestrator = createWorkerLifecycleOrchestrator(ctx.env);
      const job = await orchestrator.getDeletionJobStatus(actor, jobId);
      return jsonWorkerResponse(ctx, 200, {
        status: 'ok',
        job,
        correlationId: ctx.correlationId,
      });
    } catch (err) {
      const mapped = mapLifecycleErrorToHttp(err);
      return jsonWorkerResponse(ctx, mapped.status, { status: 'error', code: mapped.code, correlationId: ctx.correlationId, message: mapped.message });
    }
  }

  const continueMatch = ctx.pathname.match(
    new RegExp(`^${ACCOUNT_LIFECYCLE_API_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/deletion/([^/]+)/continue$`),
  );
  if (ctx.method === 'POST' && continueMatch) {
    const jobId = decodeURIComponent(continueMatch[1]);
    const adminDecision = evaluateWorkerAuthorization(auth, {
      policy: 'ADMIN',
      requirePrimaryAdmin: false,
    });
    if (!adminDecision.allowed) {
      return jsonWorkerResponse(ctx, adminDecision.statusCode, {
        status: 'error',
        code: adminDecision.failureCode ?? 'FORBIDDEN',
        correlationId: ctx.correlationId,
        message: adminDecision.reasonEn,
      });
    }
    const store = createD1AccountLifecycleStore(ctx.env.DB!);
    const job = await store.getJobById(jobId);
    if (!job) {
      return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'JOB_NOT_FOUND', correlationId: ctx.correlationId });
    }
    const { executeBoundedDeletionStep } = await import('../account-lifecycle/workerLifecycleRuntime.ts');
    try {
      const result = await executeBoundedDeletionStep({
        env: ctx.env,
        jobId,
        targetUid: job.targetUid,
        leaseOwner: ctx.correlationId,
        maxBatchesPerInvocation: 5,
      });
      return jsonWorkerResponse(ctx, 200, { status: 'ok', terminal: result.terminal, jobState: result.state, correlationId: ctx.correlationId });
    } catch (err) {
      const mapped = mapLifecycleErrorToHttp(err);
      return jsonWorkerResponse(ctx, mapped.status, { status: 'error', code: mapped.code, correlationId: ctx.correlationId, message: mapped.message });
    }
  }

  const actorForLifecycle = buildLifecycleActorFromPrincipal({
    uid: auth.principal.uid,
    email: auth.principal.email,
    isAdmin: auth.principal.isPrimaryAdmin || auth.principal.isDelegatedAdmin,
    authTimeSeconds: auth.principal.authTimeSeconds,
  });

  if (ctx.pathname.startsWith(`${ACCOUNT_LIFECYCLE_API_PREFIX}/export`)) {
    const { handleWorkerLifecycleExport } = await import('../account-lifecycle/workerAccountLifecyclePrivacyExport.ts');
    return handleWorkerLifecycleExport(ctx, actorForLifecycle);
  }

  if (ctx.pathname.startsWith(`${ACCOUNT_LIFECYCLE_API_PREFIX}/privacy`)) {
    const { handleWorkerLifecyclePrivacy } = await import('../account-lifecycle/workerAccountLifecyclePrivacyExport.ts');
    return handleWorkerLifecyclePrivacy(ctx, actorForLifecycle);
  }

  void OFFICIAL_ACCOUNT_LIFECYCLE_ROUTES;
  return jsonWorkerResponse(ctx, 404, {
    status: 'error',
    code: 'LIFECYCLE_ROUTE_NOT_FOUND',
    path: ctx.pathname,
    correlationId: ctx.correlationId,
  });
}