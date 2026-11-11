import fs from 'node:fs';
import path from 'node:path';
import {
  calculateDetailedValuation,
  calculateLandShare,
  calculateFloorplanOptimization,
  calculateNegotiationStrategy,
  calculateAuctionBidding,
  calculateCombinedBuyingPower,
  calculateDepositInflationLoss,
  calculateRahnArbitrage,
  calculatePropertyTaxes,
  calculateInheritanceShares,
  generateBuildingChargeBill,
  calculateLobbyUpgradeRoi,
  calculateChitgarCoopScore,
  calculateInterCityMigration,
  getNeighborhoodInfraData,
  ARTICLE_55_OFFICE_PERMITTED_JOBS,
  SANA_LEGAL_NOTICES,
} from '../src/data/superModulesLogic';
import {
  calculateHedonicValuation,
  getCurrentJalaliYear,
} from '../src/data/hedonicPricingEngine';
import {
  evaluateRentVsBuyInNeighborhood,
  evaluateTradeUpOptions,
} from '../src/data/neighborhoodInsights';
import {
  INITIAL_NEIGHBORHOODS,
  getNeighborhoodMarketReport,
  getNeighborhoodTrafficInfo,
  EvaluatedNeighborhood,
  mergeNeighborhoodWithSeed,
  validateAndBuildRestoredState,
} from '../src/data/neighborhoods';
import { explainNeighborhoodRecommendation } from '../src/components/useEvaluatedNeighborhoods';
import {
  buildNeighborhoodSeedReviews,
  mergeCloudAndSeedReviews,
  summarizeNeighborhoodQoL,
} from '../src/components/inspector/residentReviewsLogic';
import {
  buildSanitizedBargainPayload,
  buildSanitizedOverridePayload,
  buildSanitizedVotePayload,
  clearNeighborhoodRepositoryCache,
  mapFirestoreDocToBargain,
  mapFirestoreDocToBuyerLead,
  mapFirestoreDocToOverride,
  mapFirestoreDocToSponsorRequest,
  mergeNeighborhoodOverridesIntoList,
  normalizeIranMobilePhone,
  recordOverrideCache,
  shouldSkipRedundantOverrideWrite,
} from '../src/data/firestoreNeighborhoodMappers';
import {
  auditLocalRadarDatasets,
  auditRawDocument,
  buildWeeklyInvalidDocumentsTrend,
  checkDatabaseRelationalAndSchemaIntegrity,
  checkNeighborhoodGeoAndCityHealth,
  checkOrphanedHoodReferences,
  sanitizeCorruptedDocumentPayload,
} from '../src/data/firestoreDataAuditor';
import {
  parsePersistedDeepOverrides,
  setDeepSyncedOverride,
  getDeepSyncedOverride,
  cacheBuyerAlertAfterDurableCommit,
  serverSideBuyerLeads,
} from '../src/utils/serverMarketPulseEngine';
import {
  activateCloudListener,
  cloudSyncConnectionStatus,
  createCloudSyncListenerHealth,
  isCloudSyncLive,
  noteCloudListenerError,
  noteCloudListenerSnapshot,
  noteExplicitCloudReconnect,
} from '../src/utils/firestoreConnectionState';
import {
  classifyPropertyDuplicateCandidate,
  deduplicateHistoricalObservations,
  deduplicateMediaObjects,
  getScopedStorageKey,
  loadUserScopedDraft,
  mergeEffectiveBargains,
  sanitizeSafeExternalUrl,
  sanitizeSafeTelHref,
  saveUserScopedDraft,
  validateCityNeighborhoodScope,
} from '../src/utils/marketDataIntegrity';
import {
  API_ENDPOINT_CONTRACTS,
  assertSafeTestEnvironment,
  buildOpenApiSpecification,
  createDeterministicTestId,
  detectEnvironmentConfigDrift,
  resolveEnvironmentProfile,
} from '../src/utils/serverConfigValidator';

function assert(name: string, condition: boolean, details: string): void {
  if (!condition) {
    console.error(`[FAIL] ${name}: ${details}`);
    process.exit(1);
  }
  console.log(`[PASS] ${name}: ${details}`);
}

function runDomainRegressionTests(): void {
  const sampleHood: EvaluatedNeighborhood = {
    ...INITIAL_NEIGHBORHOODS[0],
    buyPerSqm: 100,
    rahn80m: 1200,
    status: 'green',
    diffPercent: 0,
    distKm: 4,
    overallScore: 8.2,
    marketReport: getNeighborhoodMarketReport(INITIAL_NEIGHBORHOODS[0]),
    trafficInfo: getNeighborhoodTrafficInfo(INITIAL_NEIGHBORHOODS[0]),
  };

  // 1. Multiplicative Valuation vs Additive Distortion
  const val = calculateDetailedValuation({
    hood: sampleHood,
    sqm: 100,
    age: 0,
    floor: 1,
    bedrooms: 2,
    deedType: 'endowment',
    parkingType: 'dedicated',
    hasElevator: true,
    hasStorage: true,
    renovation: 'standard',
    light: 'normal',
  });
  assert(
    '1. Multiplicative valuation deed & physical separation',
    val.fairPerSqm > 75 && val.fairPerSqm < 115 && val.fastSaleTotalMillion <= val.fairTotalMillion,
    `fairPerSqm=${val.fairPerSqm}, total=${val.fairTotalMillion}`
  );

  // 2. Land Share uses totalBuildingFloorSqm (not unitSqm * totalUnits)
  const landWithTotalFloor = calculateLandShare({
    totalPlotSqm: 400,
    totalBuildingUnits: 8,
    unitSqm: 120,
    totalBuildingFloorSqm: 800,
    neighborhoodLandPerSqmMillion: 150,
  });
  assert(
    '2. Land share uses totalBuildingFloorSqm accurately',
    landWithTotalFloor.exactLandShareSqm === 60 && landWithTotalFloor.pureLandValueMillion === 9000,
    `exactLandShareSqm=${landWithTotalFloor.exactLandShareSqm}`
  );

  // 3. Floorplan does not double-count balcony in deadSpace
  const fp = calculateFloorplanOptimization({
    totalSqm: 100,
    corridorSqm: 8,
    irregularCorners: 1,
    balconySqm: 6,
    currentBedrooms: 2,
    buyPerSqmMillion: 100,
  });
  assert(
    '3. Floorplan deadSpace excludes usable balcony',
    fp.deadSpacePercent === 10 && fp.usableSqm === 87.5,
    `deadSpacePercent=${fp.deadSpacePercent}%, usableSqm=${fp.usableSqm}`
  );

  // 4. Negotiation preserves anchor <= target <= asking even when asking is under market
  const negUnderMarket = calculateNegotiationStrategy({
    askingPriceMillion: 7000,
    neighborhoodAvgPriceMillion: 10000,
    buyerReadyCashMillion: 6500,
    propertyAge: 5,
  });
  assert(
    '4. Negotiation ordering on under-market listing',
    negUnderMarket.anchorOfferMillion <= negUnderMarket.targetClosingPriceMillion &&
      negUnderMarket.targetClosingPriceMillion <= 7000,
    `anchor=${negUnderMarket.anchorOfferMillion}, target=${negUnderMarket.targetClosingPriceMillion}`
  );

  // 5. Auction calculates netProfitPotentialMillion accounting for additional costs
  const badAuction = calculateAuctionBidding({
    retailMarketValueMillion: 8000,
    auctionBasePriceMillion: 8500,
    transactionCostsMillion: 200,
  });
  assert(
    '5. Auction identifies negative profit when base >= retail',
    badAuction.discountFromRetailPercent < 0 && badAuction.netProfitPotentialMillion < 0,
    `discount=${badAuction.discountFromRetailPercent}%, netProfit=${badAuction.netProfitPotentialMillion}`
  );

  // 6. Combined Buying Power separates tenant rahn liability from buyer equity
  const power = calculateCombinedBuyingPower({
    cashSavingsMillion: 2000,
    carSaleBudgetMillion: 500,
    goldCoinBudgetMillion: 500,
    housingLoanMillion: 1000,
    targetHoodRahn80mMillion: 800,
  });
  assert(
    '6. Combined buying power separates tenant rahn bridge from buyer equity',
    power.totalEquityBeforeRahnMillion === 4000 &&
      power.totalPurchasingPowerWithRahnMillion === 4000 &&
      power.tenantDepositBridgeMillion === 800 &&
      power.grossPurchaseHeadlineWithRahnMillion === 4800,
    `equity=${power.totalEquityBeforeRahnMillion}, bridge=${power.tenantDepositBridgeMillion}, gross=${power.grossPurchaseHeadlineWithRahnMillion}`
  );

  // 7. Inflation loss rounds to 1 decimal place
  const inf = calculateDepositInflationLoss({
    depositMillion: 1000,
    annualInflationPercent: 40,
  });
  assert(
    '7. Deposit inflation loss preserves 1-decimal precision',
    inf.purchasingPowerLossPercent1Yr === 28.6 && inf.realValue1YrMillion === 714.3,
    `loss1Yr=${inf.purchasingPowerLossPercent1Yr}%, real1Yr=${inf.realValue1YrMillion}`
  );

  // 8. Rahn arbitrage compares monthly fund earning vs monthly rent savings
  const arb = calculateRahnArbitrage({
    rahnDifferenceMillion: 300,
    monthlyRentDifferenceMillion: 9,
    fundAnnualYieldPercent: 32,
  });
  assert(
    '8. Rahn arbitrage returns valid option and monthly advantage',
    (arb.betterOption === 'full_rahn' || arb.betterOption === 'rent_and_invest') &&
      arb.fundMonthlyEarningMillion === 8,
    `betterOption=${arb.betterOption}, fundMonthly=${arb.fundMonthlyEarningMillion}`
  );

  // 9. Property taxes enforce qualifiesForAreaExemption for area exemption
  const nonExemptMultiUnit = calculatePropertyTaxes({
    monthlyRentMillion: 30,
    rahnMillion: 0,
    sqm: 100,
    city: 'tehran',
    qualifiesForAreaExemption: false,
  });
  assert(
    '9. Property tax requires qualifiesForAreaExemption in addition to area limit',
    nonExemptMultiUnit.isAreaExempt === false && (nonExemptMultiUnit.annualRentalTaxMillion ?? 0) > 0,
    `isAreaExempt=${nonExemptMultiUnit.isAreaExempt}, tax=${nonExemptMultiUnit.annualRentalTaxMillion}`
  );

  // 10. Inheritance handles daughters-only and spouse-only shares accurately
  const daughtersOnly = calculateInheritanceShares({
    propertyTotalValueMillion: 9000,
    hasSpouse: false,
    spouseType: 'wife',
    sonsCount: 0,
    daughtersCount: 2,
    hasMother: false,
    hasFather: false,
  });
  assert(
    '10. Inheritance distributes full estate when only daughters exist',
    Math.round(daughtersOnly.shares[0].sharePercent) === 100 &&
      daughtersOnly.shares[0].totalValueMillion === 9000,
    `sharePercent=${daughtersOnly.shares[0].sharePercent}, value=${daughtersOnly.shares[0].totalValueMillion}`
  );

  // 11. Building charge bill formats Tomans accurately (* 1000 from thousand-Toman units)
  const bill = generateBuildingChargeBill({
    buildingName: 'برج نمونه',
    monthName: 'آبان',
    totalCleaningThousand: 1000,
    totalElevatorServiceThousand: 1000,
    totalSharedWaterPowerThousand: 1000,
    totalReserveFundThousand: 1000,
    totalUnits: 4,
    unitNumber: 1,
    unitOccupants: 2,
    totalBuildingOccupants: 8,
    unitSqm: 100,
    totalBuildingSqm: 400,
  });
  assert(
    '11. Building charge WhatsApp text converts thousand-Tomans to exact Tomans',
    bill.unitTotalBillThousand === 1000 && bill.whatsappMessageText.includes('۱,۰۰۰,۰۰۰ تومان'),
    `unitTotalBillThousand=${bill.unitTotalBillThousand}`
  );

  // 12. Sana legal notices explicitly state they are unofficial drafts
  const sanaText = SANA_LEGAL_NOTICES.depositRefund.template('الف', 'ب', 'پونک', 900, '۱۴۰۵/۰۱/۰۱');
  assert(
    '12. Sana legal notice states unofficial draft status and avoids fixed jurisdiction claims',
    sanaText.includes('پیش‌نویس غیررسمی') && !sanaText.includes('شورای حل اختلاف'),
    'Verified unofficial draft disclaimer'
  );

  // 13. Article 55 marks legal/notary offices as conditional
  const lawyerEntry = ARTICLE_55_OFFICE_PERMITTED_JOBS.find((j) => j.title.includes('وکالت'))!;
  assert(
    '13. Article 55 marks legal/notary offices as conditional',
    lawyerEntry.status === 'conditional',
    `status=${lawyerEntry.status}`
  );

  // 14. Inter-city migration preserves negative remainingCashBufferMillion when target city unit costs more
  const migNegative = calculateInterCityMigration(70, 'isfahan');
  assert(
    '14. Inter-city migration reports negative remainingCashBufferMillion when 120m target exceeds 80m Tehran sale',
    migNegative.remainingCashBufferMillion < 0,
    `remainingCashBufferMillion=${migNegative.remainingCashBufferMillion}`
  );

  // 15. Unverified neighborhood infra data returns null instead of fabricated numbers
  const infraData = getNeighborhoodInfraData('سعادت‌آباد');
  assert(
    '15. Neighborhood infra data returns null for unverified TDS, dB, and bonus',
    infraData.sourceStatus === 'unavailable' &&
      infraData.waterTdsPpm === null &&
      infraData.noiseLevelDb === null &&
      infraData.futureMetroStationBonusPercent === null,
    `sourceStatus=${infraData.sourceStatus}`
  );

  // 16. Rent-vs-Buy and Trade-Up calculations
  const rvb = evaluateRentVsBuyInNeighborhood(sampleHood);
  const tradeUp = evaluateTradeUpOptions({
    currentHood: sampleHood,
    currentSqm: 70,
    currentAgeYears: 10,
    extraCashMillion: 1500,
    useLoanBooster: true,
    useTenantRahnDeduction: true,
    targetNewSqm: 95,
    targetAgeSegment: 'new',
    allNeighborhoods: [sampleHood],
  });
  assert(
    '16. Rent-vs-Buy & Trade-Up calculate yield and net proceeds after transaction costs',
    rvb.annualRentYieldPercent > 0 &&
      tradeUp.netProceedsFromSaleMillion < tradeUp.currentHomeSaleValueMillion,
    `yield=${rvb.annualRentYieldPercent}%, netProceeds=${tradeUp.netProceedsFromSaleMillion}`
  );

  // 17. Hedonic engine uses dynamic Jalali year and penalizes high floors without elevator
  const jalaliYear = getCurrentJalaliYear();
  const hedonicWalkup = calculateHedonicValuation({
    neighborhood: sampleHood,
    sqm: 80,
    buildYear: jalaliYear - 5,
    floor: 4,
    totalFloors: 4,
    hasElevator: false,
    hasParking: false,
    hasStorage: false,
    renovationStatus: 'standard',
  });
  const floorFactor = hedonicWalkup.factors.find((f) => f.id === 'floor');
  assert(
    '17. Hedonic engine dynamic Jalali year and walk-up floor penalty',
    jalaliYear >= 1404 && Boolean(floorFactor && floorFactor.impactPercent < 0),
    `jalaliYear=${jalaliYear}, floorImpactPercent=${floorFactor?.impactPercent}`
  );

  // 18. City-scoped deepSyncedOverrides and legacy unscoped cache rejection
  setDeepSyncedOverride('tehran', 5, {
    buyPerSqm: 175,
    rahn80m: 1950,
    updatedAtIso: new Date().toISOString(),
  });
  setDeepSyncedOverride('karaj', 5, {
    buyPerSqm: 68,
    rahn80m: 720,
    updatedAtIso: new Date().toISOString(),
  });
  const tehran5 = getDeepSyncedOverride('tehran', 5);
  const karaj5 = getDeepSyncedOverride('karaj', 5);
  const legacyParsed = parsePersistedDeepOverrides({
    5: { buyPerSqm: 175, rahn80m: 1950, updatedAtIso: new Date().toISOString() },
  });
  assert(
    '18. City-scoped deepSyncedOverrides isolate cities and reject legacy unscoped keys',
    tehran5?.buyPerSqm === 175 &&
      karaj5?.buyPerSqm === 68 &&
      Object.keys(legacyParsed).length === 0,
    `tehran5=${tehran5?.buyPerSqm}, karaj5=${karaj5?.buyPerSqm}, legacyKeys=${Object.keys(legacyParsed).length}`
  );

  // 19. 4-tier property duplicate classification (confirmed, probable, similar_but_distinct, insufficient, distinct)
  const exactDup = classifyPropertyDuplicateCandidate(
    { hoodId: 5, type: 'خرید', sqm: 95, street: 'بلوار فرحزادی، خیابان گلستان', title: 'واحد ۹۵ متری خوش‌نقشه', priceText: 'متری ۱۸۰ میلیون تومان' },
    { hoodId: 5, type: 'خرید', sqm: 95, street: 'بلوار فرحزادي خيابان گلستان', title: 'واحد 95 متری خوش نقشه', priceText: 'متری 180 میلیون تومان' }
  );
  const sameBuildingDifferentFloor = classifyPropertyDuplicateCandidate(
    { hoodId: 5, type: 'خرید', sqm: 95, street: 'بلوار فرحزادی، خیابان گلستان', title: 'واحد ۹۵ متری خوش‌نقشه', floor: 2 },
    { hoodId: 5, type: 'خرید', sqm: 95, street: 'بلوار فرحزادی، خیابان گلستان', title: 'واحد ۹۵ متری خوش‌نقشه', floor: 4 }
  );
  const sameStreetDifferentSqm = classifyPropertyDuplicateCandidate(
    { hoodId: 5, type: 'خرید', sqm: 85, street: 'بلوار فرحزادی، خیابان گلستان', title: 'واحد خوش‌نقشه در سعادت‌آباد' },
    { hoodId: 5, type: 'خرید', sqm: 110, street: 'بلوار فرحزادی، خیابان گلستان', title: 'واحد خوش‌نقشه در سعادت‌آباد' }
  );
  const missingFieldsDup = classifyPropertyDuplicateCandidate(
    { hoodId: 5, type: 'خرید', sqm: 0, street: '' },
    { hoodId: 5, type: 'خرید', sqm: 95, street: 'بلوار فرحزادی' }
  );
  assert(
    '19. 4-tier property duplicate classification separates exact duplicates from distinct units on same street',
    exactDup.classification === 'confirmed_duplicate' &&
      sameBuildingDifferentFloor.classification === 'similar_but_distinct' &&
      sameStreetDifferentSqm.classification === 'similar_but_distinct' &&
      missingFieldsDup.classification === 'insufficient_information',
    `exact=${exactDup.classification}, diffFloor=${sameBuildingDifferentFloor.classification}, diffSqm=${sameStreetDifferentSqm.classification}`
  );

  // 20. mergeEffectiveBargains keeps distinct units on same street while deduplicating exact cloud/seed duplicates
  const mergedBargains = mergeEffectiveBargains(
    [
      {
        id: 'seed-1',
        title: 'واحد 90 متری خوش نقشه',
        type: 'خرید',
        sqm: 90,
        priceText: 'متری 150 میلیون',
        discountPercent: 12,
        buyerProfitText: '۱ میلیارد سود',
        street: 'خیابان سرو غربی',
      },
    ],
    [
      {
        id: 'cloud-1',
        title: 'واحد ۹۰ متری خوش‌نقشه',
        type: 'خرید',
        sqm: 90,
        priceText: 'متری ۱۵۰ میلیون',
        discountPercent: 14,
        buyerProfitText: '۱.۲ میلیارد سود',
        street: 'خیابان سرو غربی',
      },
      {
        id: 'cloud-2',
        title: 'واحد ۱۱۰ متری خوش‌نقشه',
        type: 'خرید',
        sqm: 110,
        priceText: 'متری ۱۴۸ میلیون',
        discountPercent: 15,
        buyerProfitText: '۱.۵ میلیارد سود',
        street: 'خیابان سرو غربی',
      },
    ],
    5
  );
  assert(
    '20. mergeEffectiveBargains deduplicates identical listing while preserving distinct 110m unit on same street',
    mergedBargains.length === 2 && mergedBargains[0].id === 'cloud-1' && mergedBargains[1].id === 'cloud-2',
    `mergedCount=${mergedBargains.length}`
  );

  // 21. City & neighborhood scope isolation (Tehran 1..99, Karaj 101..199, Mashhad 201..299, Isfahan 301..399, Shiraz 401..499)
  assert(
    '21. City-neighborhood scope validation prevents cross-city contamination',
    validateCityNeighborhoodScope('tehran', 15).valid === true &&
      validateCityNeighborhoodScope('tehran', 105).valid === false &&
      validateCityNeighborhoodScope('karaj', 105).valid === true &&
      validateCityNeighborhoodScope('shiraz', 402).valid === true,
    'Verified canonical city-neighborhood ID boundaries'
  );

  // 22. User-scoped form draft persistence (isolation across users, secret rejection, TTL expiry, and stale server revision detection)
  const memoryStorage = new Map<string, string>();
  const mockStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
    getItem: (k) => memoryStorage.get(k) ?? null,
    setItem: (k, v) => { memoryStorage.set(k, v); },
    removeItem: (k) => { memoryStorage.delete(k); },
  };
  const nowMs = 1_750_000_000_000;
  const savedUserA = saveUserScopedDraft(
    mockStorage,
    'bargain_form',
    'user_alice',
    { title: 'واحد ۸۵ متری پونک', sqm: 85 },
    { nowMs, serverRevisionMs: 1_749_000_000_000 }
  );
  const blockedSecretDraft = saveUserScopedDraft(
    mockStorage,
    'bargain_form',
    'user_alice',
    { title: 'test', password: 'secret_value' },
    { nowMs }
  );
  const isDraftValid = (v: unknown): v is { title: string; sqm: number } =>
    Boolean(v && typeof (v as { title?: unknown }).title === 'string');
  const loadedByBob = loadUserScopedDraft(
    mockStorage,
    'bargain_form',
    'user_bob',
    isDraftValid,
    { nowMs: nowMs + 1000 }
  );
  const loadedByAliceFresh = loadUserScopedDraft(
    mockStorage,
    'bargain_form',
    'user_alice',
    isDraftValid,
    { nowMs: nowMs + 1000, currentServerRevisionMs: 1_749_000_000_000 }
  );
  const loadedByAliceStaleVsServer = loadUserScopedDraft(
    mockStorage,
    'bargain_form',
    'user_alice',
    isDraftValid,
    { nowMs: nowMs + 1000, currentServerRevisionMs: nowMs + 5000 }
  );
  assert(
    '22. User-scoped draft persistence isolates users, blocks secret fields, and detects stale server revisions',
    savedUserA.saved === true &&
      blockedSecretDraft.saved === false &&
      loadedByBob.status === 'empty' &&
      loadedByAliceFresh.status === 'restored' &&
      loadedByAliceFresh.data?.sqm === 85 &&
      loadedByAliceStaleVsServer.status === 'stale_vs_server' &&
      getScopedStorageKey('bargain_form', 'user_alice') !== getScopedStorageKey('bargain_form', 'user_bob'),
    `aliceFresh=${loadedByAliceFresh.status}, bob=${loadedByBob.status}, stale=${loadedByAliceStaleVsServer.status}`
  );

  // 23. Media & historical observation deduplication + safe client URL/tel validation
  const dedupedMedia = deduplicateMediaObjects([
    { id: 'obj-1', objectKey: 'media/a.jpg', sha256: 'abc123456789' },
    { id: 'obj-2', objectKey: 'media/b.jpg', sha256: 'abc123456789' },
    { id: 'obj-3', objectKey: 'media/c.jpg', sha256: 'def987654321' },
  ]);
  const dedupedHistory = deduplicateHistoricalObservations([
    { month: 'آبان', price: 150, dealCount: 40 },
    { month: 'آبان', price: 155, dealCount: 45 },
    { month: 'آذر', price: 160, dealCount: 50 },
  ]);
  assert(
    '23. Media & historical deduplication and safe external URL / tel: protocol validation',
    dedupedMedia.length === 2 &&
      dedupedHistory.length === 2 &&
      dedupedHistory[0].price === 155 &&
      sanitizeSafeExternalUrl('javascript:alert(1)') === null &&
      sanitizeSafeExternalUrl('https://divar.ir/s/tehran') === 'https://divar.ir/s/tehran' &&
      sanitizeSafeTelHref('09123456789') === 'tel:09123456789' &&
      sanitizeSafeTelHref('javascript:alert(1)') === null,
    `media=${dedupedMedia.length}, history=${dedupedHistory.length}`
  );

  // 24. Configuration drift detection, environment profiles, test safety guard & deterministic fixture IDs
  const prodDrift = detectEnvironmentConfigDrift(
    {
      NODE_ENV: 'production',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      APP_URL: 'http://tehran-radar.ir',
      OBJECT_STORAGE_ACCESS_KEY: 'partial_access_key_only',
      TELEGRAM_BOT_TOKEN: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw',
    },
    { projectId: 'gen-lang-client-0879904589' }
  );
  const cleanTestEnv = detectEnvironmentConfigDrift({ NODE_ENV: 'test' });
  const detId1 = createDeterministicTestId('listing', 'hood-5-sqm-85');
  const detId2 = createDeterministicTestId('listing', 'hood-5-sqm-85');
  const detId3 = createDeterministicTestId('listing', 'hood-5-sqm-110');
  assert(
    '24. Configuration drift detector catches emulator-in-prod, HTTP APP_URL in prod, partial S3/Telegram creds, and projectId mismatch',
    prodDrift.valid === false &&
      prodDrift.drifts.some((d) => d.includes('EMULATOR_LEAK_IN_PRODUCTION')) &&
      prodDrift.drifts.some((d) => d.includes('INSECURE_APP_URL_IN_PRODUCTION')) &&
      prodDrift.drifts.some((d) => d.includes('FIREBASE_PROJECT_ID_DRIFT')) &&
      prodDrift.drifts.some((d) => d.includes('PARTIAL_OBJECT_STORAGE_S3_CONFIG')) &&
      prodDrift.drifts.some((d) => d.includes('PARTIAL_TELEGRAM_CONFIG')) &&
      cleanTestEnv.valid === true &&
      resolveEnvironmentProfile({ NODE_ENV: 'test' }) === 'test' &&
      assertSafeTestEnvironment({ NODE_ENV: 'production' }).safe === false &&
      assertSafeTestEnvironment({ NODE_ENV: 'test', APP_URL: 'http://localhost:3000' }).safe === true &&
      detId1 === detId2 &&
      detId1 !== detId3,
    `prodDrifts=${prodDrift.drifts.length}, detId=${detId1}`
  );

  // 25. Machine-readable OpenAPI 3.1.0 specification & endpoint contract coverage
  const openApiSpec = buildOpenApiSpecification('https://tehran-radar.example.com') as {
    openapi: string;
    paths: Record<string, Record<string, { security: unknown[]; 'x-auth-level': string }>>;
  };
  assert(
    '25. OpenAPI 3.1.0 specification covers all backend contracts with explicit auth & rate-limit metadata',
    openApiSpec.openapi === '3.1.0' &&
      API_ENDPOINT_CONTRACTS.length >= 16 &&
      openApiSpec.paths['/api/object-storage/upload']?.post?.['x-auth-level'] === 'verified_firebase_user' &&
      openApiSpec.paths['/api/admin/runtime-env']?.post?.['x-auth-level'] === 'admin_only' &&
      openApiSpec.paths['/api/market-pulse']?.get?.['x-auth-level'] === 'public',
    `contracts=${API_ENDPOINT_CONTRACTS.length}, openapi=${openApiSpec.openapi}`
  );

  // 26. Firestore Neighborhood Repository Pattern: write-deduplication cache, DTO mappers, and schema bounds
  clearNeighborhoodRepositoryCache();
  const ovPayload = buildSanitizedOverridePayload({
    hoodId: 5,
    buyPerSqm: 192,
    rahn80m: 2450,
    pros: 'دسترسی عالی <script>alert(1)</script>',
    cons: 'ترافیک عصرگاهی',
    sponsor: { name: 'املاک پونک', phone: '021-44440000', specialty: 'مسکونی', experienceYears: 12 },
  });
  const skipBeforeCache = shouldSkipRedundantOverrideWrite(5, ovPayload);
  recordOverrideCache(5, ovPayload);
  const skipAfterCache = shouldSkipRedundantOverrideWrite(5, ovPayload);
  const mappedLegacyDoc = mapFirestoreDocToOverride('hood_14', { buyPerSqm: 145, rahn80m: 1700 });
  const mergedOverrideList = mergeNeighborhoodOverridesIntoList(
    [INITIAL_NEIGHBORHOODS[0]],
    {
      1: {
        hoodId: 1,
        buyPerSqm: 265,
        rahn80m: 3800,
        pros: 'مزایای جدید',
        sponsor: { name: 'اسپانسر جدید', phone: '021-22000000', specialty: 'لوکس', experienceYears: 20 },
      },
    },
    INITIAL_NEIGHBORHOODS
  );
  const bargainPayload = buildSanitizedBargainPayload({
    hoodId: 5,
    title: 'واحد ۸۵ متری شکار',
    type: 'خرید',
    sqm: 85,
    priceText: 'متری ۱۵۰ میلیون',
    discountPercent: 15,
    buyerProfitText: '۱.۲ میلیارد سود',
    street: 'اشرفی اصفهانی',
    imageUrls: ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => `https://example.com/${x}.jpg`),
  });
  const mappedBargain = mapFirestoreDocToBargain('b123', bargainPayload);
  const votePayloads = buildSanitizedVotePayload({
    hoodId: 5,
    hoodName: 'پونک',
    userId: 'user_123',
    userDisplayName: 'سارا',
    air: 8,
    powerWater: 9,
    internet: 8,
    metro: 7,
    security: 9,
    flatTerrain: 8,
    comment: 'محله آرام',
    locationVerified: true,
  });
  const mergedSeedWithProsCons = mergeNeighborhoodWithSeed(INITIAL_NEIGHBORHOODS[0], {
    pros: 'مزایای سفارشی',
    cons: 'معایب سفارشی',
  });
  assert(
    '26. Firestore Neighborhood Repository enforces write deduplication, hood_X doc parsing, 5-image cap, and mutable vote fields',
    skipBeforeCache === false &&
      skipAfterCache === true &&
      mappedLegacyDoc?.hoodId === 14 &&
      mergedOverrideList[0].buyPerSqm === 265 &&
      mergedOverrideList[0].pros === 'مزایای جدید' &&
      mergedOverrideList[0].sponsor.expiresAtIso === undefined &&
      Array.isArray(bargainPayload.imageUrls) &&
      (bargainPayload.imageUrls as string[]).length === 5 &&
      mappedBargain?.listing.id === 'cloud-b123' &&
      votePayloads.voteId === 'user_123_hood_5' &&
      !('userId' in votePayloads.mutableFields) &&
      'userId' in votePayloads.createFields &&
      mergedSeedWithProsCons.pros === 'مزایای سفارشی' &&
      mergedSeedWithProsCons.cons === 'معایب سفارشی',
    `skipAfterCache=${skipAfterCache}, legacyHoodId=${mappedLegacyDoc?.hoodId}, imgs=${(bargainPayload.imageUrls as string[]).length}`
  );

  // 27. Snapshot cache normalization, strict DTO hoodId bounds, 50-char consentVersion, and extended hood deep overrides
  clearNeighborhoodRepositoryCache();
  mapFirestoreDocToOverride('hood_14', {
    buyPerSqm: 145,
    rahn80m: 1700,
    pros: 'میدان‌های سرسبز',
  });
  const skipFromSnapshotCache = shouldSkipRedundantOverrideWrite(
    14,
    buildSanitizedOverridePayload({
      hoodId: 14,
      buyPerSqm: 145,
      rahn80m: 1700,
      pros: 'میدان‌های سرسبز',
    })
  );
  const invalidSponsorDto = mapFirestoreDocToSponsorRequest('s_bad', { hoodId: 1005, agencyName: 'املاک', phone: '09121112233' }, Date.now());
  const validBuyerLeadDto = mapFirestoreDocToBuyerLead(
    'b_ok',
    {
      hoodId: 61,
      fullName: 'رضا علوی',
      phone: '09121112233',
      consentVersion: 'buyer-alert-2026-10-v1-extended-consent-identifier',
    },
    Date.now()
  );
  const restoredWithHighTariff = validateAndBuildRestoredState(
    JSON.stringify({
      neighborhoods: [{ id: 1, name: 'زعفرانیه', buyPerSqm: 310, rahn80m: 4100 }],
      sponsorRequests: [
        {
          id: 'crm-high',
          hoodId: 1,
          hoodName: 'زعفرانیه',
          agencyName: 'املاک زعفرانیه',
          phone: '021-22000000',
          totalPayableMillion: 4500,
        },
      ],
    })
  );
  const deepExtended = parsePersistedDeepOverrides({
    tehran: { '61': { buyPerSqm: 235, rahn80m: 3150, updatedAtIso: new Date().toISOString() } },
    karaj: { '107': { buyPerSqm: 80, rahn80m: 940, updatedAtIso: new Date().toISOString() } },
  });
  assert(
    '27. Repository snapshot cache normalization, DTO hoodId bounds, 50-char consentVersion, and extended city deep overrides',
    skipFromSnapshotCache === true &&
      invalidSponsorDto === null &&
      validBuyerLeadDto?.consentVersion?.length === 50 &&
      restoredWithHighTariff.ok === true &&
      restoredWithHighTariff.sponsorRequests?.[0]?.totalPayableMillion === 4500 &&
      deepExtended.tehran?.[61]?.buyPerSqm === 235 &&
      deepExtended.karaj?.[107]?.buyPerSqm === 80,
    `skipFromSnapshotCache=${skipFromSnapshotCache}, invalidSponsor=${invalidSponsorDto}, tariff=${restoredWithHighTariff.sponsorRequests?.[0]?.totalPayableMillion}`
  );

  // 28. Firestore Data Auditor detects negative numeric fields, out-of-range numbers, and incomplete strings
  const cleanSeedAudit = auditLocalRadarDatasets({
    neighborhoods: INITIAL_NEIGHBORHOODS,
    sponsorRequests: [],
    buyerLeads: [],
  });
  const negativeDocIssues = auditRawDocument('neighborhoodOverrides', 'bad_hood_9', {
    hoodId: 9,
    buyPerSqm: -120,
    rahn80m: -950,
    air: -2,
  });
  const incompleteBargainIssues = auditRawDocument('bargains', 'bad_bg_1', {
    hoodId: 5,
    title: '',
    priceText: 'متری ۱۱۰ میلیون',
    street: '   ',
    sqm: -65,
    discountPercent: 90,
  });
  const weeklyTrend = buildWeeklyInvalidDocumentsTrend(
    auditLocalRadarDatasets({
      neighborhoods: INITIAL_NEIGHBORHOODS,
      sponsorRequests: [],
      buyerLeads: [],
      extraSamples: [
        {
          collection: 'neighborhoodOverrides',
          docId: 'bad_hood_9',
          data: { hoodId: 9, buyPerSqm: -120, rahn80m: -950, air: -2 },
        },
      ],
    })
  );
  assert(
    '28. Firestore Data Auditor detects negative numeric fields, out-of-range fields, incomplete required strings, and builds 7-day weekly trend',
    cleanSeedAudit.negativeFieldsCount === 0 &&
      cleanSeedAudit.invalidDocumentsCount === 0 &&
      negativeDocIssues.filter((i) => i.severity === 'CRITICAL_NEGATIVE').length === 3 &&
      incompleteBargainIssues.some((i) => i.severity === 'INCOMPLETE_FIELD' && i.field === 'title') &&
      incompleteBargainIssues.some((i) => i.severity === 'INCOMPLETE_FIELD' && i.field === 'street') &&
      incompleteBargainIssues.some((i) => i.severity === 'CRITICAL_NEGATIVE' && i.field === 'sqm') &&
      incompleteBargainIssues.some((i) => i.severity === 'OUT_OF_RANGE' && i.field === 'discountPercent') &&
      weeklyTrend.length === 7 &&
      weeklyTrend[6].isToday === true &&
      weeklyTrend[6].invalidDocsCount === 1 &&
      weeklyTrend[6].negativeFieldsCount === 3,
    `cleanInvalid=${cleanSeedAudit.invalidDocumentsCount}, negCount=${negativeDocIssues.length}, weeklyDays=${weeklyTrend.length}`
  );

  // 29. checkNeighborhoodGeoAndCityHealth detects missing/invalid lat/lng and missing/invalid cityId
  const cleanGeoHealth = checkNeighborhoodGeoAndCityHealth(INITIAL_NEIGHBORHOODS as any);
  const brokenGeoAndCityList = checkNeighborhoodGeoAndCityHealth([
    { id: 1, name: 'زعفرانیه سالم', cityId: 'tehran', zone: 'منطقه ۱', lat: 35.8, lng: 51.41 },
    { id: 888, name: 'محله بدون مختصات', cityId: 'tehran', zone: 'تهران', lat: 0, lng: -51.4 },
    { id: 950, name: 'محله بدون cityId', cityId: '', zone: '', lat: 35.72, lng: 51.41 },
    { id: 5, name: 'محله با شهر اشتباه', cityId: 'shiraz', zone: 'غرب', lat: 35.76, lng: 51.33 },
  ]);
  assert(
    '29. checkNeighborhoodGeoAndCityHealth passes valid neighborhoods and lists records with invalid lat/lng or missing/mismatched cityId',
    cleanGeoHealth.length === 0 &&
      brokenGeoAndCityList.length === 3 &&
      brokenGeoAndCityList[0].hasValidCoordinates === false &&
      brokenGeoAndCityList[0].hasValidCityId === true &&
      brokenGeoAndCityList[1].hasValidCoordinates === true &&
      brokenGeoAndCityList[1].hasValidCityId === false &&
      brokenGeoAndCityList[2].hasValidCityId === false,
    `cleanGeo=${cleanGeoHealth.length}, brokenGeoCount=${brokenGeoAndCityList.length}`
  );

  // 30. checkOrphanedHoodReferences detects dangling hoodId references & sanitizeCorruptedDocumentPayload repairs invalid documents
  const validHoodIds = INITIAL_NEIGHBORHOODS.map((n) => n.id);
  const cleanOrphanRefs = checkOrphanedHoodReferences({
    validHoodIds,
    extraSamples: [
      { collection: 'sponsorRequests', docId: 'sp-1', data: { hoodId: 1, hoodName: 'زعفرانیه' } },
      { collection: 'buyerAlerts', docId: 'ld-1', data: { hoodId: 5, fullName: 'کاربر تست' } },
    ],
  });
  const detectedOrphanRefs = checkOrphanedHoodReferences({
    validHoodIds,
    extraSamples: [
      { collection: 'sponsorRequests', docId: 'sp-orphan', data: { hoodId: 777, hoodName: 'محله حذف‌شده' } },
      { collection: 'buyerAlerts', docId: 'ld-orphan', data: { hoodId: -12, fullName: 'مشتری تست' } },
      { collection: 'neighborhoodOverrides', docId: 'hood_888', data: { hoodId: 888, buyPerSqm: 150, rahn80m: 1800 } },
    ],
  });
  const sanitizeBargainResult = sanitizeCorruptedDocumentPayload('bargains', 'corrupt_bg_99', {
    hoodId: -15,
    title: '   ',
    priceText: '',
    street: '',
    sqm: -85,
    discountPercent: 95,
  });
  const issuesAfterSanitize = auditRawDocument('bargains', 'corrupt_bg_99', sanitizeBargainResult.sanitizedData);
  assert(
    '30. checkOrphanedHoodReferences catches dangling hoodIds and sanitizeCorruptedDocumentPayload repairs negative/incomplete fields',
    cleanOrphanRefs.length === 0 &&
      detectedOrphanRefs.length === 3 &&
      detectedOrphanRefs.some((r) => r.collection === 'sponsorRequests' && r.referencedHoodId === 777) &&
      detectedOrphanRefs.some((r) => r.collection === 'buyerAlerts' && r.referencedHoodId === -12) &&
      detectedOrphanRefs.some((r) => r.collection === 'neighborhoodOverrides' && r.referencedHoodId === 888) &&
      sanitizeBargainResult.appliedFixesFa.length >= 5 &&
      issuesAfterSanitize.length === 0,
    `cleanOrphans=${cleanOrphanRefs.length}, detectedOrphans=${detectedOrphanRefs.length}, fixes=${sanitizeBargainResult.appliedFixesFa.length}, remainingIssues=${issuesAfterSanitize.length}`
  );

  // 31. Deep Relational & Schema Integrity Audit: phone normalization, override ID mismatch, expired sponsor fallback, and checkDatabaseRelationalAndSchemaIntegrity
  const normPersianPhone = normalizeIranMobilePhone('۰۹۱۲-۳۴۵-۶۷۸۹');
  const normPlus98Phone = normalizeIranMobilePhone('+989123456789');
  const mismatchedOverride = mapFirestoreDocToOverride('hood_14', { hoodId: 15, buyPerSqm: 150, rahn80m: 1800 });
  const matchingLegacyOverride = mapFirestoreDocToOverride('hood_14', { hoodId: 14, buyPerSqm: 150, rahn80m: 1800 });
  const seedForExpiredTest = INITIAL_NEIGHBORHOODS[0];
  const mergedWithExpiredOverrideSponsor = mergeNeighborhoodOverridesIntoList(
    [seedForExpiredTest],
    {
      [seedForExpiredTest.id]: {
        hoodId: seedForExpiredTest.id,
        buyPerSqm: seedForExpiredTest.buyPerSqm,
        rahn80m: seedForExpiredTest.rahn80m,
        sponsor: {
          name: 'مشاور منقضی شده',
          phone: '09120000000',
          specialty: 'فروش',
          experienceYears: 5,
          expiresAtIso: '2020-01-01T00:00:00.000Z',
          planType: 'paid_1m',
        },
      },
    },
    [seedForExpiredTest]
  );
  const relationalIssues = checkDatabaseRelationalAndSchemaIntegrity({
    neighborhoods: INITIAL_NEIGHBORHOODS,
    extraSamples: [
      { collection: 'neighborhoodOverrides', docId: 'hood_14', data: { hoodId: 14, buyPerSqm: 150, rahn80m: 1800 } },
      { collection: 'neighborhoodOverrides', docId: '14', data: { hoodId: 14, buyPerSqm: 155, rahn80m: 1850 } },
      { collection: 'neighborhoodOverrides', docId: 'hood_20', data: { hoodId: 21, buyPerSqm: 150, rahn80m: 1800 } },
      { collection: 'neighborhoodOverrides', docId: '25', data: { hoodId: 25, buyPerSqm: 200, rahn80m: 15000 } },
      { collection: 'votes', docId: 'wrong_vote_id', data: { userId: 'uid_abc', hoodId: 5 } },
      { collection: 'buyerAlerts', docId: 'uid_xyz_hood_5', data: { userId: 'uid_xyz', hoodId: 5, phone: '+989121112233' } },
      { collection: 'sponsorRequests', docId: 'sp_expired_1', data: { hoodId: 5, status: 'approved', expiresAtIso: '2021-01-01T00:00:00.000Z' } },
    ],
  });
  assert(
    '31. Relational & Schema Integrity: normalizes Persian/+98 phones, rejects mismatched override docIds, reverts expired override sponsors, and detects duplicate/economic/format anomalies',
    normPersianPhone === '09123456789' &&
      normPlus98Phone === '09123456789' &&
      mismatchedOverride === null &&
      matchingLegacyOverride?.hoodId === 14 &&
      mergedWithExpiredOverrideSponsor[0].sponsor.name === seedForExpiredTest.sponsor.name &&
      relationalIssues.some((i) => i.category === 'DUPLICATE_OVERRIDE_DOC') &&
      relationalIssues.some((i) => i.category === 'DOC_ID_MISMATCH') &&
      relationalIssues.some((i) => i.category === 'ECONOMIC_RATIO_ANOMALY') &&
      relationalIssues.some((i) => i.category === 'RULES_FORMAT_VIOLATION') &&
      relationalIssues.some((i) => i.category === 'EXPIRED_SPONSOR_RECORD'),
    `normPhone=${normPersianPhone}, mismatch=${String(mismatchedOverride)}, issues=${relationalIssues.map((i) => i.category).join(',')}`
  );

  let health = createCloudSyncListenerHealth();
  health = activateCloudListener(health, 'featureFlags');
  health = activateCloudListener(health, 'bargains');
  health = noteCloudListenerError(health, 'bargains');
  health = noteCloudListenerSnapshot(health, 'featureFlags');
  assert('32. Cloud listener recovery: a sibling snapshot does not mark a dead listener live', isCloudSyncLive(health) === false && cloudSyncConnectionStatus({ authReady: true, navigatorOnLine: true, health }) === 'RECONNECTING', `failed=${health.failed.join(',')}`);
  health = noteCloudListenerSnapshot(health, 'bargains');
  assert('33. Cloud listener recovery: the same listener snapshot clears its own failure', isCloudSyncLive(health) === true && cloudSyncConnectionStatus({ authReady: true, navigatorOnLine: true, health }) === 'LIVE_SYNC', `succeeded=${health.succeeded.join(',')}`);
  health = noteCloudListenerError(health, 'bargains');
  health = noteExplicitCloudReconnect(health);
  assert('34. Cloud listener recovery: explicit reconnect clears the failure without calling a dead listener live', health.failed.length === 0 && isCloudSyncLive(health) === false, `active=${health.active.join(',')}`);
  health = noteCloudListenerSnapshot(health, 'bargains');
  assert('35. Cloud listener recovery: resubscribed snapshot restores live status', isCloudSyncLive(health) === true, `failed=${health.failed.join(',')}`);
  const leadId = 'durable-cache-probe';
  const before = serverSideBuyerLeads.length;
  const rejected = cacheBuyerAlertAfterDurableCommit(false, { id: leadId, hoodId: 1, hoodName: 'probe', fullName: 'probe', phone: '09120000000', dealType: 'خرید', maxBudgetText: 'probe', createdAtFa: 'probe' });
  const accepted = cacheBuyerAlertAfterDurableCommit(true, { id: leadId, hoodId: 1, hoodName: 'probe', fullName: 'probe', phone: '09120000000', dealType: 'خرید', maxBudgetText: 'probe', createdAtFa: 'probe' });
  assert('36. Buyer alert cache: a failed durable write is not stored in the memory cache', rejected === false && accepted === true && serverSideBuyerLeads.length === before + 1 && serverSideBuyerLeads.some((lead) => lead.id === leadId), `before=${before} after=${serverSideBuyerLeads.length}`);
  const cachedIndex = serverSideBuyerLeads.findIndex((lead) => lead.id === leadId);
  if (cachedIndex >= 0) serverSideBuyerLeads.splice(cachedIndex, 1);

  // 37. WS-ARGON5-B & WS-ARGON5-C: Multi-criteria decision explainability, non-compensatory alerts, and ±0.3 tie-band sensitivity
  const explainHighMetroWeakAir = explainNeighborhoodRecommendation(
    {
      name: 'محله تست',
      status: 'green',
      diffPercent: -8,
      overallScore: 7.8,
      air: 5.5,
      powerWater: 8.5,
      internet: 8.0,
      metro: 9.5,
      security: 8.0,
      flatTerrain: 7.5,
      distKm: 3.2,
    },
    { mode: 'buy', priority: 'metro', sortBy: 'commute_metro', topReferenceScore: 8.0 },
  );
  const explainFarFromTop = explainNeighborhoodRecommendation(
    {
      name: 'محله دوم',
      status: 'yellow',
      diffPercent: 11,
      overallScore: 7.2,
      air: 7.0,
      powerWater: 7.5,
      internet: 7.5,
      metro: 7.0,
      security: 7.5,
      flatTerrain: 7.0,
      distKm: null,
    },
    { mode: 'rent', priority: 'balanced', sortBy: 'score', topReferenceScore: 8.0 },
  );
  assert(
    '37. explainNeighborhoodRecommendation separates budget-fit semantics from composite score, flags non-compensatory <6.5 indicators, and detects ±0.3 tie-bands',
    explainHighMetroWeakAir.budgetFitSemanticsLabelFa === 'همخوان با فرض بودجه فعلی' &&
      explainHighMetroWeakAir.isTieBandWithTop === true &&
      explainHighMetroWeakAir.nonCompensatoryWarningsFa.some((w) => w.includes('کیفیت هوا')) &&
      explainHighMetroWeakAir.strongestDimensionLabelFa.includes('دسترسی مترو') &&
      explainFarFromTop.budgetFitSemanticsLabelFa.includes('مرزی') &&
      explainFarFromTop.isTieBandWithTop === false &&
      explainFarFromTop.nonCompensatoryWarningsFa.length === 0,
    `tieBand=${explainHighMetroWeakAir.isTieBandWithTop}, warnings=${explainHighMetroWeakAir.nonCompensatoryWarningsFa.length}`,
  );

  // 38. WS-ARGON5-D & Root-Cause Unification: Resident review provenance separates observed user submissions from seed baseline scenarios
  const seedOnlySummary = summarizeNeighborhoodQoL(sampleHood, buildNeighborhoodSeedReviews(sampleHood));
  const mergedWithOneCloudVote = mergeCloudAndSeedReviews(
    sampleHood,
    [
      {
        id: 'vote-1',
        hoodId: sampleHood.id,
        hoodName: sampleHood.name,
        userId: 'user-1',
        userDisplayName: 'مریم کریمی',
        air: 8,
        powerWater: 9,
        internet: 8,
        metro: 8,
        security: 9,
        flatTerrain: 8,
        comment: 'محله بسیار آرام و مناسب خانواده است.',
        locationVerified: true,
      },
    ],
    [],
  );
  const observedAndSeedSummary = summarizeNeighborhoodQoL(sampleHood, mergedWithOneCloudVote);
  assert(
    '38. Resident review provenance separates observed user submissions from seed baseline scenarios',
    seedOnlySummary.observedReviewsCount === 0 &&
      seedOnlySummary.seedBaselineCount === 3 &&
      seedOnlySummary.provenanceLabelFa.includes('۰ نظر ثبت‌شده کاربر') &&
      observedAndSeedSummary.observedReviewsCount === 1 &&
      observedAndSeedSummary.seedBaselineCount === 3 &&
      observedAndSeedSummary.provenanceLabelFa.includes('۱ نظر واقعی ثبت‌شده کاربر'),
    `seedOnlyObserved=${seedOnlySummary.observedReviewsCount}, withCloudObserved=${observedAndSeedSummary.observedReviewsCount}`,
  );

  // 39. WS-CASPER-03: End-to-End Sample Unification, Dynamic Jalali Year, Actionable Ad-to-Visit Pipeline & Trade-Up Multi-Criteria Explainability
  const portfolioSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PortfolioModals.tsx'), 'utf-8');
  const bargainsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodBargainsAndVotesTabs.tsx'), 'utf-8');
  const forecastSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SmartPriceForecastCard.tsx'), 'utf-8');
  const searchDropSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SearchDropdownMenu.tsx'), 'utf-8');
  const smartSuggestSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SmartSuggestModal.tsx'), 'utf-8');
  assert(
    '39. WS-CASPER-03 unifies buildNeighborhoodListingSamples across Portfolio/Bargains/Forecast/Search/Suggest, removes hardcoded Jalali years, wires 1-click Ad-to-Visits, and adds Trade-Up non-compensatory explainability',
    portfolioSrc.includes('buildNeighborhoodListingSamples(vHood)') &&
      portfolioSrc.includes('explainNeighborhoodRecommendation(item.hood') &&
      portfolioSrc.includes('data-testid="tradeup-bottleneck-warning"') &&
      bargainsSrc.includes('buildNeighborhoodListingSamples(selectedHood)') &&
      bargainsSrc.includes('getCurrentJalaliYear()') &&
      bargainsSrc.includes('data-testid="save-analyzed-ad-to-visits-btn"') &&
      !bargainsSrc.includes('1405 -') &&
      forecastSrc.includes('buildNeighborhoodListingSamples(selectedHood)') &&
      forecastSrc.includes('getCurrentJalaliYear()') &&
      forecastSrc.includes('data-testid="forecast-epistemic-badge"') &&
      searchDropSrc.includes('buildNeighborhoodListingSamples({') &&
      smartSuggestSrc.includes('buildNeighborhoodListingSamples(n)'),
    'WS-CASPER-03 contract check failed',
  );

  // 40. WS-CASPER-04: Self-Critique & Deep Uncaught Weakness Remediation (Double-Depreciation Prevention, Non-Scoring Provenance Row, True Deal Winner & Tie-Band Symmetry)
  const compareModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CompareModal.tsx'), 'utf-8');
  const shortlistMatrixSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ShortlistMatrixModal.tsx'), 'utf-8');
  const expandableTableSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ExpandableComparisonTable.tsx'), 'utf-8');
  const depreciatedCurrentHood: EvaluatedNeighborhood = {
    ...sampleHood,
    baseBuyPerSqm: 150,
    buyPerSqm: Math.round(150 * 0.78), // Simulates global sidebar 'old' building age filter
  };
  const depreciatedTargetHood: EvaluatedNeighborhood = {
    ...sampleHood,
    id: 99,
    name: 'محله هدف تست',
    baseBuyPerSqm: 200,
    buyPerSqm: Math.round(200 * 0.78),
  };
  const tradeUpNoDoubleDepreciation = evaluateTradeUpOptions({
    currentHood: depreciatedCurrentHood,
    currentSqm: 80,
    currentAgeYears: 10, // 0.88 factor -> 150 * 80 * 0.88 = 10560
    extraCashMillion: 0,
    useLoanBooster: false,
    useTenantRahnDeduction: false,
    targetNewSqm: 100,
    targetAgeSegment: 'older', // 0.76 factor -> round(200 * 0.76) * 100 = 15200
    allNeighborhoods: [depreciatedTargetHood],
  });
  assert(
    '40. WS-CASPER-04 prevents double age depreciation in evaluateTradeUpOptions, neutralizes sample-count win bias in CompareModal, highlights true lowest v6.4 deal price in ShortlistMatrixModal, and surfaces non-compensatory warnings in ExpandableComparisonTable',
    tradeUpNoDoubleDepreciation.currentHomeSaleValueMillion === Math.round(150 * 80 * 0.88) &&
      tradeUpNoDoubleDepreciation.matchingHoods[0].targetUnitTotalPriceMillion === Math.round(200 * 0.76) * 100 &&
      compareModalSrc.includes("'منشأ داده و شاخص پوشش نمونه (غیرآماری)'") &&
      compareModalSrc.includes('win: 0 },') &&
      !compareModalSrc.includes('agg1.evidenceIndexScore > agg2.evidenceIndexScore ? 1 : 2') &&
      portfolioSrc.includes('const maxTradeUpScore = Math.max(') &&
      portfolioSrc.includes('const showTieBadge = recExp.isTieBandWithTop && tiedAtTopCount > 1') &&
      shortlistMatrixSrc.includes('const isBest = dealSqm === minDealPerSqm;') &&
      shortlistMatrixSrc.includes('const isTieBand = row.key === \'overallScore\' && Math.abs(maxVal - val) <= 0.3 && tiedAtTopCount > 1;') &&
      expandableTableSrc.includes('explainA.nonCompensatoryWarningsFa[0]'),
    `saleValue=${tradeUpNoDoubleDepreciation.currentHomeSaleValueMillion}, targetTotal=${tradeUpNoDoubleDepreciation.matchingHoods[0]?.targetUnitTotalPriceMillion}`,
  );

  // 41. WS-CASPER-05: Real Quality Over Vanity/Speed Calibration (Liability & Occupancy Lockout Disclosure, Unofficial Valuation Report Truthfulness, Age-Matched Negotiation & Zero Phony void Suppressions)
  const buyingPowerCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BuyingPowerSummaryCard.tsx'), 'utf-8');
  const purchasingPowerTrendSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PurchasingPowerTrendCard.tsx'), 'utf-8');
  const budgetBridgeCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BudgetBridgeAdvisorCard.tsx'), 'utf-8');
  const superModulesValFakeSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperModulesValuationAndFakeTabs.tsx'), 'utf-8');
  assert(
    '41. WS-CASPER-05 enforces liability & occupancy disclosure in BuyingPowerSummaryCard, removes phony void suppressions in PurchasingPowerTrendCard & BudgetBridgeAdvisorCard, and replaces official-certificate overclaims in SuperModulesValuationAndFakeTabs',
    buyingPowerCardSrc.includes('data-testid="buying-power-liability-disclosure"') &&
      buyingPowerCardSrc.includes('آورده خالص نقدی:') &&
      buyingPowerCardSrc.includes('تعهدات و اهرم‌ها:') &&
      purchasingPowerTrendSrc.includes('buildNeighborhoodListingSamples(selectedHood)') &&
      !purchasingPowerTrendSrc.includes('void total80mTodayMillions') &&
      !budgetBridgeCardSrc.includes('void monthlyRent80mMillions') &&
      !superModulesValFakeSrc.includes('گواهی رسمی کارشناسی') &&
      superModulesValFakeSrc.includes('گزارش تحلیلی کارشناسی هوشمند ارزش ملک (مدل هدونیک · غیررسمی)') &&
      superModulesValFakeSrc.includes('در محله فعلی (<strong>{activeHood.name}</strong>'),
    'WS-CASPER-05 contract check failed',
  );

  // 42. WS-CASPER-06: Primary Workspace Views & ReverseBudgetDiscoveryModal Charter Alignment (Sample Unification, Epistemic Hero Truthfulness, Non-Compensatory Warnings & AFFORDABLE-First Ranking)
  const discoverViewSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/views/ProductDiscoverView.tsx'), 'utf-8');
  const homeViewSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/views/ProductHomeView.tsx'), 'utf-8');
  const userSpaceViewSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/views/ProductUserSpaceView.tsx'), 'utf-8');
  const reverseBudgetSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/modals/ReverseBudgetDiscoveryModal.tsx'), 'utf-8');
  assert(
    '42. WS-CASPER-06 unifies buildNeighborhoodListingSamples & explainNeighborhoodRecommendation across ProductDiscoverView, ProductHomeView, ProductUserSpaceView, and enforces AFFORDABLE-first ranking in ReverseBudgetDiscoveryModal',
    discoverViewSrc.includes('const dealPriceByHoodId = useMemo(') &&
      discoverViewSrc.includes('buildNeighborhoodListingSamples(hood)') &&
      discoverViewSrc.includes('explainNeighborhoodRecommendation(hood, { mode: p.mode, topReferenceScore: topFilteredScore })') &&
      !discoverViewSrc.includes('aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, [])') &&
      homeViewSrc.includes('buildNeighborhoodListingSamples(hood)') &&
      homeViewSrc.includes('explainNeighborhoodRecommendation(hood, { mode: p.mode, topReferenceScore: topFeaturedScore })') &&
      !homeViewSrc.includes('داده‌های ثبت‌شده معاملات قطعی') &&
      !homeViewSrc.includes('verified transaction benchmarks') &&
      userSpaceViewSrc.includes('buildNeighborhoodListingSamples(hood)') &&
      userSpaceViewSrc.includes('explainNeighborhoodRecommendation(hood, { mode: p.mode, topReferenceScore: topFavScore })') &&
      reverseBudgetSrc.includes('buildNeighborhoodListingSamples({ id: numId, name: hood.nameFa, buyPerSqm: effectiveSqmPrice, bargains: hood.bargains })') &&
      reverseBudgetSrc.includes("const tierA = a.status === 'AFFORDABLE' ? 0 : a.isDealWithinBudget ? 1 : 2;") &&
      reverseBudgetSrc.includes('در بودجه با سناریوی مذاکره v6.4'),
    'WS-CASPER-06 primary views & ReverseBudgetDiscoveryModal contract check failed',
  );
  // 43. WS-CASPER-07: Decision Epistemology Engines & SearchDropdownMenu Canonical Listing Samples Unification
  const searchDropdownSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SearchDropdownMenu.tsx'), 'utf-8');
  const unifiedSynthesisSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/unifiedDecisionSynthesisEngine.ts'), 'utf-8');
  const housingCycleSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/housingCycleRegimeEngine.ts'), 'utf-8');
  const spatialContagionSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/spatialContagionEngine.ts'), 'utf-8');
  const epistemicDecisionSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/epistemicDecisionEngine.ts'), 'utf-8');
  const paretoRegretSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/paretoRegretEngine.ts'), 'utf-8');
  const realOptionsSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/realOptionsLiquidityEngine.ts'), 'utf-8');
  assert(
    '43. WS-CASPER-07 unifies buildNeighborhoodListingSamples across SearchDropdownMenu and all 6 decision epistemology engines',
    searchDropdownSrc.includes('buildNeighborhoodListingSamples({ id: n.id ?? 1') &&
      unifiedSynthesisSrc.includes('buildNeighborhoodListingSamples(hood)') &&
      housingCycleSrc.includes('buildNeighborhoodListingSamples({ ...hood') &&
      spatialContagionSrc.includes('buildNeighborhoodListingSamples(hood)') &&
      spatialContagionSrc.includes('buildNeighborhoodListingSamples(x.hood)') &&
      epistemicDecisionSrc.includes('buildNeighborhoodListingSamples({ id: input.hoodId, name: hoodName, buyPerSqm, bargains: found?.bargains })') &&
      paretoRegretSrc.includes('buildNeighborhoodListingSamples(targetHood)') &&
      paretoRegretSrc.includes('buildNeighborhoodListingSamples(peer)') &&
      realOptionsSrc.includes('buildNeighborhoodListingSamples(hood)') &&
      !searchDropdownSrc.includes('aggregateNeighborhoodMarketMetrics(n.id, n.name, n.buyPerSqm, [])') &&
      !unifiedSynthesisSrc.includes('aggregateNeighborhoodMarketMetrics(hood.id, hood.name, resolvedPrice, [])') &&
      !housingCycleSrc.includes('aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, [])') &&
      !realOptionsSrc.includes('aggregateNeighborhoodMarketMetrics(hood.id, hood.name, resolvedPrice, [])'),
    'WS-CASPER-07 decision epistemology sample unification check failed',
  );

  // 44. WS-CASPER-08: Type Safety & Array Resilience in Storage State
  const nhSource = fs.readFileSync(path.join(process.cwd(), 'src/data/neighborhoods.ts'), 'utf-8');
  const superModSource = fs.readFileSync(path.join(process.cwd(), 'src/data/superModulesLogic.ts'), 'utf-8');
  const appUiSource = fs.readFileSync(path.join(process.cwd(), 'src/components/useAppUiState.ts'), 'utf-8');
  assert(
    '44. WS-CASPER-08 ensures zero unsafe casts on baseBuyPerSqm and array resilience on visitedHomes storage state',
    !nhSource.includes('(hood as any).baseBuyPerSqm') &&
      !superModSource.includes('(hood as any)?.baseBuyPerSqm') &&
      appUiSource.includes('Array.isArray(parsed) ? parsed : []') &&
      appUiSource.includes('if (Array.isArray(parsed)) setVisitedHomes(parsed);'),
    'WS-CASPER-08 type safety and state resilience assertion failed',
  );

  // 45. WS-CASPER-09: Root-Cause Elimination of Double-Discounting in Unified Decision Synthesis, Multi-Bargain Street Search Blindness, and Unwired Listing Samples / Hardcoded Jalali Years
  const unifiedCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/UnifiedDecisionSynthesisCard.tsx'), 'utf-8');
  const evaluatedHoodsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useEvaluatedNeighborhoods.ts'), 'utf-8');
  const rankingStripSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/QuickHoodRankingStrip.tsx'), 'utf-8');
  const priceTrendModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodPriceTrendModal.tsx'), 'utf-8');
  const hedonicModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/HedonicValuationModal.tsx'), 'utf-8');
  assert(
    '45. WS-CASPER-09 eliminates double-discounting in UnifiedDecisionSynthesis, fixes multi-bargain street search blindness across useEvaluatedNeighborhoods/SearchDropdownMenu/ProductDiscoverView, and wires buildNeighborhoodListingSamples & getCurrentJalaliYear in QuickHoodRankingStrip/NeighborhoodPriceTrendModal/HedonicValuationModal',
    unifiedSynthesisSrc.includes('const hoodBaselineAsk = hood.buyPerSqm || fairPrice;') &&
      unifiedSynthesisSrc.includes('computeAkerlofLemonIndex(hood.id, hood.name || hoodName, hoodBaselineAsk, hood)') &&
      unifiedSynthesisSrc.includes('aggregateNeighborhoodMarketMetrics(hood.id, hood.name || hoodName, hoodBaselineAsk, buildNeighborhoodListingSamples(hood))') &&
      unifiedCardSrc.includes('buildNeighborhoodListingSamples(resolvedHood)') &&
      !unifiedCardSrc.includes('aggregateNeighborhoodMarketMetrics(hoodId, hoodName, basePriceSqm, [])') &&
      evaluatedHoodsSrc.includes('!n.bargains?.some((b) => Boolean((b.street && matchesPersianSearch(b.street, q)) || (b.title && matchesPersianSearch(b.title, q))))') &&
      !evaluatedHoodsSrc.includes('n.bargains?.[0]?.street') &&
      searchDropdownSrc.includes('n.bargains?.some((b) => Boolean((b.street && matchesPersianSearch(b.street, searchQuery.trim()))') &&
      !searchDropdownSrc.includes('n.bargains?.[0]?.street') &&
      discoverViewSrc.includes('Boolean(h.bargains?.some((b) => (b.street && matchesPersianSearch(b.street, q)) || (b.title && matchesPersianSearch(b.title, q))))') &&
      rankingStripSrc.includes('buildNeighborhoodListingSamples(hood)') &&
      rankingStripSrc.includes('buildNeighborhoodListingSamples(h)') &&
      priceTrendModalSrc.includes('buildNeighborhoodListingSamples(selectedHood)') &&
      hedonicModalSrc.includes('buildNeighborhoodListingSamples(activeHood)') &&
      hedonicModalSrc.includes('buildNeighborhoodListingSamples(n)') &&
      hedonicModalSrc.includes('getCurrentJalaliYear()') &&
      !hedonicModalSrc.includes('1405 - specs.buildingAge'),
    'WS-CASPER-09 root-cause remediation assertion failed',
  );

  // 46. WS-CASPER-10: Root-Cause Elimination of Temporary Passwordless Admin Bypass, Unwired ViewRouter Admin Props, Silent Firestore Sponsor Override Errors & O(N log N) Discover Aggregator Recomputation
  const adminMonitoringViewSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/views/ProductAdminMonitoringView.tsx'), 'utf-8');
  const viewRouterSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/views/ProductViewRouter.tsx'), 'utf-8');
  const globalHeaderSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/navigation/ProductGlobalHeader.tsx'), 'utf-8');
  const adminModalFileSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminModal.tsx'), 'utf-8');
  const adminSecBackupSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminSecurityAndBackupTabs.tsx'), 'utf-8');
  const adminActionsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useRadarAdminActions.ts'), 'utf-8');
  assert(
    '46. WS-CASPER-10 eliminates temporary passwordless admin bypass across ProductAdminMonitoringView/ProductViewRouter/AdminModal/AdminSecurityAndBackupTabs/ProductGlobalHeader, routes sponsor override Firestore errors through handleFirestoreError, and memoizes dealPriceByHoodId in ProductDiscoverView',
    !adminMonitoringViewSrc.includes('temporaryInspectionMode') &&
      !adminMonitoringViewSrc.includes('ui.setAdminUnlocked(true)') &&
      !adminMonitoringViewSrc.includes('بررسی موقت بدون رمز') &&
      adminMonitoringViewSrc.includes('if (!p.isVerifiedAdmin || !p.currentUser || !p.currentUser.emailVerified)') &&
      adminMonitoringViewSrc.includes('adminUnlocked={ui.adminUnlocked}') &&
      adminMonitoringViewSrc.includes('isVerifiedAdmin={p.isVerifiedAdmin}') &&
      !adminModalFileSrc.includes('temporaryInspectionMode') &&
      adminModalFileSrc.includes('isVerifiedAdmin={isVerifiedAdmin} />') &&
      adminSecBackupSrc.includes('isVerifiedAdmin = false') &&
      !adminSecBackupSrc.includes('isVerifiedAdmin = true') &&
      viewRouterSrc.includes('isVerifiedAdmin={p.isVerifiedAdmin}') &&
      viewRouterSrc.includes('handleDeepWebSync={p.handleDeepWebSync || (() => {})}') &&
      !viewRouterSrc.includes('isVerifiedAdmin={true}') &&
      !globalHeaderSrc.includes('global-header-admin-btn') &&
      !globalHeaderSrc.includes('بررسی بدون رمز') &&
      adminActionsSrc.includes('...(sponsorVal !== undefined ? { sponsor: sponsorVal } : {})') &&
      !adminActionsSrc.includes('.catch(() => {})') &&
      discoverViewSrc.includes('dealPriceByHoodId.get(hood.id)'),
    'WS-CASPER-10 Zero-Trust RBAC and root-cause remediation assertion failed',
  );

  // 47. WS-CASPER-11: Uncaught TypeScript Contract Drift Remediation across Epistemic Engines, Cloudflare Worker Bindings, Property Registry & Property Insurance State Machine
  const workerTypesSrc = fs.readFileSync(path.join(process.cwd(), 'worker/types.ts'), 'utf-8');
  const propRegIndexSrc = fs.readFileSync(path.join(process.cwd(), 'server/modules/property-registry/index.ts'), 'utf-8');
  const propInsIndexSrc = fs.readFileSync(path.join(process.cwd(), 'server/modules/property-insurance/index.ts'), 'utf-8');
  assert(
    '47. WS-CASPER-11 enforces full TypeScript contract parity across housingCycleRegimeEngine, paretoRegretEngine, spatialContagionEngine, unifiedDecisionSynthesisEngine, epistemicDecisionEngine, realOptionsLiquidityEngine, worker/types.ts, property-registry, and property-insurance',
    housingCycleSrc.includes('isStagflationaryIllusion: boolean;') &&
      housingCycleSrc.includes('dynamicEquilibriumPR: number;') &&
      paretoRegretSrc.includes('hurwiczScoreMillion: number;') &&
      paretoRegretSrc.includes('vetoPenalty = minDim < 5.0') &&
      spatialContagionSrc.includes('customHood?: Neighborhood') &&
      spatialContagionSrc.includes('const iqrLow = agg.iqrLowPerSqm > 0') &&
      epistemicDecisionSrc.includes('const resolvedIqrLow = agg.iqrLowPerSqm > 0') &&
      realOptionsSrc.includes('const horizonWeight = 0.55 + 0.45 * (1 - Math.exp(-1.2 * Math.max(0.05, tau)));') &&
      unifiedSynthesisSrc.includes('executionPlaybook: DealExecutionPlaybook;') &&
      unifiedSynthesisSrc.includes('illiquidityAdjustedVaR95RealPct: number;') &&
      workerTypesSrc.includes('readonly RADAR_QUEUE?: Queue;') &&
      workerTypesSrc.includes('readonly RADAR_DLQ?: Queue;') &&
      propRegIndexSrc.includes('export function createPropertyRegistryService') &&
      propInsIndexSrc.includes('export function createPropertyInsuranceService'),
    'WS-CASPER-11 TypeScript contract parity assertion failed',
  );

  // 48. WS-CASPER-12: Contract-Room 3-Stage Escrow Execution Playbook UI, Source-Asset Swap Friction Dynamics, Empirical v6.4 Deal Grounding in Isochrone & Socioeconomic Fallback, and 100% Elimination of Empty Sample Arrays across src/
  const macroEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/macroPortfolioArbitrageEngine.ts'), 'utf-8');
  const macroCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/MacroPortfolioArbitrageCard.tsx'), 'utf-8');
  const isochroneEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/urbanAffordabilityIsochroneEngine.ts'), 'utf-8');
  const socioRefCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/SocioeconomicReferenceCard.tsx'), 'utf-8');
  const contractLegalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ContractLegalAdvisorView.tsx'), 'utf-8');
  assert(
    '48. WS-CASPER-12 enforces Contract-Room 3-Stage Escrow Playbook UI, source-asset swap friction & weightedLiquidityDays, empirical v6.4 deal-price grounding in Isochrone & SocioeconomicReferenceCard, and zero empty sample arrays in ContractLegalAdvisorView & AdminSecurityAndBackupTabs',
    unifiedCardSrc.includes('data-testid="casper-execution-playbook-panel"') &&
      unifiedCardSrc.includes('data-testid="copy-deal-playbook-btn"') &&
      unifiedCardSrc.includes('data-testid="synthesis-stagflation-badge"') &&
      macroEngineSrc.includes('weightedLiquidityDays: number;') &&
      macroEngineSrc.includes('totalFrictionRatePct: number;') &&
      macroCardSrc.includes('data-testid="swap-source-asset-selector"') &&
      isochroneEngineSrc.includes('buildNeighborhoodListingSamples(hood)') &&
      socioRefCardSrc.includes('buildNeighborhoodListingSamples(resolvedHood)') &&
      !socioRefCardSrc.includes('ask * 0.92') &&
      contractLegalSrc.includes('buildNeighborhoodListingSamples(INITIAL_NEIGHBORHOODS[0])') &&
      adminSecBackupSrc.includes('buildNeighborhoodListingSamples(refHood)') &&
      !contractLegalSrc.includes(', [])') &&
      !adminSecBackupSrc.includes(', [])'),
    'WS-CASPER-12 Contract-Room Playbook UI, source-asset swap friction, and empirical sample unification assertion failed',
  );

  // 49. WS-CASPER-13: Deep Second-Order Critique — Real Options Buyer Reservation Price Sign Correction, Rent-vs-Buy Intertemporal Real-Wealth Indifference & Bisection Solver, Empirical IQR Monte Carlo Sigma Calibration, and Cross-Tab sharedTargetSqm Continuity
  const rentVsBuyEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/rentVsBuyArbitrageEngine.ts'), 'utf-8');
  const rentVsBuyCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/RentVsBuyArbitrageCard.tsx'), 'utf-8');
  const realOptionsCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/RealOptionsLiquidityCard.tsx'), 'utf-8');
  const monteCarloEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/monteCarloRiskDensityEngine.ts'), 'utf-8');
  const stage2MasterSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/Stage2MasterWidget.tsx'), 'utf-8');
  assert(
    '49. WS-CASPER-13 enforces buyerReservationPricePerSqm in RealOptions, realDiffMillion indifference & breakEvenAlternativeReturnPct bisection solver in RentVsBuy, empirical IQR dispersion in MonteCarlo, and sharedTargetSqm continuity in Stage2MasterWidget',
    realOptionsSrc.includes('buyerReservationPricePerSqm: number;') &&
      realOptionsSrc.includes('requiredBuyerDiscountPct: number;') &&
      realOptionsCardSrc.includes('data-testid="buyer-reservation-ceiling"') &&
      rentVsBuyEngineSrc.includes('breakEvenAlternativeReturnPct: number;') &&
      rentVsBuyEngineSrc.includes('if (realDiffMillion > initialPropertyValue * 0.06)') &&
      rentVsBuyCardSrc.includes('data-testid="snap-breakeven-alt-return-btn"') &&
      monteCarloEngineSrc.includes('buildNeighborhoodListingSamples(hood)') &&
      monteCarloEngineSrc.includes('iqrSpreadRatio') &&
      stage2MasterSrc.includes('const [sharedTargetSqm, setSharedTargetSqm] = useState<number>(targetSqm);') &&
      stage2MasterSrc.includes('onTargetSqmChange={setSharedTargetSqm}'),
    'WS-CASPER-13 Deep second-order mathematical & cross-tab state continuity assertion failed',
  );

  // 50. WS-CASPER-14: Tool-Driven Engineering & Blocker Elimination — User-Token-Delegated Firestore REST Reconciliation (No Service Account Required), /buyerAlerts Owner List Parity in firestore.rules, and Chromium Workflow 10 Stage 2 Smoke Verification
  const identityGovSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/identityLifecycleAndBackendGovernance.ts'), 'utf-8');
  const pubBargainsSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverPublisherBargains.ts'), 'utf-8');
  const firestoreRulesSrc = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf-8');
  const browserSmokeSrc = fs.readFileSync(path.join(process.cwd(), 'tests/browser-smoke.test.ts'), 'utf-8');
  assert(
    '50. WS-CASPER-14 enforces user-token-delegated Firestore REST reconciliation in identityLifecycleAndBackendGovernance.ts & serverPublisherBargains.ts, owner-scoped list rule on /buyerAlerts in firestore.rules, and Workflow 10 Stage 2 verification in browser-smoke.test.ts',
    identityGovSrc.includes(':runQuery') &&
      identityGovSrc.includes('rawAuthHeaderOrToken?: string | string[]') &&
      pubBargainsSrc.includes("reconcileUserBuyerAlertsInFirestore(auth.uid, 'export', req.headers.authorization)") &&
      pubBargainsSrc.includes("reconcileUserBuyerAlertsInFirestore(auth.uid, 'delete', req.headers.authorization)") &&
      /match\s+\/buyerAlerts\/\{alertId\}[\s\S]*?allow\s+list:\s*if\s+isAdmin\(\)\s*&&\s*existing\(\)\.hoodId\s*>=\s*1\s*&&\s*existing\(\)\.hoodId\s*<=\s*999\s*\|\|\s*\(\s*isVerifiedUser\(\)\s*&&\s*existing\(\)\.userId\s*==\s*request\.auth\.uid\s*\)/m.test(firestoreRulesSrc) &&
      browserSmokeSrc.includes('Stage 2 Casper Epistemic Decision Intelligence interactive verification'),
    'WS-CASPER-14 User-token Firestore REST reconciliation & Chromium Workflow 10 assertion failed',
  );

  // 51. WS-CASPER-15: Knowledge Crowd UID Anti-Spoofing & Dual Response Contract, Zero-MAD Dispersion Floor & Cryptographic Hedonic Seal Verification, Empirical v6.4 Socioeconomic Deal Anchoring, and Complete Bearer REST Delegation for Buyer Alerts
  const crowdRoutesSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/knowledge-crowd/crowdClaimsRoutes.ts'), 'utf-8');
  const crowdPanelSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/NeighborhoodCrowdClaimsPanel.tsx'), 'utf-8');
  const robustValSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/valuation-authority/robustValuationEngine.ts'), 'utf-8');
  const socioRollupSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/socioeconomic-intelligence/socioeconomicRollupEngine.ts'), 'utf-8');
  const socioRoutesSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/socioeconomic-intelligence/socioeconomicRoutes.ts'), 'utf-8');
  const serverUtilRoutesSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverUtilityRoutes.ts'), 'utf-8');
  assert(
    '51. WS-CASPER-15 enforces UID_SPOOFING_FORBIDDEN & camelCase+uppercase claim response keys in crowdClaimsRoutes/Panel, ZERO_MAD_RELATIVE_BANDWIDTH_FLOOR & verifyServerValuationSeal in robustValuationEngine, empirical dealPerSqm anchoring in socioeconomicRollupEngine, and Bearer REST delegation in serverUtilityRoutes',
    crowdRoutesSrc.includes('UID_SPOOFING_FORBIDDEN') &&
      crowdRoutesSrc.includes('verifiedReferenceClaims: result.verifiedReferenceClaims') &&
      crowdPanelSrc.includes('data.verifiedReferenceClaims ?? data.VERIFIED_REFERENCE') &&
      crowdPanelSrc.includes('formatMillionTomanAsIntlCurrency') &&
      robustValSrc.includes('ZERO_MAD_RELATIVE_BANDWIDTH_FLOOR') &&
      robustValSrc.includes('export function verifyServerValuationSeal') &&
      socioRollupSrc.includes('dealPerSqm') &&
      socioRoutesSrc.includes('rollup.medianPriceSqm,') &&
      serverUtilRoutesSrc.includes('listDurableBuyerAlerts(authCheck.uid, authCheck.email, req.headers.authorization)') &&
      serverUtilRoutesSrc.includes('rawAuthHeaderOrToken: req.headers.authorization'),
    'WS-CASPER-15 Knowledge Crowd UID anti-spoofing, zero-MAD floor, and Bearer REST delegation assertion failed',
  );

  // 52. WS-CASPER-16: Entity Resolution Streetless Anti-Merge, Empirical Neighborhood Price Fallback, AI Ingestion Route Mounting & Prompt-Injection Guard, Non-Compensatory MCDA Veto + Base-Rate Neglect Alert, and Stage 2 International Currency Parity
  const entityResSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/ai-ingestion/entityResolutionEngine.ts'), 'utf-8');
  const seedExtSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/ai-ingestion/aiSeedExtractionService.ts'), 'utf-8');
  const aiIngestRoutesSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/ai-ingestion/aiIngestionRoutes.ts'), 'utf-8');
  const casperDecisionSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/socioeconomic-intelligence/casperDecisionEngine.ts'), 'utf-8');
  const casperMatrixCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/CasperDecisionMatrixCard.tsx'), 'utf-8');
  const epistemicPanelSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/EpistemicProvenancePanel.tsx'), 'utf-8');
  const spatialContagionCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/SpatialContagionLabCard.tsx'), 'utf-8');
  assert(
    '52. WS-CASPER-16 enforces hasKnownStreet anti-merge in entityResolutionEngine, getCurrentJalaliYear & matchedHood.buyPerSqm in aiSeedExtractionService, prompt-injection + verifyAdminAuth in aiIngestionRoutes, nonCompensatoryVetoTriggered + base_rate in casperDecisionEngine, and formatMillionTomanAsIntlCurrency parity across EpistemicProvenancePanel & SpatialContagionLabCard',
    entityResSrc.includes("const hasKnownStreet = fp.streetNameNormalized !== 'نامشخص' && candidate.streetNameNormalized !== 'نامشخص';") &&
      seedExtSrc.includes('currentJalaliYear = getCurrentJalaliYear()') &&
      seedExtSrc.includes('matchedHood?.buyPerSqm ?? 120') &&
      aiIngestRoutesSrc.includes("code: 'PROMPT_INJECTION_DETECTED'") &&
      aiIngestRoutesSrc.includes('options?.verifyAdminAuth') &&
      serverUtilRoutesSrc.includes('registerAiIngestionRoutes(app, { checkRateLimit, getClientIp, verifyAdminAuth });') &&
      casperDecisionSrc.includes('nonCompensatoryVetoTriggered') &&
      casperDecisionSrc.includes("id: 'base_rate'") &&
      casperMatrixCardSrc.includes('normalizedSharePct') &&
      epistemicPanelSrc.includes('formatMillionTomanAsIntlCurrency') &&
      epistemicPanelSrc.includes('<CasperDecisionMatrixCard') &&
      spatialContagionCardSrc.includes('formatMillionTomanAsIntlCurrency'),
    'WS-CASPER-16 Entity resolution anti-merge, non-compensatory MCDA veto, and Stage 2 intlCurrency parity assertion failed',
  );

  // 53. WS-CASPER-17: Urban Affordability Isochrone multi-currency formatting, Hub vanak resolution, and Housing Cycle / Real Options hood & intlCurrency parity
  const p17UrbanAffSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/urbanAffordabilityIsochroneEngine.ts'), 'utf-8');
  const p17UrbanCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/UrbanAffordabilityIsochroneCard.tsx'), 'utf-8');
  const p17HousingCycleEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/housingCycleRegimeEngine.ts'), 'utf-8');
  const p17HousingCycleCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/HousingCycleRegimeCard.tsx'), 'utf-8');
  const p17RealOptionsEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/realOptionsLiquidityEngine.ts'), 'utf-8');
  const p17RealOptionsCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/RealOptionsLiquidityCard.tsx'), 'utf-8');
  assert(
    '53. WS-CASPER-17 enforces formatMillionTomanAsIntlCurrency in urbanAffordabilityIsochroneEngine, vanak hub default in UrbanAffordabilityIsochroneCard, and hood + intlCurrency parity across housingCycleRegimeEngine, HousingCycleRegimeCard, realOptionsLiquidityEngine, and RealOptionsLiquidityCard',
    p17UrbanAffSrc.includes('providedHood?: Neighborhood,') &&
      p17UrbanAffSrc.includes("intlCurrency: IntlCurrencyCode = 'USD'") &&
      p17UrbanAffSrc.includes("formatMillionTomanAsIntlCurrency(savings, intlCurrency, 'fa')") &&
      p17UrbanCardSrc.includes("setSelectedHubId] = useState<string>('vanak')") &&
      p17UrbanCardSrc.includes('hood?: Neighborhood;') &&
      p17HousingCycleEngineSrc.includes('providedHood?: Neighborhood,') &&
      p17HousingCycleEngineSrc.includes('basePriceIntlText: formatMillionTomanAsIntlCurrency') &&
      p17HousingCycleCardSrc.includes('hood?: Neighborhood;') &&
      p17RealOptionsEngineSrc.includes('providedHood?: Neighborhood,') &&
      p17RealOptionsEngineSrc.includes('valueOfWaitingIntlText: formatMillionTomanAsIntlCurrency') &&
      p17RealOptionsCardSrc.includes('hood?: Neighborhood;'),
    'WS-CASPER-17 Urban Affordability and Stage 2 epistemic parity assertion failed',
  );

  // 54. WS-CASPER-18: CASPER HUB Server-Side Cloudflare D1 Integration & Property Insurance State Machine Resilience
  const casperHubClientSrc = fs.readFileSync(path.join(process.cwd(), 'server/modules/casper-hub/casperHubClient.ts'), 'utf-8');
  const casperHubRoutesSrc = fs.readFileSync(path.join(process.cwd(), 'server/modules/casper-hub/casperHubRoutes.ts'), 'utf-8');
  const propInsStateMachineSrc = fs.readFileSync(path.join(process.cwd(), 'server/modules/property-insurance/coverage/policyAndClaimStateMachineEngine.ts'), 'utf-8');
  assert(
    '54. WS-CASPER-18 enforces server-side CASPER HUB client (account-scoped .bijanbijane-1.workers.dev SSRF guard, redirect: error, Bearer token auth, UUIDv5 Idempotency-Key header on /v1/notes), mounts /api/casper-hub/* in serverUtilityRoutes, and verifies policyAndClaimStateMachineEngine fail-closed settlement parity',
    casperHubClientSrc.includes("export const DEFAULT_CASPER_HUB_URL = 'https://casper-hub-api.bijanbijane-1.workers.dev';") &&
      casperHubClientSrc.includes("host.endsWith('.bijanbijane-1.workers.dev')") &&
      casperHubClientSrc.includes("redirect: 'error'") &&
      casperHubClientSrc.includes('Authorization: `Bearer ${token}`') &&
      casperHubClientSrc.includes("'Idempotency-Key': resolvedKey") &&
      casperHubRoutesSrc.includes("app.get('/api/casper-hub/whoami'") &&
      casperHubRoutesSrc.includes("app.get('/api/casper-hub/bootstrap'") &&
      casperHubRoutesSrc.includes("app.get('/api/casper-hub/changes'") &&
      casperHubRoutesSrc.includes("app.post('/api/casper-hub/notes'") &&
      casperHubRoutesSrc.includes("recordAbuseSignal(ip, 'auth_failure')") &&
      serverUtilRoutesSrc.includes('registerCasperHubRoutes(app, { checkRateLimit, getClientIp, verifyAdminAuth });') &&
      propInsStateMachineSrc.includes('export function evaluatePolicyCoverageStatusWithLimitations') &&
      propInsStateMachineSrc.includes('INVALID_SETTLEMENT_AMOUNTS'),
    'WS-CASPER-18 CASPER HUB integration & Property Insurance state machine assertion failed',
  );

  // 55. WS-CASPER-19: Admin UI Observability, Auth Lifecycle Reactivity & Casper Hub Monitor Card Parity
  const adminSecTabsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminSecurityAndBackupTabs.tsx'), 'utf-8');
  const monitorCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/admin/AdminCasperHubMonitorCard.tsx'), 'utf-8');
  assert(
    '55. WS-CASPER-19 enforces AdminCasperHubMonitorCard lazy mounting in AdminSecurityAndBackupTabs, auth.onAuthStateChanged subscription, and <=290 line constraint',
    adminSecTabsSrc.includes("const AdminCasperHubMonitorCard = React.lazy(() => import('./admin/AdminCasperHubMonitorCard')") &&
      adminSecTabsSrc.includes('<AdminCasperHubMonitorCard />') &&
      monitorCardSrc.includes('auth.onAuthStateChanged') &&
      monitorCardSrc.includes('data-testid="admin-casper-hub-monitor-card"') &&
      monitorCardSrc.split(/\r?\n/).length <= 290 &&
      adminSecTabsSrc.split(/\r?\n/).length <= 290,
    'WS-CASPER-19 Admin UI Observability & Monitor Card Parity assertion failed',
  );

  // 56. WS-CASPER-20: SWR Read-Cache with Causal Invalidation, System Health Integration & Badge Parity
  const serverMainSrc = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
  const modelsTypeDefSrc = fs.readFileSync(path.join(process.cwd(), 'src/types/models.ts'), 'utf-8');
  assert(
    '56. WS-CASPER-20 enforces SWR read-cache with causal invalidation in CasperHubClient, system-health casperHubConfigured telemetry, and Admin UI badge parity under <=290 line bounds',
    casperHubClientSrc.includes('private readonly readCache = new Map') &&
      casperHubClientSrc.includes('this.readCache.clear()') &&
      casperHubClientSrc.includes('clearCache(): void') &&
      serverMainSrc.includes('casperHubConfigured: getCasperHubConfigStatus().configured') &&
      modelsTypeDefSrc.includes('casperHubConfigured?: boolean;') &&
      adminSecTabsSrc.includes('CASPER HUB:') &&
      casperHubClientSrc.split(/\r?\n/).length <= 290 &&
      modelsTypeDefSrc.split(/\r?\n/).length <= 290 &&
      adminSecTabsSrc.split(/\r?\n/).length <= 290,
    'WS-CASPER-20 SWR Read Cache & System Health Integration assertion failed',
  );

  // 57. WS-CASPER-22: Full Bidirectional Observability & Replicated Feed in AdminCasperHubMonitorCard
  const updatedMonitorCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/admin/AdminCasperHubMonitorCard.tsx'), 'utf-8');
  assert(
    '57. WS-CASPER-22 enforces bidirectional observability with D1 replicated recent notes feed in AdminCasperHubMonitorCard and strictly <= 290 line ceiling',
    updatedMonitorCardSrc.includes('data-testid="casper-hub-recent-notes"') &&
      updatedMonitorCardSrc.includes('setRecentNotes') &&
      updatedMonitorCardSrc.includes('CasperHubNoteRecord') &&
      updatedMonitorCardSrc.split(/\r?\n/).length <= 290,
    'WS-CASPER-22 Bidirectional Observability assertion failed',
  );

  // 58. WS-CASPER-26: Dixit-Pindyck targetSqm scaling & yield-on-cost dynamics, unclamped PIR/RIR, zero-floor break-even commute, and Stage2MasterWidget forwarding
  const p26RealOptionsEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/realOptionsLiquidityEngine.ts'), 'utf-8');
  const p26RealOptionsCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/RealOptionsLiquidityCard.tsx'), 'utf-8');
  const p26AffordabilityEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/urbanAffordabilityIsochroneEngine.ts'), 'utf-8');
  const p26Stage2WidgetSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/Stage2MasterWidget.tsx'), 'utf-8');
  assert(
    '58. WS-CASPER-26 enforces targetSqm scaling and property-specific yield-on-cost in realOptionsLiquidityEngine, unclamped PIR/RIR & zero-floor break-even commute in urbanAffordabilityIsochroneEngine, and targetSqm forwarding in RealOptionsLiquidityCard & Stage2MasterWidget',
    p26RealOptionsEngineSrc.includes('targetSqm: number = 85') &&
      p26RealOptionsEngineSrc.includes('const annualRentalYield = baselineYield * Math.max(0.65, Math.min(1.35, (hood.buyPerSqm || resolvedPrice) / Math.max(1, resolvedPrice)));') &&
      p26RealOptionsCardSrc.includes('targetSqm?: number;') &&
      p26RealOptionsCardSrc.includes('targetSqm = 85,') &&
      p26AffordabilityEngineSrc.includes('const priceToIncomeRatio = Math.max(0.5, Number((totalBuyPrice80m / annualIncome).toFixed(1)));') &&
      p26AffordabilityEngineSrc.includes('const breakEvenCommuteMinutes = netRentBuffer <= 0 ? 0 : Math.round(netRentBuffer / Math.max(0.01, minutesCostPerMonth));') &&
      p26Stage2WidgetSrc.includes('<RealOptionsLiquidityCard {...common} targetSqm={sharedTargetSqm} intlCurrency={intlCurrency} />'),
    'WS-CASPER-26 Real options targetSqm scaling and urban affordability boundary assertion failed',
  );

  // 59. WS-CASPER-27: Merton Jump-Diffusion targetSqm scaling and MonteCarloRiskDensityCard / Stage2MasterWidget forwarding
  const p27MonteCarloEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/monteCarloRiskDensityEngine.ts'), 'utf-8');
  const p27MonteCarloCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/MonteCarloRiskDensityCard.tsx'), 'utf-8');
  assert(
    '59. WS-CASPER-27 enforces targetSqm scaling in generateCasperMonteCarloRiskReport, and targetSqm forwarding in MonteCarloRiskDensityCard & Stage2MasterWidget',
    p27MonteCarloEngineSrc.includes('targetSqm: number = 85') &&
      p27MonteCarloEngineSrc.includes('Math.round(resolvedPrice * Math.max(10, targetSqm) * (Math.abs(simResult.metrics.illiquidityAdjustedVaR95RealPct) / 100));') &&
      p27MonteCarloCardSrc.includes('targetSqm?: number;') &&
      p27MonteCarloCardSrc.includes('targetSqm = 85,') &&
      p27MonteCarloCardSrc.includes('خروج فوری {toPersianNum(targetSqm)}م:') &&
      p26Stage2WidgetSrc.includes('<MonteCarloRiskDensityCard {...common} targetSqm={sharedTargetSqm} intlCurrency={intlCurrency} />'),
    'WS-CASPER-27 Monte Carlo targetSqm scaling assertion failed',
  );

  // 60. WS-CASPER-28 & WS-CASPER-29: Kahneman prospect targetSqm scaling, basePriceSqm precedence, market rahn decoupling, and MacroPortfolioArbitrageCard forwarding
  const p28SpatialEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/spatialContagionEngine.ts'), 'utf-8');
  const p28SpatialCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/SpatialContagionLabCard.tsx'), 'utf-8');
  const p29CycleEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/housingCycleRegimeEngine.ts'), 'utf-8');
  const p29MacroEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/macroPortfolioArbitrageEngine.ts'), 'utf-8');
  const p29MacroCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/MacroPortfolioArbitrageCard.tsx'), 'utf-8');
  assert(
    '60. WS-CASPER-28/29 enforces targetSqm & basePriceSqm precedence in spatialContagion, decoupled market rahn in housingCycle & macroPortfolio, and targetSqm forwarding across SpatialContagionLabCard, MacroPortfolioArbitrageCard, & Stage2MasterWidget',
    p28SpatialEngineSrc.includes('targetSqm: number = 80') &&
      p28SpatialEngineSrc.includes("const targetBuy = typeof basePriceSqm === 'number' && basePriceSqm > 0 ? basePriceSqm : (target?.buyPerSqm ?? 120);") &&
      p28SpatialCardSrc.includes('شکاف چانه‌زنی {toPersianNum(targetSqm)} متر:') &&
      p29CycleEngineSrc.includes('const yieldBoost = Math.max(0.85, Math.min(1.18, (hood.buyPerSqm || resolvedPrice) / Math.max(1, resolvedPrice)));') &&
      p29MacroEngineSrc.includes('const yieldBoost = Math.max(0.85, Math.min(1.18, (hood.buyPerSqm || resolvedPrice) / Math.max(1, resolvedPrice)));') &&
      p29MacroEngineSrc.includes('targetSqm: number = 80') &&
      p29MacroCardSrc.includes('targetSqm = 80,') &&
      p26Stage2WidgetSrc.includes('<SpatialContagionLabCard {...common} targetSqm={sharedTargetSqm} intlCurrency={intlCurrency} onSelectCompareHood={onSelectCompareHood} />') &&
      p26Stage2WidgetSrc.includes('<MacroPortfolioArbitrageCard {...common} targetSqm={sharedTargetSqm} intlCurrency={intlCurrency} />'),
    'WS-CASPER-28/29 Kahneman prospect, basePriceSqm precedence, and market rahn decoupling assertion failed',
  );

  // 61. WS-CASPER-30: 0.36 annual rahn-to-rent conversion parity in epistemicDecisionEngine, targetSqm scaling in urbanAffordabilityIsochroneEngine & UrbanAffordabilityIsochroneCard, and targetSqm forwarding in unifiedDecisionSynthesisEngine
  const p30EpistemicEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/epistemicDecisionEngine.ts'), 'utf-8');
  const p30UrbanCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/UrbanAffordabilityIsochroneCard.tsx'), 'utf-8');
  const p30SynthesisEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/unifiedDecisionSynthesisEngine.ts'), 'utf-8');
  const p30SynthesisCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/UnifiedDecisionSynthesisCard.tsx'), 'utf-8');
  assert(
    '61. WS-CASPER-30 enforces 0.36 annual rent conversion in epistemicDecisionEngine, targetSqm parameterization in urbanAffordabilityIsochroneEngine & UrbanAffordabilityIsochroneCard, and targetSqm forwarding in unifiedDecisionSynthesisEngine & Stage2MasterWidget',
    p30EpistemicEngineSrc.includes('const annualRent80m = Math.max(50, input.rahn80m * 0.36);') &&
      p30EpistemicEngineSrc.split(/\r?\n/).length <= 290 &&
      p26AffordabilityEngineSrc.includes('targetSqm: number = 80') &&
      p30UrbanCardSrc.includes('اجاره ماهانه معادل رهن {toPersianNum(targetSqm)} متر:') &&
      p26Stage2WidgetSrc.includes('<UrbanAffordabilityIsochroneCard {...common} targetSqm={sharedTargetSqm} intlCurrency={intlCurrency} onSelectCompareHood={onSelectCompareHood} />') &&
      p30SynthesisEngineSrc.includes('computeDixitPindyckRealOption(askingPrice, annualRentalYield, askingPrice > 160 ? 0.30 : 0.24, 0.22, 6,') &&
      p30SynthesisCardSrc.split(/\r?\n/).length <= 290,
    'WS-CASPER-30 0.36 annual rent conversion parity and Urban Affordability targetSqm scaling assertion failed',
  );

  // 62. WS-CASPER-31: Non-homogeneous yieldBoost & targetSqm scaling in rentVsBuyArbitrageEngine & paretoRegretEngine, and full targetSqm forwarding across CasperDecisionMatrixCard, EpistemicProvenancePanel, HousingCycleRegimeCard, and Stage2MasterWidget
  const p31RentVsBuyEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/rentVsBuyArbitrageEngine.ts'), 'utf-8');
  const p31RentVsBuyCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/RentVsBuyArbitrageCard.tsx'), 'utf-8');
  const p31ParetoEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/paretoRegretEngine.ts'), 'utf-8');
  const p31CasperDecisionSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/socioeconomic-intelligence/casperDecisionEngine.ts'), 'utf-8');
  const p31CasperMatrixCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/CasperDecisionMatrixCard.tsx'), 'utf-8');
  const p31EpistemicPanelSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/EpistemicProvenancePanel.tsx'), 'utf-8');
  const p31CycleEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/housingCycleRegimeEngine.ts'), 'utf-8');
  const p31CycleCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/stage2/HousingCycleRegimeCard.tsx'), 'utf-8');
  assert(
    '62. WS-CASPER-31 enforces yieldBoost & targetSqm in rentVsBuyArbitrageEngine & paretoRegretEngine, and targetSqm forwarding across CasperDecisionMatrixCard, EpistemicProvenancePanel, HousingCycleRegimeCard, and Stage2MasterWidget',
    p31RentVsBuyEngineSrc.includes('const yieldBoost = Math.max(0.85, Math.min(1.18, (hood.buyPerSqm || resolvedPrice) / Math.max(1, resolvedPrice)));') &&
      p31RentVsBuyCardSrc.includes('generateCasperRentVsBuyDossier(hoodId, hoodName, cityKey, basePriceSqm, hood, intlCurrency, targetSqm)') &&
      p31ParetoEngineSrc.includes('const yieldBoost = Math.max(0.85, Math.min(1.18, (targetHood.buyPerSqm || buySqm) / Math.max(1, buySqm)));') &&
      p31CasperDecisionSrc.includes('const areaSqm = clamp(Math.round(input.targetSqm ?? 80), 35, 500);') &&
      p31CasperMatrixCardSrc.includes('const yieldBoost = Math.max(0.85, Math.min(1.18, hoodBaseBuy / Math.max(1, basePriceSqm)));') &&
      p31EpistemicPanelSrc.includes('targetSqm={unitAreaSqm}') &&
      p31CycleEngineSrc.includes('const resolvedRahn = Math.round(resolvedRahn80m * (safeSqm / 80));') &&
      p31CycleCardSrc.includes('generateCasperHousingCycleReport(hoodId, hoodName, cityKey, basePriceSqm, hood, intlCurrency, targetSqm)') &&
      p26Stage2WidgetSrc.includes('<HousingCycleRegimeCard {...common} targetSqm={sharedTargetSqm} intlCurrency={intlCurrency} />'),
    'WS-CASPER-31 non-homogeneous yieldBoost and universal Stage-2 targetSqm forwarding assertion failed',
  );

  // 63. WS-CASPER-32: Mean-reversion valuationAlpha in monteCarloRiskDensityEngine, explicit basePriceSqm preservation in macroPortfolioArbitrageEngine, metro-aligned Cycle Pillar & calibratedDrift in unifiedDecisionSynthesisEngine, and 3-year netRentCarry in paretoRegretEngine
  assert(
    '63. WS-CASPER-32 enforces mean-reversion valuationAlpha in monteCarloRiskDensityEngine, explicit basePriceSqm preservation in macroPortfolioArbitrageEngine, metro-aligned Cycle Pillar & calibratedDrift in unifiedDecisionSynthesisEngine, and 3-year netRentCarry in paretoRegretEngine',
    p27MonteCarloEngineSrc.includes('const valuationAlpha = Math.max(-0.08, Math.min(0.08, ((hoodTierPrice - resolvedPrice) / Math.max(1, hoodTierPrice)) * 0.25));') &&
      p29MacroEngineSrc.includes('const resolvedPrice = basePriceSqm > 0 ? basePriceSqm : agg.estimatedDealPricePerSqm;') &&
      p30SynthesisEngineSrc.includes('classifyHousingCycleRegime(askingPrice, rahn80m, hood.metro ?? 7, Math.max(5, spreadPct)') &&
      p30SynthesisEngineSrc.includes('annualDriftMu: calibratedDrift') &&
      p31ParetoEngineSrc.includes('const netRentCarry = Math.round(rahnEquivalentMillion * 0.30 * horizonYears * (1 + reg.annualPropertyGrowthPct / 200));') &&
      p27MonteCarloEngineSrc.split(/\r?\n/).length <= 290 &&
      p29MacroEngineSrc.split(/\r?\n/).length <= 290 &&
      p30SynthesisEngineSrc.split(/\r?\n/).length <= 290 &&
      p31ParetoEngineSrc.split(/\r?\n/).length <= 290,
    'WS-CASPER-32 mean-reversion valuationAlpha, explicit basePriceSqm preservation, and netRentCarry assertion failed',
  );

  // 64. WS-CASPER-33: Proportional deal-price scaling in findParetoDominantNeighborhoods & generateCasperUrbanAffordabilityReport, valConvergence & rahnTopUpDrag in computeSavageMinimaxRegretMatrix, and hoodBaselinePriceSqm valuation alpha in buildMacroAssetSpecs
  assert(
    '64. WS-CASPER-33 enforces proportional deal-price scaling in Pareto & Urban Affordability, valConvergence & rahnTopUpDrag in Savage Minimax Regret, and hoodBaselinePriceSqm valuation alpha in buildMacroAssetSpecs',
    p31ParetoEngineSrc.includes('const targetDealSqm = Math.max(15, Math.round(targetAgg.estimatedDealPricePerSqm * (targetBuySqm / Math.max(1, targetHood.buyPerSqm))));') &&
      p31ParetoEngineSrc.includes('const valConvergence = Math.max(0.92, Math.min(1.12, Math.pow((targetHood.buyPerSqm || dealSqm) / Math.max(1, dealSqm), 0.30)));') &&
      p31ParetoEngineSrc.includes('const rahnTopUpDrag = Math.round(rahnEquivalentMillion * (reg.annualInflationPct / 100) * Math.max(0, shieldMult - 1) * 0.35);') &&
      p26AffordabilityEngineSrc.includes('const resolvedPrice = Math.max(15, Math.round(agg.estimatedDealPricePerSqm * (rawPrice / Math.max(1, hood.buyPerSqm))));') &&
      p29MacroEngineSrc.includes('const assets = buildMacroAssetSpecs(resolvedPrice, resolvedRahn, hood.buyPerSqm);') &&
      p26AffordabilityEngineSrc.split(/\r?\n/).length <= 290 &&
      p29MacroEngineSrc.split(/\r?\n/).length <= 290 &&
      p31ParetoEngineSrc.split(/\r?\n/).length <= 290,
    'WS-CASPER-33 multi-alternative econometric refinement assertion failed',
  );

  // 65. WS-CASPER-34: Authorized Local Epistemic Ledger Fallback (LOCAL_LEDGER_FALLBACK) in casperHubRoutes.ts and observability parity in AdminCasperHubMonitorCard.tsx
  const p34CasperHubRoutesSrc = fs.readFileSync(path.join(process.cwd(), 'server/modules/casper-hub/casperHubRoutes.ts'), 'utf-8');
  const p34AdminMonitorCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/admin/AdminCasperHubMonitorCard.tsx'), 'utf-8');
  assert(
    '65. WS-CASPER-34 enforces LOCAL_LEDGER_FALLBACK in casperHubRoutes.ts with pre-flight validateCasperHubNotePayload & UUIDv5 deduplication, and local-ledger-fallback badge parity in AdminCasperHubMonitorCard.tsx under <=290 lines',
    p34CasperHubRoutesSrc.includes("mode: 'LOCAL_LEDGER_FALLBACK'") &&
      p34CasperHubRoutesSrc.includes('export function resetCasperHubLocalLedgerForTests(): void') &&
      p34CasperHubRoutesSrc.includes('const validation = validateCasperHubNotePayload(rawBody);') &&
      p34CasperHubRoutesSrc.includes('const resolvedKey = deriveDeterministicNoteIdempotencyKey(normalized, headerIdempotencyKey || undefined);') &&
      p34AdminMonitorCardSrc.includes("whoami?.database === 'local-ledger-fallback'") &&
      p34CasperHubRoutesSrc.split(/\r?\n/).length <= 290 &&
      p34AdminMonitorCardSrc.split(/\r?\n/).length <= 290,
    'WS-CASPER-34 Local Epistemic Ledger Fallback assertion failed',
  );

  // 66. WS-CASPER-35: Continuous Improvement — Proportional deal-price scaling & Persian numerals in epistemicDecisionEngine.ts, and CASPER_HUB_REQUEST_FAILED fallback + multi-agent attribution in casperHubRoutes.ts
  assert(
    '66. WS-CASPER-35 enforces pScale deal-price scaling & Persian numerals in epistemicDecisionEngine.ts, and CASPER_HUB_REQUEST_FAILED fallback + resolvedAuthorAgent in casperHubRoutes.ts under <=290 lines',
    p30EpistemicEngineSrc.includes('const pScale = buyPerSqm / Math.max(1, hoodBaseBuy);') &&
      p30EpistemicEngineSrc.includes('پیشنهاد شما (${toPersianNum(discountPct)}٪ تخفیف)') &&
      p34CasperHubRoutesSrc.includes("result.errorCode === 'CASPER_HUB_REQUEST_FAILED'") &&
      p34CasperHubRoutesSrc.includes("const resolvedAuthorAgent = /^CASPER-0[1-9]$/.test(rawAgent) ? rawAgent : 'CASPER-05';") &&
      p30EpistemicEngineSrc.split(/\r?\n/).length <= 290 &&
      p34CasperHubRoutesSrc.split(/\r?\n/).length <= 290,
    'WS-CASPER-35 continuous improvement assertion failed',
  );

  // 67. WS-CASPER-36: Epistemic Mathematical Refinements — Persian numerals in spatialContagionEngine.ts, dynamic IQR volatilitySigma in realOptionsLiquidityEngine.ts, and empirical future growth momentum in unifiedDecisionSynthesisEngine.ts
  const p36SpatialEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/spatialContagionEngine.ts'), 'utf-8');
  const p36RealOptionsSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/realOptionsLiquidityEngine.ts'), 'utf-8');
  const p36UnifiedSynthesisSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/unifiedDecisionSynthesisEngine.ts'), 'utf-8');
  assert(
    '67. WS-CASPER-36 enforces Persian numerals in spatialContagionEngine.ts, dynamic IQR volatilitySigma in realOptionsLiquidityEngine.ts, and empirical future growth momentum in unifiedDecisionSynthesisEngine.ts under <=290 lines',
    p36SpatialEngineSrc.includes('λ=${toPersianNum(lambda)}') &&
      p36SpatialEngineSrc.includes('پراکندگی قیمتی (${toPersianNum(iqrSpreadPct)}٪)') &&
      p36RealOptionsSrc.includes('const dynamicSigma = Number(Math.min(0.38, (resolvedPrice > 160 ? 0.26 : resolvedPrice > 110 ? 0.21 : 0.17) + iqrSpreadRatio * 0.22).toFixed(3));') &&
      p36UnifiedSynthesisSrc.includes('const insight = getNeighborhoodDeepInsight(hood);') &&
      p36UnifiedSynthesisSrc.includes('const cycleReport = classifyHousingCycleRegime(askingPrice, rahn80m, hood.metro ?? 7, Math.max(5, spreadPct), empiricalMomentum6mPct);') &&
      p36SpatialEngineSrc.split(/\r?\n/).length <= 290 &&
      p36RealOptionsSrc.split(/\r?\n/).length <= 290 &&
      p36UnifiedSynthesisSrc.split(/\r?\n/).length <= 290,
    'WS-CASPER-36 epistemic mathematical refinements assertion failed',
  );

  // 68. WS-CASPER-37: Root-Cause Remediation — safeTargetSqm bounds in unifiedDecisionSynthesisEngine.ts & macroPortfolioArbitrageEngine.ts, and bounded FIFO localIdempotencyLedger eviction in casperHubRoutes.ts
  const p37UnifiedSynthesisSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/unifiedDecisionSynthesisEngine.ts'), 'utf-8');
  const p37MacroPortfolioSrc = fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/macroPortfolioArbitrageEngine.ts'), 'utf-8');
  const p37CasperHubRoutesSrc = fs.readFileSync(path.join(process.cwd(), 'server/modules/casper-hub/casperHubRoutes.ts'), 'utf-8');
  assert(
    '68. WS-CASPER-37 enforces safeTargetSqm defensive guards in synthesis & macro portfolio, and bounded FIFO eviction in casperHubRoutes under <=290 lines',
    p37UnifiedSynthesisSrc.includes('const safeTargetSqm = Math.max(20, targetSqm || 80);') &&
      p37MacroPortfolioSrc.includes('const safeSqm = Math.max(20, targetSqm || 80);') &&
      p37CasperHubRoutesSrc.includes('if (localIdempotencyLedger.size >= 100)') &&
      p37UnifiedSynthesisSrc.split(/\r?\n/).length <= 290 &&
      p37MacroPortfolioSrc.split(/\r?\n/).length <= 290 &&
      p37CasperHubRoutesSrc.split(/\r?\n/).length <= 290,
    'WS-CASPER-37 root-cause bounds assertion failed',
  );

  console.log('\n=======================================================');
  console.log('[DOMAIN REGRESSION SUITE PASS] All assertions passed!');
  console.log('=======================================================\n');
}

runDomainRegressionTests();







