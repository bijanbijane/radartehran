import type { D1Database, MessageBatch, Queue } from '../types';

export type RadarQueueJobType =
  | 'market_pulse_refresh'
  | 'firestore_d1_projection_sync'
  | 'r2_orphan_media_reconcile'
  | 'telegram_digest_broadcast'
  | 'telemetry_archive_flush';

export interface RadarQueueEnvelope {
  schemaVersion: '1.0';
  messageId: string;
  idempotencyKey: string;
  jobType: RadarQueueJobType;
  createdAtIso: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

const VALID_JOB_TYPES = new Set<RadarQueueJobType>([
  'market_pulse_refresh',
  'firestore_d1_projection_sync',
  'r2_orphan_media_reconcile',
  'telegram_digest_broadcast',
  'telemetry_archive_flush',
]);

export function validateQueueEnvelope(candidate: unknown): {
  valid: boolean;
  envelope?: RadarQueueEnvelope;
  errorCode?: string;
} {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { valid: false, errorCode: 'INVALID_QUEUE_MESSAGE_OBJECT' };
  }
  const obj = candidate as Record<string, unknown>;
  if (
    obj.schemaVersion !== '1.0' ||
    typeof obj.messageId !== 'string' ||
    obj.messageId.trim().length < 4 ||
    typeof obj.idempotencyKey !== 'string' ||
    obj.idempotencyKey.trim().length < 6 ||
    typeof obj.jobType !== 'string' ||
    !VALID_JOB_TYPES.has(obj.jobType as RadarQueueJobType) ||
    typeof obj.createdAtIso !== 'string' ||
    typeof obj.correlationId !== 'string' ||
    !obj.payload ||
    typeof obj.payload !== 'object'
  ) {
    return { valid: false, errorCode: 'QUEUE_ENVELOPE_SCHEMA_MISMATCH' };
  }
  return { valid: true, envelope: obj as unknown as RadarQueueEnvelope };
}

export function computeQueueRetryDelaySeconds(attempts: number): number {
  const safeAttempt = Math.max(1, Math.min(10, Math.trunc(attempts) || 1));
  return Math.min(900, Math.pow(2, safeAttempt) * 5);
}

export async function processRadarQueueBatch(params: {
  batch: MessageBatch<unknown>;
  db?: D1Database;
  dlq?: Queue<unknown>;
  maxAttempts?: number;
  executeJob: (envelope: RadarQueueEnvelope) => Promise<void>;
}): Promise<{
  ackedCount: number;
  deduplicatedCount: number;
  retriedCount: number;
  deadLetteredCount: number;
}> {
  const maxAttempts = params.maxAttempts ?? 3;
  let ackedCount = 0;
  let deduplicatedCount = 0;
  let retriedCount = 0;
  let deadLetteredCount = 0;

  for (const msg of params.batch.messages) {
    const check = validateQueueEnvelope(msg.body);
    if (!check.valid || !check.envelope) {
      if (params.dlq) {
        await params.dlq.send({
          reason: check.errorCode || 'POISON_SCHEMA_MESSAGE',
          originalMessageId: msg.id,
          failedAtIso: new Date().toISOString(),
          rawBody: msg.body,
        });
      }
      msg.ack();
      deadLetteredCount += 1;
      continue;
    }

    const env = check.envelope;
    if (params.db) {
      const alreadyDone = await params.db
        .prepare('SELECT status FROM queue_idempotency_keys WHERE idempotency_key = ?1')
        .bind(env.idempotencyKey)
        .first<{ status: string }>();
      if (alreadyDone && alreadyDone.status === 'COMPLETED') {
        msg.ack();
        deduplicatedCount += 1;
        ackedCount += 1;
        continue;
      }
    }

    try {
      await params.executeJob(env);
      if (params.db) {
        await params.db
          .prepare(
            'INSERT OR REPLACE INTO queue_idempotency_keys (idempotency_key, job_type, processed_at_iso, status) VALUES (?1, ?2, ?3, ?4)',
          )
          .bind(env.idempotencyKey, env.jobType, new Date().toISOString(), 'COMPLETED')
          .run();
      }
      msg.ack();
      ackedCount += 1;
    } catch (err) {
      if (msg.attempts >= maxAttempts) {
        if (params.dlq) {
          await params.dlq.send({
            reason: err instanceof Error ? err.message : 'MAX_RETRIES_EXHAUSTED',
            envelope: env,
            attempts: msg.attempts,
            failedAtIso: new Date().toISOString(),
          });
        }
        msg.ack();
        deadLetteredCount += 1;
      } else {
        msg.retry({ delaySeconds: computeQueueRetryDelaySeconds(msg.attempts) });
        retriedCount += 1;
      }
    }
  }

  return { ackedCount, deduplicatedCount, retriedCount, deadLetteredCount };
}

/**
 * Iran Standard Time (IRST) is permanently UTC+03:30 year-round (DST abolished in 2023).
 * Cloudflare Cron Triggers always execute in UTC:
 * - "30 0 * * *" UTC -> 04:00 Asia/Tehran (morning market pulse & D1 projection refresh)
 * - "30 18 * * *" UTC -> 22:00 Asia/Tehran (nightly R2 orphan audit & telemetry archive flush)
 */
export function convertUtcScheduledTimeToTehranWallClock(scheduledTimeMs: number): {
  utcIso: string;
  tehranHour: number;
  tehranMinute: number;
  tehranFormatted: string;
  matchedScheduleTask: 'morning_market_and_d1_sync' | 'nightly_orphan_and_telemetry_flush' | 'ad_hoc_maintenance';
} {
  const tehranOffsetMs = (3 * 60 + 30) * 60 * 1000;
  const shifted = new Date(scheduledTimeMs + tehranOffsetMs);
  const tehranHour = shifted.getUTCHours();
  const tehranMinute = shifted.getUTCMinutes();
  const matchedScheduleTask =
    tehranHour === 4 && tehranMinute === 0
      ? 'morning_market_and_d1_sync'
      : tehranHour === 22 && tehranMinute === 0
        ? 'nightly_orphan_and_telemetry_flush'
        : 'ad_hoc_maintenance';

  return {
    utcIso: new Date(scheduledTimeMs).toISOString(),
    tehranHour,
    tehranMinute,
    tehranFormatted: `${String(tehranHour).padStart(2, '0')}:${String(tehranMinute).padStart(2, '0')} Asia/Tehran`,
    matchedScheduleTask,
  };
}
