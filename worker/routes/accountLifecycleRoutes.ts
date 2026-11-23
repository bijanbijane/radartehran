/**
 * Official /api/v1/account/lifecycle/* Worker handlers.
 *
 * Account deletion is executed by the canonical USER_DB lifecycle engine.
 * Research erasure retries use its durable outbox; there is no parallel in-memory
 * orchestrator or synthetic queue state in this route.
 */

import {
  ACCOUNT_LIFECYCLE_API_PREFIX,
  OFFICIAL_ACCOUNT_LIFECYCLE_ROUTES,
} from '../../server/modules/account-lifecycle/officialApiContract.ts';
import { AccountLifecycleError, type AccountLifecycleActorContext } from '../../server/modules/account-lifecycle/types.ts';
import {
  evaluateWorkerAuthorization,
  resolveWorkerAuthContext,
} from '../auth/authorizationPolicy.ts';
import { jsonWorkerResponse, readValidatedJsonBody } from '../contextAndSecurity.ts';
import {
  executeAccountDeletionLifecycle,
  processPendingResearchErasureOutbox,
} from '../account-lifecycle/workerLifecycleRuntime.ts';
import { requireUserDb, resolveResearchDb } from '../db/bindingResolver.ts';
import type { WorkerRequestContext } from '../types.ts';

const FRESH_AUTH_MAX_AGE_SECONDS = 300;

export function isAccountLifecyclePath(pathname: string): boolean {
  return pathname === ACCOUNT_LIFECYCLE_API_PREFIX || pathname.startsWith(`${ACCOUNT_LIFECYCLE_API_PREFIX}/`);
}

function matchDeletionJobId(pathname: string): string | null {
  const prefix = `${ACCOUNT_LIFECYCLE_API_PREFIX}/deletion/`;
  if (!pathname.startsWith(prefix)) return null;
  const remainder = pathname.slice(prefix.length);
  if (remainder.includes('/')) return null;
  try {
    const decoded = decodeURIComponent(remainder);
    return /^[A-Za-z0-9_-]{1,128}$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function errorResponse(ctx: WorkerRequestContext, error: unknown): Response {
  if (error instanceof AccountLifecycleError) {
    return jsonWorkerResponse(ctx, error.httpStatus, {
      status: 'error',
      code: error.code,
      correlationId: ctx.correlationId,
    });
  }
  console.error('ACCOUNT_LIFECYCLE_ROUTE_FAILED', JSON.stringify({
    correlationId: ctx.correlationId,
    errorName: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
  }));
  return jsonWorkerResponse(ctx, 503, {
    status: 'error',
    code: 'ACCOUNT_LIFECYCLE_UNAVAILABLE',
    correlationId: ctx.correlationId,
    message: 'سرویس چرخه عمر حساب موقتاً در دسترس نیست.',
  });
}

export async function handleAccountLifecycleRoute(ctx: WorkerRequestContext): Promise<Response | null> {
  if (!isAccountLifecyclePath(ctx.pathname)) return null;

  const userDbResult = requireUserDb(ctx.env);
  if (userDbResult.ok === false) {
    return jsonWorkerResponse(ctx, userDbResult.statusCode, {
      status: 'error',
      code: userDbResult.code,
      correlationId: ctx.correlationId,
      message: userDbResult.messageFa,
    });
  }

  // Some lifecycle adapters still consume the legacy DB alias. Point it only at
  // the already-validated USER_DB binding; never substitute RESEARCH_DB.
  const lifecycleContext: WorkerRequestContext = {
    ...ctx,
    env: { ...ctx.env, DB: userDbResult.db },
  };

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

  const principal = auth.principal;
  const freshAuthDecision = evaluateWorkerAuthorization(auth, {
    policy: 'VERIFIED_USER',
    maxAuthAgeSeconds: FRESH_AUTH_MAX_AGE_SECONDS,
  });
  const actor: AccountLifecycleActorContext = {
    uid: principal.uid,
    email: principal.email,
    isAdmin: principal.isPrimaryAdmin || principal.isDelegatedAdmin || principal.role === 'service_admin',
    freshAuthVerified: freshAuthDecision.allowed,
  };

  try {
    if (ctx.method === 'POST' && ctx.pathname === `${ACCOUNT_LIFECYCLE_API_PREFIX}/deletion`) {
      if (!freshAuthDecision.allowed) {
        return jsonWorkerResponse(ctx, freshAuthDecision.statusCode, {
          status: 'error',
          code: freshAuthDecision.failureCode ?? 'RECENT_AUTHENTICATION_REQUIRED',
          correlationId: ctx.correlationId,
          message: freshAuthDecision.reasonFa,
        });
      }

      const parsed = await readValidatedJsonBody(ctx.request, 16 * 1024);
      if (!parsed.ok) {
        return jsonWorkerResponse(ctx, parsed.status, {
          status: 'error',
          code: parsed.code,
          correlationId: ctx.correlationId,
          message: parsed.messageFa,
        });
      }
      const suppliedKey = ctx.request.headers.get('idempotency-key') || parsed.body.idempotencyKey;
      const idempotencyKey = typeof suppliedKey === 'string' && suppliedKey.trim()
        ? suppliedKey.trim()
        : `account-deletion:${principal.uid}`;
      if (idempotencyKey.length > 160 || /[\r\n\u0000]/.test(idempotencyKey)) {
        return jsonWorkerResponse(ctx, 400, {
          status: 'error',
          code: 'INVALID_IDEMPOTENCY_KEY',
          correlationId: ctx.correlationId,
        });
      }
      const reason = typeof parsed.body.reason === 'string'
        ? parsed.body.reason.trim().slice(0, 120)
        : 'USER_REQUESTED_ERASURE';

      const result = await executeAccountDeletionLifecycle({
        env: lifecycleContext.env,
        uid: principal.uid,
        actorUid: principal.uid,
        idempotencyKey,
        reason: reason || 'USER_REQUESTED_ERASURE',
      });
      return jsonWorkerResponse(ctx, result.statusCode, {
        status: result.ok ? 'ok' : 'error',
        jobId: result.jobId,
        jobState: result.status,
        idempotentReplay: result.idempotentReplay,
        userDbDeletedRecords: result.userDbDeletedRecords,
        outboxItemsQueued: result.outboxItemsQueued,
        outboxItemsCompleted: result.outboxItemsCompleted,
        researchEventsErased: result.researchEventsErased,
        code: result.code,
        correlationId: ctx.correlationId,
      });
    }

    if (ctx.method === 'GET' && ctx.pathname.startsWith(`${ACCOUNT_LIFECYCLE_API_PREFIX}/deletion/`)) {
      const jobId = matchDeletionJobId(ctx.pathname);
      if (!jobId) {
        return jsonWorkerResponse(ctx, 400, {
          status: 'error',
          code: 'INVALID_DELETION_JOB_ID',
          correlationId: ctx.correlationId,
        });
      }
      const job = await userDbResult.db
        .prepare(
          `SELECT job_id, status, stage, legal_hold_blocked, attempt_count,
                  last_error_code, created_at_iso, updated_at_iso, completed_at_iso
           FROM account_deletion_jobs
           WHERE job_id = ?1 AND uid = ?2
           LIMIT 1`,
        )
        .bind(jobId, principal.uid)
        .first<Record<string, unknown>>();
      if (!job) {
        return jsonWorkerResponse(ctx, 404, {
          status: 'error',
          code: 'DELETION_JOB_NOT_FOUND',
          correlationId: ctx.correlationId,
        });
      }
      return jsonWorkerResponse(ctx, 200, {
        status: 'ok',
        job,
        correlationId: ctx.correlationId,
      });
    }

    const continuePrefix = `${ACCOUNT_LIFECYCLE_API_PREFIX}/deletion/`;
    const continueSuffix = '/continue';
    const isContinueRoute =
      ctx.method === 'POST' &&
      ctx.pathname.startsWith(continuePrefix) &&
      ctx.pathname.endsWith(continueSuffix);
    if (isContinueRoute) {
      const adminDecision = evaluateWorkerAuthorization(auth, { policy: 'ADMIN' });
      if (!adminDecision.allowed) {
        return jsonWorkerResponse(ctx, adminDecision.statusCode, {
          status: 'error',
          code: adminDecision.failureCode ?? 'NOT_ADMIN_USER',
          correlationId: ctx.correlationId,
          message: adminDecision.reasonEn,
        });
      }
      const jobId = ctx.pathname.slice(continuePrefix.length, -continueSuffix.length);
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) {
        return jsonWorkerResponse(ctx, 400, {
          status: 'error',
          code: 'INVALID_DELETION_JOB_ID',
          correlationId: ctx.correlationId,
        });
      }
      const jobExists = await userDbResult.db
        .prepare('SELECT job_id FROM account_deletion_jobs WHERE job_id = ?1 LIMIT 1')
        .bind(jobId)
        .first<{ job_id: string }>();
      if (!jobExists) {
        return jsonWorkerResponse(ctx, 404, {
          status: 'error',
          code: 'DELETION_JOB_NOT_FOUND',
          correlationId: ctx.correlationId,
        });
      }
      const outbox = await processPendingResearchErasureOutbox({
        userDb: userDbResult.db,
        researchDb: resolveResearchDb(ctx.env),
        jobId,
        receiptSecret: ctx.env.INTERNAL_LIFECYCLE_RPC_SECRET || ctx.env.RESEARCH_HMAC_SECRET,
      });
      const job = await userDbResult.db
        .prepare('SELECT job_id, status, stage, updated_at_iso, completed_at_iso FROM account_deletion_jobs WHERE job_id = ?1 LIMIT 1')
        .bind(jobId)
        .first<Record<string, unknown>>();
      return jsonWorkerResponse(ctx, 200, {
        status: 'ok',
        job,
        outbox,
        correlationId: ctx.correlationId,
      });
    }

    if (
      ctx.pathname === `${ACCOUNT_LIFECYCLE_API_PREFIX}/export` ||
      ctx.pathname.startsWith(`${ACCOUNT_LIFECYCLE_API_PREFIX}/export/`)
    ) {
      const { handleWorkerLifecycleExport } = await import('../account-lifecycle/workerAccountLifecyclePrivacyExport.ts');
      return handleWorkerLifecycleExport(lifecycleContext, actor);
    }

    if (
      ctx.pathname === `${ACCOUNT_LIFECYCLE_API_PREFIX}/privacy` ||
      ctx.pathname.startsWith(`${ACCOUNT_LIFECYCLE_API_PREFIX}/privacy/`)
    ) {
      const { handleWorkerLifecyclePrivacy } = await import('../account-lifecycle/workerAccountLifecyclePrivacyExport.ts');
      return handleWorkerLifecyclePrivacy(lifecycleContext, actor);
    }

    void OFFICIAL_ACCOUNT_LIFECYCLE_ROUTES;
    return jsonWorkerResponse(ctx, 404, {
      status: 'error',
      code: 'LIFECYCLE_ROUTE_NOT_FOUND',
      path: ctx.pathname,
      correlationId: ctx.correlationId,
    });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
