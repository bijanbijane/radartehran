/**
 * RT-INFRA-006 — persistence policy & production storage guards.
 */
import assert from 'node:assert/strict';
import {
  assertProductionObjectStorageConfigured,
  shouldLoadRuntimeConfigFromDisk,
  validateApiPersistenceOnBootstrap,
} from '../src/utils/serverPersistencePolicy';
import { resolveObjectStorageRuntimeConfig } from '../src/utils/objectStorageUpload';

function baseProdEnv(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    OBJECT_STORAGE_PROVIDER: 'r2',
    OBJECT_STORAGE_BUCKET: 'radar-media',
    OBJECT_STORAGE_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
    OBJECT_STORAGE_ACCESS_KEY: 'AKIATESTKEY12',
    OBJECT_STORAGE_SECRET_KEY: 'secretkey-minimum-eight',
    R2_ACCOUNT_ID: 'acct',
  };
}

async function runTests(): Promise<void> {
  assert.equal(shouldLoadRuntimeConfigFromDisk({ NODE_ENV: 'development' }), true);
  assert.equal(shouldLoadRuntimeConfigFromDisk({ NODE_ENV: 'production' }), false);
  assert.equal(shouldLoadRuntimeConfigFromDisk({ NODE_ENV: 'production', RADAR_ALLOW_RUNTIME_CONFIG_DISK: '1' }), true);

  const devCfg = resolveObjectStorageRuntimeConfig({ NODE_ENV: 'development', OBJECT_STORAGE_PROVIDER: 'local_bucket' });
  const devCheck = assertProductionObjectStorageConfigured(devCfg, { NODE_ENV: 'development' });
  assert.equal(devCheck.ok, true);

  const localProd = resolveObjectStorageRuntimeConfig({
    NODE_ENV: 'production',
    OBJECT_STORAGE_PROVIDER: 'local_bucket',
  });
  const localProdCheck = assertProductionObjectStorageConfigured(localProd, { NODE_ENV: 'production' });
  assert.equal(localProdCheck.ok, false);
  if (!localProdCheck.ok) assert.equal(localProdCheck.code, 'LOCAL_OBJECT_STORAGE_FORBIDDEN_IN_PRODUCTION');

  const missingCreds = resolveObjectStorageRuntimeConfig({
    ...baseProdEnv(),
    OBJECT_STORAGE_ACCESS_KEY: '',
    OBJECT_STORAGE_SECRET_KEY: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
  });
  const missingCheck = assertProductionObjectStorageConfigured(missingCreds, baseProdEnv());
  assert.equal(missingCheck.ok, false);
  if (!missingCheck.ok) assert.equal(missingCheck.code, 'OBJECT_STORAGE_NOT_CONFIGURED');

  const okCfg = resolveObjectStorageRuntimeConfig(baseProdEnv());
  const okCheck = assertProductionObjectStorageConfigured(okCfg, baseProdEnv());
  assert.equal(okCheck.ok, true);

  const bootstrapFail = await validateApiPersistenceOnBootstrap(localProd, baseProdEnv());
  assert.equal(bootstrapFail.ok, false);
  assert.ok(bootstrapFail.issues.some((i) => i.code === 'LOCAL_OBJECT_STORAGE_FORBIDDEN_IN_PRODUCTION'));

  const bootstrapOk = await validateApiPersistenceOnBootstrap(okCfg, baseProdEnv());
  assert.equal(bootstrapOk.ok, true);

  console.log('[PASS] server-persistence-policy.test.ts');
}

runTests().catch((error) => {
  console.error('[FAIL] server-persistence-policy.test.ts', error);
  process.exit(1);
});