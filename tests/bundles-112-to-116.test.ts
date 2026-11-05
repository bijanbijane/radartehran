/**
 * End-to-End Verification Suite for Bundles 112, 113, 114, 115 & 116
 * Prompts 1179 to 1385
 */

import assert from 'node:assert/strict';
import {
  CONTRACT_CLAUSE_TAXONOMY_REGISTRY,
  classifyContractClauseWithAnchor,
  evaluateContractPageOcrQuality,
  compareContractVersionsByClause,
  detectContractClauseConflicts,
  redactSensitiveContractContent,
  simulateMortgageEarlyRepaymentAndSellerProceeds,
  aggregatePersonalPropertyPortfolio,
  evaluateAgencyInvitationAndTenantAccess,
} from '../src/utils/legalContractIntelligenceAndAgencyWorkspace';
import {
  computeCrmDashboardMetrics,
  normalizeCrmSearchToken,
  maskCustomerPhoneForRole,
  detectCustomerContactDuplicates,
  buildCustomer360Profile,
  validateKanbanStageTransition,
  detectViewingScheduleConflicts,
  validateWorkflowAutomationConfig,
  buildReproducibleCrmReport,
} from '../src/utils/agencyCrmWorkflowAndReportingEngine';
import {
  evaluateGranularAgencyPermission,
  distributeLeadDeterministically,
  detectAndResolveLeadOwnershipConflicts,
  evaluateCustomerPropertyMatch,
  appendCounterOfferImmutable,
  evaluateTransactionDocumentReadiness,
  calculateAgencyCommissionAllocation,
  validateMemberOffboardingAndHandover,
  createSanitizedAgencyAuditEvent,
} from '../src/utils/agencyEnterpriseOperationsAndGovernanceEngine';
import {
  processBusinessEventDeterministic,
  transitionOutboxDispatchAttempt,
  evaluateDeclarativeBusinessRules,
  instantiateWorkflowFromTemplate,
  evaluateMultiLevelApprovalDecision,
  computeBusinessHoursElapsed,
  evaluateSlaAndEscalationState,
  computeAgentWorkloadCapacity,
  synchronizeOperationsQueue,
} from '../src/utils/agencyAutomationOutboxAndSlaEngine';
import {
  detectStalledDealsExplainable,
  evaluateAgencyDuplicateLeadSignals,
  executeControlledCrmRecordMerge,
  evaluateOutboundMessageEligibilityAndIdempotency,
  reconcileProviderDeliveryCallback,
} from '../src/utils/agencyDeduplicationAndMessagingGovernance';
import {
  REAL_ESTATE_METRICS_REGISTRY,
  computePricePerSqmIndexAndGap,
  estimatePropertyValueRangeFromComparables,
  runInvestmentCashFlowBreakEvenAndMonteCarlo,
  evaluatePortfolioConcentrationVacancyAndDelinquency,
  evaluateChronologicalForecastAndRisk,
} from '../src/utils/marketBiRiskAndForecastingEngine';
import {
  normalizeAndValidateCoordinateCrs,
  validateParcelPolygonGeometry,
  classifyPointAgainstVersionedBoundaries,
  evaluateMetroAndPoiAccessibility,
  evaluateWalkabilityEnvironmentalAndPrivacy,
} from '../src/utils/geospatialCrsAccessibilityAndEnvironmentalEngine';
import {
  URBAN_INDICATOR_REGISTRY,
  computeDemographicAndHouseholdMetrics,
  evaluateUrbanMorphologyAndLandUseBalance,
  evaluateServiceEquityAndInfrastructureCoverage,
  evaluateUrbanHazardsResilienceAndSpatialAutocorrelation,
} from '../src/utils/urbanIntelligenceDemographicsAndResilienceEngine';

console.log('Running Bundles 112 to 116 Verification Suite (Prompts 1179 to 1385)...');

// 1. Bundle 112: Contract Clause Taxonomy, OCR, Diff, Redaction, Mortgage & Portfolio (1179-1198)
{
  assert.ok(Object.keys(CONTRACT_CLAUSE_TAXONOMY_REGISTRY).length >= 5);
  const anchored = classifyContractClauseWithAnchor({
    documentId: 'doc-1',
    physicalPageIndex: 1,
    printedPageLabel: 'صفحه ۲',
    rawClauseText: 'ماده ۳: ثمن معامله ۱۰ میلیارد تومان',
    proposedClauseTypeId: 'CLAUSE_CONSIDERATION_AND_PAYMENT',
    hasExactBoundingBox: false,
  });
  assert.equal(anchored.anchorPrecision, 'page_only_reference');

  const ocrLow = evaluateContractPageOcrQuality({
    pageIndex: 0,
    extractedText: 'این مبایعه‌نامه بین خریدار و فروشنده منعقد گردیده است.',
    providerConfidencePercent: 45,
  });
  assert.equal(ocrLow.qualityState, 'low_confidence');

  const conflicts = detectContractClauseConflicts({
    statedTotalContractAmountToman: 10_000_000_000,
    installmentAmountsToman: [4_000_000_000, 5_000_000_000],
    contractSigningDateIso: '2026-05-10',
    propertyDeliveryDateIso: '2026-05-01',
    partyRoles: [
      { partyId: 'p1', role: 'BUYER' },
      { partyId: 'p1', role: 'SELLER' },
    ],
  });
  assert.equal(conflicts.hasConflicts, true);
  assert.equal(conflicts.conflicts.length, 3);

  const redacted = redactSensitiveContractContent(
    'کدملی 0012345678 موبایل 09123456789 شبا IR123456789012345678901234',
    { redactNationalIds: true, redactPhones: true, redactIbans: true }
  );
  assert.equal(redacted.redactedCount, 3);
  assert.ok(!redacted.sanitizedDerivativeText.includes('09123456789'));

  const mortgage = simulateMortgageEarlyRepaymentAndSellerProceeds({
    principalToman: 1_000_000_000,
    annualNominalRatePercent: 23,
    termMonths: 60,
    extraMonthlyPrincipalPrepaymentToman: 5_000_000,
    sellerGrossSalePriceToman: 12_000_000_000,
    sellerBrokerageFeeToman: 35_000_000,
    sellerOtherTransferCostsToman: 15_000_000,
  });
  assert.ok(mortgage.netInterestSavedToman > 0);
  assert.ok(mortgage.acceleratedMonthsCount < 60);

  const portfolio = aggregatePersonalPropertyPortfolio('u1', [
    {
      assetId: 'a1',
      ownerUid: 'u1',
      acquisitionCostToman: 10_000_000_000,
      userEstimatedValueToman: 14_000_000_000,
      ownershipSharePercent: 50,
      recordedRentalIncomeToman: 400_000_000,
      recordedMaintenanceExpenseToman: 40_000_000,
    },
  ]);
  assert.equal(portfolio.shareAdjustedAcquisitionCostToman, 5_000_000_000);
}

// 2. Bundle 112/113: Enterprise Agency CRM, RBAC, Lead Distribution, Matching, Commission & Handover (1179-1223)
{
  const rbacDeny = evaluateGranularAgencyPermission({
    actor: {
      memberUid: 'u-viewer',
      workspaceId: 'ws-1',
      branchId: 'b-1',
      teamId: 't-1',
      role: 'AUDITOR_READONLY',
      membershipStatus: 'ACTIVE',
    },
    targetWorkspaceId: 'ws-1',
    domain: 'FINANCIAL_COMMISSIONS',
    action: 'APPROVE',
  });
  assert.equal(rbacDeny.allowed, false);

  const dist = distributeLeadDeterministically({
    leadId: 'lead-1',
    workspaceId: 'ws-1',
    branchId: 'b-1',
    requiredSpecialization: 'BUY',
    strategy: 'LOWEST_ACTIVE_WORKLOAD',
    candidates: [
      {
        agentUid: 'ag-1',
        workspaceId: 'ws-1',
        branchId: 'b-1',
        status: 'ACTIVE',
        activeLeadsCount: 3,
        specializations: ['BUY', 'LUXURY'],
        lastAssignedEpochMs: 1000,
      },
    ],
  });
  assert.equal(dist.assignedAgentUid, 'ag-1');

  const comm = calculateAgencyCommissionAllocation({
    transactionId: 'tx-1',
    ruleVersion: 'v1',
    transactionValueToman: 10_000_000_000,
    grossCommissionRatePercent: 1,
    taxAndLegalDeductionsToman: 10_000_000,
    agencySharePercent: 50,
    participatingAgents: [
      { agentUid: 'ag-1', splitOfAgentPoolPercent: 50 },
      { agentUid: 'ag-2', splitOfAgentPoolPercent: 50 },
    ],
  });
  assert.equal(comm.valid, true);
  assert.equal(comm.netDistributableToman, 90_000_000);

  const offboardBlock = validateMemberOffboardingAndHandover({
    memberUid: 'ag-1',
    operation: 'REMOVE',
    activeOwnedLeadIds: ['l-1'],
    activeOwnedCaseIds: [],
    reassignedToAgentUid: null,
    reassignedTargetActive: false,
  });
  assert.equal(offboardBlock.canCompleteOffboarding, false);
  assert.equal(offboardBlock.requiresHandoverFirst, true);
}

// 3. Bundle 113: Event Engine, Transactional Outbox, Declarative Rules, Multi-Level SoD Approval, SLA & Merge (1224-1255)
{
  const evtRes = processBusinessEventDeterministic({
    event: {
      eventId: 'evt-1',
      workspaceId: 'ws-1',
      actorId: 'u-1',
      category: 'DEAL_TRANSITION',
      entityType: 'DEAL',
      entityId: 'd-1',
      occurredAtMs: 1_777_000_000_000,
      eventVersion: 1,
      idempotencyKey: 'idem-1',
      sanitizedPayload: { stage: 'CLOSED_WON' },
    },
    consumerWorkspaceId: 'ws-1',
    processedEventIds: new Set(),
  });
  assert.equal(evtRes.accepted, true);

  const outboxRetry = transitionOutboxDispatchAttempt({
    record: {
      outboxId: 'ob-1',
      workspaceId: 'ws-1',
      eventId: 'evt-1',
      idempotencyKey: 'idem-1',
      status: 'PENDING',
      attemptCount: 1,
      maxAttempts: 3,
      createdAtMs: 1000,
      lastAttemptAtMs: 2000,
      lockedByWorkerId: null,
      lastError: null,
    },
    workerId: 'w-1',
    nowMs: 3000,
    dispatchSucceeded: false,
    ackSucceeded: false,
    downstreamAlreadyProcessedKeys: new Set(['idem-1']),
  });
  assert.equal(outboxRetry.outcome, 'IDEMPOTENT_ACK_RECOVERED');
  assert.equal(outboxRetry.updatedRecord.status, 'PROCESSED');

  const sodSelfApprove = evaluateMultiLevelApprovalDecision({
    request: {
      approvalId: 'ap-1',
      workspaceId: 'ws-1',
      operationType: 'COMMISSION_OVERRIDE',
      targetResourceId: 'deal-1',
      makerUserId: 'user-maker',
      requiredLevels: 1,
      currentLevel: 0,
      status: 'PENDING',
      justificationFa: 'تخفیف ویژه',
      beforeSummaryFa: '100',
      afterSummaryFa: '85',
      decisions: [],
      expiresAtMs: 9_999_999_999_999,
    },
    actorUserId: 'user-maker',
    actorIsActiveMember: true,
    actorHasApprovePermission: true,
    decision: 'APPROVED',
    reasonFa: 'تایید شخصی',
    nowMs: 1_777_000_000_000,
  });
  assert.equal(sodSelfApprove.allowed, false);
  assert.equal(sodSelfApprove.violationCode, 'SOD_SELF_APPROVAL_FORBIDDEN');

  const mergeRes = executeControlledCrmRecordMerge({
    actorWorkspaceId: 'ws-1',
    actorAuthorized: true,
    survivingRecord: {
      recordId: 'c-1',
      workspaceId: 'ws-1',
      fullName: 'کیوان رضایی',
      phone: '09121112233',
      email: 'k@example.com',
      assignedAgentId: 'ag-1',
      interestedListingIds: ['l-1'],
      interactionIds: ['i-1'],
      taskIds: ['t-1'],
      visitIds: ['v-1'],
      activeDealIds: ['d-1'],
    },
    mergedRecord: {
      recordId: 'c-2',
      workspaceId: 'ws-1',
      fullName: 'کیوان رضایی',
      phone: '09121112233',
      email: null,
      assignedAgentId: 'ag-1',
      interestedListingIds: ['l-2'],
      interactionIds: ['i-2'],
      taskIds: [],
      visitIds: ['v-2'],
      activeDealIds: [],
    },
    nowMs: 1_777_000_000_000,
  });
  assert.equal(mergeRes.succeeded, true);
  assert.equal(mergeRes.canonicalRecord?.interactionIds.length, 2);
  assert.ok(mergeRes.rollbackSnapshot !== null);

  const msgNoConsent = evaluateOutboundMessageEligibilityAndIdempotency({
    workspaceId: 'ws-1',
    customerId: 'c-1',
    channel: {
      channelId: 'ch-1',
      workspaceId: 'ws-1',
      channelType: 'SMS',
      enabled: true,
      hasServerSideSecretReference: true,
      status: 'READY',
    },
    consent: {
      customerId: 'c-1',
      workspaceId: 'ws-1',
      channelType: 'SMS',
      status: 'WITHDRAWN',
      source: 'USER_WITHDRAWAL',
      updatedAtMs: 1000,
    },
    idempotencyKey: 'msg-key-1',
    existingMessages: [],
    nowMs: 2000,
  });
  assert.equal(msgNoConsent.canDispatch, false);
  assert.equal(msgNoConsent.blockReason, 'CONSENT_NOT_GRANTED');
}

// 4. Bundle 114: BI Warehouse, Price-per-Sqm Index, Comps, Seeded Monte Carlo, Portfolio Risk & Forecast (1256-1296)
{
  assert.ok(REAL_ESTATE_METRICS_REGISTRY.ASKING_PRICE_PER_SQM_MEDIAN);
  const mc1 = runInvestmentCashFlowBreakEvenAndMonteCarlo({
    purchasePriceToman: 10_000_000_000,
    acquisitionCostsToman: 200_000_000,
    monthlyGrossRentToman: 70_000_000,
    vacancyRatePercent: 5,
    annualOperatingExpensesToman: 50_000_000,
    annualCapexReserveToman: 30_000_000,
    annualDebtServiceToman: 120_000_000,
    equityInvestedToman: 9_000_000_000,
    randomSeed: 42,
  });
  const mc2 = runInvestmentCashFlowBreakEvenAndMonteCarlo({
    purchasePriceToman: 10_000_000_000,
    acquisitionCostsToman: 200_000_000,
    monthlyGrossRentToman: 70_000_000,
    vacancyRatePercent: 5,
    annualOperatingExpensesToman: 50_000_000,
    annualCapexReserveToman: 30_000_000,
    annualDebtServiceToman: 120_000_000,
    equityInvestedToman: 9_000_000_000,
    randomSeed: 42,
  });
  assert.equal(mc1.monteCarloNetYieldPercentiles.p50Percent, mc2.monteCarloNetYieldPercentiles.p50Percent);
  assert.ok(mc1.monteCarloNetYieldPercentiles.p10Percent <= mc1.monteCarloNetYieldPercentiles.p90Percent);
}

// 5. Bundle 115: Geospatial CRS, Swapped Lat/Lng Detection, Parcel Topology, Metro Entrance & Privacy Masking (1297-1339)
{
  const swapped = normalizeAndValidateCoordinateCrs({
    firstValue: 51.389,
    secondValue: 35.689,
    sourceCrs: 'EPSG:4326',
    enforceIranBounds: true,
  });
  assert.equal(swapped.valid, false);
  assert.equal(swapped.errorCode, 'LAT_LNG_SWAPPED_DETECTED');

  const validTehran = normalizeAndValidateCoordinateCrs({
    firstValue: 35.7762,
    secondValue: 51.3654,
    sourceCrs: 'EPSG:4326',
    enforceIranBounds: true,
  });
  assert.equal(validTehran.valid, true);

  const privacyMasked = evaluateWalkabilityEnvironmentalAndPrivacy({
    propertyId: 'p-1',
    workspaceId: 'ws-1',
    exactLat: 35.776249,
    exactLng: 51.365418,
    viewerAuthorizedForExactLocation: false,
    transitScore0To100: 80,
    dailyServicesScore0To100: 85,
    greenSpaceScore0To100: 70,
    pedestrianConnectivityScore0To100: 75,
    airQualitySensorReadingAqi: 72,
    airSensorDistanceMeters: 1500,
    airSensorAgeHours: 1,
    floodHazardLayerAvailable: false,
    intersectsFloodZone: false,
    boundaryVersion: 'v1',
    poiDatasetVersion: 'v1',
  });
  assert.equal(privacyMasked.displayCoordinates.precisionMode, 'PRIVACY_MASKED_APPROXIMATE');
  assert.equal(privacyMasked.displayCoordinates.lat, 35.78);
  assert.equal(privacyMasked.environmentalStatus.floodRiskClassification, 'UNKNOWN_LAYER_UNAVAILABLE');
}

// 6. Bundle 116: Urban Intelligence, Demographics Boundary Guard, BCR vs FAR, Service Equity & Moran's I (1340-1385)
{
  assert.ok(URBAN_INDICATOR_REGISTRY.POPULATION_DENSITY_PER_HA);
  const demogDiscontinuous = computeDemographicAndHouseholdMetrics({
    hoodId: 1,
    boundaryVersion: 'muni-1404',
    areaHectares: 300,
    observationBasis: 'OFFICIAL_CENSUS',
    referencePeriodLabel: '1404',
    residentialPopulation: 45_000,
    previousPeriodPopulation: 40_000,
    previousBoundaryVersion: 'muni-1395',
    ageBands: { under15: 7000, working15To64: 33000, senior65Plus: 5000 },
    householdCount: 15_000,
  });
  assert.equal(demogDiscontinuous.populationChangePercent, null);
  assert.ok(demogDiscontinuous.boundaryDiscontinuityWarningFa !== null);

  const morphNoFloorArea = evaluateUrbanMorphologyAndLandUseBalance({
    totalParcelAreaSqm: 100_000,
    totalBuildingFootprintSqm: 55_000,
    verifiedTotalFloorAreaSqm: null,
    buildingsByAgeCategory: { under10Years: 100, years10To25: 150, over25Years: 50, unknownConstructionYear: 20 },
    landUseSharesSqm: { residentialSqm: 60_000, commercialSqm: 20_000, serviceAndAdminSqm: 10_000, greenAndOpenSqm: 10_000 },
    previousTaxonomyVersion: 'v1',
    currentTaxonomyVersion: 'v2',
  });
  assert.equal(morphNoFloorArea.buildingCoverageRatioPercent, 55);
  assert.equal(morphNoFloorArea.floorAreaRatioFar, null);
  assert.equal(morphNoFloorArea.canCompareHistoricalLandUseChange, false);

  const hazards = evaluateUrbanHazardsResilienceAndSpatialAutocorrelation({
    measuredNoiseDb: null,
    satelliteLandSurfaceTempCelsius: 34.2,
    insarVerticalSubsidenceMmPerYear: -3.8,
    distanceToMappedFaultMeters: 2100,
    resilienceDimensions: {
      infrastructureRedundancy0To100: 80,
      emergencyAccess0To100: 76,
      environmentalSafety0To100: 74,
      publicServiceAccess0To100: null,
    },
    neighborhoodValuesForMoran: [
      { hoodId: 1, value: 140, adjacentHoodIds: [2] },
      { hoodId: 2, value: 136, adjacentHoodIds: [1] },
      { hoodId: 3, value: 80, adjacentHoodIds: [4] },
      { hoodId: 4, value: 78, adjacentHoodIds: [3] },
    ],
  });
  assert.ok(hazards.noiseStatusLabelFa.includes('عدم جایگزینی با صفر'));
  assert.ok(typeof hazards.globalMoransI === 'number' && hazards.globalMoransI > 0.5);
}

console.log('All Bundles 112 to 116 assertions passed!');
