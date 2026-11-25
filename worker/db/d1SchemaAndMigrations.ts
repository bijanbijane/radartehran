import type { D1Database, D1PreparedStatement } from '../types';

export const AUTHORITATIVE_D1_MIGRATIONS_TABLE = 'd1_migrations' as const;

/** Exact Wrangler migration ledger expected for the production USER_DB binding. */
export const USER_D1_MIGRATION_FILES: readonly string[] = [
  '0001_core_projections_and_watermarks.sql',
  '0002_upload_sessions_legal_holds_and_rate_limits.sql',
  '0003_media_objects_and_queue_execution_leases.sql',
  '0004_user_accounts_privacy_and_sessions.sql',
  '0005_account_lifecycle_permits_and_outbox.sql',
  '0006_consent_revision_ordering.sql',
] as const;

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
  {
    version: '0003',
    name: '0003_media_objects_and_queue_execution_leases',
    fileName: '0003_media_objects_and_queue_execution_leases.sql',
    checksumSha256: '439ddae35f082807198b6412063c7728552945f9edaf63cf61e76aff0d9aa0c0',
    sql: `-- Canonical Staging & Edge D1 Migration 0003: Media Objects Metadata, Queue Execution Leases & Auth Revocation Audit
-- Authoritative Migration Ledger: d1_migrations (managed by Wrangler D1 Migrations)
CREATE TABLE IF NOT EXISTS media_objects (
  object_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  city_id TEXT NOT NULL DEFAULT 'tehran',
  hood_id INTEGER NOT NULL DEFAULT 1,
  media_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256_checksum TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  lifecycle_state TEXT NOT NULL,
  deletion_state TEXT NOT NULL DEFAULT 'ACTIVE',
  legal_hold INTEGER NOT NULL DEFAULT 0,
  retention_until TEXT,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  deleted_at_iso TEXT
);

CREATE INDEX IF NOT EXISTS idx_media_objects_owner_state ON media_objects(owner_uid, lifecycle_state, deletion_state);
CREATE INDEX IF NOT EXISTS idx_media_objects_target ON media_objects(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_media_objects_lifecycle_updated ON media_objects(lifecycle_state, updated_at_iso);

CREATE TABLE IF NOT EXISTS queue_job_executions (
  idempotency_key TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  message_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_expires_at_ms INTEGER,
  last_error_code TEXT,
  last_error_message TEXT,
  result_json TEXT,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  completed_at_iso TEXT
);

CREATE INDEX IF NOT EXISTS idx_queue_job_exec_status_lease ON queue_job_executions(status, lease_expires_at_ms);
CREATE INDEX IF NOT EXISTS idx_queue_job_exec_type_updated ON queue_job_executions(job_type, updated_at_iso);

CREATE TABLE IF NOT EXISTS auth_revocation_events (
  event_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  action TEXT NOT NULL,
  valid_since_seconds INTEGER,
  actor_uid TEXT NOT NULL,
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_revocation_uid_created ON auth_revocation_events(uid, created_at_iso);`,
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

export interface D1MediaObjectRecord {
  object_id: string;
  owner_uid: string;
  bucket_name: string;
  storage_key: string;
  city_id: string;
  hood_id: number;
  media_type: 'image' | 'video';
  mime_type: string;
  size_bytes: number;
  sha256_checksum: string;
  target_type: string | null;
  target_id: string | null;
  lifecycle_state: 'PENDING_UPLOAD' | 'ACTIVE' | 'FAILED_UPLOAD' | 'PENDING_DELETE' | 'DELETED';
  deletion_state: 'ACTIVE' | 'PENDING_PHYSICAL_DELETE' | 'PHYSICALLY_DELETED';
  legal_hold: number;
  retention_until: string | null;
  created_at_iso: string;
  updated_at_iso: string;
  deleted_at_iso: string | null;
}

export interface D1QueueJobExecutionRecord {
  idempotency_key: string;
  job_type: string;
  message_id: string;
  correlation_id: string;
  status: 'PENDING' | 'PROCESSING' | 'RETRYABLE_FAILURE' | 'PERMANENT_FAILURE' | 'COMPLETED';
  attempt_count: number;
  lease_owner: string | null;
  lease_expires_at_ms: number | null;
  last_error_code: string | null;
  last_error_message: string | null;
  result_json: string | null;
  created_at_iso: string;
  updated_at_iso: string;
  completed_at_iso: string | null;
}

export interface D1AuthRevocationEventRecord {
  event_id: string;
  uid: string;
  action: 'REVOKE_BEFORE' | 'DISABLE_USER' | 'REENABLE_USER';
  valid_since_seconds: number | null;
  actor_uid: string;
  reason: string;
  idempotency_key: string;
  created_at_iso: string;
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
export async function inspectD1OperationalDiagnostics(
  db: D1Database | undefined,
  expectedMigrationFiles: readonly string[] = D1_MIGRATIONS.map((migration) => migration.fileName),
): Promise<{
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
      expectedCount: expectedMigrationFiles.length,
      allCanonicalMigrationsApplied: false,
      pendingMigrations: [...expectedMigrationFiles],
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
      checksum_sha256: meta ? meta.checksumSha256 : 'MIGRATION_FILE_NOT_MIRRORED_IN_RUNTIME',
      applied_at: row.applied_at,
    };
  });
  const appliedFileNames = new Set(migrationsApplied.map((applied) => applied.fileName));
  const pendingMigrations = expectedMigrationFiles.filter((fileName) => !appliedFileNames.has(fileName));

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
      .prepare('SELECT job_type, completed_at_iso AS processed_at_iso FROM queue_job_executions WHERE status = ?1 AND completed_at_iso IS NOT NULL ORDER BY completed_at_iso DESC LIMIT 1')
      .bind('COMPLETED')
      .first<{ job_type: string; processed_at_iso: string }>();
  } catch {
    latestQueue = null;
  }
  if (!latestQueue) {
    try {
      latestQueue = await db
        .prepare('SELECT job_type, processed_at_iso FROM queue_idempotency_keys WHERE status = ?1 ORDER BY processed_at_iso DESC LIMIT 1')
        .bind('COMPLETED')
        .first<{ job_type: string; processed_at_iso: string }>();
    } catch {
      latestQueue = null;
    }
  }

  return {
    ledgerTable: AUTHORITATIVE_D1_MIGRATIONS_TABLE,
    expectedCount: expectedMigrationFiles.length,
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

export { createLocalD1DatabaseSimulator } from './localD1Simulator';
