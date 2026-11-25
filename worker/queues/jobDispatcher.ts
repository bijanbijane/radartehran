/**
 * @file worker/queues/jobDispatcher.ts
 * @description Real canonical Cloudflare Queue job dispatcher and Cron envelope builder.
 * Every registered job executes durable, verifiable work against D1/R2/KV bindings.
 * Zero no-op handlers, zero silent ACKs on missing dependencies.
 */
import { processPendingResearchErasureOutbox } from '../account-lifecycle/workerLifecycleRuntime';
import { resolveResearchDb, resolveUserDb } from '../db/bindingResolver';
import { validateAndMinimizeResearchEvent, type ValidatedResearchEvent } from '../research/researchEventContract';
import {
  acquireQueuedResearchProcessingPermitInD1,
  purgeExpiredResearchData,
  releaseResearchProcessingPermitInD1,
  writePseudonymizedEventsToResearchDb,
} from '../research/researchService';
import { isObjectUnderLegalHold } from '../storage/r2StorageAdapter';
import type { WorkerEnv } from '../types';
import {
  convertUtcScheduledTimeToTehranWallClock,
  validateQueueEnvelope,
  type RadarQueueEnvelope,
  type RadarQueueJobType,
} from './queueAndCronProcessor';

export const EXECUTABLE_CANONICAL_JOB_TYPES: readonly RadarQueueJobType[] = [
  'r2_orphan_media_reconcile',
  'expired_chunk_upload_session_cleanup',
  'telemetry_archive_flush',
  'research_event_ingest',
  'research_subject_erasure',
  'research_retention_purge',
] as const;

/** Legacy envelopes stay recognizable for deterministic DLQ routing, but are never executed. */
export const DISABLED_CANONICAL_JOB_TYPES: readonly RadarQueueJobType[] = [
  'firestore_d1_projection_sync',
] as const;

export const UPLOAD_SESSION_TTL_MS = 15 * 60 * 1000;

export class QueueJobExecutionError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = 'QueueJobExecutionError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface QueueJobExecutionResult {
  readonly jobType: RadarQueueJobType;
  readonly idempotencyKey: string;
  readonly executedAtIso: string;
  readonly affectedCount: number;
  readonly summary: Record<string, unknown>;
}

async function handleFirestoreD1ProjectionSync(
  envelope: RadarQueueEnvelope,
  _env: WorkerEnv,
): Promise<QueueJobExecutionResult> {
  throw new QueueJobExecutionError(
    'FIRESTORE_SOURCE_ADAPTER_UNAVAILABLE',
    `firestore_d1_projection_sync (${envelope.idempotencyKey}) is disabled: no authenticated Firestore source adapter is configured. Refusing to write static seed values with Firestore provenance.`,
    false,
  );
}

async function handleExpiredChunkUploadSessionCleanup(
  envelope: RadarQueueEnvelope,
  env: WorkerEnv,
): Promise<QueueJobExecutionResult> {
  const userDb = resolveUserDb(env);
  if (!userDb) {
    throw new QueueJobExecutionError(
      'D1_BINDING_UNAVAILABLE',
      'D1 database binding (USER_DB/DB) is required for expired_chunk_upload_session_cleanup',
      true,
    );
  }
  const nowMs =
    typeof envelope.payload?.nowMs === 'number' && Number.isFinite(envelope.payload.nowMs)
      ? envelope.payload.nowMs
      : Date.now();
  const ttlMs =
    typeof envelope.payload?.ttlMs === 'number' && envelope.payload.ttlMs >= 1000
      ? envelope.payload.ttlMs
      : UPLOAD_SESSION_TTL_MS;
  const cutoffMs = nowMs - ttlMs;
  const nowIso = new Date(nowMs).toISOString();

  const expiredRes = await userDb
    .prepare('SELECT session_id FROM upload_sessions WHERE created_at_ms < ?1')
    .bind(cutoffMs)
    .all<{ session_id: string }>();

  const expiredIds = (expiredRes.results ?? []).map((r) => r.session_id);
  for (const sid of expiredIds) {
    await userDb.prepare('DELETE FROM upload_session_chunks WHERE session_id = ?1').bind(sid).run();
    await userDb.prepare('DELETE FROM upload_sessions WHERE session_id = ?1').bind(sid).run();
  }

  await userDb
    .prepare('INSERT OR REPLACE INTO sync_watermarks (watermark_key, watermark_value, updated_at_iso) VALUES (?1, ?2, ?3)')
    .bind('expired_chunk_upload_session_cleanup:last_run', String(expiredIds.length), nowIso)
    .run();

  return {
    jobType: 'expired_chunk_upload_session_cleanup',
    idempotencyKey: envelope.idempotencyKey,
    executedAtIso: nowIso,
    affectedCount: expiredIds.length,
    summary: { purgedSessionCount: expiredIds.length, cutoffMs },
  };
}

async function handleR2OrphanMediaReconcile(
  envelope: RadarQueueEnvelope,
  env: WorkerEnv,
): Promise<QueueJobExecutionResult> {
  const userDb = resolveUserDb(env);
  if (!userDb || !env.MEDIA_BUCKET) {
    throw new QueueJobExecutionError(
      'STORAGE_OR_DB_BINDING_UNAVAILABLE',
      'Both USER_DB/DB and MEDIA_BUCKET bindings are required for r2_orphan_media_reconcile',
      true,
    );
  }
  const nowMs =
    typeof envelope.payload?.nowMs === 'number' && Number.isFinite(envelope.payload.nowMs)
      ? envelope.payload.nowMs
      : Date.now();
  const staleThresholdMs =
    typeof envelope.payload?.staleThresholdMs === 'number' && envelope.payload.staleThresholdMs >= 0
      ? envelope.payload.staleThresholdMs
      : 30 * 60 * 1000;
  const nowIso = new Date(nowMs).toISOString();
  const cutoffIso = new Date(nowMs - staleThresholdMs).toISOString();

  let deletedCount = 0;
  let skippedLegalHoldCount = 0;

  // 1. Reconcile D1 media_objects stuck in PENDING_UPLOAD / FAILED_UPLOAD / PENDING_PHYSICAL_DELETE
  const staleObjects = await userDb
    .prepare(
      `SELECT * FROM media_objects WHERE lifecycle_state IN ('PENDING_UPLOAD', 'FAILED_UPLOAD', 'PENDING_DELETE') AND updated_at_iso <= ?1`,
    )
    .bind(cutoffIso)
    .all<{
      object_id: string;
      storage_key: string;
      legal_hold: number;
      retention_until: string | null;
    }>();

  for (const obj of staleObjects.results ?? []) {
    const hold = await isObjectUnderLegalHold(userDb, obj.object_id);
    const hasRetentionLock = Boolean(obj.retention_until && Date.parse(obj.retention_until) > nowMs);
    if (hold.held || obj.legal_hold === 1 || hasRetentionLock) {
      skippedLegalHoldCount += 1;
      continue;
    }
    await env.MEDIA_BUCKET.delete(obj.storage_key);
    await userDb
      .prepare(
        'UPDATE media_objects SET lifecycle_state = ?1, deletion_state = ?2, updated_at_iso = ?3, deleted_at_iso = ?4 WHERE object_id = ?5',
      )
      .bind('DELETED', 'PHYSICALLY_DELETED', nowIso, nowIso, obj.object_id)
      .run();
    deletedCount += 1;
  }

  // 2. Scan R2 objects under listings/ not tracked as active in D1
  const knownActiveRes = await userDb
    .prepare('SELECT storage_key FROM media_objects WHERE deletion_state != ?1')
    .bind('PHYSICALLY_DELETED')
    .all<{ storage_key: string }>();
  const knownKeys = new Set((knownActiveRes.results ?? []).map((r) => r.storage_key));

  const listed = await env.MEDIA_BUCKET.list({ prefix: 'listings/', limit: 100 });
  for (const r2Obj of listed.objects) {
    if (knownKeys.has(r2Obj.key)) continue;
    const uploadedMs = r2Obj.uploaded instanceof Date ? r2Obj.uploaded.getTime() : 0;
    if (nowMs - uploadedMs < staleThresholdMs) continue;
    const maybeObjectId = r2Obj.customMetadata?.objectId || r2Obj.key;
    const hold = await isObjectUnderLegalHold(userDb, maybeObjectId);
    if (hold.held) {
      skippedLegalHoldCount += 1;
      continue;
    }
    await env.MEDIA_BUCKET.delete(r2Obj.key);
    deletedCount += 1;
  }

  await userDb
    .prepare('INSERT OR REPLACE INTO sync_watermarks (watermark_key, watermark_value, updated_at_iso) VALUES (?1, ?2, ?3)')
    .bind('r2_orphan_media_reconcile:last_run', JSON.stringify({ deletedCount, skippedLegalHoldCount }), nowIso)
    .run();

  return {
    jobType: 'r2_orphan_media_reconcile',
    idempotencyKey: envelope.idempotencyKey,
    executedAtIso: nowIso,
    affectedCount: deletedCount,
    summary: { deletedCount, skippedLegalHoldCount },
  };
}

async function handleTelemetryArchiveFlush(
  envelope: RadarQueueEnvelope,
  env: WorkerEnv,
): Promise<QueueJobExecutionResult> {
  const userDb = resolveUserDb(env);
  if (!userDb || !env.MEDIA_BUCKET) {
    throw new QueueJobExecutionError(
      'STORAGE_OR_DB_BINDING_UNAVAILABLE',
      'Both USER_DB/DB and MEDIA_BUCKET bindings are required for telemetry_archive_flush',
      true,
    );
  }
  const nowIso = new Date().toISOString();
  const datePart = nowIso.slice(0, 10);
  const safeIdem = envelope.idempotencyKey.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const archiveKey = `telemetry-archives/${datePart}/${safeIdem}.json`;

  const watermarks = await userDb
    .prepare('SELECT watermark_key, watermark_value, updated_at_iso FROM sync_watermarks ORDER BY updated_at_iso DESC LIMIT 20')
    .all<{ watermark_key: string; watermark_value: string; updated_at_iso: string }>();

  const archivePayload = {
    schemaVersion: '1.0',
    flushedAtIso: nowIso,
    correlationId: envelope.correlationId,
    idempotencyKey: envelope.idempotencyKey,
    watermarksCount: (watermarks.results ?? []).length,
    watermarks: (watermarks.results ?? []).filter((w) => !w.watermark_key.startsWith('revoked_uid:')),
  };

  await env.MEDIA_BUCKET.put(archiveKey, JSON.stringify(archivePayload), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: {
      archiveType: 'telemetry_summary',
      idempotencyKey: safeIdem,
    },
  });

  await userDb
    .prepare('INSERT OR REPLACE INTO sync_watermarks (watermark_key, watermark_value, updated_at_iso) VALUES (?1, ?2, ?3)')
    .bind('telemetry_archive_flush:last_run', archiveKey, nowIso)
    .run();

  return {
    jobType: 'telemetry_archive_flush',
    idempotencyKey: envelope.idempotencyKey,
    executedAtIso: nowIso,
    affectedCount: 1,
    summary: { archiveKey, watermarksCount: archivePayload.watermarksCount },
  };
}

export async function executeQueuedResearchEventIngest(
  envelope: RadarQueueEnvelope,
  env: WorkerEnv,
  options?: {
    nowMs?: number;
    permitTtlMs?: number;
    beforeResearchWriteBarrier?: (ctx: {
      permitId: string;
      consentRevision: number;
      subjectKey: string;
      subjectKeyVersion: string;
    }) => Promise<void>;
  },
): Promise<QueueJobExecutionResult> {
  const userDb = resolveUserDb(env);
  const researchDb = resolveResearchDb(env);
  if (!userDb || !researchDb) {
    throw new QueueJobExecutionError(
      'TRIAD_DB_BINDING_UNAVAILABLE',
      'Both USER_DB and RESEARCH_DB bindings are required for consent-verified research_event_ingest',
      true,
    );
  }
  const subjectKey = String(envelope.payload?.subjectKey || '').trim();
  const subjectKeyVersion = String(envelope.payload?.subjectKeyVersion || 'v1').trim();
  const expectedConsentRevision =
    typeof envelope.payload?.consentRevision === 'number' && Number.isInteger(envelope.payload.consentRevision)
      ? envelope.payload.consentRevision
      : undefined;
  const rawEvents = Array.isArray(envelope.payload?.events) ? envelope.payload.events : [];
  if (!subjectKey || !subjectKey.startsWith('sk_') || rawEvents.length === 0) {
    throw new QueueJobExecutionError(
      'INVALID_RESEARCH_INGEST_PAYLOAD',
      'research_event_ingest requires pseudonymized subjectKey (sk_*) and non-empty events',
      false,
    );
  }

  const nowMs = options?.nowMs ?? Date.now();
  const validated: ValidatedResearchEvent[] = [];
  for (const item of rawEvents) {
    const check = validateAndMinimizeResearchEvent(item, nowMs);
    if ('event' in check && check.ok) validated.push(check.event);
  }
  if (validated.length === 0) {
    throw new QueueJobExecutionError('INVALID_RESEARCH_EVENTS', 'Zero valid research events in queue payload', false);
  }

  // Atomically verify active consent, consent_revision, write-blocks, and erasure outbox
  // AND acquire a bounded-lease processing permit in USER_DB before writing to RESEARCH_DB.
  const permit = await acquireQueuedResearchProcessingPermitInD1({
    userDb,
    subjectKey,
    subjectKeyVersion,
    expectedConsentRevision,
    ttlMs: options?.permitTtlMs,
    nowMs,
  });
  if (permit.ok === false) {
    throw new QueueJobExecutionError(
      permit.code,
      `Queued research_event_ingest rejected by USER_DB consent barrier: ${permit.code}`,
      permit.statusCode === 503,
    );
  }

  try {
    if (options?.beforeResearchWriteBarrier) {
      await options.beforeResearchWriteBarrier({
        permitId: permit.permitId,
        consentRevision: permit.consentRevision,
        subjectKey,
        subjectKeyVersion,
      });
    }

    const res = await writePseudonymizedEventsToResearchDb({
      researchDb,
      subjectKey,
      subjectKeyVersion,
      consentRevision: permit.consentRevision,
      events: validated,
      nowMs,
    });

    if (res.fencedCount > 0 && res.acceptedCount === 0) {
      throw new QueueJobExecutionError(
        'CONSENT_FENCED_IN_RESEARCH_DB',
        'Queued research_event_ingest blocked atomically by RESEARCH_DB consent fence',
        false,
      );
    }

    return {
      jobType: 'research_event_ingest',
      idempotencyKey: envelope.idempotencyKey,
      executedAtIso: new Date(nowMs).toISOString(),
      affectedCount: res.acceptedCount,
      summary: { ...res, consentRevision: permit.consentRevision, permitId: permit.permitId },
    };
  } finally {
    await releaseResearchProcessingPermitInD1({
      userDb,
      permitId: permit.permitId,
    }).catch(() => {});
  }
}

async function handleResearchEventIngestJob(
  envelope: RadarQueueEnvelope,
  env: WorkerEnv,
): Promise<QueueJobExecutionResult> {
  return executeQueuedResearchEventIngest(envelope, env);
}

async function handleResearchSubjectErasureJob(
  envelope: RadarQueueEnvelope,
  env: WorkerEnv,
): Promise<QueueJobExecutionResult> {
  const userDb = resolveUserDb(env);
  const researchDb = resolveResearchDb(env);
  if (!userDb || !researchDb) {
    throw new QueueJobExecutionError(
      'TRIAD_DB_BINDING_UNAVAILABLE',
      'Both USER_DB and RESEARCH_DB bindings are required for research_subject_erasure',
      true,
    );
  }
  const jobId = typeof envelope.payload?.jobId === 'string' ? envelope.payload.jobId.trim() : undefined;
  const receiptSecret = env.INTERNAL_LIFECYCLE_RPC_SECRET || env.RESEARCH_HMAC_SECRET;
  const outboxRes = await processPendingResearchErasureOutbox({ userDb, researchDb, jobId, receiptSecret });
  return {
    jobType: 'research_subject_erasure',
    idempotencyKey: envelope.idempotencyKey,
    executedAtIso: new Date().toISOString(),
    affectedCount: outboxRes.erasedEventsTotal,
    summary: { ...outboxRes },
  };
}

async function handleResearchRetentionPurgeJob(
  envelope: RadarQueueEnvelope,
  env: WorkerEnv,
): Promise<QueueJobExecutionResult> {
  const researchDb = resolveResearchDb(env);
  if (!researchDb) {
    throw new QueueJobExecutionError(
      'RESEARCH_DB_BINDING_UNAVAILABLE',
      'RESEARCH_DB binding is required for research_retention_purge',
      true,
    );
  }
  const report = await purgeExpiredResearchData({ researchDb });
  return {
    jobType: 'research_retention_purge',
    idempotencyKey: envelope.idempotencyKey,
    executedAtIso: report.purgedAtIso,
    affectedCount:
      report.deletedEventsCount + report.deletedIdempotencyKeysCount + report.deletedAggregationWindowsCount,
    summary: { ...report },
  };
}

export function createCanonicalQueueJobDispatcher(
  env: WorkerEnv,
): (envelope: RadarQueueEnvelope) => Promise<QueueJobExecutionResult> {
  return async (envelope: RadarQueueEnvelope): Promise<QueueJobExecutionResult> => {
    switch (envelope.jobType) {
      case 'firestore_d1_projection_sync':
        return handleFirestoreD1ProjectionSync(envelope, env);
      case 'expired_chunk_upload_session_cleanup':
        return handleExpiredChunkUploadSessionCleanup(envelope, env);
      case 'r2_orphan_media_reconcile':
        return handleR2OrphanMediaReconcile(envelope, env);
      case 'telemetry_archive_flush':
        return handleTelemetryArchiveFlush(envelope, env);
      case 'research_event_ingest':
        return handleResearchEventIngestJob(envelope, env);
      case 'research_subject_erasure':
        return handleResearchSubjectErasureJob(envelope, env);
      case 'research_retention_purge':
        return handleResearchRetentionPurgeJob(envelope, env);
      default:
        throw new QueueJobExecutionError(
          'UNSUPPORTED_JOB_TYPE',
          `No canonical executable handler registered for jobType="${String(envelope.jobType)}"`,
          false,
        );
    }
  };
}

export function buildCanonicalCronEnvelopes(params: {
  cron: string;
  scheduledTime: number;
}): RadarQueueEnvelope[] {
  const tehranClock = convertUtcScheduledTimeToTehranWallClock(params.scheduledTime);
  const createdAtIso = new Date(params.scheduledTime).toISOString();
  const basePayload = {
    cron: params.cron,
    scheduledTime: params.scheduledTime,
    tehranFormatted: tehranClock.tehranFormatted,
  };

  const makeEnvelope = (jobType: RadarQueueJobType, suffix: string): RadarQueueEnvelope => {
    const idempotencyKey = `cron_${jobType}_${params.scheduledTime}_${suffix}`;
    const candidate: RadarQueueEnvelope = {
      schemaVersion: '1.0',
      messageId: `cron_msg_${params.scheduledTime}_${suffix}`,
      idempotencyKey,
      jobType,
      createdAtIso,
      correlationId: `cron_corr_${params.scheduledTime}_${suffix}`,
      payload: basePayload,
    };
    const validated = validateQueueEnvelope(candidate);
    if (validated.valid === false) {
      throw new Error(`CANONICAL_CRON_ENVELOPE_INVALID:${validated.reason}`);
    }
    return validated.envelope;
  };

  if (params.cron === '30 0 * * *' || tehranClock.matchedScheduleTask === 'morning_cleanup_only') {
    return [makeEnvelope('expired_chunk_upload_session_cleanup', 'morning_cleanup')];
  }

  if (params.cron === '30 18 * * *' || tehranClock.matchedScheduleTask === 'nightly_orphan_and_telemetry_flush') {
    return [
      makeEnvelope('r2_orphan_media_reconcile', 'nightly_orphan'),
      makeEnvelope('telemetry_archive_flush', 'nightly_telemetry'),
      makeEnvelope('expired_chunk_upload_session_cleanup', 'nightly_cleanup'),
    ];
  }

  if (params.cron === '0 * * * *') {
    return [makeEnvelope('expired_chunk_upload_session_cleanup', 'hourly_cleanup')];
  }

  return [];
}
