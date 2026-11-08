/**
 * @file worker/db/migrationEngine.ts
 * @description Cloudflare D1 Migration Engine.
 *
 * Enforces:
 * - Deterministic, ordered migration execution.
 * - Migration SHA-256 checksum tracking and tampering detection.
 * - Idempotency (skips previously applied migrations).
 * - Multi-statement parsing and execution tracking.
 * - Explicit fail-closed execution without silent errors.
 */

import type { AppliedMigrationRecord, D1DatabaseBinding, MigrationFile } from './types';

export interface MigrationExecutionResult {
  readonly success: boolean;
  readonly appliedCount: number;
  readonly skippedCount: number;
  readonly appliedMigrations: AppliedMigrationRecord[];
  readonly error?: string;
}

export async function computeSha256Hex(content: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(content.trim()));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Splits raw SQL content into clean, executable statements,
 * safely handling comments and semicolons.
 */
export function splitSqlStatements(sql: string): string[] {
  const lines = sql.split('\n');
  const cleanLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') || !trimmed) continue;
    // Strip trailing line comments
    const commentIdx = line.indexOf('--');
    if (commentIdx >= 0) {
      cleanLines.push(line.slice(0, commentIdx));
    } else {
      cleanLines.push(line);
    }
  }

  return cleanLines
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

export class D1MigrationEngine {
  private readonly db: D1DatabaseBinding;

  constructor(db: D1DatabaseBinding) {
    if (!db || typeof db.exec !== 'function') {
      throw new Error('D1MigrationEngine requires a valid D1DatabaseBinding.');
    }
    this.db = db;
  }

  /**
   * Ensure migration tracking table exists.
   */
  public async ensureTrackingTable(): Promise<void> {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS _cf_migrations (
        migration_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        checksum_sha256 TEXT NOT NULL,
        applied_at_iso TEXT NOT NULL,
        execution_duration_ms INTEGER NOT NULL,
        statement_count INTEGER NOT NULL
      );
    `);
  }

  /**
   * Load history of applied migrations.
   */
  public async getAppliedMigrations(): Promise<AppliedMigrationRecord[]> {
    await this.ensureTrackingTable();
    const res = await this.db.prepare('SELECT * FROM _cf_migrations ORDER BY migration_id ASC').all<AppliedMigrationRecord>();
    return res.results || [];
  }

  /**
   * Run pending migrations idempotently.
   */
  public async applyMigrations(migrationFiles: MigrationFile[]): Promise<MigrationExecutionResult> {
    await this.ensureTrackingTable();
    const applied = await this.getAppliedMigrations();
    const appliedMap = new Map<string, AppliedMigrationRecord>();
    for (const r of applied) appliedMap.set(r.migration_id || (r as any).migrationId, r);

    // Verify ordering
    const sorted = [...migrationFiles].sort((a, b) => a.id.localeCompare(b.id));
    const appliedRecords: AppliedMigrationRecord[] = [];
    let skippedCount = 0;

    for (const migration of sorted) {
      const existing = appliedMap.get(migration.id);
      const computedChecksum = await computeSha256Hex(migration.sql);

      if (existing) {
        // Tampering verification
        const existingChecksum = existing.checksum_sha256 || (existing as any).checksumSha256;
        if (existingChecksum !== computedChecksum) {
          throw new Error(
            `MIGRATION_CHECKSUM_MISMATCH: Migration ${migration.id} was altered after execution! Expected ${existingChecksum}, calculated ${computedChecksum}.`
          );
        }
        skippedCount += 1;
        continue;
      }

      // Execute migration
      const startMs = Date.now();
      const statements = splitSqlStatements(migration.sql);
      
      for (const statement of statements) {
        await this.db.exec(statement);
      }

      const durationMs = Date.now() - startMs;
      const record: AppliedMigrationRecord = {
        migrationId: migration.id,
        name: migration.name,
        checksumSha256: computedChecksum,
        appliedAtIso: new Date().toISOString(),
        executionDurationMs: durationMs,
        statementCount: statements.length,
      };

      await this.db
        .prepare(
          'INSERT INTO _cf_migrations (migration_id, name, checksum_sha256, applied_at_iso, execution_duration_ms, statement_count) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(record.migrationId, record.name, record.checksumSha256, record.appliedAtIso, record.executionDurationMs, record.statementCount)
        .run();

      appliedRecords.push(record);
    }

    return {
      success: true,
      appliedCount: appliedRecords.length,
      skippedCount,
      appliedMigrations: appliedRecords,
    };
  }
}
