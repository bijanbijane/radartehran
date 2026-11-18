/**
 * @file tests/rt-fe-bugs-001-to-008.test.ts
 * @description Comprehensive Regression Suite for Frontend Bug Audit (RT-FE-BUG-001 through RT-FE-BUG-008)
 * Covers all 84 required Unit, Integration, E2E, and Negative test scenarios.
 */
import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  COMMUNITY_PERMISSION_DENIED_FA,
  COMMUNITY_NETWORK_ERROR_FA,
  createCommunityAnswer,
  createCommunityDiscussion,
  editCommunityDiscussion,
  mapCommunityErrorFa,
  submitCommunityAbuseReport,
  toggleCommunityReaction,
  withdrawDataCorrection,
} from '../src/features/community/services/communityApiClient';
import {
  COMMUNITY_AUTH_REQUIRED_FA,
  loadCommunityAbuseReports,
  submitCommunityAbuseReportWithResult,
} from '../src/features/community/services/communityTrustService';
import {
  setActiveAccountScopeUid,
  resolveEffectiveUid,
} from '../src/features/account/services/accountStorageScope';
import {
  createEmptySubmissionDraft,
  validateSubmissionStep,
} from '../src/features/properties/moderation/ListingValidation';
import {
  clearSubmissionDraft,
  loadMyListings,
  loadSubmissionDraft,
  saveSubmissionDraft,
  submitDraftAsPropertyListing,
} from '../src/features/properties/services/listingService';
import {
  commitPropertyFilterDraft,
  createDefaultPropertyFilters,
} from '../src/features/properties/filters/PropertyFilterDraft';
import {
  filterAndSortProperties,
  matchesTransactionTypeFilter,
} from '../src/features/properties/services/propertySearchService';
import { buildPropertyListingRecords } from '../src/features/properties/services/propertyDataAdapter';
import {
  buildPropertyMapProjection,
  computeCameraViewportBounds,
  DEFAULT_TEHRAN_CAMERA,
  panCameraViewport,
} from '../src/features/properties/services/propertyMapService';
import {
  clientGeoJsonLruCache,
  computeNeighborhoodGeometryFingerprint,
  resolveNeighborhoodGeoJsonForLod,
  type BoundaryNeighborhoodInput,
} from '../src/utils/neighborhoodBoundaries';
import {
  clearNeighborhoodReconcilerLayers,
  createEmptyReconcilerRefs,
  formatNeighborhoodLayerKey,
  reconcileNeighborhoodLayers,
  selectVisibleMapNeighborhoods,
} from '../src/components/map/neighborhoodLayerReconciler';
import {
  type EvaluatedNeighborhood,
  generateLocalNeighborhoodAnalysis,
  getNeighborhoodMarketReport,
  getNeighborhoodTrafficInfo,
  INITIAL_NEIGHBORHOODS,
  parseInitialUrlParams,
} from '../src/data/neighborhoods';
import { MULTI_CITY_CONFIGS } from '../src/data/multiCityData';
import { applyUrlParamsFromLocation, type UseAppUrlAndTitleSyncParams } from '../src/components/useAppUrlAndTitleSync';
import { syncSearchHistoryUrl } from '../src/features/search/components/GlobalSearchWorkspace';
import { decodeSearchUrlState } from '../src/features/search/services/searchNormalizerAndPlanner';

function installMockBrowserEnvironment(initialSearch = '', initialPathname = '/') {
  const store = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (idx: number) => Array.from(store.keys())[idx] ?? null,
    get length() { return store.size; },
  };
  const historyStack: string[] = [`${initialPathname}${initialSearch}`];
  let historyIdx = 0;
  let pushCount = 0;
  let replaceCount = 0;

  const mockLocation = {
    pathname: initialPathname,
    search: initialSearch,
    href: `http://localhost:3000${initialPathname}${initialSearch}`,
  };

  const updateLocationFromUrl = (nextUrl: string) => {
    const qIdx = nextUrl.indexOf('?');
    if (qIdx >= 0) {
      mockLocation.pathname = nextUrl.slice(0, qIdx) || '/';
      mockLocation.search = nextUrl.slice(qIdx);
    } else {
      mockLocation.pathname = nextUrl || '/';
      mockLocation.search = '';
    }
    mockLocation.href = `http://localhost:3000${mockLocation.pathname}${mockLocation.search}`;
  };

  const mockHistory = {
    pushState: (_data: any, _unused: string, url?: string | URL | null) => {
      if (url) {
        const str = String(url);
        historyStack.splice(historyIdx + 1);
        historyStack.push(str);
        historyIdx = historyStack.length - 1;
        pushCount += 1;
        updateLocationFromUrl(str);
      }
    },
    replaceState: (_data: any, _unused: string, url?: string | URL | null) => {
      if (url) {
        const str = String(url);
        historyStack[historyIdx] = str;
        replaceCount += 1;
        updateLocationFromUrl(str);
      }
    },
    back: () => {
      if (historyIdx > 0) {
        historyIdx -= 1;
        updateLocationFromUrl(historyStack[historyIdx]);
      }
    },
    forward: () => {
      if (historyIdx < historyStack.length - 1) {
        historyIdx += 1;
        updateLocationFromUrl(historyStack[historyIdx]);
      }
    },
    get stack() { return [...historyStack]; },
    get index() { return historyIdx; },
    get pushCount() { return pushCount; },
    get replaceCount() { return replaceCount; },
  };

  (globalThis as any).localStorage = mockLocalStorage;
  (globalThis as any).window = {
    localStorage: mockLocalStorage,
    location: mockLocation,
    history: mockHistory,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  return { store, mockLocalStorage, mockLocation, mockHistory };
}

function evaluateNeighborhoods(seeds: typeof INITIAL_NEIGHBORHOODS, ..._rest: unknown[]): EvaluatedNeighborhood[] {
  return seeds.map((h) => ({
    ...h,
    status: 'green' as const,
    distKm: 4.2,
    overallScore: 8.5,
    diffPercent: 10,
    marketReport: getNeighborhoodMarketReport(h),
    trafficInfo: getNeighborhoodTrafficInfo(h),
  }));
}

const sampleEvaluatedHoods: EvaluatedNeighborhood[] = evaluateNeighborhoods(INITIAL_NEIGHBORHOODS.slice(0, 6));
const sampleHood = sampleEvaluatedHoods[0];
const mockAuthUser = {
  uid: 'uid-real-1',
  getIdToken: async () => 'mock-jwt-token-valid',
} as any;

// ============================================================================
// 1. RT-FE-BUG-001-COMMUNITY-AUTH-CONTEXT (18 Tests)
// ============================================================================
describe('RT-FE-BUG-001-COMMUNITY-AUTH-CONTEXT (18 tests)', () => {
  beforeEach(() => {
    installMockBrowserEnvironment();
    setActiveAccountScopeUid(null);
  });

  // 5 Unit tests
  test('Unit 1.1: mapCommunityErrorFa returns auth required message for HTTP 401', () => {
    assert.equal(mapCommunityErrorFa(401), COMMUNITY_AUTH_REQUIRED_FA);
  });

  test('Unit 1.2: mapCommunityErrorFa returns distinct permission denied message for HTTP 403', () => {
    const msg403 = mapCommunityErrorFa(403);
    assert.equal(msg403, COMMUNITY_PERMISSION_DENIED_FA);
    assert.notEqual(msg403, COMMUNITY_AUTH_REQUIRED_FA);
  });

  test('Unit 1.3: mapCommunityErrorFa returns network error message for status 0 / network failure', () => {
    const msgNet = mapCommunityErrorFa(0);
    assert.equal(msgNet, COMMUNITY_NETWORK_ERROR_FA);
    assert.notEqual(msgNet, COMMUNITY_AUTH_REQUIRED_FA);
  });

  test('Unit 1.4: submitCommunityAbuseReportWithResult rejects guest/local-user/current_local_user UIDs', () => {
    const res1 = submitCommunityAbuseReportWithResult({
      targetType: 'discussion_post',
      targetId: 'disc-1',
      reporterUserId: 'current_local_user',
      reason: 'spam_promo',
      detailsFa: 'تست گزارش',
    });
    assert.equal(res1.ok, false);
    assert.equal(res1.items.length, 0);

    const res2 = submitCommunityAbuseReportWithResult({
      targetType: 'discussion_post',
      targetId: 'disc-1',
      reporterUserId: '',
      reason: 'spam_promo',
      detailsFa: 'تست گزارش',
    });
    assert.equal(res2.ok, false);
  });

  test('Unit 1.5: submitCommunityAbuseReportWithResult succeeds and persists for authenticated UID', () => {
    setActiveAccountScopeUid('uid-auth-reporter');
    const res = submitCommunityAbuseReportWithResult({
      targetType: 'discussion_post',
      targetId: 'disc-10',
      reporterUserId: 'uid-auth-reporter',
      reason: 'spam_promo',
      detailsFa: 'قیمت واقعی نیست',
    });
    assert.equal(res.ok, true);
    assert.equal(res.items.length, 1);
    assert.equal(res.report?.reporterUserId, 'uid-auth-reporter');
  });

  // 5 Integration tests
  test('Integration 1.6: createCommunityDiscussion surfaces 401 auth error without silent success', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    try {
      const res = await createCommunityDiscussion(
        {
          track: 'social_discussion',
          neighborhoodId: 5,
          neighborhoodNameFa: 'پونک',
          topicId: 'topic-neighborhoods',
          titleFa: 'پرسش تستی معتبر درباره سکونت',
          bodyFa: 'آیا دسترسی مترو در ساعات اوج مناسب است؟',
        },
        mockAuthUser,
      );
      assert.equal(res.ok, false);
      assert.equal(res.status, 401);
      assert.equal(res.errorFa, COMMUNITY_AUTH_REQUIRED_FA);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('Integration 1.7: editCommunityDiscussion surfaces 403 permission error distinctly from 401', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    try {
      const res = await editCommunityDiscussion(
        'disc-1',
        { titleFa: 'ویرایش عنوان', bodyFa: 'متن جدید', reasonFa: 'اصلاح' },
        mockAuthUser,
      );
      assert.equal(res.ok, false);
      assert.equal(res.status, 403);
      assert.equal(res.errorFa, COMMUNITY_PERMISSION_DENIED_FA);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('Integration 1.8: withdrawDataCorrection surfaces 403 permission denied', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    try {
      const res = await withdrawDataCorrection('corr-99', mockAuthUser);
      assert.equal(res.ok, false);
      assert.equal(res.status, 403);
      assert.equal(res.errorFa, COMMUNITY_PERMISSION_DENIED_FA);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('Integration 1.9: createCommunityAnswer surfaces network error when fetch throws', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('Network disconnected'); };
    try {
      const res = await createCommunityAnswer(
        'q-1',
        { bodyFa: 'پاسخ تجربی کامل برای محله پونک' },
        mockAuthUser,
      );
      assert.equal(res.ok, false);
      assert.equal(res.errorFa, COMMUNITY_NETWORK_ERROR_FA);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('Integration 1.10: toggleCommunityReaction surfaces 429 rate-limit error accurately', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: 'Too Many Requests' }), { status: 429 });
    try {
      const voteRes = await toggleCommunityReaction('disc-1', 'helpful', mockAuthUser);
      assert.equal(voteRes.ok, false);
      assert.equal(voteRes.status, 429);
      assert.ok(voteRes.errorFa?.includes('بیش از حد مجاز'));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // 5 E2E / Workflow tests
  test('E2E 1.11: ProductSecondaryHubView passes currentUser and isVerifiedAdmin to CommunityHubPage', () => {
    const hubSource = fs.readFileSync(
      path.join(process.cwd(), 'src/components/views/ProductSecondaryHubView.tsx'),
      'utf8',
    );
    assert.ok(hubSource.includes('<CommunityHubPage'));
    assert.ok(hubSource.includes('currentUser={p.currentUser}'));
    assert.ok(hubSource.includes('isVerifiedAdmin={p.isVerifiedAdmin}'));
  });

  test('E2E 1.12: CommunityHubPage separates error toast (role=alert) from success toast and resets on account switch', () => {
    const pageSource = fs.readFileSync(
      path.join(process.cwd(), 'src/features/community/pages/CommunityHubPage.tsx'),
      'utf8',
    );
    assert.ok(pageSource.includes('community-toast-error'));
    assert.ok(pageSource.includes('community-toast-success'));
    assert.ok(pageSource.includes('res.ok && res.data'));
    assert.ok(!pageSource.includes("currentUser?.uid || 'current_local_user'"));
  });

  test('E2E 1.13: submitCommunityAbuseReport only returns ok=true when backend responds 2xx with item', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          item: {
            id: 'rep-srv-1',
            targetType: 'discussion_post',
            targetId: 'disc-5',
            reporterUserId: 'uid-real-1',
            reason: 'spam_or_promo',
            detailsFa: 'تبلیغات تکراری',
            createdAtIso: new Date().toISOString(),
            status: 'submitted',
          },
        }),
        { status: 201 },
      );
    try {
      const res = await submitCommunityAbuseReport(
        {
          targetType: 'discussion_post',
          targetId: 'disc-5',
          reason: 'spam_promo',
          detailsFa: 'تبلیغات تکراری',
        },
        mockAuthUser,
      );
      assert.equal(res.ok, true);
      assert.equal(res.data?.id, 'rep-srv-1');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('E2E 1.14: submitCommunityAbuseReport returns ok=false on 500 server error (prevents false success toast)', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    try {
      const res = await submitCommunityAbuseReport(
        {
          targetType: 'discussion_post',
          targetId: 'disc-5',
          reason: 'spam_promo',
          detailsFa: 'خطای سرور',
        },
        mockAuthUser,
      );
      assert.equal(res.ok, false);
      assert.equal(res.data, undefined);
      assert.ok(res.errorFa);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('E2E 1.15: Unauthenticated submitCommunityAbuseReport returns 401 before network call', async () => {
    const res = await submitCommunityAbuseReport(
      {
        targetType: 'discussion_post',
        targetId: 'disc-A',
        reason: 'harassment',
        detailsFa: 'گزارش بدون ورود',
      },
      null,
    );
    assert.equal(res.ok, false);
    assert.equal(res.status, 401);
    assert.equal(res.errorFa, COMMUNITY_AUTH_REQUIRED_FA);
  });

  // 3 Negative tests
  test('Negative 1.16: Guest report attempt with anonymous/guest UID is rejected with Persian auth error', () => {
    for (const fakeUid of ['guest', 'anonymous', 'local-user', 'current_local_user', '   ']) {
      const res = submitCommunityAbuseReportWithResult({
        targetType: 'answer',
        targetId: 'ans-1',
        reporterUserId: fakeUid,
        reason: 'spam_promo',
        detailsFa: 'تست منفی',
      });
      assert.equal(res.ok, false);
      assert.ok(res.errorFa?.includes('وارد حساب کاربری'));
    }
  });

  test('Negative 1.17: Abuse report with empty targetId is rejected', () => {
    const res = submitCommunityAbuseReportWithResult({
      targetType: 'discussion_post',
      targetId: '   ',
      reporterUserId: 'valid-uid-1',
      reason: 'spam_promo',
      detailsFa: 'شناسه خالی',
    });
    assert.equal(res.ok, false);
    assert.equal(res.items.length, 0);
  });

  test('Negative 1.18: Malformed non-JSON 502 response on community API does not throw uncaught exception', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('<html>Bad Gateway</html>', { status: 502 });
    try {
      const res = await submitCommunityAbuseReport(
        {
          targetType: 'discussion_post',
          targetId: 'disc-9',
          reason: 'conflict_of_interest',
          detailsFa: 'تست پاسخ خراب',
        },
        mockAuthUser,
      );
      assert.equal(res.ok, false);
      assert.equal(res.status, 502);
      assert.ok(res.errorFa);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ============================================================================
// 2. RT-FE-BUG-002-LISTING-DRAFT-ACCOUNT-LEAK (10 Tests)
// ============================================================================
describe('RT-FE-BUG-002-LISTING-DRAFT-ACCOUNT-LEAK (10 tests)', () => {
  beforeEach(() => {
    installMockBrowserEnvironment();
    setActiveAccountScopeUid(null);
  });

  // 3 Unit tests
  test('Unit 2.1: createEmptySubmissionDraft stamps ownerUid explicitly', () => {
    const draftA = createEmptySubmissionDraft(5, 'tehran', 'uid-alpha');
    assert.equal(draftA.ownerUid, 'uid-alpha');
    const draftGuest = createEmptySubmissionDraft(5, 'tehran', null);
    assert.equal(draftGuest.ownerUid, 'local-user');
  });

  test('Unit 2.2: saveSubmissionDraft and loadSubmissionDraft isolate drafts by UID', () => {
    const draftA = {
      ...createEmptySubmissionDraft(5, 'tehran', 'uid-A'),
      title: 'آپارتمان شخصی کاربر الف',
      publisherPhone: '09121112233',
    };
    saveSubmissionDraft(draftA, 'uid-A');

    assert.equal(loadSubmissionDraft('uid-A')?.title, 'آپارتمان شخصی کاربر الف');
    assert.equal(loadSubmissionDraft('uid-B'), null);
    assert.equal(loadSubmissionDraft(null), null);
  });

  test('Unit 2.3: saveSubmissionDraft throws DRAFT_OWNER_UID_MISMATCH if draft.ownerUid !== target UID', () => {
    const draftA = createEmptySubmissionDraft(5, 'tehran', 'uid-A');
    assert.throws(
      () => saveSubmissionDraft(draftA, 'uid-B'),
      /DRAFT_OWNER_UID_MISMATCH/,
    );
  });

  // 4 Integration tests
  test('Integration 2.4: Account switch A -> B does not leak user A draft into user B scope', () => {
    setActiveAccountScopeUid('user-A');
    const draftA = {
      ...createEmptySubmissionDraft(5, 'tehran', 'user-A'),
      street: 'خیابان سردار جنگل',
      publisherName: 'کاربر الف',
      publisherPhone: '09120001111',
    };
    saveSubmissionDraft(draftA, 'user-A');

    // Switch to user B
    setActiveAccountScopeUid('user-B');
    const loadedForB = loadSubmissionDraft('user-B');
    assert.equal(loadedForB, null);

    // Create and save draft for B
    const draftB = {
      ...createEmptySubmissionDraft(14, 'tehran', 'user-B'),
      street: 'فلکه اول تهرانپارس',
      publisherName: 'کاربر ب',
    };
    saveSubmissionDraft(draftB, 'user-B');

    // User A draft remains intact
    assert.equal(loadSubmissionDraft('user-A')?.street, 'خیابان سردار جنگل');
    assert.equal(loadSubmissionDraft('user-B')?.street, 'فلکه اول تهرانپارس');
  });

  test('Integration 2.5: Logout (A -> guest) isolates user A draft from guest session', () => {
    setActiveAccountScopeUid('user-A');
    const draftA = {
      ...createEmptySubmissionDraft(5, 'tehran', 'user-A'),
      title: 'ملک خصوصی کاربر الف',
    };
    saveSubmissionDraft(draftA, 'user-A');

    // Logout to guest
    setActiveAccountScopeUid(null);
    assert.equal(resolveEffectiveUid(null), 'local-user');
    assert.equal(loadSubmissionDraft(null), null);
  });

  test('Integration 2.6: Guest -> Login B does not overwrite B existing draft with guest draft', () => {
    // User B already has a saved draft
    saveSubmissionDraft(
      { ...createEmptySubmissionDraft(5, 'tehran', 'user-B'), title: 'پیش‌نویس قبلی کاربر ب' },
      'user-B',
    );

    // Guest edits a draft before logging in
    setActiveAccountScopeUid(null);
    saveSubmissionDraft(
      { ...createEmptySubmissionDraft(5, 'tehran', null), title: 'پیش‌نویس مهمان' },
      null,
    );

    // Login as user B
    setActiveAccountScopeUid('user-B');
    const loadedB = loadSubmissionDraft('user-B');
    assert.equal(loadedB?.title, 'پیش‌نویس قبلی کاربر ب');
    assert.equal(loadedB?.ownerUid, 'user-B');
  });

  test('Integration 2.7: submitDraftAsPropertyListing blocks cross-account submission if draft.ownerUid mismatches active UID', () => {
    const draftA = {
      ...createEmptySubmissionDraft(sampleHood.id, 'tehran', 'user-A'),
      street: 'بلوار عدل',
      saleTotalBillion: '9.5',
      title: 'آپارتمان ۸۵ متری پونک',
      description: 'واحد خوش‌نقشه، نورگیر عالی و فول امکانات',
      publisherName: 'کاربر الف',
      publisherPhone: '09123334455',
    };
    assert.throws(
      () =>
        submitDraftAsPropertyListing(
          draftA,
          sampleHood,
          { level: 'none', score: 0, matchedListingIds: [], reasons: [], actionPolicy: 'allow_publish' },
          'user-B',
        ),
      /DRAFT_OWNER_UID_MISMATCH/,
    );
    assert.equal(loadMyListings('user-B').length, 0);
  });

  // 3 E2E tests
  test('E2E 2.8: Full submission under user B stamps publisher.id = user-B and clears only user-B draft', () => {
    saveSubmissionDraft(
      { ...createEmptySubmissionDraft(sampleHood.id, 'tehran', 'user-A'), title: 'پیش‌نویس محفوظ الف' },
      'user-A',
    );
    setActiveAccountScopeUid('user-B');
    const draftB = {
      ...createEmptySubmissionDraft(sampleHood.id, 'tehran', 'user-B'),
      street: 'بلوار همیلا',
      saleTotalBillion: '11.2',
      title: 'آپارتمان ۹۰ متری همیلا',
      description: 'واحد جنوبی رو به آفتاب با پارکینگ و انباری سندی',
      publisherName: 'کاربر ب',
      publisherPhone: '09127778899',
    };
    saveSubmissionDraft(draftB, 'user-B');
    assert.equal(validateSubmissionStep(draftB, 7).valid, true);

    const created = submitDraftAsPropertyListing(
      draftB,
      sampleHood,
      { level: 'none', score: 0, matchedListingIds: [], reasons: [], actionPolicy: 'allow_publish' },
      'user-B',
    );
    assert.equal(created.listing.publisher.id, 'user-B');
    assert.equal(loadSubmissionDraft('user-B'), null);
    assert.equal(loadSubmissionDraft('user-A')?.title, 'پیش‌نویس محفوظ الف');
  });

  test('E2E 2.9: clearSubmissionDraft only clears the active user scope', () => {
    saveSubmissionDraft({ ...createEmptySubmissionDraft(5, 'tehran', 'user-A'), title: 'الف' }, 'user-A');
    saveSubmissionDraft({ ...createEmptySubmissionDraft(5, 'tehran', 'user-B'), title: 'ب' }, 'user-B');
    clearSubmissionDraft('user-B');
    assert.equal(loadSubmissionDraft('user-B'), null);
    assert.equal(loadSubmissionDraft('user-A')?.title, 'الف');
  });

  test('E2E 2.10: ListingSubmissionPage wires currentUserUid and ACCOUNT_WORKSPACE_UPDATED_EVENT', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/features/properties/submission/ListingSubmissionPage.tsx'),
      'utf8',
    );
    assert.ok(src.includes('currentUserUid'));
    assert.ok(src.includes('ACCOUNT_WORKSPACE_UPDATED_EVENT'));
    assert.ok(src.includes('loadSubmissionDraft(nextUid)'));
  });
});

// ============================================================================
// 3. RT-FE-BUG-003-RENT-TAB-EXCLUDES-RENT-LISTINGS (8 Tests)
// ============================================================================
describe('RT-FE-BUG-003-RENT-TAB-EXCLUDES-RENT-LISTINGS (8 tests)', () => {
  beforeEach(() => {
    installMockBrowserEnvironment();
  });

  // 3 Unit tests
  test('Unit 3.1: matchesTransactionTypeFilter("rent", "rent") and ("full_deposit", "rent") both return true', () => {
    assert.equal(matchesTransactionTypeFilter('rent', 'rent', 25), true);
    assert.equal(matchesTransactionTypeFilter('full_deposit', 'rent', 0), true);
    assert.equal(matchesTransactionTypeFilter('sale', 'rent', null), false);
    assert.equal(matchesTransactionTypeFilter('presale', 'rent', null), false);
  });

  test('Unit 3.2: matchesTransactionTypeFilter for full_deposit matches full_deposit or rent with 0 monthly rent', () => {
    assert.equal(matchesTransactionTypeFilter('full_deposit', 'full_deposit', 0), true);
    assert.equal(matchesTransactionTypeFilter('rent', 'full_deposit', 0), true);
    assert.equal(matchesTransactionTypeFilter('rent', 'full_deposit', null), true);
    assert.equal(matchesTransactionTypeFilter('rent', 'full_deposit', 18), false);
  });

  test('Unit 3.3: matchesTransactionTypeFilter for sale and presale remains strict', () => {
    assert.equal(matchesTransactionTypeFilter('sale', 'sale', null), true);
    assert.equal(matchesTransactionTypeFilter('rent', 'sale', 15), false);
    assert.equal(matchesTransactionTypeFilter('presale', 'presale', null), true);
  });

  // 3 Integration tests
  test('Integration 3.4: filterAndSortProperties with transactionType="rent" returns both rent+monthly and full_deposit listings', () => {
    const baseRecords = buildPropertyListingRecords(sampleEvaluatedHoods, [], 'tehran');
    const draftRent = {
      ...createEmptySubmissionDraft(sampleHood.id, 'tehran', 'uid-rent-test'),
      transactionType: 'rent' as const,
      street: 'اشرفی اصفهانی',
      depositMillion: '600',
      monthlyRentMillion: '22',
      title: 'آپارتمان اجاره‌ای ۸۵ متری پونک',
      description: 'ودیعه ۶۰۰ میلیون و اجاره ماهیانه ۲۲ میلیون تومان',
      publisherName: 'مالک پونک',
      publisherPhone: '09121234567',
    };
    const submittedRentRecord = submitDraftAsPropertyListing(
      draftRent,
      sampleHood,
      { level: 'none', score: 0, matchedListingIds: [], reasons: [], actionPolicy: 'allow_publish' },
      'uid-rent-test',
    );
    const allRecords = buildPropertyListingRecords(sampleEvaluatedHoods, [submittedRentRecord], 'tehran');
    const rentFilter = commitPropertyFilterDraft(createDefaultPropertyFilters('rent'));
    const results = filterAndSortProperties(allRecords, rentFilter, sampleHood.id);

    assert.ok(results.some((r) => r.listing.listingId === submittedRentRecord.listing.listingId));
    assert.ok(results.some((r) => r.listing.transactionType === 'full_deposit'));
    assert.ok(results.every((r) => r.listing.transactionType === 'rent' || r.listing.transactionType === 'full_deposit'));
    assert.ok(baseRecords.length > 0);
  });

  test('Integration 3.5: filterAndSortProperties with depositMaxMillion and rentMaxMillion filters rent listings accurately', () => {
    const draftLowRent = {
      ...createEmptySubmissionDraft(sampleHood.id, 'tehran', 'uid-r1'),
      transactionType: 'rent' as const,
      street: 'خیابان اول',
      depositMillion: '500',
      monthlyRentMillion: '15',
      title: 'واحد اجاره مناسب',
      description: 'واحد بسیار تمیز با اجاره مناسب در پونک',
      publisherName: 'مالک ۱',
      publisherPhone: '09121112222',
    };
    const draftHighRent = {
      ...createEmptySubmissionDraft(sampleHood.id, 'tehran', 'uid-r2'),
      transactionType: 'rent' as const,
      street: 'خیابان دوم',
      depositMillion: '500',
      monthlyRentMillion: '45',
      title: 'واحد اجاره لوکس',
      description: 'واحد لوکس با اجاره ماهانه بالا در پونک',
      publisherName: 'مالک ۲',
      publisherPhone: '09123334444',
    };
    const recLow = submitDraftAsPropertyListing(
      draftLowRent,
      sampleHood,
      { level: 'none', score: 0, matchedListingIds: [], reasons: [], actionPolicy: 'allow_publish' },
      'uid-r1',
    );
    const recHigh = submitDraftAsPropertyListing(
      draftHighRent,
      sampleHood,
      { level: 'none', score: 0, matchedListingIds: [], reasons: [], actionPolicy: 'allow_publish' },
      'uid-r2',
    );

    const filterDraft = {
      ...createDefaultPropertyFilters('rent'),
      rentMaxMillion: '20',
    };
    const results = filterAndSortProperties([recLow, recHigh], commitPropertyFilterDraft(filterDraft), sampleHood.id);
    assert.equal(results.length, 1);
    assert.equal(results[0].listing.listingId, recLow.listing.listingId);
  });

  test('Integration 3.6: Switching between buy, rent, and all filters preserves correct transaction subsets', () => {
    const allRecords = buildPropertyListingRecords(sampleEvaluatedHoods, [], 'tehran');
    const saleResults = filterAndSortProperties(
      allRecords,
      commitPropertyFilterDraft(createDefaultPropertyFilters('sale')),
    );
    const rentResults = filterAndSortProperties(
      allRecords,
      commitPropertyFilterDraft(createDefaultPropertyFilters('rent')),
    );
    const allResults = filterAndSortProperties(
      allRecords,
      commitPropertyFilterDraft(createDefaultPropertyFilters('all')),
    );

    assert.ok(saleResults.length > 0);
    assert.ok(rentResults.length > 0);
    assert.equal(saleResults.length + rentResults.length, allResults.length);
  });

  // 2 E2E tests
  test('E2E 3.7: PropertyExplorerPage sets transactionType to "rent" when activeSubTab === "rent"', () => {
    const explorerSource = fs.readFileSync(
      path.join(process.cwd(), 'src/features/properties/pages/PropertyExplorerPage.tsx'),
      'utf8',
    );
    assert.ok(explorerSource.includes("else if (p.activeSubTab === 'rent')"));
    assert.ok(explorerSource.includes("transactionType: 'rent' as const"));
    assert.ok(!explorerSource.includes("transactionType: 'full_deposit' as const"));
  });

  test('E2E 3.8: Newly submitted rent listing with monthly rent > 0 appears immediately under rent sub-tab', () => {
    const draftRent = {
      ...createEmptySubmissionDraft(sampleHood.id, 'tehran', 'uid-e2e-rent'),
      transactionType: 'rent' as const,
      street: 'بلوار کمالی',
      depositMillion: '700',
      monthlyRentMillion: '18',
      title: 'واحد ۸۵ متری رهن و اجاره بلوار کمالی',
      description: 'طبقه سوم، پارکینگ و آسانسور، آماده تحویل',
      publisherName: 'امیر رضایی',
      publisherPhone: '09129998877',
    };
    const created = submitDraftAsPropertyListing(
      draftRent,
      sampleHood,
      { level: 'none', score: 0, matchedListingIds: [], reasons: [], actionPolicy: 'allow_publish' },
      'uid-e2e-rent',
    );
    const subTabRentApplied = commitPropertyFilterDraft({
      ...createDefaultPropertyFilters('rent'),
      transactionType: 'rent',
      propertyType: 'all',
    });
    const visible = filterAndSortProperties([created], subTabRentApplied, sampleHood.id);
    assert.equal(visible.length, 1);
    assert.equal(visible[0].listing.listingId, created.listing.listingId);
  });
});

// ============================================================================
// 4. RT-FE-BUG-004-PROPERTY-MAP-VIEWPORT-BOUNDS (8 Tests)
// ============================================================================
describe('RT-FE-BUG-004-PROPERTY-MAP-VIEWPORT-BOUNDS (8 tests)', () => {
  const allRecords = buildPropertyListingRecords(sampleEvaluatedHoods, [], 'tehran');

  // 3 Unit tests
  test('Unit 4.1: computeCameraViewportBounds depends solely on camera center and zoom, not filtered records', () => {
    const b12 = computeCameraViewportBounds(35.75, 51.35, 12);
    const projAll = buildPropertyMapProjection(allRecords, 12, null, b12);
    const projSingle = buildPropertyMapProjection(allRecords.slice(0, 1), 12, null, b12);
    const projEmpty = buildPropertyMapProjection([], 12, null, b12);

    assert.deepEqual(projAll.bounds, b12);
    assert.deepEqual(projSingle.bounds, b12);
    assert.deepEqual(projEmpty.bounds, b12);
  });

  test('Unit 4.2: Single record projection never collapses to zero-area bounding box', () => {
    const singleRecord = allRecords.slice(0, 1);
    const proj = buildPropertyMapProjection(singleRecord, 12, null);
    assert.ok(proj.bounds.north > proj.bounds.south);
    assert.ok(proj.bounds.east > proj.bounds.west);
    assert.ok(proj.bounds.north - proj.bounds.south >= 0.05);
  });

  test('Unit 4.3: Zooming in and out scales camera viewport bounds monotonically around center', () => {
    const b11 = computeCameraViewportBounds(35.72, 51.33, 11);
    const b12 = computeCameraViewportBounds(35.72, 51.33, 12);
    const b14 = computeCameraViewportBounds(35.72, 51.33, 14);

    const span11 = b11.north - b11.south;
    const span12 = b12.north - b12.south;
    const span14 = b14.north - b14.south;
    assert.ok(span11 > span12);
    assert.ok(span12 > span14);
  });

  // 3 Integration tests
  test('Integration 4.4: panCameraViewport shifts viewport bounds in the requested cardinal direction', () => {
    const cam0 = { ...DEFAULT_TEHRAN_CAMERA };
    const camNorth = panCameraViewport(cam0, 'north');
    const camEast = panCameraViewport(cam0, 'east');

    assert.ok(camNorth.centerLat > cam0.centerLat);
    assert.equal(camNorth.centerLng, cam0.centerLng);
    assert.ok(camEast.centerLng > cam0.centerLng);
    assert.equal(camEast.centerLat, cam0.centerLat);
  });

  test('Integration 4.5: Applying price/bedroom filters does not mutate camera viewport bounds', () => {
    const camBounds = computeCameraViewportBounds(sampleHood.lat, sampleHood.lng, 13);
    const unfilteredProj = buildPropertyMapProjection(allRecords, 13, null, camBounds);

    const strictFilter = commitPropertyFilterDraft({
      ...createDefaultPropertyFilters('sale'),
      roomsMin: 3,
      priceMaxMillion: '15000',
    });
    const filteredRecords = filterAndSortProperties(allRecords, strictFilter);
    const filteredProj = buildPropertyMapProjection(filteredRecords, 13, null, camBounds);

    assert.deepEqual(filteredProj.bounds, unfilteredProj.bounds);
  });

  test('Integration 4.6: Panning to an empty area and zooming out recovers records in the wider viewport', () => {
    const farCam = { centerLat: 35.92, centerLng: 51.05, zoom: 15 };
    const tightBounds = computeCameraViewportBounds(farCam.centerLat, farCam.centerLng, farCam.zoom);
    const tightFiltered = filterAndSortProperties(
      allRecords,
      commitPropertyFilterDraft({ ...createDefaultPropertyFilters('all'), mapBounds: tightBounds, onlyInMapBounds: true }),
    );
    assert.equal(tightFiltered.length, 0);

    // Pan back toward Tehran center and zoom out to 11
    const wideBounds = computeCameraViewportBounds(sampleHood.lat, sampleHood.lng, 11);
    const wideFiltered = filterAndSortProperties(
      allRecords,
      commitPropertyFilterDraft({ ...createDefaultPropertyFilters('all'), mapBounds: wideBounds, onlyInMapBounds: true }),
    );
    assert.ok(wideFiltered.length > 0);
  });

  // 2 E2E tests
  test('E2E 4.7: PropertyDiscoveryGrid keeps PropertyMapPane mounted when onlyInMapBounds yields 0 results', () => {
    const gridSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/features/properties/results/PropertyDiscoveryGrid.tsx'),
      'utf8',
    );
    assert.ok(gridSrc.includes('records.length === 0 && (!applied.onlyInMapBounds || viewMode === \'list\')'));
    assert.ok(gridSrc.includes('در این محدوده نقشه فایلی یافت نشد'));
  });

  test('E2E 4.8: PropertyMapPane uses cameraBounds directly for onSearchInViewport', () => {
    const paneSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/features/properties/map/PropertyMapPane.tsx'),
      'utf8',
    );
    assert.ok(paneSrc.includes('onSearchInViewport(cameraBounds)'));
    assert.ok(paneSrc.includes('map-pan-north-btn'));
  });
});

// ============================================================================
// 5. RT-FE-BUG-005-NEIGHBORHOOD-BOUNDARY-CACHE-STALE (8 Tests)
// ============================================================================
describe('RT-FE-BUG-005-NEIGHBORHOOD-BOUNDARY-CACHE-STALE (8 tests)', () => {
  beforeEach(() => {
    clientGeoJsonLruCache.clear();
  });

  const baseHood: BoundaryNeighborhoodInput = { id: 5, name: 'پونک', lat: 35.762, lng: 51.331, radius: 1200 };
  const neighborA1: BoundaryNeighborhoodInput = { id: 6, name: 'جنت‌آباد', lat: 35.764, lng: 51.318, radius: 1100 };
  const neighborA2: BoundaryNeighborhoodInput = { id: 6, name: 'جنت‌آباد', lat: 35.769, lng: 51.326, radius: 1550 };

  // 4 Unit tests
  test('Unit 5.1: computeNeighborhoodGeometryFingerprint changes when neighbor coordinates/radius change with same array length', () => {
    const fp1 = computeNeighborhoodGeometryFingerprint(baseHood, [baseHood, neighborA1], null, 'z12', 'tehran');
    const fp2 = computeNeighborhoodGeometryFingerprint(baseHood, [baseHood, neighborA2], null, 'z12', 'tehran');
    assert.notEqual(fp1, fp2);
  });

  test('Unit 5.2: computeNeighborhoodGeometryFingerprint changes when OSM override coordinates change with same point count', () => {
    const osm1: [number, number][] = [
      [35.760, 51.328],
      [35.765, 51.328],
      [35.765, 51.335],
      [35.760, 51.335],
    ];
    const osm2: [number, number][] = [
      [35.758, 51.325],
      [35.767, 51.325],
      [35.767, 51.338],
      [35.758, 51.338],
    ];
    assert.equal(osm1.length, osm2.length);
    const fp1 = computeNeighborhoodGeometryFingerprint(baseHood, [baseHood], osm1, 'z12', 'tehran');
    const fp2 = computeNeighborhoodGeometryFingerprint(baseHood, [baseHood], osm2, 'z12', 'tehran');
    assert.notEqual(fp1, fp2);
  });

  test('Unit 5.3: resolveNeighborhoodGeoJsonForLod recomputes polygon when OSM override coordinates change with identical length', () => {
    const osm1: [number, number][] = [
      [35.760, 51.328],
      [35.765, 51.328],
      [35.765, 51.335],
      [35.760, 51.335],
    ];
    const osm2: [number, number][] = [
      [35.755, 51.320],
      [35.770, 51.320],
      [35.770, 51.340],
      [35.755, 51.340],
    ];
    const res1 = resolveNeighborhoodGeoJsonForLod(baseHood, [baseHood], osm1, { zoom: 13, isSelected: true });
    const res2 = resolveNeighborhoodGeoJsonForLod(baseHood, [baseHood], osm2, { zoom: 13, isSelected: true });
    assert.notEqual(res1.geometryKey, res2.geometryKey);
    assert.notDeepEqual(res1.coords, res2.coords);
  });

  test('Unit 5.4: resolveNeighborhoodGeoJsonForLod does not pollute cache with raw numeric hood.id key', () => {
    resolveNeighborhoodGeoJsonForLod(baseHood, [baseHood, neighborA1], null, { zoom: 12, cityId: 'tehran' });
    assert.equal(clientGeoJsonLruCache.get(baseHood.id), undefined);
  });

  // 2 Integration tests
  test('Integration 5.5: Neighbor radius/coordinate update invalidates Voronoi clipped polygon cache', () => {
    const r1 = resolveNeighborhoodGeoJsonForLod(baseHood, [baseHood, neighborA1], null, { zoom: 13, isSelected: true });
    const r2 = resolveNeighborhoodGeoJsonForLod(baseHood, [baseHood, neighborA2], null, { zoom: 13, isSelected: true });
    assert.notEqual(r1.geometryKey, r2.geometryKey);
    assert.notDeepEqual(r1.coords, r2.coords);
  });

  test('Integration 5.6: Identical inputs hit LRU cache and return identical geometryKey and feature reference', () => {
    const r1 = resolveNeighborhoodGeoJsonForLod(baseHood, [baseHood, neighborA1], null, { zoom: 12, cityId: 'tehran' });
    const r2 = resolveNeighborhoodGeoJsonForLod(baseHood, [baseHood, neighborA1], null, { zoom: 12, cityId: 'tehran' });
    assert.equal(r1.geometryKey, r2.geometryKey);
    assert.equal(r1.geoJsonFeature, r2.geoJsonFeature);
  });

  // 2 E2E tests
  test('E2E 5.7: Switching from Voronoi fallback to authoritative OSM boundary updates polygon layer in reconciler', () => {
    const refs = createEmptyReconcilerRefs();
    const removedLayers: any[] = [];
    const mockMap = {
      removeLayer: (l: any) => removedLayers.push(l),
    };
    const mockL = {
      geoJSON: (feat: any) => ({ feat, on: () => {}, addTo: () => ({ feat, on: () => {} }) }),
      marker: (latlng: any) => ({ latlng, bindTooltip: () => {}, on: () => {}, addTo: () => ({ latlng, bindTooltip: () => {}, on: () => {} }) }),
      divIcon: (cfg: any) => cfg,
    };

    reconcileNeighborhoodLayers({
      L: mockL,
      map: mockMap,
      refs,
      visibleHoods: [sampleHood],
      allCityHoods: [sampleHood],
      selectedHoodId: sampleHood.id,
      currentZoom: 13,
      activeCity: 'tehran',
      mode: 'buy',
      targetSqm: 80,
      rentAgeMultiplier: 1,
      mapLens: 'budget',
      isDarkMap: false,
      lowBandwidthMode: false,
      enableSponsorBilling: false,
      osmBoundariesByHood: {},
      areaUnit: 'sqm',
      intlCurrency: 'IRT',
      locale: 'fa',
      onSelectNeighborhood: () => {},
    });
    const initialKey = refs.polygonsByHood.get(sampleHood.id)?.geometryKey;

    reconcileNeighborhoodLayers({
      L: mockL,
      map: mockMap,
      refs,
      visibleHoods: [sampleHood],
      allCityHoods: [sampleHood],
      selectedHoodId: sampleHood.id,
      currentZoom: 13,
      activeCity: 'tehran',
      mode: 'buy',
      targetSqm: 80,
      rentAgeMultiplier: 1,
      mapLens: 'budget',
      isDarkMap: false,
      lowBandwidthMode: false,
      enableSponsorBilling: false,
      osmBoundariesByHood: {
        [sampleHood.id]: {
          hoodId: sampleHood.id,
          name: sampleHood.name,
          source: 'osm_overpass_relation',
          sourceLabelFa: 'OSM',
          coordinates: [
            [sampleHood.lat - 0.004, sampleHood.lng - 0.004],
            [sampleHood.lat + 0.004, sampleHood.lng - 0.004],
            [sampleHood.lat + 0.004, sampleHood.lng + 0.004],
            [sampleHood.lat - 0.004, sampleHood.lng + 0.004],
          ],
          updatedAtIso: new Date().toISOString(),
        },
      },
      areaUnit: 'sqm',
      intlCurrency: 'IRT',
      locale: 'fa',
      onSelectNeighborhood: () => {},
    });
    const updatedKey = refs.polygonsByHood.get(sampleHood.id)?.geometryKey;
    assert.notEqual(initialKey, updatedKey);
  });

  test('E2E 5.8: Updating OSM boundary coordinates with same vertex count triggers layer update', () => {
    const coordsA: [number, number][] = [
      [sampleHood.lat - 0.003, sampleHood.lng - 0.003],
      [sampleHood.lat + 0.003, sampleHood.lng - 0.003],
      [sampleHood.lat + 0.003, sampleHood.lng + 0.003],
      [sampleHood.lat - 0.003, sampleHood.lng + 0.003],
    ];
    const coordsB: [number, number][] = [
      [sampleHood.lat - 0.006, sampleHood.lng - 0.006],
      [sampleHood.lat + 0.006, sampleHood.lng - 0.006],
      [sampleHood.lat + 0.006, sampleHood.lng + 0.006],
      [sampleHood.lat - 0.006, sampleHood.lng + 0.006],
    ];
    const resA = resolveNeighborhoodGeoJsonForLod(sampleHood, [sampleHood], coordsA, { zoom: 13, cityId: 'tehran' });
    const resB = resolveNeighborhoodGeoJsonForLod(sampleHood, [sampleHood], coordsB, { zoom: 13, cityId: 'tehran' });
    assert.notEqual(resA.geometryKey, resB.geometryKey);
  });
});

// ============================================================================
// 6. RT-FE-BUG-006A & 006B: MULTICITY LAYER SCOPE & CROSS-CITY COMPARE (16 Tests)
// ============================================================================
describe('RT-FE-BUG-006A & 006B: Multi-City Layer Scoping & Cross-City Comparison Guard (16 tests)', () => {
  beforeEach(() => {
    installMockBrowserEnvironment();
    clientGeoJsonLruCache.clear();
  });

  // --- 6A: 8 Tests for Multi-City Layer Identity & Reconciler ---
  test('Unit 6A.1: formatNeighborhoodLayerKey produces composite cityId:hoodId key', () => {
    assert.equal(formatNeighborhoodLayerKey('tehran', 5), 'tehran:5');
    assert.equal(formatNeighborhoodLayerKey('karaj', 101), 'karaj:101');
  });

  test('Unit 6A.2: computeNeighborhoodGeometryFingerprint isolates identical hoodId across different cities', () => {
    const fpTehran = computeNeighborhoodGeometryFingerprint(sampleHood, [sampleHood], null, 'z12', 'tehran');
    const fpKaraj = computeNeighborhoodGeometryFingerprint(sampleHood, [sampleHood], null, 'z12', 'karaj');
    assert.notEqual(fpTehran, fpKaraj);
  });

  test('Unit 6A.3: selectVisibleMapNeighborhoods scopes renderHoods to activeCityHoodIds', () => {
    const karajHoods = evaluateNeighborhoods(MULTI_CITY_CONFIGS.karaj.neighborhoods.slice(0, 3), 'buy', 80, 1000, 10000);
    const combined = [...sampleEvaluatedHoods.slice(0, 2), ...karajHoods];
    const karajSet = new Set(karajHoods.map((h) => h.id));
    const res = selectVisibleMapNeighborhoods({
      map: null,
      allNeighborhoods: combined,
      activeCity: 'karaj',
      activeCityHoodIds: karajSet,
      selectedHoodId: karajHoods[0].id,
      selectedHood: karajHoods[0],
      currentZoom: 12,
      statusFilter: 'all',
      lowBandwidthMode: false,
    });
    assert.ok(res.renderHoods.every((h) => karajSet.has(h.id)));
  });

  test('Integration 6A.4: reconcileNeighborhoodLayers removes previous city layers when activeCity switches', () => {
    const refs = createEmptyReconcilerRefs();
    const removed: any[] = [];
    const mockMap = { removeLayer: (l: any) => removed.push(l) };
    const mockL = {
      geoJSON: (feat: any) => ({ feat, on: () => {}, addTo: () => ({ feat, on: () => {} }) }),
      marker: (latlng: any) => ({ latlng, bindTooltip: () => {}, on: () => {}, addTo: () => ({ latlng, bindTooltip: () => {}, on: () => {} }) }),
      divIcon: (cfg: any) => cfg,
    };

    reconcileNeighborhoodLayers({
      L: mockL,
      map: mockMap,
      refs,
      visibleHoods: [sampleHood],
      allCityHoods: [sampleHood],
      selectedHoodId: sampleHood.id,
      currentZoom: 12,
      activeCity: 'tehran',
      mode: 'buy',
      targetSqm: 80,
      rentAgeMultiplier: 1,
      mapLens: 'budget',
      isDarkMap: false,
      lowBandwidthMode: false,
      enableSponsorBilling: false,
      osmBoundariesByHood: {},
      areaUnit: 'sqm',
      intlCurrency: 'IRT',
      locale: 'fa',
      onSelectNeighborhood: () => {},
    });
    assert.equal(refs.polygonsByHood.get(sampleHood.id)?.cityId, 'tehran');
    assert.equal(refs.polygonsByHood.get(sampleHood.id)?.scopedKey, `tehran:${sampleHood.id}`);

    const karajHood = evaluateNeighborhoods(MULTI_CITY_CONFIGS.karaj.neighborhoods.slice(0, 1), 'buy', 80, 1000, 10000)[0];
    reconcileNeighborhoodLayers({
      L: mockL,
      map: mockMap,
      refs,
      visibleHoods: [karajHood],
      allCityHoods: [karajHood],
      selectedHoodId: karajHood.id,
      currentZoom: 12,
      activeCity: 'karaj',
      mode: 'buy',
      targetSqm: 80,
      rentAgeMultiplier: 1,
      mapLens: 'budget',
      isDarkMap: false,
      lowBandwidthMode: false,
      enableSponsorBilling: false,
      osmBoundariesByHood: {},
      areaUnit: 'sqm',
      intlCurrency: 'IRT',
      locale: 'fa',
      onSelectNeighborhood: () => {},
    });

    assert.equal(refs.polygonsByHood.has(sampleHood.id), false);
    assert.equal(refs.markersByHood.has(sampleHood.id), false);
    assert.equal(refs.polygonsByHood.get(karajHood.id)?.cityId, 'karaj');
    assert.ok(removed.length >= 2);
  });

  test('Integration 6A.5: Colliding numeric hoodId across two cities is evicted and recreated with new cityId', () => {
    const refs = createEmptyReconcilerRefs();
    const removed: any[] = [];
    const mockMap = { removeLayer: (l: any) => removed.push(l) };
    const mockL = {
      geoJSON: (feat: any) => ({ feat, on: () => {}, addTo: () => ({ feat, on: () => {} }) }),
      marker: (latlng: any) => ({ latlng, bindTooltip: () => {}, on: () => {}, addTo: () => ({ latlng, bindTooltip: () => {}, on: () => {} }) }),
      divIcon: (cfg: any) => cfg,
    };

    const hoodCity1 = { ...sampleHood, id: 1, name: 'محله ۱ تهران' };
    const hoodCity2 = { ...sampleHood, id: 1, name: 'محله ۱ کرج', lat: 35.83, lng: 50.97 };

    reconcileNeighborhoodLayers({
      L: mockL, map: mockMap, refs, visibleHoods: [hoodCity1], allCityHoods: [hoodCity1],
      selectedHoodId: 1, currentZoom: 12, activeCity: 'tehran', mode: 'buy', targetSqm: 80,
      rentAgeMultiplier: 1, mapLens: 'budget', isDarkMap: false, lowBandwidthMode: false,
      enableSponsorBilling: false, osmBoundariesByHood: {}, areaUnit: 'sqm', intlCurrency: 'IRT',
      locale: 'fa', onSelectNeighborhood: () => {},
    });
    assert.equal(refs.polygonsByHood.get(1)?.scopedKey, 'tehran:1');

    reconcileNeighborhoodLayers({
      L: mockL, map: mockMap, refs, visibleHoods: [hoodCity2], allCityHoods: [hoodCity2],
      selectedHoodId: 1, currentZoom: 12, activeCity: 'karaj', mode: 'buy', targetSqm: 80,
      rentAgeMultiplier: 1, mapLens: 'budget', isDarkMap: false, lowBandwidthMode: false,
      enableSponsorBilling: false, osmBoundariesByHood: {}, areaUnit: 'sqm', intlCurrency: 'IRT',
      locale: 'fa', onSelectNeighborhood: () => {},
    });
    assert.equal(refs.polygonsByHood.get(1)?.scopedKey, 'karaj:1');
    assert.equal(refs.polygonsByHood.get(1)?.hood.name, 'محله ۱ کرج');
    assert.ok(removed.length >= 2);
  });

  test('Integration 6A.6: clearNeighborhoodReconcilerLayers empties polygons, markers, and goldPins cleanly', () => {
    const refs = createEmptyReconcilerRefs();
    refs.polygonsByHood.set(1, { layer: {}, geometryKey: 'g', styleKey: 's', stroke: '', fill: '', hood: sampleHood, cityId: 'tehran' });
    refs.markersByHood.set(1, { marker: {}, lat: 0, lng: 0, lastIconKey: '', lastTooltipKey: '', lastThemeKey: '', lodTier: 'dot', pillBg: '', hasSponsor: false, stroke: '', fill: '', hood: sampleHood, cityId: 'tehran' });
    refs.goldPinsByHood.set(1, { pin: {}, signature: 'sig', cityId: 'tehran' });
    clearNeighborhoodReconcilerLayers({ removeLayer: () => {} }, refs);
    assert.equal(refs.polygonsByHood.size, 0);
    assert.equal(refs.markersByHood.size, 0);
    assert.equal(refs.goldPinsByHood.size, 0);
  });

  test('E2E 6A.7: Rapid switching Tehran -> Karaj -> Mashhad -> Shiraz leaves only Shiraz layers in refs', () => {
    const refs = createEmptyReconcilerRefs();
    const mockMap = { removeLayer: () => {} };
    const mockL = {
      geoJSON: (feat: any) => ({ feat, on: () => {}, addTo: () => ({ feat, on: () => {} }) }),
      marker: (latlng: any) => ({ latlng, bindTooltip: () => {}, on: () => {}, addTo: () => ({ latlng, bindTooltip: () => {}, on: () => {} }) }),
      divIcon: (cfg: any) => cfg,
    };

    for (const city of ['tehran', 'karaj', 'mashhad', 'shiraz'] as const) {
      const seeds = city === 'tehran' ? INITIAL_NEIGHBORHOODS.slice(0, 2) : MULTI_CITY_CONFIGS[city].neighborhoods.slice(0, 2);
      const evalHoods = evaluateNeighborhoods(seeds, 'buy', 80, 1000, 10000);
      reconcileNeighborhoodLayers({
        L: mockL, map: mockMap, refs, visibleHoods: evalHoods, allCityHoods: evalHoods,
        selectedHoodId: evalHoods[0].id, currentZoom: 12, activeCity: city, mode: 'buy', targetSqm: 80,
        rentAgeMultiplier: 1, mapLens: 'budget', isDarkMap: false, lowBandwidthMode: false,
        enableSponsorBilling: false, osmBoundariesByHood: {}, areaUnit: 'sqm', intlCurrency: 'IRT',
        locale: 'fa', onSelectNeighborhood: () => {},
      });
    }
    for (const entry of refs.polygonsByHood.values()) {
      assert.equal(entry.cityId, 'shiraz');
    }
    for (const entry of refs.markersByHood.values()) {
      assert.equal(entry.cityId, 'shiraz');
    }
  });

  test('E2E 6A.8: Selected neighborhood marker in new city has matching scopedKey and cityId', () => {
    const refs = createEmptyReconcilerRefs();
    const mockMap = { removeLayer: () => {} };
    const mockL = {
      geoJSON: (feat: any) => ({ feat, on: () => {}, addTo: () => ({ feat, on: () => {} }) }),
      marker: (latlng: any) => ({ latlng, bindTooltip: () => {}, on: () => {}, addTo: () => ({ latlng, bindTooltip: () => {}, on: () => {} }) }),
      divIcon: (cfg: any) => cfg,
    };
    const isfahanHoods = evaluateNeighborhoods(MULTI_CITY_CONFIGS.isfahan.neighborhoods.slice(0, 2), 'buy', 80, 1000, 10000);
    reconcileNeighborhoodLayers({
      L: mockL, map: mockMap, refs, visibleHoods: isfahanHoods, allCityHoods: isfahanHoods,
      selectedHoodId: isfahanHoods[0].id, currentZoom: 13, activeCity: 'isfahan', mode: 'buy', targetSqm: 80,
      rentAgeMultiplier: 1, mapLens: 'budget', isDarkMap: false, lowBandwidthMode: false,
      enableSponsorBilling: false, osmBoundariesByHood: {}, areaUnit: 'sqm', intlCurrency: 'IRT',
      locale: 'fa', onSelectNeighborhood: () => {},
    });
    assert.equal(refs.markersByHood.get(isfahanHoods[0].id)?.scopedKey, `isfahan:${isfahanHoods[0].id}`);
  });

  // --- 6B: 8 Tests for Cross-City Comparison Guard ---
  test('Unit 6B.1: parseInitialUrlParams accepts valid same-city compare (Tehran 5-14)', () => {
    installMockBrowserEnvironment('?compare=5-14');
    const parsed = parseInitialUrlParams();
    assert.equal(parsed.initialShowCompare, true);
    assert.equal(parsed.initialCompareId1, 5);
    assert.equal(parsed.initialCompareId2, 14);
    assert.equal(parsed.initialCity, 'tehran');
  });

  test('Unit 6B.2: parseInitialUrlParams accepts valid same-city compare in Karaj (101-102)', () => {
    installMockBrowserEnvironment('?city=karaj&compare=101-102');
    const parsed = parseInitialUrlParams();
    assert.equal(parsed.initialShowCompare, true);
    assert.equal(parsed.initialCompareId1, 101);
    assert.equal(parsed.initialCompareId2, 102);
    assert.equal(parsed.initialCity, 'karaj');
  });

  test('Unit 6B.3: parseInitialUrlParams rejects cross-city compare (Tehran 5 vs Karaj 101)', () => {
    installMockBrowserEnvironment('?compare=5-101');
    const parsed = parseInitialUrlParams();
    assert.equal(parsed.initialShowCompare, false);
    assert.notEqual(parsed.initialCompareId2, 101);
  });

  test('Unit 6B.4: parseInitialUrlParams rejects compare when city param conflicts with hood city (city=karaj&compare=5-14)', () => {
    installMockBrowserEnvironment('?city=karaj&compare=5-14');
    const parsed = parseInitialUrlParams();
    assert.equal(parsed.initialShowCompare, false);
    assert.equal(parsed.initialCity, 'karaj');
    assert.equal(parsed.initialCompareId1, 101);
    assert.equal(parsed.initialCompareId2, 102);
  });

  test('Integration 6B.5: applyUrlParamsFromLocation rejects cross-city compare=5-101 and closes compare modal', () => {
    let activeCity: any = 'tehran';
    let showCompare = true;
    let c1 = 5;
    let c2 = 14;
    const res = applyUrlParamsFromLocation('/', '?compare=5-101', false, {
      activeCity, setActiveCity: (c) => { activeCity = c; },
      selectedHoodId: 5, setSelectedHoodId: () => {},
      showCompareModal: showCompare, setShowCompareModal: (v) => { showCompare = v; },
      compareId1: c1, setCompareId1: (id) => { c1 = id; },
      compareId2: c2, setCompareId2: (id) => { c2 = id; },
      mode: 'buy', setMode: () => {},
      deposit: 500, setDeposit: () => {},
      monthlyRent: 15, setMonthlyRent: () => {},
      buyTotalBudget: 8000, setBuyTotalBudget: () => {},
      targetSqm: 80, setTargetSqm: () => {},
      mapInstanceRef: { current: null },
      hasUrlBudgetParams: false,
    });
    assert.equal(res.compareAccepted, false);
    assert.equal(res.compareRejectedCrossCity, true);
    assert.equal(showCompare, false);
  });

  test('Integration 6B.6: applyUrlParamsFromLocation rejects self-comparison (compare=5-5)', () => {
    let showCompare = true;
    const res = applyUrlParamsFromLocation('/', '?compare=5-5', false, {
      activeCity: 'tehran', setActiveCity: () => {},
      selectedHoodId: 5, setSelectedHoodId: () => {},
      showCompareModal: showCompare, setShowCompareModal: (v) => { showCompare = v; },
      compareId1: 5, setCompareId1: () => {},
      compareId2: 14, setCompareId2: () => {},
      mode: 'buy', setMode: () => {},
      deposit: 500, setDeposit: () => {},
      monthlyRent: 15, setMonthlyRent: () => {},
      buyTotalBudget: 8000, setBuyTotalBudget: () => {},
      targetSqm: 80, setTargetSqm: () => {},
      mapInstanceRef: { current: null },
      hasUrlBudgetParams: false,
    });
    assert.equal(res.compareAccepted, false);
    assert.equal(showCompare, false);
  });

  test('E2E 6B.7: Direct navigation to valid comma-separated compare=5,14 opens compare modal for same city', () => {
    let showCompare = false;
    let c1 = 0;
    let c2 = 0;
    const res = applyUrlParamsFromLocation('/', '?compare=5,14', false, {
      activeCity: 'tehran', setActiveCity: () => {},
      selectedHoodId: 5, setSelectedHoodId: () => {},
      showCompareModal: showCompare, setShowCompareModal: (v) => { showCompare = v; },
      compareId1: c1, setCompareId1: (id) => { c1 = id; },
      compareId2: c2, setCompareId2: (id) => { c2 = id; },
      mode: 'buy', setMode: () => {},
      deposit: 500, setDeposit: () => {},
      monthlyRent: 15, setMonthlyRent: () => {},
      buyTotalBudget: 8000, setBuyTotalBudget: () => {},
      targetSqm: 80, setTargetSqm: () => {},
      mapInstanceRef: { current: null },
      hasUrlBudgetParams: false,
    });
    assert.equal(res.compareAccepted, true);
    assert.equal(showCompare, true);
    assert.equal(c1, 5);
    assert.equal(c2, 14);
  });

  test('E2E 6B.8: Invalid out-of-range compare=5-99999 is safely rejected without throwing', () => {
    installMockBrowserEnvironment('?compare=5-99999');
    const parsed = parseInitialUrlParams();
    assert.equal(parsed.initialShowCompare, false);
  });
});

// ============================================================================
// 7. RT-FE-BUG-007-COMPARE-URL-BUDGET-PARAMS-DROPPED (8 Tests)
// ============================================================================
describe('RT-FE-BUG-007-COMPARE-URL-BUDGET-PARAMS-DROPPED (8 tests)', () => {
  beforeEach(() => {
    installMockBrowserEnvironment();
  });

  function createStatefulSyncParams() {
    const state = {
      activeCity: 'tehran' as any,
      selectedHoodId: 1,
      showCompareModal: false,
      compareId1: 1,
      compareId2: 2,
      mode: 'rent' as 'rent' | 'buy',
      deposit: 300,
      monthlyRent: 10,
      buyTotalBudget: 5000,
      targetSqm: 70,
      workHubId: 'none',
      useLoanBooster: false,
      deductTenantRahnInBuy: false,
      buildingAgeSegment: 'new' as 'new' | 'mid' | 'older',
    };
    const params: UseAppUrlAndTitleSyncParams = {
      get activeCity() { return state.activeCity; },
      setActiveCity: (c) => { state.activeCity = c; },
      get selectedHoodId() { return state.selectedHoodId; },
      setSelectedHoodId: (id) => { state.selectedHoodId = id; },
      get showCompareModal() { return state.showCompareModal; },
      setShowCompareModal: (v) => { state.showCompareModal = v; },
      get compareId1() { return state.compareId1; },
      setCompareId1: (id) => { state.compareId1 = id; },
      get compareId2() { return state.compareId2; },
      setCompareId2: (id) => { state.compareId2 = id; },
      get mode() { return state.mode; },
      setMode: (m) => { state.mode = m; },
      get deposit() { return state.deposit; },
      setDeposit: (d) => { state.deposit = d; },
      get monthlyRent() { return state.monthlyRent; },
      setMonthlyRent: (r) => { state.monthlyRent = r; },
      get buyTotalBudget() { return state.buyTotalBudget; },
      setBuyTotalBudget: (b) => { state.buyTotalBudget = b; },
      get targetSqm() { return state.targetSqm; },
      setTargetSqm: (s) => { state.targetSqm = s; },
      get workHubId() { return state.workHubId; },
      setWorkHubId: (h) => { state.workHubId = h; },
      get useLoanBooster() { return state.useLoanBooster; },
      setUseLoanBooster: (v) => { state.useLoanBooster = v; },
      get deductTenantRahnInBuy() { return state.deductTenantRahnInBuy; },
      setDeductTenantRahnInBuy: (v) => { state.deductTenantRahnInBuy = v; },
      get buildingAgeSegment() { return state.buildingAgeSegment; },
      setBuildingAgeSegment: (v) => { state.buildingAgeSegment = v; },
      mapInstanceRef: { current: null },
      hasUrlBudgetParams: true,
    };
    return { state, params };
  }

  // 3 Unit tests
  test('Unit 7.1: applyUrlParamsFromLocation applies buy mode, buy budget, and sqm alongside compare=5-14', () => {
    const { state, params } = createStatefulSyncParams();
    applyUrlParamsFromLocation('/', '?compare=5-14&mode=buy&buy=12500&sqm=95', false, params);
    assert.equal(state.showCompareModal, true);
    assert.equal(state.compareId1, 5);
    assert.equal(state.compareId2, 14);
    assert.equal(state.mode, 'buy');
    assert.equal(state.buyTotalBudget, 12500);
    assert.equal(state.targetSqm, 95);
  });

  test('Unit 7.2: applyUrlParamsFromLocation applies rent mode, deposit, and monthlyRent alongside compare=5-14', () => {
    const { state, params } = createStatefulSyncParams();
    applyUrlParamsFromLocation('/', '?compare=5-14&mode=rent&dep=1400&rent=35&sqm=110', false, params);
    assert.equal(state.showCompareModal, true);
    assert.equal(state.mode, 'rent');
    assert.equal(state.deposit, 1400);
    assert.equal(state.monthlyRent, 35);
    assert.equal(state.targetSqm, 110);
  });

  test('Unit 7.3: applyUrlParamsFromLocation applies loan, rahnDeduct, age, and hub alongside compare=5-14', () => {
    const { state, params } = createStatefulSyncParams();
    applyUrlParamsFromLocation(
      '/',
      '?compare=5-14&mode=buy&buy=9500&sqm=85&hub=argentina&loan=1&rahnDeduct=1&age=older',
      false,
      params,
    );
    assert.equal(state.showCompareModal, true);
    assert.equal(state.workHubId, 'argentina');
    assert.equal(state.useLoanBooster, true);
    assert.equal(state.deductTenantRahnInBuy, true);
    assert.equal(state.buildingAgeSegment, 'older');
  });

  // 3 Integration tests
  test('Integration 7.4: parseInitialUrlParams and applyUrlParamsFromLocation agree on all budget params for compare URL', () => {
    const query = '?compare=5-14&mode=buy&dep=900&rent=25&buy=14000&sqm=105&hub=vanak';
    installMockBrowserEnvironment(query);
    const initial = parseInitialUrlParams();
    const { state, params } = createStatefulSyncParams();
    applyUrlParamsFromLocation('/', query, false, params);

    assert.equal(initial.initialShowCompare, state.showCompareModal);
    assert.equal(initial.initialCompareId1, state.compareId1);
    assert.equal(initial.initialCompareId2, state.compareId2);
    assert.equal(initial.initialMode, state.mode);
    assert.equal(initial.initialDeposit, state.deposit);
    assert.equal(initial.initialMonthlyRent, state.monthlyRent);
    assert.equal(initial.initialBuyBudget, state.buyTotalBudget);
    assert.equal(initial.initialTargetSqm, state.targetSqm);
    assert.equal(initial.initialWorkHubId, state.workHubId);
  });

  test('Integration 7.5: Multi-city compare URL (?city=karaj&compare=101-102&mode=buy&buy=6500&sqm=90) preserves city and budget', () => {
    const { state, params } = createStatefulSyncParams();
    applyUrlParamsFromLocation('/', '?city=karaj&compare=101-102&mode=buy&buy=6500&sqm=90', false, params);
    assert.equal(state.activeCity, 'karaj');
    assert.equal(state.showCompareModal, true);
    assert.equal(state.compareId1, 101);
    assert.equal(state.compareId2, 102);
    assert.equal(state.mode, 'buy');
    assert.equal(state.buyTotalBudget, 6500);
    assert.equal(state.targetSqm, 90);
  });

  test('Integration 7.6: Out-of-bounds budget parameters in compare URL are ignored safely while valid ones apply', () => {
    const { state, params } = createStatefulSyncParams();
    applyUrlParamsFromLocation('/', '?compare=5-14&mode=buy&buy=-999&sqm=99999&dep=1200', false, params);
    assert.equal(state.showCompareModal, true);
    assert.equal(state.mode, 'buy');
    assert.equal(state.buyTotalBudget, 5000); // unchanged from default
    assert.equal(state.targetSqm, 70); // unchanged from default
    assert.equal(state.deposit, 1200); // valid parameter applied
  });

  // 2 E2E tests
  test('E2E 7.7: Evaluated neighborhoods reflect the URL budget parameters from a shared compare link', () => {
    const query = '?compare=5-14&mode=buy&buy=18000&sqm=100';
    const { state, params } = createStatefulSyncParams();
    applyUrlParamsFromLocation('/', query, false, params);
    const comparedHoods = INITIAL_NEIGHBORHOODS.filter(
      (h) => h.id === state.compareId1 || h.id === state.compareId2,
    );
    const analyses = comparedHoods.map((hood) =>
      generateLocalNeighborhoodAnalysis(
        hood,
        state.mode,
        state.buyTotalBudget / state.targetSqm,
        state.targetSqm,
        null,
        'بدون فیلتر محل کار',
      ),
    );
    assert.equal(analyses.length, 2);
    assert.ok(analyses[0].budgetVerdict.length > 0);
    assert.equal(state.buyTotalBudget, 18000);
    assert.equal(state.targetSqm, 100);
  });

  test('E2E 7.8: Invalid cross-city compare URL still applies valid budget parameters without crashing', () => {
    const { state, params } = createStatefulSyncParams();
    applyUrlParamsFromLocation('/', '?compare=5-101&mode=buy&buy=11000&sqm=85', false, params);
    assert.equal(state.showCompareModal, false);
    assert.equal(state.mode, 'buy');
    assert.equal(state.buyTotalBudget, 11000);
    assert.equal(state.targetSqm, 85);
  });
});

// ============================================================================
// 8. RT-FE-BUG-008-SEARCH-HISTORY-REPLACE-STATE (8 Tests)
// ============================================================================
describe('RT-FE-BUG-008-SEARCH-HISTORY-REPLACE-STATE (8 tests)', () => {
  // 2 Unit tests
  test('Unit 8.1: syncSearchHistoryUrl calls pushState when mode="push" and URL changes', () => {
    const { mockHistory, mockLocation } = installMockBrowserEnvironment('', '/search');
    const res = syncSearchHistoryUrl(
      mockHistory,
      mockLocation.pathname,
      mockLocation.search,
      { q: 'پونک', scope: 'ALL', sort: 'RELEVANCE', viewMode: 'LIST', filters: { cityId: 'tehran' } },
      'push',
      false,
    );
    assert.equal(res.methodCalled, 'pushState');
    assert.equal(mockHistory.pushCount, 1);
    assert.equal(mockHistory.stack.length, 2);
  });

  test('Unit 8.2: syncSearchHistoryUrl calls replaceState when mode="replace" (debounced typing)', () => {
    const { mockHistory, mockLocation } = installMockBrowserEnvironment('', '/search');
    const res = syncSearchHistoryUrl(
      mockHistory,
      mockLocation.pathname,
      mockLocation.search,
      { q: 'پو', scope: 'ALL', sort: 'RELEVANCE', viewMode: 'LIST', filters: { cityId: 'tehran' } },
      'replace',
      false,
    );
    assert.equal(res.methodCalled, 'replaceState');
    assert.equal(mockHistory.pushCount, 0);
    assert.equal(mockHistory.replaceCount, 1);
    assert.equal(mockHistory.stack.length, 1);
  });

  // 3 Integration tests
  test('Integration 8.3: syncSearchHistoryUrl does not push duplicate history entry when URL is identical', () => {
    const { mockHistory, mockLocation } = installMockBrowserEnvironment('?q=%D9%BE%D9%88%D9%86%DA%A9', '/search');
    const first = syncSearchHistoryUrl(
      mockHistory,
      mockLocation.pathname,
      mockLocation.search,
      { q: 'پونک', scope: 'ALL', sort: 'RELEVANCE', viewMode: 'LIST', filters: { cityId: 'tehran' } },
      'push',
      false,
    );
    const second = syncSearchHistoryUrl(
      mockHistory,
      mockLocation.pathname,
      mockLocation.search,
      { q: 'پونک', scope: 'ALL', sort: 'RELEVANCE', viewMode: 'LIST', filters: { cityId: 'tehran' } },
      'push',
      false,
    );
    assert.equal(second.methodCalled, 'none');
    assert.ok(first.committedUrl.includes('q='));
  });

  test('Integration 8.4: syncSearchHistoryUrl skips history mutation during popstate restore (prevents Back/Forward loop)', () => {
    const { mockHistory, mockLocation } = installMockBrowserEnvironment('?q=vanak', '/search');
    const res = syncSearchHistoryUrl(
      mockHistory,
      mockLocation.pathname,
      mockLocation.search,
      { q: 'ونک', scope: 'NEIGHBORHOODS', sort: 'NEWEST', viewMode: 'SPLIT', filters: { cityId: 'tehran' } },
      'push',
      true, // isPopStateRestore = true
    );
    assert.equal(res.methodCalled, 'none');
    assert.equal(mockHistory.pushCount, 0);
    assert.equal(mockHistory.replaceCount, 0);
  });

  test('Integration 8.5: Committed scope, filter, sort, and viewMode transitions each create navigable history steps', () => {
    const { mockHistory, mockLocation } = installMockBrowserEnvironment('', '/search');

    // Step 1: Commit query "پونک"
    syncSearchHistoryUrl(
      mockHistory,
      mockLocation.pathname,
      mockLocation.search,
      { q: 'پونک', scope: 'ALL', sort: 'RELEVANCE', viewMode: 'LIST', filters: { cityId: 'tehran' } },
      'push',
      false,
    );
    // Step 2: Switch scope to PROPERTIES
    syncSearchHistoryUrl(
      mockHistory,
      mockLocation.pathname,
      mockLocation.search,
      { q: 'پونک', scope: 'PROPERTIES', sort: 'RELEVANCE', viewMode: 'LIST', filters: { cityId: 'tehran' } },
      'push',
      false,
    );
    // Step 3: Apply filter bedrooms=2 and sort=PRICE_ASC
    syncSearchHistoryUrl(
      mockHistory,
      mockLocation.pathname,
      mockLocation.search,
      { q: 'پونک', scope: 'PROPERTIES', sort: 'PRICE_ASC', viewMode: 'SPLIT', filters: { cityId: 'tehran', bedrooms: 2 } },
      'push',
      false,
    );

    assert.equal(mockHistory.stack.length, 4);
    assert.equal(mockHistory.pushCount, 3);
  });

  // 3 E2E tests
  test('E2E 8.6: Browser Back and Forward restore exact query, scope, sort, viewMode, and filters across multi-step search', () => {
    const { mockHistory, mockLocation } = installMockBrowserEnvironment('', '/search');

    // Commit 1: Query "پونک"
    syncSearchHistoryUrl(
      mockHistory,
      mockLocation.pathname,
      mockLocation.search,
      { q: 'پونک', scope: 'ALL', sort: 'RELEVANCE', viewMode: 'LIST', filters: { cityId: 'tehran' } },
      'push',
      false,
    );
    // Commit 2: Query "گیشا", scope PROPERTIES, bedrooms 3
    syncSearchHistoryUrl(
      mockHistory,
      mockLocation.pathname,
      mockLocation.search,
      { q: 'گیشا', scope: 'PROPERTIES', sort: 'PRICE_ASC', viewMode: 'MAP', filters: { cityId: 'tehran', bedrooms: 3 } },
      'push',
      false,
    );

    // Press Back -> should restore "پونک", ALL, RELEVANCE, LIST
    mockHistory.back();
    const afterBack = decodeSearchUrlState(mockLocation.search);
    assert.equal(afterBack.q, 'پونک');
    assert.equal(afterBack.scope, 'ALL');
    assert.equal(afterBack.sort, 'RELEVANCE');
    assert.equal(afterBack.viewMode, 'LIST');
    assert.equal(afterBack.filters.bedrooms, undefined);

    // Press Forward -> should restore "گیشا", PROPERTIES, PRICE_ASC, MAP, bedrooms=3
    mockHistory.forward();
    const afterForward = decodeSearchUrlState(mockLocation.search);
    assert.equal(afterForward.q, 'گیشا');
    assert.equal(afterForward.scope, 'PROPERTIES');
    assert.equal(afterForward.sort, 'PRICE_ASC');
    assert.equal(afterForward.viewMode, 'MAP');
    assert.equal(afterForward.filters.bedrooms, 3);
  });

  test('E2E 8.7: Typing transient characters uses replaceState, then pressing Enter pushes committed state', () => {
    const { mockHistory, mockLocation } = installMockBrowserEnvironment('', '/search');

    // User types "س", "سع", "سعا" (debounced replaceState)
    for (const partial of ['س', 'سع', 'سعا']) {
      syncSearchHistoryUrl(
        mockHistory,
        mockLocation.pathname,
        mockLocation.search,
        { q: partial, scope: 'ALL', sort: 'RELEVANCE', viewMode: 'LIST', filters: { cityId: 'tehran' } },
        'replace',
        false,
      );
    }
    assert.equal(mockHistory.stack.length, 1);

    // User selects autocomplete suggestion "سعادت‌آباد" (pushState)
    syncSearchHistoryUrl(
      mockHistory,
      mockLocation.pathname,
      mockLocation.search,
      { q: 'سعادت‌آباد', scope: 'NEIGHBORHOODS', sort: 'RELEVANCE', viewMode: 'LIST', filters: { cityId: 'tehran' } },
      'push',
      false,
    );
    assert.equal(mockHistory.stack.length, 2);
    assert.equal(decodeSearchUrlState(mockLocation.search).q, 'سعادت‌آباد');
  });

  test('E2E 8.8: GlobalSearchWorkspace wires syncSearchHistoryUrl, pendingHistoryModeRef, and isPopStateRestoreRef', () => {
    const wsSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/features/search/components/GlobalSearchWorkspace.tsx'),
      'utf8',
    );
    assert.ok(wsSrc.includes('syncSearchHistoryUrl'));
    assert.ok(wsSrc.includes('pendingHistoryModeRef'));
    assert.ok(wsSrc.includes('isPopStateRestoreRef'));
  });
});
