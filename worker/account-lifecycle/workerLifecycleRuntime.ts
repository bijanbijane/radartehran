/**
 * Worker composition root for account lifecycle (Stage D).
 */

import { AccountDeletionOrchestrator } from '../../server/modules/account-lifecycle/deletionOrchestrator.ts';
import { AccountLifecycleError } from '../../server/modules/account-lifecycle/types.ts';
import { assertAuthorizedForTargetAccount } from '../../server/modules/account-lifecycle/exportService.ts';
import type { AccountLifecycleActorContext } from '../../server/modules/account-lifecycle/types.ts';
import { isTerminalAccountDeletionState } from '../../server/modules/account-lifecycle/stateMachine.ts';
import { D1AccountDeletionBatchReceiptRecorder } from './d1BatchReceiptRecorder.ts';
import { createD1AccountLifecycleStore } from '../../server/modules/account-lifecycle/storeFactory.ts';
import { D1AccountLifecycleDispatch } from './d1LifecycleDispatch.ts';
import {
  ACCOUNT_LIFECYCLE_QUEUE_JOB_TYPE,
  buildLifecycleQueueIdempotencyKey,
  type AccountLifecycleQueuePayload,
} from './lifecycleQueueContract.ts';
import type { WorkerEnv } from '../types.ts';
import type { RadarQueueEnvelope } from '../queues/queueAndCronProcessor.ts';
import {
  createWorkerDomainAdapters,
  createWorkerFailClosedAuthAdapter,
  createWorkerTelemetryAdapter,
} from './workerLifecycleAdapters.ts';
import { assertD1MutationDrainComplete } from './d1MutationPermit.ts';
import { createWorkerMediaDeletionAdapter, createSystemMediaActor } from './workerMediaAdapter.ts';
import type { D1DatabaseBinding } from '../db/types.ts';

export const FRESH_AUTH_MAX_AGE_SECONDS = 600;

export class WorkerLifecycleRuntimeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 503,
  ) {
    super(message);
    this.name = 'WorkerLifecycleRuntimeError';
  }
}

export function requireWorkerLifecycleBindings(env: WorkerEnv): { db: NonNullable<WorkerEnv['DB']> } {
  if (!env.DB) {
    throw new WorkerLifecycleRuntimeError('D1_BINDING_UNAVAILABLE', 'Account lifecycle requires D1 binding DB.', 503);
  }
  return { db: env.DB };
}

export function buildLifecycleActorFromPrincipal(params: {
  uid: string;
  email?: string;
  isAdmin: boolean;
  authTimeSeconds?: number;
}): AccountLifecycleActorContext {
  const nowSec = Math.floor(Date.now() / 1000);
  const fresh =
    typeof params.authTimeSeconds === 'number' && nowSec - params.authTimeSeconds <= FRESH_AUTH_MAX_AGE_SECONDS;
  return {
    uid: params.uid,
    email: params.email,
    isAdmin: params.isAdmin,
    freshAuthVerified: fresh,
  };
}

export function createWorkerLifecycleOrchestrator(env: WorkerEnv): AccountDeletionOrchestrator {
  const { db } = requireWorkerLifecycleBindings(env);
  const d1 = db as unknown as D1DatabaseBinding;
  const store = createD1AccountLifecycleStore(d1);
  const recorder = new D1AccountDeletionBatchReceiptRecorder(store);
  const bucketName = env.R2_MEDIA_BUCKET_NAME ?? 'radartehran-dev-media';
  return new AccountDeletionOrchestrator({
    store,
    domainAdapters: createWorkerDomainAdapters(d1),
    mediaAdapter: createWorkerMediaDeletionAdapter({ db: d1, mediaBucket: env.MEDIA_BUCKET, bucketName }),
    authAdapter: createWorkerFailClosedAuthAdapter(),
    batchReceiptRecorder: recorder,
    telemetryErasureAdapter: createWorkerTelemetryAdapter(d1),
  });
}

export async function initiateWorkerAccountDeletion(params: {
  env: WorkerEnv;
  actor: AccountLifecycleActorContext;
  correlationId: string;
}): Promise<{ jobId: string; state: string; createdNew: boolean; queued: boolean }> {
  const orchestrator = createWorkerLifecycleOrchestrator(params.env);
  assertAuthorizedForTargetAccount(params.actor, params.actor.uid, 'DELETE');
  const { job, createdNew } = await orchestrator.initiateAccountDeletionJob(params.actor, {
    targetUid: params.actor.uid,
    targetEmail: params.actor.email,
    reason: 'USER_REQUESTED_ERASURE_WORKER',
  });

  const { db } = requireWorkerLifecycleBindings(params.env);
  const dispatch = new D1AccountLifecycleDispatch(db);
  const nowIso = new Date().toISOString();
  const idem = buildLifecycleQueueIdempotencyKey(job.jobId, 'init');
  await dispatch.enqueueDispatchEvent({
    eventId: `acl_evt_${job.jobId}_init`,
    jobId: job.jobId,
    targetUid: job.targetUid,
    operationType: 'DELETION_STEP',
    idempotencyKey: idem,
    correlationId: params.correlationId,
    createdAtIso: nowIso,
  });

  let queued = false;
  if (params.env.RADAR_QUEUE) {
    try {
      const envelope: RadarQueueEnvelope<AccountLifecycleQueuePayload> = {
        schemaVersion: '1.0',
        messageId: `msg_${idem}`,
        idempotencyKey: idem,
        jobType: ACCOUNT_LIFECYCLE_QUEUE_JOB_TYPE as RadarQueueEnvelope['jobType'],
        createdAtIso: nowIso,
        correlationId: params.correlationId,
        payload: { jobId: job.jobId, targetUid: job.targetUid, operation: 'DELETION_STEP' },
      };
      await params.env.RADAR_QUEUE.send(envelope);
      queued = await dispatch.markDispatchSent(idem, nowIso);
    } catch (err) {
      const retryAt = new Date(Date.now() + 60_000).toISOString();
      await dispatch.markDispatchFailed(idem, nowIso, retryAt, String(err).slice(0, 200));
    }
  }

  return { jobId: job.jobId, state: job.state, createdNew, queued };
}

export async function executeBoundedDeletionStep(params: {
  env: WorkerEnv;
  jobId: string;
  targetUid: string;
  leaseOwner: string;
  maxBatchesPerInvocation?: number;
}): Promise<{ terminal: boolean; state: string }> {
  const { db } = requireWorkerLifecycleBindings(params.env);
  const dispatch = new D1AccountLifecycleDispatch(db);
  const nowMs = Date.now();
  const leaseToken = `lease_${params.jobId}_${params.leaseOwner}`;
  const { acquired, fencingRevision } = await dispatch.acquireJobLease({
    jobId: params.jobId,
    targetUid: params.targetUid,
    leaseToken,
    leaseOwner: params.leaseOwner,
    nowMs,
  });
  if (!acquired) {
    throw new WorkerLifecycleRuntimeError('JOB_LEASE_HELD', 'Deletion job lease held by another worker.', 409);
  }

  await assertD1MutationDrainComplete(db, params.targetUid);

  const orchestrator = createWorkerLifecycleOrchestrator(params.env);
  const actor = createSystemMediaActor(params.targetUid);
  try {
    const job = await orchestrator.resumeDeletionJob(actor, params.jobId, {
      batchSize: 10,
      maxBatchesPerInvocation: params.maxBatchesPerInvocation ?? 3,
    });
    if (!isTerminalAccountDeletionState(job.state)) {
      await scheduleContinuation(params.env, job.jobId, job.targetUid, params.leaseOwner);
    }
    return { terminal: isTerminalAccountDeletionState(job.state), state: job.state };
  } finally {
    await dispatch.releaseJobLease(params.jobId, leaseToken, fencingRevision, nowMs);
  }
}

async function scheduleContinuation(env: WorkerEnv, jobId: string, targetUid: string, correlationSeed: string): Promise<void> {
  const { db } = requireWorkerLifecycleBindings(env);
  const dispatch = new D1AccountLifecycleDispatch(db);
  const nowIso = new Date().toISOString();
  const idem = buildLifecycleQueueIdempotencyKey(jobId, `cont_${Date.now()}`);
  await dispatch.enqueueDispatchEvent({
    eventId: `acl_evt_${idem}`,
    jobId,
    targetUid,
    operationType: 'DELETION_STEP',
    idempotencyKey: idem,
    correlationId: correlationSeed,
    createdAtIso: nowIso,
  });
  if (!env.RADAR_QUEUE) return;
  try {
    await env.RADAR_QUEUE.send({
      schemaVersion: '1.0',
      messageId: `msg_${idem}`,
      idempotencyKey: idem,
      jobType: ACCOUNT_LIFECYCLE_QUEUE_JOB_TYPE,
      createdAtIso: nowIso,
      correlationId: correlationSeed,
      payload: { jobId, targetUid, operation: 'DELETION_STEP' },
    });
    await dispatch.markDispatchSent(idem, nowIso);
  } catch (err) {
    await dispatch.markDispatchFailed(idem, nowIso, new Date(Date.now() + 120_000).toISOString(), String(err).slice(0, 200));
  }
}

export async function recoverPendingLifecycleDispatch(env: WorkerEnv, limit = 20): Promise<number> {
  const { db } = requireWorkerLifecycleBindings(env);
  if (!env.RADAR_QUEUE) return 0;
  const dispatch = new D1AccountLifecycleDispatch(db);
  const nowIso = new Date().toISOString();
  const pending = await dispatch.listPendingDispatch(limit, nowIso);
  let sent = 0;
  for (const row of pending) {
    const envelope: RadarQueueEnvelope<AccountLifecycleQueuePayload> = {
      schemaVersion: '1.0',
      messageId: `msg_${row.idempotencyKey}`,
      idempotencyKey: row.idempotencyKey,
      jobType: ACCOUNT_LIFECYCLE_QUEUE_JOB_TYPE as RadarQueueEnvelope['jobType'],
      createdAtIso: nowIso,
      correlationId: row.idempotencyKey,
      payload: { jobId: row.jobId, targetUid: row.targetUid, operation: 'DELETION_STEP' },
    };
    try {
      await env.RADAR_QUEUE.send(envelope);
      if (await dispatch.markDispatchSent(row.idempotencyKey, nowIso)) sent += 1;
    } catch (err) {
      await dispatch.markDispatchFailed(
        row.idempotencyKey,
        nowIso,
        new Date(Date.now() + 300_000).toISOString(),
        String(err).slice(0, 200),
      );
    }
  }
  const d1 = db as unknown as D1DatabaseBinding;
  const store = createD1AccountLifecycleStore(d1);
  const jobs = await store.listContinuableDeletionJobs(limit, 0);
  for (const job of jobs) {
    await scheduleContinuation(env, job.jobId, job.targetUid, `cron_recover_${job.jobId}`);
  }
  return sent;
}

export function mapLifecycleErrorToHttp(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof AccountLifecycleError) {
    return { status: err.httpStatus, code: err.code, message: err.message };
  }
  if (err instanceof WorkerLifecycleRuntimeError) {
    return { status: err.httpStatus, code: err.code, message: err.message };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Account lifecycle operation failed.' };
}