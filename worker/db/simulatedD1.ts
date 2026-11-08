/**
 * @file worker/db/simulatedD1.ts
 * @description In-memory simulated Cloudflare D1 database binding for tests and local development.
 *
 * Implements the official Cloudflare D1 Database API using an in-memory SQL
 * engine simulation, verifying SQL queries, parameterized bindings, and batches.
 */

import type {
  D1DatabaseBinding,
  D1ExecResult,
  D1PreparedStatement,
  D1Result,
} from './types';

export class SimulatedD1Database implements D1DatabaseBinding {
  private readonly tables = new Map<string, Array<Record<string, any>>>();
  private readonly schema = new Set<string>();

  constructor() {
    this.tables.set('_cf_migrations', []);
  }

  public prepare(query: string): D1PreparedStatement {
    return new SimulatedPreparedStatement(this, query);
  }

  public async dump(): Promise<ArrayBuffer> {
    const text = JSON.stringify(Object.fromEntries(this.tables));
    return new TextEncoder().encode(text).buffer;
  }

  public async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    for (const stmt of statements) {
      results.push(await stmt.run<T>());
    }
    return results;
  }

  public async exec(query: string): Promise<D1ExecResult> {
    const start = Date.now();
    const clean = query.trim();
    if (!clean) return { count: 0, duration: 0 };

    // Record created tables
    const createMatch = /CREATE TABLE (?:IF NOT EXISTS )?([a-zA-Z0-9_]+)/i.exec(clean);
    if (createMatch) {
      const tableName = createMatch[1];
      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, []);
        this.schema.add(tableName);
      }
    }

    return {
      count: 1,
      duration: Math.max(1, Date.now() - start),
    };
  }

  // Internal execution hook for prepared statements
  public executeStatement(query: string, values: unknown[]): { rows: any[]; changes: number } {
    const q = query.trim();

    // 1. INSERT INTO _cf_migrations
    if (q.startsWith('INSERT INTO _cf_migrations')) {
      const table = this.tables.get('_cf_migrations') || [];
      const row = {
        migration_id: values[0],
        name: values[1],
        checksum_sha256: values[2],
        applied_at_iso: values[3],
        execution_duration_ms: values[4],
        statement_count: values[5],
      };
      table.push(row);
      this.tables.set('_cf_migrations', table);
      return { rows: [], changes: 1 };
    }

    // 2. SELECT * FROM _cf_migrations
    if (q.startsWith('SELECT * FROM _cf_migrations')) {
      const table = this.tables.get('_cf_migrations') || [];
      return { rows: [...table], changes: 0 };
    }

    // 3. INSERT INTO neighborhood_benchmarks
    if (q.startsWith('INSERT INTO neighborhood_benchmarks')) {
      const table = this.tables.get('neighborhood_benchmarks') || [];
      const row = {
        hood_id: values[0],
        city_id: values[1],
        buy_per_sqm_million: values[2],
        rahn_80m_million: values[3],
        updated_at_iso: values[4],
      };
      table.push(row);
      this.tables.set('neighborhood_benchmarks', table);
      return { rows: [], changes: 1 };
    }

    // 4. SELECT FROM neighborhood_benchmarks WHERE hood_id = ?
    if (q.includes('FROM neighborhood_benchmarks') && q.includes('WHERE hood_id = ?')) {
      const table = this.tables.get('neighborhood_benchmarks') || [];
      const found = table.filter((r) => r.hood_id === values[0]);
      return { rows: found, changes: 0 };
    }

    // 5. INSERT INTO bargain_listings
    if (q.startsWith('INSERT INTO bargain_listings')) {
      const table = this.tables.get('bargain_listings') || [];
      const row = {
        id: values[0],
        owner_uid: values[1],
        city_id: values[2],
        hood_id: values[3],
        title: values[4],
        deal_type: values[5],
        sqm: values[6],
        price_text: values[7],
        discount_percent: values[8],
        buyer_profit_text: values[9],
        street: values[10],
        status: values[11],
        created_at_iso: values[12],
      };
      table.push(row);
      this.tables.set('bargain_listings', table);
      return { rows: [], changes: 1 };
    }

    // 6. Generic SELECT all from named table
    const selectAllMatch = /SELECT \* FROM ([a-zA-Z0-9_]+)/i.exec(q);
    if (selectAllMatch) {
      const tableName = selectAllMatch[1];
      const table = this.tables.get(tableName) || [];
      return { rows: [...table], changes: 0 };
    }

    return { rows: [], changes: 0 };
  }
}

class SimulatedPreparedStatement implements D1PreparedStatement {
  private readonly db: SimulatedD1Database;
  private readonly query: string;
  private boundValues: unknown[] = [];

  constructor(db: SimulatedD1Database, query: string) {
    this.db = db;
    this.query = query;
  }

  public bind(...values: unknown[]): D1PreparedStatement {
    this.boundValues = values;
    return this;
  }

  public async first<T = unknown>(colName?: string): Promise<T | null> {
    const res = await this.all<T>();
    if (res.results.length === 0) return null;
    const firstRow = res.results[0] as any;
    if (colName) return firstRow[colName] ?? null;
    return firstRow as T;
  }

  public async run<T = unknown>(): Promise<D1Result<T>> {
    const { rows, changes } = this.db.executeStatement(this.query, this.boundValues);
    return {
      results: rows as T[],
      success: true,
      meta: {
        duration: 1,
        changes,
        last_row_id: changes > 0 ? 1 : undefined,
      },
    };
  }

  public async all<T = unknown>(): Promise<D1Result<T>> {
    return await this.run<T>();
  }

  public async raw<T = unknown[]>(): Promise<T[]> {
    const res = await this.run();
    return res.results.map((r: any) => Object.values(r)) as T[];
  }
}
