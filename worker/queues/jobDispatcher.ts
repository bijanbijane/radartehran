/**
 * @file worker/queues/jobDispatcher.ts
 * @description Real canonical Cloudflare Queue job dispatcher and Cron envelope builder.
 * Every registered job executes durable, verifiable work against D1/R2/KV bindings.
 * Zero no-op handlers, zero silent ACKs on missing dependencies.
 */
import { getValidatedCityConfig } from '../../src/data/multiCityData';
import type { CityId } from '../../src/types/models';
import { processPendingResearchErasureOutbox } from '../account-lifecycle/workerLifecycleRuntime';
import { resolveResearchDb, resolveUserDb } from '../db/bindingResolver';
import { upsertNeighborhoodProjectionD1 } from '../db/d1SchemaAndMigrations';
import { validateAndMinimizeResearchEvent, type ValidatedResearchEvent } from '../research/researchEventContract';
import {
  purgeExpiredResearchData,
  verifyQueuedResearchSubjectConsent,
  writePseudonymizedEventsToResearchDb,
} from '../research/researchService';
import { isValidLifecycleReceiptSecret } from '../research/pseudonymizer';
import type { WorkerEnv } from '../types';
import {
  convertUtcScheduledTimeToTehranWallClock,
  validateQueueEnvelope,
  type RadarQueueEnvelope,
  type RadarQueueJobType,
} from './queueAndCronProcessor';

export const EXECUTABLE_CANONICAL_JOB_TYPES: readonly RadarQueueJobType[] = [
  'firestore_d1_projection_sync',
  'r2_orphan_media_reconcile',
  'expired_chunk_upload_session_cleanup',
  'telemetry_archive_flush',
  'research_event_ingest',
  'research_subject_erasure',
  'research_retention_purge',
] as const;

export const UPLOAD_SESSION_TTL_MS = 15 * 60 * 1000;
const SUPPORTED_CITIES: readonly CityId[] = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'];

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
  env: WorkerEnv,
): Promise<QueueJobExecutionResult> {
  const userDb = resolveUserDb(env);
  if (!userDb) {
    throw new QueueJobExecutionError(
      'D1_BINDING_UNAVAILABLE',
      'D1 database binding (USER_DB/DB) is required for firestore_d1_projection_sync',
      true,
    );
  }
  const nowIso = new Date().toISOString();
  const rawCity = typeof envelope.payload?.city === 'string' ? envelope.payload.city.trim().toLowerCase() : '';
  let targetCities: CityId[];
  if (!rawCity || rawCity === 'all') {
    targetCities = [...SUPPORTED_CITIES];
  } else if ((SUPPORTED_CITIES as readonly string[]).includes(rawCity)) {
    targetCities = [rawCity as CityId];
  } else {
    throw new QueueJobExecutionError(
      'INVALID_CITY_PAYLOAD',
      `Unsupported city "${rawCity}" in firestore_d1_projection_sync payload`,
      false,
    );
  }

  let syncedRows = 0;
  for (const cityId of targetCities) {
    const cfg = getValidatedCityConfig(cityId);
    const sliceLimit =
      typeof envelope.payload?.maxNeighborhoodsPerCity === 'number' &&
      Number.isInteger(envelope.payload.maxNeighborhoodsPerCity) &&
      envelope.payload.maxNeighborhoodsPerCity > 0
        ? Math.min(cfg.neighborhoods.length, envelope.payload.maxNeighborhoodsPerCity)
        : Math.min(cfg.neighborhoods.length, 25);

    for (const hood of cfg.neighborhoods.slice(0, sliceLimit)) {
      const dealPerSqm = Math.round(hood.buyPerSqm * 0.92 * 10) / 10;
      const districtMatch = String(hood.zone || '').match(/\d+/);
      const district = districtMatch ? Number(districtMatch[0]) : 1;
      await upsertNeighborhoodProjectionD1(userDb, {
        city_id: cityId,
        hood_id: hood.id,
        name_fa: hood.name,
        district,
        buy_per_sqm_million: hood.buyPerSqm,
        deal_per_sqm_million: dealPerSqm,
        rahn_80m_million: hood.rahn80m,
        aqi: 80,
        investment_score: hood.opportunityScore ?? 75,
        firestore_version_iso: nowIso,
        projected_at_iso: nowIso,
      });
      syncedRows += 1;
    }

    await userDb
      .prepare('INSERT OR REPLACE INTO sync_watermarks (watermark_key, watermark_value, updated_at_iso) VALUES (?1, ?2, ?3)')
      .bind(`d1_projection_sync:${cityId}`, String(sliceLimit), nowIso)
      .run();
  }

  await userDb
    .prepare('INSERT OR REPLACE INTO sync_watermarks (watermark_key, watermark_value, updated_at_iso) VALUES (?1, ?2, ?3)')
    .bind('d1_projection_sync:last_run', nowIso, nowIso)
    .run();

  if (env.RADAR_KV) {
    const workerEnv = env.ENVIRONMENT || env.APP_ENV || env.WORKER_ENV || 'staging';
    await env.RADAR_KV.put(
      `v1:${workerEnv}:neighborhood_summary:last_sync`,
      JSON.stringify({ syncedRows, cities: targetCities, syncedAtIso: nowIso }),
      { expirationTtl: 3600 },
    );
  }

  return {
    jobType: 'firestore_d1_projection_sync',
    idempotencyKey: envelope.idempotencyKey,
    executedAtIso: nowIso,
    affectedCount: syncedRows,
    summary: { cities: targetCities, syncedRows },
  };
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

  // Bound every scheduled cleanup invocation. An unbounded SELECT followed by two
  // DELETEs per row was an avoidable D1 read/write-unit amplifier under backlog.
  const requestedBatchSize =
    typeof envelope.payload?.maxSessions === 'number' && Number.isInteger(envelope.payload.maxSessions)
      ? envelope.payload.maxSessions
      : 50;
  const batchSize = Math.max(1, Math.min(100, requestedBatchSize));
  const expiredRes = await userDb
    .prepare(
      'SELECT session_id FROM upload_sessions WHERE created_at_ms < ?1 ORDER BY created_at_ms ASC LIMIT ?2',
    )
    .bind(cutoffMs, batchSize)
    .all<{ session_id: string }>();

  const expiredIds = (expiredRes.results ?? []).map((r) => r.session_id);
  const watermarkStatement = userDb
    .prepare('INSERT OR REPLACE INTO sync_watermarks (watermark_key, watermark_value, updated_at_iso) VALUES (?1, ?2, ?3)')
    .bind('expired_chunk_upload_session_cleanup:last_run', String(expiredIds.length), nowIso);

  if (expiredIds.length > 0) {
    const placeholders = expiredIds.map((_, index) => `?${index + 1}`).join(', ');
    const deleteChunks = userDb
      .prepare(`DELETE FROM upload_session_chunks WHERE session_id IN (${placeholders})`)
      .bind(...expiredIds);
    const deleteSessions = userDb
      .prepare(`DELETE FROM upload_sessions WHERE session_id IN (${placeholders})`)
      .bind(...expiredIds);
    const results = await userDb.batch([deleteChunks, deleteSessions, watermarkStatement]);
    if (results.some((result) => result.success === false)) {
      throw new QueueJobExecutionError(
        'UPLOAD_SESSION_CLEANUP_BATCH_FAILED',
        'D1 did not confirm every statement in the bounded upload-session cleanup batch.',
        true,
      );
    }
  } else {
    await watermarkStatement.run();
  }

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

  // 1. Reconcile at most 25 stale D1 media records per invocation. Resolve legal holds
  // with one indexed LEFT JOIN rather than two D1 lookups per object.
  const staleObjects = await userDb
    .prepare(
      `SELECT m.object_id, m.storage_key, m.legal_hold, m.retention_until,
              h.active AS active_legal_hold
       FROM media_objects AS m
       LEFT JOIN legal_holds AS h ON h.resource_id = m.object_id AND h.active = 1
       WHERE m.lifecycle_state IN ('PENDING_UPLOAD', 'FAILED_UPLOAD', 'PENDING_DELETE')
         AND m.updated_at_iso <= ?1
       ORDER BY m.updated_at_iso ASC
       LIMIT 25`,
    )
    .bind(cutoffIso)
    .all<{
      object_id: string;
      storage_key: string;
      legal_hold: number;
      retention_until: string | null;
      active_legal_hold: number | null;
    }>();

  const eligibleStaleObjects = (staleObjects.results ?? []).filter((obj) => {
    const hasRetentionLock = Boolean(obj.retention_until && Date.parse(obj.retention_until) > nowMs);
    const held = Number(obj.active_legal_hold ?? 0) === 1 || Number(obj.legal_hold) === 1 || hasRetentionLock;
    if (held) skippedLegalHoldCount += 1;
    return !held;
  });

  if (eligibleStaleObjects.length > 0) {
    // R2 deletion is idempotent. If the following D1 batch fails, the next delivery
    // safely repeats deletion and can still commit the canonical metadata transition.
    await env.MEDIA_BUCKET.delete(eligibleStaleObjects.map((obj) => obj.storage_key));
    const metadataUpdates = eligibleStaleObjects.map((obj) =>
      userDb
        .prepare(
          'UPDATE media_objects SET lifecycle_state = ?1, deletion_state = ?2, updated_at_iso = ?3, deleted_at_iso = ?4 WHERE object_id = ?5',
        )
        .bind('DELETED', 'PHYSICALLY_DELETED', nowIso, nowIso, obj.object_id),
    );
    const updateResults = await userDb.batch(metadataUpdates);
    if (updateResults.some((result) => result.success === false)) {
      throw new QueueJobExecutionError(
        'R2_RECONCILE_METADATA_BATCH_FAILED',
        'R2 objects were removed but D1 did not confirm every metadata transition.',
        true,
      );
    }
    deletedCount += eligibleStaleObjects.length;
  }

  // 2. Inspect only the bounded R2 page. The previous full-table scan of every active
  // storage_key plus per-object legal-hold queries scaled D1 reads with total history.
  const listed = await env.MEDIA_BUCKET.list({ prefix: 'listings/', limit: 40 });
  const staleR2Objects = listed.objects.filter((r2Obj) => {
    const uploadedMs = r2Obj.uploaded instanceof Date ? r2Obj.uploaded.getTime() : 0;
    return nowMs - uploadedMs >= staleThresholdMs;
  });

  if (staleR2Objects.length > 0) {
    // Keep total bound parameters <= 80 (40 keys + 40 object IDs).
    const storageKeys = staleR2Objects.map((item) => item.key);
    const objectIds = staleR2Objects.map((item) => item.customMetadata?.objectId || item.key);
    const storagePlaceholders = storageKeys.map((_, index) => `?${index + 1}`).join(', ');
    const objectPlaceholders = objectIds.map((_, index) => `?${storageKeys.length + index + 1}`).join(', ');
    const trackedRows = await userDb
      .prepare(
        `SELECT object_id, storage_key, deletion_state, legal_hold, retention_until
         FROM media_objects
         WHERE storage_key IN (${storagePlaceholders}) OR object_id IN (${objectPlaceholders})`,
      )
      .bind(...storageKeys, ...objectIds)
      .all<{
        object_id: string;
        storage_key: string;
        deletion_state: string;
        legal_hold: number;
        retention_until: string | null;
      }>();
    const legalHoldPlaceholders = objectIds.map((_, index) => `?${index + 1}`).join(', ');
    const legalHoldRows = await userDb
      .prepare(`SELECT resource_id FROM legal_holds WHERE active = 1 AND resource_id IN (${legalHoldPlaceholders})`)
      .bind(...objectIds)
      .all<{ resource_id: string }>();

    const trackedById = new Map((trackedRows.results ?? []).map((row) => [row.object_id, row]));
    const activeKeys = new Set(
      (trackedRows.results ?? [])
        .filter((row) => row.deletion_state !== 'PHYSICALLY_DELETED')
        .map((row) => row.storage_key),
    );
    const activeHoldIds = new Set((legalHoldRows.results ?? []).map((row) => row.resource_id));
    const orphanKeys: string[] = [];

    for (let index = 0; index < staleR2Objects.length; index += 1) {
      const r2Obj = staleR2Objects[index];
      const objectId = objectIds[index];
      if (activeKeys.has(r2Obj.key)) continue;
      const tracked = trackedById.get(objectId);
      const hasRetentionLock = Boolean(tracked?.retention_until && Date.parse(tracked.retention_until) > nowMs);
      if (
        activeHoldIds.has(objectId) ||
        Number(tracked?.legal_hold ?? 0) === 1 ||
        hasRetentionLock
      ) {
        skippedLegalHoldCount += 1;
        continue;
      }
      orphanKeys.push(r2Obj.key);
    }

    if (orphanKeys.length > 0) {
      await env.MEDIA_BUCKET.delete(orphanKeys);
      deletedCount += orphanKeys.length;
    }
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

async function handleResearchEventIngestJob(
  envelope: RadarQueueEnvelope,
  env: WorkerEnv,
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

  // Re-verify active consent, monotonic consent_revision, write-blocks, and erasure outbox
  // against USER_DB immediately before committing queued events to RESEARCH_DB.
  const consentCheck = await verifyQueuedResearchSubjectConsent({
    userDb,
    subjectKey,
    subjectKeyVersion,
    expectedConsentRevision,
  });
  if (consentCheck.allowed === false) {
    throw new QueueJobExecutionError(
      consentCheck.code,
      `Queued research_event_ingest rejected by USER_DB consent gate: ${consentCheck.code}`,
      consentCheck.statusCode === 503,
    );
  }

  const validated: ValidatedResearchEvent[] = [];
  for (const item of rawEvents) {
    const check = validateAndMinimizeResearchEvent(item);
    if ('event' in check && check.ok) validated.push(check.event);
  }
  if (validated.length === 0) {
    throw new QueueJobExecutionError('INVALID_RESEARCH_EVENTS', 'Zero valid research events in queue payload', false);
  }
  const res = await writePseudonymizedEventsToResearchDb({
    researchDb,
    subjectKey,
    subjectKeyVersion,
    events: validated,
  });
  return {
    jobType: 'research_event_ingest',
    idempotencyKey: envelope.idempotencyKey,
    executedAtIso: new Date().toISOString(),
    affectedCount: res.acceptedCount,
    summary: { ...res, consentRevision: consentCheck.consentRevision },
  };
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
  const receiptSecret = env.INTERNAL_LIFECYCLE_RPC_SECRET;
  if (!isValidLifecycleReceiptSecret(receiptSecret)) {
    throw new QueueJobExecutionError(
      'INTERNAL_LIFECYCLE_RPC_SECRET_UNAVAILABLE',
      'A dedicated 32-byte hexadecimal lifecycle receipt secret is required.',
      false,
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

  if (params.cron === '30 0 * * *' || tehranClock.matchedScheduleTask === 'morning_market_and_d1_sync') {
    return [
      makeEnvelope('firestore_d1_projection_sync', 'morning_sync'),
      makeEnvelope('expired_chunk_upload_session_cleanup', 'morning_cleanup'),
    ];
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
