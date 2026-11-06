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

  console.log('\n=======================================================');
  console.log('[DOMAIN REGRESSION SUITE PASS] All assertions passed!');
  console.log('=======================================================\n');
}

runDomainRegressionTests();


