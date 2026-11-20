/**
 * @file worker/queues/jobDispatcher.ts
 * @description Real canonical Cloudflare Queue job dispatcher and Cron envelope builder.
 * Every registered job executes durable, verifiable work against D1/R2/KV bindings.
 * Zero no-op handlers, zero silent ACKs on missing dependencies.
 */
import { getValidatedCityConfig } from '../../src/data/multiCityData';
import type { CityId } from '../../src/types/models';
import { upsertNeighborhoodProjectionD1 } from '../db/d1SchemaAndMigrations';
import { isObjectUnderLegalHold } from '../storage/r2StorageAdapter';
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
  if (!env.DB) {
    throw new QueueJobExecutionError(
      'D1_BINDING_UNAVAILABLE',
      'D1 database binding (DB) is required for firestore_d1_projection_sync',
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
      await upsertNeighborhoodProjectionD1(env.DB, {
        city_id: cityId,
        hood_id: hood.id,
        name_fa: hood.name,
        district,
        buy_per_sqm_million: hood.buyPerSqm,
        deal_per_sqm_million: dealPerSqm,
        rahn_80m_million: hood.rahn80m,
        aqi: hood.aqi ?? 80,
        investment_score: hood.growthScore ?? 75,
        firestore_version_iso: nowIso,
        projected_at_iso: nowIso,
      });
      syncedRows += 1;
    }

    await env.DB
      .prepare('INSERT OR REPLACE INTO sync_watermarks (watermark_key, watermark_value, updated_at_iso) VALUES (?1, ?2, ?3)')
      .bind(`d1_projection_sync:${cityId}`, String(sliceLimit), nowIso)
      .run();
  }

  await env.DB
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
  if (!env.DB) {
    throw new QueueJobExecutionError(
      'D1_BINDING_UNAVAILABLE',
      'D1 database binding (DB) is required for expired_chunk_upload_session_cleanup',
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

  const expiredRes = await env.DB
    .prepare('SELECT session_id FROM upload_sessions WHERE created_at_ms < ?1')
    .bind(cutoffMs)
    .all<{ session_id: string }>();

  const expiredIds = (expiredRes.results ?? []).map((r) => r.session_id);
  for (const sid of expiredIds) {
    await env.DB.prepare('DELETE FROM upload_session_chunks WHERE session_id = ?1').bind(sid).run();
    await env.DB.prepare('DELETE FROM upload_sessions WHERE session_id = ?1').bind(sid).run();
  }

  await env.DB
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
  if (!env.DB || !env.MEDIA_BUCKET) {
    throw new QueueJobExecutionError(
      'STORAGE_OR_DB_BINDING_UNAVAILABLE',
      'Both DB and MEDIA_BUCKET bindings are required for r2_orphan_media_reconcile',
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
  const staleObjects = await env.DB
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
    const hold = await isObjectUnderLegalHold(env.DB, obj.object_id);
    const hasRetentionLock = Boolean(obj.retention_until && Date.parse(obj.retention_until) > nowMs);
    if (hold.held || obj.legal_hold === 1 || hasRetentionLock) {
      skippedLegalHoldCount += 1;
      continue;
    }
    await env.MEDIA_BUCKET.delete(obj.storage_key);
    await env.DB
      .prepare(
        'UPDATE media_objects SET lifecycle_state = ?1, deletion_state = ?2, updated_at_iso = ?3, deleted_at_iso = ?4 WHERE object_id = ?5',
      )
      .bind('DELETED', 'PHYSICALLY_DELETED', nowIso, nowIso, obj.object_id)
      .run();
    deletedCount += 1;
  }

  // 2. Scan R2 objects under listings/ not tracked as active in D1
  const knownActiveRes = await env.DB
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
    const hold = await isObjectUnderLegalHold(env.DB, maybeObjectId);
    if (hold.held) {
      skippedLegalHoldCount += 1;
      continue;
    }
    await env.MEDIA_BUCKET.delete(r2Obj.key);
    deletedCount += 1;
  }

  await env.DB
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
  if (!env.DB || !env.MEDIA_BUCKET) {
    throw new QueueJobExecutionError(
      'STORAGE_OR_DB_BINDING_UNAVAILABLE',
      'Both DB and MEDIA_BUCKET bindings are required for telemetry_archive_flush',
      true,
    );
  }
  const nowIso = new Date().toISOString();
  const datePart = nowIso.slice(0, 10);
  const safeIdem = envelope.idempotencyKey.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const archiveKey = `telemetry-archives/${datePart}/${safeIdem}.json`;

  const watermarks = await env.DB
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

  await env.DB
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
    if (!validated.valid) {
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
