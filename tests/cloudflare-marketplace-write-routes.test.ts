import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RADAR_SESSION_COOKIE } from '../worker/auth/sessionAuth';
import { handleMarketplaceWorkerRoute } from '../worker/routes/marketplaceRoutes';
import type { D1Database, D1PreparedStatement, WorkerRequestContext, WorkerEnv } from '../worker/types';

const TOKEN = 'S'.repeat(64);

function makeD1() {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const sessionCreatedAt = new Date(Date.now() - 60_000).toISOString();
  const sessionRow = {
    session_id: 'session-test',
    uid: 'usr_market_test',
    created_at_iso: sessionCreatedAt,
    last_seen_at_iso: new Date().toISOString(),
    expires_at_iso: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    auth_provider: 'phone',
    account_status: 'ACTIVE',
    display_name: 'کاربر آزمایشی',
    phone_number: '+989121234567',
    revocation_watermark: null,
    email: null,
    email_verified: 0,
    delegated_admin: 0,
  };
  const db = {
    prepare(sql: string): D1PreparedStatement {
      const record = { sql, values: [] as unknown[] };
      const statement = {
        bind(...values: unknown[]) {
          record.values = values;
          return statement as unknown as D1PreparedStatement;
        },
        async first<T = Record<string, unknown>>(): Promise<T | null> {
          statements.push(record);
          if (sql.includes('SELECT s.session_id')) return sessionRow as T;
          if (sql.includes('SELECT counter, window_reset_ms')) return null;
          if (sql.includes('INSERT INTO neighborhood_votes') && sql.includes('RETURNING vote_id')) return { vote_id: 'vote-canonical' } as T;
          return null;
        },
        async run() {
          statements.push(record);
          return { success: true, meta: { changes: 1 } };
        },
        async all<T = Record<string, unknown>>() {
          statements.push(record);
          return { results: [] as T[], success: true };
        },
      };
      return statement as unknown as D1PreparedStatement;
    },
    async batch() { return []; },
    async exec() { return { count: 0, duration: 0 }; },
  };
  return { db: db as unknown as D1Database, statements };
}

function makeContext(body: Record<string, unknown>, origin = 'https://radartehran.ir'): WorkerRequestContext {
  const request = new Request('https://radartehran.ir/api/v1/market/votes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${RADAR_SESSION_COOKIE}=${TOKEN}`,
      origin,
    },
    body: JSON.stringify(body),
  });
  const { db } = makeD1();
  const env: WorkerEnv = { USER_DB: db, APP_URL: 'https://radartehran.ir', MARKET_PII_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', MARKET_PII_HASH_SECRET: 'market-pii-test-secret-with-at-least-32-characters' };
  return {
    request,
    env,
    url: new URL(request.url),
    requestId: 'market-test-request',
    correlationId: 'market-test-correlation',
    method: 'POST',
    pathname: '/api/v1/market/votes',
    clientIp: '192.0.2.10',
    trustedEdgeIp: true,
    environment: 'development',
    startedAtMs: Date.now(),
    routeId: 'market-vote-write',
    implementationId: 'cloudflare-d1-marketplace',
  };
}

describe('Cloudflare D1 marketplace vote writes', () => {
  it('accepts an authenticated phone session and returns the canonical persisted vote id', async () => {
    const ctx = makeContext({
      cityId: 'tehran',
      hoodId: 12,
      air: 7,
      powerWater: 8,
      internet: 8,
      metro: 9,
      security: 7,
      flatTerrain: 8,
      comment: 'آزمایش ثبت رأی',
      userDisplayName: 'کاربر',
    });
    const response = await handleMarketplaceWorkerRoute(ctx);
    assert.ok(response);
    assert.equal(response.status, 201);
    const payload = await response.json() as { status: string; durable: boolean; vote: { id: string } };
    assert.equal(payload.status, 'ok');
    assert.equal(payload.durable, true);
    assert.equal(payload.vote.id, 'vote-canonical');
  });

  it('rejects a cross-origin cookie-authenticated mutation', async () => {
    const ctx = makeContext({ cityId: 'tehran', hoodId: 12, air: 7, powerWater: 7, internet: 7, metro: 7, security: 7, flatTerrain: 7 }, 'https://attacker.invalid');
    const response = await handleMarketplaceWorkerRoute(ctx);
    assert.ok(response);
    assert.equal(response.status, 403);
    const payload = await response.json() as { code: string };
    assert.equal(payload.code, 'CSRF_ORIGIN_REJECTED');
  });

  it('rejects out-of-range vote scores before writing', async () => {
    const ctx = makeContext({ cityId: 'tehran', hoodId: 12, air: 11, powerWater: 7, internet: 7, metro: 7, security: 7, flatTerrain: 7 });
    const response = await handleMarketplaceWorkerRoute(ctx);
    assert.ok(response);
    assert.equal(response.status, 400);
    const payload = await response.json() as { code: string };
    assert.equal(payload.code, 'INVALID_VOTE_PAYLOAD');
  });
});
