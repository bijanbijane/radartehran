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
} from '../worker/account/d1AccountRepository';
import {
  reconcileResearchConsentRevocation,
  revokeUserResearchConsentWithBarrier,
} from '../worker/research/researchConsentRevocation';
import {
  signInternalLifecycleRpc,
  verifyAndConsumeInternalRpcNonce,
} from '../worker/account-lifecycle/d1InternalRpcNonceStore';
import {
  acquireMutationPermitInD1,
  countActiveMutationPermitsInD1,
  blockUserWritesInD1,
  isUserWriteBlockedInD1,
  releaseMutationPermitInD1,
} from '../worker/account-lifecycle/d1MutationPermit';
import {
  executeAccountDeletionLifecycle,
  processPendingResearchErasureOutbox,
  resolveDedicatedLifecycleReceiptSecret,
} from '../worker/account-lifecycle/workerLifecycleRuntime';
import { resolveWriteAdmissionFromD1 } from '../worker/account-lifecycle/d1WriteAdmissionResolver';
import { d1FirstRow } from '../worker/account-lifecycle/d1ResultHelpers';
import { isUserAuthDisabledOrRevoked, recordUserRevocationInD1 } from '../worker/auth/authRevocationStore';
import { RADAR_SESSION_COOKIE, sha256Hex } from '../worker/auth/sessionAuth';
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
  purgeExpiredResearchData,
  resolveKAnonymityMinCohort,
} from '../worker/research/researchService';
import { evaluateTieredWorkerRateLimit } from '../worker/cache/kvAndEdgeRateLimiter';
import {
  buildR2MediaObjectKey,
  createSignedR2MediaUrl,
  isObjectUnderLegalHold,
  verifySignedR2MediaUrl,
} from '../worker/storage/r2StorageAdapter';
import type { D1Database, D1PreparedStatement, R2Bucket, WorkerEnv } from '../worker/types';

const TEST_HMAC_SECRET = 'rt_triad_002_hmac_secret_0123456789abcdef0123456789';
const TEST_RPC_SECRET = 'rt_triad_002_rpc_secret_fedcba9876543210fedcba987654';
const TEST_RECEIPT_SECRET = 'rt_triad_002_receipt_secret_abcdef0123456789abcdef0123456789';

interface TestSqliteD1Options {
  failOnSqlContains?: string | null;
  failResultOnSqlContains?: string | null;
  yieldBeforeBatch?: boolean;
  yieldBeforeFirst?: boolean;
}

function createForensicSqliteD1(options: TestSqliteD1Options = {}): {
  db: D1Database;
  raw: DatabaseSync;
  setFailOnSqlContains: (pattern: string | null) => void;
  setFailResultOnSqlContains: (pattern: string | null) => void;
  setYieldBeforeBatch: (enabled: boolean) => void;
} {
  const raw = new DatabaseSync(':memory:');
  let failPattern: string | null = options.failOnSqlContains ?? null;
  let failResultPattern: string | null = options.failResultOnSqlContains ?? null;
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
      if (failResultPattern && sql.includes(failResultPattern)) {
        return { results: [], success: false };
      }
      const prepared = prepareExpanded(sql, boundValues);
      const stmt = raw.prepare(prepared.sql);
      const rows = stmt.all(...(prepared.values as any[])) as T[];
      return { results: rows, success: true };
    },
    async run<T = unknown>() {
      if (failPattern && sql.includes(failPattern)) {
        throw new Error(`INJECTED_SQL_FAILURE:${failPattern}`);
      }
      if (failResultPattern && sql.includes(failResultPattern)) {
        return { results: [] as T[], success: false, meta: { changes: 0 } };
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
      const out: Array<{ results?: T[]; success: boolean; meta?: { duration?: number; changes?: number } }> = [];
      raw.exec('BEGIN IMMEDIATE');
      try {
        for (const stmt of statements) {
          const res = await stmt.run<T>();
          if (!res.success) {
            throw new Error('BATCH_STMT_FAILED');
          }
          out.push({ results: res.results, success: true, meta: res.meta });
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
    setFailResultOnSqlContains: (p) => {
      failResultPattern = p;
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

async function createNativeSessionForTest(userDb: D1Database, uid: string, sessionId = crypto.randomUUID()): Promise<string> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(48));
  const token = Buffer.from(tokenBytes).toString('base64url');
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAtIso = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const result = await userDb.prepare(
    'INSERT INTO user_sessions (session_id, uid, device_label, user_agent_summary, ip_prefix, status, created_at_iso, last_seen_at_iso, token_hash, expires_at_iso, auth_provider) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8, ?9, ?10)',
  ).bind(sessionId, uid, 'test', 'Node test', '', 'ACTIVE', nowIso, await sha256Hex(token), expiresAtIso, 'google').run();
  if (result.success !== true || result.meta?.changes !== 1) throw new Error('TEST_NATIVE_SESSION_CREATE_FAILED');
  return token;
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
      const disabledCheck = await isUserAuthDisabledOrRevoked('uid_fail_wm', 1_760_000_000, sqlite.db);
      assert.equal(disabledCheck.revoked, true);
    });
  });

  describe('F-02 & F-03 [P0]: Atomic Permits/Nonces, Write-Block During Drain, Drain Resume & Orphan Cleanup', () => {
    it('does not replace an active write block owned by a different deletion job', async () => {
      const sqlite = createForensicSqliteD1();
      applyMigrations(sqlite.raw, 'migrations/user-d1');
      await blockUserWritesInD1({
        userDb: sqlite.db,
        uid: 'uid_conflict_block',
        jobId: 'job_first',
        nowIso: new Date().toISOString(),
      });
      await assert.rejects(
        () => blockUserWritesInD1({
          userDb: sqlite.db,
          uid: 'uid_conflict_block',
          jobId: 'job_second',
          nowIso: new Date().toISOString(),
        }),
        /ACCOUNT_WRITE_BLOCK_CONFLICT_OR_STORE_UNAVAILABLE/,
      );
      const row = await sqlite.db
        .prepare('SELECT job_id FROM account_write_blocks WHERE uid = ?1')
        .bind('uid_conflict_block')
        .first<{ job_id: string }>();
      assert.equal(row?.job_id, 'job_first');
    });

    it('does not treat a legal-hold-blocked deletion job as an active write block', async () => {
      const sqlite = createForensicSqliteD1();
      applyMigrations(sqlite.raw, 'migrations/user-d1');
      await sqlite.db.prepare(
        `INSERT INTO account_deletion_jobs (
          job_id, uid, idempotency_key, status, stage, requested_by_uid, reason, created_at_iso, updated_at_iso
        ) VALUES (?1, ?2, ?3, 'BLOCKED_LEGAL_HOLD', 'LEGAL_HOLD_CHECK', ?4, ?5, ?6, ?7)`,
      ).bind(
        'job_legal_hold_blocked',
        'uid_legal_hold_blocked',
        'idem_legal_hold_blocked',
        'uid_legal_hold_blocked',
        'USER_REQUESTED_ERASURE',
        new Date().toISOString(),
        new Date().toISOString(),
      ).run();
      const decision = await resolveWriteAdmissionFromD1(sqlite.db, 'uid_legal_hold_blocked');
      assert.equal(decision.status, 'OPEN');
    });

    it('fails closed when an active deletion job exists without its write block', async () => {
      const sqlite = createForensicSqliteD1();
      applyMigrations(sqlite.raw, 'migrations/user-d1');
      await sqlite.db.prepare(
        `INSERT INTO account_deletion_jobs (
          job_id, uid, idempotency_key, status, stage, requested_by_uid, reason, created_at_iso, updated_at_iso
        ) VALUES (?1, ?2, ?3, 'INITIATED', 'WRITE_BLOCK', ?4, ?5, ?6, ?7)`,
      ).bind(
        'job_active_without_block',
        'uid_active_without_block',
        'idem_active_without_block',
        'uid_active_without_block',
        'USER_REQUESTED_ERASURE',
        new Date().toISOString(),
        new Date().toISOString(),
      ).run();
      const decision = await resolveWriteAdmissionFromD1(sqlite.db, 'uid_active_without_block');
      assert.equal(decision.status, 'UNAVAILABLE');
    });

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
        /no such table:\s*account_write_blocks/i,
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
      const env: WorkerEnv = {
        USER_DB: userSqlite.db,
        DB: userSqlite.db,
        RESEARCH_DB: researchSqlite.db,
        MEDIA_BUCKET: createMinimalR2Bucket(),
        R2_MEDIA_BUCKET_NAME: 'radar-tehran-media',
        RESEARCH_HMAC_SECRET: TEST_HMAC_SECRET,
        INTERNAL_LIFECYCLE_RPC_SECRET: TEST_RPC_SECRET,
        LIFECYCLE_RECEIPT_HMAC_SECRET: TEST_RECEIPT_SECRET,
      };

      await upsertUserProfileInD1(userSqlite.db, { uid, displayName: 'مریم' });
      const sessionToken = await createNativeSessionForTest(userSqlite.db, uid, 'sess_drain_1');
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
              cookie: `${RADAR_SESSION_COOKIE}=${sessionToken}`,
              origin: 'https://radartehran.ir',
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
            headers: { cookie: `${RADAR_SESSION_COOKIE}=${sessionToken}`, origin: 'https://radartehran.ir' },
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
    });
  });

  describe('D1 failure-result fail-closed regressions', () => {
    it('reconciles a completed outbox when the previous invocation missed the parent-job update', async () => {
      const userSqlite = createForensicSqliteD1();
      const researchSqlite = createForensicSqliteD1();
      applyMigrations(userSqlite.raw, 'migrations/user-d1');
      applyMigrations(researchSqlite.raw, 'migrations/research-d1');
      const nowMs = 1_795_000_000_000;
      const nowIso = new Date(nowMs).toISOString();
      const uid = 'uid_outbox_parent_recovery';
      const jobId = 'adel_outbox_parent_recovery';

      await userSqlite.db.prepare(
        `INSERT INTO account_deletion_jobs (
          job_id, uid, idempotency_key, status, stage, requested_by_uid, reason,
          created_at_iso, updated_at_iso
        ) VALUES (?1, ?2, ?3, 'PENDING_RESEARCH_ERASURE', 'RESEARCH_ERASURE_OUTBOX', ?4, ?5, ?6, ?7)`,
      ).bind(
        jobId, uid, 'idem_outbox_parent_recovery', uid, 'USER_REQUESTED_ERASURE', nowIso, nowIso,
      ).run();
      await userSqlite.db.prepare(
        `INSERT INTO research_erasure_outbox (
          outbox_id, job_id, subject_key, subject_key_version, status,
          attempt_count, next_retry_at_ms, receipt_id, erased_events_count,
          created_at_iso, updated_at_iso, completed_at_iso
        ) VALUES (?1, ?2, ?3, ?4, 'COMPLETED', 1, 0, ?5, 7, ?6, ?6, ?6)`,
      ).bind(
        'outbox_parent_recovery', jobId, 'subject_key_1234567890', 'v1',
        'research_receipt_1', nowIso,
      ).run();

      await processPendingResearchErasureOutbox({
        userDb: userSqlite.db,
        researchDb: researchSqlite.db,
        receiptSecret: TEST_RECEIPT_SECRET,
        nowMs,
      });

      const job = userSqlite.raw.prepare(
        'SELECT status FROM account_deletion_jobs WHERE job_id = ?',
      ).get(jobId) as { status: string };
      assert.equal(job.status, 'COMPLETED');

      const receipt = userSqlite.raw.prepare(
        `SELECT deleted_records_count, evidence_json
         FROM account_lifecycle_receipts
         WHERE job_id = ? AND stage = 'RESEARCH_ERASURE_CONFIRMED'`,
      ).get(jobId) as { deleted_records_count: number; evidence_json: string };
      assert.equal(receipt.deleted_records_count, 7);
      assert.deepEqual(JSON.parse(receipt.evidence_json), {
        completedOutboxItems: 1,
        erasedEventsTotal: 7,
      });
    });
    it('binds signed R2 URLs to safe object paths, MIME types, methods, and bounded expiry', async () => {
      const nowSeconds = 1_795_000_000;
      const signingSecret = 'test-r2-signing-secret-0123456789';
      const params = {
        objectId: 'media_12345678',
        objectKey: 'listings/tehran/hood-1001/image/2026-11/media_12345678.jpg',
        method: 'GET' as const,
        mimeType: 'image/jpeg',
        expiresInSeconds: 3600,
        signingSecret,
        nowSeconds,
      };
      const signed = await createSignedR2MediaUrl(params);
      assert.equal(await verifySignedR2MediaUrl({
        objectId: params.objectId,
        objectKey: params.objectKey,
        method: params.method,
        mimeType: params.mimeType,
        expSeconds: signed.expiresAtSeconds,
        signatureHex: signed.signatureHex,
        signingSecret,
        nowSeconds,
      }), true);
      assert.equal(await verifySignedR2MediaUrl({
        objectId: params.objectId,
        objectKey: params.objectKey,
        method: params.method,
        mimeType: params.mimeType,
        expSeconds: signed.expiresAtSeconds + 1,
        signatureHex: signed.signatureHex,
        signingSecret,
        nowSeconds,
      }), false);
      await assert.rejects(
        () => createSignedR2MediaUrl({ ...params, objectKey: 'listings/../private/media_12345678.jpg' }),
        /MEDIA_OBJECT_KEY_INVALID/,
      );
      await assert.rejects(
        () => createSignedR2MediaUrl({ ...params, expiresInSeconds: Number.NaN }),
        /MEDIA_SIGNING_TIME_INVALID/,
      );
    });

    it('rejects unsafe R2 key components instead of silently coercing them', () => {
      const validKey = buildR2MediaObjectKey({
        city: 'TEHRAN',
        hoodId: 1001,
        mediaType: 'image',
        mimeType: 'image/jpeg',
        objectId: 'media_12345678',
      });
      assert.match(validKey, /^listings\/tehran\/hood-1001\/image\/\d{4}-\d{2}\/media_12345678\.jpg$/);
      assert.throws(() => buildR2MediaObjectKey({
        city: 'unknown-city',
        hoodId: 1,
        mediaType: 'image',
        mimeType: 'image/jpeg',
        objectId: 'media_12345678',
      }), /MEDIA_CITY_ID_UNSUPPORTED/);
      assert.throws(() => buildR2MediaObjectKey({
        city: 'tehran',
        hoodId: 0,
        mediaType: 'image',
        mimeType: 'image/jpeg',
        objectId: 'media_12345678',
      }), /MEDIA_NEIGHBORHOOD_ID_INVALID/);
      assert.throws(() => buildR2MediaObjectKey({
        city: 'tehran',
        hoodId: 1,
        mediaType: 'image',
        mimeType: 'image/jpeg',
        objectId: '../secret',
      }), /MEDIA_OBJECT_ID_INVALID/);
      assert.throws(() => buildR2MediaObjectKey({
        city: 'tehran',
        hoodId: 1,
        mediaType: 'image',
        mimeType: 'application/octet-stream',
        objectId: 'media_12345678',
      }), /MEDIA_MIME_TYPE_UNSUPPORTED/);
    });

    it('fails closed when the legal-hold index read is unsuccessful', async () => {
      const sqlite = createForensicSqliteD1();
      applyMigrations(sqlite.raw, 'migrations/user-d1');
      sqlite.setFailResultOnSqlContains('SELECT active, reason FROM legal_holds');
      await assert.rejects(
        () => isObjectUnderLegalHold(sqlite.db, 'object_legal_hold_read_failure'),
        /LEGAL_HOLD_LOOKUP_FAILED/,
      );
    });

    it('treats malformed retention timestamps as active retention locks', async () => {
      const sqlite = createForensicSqliteD1();
      applyMigrations(sqlite.raw, 'migrations/user-d1');
      sqlite.raw.prepare(
        `INSERT INTO media_objects (
          object_id, owner_uid, bucket_name, storage_key, city_id, hood_id,
          media_type, mime_type, size_bytes, sha256_checksum, lifecycle_state,
          deletion_state, legal_hold, retention_until, created_at_iso, updated_at_iso
        ) VALUES (?, ?, 'radar-test', ?, 'tehran', 1, 'image', 'image/jpeg', 100,
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'ACTIVE', 'ACTIVE', 0, ?, ?, ?)`,
      ).run(
        'object_bad_retention',
        'uid_retention',
        'listings/tehran/hood-1/image/test/object_bad_retention.jpg',
        'not-a-valid-timestamp',
        new Date().toISOString(),
        new Date().toISOString(),
      );
      const result = await isObjectUnderLegalHold(sqlite.db, 'object_bad_retention', Date.now());
      assert.equal(result.held, true);
      assert.equal(result.reason, 'MEDIA_RETENTION_TIMESTAMP_INVALID');
    });

    it('never deletes R2 objects when the D1 ownership scan fails', async () => {
      const userSqlite = createForensicSqliteD1();
      applyMigrations(userSqlite.raw, 'migrations/user-d1');
      userSqlite.setFailResultOnSqlContains('SELECT storage_key FROM media_objects');
      let deleteCalls = 0;
      const mediaBucket = {
        list: async () => ({
          objects: [{
            key: 'listings/orphan-candidate.jpg',
            uploaded: new Date('2026-01-01T00:00:00.000Z'),
            customMetadata: { objectId: 'orphan-candidate' },
          }],
          truncated: false,
        }),
        delete: async () => { deleteCalls += 1; },
      } as unknown as R2Bucket;
      const dispatch = createCanonicalQueueJobDispatcher({
        USER_DB: userSqlite.db,
        MEDIA_BUCKET: mediaBucket,
      });
      const envelope: RadarQueueEnvelope = {
        schemaVersion: '1.0',
        messageId: 'msg_r2_ownership_failure',
        idempotencyKey: 'idem_r2_ownership_failure',
        jobType: 'r2_orphan_media_reconcile',
        createdAtIso: new Date().toISOString(),
        correlationId: 'corr_r2_ownership_failure',
        payload: { nowMs: Date.parse('2026-11-25T12:00:00.000Z'), staleThresholdMs: 1000 },
      };
      await assert.rejects(
        () => dispatch(envelope),
        (err: unknown) => err instanceof QueueJobExecutionError && err.code === 'MEDIA_OBJECT_OWNERSHIP_SCAN_FAILED',
      );
      assert.equal(deleteCalls, 0, 'an unavailable ownership index must never be interpreted as an empty active-object set');
    });

    it('fails closed when a strong durable rate-limit store is missing', async () => {
      const result = await evaluateTieredWorkerRateLimit({
        tier: 'strong_durable',
        action: 'admin_mutation',
        subjectKey: 'admin-user',
        maxRequests: 5,
        windowSeconds: 60,
      });
      assert.equal(result.allowed, false);
      assert.equal(result.tierUsed, 'strong_durable');
    });

    it('enforces strong durable limits atomically under concurrent requests', async () => {
      const sqlite = createForensicSqliteD1({ yieldBeforeFirst: true });
      applyMigrations(sqlite.raw, 'migrations/user-d1');
      const results = await Promise.all(
        Array.from({ length: 20 }, () => evaluateTieredWorkerRateLimit({
          tier: 'strong_durable',
          action: 'research_ingest',
          subjectKey: 'same-user',
          maxRequests: 5,
          windowSeconds: 60,
          db: sqlite.db,
          nowMs: 1_795_000_000_000,
        })),
      );
      assert.equal(results.filter((result) => result.allowed).length, 5);
      assert.equal(results.filter((result) => !result.allowed).length, 15);
      const row = sqlite.raw.prepare(
        'SELECT counter FROM strong_rate_limits WHERE bucket_key = ?',
      ).get('research_ingest:same-user') as { counter: number };
      assert.equal(row.counter, 6, 'the denied counter is capped at maxRequests + 1');
    });

    it('counts concurrent duplicate research ingestion from atomic D1 changes, not optimistic SELECTs', async () => {
      const userSqlite = createForensicSqliteD1();
      const researchSqlite = createForensicSqliteD1({ yieldBeforeBatch: true });
      applyMigrations(userSqlite.raw, 'migrations/user-d1');
      applyMigrations(researchSqlite.raw, 'migrations/research-d1');
      const uid = 'uid_concurrent_research_idempotency';
      await updateUserPrivacyConsentInD1(userSqlite.db, {
        uid,
        actorUid: uid,
        researchAnalyticsConsent: true,
      });
      const params = {
        env: {
          USER_DB: userSqlite.db,
          RESEARCH_DB: researchSqlite.db,
          RESEARCH_HMAC_SECRET: TEST_HMAC_SECRET,
          RESEARCH_HMAC_KEY_VERSION: 'v1',
        },
        uid,
        clientIp: '198.51.100.21',
        rawEvents: [{
          eventType: 'radar.map.neighborhood_select',
          cityId: 'tehran',
          hoodId: 12,
          idempotencyKey: 'concurrent_idempotency_event',
          payload: { mapZoomBucket: 'z14', viewMode: 'buy' },
        }],
      };
      const [first, second] = await Promise.all([
        ingestResearchEventsBatch(params),
        ingestResearchEventsBatch(params),
      ]);
      assert.equal(first.ok, true);
      assert.equal(second.ok, true);
      if (first.ok && second.ok) {
        assert.equal(first.acceptedCount + second.acceptedCount, 1);
        assert.equal(first.deduplicatedCount + second.deduplicatedCount, 1);
      }
      assert.equal(
        (researchSqlite.raw.prepare('SELECT COUNT(*) AS cnt FROM research_events').get() as { cnt: number }).cnt,
        1,
      );
      const receiptTotals = researchSqlite.raw.prepare(
        'SELECT SUM(accepted_count) AS accepted, SUM(deduplicated_count) AS deduplicated FROM research_ingestion_receipts',
      ).get() as { accepted: number; deduplicated: number };
      assert.equal(receiptTotals.accepted, 1);
      assert.equal(receiptTotals.deduplicated, 1);
    });

    it('fails closed when the research subject registry write is unsuccessful', async () => {
      const userSqlite = createForensicSqliteD1();
      const researchSqlite = createForensicSqliteD1();
      applyMigrations(userSqlite.raw, 'migrations/user-d1');
      applyMigrations(researchSqlite.raw, 'migrations/research-d1');
      const uid = 'uid_registry_write_failure';
      await updateUserPrivacyConsentInD1(userSqlite.db, {
        uid,
        actorUid: uid,
        researchAnalyticsConsent: true,
      });
      userSqlite.setFailResultOnSqlContains('INSERT OR IGNORE INTO user_research_subject_registry');
      const result = await ingestResearchEventsBatch({
        env: {
          USER_DB: userSqlite.db,
          RESEARCH_DB: researchSqlite.db,
          RESEARCH_HMAC_SECRET: TEST_HMAC_SECRET,
          RESEARCH_HMAC_KEY_VERSION: 'v1',
        },
        uid,
        clientIp: '198.51.100.20',
        rawEvents: [{
          eventType: 'radar.map.neighborhood_select',
          cityId: 'tehran',
          hoodId: 12,
          idempotencyKey: 'registry_write_failure_event',
          payload: { mapZoomBucket: 'z14', viewMode: 'buy' },
        }],
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.statusCode, 503);
        assert.equal(result.code, 'RESEARCH_SUBJECT_REGISTRY_WRITE_FAILED');
      }
      assert.equal(
        (researchSqlite.raw.prepare('SELECT COUNT(*) AS cnt FROM research_events').get() as { cnt: number }).cnt,
        0,
      );
    });

    it('does not erase research events when impacted aggregation scopes cannot be read', async () => {
      const researchSqlite = createForensicSqliteD1();
      applyMigrations(researchSqlite.raw, 'migrations/research-d1');
      await researchSqlite.db.prepare(
        `INSERT INTO research_events (
          event_id, subject_key, subject_key_version, event_type, schema_version,
          city_id, hood_id, session_bucket, payload_json, occurred_at_iso, ingested_at_iso,
          expires_at_iso, idempotency_key
        ) VALUES ('evt_scope_read_failure', 'sk_v1_test', 'v1', 'radar.map.neighborhood_select',
          1, 'tehran', 12, '2026-11-22', '{}', '2026-11-22T10:00:00.000Z',
          '2026-11-22T10:00:00.000Z', '2027-01-01T00:00:00.000Z', 'idem_scope_read_failure')`,
      ).run();
      researchSqlite.setFailResultOnSqlContains('SELECT DISTINCT event_type, city_id');
      await assert.rejects(
        () => executeResearchSubjectErasure({
          researchDb: researchSqlite.db,
          outboxId: 'outbox_scope_read_failure',
          subjectKey: 'sk_v1_test',
          subjectKeyVersion: 'v1',
        }),
        /RESEARCH_ERASURE_IMPACTED_SCOPE_READ_FAILED/,
      );
      assert.equal(
        (researchSqlite.raw.prepare('SELECT COUNT(*) AS cnt FROM research_events WHERE event_id = ?').get('evt_scope_read_failure') as { cnt: number }).cnt,
        1,
      );
    });

    it('reports retention-purge write failures instead of returning a successful zero-count result', async () => {
      const researchSqlite = createForensicSqliteD1();
      applyMigrations(researchSqlite.raw, 'migrations/research-d1');
      researchSqlite.setFailResultOnSqlContains('DELETE FROM research_events');
      await assert.rejects(
        () => purgeExpiredResearchData({ researchDb: researchSqlite.db }),
        /RESEARCH_RETENTION_PURGE_FAILED/,
      );
    });

    it('audits each changed consent flag and prevents concurrent revision collapse', async () => {
      const auditSqlite = createForensicSqliteD1();
      applyMigrations(auditSqlite.raw, 'migrations/user-d1');
      const uid = 'uid_all_consent_audit';
      const updated = await updateUserPrivacyConsentInD1(auditSqlite.db, {
        uid,
        actorUid: uid,
        researchAnalyticsConsent: true,
        behavioralTelemetryConsent: true,
        marketingCommunicationsConsent: true,
      });
      assert.equal(updated.consentRevision, 1);
      const auditRows = auditSqlite.raw.prepare(
        'SELECT consent_type, previous_value, new_value, consent_revision FROM user_privacy_consent_audit WHERE uid = ? ORDER BY consent_type',
      ).all(uid) as Array<{ consent_type: string; previous_value: number; new_value: number; consent_revision: number }>;
      assert.deepEqual(auditRows.map((row) => row.consent_type).sort(), [
        'behavioral_telemetry_consent',
        'marketing_communications_consent',
        'research_analytics_consent',
      ]);
      assert.ok(auditRows.every((row) => row.previous_value === 0 && row.new_value === 1 && row.consent_revision === 1));

      const concurrentSqlite = createForensicSqliteD1({ yieldBeforeFirst: true });
      applyMigrations(concurrentSqlite.raw, 'migrations/user-d1');
      await updateUserPrivacyConsentInD1(concurrentSqlite.db, {
        uid: 'uid_consent_cas',
        actorUid: 'uid_consent_cas',
        researchAnalyticsConsent: true,
      });
      concurrentSqlite.setYieldBeforeBatch(true);
      const concurrent = await Promise.allSettled([
        updateUserPrivacyConsentInD1(concurrentSqlite.db, {
          uid: 'uid_consent_cas',
          actorUid: 'uid_consent_cas',
          researchAnalyticsConsent: false,
        }),
        updateUserPrivacyConsentInD1(concurrentSqlite.db, {
          uid: 'uid_consent_cas',
          actorUid: 'uid_consent_cas',
          behavioralTelemetryConsent: true,
        }),
      ]);
      assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
      const rejected = concurrent.find((result) => result.status === 'rejected');
      assert.ok(rejected && rejected.status === 'rejected');
      assert.match(String(rejected.reason), /CONSENT_REVISION_CONFLICT/);
      const finalRow = concurrentSqlite.raw.prepare(
        'SELECT consent_revision FROM user_privacy_consents WHERE uid = ?',
      ).get('uid_consent_cas') as { consent_revision: number };
      assert.equal(finalRow.consent_revision, 2);
    });

    it('does not reset a corrupt consent revision to a lower value', async () => {
      const sqlite = createForensicSqliteD1();
      applyMigrations(sqlite.raw, 'migrations/user-d1');
      sqlite.raw.prepare(
        `INSERT INTO user_privacy_consents (
          uid, research_analytics_consent, behavioral_telemetry_consent,
          marketing_communications_consent, consent_version, consent_revision,
          consent_source, granted_at_iso, revoked_at_iso, updated_at_iso
        ) VALUES (?, 1, 0, 0, 'v1', 'not-a-number', 'test', ?, NULL, ?)`,
      ).run('uid_corrupt_consent_revision', new Date().toISOString(), new Date().toISOString());
      await assert.rejects(
        () => updateUserPrivacyConsentInD1(sqlite.db, {
          uid: 'uid_corrupt_consent_revision',
          actorUid: 'uid_corrupt_consent_revision',
          researchAnalyticsConsent: false,
        }),
        /CONSENT_REVISION_INVALID/,
      );
    });

    it('blocks account writes when the write-block lookup returns success=false', async () => {
      const sqlite = createForensicSqliteD1();
      applyMigrations(sqlite.raw, 'migrations/user-d1');
      sqlite.setFailResultOnSqlContains('SELECT uid FROM account_write_blocks');
      await assert.rejects(
        () => upsertUserProfileInD1(sqlite.db, { uid: 'uid_write_block_lookup_failure', displayName: 'Blocked' }),
        /ACCOUNT_WRITE_BLOCK_CHECK_UNAVAILABLE/,
      );
      assert.equal(
        (sqlite.raw.prepare('SELECT COUNT(*) AS cnt FROM user_profiles').get() as { cnt: number }).cnt,
        0,
      );
    });

    it('does not convert unsuccessful D1 reads into missing rows', async () => {
      const sqlite = createForensicSqliteD1();
      sqlite.setFailResultOnSqlContains('SELECT 1');
      await assert.rejects(
        () => d1FirstRow(sqlite.db, 'SELECT 1'),
        /D1_QUERY_FAILED/,
      );
    });

    it('fails closed when active mutation permit count cannot be read', async () => {
      const sqlite = createForensicSqliteD1();
      applyMigrations(sqlite.raw, 'migrations/user-d1');
      sqlite.setFailResultOnSqlContains('SELECT COUNT(*) AS cnt FROM account_mutation_permits');
      await assert.rejects(
        () => countActiveMutationPermitsInD1(sqlite.db, 'uid_permit_count_failure'),
        /ACCOUNT_MUTATION_PERMIT_COUNT_UNAVAILABLE/,
      );
    });

    it('keeps active mutation permits valid for the maximum Worker request lifetime', async () => {
      const sqlite = createForensicSqliteD1();
      applyMigrations(sqlite.raw, 'migrations/user-d1');
      const nowMs = 1_795_000_000_000;
      const permit = await acquireMutationPermitInD1({
        userDb: sqlite.db,
        uid: 'uid_long_running_mutation',
        operationName: 'long_upload',
        ttlMs: 15 * 60_000,
        nowMs,
      });
      assert.equal(permit.ok, true);
      if (!permit.ok) return;
      assert.equal(permit.expiresAtMs - nowMs, 15 * 60_000);
      assert.equal(await countActiveMutationPermitsInD1(sqlite.db, permit.uid, nowMs + 14 * 60_000), 1);
      assert.equal(await countActiveMutationPermitsInD1(sqlite.db, permit.uid, nowMs + 15 * 60_000), 0);
    });

    it('does not misclassify a failed permit insert as an account write block', async () => {
      const sqlite = createForensicSqliteD1();
      applyMigrations(sqlite.raw, 'migrations/user-d1');
      sqlite.setFailResultOnSqlContains('INSERT INTO account_mutation_permits');
      await assert.rejects(
        () => acquireMutationPermitInD1({
          userDb: sqlite.db,
          uid: 'uid_permit_store_failure',
          operationName: 'test_write',
        }),
        /ACCOUNT_MUTATION_PERMIT_STORE_UNAVAILABLE/,
      );
    });

    it('does not continue account erasure after an unsuccessful registry read or user-table delete', async () => {
      const makeFixture = async () => {
        const userSqlite = createForensicSqliteD1();
        const researchSqlite = createForensicSqliteD1();
        applyMigrations(userSqlite.raw, 'migrations/user-d1');
        applyMigrations(researchSqlite.raw, 'migrations/research-d1');
        const uid = 'uid_erasure_d1_failure';
        await upsertUserProfileInD1(userSqlite.db, { uid, displayName: 'Regression' });
        const env: WorkerEnv = {
          USER_DB: userSqlite.db,
          RESEARCH_DB: researchSqlite.db,
          RESEARCH_HMAC_SECRET: TEST_HMAC_SECRET,
          LIFECYCLE_RECEIPT_HMAC_SECRET: TEST_RECEIPT_SECRET,
        };
        return { userSqlite, env, uid };
      };

      const registryFixture = await makeFixture();
      registryFixture.userSqlite.setFailResultOnSqlContains(
        'SELECT subject_key, subject_key_version FROM user_research_subject_registry',
      );
      await assert.rejects(
        () => executeAccountDeletionLifecycle({
          env: registryFixture.env,
          uid: registryFixture.uid,
          actorUid: registryFixture.uid,
          idempotencyKey: 'idem_registry_read_failure',
        }),
        /RESEARCH_SUBJECT_REGISTRY_READ_FAILED/,
      );
      assert.ok(
        registryFixture.userSqlite.raw.prepare('SELECT uid FROM user_profiles WHERE uid = ?').get(registryFixture.uid),
        'profile must remain when the complete subject-key registry cannot be read',
      );

      const deleteFixture = await makeFixture();
      deleteFixture.userSqlite.setFailResultOnSqlContains('DELETE FROM user_profiles');
      await assert.rejects(
        () => executeAccountDeletionLifecycle({
          env: deleteFixture.env,
          uid: deleteFixture.uid,
          actorUid: deleteFixture.uid,
          idempotencyKey: 'idem_user_delete_failure',
        }),
        /USER_DB_ERASURE_DELETE_FAILED/,
      );
      assert.ok(
        deleteFixture.userSqlite.raw.prepare('SELECT uid FROM user_profiles WHERE uid = ?').get(deleteFixture.uid),
        'profile must not be reported as erased when D1 returns success=false',
      );
      const block = deleteFixture.userSqlite.raw
        .prepare('SELECT job_id FROM account_write_blocks WHERE uid = ?')
        .get(deleteFixture.uid) as { job_id: string } | undefined;
      assert.ok(block, 'write block must remain active after a partial erasure failure');
    });
    it('does not infer an empty research erasure scope from a missing RESEARCH_DB and HMAC key', async () => {
      const userSqlite = createForensicSqliteD1();
      applyMigrations(userSqlite.raw, 'migrations/user-d1');
      const uid = 'uid_research_binding_missing';
      await upsertUserProfileInD1(userSqlite.db, { uid, displayName: 'Regression' });
      const result = await executeAccountDeletionLifecycle({
        env: {
          USER_DB: userSqlite.db,
          LIFECYCLE_RECEIPT_HMAC_SECRET: TEST_RECEIPT_SECRET,
        },
        uid,
        actorUid: uid,
        idempotencyKey: 'idem_research_binding_missing',
      });
      assert.equal(result.ok, false);
      assert.equal(result.statusCode, 503);
      assert.match(result.code, /RESEARCH_HMAC_SECRET_MISSING/);
      assert.ok(
        userSqlite.raw.prepare('SELECT uid FROM user_profiles WHERE uid = ?').get(uid),
        'user data must remain while historical research erasure scope is unknown',
      );
      assert.ok(
        userSqlite.raw.prepare('SELECT uid FROM account_write_blocks WHERE uid = ? AND released_at_iso IS NULL').get(uid),
        'write block must remain active until erasure scope can be established',
      );
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
        LIFECYCLE_RECEIPT_HMAC_SECRET: TEST_RECEIPT_SECRET,
      };

      const granted = await updateUserPrivacyConsentInD1(userSqlite.db, {
        uid,
        actorUid: uid,
        researchAnalyticsConsent: true,
      });
      assert.equal(granted.consentRevision, 1);

      // 1. Mid-flight revocation stops new permits, drains the already-issued permit,
      // then erases the event and advances the RESEARCH_DB fence before returning completion.
      let revocationId = '';
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
          const revoked = await revokeUserResearchConsentWithBarrier({ env, uid, actorUid: uid });
          assert.ok(revoked.revocation);
          revocationId = revoked.revocation!.revocationId;
          assert.equal(revoked.revocation!.status, 'DRAINING_PERMITS');
        },
      });
      assert.equal(raceRes.ok, true, 'an already-permitted in-flight writer may finish while revocation drains');
      if (raceRes.ok) assert.equal(raceRes.acceptedCount, 1);
      const finalizedRevocation = await reconcileResearchConsentRevocation({ env, revocationId });
      assert.equal(finalizedRevocation.completed, true);
      const rowsAfterRace = researchSqlite.raw.prepare('SELECT COUNT(*) AS cnt FROM research_events').get() as { cnt: number };
      assert.equal(rowsAfterRace.cnt, 0, 'completed revocation erases the drained in-flight event');

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

      // Missing consentRevision must not downgrade the queued job to a current-consent-only check.
      const missingRevision = makeEnvelope('q_missing_rev', 3);
      missingRevision.payload.consentRevision = undefined;
      await assert.rejects(
        () => dispatch(missingRevision),
        (err: unknown) =>
          err instanceof QueueJobExecutionError &&
          err.code === 'INVALID_RESEARCH_INGEST_PAYLOAD' &&
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

      // Explicit timezone-less timestamps must not be interpreted using runtime-local timezone.
      await assert.rejects(
        () => computeKAnonymousResearchAggregation({
          researchDb: researchSqlite.db,
          eventType: 'radar.map.neighborhood_select',
          cityId: 'tehran',
          hoodId: 10,
          windowStartIso: '2026-11-22T00:00:00.000',
          windowEndIso: '2026-11-23T00:00:00.000Z',
        }),
        (err: unknown) => err instanceof AggregationWindowPolicyError && err.code === 'AGGREGATION_WINDOW_NOT_CANONICAL_UTC',
      );

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
        (err: unknown) => err instanceof AggregationWindowPolicyError && err.code === 'AGGREGATION_WINDOW_NOT_CANONICAL_UTC',
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

      const aggNaN = await computeKAnonymousResearchAggregation({
        researchDb: researchSqlite.db,
        eventType: 'radar.map.neighborhood_select',
        cityId: 'tehran',
        hoodId: 10,
        windowStartIso: '2026-11-22T00:00:00.000Z',
        windowEndIso: '2026-11-23T00:00:00.000Z',
        minCohortSize: Number.NaN,
        nowMs: Date.parse('2026-11-22T12:00:00.000Z'),
      });
      assert.equal(aggNaN.kThreshold, 10);
      assert.equal(aggNaN.kSuppressed, true, 'NaN must not bypass the hard k-anonymity floor');

      // A subject present under two HMAC versions is still one person. Counting both
      // pseudonyms as separate subjects would incorrectly release a cohort of five.
      const rotationSqlite = createForensicSqliteD1();
      applyMigrations(rotationSqlite.raw, 'migrations/research-d1');
      for (let i = 1; i <= 5; i += 1) {
        for (const version of ['v1', 'v2']) {
          const rotatedKey = await deriveResearchSubjectKey({
            uid: `rotation_subject_${i}`,
            secret: TEST_HMAC_SECRET,
            keyVersion: version,
          });
          assert.equal(rotatedKey.ok, true);
          if (!rotatedKey.ok) continue;
          await rotationSqlite.db.prepare(
            `INSERT INTO research_events (
              event_id, subject_key, subject_key_version, event_type, schema_version,
              city_id, hood_id, session_bucket, payload_json, occurred_at_iso,
              ingested_at_iso, expires_at_iso, idempotency_key
            ) VALUES (?1, ?2, ?3, 'radar.map.neighborhood_select', 1, 'tehran', 11,
              '2026-11-22', '{}', ?4, ?4, ?5, ?6)`,
          ).bind(
            `rotation_evt_${i}_${version}`,
            rotatedKey.derived.subjectKey,
            version,
            eventTime,
            expTime,
            `rotation_idem_${i}_${version}`,
          ).run();
        }
      }
      const rotationAgg = await computeKAnonymousResearchAggregation({
        researchDb: rotationSqlite.db,
        eventType: 'radar.map.neighborhood_select',
        cityId: 'tehran',
        hoodId: 11,
        windowStartIso: '2026-11-22T00:00:00.000Z',
        windowEndIso: '2026-11-23T00:00:00.000Z',
        nowMs: Date.parse('2026-11-22T12:00:00.000Z'),
      });
      assert.equal(rotationAgg.kSuppressed, true);
      assert.equal(rotationAgg.distinctSubjectsCount, null);

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
    it('enforces runtime domain isolation and validates physical USER_DB/DB alias parity from Wrangler metadata', () => {
      const dbA = createForensicSqliteD1().db;
      const dbB = createForensicSqliteD1().db;
      const dbC = createForensicSqliteD1().db;

      // Runtime bindings are opaque objects. The canonical USER_DB and RESEARCH_DB
      // are isolated; Miniflare may wrap two aliases to the same physical D1 separately.
      const envDbResearchCollision: WorkerEnv = { USER_DB: dbA, DB: dbB, RESEARCH_DB: dbC };
      assert.equal(hasUserResearchBindingCollision(envDbResearchCollision), false);
      assert.equal(requireUserDb(envDbResearchCollision).ok, true);
      assert.equal(requireResearchDb(envDbResearchCollision).ok, true);

      const envPhysicalResearchCollision: WorkerEnv = { USER_DB: dbA, DB: dbB, RESEARCH_DB: dbA };
      assert.equal(hasUserResearchBindingCollision(envPhysicalResearchCollision), true);
      assert.equal(requireUserDb(envPhysicalResearchCollision).ok, false);
      assert.equal(requireResearchDb(envPhysicalResearchCollision).ok, false);

      const raw = fs.readFileSync(path.join(process.cwd(), 'wrangler.backend.jsonc'), 'utf-8');
      const base = parseJsonc(raw, 'wrangler.backend.jsonc');
      const baseUser = base.d1_databases.find((d: { binding: string }) => d.binding === 'USER_DB');
      const baseLegacy = base.d1_databases.find((d: { binding: string }) => d.binding === 'DB');
      const baseResearch = base.d1_databases.find((d: { binding: string }) => d.binding === 'RESEARCH_DB');

      // The compatibility alias must match the canonical D1 physical ID and name.
      const aliasIdMismatch = parseJsonc(raw, 'wrangler.backend.jsonc');
      aliasIdMismatch.d1_databases.find((d: { binding: string }) => d.binding === 'DB').database_id = 'different-physical-database-id';
      const aliasIdCheck = validateBackendWranglerConfig(aliasIdMismatch, { skipFsChecks: true });
      assert.equal(aliasIdCheck.ok, false);
      assert.ok(aliasIdCheck.errors.some((e: string) => e.startsWith('USER_DB_AND_DB_ALIAS_MISMATCH')));

      const aliasNameMismatch = parseJsonc(raw, 'wrangler.backend.jsonc');
      aliasNameMismatch.d1_databases.find((d: { binding: string }) => d.binding === 'DB').database_name = 'different-user-database';
      const aliasNameCheck = validateBackendWranglerConfig(aliasNameMismatch, { skipFsChecks: true });
      assert.equal(aliasNameCheck.ok, false);
      assert.ok(aliasNameCheck.errors.some((e: string) => e.startsWith('USER_DB_AND_DB_NAME_MISMATCH')));

      const migrationMismatch = parseJsonc(raw, 'wrangler.backend.jsonc');
      migrationMismatch.d1_databases.find((d: { binding: string }) => d.binding === 'DB').migrations_dir = 'migrations/d1';
      const migrationCheck = validateBackendWranglerConfig(migrationMismatch, { skipFsChecks: true });
      assert.equal(migrationCheck.ok, false);
      assert.ok(migrationCheck.errors.some((e: string) => e.startsWith('USER_DB_AND_DB_MIGRATIONS_DIR_MISMATCH')));

      const physicalDomainCollision = parseJsonc(raw, 'wrangler.backend.jsonc');
      const user = physicalDomainCollision.d1_databases.find((d: { binding: string }) => d.binding === 'USER_DB');
      const research = physicalDomainCollision.d1_databases.find((d: { binding: string }) => d.binding === 'RESEARCH_DB');
      research.database_id = user.database_id;
      const domainCheck = validateBackendWranglerConfig(physicalDomainCollision, { skipFsChecks: true });
      assert.equal(domainCheck.ok, false);
      assert.ok(domainCheck.errors.includes('USER_DB_AND_RESEARCH_DB_SAME_PHYSICAL_ID_FORBIDDEN'));

      assert.ok(baseUser && baseLegacy && baseResearch);
    });

    it('returns 404 for unknown /api/account/* paths and preserves Express field parity aliases', async () => {
      const userSqlite = createForensicSqliteD1();
      applyMigrations(userSqlite.raw, 'migrations/user-d1');
      const uid = 'uid_parity_01';
      const env: WorkerEnv = {
        USER_DB: userSqlite.db,
        DB: userSqlite.db,
        APP_URL: 'https://radartehran.ir',
      };
      await upsertUserProfileInD1(userSqlite.db, { uid, displayName: 'آزمون' });
      const sessionToken = await createNativeSessionForTest(userSqlite.db, uid);

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
            headers: { cookie: `${RADAR_SESSION_COOKIE}=${sessionToken}`, origin: 'https://radartehran.ir', 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: 'کاوه', preferredCityId: 'isfahan' }),
          }),
          env,
        );
        assert.equal(patchProfile.status, 200, await patchProfile.clone().text());
        const profileJson = (await patchProfile.json()) as { profile: { preferredCity: string } };
        assert.equal(profileJson.profile.preferredCity, 'isfahan');

        // Express aliases privacySafeTelemetryEnabled & receiveMarketingUpdates on PATCH /api/account/privacy
        const patchPrivacy = await workerEntrypoint.fetch(
          new Request('https://radartehran.ir/api/account/privacy', {
            method: 'PATCH',
            headers: { cookie: `${RADAR_SESSION_COOKIE}=${sessionToken}`, origin: 'https://radartehran.ir', 'Content-Type': 'application/json' },
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
            headers: { cookie: `${RADAR_SESSION_COOKIE}=${sessionToken}` },
          }),
          env,
        );
        assert.equal(sessRes.status, 200);
        const sessJson = (await sessRes.json()) as { sessions: unknown[]; items: unknown[] };
        assert.ok(Array.isArray(sessJson.sessions) && Array.isArray(sessJson.items));

        const drRes = await workerEntrypoint.fetch(
          new Request('https://radartehran.ir/api/account/data-requests', {
            headers: { cookie: `${RADAR_SESSION_COOKIE}=${sessionToken}` },
          }),
          env,
        );
        assert.equal(drRes.status, 200);
        const drJson = (await drRes.json()) as { requests: unknown[]; items: unknown[] };
        assert.ok(Array.isArray(drJson.requests) && Array.isArray(drJson.items));
    });
  });
});
