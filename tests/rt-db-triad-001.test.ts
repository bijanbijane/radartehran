/**
 * @file tests/rt-db-triad-001.test.ts
 * @description Comprehensive Real-SQLite (node:sqlite) & Contract Verification Suite for RT-DB-TRIAD-001.
 *
 * Verifies:
 *  - Section 12.1: USER_DB migrations, account CRUD, write blocks, mutation permits, RPC nonces,
 *    atomic auth revocation rollback & idempotency conflict (409), JSON->D1 migration parity, legal hold.
 *  - Section 12.2: Isolated RESEARCH_DB migrations, zero-PII schema, server-side consent enforcement,
 *    strict allowlist & PII rejection, HMAC-SHA256 pseudonymization & key rotation, deduplication,
 *    rate limiting, Outbox->Inbox erasure with transient failure recovery, retention purge, k-anonymity.
 *  - Section 12.3: Read-only IRNI Neighborhood Reference Client (BLOCKED_EXTERNAL_IRNI_CONTRACT,
 *    GET-only contract, timeout, retry, circuit breaker, schema validation, KV cache prefix/stale policy,
 *    405 on write methods, zero direct D1 binding).
 *  - Section 12.4: Config validator invariants, Worker import graph purity, zero IRNI D1 binding/SQL.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { parseJsonc } from '../scripts/cloudflare/jsoncUtils.mjs';
import { validateBackendWranglerConfig } from '../scripts/cloudflare/validate-backend-config.mjs';
import { migrateAccountAdminStateToUserD1 } from '../server/modules/account-admin/jsonToD1Migrator';
import type { PersistedAccountAdminState } from '../server/modules/account-admin/accountAdminRepository';
import {
  AccountWriteBlockedError,
  createUserDataRequestInD1,
  getUserPrivacyConsentFromD1,
  getUserProfileFromD1,
  listUserDataRequestsFromD1,
  listUserFavoritesFromD1,
  listUserSessionsFromD1,
  revokeUserSessionInD1,
  updateUserPrivacyConsentInD1,
  upsertUserFavoriteInD1,
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
  releaseMutationPermitInD1,
} from '../worker/account-lifecycle/d1MutationPermit';
import {
  executeAccountDeletionLifecycle,
  processPendingResearchErasureOutbox,
} from '../worker/account-lifecycle/workerLifecycleRuntime';
import { isTokenRevokedOrUserDisabled, recordUserRevocationInD1 } from '../worker/auth/firebaseEdgeAuth';
import {
  getTriadDomainBindingDiagnostics,
  requireResearchDb,
  requireUserDb,
  resolveResearchDb,
  resolveUserDb,
} from '../worker/db/bindingResolver';
import workerEntrypoint from '../worker/index';
import { inspectD1OperationalDiagnostics, USER_D1_MIGRATION_FILES } from '../worker/db/d1SchemaAndMigrations';
import {
  IRNI_KV_CACHE_PREFIX,
  IrniNeighborhoodReferenceClient,
} from '../worker/irni/irniNeighborhoodClient';
import {
  deriveAllSubjectKeysForErasure,
  deriveResearchSubjectKey,
} from '../worker/research/pseudonymizer';
import { validateAndMinimizeResearchEvent } from '../worker/research/researchEventContract';
import {
  computeKAnonymousResearchAggregation,
  executeResearchSubjectErasure,
  ingestResearchEventsBatch,
  purgeExpiredResearchData,
} from '../worker/research/researchService';
import type { D1Database, D1PreparedStatement, KVNamespace, WorkerEnv } from '../worker/types';

/**
 * Real SQLite-backed Cloudflare D1 adapter using Node 22 `node:sqlite` (`DatabaseSync`)
 * with true SQLite `BEGIN / COMMIT / ROLLBACK` transactional `batch()` semantics.
 */
function createRealSqliteD1(options: { failOnSqlContains?: string } = {}): {
  db: D1Database;
  raw: DatabaseSync;
  setFailOnSqlContains: (pattern: string | null) => void;
} {
  const raw = new DatabaseSync(':memory:');
  let failPattern: string | null = options.failOnSqlContains ?? null;

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

  const makeStmt = (sql: string, boundValues: unknown[] = []): D1PreparedStatement & {
    _sql: string;
    _values: unknown[];
  } => ({
    _sql: sql,
    _values: boundValues,
    bind(...values: unknown[]) {
      return makeStmt(sql, values);
    },
    async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
      const prepared = prepareExpanded(sql, boundValues);
      const stmt = raw.prepare(prepared.sql);
      const row = stmt.get(...(prepared.values as any[])) as Record<string, unknown> | undefined;
      if (!row) return null;
      if (colName) return (row[colName] as T) ?? null;
      return row as T;
    },
    async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }> {
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
  };
}

function applyMigrationDirToSqlite(raw: DatabaseSync, relDir: string): string[] {
  const absDir = path.join(process.cwd(), relDir);
  const files = fs
    .readdirSync(absDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  raw.exec(
    'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TEXT NOT NULL)',
  );
  for (const file of files) {
    const already = raw.prepare('SELECT 1 FROM d1_migrations WHERE name = ?').get(file);
    if (already) continue;
    const sql = fs.readFileSync(path.join(absDir, file), 'utf-8');
    raw.exec(sql);
    raw
      .prepare('INSERT INTO d1_migrations (name, applied_at) VALUES (?, ?)')
      .run(file, new Date().toISOString());
  }
  return files;
}

function createMemoryKv(): { kv: KVNamespace; keys: () => string[]; store: Map<string, string> } {
  const store = new Map<string, string>();
  const kv: KVNamespace = {
    async get(key, options) {
      const val = store.get(key);
      if (val === undefined) return null;
      if (options?.type === 'json') return JSON.parse(val);
      return val;
    },
    async put(key, value) {
      store.set(key, typeof value === 'string' ? value : String(value));
    },
    async delete(key) {
      store.delete(key);
    },
    async list(options) {
      const prefix = options?.prefix ?? '';
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
  return { kv, keys: () => Array.from(store.keys()), store };
}

const TEST_HMAC_SECRET_V1 = 'rt_test_hmac_secret_v1_0123456789abcdef0123456789';
const TEST_HMAC_SECRET_V2 = 'rt_test_hmac_secret_v2_fedcba9876543210fedcba9876';
const TEST_RPC_SECRET = 'fedcba9876543210'.repeat(4);

describe('RT-DB-TRIAD-001: Three Independent Data Domains Integration Suite', () => {
  describe('12.1 USER_DB — Isolation, Account CRUD, Atomic Revocation & JSON->D1 Migration', () => {
    it('applies migrations/user-d1 cleanly and enforces strict binding isolation', async () => {
      const userSqlite = createRealSqliteD1();
      const researchSqlite = createRealSqliteD1();
      const applied = applyMigrationDirToSqlite(userSqlite.raw, 'migrations/user-d1');
      assert.equal(applied.length, 6);
      const migrationDiagnostics = await inspectD1OperationalDiagnostics(userSqlite.db, USER_D1_MIGRATION_FILES);
      assert.equal(migrationDiagnostics.expectedCount, 6);
      assert.equal(migrationDiagnostics.allCanonicalMigrationsApplied, true);
      assert.deepEqual(migrationDiagnostics.pendingMigrations, []);
      // Re-applying migrations must be idempotent
      const reapplied = applyMigrationDirToSqlite(userSqlite.raw, 'migrations/user-d1');
      assert.equal(reapplied.length, 6);

      // Prefer USER_DB over legacy DB
      const bothEnv: WorkerEnv = { USER_DB: userSqlite.db, DB: userSqlite.db, RESEARCH_DB: researchSqlite.db };
      const uRes = requireUserDb(bothEnv);
      assert.equal(uRes.ok, true);
      if (uRes.ok) assert.equal(uRes.bindingUsed, 'USER_DB');

      // Legacy DB fallback works ONLY for USER_DB, NEVER for RESEARCH_DB
      const legacyOnlyEnv: WorkerEnv = { DB: userSqlite.db };
      assert.equal(resolveUserDb(legacyOnlyEnv), userSqlite.db);
      assert.equal(resolveResearchDb(legacyOnlyEnv), undefined);
      const rMissing = requireResearchDb(legacyOnlyEnv);
      assert.equal(rMissing.ok, false);
      if (!rMissing.ok) assert.equal(rMissing.code, 'RESEARCH_DB_NOT_BOUND');

      // Same physical handle bound to USER_DB and RESEARCH_DB fails closed
      const collisionEnv: WorkerEnv = { USER_DB: userSqlite.db, RESEARCH_DB: userSqlite.db };
      const uCollision = requireUserDb(collisionEnv);
      assert.equal(uCollision.ok, false);
      if (!uCollision.ok) assert.equal(uCollision.code, 'DOMAIN_BINDING_ISOLATION_VIOLATION');

      const diag = getTriadDomainBindingDiagnostics(bothEnv);
      assert.equal(diag.userDbBound, true);
      assert.equal(diag.researchDbBound, true);
      assert.equal(diag.irniDirectDbBindingPresent, false);

      // A forbidden out-of-band binding must be visible to diagnostics, never treated as absent.
      const forbiddenBindingEnv: WorkerEnv = { ...bothEnv, NEIGHBORHOOD_DB: userSqlite.db };
      const forbiddenDiag = getTriadDomainBindingDiagnostics(forbiddenBindingEnv);
      assert.equal(forbiddenDiag.irniDirectDbBindingPresent, true);
    });

    it('fails readiness when an out-of-band IRNI D1 binding is present', async () => {
      const userSqlite = createRealSqliteD1();
      applyMigrationDirToSqlite(userSqlite.raw, 'migrations/user-d1');
      const response = await workerEntrypoint.fetch(
        new Request('https://api.example.test/api/health/readiness'),
        {
          ENVIRONMENT: 'production',
          USER_DB: userSqlite.db,
          RESEARCH_DB: createRealSqliteD1().db,
          NEIGHBORHOOD_DB: userSqlite.db,
        },
      );
      assert.equal(response.status, 503);
      const body = await response.json() as { code?: string; state?: string };
      assert.equal(body.code, 'DATA_DOMAIN_ISOLATION_VIOLATION');
      assert.equal(body.state, 'DEGRADED');
    });

    it('persists profile, privacy consent + audit, sessions, favorites, data requests, and enforces write blocks', async () => {
      const userSqlite = createRealSqliteD1();
      applyMigrationDirToSqlite(userSqlite.raw, 'migrations/user-d1');
      const uid = 'uid_persian_user_001';

      const profile = await upsertUserProfileInD1(userSqlite.db, {
        uid,
        displayName: 'سارا تهرانی',
        preferredCity: 'tehran',
        areaUnit: 'sqm',
      });
      assert.equal(profile.displayName, 'سارا تهرانی');
      const fetchedProfile = await getUserProfileFromD1(userSqlite.db, uid);
      assert.equal(fetchedProfile?.preferredCity, 'tehran');

      const defaultConsent = await getUserPrivacyConsentFromD1(userSqlite.db, uid);
      assert.equal(defaultConsent.researchAnalyticsConsent, false);

      const optedIn = await updateUserPrivacyConsentInD1(userSqlite.db, {
        uid,
        actorUid: uid,
        researchAnalyticsConsent: true,
        behavioralTelemetryConsent: true,
      });
      assert.equal(optedIn.researchAnalyticsConsent, true);
      assert.ok(optedIn.grantedAtIso);

      const auditCount = userSqlite.raw
        .prepare('SELECT COUNT(*) AS cnt FROM user_privacy_consent_audit WHERE uid = ?')
        .get(uid) as { cnt: number };
      assert.equal(auditCount.cnt, 1);

      await upsertUserSessionInD1(userSqlite.db, { sessionId: 'sess_1', uid, deviceLabel: 'Chrome macOS' });
      const sessionsBefore = await listUserSessionsFromD1(userSqlite.db, uid);
      assert.equal(sessionsBefore.length, 1);
      assert.equal(sessionsBefore[0].status, 'ACTIVE');

      const rev = await revokeUserSessionInD1(userSqlite.db, { sessionId: 'sess_1', uid, actorUid: uid });
      assert.equal(rev.revoked, true);
      const sessionsAfter = await listUserSessionsFromD1(userSqlite.db, uid);
      assert.equal(sessionsAfter[0].status, 'REVOKED');

      await upsertUserFavoriteInD1(userSqlite.db, { uid, cityId: 'tehran', hoodId: 12, note: 'سعادت‌آباد' });
      const favs = await listUserFavoritesFromD1(userSqlite.db, uid);
      assert.equal(favs.length, 1);
      assert.equal(favs[0].hoodId, 12);

      const dr = await createUserDataRequestInD1(userSqlite.db, { uid, requestType: 'EXPORT' });
      assert.equal(dr.status, 'PENDING');
      const reqs = await listUserDataRequestsFromD1(userSqlite.db, uid);
      assert.equal(reqs.length, 1);

      // Write block & mutation permit enforcement
      const permit = await acquireMutationPermitInD1({ userDb: userSqlite.db, uid, operationName: 'profile_patch' });
      assert.equal(permit.ok, true);
      if (permit.ok) {
        await releaseMutationPermitInD1({ userDb: userSqlite.db, permitId: permit.permitId });
      }
      await blockUserWritesInD1({ userDb: userSqlite.db, uid, jobId: 'adel_test_1' });
      const blockedPermit = await acquireMutationPermitInD1({ userDb: userSqlite.db, uid, operationName: 'profile_patch' });
      assert.equal(blockedPermit.ok, false);
      await assert.rejects(
        () => upsertUserProfileInD1(userSqlite.db, { uid, displayName: 'Blocked Update' }),
        (err: unknown) => err instanceof AccountWriteBlockedError && err.statusCode === 423,
      );
    });

    it('enforces internal RPC HMAC signature and replay nonce rejection', async () => {
      const userSqlite = createRealSqliteD1();
      applyMigrationDirToSqlite(userSqlite.raw, 'migrations/user-d1');
      const nowMs = Date.now();
      const payloadJson = JSON.stringify({ jobId: 'adel_1' });
      const nonce = 'nonce_unique_1234567890abcdef';
      const sig = await signInternalLifecycleRpc({
        secret: TEST_RPC_SECRET,
        issuer: 'radartehran-api',
        nonce,
        timestampMs: nowMs,
        payloadJson,
      });

      const first = await verifyAndConsumeInternalRpcNonce({
        userDb: userSqlite.db,
        secret: TEST_RPC_SECRET,
        issuer: 'radartehran-api',
        nonce,
        timestampMs: nowMs,
        signatureHex: sig,
        payloadJson,
        nowMs,
      });
      assert.equal(first.ok, true);

      // Exact replay must fail with 409
      const replay = await verifyAndConsumeInternalRpcNonce({
        userDb: userSqlite.db,
        secret: TEST_RPC_SECRET,
        issuer: 'radartehran-api',
        nonce,
        timestampMs: nowMs,
        signatureHex: sig,
        payloadJson,
        nowMs,
      });
      assert.equal(replay.ok, false);
      if (!replay.ok) {
        assert.equal(replay.statusCode, 409);
        assert.equal(replay.code, 'INTERNAL_RPC_NONCE_REPLAYED');
      }
    });

    it('executes auth revocation atomically with rollback on watermark failure and detects idempotency conflict (409)', async () => {
      const userSqlite = createRealSqliteD1();
      applyMigrationDirToSqlite(userSqlite.raw, 'migrations/user-d1');

      // 1. Simulate failure on sync_watermarks write -> must ROLLBACK auth_revocation_events too!
      userSqlite.setFailOnSqlContains('INSERT OR REPLACE INTO sync_watermarks');
      const failedRes = await recordUserRevocationInD1({
        db: userSqlite.db,
        uid: 'uid_atomic_test',
        action: 'REVOKE_BEFORE',
        validSinceSeconds: 1_750_000_000,
        actorUid: 'admin_1',
        reason: 'SUSPICIOUS_LOGIN',
        idempotencyKey: 'idem_atomic_001',
      });
      assert.equal(failedRes.applied, false);
      assert.equal(failedRes.statusCode, 503);

      // Verify zero orphan row in auth_revocation_events and zero watermark
      const orphanRow = userSqlite.raw
        .prepare('SELECT COUNT(*) AS cnt FROM auth_revocation_events WHERE idempotency_key = ?')
        .get('idem_atomic_001') as { cnt: number };
      assert.equal(orphanRow.cnt, 0, 'Transaction rollback must remove auth_revocation_events row when sync_watermarks fails');

      // 2. Clear injected failure -> retry with same idempotencyKey MUST succeed cleanly (NOT false replay!)
      userSqlite.setFailOnSqlContains(null);
      const retryRes = await recordUserRevocationInD1({
        db: userSqlite.db,
        uid: 'uid_atomic_test',
        action: 'REVOKE_BEFORE',
        validSinceSeconds: 1_750_000_000,
        actorUid: 'admin_1',
        reason: 'SUSPICIOUS_LOGIN',
        idempotencyKey: 'idem_atomic_001',
      });
      assert.equal(retryRes.applied, true);
      assert.equal(retryRes.idempotentReplay, false);
      assert.equal(retryRes.statusCode, 200);

      // Verify revocation is actually enforced
      const revCheck = await isTokenRevokedOrUserDisabled('uid_atomic_test', 1_749_999_999, userSqlite.db);
      assert.equal(revCheck.revoked, true);

      // 3. Identical replay returns 200 idempotentReplay: true
      const replayRes = await recordUserRevocationInD1({
        db: userSqlite.db,
        uid: 'uid_atomic_test',
        action: 'REVOKE_BEFORE',
        validSinceSeconds: 1_750_000_000,
        actorUid: 'admin_1',
        reason: 'SUSPICIOUS_LOGIN',
        idempotencyKey: 'idem_atomic_001',
      });
      assert.equal(replayRes.applied, true);
      assert.equal(replayRes.idempotentReplay, true);
      assert.equal(replayRes.statusCode, 200);

      // 4. Reusing same idempotencyKey for a DIFFERENT user or action MUST return 409 IDEMPOTENCY_KEY_CONFLICT
      const conflictRes = await recordUserRevocationInD1({
        db: userSqlite.db,
        uid: 'uid_different_user',
        action: 'DISABLE_USER',
        actorUid: 'admin_1',
        reason: 'DIFFERENT_OP',
        idempotencyKey: 'idem_atomic_001',
      });
      assert.equal(conflictRes.applied, false);
      assert.equal(conflictRes.statusCode, 409);
      assert.equal(conflictRes.reason, 'IDEMPOTENCY_KEY_CONFLICT');
    });

    it('migrates account-admin-state.json idempotently into USER_DB with backup and parity check', async () => {
      const userSqlite = createRealSqliteD1();
      applyMigrationDirToSqlite(userSqlite.raw, 'migrations/user-d1');

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-json-d1-'));
      const srcPath = path.join(tmpDir, 'account-admin-state.json');
      const sampleState: PersistedAccountAdminState = {
        schemaVersion: 2,
        profilesByUid: {
          u1: {
            ownerUserId: 'u1',
            displayName: 'علی رضایی',
            phoneMasked: '0912****123',
            preferredCityId: 'tehran',
            preferredPurpose: 'buy',
            activeRoles: ['seeker'],
            activeWorkspaceMode: 'personal',
            subscriptionTier: 'free_explorer',
            version: 1,
            updatedAtIso: '2026-11-20T10:00:00.000Z',
          },
        },
        privacyByUid: {
          u1: {
            profileVisibility: 'private',
            sharePhoneOnlyAfterConsent: true,
            receiveMarketingUpdates: false,
            storeSearchHistoryLocally: true,
            privacySafeTelemetryEnabled: true,
            updatedAtIso: '2026-11-20T10:00:00.000Z',
          },
        },
        channelsByUid: {},
        savedSearchesByUid: {},
        sessionsByUid: {
          u1: [
            {
              sessionId: 'sess_legacy_1',
              uid: 'u1',
              deviceLabelFa: 'Safari iOS',
              browserSummaryFa: 'Mobile Safari',
              lastActiveLabelFa: 'هم‌اکنون',
              isCurrent: true,
              trusted: true,
              tokenDigestPrefix: 'dig_1234',
              revokedAtIso: null,
            },
          ],
        },
        dataRequestsByUid: {},
        adminRoleBindings: { u1: 'content_moderator' },
        adminAuditLogs: [],
        listingModerations: { l1: { listingId: 'l1', status: 'published', moderatorNoteFa: '', moderatedBy: 'admin', updatedAtIso: '2026-11-20T10:00:00.000Z' } },
        disputes: [],
        sensitiveOpExecutions: {},
        updatedAtIso: '2026-11-20T10:00:00.000Z',
      };
      fs.writeFileSync(srcPath, JSON.stringify(sampleState), 'utf-8');

      try {
        const report1 = await migrateAccountAdminStateToUserD1({
          state: sampleState,
          userDb: userSqlite.db,
          sourceFilePath: srcPath,
        });
        assert.equal(report1.allMappedEntitiesMatched, true);
        assert.ok(report1.backupFilePath && fs.existsSync(report1.backupFilePath));
        assert.equal(report1.unconvertedCollections.find((c) => c.collectionName === 'listingModerations')?.recordCount, 1);

        // Idempotent second run must produce exact same counts without duplicate errors
        const report2 = await migrateAccountAdminStateToUserD1({
          state: sampleState,
          userDb: userSqlite.db,
        });
        assert.equal(report2.allMappedEntitiesMatched, true);
        const profileRow = await getUserProfileFromD1(userSqlite.db, 'u1');
        assert.equal(profileRow?.displayName, 'علی رضایی');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('12.2 RESEARCH_DB — Consent Gate, Pseudonymization, PII Rejection, Outbox Erasure & K-Anonymity', () => {
    it('enforces isolated RESEARCH_DB schema (zero PII columns) and strict allowlist/PII rejection', () => {
      const researchSqlite = createRealSqliteD1();
      const applied = applyMigrationDirToSqlite(researchSqlite.raw, 'migrations/research-d1');
      assert.equal(applied.length, 2);

      const cols = researchSqlite.raw.prepare('PRAGMA table_info(research_events)').all() as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name.toLowerCase());
      for (const forbidden of ['uid', 'user_id', 'email', 'phone', 'ip', 'token']) {
        assert.equal(colNames.includes(forbidden), false, `RESEARCH_DB must NEVER contain column "${forbidden}"`);
      }

      // Reject unknown event type
      const unknownEv = validateAndMinimizeResearchEvent({
        eventType: 'radar.hack.unknown',
        idempotencyKey: 'idem_12345678',
        payload: {},
      });
      assert.equal(unknownEv.ok, false);
      if (!unknownEv.ok) assert.equal(unknownEv.code, 'UNKNOWN_RESEARCH_EVENT_TYPE');

      // Reject forbidden PII field & Iranian mobile inside string payload
      const piiFieldEv = validateAndMinimizeResearchEvent({
        eventType: 'radar.map.neighborhood_select',
        idempotencyKey: 'idem_12345679',
        uid: 'raw_uid_leak',
        payload: { mapZoomBucket: 'z14' },
      });
      assert.equal(piiFieldEv.ok, false);
      if (!piiFieldEv.ok) assert.equal(piiFieldEv.code, 'FORBIDDEN_PII_FIELD');

      const phoneInValueEv = validateAndMinimizeResearchEvent({
        eventType: 'radar.map.neighborhood_select',
        idempotencyKey: 'idem_12345680',
        payload: { sourceSurface: '09123456789' },
      });
      assert.equal(phoneInValueEv.ok, false);
      if (!phoneInValueEv.ok) assert.equal(phoneInValueEv.code, 'PII_DETECTED_IN_RESEARCH_PAYLOAD');

      // Reject unexpected extra field not on allowlist
      const extraFieldEv = validateAndMinimizeResearchEvent({
        eventType: 'radar.map.neighborhood_select',
        idempotencyKey: 'idem_12345681',
        payload: { mapZoomBucket: 'z14', freeTextComment: 'secret' },
      });
      assert.equal(extraFieldEv.ok, false);
      if (!extraFieldEv.ok) assert.equal(extraFieldEv.code, 'UNEXPECTED_PAYLOAD_FIELD');
    });

    it('enforces server-side consent from USER_DB, ignores client consent claims, pseudonymizes with HMAC, and deduplicates', async () => {
      const userSqlite = createRealSqliteD1();
      const researchSqlite = createRealSqliteD1();
      applyMigrationDirToSqlite(userSqlite.raw, 'migrations/user-d1');
      applyMigrationDirToSqlite(researchSqlite.raw, 'migrations/research-d1');

      const env: WorkerEnv = {
        USER_DB: userSqlite.db,
        RESEARCH_DB: researchSqlite.db,
        RESEARCH_HMAC_SECRET: TEST_HMAC_SECRET_V1,
        RESEARCH_HMAC_KEY_VERSION: 'v1',
      };
      const uid = 'uid_research_subject_007';

      const validEvent = {
        eventType: 'radar.map.neighborhood_select',
        schemaVersion: 1,
        cityId: 'tehran',
        hoodId: 12,
        idempotencyKey: 'evt_idem_0001',
        payload: { mapZoomBucket: 'z14', viewMode: 'buy' },
      };

      // 1. Without server-side consent -> MUST fail with 403 RESEARCH_CONSENT_REQUIRED
      const denied = await ingestResearchEventsBatch({
        env,
        uid,
        clientIp: '198.51.100.1',
        rawEvents: [validEvent],
      });
      assert.equal(denied.ok, false);
      if (!denied.ok) {
        assert.equal(denied.statusCode, 403);
        assert.equal(denied.code, 'RESEARCH_CONSENT_REQUIRED');
      }

      // 2. Grant server-side consent in USER_DB
      await updateUserPrivacyConsentInD1(userSqlite.db, {
        uid,
        actorUid: uid,
        researchAnalyticsConsent: true,
      });

      const accepted = await ingestResearchEventsBatch({
        env,
        uid,
        clientIp: '198.51.100.1',
        rawEvents: [validEvent],
      });
      assert.equal(accepted.ok, true);
      if (accepted.ok) {
        assert.equal(accepted.acceptedCount, 1);
        assert.equal(accepted.deduplicatedCount, 0);
        // subjectKey MUST NEVER appear in response JSON
        assert.equal('subjectKey' in accepted, false);
        assert.equal(JSON.stringify(accepted).includes('sk_v1_'), false);
      }

      // 3. Verify RESEARCH_DB row has pseudonymized subject_key and ZERO raw UID anywhere
      const storedRows = researchSqlite.raw.prepare('SELECT * FROM research_events').all() as Array<Record<string, unknown>>;
      assert.equal(storedRows.length, 1);
      assert.ok(String(storedRows[0].subject_key).startsWith('sk_v1_'));
      assert.equal(JSON.stringify(storedRows).includes(uid), false, 'Raw UID must NEVER exist in RESEARCH_DB');

      // 4. Duplicate idempotencyKey is cleanly deduplicated
      const dup = await ingestResearchEventsBatch({
        env,
        uid,
        clientIp: '198.51.100.1',
        rawEvents: [validEvent],
      });
      assert.equal(dup.ok, true);
      if (dup.ok) {
        assert.equal(dup.acceptedCount, 0);
        assert.equal(dup.deduplicatedCount, 1);
      }

      // 5. Revoke consent -> subsequent ingest MUST be rejected immediately
      await updateUserPrivacyConsentInD1(userSqlite.db, {
        uid,
        actorUid: uid,
        researchAnalyticsConsent: false,
      });
      const afterRevoke = await ingestResearchEventsBatch({
        env,
        uid,
        clientIp: '198.51.100.1',
        rawEvents: [{ ...validEvent, idempotencyKey: 'evt_idem_0002' }],
      });
      assert.equal(afterRevoke.ok, false);
      if (!afterRevoke.ok) assert.equal(afterRevoke.code, 'RESEARCH_CONSENT_REQUIRED');
    });

    it('connects Account Deletion to UID-free Outbox -> RESEARCH_DB Inbox across rotated keys with transient failure recovery', async () => {
      const userSqlite = createRealSqliteD1();
      const researchSqlite = createRealSqliteD1();
      applyMigrationDirToSqlite(userSqlite.raw, 'migrations/user-d1');
      applyMigrationDirToSqlite(researchSqlite.raw, 'migrations/research-d1');

      const uid = 'uid_erasure_target_42';
      await upsertUserProfileInD1(userSqlite.db, { uid, displayName: 'کاربر آزمایشی' });
      await updateUserPrivacyConsentInD1(userSqlite.db, { uid, actorUid: uid, researchAnalyticsConsent: true });

      // Ingest 1 event under HMAC key v1
      const envV1: WorkerEnv = {
        USER_DB: userSqlite.db,
        RESEARCH_DB: researchSqlite.db,
        RESEARCH_HMAC_SECRET: TEST_HMAC_SECRET_V1,
        RESEARCH_HMAC_KEY_VERSION: 'v1',
      };
      const ing1 = await ingestResearchEventsBatch({
        env: envV1,
        uid,
        clientIp: '198.51.100.2',
        rawEvents: [
          {
            eventType: 'radar.search.query_executed',
            cityId: 'tehran',
            idempotencyKey: 'evt_rot_v1_01',
            payload: { mode: 'buy', hasPriceFilter: true },
          },
        ],
      });
      assert.equal(ing1.ok, true);

      // Rotate key to v2 with v1 in PREVIOUS_SECRETS and ingest 1 event under v2
      const envV2: WorkerEnv = {
        USER_DB: userSqlite.db,
        RESEARCH_DB: researchSqlite.db,
        RESEARCH_HMAC_SECRET: TEST_HMAC_SECRET_V2,
        RESEARCH_HMAC_KEY_VERSION: 'v2',
        RESEARCH_HMAC_PREVIOUS_SECRETS: JSON.stringify({ v1: TEST_HMAC_SECRET_V1 }),
        INTERNAL_LIFECYCLE_RPC_SECRET: TEST_RPC_SECRET,
      };
      const ing2 = await ingestResearchEventsBatch({
        env: envV2,
        uid,
        clientIp: '198.51.100.2',
        rawEvents: [
          {
            eventType: 'radar.valuation.hedonic_estimate',
            cityId: 'tehran',
            idempotencyKey: 'evt_rot_v2_01',
            payload: { sqmBucket: '80_100', mode: 'buy' },
          },
        ],
      });
      assert.equal(ing2.ok, true);

      const allKeys = await deriveAllSubjectKeysForErasure({ uid, env: envV2 });
      assert.equal(allKeys.ok, true);
      if (allKeys.ok) assert.equal(allKeys.keys.length, 2);

      // Simulate transient RESEARCH_DB failure during account deletion!
      researchSqlite.setFailOnSqlContains('DELETE FROM research_events');
      const delPartial = await executeAccountDeletionLifecycle({
        env: envV2,
        uid,
        actorUid: uid,
        idempotencyKey: 'del_job_rot_001',
      });
      // Must NOT claim COMPLETED when RESEARCH_DB erasure failed!
      assert.equal(delPartial.status, 'PENDING_RESEARCH_ERASURE');
      assert.equal(delPartial.statusCode, 202);
      assert.equal(delPartial.outboxItemsQueued, 2);
      assert.equal(delPartial.outboxItemsCompleted, 0);

      // Verify USER_DB PII was purged & auth disabled
      assert.equal(await getUserProfileFromD1(userSqlite.db, uid), null);
      const revCheck = await isTokenRevokedOrUserDisabled(uid, Math.floor(Date.now() / 1000), userSqlite.db);
      assert.equal(revCheck.revoked, true);

      // Verify research_erasure_outbox contains ZERO raw UID
      const outboxRows = userSqlite.raw.prepare('SELECT * FROM research_erasure_outbox').all() as Array<Record<string, unknown>>;
      assert.equal(outboxRows.length, 2);
      assert.equal(JSON.stringify(outboxRows).includes(uid), false, 'Outbox must NEVER store raw UID');

      // Recover RESEARCH_DB and advance clock past retry backoff -> Outbox reconciles & completes job!
      researchSqlite.setFailOnSqlContains(null);
      const retryRes = await processPendingResearchErasureOutbox({
        userDb: userSqlite.db,
        researchDb: researchSqlite.db,
        jobId: delPartial.jobId,
        nowMs: Date.now() + 600_000,
        receiptSecret: TEST_RPC_SECRET,
      });
      assert.equal(retryRes.completed, 2);
      assert.equal(retryRes.pending, 0);
      assert.equal(retryRes.erasedEventsTotal, 2);

      // Verify ZERO events remain in RESEARCH_DB across both v1 and v2
      const remainingResearch = researchSqlite.raw.prepare('SELECT COUNT(*) AS cnt FROM research_events').get() as { cnt: number };
      assert.equal(remainingResearch.cnt, 0);

      // Verify parent deletion job is now COMPLETED with receipt
      const finalJob = userSqlite.raw
        .prepare('SELECT status, receipt_hash FROM account_deletion_jobs WHERE job_id = ?')
        .get(delPartial.jobId) as { status: string; receipt_hash: string };
      assert.equal(finalJob.status, 'COMPLETED');
      assert.ok(finalJob.receipt_hash && finalJob.receipt_hash.length === 64);

      // Verify idempotent Inbox replay on duplicate outbox delivery
      const replayErasure = await executeResearchSubjectErasure({
        researchDb: researchSqlite.db,
        outboxId: String(outboxRows[0].outbox_id),
        subjectKey: String(outboxRows[0].subject_key),
        subjectKeyVersion: String(outboxRows[0].subject_key_version),
      });
      assert.equal(replayErasure.idempotentReplay, true);
    });

    it('fails closed before account deletion when the dedicated lifecycle receipt key is absent', async () => {
      const userSqlite = createRealSqliteD1();
      applyMigrationDirToSqlite(userSqlite.raw, 'migrations/user-d1');
      const uid = 'uid_missing_lifecycle_receipt_key';
      const result = await executeAccountDeletionLifecycle({
        env: {
          USER_DB: userSqlite.db,
          RESEARCH_HMAC_SECRET: TEST_HMAC_SECRET_V1,
        },
        uid,
        actorUid: uid,
        idempotencyKey: 'del_missing_lifecycle_receipt_key',
      });
      assert.equal(result.statusCode, 503);
      assert.equal(result.code, 'INTERNAL_LIFECYCLE_RPC_SECRET_UNAVAILABLE');
      assert.equal(result.userDbDeletedRecords, 0);
      assert.equal(result.jobId, '');
      const jobs = userSqlite.raw.prepare('SELECT COUNT(*) AS cnt FROM account_deletion_jobs').get() as { cnt: number };
      assert.equal(jobs.cnt, 0, 'No deletion job or destructive mutation may begin without the dedicated receipt key.');
    });

    it('enforces Legal Hold blocking account deletion (423)', async () => {
      const userSqlite = createRealSqliteD1();
      applyMigrationDirToSqlite(userSqlite.raw, 'migrations/user-d1');
      const uid = 'uid_under_legal_hold';
      await userSqlite.db
        .prepare('INSERT INTO legal_holds (resource_id, resource_type, reason, active) VALUES (?1, ?2, ?3, 1)')
        .bind(`user:${uid}`, 'account', 'COURT_PRESERVATION_ORDER')
        .run();

      const res = await executeAccountDeletionLifecycle({
        env: { USER_DB: userSqlite.db },
        uid,
        actorUid: uid,
        idempotencyKey: 'del_legal_hold_01',
      });
      assert.equal(res.ok, false);
      assert.equal(res.statusCode, 423);
      assert.equal(res.status, 'BLOCKED_LEGAL_HOLD');
    });

    it('enforces k-anonymity suppression for small cohorts (<10) and retention expiration purge', async () => {
      const researchSqlite = createRealSqliteD1();
      applyMigrationDirToSqlite(researchSqlite.raw, 'migrations/research-d1');
      const nowMs = Date.UTC(2026, 10, 22, 12, 0, 0);
      const windowStartIso = '2026-11-22T00:00:00.000Z';
      const windowEndIso = '2026-11-23T00:00:00.000Z';
      const futureExp = new Date(nowMs + 86_400_000).toISOString();
      const pastExp = new Date(nowMs - 86_400_000).toISOString();

      // Insert 4 distinct subjects for hoodId=5 -> MUST be suppressed (k=10)
      for (let i = 1; i <= 4; i += 1) {
        const sk = await deriveResearchSubjectKey({ uid: `small_u_${i}`, secret: TEST_HMAC_SECRET_V1, keyVersion: 'v1' });
        assert.equal(sk.ok, true);
        if (!sk.ok) continue;
        await researchSqlite.db
          .prepare(
            `INSERT INTO research_events (
              event_id, subject_key, subject_key_version, event_type, schema_version,
              city_id, hood_id, session_bucket, payload_json, occurred_at_iso, ingested_at_iso, expires_at_iso, idempotency_key
            ) VALUES (?1, ?2, 'v1', 'radar.map.neighborhood_select', 1, 'tehran', 5, '2026-11-22', '{}', ?3, ?3, ?4, ?5)`,
          )
          .bind(`ev_sm_${i}`, sk.derived.subjectKey, new Date(nowMs).toISOString(), futureExp, `idem_sm_${i}`)
          .run();
      }

      const smallAgg = await computeKAnonymousResearchAggregation({
        researchDb: researchSqlite.db,
        eventType: 'radar.map.neighborhood_select',
        cityId: 'tehran',
        hoodId: 5,
        windowStartIso,
        windowEndIso,
        minCohortSize: 10,
        nowMs,
      });
      assert.equal(smallAgg.kSuppressed, true);
      assert.equal(smallAgg.distinctSubjectsCount, null);
      assert.equal(smallAgg.eventCount, null);

      // Insert 12 distinct subjects for hoodId=9 -> MUST pass k-anonymity
      for (let i = 1; i <= 12; i += 1) {
        const sk = await deriveResearchSubjectKey({ uid: `big_u_${i}`, secret: TEST_HMAC_SECRET_V1, keyVersion: 'v1' });
        assert.equal(sk.ok, true);
        if (!sk.ok) continue;
        await researchSqlite.db
          .prepare(
            `INSERT INTO research_events (
              event_id, subject_key, subject_key_version, event_type, schema_version,
              city_id, hood_id, session_bucket, payload_json, occurred_at_iso, ingested_at_iso, expires_at_iso, idempotency_key
            ) VALUES (?1, ?2, 'v1', 'radar.map.neighborhood_select', 1, 'tehran', 9, '2026-11-22', '{}', ?3, ?3, ?4, ?5)`,
          )
          .bind(`ev_bg_${i}`, sk.derived.subjectKey, new Date(nowMs).toISOString(), futureExp, `idem_bg_${i}`)
          .run();
      }

      const largeAgg = await computeKAnonymousResearchAggregation({
        researchDb: researchSqlite.db,
        eventType: 'radar.map.neighborhood_select',
        cityId: 'tehran',
        hoodId: 9,
        windowStartIso,
        windowEndIso,
        minCohortSize: 10,
        nowMs,
      });
      assert.equal(largeAgg.kSuppressed, false);
      assert.equal(largeAgg.distinctSubjectsCount, 10); // coarsened floor(12 / 5) * 5 = 10
      assert.equal(largeAgg.eventCount, 10);
      assert.equal(largeAgg.exactCountsWithheld, true);
      assert.equal(largeAgg.provenance.source, 'RESEARCH_DB');
      assert.equal(largeAgg.provenance.dataClassification, 'PSEUDONYMIZED RESEARCH DATA');

      // Insert 1 expired event and run retention purge
      await researchSqlite.db
        .prepare(
          `INSERT INTO research_events (
            event_id, subject_key, subject_key_version, event_type, schema_version,
            city_id, hood_id, session_bucket, payload_json, occurred_at_iso, ingested_at_iso, expires_at_iso, idempotency_key
          ) VALUES ('ev_exp_1', 'sk_v1_expired', 'v1', 'radar.map.neighborhood_select', 1, 'tehran', 9, '2026-01-01', '{}', ?1, ?1, ?1, 'idem_exp_1')`,
        )
        .bind(pastExp)
        .run();

      const purge = await purgeExpiredResearchData({ researchDb: researchSqlite.db, nowMs });
      assert.equal(purge.deletedEventsCount, 1);
    });
  });

  describe('12.3 IRNI Neighborhood Reference Client — Read-Only, Resilience, Cache & Fail-Closed Contract', () => {
    it('fails closed with BLOCKED_EXTERNAL_IRNI_CONTRACT when IRNI URL/token is missing', async () => {
      const unconfigured = new IrniNeighborhoodReferenceClient({});
      assert.equal(unconfigured.isConfigured(), false);
      const res = await unconfigured.getProvinces();
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, 'BLOCKED_EXTERNAL_IRNI_CONTRACT');
        assert.equal(res.statusCode, 503);
        assert.ok((res.requiredExternalPrerequisites?.length ?? 0) >= 2);
      }

      // Worker HTTP route rejects non-GET with 405 IRNI_REFERENCE_READ_ONLY
      const postRes = await workerEntrypoint.fetch(
        new Request('https://radartehran.ir/api/v1/reference/irni/provinces', { method: 'POST' }),
        {},
      );
      assert.equal(postRes.status, 405);
      const postBody = (await postRes.json()) as { code: string };
      assert.equal(postBody.code, 'IRNI_REFERENCE_READ_ONLY');
    });

    it('validates schema, caches under isolated v1:irni_ref: prefix, handles stale/circuit/timeout/retry cleanly', async () => {
      const memKv = createMemoryKv();
      let nowMs = 1_760_000_000_000;
      let calls = 0;
      let mode: 'ok' | 'flaky_once' | 'bad_schema' | 'timeout' | 'down' = 'flaky_once';

      const fakeFetch: typeof fetch = async (input, init) => {
        calls += 1;
        assert.equal(init?.method, 'GET', 'IRNI client must ONLY execute GET');
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers.Authorization, 'Bearer irni_server_secret_token_1234567890');

        if (mode === 'flaky_once' && calls === 1) {
          return new Response('Upstream error', { status: 502 });
        }
        if (mode === 'bad_schema') {
          return new Response(JSON.stringify({ items: [{ bad: true }] }), { status: 200 });
        }
        if (mode === 'timeout') {
          const err = new Error('Timed out');
          err.name = 'TimeoutError';
          throw err;
        }
        if (mode === 'down') {
          return new Response('Service Unavailable', { status: 503 });
        }

        const urlStr = String(input);
        if (urlStr.includes('/v1/neighborhoods/nh_12')) {
          return new Response(
            JSON.stringify({
              item: { id: 'nh_12', cityId: 'tehran', nameFa: 'سعادت‌آباد', districtCode: '2' },
            }),
            { status: 200, headers: { 'x-irni-contract-version': '1.2' } },
          );
        }
        return new Response(
          JSON.stringify({
            items: [{ id: 'prov_08', code: '08', nameFa: 'تهران', nameEn: 'Tehran' }],
            pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1, nextCursor: null },
          }),
          { status: 200, headers: { 'x-irni-contract-version': '1.2' } },
        );
      };

      const client = new IrniNeighborhoodReferenceClient({
        baseUrl: 'https://api.irni.example.ir',
        apiToken: 'irni_server_secret_token_1234567890',
        kv: memKv.kv,
        fetchImpl: fakeFetch,
        nowFn: () => nowMs,
        cacheTtlSeconds: 60,
        staleTtlSeconds: 180,
        maxRetries: 1,
        circuitFailureThreshold: 2,
      });

      // 1. Flaky first 502 recovers via bounded retry -> MISS + cached under v1:irni_ref:
      const prov1 = await client.getProvinces();
      assert.equal(prov1.ok, true);
      assert.equal(calls, 2);
      if (prov1.ok) {
        assert.equal(prov1.data.items[0].nameFa, 'تهران');
        assert.equal(prov1.data.provenance.source, 'IRNI');
        assert.equal(prov1.data.provenance.contractVersion, '1.2');
        assert.equal(prov1.data.provenance.cacheStatus, 'MISS');
      }
      assert.ok(memKv.keys().every((k) => k.startsWith(IRNI_KV_CACHE_PREFIX)));
      assert.ok(memKv.keys().every((k) => !k.startsWith('v1:auth:')));

      // 2. Subsequent call within TTL hits KV cache (0 additional fetch calls)
      const prov2 = await client.getProvinces();
      assert.equal(prov2.ok, true);
      assert.equal(calls, 2);
      if (prov2.ok) assert.equal(prov2.data.provenance.cacheStatus, 'HIT');

      // 3. Advance past fresh TTL into stale window while upstream is down -> serves STALE
      nowMs += 90_000;
      mode = 'down';
      const provStale = await client.getProvinces();
      assert.equal(provStale.ok, true);
      if (provStale.ok) assert.equal(provStale.data.provenance.cacheStatus, 'STALE');

      // 4. Advance past stale window -> MUST reject with IRNI_STALE_DATA_REJECTED
      nowMs += 200_000;
      const provExpired = await client.getProvinces();
      assert.equal(provExpired.ok, false);
      if (!provExpired.ok) assert.equal(provExpired.code, 'IRNI_STALE_DATA_REJECTED');

      // 5. Circuit is now open after consecutive failures -> uncached endpoint returns IRNI_CIRCUIT_OPEN
      const circuitRes = await client.getNeighborhoodById('nh_12');
      assert.equal(circuitRes.ok, false);
      if (!circuitRes.ok) assert.equal(circuitRes.code, 'IRNI_CIRCUIT_OPEN');

      // 6. Advance past circuit cooldown & test schema validation failure (which re-opens circuit), then cooldown & timeout
      nowMs += 60_000;
      mode = 'bad_schema';
      const badSchema = await client.getNeighborhoodById('nh_12');
      assert.equal(badSchema.ok, false);
      if (!badSchema.ok) assert.equal(badSchema.code, 'IRNI_SCHEMA_VALIDATION_FAILED');

      nowMs += 60_000;
      mode = 'timeout';
      const timedOut = await client.getNeighborhoodById('nh_12');
      assert.equal(timedOut.ok, false);
      if (!timedOut.ok) assert.equal(timedOut.code, 'IRNI_REQUEST_TIMEOUT');
    });
  });

  describe('12.4 Config Validator, Staging Isolation & Worker Import Graph Guardrails', () => {
    it('validates wrangler.backend.jsonc and rejects all isolation/IRNI/secret violations', () => {
      const raw = fs.readFileSync(path.join(process.cwd(), 'wrangler.backend.jsonc'), 'utf-8');
      const parsed = parseJsonc(raw, 'wrangler.backend.jsonc');

      assert.equal(parsed.vars.FIREBASE_APP_CHECK_MODE, 'enforced');
      assert.equal(parsed.vars.APP_CHECK_ENFORCEMENT_MODE, undefined);
      assert.equal(parsed.env.staging.vars.FIREBASE_APP_CHECK_MODE, 'monitor');

      const valid = validateBackendWranglerConfig(parsed);
      assert.equal(valid.ok, false, 'Production Cron configuration must fail closed without queue and R2 bindings.');
      assert.ok(!valid.errors.some((e: string) => e.startsWith('UNSUPPORTED_CRON_PATTERN:')));
      assert.ok(valid.errors.includes('CRON_TRIGGERS_REQUIRE_RADAR_QUEUE_PRODUCER'));
      assert.ok(valid.errors.includes('CRON_TRIGGERS_REQUIRE_RADAR_DLQ_PRODUCER'));
      assert.ok(valid.errors.includes('CRON_TRIGGERS_REQUIRE_RADAR_QUEUE_CONSUMER'));
      assert.ok(valid.errors.includes('NIGHTLY_MEDIA_CRON_REQUIRES_MEDIA_BUCKET'));
      assert.equal(valid.summary?.irniDirectBindingPresent, false);
      assert.equal(valid.summary?.stagingProvisioningStatus, 'BLOCKED_STAGING_DATABASES_NOT_PROVISIONED');

      const unsupportedCronConfig = structuredClone(parsed);
      unsupportedCronConfig.triggers.crons.push('*/5 * * * *');
      const unsupportedCron = validateBackendWranglerConfig(unsupportedCronConfig);
      assert.ok(unsupportedCron.errors.includes('UNSUPPORTED_CRON_PATTERN:*/5 * * * *'));

      // A complete queue/DLQ/R2 wiring satisfies the production background-processing contract.
      const fullyBound = structuredClone(parsed);
      fullyBound.queues = {
        producers: [
          { binding: 'RADAR_QUEUE', queue: 'radartehran-api-jobs' },
          { binding: 'RADAR_DLQ', queue: 'radartehran-api-dlq' },
        ],
        consumers: [
          { queue: 'radartehran-api-jobs', dead_letter_queue: 'radartehran-api-dlq' },
        ],
      };
      fullyBound.r2_buckets = [{ binding: 'MEDIA_BUCKET', bucket_name: 'radartehran-api-media' }];
      const completeBackgroundWiring = validateBackendWranglerConfig(fullyBound);
      assert.equal(completeBackgroundWiring.ok, true, completeBackgroundWiring.errors.join(', '));

      // Strict gate fails closed until staging DBs are provisioned
      const strictStaging = validateBackendWranglerConfig(parsed, { requireStagingProvisioned: true });
      assert.equal(strictStaging.ok, false);
      assert.ok(strictStaging.errors.includes('BLOCKED_STAGING_DATABASES_NOT_PROVISIONED'));

      // Rejects direct IRNI D1 binding
      const withIrni = structuredClone(parsed);
      withIrni.d1_databases.push({
        binding: 'NEIGHBORHOOD_DB',
        database_name: 'radar-neighborhood-db',
        database_id: 'f335efe8-37ac-4c7d-a057-bc9f4480f6c6',
      });
      const irniCheck = validateBackendWranglerConfig(withIrni, { skipFsChecks: true });
      assert.equal(irniCheck.ok, false);
      assert.ok(irniCheck.errors.some((e: string) => e.startsWith('IRNI_DIRECT_D1_BINDING_FORBIDDEN')));
      assert.equal(irniCheck.summary?.irniDirectBindingPresent, true);

      // Rejects Staging using Production D1 UUID
      const stagingProdLeak = structuredClone(parsed);
      stagingProdLeak.env.staging.d1_databases = [
        { binding: 'USER_DB', database_name: 'radar-user-db-staging', database_id: 'fbb98e6b-5200-4047-b4bc-15a51c06aa84' },
        { binding: 'DB', database_name: 'radar-user-db-staging', database_id: 'fbb98e6b-5200-4047-b4bc-15a51c06aa84' },
        { binding: 'RESEARCH_DB', database_name: 'radar-researcher-db-staging', database_id: 'a04f9716-fb95-44da-841c-b54be252db70' },
      ];
      const leakCheck = validateBackendWranglerConfig(stagingProdLeak, { skipFsChecks: true });
      assert.equal(leakCheck.ok, false);
      assert.ok(leakCheck.errors.some((e: string) => e.startsWith('STAGING_USES_PRODUCTION_D1_ID_FORBIDDEN')));

      // Rejects plaintext secret inside vars
      const withSecretVar = structuredClone(parsed);
      withSecretVar.vars.RESEARCH_HMAC_SECRET = 'leaked_plaintext_secret';
      const secretCheck = validateBackendWranglerConfig(withSecretVar, { skipFsChecks: true });
      assert.equal(secretCheck.ok, false);
      assert.ok(secretCheck.errors.some((e: string) => e.startsWith('PLAINTEXT_SECRET_IN_VARS_FORBIDDEN')));
    });

    it('verifies worker/** has zero forbidden Node/Express/firebase-admin/JSON-repo imports and zero IRNI D1 bindings', () => {
      const workerRoot = path.join(process.cwd(), 'worker');
      const forbiddenImports = [
        /from\s+['"]express['"]/,
        /from\s+['"]firebase-admin/,
        /from\s+['"]sharp['"]/,
        /from\s+['"]node:fs['"]/,
        /from\s+['"][^'"]*AtomicJsonRepository/,
        /from\s+['"][^'"]*serverMarketPulseEngine/,
        /f335efe8-37ac-4c7d-a057-bc9f4480f6c6/,
      ];

      const walk = (dir: string): string[] => {
        const out: string[] = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) out.push(...walk(full));
          else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(full);
        }
        return out;
      };

      const files = walk(workerRoot);
      assert.ok(files.length > 10);
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const pattern of forbiddenImports) {
          assert.equal(
            pattern.test(content),
            false,
            `Forbidden pattern ${pattern} matched in ${path.relative(process.cwd(), file)}`,
          );
        }
      }
    });
  });
});
