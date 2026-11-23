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
