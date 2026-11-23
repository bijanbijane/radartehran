import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inspectD1OperationalDiagnostics } from '../worker/db/d1SchemaAndMigrations';
import type { D1Database, D1PreparedStatement } from '../worker/types';

const USER_MIGRATIONS = [
  '0001_core_projections_and_watermarks.sql',
  '0002_upload_sessions_legal_holds_and_rate_limits.sql',
  '0003_media_objects_and_queue_execution_leases.sql',
  '0004_user_accounts_privacy_and_sessions.sql',
  '0005_account_lifecycle_permits_and_outbox.sql',
  '0006_consent_revision_ordering.sql',
  '0007_cloudflare_native_identity_and_sessions.sql',
  '0008_sms_otp_ip_rate_limit.sql',
  '0009_sms_otp_code_digest.sql',
] as const;

function makeDb(applied: readonly string[]): D1Database {
  const db = {
    prepare(sql: string): D1PreparedStatement {
      const statement = {
        bind(..._values: unknown[]) { return statement as unknown as D1PreparedStatement; },
        async all<T = Record<string, unknown>>() {
          if (sql.includes('FROM d1_migrations')) {
            return {
              results: applied.map((name, index) => ({
                id: index + 1,
                name,
                applied_at: '2026-11-23 00:00:00',
              })) as T[],
              success: true,
            };
          }
          return { results: [], success: true };
        },
        async first<T = Record<string, unknown>>() { return null as T | null; },
        async run() { return { success: true, meta: { changes: 0 } }; },
      };
      return statement as unknown as D1PreparedStatement;
    },
    async batch() { return []; },
    async exec() { return { count: 0, duration: 0 }; },
  };
  return db as unknown as D1Database;
}

describe('USER_DB migration readiness catalog', () => {
  it('reports identity and SMS migrations as pending until actually applied', async () => {
    const result = await inspectD1OperationalDiagnostics(makeDb(USER_MIGRATIONS.slice(0, 6)), 'user');
    assert.equal(result.expectedCount, 9);
    assert.equal(result.allCanonicalMigrationsApplied, false);
    assert.deepEqual(result.pendingMigrations, [...USER_MIGRATIONS.slice(6)]);
  });

  it('reports USER_DB ready only when all nine user migrations are recorded', async () => {
    const result = await inspectD1OperationalDiagnostics(makeDb(USER_MIGRATIONS), 'user');
    assert.equal(result.expectedCount, 9);
    assert.equal(result.allCanonicalMigrationsApplied, true);
    assert.deepEqual(result.pendingMigrations, []);
  });

  it('does not confuse USER_DB migrations with the legacy D1 catalog', async () => {
    const result = await inspectD1OperationalDiagnostics(makeDb(USER_MIGRATIONS.slice(0, 6)), 'legacy');
    assert.equal(result.expectedCount, 3);
    assert.equal(result.allCanonicalMigrationsApplied, true);
  });
});
