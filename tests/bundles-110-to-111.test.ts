import assert from 'node:assert/strict';
import { logDiag, getDiagnosticSnapshots } from '../src/utils/diagnostics';
import {
  calculateListingDaysOnMarket,
  analyzeListingPriceRevisionHistory,
  computeInventoryTurnoverAndSupplyFlow,
  calculateMarketPriceIndices,
  calculatePriceDistributionAndRentalBenchmarks,
  computeKaplanMeierListingSurvival,
  validateAndMeasureSearchPolygon,
  filterPropertiesInsidePolygon,
} from '../src/utils/marketIndexingSpatialPolygonAndSurvivalAnalytics';
import {
  classifyContractClauseWithAnchor,
  evaluateContractPageOcrQuality,
  compareContractVersionsByClause,
  detectContractClauseConflicts,
  redactSensitiveContractContent,
  simulateMortgageEarlyRepaymentAndSellerProceeds,
  aggregatePersonalPropertyPortfolio,
  evaluateAgencyInvitationAndTenantAccess,
} from '../src/utils/legalContractIntelligenceAndAgencyWorkspace';

async function runBundles110To111Verification() {
  console.log('Running Bundles 110–111 (Prompts 1139–1178) & Diagnostics Verification Suite...');

  // Verify logDiag export
  logDiag('INFO', 'Verification test event', { bundle: 111 });
  assert.ok(getDiagnosticSnapshots().length >= 1);

  // 1. Bundle 110 (Prompts 1139–1158): DOM, Price Revisions, Turnover, Price Index, Survival & Polygon Search
  const dayMs = 86_400_000;
  const dom = calculateListingDaysOnMarket(
    [
      { type: 'FIRST_PUBLISHED', timestampMs: 10 * dayMs },
      { type: 'RENEWED', timestampMs: 15 * dayMs },
      { type: 'EXPIRED', timestampMs: 20 * dayMs },
      { type: 'REPUBLISHED', timestampMs: 25 * dayMs },
    ],
    30 * dayMs
  );
  assert.equal(dom.valid, true);
  assert.equal(dom.currentActiveDays, 5);
  assert.equal(dom.cumulativePublishedDays, 15);
  assert.equal(dom.renewalCount, 1);
  assert.equal(dom.isCompletedSaleConfirmed, false);

  const priceRev = analyzeListingPriceRevisionHistory([
    { revisionId: 'r1', timestampMs: 1 * dayMs, dealMode: 'buy', currency: 'TOMAN', askingPriceToman: 10_000_000_000 },
    { revisionId: 'r2', timestampMs: 5 * dayMs, dealMode: 'buy', currency: 'TOMAN', askingPriceToman: 9_500_000_000 },
    { revisionId: 'r3', timestampMs: 9 * dayMs, dealMode: 'buy', currency: 'TOMAN', askingPriceToman: 9_800_000_000 },
  ]);
  assert.equal(priceRev.status, 'sufficient');
  assert.equal(priceRev.cumulativeAbsoluteChangeToman, -200_000_000);
  assert.equal(priceRev.cumulativePercentChange, -2);
  assert.equal(priceRev.latestDirection, 'increase');
  assert.equal(priceRev.priceRangeSpanToman, 500_000_000);

  const flow = computeInventoryTurnoverAndSupplyFlow({
    openingActiveCount: 100,
    newPublicationsCount: 25,
    republicationsCount: 5,
    renewalsCount: 40,
    expirationsCount: 10,
    withdrawalsCount: 8,
    administrativeRemovalsCount: 2,
  });
  assert.equal(flow.inflowCount, 30);
  assert.equal(flow.outflowCount, 20);
  assert.equal(flow.closingActiveCount, 110);
  assert.equal(flow.confirmedSalesTurnoverRate, null);

  const idxRes = calculateMarketPriceIndices({
    indexId: 'TEHRAN_RESIDENTIAL_BUY_INDEX',
    methodologyVersion: '1.0.0',
    basePeriodLabel: '1403-Q1',
    basePeriodValuePerSqm: 80_000_000,
    observations: [
      { pricePerSqm: 100_000_000, areaSqm: 100, stratumKey: 'NORTH_2BR' },
      { pricePerSqm: 120_000_000, areaSqm: 200, stratumKey: 'NORTH_3BR' },
    ],
    baseStratumWeights: { NORTH_2BR: 0.5, NORTH_3BR: 0.5 },
    basePeriodCpi: 100,
    currentPeriodCpi: 125,
  });
  assert.equal(idxRes.valid, true);
  assert.equal(idxRes.stratifiedConstantQualityPerSqm, 110_000_000);
  assert.equal(idxRes.nominalIndexBase100, 137.5);
  assert.equal(idxRes.realInflationAdjustedIndexBase100, 110);

  const distBench = calculatePriceDistributionAndRentalBenchmarks(
    [80, 90, 100, 110, 120, 140],
    [
      { depositToman: 1_500_000_000, monthlyRentToman: 0, areaSqm: 90 },
      { depositToman: 500_000_000, monthlyRentToman: 25_000_000, areaSqm: 90 },
    ]
  );
  assert.equal(distBench.distribution.sufficient, true);
  assert.equal(distBench.distribution.median, 105);
  assert.equal(distBench.rentalBenchmarks.medianFullDepositToman, 1_500_000_000);
  assert.equal(distBench.rentalBenchmarks.medianHybridMonthlyRentToman, 25_000_000);

  const kmCurve = computeKaplanMeierListingSurvival([
    { durationDays: 5, eventObserved: true },
    { durationDays: 10, eventObserved: false },
    { durationDays: 15, eventObserved: true },
    { durationDays: 20, eventObserved: false },
  ]);
  assert.equal(kmCurve.length, 4);
  assert.equal(kmCurve[0].survivalProbability, 0.75);

  const validPoly = [
    { lat: 35.75, lng: 51.35 },
    { lat: 35.75, lng: 51.45 },
    { lat: 35.8, lng: 51.45 },
    { lat: 35.8, lng: 51.35 },
  ];
  const polyMetrics = validateAndMeasureSearchPolygon(validPoly);
  assert.equal(polyMetrics.valid, true);
  assert.ok(polyMetrics.geodesicAreaSqMeters > 10_000_000);

  // Self-intersecting bow-tie polygon should be rejected
  const bowTiePoly = [
    { lat: 35.75, lng: 51.35 },
    { lat: 35.8, lng: 51.45 },
    { lat: 35.75, lng: 51.45 },
    { lat: 35.8, lng: 51.35 },
  ];
  assert.equal(validateAndMeasureSearchPolygon(bowTiePoly).valid, false);

  const pip = filterPropertiesInsidePolygon(
    [
      { id: 'inside-1', lat: 35.77, lng: 51.4 },
      { id: 'outside-1', lat: 35.69, lng: 51.4 },
    ],
    validPoly
  );
  assert.equal(pip.matchedProperties.length, 1);
  assert.equal(pip.matchedProperties[0].id, 'inside-1');

  // 2. Bundle 111 (Prompts 1159–1178): Contract Taxonomy, OCR Quality, Clause Diff, Conflicts, Redaction, Prepayment & Agency
  const classified = classifyContractClauseWithAnchor({
    documentId: 'doc-101',
    physicalPageIndex: 2,
    printedPageLabel: '۳',
    rawClauseText: 'ماده ۳: ثمن معامله معادل ده میلیارد تومان تعیین گردید.',
    proposedClauseTypeId: 'CLAUSE_CONSIDERATION_AND_PAYMENT',
    hasExactBoundingBox: true,
  });
  assert.equal(classified.classificationStatus, 'recognized');
  assert.equal(classified.anchorPrecision, 'exact_text_anchor');

  const ocrGood = evaluateContractPageOcrQuality({
    pageIndex: 0,
    extractedText: 'این قرارداد بین خریدار و فروشنده در تاریخ ۱۴۰۴/۰۱/۱۵ منعقد گردید.',
    providerConfidencePercent: 94,
  });
  assert.equal(ocrGood.qualityState, 'reliable');
  assert.equal(ocrGood.requiresManualReviewBeforeAi, false);

  const clauseDiff = compareContractVersionsByClause(
    [{ clauseNumber: '1', text: 'مبلغ کل ۱۰ میلیارد تومان', pageIndex: 0 }],
    [
      { clauseNumber: '1', text: 'مبلغ کل ۱۱ میلیارد تومان', pageIndex: 0 },
      { clauseNumber: '2', text: 'خسارت تاخیر روزانه', pageIndex: 1 },
    ]
  );
  assert.equal(clauseDiff[0].changeType, 'modified');
  assert.equal(clauseDiff[0].numericValueChanged, true);
  assert.equal(clauseDiff[1].changeType, 'added');

  const conflictRes = detectContractClauseConflicts({
    statedTotalContractAmountToman: 10_000_000_000,
    installmentAmountsToman: [4_000_000_000, 4_000_000_000],
    contractSigningDateIso: '2026-05-10',
    propertyDeliveryDateIso: '2026-05-01',
    partyRoles: [
      { partyId: 'person-1', role: 'BUYER' },
      { partyId: 'person-1', role: 'SELLER' },
    ],
  });
  assert.equal(conflictRes.hasConflicts, true);
  assert.equal(conflictRes.conflicts.length, 3);

  const redacted = redactSensitiveContractContent(
    'کد ملی 0012345678 و شماره تماس 09123456789 و شبا IR123456789012345678901234',
    { redactNationalIds: true, redactPhones: true, redactIbans: true }
  );
  assert.equal(redacted.redactedCount, 3);
  assert.equal(redacted.sanitizedDerivativeText.includes('09123456789'), false);

  const prepay = simulateMortgageEarlyRepaymentAndSellerProceeds({
    principalToman: 1_000_000_000,
    annualNominalRatePercent: 24,
    termMonths: 60,
    extraMonthlyPrincipalPrepaymentToman: 10_000_000,
    sellerGrossSalePriceToman: 8_000_000_000,
    sellerBrokerageFeeToman: 50_000_000,
    sellerOtherTransferCostsToman: 20_000_000,
  });
  assert.ok(prepay.acceleratedMonthsCount < 60);
  assert.ok(prepay.netInterestSavedToman > 0);
  assert.equal(prepay.sellerNetEstimatedProceedsToman, 6_930_000_000);

  const portfolio = aggregatePersonalPropertyPortfolio('owner-1', [
    {
      assetId: 'a1',
      ownerUid: 'owner-1',
      acquisitionCostToman: 10_000_000_000,
      userEstimatedValueToman: 14_000_000_000,
      ownershipSharePercent: 50,
      recordedRentalIncomeToman: 600_000_000,
      recordedMaintenanceExpenseToman: 100_000_000,
    },
    {
      assetId: 'a2',
      ownerUid: 'other-user',
      acquisitionCostToman: 99_000_000_000,
      userEstimatedValueToman: 99_000_000_000,
      ownershipSharePercent: 100,
      recordedRentalIncomeToman: 0,
      recordedMaintenanceExpenseToman: 0,
    },
  ]);
  assert.equal(portfolio.eligibleAssetCount, 1);
  assert.equal(portfolio.shareAdjustedAcquisitionCostToman, 5_000_000_000);
  assert.equal(portfolio.shareAdjustedEstimatedValueToman, 7_000_000_000);
  assert.equal(portfolio.shareAdjustedNetOperatingCashFlowToman, 250_000_000);

  const agencyAuth = evaluateAgencyInvitationAndTenantAccess({
    actorUid: 'agent-2',
    actorOrganizationId: 'org-alpha',
    actorRoleInOrg: 'ORG_AGENT',
    targetResourceOrganizationId: 'org-beta',
    invitation: {
      invitationId: 'inv-1',
      organizationId: 'org-beta',
      intendedRecipientUid: 'agent-2',
      proposedRole: 'ORG_AGENT',
      status: 'PENDING',
      expiresAtMs: 5000,
    },
    nowMs: 1000,
  });
  assert.equal(agencyAuth.tenantResourceAccessAllowed, false);
  assert.equal(agencyAuth.canIssueAdminInvitation, false);
  assert.equal(agencyAuth.invitationClaimStatus, 'ACCEPTED');

  console.log('All Bundles 110–111 (Prompts 1139–1178) & Diagnostics checks passed!');
}

runBundles110To111Verification().catch((err) => {
  console.error(err);
  process.exit(1);
});
