#!/usr/bin/env node
/**
 * Recover a partially applied USER_DB identity migration (0007-0009).
 *
 * Safety:
 * - Hard-pinned to the production USER_DB binding in wrangler.backend.jsonc.
 * - Requires a Cloudflare API token with D1 edit access.
 * - Dry-run is the default; --apply is required for DDL and ledger writes.
 * - Only additive CREATE/ALTER/INDEX statements are used. No DROP, DELETE, or data rewrite.
 * - Migration ledger rows are written only after the complete schema is verified.
 * - If D1's daily write quota is exhausted, the script stops; rerun after quota reset.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseJsonc } from './jsoncUtils.mjs';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'wrangler.backend.jsonc');
const EXPECTED_ACCOUNT_ID = '5bafb2033937006704e81afcc0b18b38';
const EXPECTED_DATABASE_NAME = 'radar-user-db';
const EXPECTED_DATABASE_ID = 'fbb98e6b-5200-4047-b4bc-15a51c06aa84';
const EXPECTED_BINDING = 'USER_DB';
const MIGRATION_LEDGER = 'd1_migrations';
const API_BASE = 'https://api.cloudflare.com/client/v4';

const MIGRATIONS = [
  { id: 7, name: '0007_cloudflare_native_identity_and_sessions.sql' },
  { id: 8, name: '0008_sms_otp_ip_rate_limit.sql' },
  { id: 9, name: '0009_sms_otp_code_digest.sql' },
];

const TABLE_DDL = {
  auth_identities: `CREATE TABLE IF NOT EXISTS auth_identities (
    provider TEXT NOT NULL CHECK (provider IN ('google', 'phone')),
    provider_subject TEXT NOT NULL,
    uid TEXT NOT NULL,
    email TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    phone_e164 TEXT,
    created_at_iso TEXT NOT NULL,
    last_authenticated_at_iso TEXT NOT NULL,
    PRIMARY KEY (provider, provider_subject),
    UNIQUE (provider, phone_e164),
    FOREIGN KEY (uid) REFERENCES user_profiles(uid) ON DELETE CASCADE
  );`,
  auth_oauth_states: `CREATE TABLE IF NOT EXISTS auth_oauth_states (
    state_hash TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    code_verifier TEXT NOT NULL,
    return_path TEXT NOT NULL DEFAULT '/',
    expires_at_ms INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL
  );`,
  auth_phone_challenges: `CREATE TABLE IF NOT EXISTS auth_phone_challenges (
    challenge_id TEXT PRIMARY KEY,
    phone_e164 TEXT NOT NULL,
    phone_hash TEXT NOT NULL,
    provider_reference TEXT,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'VERIFIED', 'EXPIRED', 'LOCKED')),
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at_ms INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    verified_at_ms INTEGER,
    ip_hash TEXT,
    code_hash TEXT
  );`,
};

const INDEX_DDL = [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash) WHERE token_hash IS NOT NULL;',
  'CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(status, expires_at_iso);',
  'CREATE INDEX IF NOT EXISTS idx_auth_identities_uid ON auth_identities(uid);',
  'CREATE INDEX IF NOT EXISTS idx_auth_identities_email ON auth_identities(email);',
  'CREATE INDEX IF NOT EXISTS idx_auth_oauth_states_expiry ON auth_oauth_states(expires_at_ms);',
  'CREATE INDEX IF NOT EXISTS idx_auth_phone_challenges_phone ON auth_phone_challenges(phone_hash, created_at_ms);',
  'CREATE INDEX IF NOT EXISTS idx_auth_phone_challenges_expiry ON auth_phone_challenges(expires_at_ms);',
  'CREATE INDEX IF NOT EXISTS idx_auth_phone_challenges_ip ON auth_phone_challenges(ip_hash, created_at_ms);',
];

function parseArgs(argv) {
  const allowed = new Set(['--dry-run', '--apply']);
  for (const arg of argv) {
    if (!allowed.has(arg)) throw new Error(`Unsupported argument: ${arg}`);
  }
  if (argv.includes('--dry-run') && argv.includes('--apply')) {
    throw new Error('Choose either --dry-run or --apply, not both.');
  }
  return { apply: argv.includes('--apply') };
}

function resolvePinnedTarget() {
  const config = parseJsonc(fs.readFileSync(CONFIG_PATH, 'utf8'), 'wrangler.backend.jsonc');
  const accountId = EXPECTED_ACCOUNT_ID;
  const configuredAccountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (configuredAccountId !== EXPECTED_ACCOUNT_ID) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID must exactly match the hard-pinned Radar Cloudflare account.');
  }
  const prod = config.env?.production;
  const vars = prod?.vars && typeof prod.vars === 'object' ? prod.vars : config.vars;
  const writePauseUntilUtc = String(vars?.DB_WRITES_PAUSED_UNTIL_UTC || '').trim();
  const bindings = Array.isArray(prod?.d1_databases) ? prod.d1_databases : config.d1_databases;
  const binding = Array.isArray(bindings)
    ? bindings.find((item) => (item.binding || item.name) === EXPECTED_BINDING)
    : undefined;
  if (!binding || binding.database_name !== EXPECTED_DATABASE_NAME
    || String(binding.database_id || '') !== EXPECTED_DATABASE_ID
    || binding.migrations_dir !== 'migrations/user-d1'
    || (binding.migrations_table || MIGRATION_LEDGER) !== MIGRATION_LEDGER) {
    throw new Error('USER_DB binding does not match the pinned production database and canonical migration directory.');
  }
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (token.length < 20) throw new Error('CLOUDFLARE_API_TOKEN is required; token value is never printed.');
  return { accountId, databaseId: binding.database_id, token, writePauseUntilUtc };
}


/**
 * Direct D1 REST writes bypass the Worker's request-level write-pause gate.
 * Never let the recovery script bypass an active, missing, or malformed production pause.
 */
function assertD1WritePauseExpired(target, nowMs = Date.now()) {
  const deadline = String(target.writePauseUntilUtc || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(deadline)) {
    throw new Error('Production DB_WRITES_PAUSED_UNTIL_UTC must be a valid UTC ISO-8601 timestamp before --apply.');
  }
  const deadlineMs = Date.parse(deadline);
  if (!Number.isSafeInteger(deadlineMs) || !Number.isSafeInteger(nowMs) || nowMs < deadlineMs) {
    throw new Error(`Production D1 write pause is still active until ${deadline}; refusing direct D1 recovery writes.`);
  }
}

async function query(target, sql) {
  const response = await fetch(`${API_BASE}/accounts/${target.accountId}/d1/database/${target.databaseId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${target.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true || (payload.errors || []).length > 0) {
    const messages = (payload?.errors || []).map((item) => String(item.message || item.code)).join('; ');
    throw new Error(`D1 query failed (HTTP ${response.status}): ${messages || 'unknown Cloudflare D1 error'}`);
  }
  return payload.result?.[0]?.results || [];
}

async function tableExists(target, name) {
  const rows = await query(target, `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}' LIMIT 1;`);
  return rows.length === 1;
}

async function columnsOf(target, table) {
  const rows = await query(target, `PRAGMA table_info(${table});`);
  return new Set(rows.map((row) => String(row.name)));
}

async function ensureColumn(target, table, column, ddl, apply) {
  const columns = await columnsOf(target, table);
  if (columns.has(column)) {
    console.log(`[skip] ${table}.${column} already exists`);
    return;
  }
  console.log(`[add] ${table}.${column}`);
  if (apply) await query(target, ddl);
}

async function ensureTable(target, table, ddl, apply) {
  if (await tableExists(target, table)) {
    console.log(`[skip] table ${table} already exists`);
    return;
  }
  console.log(`[create] table ${table}`);
  if (apply) await query(target, ddl);
}

async function ensureIndex(target, sql, apply) {
  const name = sql.match(/INDEX IF NOT EXISTS ([A-Za-z0-9_]+)/)?.[1];
  if (!name) throw new Error('Invalid canonical index statement.');
  const rows = await query(target, `SELECT name FROM sqlite_master WHERE type='index' AND name='${name}' LIMIT 1;`);
  if (rows.length) {
    console.log(`[skip] index ${name} already exists`);
    return;
  }
  console.log(`[create] index ${name}`);
  if (apply) await query(target, sql);
}

async function verifySchema(target) {
  const required = {
    user_sessions: ['token_hash', 'expires_at_iso', 'auth_provider'],
    auth_identities: ['provider', 'provider_subject', 'uid', 'email', 'email_verified', 'phone_e164', 'created_at_iso', 'last_authenticated_at_iso'],
    auth_oauth_states: ['state_hash', 'nonce', 'code_verifier', 'return_path', 'expires_at_ms', 'created_at_ms'],
    auth_phone_challenges: ['challenge_id', 'phone_e164', 'phone_hash', 'provider_reference', 'status', 'attempts', 'expires_at_ms', 'created_at_ms', 'verified_at_ms', 'ip_hash', 'code_hash'],
  };
  for (const [table, columns] of Object.entries(required)) {
    if (!(await tableExists(target, table))) throw new Error(`Missing required table: ${table}`);
    const actual = await columnsOf(target, table);
    const missing = columns.filter((column) => !actual.has(column));
    if (missing.length) throw new Error(`Missing columns in ${table}: ${missing.join(', ')}`);
  }
}

async function reconcileLedger(target, apply) {
  const rows = await query(target, `SELECT id, name FROM ${MIGRATION_LEDGER} WHERE id BETWEEN 7 AND 9 ORDER BY id;`);
  const byId = new Map(rows.map((row) => [Number(row.id), String(row.name)]));
  for (const migration of MIGRATIONS) {
    const existing = byId.get(migration.id);
    if (existing && existing !== migration.name) {
      throw new Error(`Migration ledger conflict at id ${migration.id}: found ${existing}`);
    }
    if (!existing) {
      console.log(`[ledger] record ${migration.id}: ${migration.name}`);
      if (apply) {
        const appliedAt = new Date().toISOString();
        await query(target, `INSERT OR IGNORE INTO ${MIGRATION_LEDGER} (id, name, applied_at) VALUES (${migration.id}, '${migration.name}', '${appliedAt}');`);
      }
    }
  }
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const target = resolvePinnedTarget();
  console.log(`USER_DB target: ${EXPECTED_DATABASE_NAME} (${target.databaseId})`);
  console.log(apply ? 'Mode: APPLY additive recovery' : 'Mode: DRY RUN (no writes)');
  if (apply) {
    assertD1WritePauseExpired(target);
    console.log(`Production D1 write pause expired at ${target.writePauseUntilUtc}; continuing with additive recovery.`);
  }

  const users = await query(target, 'SELECT COUNT(*) AS count FROM user_profiles;');
  const sessions = await query(target, 'SELECT COUNT(*) AS count FROM user_sessions;');
  console.log(`Existing user profiles: ${Number(users[0]?.count || 0)}; sessions: ${Number(sessions[0]?.count || 0)}`);

  await ensureColumn(target, 'user_sessions', 'token_hash', 'ALTER TABLE user_sessions ADD COLUMN token_hash TEXT;', apply);
  await ensureColumn(target, 'user_sessions', 'expires_at_iso', 'ALTER TABLE user_sessions ADD COLUMN expires_at_iso TEXT;', apply);
  await ensureColumn(target, 'user_sessions', 'auth_provider', "ALTER TABLE user_sessions ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'unknown';", apply);

  for (const [table, ddl] of Object.entries(TABLE_DDL)) await ensureTable(target, table, ddl, apply);

  // Existing partial auth_phone_challenges tables are upgraded without touching rows.
  await ensureColumn(target, 'auth_phone_challenges', 'ip_hash', 'ALTER TABLE auth_phone_challenges ADD COLUMN ip_hash TEXT;', apply);
  await ensureColumn(target, 'auth_phone_challenges', 'code_hash', 'ALTER TABLE auth_phone_challenges ADD COLUMN code_hash TEXT;', apply);

  for (const sql of INDEX_DDL) await ensureIndex(target, sql, apply);

  if (!apply) {
    console.log('Dry-run complete. No DDL or migration-ledger writes were performed.');
    return;
  }

  await verifySchema(target);
  await reconcileLedger(target, true);
  const finalRows = await query(target, `SELECT id, name, applied_at FROM ${MIGRATION_LEDGER} WHERE id BETWEEN 7 AND 9 ORDER BY id;`);
  if (finalRows.length !== 3 || finalRows.some((row, index) => Number(row.id) !== index + 7 || String(row.name) !== MIGRATIONS[index].name)) {
    throw new Error('Migration ledger did not verify all three identity migrations.');
  }
  console.log('SUCCESS: USER_DB identity schema is complete and migrations 0007-0009 are recorded.');
}

main().catch((error) => {
  console.error('[recover-user-d1-identity-migrations] ABORTED:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
