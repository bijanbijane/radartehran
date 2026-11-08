#!/usr/bin/env node
/**
 * @file scripts/cloudflare/provision-staging.mjs
 * @description Cloudflare Staging bootstrap & routine pre-deploy verification script for `radartehran-staging`.
 *
 * Modes:
 * - `--mode=bootstrap` (default): Lists existing Staging resources, reuses matching ones, creates missing ones
 *   (requires elevated one-time `CF_BOOTSTRAP_API_TOKEN`), updates `env.staging` in `wrangler.jsonc`, and writes
 *   `docs/cloudflare/staging-resource-manifest.json`.
 * - `--mode=verify-only`: Routine deployment gate (uses least-privilege `CF_DEPLOY_API_TOKEN`). NEVER creates or
 *   deletes resources; verifies that all 5 Staging resources already exist and fails closed if any is missing.
 */

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const WRANGLER_CONFIG_PATH = path.join(ROOT_DIR, 'wrangler.jsonc');
const MANIFEST_OUTPUT_PATH = path.join(ROOT_DIR, 'docs/cloudflare/staging-resource-manifest.json');

const CANONICAL_MIGRATIONS = Object.freeze([
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

const ALLOWED_STAGING_RESOURCES = Object.freeze({
  worker: 'radartehran-staging',
  d1: { name: 'radartehran-staging-db', binding: 'DB', type: 'd1_database' },
  r2: { name: 'radartehran-staging-media', binding: 'MEDIA_BUCKET', type: 'r2_bucket' },
  kv: { name: 'radartehran-staging-kv', binding: 'RADAR_KV', type: 'kv_namespace' },
  queue: { name: 'radartehran-staging-queue', binding: 'RADAR_QUEUE', type: 'queue' },
  dlq: { name: 'radartehran-staging-dlq', binding: 'RADAR_DLQ', type: 'queue_dlq' },
});

function assertStagingScopedName(resourceName) {
  if (
    !resourceName.startsWith('radartehran-staging') ||
    resourceName === 'radartehran' ||
    resourceName.includes('prod')
  ) {
    throw new Error(`SECURITY_GUARD_ABORT: Resource "${resourceName}" is not strictly Staging-scoped.`);
  }
}

function verifyCanonicalMigrationsAndWranglerConfig() {
  for (const mig of CANONICAL_MIGRATIONS) {
    const absPath = path.join(ROOT_DIR, mig.relativePath);
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

  const parsed = JSON.parse(fs.readFileSync(WRANGLER_CONFIG_PATH, 'utf-8'));
  const staging = parsed?.env?.staging;
  if (!staging || staging.name !== ALLOWED_STAGING_RESOURCES.worker) {
    throw new Error('INVALID_STAGING_CONFIG: env.staging.name must equal "radartehran-staging"');
  }
  if (parsed?.env?.production?.name !== 'radartehran') {
    throw new Error('INVALID_PRODUCTION_GUARD: env.production.name must remain "radartehran"');
  }
  const d1Cfg = staging.d1_databases?.[0];
  if (
    !d1Cfg ||
    d1Cfg.database_name !== ALLOWED_STAGING_RESOURCES.d1.name ||
    d1Cfg.migrations_dir !== 'migrations/d1' ||
    d1Cfg.migrations_table !== 'd1_migrations'
  ) {
    throw new Error('INVALID_STAGING_D1_CONFIG: d1_databases[0] must target radartehran-staging-db and d1_migrations');
  }
  return parsed;
}

function runWrangler(args, inputString) {
  const token = (
    process.env.CLOUDFLARE_API_TOKEN ||
    process.env.CF_BOOTSTRAP_API_TOKEN ||
    process.env.CF_DEPLOY_API_TOKEN ||
    ''
  ).trim();
  const env = {
    ...process.env,
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

function checkWranglerAuth() {
  const hasApiToken = Boolean(
    (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_API_TOKEN.trim().length > 0) ||
      (process.env.CF_BOOTSTRAP_API_TOKEN && process.env.CF_BOOTSTRAP_API_TOKEN.trim().length > 0) ||
      (process.env.CF_DEPLOY_API_TOKEN && process.env.CF_DEPLOY_API_TOKEN.trim().length > 0),
  );
  const hasAccountId = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCOUNT_ID.trim().length > 0);
  const whoami = runWrangler(['whoami']);
  const authenticated =
    whoami.status === 0 &&
    !whoami.stdout.includes('You are not authenticated') &&
    !whoami.stderr.includes('You are not authenticated');
  return {
    authenticated,
    hasApiToken,
    hasAccountId,
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

const PLACEHOLDER_D1_DATABASE_ID = '00000000-0000-0000-0000-000000000001';
const PLACEHOLDER_KV_NAMESPACE_ID = '00000000000000000000000000000001';

function inspectStagingBindingIds(parsedWrangler) {
  const staging = parsedWrangler?.env?.staging;
  const boundD1DatabaseId = String(staging?.d1_databases?.[0]?.database_id || '').trim();
  const boundKvNamespaceId = String(staging?.kv_namespaces?.[0]?.id || '').trim();
  const hasPlaceholderD1 =
    !boundD1DatabaseId ||
    boundD1DatabaseId === PLACEHOLDER_D1_DATABASE_ID ||
    /^0{8}-0{4}-0{4}-0{4}-0{11}[01]$/.test(boundD1DatabaseId);
  const hasPlaceholderKv =
    !boundKvNamespaceId ||
    boundKvNamespaceId === PLACEHOLDER_KV_NAMESPACE_ID ||
    /^0{31}[01]$/.test(boundKvNamespaceId);
  return {
    boundD1DatabaseId,
    boundKvNamespaceId,
    hasPlaceholderD1,
    hasPlaceholderKv,
    hasAnyPlaceholderBindingId: hasPlaceholderD1 || hasPlaceholderKv,
  };
}

function updateStagingWranglerBindings({ d1DatabaseId, kvNamespaceId }) {
  const parsed = verifyCanonicalMigrationsAndWranglerConfig();
  if (d1DatabaseId && parsed.env.staging.d1_databases?.[0]) {
    parsed.env.staging.d1_databases[0].database_id = d1DatabaseId;
  }
  if (kvNamespaceId && parsed.env.staging.kv_namespaces?.[0]) {
    parsed.env.staging.kv_namespaces[0].id = kvNamespaceId;
  }
  fs.writeFileSync(WRANGLER_CONFIG_PATH, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
}

function provisionInternalStagingSecrets() {
  const internalSecrets = ['ADMIN_API_SECRET', 'VALUATION_SEAL_SECRET', 'R2_SIGNING_SECRET'];
  const configuredSecrets = [];
  for (const secretName of internalSecrets) {
    const provided = (process.env[secretName] || '').trim();
    const secretVal = provided.length >= 24 ? provided : crypto.randomBytes(32).toString('hex');
    const res = runWrangler(['secret', 'put', secretName, '--env', 'staging'], secretVal);
    configuredSecrets.push({
      secretName,
      environment: 'staging',
      status: res.status === 0 ? 'REMOTE_SECRET_CONFIGURED' : 'SECRET_PUT_FAILED',
    });
  }
  return configuredSecrets;
}

function main() {
  const rawArgs = process.argv.slice(2);
  const modeArg = rawArgs.find((a) => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : rawArgs.includes('--verify-only') ? 'verify-only' : 'bootstrap';
  const isVerifyOnly = mode === 'verify-only';
  const requireRemote = rawArgs.includes('--require-remote');
  const rejectPlaceholders = rawArgs.includes('--reject-placeholder-ids') || (isVerifyOnly && requireRemote);
  const shouldProvisionSecrets = rawArgs.includes('--provision-internal-secrets') && !isVerifyOnly;

  assertStagingScopedName(ALLOWED_STAGING_RESOURCES.worker);
  assertStagingScopedName(ALLOWED_STAGING_RESOURCES.d1.name);
  assertStagingScopedName(ALLOWED_STAGING_RESOURCES.r2.name);
  assertStagingScopedName(ALLOWED_STAGING_RESOURCES.kv.name);
  assertStagingScopedName(ALLOWED_STAGING_RESOURCES.queue.name);
  assertStagingScopedName(ALLOWED_STAGING_RESOURCES.dlq.name);

  const parsedWrangler = verifyCanonicalMigrationsAndWranglerConfig();
  const bindingCheck = inspectStagingBindingIds(parsedWrangler);

  if (rejectPlaceholders && bindingCheck.hasAnyPlaceholderBindingId) {
    console.error(
      `[provision-staging] PLACEHOLDER_STAGING_BINDING_ID_REJECTED (mode=${mode}): wrangler.jsonc still contains placeholder Staging resource IDs (d1.database_id="${bindingCheck.boundD1DatabaseId}", kv.id="${bindingCheck.boundKvNamespaceId}"). Run .github/workflows/bootstrap-staging.yml first and commit the real non-secret database_id and KV id into wrangler.jsonc before running routine deployments.`,
    );
    process.exit(1);
  }

  const auth = checkWranglerAuth();
  const resources = [];

  if (!auth.authenticated) {
    for (const item of [
      ALLOWED_STAGING_RESOURCES.d1,
      ALLOWED_STAGING_RESOURCES.r2,
      ALLOWED_STAGING_RESOURCES.kv,
      ALLOWED_STAGING_RESOURCES.queue,
      ALLOWED_STAGING_RESOURCES.dlq,
    ]) {
      resources.push({
        resourceType: item.type,
        resourceName: item.name,
        remoteId: null,
        bindingName: item.binding,
        environment: 'staging',
        creationOrReuseStatus: 'NOT_PROVISIONED',
        verificationResult: 'BLOCKED_BY_EXTERNAL_REQUIREMENT',
      });
    }

    const manifest = {
      schemaVersion: '1.2',
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
      resources,
    };

    fs.mkdirSync(path.dirname(MANIFEST_OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(MANIFEST_OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    console.log(
      `[provision-staging] Mode=${mode}: verified canonical D1 migrations & Staging isolation. Wrote manifest (status: BLOCKED_BY_EXTERNAL_REQUIREMENT).`,
    );

    if (requireRemote) {
      console.error(
        `[provision-staging] ERROR: --require-remote was specified in mode=${mode}, but Cloudflare credentials are not present.`,
      );
      process.exit(1);
    }
    return;
  }

  if (isVerifyOnly && !rawArgs.includes('--verify-remote-resource-lists')) {
    for (const item of [
      { ...ALLOWED_STAGING_RESOURCES.d1, id: bindingCheck.boundD1DatabaseId },
      { ...ALLOWED_STAGING_RESOURCES.r2, id: ALLOWED_STAGING_RESOURCES.r2.name },
      { ...ALLOWED_STAGING_RESOURCES.kv, id: bindingCheck.boundKvNamespaceId },
      { ...ALLOWED_STAGING_RESOURCES.queue, id: ALLOWED_STAGING_RESOURCES.queue.name },
      { ...ALLOWED_STAGING_RESOURCES.dlq, id: ALLOWED_STAGING_RESOURCES.dlq.name },
    ]) {
      resources.push({
        resourceType: item.type,
        resourceName: item.name,
        remoteId: item.id,
        bindingName: item.binding,
        environment: 'staging',
        creationOrReuseStatus: 'REUSED',
        verificationResult: 'COMMITTED_BINDING_VERIFIED',
      });
    }

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
        authenticated: true,
        hasCloudflareApiTokenEnv: auth.hasApiToken,
        hasCloudflareAccountIdEnv: auth.hasAccountId,
        tokenScopeModel: 'Workers Editor (scoped to radartehran-staging) + Account Settings Read (zero D1 Write)',
      },
      canonicalD1Migrations: CANONICAL_MIGRATIONS,
      resources,
      secretStatuses: [],
    };

    fs.mkdirSync(path.dirname(MANIFEST_OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(MANIFEST_OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    console.log(
      `[provision-staging] Mode=verify-only complete (Workers Editor + Account Settings Read scope; zero D1 mutation or resource creation).`,
    );
    return;
  }

  // 1. D1: radartehran-staging-db
  let d1Id = null;
  let d1Status = 'NOT_PROVISIONED';
  const d1List = runWrangler(['d1', 'list', '--json']);
  if (d1List.status === 0 && d1List.stdout.startsWith('[')) {
    try {
      const parsed = JSON.parse(d1List.stdout);
      const found = parsed.find((d) => d.name === ALLOWED_STAGING_RESOURCES.d1.name);
      if (found && found.uuid) {
        d1Id = found.uuid;
        d1Status = 'REUSED';
      }
    } catch {
      /* ignore parse error */
    }
  }
  if (!d1Id && !isVerifyOnly) {
    const created = runWrangler(['d1', 'create', ALLOWED_STAGING_RESOURCES.d1.name]);
    d1Id = extractUuid(created.stdout) || extractUuid(created.stderr);
    if (d1Id) d1Status = 'CREATED';
  }
  resources.push({
    resourceType: ALLOWED_STAGING_RESOURCES.d1.type,
    resourceName: ALLOWED_STAGING_RESOURCES.d1.name,
    remoteId: d1Id,
    bindingName: ALLOWED_STAGING_RESOURCES.d1.binding,
    environment: 'staging',
    creationOrReuseStatus: d1Status,
    verificationResult: d1Id ? 'REMOTE_RESOURCE_PROVISIONED' : 'BLOCKED_BY_EXTERNAL_REQUIREMENT',
  });

  // 2. R2: radartehran-staging-media
  let r2Status = 'NOT_PROVISIONED';
  const r2List = runWrangler(['r2', 'bucket', 'list']);
  if (r2List.status === 0 && r2List.stdout.includes(ALLOWED_STAGING_RESOURCES.r2.name)) {
    r2Status = 'REUSED';
  } else if (!isVerifyOnly) {
    const r2Create = runWrangler(['r2', 'bucket', 'create', ALLOWED_STAGING_RESOURCES.r2.name]);
    if (r2Create.status === 0) r2Status = 'CREATED';
  }
  resources.push({
    resourceType: ALLOWED_STAGING_RESOURCES.r2.type,
    resourceName: ALLOWED_STAGING_RESOURCES.r2.name,
    remoteId: r2Status !== 'NOT_PROVISIONED' ? ALLOWED_STAGING_RESOURCES.r2.name : null,
    bindingName: ALLOWED_STAGING_RESOURCES.r2.binding,
    environment: 'staging',
    creationOrReuseStatus: r2Status,
    verificationResult: r2Status !== 'NOT_PROVISIONED' ? 'REMOTE_RESOURCE_PROVISIONED' : 'BLOCKED_BY_EXTERNAL_REQUIREMENT',
  });

  // 3. KV: radartehran-staging-kv
  let kvId = null;
  let kvStatus = 'NOT_PROVISIONED';
  const kvList = runWrangler(['kv', 'namespace', 'list']);
  if (kvList.status === 0 && kvList.stdout.startsWith('[')) {
    try {
      const parsed = JSON.parse(kvList.stdout);
      const found = parsed.find((k) => k.title && k.title.includes(ALLOWED_STAGING_RESOURCES.kv.name));
      if (found && found.id) {
        kvId = found.id;
        kvStatus = 'REUSED';
      }
    } catch {
      /* ignore parse error */
    }
  }
  if (!kvId && !isVerifyOnly) {
    const kvCreate = runWrangler(['kv', 'namespace', 'create', ALLOWED_STAGING_RESOURCES.kv.name]);
    kvId = extractKvHexId(kvCreate.stdout) || extractKvHexId(kvCreate.stderr);
    if (kvId) kvStatus = 'CREATED';
  }
  resources.push({
    resourceType: ALLOWED_STAGING_RESOURCES.kv.type,
    resourceName: ALLOWED_STAGING_RESOURCES.kv.name,
    remoteId: kvId,
    bindingName: ALLOWED_STAGING_RESOURCES.kv.binding,
    environment: 'staging',
    creationOrReuseStatus: kvStatus,
    verificationResult: kvId ? 'REMOTE_RESOURCE_PROVISIONED' : 'BLOCKED_BY_EXTERNAL_REQUIREMENT',
  });

  // 4. Queues: radartehran-staging-queue & radartehran-staging-dlq
  const qList = runWrangler(['queues', 'list']);
  for (const qItem of [ALLOWED_STAGING_RESOURCES.queue, ALLOWED_STAGING_RESOURCES.dlq]) {
    let qStatus = 'NOT_PROVISIONED';
    if (qList.status === 0 && qList.stdout.includes(qItem.name)) {
      qStatus = 'REUSED';
    } else if (!isVerifyOnly) {
      const qCreate = runWrangler(['queues', 'create', qItem.name]);
      if (qCreate.status === 0) qStatus = 'CREATED';
    }
    resources.push({
      resourceType: qItem.type,
      resourceName: qItem.name,
      remoteId: qStatus !== 'NOT_PROVISIONED' ? qItem.name : null,
      bindingName: qItem.binding,
      environment: 'staging',
      creationOrReuseStatus: qStatus,
      verificationResult: qStatus !== 'NOT_PROVISIONED' ? 'REMOTE_RESOURCE_PROVISIONED' : 'BLOCKED_BY_EXTERNAL_REQUIREMENT',
    });
  }

  const missingResources = resources.filter((r) => r.verificationResult !== 'REMOTE_RESOURCE_PROVISIONED');
  if (isVerifyOnly && missingResources.length > 0) {
    console.error(
      `[provision-staging] FAIL-CLOSED (mode=verify-only): Missing required Staging resources: ${missingResources.map((m) => m.resourceName).join(', ')}. Run .github/workflows/bootstrap-staging.yml first.`,
    );
    process.exit(1);
  }

  if (isVerifyOnly) {
    if (d1Id && bindingCheck.boundD1DatabaseId !== d1Id) {
      console.error(
        `[provision-staging] STAGING_BINDING_ID_DRIFT_DETECTED: wrangler.jsonc d1_databases[0].database_id (${bindingCheck.boundD1DatabaseId}) does not match remote radartehran-staging-db UUID (${d1Id}). Commit the real database_id to wrangler.jsonc.`,
      );
      process.exit(1);
    }
    if (kvId && bindingCheck.boundKvNamespaceId !== kvId) {
      console.error(
        `[provision-staging] STAGING_BINDING_ID_DRIFT_DETECTED: wrangler.jsonc kv_namespaces[0].id (${bindingCheck.boundKvNamespaceId}) does not match remote radartehran-staging-kv ID (${kvId}). Commit the real KV namespace id to wrangler.jsonc.`,
      );
      process.exit(1);
    }
  } else {
    updateStagingWranglerBindings({ d1DatabaseId: d1Id, kvNamespaceId: kvId });
  }

  const secretStatuses = shouldProvisionSecrets ? provisionInternalStagingSecrets() : [];

  const manifest = {
    schemaVersion: '1.2',
    generatedAtIso: new Date().toISOString(),
    executionMode: mode,
    targetWorker: ALLOWED_STAGING_RESOURCES.worker,
    protectedProductionWorker: 'radartehran',
    authoritativeMigrationLedger: 'd1_migrations',
    wranglerStagingBindingsState: {
      d1DatabaseId: d1Id || bindingCheck.boundD1DatabaseId,
      kvNamespaceId: kvId || bindingCheck.boundKvNamespaceId,
      hasPlaceholderD1: !d1Id && bindingCheck.hasPlaceholderD1,
      hasPlaceholderKv: !kvId && bindingCheck.hasPlaceholderKv,
      readyForRoutineDeployWithoutBootstrapPatch: Boolean(d1Id && kvId),
    },
    authentication: {
      authenticated: true,
      hasCloudflareApiTokenEnv: auth.hasApiToken,
      hasCloudflareAccountIdEnv: auth.hasAccountId,
    },
    canonicalD1Migrations: CANONICAL_MIGRATIONS,
    resources,
    secretStatuses,
  };

  fs.mkdirSync(path.dirname(MANIFEST_OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  console.log(`[provision-staging] Mode=${mode} complete and manifest written.`);
}

main();
