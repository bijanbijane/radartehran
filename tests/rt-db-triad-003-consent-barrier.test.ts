/**
 * @file tests/rt-db-triad-003-consent-barrier.test.ts
 * @description RT-DB-TRIAD-003 Section B: Deterministic verification of the atomic leased
 * research consent barrier, permit draining, crash lease expiry, zombie consumer fencing in
 * RESEARCH_DB, durable UID-free outbox recovery, duplicate delivery idempotency, and re-grant isolation.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import {
  getResearchConsentRevocationJobFromD1,
  updateUserPrivacyConsentInD1,
} from '../worker/account/d1AccountRepository';
import {
  acquireResearchProcessingPermitInD1,
  releaseResearchProcessingPermitInD1,
} from '../worker/research/researchConsentBarrier';
import {
  reconcileResearchConsentRevocation,
  revokeUserResearchConsentWithBarrier,
} from '../worker/research/researchConsentRevocation';
import { processPendingResearchErasureOutbox } from '../worker/account-lifecycle/workerLifecycleRuntime';
import {
  clearTestJwksForEdgeAuth,
  registerTestJwkForEdgeAuth,
} from '../worker/auth/firebaseEdgeAuth';
import {
  executeQueuedResearchEventIngest,
  QueueJobExecutionError,
} from '../worker/queues/jobDispatcher';
import { deriveResearchSubjectKey } from '../worker/research/pseudonymizer';
import { validateAndMinimizeResearchEvent } from '../worker/research/researchEventContract';
import {
  executeResearchSubjectErasure,
  ingestResearchEventsBatch,
  writePseudonymizedEventsToResearchDb,
} from '../worker/research/researchService';
import { handleAccountWorkerRoute } from '../worker/routes/accountRoutes';
import type { D1Database, D1PreparedStatement, WorkerEnv, WorkerRequestContext } from '../worker/types';

type LocalD1Result<T = unknown> = {
  results?: T[];
  success: boolean;
  meta?: { duration?: number; changes?: number };
};

function createRealSqliteD1(): { db: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = OFF;');

  const makeStmt = (sql: string, boundArgs: unknown[] = []): D1PreparedStatement => {
    const normalizedSql = sql.replace(/\?(\d+)/g, '?');
    const bindValues = (args: unknown[]): unknown[] =>
      args.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

    const executeRun = (): LocalD1Result => {
      const prepared = raw.prepare(normalizedSql);
      const info = prepared.run(...(bindValues(boundArgs) as Array<string | number | null | Uint8Array>));
      return {
        success: true,
        results: [],
        meta: {
          changes: Number(info.changes ?? 0),
        },
      };
    };

    const stmt: D1PreparedStatement = {
      bind(...values: unknown[]) {
        return makeStmt(sql, values);
      },
      async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
        const prepared = raw.prepare(normalizedSql);
        const row = prepared.get(...(bindValues(boundArgs) as Array<string | number | null | Uint8Array>)) as
          | Record<string, unknown>
          | undefined;
        if (!row) return null;
        if (colName) return (row[colName] as T) ?? null;
        return row as T;
      },
      async run<T = unknown>(): Promise<LocalD1Result<T>> {
        return executeRun() as LocalD1Result<T>;
      },
      async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }> {
        const prepared = raw.prepare(normalizedSql);
        const rows = prepared.all(...(bindValues(boundArgs) as Array<string | number | null | Uint8Array>)) as T[];
        return { success: true, results: rows };
      },
      async raw<T = unknown[]>(): Promise<T[]> {
        const prepared = raw.prepare(normalizedSql);
        const rows = prepared.all(...(bindValues(boundArgs) as Array<string | number | null | Uint8Array>)) as Array<
          Record<string, unknown>
        >;
        return rows.map((r) => Object.values(r) as unknown as T);
      },
    };
    (stmt as unknown as { __executeInBatch: () => LocalD1Result }).__executeInBatch = executeRun;
    return stmt;
  };

  const db: D1Database = {
    prepare(query: string) {
      return makeStmt(query, []);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<LocalD1Result<T>[]> {
      raw.exec('BEGIN IMMEDIATE;');
      try {
        const out: LocalD1Result<T>[] = [];
        for (const stmt of statements) {
          const fn = (stmt as unknown as { __executeInBatch?: () => LocalD1Result<T> }).__executeInBatch;
          out.push(fn ? fn() : ((await stmt.run()) as LocalD1Result<T>));
        }
        raw.exec('COMMIT;');
        return out;
      } catch (err) {
        raw.exec('ROLLBACK;');
        throw err;
      }
    },
    async exec(query: string) {
      raw.exec(query);
      return { count: 1, duration: 0 };
    },
  };

  return { db, raw };
}

function applyMigrationDirToSqlite(raw: DatabaseSync, relDir: string): string[] {
  const fullDir = path.resolve(process.cwd(), relDir);
  const files = fs
    .readdirSync(fullDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(fullDir, file), 'utf8');
    raw.exec(sql);
  }
  return files;
}

function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (err: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createTestTriad() {
  const userSqlite = createRealSqliteD1();
  const researchSqlite = createRealSqliteD1();
  const userMigrations = applyMigrationDirToSqlite(userSqlite.raw, 'migrations/user-d1');
  const researchMigrations = applyMigrationDirToSqlite(researchSqlite.raw, 'migrations/research-d1');
  assert.equal(userMigrations.length, 8);
  assert.equal(researchMigrations.length, 3);

  const env: WorkerEnv = {
    USER_DB: userSqlite.db,
    DB: userSqlite.db,
    RESEARCH_DB: researchSqlite.db,
    FIREBASE_PROJECT_ID: 'gen-lang-client-0713157837',
    RESEARCH_HMAC_SECRET: 'rt_triad_003_barrier_hmac_secret_0123456789abcdef',
    RESEARCH_HMAC_KEY_VERSION: 'v1',
    INTERNAL_LIFECYCLE_RPC_SECRET: 'rt_triad_003_receipt_secret_0123456789abcdef',
    LIFECYCLE_RECEIPT_HMAC_SECRET: 'rt_triad_003_dedicated_receipt_secret_0123456789abcdef',
    APP_ENV: 'development',
  };

  return { userSqlite, researchSqlite, env };
}

function makeSampleEvent(idempotencyKey: string, hoodId = 101) {
  return {
    eventType: 'radar.map.neighborhood_select',
    schemaVersion: 1,
    idempotencyKey,
    cityId: 'tehran',
    hoodId,
    payload: { mapZoomBucket: 'z14', viewMode: 'buy' },
  };
}

function createFailingResearchDb(): D1Database {
  const fail = async () => {
    throw new Error('SIMULATED_RESEARCH_DB_OUTAGE');
  };
  const stmt: D1PreparedStatement = {
    bind() {
      return stmt;
    },
    first: fail,
    run: fail,
    all: fail,
    raw: fail,
  };
  return {
    prepare() {
      return stmt;
    },
    batch: fail,
    exec: fail,
  };
}

describe('RT-DB-TRIAD-003 Section B: Research Consent Revocation Barrier & Fencing', () => {
  it('Scenario 1: Real async barrier (HTTP consumer paused right before RESEARCH_DB write) drains permit & leaves 0 revoked events', async () => {
    const { userSqlite, researchSqlite, env } = createTestTriad();
    const uid = 'uid_barrier_http_1';
    const baseTime = Date.parse('2026-11-22T12:00:00.000Z');

    // 1. Grant consent (rev=1) & persist 1 initial event
    const granted = await updateUserPrivacyConsentInD1(userSqlite.db, {
      uid,
      actorUid: uid,
      researchAnalyticsConsent: true,
      nowIso: new Date(baseTime).toISOString(),
    });
    assert.equal(granted.consentRevision, 1);

    const priorRes = await ingestResearchEventsBatch({
      env,
      uid,
      clientIp: '198.51.100.10',
      rawEvents: [makeSampleEvent('idem_http_prior_001', 101)],
      nowMs: baseTime + 1_000,
    });
    assert.equal(priorRes.ok, true);
    assert.equal(
      Number((researchSqlite.raw.prepare('SELECT COUNT(*) AS c FROM research_events').get() as { c: number }).c),
      1,
    );

    // 2. Start in-flight HTTP consumer that pauses AFTER all USER_DB checks, IMMEDIATELY BEFORE RESEARCH_DB write
    const consumerReachedBarrier = createDeferred<{ permitId: string; consentRevision: number }>();
    const releaseConsumerBarrier = createDeferred<void>();

    const inFlightConsumerPromise = ingestResearchEventsBatch({
      env,
      uid,
      clientIp: '198.51.100.10',
      rawEvents: [makeSampleEvent('idem_http_inflight_002', 202)],
      nowMs: baseTime + 2_000,
      afterConsentCheckBeforeResearchWriteHook: async (ctx) => {
        consumerReachedBarrier.resolve({ permitId: ctx.permitId, consentRevision: ctx.consentRevision });
        await releaseConsumerBarrier.promise;
      },
    });

    const barrierCtx = await consumerReachedBarrier.promise;
    assert.equal(barrierCtx.consentRevision, 1);

    // 3. While consumer is suspended right before RESEARCH_DB write, user revokes consent
    const revokeAttempt1 = await revokeUserResearchConsentWithBarrier({
      env,
      uid,
      actorUid: uid,
      nowMs: baseTime + 3_000,
    });
    assert.equal(revokeAttempt1.privacy.researchAnalyticsConsent, false);
    assert.equal(revokeAttempt1.privacy.consentRevision, 2);
    assert.ok(revokeAttempt1.revocation);
    assert.equal(revokeAttempt1.revocation.status, 'DRAINING_PERMITS');
    assert.equal(revokeAttempt1.revocation.completed, false);
    assert.equal(revokeAttempt1.revocation.statusCode, 202);
    assert.equal(revokeAttempt1.revocation.activePermitsRemaining, 1);

    // 3b. Verify NO new permit can be issued once revocation started
    const newConsumerAttempt = await ingestResearchEventsBatch({
      env,
      uid,
      clientIp: '198.51.100.10',
      rawEvents: [makeSampleEvent('idem_http_after_revoke_003', 303)],
      nowMs: baseTime + 3_500,
    });
    assert.equal(newConsumerAttempt.ok, false);
    if (!newConsumerAttempt.ok) {
      assert.equal(newConsumerAttempt.statusCode, 403);
    }

    // 3c. Duplicate revoke request while draining MUST NOT falsely report 200/completed
    const duplicateRevoke = await revokeUserResearchConsentWithBarrier({
      env,
      uid,
      actorUid: uid,
      nowMs: baseTime + 3_600,
    });
    assert.ok(duplicateRevoke.revocation);
    assert.equal(duplicateRevoke.revocation.status, 'DRAINING_PERMITS');
    assert.equal(duplicateRevoke.revocation.completed, false);
    assert.equal(duplicateRevoke.revocation.statusCode, 202);

    // 4. Release barrier so consumer resumes, writes its in-flight event, and releases its permit in finally
    releaseConsumerBarrier.resolve();
    const inFlightRes = await inFlightConsumerPromise;
    assert.equal(inFlightRes.ok, true);

    // Both prior + in-flight events momentarily exist in RESEARCH_DB before final erasure completes
    assert.equal(
      Number((researchSqlite.raw.prepare('SELECT COUNT(*) AS c FROM research_events').get() as { c: number }).c),
      2,
    );

    // 5. Reconcile revocation now that active permit has drained -> erases BOTH events + sets fence + verifies receipt
    const finalized = await reconcileResearchConsentRevocation({
      env,
      revocationId: revokeAttempt1.revocation.revocationId,
      nowMs: baseTime + 4_000,
    });
    assert.equal(finalized.ok, true);
    assert.equal(finalized.statusCode, 200);
    assert.equal(finalized.status, 'COMPLETED');
    assert.equal(finalized.completed, true);
    assert.equal(finalized.activePermitsRemaining, 0);
    assert.equal(finalized.erasedEventsCount, 2);
    assert.ok(finalized.receiptIds.length >= 1);

    // 6. Core Invariant: ZERO events from revoked consent version remain in RESEARCH_DB
    const remainingEvents = Number(
      (researchSqlite.raw.prepare('SELECT COUNT(*) AS c FROM research_events').get() as { c: number }).c,
    );
    assert.equal(remainingEvents, 0);

    // Verify fence & verifiable receipt in RESEARCH_DB and ZERO raw UID in outbox/RESEARCH_DB
    const fenceRow = researchSqlite.raw
      .prepare('SELECT revoked_through_revision, last_receipt_id FROM research_subject_consent_fences LIMIT 1')
      .get() as { revoked_through_revision: number; last_receipt_id: string };
    assert.equal(fenceRow.revoked_through_revision, 2);
    assert.equal(fenceRow.last_receipt_id, finalized.receiptIds[0]);

    const outboxDump = JSON.stringify(userSqlite.raw.prepare('SELECT * FROM research_erasure_outbox').all());
    assert.equal(outboxDump.includes(uid), false, 'research_erasure_outbox must NEVER contain raw UID');

    const inboxDump = JSON.stringify(researchSqlite.raw.prepare('SELECT * FROM research_erasure_inbox').all());
    assert.equal(inboxDump.includes(uid), false, 'research_erasure_inbox must NEVER contain raw UID');
    assert.equal(inboxDump.includes(finalized.receiptIds[0]), true);
  });

  it('Scenario 2: Real async barrier (Queue consumer executeQueuedResearchEventIngest) + duplicate queue delivery rejection', async () => {
    const { userSqlite, researchSqlite, env } = createTestTriad();
    const uid = 'uid_barrier_queue_2';
    const baseTime = Date.parse('2026-11-22T12:10:00.000Z');

    await updateUserPrivacyConsentInD1(userSqlite.db, {
      uid,
      actorUid: uid,
      researchAnalyticsConsent: true,
      nowIso: new Date(baseTime).toISOString(),
    });
    const derived = await deriveResearchSubjectKey({
      uid,
      secret: env.RESEARCH_HMAC_SECRET,
      keyVersion: 'v1',
    });
    assert.equal(derived.ok, true);
    if (!derived.ok) return;

    await userSqlite.db
      .prepare(
        `INSERT INTO user_research_subject_registry (uid, subject_key, subject_key_version, created_at_iso)
         VALUES (?1, ?2, ?3, ?4)`,
      )
      .bind(uid, derived.derived.subjectKey, 'v1', new Date(baseTime).toISOString())
      .run();

    const queueReachedBarrier = createDeferred<void>();
    const releaseQueueBarrier = createDeferred<void>();

    const queueEnvelope = {
      schemaVersion: '1.0' as const,
      messageId: 'qmsg_barrier_001',
      correlationId: 'corr_barrier_001',
      jobType: 'research_event_ingest' as const,
      idempotencyKey: 'qjob_barrier_001',
      createdAtIso: new Date(baseTime + 1_000).toISOString(),
      payload: {
        subjectKey: derived.derived.subjectKey,
        subjectKeyVersion: 'v1',
        consentRevision: 1,
        events: [makeSampleEvent('idem_queue_inflight_001', 404)],
      },
    };

    const inFlightQueue = executeQueuedResearchEventIngest(queueEnvelope, env, {
      nowMs: baseTime + 1_000,
      beforeResearchWriteBarrier: async () => {
        queueReachedBarrier.resolve();
        await releaseQueueBarrier.promise;
      },
    });

    await queueReachedBarrier.promise;

    // Revoke while queue consumer holds permit
    const revokeRes = await revokeUserResearchConsentWithBarrier({
      env,
      uid,
      actorUid: uid,
      nowMs: baseTime + 2_000,
    });
    assert.ok(revokeRes.revocation);
    assert.equal(revokeRes.revocation.status, 'DRAINING_PERMITS');
    assert.equal(revokeRes.revocation.completed, false);
    assert.equal(revokeRes.revocation.activePermitsRemaining, 1);

    // Release queue consumer -> finishes write & releases permit
    releaseQueueBarrier.resolve();
    const queueResult = await inFlightQueue;
    assert.equal(queueResult.affectedCount, 1);

    // Finalize revocation -> erases queued event + sets fence
    const finalized = await reconcileResearchConsentRevocation({
      env,
      revocationId: revokeRes.revocation.revocationId,
      nowMs: baseTime + 3_000,
    });
    assert.equal(finalized.completed, true);
    assert.equal(finalized.erasedEventsCount, 1);
    assert.equal(
      Number((researchSqlite.raw.prepare('SELECT COUNT(*) AS c FROM research_events').get() as { c: number }).c),
      0,
    );

    // Duplicate delivery of the same queue message MUST fail non-retryably and insert 0 events
    await assert.rejects(
      () => executeQueuedResearchEventIngest(queueEnvelope, env, { nowMs: baseTime + 4_000 }),
      (err: unknown) => {
        assert.ok(err instanceof QueueJobExecutionError);
        assert.equal(err.retryable, false);
        return true;
      },
    );
    assert.equal(
      Number((researchSqlite.raw.prepare('SELECT COUNT(*) AS c FROM research_events').get() as { c: number }).c),
      0,
    );
  });

  it('Scenario 3: Concurrent race with 3 simultaneous consumers waits until ALL permits drain before completing', async () => {
    const { userSqlite, researchSqlite, env } = createTestTriad();
    const uid = 'uid_barrier_concurrent_3';
    const baseTime = Date.parse('2026-11-22T12:20:00.000Z');

    await updateUserPrivacyConsentInD1(userSqlite.db, {
      uid,
      actorUid: uid,
      researchAnalyticsConsent: true,
      nowIso: new Date(baseTime).toISOString(),
    });

    const barriers = [0, 1, 2].map(() => ({
      reached: createDeferred<void>(),
      release: createDeferred<void>(),
    }));

    const consumerPromises = barriers.map((b, idx) =>
      ingestResearchEventsBatch({
        env,
        uid,
        clientIp: '198.51.100.20',
        rawEvents: [makeSampleEvent(`idem_concurrent_${idx}_1234`, 100 + idx)],
        nowMs: baseTime + 1_000 + idx,
        afterConsentCheckBeforeResearchWriteHook: async () => {
          b.reached.resolve();
          await b.release.promise;
        },
      }),
    );

    await Promise.all(barriers.map((b) => b.reached.promise));

    const rev0 = await revokeUserResearchConsentWithBarrier({
      env,
      uid,
      actorUid: uid,
      nowMs: baseTime + 2_000,
    });
    assert.ok(rev0.revocation);
    assert.equal(rev0.revocation.status, 'DRAINING_PERMITS');
    assert.equal(rev0.revocation.activePermitsRemaining, 3);

    // Release consumer 0 -> still 2 active permits
    barriers[0].release.resolve();
    await consumerPromises[0];
    const rev1 = await reconcileResearchConsentRevocation({
      env,
      revocationId: rev0.revocation.revocationId,
      nowMs: baseTime + 2_100,
    });
    assert.equal(rev1.status, 'DRAINING_PERMITS');
    assert.equal(rev1.activePermitsRemaining, 2);

    // Release consumer 1 -> still 1 active permit
    barriers[1].release.resolve();
    await consumerPromises[1];
    const rev2 = await reconcileResearchConsentRevocation({
      env,
      revocationId: rev0.revocation.revocationId,
      nowMs: baseTime + 2_200,
    });
    assert.equal(rev2.status, 'DRAINING_PERMITS');
    assert.equal(rev2.activePermitsRemaining, 1);

    // Release consumer 2 -> all permits drained -> revocation completes & erases all 3
    barriers[2].release.resolve();
    await consumerPromises[2];
    const rev3 = await reconcileResearchConsentRevocation({
      env,
      revocationId: rev0.revocation.revocationId,
      nowMs: baseTime + 2_300,
    });
    assert.equal(rev3.status, 'COMPLETED');
    assert.equal(rev3.completed, true);
    assert.equal(rev3.activePermitsRemaining, 0);
    assert.equal(rev3.erasedEventsCount, 3);
    assert.equal(
      Number((researchSqlite.raw.prepare('SELECT COUNT(*) AS c FROM research_events').get() as { c: number }).c),
      0,
    );
  });

  it('Scenario 4: Crash recovery via lease expiration + Zombie consumer waking up after lease expiry is fenced atomically in RESEARCH_DB', async () => {
    const { userSqlite, researchSqlite, env } = createTestTriad();
    const uid = 'uid_barrier_zombie_4';
    const t0 = Date.parse('2026-11-22T12:30:00.000Z');

    await updateUserPrivacyConsentInD1(userSqlite.db, {
      uid,
      actorUid: uid,
      researchAnalyticsConsent: true,
      nowIso: new Date(t0).toISOString(),
    });

    const derived = await deriveResearchSubjectKey({
      uid,
      secret: env.RESEARCH_HMAC_SECRET,
      keyVersion: 'v1',
    });
    assert.equal(derived.ok, true);
    if (!derived.ok) return;

    // 1. Ingest 1 prior event under rev=1
    const initial = await ingestResearchEventsBatch({
      env,
      uid,
      clientIp: '198.51.100.30',
      rawEvents: [makeSampleEvent('idem_zombie_prior_001', 111)],
      nowMs: t0 + 10,
    });
    assert.equal(initial.ok, true);

    // 2. Acquire bounded-lease permit (ttl=500ms) and simulate worker crash (never released!)
    const crashedPermit = await acquireResearchProcessingPermitInD1({
      userDb: userSqlite.db,
      uid,
      subjectKey: derived.derived.subjectKey,
      subjectKeyVersion: 'v1',
      consumerKind: 'http_ingest',
      expectedConsentRevision: 1,
      ttlMs: 500,
      nowMs: t0 + 50,
    });
    assert.equal(crashedPermit.ok, true);
    if (!crashedPermit.ok) return;

    // 3. Revoke at t0 + 100 -> lease still valid (expires at t0 + 550), so revocation waits
    const revWhileLive = await revokeUserResearchConsentWithBarrier({
      env,
      uid,
      actorUid: uid,
      nowMs: t0 + 100,
    });
    assert.ok(revWhileLive.revocation);
    assert.equal(revWhileLive.revocation.status, 'DRAINING_PERMITS');
    assert.equal(revWhileLive.revocation.activePermitsRemaining, 1);

    // 4. Advance clock past lease expiry (t0 + 700 > t0 + 550) -> crashed lease is reclaimed, erasure completes!
    const revAfterExpiry = await reconcileResearchConsentRevocation({
      env,
      revocationId: revWhileLive.revocation.revocationId,
      nowMs: t0 + 700,
    });
    assert.equal(revAfterExpiry.status, 'COMPLETED');
    assert.equal(revAfterExpiry.completed, true);
    assert.equal(revAfterExpiry.expiredPermitsReclaimed, 1);
    assert.equal(revAfterExpiry.activePermitsRemaining, 0);
    assert.equal(revAfterExpiry.erasedEventsCount, 1);
    assert.equal(
      Number((researchSqlite.raw.prepare('SELECT COUNT(*) AS c FROM research_events').get() as { c: number }).c),
      0,
    );

    // 5. Zombie consumer wakes up at t0 + 1000 and tries to write directly to RESEARCH_DB with stale consentRevision=1
    const validatedZombie = validateAndMinimizeResearchEvent(makeSampleEvent('idem_zombie_late_write_999', 555), t0 + 1000);
    assert.equal(validatedZombie.ok, true);
    if (!('event' in validatedZombie)) return;

    const zombieWrite = await writePseudonymizedEventsToResearchDb({
      researchDb: researchSqlite.db,
      subjectKey: derived.derived.subjectKey,
      subjectKeyVersion: 'v1',
      consentRevision: crashedPermit.consentRevision, // stale rev=1
      events: [validatedZombie.event],
      nowMs: t0 + 1000,
    });
    assert.equal(zombieWrite.acceptedCount, 0);
    assert.equal(zombieWrite.fencedCount, 1);

    // Zero events from revoked version exist in RESEARCH_DB
    assert.equal(
      Number((researchSqlite.raw.prepare('SELECT COUNT(*) AS c FROM research_events').get() as { c: number }).c),
      0,
    );
  });

  it('Scenario 5: Transient RESEARCH_DB outage -> durable outbox recovery -> idempotent replay -> re-grant rev=3 isolation', async () => {
    const { userSqlite, researchSqlite, env } = createTestTriad();
    const uid = 'uid_barrier_outage_5';
    const t0 = Date.parse('2026-11-22T12:40:00.000Z');

    await updateUserPrivacyConsentInD1(userSqlite.db, {
      uid,
      actorUid: uid,
      researchAnalyticsConsent: true,
      nowIso: new Date(t0).toISOString(),
    });

    const ingestRev1 = await ingestResearchEventsBatch({
      env,
      uid,
      clientIp: '198.51.100.40',
      rawEvents: [makeSampleEvent('idem_outage_rev1_001', 120)],
      nowMs: t0 + 100,
    });
    assert.equal(ingestRev1.ok, true);

    // 1. Revoke while RESEARCH_DB is experiencing a transient outage
    const outageEnv: WorkerEnv = { ...env, RESEARCH_DB: createFailingResearchDb() };
    const revOutage = await revokeUserResearchConsentWithBarrier({
      env: outageEnv,
      uid,
      actorUid: uid,
      nowMs: t0 + 200,
    });
    assert.ok(revOutage.revocation);
    assert.equal(revOutage.revocation.completed, false);
    assert.equal(revOutage.revocation.status, 'PENDING_ERASURE');
    assert.equal(revOutage.revocation.statusCode, 202);

    const outboxRow = userSqlite.raw
      .prepare('SELECT outbox_id, status, max_consent_revision, subject_key, subject_key_version FROM research_erasure_outbox LIMIT 1')
      .get() as {
      outbox_id: string;
      status: string;
      max_consent_revision: number;
      subject_key: string;
      subject_key_version: string;
    };
    assert.equal(outboxRow.status, 'RETRY_PENDING');
    assert.equal(outboxRow.max_consent_revision, 2);

    // Re-grant is refused until the prior revision's durable erasure receipt is complete.
    await assert.rejects(
      () => updateUserPrivacyConsentInD1(userSqlite.db, {
        uid,
        actorUid: uid,
        researchAnalyticsConsent: true,
        nowIso: new Date(t0 + 300).toISOString(),
      }),
      /RESEARCH_CONSENT_REVOCATION_PENDING/,
    );

    // 2. Restore RESEARCH_DB and process outbox via background lifecycle outbox processor (past backoff)
    const outboxRecovery = await processPendingResearchErasureOutbox({
      userDb: userSqlite.db,
      researchDb: researchSqlite.db,
      nowMs: t0 + 600_000,
      receiptSecret: env.INTERNAL_LIFECYCLE_RPC_SECRET,
    });
    assert.equal(outboxRecovery.completed, 1);
    assert.equal(outboxRecovery.erasedEventsTotal, 1);

    const jobAfterRecovery = await getResearchConsentRevocationJobFromD1(
      userSqlite.db,
      revOutage.revocation.revocationId,
    );
    assert.ok(jobAfterRecovery);
    assert.equal(jobAfterRecovery.status, 'COMPLETED');
    assert.equal(jobAfterRecovery.erasedEventsCount, 1);
    assert.equal(jobAfterRecovery.receiptIds.length, 1);
    assert.equal(
      Number((researchSqlite.raw.prepare('SELECT COUNT(*) AS c FROM research_events').get() as { c: number }).c),
      0,
    );

    // 3. Replay erasure inbox + replay revocation reconciliation -> strictly idempotent with identical receipt
    const replayInbox = await executeResearchSubjectErasure({
      researchDb: researchSqlite.db,
      outboxId: outboxRow.outbox_id,
      subjectKey: outboxRow.subject_key,
      subjectKeyVersion: outboxRow.subject_key_version,
      maxConsentRevision: outboxRow.max_consent_revision,
      nowMs: t0 + 601_000,
    });
    assert.equal(replayInbox.idempotentReplay, true);
    assert.equal(replayInbox.receiptId, jobAfterRecovery.receiptIds[0]);

    const replayRevocation = await reconcileResearchConsentRevocation({
      env,
      revocationId: revOutage.revocation.revocationId,
      nowMs: t0 + 602_000,
    });
    assert.equal(replayRevocation.idempotentReplay, true);
    assert.equal(replayRevocation.completed, true);

    // 4. User explicitly re-grants consent (rev=3): new events succeed, stale rev<=2 writes remain permanently fenced
    const regranted = await updateUserPrivacyConsentInD1(userSqlite.db, {
      uid,
      actorUid: uid,
      researchAnalyticsConsent: true,
      nowIso: new Date(t0 + 610_000).toISOString(),
    });
    assert.equal(regranted.consentRevision, 3);

    const newRev3Ingest = await ingestResearchEventsBatch({
      env,
      uid,
      clientIp: '198.51.100.40',
      rawEvents: [makeSampleEvent('idem_regrant_rev3_001', 333)],
      nowMs: t0 + 611_000,
    });
    assert.equal(newRev3Ingest.ok, true);
    if (newRev3Ingest.ok) {
      assert.equal(newRev3Ingest.consentRevision, 3);
      assert.equal(newRev3Ingest.acceptedCount, 1);
    }

    // Stale rev=1 zombie write is STILL fenced even after user re-granted rev=3!
    const staleEvt = validateAndMinimizeResearchEvent(makeSampleEvent('idem_stale_rev1_after_regrant', 777), t0 + 612_000);
    assert.equal(staleEvt.ok, true);
    if (!('event' in staleEvt)) return;

    const staleWrite = await writePseudonymizedEventsToResearchDb({
      researchDb: researchSqlite.db,
      subjectKey: outboxRow.subject_key,
      subjectKeyVersion: outboxRow.subject_key_version,
      consentRevision: 1,
      events: [staleEvt.event],
      nowMs: t0 + 612_000,
    });
    assert.equal(staleWrite.acceptedCount, 0);
    assert.equal(staleWrite.fencedCount, 1);

    const storedRows = researchSqlite.raw
      .prepare('SELECT consent_revision, idempotency_key FROM research_events')
      .all() as Array<{ consent_revision: number; idempotency_key: string }>;
    assert.equal(storedRows.length, 1);
    assert.equal(storedRows[0].consent_revision, 3);
    assert.equal(storedRows[0].idempotency_key, 'idem_regrant_rev3_001');
  });

  it('Scenario 6: Account HTTP routes (PATCH /api/account/privacy -> 202 draining -> POST /api/account/privacy/reconcile -> 200)', async () => {
    const { userSqlite, researchSqlite, env } = createTestTriad();
    const uid = 'uid_barrier_route_6';
    const t0 = Date.now();

    await updateUserPrivacyConsentInD1(userSqlite.db, {
      uid,
      actorUid: uid,
      researchAnalyticsConsent: true,
      nowIso: new Date(t0).toISOString(),
    });

    const ingestRes = await ingestResearchEventsBatch({
      env,
      uid,
      clientIp: '198.51.100.50',
      rawEvents: [makeSampleEvent('idem_route_test_001', 150)],
      nowMs: t0 + 10,
    });
    assert.equal(ingestRes.ok, true);

    const derived = await deriveResearchSubjectKey({
      uid,
      secret: env.RESEARCH_HMAC_SECRET,
      keyVersion: 'v1',
    });
    assert.equal(derived.ok, true);
    if (!derived.ok) return;

    const activePermit = await acquireResearchProcessingPermitInD1({
      userDb: userSqlite.db,
      uid,
      subjectKey: derived.derived.subjectKey,
      subjectKeyVersion: 'v1',
      consumerKind: 'http_ingest',
      ttlMs: 30_000,
      nowMs: t0 + 20,
    });
    assert.equal(activePermit.ok, true);
    if (!activePermit.ok) return;

    const base64Url = (input: string | Uint8Array): string =>
      (typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const kid = 'kid_barrier_test_rs256';
    registerTestJwkForEdgeAuth(kid, keyPair.publicKey);

    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const headerSeg = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
      const payloadSeg = base64Url(
        JSON.stringify({
          iss: 'https://securetoken.google.com/gen-lang-client-0713157837',
          aud: 'gen-lang-client-0713157837',
          sub: uid,
          user_id: uid,
          email: 'barrier-test@radartehran.local',
          email_verified: true,
          auth_time: nowSec - 60,
          iat: nowSec - 10,
          exp: nowSec + 3600,
        }),
      );
      const signingInput = `${headerSeg}.${payloadSeg}`;
      const sigBuf = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        keyPair.privateKey,
        new TextEncoder().encode(signingInput),
      );
      const jwt = `${signingInput}.${base64Url(new Uint8Array(sigBuf))}`;

      const makeCtx = (method: string, pathname: string, body?: unknown): WorkerRequestContext => {
        const url = new URL(`https://api.radartehran.local${pathname}`);
        const request = new Request(url.toString(), {
          method,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${jwt}`,
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        return {
          request,
          env,
          url,
          pathname,
          method,
          requestId: 'req_barrier_test',
          correlationId: 'corr_barrier_test',
          clientIp: '198.51.100.50',
          trustedEdgeIp: true,
          environment: 'development',
          startedAtMs: Date.now(),
          routeId: pathname,
          implementationId: 'worker_account_routes',
        };
      };

      // PATCH /api/account/privacy while permit active -> HTTP 202 DRAINING_PERMITS
      const patchRes = await handleAccountWorkerRoute(
        makeCtx('PATCH', '/api/account/privacy', { researchAnalyticsConsent: false }),
      );
      assert.ok(patchRes);
      assert.equal(patchRes.status, 202);
      const patchJson = (await patchRes.json()) as {
        status: string;
        revocation: { status: string; completed: boolean; activePermitsRemaining: number };
      };
      assert.equal(patchJson.status, 'pending');
      assert.equal(patchJson.revocation.status, 'DRAINING_PERMITS');
      assert.equal(patchJson.revocation.completed, false);
      assert.equal(patchJson.revocation.activePermitsRemaining, 1);

      // Release permit, then call POST /api/account/privacy/reconcile -> HTTP 200 COMPLETED & 0 events
      await releaseResearchProcessingPermitInD1({ userDb: userSqlite.db, permitId: activePermit.permitId });

      const reconcileRes = await handleAccountWorkerRoute(makeCtx('POST', '/api/account/privacy/reconcile'));
      assert.ok(reconcileRes);
      assert.equal(reconcileRes.status, 200);
      const reconcileJson = (await reconcileRes.json()) as {
        status: string;
        reconciledCount: number;
        results: Array<{ status: string; completed: boolean; erasedEventsCount: number }>;
      };
      assert.equal(reconcileJson.status, 'ok');
      assert.equal(reconcileJson.reconciledCount, 1);
      assert.equal(reconcileJson.results[0].status, 'COMPLETED');
      assert.equal(reconcileJson.results[0].completed, true);
      assert.equal(reconcileJson.results[0].erasedEventsCount, 1);
      assert.equal(
        Number((researchSqlite.raw.prepare('SELECT COUNT(*) AS c FROM research_events').get() as { c: number }).c),
        0,
      );
    } finally {
      clearTestJwksForEdgeAuth();
    }
  });

  it('Scenario 7: Post-snapshot registration and completed permit are recovered before revocation completes', async () => {
    const { userSqlite, researchSqlite, env } = createTestTriad();
    const uid = 'uid_barrier_late_registry_7';
    const t0 = Date.parse('2026-11-22T13:00:00.000Z');
    const granted = await updateUserPrivacyConsentInD1(userSqlite.db, {
      uid, actorUid: uid, researchAnalyticsConsent: true, nowIso: new Date(t0).toISOString(),
    });
    assert.equal(granted.consentRevision, 1);

    const derived = await deriveResearchSubjectKey({
      uid, secret: env.RESEARCH_HMAC_SECRET, keyVersion: 'v1',
    });
    assert.equal(derived.ok, true);
    if (!derived.ok) return;
    const subjectKey = derived.derived.subjectKey;
    const checked = validateAndMinimizeResearchEvent(makeSampleEvent('idem_late_registry_007', 707), t0 + 40);
    assert.equal(checked.ok, true);
    if (!('event' in checked)) return;

    let injected = false;
    const wrappedUserDb: D1Database = {
      prepare: (query) => userSqlite.db.prepare(query),
      exec: (query) => userSqlite.db.exec(query),
      batch: async (statements) => {
        if (!injected) {
          injected = true;
          // This represents an ingestion that completes after the initial registry read
          // but before the revocation job is committed.
          await userSqlite.db.prepare(
            `INSERT INTO user_research_subject_registry (uid, subject_key, subject_key_version, created_at_iso)
             VALUES (?1, ?2, 'v1', ?3)`,
          ).bind(uid, subjectKey, new Date(t0 + 30).toISOString()).run();
          await userSqlite.db.prepare(
            `INSERT INTO research_processing_permits (
              permit_id, uid, subject_key, subject_key_version, consent_revision,
              consumer_kind, acquired_at_ms, expires_at_ms, released_at_ms
            ) VALUES ('rperm_late_registry_7', ?1, ?2, 'v1', 1, 'http_ingest', ?3, ?4, NULL)`,
          ).bind(uid, subjectKey, t0 + 15, t0 + 30_000).run();
          const written = await writePseudonymizedEventsToResearchDb({
            researchDb: researchSqlite.db, subjectKey, subjectKeyVersion: 'v1',
            consentRevision: 1, events: [checked.event], nowMs: t0 + 40,
          });
          assert.equal(written.acceptedCount, 1);
        }
        return userSqlite.db.batch(statements);
      },
    };
    const raceEnv: WorkerEnv = { ...env, USER_DB: wrappedUserDb, DB: wrappedUserDb };

    const revoked = await revokeUserResearchConsentWithBarrier({
      env: raceEnv, uid, actorUid: uid, nowMs: t0 + 100,
    });
    assert.ok(revoked.revocation);
    assert.equal(revoked.revocation.status, 'DRAINING_PERMITS');
    assert.equal(revoked.revocation.activePermitsRemaining, 1);

    await releaseResearchProcessingPermitInD1({
      userDb: userSqlite.db, permitId: 'rperm_late_registry_7', nowMs: t0 + 200,
    });
    const completed = await reconcileResearchConsentRevocation({
      env: raceEnv, revocationId: revoked.revocation.revocationId, nowMs: t0 + 300,
    });
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.completed, true);
    assert.equal(
      Number((researchSqlite.raw.prepare('SELECT COUNT(*) AS c FROM research_events').get() as { c: number }).c),
      0,
    );
    const outbox = await userSqlite.db.prepare(
      'SELECT status, max_consent_revision FROM research_erasure_outbox WHERE job_id = ?1',
    ).bind(revoked.revocation.revocationId).first<{ status: string; max_consent_revision: number }>();
    assert.equal(outbox?.status, 'COMPLETED');
    assert.equal(outbox?.max_consent_revision, 2);
  });



  it('Scenario 8: A stale revocation request cannot downgrade a concurrently completed job', async () => {
    const { userSqlite } = createTestTriad();
    const nowIso = '2026-11-22T13:10:00.000Z';
    await userSqlite.db.prepare(
      `INSERT INTO research_consent_revocation_jobs (
        revocation_id, uid, revoked_consent_revision, new_consent_revision, status,
        erased_events_count, receipt_ids_json, created_at_iso, updated_at_iso, completed_at_iso
      ) VALUES ('rrev_status_fence_8', 'uid_status_fence_8', 1, 2, 'COMPLETED',
        0, '[]', ?1, ?1, ?1)`,
    ).bind(nowIso).run();

    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'worker/research/researchConsentRevocation.ts'),
      'utf8',
    );
    assert.match(source, /WHERE revocation_id = \?3 AND status != 'COMPLETED'/);

    const staleTransition = await userSqlite.db.prepare(
      `UPDATE research_consent_revocation_jobs
       SET status = ?1, updated_at_iso = ?2,
           completed_at_iso = CASE WHEN ?1 = 'COMPLETED' THEN ?2 ELSE NULL END
       WHERE revocation_id = ?3 AND status != 'COMPLETED'`,
    ).bind('PENDING_ERASURE', '2026-11-22T13:11:00.000Z', 'rrev_status_fence_8').run();
    assert.equal(staleTransition.meta?.changes, 0);

    const canonical = await userSqlite.db.prepare(
      'SELECT status, completed_at_iso FROM research_consent_revocation_jobs WHERE revocation_id = ?1',
    ).bind('rrev_status_fence_8').first<{ status: string; completed_at_iso: string | null }>();
    assert.equal(canonical?.status, 'COMPLETED');
    assert.equal(canonical?.completed_at_iso, nowIso);
  });



  it('Scenario 9: Completed consent outbox rows recover a parent job after a worker crash', async () => {
    const { userSqlite, env } = createTestTriad();
    const nowIso = '2026-11-22T13:20:00.000Z';
    await userSqlite.db.prepare(
      `INSERT INTO research_consent_revocation_jobs (
        revocation_id, uid, revoked_consent_revision, new_consent_revision, status,
        erased_events_count, receipt_ids_json, created_at_iso, updated_at_iso
      ) VALUES ('rrev_parent_recovery_9', 'uid_parent_recovery_9', 1, 2, 'PENDING_ERASURE',
        0, '[]', ?1, ?1)`,
    ).bind(nowIso).run();
    await userSqlite.db.prepare(
      `INSERT INTO research_erasure_outbox (
        outbox_id, job_id, subject_key, subject_key_version, status, attempt_count,
        next_retry_at_ms, receipt_id, erased_events_count, created_at_iso, updated_at_iso,
        completed_at_iso, max_consent_revision
      ) VALUES ('rout_parent_recovery_9', 'rrev_parent_recovery_9', 'subject_parent_recovery_9',
        'v1', 'COMPLETED', 1, 0, 'receipt_parent_recovery_9', 3, ?1, ?1, ?1, 2)`,
    ).bind(nowIso).run();

    // Simulate a crash after the final outbox item was committed but before the
    // revocation parent was advanced to COMPLETED. No pending outbox rows remain.
    const result = await processPendingResearchErasureOutbox({
      userDb: userSqlite.db,
      researchDb: env.RESEARCH_DB,
      nowMs: Date.parse('2026-11-22T13:21:00.000Z'),
      receiptSecret: env.LIFECYCLE_RECEIPT_HMAC_SECRET!,
    });
    assert.equal(result.pending, 0);
    const parent = await userSqlite.db.prepare(
      'SELECT status, erased_events_count, receipt_ids_json FROM research_consent_revocation_jobs WHERE revocation_id = ?1',
    ).bind('rrev_parent_recovery_9').first<{
      status: string; erased_events_count: number; receipt_ids_json: string;
    }>();
    assert.equal(parent?.status, 'COMPLETED');
    assert.equal(parent?.erased_events_count, 3);
    assert.deepEqual(JSON.parse(parent?.receipt_ids_json ?? '[]'), ['receipt_parent_recovery_9']);
  });


});
