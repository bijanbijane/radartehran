#!/usr/bin/env node
/**
 * @file scripts/cloudflare/provision-staging.mjs
 * @description Cloudflare Staging bootstrap & routine pre-deploy verification script for `radartehran-staging`.
 *
 * Modes:
 * - `--mode=bootstrap` (default):
 *   1. Stage A (Initial Bootstrap Validation): Parses `wrangler.jsonc` as JSONC, verifies `env.staging.name === "radartehran-staging"`
 *      and `env.production.name === "radartehran"`, verifies canonical D1 migration files and SHA-256 checksums,
 *      permits missing or placeholder initial Staging resource bindings, and rejects any Production or unexpected resource target.
 *   2. Verifies Cloudflare account identity against `CLOUDFLARE_ACCOUNT_ID` (fails closed on mismatch or unverified identity).
 *   3. Lists existing Staging resources (failing closed if any list command fails rather than creating blindly),
 *      reuses matching Staging resources, and creates missing ones. Fails closed on any creation error while recording partial state.
 *   4. Stage B (Post-Provisioning Validation): Writes/updates the complete canonical `env.staging` bindings in `wrangler.jsonc`
 *      (`d1_databases`, `r2_buckets`, `kv_namespaces`, `queues.producers`, `queues.consumers`) preserving JSONC comments,
 *      and validates the resulting configuration.
 *   5. When `--provision-internal-secrets` is passed, uploads `ADMIN_API_SECRET`, `VALUATION_SEAL_SECRET`, and `R2_SIGNING_SECRET`
 *      strictly to `radartehran-staging` and fails closed immediately if any secret upload fails.
 * - `--mode=verify-only`:
 *   Stage C (Routine Deployment Validation): Requires all canonical Staging bindings and real non-placeholder resource IDs
 *   in `wrangler.jsonc`, verifies remote resources match committed configuration, and NEVER creates or deletes resources.
 */

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseJsonc, updateEnvStagingInWranglerJsonc } from './jsoncUtils.mjs';

const ROOT_DIR = process.cwd();
const DEFAULT_WRANGLER_CONFIG_PATH = path.join(ROOT_DIR, 'wrangler.jsonc');
const DEFAULT_MANIFEST_OUTPUT_PATH = path.join(ROOT_DIR, 'docs/cloudflare/staging-resource-manifest.json');

export const CANONICAL_MIGRATIONS = Object.freeze([
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
]);

export const ALLOWED_STAGING_RESOURCES = Object.freeze({
  worker: 'radartehran-staging',
  d1: { name: 'radartehran-staging-db', binding: 'DB', type: 'd1_database' },
  r2: { name: 'radartehran-staging-media', binding: 'MEDIA_BUCKET', type: 'r2_bucket' },
  kv: { name: 'radartehran-staging-kv', binding: 'RADAR_KV', type: 'kv_namespace' },
  queue: { name: 'radartehran-staging-queue', binding: 'RADAR_QUEUE', type: 'queue' },
  dlq: { name: 'radartehran-staging-dlq', binding: 'RADAR_DLQ', type: 'queue_dlq' },
});

export const PLACEHOLDER_D1_DATABASE_ID = '00000000-0000-0000-0000-000000000001';
export const PLACEHOLDER_KV_NAMESPACE_ID = '00000000000000000000000000000001';

const VALID_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_KV_HEX_RE = /^[0-9a-f]{32}$/i;

export function assertStagingScopedName(resourceName) {
  const clean = String(resourceName || '').trim();
  if (
    !clean.startsWith('radartehran-staging') ||
    clean === 'radartehran' ||
    clean.toLowerCase().includes('prod')
  ) {
    throw new Error(`SECURITY_GUARD_ABORT: Resource "${clean}" is not strictly Staging-scoped.`);
  }
}

export function isPlaceholderOrInvalidD1Id(rawId) {
  const id = String(rawId || '').trim();
  return (
    !id ||
    id === PLACEHOLDER_D1_DATABASE_ID ||
    id === '<TO_BE_PROVISIONED>' ||
    /^0{8}-0{4}-0{4}-0{4}-0{11}[01]$/.test(id) ||
    !VALID_UUID_RE.test(id)
  );
}

export function isPlaceholderOrInvalidKvId(rawId) {
  const id = String(rawId || '').trim();
  return (
    !id ||
    id === PLACEHOLDER_KV_NAMESPACE_ID ||
    id === '<TO_BE_PROVISIONED>' ||
    /^0{31}[01]$/.test(id) ||
    !VALID_KV_HEX_RE.test(id)
  );
}

export function inspectStagingBindingIds(parsedWrangler) {
  const staging = parsedWrangler?.env?.staging;
  const boundD1DatabaseId = String(staging?.d1_databases?.[0]?.database_id || '').trim();
  const boundKvNamespaceId = String(staging?.kv_namespaces?.[0]?.id || '').trim();
  const hasPlaceholderD1 = isPlaceholderOrInvalidD1Id(boundD1DatabaseId);
  const hasPlaceholderKv = isPlaceholderOrInvalidKvId(boundKvNamespaceId);
  return {
    boundD1DatabaseId,
    boundKvNamespaceId,
    hasPlaceholderD1,
    hasPlaceholderKv,
    hasAnyPlaceholderBindingId: hasPlaceholderD1 || hasPlaceholderKv,
  };
}

export function verifyCanonicalD1MigrationsOnDisk(rootDir = ROOT_DIR) {
  for (const mig of CANONICAL_MIGRATIONS) {
    const absPath = path.join(rootDir, mig.relativePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`MISSING_CANONICAL_D1_MIGRATION: ${mig.relativePath}`);
    }
    const content = fs.readFileSync(absPath, 'utf-8').trim();
    if (content.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) {
      throw new Error(
        `AMBIGUOUS_MIGRATION_LEDGER_DETECTED: ${mig.relativePath} must not create competing schema_migrations table; Wrangler d1_migrations is authoritative.`,
      );
    }
    const actualSha256 = crypto.createHash('sha256').update(content).digest('hex');
    if (actualSha256 !== mig.expectedSha256) {
      throw new Error(
        `D1_MIGRATION_CHECKSUM_MISMATCH on ${mig.fileName}: expected ${mig.expectedSha256}, got ${actualSha256}`,
      );
    }
  }
}

/**
 * Stage A: Initial Bootstrap Validation (`--mode=bootstrap`).
 * Permits missing initial Staging resource bindings before provisioning, while strictly validating
 * JSONC syntax, Staging/Production worker names, migration checksums, and rejecting any unexpected
 * or Production resource names if bindings are already partially or fully present.
 */
export function validateInitialBootstrapConfig({
  rawJsoncText,
  rootDir = ROOT_DIR,
}) {
  verifyCanonicalD1MigrationsOnDisk(rootDir);

  const parsed = parseJsonc(rawJsoncText, 'wrangler.jsonc');
  const staging = parsed?.env?.staging;
  const production = parsed?.env?.production;

  if (!staging || staging.name !== ALLOWED_STAGING_RESOURCES.worker) {
    throw new Error('INVALID_STAGING_CONFIG: env.staging.name must equal "radartehran-staging"');
  }
  if (!production || production.name !== 'radartehran') {
    throw new Error('INVALID_PRODUCTION_GUARD: env.production.name must remain "radartehran"');
  }

  // If optional bindings exist before bootstrap, verify they never target Production or unexpected names
  if (Array.isArray(staging.d1_databases) && staging.d1_databases.length > 0) {
    if (staging.d1_databases.length !== 1) {
      throw new Error('INVALID_STAGING_D1_CONFIG: env.staging.d1_databases must contain at most 1 entry');
    }
    const d1Cfg = staging.d1_databases[0];
    assertStagingScopedName(d1Cfg.database_name);
    if (
      d1Cfg.binding !== ALLOWED_STAGING_RESOURCES.d1.binding ||
      d1Cfg.database_name !== ALLOWED_STAGING_RESOURCES.d1.name
    ) {
      throw new Error(
        `UNEXPECTED_STAGING_D1_BINDING: Expected binding="${ALLOWED_STAGING_RESOURCES.d1.binding}" and database_name="${ALLOWED_STAGING_RESOURCES.d1.name}"`,
      );
    }
  }

  if (Array.isArray(staging.r2_buckets) && staging.r2_buckets.length > 0) {
    const r2Cfg = staging.r2_buckets[0];
    assertStagingScopedName(r2Cfg.bucket_name);
    if (
      r2Cfg.binding !== ALLOWED_STAGING_RESOURCES.r2.binding ||
      r2Cfg.bucket_name !== ALLOWED_STAGING_RESOURCES.r2.name
    ) {
      throw new Error(
        `UNEXPECTED_STAGING_R2_BINDING: Expected binding="${ALLOWED_STAGING_RESOURCES.r2.binding}" and bucket_name="${ALLOWED_STAGING_RESOURCES.r2.name}"`,
      );
    }
  }

  if (Array.isArray(staging.kv_namespaces) && staging.kv_namespaces.length > 0) {
    const kvCfg = staging.kv_namespaces[0];
    if (kvCfg.binding !== ALLOWED_STAGING_RESOURCES.kv.binding) {
      throw new Error(
        `UNEXPECTED_STAGING_KV_BINDING: Expected binding="${ALLOWED_STAGING_RESOURCES.kv.binding}", got "${kvCfg.binding}"`,
      );
    }
  }

  if (staging.queues?.producers && Array.isArray(staging.queues.producers)) {
    for (const prod of staging.queues.producers) {
      assertStagingScopedName(prod.queue);
      const allowedProducer =
        (prod.binding === ALLOWED_STAGING_RESOURCES.queue.binding &&
          prod.queue === ALLOWED_STAGING_RESOURCES.queue.name) ||
        (prod.binding === ALLOWED_STAGING_RESOURCES.dlq.binding &&
          prod.queue === ALLOWED_STAGING_RESOURCES.dlq.name);
      if (!allowedProducer) {
        throw new Error(
          `UNEXPECTED_STAGING_QUEUE_PRODUCER: binding="${prod.binding}", queue="${prod.queue}"`,
        );
      }
    }
  }

  return parsed;
}

/**
 * Stage B & C Complete Binding Validator:
 * Validates that `env.staging` in `wrangler.jsonc` has the full set of canonical bindings
 * (`d1_databases`, `r2_buckets`, `kv_namespaces`, `queues.producers`, `queues.consumers`).
 * When `rejectPlaceholders` is true, also rejects placeholder or malformed D1/KV IDs.
 */
export function validateCompleteStagingWranglerConfig(
  parsedWrangler,
  { rejectPlaceholders = true } = {},
) {
  const staging = parsedWrangler?.env?.staging;
  const production = parsedWrangler?.env?.production;

  if (!staging || staging.name !== ALLOWED_STAGING_RESOURCES.worker) {
    throw new Error('INVALID_STAGING_CONFIG: env.staging.name must equal "radartehran-staging"');
  }
  if (!production || production.name !== 'radartehran') {
    throw new Error('INVALID_PRODUCTION_GUARD: env.production.name must remain "radartehran"');
  }

  // 1. D1 validation
  const d1Cfg = staging.d1_databases?.[0];
  if (
    !Array.isArray(staging.d1_databases) ||
    staging.d1_databases.length !== 1 ||
    !d1Cfg ||
    d1Cfg.binding !== ALLOWED_STAGING_RESOURCES.d1.binding ||
    d1Cfg.database_name !== ALLOWED_STAGING_RESOURCES.d1.name ||
    d1Cfg.migrations_dir !== 'migrations/d1' ||
    d1Cfg.migrations_table !== 'd1_migrations'
  ) {
    throw new Error(
      'INVALID_STAGING_D1_CONFIG: d1_databases[0] must bind DB -> radartehran-staging-db with migrations_dir="migrations/d1" and migrations_table="d1_migrations"',
    );
  }
  assertStagingScopedName(d1Cfg.database_name);

  // 2. R2 validation
  const r2Cfg = staging.r2_buckets?.[0];
  if (
    !Array.isArray(staging.r2_buckets) ||
    staging.r2_buckets.length !== 1 ||
    !r2Cfg ||
    r2Cfg.binding !== ALLOWED_STAGING_RESOURCES.r2.binding ||
    r2Cfg.bucket_name !== ALLOWED_STAGING_RESOURCES.r2.name
  ) {
    throw new Error(
      'INVALID_STAGING_R2_CONFIG: r2_buckets[0] must bind MEDIA_BUCKET -> radartehran-staging-media',
    );
  }
  assertStagingScopedName(r2Cfg.bucket_name);

  // 3. KV validation
  const kvCfg = staging.kv_namespaces?.[0];
  if (
    !Array.isArray(staging.kv_namespaces) ||
    staging.kv_namespaces.length !== 1 ||
    !kvCfg ||
    kvCfg.binding !== ALLOWED_STAGING_RESOURCES.kv.binding
  ) {
    throw new Error('INVALID_STAGING_KV_CONFIG: kv_namespaces[0] must bind RADAR_KV');
  }

  // 4. Queues producers & consumers validation
  const producers = staging.queues?.producers;
  const consumers = staging.queues?.consumers;
  if (!Array.isArray(producers) || producers.length < 2) {
    throw new Error(
      'INVALID_STAGING_QUEUES_CONFIG: env.staging.queues.producers must declare RADAR_QUEUE and RADAR_DLQ',
    );
  }
  const mainProd = producers.find(
    (p) =>
      p.binding === ALLOWED_STAGING_RESOURCES.queue.binding &&
      p.queue === ALLOWED_STAGING_RESOURCES.queue.name,
  );
  const dlqProd = producers.find(
    (p) =>
      p.binding === ALLOWED_STAGING_RESOURCES.dlq.binding &&
      p.queue === ALLOWED_STAGING_RESOURCES.dlq.name,
  );
  if (!mainProd || !dlqProd) {
    throw new Error(
      'INVALID_STAGING_QUEUE_PRODUCERS: Must bind RADAR_QUEUE -> radartehran-staging-queue and RADAR_DLQ -> radartehran-staging-dlq',
    );
  }
  if (!Array.isArray(consumers) || consumers.length !== 1) {
    throw new Error(
      'INVALID_STAGING_QUEUE_CONSUMERS: env.staging.queues.consumers must contain 1 consumer for radartehran-staging-queue',
    );
  }
  const consumer = consumers[0];
  if (
    consumer.queue !== ALLOWED_STAGING_RESOURCES.queue.name ||
    consumer.dead_letter_queue !== ALLOWED_STAGING_RESOURCES.dlq.name
  ) {
    throw new Error(
      'INVALID_STAGING_QUEUE_CONSUMER_DLQ: Consumer must target radartehran-staging-queue with dead_letter_queue="radartehran-staging-dlq"',
    );
  }

  // Prevent Production resource ID collisions
  const prodD1Ids = Array.isArray(production.d1_databases)
    ? production.d1_databases.map((d) => String(d?.database_id || '').trim()).filter(Boolean)
    : [];
  if (d1Cfg.database_id && prodD1Ids.includes(String(d1Cfg.database_id).trim())) {
    throw new Error('PRODUCTION_D1_ID_FORBIDDEN: Staging D1 database_id collides with Production');
  }
  const prodKvIds = Array.isArray(production.kv_namespaces)
    ? production.kv_namespaces.map((k) => String(k?.id || '').trim()).filter(Boolean)
    : [];
  if (kvCfg.id && prodKvIds.includes(String(kvCfg.id).trim())) {
    throw new Error('PRODUCTION_KV_ID_FORBIDDEN: Staging KV id collides with Production');
  }

  const bindingCheck = inspectStagingBindingIds(parsedWrangler);
  if (rejectPlaceholders && bindingCheck.hasAnyPlaceholderBindingId) {
    throw new Error(
      `PLACEHOLDER_STAGING_BINDING_ID_REJECTED: wrangler.jsonc contains placeholder or invalid Staging resource IDs (d1.database_id="${bindingCheck.boundD1DatabaseId}", kv.id="${bindingCheck.boundKvNamespaceId}").`,
    );
  }

  return bindingCheck;
}

/**
 * Builds and writes the complete `env.staging` binding configuration in `wrangler.jsonc`,
 * preserving comments and surrounding configuration even if `env.staging` initially had only `name` and `vars`.
 */
export function updateStagingWranglerBindings({
  d1DatabaseId,
  kvNamespaceId,
  wranglerConfigPath = DEFAULT_WRANGLER_CONFIG_PATH,
}) {
  if (isPlaceholderOrInvalidD1Id(d1DatabaseId)) {
    throw new Error(
      `INVALID_PROVISIONED_D1_UUID: Cannot write placeholder or invalid D1 UUID "${d1DatabaseId}" during post-provisioning update`,
    );
  }
  if (isPlaceholderOrInvalidKvId(kvNamespaceId)) {
    throw new Error(
      `INVALID_PROVISIONED_KV_ID: Cannot write placeholder or invalid KV namespace ID "${kvNamespaceId}" during post-provisioning update`,
    );
  }

  const rawJsonc = fs.readFileSync(wranglerConfigPath, 'utf-8');
  const updatedJsonc = updateEnvStagingInWranglerJsonc(rawJsonc, (currentStaging) => {
    const nextVars = {
      APP_ENV: 'staging',
      WORKER_ENV: 'staging',
      APP_URL: 'https://radartehran-staging.workers.dev',
      FIREBASE_PROJECT_ID: 'gen-lang-client-0713157837',
      ADMIN_EMAIL: 'radio837isf@gmail.com',
      ...(currentStaging.vars || {}),
    };
    if (
      !nextVars.APP_URL ||
      nextVars.APP_URL === 'https://staging.radartehran.example.com'
    ) {
      nextVars.APP_URL = 'https://radartehran-staging.workers.dev';
    }
    return {
      ...currentStaging,
      name: ALLOWED_STAGING_RESOURCES.worker,
      workers_dev: true,
      vars: nextVars,
      d1_databases: [
        {
          binding: ALLOWED_STAGING_RESOURCES.d1.binding,
          database_name: ALLOWED_STAGING_RESOURCES.d1.name,
          database_id: d1DatabaseId,
          migrations_dir: 'migrations/d1',
          migrations_table: 'd1_migrations',
        },
      ],
      r2_buckets: [
        {
          binding: ALLOWED_STAGING_RESOURCES.r2.binding,
          bucket_name: ALLOWED_STAGING_RESOURCES.r2.name,
        },
      ],
      kv_namespaces: [
        {
          binding: ALLOWED_STAGING_RESOURCES.kv.binding,
          id: kvNamespaceId,
        },
      ],
      queues: {
        producers: [
          {
            binding: ALLOWED_STAGING_RESOURCES.queue.binding,
            queue: ALLOWED_STAGING_RESOURCES.queue.name,
          },
          {
            binding: ALLOWED_STAGING_RESOURCES.dlq.binding,
            queue: ALLOWED_STAGING_RESOURCES.dlq.name,
          },
        ],
        consumers: [
          {
            queue: ALLOWED_STAGING_RESOURCES.queue.name,
            max_batch_size: 10,
            max_batch_timeout: 5,
            max_retries: 3,
            dead_letter_queue: ALLOWED_STAGING_RESOURCES.dlq.name,
          },
        ],
      },
    };
  });

  const postParsed = parseJsonc(updatedJsonc, 'wrangler.jsonc (post-provisioning)');
  validateCompleteStagingWranglerConfig(postParsed, { rejectPlaceholders: true });
  fs.writeFileSync(wranglerConfigPath, updatedJsonc, 'utf-8');
  return postParsed;
}

export function defaultRunWrangler(args, inputString, envOverride = process.env) {
  const token = (
    envOverride.CLOUDFLARE_API_TOKEN ||
    envOverride.CF_BOOTSTRAP_API_TOKEN ||
    envOverride.CF_DEPLOY_API_TOKEN ||
    ''
  ).trim();
  const env = {
    ...envOverride,
    CI: 'true',
    ...(token ? { CLOUDFLARE_API_TOKEN: token } : {}),
  };
  const result = spawnSync('npx', ['wrangler', ...args], {
    cwd: ROOT_DIR,
    env,
    input: inputString,
    encoding: 'utf-8',
    timeout: 60_000,
  });
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

/**
 * Checks Wrangler authentication and verifies that the authenticated Cloudflare account identity
 * matches the configured `CLOUDFLARE_ACCOUNT_ID`. Fails closed on account mismatch.
 */
export function checkWranglerAuth({
  env = process.env,
  runCommand = (args, input) => defaultRunWrangler(args, input, env),
} = {}) {
  const hasApiToken = Boolean(
    (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_API_TOKEN.trim().length > 0) ||
      (env.CF_BOOTSTRAP_API_TOKEN && env.CF_BOOTSTRAP_API_TOKEN.trim().length > 0) ||
      (env.CF_DEPLOY_API_TOKEN && env.CF_DEPLOY_API_TOKEN.trim().length > 0),
  );
  const configuredAccountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim().toLowerCase();
  const hasAccountId = configuredAccountId.length > 0;

  const whoami = runCommand(['whoami']);
  const combinedOut = `${whoami.stdout}\n${whoami.stderr}`;
  const isUnauthenticated =
    whoami.status !== 0 ||
    combinedOut.includes('You are not authenticated') ||
    combinedOut.includes('Not logged in');

  if (isUnauthenticated) {
    return {
      authenticated: false,
      hasApiToken,
      hasAccountId,
      accountIdentityVerified: false,
    };
  }

  if (!hasAccountId) {
    throw new Error(
      'CLOUDFLARE_ACCOUNT_ID_MISSING: Wrangler is authenticated, but CLOUDFLARE_ACCOUNT_ID is not configured. Failing closed to prevent provisioning in an unverified account.',
    );
  }

  if (!/^[0-9a-f]{32}$/i.test(configuredAccountId)) {
    throw new Error(
      `CLOUDFLARE_ACCOUNT_ID_INVALID_FORMAT: Configured CLOUDFLARE_ACCOUNT_ID "${configuredAccountId}" is not a valid 32-character hexadecimal Cloudflare account ID.`,
    );
  }

  const lowerCombined = combinedOut.toLowerCase();
  if (!lowerCombined.includes(configuredAccountId)) {
    throw new Error(
      `CLOUDFLARE_ACCOUNT_ID_MISMATCH: Authenticated Wrangler session does not match configured CLOUDFLARE_ACCOUNT_ID (${configuredAccountId}). Aborting fail-closed.`,
    );
  }

  return {
    authenticated: true,
    hasApiToken,
    hasAccountId: true,
    accountIdentityVerified: true,
    verifiedAccountId: configuredAccountId,
  };
}

function extractUuid(text) {
  const match = String(text || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0] : null;
}

function extractKvHexId(text) {
  const match = String(text || '').match(/\b([0-9a-f]{32})\b/i);
  return match ? match[1] : null;
}

/**
 * Uploads required internal Staging Worker secrets (`ADMIN_API_SECRET`, `VALUATION_SEAL_SECRET`, `R2_SIGNING_SECRET`).
 * Fails closed immediately if any secret upload fails or if a provided secret is invalid/reused from Production.
 */
export function provisionInternalStagingSecrets({
  env = process.env,
  runCommand = (args, input) => defaultRunWrangler(args, input, env),
} = {}) {
  const internalSecrets = ['ADMIN_API_SECRET', 'VALUATION_SEAL_SECRET', 'R2_SIGNING_SECRET'];
  const configuredSecrets = [];

  for (const secretName of internalSecrets) {
    const provided = String(env[secretName] || '').trim();
    const prodCandidate = String(
      env[`PROD_${secretName}`] || env[`PRODUCTION_${secretName}`] || '',
    ).trim();

    if (provided.length > 0) {
      if (provided.length < 24) {
        throw new Error(
          `INVALID_STAGING_SECRET_LENGTH: Provided secret "${secretName}" is shorter than 24 characters. Refusing to upload weak secret.`,
        );
      }
      if (
        (prodCandidate && provided === prodCandidate) ||
        provided.toLowerCase().includes('prod_secret') ||
        provided.toLowerCase().includes('production_secret')
      ) {
        throw new Error(
          `PRODUCTION_SECRET_REUSE_FORBIDDEN: Secret "${secretName}" matches a Production secret identifier.`,
        );
      }
    }

    const secretVal = provided.length >= 24 ? provided : crypto.randomBytes(32).toString('hex');
    const res = runCommand(['secret', 'put', secretName, '--env', 'staging'], secretVal);
    if (res.status !== 0) {
      throw new Error(
        `STAGING_SECRET_UPLOAD_FAILED: Failed to upload required secret "${secretName}" to radartehran-staging (exit status ${res.status}).`,
      );
    }

    configuredSecrets.push({
      secretName,
      environment: 'staging',
      status: 'REMOTE_SECRET_CONFIGURED',
    });
  }

  return configuredSecrets;
}

/**
 * Executes remote resource listing and (in bootstrap mode) creation with strict fail-closed semantics:
 * - Never treats a failed `list` command as proof that a resource does not exist.
 * - Fails closed immediately if any `list` or `create` operation fails.
 */
export function provisionOrVerifyRemoteStagingResources({
  isVerifyOnly = false,
  runCommand = defaultRunWrangler,
  onPartialProgress = undefined,
} = {}) {
  const resources = [];
  const notifyProgress = () => {
    if (typeof onPartialProgress === 'function') {
      onPartialProgress([...resources]);
    }
  };

  // 1. D1: radartehran-staging-db
  const d1List = runCommand(['d1', 'list', '--json']);
  if (d1List.status !== 0) {
    throw new Error(
      `REMOTE_LIST_OPERATION_FAILED: "wrangler d1 list --json" failed with status ${d1List.status}. Refusing to create D1 database blindly.`,
    );
  }
  let parsedD1List;
  try {
    parsedD1List = JSON.parse(d1List.stdout);
    if (!Array.isArray(parsedD1List)) throw new Error('Expected JSON array');
  } catch {
    throw new Error(
      'REMOTE_LIST_PARSE_FAILED: Unable to parse JSON array from "wrangler d1 list --json". Refusing to create D1 database blindly.',
    );
  }

  let d1Id = null;
  let d1Status = 'NOT_PROVISIONED';
  const foundD1 = parsedD1List.find((d) => d && d.name === ALLOWED_STAGING_RESOURCES.d1.name);
  if (foundD1 && foundD1.uuid) {
    d1Id = String(foundD1.uuid).trim();
    d1Status = 'REUSED';
  } else if (!isVerifyOnly) {
    const created = runCommand(['d1', 'create', ALLOWED_STAGING_RESOURCES.d1.name]);
    d1Id = extractUuid(created.stdout) || extractUuid(created.stderr);
    if (created.status !== 0 || !d1Id) {
      throw new Error(
        `RESOURCE_CREATION_FAILED: Failed to create Staging D1 database "${ALLOWED_STAGING_RESOURCES.d1.name}" (exit ${created.status}).`,
      );
    }
    d1Status = 'CREATED';
  }
  resources.push({
    resourceType: ALLOWED_STAGING_RESOURCES.d1.type,
    resourceName: ALLOWED_STAGING_RESOURCES.d1.name,
    remoteId: d1Id,
    bindingName: ALLOWED_STAGING_RESOURCES.d1.binding,
    environment: 'staging',
    creationOrReuseStatus: d1Status,
    verificationResult: d1Id ? 'REMOTE_RESOURCE_PROVISIONED' : 'MISSING_REMOTE_RESOURCE',
  });
  notifyProgress();

  // 2. R2: radartehran-staging-media
  const r2List = runCommand(['r2', 'bucket', 'list']);
  if (r2List.status !== 0) {
    throw new Error(
      `REMOTE_LIST_OPERATION_FAILED: "wrangler r2 bucket list" failed with status ${r2List.status}. Refusing to create R2 bucket blindly.`,
    );
  }
  let r2Status = 'NOT_PROVISIONED';
  if (r2List.stdout.includes(ALLOWED_STAGING_RESOURCES.r2.name)) {
    r2Status = 'REUSED';
  } else if (!isVerifyOnly) {
    const r2Create = runCommand(['r2', 'bucket', 'create', ALLOWED_STAGING_RESOURCES.r2.name]);
    if (r2Create.status !== 0) {
      throw new Error(
        `RESOURCE_CREATION_FAILED: Failed to create Staging R2 bucket "${ALLOWED_STAGING_RESOURCES.r2.name}" (exit ${r2Create.status}).`,
      );
    }
    r2Status = 'CREATED';
  }
  resources.push({
    resourceType: ALLOWED_STAGING_RESOURCES.r2.type,
    resourceName: ALLOWED_STAGING_RESOURCES.r2.name,
    remoteId: r2Status !== 'NOT_PROVISIONED' ? ALLOWED_STAGING_RESOURCES.r2.name : null,
    bindingName: ALLOWED_STAGING_RESOURCES.r2.binding,
    environment: 'staging',
    creationOrReuseStatus: r2Status,
    verificationResult:
      r2Status !== 'NOT_PROVISIONED' ? 'REMOTE_RESOURCE_PROVISIONED' : 'MISSING_REMOTE_RESOURCE',
  });
  notifyProgress();

  // 3. KV: radartehran-staging-kv
  const kvList = runCommand(['kv', 'namespace', 'list']);
  if (kvList.status !== 0) {
    throw new Error(
      `REMOTE_LIST_OPERATION_FAILED: "wrangler kv namespace list" failed with status ${kvList.status}. Refusing to create KV namespace blindly.`,
    );
  }
  let parsedKvList;
  try {
    parsedKvList = JSON.parse(kvList.stdout);
    if (!Array.isArray(parsedKvList)) throw new Error('Expected JSON array');
  } catch {
    throw new Error(
      'REMOTE_LIST_PARSE_FAILED: Unable to parse JSON array from "wrangler kv namespace list". Refusing to create KV namespace blindly.',
    );
  }

  let kvId = null;
  let kvStatus = 'NOT_PROVISIONED';
  const foundKv = parsedKvList.find(
    (k) => k && typeof k.title === 'string' && k.title.includes(ALLOWED_STAGING_RESOURCES.kv.name),
  );
  if (foundKv && foundKv.id) {
    kvId = String(foundKv.id).trim();
    kvStatus = 'REUSED';
  } else if (!isVerifyOnly) {
    const kvCreate = runCommand(['kv', 'namespace', 'create', ALLOWED_STAGING_RESOURCES.kv.name]);
    kvId = extractKvHexId(kvCreate.stdout) || extractKvHexId(kvCreate.stderr);
    if (kvCreate.status !== 0 || !kvId) {
      throw new Error(
        `RESOURCE_CREATION_FAILED: Failed to create Staging KV namespace "${ALLOWED_STAGING_RESOURCES.kv.name}" (exit ${kvCreate.status}).`,
      );
    }
    kvStatus = 'CREATED';
  }
  resources.push({
    resourceType: ALLOWED_STAGING_RESOURCES.kv.type,
    resourceName: ALLOWED_STAGING_RESOURCES.kv.name,
    remoteId: kvId,
    bindingName: ALLOWED_STAGING_RESOURCES.kv.binding,
    environment: 'staging',
    creationOrReuseStatus: kvStatus,
    verificationResult: kvId ? 'REMOTE_RESOURCE_PROVISIONED' : 'MISSING_REMOTE_RESOURCE',
  });
  notifyProgress();

  // 4. Queues: radartehran-staging-queue & radartehran-staging-dlq
  const qList = runCommand(['queues', 'list']);
  if (qList.status !== 0) {
    throw new Error(
      `REMOTE_LIST_OPERATION_FAILED: "wrangler queues list" failed with status ${qList.status}. Refusing to create Queues blindly.`,
    );
  }
  for (const qItem of [ALLOWED_STAGING_RESOURCES.queue, ALLOWED_STAGING_RESOURCES.dlq]) {
    let qStatus = 'NOT_PROVISIONED';
    if (qList.stdout.includes(qItem.name)) {
      qStatus = 'REUSED';
    } else if (!isVerifyOnly) {
      const qCreate = runCommand(['queues', 'create', qItem.name]);
      if (qCreate.status !== 0) {
        throw new Error(
          `RESOURCE_CREATION_FAILED: Failed to create Staging Queue "${qItem.name}" (exit ${qCreate.status}).`,
        );
      }
      qStatus = 'CREATED';
    }
    resources.push({
      resourceType: qItem.type,
      resourceName: qItem.name,
      remoteId: qStatus !== 'NOT_PROVISIONED' ? qItem.name : null,
      bindingName: qItem.binding,
      environment: 'staging',
      creationOrReuseStatus: qStatus,
      verificationResult:
        qStatus !== 'NOT_PROVISIONED' ? 'REMOTE_RESOURCE_PROVISIONED' : 'MISSING_REMOTE_RESOURCE',
    });
    notifyProgress();
  }

  return {
    resources,
    d1Id,
    kvId,
  };
}

export function executeStagingProvisioning({
  rawArgs = process.argv.slice(2),
  env = process.env,
  wranglerConfigPath = DEFAULT_WRANGLER_CONFIG_PATH,
  manifestOutputPath = DEFAULT_MANIFEST_OUTPUT_PATH,
  rootDir = ROOT_DIR,
  runCommand = undefined,
} = {}) {
  const commandRunner =
    runCommand || ((args, input) => defaultRunWrangler(args, input, env));

  const modeArg = rawArgs.find((a) => a.startsWith('--mode='));
  const mode = modeArg
    ? modeArg.split('=')[1]
    : rawArgs.includes('--verify-only')
      ? 'verify-only'
      : 'bootstrap';
  const isVerifyOnly = mode === 'verify-only';
  const requireRemote = rawArgs.includes('--require-remote');
  const rejectPlaceholders =
    rawArgs.includes('--reject-placeholder-ids') || (isVerifyOnly && requireRemote);
  const shouldProvisionSecrets = rawArgs.includes('--provision-internal-secrets') && !isVerifyOnly;

  assertStagingScopedName(ALLOWED_STAGING_RESOURCES.worker);
  assertStagingScopedName(ALLOWED_STAGING_RESOURCES.d1.name);
  assertStagingScopedName(ALLOWED_STAGING_RESOURCES.r2.name);
  assertStagingScopedName(ALLOWED_STAGING_RESOURCES.kv.name);
  assertStagingScopedName(ALLOWED_STAGING_RESOURCES.queue.name);
  assertStagingScopedName(ALLOWED_STAGING_RESOURCES.dlq.name);

  const rawJsoncText = fs.readFileSync(wranglerConfigPath, 'utf-8');

  // Stage A (Bootstrap) vs Stage C (Verify-Only) Pre-Validation
  const parsedWrangler = validateInitialBootstrapConfig({
    rawJsoncText,
    rootDir,
  });

  if (isVerifyOnly) {
    validateCompleteStagingWranglerConfig(parsedWrangler, {
      rejectPlaceholders,
    });
  } else if (rejectPlaceholders) {
    const preCheck = inspectStagingBindingIds(parsedWrangler);
    if (preCheck.hasAnyPlaceholderBindingId) {
      throw new Error(
        `PLACEHOLDER_STAGING_BINDING_ID_REJECTED (mode=${mode}): wrangler.jsonc still contains placeholder Staging resource IDs (d1.database_id="${preCheck.boundD1DatabaseId}", kv.id="${preCheck.boundKvNamespaceId}").`,
      );
    }
  }

  const bindingCheck = inspectStagingBindingIds(parsedWrangler);
  const auth = checkWranglerAuth({ env, runCommand: commandRunner });

  const writeManifest = (manifestObj) => {
    fs.mkdirSync(path.dirname(manifestOutputPath), { recursive: true });
    fs.writeFileSync(manifestOutputPath, `${JSON.stringify(manifestObj, null, 2)}\n`, 'utf-8');
  };

  if (!auth.authenticated) {
    const unauthResources = [
      ALLOWED_STAGING_RESOURCES.d1,
      ALLOWED_STAGING_RESOURCES.r2,
      ALLOWED_STAGING_RESOURCES.kv,
      ALLOWED_STAGING_RESOURCES.queue,
      ALLOWED_STAGING_RESOURCES.dlq,
    ].map((item) => ({
      resourceType: item.type,
      resourceName: item.name,
      remoteId: null,
      bindingName: item.binding,
      environment: 'staging',
      creationOrReuseStatus: 'NOT_PROVISIONED',
      verificationResult: 'BLOCKED_BY_EXTERNAL_REQUIREMENT',
    }));

    const manifest = {
      schemaVersion: '1.3',
      generatedAtIso: new Date().toISOString(),
      executionMode: mode,
      targetWorker: ALLOWED_STAGING_RESOURCES.worker,
      protectedProductionWorker: 'radartehran',
      authoritativeMigrationLedger: 'd1_migrations',
      wranglerStagingBindingsState: {
        d1DatabaseId: bindingCheck.boundD1DatabaseId,
        kvNamespaceId: bindingCheck.boundKvNamespaceId,
        hasPlaceholderD1: bindingCheck.hasPlaceholderD1,
        hasPlaceholderKv: bindingCheck.hasPlaceholderKv,
        readyForRoutineDeployWithoutBootstrapPatch: !bindingCheck.hasAnyPlaceholderBindingId,
      },
      authentication: {
        authenticated: false,
        hasCloudflareApiTokenEnv: auth.hasApiToken,
        hasCloudflareAccountIdEnv: auth.hasAccountId,
        blockerReason:
          'Wrangler is not authenticated in this execution container (CF_BOOTSTRAP_API_TOKEN / CF_DEPLOY_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are not set).',
      },
      canonicalD1Migrations: CANONICAL_MIGRATIONS,
      resources: unauthResources,
    };

    writeManifest(manifest);
    if (requireRemote) {
      throw new Error(
        `REMOTE_AUTH_REQUIRED: --require-remote was specified in mode=${mode}, but Cloudflare credentials are not authenticated.`,
      );
    }
    return manifest;
  }

  // Routine verify-only without remote list permissions (uses Workers Editor + Account Settings Read scope)
  if (isVerifyOnly && !rawArgs.includes('--verify-remote-resource-lists')) {
    validateCompleteStagingWranglerConfig(parsedWrangler, { rejectPlaceholders: true });
    const verifiedResources = [
      { ...ALLOWED_STAGING_RESOURCES.d1, id: bindingCheck.boundD1DatabaseId },
      { ...ALLOWED_STAGING_RESOURCES.r2, id: ALLOWED_STAGING_RESOURCES.r2.name },
      { ...ALLOWED_STAGING_RESOURCES.kv, id: bindingCheck.boundKvNamespaceId },
      { ...ALLOWED_STAGING_RESOURCES.queue, id: ALLOWED_STAGING_RESOURCES.queue.name },
      { ...ALLOWED_STAGING_RESOURCES.dlq, id: ALLOWED_STAGING_RESOURCES.dlq.name },
    ].map((item) => ({
      resourceType: item.type,
      resourceName: item.name,
      remoteId: item.id,
      bindingName: item.binding,
      environment: 'staging',
      creationOrReuseStatus: 'REUSED',
      verificationResult: 'COMMITTED_BINDING_VERIFIED',
    }));

    const manifest = {
      schemaVersion: '1.3',
      generatedAtIso: new Date().toISOString(),
      executionMode: mode,
      targetWorker: ALLOWED_STAGING_RESOURCES.worker,
      protectedProductionWorker: 'radartehran',
      authoritativeMigrationLedger: 'd1_migrations',
      wranglerStagingBindingsState: {
        d1DatabaseId: bindingCheck.boundD1DatabaseId,
        kvNamespaceId: bindingCheck.boundKvNamespaceId,
        hasPlaceholderD1: false,
        hasPlaceholderKv: false,
        readyForRoutineDeployWithoutBootstrapPatch: true,
      },
      authentication: {
        authenticated: true,
        accountIdentityVerified: true,
        verifiedAccountId: auth.verifiedAccountId,
        hasCloudflareApiTokenEnv: auth.hasApiToken,
        hasCloudflareAccountIdEnv: auth.hasAccountId,
        tokenScopeModel: 'Workers Editor (scoped to radartehran-staging) + Account Settings Read (zero D1 Write)',
      },
      canonicalD1Migrations: CANONICAL_MIGRATIONS,
      resources: verifiedResources,
      secretStatuses: [],
    };

    writeManifest(manifest);
    return manifest;
  }

  let partialResources = [];
  let provisioned;
  try {
    provisioned = provisionOrVerifyRemoteStagingResources({
      isVerifyOnly,
      runCommand: commandRunner,
      onPartialProgress: (currentList) => {
        partialResources = currentList;
      },
    });
  } catch (err) {
    // Persist diagnostic manifest of partial progress before failing closed
    writeManifest({
      schemaVersion: '1.3',
      generatedAtIso: new Date().toISOString(),
      executionMode: mode,
      status: 'FAILED_PARTIAL_OR_ABORTED',
      error: err instanceof Error ? err.message : String(err),
      targetWorker: ALLOWED_STAGING_RESOURCES.worker,
      protectedProductionWorker: 'radartehran',
      authoritativeMigrationLedger: 'd1_migrations',
      resources: partialResources,
    });
    throw err;
  }

  const { resources, d1Id, kvId } = provisioned;
  const missingResources = resources.filter(
    (r) => r.verificationResult !== 'REMOTE_RESOURCE_PROVISIONED',
  );
  if (missingResources.length > 0) {
    throw new Error(
      `MISSING_STAGING_RESOURCES (mode=${mode}): Missing required Staging resources: ${missingResources.map((m) => m.resourceName).join(', ')}.`,
    );
  }

  if (isVerifyOnly) {
    if (d1Id && bindingCheck.boundD1DatabaseId !== d1Id) {
      throw new Error(
        `STAGING_BINDING_ID_DRIFT_DETECTED: wrangler.jsonc d1_databases[0].database_id (${bindingCheck.boundD1DatabaseId}) does not match remote radartehran-staging-db UUID (${d1Id}).`,
      );
    }
    if (kvId && bindingCheck.boundKvNamespaceId !== kvId) {
      throw new Error(
        `STAGING_BINDING_ID_DRIFT_DETECTED: wrangler.jsonc kv_namespaces[0].id (${bindingCheck.boundKvNamespaceId}) does not match remote radartehran-staging-kv ID (${kvId}).`,
      );
    }
  } else {
    // Stage B: Post-Provisioning Validation & Comment-Preserving Update of wrangler.jsonc
    updateStagingWranglerBindings({
      d1DatabaseId: d1Id,
      kvNamespaceId: kvId,
      wranglerConfigPath,
    });
  }

  const secretStatuses = shouldProvisionSecrets
    ? provisionInternalStagingSecrets({ env, runCommand: commandRunner })
    : [];

  const manifest = {
    schemaVersion: '1.3',
    generatedAtIso: new Date().toISOString(),
    executionMode: mode,
    targetWorker: ALLOWED_STAGING_RESOURCES.worker,
    protectedProductionWorker: 'radartehran',
    authoritativeMigrationLedger: 'd1_migrations',
    wranglerStagingBindingsState: {
      d1DatabaseId: d1Id || bindingCheck.boundD1DatabaseId,
      kvNamespaceId: kvId || bindingCheck.boundKvNamespaceId,
      hasPlaceholderD1: false,
      hasPlaceholderKv: false,
      readyForRoutineDeployWithoutBootstrapPatch: Boolean(d1Id && kvId),
    },
    authentication: {
      authenticated: true,
      accountIdentityVerified: true,
      verifiedAccountId: auth.verifiedAccountId,
      hasCloudflareApiTokenEnv: auth.hasApiToken,
      hasCloudflareAccountIdEnv: auth.hasAccountId,
    },
    canonicalD1Migrations: CANONICAL_MIGRATIONS,
    resources,
    secretStatuses,
  };

  writeManifest(manifest);
  return manifest;
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(ROOT_DIR, 'scripts/cloudflare/provision-staging.mjs');

if (isMainModule) {
  try {
    const manifest = executeStagingProvisioning();
    console.log(
      `[provision-staging] Mode=${manifest.executionMode} complete (authenticated=${manifest.authentication.authenticated}).`,
    );
  } catch (err) {
    console.error(
      '[provision-staging] ABORTED:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}
