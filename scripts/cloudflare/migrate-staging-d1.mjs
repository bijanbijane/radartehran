#!/usr/bin/env node
/**
 * @file scripts/cloudflare/migrate-staging-d1.mjs
 * @description Hard-coded, fail-closed Staging D1 migration executor and post-migration verifier.
 *
 * Security Invariants (Sections 2, 3, 4):
 * - Rejects any arbitrary database name, database ID, environment, migration directory, or SQL path flag.
 * - Uses ONLY:
 *   - Database name: `radartehran-staging-db`
 *   - Environment: `staging`
 *   - Canonical migration directory: `migrations/d1`
 *   - Canonical migration ledger: `d1_migrations`
 * - Rejects placeholder D1 database IDs (`00000000-0000-0000-0000-000000000001`).
 * - Rejects any production database name or ID.
 * - Verifies canonical migration file list and SHA-256 checksums before touching Cloudflare.
 * - Verifies remote database existence and exact UUID match against committed `wrangler.jsonc` before applying SQL.
 * - Shows pending migration filenames before applying them.
 * - Verifies remote `d1_migrations` ledger entries and expected SQLite tables/indexes after applying migrations.
 */

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseJsonc } from './jsoncUtils.mjs';

const ROOT_DIR = process.cwd();
const WRANGLER_CONFIG_PATH = path.join(ROOT_DIR, 'wrangler.jsonc');
const AUDIT_OUTPUT_PATH = path.join(ROOT_DIR, 'docs/cloudflare/staging-d1-migration-audit.json');

export const ALLOWED_STAGING_MIGRATION_TARGET = Object.freeze({
  databaseName: 'radartehran-staging-db',
  environment: 'staging',
  workerName: 'radartehran-staging',
  migrationsDir: 'migrations/d1',
  migrationsTable: 'd1_migrations',
});

const PLACEHOLDER_D1_DATABASE_ID = '00000000-0000-0000-0000-000000000001';
const FORBIDDEN_PRODUCTION_IDENTIFIERS = Object.freeze([
  'radartehran',
  'radartehran-db',
  'radartehran-prod',
  'radartehran-production',
  'radartehran-prod-db',
]);

export const CANONICAL_D1_MIGRATIONS = Object.freeze([
  {
    fileName: '0001_core_projections_and_watermarks.sql',
    relativePath: 'migrations/d1/0001_core_projections_and_watermarks.sql',
    expectedSha256: '12abe3e8b02dfd1185aa6930545db52b67bedd1f6521752f5d4d92a128415b61',
  },
  {
    fileName: '0002_upload_sessions_legal_holds_and_rate_limits.sql',
    relativePath: 'migrations/d1/0002_upload_sessions_legal_holds_and_rate_limits.sql',
    expectedSha256: '19b161ad2212f51d83f2e7e706bb41d6c807da72ae7b538d9f11e7b6b5ae88ab',
  },
  {
    fileName: '0003_media_objects_and_queue_execution_leases.sql',
    relativePath: 'migrations/d1/0003_media_objects_and_queue_execution_leases.sql',
    expectedSha256: '439ddae35f082807198b6412063c7728552945f9edaf63cf61e76aff0d9aa0c0',
  },
]);

export const EXPECTED_SCHEMA_TABLES = Object.freeze([
  'd1_migrations',
  'neighborhood_projections',
  'bargain_projections',
  'sync_watermarks',
  'upload_sessions',
  'upload_session_chunks',
  'legal_holds',
  'strong_rate_limits',
  'queue_idempotency_keys',
  'media_objects',
  'queue_job_executions',
  'auth_revocation_events',
]);

export const EXPECTED_SCHEMA_INDEXES = Object.freeze([
  'idx_hood_proj_city_price',
  'idx_bargain_proj_city_hood',
  'idx_upload_sessions_owner_created',
  'idx_legal_holds_active',
  'idx_strong_rate_limits_reset',
  'idx_queue_idem_processed',
  'idx_media_objects_owner_state',
  'idx_media_objects_target',
  'idx_media_objects_lifecycle_updated',
  'idx_queue_job_exec_status_lease',
  'idx_queue_job_exec_type_updated',
  'idx_auth_revocation_uid_created',
]);

export function assertNoArbitraryTargetFlags(rawArgs) {
  const allowedFlags = new Set(['--dry-check-only', '--apply-remote']);
  for (const arg of rawArgs) {
    if (!allowedFlags.has(arg)) {
      throw new Error(
        `ARBITRARY_MIGRATION_TARGET_FORBIDDEN: Argument "${arg}" is forbidden. Staging migration target is hard-coded to database="radartehran-staging-db", env="staging", dir="migrations/d1", ledger="d1_migrations".`,
      );
    }
  }
}

export function validateStagingD1TargetAndMigrations({
  wranglerConfig,
  allowPlaceholderForLocalDryCheck = false,
}) {
  const staging = wranglerConfig?.env?.staging;
  const production = wranglerConfig?.env?.production;

  if (!staging || staging.name !== ALLOWED_STAGING_MIGRATION_TARGET.workerName) {
    throw new Error('INVALID_STAGING_WORKER_ENV: env.staging.name must equal "radartehran-staging"');
  }
  if (!production || production.name !== 'radartehran') {
    throw new Error('INVALID_PRODUCTION_GUARD: env.production.name must remain "radartehran"');
  }

  const d1List = staging.d1_databases;
  if (!Array.isArray(d1List) || d1List.filter((entry) => entry?.binding === 'DB').length !== 1) {
    throw new Error('INVALID_STAGING_D1_ARRAY: env.staging.d1_databases must contain exactly one legacy DB migration target');
  }

  // The Cloudflare-native architecture may bind USER_DB and RESEARCH_DB alongside the
  // legacy DB during migration. This script is narrowly scoped to the explicit DB binding.
  const d1Config = d1List.find((entry) => entry?.binding === 'DB');
  const dbName = String(d1Config?.database_name || '').trim();
  const dbId = String(d1Config?.database_id || '').trim();
  const migDir = String(d1Config?.migrations_dir || '').trim();
  const migTable = String(d1Config?.migrations_table || '').trim();

  if (
    FORBIDDEN_PRODUCTION_IDENTIFIERS.includes(dbName.toLowerCase()) ||
    dbName.toLowerCase().includes('prod')
  ) {
    throw new Error(`PRODUCTION_D1_TARGET_FORBIDDEN: Database name "${dbName}" is a production identifier`);
  }

  const prodDbIds = Array.isArray(production?.d1_databases)
    ? production.d1_databases.map((d) => String(d?.database_id || '').trim()).filter(Boolean)
    : [];
  if (dbId && prodDbIds.includes(dbId)) {
    throw new Error(`PRODUCTION_D1_ID_FORBIDDEN: Database ID "${dbId}" matches a production database ID`);
  }

  if (dbName !== ALLOWED_STAGING_MIGRATION_TARGET.databaseName) {
    throw new Error(
      `STAGING_D1_NAME_MISMATCH: Expected "${ALLOWED_STAGING_MIGRATION_TARGET.databaseName}", got "${dbName}"`,
    );
  }
  if (migDir !== ALLOWED_STAGING_MIGRATION_TARGET.migrationsDir) {
    throw new Error(
      `STAGING_D1_MIGRATIONS_DIR_MISMATCH: Expected "${ALLOWED_STAGING_MIGRATION_TARGET.migrationsDir}", got "${migDir}"`,
    );
  }
  if (migTable !== ALLOWED_STAGING_MIGRATION_TARGET.migrationsTable) {
    throw new Error(
      `STAGING_D1_LEDGER_MISMATCH: Expected "${ALLOWED_STAGING_MIGRATION_TARGET.migrationsTable}", got "${migTable}"`,
    );
  }

  const isPlaceholderId =
    !dbId ||
    dbId === PLACEHOLDER_D1_DATABASE_ID ||
    /^0{8}-0{4}-0{4}-0{4}-0{11}[01]$/.test(dbId) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbId);

  if (isPlaceholderId && !allowPlaceholderForLocalDryCheck) {
    throw new Error(
      `PLACEHOLDER_STAGING_D1_ID_REJECTED: Committed database_id "${dbId}" is a placeholder or invalid UUID. Commit the real radartehran-staging-db UUID to wrangler.jsonc before running remote migrations.`,
    );
  }

  // Verify canonical migration directory contents and SHA-256 checksums
  const absDir = path.join(ROOT_DIR, ALLOWED_STAGING_MIGRATION_TARGET.migrationsDir);
  if (!fs.existsSync(absDir)) {
    throw new Error(`MISSING_MIGRATIONS_DIR: ${ALLOWED_STAGING_MIGRATION_TARGET.migrationsDir}`);
  }
  const diskSqlFiles = fs
    .readdirSync(absDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const expectedFiles = CANONICAL_D1_MIGRATIONS.map((m) => m.fileName);
  if (JSON.stringify(diskSqlFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `UNEXPECTED_MIGRATION_FILE_SET: Expected [${expectedFiles.join(', ')}], found [${diskSqlFiles.join(', ')}]`,
    );
  }

  for (const mig of CANONICAL_D1_MIGRATIONS) {
    const absFile = path.join(ROOT_DIR, mig.relativePath);
    const content = fs.readFileSync(absFile, 'utf-8').trim();
    if (content.includes('schema_migrations')) {
      throw new Error(`COMPETING_LEDGER_FORBIDDEN: ${mig.fileName} references schema_migrations`);
    }
    if (/DROP\s+(TABLE|DATABASE)/i.test(content)) {
      throw new Error(`DESTRUCTIVE_RESET_FORBIDDEN: ${mig.fileName} contains destructive DROP statement`);
    }
    const sha256 = crypto.createHash('sha256').update(content).digest('hex');
    if (sha256 !== mig.expectedSha256) {
      throw new Error(
        `D1_MIGRATION_CHECKSUM_MISMATCH on ${mig.fileName}: expected ${mig.expectedSha256}, got ${sha256}`,
      );
    }
  }

  return {
    databaseName: dbName,
    committedDatabaseId: dbId,
    isPlaceholderId,
    migrationsDir: migDir,
    migrationsTable: migTable,
  };
}

function runWrangler(args) {
  const token = (process.env.CF_STAGING_MIGRATION_TOKEN || process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const env = {
    ...process.env,
    CI: 'true',
    ...(token ? { CLOUDFLARE_API_TOKEN: token } : {}),
  };
  const result = spawnSync('npx', ['wrangler', ...args], {
    cwd: ROOT_DIR,
    env,
    encoding: 'utf-8',
    timeout: 90_000,
  });
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function parseD1QueryJsonResults(stdoutText) {
  const parsed = JSON.parse(stdoutText);
  if (Array.isArray(parsed) && parsed[0] && Array.isArray(parsed[0].results)) {
    return parsed[0].results;
  }
  if (parsed && Array.isArray(parsed.results)) {
    return parsed.results;
  }
  throw new Error('AMBIGUOUS_D1_QUERY_RESULT: Unable to parse JSON results array from wrangler d1 execute output');
}

function main() {
  const rawArgs = process.argv.slice(2);
  assertNoArbitraryTargetFlags(rawArgs);
  const applyRemote = rawArgs.includes('--apply-remote');
  const dryCheckOnly = rawArgs.includes('--dry-check-only') || !applyRemote;

  const wranglerConfig = parseJsonc(fs.readFileSync(WRANGLER_CONFIG_PATH, 'utf-8'), 'wrangler.jsonc');
  const validated = validateStagingD1TargetAndMigrations({
    wranglerConfig,
    allowPlaceholderForLocalDryCheck: dryCheckOnly,
  });

  if (dryCheckOnly) {
    console.log(
      `[migrate-staging-d1] Local dry-check passed for target="${validated.databaseName}", ledger="${validated.migrationsTable}", canonicalMigrations=${CANONICAL_D1_MIGRATIONS.length}, placeholderId=${validated.isPlaceholderId}.`,
    );
    return;
  }

  const configuredAccountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/i.test(configuredAccountId)) {
    throw new Error(
      'CLOUDFLARE_ACCOUNT_ID_MISSING_OR_INVALID: Valid 32-char hex CLOUDFLARE_ACCOUNT_ID is required before remote D1 migrations.',
    );
  }

  // Step 1: Verify Cloudflare account identity
  const whoami = runWrangler(['whoami']);
  const combinedWhoami = `${whoami.stdout}\n${whoami.stderr}`;
  if (
    whoami.status !== 0 ||
    combinedWhoami.includes('You are not authenticated') ||
    !combinedWhoami.toLowerCase().includes(configuredAccountId)
  ) {
    throw new Error(
      'CLOUDFLARE_AUTH_VERIFICATION_FAILED: wrangler whoami failed or account ID did not match CLOUDFLARE_ACCOUNT_ID',
    );
  }

  // Step 2: Verify exact remote database name exists and UUID matches committed wrangler.jsonc
  const d1List = runWrangler(['d1', 'list', '--json']);
  if (d1List.status !== 0 || !d1List.stdout.startsWith('[')) {
    throw new Error('REMOTE_D1_LIST_FAILED: Unable to list D1 databases to verify target identity');
  }
  const remoteDatabases = JSON.parse(d1List.stdout);
  const matchingDbs = remoteDatabases.filter(
    (d) => d && d.name === ALLOWED_STAGING_MIGRATION_TARGET.databaseName,
  );
  if (matchingDbs.length !== 1) {
    throw new Error(
      `REMOTE_STAGING_D1_NOT_FOUND: Expected exactly 1 remote database named "${ALLOWED_STAGING_MIGRATION_TARGET.databaseName}", found ${matchingDbs.length}. Aborting before SQL execution.`,
    );
  }
  const remoteUuid = String(matchingDbs[0].uuid || '').trim();
  if (remoteUuid !== validated.committedDatabaseId) {
    throw new Error(
      `STAGING_D1_UUID_MISMATCH: Remote "${ALLOWED_STAGING_MIGRATION_TARGET.databaseName}" UUID (${remoteUuid}) does not match committed wrangler.jsonc database_id (${validated.committedDatabaseId}). Aborting before SQL execution.`,
    );
  }

  // Step 3: Show pending migration filenames before applying them
  const listPending = runWrangler([
    'd1',
    'migrations',
    'list',
    ALLOWED_STAGING_MIGRATION_TARGET.databaseName,
    '--env',
    ALLOWED_STAGING_MIGRATION_TARGET.environment,
    '--remote',
  ]);
  if (listPending.status !== 0) {
    throw new Error(`PENDING_MIGRATIONS_CHECK_FAILED: wrangler d1 migrations list exited with ${listPending.status}`);
  }
  const pendingFiles = CANONICAL_D1_MIGRATIONS.map((m) => m.fileName).filter((fileName) =>
    listPending.stdout.includes(fileName),
  );
  console.log(
    `[migrate-staging-d1] Target verified: ${ALLOWED_STAGING_MIGRATION_TARGET.databaseName} (${remoteUuid}). Pending canonical migration files: ${
      pendingFiles.length > 0 ? pendingFiles.join(', ') : 'none (all already applied)'
    }`,
  );

  // Step 4: Apply pending canonical migrations to the exact Staging database
  const applyRes = runWrangler([
    'd1',
    'migrations',
    'apply',
    ALLOWED_STAGING_MIGRATION_TARGET.databaseName,
    '--env',
    ALLOWED_STAGING_MIGRATION_TARGET.environment,
    '--remote',
  ]);
  if (applyRes.status !== 0) {
    throw new Error(`REMOTE_D1_MIGRATION_APPLY_FAILED: wrangler d1 migrations apply exited with ${applyRes.status}`);
  }

  // Step 5: Verify resulting d1_migrations ledger entries
  const ledgerQuery = runWrangler([
    'd1',
    'execute',
    ALLOWED_STAGING_MIGRATION_TARGET.databaseName,
    '--env',
    ALLOWED_STAGING_MIGRATION_TARGET.environment,
    '--remote',
    '--json',
    '--command',
    'SELECT id, name, applied_at FROM d1_migrations ORDER BY id ASC;',
  ]);
  if (ledgerQuery.status !== 0) {
    throw new Error('POST_MIGRATION_LEDGER_QUERY_FAILED: Unable to query remote d1_migrations ledger');
  }
  const ledgerRows = parseD1QueryJsonResults(ledgerQuery.stdout);
  const appliedNames = ledgerRows.map((r) => String(r.name || ''));
  for (const mig of CANONICAL_D1_MIGRATIONS) {
    if (!appliedNames.includes(mig.fileName)) {
      throw new Error(
        `POST_MIGRATION_LEDGER_INCOMPLETE: Canonical migration "${mig.fileName}" is missing from remote d1_migrations ledger`,
      );
    }
  }

  // Step 6: Verify expected schema tables and indexes (and absence of schema_migrations)
  const schemaQuery = runWrangler([
    'd1',
    'execute',
    ALLOWED_STAGING_MIGRATION_TARGET.databaseName,
    '--env',
    ALLOWED_STAGING_MIGRATION_TARGET.environment,
    '--remote',
    '--json',
    '--command',
    "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' ORDER BY type, name;",
  ]);
  if (schemaQuery.status !== 0) {
    throw new Error('POST_MIGRATION_SCHEMA_QUERY_FAILED: Unable to query sqlite_master on radartehran-staging-db');
  }
  const schemaRows = parseD1QueryJsonResults(schemaQuery.stdout);
  const remoteTables = schemaRows.filter((r) => r.type === 'table').map((r) => String(r.name));
  const remoteIndexes = schemaRows.filter((r) => r.type === 'index').map((r) => String(r.name));

  if (remoteTables.includes('schema_migrations')) {
    throw new Error('COMPETING_SCHEMA_MIGRATIONS_TABLE_DETECTED: schema_migrations must not exist');
  }
  for (const expectedTable of EXPECTED_SCHEMA_TABLES) {
    if (!remoteTables.includes(expectedTable)) {
      throw new Error(`MISSING_EXPECTED_D1_TABLE: "${expectedTable}" not found after migration`);
    }
  }
  for (const expectedIdx of EXPECTED_SCHEMA_INDEXES) {
    if (!remoteIndexes.includes(expectedIdx)) {
      throw new Error(`MISSING_EXPECTED_D1_INDEX: "${expectedIdx}" not found after migration`);
    }
  }

  const auditReport = {
    schemaVersion: '1.0',
    executedAtIso: new Date().toISOString(),
    environment: ALLOWED_STAGING_MIGRATION_TARGET.environment,
    databaseName: ALLOWED_STAGING_MIGRATION_TARGET.databaseName,
    verifiedDatabaseId: remoteUuid,
    authoritativeLedger: ALLOWED_STAGING_MIGRATION_TARGET.migrationsTable,
    pendingMigrationsBeforeApply: pendingFiles,
    appliedLedgerEntries: ledgerRows,
    verifiedTables: EXPECTED_SCHEMA_TABLES,
    verifiedIndexes: EXPECTED_SCHEMA_INDEXES,
    status: 'REMOTE_D1_MIGRATIONS_APPLIED_AND_VERIFIED',
  };
  fs.mkdirSync(path.dirname(AUDIT_OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(AUDIT_OUTPUT_PATH, `${JSON.stringify(auditReport, null, 2)}\n`, 'utf-8');
  console.log(
    `[migrate-staging-d1] SUCCESS: Verified ${ledgerRows.length} entries in d1_migrations and all canonical tables/indexes on ${ALLOWED_STAGING_MIGRATION_TARGET.databaseName} (${remoteUuid}).`,
  );
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(WRANGLER_CONFIG_PATH, '..', 'scripts/cloudflare/migrate-staging-d1.mjs');
if (isMainModule) {
  try {
    main();
  } catch (err) {
    console.error('[migrate-staging-d1] ABORTED:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
