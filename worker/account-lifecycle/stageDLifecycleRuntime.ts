/**
 * Stage D Worker runtime bridge.
 *
 * Kept separate from workerLifecycleRuntime.ts, which owns the USER_DB /
 * RESEARCH_DB triad. This runtime is only valid for the dedicated migrations/d1
 * schema and fails closed when the Worker is bound to USER_DB.
 */
import { AccountDeletionOrchestrator } from '../../server/modules/account-lifecycle/deletionOrchestrator.ts';
import {
  AccountLifecycleError,
  type AccountDeletionJobState,
  type AccountLifecycleActorContext,
} from '../../server/modules/account-lifecycle/types.ts';
import {
  AccountLifecycleStoreError,
  assertStoreHealthy,
} from '../../server/modules/account-lifecycle/storeContract.ts';
import { isTerminalAccountDeletionState } from '../../server/modules/account-lifecycle/stateMachine.ts';
import { D1AccountLifecycleStore } from './d1AccountLifecycleStore.ts';
import { D1AccountLifecycleDispatch } from './d1LifecycleDispatch.ts';
import { D1AccountDeletionBatchReceiptRecorder } from './d1BatchReceiptRecorder.ts';
import {
  createWorkerDomainAdapters,
  createWorkerFailClosedAuthAdapter,
  createWorkerTelemetryAdapter,
} from './workerLifecycleAdapters.ts';
import { createWorkerMediaDeletionAdapter } from './workerMediaAdapter.ts';
import {
  ACCOUNT_LIFECYCLE_QUEUE_JOB_TYPE,
  buildLifecycleQueueIdempotencyKey,
  validateLifecycleQueuePayload,
} from './lifecycleQueueContract.ts';
import { validateQueueEnvelope, type RadarQueueEnvelope } from '../queues/queueAndCronProcessor.ts';
import type { D1DatabaseBinding } from '../db/types.ts';
import type { WorkerEnv } from '../types.ts';

export const FRESH_AUTH_MAX_AGE_SECONDS = 300;
const DEFAULT_EXECUTION_BATCH_SIZE = 10;
const DEFAULT_MAX_BATCHES_PER_INVOCATION = 5;
const RETRYABLE_LIFECYCLE_DELAY_MS = 15 * 60 * 1000;
const DISPATCH_FAILURE_RETRY_MS = 60 * 1000;

export function buildLifecycleActorFromPrincipal(params: {
  uid: string;
  email?: string;
  isAdmin: boolean;
  authTimeSeconds?: number;
  primaryBootstrapAdminEmail?: string;
}): AccountLifecycleActorContext {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const authTime = params.authTimeSeconds;
  const freshAuthVerified =
    typeof authTime === 'number' &&
    Number.isFinite(authTime) &&
    authTime > 0 &&
    authTime <= nowSeconds &&
    nowSeconds - authTime <= FRESH_AUTH_MAX_AGE_SECONDS;

  return {
    uid: String(params.uid || '').trim(),
    email: params.email?.trim().toLowerCase() || undefined,
    isAdmin: params.isAdmin === true,
    freshAuthVerified,
    primaryBootstrapAdminEmail: params.primaryBootstrapAdminEmail?.trim().toLowerCase() || undefined,
  };
}

export function requireWorkerLifecycleBindings(env: WorkerEnv): void {
  if (!env.DB && !env.USER_DB) {
    throw new AccountLifecycleError('STORE_UNAVAILABLE', 'Account lifecycle D1 binding is unavailable.', 503);
  }
}

function requireStageDDatabase(env: WorkerEnv): D1DatabaseBinding {
  if (env.USER_DB) {
    throw new AccountLifecycleError(
      'STORE_UNAVAILABLE',
      'Stage D lifecycle routes require the dedicated migrations/d1 schema; USER_DB-bound Workers are not eligible.',
      503,
    );
  }
  if (!env.DB) {
    throw new AccountLifecycleError('STORE_UNAVAILABLE', 'Stage D D1 binding is missing.', 503);
  }
  return env.DB as unknown as D1DatabaseBinding;
}

function createRuntime(env: WorkerEnv): {
  db: D1DatabaseBinding;
  store: D1AccountLifecycleStore;
  dispatch: D1AccountLifecycleDispatch;
  orchestrator: AccountDeletionOrchestrator;
} {
  const db = requireStageDDatabase(env);

  const store = new D1AccountLifecycleStore(db);
  const orchestrator = new AccountDeletionOrchestrator({
    store,
    domainAdapters: createWorkerDomainAdapters(db),
    mediaAdapter: createWorkerMediaDeletionAdapter({
      db,
      mediaBucket: env.MEDIA_BUCKET,
      bucketName: String(env.R2_MEDIA_BUCKET_NAME || '__UNCONFIGURED_MEDIA_BUCKET__').trim(),
    }),
    authAdapter: createWorkerFailClosedAuthAdapter(),
    batchReceiptRecorder: new D1AccountDeletionBatchReceiptRecorder(store),
    telemetryErasureAdapter: createWorkerTelemetryAdapter(db),
  });

  return { db, store, dispatch: new D1AccountLifecycleDispatch(db), orchestrator };
}

export function createWorkerLifecycleOrchestrator(env: WorkerEnv): AccountDeletionOrchestrator {
  return createRuntime(env).orchestrator;
}

export function mapLifecycleErrorToHttp(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof AccountLifecycleError) {
    return { status: error.httpStatus, code: error.code, message: error.message };
  }
  const rec = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const candidateStatus = typeof rec.httpStatus === 'number' ? rec.httpStatus : 503;
  const status = Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
    ? candidateStatus
    : 503;
  const code = typeof rec.code === 'string' && /^[A-Z0-9_:-]{2,80}$/.test(rec.code)
    ? rec.code
    : 'LIFECYCLE_OPERATION_FAILED';
  return {
    status,
    code,
    message: 'The account lifecycle operation could not be completed safely.',
  };
}

async function enqueueLifecycleStep(params: {
  dispatch: D1AccountLifecycleDispatch;
  jobId: string;
  targetUid: string;
  revision: number;
  totalAttempts: number;
  correlationId: string;
  nextAttemptAtIso?: string | null;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const idempotencyKey = buildLifecycleQueueIdempotencyKey(
    params.jobId,
    `revision_${params.revision}_attempt_${params.totalAttempts}`,
  );
  await params.dispatch.enqueueDispatchEvent({
    eventId: `acl_evt_${crypto.randomUUID()}`,
    jobId: params.jobId,
    targetUid: params.targetUid,
    operationType: 'DELETION_STEP',
    idempotencyKey,
    correlationId: params.correlationId.slice(0, 128),
    createdAtIso: nowIso,
    nextAttemptAtIso: params.nextAttemptAtIso ?? null,
  });
}

export async function initiateWorkerAccountDeletion(params: {
  env: WorkerEnv;
  actor: AccountLifecycleActorContext;
  correlationId: string;
}): Promise<{
  jobId: string;
  state: AccountDeletionJobState;
  createdNew: boolean;
  queued: boolean;
}> {
  if (!params.env.RADAR_QUEUE) {
    throw new AccountLifecycleError('STORE_UNAVAILABLE', 'RADAR_QUEUE binding is unavailable.', 503);
  }
  const runtime = createRuntime(params.env);
  assertStoreHealthy(await runtime.store.probeHealth());

  const created = await runtime.orchestrator.initiateAccountDeletionJob(params.actor, {
    targetUid: params.actor.uid,
    targetEmail: params.actor.email,
    reason: 'USER_REQUESTED_ERASURE',
  });

  await enqueueLifecycleStep({
    dispatch: runtime.dispatch,
    jobId: created.job.jobId,
    targetUid: created.job.targetUid,
    revision: created.job.revision,
    totalAttempts: created.job.totalAttempts,
    correlationId: params.correlationId,
  });

  const dispatched = await recoverPendingLifecycleDispatch(params.env, 1);
  return {
    jobId: created.job.jobId,
    state: created.job.state,
    createdNew: created.createdNew,
    queued: dispatched > 0,
  };
}

/** Re-publishes durable outbox rows. Queue delivery is at-least-once; D1 queue idempotency is the duplicate barrier. */
export async function recoverPendingLifecycleDispatch(env: WorkerEnv, limit = 25): Promise<number> {
  if (!env.RADAR_QUEUE) {
    throw new AccountLifecycleError('STORE_UNAVAILABLE', 'RADAR_QUEUE binding is unavailable.', 503);
  }
  const db = requireStageDDatabase(env);
  const dispatch = new D1AccountLifecycleDispatch(db);
  const now = new Date();
  const rows = await dispatch.listPendingDispatch(
    Math.max(1, Math.min(50, Math.trunc(limit || 25))),
    now.toISOString(),
  );
  let dispatched = 0;

  for (const row of rows) {
    const payload = validateLifecycleQueuePayload({
      jobId: row.jobId,
      targetUid: row.targetUid,
      operation: row.operationType,
    });
    if (!payload.ok) {
      await dispatch.markDispatchFailed(
        row.idempotencyKey,
        new Date().toISOString(),
        new Date(Date.now() + DISPATCH_FAILURE_RETRY_MS).toISOString(),
        'INVALID_LIFECYCLE_QUEUE_PAYLOAD',
      );
      continue;
    }

    const envelope: RadarQueueEnvelope = {
      schemaVersion: '1.0',
      messageId: `acl_msg_${row.eventId}`.slice(0, 128),
      idempotencyKey: row.idempotencyKey,
      jobType: ACCOUNT_LIFECYCLE_QUEUE_JOB_TYPE,
      createdAtIso: now.toISOString(),
      correlationId: `acl_corr_${row.eventId}`.slice(0, 128),
      payload: {
        jobId: payload.payload.jobId,
        targetUid: payload.payload.targetUid,
        operation: payload.payload.operation,
      },
    };
    const validated = validateQueueEnvelope(envelope);
    if (!validated.valid) {
      await dispatch.markDispatchFailed(
        row.idempotencyKey,
        new Date().toISOString(),
        new Date(Date.now() + DISPATCH_FAILURE_RETRY_MS).toISOString(),
        'INVALID_LIFECYCLE_QUEUE_ENVELOPE',
      );
      continue;
    }

    try {
      await env.RADAR_QUEUE.send(validated.envelope);
      if (await dispatch.markDispatchSent(row.idempotencyKey, new Date().toISOString())) {
        dispatched += 1;
      }
    } catch {
      await dispatch.markDispatchFailed(
        row.idempotencyKey,
        new Date().toISOString(),
        new Date(Date.now() + DISPATCH_FAILURE_RETRY_MS).toISOString(),
        'QUEUE_DISPATCH_FAILED',
      ).catch(() => undefined);
    }
  }
  return dispatched;
}

export async function executeBoundedDeletionStep(params: {
  env: WorkerEnv;
  jobId: string;
  targetUid?: string;
  leaseOwner: string;
  maxBatchesPerInvocation?: number;
}): Promise<{
  terminal: boolean;
  state: AccountDeletionJobState;
  leaseAcquired: boolean;
  revision: number;
}> {
  if (!params.env.RADAR_QUEUE) {
    throw new AccountLifecycleError('STORE_UNAVAILABLE', 'RADAR_QUEUE binding is unavailable.', 503);
  }
  const runtime = createRuntime(params.env);
  assertStoreHealthy(await runtime.store.probeHealth());

  const job = await runtime.store.getJobById(params.jobId);
  if (!job) {
    throw new AccountLifecycleError('JOB_NOT_FOUND', `Deletion job "${params.jobId}" does not exist.`, 404);
  }
  if (params.targetUid && params.targetUid !== job.targetUid) {
    throw new AccountLifecycleError(
      'CROSS_USER_ACCESS_FORBIDDEN',
      'Lifecycle queue target does not match the persisted job owner.',
      403,
    );
  }
  if (isTerminalAccountDeletionState(job.state)) {
    return { terminal: true, state: job.state, leaseAcquired: true, revision: job.revision };
  }

  const nowMs = Date.now();
  const leaseToken = crypto.randomUUID();
  const lease = await runtime.dispatch.acquireJobLease({
    jobId: job.jobId,
    targetUid: job.targetUid,
    leaseToken,
    leaseOwner: params.leaseOwner.slice(0, 128),
    nowMs,
  });
  if (!lease.acquired) {
    return { terminal: false, state: job.state, leaseAcquired: false, revision: job.revision };
  }

  try {
    if (!(await runtime.dispatch.verifyJobLease(job.jobId, leaseToken, lease.fencingRevision, Date.now()))) {
      throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', 'Lifecycle execution lease could not be verified.', 503);
    }

    const systemActor: AccountLifecycleActorContext = {
      uid: job.targetUid,
      email: job.targetEmail,
      isAdmin: false,
      freshAuthVerified: true,
      primaryBootstrapAdminEmail: String(params.env.ADMIN_EMAIL || '').trim().toLowerCase() || undefined,
    };
    const updated = await runtime.orchestrator.executeDeletionJob(systemActor, job.jobId, {
      batchSize: DEFAULT_EXECUTION_BATCH_SIZE,
      maxBatchesPerInvocation: Math.max(
        1,
        Math.min(10, Math.trunc(params.maxBatchesPerInvocation ?? DEFAULT_MAX_BATCHES_PER_INVOCATION)),
      ),
    });

    if (!(await runtime.dispatch.verifyJobLease(job.jobId, leaseToken, lease.fencingRevision, Date.now()))) {
      throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', 'Lifecycle execution lease was lost before progress could be acknowledged.', 503);
    }

    const terminal = isTerminalAccountDeletionState(updated.state);
    if (!terminal) {
      const retryable = updated.state === 'PARTIAL_FAILURE_RETRYABLE';
      const nextAttemptAtIso = retryable
        ? new Date(Date.now() + RETRYABLE_LIFECYCLE_DELAY_MS).toISOString()
        : null;
      await enqueueLifecycleStep({
        dispatch: runtime.dispatch,
        jobId: updated.jobId,
        targetUid: updated.targetUid,
        revision: updated.revision,
        totalAttempts: updated.totalAttempts,
        correlationId: params.leaseOwner,
        nextAttemptAtIso,
      });
      if (!nextAttemptAtIso) {
        await recoverPendingLifecycleDispatch(params.env, 1);
      }
    }

    return { terminal, state: updated.state, leaseAcquired: true, revision: updated.revision };
  } finally {
    await runtime.dispatch.releaseJobLease(job.jobId, leaseToken, lease.fencingRevision, Date.now()).catch(() => undefined);
  }
}
