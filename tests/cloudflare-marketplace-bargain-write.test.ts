import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RADAR_SESSION_COOKIE, sha256Hex } from '../worker/auth/sessionAuth';
import { handleMarketplaceWorkerRoute } from '../worker/routes/marketplaceRoutes';
import type { D1Database, D1PreparedStatement, WorkerRequestContext, WorkerEnv } from '../worker/types';

const TOKEN = 'S'.repeat(64);
const UID = 'usr_market_bargain_test';
const IDEMPOTENCY_KEY = 'bargain_test_0001';
const BODY = {
  cityId: 'tehran',
  hoodId: 12,
  hoodName: 'سعادت آباد',
  title: 'آپارتمان آزمایشی',
  type: 'خرید',
  sqm: 80,
  priceMillions: 9000,
  priceText: '۹۰۰۰ میلیون تومان',
  discountPercent: 12,
  buyerProfitText: 'قیمت پایین‌تر از مرجع محله',
  street: 'بلوار آزمایش',
  mediaObjectIds: [],
};

async function makeContext(body: Record<string, unknown>): Promise<WorkerRequestContext> {
  const normalized = {
    cityId: 'tehran', hoodId: 12, hoodName: 'سعادت آباد', title: 'آپارتمان آزمایشی',
    listingType: 'خرید', sqm: 80, priceMillions: 9000, priceText: '۹۰۰۰ میلیون تومان',
    discountPercent: 12, buyerProfitText: 'قیمت پایین‌تر از مرجع محله', street: 'بلوار آزمایش',
  };
  const expectedHash = await sha256Hex(JSON.stringify(normalized));
  const expectedId = 'brg_' + (await sha256Hex(UID + ':bargain.create:' + IDEMPOTENCY_KEY)).slice(0, 32);
  let idempotencyReads = 0;
  const sessionRow = {
    session_id: 'session-market-bargain-test',
    uid: UID,
    created_at_iso: new Date(Date.now() - 60_000).toISOString(),
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
      const statement = {
        bind(..._values: unknown[]) { return statement as unknown as D1PreparedStatement; },
        async first<T = Record<string, unknown>>(): Promise<T | null> {
          if (sql.includes('SELECT s.session_id')) return sessionRow as T;
          if (sql.includes('SELECT block_reason FROM account_write_blocks')) return null;
          if (sql.includes('SELECT name_fa FROM neighborhood_projections')) return { name_fa: 'سعادت آباد' } as T;
          if (sql.includes('RETURNING counter, window_reset_ms')) return { counter: 1, window_reset_ms: Date.now() + 60_000 } as T;
          if (sql.includes('SELECT request_hash, resource_id FROM market_mutation_idempotency')) {
            idempotencyReads += 1;
            if (idempotencyReads === 1) return null;
            return { request_hash: expectedHash, resource_id: expectedId } as T;
          }
          if (sql.includes('SELECT bargain_id, status FROM bargains')) return { bargain_id: expectedId, status: 'pending' } as T;
          return null;
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
        async all<T = Record<string, unknown>>() { return { results: [] as T[], success: true }; },
      };
      return statement as unknown as D1PreparedStatement;
    },
    async batch(statements: D1PreparedStatement[]) {
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
    async exec() { return { count: 0, duration: 0 }; },
  };
  const request = new Request('https://radartehran.ir/api/v1/market/bargains', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${RADAR_SESSION_COOKIE}=${TOKEN}`,
      origin: 'https://radartehran.ir',
      'idempotency-key': IDEMPOTENCY_KEY,
    },
    body: JSON.stringify(body),
  });
  const env: WorkerEnv = { USER_DB: db as unknown as D1Database, APP_URL: 'https://radartehran.ir' };
  return {
    request, env, url: new URL(request.url), requestId: 'market-bargain-test',
    correlationId: 'market-bargain-test', method: 'POST', pathname: '/api/v1/market/bargains',
    clientIp: '192.0.2.12', trustedEdgeIp: true, environment: 'development',
    startedAtMs: Date.now(), routeId: 'market-bargain-create', implementationId: 'cloudflare-d1-marketplace',
  };
}

describe('Cloudflare D1 bargain create route', () => {
  it('persists a pending bargain and its search projection through the idempotent D1 mutation', async () => {
    const response = await handleMarketplaceWorkerRoute(await makeContext(BODY));
    assert.ok(response);
    assert.equal(response.status, 201);
    const payload = await response.json() as { status: string; durable: boolean; bargainId: string; listingStatus: string };
    assert.equal(payload.status, 'ok');
    assert.equal(payload.durable, true);
    assert.match(payload.bargainId, /^brg_[a-f0-9]{32}$/);
    assert.equal(payload.listingStatus, 'pending');
  });

  it('fails closed when the client supplies media references while R2 media attachment is deferred', async () => {
    const response = await handleMarketplaceWorkerRoute(await makeContext({ ...BODY, mediaObjectIds: ['media-object-1'] }));
    assert.ok(response);
    assert.equal(response.status, 409);
    const payload = await response.json() as { code: string };
    assert.equal(payload.code, 'MARKET_BARGAIN_MEDIA_NOT_AVAILABLE');
  });
});
