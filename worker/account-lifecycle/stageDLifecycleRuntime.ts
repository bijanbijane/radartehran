/**
 * Stage D Worker runtime bridge.
 *
 * This module is bound only to the dedicated migrations/d1 schema. USER_DB has a
 * different account_deletion_jobs shape and must never be treated as Stage D D1.
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
import { countActiveD1MutationPermits } from './d1WriteAdmissionPermit.ts';
import type { D1DatabaseBinding } from '../db/types.ts';
import type { WorkerEnv } from '../types.ts';

export const FRESH_AUTH_MAX_AGE_SECONDS = 600;
export const DEFAULT_EXECUTION_BATCH_SIZE = 10;
export const DEFAULT_MAX_BATCHES_PER_INVOCATION = 5;
export const RETRYABLE_LIFECYCLE_DELAY_MS = 15 * 60 * 1000;
export const DISPATCH_FAILURE_RETRY_MS = 60 * 1000;
const RECOVERY_SLOT_MS = 60 * 60 * 1000;
const MAX_RECOVERY_JOBS = 50;

const REQUIRED_STAGE_D_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  account_deletion_jobs: [
    'job_id', 'target_uid', 'requested_by_uid', 'state', 'reason',
    'write_block_enforced', 'job_json', 'revision', 'created_at_iso',
    'updated_at_iso', 'completed_at_iso',
  ],
  account_write_blocks: [
    'target_uid', 'state', 'active_deletion_job_id', 'blocked_at_iso',
    'updated_at_iso', 'reason', 'revision',
  ],
  account_export_jobs: [
    'export_job_id', 'target_uid', 'requested_by_uid', 'state', 'job_json',
    'revision', 'download_expires_at_iso', 'created_at_iso', 'updated_at_iso',
    'completed_at_iso',
  ],
  account_privacy_consents: [
    'consent_id', 'target_uid', 'scope', 'granted', 'policy_version',
    'recorded_at_iso', 'revoked_at_iso', 'revision',
  ],
  account_lifecycle_dispatch_outbox: [
    'event_id', 'job_id', 'target_uid', 'operation_type', 'idempotency_key',
    'dispatch_status', 'attempt_count', 'next_attempt_at_iso',
    'last_error_redacted', 'correlation_id', 'created_at_iso',
    'updated_at_iso', 'dispatched_at_iso',
  ],
  account_deletion_job_leases: [
    'job_id', 'target_uid', 'lease_token', 'fencing_revision',
    'lease_owner', 'lease_expires_at_ms', 'acquired_at_iso', 'updated_at_iso',
  ],
  account_mutation_permits: [
    'permit_id', 'target_uid', 'holder_id', 'route_signature',
    'acquired_at_iso', 'expires_at_ms', 'released_at_iso', 'status',
  ],
  lifecycle_internal_rpc_nonces: ['nonce', 'consumed_at_iso', 'expires_at_ms'],
  account_lifecycle_audit: ['audit_id', 'job_id', 'target_uid', 'actor_uid', 'action', 'detail_redacted', 'recorded_at_iso'],
  account_data_requests: ['request_id', 'target_uid', 'kind', 'linked_job_id', 'status', 'requested_at_iso', 'completed_at_iso', 'revision'],
  account_deletion_batch_receipts: ['receipt_id', 'job_id', 'target_uid', 'domain_source', 'idempotency_key', 'batch_cursor', 'outcome_json', 'recorded_at_iso', 'status', 'completed_at_iso'],
  account_deletion_execution_receipts: ['receipt_id', 'job_id', 'target_uid', 'status', 'receipt_json', 'recorded_at_iso'],
  account_deletion_retention_records: ['record_id', 'job_id', 'target_uid', 'policy_code', 'retention_reason', 'retained_payload_json', 'expires_at_iso', 'recorded_at_iso'],
  media_objects: ['object_id', 'owner_uid', 'bucket_name', 'storage_key', 'lifecycle_state', 'deletion_state', 'created_at_iso', 'updated_at_iso', 'deleted_at_iso'],
  upload_sessions: ['session_id', 'owner_uid', 'created_at_ms'],
  upload_session_chunks: ['session_id', 'chunk_index', 'chunk_base64', 'byte_length'],
};

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

function requireStageDDatabase(env: WorkerEnv): D1DatabaseBinding {
  if (env.USER_DB) {
    throw new AccountLifecycleError(
      'STORE_UNAVAILABLE',
      'Stage D lifecycle requires the dedicated migrations/d1 schema; USER_DB is a different schema.',
      503,
    );
  }
  if (!env.DB) {
    throw new AccountLifecycleError('STORE_UNAVAILABLE', 'Stage D D1 binding is missing.', 503);
  }
  return env.DB as unknown as D1DatabaseBinding;
}

async function assertStageDSchema(db: D1DatabaseBinding): Promise<void> {
  for (const [table, requiredColumns] of Object.entries(REQUIRED_STAGE_D_COLUMNS)) {
    let result;
    try {
      result = await db.prepare('PRAGMA table_info(' + table + ')').all<{ name: string }>();
    } catch {
      throw new AccountLifecycleError(
        'STORE_UNAVAILABLE',
        'Stage D schema verification failed for table ' + table + '.',
        503,
      );
    }
    if (!result.success) {
      throw new AccountLifecycleError(
        'STORE_UNAVAILABLE',
        'Stage D schema verification failed for table ' + table + '.',
        503,
      );
    }
    const actual = new Set((result.results || []).map((column) => String(column.name)));
    const missing = requiredColumns.filter((column) => !actual.has(column));
    if (missing.length > 0) {
      throw new AccountLifecycleError(
        'STORE_UNAVAILABLE',
        'Stage D schema is incompatible for table ' + table + '; missing required columns: ' + missing.join(', ') + '.',
        503,
      );
    }
  }
}

export async function requireWorkerLifecycleBindings(env: WorkerEnv): Promise<void> {
  const db = requireStageDDatabase(env);
  await assertStageDSchema(db);
  const store = new D1AccountLifecycleStore(db);
  assertStoreHealthy(await store.probeHealth());
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
    return {
      status: error.httpStatus,
      code: error.code,
      message: error.httpStatus >= 500
        ? 'The account lifecycle operation could not be completed safely.'
        : error.message,
    };
  }
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const candidateStatus = typeof record.httpStatus === 'number' ? record.httpStatus : 503;
  const status = Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
    ? candidateStatus
    : 503;
  const code = typeof record.code === 'string' && /^[A-Z0-9_:-]{2,80}$/.test(record.code)
    ? record.code
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
  suffix: string;
  nextAttemptAtIso?: string | null;
}): Promise<string> {
  const nowIso = new Date().toISOString();
  const idempotencyKey = buildLifecycleQueueIdempotencyKey(
    params.jobId,
    params.suffix + '_r' + params.revision + '_a' + params.totalAttempts,
  );
  await params.dispatch.enqueueDispatchEvent({
    eventId: 'acl_evt_' + crypto.randomUUID(),
    jobId: params.jobId,
    targetUid: params.targetUid,
    operationType: 'DELETION_STEP',
    idempotencyKey,
    correlationId: params.correlationId.slice(0, 128),
    createdAtIso: nowIso,
    nextAttemptAtIso: params.nextAttemptAtIso ?? null,
  });
  return idempotencyKey;
}

function buildLifecycleEnvelope(row: {
  eventId: string;
  jobId: string;
  targetUid: string;
  operationType: string;
  idempotencyKey: string;
  correlationId: string;
}): RadarQueueEnvelope {
  const payload = validateLifecycleQueuePayload({
    jobId: row.jobId,
    targetUid: row.targetUid,
    operation: row.operationType,
  });
  if (!payload.ok) {
    throw new AccountLifecycleError(
      'INVALID_PAGINATION_OPTIONS',
      'Invalid persisted lifecycle queue payload: ' + payload.reason,
      400,
    );
  }
  const candidate: RadarQueueEnvelope = {
    schemaVersion: '1.0',
    messageId: ('acl_msg_' + row.eventId).slice(0, 128),
    idempotencyKey: row.idempotencyKey,
    jobType: ACCOUNT_LIFECYCLE_QUEUE_JOB_TYPE,
    createdAtIso: new Date().toISOString(),
    correlationId: (row.correlationId || 'acl_corr_' + row.eventId).slice(0, 128),
    payload: payload.payload,
  };
  const validated = validateQueueEnvelope(candidate);
  if (!validated.valid) {
    throw new AccountLifecycleError(
      'INVALID_PAGINATION_OPTIONS',
      'Invalid lifecycle queue envelope: ' + validated.reason,
      400,
    );
  }
  return validated.envelope;
}

async function publishPendingOutbox(params: {
  env: WorkerEnv;
  dispatch: D1AccountLifecycleDispatch;
  limit: number;
  onlyIdempotencyKey?: string;
}): Promise<number> {
  const queue = params.env.RADAR_QUEUE;
  if (!queue) {
    throw new AccountLifecycleError('STORE_UNAVAILABLE', 'RADAR_QUEUE binding is unavailable.', 503);
  }
  const rows = await params.dispatch.listPendingDispatch(
    Math.max(1, Math.min(100, Math.trunc(params.limit || 25))),
    new Date().toISOString(),
  );
  const candidates = params.onlyIdempotencyKey
    ? rows.filter((row) => row.idempotencyKey === params.onlyIdempotencyKey)
    : rows;
  let dispatched = 0;

  for (const row of candidates) {
    let envelope: RadarQueueEnvelope;
    try {
      envelope = buildLifecycleEnvelope(row);
    } catch {
      await params.dispatch.markDispatchFailed(
        row.idempotencyKey,
        new Date().toISOString(),
        new Date(Date.now() + DISPATCH_FAILURE_RETRY_MS).toISOString(),
        'INVALID_LIFECYCLE_QUEUE_ENVELOPE',
      );
      continue;
    }
    try {
      await queue.send(envelope);
      await params.dispatch.markDispatchSent(row.idempotencyKey, new Date().toISOString());
      dispatched += 1;
    } catch {
      await params.dispatch.markDispatchFailed(
        row.idempotencyKey,
        new Date().toISOString(),
        new Date(Date.now() + DISPATCH_FAILURE_RETRY_MS).toISOString(),
        'QUEUE_DISPATCH_FAILED',
      );
    }
  }
  return dispatched;
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
  const db = requireStageDDatabase(params.env);
  await assertStageDSchema(db);
  const runtime = createRuntime(params.env);
  assertStoreHealthy(await runtime.store.probeHealth());

  const created = await runtime.orchestrator.initiateAccountDeletionJob(params.actor, {
    targetUid: params.actor.uid,
    targetEmail: params.actor.email,
    reason: 'USER_REQUESTED_ERASURE',
  });

  const idempotencyKey = await enqueueLifecycleStep({
    dispatch: runtime.dispatch,
    jobId: created.job.jobId,
    targetUid: created.job.targetUid,
    revision: created.job.revision,
    totalAttempts: created.job.totalAttempts,
    correlationId: params.correlationId,
    suffix: 'initial',
  });

  const queued = await publishPendingOutbox({
    env: params.env,
    dispatch: runtime.dispatch,
    limit: 100,
    onlyIdempotencyKey: idempotencyKey,
  });

  return {
    jobId: created.job.jobId,
    state: created.job.state,
    createdNew: created.createdNew,
    queued: queued > 0,
  };
}

/**
 * Re-publishes pending outbox rows and re-enqueues non-terminal jobs that have
 * no live lease. The time-slot key ensures a failed/dead-lettered dispatch can
 * be recreated on a later scheduled recovery pass.
 */
export async function recoverPendingLifecycleDispatch(env: WorkerEnv, limit = 25): Promise<number> {
  if (!env.RADAR_QUEUE) {
    throw new AccountLifecycleError('STORE_UNAVAILABLE', 'RADAR_QUEUE binding is unavailable.', 503);
  }
  const db = requireStageDDatabase(env);
  await assertStageDSchema(db);
  const runtime = createRuntime(env);
  assertStoreHealthy(await runtime.store.probeHealth());

  const nowMs = Date.now();
  const recoverySlot = Math.floor(nowMs / RECOVERY_SLOT_MS);
  const recoveryLimit = Math.max(1, Math.min(MAX_RECOVERY_JOBS, Math.trunc(limit || 25)));
  const jobs = await runtime.store.listContinuableDeletionJobs(recoveryLimit, 0);

  for (const job of jobs) {
    if (isTerminalAccountDeletionState(job.state)) continue;
    if (job.state === 'PARTIAL_FAILURE_RETRYABLE') {
      const retryAt = Date.parse(job.updatedAtIso) + RETRYABLE_LIFECYCLE_DELAY_MS;
      if (Number.isFinite(retryAt) && retryAt > nowMs) continue;
    }
    const lease = await runtime.dispatch.getJobLease(job.jobId);
    if (lease && lease.leaseExpiresAtMs > nowMs) continue;

    await enqueueLifecycleStep({
      dispatch: runtime.dispatch,
      jobId: job.jobId,
      targetUid: job.targetUid,
      revision: job.revision,
      totalAttempts: job.totalAttempts,
      correlationId: 'acl_recovery_' + recoverySlot,
      suffix: 'recovery_' + recoverySlot,
    });
  }

  return publishPendingOutbox({
    env,
    dispatch: runtime.dispatch,
    limit: Math.max(recoveryLimit, Math.min(100, recoveryLimit * 2)),
  });
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
  const db = requireStageDDatabase(params.env);
  await assertStageDSchema(db);
  const runtime = createRuntime(params.env);
  assertStoreHealthy(await runtime.store.probeHealth());

  const job = await runtime.store.getJobById(params.jobId);
  if (!job) {
    throw new AccountLifecycleError('JOB_NOT_FOUND', 'Deletion job ' + params.jobId + ' does not exist.', 404);
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

    const writeBlock = await runtime.store.getWriteBlock(job.targetUid);
    if (!writeBlock ||
        writeBlock.state !== 'WRITE_BLOCKED_DELETION_IN_PROGRESS' ||
        writeBlock.activeDeletionJobId !== job.jobId) {
      throw new AccountLifecycleError(
        'WRITE_BLOCK_UNVERIFIED',
        'The durable deletion write block does not match the active lifecycle job.',
        503,
      );
    }

    const activePermits = await countActiveD1MutationPermits({
      db,
      targetUid: job.targetUid,
      nowMs: Date.now(),
    });
    if (activePermits > 0) {
      throw new AccountLifecycleError(
        'MUTATION_DRAIN_INCOMPLETE',
        'Deletion is waiting for ' + activePermits + ' in-flight mutation permit(s) to drain.',
        409,
      );
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
      const idempotencyKey = await enqueueLifecycleStep({
        dispatch: runtime.dispatch,
        jobId: updated.jobId,
        targetUid: updated.targetUid,
        revision: updated.revision,
        totalAttempts: updated.totalAttempts,
        correlationId: params.leaseOwner,
        suffix: retryable ? 'retry' : 'continue',
        nextAttemptAtIso,
      });
      if (!retryable) {
        await publishPendingOutbox({
          env: params.env,
          dispatch: runtime.dispatch,
          limit: 100,
          onlyIdempotencyKey: idempotencyKey,
        });
      }
    }

    return { terminal, state: updated.state, leaseAcquired: true, revision: updated.revision };
  } finally {
    await runtime.dispatch.releaseJobLease(job.jobId, leaseToken, lease.fencingRevision, Date.now()).catch(() => undefined);
  }
}
