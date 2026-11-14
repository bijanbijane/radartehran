/** @file src/features/account/tests/accountWorkspace.test.ts — Stage 22 Account & Personal Workspace Unit Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAccountResourceOwner,
  buildLocalWorkspaceExportBundle,
  createSavedSearchWatchlist,
  deleteSavedSearchWatchlist,
  loadAccountProfile,
  loadAccountWorkspaceSnapshot,
  loadAuthorizedSessions,
  loadDataRequests,
  loadNotificationChannels,
  loadPrivacyPreferences,
  markAccountNotificationRead,
  recordDataRequest,
  revokeAuthorizedSession,
  saveAccountProfile,
  toggleSavedSearchAlertCadence,
  trackAccountEvent,
  updateNotificationChannels,
  updatePrivacyPreferences,
} from '../services/accountWorkspaceService';
import { submitServiceProposal, submitServiceRequest } from '../../services/services/serviceWorkflowService';
import { persistSavedValuationReports } from '../../valuation/services/valuationWorkspaceService';
import { createDefaultValuationInput } from '../../valuation/services/valuationWorkspaceService';

function setupMemoryWindow() {
  const store = new Map<string, string>();
  const dispatched: Array<{ type: string; detail: Record<string, unknown> }> = [];
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
    dispatchEvent: (ev: { type: string; detail: Record<string, unknown> }) => {
      dispatched.push(ev);
      return true;
    },
  };
  (globalThis as Record<string, unknown>).CustomEvent = class {
    type: string;
    detail: unknown;
    constructor(type: string, init: { detail: unknown }) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  return { store, dispatched };
}

test('Stage 22 enforces ownership checks and aggregates valuations, searches, services, actionRequired, and notifications cleanly', () => {
  setupMemoryWindow();

  assert.equal(assertAccountResourceOwner('uid-1', 'uid-1'), true);
  assert.equal(assertAccountResourceOwner('uid-1', 'uid-2'), false);
  assert.equal(assertAccountResourceOwner('', 'uid-1'), false);

  persistSavedValuationReports([
    {
      id: 'val-test-1',
      savedAtIso: new Date().toISOString(),
      hoodName: 'پونک',
      modelVersion: 'Hedonic Rule Heuristic v1405.1',
      dataSnapshotId: 'snapshot-tehran-curated-1405',
      input: createDefaultValuationInput(1),
      hedonicTotalMillion: 12500,
      hedonicPerSqm: 147,
      fastSaleTotalMillion: 11000,
      sensitivityMinMillion: 11800,
      sensitivityMaxMillion: 13200,
    },
  ]);

  const req = submitServiceRequest({
    ownerUserId: 'uid-1',
    providerId: 'sp-1',
    providerName: 'دفتر پونک',
    canonicalCategory: 'legal',
    neighborhoodName: 'پونک',
    requesterName: 'مینا',
    requesterPhone: '09120001122',
    projectSummary: 'بررسی حقوقی مبایعه‌نامه واحد ۸۵ متری',
    contactConsentAccepted: true,
  });
  submitServiceProposal({
    requestId: req.id,
    providerId: 'sp-1',
    providerName: 'دفتر پونک',
    providerVerificationSummaryFa: 'خوداظهار',
    offeringTitleFa: 'بازبینی قرارداد',
    priceMode: 'fixed',
    priceDisplayFa: '۳ میلیون تومان',
    estimatedAmountMillion: 3,
    timelineFa: '۲۴ ساعت',
    scopeSummaryFa: 'بررسی کامل بندهای قرارداد',
    includesFa: 'گزارش اصلاحات',
    excludesFa: 'ثبت دفترخانه',
    status: 'submitted',
  });

  const searches = createSavedSearchWatchlist({
    title: 'آپارتمان ۲ خوابه پونک',
    querySummaryFa: 'زیر ۱۴ میلیارد · بالای ۸۰ متر',
    module: 'properties',
    filtersSnapshot: { hoodId: 1 },
    alertCadence: 'daily_digest',
  });
  assert.equal(searches.length, 1);
  const updatedCadence = toggleSavedSearchAlertCadence(searches[0].id, 'instant_important');
  assert.equal(updatedCadence[0].alertCadence, 'instant_important');

  const snap = loadAccountWorkspaceSnapshot({ callerUid: 'uid-1', displayName: 'مینا راد' });
  assert.equal(snap.savedValuations.length, 1);
  assert.equal(snap.serviceRequests.length, 1);
  assert.equal(snap.serviceProposals.length, 1);
  assert.equal(snap.savedSearches.length, 1);
  assert.ok(snap.actionRequired.some((a) => a.kind === 'pending_proposal' && a.urgency === 'high'));
  assert.ok(snap.notifications.some((n) => n.category === 'service_proposal' && !n.read));
  assert.ok(snap.activityTimeline.some((a) => a.kind === 'valuation'));

  const propNotif = snap.notifications.find((n) => n.category === 'service_proposal')!;
  markAccountNotificationRead(propNotif.id);
  const afterRead = loadAccountWorkspaceSnapshot({ callerUid: 'uid-1' });
  assert.equal(afterRead.notifications.find((n) => n.id === propNotif.id)?.read, true);

  assert.equal(deleteSavedSearchWatchlist(searches[0].id).length, 0);
});

test('Stage 22 manages roles, workspace mode, channel separation, retention-aware data requests, and scrubs PII from telemetry', () => {
  const { dispatched } = setupMemoryWindow();

  const savedProf = saveAccountProfile(
    { displayName: 'امیرحسین', activeRoles: ['seeker', 'owner'], activeWorkspaceMode: 'listings_owner' },
    'uid-2',
  );
  assert.equal(savedProf.displayName, 'امیرحسین');
  assert.equal(loadAccountProfile('uid-2').activeWorkspaceMode, 'listings_owner');

  const channels = updateNotificationChannels({ email: true, sms: false, marketingOptIn: false });
  assert.equal(channels.email, true);
  assert.equal(channels.marketingOptIn, false);
  assert.equal(loadNotificationChannels().securityAlertsMandatory, true);

  const priv = updatePrivacyPreferences({ sharePhoneOnlyAfterConsent: true, storeSearchHistoryLocally: false });
  assert.equal(loadPrivacyPreferences().storeSearchHistoryLocally, false);
  assert.equal(priv.sharePhoneOnlyAfterConsent, true);

  recordDataRequest('delete', 'pending_verification');
  const dataReqs = loadDataRequests();
  assert.equal(dataReqs.length, 1);
  assert.ok(dataReqs[0].retentionNotesFa.includes('نگهداری'));

  const sessions = loadAuthorizedSessions();
  assert.equal(sessions.length, 1);
  assert.equal(revokeAuthorizedSession(sessions[0].sessionId).length, 1);

  const bundle = buildLocalWorkspaceExportBundle();
  assert.equal(bundle.scope, 'local_workspace_snapshot');

  trackAccountEvent('account_test_event', {
    phone: '09120001111',
    email: 'leak@example.com',
    purpose: 'buy',
  });
  const lastEv = dispatched[dispatched.length - 1]?.detail;
  assert.equal('phone' in lastEv, false);
  assert.equal('email' in lastEv, false);
  assert.equal(lastEv.purpose, 'buy');
});
