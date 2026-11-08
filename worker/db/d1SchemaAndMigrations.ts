import type { D1Database, D1PreparedStatement } from '../types';

export const AUTHORITATIVE_D1_MIGRATIONS_TABLE = 'd1_migrations' as const;

export interface D1MigrationDefinition {
  version: string;
  name: string;
  fileName: string;
  checksumSha256: string;
  sql: string;
}

/**
 * Read-only TypeScript mirror of `migrations/d1/*.sql`.
 * Authoritative remote & local CLI execution is performed by Wrangler (`wrangler d1 migrations apply`),
 * which records applied filenames in the `d1_migrations` ledger table.
 * Checksums are verified against disk files by `scripts/cloudflare/provision-staging.mjs` and CI tests.
 */
export const D1_MIGRATIONS: readonly D1MigrationDefinition[] = [
  {
    version: '0001',
    name: '0001_core_projections_and_watermarks',
    fileName: '0001_core_projections_and_watermarks.sql',
    checksumSha256: '12abe3e8b02dfd1185aa6930545db52b67bedd1f6521752f5d4d92a128415b61',
    sql: `-- Canonical Staging & Edge D1 Migration 0001: Core Projections, Bargains, and Sync Watermarks
-- Authoritative Migration Ledger: d1_migrations (managed by Wrangler D1 Migrations)
-- Data Authority: Cloud Firestore (ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a) remains primary source of truth.
CREATE TABLE IF NOT EXISTS neighborhood_projections (
  city_id TEXT NOT NULL,
  hood_id INTEGER NOT NULL,
  name_fa TEXT NOT NULL,
  district INTEGER NOT NULL,
  buy_per_sqm_million REAL NOT NULL,
  deal_per_sqm_million REAL NOT NULL,
  rahn_80m_million REAL NOT NULL,
  aqi INTEGER NOT NULL,
  investment_score REAL NOT NULL,
  firestore_version_iso TEXT NOT NULL,
  projected_at_iso TEXT NOT NULL,
  PRIMARY KEY (city_id, hood_id)
);

CREATE INDEX IF NOT EXISTS idx_hood_proj_city_price ON neighborhood_projections(city_id, buy_per_sqm_million);

CREATE TABLE IF NOT EXISTS bargain_projections (
  bargain_id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL,
  hood_id INTEGER NOT NULL,
  hood_name TEXT NOT NULL,
  title TEXT NOT NULL,
  sqm INTEGER NOT NULL,
  price_millions REAL NOT NULL,
  discount_percent REAL NOT NULL,
  lifecycle_state TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bargain_proj_city_hood ON bargain_projections(city_id, hood_id, lifecycle_state);

CREATE TABLE IF NOT EXISTS sync_watermarks (
  watermark_key TEXT PRIMARY KEY,
  watermark_value TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL
);`,
  },
  {
    version: '0002',
    name: '0002_upload_sessions_legal_holds_and_rate_limits',
    fileName: '0002_upload_sessions_legal_holds_and_rate_limits.sql',
    checksumSha256: '19b161ad2212f51d83f2e7e706bb41d6c807da72ae7b538d9f11e7b6b5ae88ab',
    sql: `-- Canonical Staging & Edge D1 Migration 0002: Upload Sessions, Legal Holds, Rate Limits, Queue Idempotency & Audit Indexes
CREATE TABLE IF NOT EXISTS upload_sessions (
  session_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  city_id TEXT NOT NULL,
  hood_id INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  total_chunks INTEGER NOT NULL,
  max_bytes INTEGER NOT NULL,
  received_bytes INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_owner_created ON upload_sessions(owner_uid, created_at_ms);

CREATE TABLE IF NOT EXISTS upload_session_chunks (
  session_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_base64 TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  PRIMARY KEY (session_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS legal_holds (
  resource_id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by_email TEXT NOT NULL DEFAULT 'legal@radartehran.ir',
  created_at_iso TEXT NOT NULL DEFAULT '2026-11-08T00:00:00.000Z',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_active ON legal_holds(active, resource_type);

CREATE TABLE IF NOT EXISTS strong_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  counter INTEGER NOT NULL,
  window_reset_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_strong_rate_limits_reset ON strong_rate_limits(window_reset_ms);

CREATE TABLE IF NOT EXISTS queue_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  processed_at_iso TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_idem_processed ON queue_idempotency_keys(job_type, processed_at_iso);`,
  },
] as const;

export interface NeighborhoodProjectionRow {
  city_id: string;
  hood_id: number;
  name_fa: string;
  district: number;
  buy_per_sqm_million: number;
  deal_per_sqm_million: number;
  rahn_80m_million: number;
  aqi: number;
  investment_score: number;
  firestore_version_iso: string;
  projected_at_iso: string;
}

export interface D1UploadSessionRecord {
  session_id: string;
  owner_uid: string;
  city_id: string;
  hood_id: number;
  media_type: 'image' | 'video';
  mime_type: string;
  file_name: string;
  total_chunks: number;
  max_bytes: number;
  received_bytes: number;
  completed: number;
  created_at_ms: number;
}

/**
 * Test-harness helper that initializes an in-memory `node:sqlite` or simulator instance
 * using the exact same `d1_migrations` ledger structure that `wrangler d1 migrations apply` uses.
 * Never invoked by the Worker runtime in production/staging.
 */
export async function runD1MigrationsIdempotently(db: D1Database): Promise<{
  appliedVersions: string[];
  totalMigrations: number;
  ledgerTable: typeof AUTHORITATIVE_D1_MIGRATIONS_TABLE;
}> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );`,
  );
  const appliedVersions: string[] = [];
  for (const migration of D1_MIGRATIONS) {
    const existing = await db
      .prepare('SELECT id, name, applied_at FROM d1_migrations WHERE name = ?1')
      .bind(migration.fileName)
      .first<{ id: number; name: string; applied_at: string }>();
    if (!existing) {
      await db.exec(migration.sql);
      await db
        .prepare('INSERT INTO d1_migrations (name, applied_at) VALUES (?1, ?2)')
        .bind(migration.fileName, new Date().toISOString())
        .run();
      appliedVersions.push(migration.version);
    }
  }
  return {
    appliedVersions,
    totalMigrations: D1_MIGRATIONS.length,
    ledgerTable: AUTHORITATIVE_D1_MIGRATIONS_TABLE,
  };
}

/**
 * Read-only inspection of the authoritative `d1_migrations` ledger, sync watermarks, and queue idempotency log.
 * Never executes DDL or mutates schema state. Safely handles unmigrated databases where `d1_migrations` does not yet exist.
 */
export async function inspectD1OperationalDiagnostics(db: D1Database | undefined): Promise<{
  ledgerTable: typeof AUTHORITATIVE_D1_MIGRATIONS_TABLE;
  expectedCount: number;
  allCanonicalMigrationsApplied: boolean;
  pendingMigrations: string[];
  migrationsApplied: Array<{
    id: number;
    name: string;
    fileName: string;
    checksum_sha256: string;
    applied_at: string;
  }>;
  watermarks: Array<{ watermark_key: string; watermark_value: string; updated_at_iso: string }>;
  lastQueueProcessedAtIso: string | null;
  lastQueueJobType: string | null;
}> {
  if (!db) {
    return {
      ledgerTable: AUTHORITATIVE_D1_MIGRATIONS_TABLE,
      expectedCount: D1_MIGRATIONS.length,
      allCanonicalMigrationsApplied: false,
      pendingMigrations: D1_MIGRATIONS.map((m) => m.fileName),
      migrationsApplied: [],
      watermarks: [],
      lastQueueProcessedAtIso: null,
      lastQueueJobType: null,
    };
  }
  const byFileName = new Map(D1_MIGRATIONS.map((m) => [m.fileName, m]));
  let rawRows: Array<{ id: number; name: string; applied_at: string }> = [];
  try {
    const res = await db
      .prepare('SELECT id, name, applied_at FROM d1_migrations ORDER BY id ASC')
      .all<{ id: number; name: string; applied_at: string }>();
    rawRows = res.results ?? [];
  } catch {
    rawRows = [];
  }
  const migrationsApplied = rawRows.map((row) => {
    const meta = byFileName.get(row.name);
    return {
      id: Number(row.id),
      name: meta ? meta.name : row.name.replace(/\.sql$/, ''),
      fileName: row.name,
      checksum_sha256: meta ? meta.checksumSha256 : 'UNREGISTERED_MIGRATION',
      applied_at: row.applied_at,
    };
  });
  const pendingMigrations = D1_MIGRATIONS.filter(
    (m) => !migrationsApplied.some((applied) => applied.fileName === m.fileName),
  ).map((m) => m.fileName);

  let watermarks: Array<{ watermark_key: string; watermark_value: string; updated_at_iso: string }> = [];
  try {
    const wmRes = await db
      .prepare('SELECT watermark_key, watermark_value, updated_at_iso FROM sync_watermarks ORDER BY updated_at_iso DESC LIMIT 10')
      .all<{ watermark_key: string; watermark_value: string; updated_at_iso: string }>();
    watermarks = wmRes.results ?? [];
  } catch {
    watermarks = [];
  }

  let latestQueue: { job_type: string; processed_at_iso: string } | null = null;
  try {
    latestQueue = await db
      .prepare('SELECT job_type, processed_at_iso FROM queue_idempotency_keys WHERE status = ?1 ORDER BY processed_at_iso DESC LIMIT 1')
      .bind('COMPLETED')
      .first<{ job_type: string; processed_at_iso: string }>();
  } catch {
    latestQueue = null;
  }

  return {
    ledgerTable: AUTHORITATIVE_D1_MIGRATIONS_TABLE,
    expectedCount: D1_MIGRATIONS.length,
    allCanonicalMigrationsApplied: pendingMigrations.length === 0,
    pendingMigrations,
    migrationsApplied,
    watermarks,
    lastQueueProcessedAtIso: latestQueue?.processed_at_iso ?? null,
    lastQueueJobType: latestQueue?.job_type ?? null,
  };
}

export async function upsertNeighborhoodProjectionD1(
  db: D1Database,
  row: NeighborhoodProjectionRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO neighborhood_projections (
        city_id, hood_id, name_fa, district, buy_per_sqm_million, deal_per_sqm_million,
        rahn_80m_million, aqi, investment_score, firestore_version_iso, projected_at_iso
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
      ON CONFLICT(city_id, hood_id) DO UPDATE SET
        name_fa = excluded.name_fa,
        district = excluded.district,
        buy_per_sqm_million = excluded.buy_per_sqm_million,
        deal_per_sqm_million = excluded.deal_per_sqm_million,
        rahn_80m_million = excluded.rahn_80m_million,
        aqi = excluded.aqi,
        investment_score = excluded.investment_score,
        firestore_version_iso = excluded.firestore_version_iso,
        projected_at_iso = excluded.projected_at_iso`,
    )
    .bind(
      row.city_id,
      row.hood_id,
      row.name_fa,
      row.district,
      row.buy_per_sqm_million,
      row.deal_per_sqm_million,
      row.rahn_80m_million,
      row.aqi,
      row.investment_score,
      row.firestore_version_iso,
      row.projected_at_iso,
    )
    .run();
}

export async function queryNeighborhoodProjectionsD1(
  db: D1Database,
  params: { cityId: string; maxBuyPerSqmMillion?: number; minInvestmentScore?: number; limit?: number },
): Promise<{
  items: NeighborhoodProjectionRow[];
  authority: 'firestore_primary_d1_projection';
  maxProjectionLagMs: number;
}> {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(params.limit ?? 50)));
  const maxBuy = params.maxBuyPerSqmMillion ?? 100_000;
  const minScore = params.minInvestmentScore ?? 0;
  const { results } = await db
    .prepare(
      `SELECT * FROM neighborhood_projections
       WHERE city_id = ?1 AND buy_per_sqm_million <= ?2 AND investment_score >= ?3
       ORDER BY buy_per_sqm_million ASC LIMIT ?4`,
    )
    .bind(params.cityId, maxBuy, minScore, safeLimit)
    .all<NeighborhoodProjectionRow>();

  const nowMs = Date.now();
  let maxLag = 0;
  for (const r of results) {
    const projectedMs = Date.parse(r.projected_at_iso);
    if (Number.isFinite(projectedMs)) {
      maxLag = Math.max(maxLag, Math.max(0, nowMs - projectedMs));
    }
  }
  return {
    items: results,
    authority: 'firestore_primary_d1_projection',
    maxProjectionLagMs: maxLag,
  };
}

export function buildD1SessionBookmarkHeader(bookmark: string | null | undefined): Record<string, string> {
  const cleaned = String(bookmark || '').trim();
  if (!/^[A-Za-z0-9._:-]{4,128}$/.test(cleaned)) {
    return { 'X-D1-Consistency-Mode': 'eventual_read_replica' };
  }
  return {
    'X-D1-Session-Bookmark': cleaned,
    'X-D1-Consistency-Mode': 'sequential_bookmark_session',
  };
}

export function createLocalD1DatabaseSimulator(): D1Database {
  const d1Migrations = new Map<string, { id: number; name: string; applied_at: string }>();
  const hoodProjections = new Map<string, NeighborhoodProjectionRow>();
  const watermarks = new Map<string, { watermark_key: string; watermark_value: string; updated_at_iso: string }>();
  const uploadSessions = new Map<string, D1UploadSessionRecord>();
  const uploadChunks = new Map<string, { session_id: string; chunk_index: number; chunk_base64: string; byte_length: number }>();
  const legalHolds = new Map<string, { resource_id: string; resource_type: string; reason: string; active: number }>();
  const rateLimits = new Map<string, { bucket_key: string; counter: number; window_reset_ms: number }>();
  const queueKeys = new Map<string, { idempotency_key: string; job_type: string; processed_at_iso: string; status: string }>();

  const makeStatement = (sql: string, boundValues: unknown[] = []): D1PreparedStatement => ({
    bind(...values: unknown[]) {
      return makeStatement(sql, values);
    },
    async first<T = Record<string, unknown>>(): Promise<T | null> {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT id, name, applied_at FROM d1_migrations WHERE name')) {
        return (d1Migrations.get(String(boundValues[0])) as unknown as T) ?? null;
      }
      if (normalized.startsWith('SELECT watermark_value FROM sync_watermarks')) {
        return (watermarks.get(String(boundValues[0])) as unknown as T) ?? null;
      }
      if (normalized.startsWith('SELECT * FROM upload_sessions WHERE session_id')) {
        return (uploadSessions.get(String(boundValues[0])) as unknown as T) ?? null;
      }
      if (normalized.startsWith('SELECT active, reason FROM legal_holds')) {
        return (legalHolds.get(String(boundValues[0])) as unknown as T) ?? null;
      }
      if (normalized.startsWith('SELECT counter, window_reset_ms FROM strong_rate_limits')) {
        return (rateLimits.get(String(boundValues[0])) as unknown as T) ?? null;
      }
      if (normalized.startsWith('SELECT status FROM queue_idempotency_keys')) {
        return (queueKeys.get(String(boundValues[0])) as unknown as T) ?? null;
      }
      if (normalized.startsWith('SELECT job_type, processed_at_iso FROM queue_idempotency_keys')) {
        const completed = Array.from(queueKeys.values()).filter((q) => q.status === String(boundValues[0]));
        completed.sort((a, b) => b.processed_at_iso.localeCompare(a.processed_at_iso));
        return (completed[0] as unknown as T) ?? null;
      }
      return null;
    },
    async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }> {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT id, name, applied_at FROM d1_migrations')) {
        return { results: Array.from(d1Migrations.values()) as unknown as T[], success: true };
      }
      if (normalized.startsWith('SELECT watermark_key, watermark_value, updated_at_iso FROM sync_watermarks')) {
        return { results: Array.from(watermarks.values()) as unknown as T[], success: true };
      }
      if (normalized.startsWith('SELECT * FROM neighborhood_projections')) {
        const [cityId, maxBuy, minScore, limit] = boundValues;
        const rows = Array.from(hoodProjections.values())
          .filter(
            (r) =>
              r.city_id === String(cityId) &&
              r.buy_per_sqm_million <= Number(maxBuy) &&
              r.investment_score >= Number(minScore),
          )
          .sort((a, b) => a.buy_per_sqm_million - b.buy_per_sqm_million)
          .slice(0, Number(limit) || 50);
        return { results: rows as unknown as T[], success: true };
      }
      if (normalized.startsWith('SELECT chunk_index, chunk_base64, byte_length FROM upload_session_chunks')) {
        const sessionId = String(boundValues[0]);
        const chunks = Array.from(uploadChunks.values())
          .filter((c) => c.session_id === sessionId)
          .sort((a, b) => a.chunk_index - b.chunk_index);
        return { results: chunks as unknown as T[], success: true };
      }
      return { results: [], success: true };
    },
    async run(): Promise<{ success: boolean; meta?: { changes?: number } }> {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('INSERT INTO d1_migrations')) {
        const [name, applied_at] = boundValues.map(String);
        d1Migrations.set(name, { id: d1Migrations.size + 1, name, applied_at });
      } else if (normalized.startsWith('INSERT INTO neighborhood_projections')) {
        const row: NeighborhoodProjectionRow = {
          city_id: String(boundValues[0]),
          hood_id: Number(boundValues[1]),
          name_fa: String(boundValues[2]),
          district: Number(boundValues[3]),
          buy_per_sqm_million: Number(boundValues[4]),
          deal_per_sqm_million: Number(boundValues[5]),
          rahn_80m_million: Number(boundValues[6]),
          aqi: Number(boundValues[7]),
          investment_score: Number(boundValues[8]),
          firestore_version_iso: String(boundValues[9]),
          projected_at_iso: String(boundValues[10]),
        };
        hoodProjections.set(`${row.city_id}:${row.hood_id}`, row);
      } else if (normalized.startsWith('INSERT OR REPLACE INTO sync_watermarks')) {
        const [watermark_key, watermark_value, updated_at_iso] = boundValues.map(String);
        watermarks.set(watermark_key, { watermark_key, watermark_value, updated_at_iso });
      } else if (normalized.startsWith('INSERT OR REPLACE INTO upload_sessions')) {
        const [session_id, owner_uid, city_id, hood_id, media_type, mime_type, file_name, total_chunks, max_bytes, received_bytes, completed, created_at_ms] = boundValues;
        uploadSessions.set(String(session_id), {
          session_id: String(session_id),
          owner_uid: String(owner_uid),
          city_id: String(city_id),
          hood_id: Number(hood_id),
          media_type: media_type === 'video' ? 'video' : 'image',
          mime_type: String(mime_type),
          file_name: String(file_name),
          total_chunks: Number(total_chunks),
          max_bytes: Number(max_bytes),
          received_bytes: Number(received_bytes),
          completed: Number(completed),
          created_at_ms: Number(created_at_ms),
        });
      } else if (normalized.startsWith('INSERT INTO upload_session_chunks')) {
        const [session_id, chunk_index, chunk_base64, byte_length] = boundValues;
        uploadChunks.set(`${session_id}:${chunk_index}`, { session_id: String(session_id), chunk_index: Number(chunk_index), chunk_base64: String(chunk_base64), byte_length: Number(byte_length) });
      } else if (normalized.startsWith('DELETE FROM upload_sessions')) {
        const sid = String(boundValues[0]);
        uploadSessions.delete(sid);
        for (const k of uploadChunks.keys()) if (k.startsWith(`${sid}:`)) uploadChunks.delete(k);
      } else if (normalized.startsWith('INSERT OR REPLACE INTO legal_holds')) {
        const [resource_id, resource_type, reason, active] = boundValues;
        legalHolds.set(String(resource_id), { resource_id: String(resource_id), resource_type: String(resource_type), reason: String(reason), active: Number(active) });
      } else if (normalized.startsWith('INSERT OR REPLACE INTO strong_rate_limits')) {
        const [bucket_key, counter, window_reset_ms] = boundValues;
        rateLimits.set(String(bucket_key), { bucket_key: String(bucket_key), counter: Number(counter), window_reset_ms: Number(window_reset_ms) });
      } else if (normalized.startsWith('INSERT OR REPLACE INTO queue_idempotency_keys')) {
        const [idempotency_key, job_type, processed_at_iso, status] = boundValues.map(String);
        queueKeys.set(idempotency_key, { idempotency_key, job_type, processed_at_iso, status });
      }
      return { success: true, meta: { changes: 1 } };
    },
  });

  return {
    prepare(query: string) {
      return makeStatement(query);
    },
    async batch(statements: D1PreparedStatement[]) {
      const out = [];
      for (const stmt of statements) {
        await stmt.run();
        out.push({ success: true });
      }
      return out;
    },
    async exec(_query: string) {
      return { count: 1, duration: 1 };
    },
  };
}
