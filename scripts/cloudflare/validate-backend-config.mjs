#!/usr/bin/env node
/**
 * @file scripts/cloudflare/validate-backend-config.mjs
 * @description Preflight fail-closed validator for `wrangler.backend.jsonc` (RT-DB-TRIAD-001).
 *
 * Enforces all architectural isolation & safety invariants:
 *  1. Production (`radartehran-api`) declares `USER_DB`, legacy alias `DB`, and `RESEARCH_DB`.
 *  2. `USER_DB.database_id === DB.database_id` (both bound to `radar-user-db`).
 *  3. `RESEARCH_DB.database_id !== USER_DB.database_id` (physically isolated `radar-researcher-db`).
 *  4. ZERO direct D1 binding or reference to IRNI `radar-neighborhood-db` (`f335efe8-37ac-4c7d-a057-bc9f4480f6c6`).
 *  5. ZERO obsolete/missing legacy D1 IDs (`9bcadfaf...`, `2facfc2d...`, `c5ae237a...`) in active bindings.
 *  6. ZERO Staging <-> Production D1 database_id or database_name collision.
 *  7. Distinct, valid, non-destructive `migrations_dir` for `USER_DB` and `RESEARCH_DB` with `d1_migrations` ledger.
 *  8. ZERO plaintext secrets in `vars` across all environments.
 *  9. Exact expected Cloudflare account_id & worker names (`radartehran-api` / `radartehran-api-staging`).
 * 10. Optional `--require-staging-provisioned` fail-closed gate until staging D1 DBs are provisioned.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseJsonc } from './jsoncUtils.mjs';

export const EXPECTED_PRODUCTION_BACKEND_TARGETS = Object.freeze({
  accountId: '5bafb2033937006704e81afcc0b18b38',
  productionWorkerName: 'radartehran-api',
  stagingWorkerName: 'radartehran-api-staging',
  userDbName: 'radar-user-db',
  userDbId: 'fbb98e6b-5200-4047-b4bc-15a51c06aa84',
  userMigrationsDir: 'migrations/user-d1',
  researchDbName: 'radar-researcher-db',
  researchDbId: 'a04f9716-fb95-44da-841c-b54be252db70',
  researchMigrationsDir: 'migrations/research-d1',
  migrationsTable: 'd1_migrations',
});

export const FORBIDDEN_IRNI_IDENTIFIERS = Object.freeze([
  'radar-neighborhood-db',
  'f335efe8-37ac-4c7d-a057-bc9f4480f6c6',
  'NEIGHBORHOOD_DB',
  'IRNI_DB',
]);

export const OBSOLETE_LEGACY_D1_IDS = Object.freeze([
  '9bcadfaf-7dc1-4ee9-b821-19c8b57658b4', // obsolete radartehran-staging-db
  '2facfc2d-2bbf-4c0f-9a95-88aee27932ec', // obsolete radartehran-prod-db
  'c5ae237a-48ae-43e4-9d52-c18752f7a42c', // obsolete radar-tehran-dev
]);

const FORBIDDEN_SECRET_VAR_KEY_PATTERN =
  /(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_KEY|CREDENTIAL)/i;
const ALLOWED_NON_SECRET_VAR_KEYS = new Set([
  'RESEARCH_HMAC_KEY_VERSION',
  'IRNI_API_CONTRACT_STATUS',
]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEHOLDER_UUID_REGEX = /^0{8}-0{4}-0{4}-0{4}-0{11}[0-9a-f]$/i;

function checkMigrationDirectory(rootDir, migrationsDir, label, errors) {
  if (!migrationsDir || typeof migrationsDir !== 'string') {
    errors.push(`MISSING_MIGRATIONS_DIR:${label}`);
    return [];
  }
  const absDir = path.join(rootDir, migrationsDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    errors.push(`MIGRATIONS_DIR_NOT_FOUND:${label}:${migrationsDir}`);
    return [];
  }
  const files = fs
    .readdirSync(absDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    errors.push(`EMPTY_MIGRATIONS_DIR:${label}:${migrationsDir}`);
    return [];
  }
  for (const file of files) {
    const content = fs.readFileSync(path.join(absDir, file), 'utf-8');
    if (/\bDROP\s+(TABLE|DATABASE)\b/i.test(content)) {
      errors.push(`DESTRUCTIVE_SQL_FORBIDDEN:${migrationsDir}/${file}`);
    }
    if (content.includes('radar-neighborhood-db') || content.includes('f335efe8-37ac-4c7d-a057-bc9f4480f6c6')) {
      errors.push(`FORBIDDEN_IRNI_REFERENCE_IN_MIGRATION:${migrationsDir}/${file}`);
    }
  }
  return files;
}

function scanVarsForPlaintextSecrets(varsObj, envLabel, errors) {
  if (!varsObj || typeof varsObj !== 'object') return;
  for (const [key, value] of Object.entries(varsObj)) {
    if (ALLOWED_NON_SECRET_VAR_KEYS.has(key)) continue;
    if (FORBIDDEN_SECRET_VAR_KEY_PATTERN.test(key)) {
      errors.push(`PLAINTEXT_SECRET_IN_VARS_FORBIDDEN:${envLabel}.${key}`);
    }
    if (typeof value === 'string' && /^(sk_|ghp_|AIza|Bearer\s+)/i.test(value.trim())) {
      errors.push(`SUSPECTED_SECRET_VALUE_IN_VARS:${envLabel}.${key}`);
    }
  }
}

function scanRetiredFirebaseRuntimeVars(varsObj, envLabel, errors) {
  if (!varsObj || typeof varsObj !== 'object' || Array.isArray(varsObj)) return;
  for (const key of Object.keys(varsObj)) {
    if (/^(FIREBASE|FIRESTORE)_/i.test(key)) {
      errors.push(`RETIRED_FIREBASE_RUNTIME_VAR_FORBIDDEN:${envLabel}.${key}`);
    }
  }
}

function validateWritePauseTimestamp(varsObj, envLabel, errors) {
  const value = String(varsObj?.DB_WRITES_PAUSED_UNTIL_UTC ?? '').trim();
  if (!value) return;
  const timestamp = Date.parse(value);
  if (!value.includes('T') || !value.endsWith('Z') || !Number.isFinite(timestamp)) {
    errors.push(`INVALID_DB_WRITES_PAUSE_TIMESTAMP:${envLabel}`);
  }
}

function scanBindingsForForbiddenIds(d1List, envLabel, errors) {
  if (!Array.isArray(d1List)) return;
  for (const entry of d1List) {
    const binding = String(entry?.binding || '');
    const dbName = String(entry?.database_name || '');
    const dbId = String(entry?.database_id || '');
    for (const forbidden of FORBIDDEN_IRNI_IDENTIFIERS) {
      if (
        binding.toLowerCase() === forbidden.toLowerCase() ||
        dbName.toLowerCase() === forbidden.toLowerCase() ||
        dbId.toLowerCase() === forbidden.toLowerCase()
      ) {
        errors.push(`IRNI_DIRECT_D1_BINDING_FORBIDDEN:${envLabel}:${binding || dbName || dbId}`);
      }
    }
    if (OBSOLETE_LEGACY_D1_IDS.includes(dbId.toLowerCase())) {
      errors.push(`OBSOLETE_LEGACY_D1_ID_FORBIDDEN:${envLabel}:${binding}:${dbId}`);
    }
  }
}

export function validateBackendWranglerConfig(
  config,
  { rootDir = process.cwd(), requireStagingProvisioned = false, skipFsChecks = false } = {},
) {
  const errors = [];
  const warnings = [];

  if (!config || typeof config !== 'object') {
    return { ok: false, errors: ['INVALID_CONFIG_OBJECT'], warnings, summary: null };
  }

  // 1. Account & worker names
  if (config.account_id !== EXPECTED_PRODUCTION_BACKEND_TARGETS.accountId) {
    errors.push(`INVALID_ACCOUNT_ID:expected=${EXPECTED_PRODUCTION_BACKEND_TARGETS.accountId}:got=${config.account_id}`);
  }
  if (config.name !== EXPECTED_PRODUCTION_BACKEND_TARGETS.productionWorkerName) {
    errors.push(`INVALID_PROD_WORKER_NAME:expected=${EXPECTED_PRODUCTION_BACKEND_TARGETS.productionWorkerName}:got=${config.name}`);
  }

  // 2. Production D1 bindings
  const prodD1 = Array.isArray(config.d1_databases) ? config.d1_databases : [];
  scanBindingsForForbiddenIds(prodD1, 'production', errors);

  const userDb = prodD1.find((d) => d.binding === 'USER_DB');
  const legacyDb = prodD1.find((d) => d.binding === 'DB');
  const researchDb = prodD1.find((d) => d.binding === 'RESEARCH_DB');

  if (!userDb) errors.push('MISSING_PRODUCTION_BINDING:USER_DB');
  if (!legacyDb) errors.push('MISSING_PRODUCTION_BINDING:DB');
  if (!researchDb) errors.push('MISSING_PRODUCTION_BINDING:RESEARCH_DB');

  if (userDb && legacyDb) {
    if (userDb.database_id !== legacyDb.database_id) {
      errors.push(`USER_DB_AND_DB_ALIAS_MISMATCH:${userDb.database_id}!=${legacyDb.database_id}`);
    }
    if (userDb.database_name !== legacyDb.database_name) {
      errors.push(`USER_DB_AND_DB_NAME_MISMATCH:${userDb.database_name}!=${legacyDb.database_name}`);
    }
    if (userDb.migrations_dir !== legacyDb.migrations_dir) {
      errors.push(`USER_DB_AND_DB_MIGRATIONS_DIR_MISMATCH:${userDb.migrations_dir}!=${legacyDb.migrations_dir}`);
    }
    if (userDb.migrations_table !== legacyDb.migrations_table) {
      errors.push(`USER_DB_AND_DB_MIGRATIONS_TABLE_MISMATCH:${userDb.migrations_table}!=${legacyDb.migrations_table}`);
    }
  }

  if (userDb) {
    if (userDb.database_name !== EXPECTED_PRODUCTION_BACKEND_TARGETS.userDbName) {
      errors.push(`UNEXPECTED_USER_DB_NAME:${userDb.database_name}`);
    }
    if (userDb.database_id !== EXPECTED_PRODUCTION_BACKEND_TARGETS.userDbId) {
      errors.push(`UNEXPECTED_USER_DB_ID:${userDb.database_id}`);
    }
    if (userDb.migrations_dir !== EXPECTED_PRODUCTION_BACKEND_TARGETS.userMigrationsDir) {
      errors.push(`UNEXPECTED_USER_DB_MIGRATIONS_DIR:${userDb.migrations_dir}`);
    }
    if (userDb.migrations_table !== EXPECTED_PRODUCTION_BACKEND_TARGETS.migrationsTable) {
      errors.push(`INVALID_USER_DB_MIGRATIONS_TABLE:${userDb.migrations_table}`);
    }
  }

  if (researchDb) {
    if (researchDb.database_name !== EXPECTED_PRODUCTION_BACKEND_TARGETS.researchDbName) {
      errors.push(`UNEXPECTED_RESEARCH_DB_NAME:${researchDb.database_name}`);
    }
    if (researchDb.database_id !== EXPECTED_PRODUCTION_BACKEND_TARGETS.researchDbId) {
      errors.push(`UNEXPECTED_RESEARCH_DB_ID:${researchDb.database_id}`);
    }
    if (researchDb.migrations_dir !== EXPECTED_PRODUCTION_BACKEND_TARGETS.researchMigrationsDir) {
      errors.push(`UNEXPECTED_RESEARCH_DB_MIGRATIONS_DIR:${researchDb.migrations_dir}`);
    }
    if (researchDb.migrations_table !== EXPECTED_PRODUCTION_BACKEND_TARGETS.migrationsTable) {
      errors.push(`INVALID_RESEARCH_DB_MIGRATIONS_TABLE:${researchDb.migrations_table}`);
    }
  }

  if (userDb && researchDb) {
    if (userDb.database_id === researchDb.database_id) {
      errors.push('USER_DB_AND_RESEARCH_DB_SAME_PHYSICAL_ID_FORBIDDEN');
    }
    if (userDb.migrations_dir && researchDb.migrations_dir && userDb.migrations_dir === researchDb.migrations_dir) {
      errors.push('USER_DB_AND_RESEARCH_DB_SAME_MIGRATIONS_DIR_FORBIDDEN');
    }
  }

  // 3. Migration directories verification
  let userMigrationFiles = [];
  let researchMigrationFiles = [];
  if (!skipFsChecks) {
    if (userDb) {
      userMigrationFiles = checkMigrationDirectory(rootDir, userDb.migrations_dir, 'USER_DB', errors);
    }
    if (researchDb) {
      researchMigrationFiles = checkMigrationDirectory(rootDir, researchDb.migrations_dir, 'RESEARCH_DB', errors);
    }
  }

  // 4. Staging isolation checks
  const staging = config?.env?.staging;
  if (!staging || staging.name !== EXPECTED_PRODUCTION_BACKEND_TARGETS.stagingWorkerName) {
    errors.push(`INVALID_STAGING_WORKER_NAME:expected=${EXPECTED_PRODUCTION_BACKEND_TARGETS.stagingWorkerName}:got=${staging?.name}`);
  }

  const prodIds = new Set(prodD1.map((d) => String(d.database_id || '').toLowerCase()).filter(Boolean));
  const prodNames = new Set(prodD1.map((d) => String(d.database_name || '').toLowerCase()).filter(Boolean));
  const stagingD1 = Array.isArray(staging?.d1_databases) ? staging.d1_databases : [];
  scanBindingsForForbiddenIds(stagingD1, 'staging', errors);
  const irniDirectBindingPresent = [...prodD1, ...stagingD1].some((binding) =>
    FORBIDDEN_IRNI_IDENTIFIERS.some((identifier) =>
      [binding?.binding, binding?.database_name, binding?.database_id]
        .some((value) => String(value || '').trim().toLowerCase() === identifier.toLowerCase()),
    ),
  );

  let stagingProvisioningStatus = 'PROVISIONED';
  if (stagingD1.length === 0) {
    stagingProvisioningStatus = 'BLOCKED_STAGING_DATABASES_NOT_PROVISIONED';
    if (requireStagingProvisioned) {
      errors.push('BLOCKED_STAGING_DATABASES_NOT_PROVISIONED');
    } else {
      warnings.push('BLOCKED_STAGING_DATABASES_NOT_PROVISIONED');
    }
  } else {
    const stgUser = stagingD1.find((d) => d.binding === 'USER_DB');
    const stgDb = stagingD1.find((d) => d.binding === 'DB');
    const stgRes = stagingD1.find((d) => d.binding === 'RESEARCH_DB');
    if (!stgUser || !stgDb || !stgRes) {
      errors.push('INCOMPLETE_STAGING_D1_TRIAD_BINDINGS');
    }
    if (stgUser && stgDb && stgUser.database_id !== stgDb.database_id) {
      errors.push('STAGING_USER_DB_AND_DB_ALIAS_MISMATCH');
    }
    if (stgUser && stgRes && stgUser.database_id === stgRes.database_id) {
      errors.push('STAGING_USER_DB_AND_RESEARCH_DB_SAME_ID_FORBIDDEN');
    }
    for (const d of stagingD1) {
      const id = String(d.database_id || '').toLowerCase();
      const name = String(d.database_name || '').toLowerCase();
      if (prodIds.has(id)) {
        errors.push(`STAGING_USES_PRODUCTION_D1_ID_FORBIDDEN:${d.binding}:${id}`);
      }
      if (prodNames.has(name)) {
        errors.push(`STAGING_USES_PRODUCTION_D1_NAME_FORBIDDEN:${d.binding}:${name}`);
      }
      if (!UUID_REGEX.test(id) || PLACEHOLDER_UUID_REGEX.test(id)) {
        errors.push(`INVALID_OR_PLACEHOLDER_STAGING_D1_ID:${d.binding}:${id}`);
      }
    }
  }

  // 5. Background processing wiring: Cron handlers enqueue work and cannot run without
  // a producer, matching consumer, and durable DLQ. The nightly cron also emits R2 jobs.
  const configuredCrons = Array.isArray(config.triggers?.crons) ? config.triggers.crons : [];
  const supportedCronPatterns = new Set(['30 0 * * *', '30 18 * * *', '0 * * * *']);
  for (const cron of configuredCrons) {
    if (!supportedCronPatterns.has(cron)) errors.push(`UNSUPPORTED_CRON_PATTERN:${cron}`);
  }
  const queueProducers = Array.isArray(config.queues?.producers) ? config.queues.producers : [];
  const queueConsumers = Array.isArray(config.queues?.consumers) ? config.queues.consumers : [];
  if (configuredCrons.length > 0) {
    const mainQueueProducer = queueProducers.find((p) => p.binding === 'RADAR_QUEUE' && p.queue);
    const dlqProducer = queueProducers.find((p) => p.binding === 'RADAR_DLQ' && p.queue);
    if (!mainQueueProducer) errors.push('CRON_TRIGGERS_REQUIRE_RADAR_QUEUE_PRODUCER');
    if (!dlqProducer) errors.push('CRON_TRIGGERS_REQUIRE_RADAR_DLQ_PRODUCER');
    const matchingConsumer = mainQueueProducer
      ? queueConsumers.find((c) => c.queue === mainQueueProducer.queue)
      : undefined;
    if (!matchingConsumer) errors.push('CRON_TRIGGERS_REQUIRE_RADAR_QUEUE_CONSUMER');
    if (matchingConsumer && dlqProducer && matchingConsumer.dead_letter_queue !== dlqProducer.queue) {
      errors.push('RADAR_QUEUE_DLQ_BINDING_MISMATCH');
    }
  }
  if (configuredCrons.includes('30 18 * * *')) {
    const hasMediaBucket = Array.isArray(config.r2_buckets) &&
      config.r2_buckets.some((bucket) => bucket.binding === 'MEDIA_BUCKET' && bucket.bucket_name);
    if (!hasMediaBucket) errors.push('NIGHTLY_MEDIA_CRON_REQUIRES_MEDIA_BUCKET');
  }

  // 6. Plaintext secrets and retired Firebase runtime configuration scan.
  scanVarsForPlaintextSecrets(config.vars, 'production', errors);
  scanVarsForPlaintextSecrets(staging?.vars, 'staging', errors);
  scanRetiredFirebaseRuntimeVars(config.vars, 'production', errors);
  scanRetiredFirebaseRuntimeVars(config.previews?.vars, 'previews', errors);
  for (const [environmentName, environmentConfig] of Object.entries(config.env ?? {})) {
    scanRetiredFirebaseRuntimeVars(environmentConfig?.vars, environmentName, errors);
  }
  validateWritePauseTimestamp(config.vars, 'production', errors);
  validateWritePauseTimestamp(staging?.vars, 'staging', errors);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      productionWorker: config.name,
      stagingWorker: staging?.name ?? null,
      userDbId: userDb?.database_id ?? null,
      researchDbId: researchDb?.database_id ?? null,
      userMigrationsCount: userMigrationFiles.length,
      researchMigrationsCount: researchMigrationFiles.length,
      stagingProvisioningStatus,
      irniDirectBindingPresent,
      dbWritesPausedUntilUtc: config.vars?.DB_WRITES_PAUSED_UNTIL_UTC ?? null,
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const configArg = args.find((a) => a.startsWith('--config='));
  const configRelPath = configArg ? configArg.slice('--config='.length) : 'wrangler.backend.jsonc';
  const requireStagingProvisioned = args.includes('--require-staging-provisioned');
  const absConfigPath = path.resolve(process.cwd(), configRelPath);

  if (!fs.existsSync(absConfigPath)) {
    console.error(`❌ Backend config not found: ${configRelPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(absConfigPath, 'utf-8');
  const parsed = parseJsonc(raw, configRelPath);
  const result = validateBackendWranglerConfig(parsed, {
    rootDir: process.cwd(),
    requireStagingProvisioned,
  });

  if (!result.ok) {
    console.error('❌ Backend Wrangler config validation FAILED:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log('✅ Backend Wrangler config validation PASSED:', JSON.stringify(result.summary));
  if (result.warnings.length > 0) {
    console.log('⚠️ Warnings:', result.warnings.join(', '));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
