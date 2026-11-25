/**
 * @file tests/rt-db-triad-002-forensic.test.ts
 * @description Independent Forensic Audit Regression Suite for RT-DB-TRIAD-002.
 *
 * Strictly distinguishes Node `node:sqlite` unit/integration tests from real Wrangler local D1 checks.
 * Covers every confirmed P0 and P1 finding remediated in RT-DB-TRIAD-002:
 *  - F-01 [P0]: All 10 mandatory `recordUserRevocationInD1` idempotency, concurrency, rollback, and retry cases
 *  - F-02 [P0]: Atomic `acquireMutationPermitInD1` & concurrent `verifyAndConsumeInternalRpcNonce`
 *  - F-03 [P0]: Write-block enforcement during Mutation Drain across object-storage & account routes +
 *               `PENDING_PERMIT_DRAIN` resume + orphan `upload_session_chunks` / `user_data_requests` purge
 *  - F-04 [P0]: Consent revocation mid-flight race & queued `research_event_ingest` `consent_revision` ordering
 *  - F-05 [P0]: Non-lowerable `HARD_MIN_K_ANONYMITY = 10`, Query Differencing protections (day-aligned + coarsened),
 *               and atomic invalidation of `research_aggregation_windows` upon subject erasure
 *  - F-06 [P0]: Split-brain `USER_DB != DB` & `DB === RESEARCH_DB` binding collisions + migration dir parity
 *  - F-07 [P1]: Unicode NFKC / zero-width / Persian digits / percent-encoding PII & free-text rejection
 *  - F-08 [P1]: `/api/account/*` non-hijacking (404 on unknown route) & Express contract parity aliases
 *  - F-09 [P1]: Keyed HMAC-SHA256 compliance receipt digest (`uid_hash`)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { parseJsonc } from '../scripts/cloudflare/jsoncUtils.mjs';
import { validateBackendWranglerConfig } from '../scripts/cloudflare/validate-backend-config.mjs';
import {
  AccountWriteBlockedError,
  createUserDataRequestInD1,
  revokeUserSessionInD1,
  updateUserPrivacyConsentInD1,
  upsertUserProfileInD1,
  upsertUserSessionInD1,
} from '../worker/account/d1AccountRepository';
import {
  signInternalLifecycleRpc,
  verifyAndConsumeInternalRpcNonce,
} from '../worker/account-lifecycle/d1InternalRpcNonceStore';
import {
  acquireMutationPermitInD1,
  blockUserWritesInD1,
  isUserWriteBlockedInD1,
  releaseMutationPermitInD1,
} from '../worker/account-lifecycle/d1MutationPermit';
import {
  executeAccountDeletionLifecycle,
  resolveDedicatedLifecycleReceiptSecret,
} from '../worker/account-lifecycle/workerLifecycleRuntime';
import { resolveWriteAdmissionFromD1 } from '../worker/account-lifecycle/d1WriteAdmissionResolver';
import {
  clearTestJwksForEdgeAuth,
  isTokenRevokedOrUserDisabled,
  recordUserRevocationInD1,
  registerTestJwkForEdgeAuth,
} from '../worker/auth/firebaseEdgeAuth';
import {
  hasUserResearchBindingCollision,
  requireResearchDb,
  requireUserDb,
} from '../worker/db/bindingResolver';
import workerEntrypoint from '../worker/index';
import { createCanonicalQueueJobDispatcher, QueueJobExecutionError } from '../worker/queues/jobDispatcher';
import type { RadarQueueEnvelope } from '../worker/queues/queueAndCronProcessor';
import {
  deriveResearchSubjectKey,
  hashUidForComplianceReceipt,
} from '../worker/research/pseudonymizer';
import { validateAndMinimizeResearchEvent } from '../worker/research/researchEventContract';
import {
  AggregationWindowPolicyError,
  computeKAnonymousResearchAggregation,
  executeResearchSubjectErasure,
  HARD_MIN_K_ANONYMITY,
  ingestResearchEventsBatch,
  resolveKAnonymityMinCohort,
} from '../worker/research/researchService';
import type { D1Database, D1PreparedStatement, R2Bucket, WorkerEnv } from '../worker/types';

const TEST_HMAC_SECRET = 'rt_triad_002_hmac_secret_0123456789abcdef0123456789';
const TEST_RPC_SECRET = 'rt_triad_002_rpc_secret_fedcba9876543210fedcba987654';
const TEST_RECEIPT_SECRET = 'rt_triad_002_receipt_secret_abcdef0123456789abcdef0123456789';
const TEST_PROJECT_ID = 'gen-lang-client-0713157837';

interface TestSqliteD1Options {
  failOnSqlContains?: string | null;
  yieldBeforeBatch?: boolean;
  yieldBeforeFirst?: boolean;
}

function createForensicSqliteD1(options: TestSqliteD1Options = {}): {
  db: D1Database;
  raw: DatabaseSync;
  setFailOnSqlContains: (pattern: string | null) => void;
  setYieldBeforeBatch: (enabled: boolean) => void;
} {
  const raw = new DatabaseSync(':memory:');
  let failPattern: string | null = options.failOnSqlContains ?? null;
  let yieldBeforeBatch = Boolean(options.yieldBeforeBatch);
  const yieldBeforeFirst = Boolean(options.yieldBeforeFirst);

  const prepareExpanded = (sql: string, boundValues: unknown[]) => {
    if (!/\?\d+/.test(sql)) {
      return { sql, values: boundValues };
    }
    const expandedValues: unknown[] = [];
    const normalizedSql = sql.replace(/\?(\d+)/g, (_match, idxStr: string) => {
      const idx = Number(idxStr) - 1;
      expandedValues.push(boundValues[idx] ?? null);
      return '?';
    });
    return { sql: normalizedSql, values: expandedValues };
  };

  const makeStmt = (sql: string, boundValues: unknown[] = []): D1PreparedStatement => ({
    bind(...values: unknown[]) {
      return makeStmt(sql, values);
    },
    async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
      if (yieldBeforeFirst) {
        await new Promise((r) => setTimeout(r, 5));
      }
      const prepared = prepareExpanded(sql, boundValues);
      const stmt = raw.prepare(prepared.sql);
      const row = stmt.get(...(prepared.values as any[])) as Record<string, unknown> | undefined;
      if (!row) return null;
      if (colName) return (row[colName] as T) ?? null;
      return row as T;
    },
    async all<T = Record<string, unknown>>() {
      const prepared = prepareExpanded(sql, boundValues);
      const stmt = raw.prepare(prepared.sql);
      const rows = stmt.all(...(prepared.values as any[])) as T[];
      return { results: rows, success: true };
    },
    async run<T = unknown>() {
      if (failPattern && sql.includes(failPattern)) {
        throw new Error(`INJECTED_SQL_FAILURE:${failPattern}`);
      }
      const prepared = prepareExpanded(sql, boundValues);
      const stmt = raw.prepare(prepared.sql);
      const info = stmt.run(...(prepared.values as any[]));
      return {
        results: [] as T[],
        success: true,
        meta: { changes: Number(info.changes ?? 0) },
      };
    },
  });

  const db: D1Database = {
    prepare(query: string) {
      return makeStmt(query);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]) {
      // Optional async yield lets two concurrent callers both pass their initial SELECT before
      // entering SQLite BEGIN IMMEDIATE, deterministically reproducing production D1 concurrency!
      if (yieldBeforeBatch) {
        await new Promise((r) => setTimeout(r, 15));
      }
      const out: Array<{ results?: T[]; success: boolean }> = [];
      raw.exec('BEGIN IMMEDIATE');
      try {
        for (const stmt of statements) {
          const res = await stmt.run<T>();
          if (!res.success) {
            throw new Error('BATCH_STMT_FAILED');
          }
          out.push({ results: res.results, success: true });
        }
        raw.exec('COMMIT');
        return out;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(query: string) {
      raw.exec(query);
      return { count: 1, duration: 1 };
    },
  };

  return {
    db,
    raw,
    setFailOnSqlContains: (p) => {
      failPattern = p;
    },
    setYieldBeforeBatch: (v) => {
      yieldBeforeBatch = v;
    },
  };
}

function applyMigrations(raw: DatabaseSync, relDir: string): string[] {
  const absDir = path.join(process.cwd(), relDir);
  const files = fs
    .readdirSync(absDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  raw.exec(
    'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TEXT NOT NULL)',
  );
  for (const file of files) {
    const exists = raw.prepare('SELECT 1 FROM d1_migrations WHERE name = ?').get(file);
    if (exists) continue;
    raw.exec(fs.readFileSync(path.join(absDir, file), 'utf-8'));
    raw.prepare('INSERT INTO d1_migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
  }
  return files;
}

function base64UrlEncode(input: string | Uint8Array): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createSignedTestFirebaseJwt(params: { uid: string; email?: string; nowSec?: number }) {
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
  const kid = `test_kid_${crypto.randomUUID().slice(0, 8)}`;
  registerTestJwkForEdgeAuth(kid, keyPair.publicKey);
  const nowSec = params.nowSec ?? Math.floor(Date.now() / 1000);
  const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payloadB64 = base64UrlEncode(
    JSON.stringify({
      iss: `https://securetoken.google.com/${TEST_PROJECT_ID}`,
      aud: TEST_PROJECT_ID,
      sub: params.uid,
      iat: nowSec - 10,
      auth_time: nowSec - 10,
      exp: nowSec + 3600,
      email: params.email ?? `${params.uid}@example.com`,
      email_verified: true,
    }),
  );
  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyPair.privateKey,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  return `${headerB64}.${payloadB64}.${base64UrlEncode(new Uint8Array(sigBuf))}`;
}

function createMinimalR2Bucket(): R2Bucket {
  return {
    async head() {
      return null;
    },
    async get() {
      return null;
    },
    async put() {
      return { key: 'k', size: 0, etag: 'e', uploaded: new Date() };
    },
    async delete() {
      return;
    },
    async list() {
      return { objects: [], truncated: false };
    },
  };
}

describe('RT-DB-TRIAD-002: Forensic Audit & Corrective Engineering Regression Suite (Node SQLite)', () => {
  describe('F-01 [P0]: Complete 10-Case Idempotency & Concurrency Matrix for recordUserRevocationInD1', () => {
    it('passes all 10 mandatory idempotency, conflict, concurrency, rollback, and retry scenarios', async () => {
      const sqlite = createForensicSqliteD1({ yieldBeforeBatch: false });
      applyMigrations(sqlite.raw, 'migrations/user-d1');

      // Case 1: First valid request
      const c1 = await recordUserRevocationInD1({
        db: sqlite.db,
        uid: 'uid_case1',
        action: 'REVOKE_BEFORE',
        validSinceSeconds: 1_760_000_000,
        actorUid: 'admin_a',
        reason: 'CASE_1',
        idempotencyKey: 'idem_matrix_1',
      });
      assert.equal(c1.applied, true);
      assert.equal(c1.idempotentReplay, false);
      assert.equal(c1.statusCode, 200);
      assert.equal(c1.reason, 'REVOCATION_RECORDED');

      // Case 2: Exact repeat of same request
      const c2 = await recordUserRevocationInD1({
        db: sqlite.db,
        uid: 'uid_case1',
        action: 'REVOKE_BEFORE',
        validSinceSeconds: 1_760_000_000,
        actorUid: 'admin_a',
        reason: 'CASE_1',
        idempotencyKey: 'idem_matrix_1',
      });
      assert.equal(c2.applied, true);
      assert.equal(c2.idempotentReplay, true);
      assert.equal(c2.statusCode, 200);
      assert.equal(c2.eventId, c1.eventId);

      // Case 3: Same key with different UID -> 409 conflict
      const c3 = await recordUserRevocationInD1({
        db: sqlite.db,
        uid: 'uid_OTHER',
        action: 'REVOKE_BEFORE',
        validSinceSeconds: 1_760_000_000,
        actorUid: 'admin_a',
        reason: 'CASE_3',
        idempotencyKey: 'idem_matrix_1',
      });
      assert.equal(c3.applied, false);
      assert.equal(c3.statusCode, 409);
      assert.equal(c3.reason, 'IDEMPOTENCY_KEY_CONFLICT');
      const otherWm = sqlite.raw
        .prepare('SELECT watermark_value FROM sync_watermarks WHERE watermark_key = ?')
        .get('revoked_uid:uid_OTHER');
      assert.equal(otherWm, undefined, 'Conflicting UID must never write watermark');

      // Case 4: Same key with different Action -> 409 conflict
      const c4 = await recordUserRevocationInD1({
        db: sqlite.db,
        uid: 'uid_case1',
        action: 'DISABLE_USER',
        actorUid: 'admin_a',
        reason: 'CASE_4',
        idempotencyKey: 'idem_matrix_1',
      });
      assert.equal(c4.applied, false);
      assert.equal(c4.statusCode, 409);
      assert.equal(c4.reason, 'IDEMPOTENCY_KEY_CONFLICT');
      const origWm = sqlite.raw
        .prepare('SELECT watermark_value FROM sync_watermarks WHERE watermark_key = ?')
        .get('revoked_uid:uid_case1') as { watermark_value: string };
      assert.equal(origWm.watermark_value, '1760000000', 'Conflicting action must never overwrite original watermark');

      // Case 5: Concurrent 2 IDENTICAL requests racing past initial SELECT
      sqlite.setYieldBeforeBatch(true);
      const [c5a, c5b] = await Promise.all([
        recordUserRevocationInD1({
          db: sqlite.db,
          uid: 'uid_race_same',
          action: 'REVOKE_BEFORE',
          validSinceSeconds: 1_760_001_000,
          actorUid: 'admin_a',
          reason: 'RACE_SAME',
          idempotencyKey: 'idem_race_same_001',
        }),
        recordUserRevocationInD1({
          db: sqlite.db,
          uid: 'uid_race_same',
          action: 'REVOKE_BEFORE',
          validSinceSeconds: 1_760_001_000,
          actorUid: 'admin_a',
          reason: 'RACE_SAME',
          idempotencyKey: 'idem_race_same_001',
        }),
      ]);
      assert.equal(c5a.statusCode, 200);
      assert.equal(c5b.statusCode, 200);
      assert.equal(c5a.applied, true);
      assert.equal(c5b.applied, true);
      assert.equal([c5a.idempotentReplay, c5b.idempotentReplay].filter(Boolean).length, 1);
      assert.equal(c5a.eventId, c5b.eventId, 'Concurrent identical loser must reconcile to winner eventId');

      // Case 6: Concurrent 2 DIFFERENT requests sharing same idempotencyKey
      const [c6a, c6b] = await Promise.all([
        recordUserRevocationInD1({
          db: sqlite.db,
          uid: 'uid_race_winner',
          action: 'DISABLE_USER',
          actorUid: 'admin_a',
          reason: 'RACE_DIFF_A',
          idempotencyKey: 'idem_race_diff_001',
        }),
        recordUserRevocationInD1({
          db: sqlite.db,
          uid: 'uid_race_loser',
          action: 'REVOKE_BEFORE',
          validSinceSeconds: 1_760_002_000,
          actorUid: 'admin_b',
          reason: 'RACE_DIFF_B',
          idempotencyKey: 'idem_race_diff_001',
        }),
      ]);
      sqlite.setYieldBeforeBatch(false);
      const statuses = [c6a.statusCode, c6b.statusCode].sort();
      assert.deepEqual(statuses, [200, 409], 'One concurrent conflicting request must commit (200) and the other MUST fail with 409');
      const winnerUid = c6a.statusCode === 200 ? 'uid_race_winner' : 'uid_race_loser';
      const loserUid = c6a.statusCode === 200 ? 'uid_race_loser' : 'uid_race_winner';
      const loserWm = sqlite.raw
        .prepare('SELECT watermark_value FROM sync_watermarks WHERE watermark_key = ?')
        .get(`revoked_uid:${loserUid}`);
      const winnerWm = sqlite.raw
        .prepare('SELECT watermark_value FROM sync_watermarks WHERE watermark_key = ?')
        .get(`revoked_uid:${winnerUid}`);
      assert.ok(winnerWm, 'Winner watermark must exist');
      assert.equal(loserWm, undefined, 'Loser watermark MUST be rolled back and never applied');

      // Case 7: Failure during INSERT INTO auth_revocation_events -> full rollback
      sqlite.setFailOnSqlContains('INSERT INTO auth_revocation_events');
      const c7 = await recordUserRevocationInD1({
        db: sqlite.db,
        uid: 'uid_fail_event',
        action: 'DISABLE_USER',
        actorUid: 'admin_a',
        reason: 'FAIL_EVENT',
        idempotencyKey: 'idem_fail_event_001',
      });
      assert.equal(c7.applied, false);
      assert.equal(c7.statusCode, 503);
      assert.equal(
        sqlite.raw.prepare('SELECT * FROM sync_watermarks WHERE watermark_key = ?').get('revoked_uid:uid_fail_event'),
        undefined,
      );

      // Case 8 & 9: Failure during sync_watermarks update -> full rollback of auth_revocation_events
      sqlite.setFailOnSqlContains('INSERT OR REPLACE INTO sync_watermarks');
      const c8 = await recordUserRevocationInD1({
        db: sqlite.db,
        uid: 'uid_fail_wm',
        action: 'DISABLE_USER',
        actorUid: 'admin_a',
        reason: 'FAIL_WM',
        idempotencyKey: 'idem_fail_wm_001',
      });
      assert.equal(c8.applied, false);
      assert.equal(c8.statusCode, 503);
      assert.equal(
        sqlite.raw.prepare('SELECT * FROM auth_revocation_events WHERE idempotency_key = ?').get('idem_fail_wm_001'),
        undefined,
        'Event row must be rolled back when watermark write fails',
      );

      // Case 10: Clean retry after transient failure succeeds cleanly
      sqlite.setFailOnSqlContains(null);
      const c10 = await recordUserRevocationInD1({
        db: sqlite.db,
        uid: 'uid_fail_wm',
        action: 'DISABLE_USER',
        actorUid: 'admin_a',
        reason: 'FAIL_WM',
        idempotencyKey: 'idem_fail_wm_001',
      });
      assert.equal(c10.applied, true);
      assert.equal(c10.idempotentReplay, false);
      assert.equal(c10.statusCode, 200);
      const disabledCheck = await isTokenRevokedOrUserDisabled('uid_fail_wm', 1_760_000_000, sqlite.db);
      assert.equal(disabledCheck.revoked, true);
    });
  });

  describe('F-02 & F-03 [P0]: Atomic Permits/Nonces, Write-Block During Drain, Drain Resume & Orphan Cleanup', () => {
    it('resolves the production USER_DB write-block schema and keeps blocked users closed', async () => {
      const sqlite = createForensicSqliteD1();
      applyMigrations(sqlite.raw, 'migrations/user-d1');
      const open = await resolveWriteAdmissionFromD1(sqlite.db, 'uid_write_open');
      assert.equal(open.status, 'OPEN');
      await blockUserWritesInD1({
        userDb: sqlite.db,
        uid: 'uid_write_closed',
        jobId: 'job_write_closed',
        nowIso: new Date().toISOString(),
      });
      const closed = await resolveWriteAdmissionFromD1(sqlite.db, 'uid_write_closed');
      assert.equal(closed.status, 'CLOSED');
      if (closed.status === 'CLOSED') assert.equal(closed.deletionJobId, 'job_write_closed');
    });

    it('fails closed when the durable account-write-block schema is unavailable', async () => {
      const sqlite = createForensicSqliteD1();
      applyMigrations(sqlite.raw, 'migrations/user-d1');
      sqlite.raw.exec('DROP TABLE account_write_blocks');
      await assert.rejects(
        () => isUserWriteBlockedInD1(sqlite.db, 'uid_schema_missing'),
        /no such table:\\s*account_write_blocks/i,
      );
    });

    it('rejects lifecycle receipt secrets that are missing, weak, or reused from another security domain', () => {
      assert.equal(resolveDedicatedLifecycleReceiptSecret({} as WorkerEnv), null);
      assert.equal(resolveDedicatedLifecycleReceiptSecret({
        LIFECYCLE_RECEIPT_HMAC_SECRET: 'short',
      } as WorkerEnv), null);
      assert.equal(resolveDedicatedLifecycleReceiptSecret({
        LIFECYCLE_RECEIPT_HMAC_SECRET: TEST_RPC_SECRET,
        INTERNAL_LIFECYCLE_RPC_SECRET: TEST_RPC_SECRET,
      } as WorkerEnv), null);
      assert.equal(resolveDedicatedLifecycleReceiptSecret({
        LIFECYCLE_RECEIPT_HMAC_SECRET: TEST_RECEIPT_SECRET,
        INTERNAL_LIFECYCLE_RPC_SECRET: TEST_RPC_SECRET,
        RESEARCH_HMAC_SECRET: TEST_HMAC_SECRET,
      } as WorkerEnv), TEST_RECEIPT_SECRET);
    });

    it('handles concurrent internal RPC nonce replays atomically without throwing SQLite UNIQUE errors', async () => {
      const sqlite = createForensicSqliteD1();
      applyMigrations(sqlite.raw, 'migrations/user-d1');
      const nowMs = Date.now();
      const payloadJson = JSON.stringify({ action: 'sync' });
      const nonce = 'nonce_concurrent_replay_987654321';
      const sig = await signInternalLifecycleRpc({
        secret: TEST_RPC_SECRET,
        issuer: 'radartehran-api',
        nonce,
        timestampMs: nowMs,
        payloadJson,
      });

      const [r1, r2] = await Promise.all([
        verifyAndConsumeInternalRpcNonce({
          userDb: sqlite.db,
          secret: TEST_RPC_SECRET,
          issuer: 'radartehran-api',
          nonce,
          timestampMs: nowMs,
          signatureHex: sig,
          payloadJson,
          nowMs,
        }),
        verifyAndConsumeInternalRpcNonce({
          userDb: sqlite.db,
          secret: TEST_RPC_SECRET,
          issuer: 'radartehran-api',
          nonce,
          timestampMs: nowMs,
          signatureHex: sig,
          payloadJson,
          nowMs,
        }),
      ]);

      const okCount = [r1, r2].filter((r) => r.ok).length;
      const replayFail = [r1, r2].find((r) => !r.ok);
      assert.equal(okCount, 1);
      assert.ok(
        replayFail &&
          'statusCode' in replayFail &&
          replayFail.statusCode === 409 &&
          'code' in replayFail &&
          replayFail.code === 'INTERNAL_RPC_NONCE_REPLAYED',
      );
    });

    it('blocks object-storage & account mutations during Mutation Drain, resumes PENDING_PERMIT_DRAIN, and purges orphan chunks/requests', async () => {
      const userSqlite = createForensicSqliteD1();
      const researchSqlite = createForensicSqliteD1();
      applyMigrations(userSqlite.raw, 'migrations/user-d1');
      applyMigrations(researchSqlite.raw, 'migrations/research-d1');

      const uid = 'uid_drain_lifecycle_01';
      const jwt = await createSignedTestFirebaseJwt({ uid });
      const env: WorkerEnv = {
        USER_DB: userSqlite.db,
        DB: userSqlite.db,
        RESEARCH_DB: researchSqlite.db,
        MEDIA_BUCKET: createMinimalR2Bucket(),
        R2_MEDIA_BUCKET_NAME: 'radar-tehran-media',
        RESEARCH_HMAC_SECRET: TEST_HMAC_SECRET,
        INTERNAL_LIFECYCLE_RPC_SECRET: TEST_RPC_SECRET,
        LIFECYCLE_RECEIPT_HMAC_SECRET: TEST_RECEIPT_SECRET,
        FIREBASE_PROJECT_ID: TEST_PROJECT_ID,
        FIREBASE_APP_CHECK_MODE: 'disabled',
      };

      try {
        await upsertUserProfileInD1(userSqlite.db, { uid, displayName: 'مریم' });
        await upsertUserSessionInD1(userSqlite.db, { sessionId: 'sess_drain_1', uid });
        await createUserDataRequestInD1(userSqlite.db, { uid, requestType: 'EXPORT' });

        // Seed upload_session + upload_session_chunks to verify orphan cleanup
        const nowMs = Date.now();
        await userSqlite.db
          .prepare(
            `INSERT INTO upload_sessions (
              session_id, owner_uid, city_id, hood_id, media_type, mime_type, file_name,
              total_chunks, max_bytes, received_bytes, completed, created_at_ms
            ) VALUES ('upl_drain_1', ?1, 'tehran', 12, 'image', 'image/jpeg', 'a.jpg', 1, 1024, 1024, 0, ?2)`,
          )
          .bind(uid, nowMs)
          .run();
        await userSqlite.db
          .prepare(
            `INSERT INTO upload_session_chunks (session_id, chunk_index, chunk_base64, byte_length)
             VALUES ('upl_drain_1', 0, 'AAAA', 1024)`,
          )
          .run();

        // 1. Acquire active mutation permit before deletion starts
        const permit = await acquireMutationPermitInD1({ userDb: userSqlite.db, uid, operationName: 'media_upload' });
        assert.equal(permit.ok, true);

        // 2. Start deletion -> enters PENDING_PERMIT_DRAIN (409) & activates account_write_blocks
        const del1 = await executeAccountDeletionLifecycle({
          env,
          uid,
          actorUid: uid,
          idempotencyKey: 'del_drain_idem_01',
        });
        assert.equal(del1.ok, false);
        assert.equal(del1.statusCode, 409);
        assert.equal(del1.status, 'PENDING_PERMIT_DRAIN');

        // 3. While token is still valid during drain, ALL sensitive user write paths MUST return 423 ACCOUNT_WRITE_BLOCKED!
        const uploadInitRes = await workerEntrypoint.fetch(
          new Request('https://radartehran.ir/api/object-storage/upload-init', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${jwt}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fileName: 'pic.jpg', mimeType: 'image/jpeg', totalSizeBytes: 1000 }),
          }),
          env,
        );
        assert.equal(uploadInitRes.status, 423);
        const uploadInitJson = (await uploadInitRes.json()) as { code: string };
        assert.equal(uploadInitJson.code, 'ACCOUNT_WRITE_BLOCKED');

        const deleteMediaRes = await workerEntrypoint.fetch(
          new Request('https://radartehran.ir/api/object-storage/file/obj_valid_123456', {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${jwt}` },
          }),
          env,
        );
        assert.equal(deleteMediaRes.status, 423);

        await assert.rejects(
          () => revokeUserSessionInD1(userSqlite.db, { sessionId: 'sess_drain_1', uid, actorUid: uid }),
          (err: unknown) => err instanceof AccountWriteBlockedError,
        );
        await assert.rejects(
          () => createUserDataRequestInD1(userSqlite.db, { uid, requestType: 'EXPORT' }),
          (err: unknown) => err instanceof AccountWriteBlockedError,
        );

        // New atomic permit acquisition must also fail closed with 423
        const blockedPermit = await acquireMutationPermitInD1({ userDb: userSqlite.db, uid, operationName: 'late_write' });
        assert.equal(blockedPermit.ok, false);

        // 4. Release the in-flight permit and RETRY deletion with the SAME idempotencyKey -> MUST RESUME & COMPLETE!
        if (permit.ok) {
          await releaseMutationPermitInD1({ userDb: userSqlite.db, permitId: permit.permitId });
        }
        const del2 = await executeAccountDeletionLifecycle({
          env,
          uid,
          actorUid: uid,
          idempotencyKey: 'del_drain_idem_01',
        });
        assert.equal(del2.ok, true);
        assert.equal(del2.statusCode, 200);
        assert.equal(del2.status, 'COMPLETED');
        assert.equal(del2.jobId, del1.jobId, 'Resumed job must preserve the exact original jobId');

        // 5. Verify zero orphan upload_session_chunks or user_data_requests remain
        const chunksLeft = userSqlite.raw.prepare('SELECT COUNT(*) AS cnt FROM upload_session_chunks').get() as { cnt: number };
        const reqsLeft = userSqlite.raw.prepare('SELECT COUNT(*) AS cnt FROM user_data_requests WHERE uid = ?').get(uid) as { cnt: number };
        assert.equal(chunksLeft.cnt, 0);
        assert.equal(reqsLeft.cnt, 0);

        // 6. Verify receipt uid_hash is keyed HMAC-SHA256 (NOT plain unsalted SHA-256!)
        const expectedKeyedHash = await hashUidForComplianceReceipt(uid, TEST_RECEIPT_SECRET);
        await assert.rejects(
          () => hashUidForComplianceReceipt(uid),
          /LIFECYCLE_RECEIPT_HMAC_SECRET_MISSING_OR_WEAK/,
        );
        await assert.rejects(
          () => hashUidForComplianceReceipt(uid, 'short'),
          /LIFECYCLE_RECEIPT_HMAC_SECRET_MISSING_OR_WEAK/,
        );
        assert.equal(del2.receiptHash, expectedKeyedHash);
      } finally {
        clearTestJwksForEdgeAuth();
      }
    });
  });

  describe('F-04, F-05 & F-07 [P0/P1]: Consent Revocation Race, Queue Consent Gate, k>=10, Query Differencing & Unicode PII', () => {
    it('blocks mid-flight HTTP consent revocation race and stale queued research_event_ingest', async () => {
      const userSqlite = createForensicSqliteD1();
      const researchSqlite = createForensicSqliteD1();
      applyMigrations(userSqlite.raw, 'migrations/user-d1');
      applyMigrations(researchSqlite.raw, 'migrations/research-d1');

      const uid = 'uid_consent_race_01';
      const env: WorkerEnv = {
        USER_DB: userSqlite.db,
        RESEARCH_DB: researchSqlite.db,
        RESEARCH_HMAC_SECRET: TEST_HMAC_SECRET,
        RESEARCH_HMAC_KEY_VERSION: 'v1',
      };

      const granted = await updateUserPrivacyConsentInD1(userSqlite.db, {
        uid,
        actorUid: uid,
        researchAnalyticsConsent: true,
      });
      assert.equal(granted.consentRevision, 1);

      // 1. Mid-flight HTTP consent revocation right before RESEARCH_DB write -> MUST ABORT with 403 and write 0 rows
      const raceRes = await ingestResearchEventsBatch({
        env,
        uid,
        clientIp: '198.51.100.10',
        rawEvents: [
          {
            eventType: 'radar.map.neighborhood_select',
            cityId: 'tehran',
            hoodId: 12,
            idempotencyKey: 'evt_race_midflight_1',
            payload: { mapZoomBucket: 'z14', viewMode: 'buy' },
          },
        ],
        beforeResearchWriteHook: async () => {
          await updateUserPrivacyConsentInD1(userSqlite.db, {
            uid,
            actorUid: uid,
            researchAnalyticsConsent: false,
          });
        },
      });
      assert.equal(raceRes.ok, false);
      if (!raceRes.ok) {
        assert.equal(raceRes.statusCode, 403);
        assert.equal(raceRes.code, 'CONSENT_REVOKED_OR_REVISED_IN_FLIGHT');
      }
      const rowsAfterRace = researchSqlite.raw.prepare('SELECT COUNT(*) AS cnt FROM research_events').get() as { cnt: number };
      assert.equal(rowsAfterRace.cnt, 0);

      // 2. Re-grant consent (consentRevision = 3) and test queued research_event_ingest
      const regranted = await updateUserPrivacyConsentInD1(userSqlite.db, {
        uid,
        actorUid: uid,
        researchAnalyticsConsent: true,
      });
      assert.equal(regranted.consentRevision, 3);
      const skRes = await deriveResearchSubjectKey({ uid, secret: TEST_HMAC_SECRET, keyVersion: 'v1' });
      assert.equal(skRes.ok, true);
      if (!skRes.ok) return;

      const dispatch = createCanonicalQueueJobDispatcher(env);
      const makeEnvelope = (idemKey: string, consentRevision: number): RadarQueueEnvelope => ({
        schemaVersion: '1.0',
        messageId: `msg_${idemKey}`,
        idempotencyKey: idemKey,
        jobType: 'research_event_ingest',
        createdAtIso: new Date().toISOString(),
        correlationId: `corr_${idemKey}`,
        payload: {
          subjectKey: skRes.derived.subjectKey,
          subjectKeyVersion: 'v1',
          consentRevision,
          events: [
            {
              eventType: 'radar.map.neighborhood_select',
              cityId: 'tehran',
              hoodId: 12,
              idempotencyKey: `q_${idemKey}`,
              payload: { mapZoomBucket: 'z14' },
            },
          ],
        },
      });

      // Stale consentRevision=1 in queue -> rejected non-retryably!
      await assert.rejects(
        () => dispatch(makeEnvelope('q_stale_rev', 1)),
        (err: unknown) =>
          err instanceof QueueJobExecutionError &&
          err.code === 'CONSENT_REVISION_STALE_OR_REVOKED' &&
          err.retryable === false,
      );

      // Matching consentRevision=3 -> accepted!
      const okQueue = await dispatch(makeEnvelope('q_fresh_rev', 3));
      assert.equal(okQueue.affectedCount, 1);

      // Revoke consent -> queued message with revision=3 MUST now be rejected!
      await updateUserPrivacyConsentInD1(userSqlite.db, {
        uid,
        actorUid: uid,
        researchAnalyticsConsent: false,
      });
      await assert.rejects(
        () => dispatch(makeEnvelope('q_after_revoke', 3)),
        (err: unknown) =>
          err instanceof QueueJobExecutionError &&
          err.code === 'RESEARCH_CONSENT_REQUIRED' &&
          err.retryable === false,
      );
    });

    it('enforces non-lowerable k>=10 floor, blocks sliding-window query differencing, coarsens counts, and invalidates derived windows on erasure', async () => {
      assert.equal(HARD_MIN_K_ANONYMITY, 10);
      assert.equal(resolveKAnonymityMinCohort({ RESEARCH_K_ANONYMITY_MIN_COHORT: '5' }), 10);
      assert.equal(resolveKAnonymityMinCohort({ RESEARCH_K_ANONYMITY_MIN_COHORT: '15' }), 15);

      const researchSqlite = createForensicSqliteD1();
      applyMigrations(researchSqlite.raw, 'migrations/research-d1');

      // 1. Sub-day / non-midnight window MUST be rejected (Query Differencing protection)
      await assert.rejects(
        () =>
          computeKAnonymousResearchAggregation({
            researchDb: researchSqlite.db,
            eventType: 'radar.map.neighborhood_select',
            cityId: 'tehran',
            hoodId: 10,
            windowStartIso: '2026-11-22T01:15:00.000Z',
            windowEndIso: '2026-11-22T02:15:00.000Z',
          }),
        (err: unknown) => err instanceof AggregationWindowPolicyError && err.code === 'AGGREGATION_WINDOW_NOT_DAY_ALIGNED',
      );

      // 2. Insert 9 subjects -> even if caller passes minCohortSize=5, HARD_MIN_K_ANONYMITY=10 suppresses!
      const eventTime = '2026-11-22T10:00:00.000Z';
      const expTime = '2027-01-01T00:00:00.000Z';
      let firstSubjectKey = '';
      for (let i = 1; i <= 9; i += 1) {
        const sk = await deriveResearchSubjectKey({ uid: `k_subj_${i}`, secret: TEST_HMAC_SECRET, keyVersion: 'v1' });
        assert.equal(sk.ok, true);
        if (!sk.ok) continue;
        if (i === 1) firstSubjectKey = sk.derived.subjectKey;
        await researchSqlite.db
          .prepare(
            `INSERT INTO research_events (
              event_id, subject_key, subject_key_version, event_type, schema_version,
              city_id, hood_id, session_bucket, payload_json, occurred_at_iso, ingested_at_iso, expires_at_iso, idempotency_key
            ) VALUES (?1, ?2, 'v1', 'radar.map.neighborhood_select', 1, 'tehran', 10, '2026-11-22', '{}', ?3, ?3, ?4, ?5)`,
          )
          .bind(`kev_${i}`, sk.derived.subjectKey, eventTime, expTime, `kidem_${i}`)
          .run();
      }

      const agg9 = await computeKAnonymousResearchAggregation({
        researchDb: researchSqlite.db,
        eventType: 'radar.map.neighborhood_select',
        cityId: 'tehran',
        hoodId: 10,
        windowStartIso: '2026-11-22T00:00:00.000Z',
        windowEndIso: '2026-11-23T00:00:00.000Z',
        minCohortSize: 5, // attempted lower bound MUST be ignored!
        nowMs: Date.parse('2026-11-22T12:00:00.000Z'),
      });
      assert.equal(agg9.kThreshold, 10);
      assert.equal(agg9.kSuppressed, true);
      assert.equal(agg9.distinctSubjectsCount, null);

      // 3. Add 3 more subjects (total 12) and then 1 more (total 13) -> both coarsen to 10 (blocks differencing!)
      for (let i = 10; i <= 12; i += 1) {
        const sk = await deriveResearchSubjectKey({ uid: `k_subj_${i}`, secret: TEST_HMAC_SECRET, keyVersion: 'v1' });
        if (!sk.ok) continue;
        await researchSqlite.db
          .prepare(
            `INSERT INTO research_events (
              event_id, subject_key, subject_key_version, event_type, schema_version,
              city_id, hood_id, session_bucket, payload_json, occurred_at_iso, ingested_at_iso, expires_at_iso, idempotency_key
            ) VALUES (?1, ?2, 'v1', 'radar.map.neighborhood_select', 1, 'tehran', 10, '2026-11-22', '{}', ?3, ?3, ?4, ?5)`,
          )
          .bind(`kev_${i}`, sk.derived.subjectKey, eventTime, expTime, `kidem_${i}`)
          .run();
      }
      const agg12 = await computeKAnonymousResearchAggregation({
        researchDb: researchSqlite.db,
        eventType: 'radar.map.neighborhood_select',
        cityId: 'tehran',
        hoodId: 10,
        windowStartIso: '2026-11-22T00:00:00.000Z',
        windowEndIso: '2026-11-23T00:00:00.000Z',
        nowMs: Date.parse('2026-11-22T12:00:00.000Z'),
      });
      assert.equal(agg12.kSuppressed, false);
      assert.equal(agg12.distinctSubjectsCount, 10);
      assert.equal(agg12.exactCountsWithheld, true);
      assert.equal(agg12.provenance.dataClassification, 'PSEUDONYMIZED RESEARCH DATA');

      const sk13 = await deriveResearchSubjectKey({ uid: 'k_subj_13', secret: TEST_HMAC_SECRET, keyVersion: 'v1' });
      assert.equal(sk13.ok, true);
      if (sk13.ok) {
        await researchSqlite.db
          .prepare(
            `INSERT INTO research_events (
              event_id, subject_key, subject_key_version, event_type, schema_version,
              city_id, hood_id, session_bucket, payload_json, occurred_at_iso, ingested_at_iso, expires_at_iso, idempotency_key
            ) VALUES ('kev_13', ?1, 'v1', 'radar.map.neighborhood_select', 1, 'tehran', 10, '2026-11-22', '{}', ?2, ?2, ?3, 'kidem_13')`,
          )
          .bind(sk13.derived.subjectKey, eventTime, expTime)
          .run();
      }
      const agg13 = await computeKAnonymousResearchAggregation({
        researchDb: researchSqlite.db,
        eventType: 'radar.map.neighborhood_select',
        cityId: 'tehran',
        hoodId: 10,
        windowStartIso: '2026-11-22T00:00:00.000Z',
        windowEndIso: '2026-11-23T00:00:00.000Z',
        nowMs: Date.parse('2026-11-22T12:00:00.000Z'),
      });
      assert.equal(agg13.distinctSubjectsCount, 10, '12 and 13 subjects must map to same coarsened bucket 10');

      // 4. Subject erasure MUST invalidate affected research_aggregation_windows atomically!
      const beforeWindows = researchSqlite.raw
        .prepare('SELECT COUNT(*) AS cnt FROM research_aggregation_windows')
        .get() as { cnt: number };
      assert.ok(beforeWindows.cnt >= 1);

      const erasure = await executeResearchSubjectErasure({
        researchDb: researchSqlite.db,
        outboxId: 'outbox_inval_01',
        subjectKey: firstSubjectKey,
        subjectKeyVersion: 'v1',
      });
      assert.equal(erasure.deletedEventsCount, 1);
      assert.equal(erasure.invalidatedAggregationWindowsCount, 1);

      const afterWindows = researchSqlite.raw
        .prepare('SELECT COUNT(*) AS cnt FROM research_aggregation_windows')
        .get() as { cnt: number };
      assert.equal(afterWindows.cnt, 0, 'Derived aggregation windows impacted by erased subject must be purged');
    });

    it('rejects Unicode/zero-width/Persian-digit/percent-encoded PII, nested objects, free text, and unexpected top-level fields', () => {
      const cases = [
        {
          label: 'Persian digits mobile',
          input: {
            eventType: 'radar.map.neighborhood_select',
            idempotencyKey: 'pii_test_01',
            payload: { sourceSurface: '۰۹۱۲۳۴۵۶۷۸۹' },
          },
          expectedCode: 'PII_DETECTED_IN_RESEARCH_PAYLOAD',
        },
        {
          label: 'Zero-width obfuscated email',
          input: {
            eventType: 'radar.map.neighborhood_select',
            idempotencyKey: 'pii_test_02',
            payload: { sourceSurface: 'ali\u200B@tehran.ir' },
          },
          expectedCode: 'PII_DETECTED_IN_RESEARCH_PAYLOAD',
        },
        {
          label: 'Percent-encoded email',
          input: {
            eventType: 'radar.map.neighborhood_select',
            idempotencyKey: 'pii_test_03',
            payload: { sourceSurface: 'ali%40tehran.ir' },
          },
          expectedCode: 'PII_DETECTED_IN_RESEARCH_PAYLOAD',
        },
        {
          label: 'Fullwidth Unicode phone digits',
          input: {
            eventType: 'radar.map.neighborhood_select',
            idempotencyKey: 'pii_test_04',
            payload: { sourceSurface: '０９１２３４５６７８９' },
          },
          expectedCode: 'PII_DETECTED_IN_RESEARCH_PAYLOAD',
        },
        {
          label: 'Free text with spaces',
          input: {
            eventType: 'radar.map.neighborhood_select',
            idempotencyKey: 'pii_test_05',
            payload: { sourceSurface: 'my home near park' },
          },
          expectedCode: 'FREE_TEXT_NOT_ALLOWED_IN_RESEARCH_PAYLOAD',
        },
        {
          label: 'Nested payload object',
          input: {
            eventType: 'radar.map.neighborhood_select',
            idempotencyKey: 'pii_test_06',
            payload: { mapZoomBucket: { nested: 'z14' } },
          },
          expectedCode: 'PAYLOAD_NESTING_FORBIDDEN',
        },
        {
          label: 'Unexpected top-level bypass key',
          input: {
            eventType: 'radar.map.neighborhood_select',
            idempotencyKey: 'pii_test_07',
            consentOverride: true,
            payload: { mapZoomBucket: 'z14' },
          },
          expectedCode: 'UNEXPECTED_TOP_LEVEL_FIELD',
        },
      ];

      for (const tc of cases) {
        const res = validateAndMinimizeResearchEvent(tc.input);
        assert.equal(res.ok, false, `Expected failure for: ${tc.label}`);
        if (!res.ok) {
          assert.equal(res.code, tc.expectedCode, `Mismatch for ${tc.label}: got ${res.code}`);
        }
      }
    });
  });

  describe('F-06 & F-08 [P0/P1]: Binding Split-Brain Isolation, Config Parity, Route Non-Hijacking & Express Parity', () => {
    it('detects split-brain USER_DB!=DB and DB===RESEARCH_DB collisions and migration dir mismatches', () => {
      const dbA = createForensicSqliteD1().db;
      const dbB = createForensicSqliteD1().db;
      const dbC = createForensicSqliteD1().db;

      // USER_DB valid + DB === RESEARCH_DB -> MUST fail closed
      const envDbResearchCollision: WorkerEnv = { USER_DB: dbA, DB: dbB, RESEARCH_DB: dbB };
      assert.equal(hasUserResearchBindingCollision(envDbResearchCollision), true);
      assert.equal(requireUserDb(envDbResearchCollision).ok, false);
      assert.equal(requireResearchDb(envDbResearchCollision).ok, false);

      // USER_DB !== DB split-brain -> MUST fail closed
      const envSplitBrain: WorkerEnv = { USER_DB: dbA, DB: dbB, RESEARCH_DB: dbC };
      assert.equal(hasUserResearchBindingCollision(envSplitBrain), true);
      assert.equal(requireUserDb(envSplitBrain).ok, false);

      // Config validator catches migrations_dir mismatch between USER_DB and legacy DB alias
      const raw = fs.readFileSync(path.join(process.cwd(), 'wrangler.backend.jsonc'), 'utf-8');
      const mutated = parseJsonc(raw, 'wrangler.backend.jsonc');
      const legacyDb = mutated.d1_databases.find((d: { binding: string }) => d.binding === 'DB');
      legacyDb.migrations_dir = 'migrations/d1';
      const check = validateBackendWranglerConfig(mutated, { skipFsChecks: true });
      assert.equal(check.ok, false);
      assert.ok(check.errors.some((e: string) => e.startsWith('USER_DB_AND_DB_MIGRATIONS_DIR_MISMATCH')));
    });

    it('returns 404 for unknown /api/account/* paths and preserves Express field parity aliases', async () => {
      const userSqlite = createForensicSqliteD1();
      applyMigrations(userSqlite.raw, 'migrations/user-d1');
      const uid = 'uid_parity_01';
      const jwt = await createSignedTestFirebaseJwt({ uid });
      const env: WorkerEnv = {
        USER_DB: userSqlite.db,
        DB: userSqlite.db,
        FIREBASE_PROJECT_ID: TEST_PROJECT_ID,
        FIREBASE_APP_CHECK_MODE: 'disabled',
      };

      try {
        // Unknown /api/account/* route must return 404 even WITHOUT auth or DB (never hijack with 401/503)
        const unknownRes = await workerEntrypoint.fetch(
          new Request('https://radartehran.ir/api/account/does-not-exist', { method: 'GET' }),
          {},
        );
        assert.equal(unknownRes.status, 404);

        // Express alias preferredCityId on PATCH /api/account/profile
        const patchProfile = await workerEntrypoint.fetch(
          new Request('https://radartehran.ir/api/account/profile', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: 'کاوه', preferredCityId: 'isfahan' }),
          }),
          env,
        );
        assert.equal(patchProfile.status, 200);
        const profileJson = (await patchProfile.json()) as { profile: { preferredCity: string } };
        assert.equal(profileJson.profile.preferredCity, 'isfahan');

        // Express aliases privacySafeTelemetryEnabled & receiveMarketingUpdates on PATCH /api/account/privacy
        const patchPrivacy = await workerEntrypoint.fetch(
          new Request('https://radartehran.ir/api/account/privacy', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              researchAnalyticsConsent: true,
              privacySafeTelemetryEnabled: true,
              receiveMarketingUpdates: true,
            }),
          }),
          env,
        );
        assert.equal(patchPrivacy.status, 200);
        const privacyJson = (await patchPrivacy.json()) as {
          privacy: { behavioralTelemetryConsent: boolean; marketingCommunicationsConsent: boolean; consentRevision: number };
        };
        assert.equal(privacyJson.privacy.behavioralTelemetryConsent, true);
        assert.equal(privacyJson.privacy.marketingCommunicationsConsent, true);
        assert.equal(privacyJson.privacy.consentRevision, 1);

        // GET /api/account/sessions & /api/account/data-requests return both canonical and Express `items` keys
        const sessRes = await workerEntrypoint.fetch(
          new Request('https://radartehran.ir/api/account/sessions', {
            headers: { Authorization: `Bearer ${jwt}` },
          }),
          env,
        );
        assert.equal(sessRes.status, 200);
        const sessJson = (await sessRes.json()) as { sessions: unknown[]; items: unknown[] };
        assert.ok(Array.isArray(sessJson.sessions) && Array.isArray(sessJson.items));

        const drRes = await workerEntrypoint.fetch(
          new Request('https://radartehran.ir/api/account/data-requests', {
            headers: { Authorization: `Bearer ${jwt}` },
          }),
          env,
        );
        assert.equal(drRes.status, 200);
        const drJson = (await drRes.json()) as { requests: unknown[]; items: unknown[] };
        assert.ok(Array.isArray(drJson.requests) && Array.isArray(drJson.items));
      } finally {
        clearTestJwksForEdgeAuth();
      }
    });
  });
});
