import assert from 'node:assert/strict';
import {
  evaluateRentalContractAndDepositConversion,
  compareTwoRentalLeaseOptions,
  evaluateHousingMarketStatisticalIndicators,
  computeCompositionAdjustedPriceChange,
  calculateVersionedBrokerageCommission,
  PreSaleProjectLifecycleCoordinator,
  evaluateBuildingConditionAndSeparatedDepreciation,
} from '../src/data/rentalMarketCommissionAndPreSaleAudit';
import {
  auditSponsoredPlacementAndOrganicRanking,
  SponsoredTelemetryTracker,
  ConfidentialDocumentVaultLifecycleGuard,
  evaluateMapViewportSpatialSearchAndSync,
  PropertyOfferNegotiationStateMachine,
  TamperEvidentAdministrativeAuditLedger,
} from '../src/utils/sponsoredVaultMapNegotiationAndAuditTrail';
import {
  buildD3PriceDensityScale,
  isNeighborhoodInLeafletViewport,
} from '../src/components/priceHeatmapAndViewportLazy';
import {
  evaluatePriceThresholdAlertMatches,
  type PriceThresholdSubscription,
} from '../src/components/buyerPriceThresholdAlerts';
import { buildSubscribedNeighborhood6MonthSparkline } from '../src/components/BuyerAlertPriceSparkline';
import {
  buildMacroZoomClusters,
  buildNeighborhoodLodDivIconConfig,
  computeDeclutteredMarkerTiers,
  filterNeighborhoodsInViewportWithBuffer,
} from '../src/components/mapZoomLodAndDeclutter';
import { INITIAL_NEIGHBORHOODS, EvaluatedNeighborhood } from '../src/data/neighborhoods';

console.log('Running Prompts 246 to 255 + D3 Price Heatmap & Viewport Lazy Tests...');

// ============================================================================
// PROMPT 246 — Rental Contract, Deposit Conversion & Lease Financial Logic
// ============================================================================
{
  // 1. Contractual rent vs hypothetical equivalent rent separation
  const lease = evaluateRentalContractAndDepositConversion({
    contractId: 'LEASE-1403-01',
    refundableSecurityDepositMillionToman: 500, // 500M refundable deposit
    contractualMonthlyRentMillionToman: 15, // 15M monthly rent
    monthlyChargeOrMaintenanceMillionToman: 1.5,
    leaseDurationMonths: 12,
    commencementJalaliDate: '1403-02-01',
    expirationJalaliDate: '1404-02-01',
    conversionRuleId: 'IR-MKT-3PCT-1403',
  });

  assert.equal(lease.isValid, true);
  assert.equal(lease.contractualObligations.depositIncludedInRecurringExpense, false);
  assert.equal(lease.contractualObligations.refundableDepositMillionToman, 500);
  assert.equal(lease.contractualObligations.monthlyRentMillionToman, 15);
  assert.equal(lease.contractualObligations.totalOutOfPocketRecurringRentOverLeaseMillionToman, 180); // 15 * 12 (excludes 500M deposit!)
  assert.equal(lease.contractualObligations.totalRecurringWithChargeOverLeaseMillionToman, 198); // (15 + 1.5) * 12
  assert.equal(lease.hypotheticalEquivalents.equivalentFullRahnMillionToman, 1000); // 500 + 15 / 0.03
  assert.equal(lease.hypotheticalEquivalents.equivalentMonthlyCostMillionToman, 31.5); // 15 + 500*0.03 + 1.5

  // 2. Compare full-rahn vs high-rent/low-deposit
  const comp = compareTwoRentalLeaseOptions(
    {
      contractId: 'FULL-RAHN-1000M',
      refundableSecurityDepositMillionToman: 1000,
      contractualMonthlyRentMillionToman: 0,
      leaseDurationMonths: 12,
      commencementJalaliDate: '1403-01-01',
      expirationJalaliDate: '1404-01-01',
    },
    {
      contractId: 'LOW-DEPOSIT-200M-RENT-27M',
      refundableSecurityDepositMillionToman: 200,
      contractualMonthlyRentMillionToman: 27,
      leaseDurationMonths: 12,
      commencementJalaliDate: '1403-01-01',
      expirationJalaliDate: '1404-01-01',
    }
  );
  assert.equal(comp.lowerContractualMonthlyCashOutflowId, 'FULL-RAHN-1000M');
  assert.equal(comp.lowerUpfrontDepositId, 'LOW-DEPOSIT-200M-RENT-27M');
  assert.equal(comp.lowerHypotheticalEquivalentCostId, 'FULL-RAHN-1000M'); // 30M vs 33M

  // 3. Invalid negative / zero-both / bad date detection
  const badLease = evaluateRentalContractAndDepositConversion({
    contractId: 'BAD-LEASE',
    refundableSecurityDepositMillionToman: 0,
    contractualMonthlyRentMillionToman: 0,
    leaseDurationMonths: 12,
    commencementJalaliDate: '1403-08-01',
    expirationJalaliDate: '1403-02-01',
  });
  assert.equal(badLease.isValid, false);
  assert.ok(badLease.validationErrors.includes('ZERO_DEPOSIT_AND_ZERO_RENT_INVALID'));
  assert.ok(badLease.validationErrors.includes('EXPIRATION_DATE_NOT_AFTER_COMMENCEMENT'));
}

// ============================================================================
// PROMPT 247 — Housing Market Statistical Indicators & Sampling Bias
// ============================================================================
{
  const now = 1_710_000_000_000;
  const stats = evaluateHousingMarketStatisticalIndicators(
    [
      {
        listingId: 'AD-1A',
        canonicalPropertyUnitKey: 'UNIT-101',
        neighborhoodId: 1,
        propertySegment: 'APARTMENT_RESIDENTIAL',
        areaSqm: 100,
        pricePerSqmMillionToman: 95, // Older duplicate of UNIT-101
        observedTimestampMs: now - 5_000,
        status: 'ACTIVE',
        sourceKind: 'ADVERTISED_ASKING_PRICE',
      },
      {
        listingId: 'AD-1B',
        canonicalPropertyUnitKey: 'UNIT-101',
        neighborhoodId: 1,
        propertySegment: 'APARTMENT_RESIDENTIAL',
        areaSqm: 100,
        pricePerSqmMillionToman: 100, // Newer duplicate of UNIT-101
        observedTimestampMs: now - 1_000,
        status: 'ACTIVE',
        sourceKind: 'ADVERTISED_ASKING_PRICE',
      },
      {
        listingId: 'AD-2',
        canonicalPropertyUnitKey: 'UNIT-102',
        neighborhoodId: 1,
        propertySegment: 'APARTMENT_RESIDENTIAL',
        areaSqm: 80,
        pricePerSqmMillionToman: 102,
        observedTimestampMs: now - 2_000,
        status: 'ACTIVE',
        sourceKind: 'ADVERTISED_ASKING_PRICE',
      },
      {
        listingId: 'AD-3',
        canonicalPropertyUnitKey: 'UNIT-103',
        neighborhoodId: 1,
        propertySegment: 'APARTMENT_RESIDENTIAL',
        areaSqm: 120,
        pricePerSqmMillionToman: 104,
        observedTimestampMs: now - 2_000,
        status: 'ACTIVE',
        sourceKind: 'ADVERTISED_ASKING_PRICE',
      },
      {
        listingId: 'AD-4',
        canonicalPropertyUnitKey: 'UNIT-104',
        neighborhoodId: 1,
        propertySegment: 'APARTMENT_RESIDENTIAL',
        areaSqm: 90,
        pricePerSqmMillionToman: 106,
        observedTimestampMs: now - 2_000,
        status: 'ACTIVE',
        sourceKind: 'ADVERTISED_ASKING_PRICE',
      },
      {
        listingId: 'AD-OUTLIER',
        canonicalPropertyUnitKey: 'UNIT-999',
        neighborhoodId: 1,
        propertySegment: 'TOWER_LUXURY',
        areaSqm: 300,
        pricePerSqmMillionToman: 450, // Extreme outlier
        observedTimestampMs: now - 2_000,
        status: 'ACTIVE',
        sourceKind: 'ADVERTISED_ASKING_PRICE',
      },
      {
        listingId: 'AD-SOLD',
        canonicalPropertyUnitKey: 'UNIT-SOLD',
        neighborhoodId: 1,
        propertySegment: 'APARTMENT_RESIDENTIAL',
        areaSqm: 100,
        pricePerSqmMillionToman: 50,
        observedTimestampMs: now - 2_000,
        status: 'SOLD',
        sourceKind: 'ADVERTISED_ASKING_PRICE',
      },
    ],
    { nowMs: now, minimumSampleThreshold: 5 }
  );

  assert.equal(stats.sampleSizeDeduplicatedActive, 5);
  assert.equal(stats.excludedDuplicatesCount, 1);
  assert.equal(stats.excludedInactiveOrStaleCount, 1);
  assert.equal(stats.isLowSampleWarning, false);
  assert.equal(stats.medianPricePerSqm, 104); // Robust against the 450 outlier!
  assert.deepEqual(stats.detectedOutlierListingIds, ['AD-OUTLIER']);
  assert.equal(stats.trimmedMeanPricePerSqm, 103); // Mean of [100, 102, 104, 106]

  // Composition shift test: 0% change within each segment, but period 2 has more luxury towers
  const mixShift = computeCompositionAdjustedPriceChange(
    [
      {
        listingId: 'P1-1',
        canonicalPropertyUnitKey: 'U1',
        neighborhoodId: 1,
        propertySegment: 'APARTMENT_RESIDENTIAL',
        areaSqm: 100,
        pricePerSqmMillionToman: 100,
        observedTimestampMs: now,
        status: 'ACTIVE',
        sourceKind: 'ADVERTISED_ASKING_PRICE',
      },
      {
        listingId: 'P1-2',
        canonicalPropertyUnitKey: 'U2',
        neighborhoodId: 1,
        propertySegment: 'TOWER_LUXURY',
        areaSqm: 200,
        pricePerSqmMillionToman: 200,
        observedTimestampMs: now,
        status: 'ACTIVE',
        sourceKind: 'ADVERTISED_ASKING_PRICE',
      },
    ],
    [
      {
        listingId: 'P2-1',
        canonicalPropertyUnitKey: 'U3',
        neighborhoodId: 1,
        propertySegment: 'APARTMENT_RESIDENTIAL',
        areaSqm: 100,
        pricePerSqmMillionToman: 100,
        observedTimestampMs: now,
        status: 'ACTIVE',
        sourceKind: 'ADVERTISED_ASKING_PRICE',
      },
      {
        listingId: 'P2-2',
        canonicalPropertyUnitKey: 'U4',
        neighborhoodId: 1,
        propertySegment: 'TOWER_LUXURY',
        areaSqm: 200,
        pricePerSqmMillionToman: 200,
        observedTimestampMs: now,
        status: 'ACTIVE',
        sourceKind: 'ADVERTISED_ASKING_PRICE',
      },
      {
        listingId: 'P2-3',
        canonicalPropertyUnitKey: 'U5',
        neighborhoodId: 1,
        propertySegment: 'TOWER_LUXURY',
        areaSqm: 220,
        pricePerSqmMillionToman: 200,
        observedTimestampMs: now,
        status: 'ACTIVE',
        sourceKind: 'ADVERTISED_ASKING_PRICE',
      },
    ],
    { APARTMENT_RESIDENTIAL: 0.8, TOWER_LUXURY: 0.2, VILLA: 0, COMMERCIAL: 0 }
  );
  assert.ok(mixShift.rawGrowthPercent > 10); // Raw mean artificially jumps due to luxury share!
  assert.equal(mixShift.mixAdjustedGrowthPercent, 0); // Mix-adjusted index correctly shows 0% price inflation
}

// ============================================================================
// PROMPT 248 — Sponsored Listings, Organic Ranking & Search Placement
// ============================================================================
{
  const now = 1_710_000_000_000;
  const placement = auditSponsoredPlacementAndOrganicRanking(
    [
      {
        id: 10,
        name: 'پونک',
        organicScore: 82,
        pricePerSqm: 115,
        matchesActiveUserFilters: true,
        moderationStatus: 'APPROVED',
        listingStatus: 'ACTIVE',
        sponsorCampaign: {
          campaignId: 'CAMP-ACTIVE',
          agencyName: 'املاک رادار پونک',
          paidAtMs: now - 100_000,
          expiresAtMs: now + 100_000,
          isPaused: false,
        },
      },
      {
        id: 20,
        name: 'سعادت‌آباد',
        organicScore: 91,
        pricePerSqm: 165,
        matchesActiveUserFilters: true,
        moderationStatus: 'APPROVED',
        listingStatus: 'ACTIVE',
      },
      {
        id: 30,
        name: 'جنت‌آباد (کمپین منقضی)',
        organicScore: 75,
        pricePerSqm: 110,
        matchesActiveUserFilters: true,
        moderationStatus: 'APPROVED',
        listingStatus: 'ACTIVE',
        sponsorCampaign: {
          campaignId: 'CAMP-EXPIRED',
          agencyName: 'املاک منقضی',
          paidAtMs: now - 500_000,
          expiresAtMs: now - 1,
          isPaused: false,
        },
      },
      {
        id: 40,
        name: 'خارج از فیلتر بودجه کاربر ولی اسپانسر',
        organicScore: 99,
        pricePerSqm: 250,
        matchesActiveUserFilters: false, // Filtered out by user!
        moderationStatus: 'APPROVED',
        listingStatus: 'ACTIVE',
        sponsorCampaign: {
          campaignId: 'CAMP-OUT-OF-FILTER',
          agencyName: 'املاک لوکس',
          paidAtMs: now - 10_000,
          expiresAtMs: now + 100_000,
          isPaused: false,
        },
      },
    ],
    now
  );

  // Organic order must put id=20 (score 91) first, even though id=10 is sponsored!
  assert.deepEqual(
    placement.organicResults.map((r) => r.id),
    [20, 10, 30]
  );
  // Only active, filter-matching campaign appears in sponsored slot
  assert.equal(placement.sponsoredDedicatedSlots.length, 1);
  assert.equal(placement.sponsoredDedicatedSlots[0].campaignId, 'CAMP-ACTIVE');

  const tracker = new SponsoredTelemetryTracker();
  tracker.recordImpression('CAMP-ACTIVE');
  tracker.recordImpression('CAMP-ACTIVE');
  tracker.recordClick('CAMP-ACTIVE');
  const metrics = tracker.getMetrics('CAMP-ACTIVE');
  assert.equal(metrics.impressions, 2);
  assert.equal(metrics.clicks, 1);
  assert.equal(metrics.ctrPercent, 50);
}

// ============================================================================
// PROMPT 249 — Real Estate Brokerage Commission & Transaction Cost Audit
// ============================================================================
{
  // 10,000M (10 Billion Toman) sale with 20% discount negotiated ONLY on buyer side
  const comm = calculateVersionedBrokerageCommission({
    mode: 'buy',
    salePriceMillionToman: 10_000,
    buyerCustomDiscountRate: 0.2,
    sellerCustomDiscountRate: 0,
  });
  assert.equal(comm.isValid, true);
  if (comm.isValid) {
    // Tariff ceiling per side: 500 * 0.005 (2.5M) + 9500 * 0.0025 (23.75M) = 26.25M
    assert.equal(comm.statutoryAndUnionTariff.sellerSideBaseMillionToman, 26.25);
    assert.equal(comm.statutoryAndUnionTariff.sellerSideVatMillionToman, 2.625);
    assert.equal(comm.statutoryAndUnionTariff.sellerSideTotalMillionToman, 28.875);
    // Buyer got 20% discount on base -> 21M base + 2.1M VAT = 23.1M (Seller side unaffected!)
    assert.equal(comm.statutoryAndUnionTariff.buyerSideBaseMillionToman, 21);
    assert.equal(comm.statutoryAndUnionTariff.buyerSideVatMillionToman, 2.1);
    assert.equal(comm.statutoryAndUnionTariff.buyerSideTotalMillionToman, 23.1);
  }

  const invalidZeroSale = calculateVersionedBrokerageCommission({
    mode: 'buy',
    salePriceMillionToman: 0,
  });
  assert.equal(invalidZeroSale.isValid, false);
}

// ============================================================================
// PROMPT 250 — Sensitive Property Document Vault & Access Lifecycle Security
// ============================================================================
{
  const vault = new ConfidentialDocumentVaultLifecycleGuard();
  const now = 1_710_000_000_000;
  vault.registerDocument({
    docId: 'DOC-DEED-101',
    listingId: 'LISTING-101',
    ownerUserId: 'USER-OWNER-1',
    assignedReviewerIds: ['REVIEWER-ASSIGNED-7'],
    kind: 'TITLE_DEED_SANAD_TAK_BARG',
    version: 1,
    state: 'APPROVED_VERIFIED',
    tokenRevocationEpoch: 1,
    derivativePreviewObjectKey: 'preview-v1.webp',
    derivativeRevoked: false,
  });

  // Public buyer and unassigned reviewer must be denied
  assert.equal(
    vault.canActorAccessDocument('DOC-DEED-101', { userId: 'BUYER-99', role: 'PUBLIC_BUYER' }, 'VIEW', now).allowed,
    false
  );
  assert.equal(
    vault.canActorAccessDocument('DOC-DEED-101', { userId: 'REVIEWER-OTHER', role: 'ASSIGNED_REVIEWER' }, 'VIEW', now).allowed,
    false
  );
  // Assigned reviewer allowed
  assert.equal(
    vault.canActorAccessDocument('DOC-DEED-101', { userId: 'REVIEWER-ASSIGNED-7', role: 'ASSIGNED_REVIEWER' }, 'VIEW', now).allowed,
    true
  );

  // Issue VIEW-scoped token; verify DOWNLOAD action is rejected and cross-doc replay is rejected
  const viewToken = vault.issueShortLivedSignedToken('DOC-DEED-101', 'REVIEWER-ASSIGNED-7', 'VIEW', now, 30_000);
  assert.equal(vault.verifyShortLivedSignedToken(viewToken, 'DOC-DEED-101', 'VIEW', now + 5_000).valid, true);
  assert.equal(vault.verifyShortLivedSignedToken(viewToken, 'DOC-DEED-101', 'DOWNLOAD', now + 5_000).valid, false);
  assert.equal(vault.verifyShortLivedSignedToken(viewToken, 'DOC-OTHER', 'VIEW', now + 5_000).valid, false);
  assert.equal(vault.verifyShortLivedSignedToken(viewToken, 'DOC-DEED-101', 'VIEW', now + 45_000).valid, false);

  // Replacing approved document resets status to UPLOADED_PENDING_REVIEW and revokes old token
  const replaced = vault.replaceDocumentWithNewVersion('DOC-DEED-101', 'preview-v2.webp');
  assert.equal(replaced.state, 'UPLOADED_PENDING_REVIEW');
  assert.equal(vault.verifyShortLivedSignedToken(viewToken, 'DOC-DEED-101', 'VIEW', now + 5_000).valid, false);
}

// ============================================================================
// PROMPT 251 — Map-Based Property Search, Viewport Filtering & Spatial Sync
// ============================================================================
{
  const tile1 = [
    { id: 1, lat: 35.75, lng: 51.40, status: 'PUBLISHED_ACTIVE' as const, mode: 'buy' as const, priceMillionToman: 8000, hasExactCoordinateConsent: true },
    { id: 2, lat: 35.76, lng: 51.41, status: 'SOLD' as const, mode: 'buy' as const, priceMillionToman: 7500, hasExactCoordinateConsent: true },
  ];
  const tile2Overlapping = [
    { id: 1, lat: 35.75, lng: 51.40, status: 'PUBLISHED_ACTIVE' as const, mode: 'buy' as const, priceMillionToman: 8000, hasExactCoordinateConsent: true },
    { id: 3, lat: 35.77, lng: 51.42, status: 'PUBLISHED_ACTIVE' as const, mode: 'buy' as const, priceMillionToman: 9000, hasExactCoordinateConsent: false },
    { id: 4, lat: 35.95, lng: 51.60, status: 'PUBLISHED_ACTIVE' as const, mode: 'buy' as const, priceMillionToman: 7000, hasExactCoordinateConsent: true }, // Outside bbox
  ];

  // Stale viewport response must be ignored
  const staleRes = evaluateMapViewportSpatialSearchAndSync({
    requestSequenceTicket: 4,
    latestIssuedSequenceTicket: 5,
    bbox: { southLat: 35.70, westLng: 51.35, northLat: 35.80, eastLng: 51.45 },
    activeFilters: { mode: 'buy', maxPriceMillionToman: 10_000 },
    tileCandidates: [tile1, tile2Overlapping],
  });
  assert.equal(staleRes.isStaleResponseIgnored, true);

  // Latest viewport response deduplicates tile overlaps, filters out SOLD & outside-bbox, and guarantees 1:1 parity
  const latestRes = evaluateMapViewportSpatialSearchAndSync({
    requestSequenceTicket: 5,
    latestIssuedSequenceTicket: 5,
    bbox: { southLat: 35.70, westLng: 51.35, northLat: 35.80, eastLng: 51.45 },
    activeFilters: { mode: 'buy', maxPriceMillionToman: 10_000 },
    tileCandidates: [tile1, tile2Overlapping],
  });
  assert.equal(latestRes.isStaleResponseIgnored, false);
  assert.deepEqual(latestRes.mapMarkerIds, [1, 3]);
  assert.deepEqual(latestRes.listResultIds, [1, 3]);
  assert.equal(latestRes.uniqueEligibleClusterCount, 2);
}

// ============================================================================
// PROMPT 252 — Pre-Sale Projects, Development Lifecycle & Unit Concurrency
// ============================================================================
{
  const coordinator = new PreSaleProjectLifecycleCoordinator('1404-06-31', [
    { unitId: 'U-10A', buildingBlockId: 'BLK-A', floorNumber: 10, areaSqm: 115, status: 'AVAILABLE', reservationVersion: 1 },
  ]);
  coordinator.updateProgress({
    developerClaimedPercent: 85,
    inspectorVerifiedPercent: 62,
    stage: 'WALLS_AND_MEP',
  });
  coordinator.reviseHandoverDate('1405-03-31', 'تاخیر در تامین تجهیزات آسانسور', '2026-03-01T00:00:00Z');

  // Passing target date (1405-06-01 > 1405-03-31) MUST NOT infer completion when stage is WALLS_AND_MEP
  const snap = coordinator.getProjectSnapshot('1405-06-01');
  assert.equal(snap.authoritativeProgressForRiskScoring, 62); // Uses inspector verified progress!
  assert.equal(snap.handoverRevisionCount, 1);
  assert.equal(snap.isPastTargetHandoverWithoutCompletion, true);
  assert.equal(snap.isCompletedAndReadyForDelivery, false);

  // Atomic unit reservation prevents double-booking
  const r1 = coordinator.reserveUnitAtomically('U-10A', 'BUYER-1', 1);
  const r2Concurrent = coordinator.reserveUnitAtomically('U-10A', 'BUYER-2', 1);
  assert.equal(r1.ok, true);
  assert.equal(r2Concurrent.ok, false);
}

// ============================================================================
// PROMPT 253 — Building Condition, Renovation & Separated Land Depreciation
// ============================================================================
{
  // 20-year-old property worth 10,000M new benchmark, 70% land share (7,000M land, 3,000M structure)
  const cosmeticEval = evaluateBuildingConditionAndSeparatedDepreciation({
    constructionYearJalali: 1384,
    currentYearJalali: 1404,
    lastRenovationYearJalali: 1402,
    renovationScope: 'COSMETIC_INTERIOR_ONLY',
    maintenanceGrade: 'NORMAL',
    totalNewBenchmarkPropertyValueMillionToman: 10_000,
    landValueShareRatio: 0.7,
  });
  const structuralEval = evaluateBuildingConditionAndSeparatedDepreciation({
    constructionYearJalali: 1384,
    currentYearJalali: 1404,
    lastRenovationYearJalali: 1402,
    renovationScope: 'MAJOR_STRUCTURAL_AND_MEP',
    maintenanceGrade: 'NORMAL',
    totalNewBenchmarkPropertyValueMillionToman: 10_000,
    landValueShareRatio: 0.7,
  });

  assert.equal(cosmeticEval.isValid, true);
  assert.equal(cosmeticEval.isNewBuildLabeled, false); // Never labeled new-build!
  assert.equal(cosmeticEval.landValueDepreciated, false);
  assert.equal(cosmeticEval.nonDepreciableLandValueMillionToman, 7_000); // Land is untouched by depreciation
  assert.ok(structuralEval.totalSeparatedValuationMillionToman > cosmeticEval.totalSeparatedValuationMillionToman);
}

// ============================================================================
// PROMPT 254 — Offer Management, Counteroffers & Price Negotiation Workflow
// ============================================================================
{
  const neg = new PropertyOfferNegotiationStateMachine();
  neg.registerListing('LISTING-500', 'ACTIVE', 12_000);
  const now = 1_710_000_000_000;

  const sub1 = neg.submitOffer({
    offerId: 'OFFER-1',
    idempotencyKey: 'IDEMP-OFFER-1',
    listingId: 'LISTING-500',
    buyerUserId: 'BUYER-A',
    sellerUserId: 'SELLER-1',
    proposedPriceMillionToman: 11_200,
    nowMs: now,
  });
  // Retry with same idempotency key deduplicates
  const sub1Retry = neg.submitOffer({
    offerId: 'OFFER-1-DUP',
    idempotencyKey: 'IDEMP-OFFER-1',
    listingId: 'LISTING-500',
    buyerUserId: 'BUYER-A',
    sellerUserId: 'SELLER-1',
    proposedPriceMillionToman: 11_200,
    nowMs: now + 100,
  });
  assert.equal(sub1.ok && sub1Retry.ok && sub1Retry.deduplicatedRetry, true);

  // Competing offer from Buyer B
  neg.submitOffer({
    offerId: 'OFFER-2',
    idempotencyKey: 'IDEMP-OFFER-2',
    listingId: 'LISTING-500',
    buyerUserId: 'BUYER-B',
    sellerUserId: 'SELLER-1',
    proposedPriceMillionToman: 11_500,
    nowMs: now + 200,
  });

  // Seller counters Buyer A
  const counterRes = neg.counterOffer({
    offerId: 'OFFER-1',
    actorUserId: 'SELLER-1',
    actorRole: 'SELLER',
    newProposedPriceMillionToman: 11_600,
    nowMs: now + 500,
  });
  assert.equal(counterRes.ok && counterRes.offer.revisions.length === 2, true);

  // Seller accepts Offer 1 -> Offer 2 is automatically superseded!
  const accRes = neg.acceptOfferBySeller('OFFER-1', 'SELLER-1', now + 1000);
  assert.equal(accRes.ok, true);
  const buyerBVisible = neg.getOffersVisibleToActor('LISTING-500', 'BUYER-B');
  assert.equal(buyerBVisible.length, 1); // Buyer B cannot see Buyer A's offer!
  assert.equal(buyerBVisible[0].state, 'SUPERSEDED_BY_COMPETING_ACCEPTANCE');
  assert.equal(buyerBVisible[0].isLegallyBindingContract, false);
}

// ============================================================================
// PROMPT 255 — Tamper-Evident Administrative Audit Ledger & Attribution
// ============================================================================
{
  const ledger = new TamperEvidentAdministrativeAuditLedger();
  ledger.appendAdminEvent({
    eventId: 'EVT-1',
    idempotencyKey: 'ADM-OP-1001',
    timestampIso: '2026-10-30T12:00:00.000Z',
    humanInitiatorUserId: 'ADMIN-ALI',
    humanInitiatorRole: 'SUPER_ADMIN',
    executingServiceIdentity: 'moderation-worker-svc',
    actionCategory: 'COMMISSION_RULE_OVERRIDE',
    targetEntityType: 'NEIGHBORHOOD_SPONSOR',
    targetEntityId: 'HOOD-1',
    reasonAndTicketRef: 'TICKET-4412: تایید مستندات پروانه کسب آژانس',
    beforeState: { sponsorActive: false, apiToken: 'secret-jwt-123' },
    afterState: { sponsorActive: true, apiToken: 'secret-jwt-456' },
  });

  ledger.appendAdminEvent({
    eventId: 'EVT-2',
    idempotencyKey: 'ADM-OP-1002',
    timestampIso: '2026-10-30T12:05:00.000Z',
    humanInitiatorUserId: 'MOD-SARA',
    humanInitiatorRole: 'MODERATOR',
    executingServiceIdentity: 'listing-moderation-svc',
    actionCategory: 'LISTING_SUSPENSION',
    targetEntityType: 'PROPERTY_LISTING',
    targetEntityId: 'LISTING-909',
    reasonAndTicketRef: 'TICKET-4419: مغایرت سند تک‌برگ',
    beforeState: { status: 'ACTIVE' },
    afterState: { status: 'SUSPENDED' },
  });

  const verification = ledger.verifyIntegrity();
  assert.equal(verification.intact, true);
  const exported = ledger.exportRecords();
  assert.equal(exported[0].beforeStateRedacted.apiToken, '[REDACTED_SENSITIVE]');

  // Simulate direct tampering with record 1 payload
  const tamperedCopy = ledger.exportRecords();
  tamperedCopy[0].afterStateRedacted = { sponsorActive: false };
  const tamperedCheck = ledger.verifyIntegrity(tamperedCopy);
  assert.equal(tamperedCheck.intact, false);
  assert.equal(tamperedCheck.brokenAtSequence, 1);
  assert.equal(tamperedCheck.reason, 'PAYLOAD_TAMPERED_HASH_MISMATCH');
}

// ============================================================================
// D3-SCALE PRICE DENSITY HEATMAP & VIEWPORT LAZY RENDERING TESTS
// ============================================================================
{
  const evaluated = INITIAL_NEIGHBORHOODS.slice(0, 15).map((h) => ({
    ...h,
    cost: h.buyPerSqm * 80,
    ratio: 1,
    status: 'green' as const,
  })) as unknown as EvaluatedNeighborhood[];
  const scaleResult = buildD3PriceDensityScale(evaluated, 'buy', 1);
  assert.ok(scaleResult.maxPriceSqm > scaleResult.minPriceSqm);
  assert.ok(scaleResult.medianPriceSqm >= scaleResult.minPriceSqm);

  const cheapestHood = [...evaluated].sort((a, b) => a.buyPerSqm - b.buyPerSqm)[0];
  const priciestHood = [...evaluated].sort((a, b) => b.buyPerSqm - a.buyPerSqm)[0];
  const cheapStyle = scaleResult.getStyleForNeighborhood(cheapestHood);
  const expensiveStyle = scaleResult.getStyleForNeighborhood(priciestHood);

  assert.equal(cheapStyle.normalizedIntensity, 0.15);
  assert.equal(expensiveStyle.normalizedIntensity, 1);
  assert.notEqual(cheapStyle.fillColor, expensiveStyle.fillColor);

  const mockMap = {
    getBounds: () => ({
      pad: () => ({
        contains: ([lat, lng]: [number, number]) =>
          lat >= 35.65 && lat <= 35.82 && lng >= 51.30 && lng <= 51.50,
      }),
    }),
  };
  assert.equal(isNeighborhoodInLeafletViewport(mockMap, 35.75, 51.41, 0.22), true);
  assert.equal(isNeighborhoodInLeafletViewport(mockMap, 36.25, 52.10, 0.22), false);

  // Test Buyer Alerts Neighborhood Price Threshold Match Engine
  const sampleHood = INITIAL_NEIGHBORHOODS[0];
  const sampleBuySqm = sampleHood.buyPerSqm;
  const subs: PriceThresholdSubscription[] = [
    {
      id: 'sub-match-1',
      hoodId: sampleHood.id,
      hoodName: sampleHood.name,
      dealType: 'خرید',
      maxThresholdMillion: sampleBuySqm + 10, // Above current avg -> matches!
      createdAtIso: '2026-10-31T00:00:00Z',
    },
    {
      id: 'sub-no-match-2',
      hoodId: sampleHood.id,
      hoodName: sampleHood.name,
      dealType: 'خرید',
      maxThresholdMillion: 10, // Far below -> no match
      createdAtIso: '2026-10-31T00:00:00Z',
    },
  ];
  const detectedMatches = evaluatePriceThresholdAlertMatches(subs, INITIAL_NEIGHBORHOODS);
  assert.equal(detectedMatches.length, 1);
  assert.equal(detectedMatches[0].subscription.id, 'sub-match-1');
  assert.ok(detectedMatches[0].observedMillion <= subs[0].maxThresholdMillion);

  const sparkSeries = buildSubscribedNeighborhood6MonthSparkline(sampleHood, 'خرید', sampleBuySqm);
  assert.equal(sparkSeries.points.length, 6);
  assert.equal(sparkSeries.endMillion, Math.round(sampleBuySqm));
  assert.ok(sparkSeries.minDomain <= sampleBuySqm);
  assert.ok(sparkSeries.maxDomain >= sampleBuySqm);

  // ==========================================================================
  // 5-TIER ZOOM LOD, MACRO CLUSTERING, DOT MODE & PIXEL COLLISION DECLUTTERING
  // ==========================================================================
  // 1. Macro clustering at zoom <= 9 merges all Tehran neighborhoods into 1 single city cluster
  const macroClusters = buildMacroZoomClusters(
    evaluated,
    evaluated[0].id,
    8,
    () => ({ stroke: '#10b981', fill: '#34d399', pillBg: '#059669' })
  );
  assert.equal(macroClusters.length, 1);
  assert.equal(macroClusters[0].count, evaluated.length);
  assert.equal(macroClusters[0].containsSelected, true);

  // 2. At zoom < 12 (e.g., zoom 10 or 11), all neighborhood markers strictly become 'dot' (no text labels)
  const zoom11Tiers = computeDeclutteredMarkerTiers(
    mockMap,
    evaluated,
    11,
    evaluated[0].id,
    () => false
  );
  for (const h of evaluated) {
    assert.equal(zoom11Tiers.get(h.id), 'dot');
  }
  const dotIcon = buildNeighborhoodLodDivIconConfig({
    hood: evaluated[0],
    tier: 'dot',
    zoom: 11,
    isSelected: false,
    hasSponsor: false,
    isDarkMap: false,
    pillBg: '#059669',
    stroke: '#10b981',
    shortPriceLabel: '۱۲۰م',
    fullPriceLabel: 'متری ۱۲۰م',
  });
  assert.ok(dotIcon.html.includes('data-lod-tier="dot"'));
  assert.ok(dotIcon.html.includes('display:none;opacity:0;'));
  assert.ok(!dotIcon.html.includes('۱۲۰م')); // Price/name hidden in dot mode!

  // 3. At zoom 12, two neighborhoods with colliding pixel coordinates demote the lower-priority one to 'dot'
  const collidingMockMap = {
    latLngToContainerPoint: () => ({ x: 250, y: 250 }), // Identical screen pixel position
  };
  const zoom12CollisionTiers = computeDeclutteredMarkerTiers(
    collidingMockMap,
    evaluated.slice(0, 3),
    12,
    evaluated[0].id,
    () => false
  );
  assert.equal(zoom12CollisionTiers.get(evaluated[0].id), 'standard_pill'); // Selected hood wins
  assert.equal(zoom12CollisionTiers.get(evaluated[1].id), 'dot'); // Colliding neighbor demoted to dot
  assert.equal(zoom12CollisionTiers.get(evaluated[2].id), 'dot'); // Colliding neighbor demoted to dot

  // 4. Viewport + radial buffer culling only keeps visible + nearby neighborhoods (plus selectedHood)
  const distantHood = {
    ...evaluated[0],
    id: 99999,
    lat: 29.5918, // Shiraz (far outside Tehran viewport)
    lng: 52.5837,
  };
  const culled = filterNeighborhoodsInViewportWithBuffer(
    mockMap,
    [...evaluated, distantHood],
    evaluated[0].id,
    'all',
    0.20,
    3.5
  );
  assert.equal(culled.some((h) => h.id === 99999), false);
}

console.log('All Prompts 246 to 255 + D3 Heatmap, Viewport Lazy, Zoom LOD & Declutter tests passed successfully!');

