import assert from 'node:assert/strict';
import {
  extractVerifiedBargainPriceInDealUnit,
  normalizeIranianMobileNumber,
  validateDataCorrectionSubmission,
} from '../src/utils/buyerAlertsAndCommunityTrust';
import {
  normalizePersianSearchText,
  compactPersianSearchKey,
  tokenizePersianSearchQuery,
} from '../src/utils/persianSearchAndPersonalWorkspace';
import {
  resolvePhysicalPropertyAndListingIdentity,
  applyOptimisticListingUpdate,
  computeListingFieldDiffs,
  restoreListingFromHistoricalRevision,
  executeAuthorizedOwnershipTransfer,
  evaluateAddressCoordinateConsistency,
  resolveCityScopedGazetteerQuery,
  buildPrivacySafeAnalyticsEvent,
  computeStandardizedOperationalKpis,
  type PublishedListingOfferRecord,
} from '../src/utils/propertyDomainGeospatialAndAnalyticsGovernance';
import {
  buildRadarContentSecurityPolicy,
  evaluateCsrfProtection,
  validateOutboundUrlAgainstSsrf,
  sanitizeNavigationRedirectTarget,
  filterAllowedMutationFields,
  evaluateFirestoreRuleAccessMatrix,
  projectPublicListingDto,
  buildSafeContentDispositionHeader,
  scanTextForAccidentalSecretExposure,
} from '../src/utils/advancedAppSecAndSupplyChainGovernance';
import {
  executeMarketIngestionStagingBatch,
  evaluateMetricSamplePublicationGate,
  computeSearchFacetCounts,
  rankSearchCandidatesWithExplainability,
  enqueueTransientToast,
} from '../src/utils/marketPipelineDesignSystemAndUiStateGovernance';
import {
  downsampleTimeSeriesPreservingExtrema,
  segmentTimeSeriesAcrossGaps,
  evaluateExternalSourceFreshness,
  computeScopedContentSha256Identity,
  shouldExecuteKeyboardShortcut,
} from '../src/utils/timeSeriesLicensingAndBrowserLifecycleGovernance';
import {
  calculateRentalPropertyYield,
  analyzePropertyInvestmentCashFlow,
  calculatePurchaseAffordabilityBudget,
  compareRentVersusBuyScenarios,
  runInvestmentSensitivityGrid,
  calculateNetPresentValueAndIrr,
  modelPropertyAppreciationScenarios,
  calculateTransactionAndRenovationBudget,
  calculateInvestmentBreakEvenPeriod,
  computePublisherAnalyticsAndComparePeriods,
  inspectListingContentAndMediaQuality,
} from '../src/utils/realEstateFinancialCalculatorsAndPublisherAnalytics';

async function runBundles90To109Verification() {
  console.log('Running Bundles 90–109 (Prompts 751–1138) Verification Suite...');

  // 1. Bundles 90–104: Buyer Alerts, Community Trust & Persian Search
  const parsedPrice = extractVerifiedBargainPriceInDealUnit(
    {
      id: 'b1',
      title: '۸۵ متر اکازیون',
      type: 'خرید',
      sqm: 85,
      priceText: '۸۵ متر، متری ۹۲ میلیون تومان',
      discountPercent: 12,
      buyerProfitText: '۴۰۰ میلیون',
      street: 'بلوار کاج',
    },
    'خرید'
  );
  assert.equal(parsedPrice.price, 92);
  assert.equal(parsedPrice.isDirectObservation, true);

  assert.equal(normalizeIranianMobileNumber('+98 912 345 6789').normalizedPhone, '09123456789');
  const corrCheck = validateDataCorrectionSubmission({
    cityId: 'tehran',
    hoodId: 1,
    hoodName: 'زعفرانیه',
    field: 'buyPerSqm',
    currentDisplayedValue: 200,
    rawProposedValue: '۲۱۰',
    reasonFa: 'افزایش قیمت معاملات اخیر در زعفرانیه',
  });
  assert.equal(corrCheck.valid, true);
  assert.equal(corrCheck.normalizedProposedValue, 210);

  assert.equal(normalizePersianSearchText('  سَعادت‌آباد ۱۲۳ '), 'سعادت اباد 123');
  assert.equal(compactPersianSearchKey('امیر آباد'), compactPersianSearchKey('امیرآباد'));
  assert.deepEqual(tokenizePersianSearchQuery('سعادت‌آباد ۲ خواب'), ['سعادت', 'اباد', '2', 'خواب']);

  // 2. Bundle 105: Canonical Property vs Listing Identity, OCC, Geospatial & KPIs
  const ids = resolvePhysicalPropertyAndListingIdentity({
    cityId: 'tehran',
    hoodId: 1,
    street: 'خیابان مقدس اردبیلی',
    sqm: 110,
    postalCode: '1987654321',
    publisherId: 'pub-1',
    transactionType: 'buy',
  });
  assert.equal(ids.isExactPropertyIdentity, true);

  const initialOffer: PublishedListingOfferRecord = {
    listingId: ids.listingId,
    propertyId: ids.propertyId,
    publisherId: 'pub-1',
    transactionType: 'buy',
    title: 'آپارتمان ۱۱۰ متری',
    priceMillion: 12_000,
    sqm: 110,
    street: 'خیابان مقدس اردبیلی',
    status: 'published',
    revisionNumber: 1,
    updatedAtIso: '2026-01-01T00:00:00Z',
  };

  const occConflict = applyOptimisticListingUpdate(
    initialOffer,
    99,
    { priceMillion: 13_000 },
    'pub-1',
    'op-1'
  );
  assert.equal(occConflict.ok, false);

  const occOk = applyOptimisticListingUpdate(
    initialOffer,
    1,
    { priceMillion: 13_000 },
    'pub-1',
    'op-2'
  );
  assert.equal(occOk.ok, true);
  assert.equal(occOk.updated?.revisionNumber, 2);

  const diffs = computeListingFieldDiffs(initialOffer, occOk.updated!);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].field, 'priceMillion');

  const restored = restoreListingFromHistoricalRevision(
    occOk.updated!,
    2,
    occOk.revision!,
    'pub-1'
  );
  assert.equal(restored.ok, true);

  const trf = executeAuthorizedOwnershipTransfer(
    initialOffer,
    1,
    'pub-1',
    'publisher',
    'pub-2',
    true
  );
  assert.equal(trf.ok, true);
  assert.equal(trf.updatedListing?.publisherId, 'pub-2');

  const geoCheck = evaluateAddressCoordinateConsistency({
    cityId: 'tehran',
    declaredHoodId: 1,
    declaredStreet: 'زعفرانیه',
    lat: 35.805,
    lng: 51.415,
  });
  assert.equal(geoCheck.validCoordinates, true);
  assert.equal(geoCheck.matchesCityBounds, true);

  const gaz = resolveCityScopedGazetteerQuery('زعفرانیه', 'tehran');
  assert.equal(gaz.resolutionStatus, 'exact_canonical');

  const evt = buildPrivacySafeAnalyticsEvent(
    'search_executed',
    'sess-1',
    { city: 'tehran', phone: '09120000000' },
    true,
    true
  );
  assert.ok(evt);
  assert.equal('phone' in evt.properties, false);

  const kpis = computeStandardizedOperationalKpis([initialOffer], 5);
  assert.equal(kpis.activePublishedListings, 1);
  assert.equal(kpis.uniquePhysicalProperties, 1);

  // 3. Bundle 106: CSP, CSRF, SSRF, Mass Assignment, Firestore Rules & Secret Scanner
  const csp = buildRadarContentSecurityPolicy({ isDev: false });
  assert.ok(csp.headerValue.includes("default-src 'self'"));
  assert.ok(csp.headerValue.includes("object-src 'none'"));

  assert.equal(
    evaluateCsrfProtection({
      method: 'POST',
      hasSessionCookie: true,
      hasExplicitBearerToken: false,
      originHeader: 'https://radar.example.com',
      allowedOrigins: ['https://radar.example.com'],
      csrfTokenHeader: 'tok-123456',
      expectedCsrfToken: 'tok-123456',
    }).allowed,
    true
  );

  assert.equal(
    validateOutboundUrlAgainstSsrf('http://169.254.169.254/latest/meta-data/').allowed,
    false
  );
  assert.equal(sanitizeNavigationRedirectTarget('//evil.example.com/phish').safeTarget, '/');

  const safeBody = filterAllowedMutationFields(
    { title: 'آپارتمان', role: 'admin', isAdmin: true },
    ['title']
  );
  assert.deepEqual(safeBody.sanitizedPatch, { title: 'آپارتمان' });
  assert.deepEqual(safeBody.rejectedProtectedFields, ['role', 'isAdmin']);

  assert.equal(
    evaluateFirestoreRuleAccessMatrix({
      collection: 'bargains',
      operation: 'update',
      actorUid: 'attacker',
      actorEmailVerified: true,
      isAdmin: false,
      resourceOwnerUid: 'owner-1',
    }).allowed,
    false
  );

  const pubDto = projectPublicListingDto({
    id: 'l1',
    hoodId: 1,
    title: 'مسکونی',
    type: 'خرید',
    sqm: 90,
    priceText: '۱۰ میلیارد',
    discountPercent: 10,
    street: 'ونک',
    ownerPhonePrivate: '09120000000',
  });
  assert.equal('ownerPhonePrivate' in pubDto, false);
  assert.ok(
    buildSafeContentDispositionHeader('report"evil.pdf', 'attachment', 'application/pdf')
      .contentDisposition.includes('attachment;')
  );
  assert.equal(
    scanTextForAccidentalSecretExposure('GEMINI_API_KEY="AIzaSySecretKey1234567890"').hasExposedSecrets,
    true
  );

  // 4. Bundle 107: Market Staging, Sample Sufficiency, Facets, Ranking & Toast Queue
  const batch = executeMarketIngestionStagingBatch('b-1', [
    {
      sourceId: 'src-1',
      sourceRecordId: 'rec-1',
      observedAtIso: new Date().toISOString(),
      cityId: 'tehran',
      hoodId: 1,
      transactionType: 'buy',
      buyPerSqmMillion: 99999,
      rawPayload: {},
    },
  ]);
  assert.equal(batch.quarantinedRecords.length, 1);

  const sampleGate = evaluateMetricSamplePublicationGate(2, 'median_price');
  assert.equal(sampleGate.canPublishAsRepresentativeBenchmark, false);

  const facets = computeSearchFacetCounts([
    { status: 'green', hasBargains: true, highMetro: true },
    { status: 'yellow', hasBargains: false, highMetro: false },
  ]);
  assert.equal(facets.totalMatching, 2);
  assert.equal(facets.withBargainsCount, 1);

  const ranked = rankSearchCandidatesWithExplainability(
    [
      { id: 1, name: 'ونک', buyPerSqm: 150, overallScore: 8, budgetMatchRatio: 0.9 },
      { id: 2, name: 'پونک', buyPerSqm: 110, overallScore: 9, budgetMatchRatio: 1.0 },
    ],
    'relevance'
  );
  assert.equal(ranked[0].item.id, 2);

  const toasts = enqueueTransientToast([], {
    id: 't1',
    dedupeKey: 'save',
    severity: 'success',
    messageFa: 'ذخیره شد',
  });
  const toastsDeduped = enqueueTransientToast(toasts, {
    id: 't2',
    dedupeKey: 'save',
    severity: 'success',
    messageFa: 'ذخیره شد',
  });
  assert.equal(toastsDeduped.length, 1);

  // 5. Bundle 108: Time-Series Downsampling, Gap Segmentation, Freshness & Shortcuts
  const rawSeries = Array.from({ length: 50 }, (_, idx) => ({
    timestampIso: `2026-01-${String((idx % 28) + 1).padStart(2, '0')}`,
    labelFa: `روز ${idx + 1}`,
    value: idx === 25 ? 9999 : idx === 10 ? null : 100 + idx,
    status: (idx === 10 ? 'missing_no_observation' : 'observed') as
      | 'observed'
      | 'missing_no_observation',
  }));
  const downsampled = downsampleTimeSeriesPreservingExtrema(rawSeries, 12);
  assert.ok(downsampled.some((p) => p.value === 9999));
  assert.ok(downsampled.some((p) => p.value === null));

  const segs = segmentTimeSeriesAcrossGaps(rawSeries, 0);
  assert.equal(segs.hasBrokenGaps, true);

  const freshness = evaluateExternalSourceFreshness({
    sourceType: 'weather',
    lastObservedAtMs: Date.parse('2026-01-01T00:00:00Z'),
    lastFetchedAtMs: Date.parse('2026-01-01T00:00:00Z'),
    nowMs: Date.parse('2026-01-01T05:00:00Z'),
  });
  assert.equal(freshness.freshnessState, 'stale');

  const sha = computeScopedContentSha256Identity('user-1', 'account', Buffer.from('test-image'));
  assert.ok(sha.scopedDedupeKey.startsWith('dedupe:account:user-1:'));

  assert.equal(
    shouldExecuteKeyboardShortcut({
      key: 'k',
      activeElementTagName: 'INPUT',
      isContentEditable: false,
      hasOpenModal: false,
      shortcutAllowedInModal: false,
    }),
    false
  );

  // 6. Bundle 109: Rental Yield, Cash Flow, Affordability, Rent-vs-Buy, Sensitivity, NPV/IRR & Publisher Analytics
  const yieldRes = calculateRentalPropertyYield({
    acquisitionPrice: 10_000_000_000,
    monthlyRentIncome: 50_000_000,
    acquisitionExpenses: 200_000_000,
    annualOperatingExpenses: 60_000_000,
    vacancyRatePercent: 5,
  });
  assert.equal(yieldRes.valid, true);
  assert.equal(yieldRes.grossRentalYieldPercent, 6);
  assert.ok(yieldRes.netRentalYieldPercent > 4.9 && yieldRes.netRentalYieldPercent < 5.1);

  const cfRes = analyzePropertyInvestmentCashFlow({
    initialCapitalOutlay: 1_000_000_000,
    periodicGrossIncome: 300_000_000,
    vacancyRatePercent: 0,
    periodicOperatingExpenses: 50_000_000,
    periodsCount: 5,
  });
  assert.equal(cfRes.rows.length, 5);
  assert.equal(cfRes.endingCumulativeCashFlow, 250_000_000);

  const afford = calculatePurchaseAffordabilityBudget({
    availableCashCapital: 5_000_000_000,
    reserveBufferCash: 200_000_000,
    maxLoanAmount: 1_000_000_000,
    transactionCostPercent: 2,
  });
  assert.equal(afford.valid, true);
  assert.ok(afford.maxAffordablePropertyPrice > 5_600_000_000);

  const rvb = compareRentVersusBuyScenarios({
    horizonYears: 5,
    buyPropertyPrice: 10_000_000_000,
    buyAcquisitionCostPercent: 2,
    buyAnnualMaintenanceCost: 20_000_000,
    buyAssumedAnnualAppreciationPercent: 15,
    rentInitialDepositRahn: 1_000_000_000,
    rentInitialMonthlyPayment: 30_000_000,
    rentAssumedAnnualIncreasePercent: 20,
  });
  assert.ok(rvb.buyHypotheticalResaleValue > 10_000_000_000);

  const sensGrid = runInvestmentSensitivityGrid(
    { acquisitionPrice: 10_000_000_000, monthlyRentIncome: 50_000_000, vacancyRatePercent: 5 },
    [-10, 0, 10],
    [0, 5, 10]
  );
  assert.equal(sensGrid.length, 9);
  assert.equal(sensGrid.some((c) => c.isBaseline), true);

  const tvm = calculateNetPresentValueAndIrr([-1000, 400, 400, 400, 400], 10);
  assert.equal(tvm.irrStatus, 'converged');
  assert.ok(tvm.irrPercent !== null && tvm.irrPercent > 21 && tvm.irrPercent < 22);
  assert.ok(tvm.npv > 260);

  const appModel = modelPropertyAppreciationScenarios({
    initialPropertyValue: 10_000_000_000,
    horizonYears: 3,
    annualGrowthRatePercent: 10,
    mode: 'compound',
  });
  assert.equal(appModel.isHypotheticalScenario, true);
  assert.equal(appModel.projectedNominalValue, 13_310_000_000);

  const txReno = calculateTransactionAndRenovationBudget({
    propertyPrice: 10_000_000_000,
    agencyFeePercent: 0.25,
    vatOnAgencyPercent: 10,
    transferTaxPercent: 0.5,
    notaryFixedFee: 5_000_000,
    renovationItems: [{ category: 'نقاشی و کفپوش', areaOrQty: 100, unitCost: 2_000_000 }],
    contingencyPercent: 10,
  });
  assert.equal(txReno.totalRenovationBudget, 220_000_000);

  const breakEven = calculateInvestmentBreakEvenPeriod(1000, [300, 300, 300, 300]);
  assert.equal(breakEven.status, 'reached');
  assert.equal(breakEven.breakEvenPeriodIndex, 4);

  const pubPerf = computePublisherAnalyticsAndComparePeriods({
    currentPeriodViews: 100,
    currentPeriodUniqueViewers: 80,
    currentPeriodInquiries: 5,
    previousPeriodViews: 50,
    previousPeriodInquiries: 2,
    inquiryTimestamps: [
      { createdAtMs: 0, firstRespondedAtMs: 600_000 },
      { createdAtMs: 0, firstRespondedAtMs: null },
    ],
  });
  assert.equal(pubPerf.conversionRatePercent, 5);
  assert.equal(pubPerf.medianFirstResponseMinutes, 10);
  assert.equal(pubPerf.unansweredCount, 1);

  const quality = inspectListingContentAndMediaQuality({
    title: 'آپارتمان ۱۱۰ متری سعادت‌آباد',
    description: 'آپارتمان بسیار خوش‌نقشه، نورگیر عالی از جنوب و شمال، دارای پارکینگ و انباری سندی.',
    price: 12_500_000_000,
    areaSqm: 110,
    neighborhoodId: 'saadat-abad',
    mediaItems: [
      { id: 'img-1', width: 640, height: 480, fileSizeBytes: 80_000 },
      { id: 'img-2', width: 1920, height: 1080, fileSizeBytes: 350_000, isCover: true },
    ],
  });
  assert.equal(quality.readyForPublication, true);
  assert.equal(quality.primaryCoverMediaId, 'img-2');
  assert.deepEqual(quality.lowResolutionMediaIds, ['img-1']);

  console.log('All Bundles 90–109 (Prompts 751–1138) checks passed!');
}

runBundles90To109Verification().catch((err) => {
  console.error(err);
  process.exit(1);
});
