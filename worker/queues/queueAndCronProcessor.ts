/**
 * @file worker/queues/queueAndCronProcessor.ts
 * @description Durable Cloudflare Queue batch processor with D1 lease-based state machine,
 * strict ACK-after-commit & fail-closed DLQ routing, and UTC-to-Asia/Tehran Cron wall-clock resolver.
 */
import type { D1Database, MessageBatch, Queue } from '../types';

export type RadarQueueJobType =
  | 'firestore_d1_projection_sync'
  | 'r2_orphan_media_reconcile'
  | 'expired_chunk_upload_session_cleanup'
  | 'telemetry_archive_flush'
  | 'research_event_ingest'
  | 'research_subject_erasure'
  | 'research_retention_purge';

export interface RadarQueueEnvelope<TPayload = Record<string, unknown>> {
  schemaVersion: '1.0';
  messageId: string;
  idempotencyKey: string;
  jobType: RadarQueueJobType;
  createdAtIso: string;
  correlationId: string;
  payload: TPayload;
}

export interface QueueBatchProcessSummary {
  processedCount: number;
  deduplicatedCount: number;
  retriedCount: number;
  deadLetteredCount: number;
  failedCount: number;
}

export const VALID_JOB_TYPES = new Set<RadarQueueJobType>([
  'firestore_d1_projection_sync',
  'r2_orphan_media_reconcile',
  'expired_chunk_upload_session_cleanup',
  'telemetry_archive_flush',
  'research_event_ingest',
  'research_subject_erasure',
  'research_retention_purge',
]);

export const DEFAULT_JOB_LEASE_DURATION_MS = 60_000;

export function validateQueueEnvelope(raw: unknown):
  | { valid: true; envelope: RadarQueueEnvelope }
  | { valid: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, reason: 'ENVELOPE_NOT_OBJECT' };
  }
  const rec = raw as Record<string, unknown>;
  if (rec.schemaVersion !== '1.0') return { valid: false, reason: 'UNSUPPORTED_SCHEMA_VERSION' };
  if (typeof rec.messageId !== 'string' || rec.messageId.trim().length < 4 || rec.messageId.length > 128) {
    return { valid: false, reason: 'INVALID_MESSAGE_ID' };
  }
  if (typeof rec.idempotencyKey !== 'string' || rec.idempotencyKey.trim().length < 4 || rec.idempotencyKey.length > 160) {
    return { valid: false, reason: 'INVALID_IDEMPOTENCY_KEY' };
  }
  if (typeof rec.jobType !== 'string' || !VALID_JOB_TYPES.has(rec.jobType as RadarQueueJobType)) {
    return { valid: false, reason: 'UNKNOWN_OR_UNSUPPORTED_JOB_TYPE' };
  }
  if (typeof rec.createdAtIso !== 'string' || Number.isNaN(Date.parse(rec.createdAtIso))) {
    return { valid: false, reason: 'INVALID_CREATED_AT_ISO' };
  }
  if (typeof rec.correlationId !== 'string' || rec.correlationId.trim().length < 4 || rec.correlationId.length > 128) {
    return { valid: false, reason: 'INVALID_CORRELATION_ID' };
  }
  if (rec.payload !== undefined && (typeof rec.payload !== 'object' || rec.payload === null || Array.isArray(rec.payload))) {
    return { valid: false, reason: 'INVALID_PAYLOAD_OBJECT' };
  }
  return {
    valid: true,
    envelope: {
      schemaVersion: '1.0',
      messageId: rec.messageId.trim(),
      idempotencyKey: rec.idempotencyKey.trim(),
      jobType: rec.jobType as RadarQueueJobType,
      createdAtIso: rec.createdAtIso,
      correlationId: rec.correlationId.trim(),
      payload: (rec.payload as Record<string, unknown>) ?? {},
    },
  };
}

export function computeQueueRetryDelaySeconds(attempts: number): number {
  const safeAttempts = Math.max(1, Math.min(10, Math.trunc(attempts || 1)));
  return Math.min(900, 15 * Math.pow(2, safeAttempts - 1));
}

function classifyExecutionError(err: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; retryable?: unknown; message?: unknown };
    const message = typeof e.message === 'string' ? e.message.slice(0, 300) : String(err).slice(0, 300);
    if (typeof e.retryable === 'boolean') {
      return {
        code: typeof e.code === 'string' && e.code ? e.code : e.retryable ? 'RETRYABLE_ERROR' : 'PERMANENT_ERROR',
        message,
        retryable: e.retryable,
      };
    }
    if (/PERMANENT|UNSUPPORTED_JOB_TYPE|INVALID_.*PAYLOAD|FORBIDDEN|UNAUTHORIZED/i.test(message)) {
      return { code: 'PERMANENT_EXECUTION_ERROR', message, retryable: false };
    }
    return { code: 'TRANSIENT_EXECUTION_ERROR', message, retryable: true };
  }
  return {
    code: 'TRANSIENT_EXECUTION_ERROR',
    message: String(err || 'UNKNOWN_QUEUE_ERROR').slice(0, 300),
    retryable: true,
  };
}

async function routeToDlqFailClosed(params: {
  dlq: Queue | undefined;
  record: Record<string, unknown>;
  onDurableDeadLetterRecorded?: () => Promise<void>;
}): Promise<boolean> {
  if (!params.dlq) {
    return false;
  }
  try {
    await params.dlq.send(params.record);
    if (params.onDurableDeadLetterRecorded) {
      await params.onDurableDeadLetterRecorded();
    }
    return true;
  } catch {
    return false;
  }
}

export async function processRadarQueueBatch(params: {
  batch: MessageBatch<unknown>;
  db?: D1Database;
  dlq?: Queue;
  maxRetries?: number;
  leaseDurationMs?: number;
  leaseOwner?: string;
  nowMs?: number;
  executeJob: (envelope: RadarQueueEnvelope) => Promise<unknown>;
}): Promise<QueueBatchProcessSummary> {
  const requestedMaxRetries = Number(params.maxRetries ?? 3);
  const maxRetries = Number.isSafeInteger(requestedMaxRetries)
    ? Math.max(1, Math.min(10, requestedMaxRetries))
    : 3;
  const requestedLeaseDurationMs = Number(params.leaseDurationMs ?? DEFAULT_JOB_LEASE_DURATION_MS);
  const leaseDurationMs = Number.isFinite(requestedLeaseDurationMs)
    ? Math.max(5_000, Math.min(10 * 60_000, requestedLeaseDurationMs))
    : DEFAULT_JOB_LEASE_DURATION_MS;
  const suppliedNowMs = params.nowMs ?? Date.now();
  const batchNowMs = Number.isFinite(suppliedNowMs) ? Number(suppliedNowMs) : Date.now();
  let processedCount = 0;
  let deduplicatedCount = 0;
  let retriedCount = 0;
  let deadLetteredCount = 0;
  let failedCount = 0;

  for (const msg of params.batch.messages) {
    const nowMs = batchNowMs;
    const nowIso = new Date(nowMs).toISOString();
    const validation = validateQueueEnvelope(msg.body);

    if (!validation.valid) {
      const forwarded = await routeToDlqFailClosed({
        dlq: params.dlq,
        record: {
          deadLetterReason: validation.reason,
          originalMessageId: msg.id,
          attempts: msg.attempts,
          failedAtIso: nowIso,
          rawBody: msg.body,
        },
      });
      if (forwarded) {
        msg.ack();
        deadLetteredCount += 1;
      } else {
        // Fail-closed: NEVER silently ACK a poison message when DLQ is absent or unreachable
        msg.retry({ delaySeconds: computeQueueRetryDelaySeconds(msg.attempts) });
        retriedCount += 1;
        failedCount += 1;
      }
      continue;
    }

    const envelope = validation.envelope;

    // Fail-closed: durable D1 execution state is mandatory before executing or ACKing
    if (!params.db) {
      msg.retry({ delaySeconds: computeQueueRetryDelaySeconds(msg.attempts) });
      retriedCount += 1;
      failedCount += 1;
      continue;
    }

    const leaseOwner = params.leaseOwner || `worker_${msg.id}_${nowMs}_${crypto.randomUUID().slice(0, 8)}`;
    const leaseExpiresAtMs = nowMs + leaseDurationMs;

    try {
      // 1. Ensure durable row exists (PENDING)
      const ensureJobRes = await params.db
        .prepare(
          `INSERT OR IGNORE INTO queue_job_executions (
            idempotency_key, job_type, message_id, correlation_id, status, attempt_count,
            lease_owner, lease_expires_at_ms, created_at_iso, updated_at_iso
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
        )
        .bind(
          envelope.idempotencyKey,
          envelope.jobType,
          envelope.messageId,
          envelope.correlationId,
          'PENDING',
          0,
          null,
          null,
          nowIso,
          nowIso,
        )
        .run();
      if (!ensureJobRes.success) throw new Error('QUEUE_EXECUTION_ROW_CREATE_FAILED');

      // 2. Inspect current durable state
      const existing = await params.db
        .prepare('SELECT * FROM queue_job_executions WHERE idempotency_key = ?1')
        .bind(envelope.idempotencyKey)
        .first<{ status: string; lease_owner: string | null; lease_expires_at_ms: number | null }>();

      if (existing?.status === 'COMPLETED') {
        msg.ack();
        deduplicatedCount += 1;
        continue;
      }

      if (existing?.status === 'PERMANENT_FAILURE') {
        const forwarded = await routeToDlqFailClosed({
          dlq: params.dlq,
          record: {
            deadLetterReason: 'ALREADY_PERMANENT_FAILURE',
            envelope,
            attempts: msg.attempts,
            failedAtIso: nowIso,
          },
        });
        if (forwarded) {
          msg.ack();
          deadLetteredCount += 1;
        } else {
          msg.retry({ delaySeconds: computeQueueRetryDelaySeconds(msg.attempts) });
          retriedCount += 1;
          failedCount += 1;
        }
        continue;
      }

      // 3. Atomic lease claim: PENDING / RETRYABLE_FAILURE / expired PROCESSING lease
      const claimRes = await params.db
        .prepare(
          `UPDATE queue_job_executions SET status = 'PROCESSING', attempt_count = attempt_count + 1, lease_owner = ?1, lease_expires_at_ms = ?2, updated_at_iso = ?3 WHERE idempotency_key = ?4 AND (status IN ('PENDING', 'RETRYABLE_FAILURE') OR (status = 'PROCESSING' AND (lease_expires_at_ms IS NULL OR lease_expires_at_ms <= ?5)))`,
        )
        .bind(leaseOwner, leaseExpiresAtMs, nowIso, envelope.idempotencyKey, nowMs)
        .run();

      const claimedChanges = claimRes.meta?.changes ?? 0;
      if (!claimRes.success || claimedChanges !== 1) {
        // Active unexpired lease held by another concurrent consumer: retry later without duplicate work
        msg.retry({ delaySeconds: 15 });
        retriedCount += 1;
        continue;
      }
    } catch {
      // D1 read/write failed before execution -> fail closed via retry (NEVER ACK)
      msg.retry({ delaySeconds: computeQueueRetryDelaySeconds(msg.attempts) });
      retriedCount += 1;
      failedCount += 1;
      continue;
    }

    // 4. Execute real job handler while holding lease
    try {
      const result = await params.executeJob(envelope);
      const completedAtIso = new Date().toISOString();
      const serializedResult = result !== undefined ? JSON.stringify(result).slice(0, 4096) : null;

      // 5. Durable commit BEFORE ACK
      const commitRes = await params.db
        .prepare(
          `UPDATE queue_job_executions SET status = 'COMPLETED', lease_owner = NULL, lease_expires_at_ms = NULL, result_json = ?1, last_error_code = NULL, last_error_message = NULL, updated_at_iso = ?2, completed_at_iso = ?3 WHERE idempotency_key = ?4 AND lease_owner = ?5`,
        )
        .bind(serializedResult, completedAtIso, completedAtIso, envelope.idempotencyKey, leaseOwner)
        .run();

      if (!commitRes.success || (commitRes.meta?.changes ?? 0) !== 1) {
        // Lease was lost or superseded; retry instead of silently ACKing
        msg.retry({ delaySeconds: computeQueueRetryDelaySeconds(msg.attempts) });
        retriedCount += 1;
        failedCount += 1;
        continue;
      }

      // Mirror completion to legacy queue_idempotency_keys for diagnostic continuity
      await params.db
        .prepare(
          'INSERT OR REPLACE INTO queue_idempotency_keys (idempotency_key, job_type, processed_at_iso, status) VALUES (?1, ?2, ?3, ?4)',
        )
        .bind(envelope.idempotencyKey, envelope.jobType, completedAtIso, 'COMPLETED')
        .run();

      msg.ack();
      processedCount += 1;
    } catch (err) {
      const classified = classifyExecutionError(err);
      const errNowIso = new Date().toISOString();
      const shouldDeadLetter = !classified.retryable || msg.attempts >= maxRetries;

      if (shouldDeadLetter) {
        const forwarded = await routeToDlqFailClosed({
          dlq: params.dlq,
          record: {
            deadLetterReason: !classified.retryable ? 'PERMANENT_FAILURE' : 'MAX_RETRIES_EXCEEDED',
            errorCode: classified.code,
            errorMessage: classified.message,
            envelope,
            attempts: msg.attempts,
            failedAtIso: errNowIso,
          },
          onDurableDeadLetterRecorded: async () => {
            const deadLetterState = await params.db!
              .prepare(
                'UPDATE queue_job_executions SET status = ?1, last_error_code = ?2, last_error_message = ?3, lease_owner = NULL, lease_expires_at_ms = NULL, updated_at_iso = ?4 WHERE idempotency_key = ?5',
              )
              .bind('PERMANENT_FAILURE', classified.code, classified.message, errNowIso, envelope.idempotencyKey)
              .run();
            if (!deadLetterState.success || (deadLetterState.meta?.changes ?? 0) !== 1) {
              throw new Error('QUEUE_DURABLE_DEAD_LETTER_STATE_WRITE_FAILED');
            }
            await params.db!
              .prepare(
                'INSERT OR REPLACE INTO queue_idempotency_keys (idempotency_key, job_type, processed_at_iso, status) VALUES (?1, ?2, ?3, ?4)',
              )
              .bind(envelope.idempotencyKey, envelope.jobType, errNowIso, 'DEAD_LETTERED')
              .run();
          },
        });

        if (forwarded) {
          msg.ack();
          deadLetteredCount += 1;
        } else {
          // DLQ missing or failed OR D1 state write failed -> fail closed via retry (NEVER silent ACK)
          await params.db
            .prepare(
              'UPDATE queue_job_executions SET status = ?1, last_error_code = ?2, last_error_message = ?3, lease_owner = NULL, lease_expires_at_ms = NULL, updated_at_iso = ?4 WHERE idempotency_key = ?5',
            )
            .bind('RETRYABLE_FAILURE', 'DLQ_DELIVERY_FAILED', classified.message, errNowIso, envelope.idempotencyKey)
            .run()
            .catch(() => {});
          msg.retry({ delaySeconds: computeQueueRetryDelaySeconds(msg.attempts) });
          retriedCount += 1;
        }
        failedCount += 1;
      } else {
        await params.db
          .prepare(
            'UPDATE queue_job_executions SET status = ?1, last_error_code = ?2, last_error_message = ?3, lease_owner = NULL, lease_expires_at_ms = NULL, updated_at_iso = ?4 WHERE idempotency_key = ?5',
          )
          .bind('RETRYABLE_FAILURE', classified.code, classified.message, errNowIso, envelope.idempotencyKey)
          .run()
          .catch(() => {});
        msg.retry({ delaySeconds: computeQueueRetryDelaySeconds(msg.attempts) });
        retriedCount += 1;
        failedCount += 1;
      }
    }
  }

  return {
    processedCount,
    deduplicatedCount,
    retriedCount,
    deadLetteredCount,
    failedCount,
  };
}

/**
 * Converts a Cloudflare UTC cron trigger timestamp into Iran Standard Time (UTC+03:30, fixed no-DST since 1401).
 * 00:30 UTC -> 04:00 Asia/Tehran; 18:30 UTC -> 22:00 Asia/Tehran.
 */
export function convertUtcScheduledTimeToTehranWallClock(scheduledTimeMs: number): {
  utcIso: string;
  tehranHour: number;
  tehranMinute: number;
  tehranFormatted: string;
  matchedScheduleTask: 'morning_market_and_d1_sync' | 'nightly_orphan_and_telemetry_flush' | 'ad_hoc_maintenance';
} {
  const tehranOffsetMs = (3 * 60 + 30) * 60 * 1000;
  const tehranDate = new Date(scheduledTimeMs + tehranOffsetMs);
  const hour = tehranDate.getUTCHours();
  const minute = tehranDate.getUTCMinutes();
  const tehranFormatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} Asia/Tehran`;

  let matchedScheduleTask: 'morning_market_and_d1_sync' | 'nightly_orphan_and_telemetry_flush' | 'ad_hoc_maintenance' =
    'ad_hoc_maintenance';
  if (hour === 4 && minute === 0) {
    matchedScheduleTask = 'morning_market_and_d1_sync';
  } else if (hour === 22 && minute === 0) {
    matchedScheduleTask = 'nightly_orphan_and_telemetry_flush';
  }

  return {
    utcIso: new Date(scheduledTimeMs).toISOString(),
    tehranHour: hour,
    tehranMinute: minute,
    tehranFormatted,
    matchedScheduleTask,
  };
}
