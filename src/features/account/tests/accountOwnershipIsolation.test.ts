/** @file src/features/account/tests/accountOwnershipIsolation.test.ts — Stage 184 Multi-UID Storage Isolation & Allowlist Cleanup Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupAccountLocalStorageForUid,
  DEFAULT_GUEST_UID,
  DEVICE_PUBLIC_PRESERVED_KEYS,
  resolveScopedStorageKey,
  setActiveAccountScopeUid,
} from '../services/accountStorageScope';
import {
  createSavedSearchWatchlist,
  loadAccountProfile,
  loadAccountWorkspaceSnapshot,
  loadNotificationChannels,
  loadPrivacyPreferences,
  saveAccountProfile,
  updateNotificationChannels,
  updatePrivacyPreferences,
} from '../services/accountWorkspaceService';
import { submitServiceRequest } from '../../services/services/serviceWorkflowService';

function setupMemoryWindow() {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
    dispatchEvent: () => true,
  };
  return { store };
}

test('Stage 184: strict UID isolation separates User A, User B, and Guest workspaces', () => {
  setupMemoryWindow();
  setActiveAccountScopeUid(DEFAULT_GUEST_UID);

  saveAccountProfile({ displayName: 'کاربر آلفا', activeRoles: ['seeker'] }, 'uid-alpha');
  saveAccountProfile({ displayName: 'کاربر بتا', activeRoles: ['owner'] }, 'uid-beta');
  saveAccountProfile({ displayName: 'کاربر مهمان', activeRoles: ['advisor'] }, DEFAULT_GUEST_UID);

  updateNotificationChannels({ email: true, sms: true }, 'uid-alpha');
  updateNotificationChannels({ email: false, sms: false }, 'uid-beta');
  updatePrivacyPreferences({ sharePhoneOnlyAfterConsent: false }, 'uid-alpha');
  updatePrivacyPreferences({ sharePhoneOnlyAfterConsent: true }, 'uid-beta');

  createSavedSearchWatchlist({
    title: 'جست‌وجوی اختصاصی آلفا',
    querySummaryFa: 'سعادت‌آباد',
    module: 'neighborhoods',
    filtersSnapshot: { hoodId: 13 },
    alertCadence: 'daily_digest',
  }, 'uid-alpha');

  assert.equal(loadAccountProfile('uid-alpha').displayName, 'کاربر آلفا');
  assert.equal(loadAccountProfile('uid-beta').displayName, 'کاربر بتا');
  assert.equal(loadAccountProfile(DEFAULT_GUEST_UID).displayName, 'کاربر مهمان');

  assert.equal(loadNotificationChannels('uid-alpha').email, true);
  assert.equal(loadNotificationChannels('uid-beta').email, false);
  assert.equal(loadPrivacyPreferences('uid-alpha').sharePhoneOnlyAfterConsent, false);
  assert.equal(loadPrivacyPreferences('uid-beta').sharePhoneOnlyAfterConsent, true);

  const snapAlpha = loadAccountWorkspaceSnapshot({ callerUid: 'uid-alpha' });
  const snapBeta = loadAccountWorkspaceSnapshot({ callerUid: 'uid-beta' });
  const snapGuest = loadAccountWorkspaceSnapshot({ callerUid: DEFAULT_GUEST_UID });
  assert.equal(snapAlpha.savedSearches.length, 1);
  assert.equal(snapBeta.savedSearches.length, 0);
  assert.equal(snapGuest.savedSearches.length, 0);
});

test('Stage 184: cleanupAccountLocalStorageForUid removes target UID private data while preserving other UIDs and device_public keys', () => {
  const { store } = setupMemoryWindow();

  saveAccountProfile({ displayName: 'Alpha User' }, 'uid-alpha');
  saveAccountProfile({ displayName: 'Beta User' }, 'uid-beta');
  submitServiceRequest({
    ownerUserId: 'uid-alpha',
    providerId: 'sp-1',
    providerName: 'کارشناس ۱',
    canonicalCategory: 'legal',
    neighborhoodName: 'ونک',
    requesterName: 'آلفا',
    requesterPhone: '09120001111',
    projectSummary: 'بررسی مبایعه‌نامه',
    contactConsentAccepted: true,
  });
  submitServiceRequest({
    ownerUserId: 'uid-beta',
    providerId: 'sp-2',
    providerName: 'کارشناس ۲',
    canonicalCategory: 'valuation',
    neighborhoodName: 'جردن',
    requesterName: 'بتا',
    requesterPhone: '09120002222',
    projectSummary: 'کارشناسی قیمت',
    contactConsentAccepted: true,
  });

  for (const pubKey of DEVICE_PUBLIC_PRESERVED_KEYS) {
    store.set(pubKey, 'preserved-setting');
  }
  store.set('arbitrary_unrelated_key', 'untouched');

  const cleanup = cleanupAccountLocalStorageForUid('uid-alpha', [
    'radar_locale_v1',
    'tehran_radar_area_unit_v1',
    'arbitrary_unrelated_key',
    'radar_account_profile_v1',
  ]);

  assert.ok(cleanup.removedKeys.includes(resolveScopedStorageKey('radar_account_profile_v1', 'uid-alpha')));
  assert.equal(store.has(resolveScopedStorageKey('radar_account_profile_v1', 'uid-alpha')), false);
  assert.equal(store.has(resolveScopedStorageKey('radar_account_profile_v1', 'uid-beta')), true);
  assert.equal(loadAccountProfile('uid-beta').displayName, 'Beta User');

  assert.ok(cleanup.preservedPublicKeys.includes('radar_locale_v1'));
  assert.ok(cleanup.preservedPublicKeys.includes('tehran_radar_area_unit_v1'));
  for (const pubKey of DEVICE_PUBLIC_PRESERVED_KEYS) {
    assert.equal(store.get(pubKey), 'preserved-setting');
  }

  assert.ok(cleanup.rejectedKeys.includes('arbitrary_unrelated_key'));
  assert.equal(store.get('arbitrary_unrelated_key'), 'untouched');

  const remainingServiceReqs = JSON.parse(store.get('radar_service_requests_v1') || '[]') as Array<{ ownerUserId: string }>;
  assert.equal(remainingServiceReqs.length, 1);
  assert.equal(remainingServiceReqs[0].ownerUserId, 'uid-beta');
});
