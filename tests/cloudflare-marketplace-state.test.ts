import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { getMarketStateFromD1 } from '../worker/marketplace/d1MarketplaceRepository';
import type { D1Database, D1PreparedStatement, WorkerEnv } from '../worker/types';

function makeSqliteD1(): { db: D1Database; close: () => void } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE user_favorites (
      uid TEXT NOT NULL,
      city_id TEXT NOT NULL,
      hood_id INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at_iso TEXT NOT NULL,
      PRIMARY KEY(uid, city_id, hood_id)
    );
    INSERT INTO user_favorites(uid, city_id, hood_id, created_at_iso) VALUES
      ('user-1', 'tehran', 12, '2026-11-20T00:00:00.000Z'),
      ('user-1', 'shiraz', 12, '2026-11-21T00:00:00.000Z'),
      ('user-1', 'shiraz', 88, '2026-11-22T00:00:00.000Z'),
      ('user-2', 'tehran', 99, '2026-11-23T00:00:00.000Z');
  `);

  const db: D1Database = {
    prepare(sql: string): D1PreparedStatement {
      let values: unknown[] = [];
      const statement: D1PreparedStatement = {
        bind(...bound: unknown[]) {
          values = bound;
          return statement;
        },
        async first<T = Record<string, unknown>>(): Promise<T | null> {
          return null;
        },
        async run<T = unknown>() {
          return { success: true, results: [] as T[], meta: { changes: 0 } };
        },
        async all<T = Record<string, unknown>>() {
          if (!sql.includes('FROM user_favorites')) return { success: true, results: [] as T[] };
          const rows = sqlite.prepare(sql).all(...values) as T[];
          return { success: true, results: rows };
        },
      };
      return statement;
    },
    async batch() {
      return [];
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
  };
  return { db, close: () => sqlite.close() };
}

describe('D1 marketplace state favorite city isolation', () => {
  it('returns only the signed-in user favorites for the requested city', async () => {
    const fixture = makeSqliteD1();
    try {
      const tehran = await getMarketStateFromD1(
        fixture.db,
        { cityId: 'tehran', uid: 'user-1' },
        {} as WorkerEnv,
      );
      const shiraz = await getMarketStateFromD1(
        fixture.db,
        { cityId: 'shiraz', uid: 'user-1' },
        {} as WorkerEnv,
      );

      assert.deepEqual(tehran.favoriteHoodIds, [12]);
      assert.deepEqual(shiraz.favoriteHoodIds, [12, 88]);
    } finally {
      fixture.close();
    }
  });

  it('never includes another account favorites in the current city response', async () => {
    const fixture = makeSqliteD1();
    try {
      const state = await getMarketStateFromD1(
        fixture.db,
        { cityId: 'tehran', uid: 'user-1' },
        {} as WorkerEnv,
      );
      assert.deepEqual(state.favoriteHoodIds, [12]);
      assert.equal(state.favoriteHoodIds.includes(99), false);
    } finally {
      fixture.close();
    }
  });
});

function makeSponsorProjectionD1(row: Record<string, unknown>): D1Database {
  const db: D1Database = {
    prepare(sql: string): D1PreparedStatement {
      const statement: D1PreparedStatement = {
        bind(..._values: unknown[]) { return statement; },
        async first<T = Record<string, unknown>>(): Promise<T | null> { return null; },
        async run<T = unknown>() { return { success: true, results: [] as T[], meta: { changes: 0 } }; },
        async all<T = Record<string, unknown>>() {
          return {
            success: true,
            results: (sql.includes('FROM sponsor_requests') ? [row] : []) as T[],
          };
        },
      };
      return statement;
    },
    async batch() { return []; },
    async exec() { return { count: 0, duration: 0 }; },
  };
  return db;
}

describe('public marketplace sponsor projection', () => {
  it('does not expose internal sponsor tracking codes in public state', async () => {
    const state = await getMarketStateFromD1(
      makeSponsorProjectionD1({
        request_id: 'request-1',
        owner_uid: 'owner-1',
        city_id: 'tehran',
        hood_id: 12,
        hood_name: 'محله آزمایشی',
        agency_name: 'آژانس آزمایشی',
        phone_ciphertext: 'not-used-for-public-projection',
        phone_last4: '4567',
        specialty: 'مسکونی',
        experience_years: 8,
        monthly_tariff_million: 10,
        plan_months: 1,
        total_payable_million: 10,
        tracking_code: 'INTERNAL-TRACK-123',
        status: 'approved',
        expires_at_iso: null,
        created_at_iso: '2026-11-20T00:00:00.000Z',
      }),
      { cityId: 'tehran' },
      {} as WorkerEnv,
    );

    assert.equal(state.sponsors.length, 1);
    assert.equal(state.sponsors[0].trackingCode, undefined);
    assert.equal(state.sponsors[0].phone, '+98***4567');
  });
});
