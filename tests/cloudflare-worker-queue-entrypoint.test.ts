/**
 * @file tests/cloudflare-worker-queue-entrypoint.test.ts
 * @description Package 1 E2E Worker verification for `workerEntrypoint.queue()` and
 * `workerEntrypoint.scheduled()` using real `node:sqlite` D1 with all 3 canonical migrations.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import workerEntrypoint from '../worker/index';
import {
  D1_MIGRATIONS,
  runD1MigrationsIdempotently,
} from '../worker/db/d1SchemaAndMigrations';
import {
  convertUtcScheduledTimeToTehranWallClock,
  processRadarQueueBatch,
  type RadarQueueEnvelope,
} from '../worker/queues/queueAndCronProcessor';
import { createLocalR2BucketSimulator } from '../worker/storage/r2StorageAdapter';
import type { D1Database, D1PreparedStatement, MessageBatch, QueueMessage, WorkerEnv } from '../worker/types';

function createRealSqliteD1(): { db: D1Database; sqlite: DatabaseSync; setFailOnSqlContains: (value: string | null) => void } {
  const sqlite = new DatabaseSync(':memory:');
  let failOnSqlContains: string | null = null;
  const wrap = (sql: string, params: unknown[] = []): D1PreparedStatement => ({
    bind(...values: unknown[]) {
      return wrap(sql, values);
    },
    async first<T = Record<string, unknown>>(col?: string): Promise<T | null> {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...(params as never[])) as Record<string, unknown> | undefined;
      if (!row) return null;
      return (col ? row[col] : row) as T;
    },
    async all<T = Record<string, unknown>>() {
      const stmt = sqlite.prepare(sql);
      const rows = stmt.all(...(params as never[])) as T[];
      return { results: rows, success: true };
    },
    async run() {
      if (failOnSqlContains && sql.includes(failOnSqlContains)) {
        throw new Error(`INJECTED_SQL_FAILURE:${failOnSqlContains}`);
      }
      const stmt = sqlite.prepare(sql);
      const info = stmt.run(...(params as never[])) as { changes?: number | bigint };
      return { success: true, meta: { changes: Number(info.changes ?? 0) } };
    },
  });

  const db: D1Database = {
    prepare: (q: string) => wrap(q),
    async batch(stmts) {
      const out = [];
      for (const s of stmts) {
        const res = await s.run();
        out.push({ success: res.success });
      }
      return out;
    },
    async exec(q: string) {
      sqlite.exec(q);
      return { count: 1, duration: 1 };
    },
  };
  return { db, sqlite, setFailOnSqlContains: (value) => { failOnSqlContains = value; } };
}

function makeQueueMessage(body: RadarQueueEnvelope, attempts = 1, id = `msg-${Math.random().toString(36).slice(2, 8)}`) {
  let acked = false;
  let retried = false;
  let retryDelay: number | undefined;
  const msg: QueueMessage<RadarQueueEnvelope> = {
    id,
    timestamp: new Date(),
    body,
    attempts,
    ack() {
      acked = true;
    },
    retry(opts?: { delaySeconds?: number }) {
      retried = true;
      retryDelay = opts?.delaySeconds;
    },
  };
  return { msg, getState: () => ({ acked, retried, retryDelay }) };
}

async function setupMigratedEnv() {
  const { db, sqlite, setFailOnSqlContains } = createRealSqliteD1();
  const r2 = createLocalR2BucketSimulator();
  const sqlDir = path.resolve(process.cwd(), 'migrations/d1');
  for (const mig of D1_MIGRATIONS) {
    sqlite.exec(fs.readFileSync(path.join(sqlDir, mig.fileName), 'utf8'));
  }
  await runD1MigrationsIdempotently(db);
  const sentToQueue: RadarQueueEnvelope[] = [];
  const sentToDlq: unknown[] = [];
  const env: WorkerEnv = {
    ENVIRONMENT: 'staging',
    DB: db,
    MEDIA_BUCKET: r2,
    R2_MEDIA_BUCKET_NAME: 'radartehran-staging-media',
    RADAR_QUEUE: {
      async send(msg) {
        sentToQueue.push(msg as RadarQueueEnvelope);
      },
      async sendBatch(msgs) {
        for (const m of msgs) sentToQueue.push(m.body as RadarQueueEnvelope);
      },
    },
    RADAR_DLQ: {
      async send(msg) {
        sentToDlq.push(msg);
      },
      async sendBatch(msgs) {
        for (const m of msgs) sentToDlq.push(m.body);
      },
    },
  };
  return { db, sqlite, r2, env, sentToQueue, sentToDlq, setFailOnSqlContains };
}

describe('Package 1 E2E: Cloudflare Worker Queue & Cron Entrypoints', () => {
  it('1. scheduled() enqueues canonical UTC->Asia/Tehran envelopes and fails when RADAR_QUEUE missing', async () => {
    const { env, sentToQueue } = await setupMigratedEnv();
    await workerEntrypoint.scheduled(
      { cron: '30 0 * * *', scheduledTime: Date.UTC(2026, 4, 10, 0, 30, 0) },
      env,
    );
    assert.equal(sentToQueue.length, 2);
    assert.equal(sentToQueue[0].jobType, 'firestore_d1_projection_sync');
    assert.equal(sentToQueue[1].jobType, 'expired_chunk_upload_session_cleanup');

    await workerEntrypoint.scheduled(
      { cron: '30 18 * * *', scheduledTime: Date.UTC(2026, 4, 10, 18, 30, 0) },
      env,
    );
    assert.equal(sentToQueue.length, 5);
    assert.equal(sentToQueue[2].jobType, 'r2_orphan_media_reconcile');
    assert.equal(sentToQueue[3].jobType, 'telemetry_archive_flush');
    assert.equal(sentToQueue[4].jobType, 'expired_chunk_upload_session_cleanup');

    await workerEntrypoint.scheduled(
      { cron: '0 * * * *', scheduledTime: Date.UTC(2026, 4, 10, 10, 0, 0) },
      env,
    );
    assert.equal(sentToQueue.length, 6);
    assert.equal(sentToQueue[5].jobType, 'expired_chunk_upload_session_cleanup');

    await assert.rejects(
      () => workerEntrypoint.scheduled({ cron: '0 * * * *', scheduledTime: Date.now() }, { ENVIRONMENT: 'staging' }),
      /RADAR_QUEUE_BINDING_MISSING/,
    );
  });

  it('2. queue() executes all 4 canonical jobs end-to-end, writes D1 leases, and deduplicates replays', async () => {
    const { db, r2, env, sentToDlq } = await setupMigratedEnv();

    // Seed expired upload session for expired upload-session cleanup and orphan media for r2_orphan_media_reconcile
    const oldMs = Date.now() - 48 * 60 * 60 * 1000;
    await db
      .prepare(
        `INSERT INTO upload_sessions (session_id, owner_uid, city_id, hood_id, media_type, mime_type, file_name, total_chunks, max_bytes, received_bytes, completed, created_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
      )
      .bind('upl_expired_1', 'u1', 'tehran', 1, 'image', 'image/webp', 'old.webp', 1, 1024, 0, 0, oldMs)
      .run();

    await r2.put('tehran/1/image/orphan-1.webp', new Uint8Array([1, 2, 3, 4]));
    const staleIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await db
      .prepare(
        `INSERT INTO media_objects (object_id, owner_uid, bucket_name, storage_key, city_id, hood_id, media_type, mime_type, size_bytes, sha256_checksum, lifecycle_state, deletion_state, legal_hold, created_at_iso, updated_at_iso)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
      )
      .bind('obj-stale-1', 'u1', 'radartehran-staging-media', 'tehran/1/image/orphan-1.webp', 'tehran', 1, 'image', 'image/webp', 4, 'a'.repeat(64), 'FAILED_UPLOAD', 'ACTIVE', 0, staleIso, staleIso)
      .run();

    const nowIso = new Date().toISOString();
    const envelopes: RadarQueueEnvelope[] = [
      { schemaVersion: '1.0', messageId: 'msg-mp-1', jobType: 'firestore_d1_projection_sync', idempotencyKey: 'idem-mp-1', correlationId: 'corr-mp-1', createdAtIso: nowIso, payload: { city: 'tehran', maxNeighborhoodsPerCity: 1 } },
      { schemaVersion: '1.0', messageId: 'msg-gc-1', jobType: 'expired_chunk_upload_session_cleanup', idempotencyKey: 'idem-gc-1', correlationId: 'corr-gc-1', createdAtIso: nowIso, payload: {} },
      { schemaVersion: '1.0', messageId: 'msg-rec-1', jobType: 'r2_orphan_media_reconcile', idempotencyKey: 'idem-rec-1', correlationId: 'corr-rec-1', createdAtIso: nowIso, payload: {} },
      { schemaVersion: '1.0', messageId: 'msg-proj-1', jobType: 'telemetry_archive_flush', idempotencyKey: 'idem-proj-1', correlationId: 'corr-proj-1', createdAtIso: nowIso, payload: { cityId: 'tehran', hoodId: 1, buyPerSqmMillion: 120, dealPerSqmMillion: 112, rahn80mMillion: 1500, aqi: 75, investmentScore: 81 } },
    ];

    const wrapped = envelopes.map((e) => makeQueueMessage(e));
    const batch: MessageBatch<RadarQueueEnvelope> = {
      queue: 'radartehran-jobs',
      messages: wrapped.map((w) => w.msg),
      ackAll() {},
      retryAll() {},
    };

    await workerEntrypoint.queue(batch, env);

    for (const w of wrapped) {
      assert.equal(w.getState().acked, true);
      assert.equal(w.getState().retried, false);
    }
    assert.equal(sentToDlq.length, 0);

    // Verify upload session was purged & orphan deleted from R2
    const goneSess = await db.prepare('SELECT * FROM upload_sessions WHERE session_id = ?1').bind('upl_expired_1').first();
    assert.equal(goneSess, null);
    assert.equal(await r2.head('tehran/1/image/orphan-1.webp'), null);

    // Verify all 4 jobs recorded COMPLETED in queue_job_executions
    for (const e of envelopes) {
      const execRow = await db
        .prepare('SELECT status, attempt_count FROM queue_job_executions WHERE idempotency_key = ?1')
        .bind(e.idempotencyKey)
        .first<{ status: string; attempt_count: number }>();
      assert.equal(execRow?.status, 'COMPLETED');
      assert.equal(execRow?.attempt_count, 1);
    }

    // Replaying same idempotencyKey deduplicates cleanly without re-running (attempt_count stays 1)
    const replay = makeQueueMessage(envelopes[0]);
    await workerEntrypoint.queue({ queue: 'radartehran-jobs', messages: [replay.msg], ackAll() {}, retryAll() {} }, env);
    assert.equal(replay.getState().acked, true);
    const afterReplay = await db
      .prepare('SELECT attempt_count FROM queue_job_executions WHERE idempotency_key = ?1')
      .bind('idem-mp-1')
      .first<{ attempt_count: number }>();
    assert.equal(afterReplay?.attempt_count, 1);
  });

  it('bounds expired upload-session cleanup to the configured batch size', async () => {
    const { db, env } = await setupMigratedEnv();
    const nowMs = Date.now();
    for (const id of ['upl-bounded-1', 'upl-bounded-2', 'upl-bounded-3']) {
      await db
        .prepare(
          `INSERT INTO upload_sessions (session_id, owner_uid, city_id, hood_id, media_type, mime_type, file_name, total_chunks, max_bytes, received_bytes, completed, created_at_ms)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
        )
        .bind(id, 'u-bounded', 'tehran', 1, 'image', 'image/webp', `${id}.webp`, 1, 1024, 1, 0, nowMs - 60_000)
        .run();
      await db
        .prepare('INSERT INTO upload_session_chunks (session_id, chunk_index, chunk_base64, byte_length) VALUES (?1, ?2, ?3, ?4)')
        .bind(id, 0, 'AQID', 3)
        .run();
    }

    const envelope: RadarQueueEnvelope = {
      schemaVersion: '1.0',
      messageId: 'msg-bounded-cleanup',
      jobType: 'expired_chunk_upload_session_cleanup',
      idempotencyKey: 'idem-bounded-cleanup',
      correlationId: 'corr-bounded-cleanup',
      createdAtIso: new Date(nowMs).toISOString(),
      payload: { nowMs, ttlMs: 1_000, maxSessions: 2 },
    };
    const wrapped = makeQueueMessage(envelope);
    await workerEntrypoint.queue(
      { queue: 'radartehran-jobs', messages: [wrapped.msg], ackAll() {}, retryAll() {} },
      env,
    );

    assert.equal(wrapped.getState().acked, true);
    const remaining = await db
      .prepare('SELECT session_id FROM upload_sessions ORDER BY session_id')
      .all<{ session_id: string }>();
    assert.deepEqual((remaining.results ?? []).map((row) => row.session_id), ['upl-bounded-3']);
    const remainingChunks = await db
      .prepare('SELECT COUNT(*) AS count FROM upload_session_chunks')
      .first<{ count: number }>();
    assert.equal(Number(remainingChunks?.count ?? 0), 1);
    const watermark = await db
      .prepare("SELECT watermark_value FROM sync_watermarks WHERE watermark_key = 'expired_chunk_upload_session_cleanup:last_run'")
      .first<{ watermark_value: string }>();
    assert.equal(watermark?.watermark_value, '2');
  });

  it('does not rerun committed work when the legacy idempotency mirror write fails', async () => {
    const { db, env, setFailOnSqlContains } = await setupMigratedEnv();
    const envelope: RadarQueueEnvelope = {
      schemaVersion: '1.0',
      messageId: 'msg-mirror-failure-1',
      jobType: 'expired_chunk_upload_session_cleanup',
      idempotencyKey: 'idem-mirror-failure-1',
      correlationId: 'corr-mirror-failure-1',
      createdAtIso: new Date().toISOString(),
      payload: {},
    };
    let executions = 0;
    setFailOnSqlContains('INSERT OR REPLACE INTO queue_idempotency_keys');

    const first = makeQueueMessage(envelope);
    await processRadarQueueBatch({
      batch: { queue: 'radartehran-jobs', messages: [first.msg], ackAll() {}, retryAll() {} },
      db,
      dlq: env.RADAR_DLQ,
      executeJob: async () => { executions += 1; return { ok: true }; },
    });

    assert.equal(first.getState().acked, true);
    assert.equal(first.getState().retried, false);
    const committed = await db.prepare(
      'SELECT status, attempt_count FROM queue_job_executions WHERE idempotency_key = ?1',
    ).bind(envelope.idempotencyKey).first<{ status: string; attempt_count: number }>();
    assert.equal(committed?.status, 'COMPLETED');
    assert.equal(committed?.attempt_count, 1);

    setFailOnSqlContains(null);
    const replay = makeQueueMessage(envelope, 2);
    await processRadarQueueBatch({
      batch: { queue: 'radartehran-jobs', messages: [replay.msg], ackAll() {}, retryAll() {} },
      db,
      dlq: env.RADAR_DLQ,
      executeJob: async () => { executions += 1; return { ok: true }; },
    });
    assert.equal(replay.getState().acked, true);
    assert.equal(executions, 1, 'A completed canonical job must not execute again.');
  });

  it('dead-letters idempotency-key reuse across different jobs instead of dropping unrelated work', async () => {
    const { db, env, sentToDlq } = await setupMigratedEnv();
    let executions = 0;
    const original: RadarQueueEnvelope = {
      schemaVersion: '1.0',
      messageId: 'msg-idem-original',
      jobType: 'expired_chunk_upload_session_cleanup',
      idempotencyKey: 'idem-cross-job-conflict',
      correlationId: 'corr-original',
      createdAtIso: new Date().toISOString(),
      payload: {},
    };
    const first = makeQueueMessage(original);
    await processRadarQueueBatch({
      batch: { queue: 'radartehran-jobs', messages: [first.msg], ackAll() {}, retryAll() {} },
      db,
      dlq: env.RADAR_DLQ,
      executeJob: async () => { executions += 1; return { ok: true }; },
    });
    assert.equal(first.getState().acked, true);

    const conflicting: RadarQueueEnvelope = {
      ...original,
      messageId: 'msg-idem-conflicting',
      jobType: 'research_retention_purge',
      correlationId: 'corr-conflicting',
    };
    const second = makeQueueMessage(conflicting);
    await processRadarQueueBatch({
      batch: { queue: 'radartehran-jobs', messages: [second.msg], ackAll() {}, retryAll() {} },
      db,
      dlq: env.RADAR_DLQ,
      executeJob: async () => { executions += 1; return { ok: true }; },
    });

    assert.equal(second.getState().acked, true);
    assert.equal(executions, 1, 'Conflicting idempotency-key reuse must not execute.');
    assert.equal(sentToDlq.length, 1);
    assert.equal((sentToDlq[0] as { deadLetterReason?: string }).deadLetterReason, 'IDEMPOTENCY_KEY_CONFLICT');
  });

  it('does not rerun a terminally failed job when DLQ delivery temporarily fails', async () => {
    const { db, env } = await setupMigratedEnv();
    let executions = 0;
    let dlqAttempts = 0;
    const retryableDlq = {
      async send() {
        dlqAttempts += 1;
        if (dlqAttempts === 1) throw new Error('DLQ_TEMPORARY_UNAVAILABLE');
      },
      async sendBatch() {},
    };
    const envWithDlq = { ...env, RADAR_DLQ: retryableDlq };
    const envelope: RadarQueueEnvelope = {
      schemaVersion: '1.0',
      messageId: 'msg-terminal-dlq-1',
      jobType: 'expired_chunk_upload_session_cleanup',
      idempotencyKey: 'idem-terminal-dlq-1',
      correlationId: 'corr-terminal-dlq-1',
      createdAtIso: new Date().toISOString(),
      payload: {},
    };

    const first = makeQueueMessage(envelope, 1);
    await processRadarQueueBatch({
      batch: { queue: 'radartehran-jobs', messages: [first.msg], ackAll() {}, retryAll() {} },
      db,
      dlq: envWithDlq.RADAR_DLQ,
      maxRetries: 1,
      executeJob: async () => {
        executions += 1;
        throw new Error('PERMANENT_VALIDATION_FAILURE');
      },
    });
    assert.equal(first.getState().acked, false);
    assert.equal(first.getState().retried, true);
    const terminal = await db.prepare(
      'SELECT status FROM queue_job_executions WHERE idempotency_key = ?1',
    ).bind(envelope.idempotencyKey).first<{ status: string }>();
    assert.equal(terminal?.status, 'PERMANENT_FAILURE');

    const replay = makeQueueMessage(envelope, 2);
    await processRadarQueueBatch({
      batch: { queue: 'radartehran-jobs', messages: [replay.msg], ackAll() {}, retryAll() {} },
      db,
      dlq: envWithDlq.RADAR_DLQ,
      maxRetries: 1,
      executeJob: async () => {
        executions += 1;
        throw new Error('PERMANENT_VALIDATION_FAILURE');
      },
    });
    assert.equal(replay.getState().acked, true);
    assert.equal(executions, 1, 'A terminal job must retry DLQ delivery without rerunning its handler.');
    assert.equal(dlqAttempts, 2);
  });

  it('3. handles retryable errors, terminal DLQ routing, poison unknown jobs, stale lease takeover, and missing D1 fail-closed', async () => {
    const { db, env, sentToDlq } = await setupMigratedEnv();

    const nowIso = new Date().toISOString();
    // Missing D1 -> fails closed (retries, never acks)
    const noDbMsg = makeQueueMessage({
      schemaVersion: '1.0',
      messageId: 'msg-nodb-1',
      jobType: 'expired_chunk_upload_session_cleanup',
      idempotencyKey: 'idem-nodb-1',
      correlationId: 'corr-nodb',
      createdAtIso: nowIso,
      payload: {},
    });
    await workerEntrypoint.queue({ queue: 'radartehran-jobs', messages: [noDbMsg.msg], ackAll() {}, retryAll() {} }, { ENVIRONMENT: 'staging' });
    assert.equal(noDbMsg.getState().acked, false);
    assert.equal(noDbMsg.getState().retried, true);

    // Unknown/poison job -> routed to DLQ and acked
    const poisonMsg = makeQueueMessage({
      schemaVersion: '1.0',
      messageId: 'msg-poison-1',
      jobType: 'unknown_evil_job' as RadarQueueEnvelope['jobType'],
      idempotencyKey: 'idem-poison-1',
      correlationId: 'corr-poison',
      createdAtIso: nowIso,
      payload: {},
    });
    await workerEntrypoint.queue({ queue: 'radartehran-jobs', messages: [poisonMsg.msg], ackAll() {}, retryAll() {} }, env);
    assert.equal(poisonMsg.getState().acked, true);
    assert.equal(sentToDlq.length, 1);

    // Retryable failure on attempt 1 -> retried with backoff, NOT acked
    const retryMsg = makeQueueMessage({
      schemaVersion: '1.0',
      messageId: 'msg-retry-1',
      jobType: 'firestore_d1_projection_sync',
      idempotencyKey: 'idem-retry-1',
      correlationId: 'corr-retry',
      createdAtIso: nowIso,
      payload: {},
    }, 1);
    await processRadarQueueBatch({
      batch: { queue: 'radartehran-jobs', messages: [retryMsg.msg], ackAll() {}, retryAll() {} },
      db,
      dlq: env.RADAR_DLQ,
      executeJob: async () => {
        throw new Error('TRANSIENT_UPSTREAM_TIMEOUT');
      },
    });
    assert.equal(retryMsg.getState().acked, false);
    assert.equal(retryMsg.getState().retried, true);
    assert.ok((retryMsg.getState().retryDelay ?? 0) >= 15);

    // Terminal failure on max attempts -> routed to DLQ and acked
    const maxAttemptMsg = makeQueueMessage({
      schemaVersion: '1.0',
      messageId: 'msg-retry-5',
      jobType: 'firestore_d1_projection_sync',
      idempotencyKey: 'idem-retry-1',
      correlationId: 'corr-retry',
      createdAtIso: nowIso,
      payload: {},
    }, 5);
    await processRadarQueueBatch({
      batch: { queue: 'radartehran-jobs', messages: [maxAttemptMsg.msg], ackAll() {}, retryAll() {} },
      db,
      dlq: env.RADAR_DLQ,
      executeJob: async () => {
        throw new Error('PERSISTENT_UPSTREAM_TIMEOUT');
      },
    });
    assert.equal(maxAttemptMsg.getState().acked, true);
    assert.equal(sentToDlq.length, 2);

    // Stale lease takeover: seed expired PROCESSING row and confirm new worker takes over and completes
    const expiredLeaseMs = Date.now() - 60_000;
    await db
      .prepare(
        `INSERT INTO queue_job_executions (idempotency_key, job_type, message_id, correlation_id, status, attempt_count, lease_owner, lease_expires_at_ms, created_at_iso, updated_at_iso)
         VALUES (?1, ?2, ?3, ?4, 'PROCESSING', 1, 'dead-worker', ?5, ?6, ?6)`,
      )
      .bind('idem-stale-lease', 'expired_chunk_upload_session_cleanup', 'm-old-1', 'corr-old-1', expiredLeaseMs, nowIso)
      .run();

    const takeoverMsg = makeQueueMessage({
      schemaVersion: '1.0',
      messageId: 'msg-takeover-1',
      jobType: 'expired_chunk_upload_session_cleanup',
      idempotencyKey: 'idem-stale-lease',
      correlationId: 'corr-old-1',
      createdAtIso: nowIso,
      payload: {},
    });
    await workerEntrypoint.queue({ queue: 'radartehran-jobs', messages: [takeoverMsg.msg], ackAll() {}, retryAll() {} }, env);
    assert.equal(takeoverMsg.getState().acked, true);
    const takenRow = await db
      .prepare('SELECT status, attempt_count FROM queue_job_executions WHERE idempotency_key = ?1')
      .bind('idem-stale-lease')
      .first<{ status: string; attempt_count: number }>();
    assert.equal(takenRow?.status, 'COMPLETED');
    assert.equal(takenRow?.attempt_count, 2);
  });

  it('4. verifies fixed UTC+03:30 Tehran wall clock across winter and summer (zero DST drift)', () => {
    const winter = convertUtcScheduledTimeToTehranWallClock(Date.UTC(2026, 0, 15, 0, 30, 0));
    const summer = convertUtcScheduledTimeToTehranWallClock(Date.UTC(2026, 6, 15, 0, 30, 0));
    assert.equal(winter.tehranHour, 4);
    assert.equal(winter.tehranMinute, 0);
    assert.equal(summer.tehranHour, 4);
    assert.equal(summer.tehranMinute, 0);
    assert.equal(winter.matchedScheduleTask, 'morning_market_and_d1_sync');
    assert.equal(summer.matchedScheduleTask, 'morning_market_and_d1_sync');
  });
});
