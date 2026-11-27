/**
 * @file worker/queues/jobDispatcher.ts
 * @description Real canonical Cloudflare Queue job dispatcher and Cron envelope builder.
 * Every registered job executes durable, verifiable work against D1/R2/KV bindings.
 * Zero no-op handlers, zero silent ACKs on missing dependencies.
 */
import { processPendingResearchErasureOutbox, resolveDedicatedLifecycleReceiptSecret } from '../account-lifecycle/workerLifecycleRuntime';
import { resolveResearchDb, resolveUserDb } from '../db/bindingResolver';
import {
  acquireQueuedResearchProcessingPermitInD1,
  releaseResearchProcessingPermitInD1,
} from '../research/researchConsentBarrier';
import {
  MAX_RESEARCH_BATCH_SIZE,
  validateAndMinimizeResearchEvent,
  type ValidatedResearchEvent,
} from '../research/researchEventContract';
import {
  purgeExpiredResearchData,
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
    .prepare('SELECT session_id FROM upload_sessions WHERE created_at_ms < ?1 ORDER BY created_at_ms ASC LIMIT 100')
    .bind(cutoffMs)
    .all<{ session_id: string }>();
  if (!expiredRes.success) {
    throw new QueueJobExecutionError('UPLOAD_SESSION_EXPIRY_SCAN_FAILED', 'Unable to read expired upload sessions.', true);
  }

  const expiredIds = (expiredRes.results ?? []).map((r) => r.session_id);
  let deletedSessionCount = 0;
  let skippedLegalHoldCount = 0;
  for (const sid of expiredIds) {
    const hold = await isObjectUnderLegalHold(userDb, sid, nowMs);
    if (hold.held) {
      skippedLegalHoldCount += 1;
      continue;
    }
    const chunksDelete = await userDb.prepare('DELETE FROM upload_session_chunks WHERE session_id = ?1').bind(sid).run();
    if (!chunksDelete.success) {
      throw new QueueJobExecutionError('UPLOAD_SESSION_CHUNK_DELETE_FAILED', 'Unable to remove expired upload chunks.', true);
    }
    const sessionDelete = await userDb.prepare('DELETE FROM upload_sessions WHERE session_id = ?1').bind(sid).run();
    if (!sessionDelete.success) {
      throw new QueueJobExecutionError('UPLOAD_SESSION_DELETE_FAILED', 'Unable to remove expired upload session.', true);
    }
    deletedSessionCount += 1;
  }

  const cleanupWatermark = await userDb
    .prepare('INSERT OR REPLACE INTO sync_watermarks (watermark_key, watermark_value, updated_at_iso) VALUES (?1, ?2, ?3)')
    .bind('expired_chunk_upload_session_cleanup:last_run', JSON.stringify({ deletedSessionCount, skippedLegalHoldCount }), nowIso)
    .run();
  if (!cleanupWatermark.success) {
    throw new QueueJobExecutionError('UPLOAD_SESSION_CLEANUP_WATERMARK_FAILED', 'Unable to persist cleanup watermark.', true);
  }

  return {
    jobType: 'expired_chunk_upload_session_cleanup',
    idempotencyKey: envelope.idempotencyKey,
    executedAtIso: nowIso,
    affectedCount: deletedSessionCount,
    summary: { purgedSessionCount: deletedSessionCount, skippedLegalHoldCount, scannedSessionCount: expiredIds.length, cutoffMs },
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
    typeof envelope.payload?.staleThresholdMs === 'number' &&
    Number.isFinite(envelope.payload.staleThresholdMs) &&
    envelope.payload.staleThresholdMs >= 0
      ? envelope.payload.staleThresholdMs
      : 30 * 60 * 1000;
  const nowIso = new Date(nowMs).toISOString();
  const cutoffIso = new Date(nowMs - staleThresholdMs).toISOString();

  let deletedCount = 0;
  let skippedLegalHoldCount = 0;
  let skippedUnknownOwnershipCount = 0;

  // Reconcile a bounded page of stale D1 media records first.
  const staleObjects = await userDb
    .prepare(
      `SELECT object_id, storage_key, legal_hold, retention_until
       FROM media_objects
       WHERE lifecycle_state IN ('PENDING_UPLOAD', 'FAILED_UPLOAD', 'PENDING_DELETE')
         AND updated_at_iso <= ?1
       ORDER BY updated_at_iso ASC
       LIMIT 100`,
    )
    .bind(cutoffIso)
    .all<{
      object_id: string;
      storage_key: string;
      legal_hold: number;
      retention_until: string | null;
    }>();
  if (!staleObjects.success) {
    throw new QueueJobExecutionError('MEDIA_OBJECT_STALE_SCAN_FAILED', 'Unable to read stale media objects.', true);
  }

  for (const obj of staleObjects.results ?? []) {
    const hold = await isObjectUnderLegalHold(userDb, obj.object_id);
    const hasRetentionLock = Boolean(obj.retention_until && Date.parse(obj.retention_until) > nowMs);
    if (hold.held || obj.legal_hold === 1 || hasRetentionLock) {
      skippedLegalHoldCount += 1;
      continue;
    }
    await env.MEDIA_BUCKET.delete(obj.storage_key);
    const markDeleted = await userDb
      .prepare(
        'UPDATE media_objects SET lifecycle_state = ?1, deletion_state = ?2, updated_at_iso = ?3, deleted_at_iso = ?4 WHERE object_id = ?5',
      )
      .bind('DELETED', 'PHYSICALLY_DELETED', nowIso, nowIso, obj.object_id)
      .run();
    if (!markDeleted.success) {
      throw new QueueJobExecutionError('MEDIA_OBJECT_DELETE_STATE_WRITE_FAILED', 'Unable to persist physical deletion state.', true);
    }
    deletedCount += 1;
  }

  // Persist the R2 cursor per queue idempotency key so retries resume instead of
  // repeatedly scanning the first page. Unknown objects without objectId metadata
  // are retained: legal-hold status cannot be established safely for them.
  const safeIdem = envelope.idempotencyKey.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const cursorWatermarkKey = `r2_orphan_media_reconcile:cursor:${safeIdem}`;
  const cursorRow = await userDb
    .prepare('SELECT watermark_value FROM sync_watermarks WHERE watermark_key = ?1')
    .bind(cursorWatermarkKey)
    .first<{ watermark_value: string }>();
  let cursor = cursorRow?.watermark_value || undefined;
  let pageCount = 0;
  let truncated = false;

  do {
    const listed = await env.MEDIA_BUCKET.list({
      prefix: 'listings/',
      limit: 80,
      ...(cursor ? { cursor } : {}),
    });
    const pageKeys = listed.objects.map((obj) => obj.key);
    const knownKeys = new Set<string>();
    if (pageKeys.length > 0) {
      const placeholders = pageKeys.map((_, index) => `?${index + 1}`).join(', ');
      const knownActiveRes = await userDb
        .prepare(
          `SELECT storage_key FROM media_objects
           WHERE storage_key IN (${placeholders})
             AND COALESCE(deletion_state, '') != ?${pageKeys.length + 1}`,
        )
        .bind(...pageKeys, 'PHYSICALLY_DELETED')
        .all<{ storage_key: string }>();
      if (!knownActiveRes.success) {
        throw new QueueJobExecutionError('MEDIA_OBJECT_OWNERSHIP_SCAN_FAILED', 'Unable to verify R2 object ownership.', true);
      }
      for (const row of knownActiveRes.results ?? []) knownKeys.add(row.storage_key);
    }

    for (const r2Obj of listed.objects) {
      if (knownKeys.has(r2Obj.key)) continue;
      const uploadedMs = r2Obj.uploaded instanceof Date ? r2Obj.uploaded.getTime() : Number.NaN;
      if (!Number.isFinite(uploadedMs) || uploadedMs <= 0) {
        skippedUnknownOwnershipCount += 1;
        continue;
      }
      if (nowMs - uploadedMs < staleThresholdMs) continue;

      const objectId = String(r2Obj.customMetadata?.objectId || '').trim();
      if (!objectId) {
        skippedUnknownOwnershipCount += 1;
        continue;
      }
      const hold = await isObjectUnderLegalHold(userDb, objectId);
      if (hold.held) {
        skippedLegalHoldCount += 1;
        continue;
      }
      await env.MEDIA_BUCKET.delete(r2Obj.key);
      deletedCount += 1;
    }

    pageCount += 1;
    truncated = listed.truncated;
    if (truncated) {
      if (!listed.cursor) {
        throw new QueueJobExecutionError('R2_RECONCILE_CURSOR_MISSING', 'R2 listing is truncated without a continuation cursor.', true);
      }
      const saveCursor = await userDb
        .prepare('INSERT OR REPLACE INTO sync_watermarks (watermark_key, watermark_value, updated_at_iso) VALUES (?1, ?2, ?3)')
        .bind(cursorWatermarkKey, listed.cursor, nowIso)
        .run();
      if (!saveCursor.success) {
        throw new QueueJobExecutionError('R2_RECONCILE_CURSOR_WRITE_FAILED', 'Unable to persist R2 continuation cursor.', true);
      }
      cursor = listed.cursor;
    } else {
      const clearCursor = await userDb
        .prepare('DELETE FROM sync_watermarks WHERE watermark_key = ?1')
        .bind(cursorWatermarkKey)
        .run();
      if (!clearCursor.success) {
        throw new QueueJobExecutionError('R2_RECONCILE_CURSOR_CLEAR_FAILED', 'Unable to clear completed R2 cursor.', true);
      }
      cursor = undefined;
    }
  } while (truncated && pageCount < 5);

  if (truncated) {
    throw new QueueJobExecutionError(
      'R2_RECONCILE_PAGE_LIMIT_REACHED',
      'R2 orphan reconciliation saved its cursor and will continue on retry.',
      true,
    );
  }

  const watermark = await userDb
    .prepare('INSERT OR REPLACE INTO sync_watermarks (watermark_key, watermark_value, updated_at_iso) VALUES (?1, ?2, ?3)')
    .bind('r2_orphan_media_reconcile:last_run', JSON.stringify({ deletedCount, skippedLegalHoldCount, skippedUnknownOwnershipCount }), nowIso)
    .run();
  if (!watermark.success) {
    throw new QueueJobExecutionError('R2_RECONCILE_WATERMARK_WRITE_FAILED', 'Unable to persist R2 reconciliation watermark.', true);
  }

  return {
    jobType: 'r2_orphan_media_reconcile',
    idempotencyKey: envelope.idempotencyKey,
    executedAtIso: nowIso,
    affectedCount: deletedCount,
    summary: { deletedCount, skippedLegalHoldCount, skippedUnknownOwnershipCount, pagesProcessed: pageCount },
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
  if (!watermarks.success) {
    throw new QueueJobExecutionError('TELEMETRY_WATERMARK_READ_FAILED', 'Unable to read telemetry archive watermarks.', true);
  }

  const safeWatermarks = (watermarks.results ?? []).filter((row) => {
    const key = row.watermark_key;
    return key === 'd1_projection_sync:last_run' ||
      /^d1_projection_sync:[a-z0-9_-]{1,64}$/i.test(key) ||
      key === 'expired_chunk_upload_session_cleanup:last_run' ||
      key === 'telemetry_archive_flush:last_run' ||
      key === 'r2_orphan_media_reconcile:last_run';
  });
  const archivePayload = {
    schemaVersion: '1.0',
    flushedAtIso: nowIso,
    correlationId: envelope.correlationId,
    idempotencyKey: envelope.idempotencyKey,
    watermarksCount: safeWatermarks.length,
    watermarks: safeWatermarks,
  };

  await env.MEDIA_BUCKET.put(archiveKey, JSON.stringify(archivePayload), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: {
      archiveType: 'telemetry_summary',
      idempotencyKey: safeIdem,
    },
  });

  const archiveWatermark = await userDb
    .prepare('INSERT OR REPLACE INTO sync_watermarks (watermark_key, watermark_value, updated_at_iso) VALUES (?1, ?2, ?3)')
    .bind('telemetry_archive_flush:last_run', archiveKey, nowIso)
    .run();
  if (!archiveWatermark.success) {
    throw new QueueJobExecutionError('TELEMETRY_ARCHIVE_WATERMARK_WRITE_FAILED', 'Unable to persist telemetry archive watermark.', true);
  }

  return {
    jobType: 'telemetry_archive_flush',
    idempotencyKey: envelope.idempotencyKey,
    executedAtIso: nowIso,
    affectedCount: 1,
    summary: { archiveKey, watermarksCount: archivePayload.watermarksCount },
  };
}

async function handleResearchEventIngestJob(
  envelope: RadarQueueEnvelope,
  env: WorkerEnv,
  options: { nowMs?: number; beforeResearchWriteBarrier?: () => Promise<void> } = {},
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
  const subjectKeyVersion = String(envelope.payload?.subjectKeyVersion || '').trim();
  const expectedConsentRevision =
    typeof envelope.payload?.consentRevision === 'number' &&
    Number.isSafeInteger(envelope.payload.consentRevision)
      ? envelope.payload.consentRevision
      : undefined;
  const rawEvents = Array.isArray(envelope.payload?.events) ? envelope.payload.events : [];
  if (
    !/^sk_[A-Za-z0-9._-]{8,200}$/.test(subjectKey) ||
    !/^[A-Za-z0-9._-]{1,32}$/.test(subjectKeyVersion) ||
    expectedConsentRevision === undefined ||
    expectedConsentRevision < 1 ||
    rawEvents.length === 0 ||
    rawEvents.length > MAX_RESEARCH_BATCH_SIZE
  ) {
    throw new QueueJobExecutionError(
      'INVALID_RESEARCH_INGEST_PAYLOAD',
      `research_event_ingest requires a valid pseudonymized subject key, key version, positive consent revision, and 1-${MAX_RESEARCH_BATCH_SIZE} events`,
      false,
    );
  }

  const validated: ValidatedResearchEvent[] = [];
  for (const item of rawEvents) {
    const check = validateAndMinimizeResearchEvent(item, options.nowMs);
    if ('event' in check && check.ok) validated.push(check.event);
  }
  if (validated.length === 0) {
    throw new QueueJobExecutionError('INVALID_RESEARCH_EVENTS', 'Zero valid research events in queue payload', false);
  }

  // The UID-free queue gate resolves the subject owner, checks the revision-scoped
  // erasure outbox, and atomically issues a bounded processing permit.
  const permit = await acquireQueuedResearchProcessingPermitInD1({
    userDb,
    subjectKey,
    subjectKeyVersion,
    expectedConsentRevision,
    nowMs: options.nowMs,
  });
  if (permit.ok === false) {
    throw new QueueJobExecutionError(
      permit.code,
      `Queued research_event_ingest rejected by USER_DB permit gate: ${permit.code}`,
      permit.statusCode === 503,
    );
  }

  try {
    if (options.beforeResearchWriteBarrier) await options.beforeResearchWriteBarrier();
    const res = await writePseudonymizedEventsToResearchDb({
      researchDb,
      subjectKey,
      subjectKeyVersion,
      consentRevision: permit.consentRevision,
      events: validated,
      nowMs: options.nowMs,
      rejectedCount: rawEvents.length - validated.length,
    });
    return {
      jobType: 'research_event_ingest',
      idempotencyKey: envelope.idempotencyKey,
      executedAtIso: new Date(options.nowMs ?? Date.now()).toISOString(),
      affectedCount: res.acceptedCount,
      summary: { ...res, consentRevision: permit.consentRevision },
    };
  } finally {
    await releaseResearchProcessingPermitInD1({
      userDb,
      permitId: permit.permitId,
      nowMs: Date.now(),
    });
  }
}

export async function executeQueuedResearchEventIngest(
  envelope: RadarQueueEnvelope,
  env: WorkerEnv,
  options: { nowMs?: number; beforeResearchWriteBarrier?: () => Promise<void> } = {},
): Promise<QueueJobExecutionResult> {
  if (envelope.jobType !== 'research_event_ingest') {
    throw new QueueJobExecutionError('UNSUPPORTED_JOB_TYPE', 'Expected research_event_ingest envelope.', false);
  }
  return handleResearchEventIngestJob(envelope, env, options);
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
  const receiptSecret = resolveDedicatedLifecycleReceiptSecret(env);
  if (!receiptSecret) {
    throw new QueueJobExecutionError(
      'LIFECYCLE_RECEIPT_HMAC_SECRET_UNAVAILABLE',
      'A dedicated lifecycle receipt HMAC secret is required; RPC and research secrets cannot be reused.',
      true,
    );
  }
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
        throw new QueueJobExecutionError(
          'FIRESTORE_SOURCE_ADAPTER_UNAVAILABLE',
          'Legacy Firestore projection sync is disabled: no verified authoritative Firestore source adapter is configured.',
          false,
        );
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

  if (params.cron === '30 0 * * *' || tehranClock.matchedScheduleTask === 'morning_market_and_d1_sync') {
    // The legacy Firestore projection handler is intentionally disabled. Keep
    // accepting in-flight legacy messages for DLQ compatibility, but never
    // enqueue new messages for a job with no verified authoritative source.
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
