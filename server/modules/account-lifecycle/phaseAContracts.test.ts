/**
 * Phase A contract tests — state machine, API inventory, privacy consent derivation.
 */

import assert from 'node:assert/strict';
import {
  assertValidAccountDeletionStateTransition,
  isTerminalAccountDeletionState,
  normalizeCanonicalJobState,
} from './stateMachine.ts';
import { AccountLifecycleError } from './types.ts';
import { OFFICIAL_ACCOUNT_LIFECYCLE_ROUTES, LEGACY_ACCOUNT_DELETION_ROUTE } from './officialApiContract.ts';
import { deriveOptionalAnalyticsAllowed, DEFAULT_PRIVACY_POLICY_VERSION } from './privacyConsentContract.ts';
import { ACCOUNT_LIFECYCLE_D1_TABLES } from '../../../worker/account-lifecycle/d1StoreBinding.ts';

function testStateMachine(): void {
  assert.equal(normalizeCanonicalJobState('INITIATED'), 'INITIATED_WRITE_BLOCKED');
  assert.equal(normalizeCanonicalJobState('CLEANING_MEDIA'), 'CLEANING_UP_MEDIA');
  assert.doesNotThrow(() =>
    assertValidAccountDeletionStateTransition('INITIATED_WRITE_BLOCKED', 'PURGING_DEPENDENT_RECORDS'),
  );
  assert.throws(
    () => assertValidAccountDeletionStateTransition('COMPLETED', 'PURGING_DEPENDENT_RECORDS'),
    (err: unknown) => err instanceof AccountLifecycleError,
  );
  assert.equal(isTerminalAccountDeletionState('COMPLETED'), true);
  assert.equal(isTerminalAccountDeletionState('PURGING_DEPENDENT_RECORDS'), false);
}

function testOfficialRoutes(): void {
  assert.ok(OFFICIAL_ACCOUNT_LIFECYCLE_ROUTES.length >= 8);
  const deletionPost = OFFICIAL_ACCOUNT_LIFECYCLE_ROUTES.find(
    (r) => r.method === 'POST' && r.path.endsWith('/deletion'),
  );
  assert.ok(deletionPost);
  assert.equal(deletionPost?.auth, 'VERIFIED_USER_FRESH');
  assert.equal(LEGACY_ACCOUNT_DELETION_ROUTE, '/api/account/delete');
}

function testConsentDerivation(): void {
  const now = new Date().toISOString();
  assert.equal(deriveOptionalAnalyticsAllowed(null, now), false);
  assert.equal(
    deriveOptionalAnalyticsAllowed(
      {
        consentId: 'c1',
        targetUid: 'u1',
        scope: 'PRODUCT_ANALYTICS_OPTIONAL',
        granted: true,
        policyVersion: DEFAULT_PRIVACY_POLICY_VERSION,
        recordedAtIso: now,
        revokedAtIso: now,
        sourceChannel: 'api',
        revision: 1,
      },
      now,
    ),
    false,
  );
  assert.equal(
    deriveOptionalAnalyticsAllowed(
      {
        consentId: 'c2',
        targetUid: 'u1',
        scope: 'PRODUCT_ANALYTICS_OPTIONAL',
        granted: true,
        policyVersion: DEFAULT_PRIVACY_POLICY_VERSION,
        recordedAtIso: now,
        revokedAtIso: null,
        sourceChannel: 'api',
        revision: 1,
      },
      now,
    ),
    true,
  );
}

function testD1Inventory(): void {
  assert.ok(ACCOUNT_LIFECYCLE_D1_TABLES.includes('account_deletion_jobs'));
  assert.ok(ACCOUNT_LIFECYCLE_D1_TABLES.includes('account_write_blocks'));
}

async function run(): Promise<void> {
  testStateMachine();
  testOfficialRoutes();
  testConsentDerivation();
  testD1Inventory();
  console.log('RT-ACCOUNT-LIFECYCLE-WORKERS-001 Phase A contract tests: PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});