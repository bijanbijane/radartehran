/**
 * @file tests/cloudflare-phase5-d1-and-database.test.ts
 * @description Phase 5: Cloudflare D1 Architecture, Migration Engine,
 * Schema Integrity, and Firestore Data Reconciliation Test Suite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEHRAN_RADAR_DATABASE_INVENTORY,
  D1MigrationEngine,
  SimulatedD1Database,
  reconcileNeighborhoodBenchmarks,
  splitSqlStatements,
  computeSha256Hex,
  type MigrationFile,
} from '../worker/db/index';

test('Phase 5: Database Architecture, Data Governance & D1 Readiness', async (t) => {
  await t.test('1. verifies complete database inventory, authoritative store assignments, and justifications', () => {
    assert.ok(TEHRAN_RADAR_DATABASE_INVENTORY.length >= 10);

    const adminsRecord = TEHRAN_RADAR_DATABASE_INVENTORY.find((r) => r.identifier === 'admins');
    assert.ok(adminsRecord);
    assert.equal(adminsRecord?.authoritativeStore, 'FIRESTORE');
    assert.equal(adminsRecord?.workloadAffinity, 'FIRESTORE_AUTHORITATIVE');

    const bargainsRecord = TEHRAN_RADAR_DATABASE_INVENTORY.find((r) => r.identifier === 'bargains');
    assert.ok(bargainsRecord);
    assert.equal(bargainsRecord?.workloadAffinity, 'D1_RELATIONAL_CANDIDATE');

    const overridesRecord = TEHRAN_RADAR_DATABASE_INVENTORY.find((r) => r.identifier === 'neighborhoodOverrides');
    assert.ok(overridesRecord);
    assert.equal(overridesRecord?.workloadAffinity, 'D1_RELATIONAL_CANDIDATE');

    const telemetryRecord = TEHRAN_RADAR_DATABASE_INVENTORY.find((r) => r.identifier === 'telemetry_journal');
    assert.ok(telemetryRecord);
    assert.equal(telemetryRecord?.workloadAffinity, 'ANALYTICAL_NDJSON_OR_WAREHOUSE');
  });

  await t.test('2. executes D1 migrations deterministically, verifying table creation and execution records', async () => {
    const db = new SimulatedD1Database();
    const engine = new D1MigrationEngine(db);

    const sampleMigration: MigrationFile = {
      id: '0001_initial_schema',
      name: 'Initial Relational Schema',
      sql: `
        -- Table creation
        CREATE TABLE IF NOT EXISTS neighborhood_benchmarks (
          hood_id INTEGER PRIMARY KEY,
          city_id TEXT NOT NULL,
          buy_per_sqm_million REAL NOT NULL,
          rahn_80m_million REAL NOT NULL,
          updated_at_iso TEXT NOT NULL
        );
      `,
      checksumSha256: await computeSha256Hex(`
        -- Table creation
        CREATE TABLE IF NOT EXISTS neighborhood_benchmarks (
          hood_id INTEGER PRIMARY KEY,
          city_id TEXT NOT NULL,
          buy_per_sqm_million REAL NOT NULL,
          rahn_80m_million REAL NOT NULL,
          updated_at_iso TEXT NOT NULL
        );
      `),
      description: 'Initial schema setup',
    };

    const res = await engine.applyMigrations([sampleMigration]);
    assert.equal(res.success, true);
    assert.equal(res.appliedCount, 1);
    assert.equal(res.skippedCount, 0);

    // Verify record in tracking table
    const applied = await engine.getAppliedMigrations();
    assert.equal(applied.length, 1);
    assert.equal(applied[0].name, 'Initial Relational Schema');

    // Idempotent re-run skips previously applied migration
    const rerun = await engine.applyMigrations([sampleMigration]);
    assert.equal(rerun.appliedCount, 0);
    assert.equal(rerun.skippedCount, 1);
  });

  await t.test('3. detects post-execution migration tampering via checksum mismatch', async () => {
    const db = new SimulatedD1Database();
    const engine = new D1MigrationEngine(db);

    const originalSql = 'CREATE TABLE t1 (id TEXT PRIMARY KEY);';
    const m1: MigrationFile = {
      id: '0001_t1',
      name: 'M1',
      sql: originalSql,
      checksumSha256: await computeSha256Hex(originalSql),
      description: 'T1',
    };

    await engine.applyMigrations([m1]);

    // Altered migration file with same ID but different SQL
    const tamperedSql = 'CREATE TABLE t1 (id TEXT PRIMARY KEY, tampered TEXT);';
    const tamperedM1: MigrationFile = {
      id: '0001_t1',
      name: 'M1',
      sql: tamperedSql,
      checksumSha256: await computeSha256Hex(tamperedSql),
      description: 'Tampered T1',
    };

    await assert.rejects(
      () => engine.applyMigrations([tamperedM1]),
      /MIGRATION_CHECKSUM_MISMATCH/
    );
  });

  await t.test('4. executes SQL query statements with parameterized bindings safely', async () => {
    const db = new SimulatedD1Database();
    await db.exec('CREATE TABLE neighborhood_benchmarks (hood_id INT, city_id TEXT, buy_per_sqm_million REAL, rahn_80m_million REAL, updated_at_iso TEXT);');

    // Insert parameterized benchmark
    await db
      .prepare('INSERT INTO neighborhood_benchmarks (hood_id, city_id, buy_per_sqm_million, rahn_80m_million, updated_at_iso) VALUES (?, ?, ?, ?, ?)')
      .bind(14, 'tehran', 125.5, 950.0, '2026-05-01T00:00:00Z')
      .run();

    // Query back
    const row = await db
      .prepare('SELECT * FROM neighborhood_benchmarks WHERE hood_id = ?')
      .bind(14)
      .first<{ hood_id: number; buy_per_sqm_million: number }>();

    assert.ok(row);
    assert.equal(row?.hood_id, 14);
    assert.equal(row?.buy_per_sqm_million, 125.5);
  });

  await t.test('5. reconciles Firestore vs D1 data and flags discrepancies accurately', async () => {
    const firestoreDocs = [
      { hoodId: 1, buyPerSqm: 100, rahn80m: 800, updatedAt: '2026-05-01T00:00:00Z' },
      { hoodId: 2, buyPerSqm: 120, rahn80m: 900, updatedAt: '2026-05-01T00:00:00Z' },
      { hoodId: 3, buyPerSqm: 150, rahn80m: 1100, updatedAt: '2026-05-01T00:00:00Z' }, // will have price mismatch
    ];

    const d1Rows = [
      { hood_id: 1, buy_per_sqm_million: 100, rahn_80m_million: 800, updated_at_iso: '2026-05-01T00:00:00Z' },
      { hood_id: 2, buy_per_sqm_million: 120, rahn_80m_million: 900, updated_at_iso: '2026-05-01T00:00:00Z' },
      { hood_id: 3, buy_per_sqm_million: 140, rahn_80m_million: 1100, updated_at_iso: '2026-05-01T00:00:00Z' }, // mismatch: 140 vs 150
      { hood_id: 4, buy_per_sqm_million: 80, rahn_80m_million: 600, updated_at_iso: '2026-05-01T00:00:00Z' }, // missing in Firestore
    ];

    const report = await reconcileNeighborhoodBenchmarks(firestoreDocs, d1Rows);
    assert.equal(report.totalSourceScanned, 3);
    assert.equal(report.totalDestinationScanned, 4);
    assert.equal(report.counts.MATCHED, 2); // hood 1 and 2
    assert.equal(report.counts.CONTENT_MISMATCH, 1); // hood 3
    assert.equal(report.counts.MISSING_SOURCE, 1); // hood 4
    assert.equal(report.passed, false);
  });
});
