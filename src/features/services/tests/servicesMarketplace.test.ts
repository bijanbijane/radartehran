/** @file src/features/services/tests/servicesMarketplace.test.ts — Node Unit & Adversarial Tests for Stage 21 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_NEIGHBORHOODS,
  getNeighborhoodMarketReport,
  getNeighborhoodTrafficInfo,
  type EvaluatedNeighborhood,
} from '../../../data/neighborhoods';
import {
  IDENTITY_NOT_CREDENTIAL_NOTE_FA,
  PAST_RATING_DISCLAIMER_FA,
  buildServiceProvidersFromNeighborhoods,
  filterServiceProviders,
} from '../services/servicesDirectoryService';
import {
  CANONICAL_SERVICE_DEFINITIONS,
  evaluateProviderVerificationTracks,
} from '../services/serviceTaxonomyAndVerification';
import {
  assertServiceRequestOwnership,
  loadProviderReviews,
  loadServiceProposals,
  loadServiceRequests,
  reviewProviderSubmission,
  submitProviderOnboarding,
  submitServiceComplaint,
  submitServiceProposal,
  submitServiceRequest,
  submitVerifiedProviderReview,
  transitionServiceRequestStatus,
  updateServiceProposalStatus,
} from '../services/serviceWorkflowService';

function setupMemoryStorage() {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  (globalThis as Record<string, unknown>).window = { localStorage: mockStorage };
}

function getSampleHoods(): EvaluatedNeighborhood[] {
  return INITIAL_NEIGHBORHOODS.slice(0, 8).map((h, idx) => ({
    ...h,
    baseBuyPerSqm: h.buyPerSqm,
    sponsor: idx === 0 ? { ...h.sponsor, planType: 'paid_1m', expiresAtIso: new Date(Date.now() + 86400000).toISOString() } : h.sponsor,
    status: 'green',
    distKm: null,
    diffPercent: 0,
    overallScore: Number(((h.air + h.metro + h.security) / 3).toFixed(1)),
    trafficInfo: getNeighborhoodTrafficInfo(h),
    marketReport: getNeighborhoodMarketReport(h),
  }));
}

test('Stage 21 grounds real providers, distinguishes 10 canonical categories, and explicitly badges sponsored ads', () => {
  assert.equal(CANONICAL_SERVICE_DEFINITIONS.length, 10);
  const hoods = getSampleHoods();
  const providers = buildServiceProvidersFromNeighborhoods(hoods, [], []);
  assert.ok(providers.length >= 6);

  const sponsored = providers.find((p) => p.listingTier === 'sponsored_ad');
  assert.ok(sponsored);
  assert.equal(sponsored.adDisclosureLabelFa, 'نمایش تبلیغاتی');
  assert.equal(sponsored.credential.status, 'self_declared');

  for (const p of providers) {
    assert.equal(p.credential.separationNoteFa, IDENTITY_NOT_CREDENTIAL_NOTE_FA);
    assert.equal(p.credential.tracks.length, 4);
    assert.equal(p.feedback.noteFa, PAST_RATING_DISCLAIMER_FA);
  }
});

test('Stage 21 4-track verification downgrades expired licenses and prevents paid ads from inflating credentials', () => {
  const expired = evaluateProviderVerificationTracks({
    identityStatus: 'verified',
    businessStatus: 'verified',
    qualificationStatus: 'verified',
    qualificationExpiresAtIso: '2020-01-01T00:00:00.000Z',
    licenseCodeMasked: '***9821',
    listingTier: 'sponsored_ad',
  }, Date.parse('2026-06-01T00:00:00.000Z'));

  const qualTrack = expired.tracks.find((t) => t.track === 'qualification');
  assert.equal(qualTrack?.status, 'expired');
  assert.equal(expired.licenseNumber, null);
  assert.equal(expired.status, 'unverified');
});

test('Stage 21 filtering respects hideSponsored, canonical category, and Persian search normalization', () => {
  const hoods = getSampleHoods();
  const providers = buildServiceProvidersFromNeighborhoods(hoods, [], []);

  const organicOnly = filterServiceProviders(providers, {
    category: 'all',
    searchQuery: '',
    hoodId: 'all',
    onlyWithDeclaredPhone: true,
    hideSponsored: true,
  });
  assert.ok(organicOnly.every((p) => p.listingTier !== 'sponsored_ad'));

  const punakMatches = filterServiceProviders(providers, {
    category: 'all',
    searchQuery: 'پونک',
    hoodId: 'all',
    onlyWithDeclaredPhone: false,
    hideSponsored: false,
  });
  assert.ok(punakMatches.some((p) => p.identity.primaryNeighborhoodName === 'پونک'));

  const valuationMatches = filterServiceProviders(providers, {
    category: 'all',
    canonicalCategory: 'valuation',
    searchQuery: '',
    hoodId: 'all',
    onlyWithDeclaredPhone: false,
    hideSponsored: false,
  });
  assert.ok(valuationMatches.length > 0 && valuationMatches.every((p) => p.canonicalCategory === 'valuation'));

  const inspectionMatches = filterServiceProviders(providers, {
    category: 'all',
    canonicalCategory: 'inspection',
    searchQuery: '',
    hoodId: 'all',
    onlyWithDeclaredPhone: false,
    hideSponsored: false,
  });
  assert.ok(inspectionMatches.length > 0 && inspectionMatches.every((p) => p.canonicalCategory === 'inspection'));
});

test('Stage 21 request lifecycle, IDOR ownership checks, proposal acceptance, negative review preservation, and moderation work end-to-end', () => {
  setupMemoryStorage();

  const req = submitServiceRequest({
    ownerUserId: 'user-a',
    providerId: 'sp-1',
    providerName: 'دفتر حقوقی الف',
    serviceId: 'legal.contract-review',
    canonicalCategory: 'legal',
    neighborhoodName: 'سعادت‌آباد',
    requesterName: 'سارا',
    requesterPhone: '09121112233',
    projectSummary: 'بررسی مبایعه‌نامه و چک‌های صیادی پیش از امضا',
    contactConsentAccepted: true,
  });
  assert.equal(req.status, 'submitted');

  // IDOR check: user-b cannot access or transition user-a's request
  assert.equal(assertServiceRequestOwnership(req, 'user-b').allowed, false);
  assert.equal(transitionServiceRequestStatus(req.id, 'cancelled', 'user-b').ok, false);

  // Proposal submission & acceptance by owner
  const prop = submitServiceProposal({
    requestId: req.id,
    providerId: 'sp-1',
    providerName: 'دفتر حقوقی الف',
    providerVerificationSummaryFa: 'احراز خوداظهار',
    offeringTitleFa: 'بازبینی حقوقی مبایعه‌نامه',
    priceMode: 'fixed',
    priceDisplayFa: '۴ میلیون تومان مقطوع',
    estimatedAmountMillion: 4,
    timelineFa: '۲۴ ساعت',
    scopeSummaryFa: 'بازبینی کامل بندها',
    includesFa: 'گزارش کتبی اصلاحات',
    excludesFa: 'ثبت محضری',
    status: 'submitted',
  });
  assert.equal(loadServiceProposals(req.id).length, 1);

  const acceptDenied = updateServiceProposalStatus(prop.proposalId, 'accepted', 'user-b');
  assert.equal(acceptDenied.ok, false);

  const acceptOk = updateServiceProposalStatus(prop.proposalId, 'accepted', 'user-a');
  assert.equal(acceptOk.ok, true);
  assert.equal(loadServiceRequests('user-a')[0].status, 'provider_selected');

  // Complete & submit a valid NEGATIVE review — must be preserved, not hidden
  const completed = transitionServiceRequestStatus(req.id, 'completed', 'user-a');
  assert.equal(completed.ok, true);
  assert.equal(completed.request?.status, 'completed');

  const unauthReview = submitVerifiedProviderReview({
    requestId: req.id,
    reviewerUid: 'user-b',
    reviewerLabelFa: 'متقلب',
    overallScore: 1,
    qualityScore: 1,
    timelineScore: 1,
    transparencyScore: 1,
    commentFa: 'نظر غیرمعتبر از کاربر دیگر',
  });
  assert.equal(unauthReview.ok, false);

  const validNegReview = submitVerifiedProviderReview({
    requestId: req.id,
    reviewerUid: 'user-a',
    reviewerLabelFa: 'سارا',
    overallScore: 2,
    qualityScore: 2,
    timelineScore: 1,
    transparencyScore: 3,
    commentFa: 'پاسخ‌گویی با تاخیر انجام شد ولی گزارش شفاف بود.',
  });
  assert.equal(validNegReview.ok, true);
  assert.equal(loadProviderReviews('sp-1').length, 1);
  assert.equal(loadProviderReviews('sp-1')[0].status, 'published');

  // Private complaint & Provider Onboarding moderation
  const comp = submitServiceComplaint({
    providerId: 'sp-1',
    requestId: req.id,
    complainantUid: 'user-a',
    reason: 'unresponsive',
    details: 'تاخیر ۴۸ ساعته در تحویل نسخه اصلاحی',
  });
  assert.equal(comp.status, 'submitted');

  const sub = submitProviderOnboarding({
    ownerUserId: 'prov-user',
    displayName: 'مؤسسه حقوقی راد',
    entityKind: 'company',
    canonicalCategory: 'legal',
    serviceId: 'legal.contract-review',
    neighborhoodId: 1,
    neighborhoodName: 'پونک',
    zone: 'منطقه ۵',
    phone: '09123334455',
    specialtyFa: 'تنظیم قراردادهای ملکی و مشارکت در ساخت',
    pricingMode: 'fixed',
    priceDisplayFa: '۵ میلیون تومان',
    coverageScope: 'citywide',
    coveredAreaNames: ['کل تهران'],
    remoteAvailable: true,
    licenseClaimedFa: '998877',
    portfolioSummaryFa: '۱۲۰ قرارداد مسکونی',
  });
  assert.equal(sub.moderationStatus, 'pending');
  const moderated = reviewProviderSubmission(sub.submissionId, 'verified', 'تأیید مدارک');
  assert.equal(moderated[0].moderationStatus, 'verified');
});
