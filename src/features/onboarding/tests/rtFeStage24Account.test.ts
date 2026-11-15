import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RT_FE_USER_ACCOUNT_024_SPEC_ID,
  RT_FE_STAGE25_BRIDGE_SPEC_ID,
  RT_ACCOUNT_LAYERS_8,
  RT_ACCOUNT_CONCEPTS_6,
  RT_ACCOUNT_LIFECYCLE_STATUSES_10,
  RT_PROFILE_VISIBILITY_5,
  RT_VERIFICATION_STATUSES_9,
  RT_ACCOUNT_API_ENDPOINTS_29,
  RT_ACCOUNT_DELIVERABLES_40,
  accountKeys,
  evaluateIdentityAndLifecyclePolicy,
  evaluateProfileSeparationAndAvatar,
  evaluateVerificationAndTrustBadges,
  evaluateSecuritySessionAndLifecycle,
  sanitizeAccountTelemetry,
} from '../services/rtFeAccount024Engine';

test('Stage 24 (RT-FE-USER-ACCOUNT-024): verifies 8 layers, 6 concepts, 10 statuses, 5 visibilities, 9 verification states, 29 APIs, 40 deliverables & Stage 25 bridge', () => {
  assert.equal(RT_FE_USER_ACCOUNT_024_SPEC_ID, 'RT-FE-USER-ACCOUNT-024');
  assert.equal(RT_FE_STAGE25_BRIDGE_SPEC_ID, 'RT-FE-USER-ACCESS-CONTROL-025');
  assert.equal(RT_ACCOUNT_LAYERS_8.length, 8);
  assert.equal(RT_ACCOUNT_CONCEPTS_6.length, 6);
  assert.equal(RT_ACCOUNT_LIFECYCLE_STATUSES_10.length, 10);
  assert.equal(RT_PROFILE_VISIBILITY_5.length, 5);
  assert.equal(RT_VERIFICATION_STATUSES_9.length, 9);
  assert.equal(RT_ACCOUNT_API_ENDPOINTS_29.length, 29);
  assert.equal(RT_ACCOUNT_DELIVERABLES_40.length, 40);
  assert.equal(RT_ACCOUNT_DELIVERABLES_40[0].id, 'RT-FE-ACCOUNT-OUT-001');
  assert.equal(RT_ACCOUNT_DELIVERABLES_40[39].id, 'RT-FE-ACCOUNT-OUT-040');
  assert.deepEqual(accountKeys.profile('u-101'), ['account', 'u-101', 'profile']);
});

test('Stage 24: separates identity/profile/role, enforces public vs private isolation, version conflict guard & avatar sanitization', () => {
  const idLeak = evaluateIdentityAndLifecyclePolicy({
    exposeAuthSubjectPublicly: true,
    professionGrantAutoPermission: true,
    accountStatus: 'restricted',
  });
  assert.equal(idLeak.valid, false);
  assert.equal(idLeak.issues.length, 2);
  assert.equal(idLeak.isAccountDeleted, false);
  assert.equal(idLeak.canAccessRestrictedFeatures, false);

  const profileUnsafe = evaluateProfileSeparationAndAvatar({
    publicPayloadIncludesPrivateFields: true,
    clientVersion: 2,
    serverVersion: 3,
    avatarFormat: 'svg',
    svgSanitized: false,
    completionImpliesVerification: true,
  });
  assert.equal(profileUnsafe.saveAllowed, false);
  assert.equal(profileUnsafe.hasVersionConflict, true);
  assert.equal(profileUnsafe.avatarAccepted, false);
  assert.equal(profileUnsafe.issues.length, 4);

  const profileOk = evaluateProfileSeparationAndAvatar({
    publicPayloadIncludesPrivateFields: false,
    clientVersion: 3,
    serverVersion: 3,
    avatarFormat: 'webp',
    completionImpliesVerification: false,
  });
  assert.equal(profileOk.saveAllowed, true);
  assert.equal(profileOk.avatarAccepted, true);
});

test('Stage 24: isolates contact vs professional verification, guards security/deletion/last-login & strips sensitive telemetry', () => {
  const badgeExpired = evaluateVerificationAndTrustBadges({
    phoneVerified: true,
    identityVerified: false,
    professionalStatus: 'expired',
    deleteProfessionalProfile: true,
  });
  assert.equal(badgeExpired.showIdentityBadge, false);
  assert.equal(badgeExpired.showProfessionalBadge, false);
  assert.equal(badgeExpired.baseAccountIntact, true);
  assert.equal(badgeExpired.issues.length, 1);

  const unsafeSecurity = evaluateSecuritySessionAndLifecycle({
    activeLoginMethodsCount: 1,
    requestRemoveLastLoginMethod: true,
    sessionRevokedInBackend: false,
    reauthVerifiedForSensitiveAction: false,
    actionType: 'account_deletion',
    exposeTokensOrRecoveryCodesInUi: true,
  });
  assert.equal(unsafeSecurity.actionAllowed, false);
  assert.equal(unsafeSecurity.issues.length, 3);

  const safeDeletion = evaluateSecuritySessionAndLifecycle({
    activeLoginMethodsCount: 2,
    sessionRevokedInBackend: true,
    reauthVerifiedForSensitiveAction: true,
    actionType: 'account_deletion',
  });
  assert.equal(safeDeletion.actionAllowed, true);

  const telemetry = sanitizeAccountTelemetry({
    eventName: 'profile_update_completed',
    payload: {
      locale: 'fa-IR',
      password: '123',
      recoveryCode: 'rec-99',
      fullPhone: '09120000000',
      identityDocument: 'scan.png',
    },
  });
  assert.deepEqual(telemetry.strippedKeys.sort(), ['fullPhone', 'identityDocument', 'password', 'recoveryCode']);
  assert.equal(telemetry.sanitizedPayload.locale, 'fa-IR');
});
