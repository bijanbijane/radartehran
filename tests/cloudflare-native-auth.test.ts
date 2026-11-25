import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authenticateWorkerSession, RADAR_SESSION_COOKIE, readSessionCookie } from '../worker/auth/sessionAuth';
import { consumeGoogleOAuthState } from '../worker/routes/authRoutes';
import { normalizePhone } from '../worker/routes/authRoutes';
import { resolveWorkerAuthContext } from '../worker/auth/authorizationPolicy';
import { authenticateWorkerRouteCompat } from '../worker/auth/routeAuthCompat';
import type { D1Database, D1PreparedStatement, WorkerRequestContext, WorkerEnv } from '../worker/types';

type SessionRow = Record<string, unknown>;

function makeD1(row: SessionRow | null, updateCalls?: { count: number }): D1Database {
  const db = {
    prepare(sql: string): D1PreparedStatement {
      const statement = {
        bind(..._values: unknown[]) { return statement as unknown as D1PreparedStatement; },
        async first<T = Record<string, unknown>>(): Promise<T | null> { return row as T | null; },
        async run() {
          if (/^\s*UPDATE user_sessions SET last_seen_at_iso/i.test(sql)) {
            if (updateCalls) updateCalls.count += 1;
          }
          return { success: true, meta: { changes: 0 } };
        },
        async all<T = Record<string, unknown>>() { return { results: row ? [row as T] : [], success: true }; },
      };
      return statement as unknown as D1PreparedStatement;
    },
    async batch() { return []; },
    async exec() { return { count: 0, duration: 0 }; },
  };
  return db as unknown as D1Database;
}

function makeContext(
  db: D1Database | undefined,
  token = 'A'.repeat(64),
  envOverrides: Partial<WorkerEnv> = {},
): WorkerRequestContext {
  const request = new Request('https://radartehran.ir/api/auth/session', {
    headers: token ? { cookie: `${RADAR_SESSION_COOKIE}=${token}` } : {},
  });
  const env: WorkerEnv = { USER_DB: db, APP_URL: 'https://radartehran.ir', ...envOverrides };
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
    environment: 'development',
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


function makeOAuthStateDb(
  stateHash: string,
  state: { nonce: string; code_verifier: string; return_path: string } | null,
  expiresAtMs: number,
): D1Database {
  let availableState = state;
  const db = {
    prepare(sql: string): D1PreparedStatement {
      const values: unknown[] = [];
      const statement = {
        bind(...bound: unknown[]) {
          values.splice(0, values.length, ...bound);
          return statement as unknown as D1PreparedStatement;
        },
        async first<T = Record<string, unknown>>(): Promise<T | null> {
          assert.match(sql, /DELETE FROM auth_oauth_states[\s\S]*RETURNING nonce, code_verifier, return_path/i);
          const [candidateHash, nowMs] = values;
          if (candidateHash !== stateHash || !availableState || Number(nowMs) < 0 || expiresAtMs <= Number(nowMs)) return null;
          const consumed = availableState;
          availableState = null;
          return consumed as T;
        },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T = Record<string, unknown>>() { return { results: [] as T[], success: true }; },
      };
      return statement as unknown as D1PreparedStatement;
    },
    async batch() { return []; },
    async exec() { return { count: 0, duration: 0 }; },
  };
  return db as unknown as D1Database;
}

describe('Iranian phone normalization', () => {
  it('normalizes Persian and Arabic-Indic digits to the canonical E.164 value', () => {
    assert.equal(normalizePhone('۰۹۱۲ ۱۲۳ ۴۵۶۷'), '+989121234567');
    assert.equal(normalizePhone('٠٩١٢١٢٣٤٥٦٧'), '+989121234567');
  });

  it('normalizes 0098, +98, and local mobile formats consistently', () => {
    assert.equal(normalizePhone('0098 (912) 123-4567'), '+989121234567');
    assert.equal(normalizePhone('+98 912 123 4567'), '+989121234567');
    assert.equal(normalizePhone('09121234567'), '+989121234567');
  });

  it('rejects unsupported phone formats', () => {
    assert.equal(normalizePhone('02112345678'), null);
    assert.equal(normalizePhone('not-a-phone'), null);
  });
});

describe('Cloudflare-native session authentication', () => {
  it('atomically allows only one concurrent callback to consume an OAuth state', async () => {
    const nowMs = Date.now();
    const stateHash = 'a'.repeat(64);
    const db = makeOAuthStateDb(stateHash, {
      nonce: 'nonce-once',
      code_verifier: 'pkce-verifier-once',
      return_path: '/account',
    }, nowMs + 60_000);
    const results = await Promise.all([
      consumeGoogleOAuthState(db, stateHash, nowMs),
      consumeGoogleOAuthState(db, stateHash, nowMs),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.deepEqual(results.find(Boolean), {
      nonce: 'nonce-once',
      code_verifier: 'pkce-verifier-once',
      return_path: '/account',
    });
  });

  it('does not consume an expired or malformed OAuth state hash', async () => {
    const nowMs = Date.now();
    const stateHash = 'b'.repeat(64);
    const db = makeOAuthStateDb(stateHash, {
      nonce: 'expired',
      code_verifier: 'expired',
      return_path: '/',
    }, nowMs);
    assert.equal(await consumeGoogleOAuthState(db, stateHash, nowMs), null);
    assert.equal(await consumeGoogleOAuthState(db, 'not-a-state-hash', nowMs), null);
  });

  it('accepts a valid D1-backed opaque session', async () => {
    const result = await authenticateWorkerSession(makeContext(makeD1(sessionRow())));
    assert.equal(result.authenticated, true);
    assert.equal(result.uid, 'usr_test_1');
    assert.equal(result.email, 'verified@example.com');
    assert.equal(result.authProvider, 'google');
    assert.equal(result.statusCode, 200);
  });

  it('requires recent authentication when a sensitive route explicitly opts in', async () => {
    const staleContext = makeContext(makeD1(sessionRow({
      created_at_iso: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    })));
    const stale = await authenticateWorkerSession(staleContext, true, true);
    assert.equal(stale.authenticated, false);
    assert.equal(stale.reasonCode, 'RECENT_LOGIN_REQUIRED');
    assert.equal(stale.statusCode, 403);

    const fresh = await authenticateWorkerSession(makeContext(makeD1(sessionRow())), true, true);
    assert.equal(fresh.authenticated, true);
  });

  it('keeps session reads available without touching last_seen while D1 writes are paused', async () => {
    const updateCalls = { count: 0 };
    const staleLastSeen = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const pauseDeadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await authenticateWorkerSession(makeContext(
      makeD1(sessionRow({ last_seen_at_iso: staleLastSeen }), updateCalls),
      'A'.repeat(64),
      { DB_WRITES_PAUSED_UNTIL_UTC: pauseDeadline },
    ));
    assert.equal(result.authenticated, true);
    assert.equal(updateCalls.count, 0);
  });

  it('refreshes last_seen after the stale interval when D1 writes are not paused', async () => {
    const updateCalls = { count: 0 };
    const staleLastSeen = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const result = await authenticateWorkerSession(makeContext(
      makeD1(sessionRow({ last_seen_at_iso: staleLastSeen }), updateCalls),
    ));
    assert.equal(result.authenticated, true);
    assert.equal(updateCalls.count, 1);
  });

  it('rejects a duplicated session cookie and never selects one credential', async () => {
    const request = new Request('https://radartehran.ir/api/auth/session', {
      headers: {
        cookie: `${RADAR_SESSION_COOKIE}=${'A'.repeat(64)}; ${RADAR_SESSION_COOKIE}=${'B'.repeat(64)}`,
      },
    });
    assert.equal(readSessionCookie(request), null);
    const context = makeContext(makeD1(sessionRow()));
    const withDuplicate = new Request(context.request.url, {
      headers: {
        cookie: `${RADAR_SESSION_COOKIE}=${'A'.repeat(64)}; ${RADAR_SESSION_COOKIE}=${'B'.repeat(64)}`,
        authorization: 'Bearer deliberately-invalid-transition-token',
      },
    });
    const result = await resolveWorkerAuthContext(withDuplicate, { env: context.env });
    assert.equal(result.authenticated, false);
    assert.equal(result.mode, 'cloudflare_d1_session');
    assert.equal(result.failureCode, 'UNAUTHENTICATED');
  });

  it('requires a same-origin Origin header for direct session mutations by default', async () => {
    const context = makeContext(makeD1(sessionRow()));
    const request = new Request(context.request.url, {
      method: 'POST',
      headers: { cookie: `${RADAR_SESSION_COOKIE}=${'A'.repeat(64)}` },
    });
    const result = await authenticateWorkerSession({ ...context, request, method: 'POST' });
    assert.equal(result.authenticated, false);
    assert.equal(result.reasonCode, 'CSRF_ORIGIN_REJECTED');
    assert.equal(result.statusCode, 403);
  });

  it('normalizes millisecond revocation watermarks before comparing session issue time', async () => {
    const createdAtMs = Date.now() - 3_000;
    const result = await authenticateWorkerSession(makeContext(makeD1(sessionRow({
      created_at_iso: new Date(createdAtMs).toISOString(),
      revocation_watermark: String(createdAtMs + 1_000),
    }))));
    assert.equal(result.authenticated, false);
    assert.equal(result.reasonCode, 'SESSION_REVOKED');
  });

  it('rejects a disabled-account watermark even when the profile row is active', async () => {
    const result = await authenticateWorkerSession(makeContext(makeD1(sessionRow({ revocation_watermark: 'DISABLED' }))));
    assert.equal(result.authenticated, false);
    assert.equal(result.reasonCode, 'ACCOUNT_DISABLED');
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


  it('authorizes a valid D1 session cookie through the shared Worker authorization policy', async () => {
    const context = makeContext(
      makeD1(sessionRow()),
      'A'.repeat(64),
      { ADMIN_EMAIL: 'verified@example.com' },
    );
    const result = await resolveWorkerAuthContext(context.request, { env: context.env });
    assert.equal(result.authenticated, true);
    assert.equal(result.mode, 'cloudflare_d1_session');
    assert.equal(result.principal?.uid, 'usr_test_1');
    assert.equal(result.principal?.authMode, 'cloudflare_d1_session');
    assert.equal(result.principal?.isPrimaryAdmin, true);
    assert.equal(result.principal?.role, 'primary_admin');
  });

  it('maps a verified D1 session to the existing route auth contract', async () => {
    const context = makeContext(
      makeD1(sessionRow()),
      'A'.repeat(64),
      { ADMIN_EMAIL: 'verified@example.com' },
    );
    const result = await authenticateWorkerRouteCompat(context, { requireAppCheck: true });
    assert.equal(result.authenticated, true);
    assert.equal(result.uid, 'usr_test_1');
    assert.equal(result.isAdmin, true);
    assert.equal(result.statusCode, 200);
    assert.equal(result.reasonCode, 'VERIFIED');
  });

  it('does not broaden primary-admin-only route access to delegated administrators', async () => {
    const context = makeContext(
      makeD1(sessionRow({ delegated_admin: 1 })),
      'A'.repeat(64),
    );
    const result = await authenticateWorkerRouteCompat(context, { requireAppCheck: true });
    assert.equal(result.authenticated, true);
    assert.equal(result.uid, 'usr_test_1');
    assert.equal(result.isAdmin, false);
  });

  it('keeps invalid native cookies fail-closed in compatibility routes even with a Bearer header', async () => {
    const context = makeContext(makeD1(null));
    const request = new Request(context.request.url, {
      headers: {
        cookie: `${RADAR_SESSION_COOKIE}=${'A'.repeat(64)}`,
        authorization: 'Bearer deliberately-invalid-transition-token',
      },
    });
    const result = await authenticateWorkerRouteCompat({ ...context, request }, { requireAppCheck: false });
    assert.equal(result.authenticated, false);
    assert.equal(result.uid, null);
    assert.equal(result.statusCode, 401);
    assert.equal(result.reasonCode, 'SESSION_INVALID');
  });

  it('fails closed on an invalid session cookie instead of falling back to a bearer token', async () => {
    const context = makeContext(makeD1(null));
    const request = new Request(context.request.url, {
      headers: {
        cookie: `${RADAR_SESSION_COOKIE}=${'A'.repeat(64)}`,
        authorization: 'Bearer deliberately-invalid-transition-token',
      },
    });
    const result = await resolveWorkerAuthContext(request, { env: context.env });
    assert.equal(result.authenticated, false);
    assert.equal(result.mode, 'cloudflare_d1_session');
    assert.equal(result.failureCode, 'SESSION_INVALID');
    assert.equal(result.failureStatusCode, 401);
  });

  it('rejects cross-origin mutations that present a valid D1 session cookie', async () => {
    const context = makeContext(makeD1(sessionRow()));
    const request = new Request('https://radartehran.ir/api/protected/mutation', {
      method: 'POST',
      headers: {
        cookie: `${RADAR_SESSION_COOKIE}=${'A'.repeat(64)}`,
        origin: 'https://attacker.example',
      },
    });
    const result = await resolveWorkerAuthContext(request, { env: context.env });
    assert.equal(result.authenticated, false);
    assert.equal(result.mode, 'cloudflare_d1_session');
    assert.equal(result.failureCode, 'CSRF_ORIGIN_REJECTED');
    assert.equal(result.failureStatusCode, 403);
  });

  it('allows same-origin mutations with a verified D1 session cookie', async () => {
    const context = makeContext(makeD1(sessionRow()));
    const request = new Request('https://radartehran.ir/api/protected/mutation', {
      method: 'POST',
      headers: {
        cookie: `${RADAR_SESSION_COOKIE}=${'A'.repeat(64)}`,
        origin: 'https://radartehran.ir',
      },
    });
    const result = await resolveWorkerAuthContext(request, { env: context.env });
    assert.equal(result.authenticated, true);
    assert.equal(result.mode, 'cloudflare_d1_session');
    assert.equal(result.principal?.uid, 'usr_test_1');
  });
});
