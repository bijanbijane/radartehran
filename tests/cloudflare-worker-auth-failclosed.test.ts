/**
 * Cloudflare-native session and revocation security regression tests.
 * These tests intentionally contain no Firebase, Firestore, or App Check fixtures.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { authenticateWorkerSession, buildSessionCookie, sha256Hex } from '../worker/auth/sessionAuth';
import { isUserAuthDisabledOrRevoked, recordUserRevocationInD1 } from '../worker/auth/authRevocationStore';
import type { D1Database, D1PreparedStatement, WorkerRequestContext } from '../worker/types';

function createUserD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  const wrap = (sql: string, params: unknown[] = []): D1PreparedStatement => ({
    bind(...values: unknown[]) { return wrap(sql, values); },
    async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
      const row = sqlite.prepare(sql).get(...(params as never[])) as Record<string, unknown> | undefined;
      return row ? (column ? row[column] : row) as T : null;
    },
    async all<T = Record<string, unknown>>() {
      return { results: sqlite.prepare(sql).all(...(params as never[])) as T[], success: true };
    },
    async run() {
      const result = sqlite.prepare(sql).run(...(params as never[])) as { changes?: number | bigint };
      return { success: true, meta: { changes: Number(result.changes || 0) } };
    },
  });
  const db: D1Database = {
    prepare: (sql) => wrap(sql),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    async exec(sql) { sqlite.exec(sql); return { count: 1, duration: 0 }; },
  };
  const directory = path.resolve(process.cwd(), 'migrations/user-d1');
  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(directory, file), 'utf8'));
  }
  return db;
}

async function seedSession(db: D1Database, options: { uid?: string; email?: string; token?: string } = {}) {
  const uid = options.uid || 'uid_session_test';
  const token = options.token || `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
  const now = new Date().toISOString();
  await db.prepare(
    "INSERT INTO user_profiles (uid, display_name, preferred_city, preferred_language, area_unit, intl_currency, role, account_status, created_at_iso, updated_at_iso) VALUES (?1, 'Test', 'tehran', 'fa', 'sqm', 'USD', 'USER', 'ACTIVE', ?2, ?2)",
  ).bind(uid, now).run();
  const provider = options.email ? 'google' : 'phone';
  const subject = options.email ? `google:${uid}` : '+989120000001';
  await db.prepare(
    "INSERT INTO auth_identities (provider, provider_subject, uid, email, email_verified, phone_e164, created_at_iso, last_authenticated_at_iso) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
  ).bind(provider, subject, uid, options.email || null, options.email ? 1 : 0, options.email ? null : subject, now).run();
  await db.prepare(
    "INSERT INTO user_sessions (session_id, uid, device_label, user_agent_summary, ip_prefix, status, created_at_iso, last_seen_at_iso, token_hash, expires_at_iso, auth_provider) VALUES (?1, ?2, 'test', 'test', '127.0.0', 'ACTIVE', ?3, ?3, ?4, ?5, ?6)",
  ).bind(`sess_${uid}`, uid, now, await sha256Hex(token), new Date(Date.now() + 3600000).toISOString(), provider).run();
  return { uid, token };
}

function context(db: D1Database, request: Request): WorkerRequestContext {
  return {
    request,
    method: request.method,
    pathname: new URL(request.url).pathname,
    url: new URL(request.url),
    env: { USER_DB: db, APP_URL: 'https://radartehran.ir', ADMIN_EMAIL: 'admin@example.com' },
    environment: 'production',
    executionCtx: { waitUntil: () => undefined } as never,
  } as WorkerRequestContext;
}

describe('Cloudflare-native identity and session security', () => {
  it('rejects bearer tokens and missing opaque session cookies', async () => {
    const db = createUserD1();
    const bearerOnly = new Request('https://radartehran.ir/api/account/profile', {
      headers: { Authorization: 'Bearer arbitrary-token' },
    });
    const result = await authenticateWorkerSession(context(db, bearerOnly));
    assert.equal(result.authenticated, false);
    assert.equal(result.statusCode, 401);
  });

  it('authenticates a valid D1 session and sets secure HttpOnly cookie attributes', async () => {
    const db = createUserD1();
    const { uid, token } = await seedSession(db, { email: 'admin@example.com' });
    const request = new Request('https://radartehran.ir/api/account/profile', {
      headers: { Cookie: `__Host-radar_session=${token}` },
    });
    const result = await authenticateWorkerSession(context(db, request));
    assert.equal(result.authenticated, true);
    assert.equal(result.uid, uid);
    assert.equal(result.isAdmin, true);
    const cookie = buildSessionCookie(token, 3600);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
  });

  it('rejects cross-origin state-changing requests even with a valid cookie', async () => {
    const db = createUserD1();
    const { token } = await seedSession(db);
    const request = new Request('https://radartehran.ir/api/account/profile', {
      method: 'PATCH',
      headers: { Cookie: `__Host-radar_session=${token}`, Origin: 'https://attacker.example' },
    });
    const result = await authenticateWorkerSession(context(db, request), true);
    assert.equal(result.authenticated, false);
    assert.equal(result.statusCode, 403);
    assert.equal(result.reasonCode, 'CSRF_ORIGIN_REJECTED');
  });

  it('enforces D1 revocation watermarks and disabled-user state', async () => {
    const db = createUserD1();
    const { uid } = await seedSession(db);
    const disabled = await recordUserRevocationInD1({
      db, uid, action: 'DISABLE_USER', actorUid: 'admin', reason: 'test', idempotencyKey: 'disable-test-1',
    });
    assert.equal(disabled.applied, true);
    const result = await isUserAuthDisabledOrRevoked(uid, Math.floor(Date.now() / 1000), db);
    assert.equal(result.revoked, true);
    assert.equal(result.reason, 'USER_ACCOUNT_DISABLED');
  });
});
