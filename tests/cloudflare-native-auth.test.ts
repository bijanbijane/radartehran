import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authenticateWorkerSession, RADAR_SESSION_COOKIE } from '../worker/auth/sessionAuth';
import type { D1Database, D1PreparedStatement, WorkerRequestContext, WorkerEnv } from '../worker/types';

type SessionRow = Record<string, unknown>;

function makeD1(row: SessionRow | null): D1Database {
  const db = {
    prepare(_sql: string): D1PreparedStatement {
      const statement = {
        bind(..._values: unknown[]) { return statement as unknown as D1PreparedStatement; },
        async first<T = Record<string, unknown>>(): Promise<T | null> { return row as T | null; },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T = Record<string, unknown>>() { return { results: row ? [row as T] : [], success: true }; },
      };
      return statement as unknown as D1PreparedStatement;
    },
    async batch() { return []; },
    async exec() { return { count: 0, duration: 0 }; },
  };
  return db as unknown as D1Database;
}

function makeContext(db: D1Database | undefined, token = 'A'.repeat(64)): WorkerRequestContext {
  const request = new Request('https://radartehran.ir/api/auth/session', {
    headers: token ? { cookie: `${RADAR_SESSION_COOKIE}=${token}` } : {},
  });
  const env: WorkerEnv = { USER_DB: db, APP_URL: 'https://radartehran.ir' };
  return {
    request,
    env,
    url: new URL(request.url),
    requestId: 'test-request',
    correlationId: 'test-correlation',
    method: 'GET',
    pathname: '/api/auth/session',
    clientIp: '192.0.2.10',
    trustedEdgeIp: true,
    environment: 'test',
    startedAtMs: Date.now(),
    routeId: 'test-auth-session',
    implementationId: 'cloudflare-native-auth',
  };
}

function sessionRow(overrides: SessionRow = {}): SessionRow {
  const createdAt = new Date(Math.floor((Date.now() - 60_000) / 1000) * 1000).toISOString();
  return {
    session_id: 'session-test-1',
    uid: 'usr_test_1',
    created_at_iso: createdAt,
    last_seen_at_iso: new Date().toISOString(),
    expires_at_iso: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    auth_provider: 'google',
    account_status: 'ACTIVE',
    revocation_watermark: null,
    email: 'verified@example.com',
    email_verified: 1,
    delegated_admin: 0,
    ...overrides,
  };
}

describe('Cloudflare-native session authentication', () => {
  it('accepts a valid D1-backed opaque session', async () => {
    const result = await authenticateWorkerSession(makeContext(makeD1(sessionRow())));
    assert.equal(result.authenticated, true);
    assert.equal(result.uid, 'usr_test_1');
    assert.equal(result.email, 'verified@example.com');
    assert.equal(result.authProvider, 'google');
    assert.equal(result.statusCode, 200);
  });

  it('rejects a disabled-account watermark even when the profile row is active', async () => {
    const result = await authenticateWorkerSession(makeContext(makeD1(sessionRow({ revocation_watermark: 'DISABLED' }))));
    assert.equal(result.authenticated, false);
    assert.equal(result.reasonCode, 'USER_ACCOUNT_DISABLED');
    assert.equal(result.statusCode, 401);
  });

  it('rejects sessions issued in the same Unix second as the revocation watermark', async () => {
    const createdAtMs = Date.now() - 2_000;
    const createdAtSeconds = Math.floor(createdAtMs / 1000);
    const result = await authenticateWorkerSession(makeContext(makeD1(sessionRow({
      created_at_iso: new Date(createdAtMs + 850).toISOString(),
      revocation_watermark: String(createdAtSeconds),
    }))));
    assert.equal(result.authenticated, false);
    assert.equal(result.reasonCode, 'SESSION_REVOKED');
  });

  it('accepts a session created strictly after a valid revocation watermark', async () => {
    const createdAtMs = Date.now() - 1_000;
    const result = await authenticateWorkerSession(makeContext(makeD1(sessionRow({
      created_at_iso: new Date(createdAtMs).toISOString(),
      revocation_watermark: String(Math.floor(createdAtMs / 1000) - 2),
    }))));
    assert.equal(result.authenticated, true);
  });

  it('fails closed on malformed revocation watermarks', async () => {
    const result = await authenticateWorkerSession(makeContext(makeD1(sessionRow({ revocation_watermark: 'not-a-timestamp' }))));
    assert.equal(result.authenticated, false);
    assert.equal(result.reasonCode, 'SESSION_REVOKED');
    assert.equal(result.statusCode, 401);
  });

  it('returns 503 when the canonical USER_DB binding is unavailable', async () => {
    const result = await authenticateWorkerSession(makeContext(undefined));
    assert.equal(result.authenticated, false);
    assert.equal(result.reasonCode, 'USER_DB_UNAVAILABLE');
    assert.equal(result.statusCode, 503);
  });
});
