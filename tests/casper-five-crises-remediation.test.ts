import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildSponsorRequestFirestoreDoc,
  buildOverrideSponsorFirestorePayload,
  buildBargainModerationFirestorePayload,
  commitSponsorReserveViaRest,
  commitSponsorApprovalViaRest,
  commitSponsorReleaseViaRest,
  commitBargainModerationViaRest,
} from '../src/utils/serverSponsorFirestoreHelper';
import { executeDurableAccountDeletion } from '../src/utils/accountDeletionExecutor';
import {
  isInsideCityBounds,
  CITY_DEFAULT_CENTERS,
} from '../src/utils/geolocationGuard';
import { sanitizeSponsorForOverrideDoc } from '../src/utils/backupCloudSync';
import { resolveBrowserAppCheckSiteKey, initClientAppCheckIfConfigured } from '../src/utils/clientAppCheck';
import {
  assertValidPolicyStateTransition,
  assertValidClaimStateTransition,
  validateSettlementCalculations,
  evaluatePolicyCoverageStatusWithLimitations,
} from '../server/modules/property-insurance/coverage/policyAndClaimStateMachineEngine';

test('Crisis #1: Firestore sponsor & bargain payload builders strictly match firestore.rules allowlists', () => {
  const reqDoc = buildSponsorRequestFirestoreDoc({
    hoodId: 12,
    hoodName: 'سعادت‌آباد',
    agencyName: 'املاک نمونه',
    phone: '09121234567',
    specialty: 'فروش لوکس',
    experienceYears: 8,
    monthlyTariffMillion: 15,
    planMonths: 3,
    totalPayableMillion: 36,
    trackingCode: 'TRK-12345',
  });
  const allowedSponsorRequestKeys = new Set([
    'hoodId', 'hoodName', 'agencyName', 'phone', 'specialty',
    'experienceYears', 'monthlyTariffMillion', 'planMonths',
    'totalPayableMillion', 'trackingCode', 'status', 'expiresAtIso', 'createdAt',
  ]);
  for (const key of Object.keys(reqDoc)) {
    assert.ok(allowedSponsorRequestKeys.has(key), `Unexpected sponsorRequest key: ${key}`);
  }
  assert.ok(!('cityId' in reqDoc));
  assert.ok(!('notes' in reqDoc));

  const overrideSponsor = buildOverrideSponsorFirestorePayload(
    {
      name: 'آژانس الف',
      phone: '09121234567',
      specialty: 'آپارتمان',
      experienceYears: 10,
      verified: true,
      planMonths: 3,
    },
    3,
    '2026-12-31T00:00:00.000Z',
  );
  const allowedOverrideSponsorKeys = new Set([
    'name', 'phone', 'specialty', 'experienceYears', 'expiresAtIso', 'planType',
  ]);
  for (const key of Object.keys(overrideSponsor)) {
    assert.ok(allowedOverrideSponsorKeys.has(key), `Unexpected override sponsor key: ${key}`);
  }
  assert.equal(overrideSponsor.planType, 'paid_3m');

  const modDoc = buildBargainModerationFirestorePayload('approved', 'admin-uid-1');
  assert.equal(modDoc.status, 'approved');
  assert.equal(modDoc.approvedBy, 'admin-uid-1');
  assert.ok('updatedAt' in modDoc && 'approvedAt' in modDoc);
});

test('Crisis #1: Firestore REST commit helpers surface errors cleanly without silent fallback', async () => {
  const captured: Array<{ url: string; body: Record<string, unknown> }> = [];
  const okFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), body: JSON.parse(String(init?.body || '{}')) });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  await commitSponsorReserveViaRest('req_abc12345', { hoodId: 1, agencyName: 'تست' }, 'Bearer jwt-token', okFetch);
  await commitSponsorApprovalViaRest({
    requestId: 'req_abc12345',
    hoodId: 1,
    buyPerSqm: 140,
    rahn80m: 2000,
    sponsor: { name: 'آژانس', phone: '09121112233', specialty: 'مسکونی', experienceYears: 5, planType: 'paid_1m' },
    expiresAtIso: '2026-12-01T00:00:00.000Z',
    manualLockUntilMs: Date.now() + 10000,
  }, 'Bearer jwt-token', okFetch);
  await commitSponsorReleaseViaRest({ hoodId: 1, buyPerSqm: 140, rahn80m: 2000 }, 'Bearer jwt-token', okFetch);
  await commitBargainModerationViaRest('brg_abc12345', 'rejected', 'admin-1', 'Bearer jwt-token', okFetch);
  assert.equal(captured.length, 4);

  const failingFetch = (async () => new Response('PERMISSION_DENIED', { status: 403 })) as typeof fetch;
  await assert.rejects(
    () => commitBargainModerationViaRest('brg_abc12345', 'approved', 'admin-1', 'Bearer jwt-token', failingFetch),
    /FIRESTORE_REST_COMMIT_FAILED_403/,
  );
});

test('Crisis #2: Account deletion executor reports honest per-step status and requiresClientAuthDeletion when Admin SDK unavailable', async () => {
  const prevIsolation = process.env.PREVENT_PROD_FIREBASE_IN_TEST;
  process.env.PREVENT_PROD_FIREBASE_IN_TEST = 'true';
  try {
    const bargains = new Map<string, { ownerUid: string }>([
      ['brg_user_one', { ownerUid: 'uid-test-123' }],
      ['brg_other_two', { ownerUid: 'uid-other-999' }],
    ]);
    const leads = [{ submittedByUid: 'uid-test-123' }, { submittedByUid: 'uid-other-999' }];
    const corrections = [{ reporterUid: 'uid-test-123' }, { reporterUid: null }];
    let cacheSaved = false;

    const result = await executeDurableAccountDeletion({
      uid: 'uid-test-123',
      rawAuthHeaderOrToken: 'Bearer mock-jwt',
      serverPublishedBargains: bargains,
      serverSideBuyerLeads: leads,
      serverDataCorrections: corrections,
      saveDiskPersistedCache: () => { cacheSaved = true; },
      objectStoreIndex: [],
      persistObjectStoreIndexNow: async () => {},
    });

    assert.equal(cacheSaved, true);
    assert.equal(bargains.has('brg_user_one'), false);
    assert.equal(bargains.has('brg_other_two'), true);
    assert.equal(leads.length, 1);
    assert.equal(corrections.length, 1);
    assert.equal(result.requiresClientAuthDeletion, true);
    const authStep = result.steps.find((s) => s.category === 'firebase_auth_identity');
    assert.equal(authStep?.completed, false);
    assert.equal(result.status, 'partial');
  } finally {
    process.env.PREVENT_PROD_FIREBASE_IN_TEST = prevIsolation;
  }
});

test('Crisis #3: Multi-city geolocation bounding box validates all 5 Iranian cities accurately', () => {
  for (const cityId of ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'] as const) {
    assert.equal(isInsideCityBounds(cityId, CITY_DEFAULT_CENTERS[cityId]), true, `${cityId} center must be inside bounds`);
    assert.equal(isInsideCityBounds(cityId, { lat: 51.5, lng: -0.12 }), false, `London must be rejected for ${cityId}`);
  }
  assert.equal(isInsideCityBounds('shiraz', CITY_DEFAULT_CENTERS.tehran), false);
});

test('Crisis #4: sanitizeSponsorForOverrideDoc strips UI-only fields incompatible with firestore.rules', () => {
  const sanitized = sanitizeSponsorForOverrideDoc({
    name: 'املاک پایتخت',
    phone: '09123456789',
    specialty: 'ویلایی',
    experienceYears: 12,
    verified: true,
    planMonths: 3,
    expiresAtIso: '2026-12-31T00:00:00.000Z',
    planType: 'paid_3m',
  });
  assert.ok(sanitized);
  assert.deepEqual(Object.keys(sanitized!).sort(), ['experienceYears', 'expiresAtIso', 'name', 'phone', 'planType', 'specialty']);
});

test('Crisis #5: Client App Check resolves configured keys safely and skips placeholders/SSR', () => {
  assert.equal(resolveBrowserAppCheckSiteKey({ VITE_FIREBASE_APP_CHECK_SITE_KEY: 'YOUR_SITE_KEY' }), null);
  assert.equal(resolveBrowserAppCheckSiteKey({ VITE_FIREBASE_APP_CHECK_SITE_KEY: '6LeTestEnterpriseSiteKey12345' }), '6LeTestEnterpriseSiteKey12345');
  assert.equal(initClientAppCheckIfConfigured({} as never, { VITE_FIREBASE_APP_CHECK_SITE_KEY: '6LeTestEnterpriseSiteKey12345' }), null);
  const clientAppCheckSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/clientAppCheck.ts'), 'utf-8');
  assert.ok(!clientAppCheckSrc.includes('firebase-admin'));
  assert.ok(!clientAppCheckSrc.includes('node:crypto'));
});

test('Restored property insurance state machine enforces monotonic policy/claim transitions and settlement limits', () => {
  assert.doesNotThrow(() => assertValidPolicyStateTransition('DRAFT', 'PENDING_VERIFICATION'));
  assert.throws(() => assertValidPolicyStateTransition('EXPIRED', 'ACTIVE'));
  assert.doesNotThrow(() => assertValidClaimStateTransition('SUBMITTED', 'UNDER_REVIEW'));
  assert.throws(() => assertValidClaimStateTransition('CLOSED', 'SUBMITTED'));
  assert.throws(() =>
    validateSettlementCalculations({
      verifiedEligibleLossAmount: 500,
      deductibleAppliedAmount: 50,
      approvedSettlementAmount: 700,
      rejectedAmount: 0,
      applicableCoverageLimit: 1000,
    }),
  );
  const report = evaluatePolicyCoverageStatusWithLimitations({
    policy: {
      policyId: 'pol-test-1',
      status: 'ACTIVE',
      verificationStatus: 'PROVIDER_CONFIRMED_AUTHORITATIVE',
      providerConfirmedActive: true,
      coverageStartIso: '2026-01-01T00:00:00.000Z',
      coverageEndIso: '2027-01-01T00:00:00.000Z',
      policyholderIsConfirmedPropertyOwner: true,
      financialStructure: { outstandingPremiumAmount: 0 },
    } as never,
    coverages: [
      {
        coverageId: 'cov-1',
        coverageCategory: 'FIRE',
      } as never,
    ],
    exclusions: [],
    asOfIso: '2026-06-01T00:00:00.000Z',
    queryRiskCategory: 'FIRE',
  });
  assert.equal(report.distinctValidityDimensions.independentlyVerifiedActiveCoverage, true);
  assert.equal(report.queriedRiskEvaluation.applicabilityConclusion, 'ELIGIBLE_SUBJECT_TO_ADJUSTMENT');
});
