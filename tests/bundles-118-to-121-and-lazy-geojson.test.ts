import assert from 'node:assert/strict';
import {
  resolveGeoLazyLoadingPolicy,
  expandGeoBoundingBox,
  isPointInGeoBoundingBox,
  isGeometryIntersectingGeoBoundingBox,
  filterPointsInGeoBoundingBox,
  simplifyPolygonRingForZoomLod,
  BoundedGeoJsonLruCache,
  planViewportBoundaryFetchBatch,
} from '../src/utils/geojsonViewportLazyEngine';
import {
  allocateBuildingServiceCharges,
  buildTechnicalBuildingProfile,
  calculateAssetAccountingDepreciation,
  createAndTransitionManagedAsset,
  evaluateTenantServiceCmmsAndReliability,
  registerAndReplaceBuildingEquipment,
  validateMeterAndAllocateUtilityCosts,
} from '../src/utils/assetManagementBuildingOpsAndCmmsEngine';
import {
  calculateAssetTcoAndRepairVsReplaceDecision,
  calculatePropertyNoiAndInvestmentYields,
  evaluateBuildingInspectionCompliance,
  evaluateBuildingInsuranceAndClaim,
} from '../src/utils/buildingComplianceInsuranceNoiTcoAndAuditEngine';
import {
  calculateDistributionWaterfallAndFees,
  calculateFundNavAndUnitValuation,
  calculateSafePeriodicIrrAndPerformance,
  evaluateInvestmentOwnershipAndCircularGuard,
  evaluatePortfolioLiquidityDebtGovernanceAndVdr,
  reconcileInvestorCapitalCallsAndContributions,
} from '../src/utils/investmentFundNavWaterfallIrrAndGovernanceEngine';
import {
  analyzeMarketPricingRentAndTimeOnMarket,
  evaluateMarketRegimeSurveillanceAndCrossCity,
  evaluateSpecializedPropertySectorIntelligence,
  evaluateTransactionObservationAndDedupe,
  normalizeHeterogeneousPropertyRecord,
} from '../src/utils/marketTransactionsNormalizationAndSpecializedSectorsEngine';
import {
  evaluateCrmAttributionPerformanceFunnelAndAutomation,
  evaluateCrmContactLeadAndExplainableScore,
  evaluatePipelineViewingNegotiationAndDealConversion,
  matchCustomerRequirementsToProperties,
} from '../src/utils/realEstateSpecializedCrmPipelineAndFunnelEngine';
import {
  evaluateDepositRecurringBillingAndCollection,
  evaluateOccupancyLeaseLifecycleAndAmendments,
  evaluateOperationsVendorsChargesAndAudit,
  evaluatePropertyOwnershipPortfolioAndHierarchy,
} from '../src/utils/propertyManagementLeaseBillingAndOperationsEngine';
import {
  evaluateBudgetProgressPaymentBoqAndSiteInventory,
  evaluateProjectEvmFeasibilityHandoverAndAudits,
  evaluateProjectWbsCriticalPathAndMilestones,
  evaluateSiteOpsQaHsePartnershipAndPresale,
} from '../src/utils/constructionDevelopmentWbsBudgetAndPartnershipEngine';
import {
  evaluateEnergyServicesHealthIndexAndFacilityAudits,
  evaluateFacilityAssetTaxonomyCommissioningAndWarranty,
  evaluateMaintenancePdmSlaRcaAndLifeCycleCost,
} from '../src/utils/facilityManagementPdmSlaEnergyAndHealthEngine';
import {
  evaluateLegalEvidenceConfidentialityDueDiligenceAndAudit,
  evaluatePoaEncumbrancesRegistryDiscrepanciesAndSuccession,
  evaluatePropertyLegalDossierAndChainOfTitle,
} from '../src/utils/realEstateLegalDossierTitleDisputeAndDueDiligenceEngine';
import {
  evaluateEntityResolutionGeoPrivacySnapshotAndQuality,
  evaluateMarketCyclesMacroAndForecastingAudits,
  evaluateMarketIndicatorsSpreadLiquidityAndOutliers,
  evaluateMarketProvenanceIngestionAndNormalization,
} from '../src/utils/marketIntelligenceProvenanceIndicatorsAndForecastAuditEngine';
import {
  evaluateLeverageBreakEvenDisposalHhiAndAudit,
  evaluatePortfolioExposureOpportunityAndCostBasis,
  evaluateXirrNpvRentalYieldAndReturnDecomposition,
} from '../src/utils/investmentPortfolioXirrNpvBreakEvenAndExitEngine';
import {
  evaluateMaintenanceBudgetContractorAccessAndSevenAudits,
  evaluatePhysicalAssetRegistrySymptomAndWorkOrderGate,
  evaluatePmScheduleEmergencyRepairReliabilityAndContractor,
} from '../src/utils/physicalAssetLifecycleContractorAccessAndFacilityAuditEngine';
import {
  evaluateDepositDeductionArrearsChequesAndAlerts,
  evaluateHandoverMultiUnitCommercialAndSixLeasingAudits,
  evaluateTenantApplicationAmendmentAndRentEscalation,
} from '../src/utils/leasingTenantLifecycleChequeAndHandoverAuditEngine';
import {
  evaluateOwnershipSeparationRegistryAndTitleConflicts,
  evaluateSettlementNotaryVsPossessionAndNineLegalAudits,
  evaluateSignatoryAuthorityPreliminarySaleAndConditions,
} from '../src/utils/propertyLegalTitleRegistryAndTransactionTransferEngine';
import {
  evaluateCostPerSqmEacHandoverAndFourConstructionAudits,
  evaluateProjectPhaseWeightedProgressAndSiteProvenance,
  evaluateSCurveEvmTenderingAndMaterialLifecycle,
} from '../src/utils/constructionProjectDeliveryContractorAndAuditEngine';

console.log('Running tests for Lazy GeoJSON + Bundles 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, and 131...');

// 1. Dynamic & Lazy GeoJSON Viewport Engine Tests
{
  const lowZoomPolicy = resolveGeoLazyLoadingPolicy(10, true);
  assert.equal(lowZoomPolicy.lowBandwidthOrMobileMode, true);
  assert.equal(lowZoomPolicy.maxVerticesPerPolygon, 6);
  assert.equal(lowZoomPolicy.metroStationsMinZoom, 13);

  const highZoomPolicy = resolveGeoLazyLoadingPolicy(14, false);
  assert.equal(highZoomPolicy.lowBandwidthOrMobileMode, false);
  assert.equal(highZoomPolicy.maxVerticesPerPolygon, 32);
  assert.equal(highZoomPolicy.metroStationsMinZoom, 12);

  const rawViewport = { north: 35.78, south: 35.70, east: 51.45, west: 51.35 };
  const expanded = expandGeoBoundingBox(rawViewport, 0.1);
  assert.equal(isPointInGeoBoundingBox(35.74, 51.40, expanded), true);
  assert.equal(isPointInGeoBoundingBox(35.55, 51.10, expanded), false);
  assert.equal(
    isGeometryIntersectingGeoBoundingBox(
      [
        [35.72, 51.38],
        [35.75, 51.42],
      ],
      expanded
    ),
    true
  );

  const filteredPts = filterPointsInGeoBoundingBox(
    [
      [35.74, 51.40],
      [35.55, 51.10],
    ],
    expanded
  );
  assert.equal(filteredPts.length, 1);

  const denseRing: [number, number][] = Array.from({ length: 60 }, (_, idx) => {
    const angle = (idx / 59) * Math.PI * 2;
    return [35.75 + Math.sin(angle) * 0.02, 51.41 + Math.cos(angle) * 0.02];
  });
  const simplifiedLow = simplifyPolygonRingForZoomLod(denseRing, 11, false, true);
  assert.equal(simplifiedLow.length, 6);
  const fullSelected = simplifyPolygonRingForZoomLod(denseRing, 11, true, false);
  assert.equal(fullSelected.length, 60);

  // Bounded LRU cache (min capacity is 16)
  const lru = new BoundedGeoJsonLruCache<string, { id: number }>(16);
  for (let i = 1; i <= 18; i++) {
    lru.set(`h-${i}`, { id: i });
  }
  assert.equal(lru.get('h-1'), undefined);
  assert.equal(lru.get('h-18')?.id, 18);
  assert.equal(lru.getStats().size, 16);
  assert.equal(lru.getStats().evictionsCount, 2);

  const batchPlan = planViewportBoundaryFetchBatch({
    allNeighborhoods: [
      { id: 1, name: 'ونک', lat: 35.755, lng: 51.41, radius: 1200 },
      { id: 2, name: 'سعادت‌آباد', lat: 35.78, lng: 51.375, radius: 1400 },
      { id: 3, name: 'شهرری', lat: 35.58, lng: 51.43, radius: 1800 },
    ],
    viewportBounds: rawViewport,
    loadedHoodIds: new Set<number>([2]),
    lowBandwidthOrMobileMode: false,
  });
  assert.equal(batchPlan.alreadyLoadedCount, 1);
  assert.equal(batchPlan.skippedOffscreenCount, 1);
  assert.equal(batchPlan.batch.length, 1);
  assert.equal(batchPlan.batch[0]?.id, 1);
}

// 2. Bundle 118 Tests (Real Estate Asset Management, CMMS, NOI, TCO)
{
  const asset = createAndTransitionManagedAsset({
    assetId: 'AST-THR-101',
    workspaceId: 'ws-1',
    assetCode: 'BLD-ELAHIYEH-01',
    titleFa: 'برج اداری-مسکونی الهیه',
    hierarchyType: 'BUILDING',
    legalOwnerId: 'OWNER-HOLDING-1',
    operationalResponsibilityHolderId: 'OPERATOR-FM-9',
    initialStage: 'ACQUISITION',
    requestedNextStage: 'ACTIVATION',
    actorId: 'usr-admin',
    actorWorkspaceId: 'ws-1',
    nowIso: '2026-11-01T00:00:00Z',
  });
  assert.equal(asset.allowed, true);

  const techProfile = buildTechnicalBuildingProfile({
    buildingId: 'BLD-ELAHIYEH-01',
    constructionYearJalali: 1399,
    structuralSystem: 'RC_SHEAR_WALL',
    floorsAboveGround: 14,
    basementsCount: 4,
    commonAreas: ['لابی اصلی', 'موتورخانه مرکزی'],
    technicalRooms: ['اتاق چیلر', 'پست برق'],
    hasOfficialStructuralCertificateDocument: false,
    reviewerEngineerId: null,
    updatedAtIso: '2026-11-01T00:00:00Z',
  });
  assert.ok(techProfile.safetyDisclaimerFa.length > 5);

  const equipment = registerAndReplaceBuildingEquipment({
    existingRegistry: [
      {
        equipmentId: 'EQ-ELEV-OLD',
        buildingId: 'BLD-ELAHIYEH-01',
        category: 'ELEVATOR',
        serialNumber: 'KONE-9981',
        equipmentOwnerId: 'OWNER-HOLDING-1',
        serviceResponsiblePartyId: 'VENDOR-ELEV-2',
        warrantyExpiresIso: '2025-01-01T00:00:00Z',
        status: 'ACTIVE',
      },
    ],
    newEquipment: {
      equipmentId: 'EQ-ELEV-NEW',
      buildingId: 'BLD-ELAHIYEH-01',
      category: 'ELEVATOR',
      serialNumber: 'KONE-2026-X',
      equipmentOwnerId: 'OWNER-HOLDING-1',
      serviceResponsiblePartyId: 'VENDOR-ELEV-2',
      warrantyExpiresIso: '2028-01-01T00:00:00Z',
      replacesEquipmentId: 'EQ-ELEV-OLD',
    },
    nowIso: '2026-11-01T00:00:00Z',
  });
  assert.equal(equipment.registered, true);
  assert.equal(equipment.historicalCountPreserved, 1);

  const dep = calculateAssetAccountingDepreciation({
    assetId: 'AST-THR-101',
    accountingPolicyVersion: 'IFRS-IAS16-V2',
    totalAcquisitionCostToman: 120_000_000_000,
    nonDepreciableLandAllocationToman: 45_000_000_000,
    capitalizedImprovementsToman: 5_000_000_000,
    residualSalvageValueToman: 8_000_000_000,
    usefulLifeMonths: 360,
    elapsedServiceMonths: 24,
    currentPeriodMonths: 1,
    method: 'STRAIGHT_LINE',
    currentMarketValuationToman: 168_000_000_000,
    alreadyPostedPeriodKeys: new Set(),
    periodKey: '1405-08',
  });
  assert.ok(dep.accountingCarryingValueToman < dep.currentMarketValuationToman);

  const charges = allocateBuildingServiceCharges({
    buildingId: 'BLD-ELAHIYEH-01',
    billingPeriodKey: '1405-08',
    allocationRuleVersion: 'RULE-V3',
    allocationMethod: 'VACANT_DISCOUNTED_AREA',
    approvedBudgetToman: 95_000_000,
    actualOperatingExpenseToman: 90_000_000,
    alreadyIssuedPeriodKeys: new Set(),
    units: [
      { unitId: 'U-101', areaSqm: 120, ownershipSharePercent: 50, isVacant: false, collectedPaymentToman: 45_000_000 },
      { unitId: 'U-102', areaSqm: 120, ownershipSharePercent: 50, isVacant: true, collectedPaymentToman: 20_000_000 },
    ],
  });
  assert.equal(charges.totalAllocatedToman, 90_000_000);
  assert.equal(charges.totalCollectedToman, 65_000_000);
  assert.equal(charges.totalOutstandingReceivablesToman, 25_000_000);

  const meters = validateMeterAndAllocateUtilityCosts({
    buildingMasterConsumptionUnits: 1120,
    tariffPerUnitToman: 18_000,
    fixedBaseFeePerUnitToman: 150_000,
    missingReadingPolicy: 'FLAG_UNBILLED_PENDING_READING',
    unitMeters: [
      { unitId: 'U-101', meterSerial: 'M-101', previousReading: 2400, currentReading: 2780 },
      { unitId: 'U-102', meterSerial: 'M-102', previousReading: 3100, currentReading: 3710 },
      { unitId: 'U-103', meterSerial: 'M-103', previousReading: 1950, currentReading: null },
    ],
  });
  assert.equal(meters.masterVsSubmeterUnexplainedDelta, 130);

  const cmmsTenantView = evaluateTenantServiceCmmsAndReliability({
    viewerRole: 'TENANT',
    viewerTenantId: 'TENANT-101',
    authorizedTenantIdForUnit: 'TENANT-101',
    ticket: {
      ticketId: 'TCK-804',
      unitId: 'U-101',
      tenantVisibleMessages: ['تکنسین ساعت ۱۶ مراجعه می‌کند.'],
      internalStaffNotes: ['یادداشت محرمانه مدیریت'],
    },
    workOrderCompletionAttempt: {
      workOrderId: 'WO-910',
      hasBeforePhotoEvidence: false,
      hasAfterPhotoEvidence: false,
      inspectorVerified: false,
    },
    equipmentReliabilityInput: {
      equipmentId: 'EQ-CHILLER-1',
      verifiedOperatingHours: null,
      failureCount: 3,
      totalDowntimeHours: 36,
    },
  });
  assert.equal(cmmsTenantView.sanitizedTicketView?.internalStaffNotes.length, 0);
  assert.equal(cmmsTenantView.reliabilityReport.mtbfHours, null);

  const inspection = evaluateBuildingInspectionCompliance({
    buildingId: 'BLD-ELAHIYEH-01',
    category: 'ELEVATOR_STANDARD',
    inspectionType: 'INTERNAL_CHECKLIST',
    issuingAuthorityName: null,
    certificateExpiresIso: '2027-05-01T00:00:00Z',
    unresolvedFindingsCount: 0,
    hasSignedCertificateAttachment: false,
    nowIso: '2026-11-01T00:00:00Z',
  });
  assert.equal(inspection.inspectionType, 'INTERNAL_CHECKLIST');

  const insurance = evaluateBuildingInsuranceAndClaim({
    policyId: 'POL-FIRE-405',
    policyStage: 'ISSUED_ACTIVE_POLICY',
    coverageLimitToman: 80_000_000_000,
    deductibleToman: 50_000_000,
    claimedAmountToman: 920_000_000,
    insurerApprovedSettlementToman: 650_000_000,
    receivedCashPaymentToman: 400_000_000,
  });
  assert.equal(insurance.pendingSettlementReceivableToman, 200_000_000);

  const noiAndYields = calculatePropertyNoiAndInvestmentYields({
    assetId: 'AST-THR-101',
    reportingPeriodLabel: 'سال مالی ۱۴۰۵',
    potentialGrossRentToman: 18_500_000_000,
    vacancyAndCreditLossToman: 1_500_000_000,
    collectedOperatingRevenueToman: 16_400_000_000,
    otherOperatingIncomeToman: 600_000_000,
    operatingExpensesToman: 2_800_000_000,
    capitalExpendituresToman: 1_200_000_000,
    debtServiceInterestAndPrincipalToman: 1_900_000_000,
    accountingDepreciationToman: 2_400_000_000,
    historicalAcquisitionCostToman: 120_000_000_000,
    currentMarketValuationToman: 168_000_000_000,
    totalEquityInvestedToman: 95_000_000_000,
  });
  assert.equal(noiAndYields.realizedCashNoiToman, 14_200_000_000);

  const tcoAndDecision = calculateAssetTcoAndRepairVsReplaceDecision({
    initialAcquisitionToman: 120_000_000_000,
    annualOperatingAndMaintenanceFlowsToman: [2_800_000_000, 3_100_000_000, 3_400_000_000],
    plannedCapexFlowsToman: [500_000_000, 1_200_000_000, 0],
    terminalDisposalCostOrSalvageToman: -15_000_000_000,
    annualDiscountRatePercent: 22,
    equipmentDecisionInput: {
      equipmentId: 'EQ-CHILLER-1',
      immediateRepairCostToman: 850_000_000,
      annualMaintenanceIfRepairedToman: 420_000_000,
      expectedRemainingYearsIfRepaired: 4,
      fullReplacementCostToman: 2_100_000_000,
      annualMaintenanceIfReplacedToman: 110_000_000,
      expectedDownTimeCostIfRepairedToman: 290_000_000,
      expectedDownTimeCostIfReplacedToman: 90_000_000,
    },
  });
  assert.ok(tcoAndDecision.tcoSummary.discountedNpvTcoToman > 0);
}

// 3. Bundle 119 Tests (Investment Portfolios, Funds, NAV, Waterfall, Multi-Root Safe IRR)
{
  const ownership = evaluateInvestmentOwnershipAndCircularGuard({
    edges: [
      { parentEntityId: 'INV-1', childTargetId: 'FUND-A', ownershipSharePercent: 40, interestType: 'INDIRECT_VEHICLE_UNITS', verifiedDocumentRef: 'DOC-1' },
      { parentEntityId: 'FUND-A', childTargetId: 'PROP-101', ownershipSharePercent: 60, interestType: 'REGISTERED_LEGAL_DEED', verifiedDocumentRef: 'DEED-101' },
      { parentEntityId: 'INV-1', childTargetId: 'PROP-101', ownershipSharePercent: 15, interestType: 'REGISTERED_LEGAL_DEED', verifiedDocumentRef: 'DEED-102' },
    ],
    rootInvestorId: 'INV-1',
    targetPropertyId: 'PROP-101',
  });
  assert.equal(ownership.effectiveEconomicSharePercent, 39);

  const capitalCalls = reconcileInvestorCapitalCallsAndContributions({
    investorId: 'INV-1',
    totalCommittedCapitalToman: 50_000_000_000,
    capitalCalls: [
      { callId: 'CALL-1', calledAmountToman: 20_000_000_000, receivedCashToman: 20_000_000_000, dueDateIso: '2026-04-01T00:00:00Z' },
      { callId: 'CALL-2', calledAmountToman: 15_000_000_000, receivedCashToman: 10_000_000_000, dueDateIso: '2026-09-01T00:00:00Z' },
    ],
    nowIso: '2026-11-01T00:00:00Z',
  });
  assert.equal(capitalCalls.uncalledRemainingCommitmentToman, 15_000_000_000);
  assert.equal(capitalCalls.outstandingCalledUnpaidToman, 5_000_000_000);

  const nav = calculateFundNavAndUnitValuation({
    vehicleId: 'FUND-TEHRAN-PRIME-1',
    valuationEffectiveDateIso: '2026-11-01T00:00:00Z',
    maxValuationAgeDays: 90,
    cashAndEligibleReceivablesToman: 14_000_000_000,
    accruedLiabilitiesAndDebtToman: 28_000_000_000,
    outstandingUnitsCount: 1_000_000,
    holdings: [
      { assetId: 'PROP-101', valuationAmountToman: 200_000_000_000, ownershipSharePercent: 60, valuationDateIso: '2026-10-15T00:00:00Z', evidenceSource: 'INDEPENDENT_CERTIFIED_APPRAISAL' },
      { assetId: 'PROP-102', valuationAmountToman: 90_000_000_000, ownershipSharePercent: 100, valuationDateIso: '2026-05-01T00:00:00Z', evidenceSource: 'INTERNAL_MANAGEMENT_ESTIMATE' },
    ],
  });
  assert.equal(nav.netAssetValueNavToman, 196_000_000_000);
  assert.equal(nav.navPerUnitToman, 196_000);

  const wfBlocked = calculateDistributionWaterfallAndFees({
    policyVersion: 'WATERFALL-LP-GP-V2',
    accountingProfitToman: 32_000_000_000,
    realizedDistributableCashToman: 24_000_000_000,
    unreturnedCapitalContributionsToman: 10_000_000_000,
    preferredReturnHurdleAmountToman: 4_500_000_000,
    managementFeePercentAnnual: 2,
    feeBasisToman: 150_000_000_000,
    performanceCarryPercentAboveHurdle: 20,
    highWaterMarkNavPerUnit: 180_000,
    currentNavPerUnit: 196_000,
    createdByUserId: 'mgr-maker-1',
    approvedByUserId: 'mgr-maker-1',
  });
  assert.equal(wfBlocked.sodPassed, false);

  const irrConverged = calculateSafePeriodicIrrAndPerformance({
    cashFlowsToman: [-10000, 1800, 2400, 11500],
    isProjectedScenario: false,
  });
  assert.ok((irrConverged.periodicIrrPercent ?? 0) > 10);

  const irrMultiRoot = calculateSafePeriodicIrrAndPerformance({
    cashFlowsToman: [-1000, 2500, -1600],
    isProjectedScenario: true,
  });
  assert.equal(irrMultiRoot.periodicIrrPercent, null);

  const govAndVdr = evaluatePortfolioLiquidityDebtGovernanceAndVdr({
    unrestrictedCashBalanceToman: 14_000_000_000,
    committedRestrictedCashToman: 4_000_000_000,
    illiquidPropertyMarketValueToman: 210_000_000_000,
    nearTermObligationsDueToman: 12_500_000_000,
    debtFacility: {
      committedFacilityLimitToman: 60_000_000_000,
      drawnPrincipalBalanceToman: 28_000_000_000,
      accruedInterestToman: 1_200_000_000,
      maxAllowedLtvPercent: 45,
    },
    governanceVote: {
      requiredThresholdPercent: 65,
      relatedPartyCounterpartyIds: new Set(['CP-RELATED-9']),
      transactionCounterpartyId: 'CP-RELATED-9',
      votes: [
        { partnerId: 'P-1', votingWeightPercent: 30, choice: 'APPROVE', isConflictedWithCounterparty: true },
        { partnerId: 'P-2', votingWeightPercent: 50, choice: 'APPROVE', isConflictedWithCounterparty: false },
        { partnerId: 'P-3', votingWeightPercent: 20, choice: 'REJECT', isConflictedWithCounterparty: false },
      ],
    },
    vdrAccessAttempt: {
      documentId: 'VDR-DOC-55',
      documentPortfolioId: 'PORT-1',
      viewerPortfolioId: 'PORT-1',
      grantExpiresIso: '2027-01-01T00:00:00Z',
      isGrantRevoked: false,
      nowIso: '2026-11-01T00:00:00Z',
    },
  });
  assert.equal(govAndVdr.liquidityReport.illiquidPropertyExcludedFromCashToman, 210_000_000_000);
}

// 4. Bundle 120 Tests (Market Intelligence, Share Normalization, Asking vs Tx, Specialized Sectors)
{
  const txDedupe = evaluateTransactionObservationAndDedupe({
    candidate: {
      observationId: 'OBS-202',
      propertyId: 'PROP-55',
      priceToman: 9_600_000_000,
      areaSqm: 100,
      observationDateIso: '2026-10-25T00:00:00Z',
      priceNature: 'OFFICIAL_REGISTERED_TRANSACTION',
      ownershipTransferredSharePercent: 50,
      buyerSellerPiiNames: ['علی رضایی', 'محمد حسینی'],
    },
    existingObservations: [
      {
        observationId: 'OBS-101',
        propertyId: 'PROP-55',
        priceToman: 8_200_000_000,
        areaSqm: 100,
        observationDateIso: '2026-02-10T00:00:00Z',
        priceNature: 'OFFICIAL_REGISTERED_TRANSACTION',
      },
    ],
    isPublicMarketDatasetView: true,
  });
  assert.equal(txDedupe.normalizedFullPropertyEquivalentToman, 19_200_000_000);

  const normalized = normalizeHeterogeneousPropertyRecord({
    rawTitleAndAddress: 'آپارتمان ۱۲۰ متري در خيابان وليعصر كوچه بهار',
    rawPriceString: '۱۴۵۰۰۰۰۰۰۰۰۰',
    rawCurrencyUnit: 'RIAL',
    rawAreaValue: 120,
    rawAreaUnit: 'SQM',
    normalizationRuleVersion: 'NORM-IR-V4',
  });
  assert.ok(normalized.rawPreserved.rawCurrencyUnit === 'RIAL');

  const pricingAndTom = analyzeMarketPricingRentAndTimeOnMarket({
    depositToMonthlyRentConversionRateAnnualPercent: 36,
    records: [
      { id: 'R1', recordKind: 'ACTIVE_ASKING_LISTING', pricePerSqmToman: 165_000_000, publishedAtIso: '2026-09-01T00:00:00Z', closedOrWithdrawnAtIso: null, depositToman: 1_500_000_000, monthlyRentToman: 30_000_000 },
      { id: 'R2', recordKind: 'CONFIRMED_SALE_TRANSACTION', pricePerSqmToman: 148_000_000, publishedAtIso: '2026-08-01T00:00:00Z', closedOrWithdrawnAtIso: '2026-09-12T00:00:00Z' },
      { id: 'R3', recordKind: 'WITHDRAWN_LISTING', pricePerSqmToman: 185_000_000, publishedAtIso: '2026-07-01T00:00:00Z', closedOrWithdrawnAtIso: '2026-09-25T00:00:00Z' },
    ],
  });
  assert.equal(pricingAndTom.askingDistribution.medianPricePerSqmToman, 165_000_000);
  assert.equal(pricingAndTom.confirmedTransactionDistribution.medianPricePerSqmToman, 148_000_000);

  const regimeAndSurveillance = evaluateMarketRegimeSurveillanceAndCrossCity({
    monthlyPriceIndexSeries: [100, 102, 103, 126, 131, 135],
    listingPriceJumpPercentIn24h: 32,
    relistCountIn30Days: 5,
    researchBulletin: { reportId: 'REP-1405-Q3', workflowStage: 'PUBLISHED_PUBLIC', datasetSnapshotVersion: 'SNAP-2026-10' },
    cityComparison: {
      cityA: { nameFa: 'تهران', medianSqmPrice: 148_000_000, currency: 'TOMAN', sampleCount: 1420 },
      cityB: { nameFa: 'کرج', medianSqmPrice: 680_000_000, currency: 'RIAL', sampleCount: 610 },
    },
  });
  assert.equal(regimeAndSurveillance.surveillanceAlert.anomalyFlaggedForAnalystReview, true);

  const sectors = evaluateSpecializedPropertySectorIntelligence({
    landParcel: { parcelAreaSqm: 450, frontageMeters: 15, totalLandPriceToman: 112_500_000_000, hasOfficialMunicipalityZoningPermitRecord: false, permittedFarFromOfficialRecord: 4.2 },
    industrialFacility: { usableWarehouseSqm: 2400, clearCeilingHeightMeters: 9.5, threePhasePowerKw: 250, hasUtilityCompanyPowerCertificate: true },
    presaleProject: { projectId: 'PRJ-CHITGAR-9', stage: 'ADVERTISED_PRESALE_OFFER', developerReportedProgressPercent: 65, independentInspectorVerifiedProgressPercent: 48 },
  });
  assert.equal(sectors.landSector.landPricePerSqmToman, 250_000_000);
}

// 5. Bundle 121 Tests (Specialized Real Estate CRM, Scoring, Matching, Viewing Conflicts & Loop Guard)
{
  const contactAndScore = evaluateCrmContactLeadAndExplainableScore({
    contact: { contactId: 'CNT-501', workspaceId: 'ws-1', fullName: 'سارا احمدی', entityType: 'INDIVIDUAL', hasPlatformLoginAccount: false, phoneNumbers: ['09121112233'] },
    existingWorkspaceContacts: [{ contactId: 'CNT-500', fullName: 'همسر سارا احمدی', phoneNumbers: ['09121112233'] }],
    leadScoringInput: {
      statedBudgetVerified: true,
      timelineUrgencyDays: 10,
      propertyFitRatio0To1: 0.9,
      recordedInteractionsCount: 3,
      manualOverrideAdjustment: { deltaPoints: 5, actorId: 'mgr-1', reason: 'مشتری معرفی‌شده ویژه' },
    },
    viewerWorkspaceId: 'ws-1',
  });
  assert.equal(contactAndScore.allowed, true);
  if (contactAndScore.allowed) {
    assert.equal(contactAndScore.contactSummary.autoMergedOnPhoneAlone, false);
    assert.ok(contactAndScore.leadScoreExplanation.finalScore0To100 > 70);
  }

  const matching = matchCustomerRequirementsToProperties({
    requirement: {
      requirementId: 'REQ-1',
      transactionType: 'BUY',
      mandatoryMaxBudgetToman: 18_000_000_000,
      mandatoryMinAreaSqm: 95,
      mandatoryDistrictIds: [1, 3],
      preferredMinRooms: 2,
      preferredMustHaveElevator: true,
    },
    candidateListings: [
      { listingId: 'LST-NIYAVARAN-1', status: 'ACTIVE_AVAILABLE', transactionType: 'BUY', priceToman: 16_800_000_000, areaSqm: 110, districtId: 1, roomsCount: 2, hasElevator: true },
      { listingId: 'LST-EXPIRED-2', status: 'EXPIRED', transactionType: 'BUY', priceToman: 15_000_000_000, areaSqm: 105, districtId: 1, roomsCount: 2, hasElevator: true },
    ],
  });
  assert.equal(matching.rankedMatches.length, 1);
  assert.equal(matching.rankedMatches[0]?.listingId, 'LST-NIYAVARAN-1');

  const pipelineAndDeal = evaluatePipelineViewingNegotiationAndDealConversion({
    pipelineType: 'BUYER_ACQUISITION',
    currentStage: 'OFFER_NEGOTIATION',
    requestedStage: 'CONTRACT_DRAFTING',
    viewingRequest: {
      agentId: 'AG-1',
      proposedStartIso: '2026-11-02T14:00:00Z',
      proposedEndIso: '2026-11-02T15:00:00Z',
      existingAgentAppointments: [{ startIso: '2026-11-02T14:30:00Z', endIso: '2026-11-02T15:30:00Z' }],
      viewerIsAuthorizedAgentOrParty: false,
      privateAccessCodeNote: 'رمز درب ورودی: 4488',
    },
    offerChain: [{ offerId: 'OFF-1', amountToman: 16_500_000_000, expiresIso: '2026-11-05T00:00:00Z', status: 'ACCEPTED_IN_PRINCIPLE', internalBrokerNote: 'فروشنده تا ۱۶.۳ هم راضی می‌شود' }],
    dealConversionAttempt: { opportunityId: 'OPP-77', hasAcceptedOffer: true, hasVerifiedBuyerAndSellerIdentities: true, alreadyConvertedOpportunityIds: new Set() },
  });
  assert.equal(pipelineAndDeal.viewingAppointment.hasScheduleConflict, true);
  assert.equal(pipelineAndDeal.viewingAppointment.exposedAccessNote, null);
  assert.equal(pipelineAndDeal.dealConversion.canConvertToDeal, true);

  const funnelAndAuto = evaluateCrmAttributionPerformanceFunnelAndAutomation({
    touchpoints: [
      { channel: 'GOOGLE_SEARCH', timestampIso: '2026-10-01T10:00:00Z' },
      { channel: 'INSTAGRAM_CAMPAIGN', timestampIso: '2026-10-20T18:00:00Z' },
    ],
    sharedDealCreditSplits: [
      { agentId: 'AG-1', sharePercent: 60, dealValueToman: 16_500_000_000 },
      { agentId: 'AG-2', sharePercent: 40, dealValueToman: 16_500_000_000 },
    ],
    csatSurvey: { invitationsSentCount: 40, responsesSubmittedCount: 28, ratingsOneToFive: [5, 4, 5, 5, 4] },
    cohortFunnel: { cohortLeadsCount: 120, stageQualifiedCount: 48, closedWonDealsCount: 9 },
    automationTrigger: { workflowId: 'WF-FOLLOWUP-1', recursionDepth: 4, maxAllowedRecursionDepth: 3, isDryRunMode: false },
    workspaceBusinessModel: 'ENTERPRISE_MULTI_BRANCH',
  });
  assert.equal(funnelAndAuto.attribution.firstTouchChannel, 'GOOGLE_SEARCH');
  assert.equal(funnelAndAuto.attribution.latestTouchChannel, 'INSTAGRAM_CAMPAIGN');
  assert.equal(funnelAndAuto.automationExecution.status, 'ABORTED_RECURSIVE_AUTOMATION_LOOP');
}

// 6. Bundle 122 Tests (Property Management Core, Ownership, Leases, Recurring Jalali Billing, Collection & Audit)
{
  const pmCore = evaluatePropertyOwnershipPortfolioAndHierarchy({
    actorWorkspaceId: 'ws-1',
    resourceWorkspaceId: 'ws-1',
    requireCompleteHundredPercentAllocation: true,
    ownershipRecords: [
      { ownerId: 'OWN-1', ownerType: 'INDIVIDUAL', sharePercent: 60, effectiveFromIso: '2024-01-01', effectiveToIso: null, verifiedDeedOrContractRef: 'DEED-1' },
      { ownerId: 'OWN-2', ownerType: 'LEGAL_ENTITY', sharePercent: 40, effectiveFromIso: '2024-01-01', effectiveToIso: null, verifiedDeedOrContractRef: 'DEED-2' },
      { ownerId: 'PM-CO', ownerType: 'LEGAL_ENTITY', sharePercent: 0, effectiveFromIso: '2025-01-01', effectiveToIso: null, verifiedDeedOrContractRef: null, isManagementOrganizationOnly: true },
    ],
    hierarchyNodes: [
      { nodeId: 'CMP-1', parentId: null, nodeKind: 'COMPLEX', unitCode: 'PARSIAN', persianLabel: 'مجتمع پارسیان' },
      { nodeId: 'BLD-A', parentId: 'CMP-1', nodeKind: 'BUILDING', unitCode: 'BLCK-A', persianLabel: 'بلوک الف' },
      { nodeId: 'U-101', parentId: 'BLD-A', nodeKind: 'RESIDENTIAL_UNIT', unitCode: '101', persianLabel: 'واحد ۱۰۱' },
    ],
    portfolioValuationInput: {
      acquisitionCostToman: 42_000_000_000,
      estimatedMarketValueToman: 58_000_000_000,
      verifiedTransactionPriceToman: null,
    },
  });
  assert.equal(pmCore.workspaceAuthorized, true);
  assert.equal(pmCore.ownershipAllocationValid, true);
  assert.equal(pmCore.managementOrgExcludedFromOwnershipCount, 1);
  assert.equal(pmCore.hasHierarchyCycle, false);
  assert.equal(pmCore.portfolioValuationClassification, 'ESTIMATED_VALUATION_ONLY');

  const leaseCheck = evaluateOccupancyLeaseLifecycleAndAmendments({
    unitId: 'U-101',
    viewerIsAuthorizedManagerOrOwner: false,
    physicalOccupancyState: 'TENANT_OCCUPIED',
    occupantFullNamePii: 'PRIVATE_TENANT_NAME',
    leases: [
      { leaseId: 'L-1', category: 'RESIDENTIAL', contractStatus: 'EXECUTED_ACTIVE', startIso: '2026-03-21T00:00:00Z', endIso: '2027-03-20T00:00:00Z', monthlyRentToman: 45_000_000, depositAmountToman: 1_500_000_000, autoRenewalExplicitlyConfigured: false },
      { leaseId: 'L-DRAFT', category: 'RESIDENTIAL', contractStatus: 'UNSIGNED_DRAFT', startIso: '2027-03-21T00:00:00Z', endIso: '2028-03-20T00:00:00Z', monthlyRentToman: 55_000_000, depositAmountToman: 1_800_000_000, autoRenewalExplicitlyConfigured: false },
    ],
    proposedAmendment: {
      amendmentId: 'AMD-1',
      targetLeaseId: 'L-1',
      effectiveFromIso: '2026-09-23T00:00:00Z',
      newMonthlyRentToman: 48_000_000,
      approvedByLandlordAndTenant: true,
    },
  });
  assert.equal(leaseCheck.visibleOccupantName, null);
  assert.equal(leaseCheck.unsignedDraftsExcludedFromActiveObligationsCount, 1);
  assert.equal(leaseCheck.amendmentOutcome.preservedOriginalMonthlyRentToman, 45_000_000);
  assert.equal(leaseCheck.amendmentOutcome.effectiveAmendedMonthlyRentToman, 48_000_000);

  const billing = evaluateDepositRecurringBillingAndCollection({
    leaseId: 'L-1',
    contractualDepositToman: 1_500_000_000,
    verifiedReceivedDepositCashToman: 1_200_000_000,
    approvedDeductionsToman: 50_000_000,
    refundedDepositCashToman: 0,
    billingScheduleRequest: {
      termVersion: 'V1',
      monthlyRentToman: 45_000_000,
      requestedPeriods: [
        { periodKey: '1405-06', jalaliMonthNumber: 6, isJalaliLeapYear: false, contractualDueDayOfMonth: 31 },
        { periodKey: '1405-12', jalaliMonthNumber: 12, isJalaliLeapYear: false, contractualDueDayOfMonth: 31 },
      ],
      alreadyGeneratedIdempotencyKeys: new Set(),
    },
    paymentEvents: [
      { paymentId: 'P1', providerTxRef: 'TX-100', stage: 'AUTHORITATIVE_SETTLED', amountToman: 45_000_000 },
      { paymentId: 'P1-DUP', providerTxRef: 'TX-100', stage: 'AUTHORITATIVE_SETTLED', amountToman: 45_000_000 },
      { paymentId: 'P2-INIT', providerTxRef: 'TX-101', stage: 'INITIATED_UNCONFIRMED', amountToman: 45_000_000 },
    ],
  });
  assert.equal(billing.depositSummary.unpaidContractualDepositGapToman, 300_000_000);
  assert.equal(billing.generatedReceivables[1]?.effectiveDueDayOfMonth, 29);
  assert.equal(billing.collectionReconciliation.authoritativeSettledCashToman, 45_000_000);
  assert.deepEqual(billing.collectionReconciliation.duplicateProviderTxRefsBlocked, ['TX-100']);

  const pmAudit = evaluateOperationsVendorsChargesAndAudit({
    operatingExpense: { invoiceNumber: 'INV-1', alreadyRecordedInvoices: new Set(), amountToman: 100_000_000, hasApprovedAllocationPolicy: true },
    vendorAndMaintenance: { vendorId: 'V1', hasVerifiedQualificationDocs: true, licenseExpiresIso: '2027-06-01T00:00:00Z', nowIso: '2026-11-01T00:00:00Z', workOrderHasCompletionEvidence: true, workOrderInspectorConfirmed: true },
    commonChargeAllocation: { policyVersion: 'POL-1', preserveHistoricalSnapshot: true, totalCommonExpenseToman: 100_000_000, unitSharesPercent: [33.33, 33.33, 33.34] },
    utilityMeterCheck: { previousReading: 9900, currentReading: 150, isConfirmedMeterRollover: true, isEstimatedReadingOnly: false },
    insuranceAndInspection: { hasPolicyDocumentEvidence: true, policyExpiresIso: '2027-08-01T00:00:00Z', inspectionHasCertifiedEngineerSignOff: false, unresolvedCriticalFindingsCount: 0 },
  });
  assert.equal(pmAudit.chargeAllocationBreakdown.totalReconciledExactToman, 100_000_000);
  assert.equal(pmAudit.utilityConsumptionStatus, 'ROLLOVER_HANDLED');
  assert.equal(pmAudit.certifiedEngineeringInspectionBadgeAllowed, false);
  assert.equal(pmAudit.auditReadinessStatus, 'AUDIT_PASSED_ZERO_CRITICAL_GAPS');
}

// 7. Bundle 123 Tests (Construction Project WBS, CPM, Budget, Progress Payment, BOQ, Partnership, EVM & 6 Audits)
{
  const wbsCpm = evaluateProjectWbsCriticalPathAndMilestones({
    actorWorkspaceId: 'ws-1',
    projectWorkspaceId: 'ws-1',
    projectCategory: 'MIXED_USE',
    activities: [
      { activityId: 'A1', parentId: null, wbsCode: '1.1', titleFa: 'گودبرداری', durationDays: 45, predecessorIds: [], baselineCostToman: 18_000_000_000 },
      { activityId: 'A2', parentId: null, wbsCode: '1.2', titleFa: 'اسکلت', durationDays: 120, predecessorIds: ['A1'], baselineCostToman: 65_000_000_000 },
      { activityId: 'A3', parentId: null, wbsCode: '1.3', titleFa: 'نازک‌کاری', durationDays: 90, predecessorIds: ['A2'], baselineCostToman: 52_000_000_000 },
    ],
    milestones: [
      { milestoneId: 'M1', titleFa: 'تحویل اسکلت', hasRequiredAcceptanceEvidence: false, contractuallyAcceptedByClient: false, internalTeamMarkedComplete: true },
    ],
  });
  assert.equal(wbsCpm.hasDependencyCycle, false);
  assert.equal(wbsCpm.projectDurationDays, 255);
  assert.deepEqual(wbsCpm.criticalPathActivityIds, ['A1', 'A2', 'A3']);
  assert.deepEqual(wbsCpm.milestonesBlockedWithoutEvidenceIds, ['M1']);

  const budgetBoq = evaluateBudgetProgressPaymentBoqAndSiteInventory({
    budgetLedger: {
      initialEstimatedCostToman: 130_000_000_000,
      approvedBaselineBudgetToman: 135_000_000_000,
      committedPurchaseOrdersToman: 98_000_000_000,
      incurredVerifiedWorkToman: 84_000_000_000,
      invoicedPayableToman: 80_000_000_000,
      settledPaidCashToman: 72_000_000_000,
    },
    progressPaymentApplication: {
      applicationId: 'IPC-04',
      alreadyCertifiedApplicationIds: new Set(),
      contractorSubmittedGrossToman: 15_000_000_000,
      engineerVerifiedGrossToman: 14_000_000_000,
      retentionRatePercent: 10,
      advanceAmortizationDeductionToman: 1_400_000_000,
      taxAndInsuranceDeductionToman: 700_000_000,
      isApprovedByProjectManager: true,
    },
    boqItems: [
      { itemCode: 'REBAR', unit: 'KG', estimatedQuantity: 100_000, executedVerifiedQuantity: 110_000, unitRateToman: 40_000 },
    ],
    siteInventoryMovements: [
      { movementId: 'MV-1', materialCode: 'CEMENT-BAG', kind: 'RECEIPT', quantity: 100 },
      { movementId: 'MV-2', materialCode: 'CEMENT-BAG', kind: 'ISSUE_TO_WBS', quantity: 140 },
    ],
  });
  assert.equal(budgetBoq.paymentCertificate.retentionDeductedToman, 1_400_000_000);
  assert.equal(budgetBoq.paymentCertificate.netPayableToContractorToman, 10_500_000_000);
  assert.deepEqual(budgetBoq.boqReconciliation.quantityOverrunItemCodes, ['REBAR']);
  assert.deepEqual(budgetBoq.siteInventoryStatus.rejectedNegativeStockMovementIds, ['MV-2']);

  const siteAndPartnership = evaluateSiteOpsQaHsePartnershipAndPresale({
    equipmentReservations: [
      { reservationId: 'R1', equipmentId: 'CRANE-1', startMs: 1000, endMs: 2000 },
      { reservationId: 'R2', equipmentId: 'CRANE-1', startMs: 1500, endMs: 2500 },
    ],
    qaAndHse: { ncrId: 'NCR-1', hasReinspectionVerificationEvidence: false, hseIncidentCount: 1, viewerAuthorizedForConfidentialHse: true },
    changeOrder: { originalApprovedBudgetToman: 135_000_000_000, proposedBudgetDeltaToman: 8_000_000_000, isChangeOrderApproved: false },
    unitAllocationAttempt: { unitId: 'U-501', currentStatus: 'RESERVED', treatReservationAsCompletedSale: true },
    jointPartnership: {
      landownerLandValuationToman: 180_000_000_000,
      developerCashConstructionContributionToman: 120_000_000_000,
      contractualLandownerUnitSharePercent: 60,
      contractualDeveloperUnitSharePercent: 40,
      simulatedLandownerSharePercent: 65,
      totalCompletedUnitsCount: 20,
    },
  });
  assert.equal(siteAndPartnership.hasEquipmentOverlapConflict, true);
  assert.equal(siteAndPartnership.ncrCanCloseAsResolved, false);
  assert.equal(siteAndPartnership.changeOrderResult.effectiveCurrentAuthorizedBudgetToman, 135_000_000_000);
  assert.equal(siteAndPartnership.unitAllocationAllowed, false);
  assert.equal(siteAndPartnership.reservationRecognizedAsSaleRevenue, false);
  assert.equal(siteAndPartnership.partnershipSummary.simulationMutatedExecutedContract, false);

  const evmAndAudit = evaluateProjectEvmFeasibilityHandoverAndAudits({
    earnedValueInput: { hasDocumentedMeasurementBasis: true, plannedValuePvToman: 100_000_000_000, earnedValueEvToman: 92_000_000_000, actualCostAcToman: 88_000_000_000 },
    delayForecastInput: { observedHistoricalDelayDays: 6, criticalPredecessorRemainingSlippageDays: 5, isStatisticalBacktestedModel: false },
    handoverAndWarranty: { unresolvedMandatoryPunchListCount: 0, defectReportedIso: '2027-02-01T00:00:00Z', warrantyExpiresIso: '2028-02-01T00:00:00Z', defectVerifiedResolvedWithEvidence: true },
  });
  assert.equal(evmAndAudit.evmMetrics.costVarianceCvToman, 4_000_000_000);
  assert.equal(evmAndAudit.evmMetrics.scheduleVarianceSvToman, -8_000_000_000);
  assert.equal(evmAndAudit.delayForecast.projectedTotalDelayDays, 11);
  assert.equal(evmAndAudit.comprehensiveAuditVerdict, 'RELEASE_READY_ALL_6_AUDITS_VERIFIED');
}

// 8. Bundle 124 Tests (Facility & Asset Management, Commissioning Gate, PdM Readiness, SLA, LCC, EUI & 10 Audits)
{
  const assetComm = evaluateFacilityAssetTaxonomyCommissioningAndWarranty({
    actorTenantId: 'ws-1',
    assetTenantId: 'ws-1',
    operatingModel: 'OUTSOURCED_FM',
    assetRecord: {
      immutableInternalAssetId: 'UUID-CHILLER-901',
      humanReadableAssetCode: 'MEP-CHL-01',
      editableDisplayNameFa: 'چیلر جذبی موتورخانه مرکزی',
      previousDisplayNamesFa: ['چیلر ۱'],
      legalOwnerId: 'OWN-1',
      physicalCustodianId: 'CUST-1',
      operationalResponsiblePartyId: 'FM-CO-1',
      locationNodeId: 'ROOM-MEP-B2',
    },
    commissioningAttempt: {
      requestedState: 'OPERATIONAL',
      mandatoryChecklistCompleted: false,
      commissioningAuthoritySignedOff: false,
      failedChecksCount: 2,
    },
    warrantyClaimAttempt: {
      claimId: 'WCL-101',
      alreadySubmittedClaimIds: new Set(['WCL-101']),
      incidentIso: '2026-11-01T00:00:00Z',
      warrantyStartIso: '2026-01-01T00:00:00Z',
      warrantyExpiryIso: '2028-01-01T00:00:00Z',
      isComponentExplicitlyExcluded: false,
    },
  });
  assert.equal(assetComm.separationOfOwnershipCustodyAndOperationValid, true);
  assert.equal(assetComm.commissioningTransition.allowedToBecomeOperational, false);
  assert.equal(assetComm.warrantyClaimOutcome.accepted, false);
  assert.equal(assetComm.warrantyClaimOutcome.coverageStatus, 'REJECTED_DUPLICATE_CLAIM');

  const pdmSlaLcc = evaluateMaintenancePdmSlaRcaAndLifeCycleCost({
    pdmReadinessInput: {
      historicalFailureEventsCount: 3,
      continuousTelemetrySamplesCount: 15,
      minRequiredEventsForStatisticalTrend: 8,
      minRequiredSamplesForPredictiveModel: 1000,
    },
    slaEvaluation: {
      userReportedUrgency: 'LOW',
      safetyImpactHigh: true,
      assetCriticalityHigh: true,
      reportedAtMs: 1_000_000,
      respondedAtMs: 4_000_000,
      pausedDurationMs: 1_500_000,
      targetResponseBudgetMs: 3_600_000,
    },
    technicianAssignment: {
      requiredSkillCode: 'ELEVATOR_CERT',
      technicianSkills: ['ELEVATOR_CERT'],
      certificationExpiresMs: 1000,
      nowMs: 2000,
    },
    sparePartStock: {
      physicalOnHandQty: 10,
      reservedForOtherWorkOrdersQty: 7,
      requestedWithdrawalQty: 5,
    },
    rcaInvestigation: {
      hasVerifiedRootCauseEvidence: false,
      isMajorIncident: true,
    },
    lccComponentsToman: {
      verifiedAcquisitionToman: 4_000_000_000,
      verifiedInstallationToman: 300_000_000,
      verifiedPreventiveAndCorrectiveMaintenanceToman: 500_000_000,
      verifiedReplacementAndDisposalToman: null,
    },
  });
  assert.equal(pdmSlaLcc.pdmReadiness.readinessTier, 'INSUFFICIENT_DATA_NO_PDM');
  assert.equal(pdmSlaLcc.pdmReadiness.autoTriggerSafetyCriticalActionAllowed, false);
  assert.equal(pdmSlaLcc.slaResult.systemAssessedPriority, 'P1_CRITICAL_SAFETY');
  assert.equal(pdmSlaLcc.slaResult.slaBreached, false);
  assert.equal(pdmSlaLcc.technicianQualifiedAndCertified, false);
  assert.equal(pdmSlaLcc.sparePartWithdrawal.withdrawalAllowedWithoutNegativeStock, false);
  assert.equal(pdmSlaLcc.rcaCanCloseMajorIncident, false);
  assert.equal(pdmSlaLcc.lccSummary.hasIncompleteCostCategoriesWarning, true);

  const energyHealth = evaluateEnergyServicesHealthIndexAndFacilityAudits({
    energyBenchmarkInput: {
      buildingCategory: 'COMMERCIAL_OFFICE',
      peerBenchmarkCategory: 'RESIDENTIAL',
      verifiedMeasuredKwh: 140_000,
      grossFloorAreaSqm: 2000,
    },
    cleaningAndParking: {
      scheduledCleaningTimePassed: true,
      supervisorVerifiedExecutionEvidence: false,
      parkingSpaceId: 'P-12',
      activeAssignedUnitIdsForSpace: ['U-101', 'U-102'],
    },
    residentComplaintPrivacy: {
      reporterResidentId: 'RES-1',
      viewerResidentId: 'RES-2',
      viewerIsAuthorizedBuildingManager: false,
      complaintSummaryFa: 'شکایت خصوصی واحد ۱',
      internalOperationalNoteFa: 'یادداشت داخلی مدیریت',
    },
    assetHealthInput: {
      policyVersion: 'AHI-V2',
      verifiedInspectionScore0To100: null,
      maintenanceComplianceScore0To100: 90,
      operationalAvailabilityScore0To100: 95,
    },
  });
  assert.equal(energyHealth.energyPerformance.comparableCategoryValid, false);
  assert.equal(energyHealth.cleaningMarkedCompleted, false);
  assert.equal(energyHealth.hasParkingDoubleAssignmentConflict, true);
  assert.equal(energyHealth.residentComplaintView.complaintVisible, false);
  assert.equal(energyHealth.assetHealthAssessment.compositeHealthIndex0To100, null);
}

// 9. Bundle 125 Tests (Legal Dossier, Chain of Title, POA Scope, Area Discrepancy, Hash != Legal Authenticity, Pre-Signature Gate)
{
  const dossier = evaluatePropertyLegalDossierAndChainOfTitle({
    propertyId: 'PROP-101',
    asOfHistoricalDateIso: '2026-11-01T00:00:00Z',
    uploadedDocuments: [
      { docId: 'D1', category: 'SINGLE_LEAF_DEED', copyKind: 'ORIGINAL_SIGHTED', reviewerVerifiedValidity: true, sourceAnchorRef: 'P1' },
      { docId: 'D2', category: 'COMPLETION_CERTIFICATE', copyKind: 'UNVERIFIED_USER_SCAN', reviewerVerifiedValidity: true, sourceAnchorRef: null },
    ],
    chainOfTitleEvents: [
      { eventId: 'E1', transferorId: 'INITIAL_CADASTRE', transfereeId: 'OWN-A', transferredSharePercent: 100, executionDateIso: '2020-01-01', registrationDateIso: '2020-01-05', effectiveDateIso: '2020-01-05', interestKind: 'REGISTERED_LEGAL_OWNERSHIP', hasVerifiedRegistryInstrument: true },
      { eventId: 'E2', transferorId: 'OWN-A', transfereeId: 'OWN-B', transferredSharePercent: 40, executionDateIso: '2024-06-01', registrationDateIso: '2024-06-10', effectiveDateIso: '2024-06-10', interestKind: 'REGISTERED_LEGAL_OWNERSHIP', hasVerifiedRegistryInstrument: true },
      { eventId: 'E3-CLAIM', transferorId: 'OWN-B', transfereeId: 'CLAIMANT-C', transferredSharePercent: 20, executionDateIso: '2025-01-01', registrationDateIso: '2025-01-01', effectiveDateIso: '2025-01-01', interestKind: 'CONTRACTUAL_CLAIM_ONLY', hasVerifiedRegistryInstrument: false },
    ],
  });
  assert.equal(dossier.documentPresenceDoesNotImplyLegalValidity, true);
  assert.equal(dossier.verifiedDocumentsCount, 1);
  assert.equal(dossier.unverifiedUserScansCount, 1);
  assert.deepEqual(dossier.reconstructedRegisteredOwnersAsOfDate, { 'OWN-A': 60, 'OWN-B': 40 });
  assert.equal(dossier.unverifiedOrNonOwnershipClaimsExcludedCount, 1);

  const poaDiscrepancy = evaluatePoaEncumbrancesRegistryDiscrepanciesAndSuccession({
    powerOfAttorneyAttempt: {
      poaId: 'POA-1',
      isGeneralAdministrativeOnly: true,
      enumeratedPowers: ['MUNICIPAL_FOLLOWUP'],
      requestedTransactionAction: 'SALE_TRANSFER',
      isRevokedOrExpired: false,
      hasVerifiedNotaryRevocationCheck: true,
    },
    encumbrances: [
      { encumbranceId: 'ENC-1', kind: 'JUDICIAL_SEIZURE', sourceKind: 'OFFICIAL_REGISTRY_NOTICE', status: 'ACTIVE_UNRESOLVED' },
      { encumbranceId: 'ENC-2', kind: 'BANK_MORTGAGE', sourceKind: 'OFFICIAL_REGISTRY_NOTICE', status: 'RELEASED_HISTORICAL' },
    ],
    registryInquiry: {
      inquiryId: 'INQ-1',
      sourceType: 'MANUAL_INTERNAL_CHECK_ONLY',
      expiresAtMs: 5000,
      nowMs: 1000,
    },
    areaDiscrepancy: {
      titleDeedAreaSqm: 120,
      municipalCompletionCertAreaSqm: 123.5,
      cadastralSubdivisionAreaSqm: 120,
    },
    inheritanceRecord: {
      hasOfficialSuccessionCertificate: true,
      declaredHeirsShareSumPercent: 100,
    },
  });
  assert.equal(poaDiscrepancy.poaAuthorization.authorizedForRequestedAction, false);
  assert.equal(poaDiscrepancy.poaAuthorization.reason, 'BLOCKED_GENERAL_POA_LACKS_EXPLICIT_SALE_AUTHORITY');
  assert.equal(poaDiscrepancy.activeBlockingEncumbrancesCount, 1);
  assert.equal(poaDiscrepancy.historicalReleasedPreservedCount, 1);
  assert.equal(poaDiscrepancy.registryInquiryStatus, 'MANUAL_REVIEW_NOT_OFFICIAL_REGISTRY');
  assert.equal(poaDiscrepancy.discrepancyReport.maxDeltaSqm, 3.5);
  assert.equal(poaDiscrepancy.discrepancyReport.requiresLegalAndCadastralResolution, true);

  const legalGate = evaluateLegalEvidenceConfidentialityDueDiligenceAndAudit({
    evidenceControl: { originalVersionImmutable: true, sha256DigestPresent: true, humanReviewedOcrTranscription: true },
    matterAccessCheck: {
      viewerUserId: 'ordinary-pm',
      matterAuthorizedUserIds: new Set(['legal-counsel']),
      viewerHasOrdinaryPropertyManagerRoleOnly: true,
      confidentialCaseSummaryFa: 'پرونده محرمانه قضایی',
    },
    litigationCase: { caseId: 'C1', hasRecordedCourtJudgment: true, hasVerifiedEnforcementExecutionReceipt: false },
    preSignatureDueDiligence: {
      transactionType: 'SALE',
      ownershipVerified: true,
      signatoryAuthorityVerified: false,
      activeSeizuresOrDisputesCount: 1,
      mandatoryPermitsVerified: true,
      legalReviewerSignedOff: true,
    },
  });
  assert.equal(legalGate.evidenceIntegrity.hashProvesLegalAuthenticity, false);
  assert.equal(legalGate.confidentialMatterAccess.exposedCaseSummaryFa, null);
  assert.equal(legalGate.litigationJudgmentExecuted, false);
  assert.equal(legalGate.preSignatureGate.signingReadinessApproved, false);
  assert.equal(legalGate.preSignatureGate.blockingReasons.length, 2);
}

// 10. Bundle 126 Tests (Market Provenance, No-Currency Quarantine, Entity Resolution, Disappearance != Sale, Outliers & Forecast Audit)
{
  const ingest = evaluateMarketProvenanceIngestionAndNormalization({
    sourceRegistration: { sourceId: 'SRC-1', sourceClass: 'OFFICIAL_REGISTRY', status: 'ACTIVE', redistributionPermitted: true, reputationScore0To100: 99 },
    ingestionBatch: {
      batchId: 'B-1',
      alreadyProcessedBatchIds: new Set(),
      rawRecords: [
        { recordId: 'R1', valueNature: 'VERIFIED_TRANSACTION_PRICE', rawTextFa: 'واحد ۱۰۰ متري خيابان وليعصر', rawPriceAmount: 150_000_000_000, explicitCurrencyUnit: 'RIAL', rawAreaAmount: 100, explicitAreaUnit: 'SQM' },
        { recordId: 'R2-MISSING-UNIT', valueNature: 'ASKING_LISTING_PRICE', rawTextFa: 'واحد بدون واحد پول', rawPriceAmount: 15_000_000_000, explicitCurrencyUnit: null, rawAreaAmount: 100, explicitAreaUnit: 'SQM' },
      ],
    },
  });
  assert.equal(ingest.sourceReputationTreatedAsProofOfAccuracy, false);
  assert.equal(ingest.acceptedNormalizedRecords.length, 1);
  assert.equal(ingest.acceptedNormalizedRecords[0]?.normalizedPriceToman, 15_000_000_000);
  assert.equal(ingest.quarantinedRecordsForReview.length, 1);
  assert.equal(ingest.quarantinedRecordsForReview[0]?.reason, 'MISSING_EXPLICIT_CURRENCY_OR_AREA_UNIT');

  const entityPrivacy = evaluateEntityResolutionGeoPrivacySnapshotAndQuality({
    entityMatchPair: {
      recordA: { id: 'A', postalOrCadastralId: '111', buildingId: 'BLD-1', unitNumber: '1', areaSqm: 100 },
      recordB: { id: 'B', postalOrCadastralId: '112', buildingId: 'BLD-1', unitNumber: '2', areaSqm: 100 },
      addressSimilarity0To1: 0.99,
      humanReviewerApprovedMerge: false,
    },
    geoAggregationCheck: { boundaryVersion: 'V1', observedPropertiesInCellCount: 2, minRequiredCellCountForPublicDisclosure: 5, hasReliableSourceCoordinates: true },
    listingLifecycleEvent: { listingId: 'L1', disappearedFromPortalFeed: true, hasVerifiedSaleTransactionEvidence: false },
    attributeQualityCheck: { parkingSpacesCount: 0, gardenAreaForHighRiseUnit: 'NOT_APPLICABLE' },
  });
  assert.equal(entityPrivacy.entityResolution.matchClassification, 'DISTINCT_UNITS_IN_SAME_BUILDING');
  assert.equal(entityPrivacy.geoPrivacy.aggregationPrivacyStatus, 'SUPPRESSED_BELOW_K_THRESHOLD');
  assert.equal(entityPrivacy.historicalLifecycleStatus, 'WITHDRAWN_OR_DISAPPEARED_NOT_A_SALE');
  assert.equal(entityPrivacy.qualityDistinction.zeroParkingDistinguishedFromMissingNull, true);

  const ind = evaluateMarketIndicatorsSpreadLiquidityAndOutliers({
    askingSqmPricesToman: [180_000_000, 185_000_000, 190_000_000, 195_000_000, 450_000_000],
    verifiedTransactionSqmPricesToman: [165_000_000, 170_000_000],
    minRequiredSampleSize: 3,
    pairedObservations: [{ propertyId: 'P1', initialAskingToman: 20_000_000_000, verifiedTransactionToman: 18_000_000_000, daysFromListingToSale: 40 }],
    rentalObservation: { depositToman: 1_000_000_000, monthlyRentToman: 30_000_000, explicitConversionRateAnnualPercent: null, explicitMethodologyId: null },
    liquidityInput: { activeInventoryCount: 100, verifiedCompletedSalesInPeriodCount: 15, withdrawnListingsInPeriodCount: 30 },
  });
  assert.equal(ind.askingIndicator.meetsMinimumSampleThreshold, true);
  assert.equal(ind.transactionIndicator.meetsMinimumSampleThreshold, false);
  assert.equal(ind.transactionIndicator.medianSqmToman, null);
  assert.equal(ind.pairedSpreadAnalysis.meanNegotiationDiscountPercent, 10);
  assert.equal(ind.rentalNormalizedMonthlyToman, null);
  assert.equal(ind.liquidityMetrics.monthlyAbsorptionRatePercent, 15);
  assert.deepEqual(ind.outlierDetection.flaggedOutlierPricesToman, [450_000_000]);
  assert.equal(ind.outlierDetection.outliersAutoDeletedFromSource, false);

  const forecast = evaluateMarketCyclesMacroAndForecastingAudits({
    cycleSeries: { nominalPriceIndex: 300, cpiInflationIndex: 200, cpiSourceId: 'CPI-1' },
    neighborhoodComparison: { hoodABoundaryVersion: 'V1', hoodBBoundaryVersion: 'V2', hoodASampleCount: 50, hoodBSampleCount: 50, minComparableSampleSize: 20 },
    forecastingModelAuditInput: {
      historicalPeriodsCount: 36,
      requestedForecastHorizonPeriods: 6,
      usesChronologicalTrainTestSplit: true,
      hasTemporalFutureLeakage: true,
      outOfSampleBacktestPassed: true,
      providesUncertaintyInterval: true,
    },
  });
  assert.equal(forecast.realInflationAdjustedIndex, 150);
  assert.equal(forecast.neighborhoodRankingComparable, false);
  assert.equal(forecast.forecastingValidityClassification, 'UNSUPPORTED');
}

// 11. Bundle 127 Tests (Portfolio Exposure Deduplication, XIRR, NPV Convention Guard, Rental Deposit Exclusion, Partial Disposal & HHI)
{
  const portBasis = evaluatePortfolioExposureOpportunityAndCostBasis({
    portfolioPositions: [
      { positionId: 'POS-1', underlyingPropertyId: 'PROP-1', participationSharePercent: 60, grossPropertyValuationToman: 100_000_000_000 },
      { positionId: 'POS-2', underlyingPropertyId: 'PROP-1', participationSharePercent: 60, grossPropertyValuationToman: 100_000_000_000 },
    ],
    investorCommitments: { committedCapitalToman: 50_000_000_000, paidInContributionsToman: 35_000_000_000, calledAmountToman: 40_000_000_000 },
    opportunityConversionAttempt: { opportunityId: 'OPP-1', stage: 'APPROVED_BY_IC', hasAuthorizedAcquisitionSettlementEvent: false },
    acquisitionCostItems: [
      { costId: 'C1', amountToman: 40_000_000_000, category: 'PURCHASE_CONSIDERATION', isCapitalizableUnderPolicy: true },
      { costId: 'C2', amountToman: 500_000_000, category: 'ROUTINE_OPERATING_MAINTENANCE', isCapitalizableUnderPolicy: false },
    ],
  });
  assert.equal(portBasis.deduplicatedPortfolioExposureToman, 100_000_000_000);
  assert.equal(portBasis.duplicatePropertyOvercountPrevented, true);
  assert.equal(portBasis.investorCapitalSummary.unfundedCommitmentGapToman, 15_000_000_000);
  assert.equal(portBasis.opportunityConvertedToActivePosition, false);
  assert.equal(portBasis.costBasisSummary.capitalizedCostBasisToman, 40_000_000_000);
  assert.equal(portBasis.costBasisSummary.expensedOperatingItemsToman, 500_000_000);

  const xirrNpv = evaluateXirrNpvRentalYieldAndReturnDecomposition({
    datedCashFlows: [
      { dateIso: '2025-01-01T00:00:00Z', amountToman: -10_000_000_000, nature: 'ACTUAL_SETTLED' },
      { dateIso: '2026-01-01T00:00:00Z', amountToman: 12_500_000_000, nature: 'ACTUAL_SETTLED' },
    ],
    npvModelInput: {
      cashFlowConvention: 'NOMINAL',
      discountRateConvention: 'REAL_INFLATION_ADJUSTED',
      annualDiscountRatePercent: 10,
    },
    rentalIncomeInput: {
      collectedGrossRentAnnualToman: 1_200_000_000,
      refundableTenantDepositToman: 500_000_000,
      operatingExpensesAnnualToman: 200_000_000,
      annualDebtServiceToman: 300_000_000,
      propertyValuationBasisToman: 10_000_000_000,
    },
    returnDecompositionInput: {
      initialCapitalizedBasisToman: 10_000_000_000,
      currentEstimatedValuationToman: 14_000_000_000,
      realizedNetDisposalProceedsToman: null,
      realizedCumulativeNetIncomeToman: 1_000_000_000,
    },
  });
  assert.equal(xirrNpv.xirrResult.status, 'CONVERGED_UNIQUE_XIRR');
  assert.equal(xirrNpv.xirrResult.annualizedXirrPercent, 25);
  assert.equal(xirrNpv.npvResult.conventionConsistent, false);
  assert.equal(xirrNpv.npvResult.npvToman, null);
  assert.equal(xirrNpv.rentalYieldMetrics.netOperatingIncomeNoiToman, 1_000_000_000);
  assert.equal(xirrNpv.rentalYieldMetrics.cashFlowAfterFinancingToman, 700_000_000);
  assert.equal(xirrNpv.returnDecomposition.unrealizedValuationGainToman, 4_000_000_000);
  assert.equal(xirrNpv.returnDecomposition.realizedCapitalGainToman, null);

  const levExit = evaluateLeverageBreakEvenDisposalHhiAndAudit({
    leverageInput: {
      outstandingLoanDebtToman: 4_000_000_000,
      investorEquityBasisToman: 6_000_000_000,
      propertyValuationToman: 10_000_000_000,
      annualNoiToman: 1_000_000_000,
      annualDebtServiceToman: 800_000_000,
      minRequiredDscrCovenant: 1.35,
    },
    breakEvenInput: {
      annualOperatingExpensesToman: 200_000_000,
      annualDebtServiceToman: 800_000_000,
      potentialGrossAnnualRentToman: 1_250_000_000,
      totalCapitalizedInvestmentToman: 10_000_000_000,
      cumulativeNetCashRecoveredToDateToman: 3_000_000_000,
    },
    partialDisposalAttempt: {
      totalInitialCostBasisToman: 10_000_000_000,
      preDisposalSharePercent: 100,
      disposedSharePercent: 40,
      netDisposalProceedsToman: 5_500_000_000,
      settlementCompletedAndVerified: true,
    },
    portfolioAllocationsToman: [50_000_000_000, 50_000_000_000],
    investorReportAccessCheck: { requestingInvestorId: 'INV-1', reportOwnerInvestorId: 'INV-2' },
  });
  assert.equal(levExit.leverageMetrics.ltvPercent, 40);
  assert.equal(levExit.leverageMetrics.dscr, 1.25);
  assert.equal(levExit.leverageMetrics.covenantWarningTriggered, true);
  assert.equal(levExit.breakEvenAnalysis.operatingBreakEvenOccupancyPercent, 80);
  assert.equal(levExit.breakEvenAnalysis.remainingUnrecoveredCapitalToman, 7_000_000_000);
  assert.equal(levExit.partialDisposalOutcome.allocatedDisposedCostBasisToman, 4_000_000_000);
  assert.equal(levExit.partialDisposalOutcome.realizedDisposalGainToman, 1_500_000_000);
  assert.equal(levExit.partialDisposalOutcome.remainingCostBasisToman, 6_000_000_000);
  assert.equal(levExit.partialDisposalOutcome.markedFullyExited, false);
  assert.equal(levExit.diversificationMetrics.economicExposureHhi0To10000, 5000);
  assert.equal(levExit.investorReportAccessAllowed, false);
}

// 12. Bundle 128 Tests (Physical Asset Lifecycle, Symptom != Diagnosis, Work Order Verification Gate, Temporary Mitigation != Permanent Repair, Contractor Visit Access & 7 Audits)
{
  const regWo = evaluatePhysicalAssetRegistrySymptomAndWorkOrderGate({
    technicalSpecification: {
      declaredAreaSqm: 150,
      inspectorMeasuredAreaSqm: null,
      hasVerifiedEngineeringInspectionReport: false,
    },
    equipmentLifecycle: {
      equipmentId: 'EQ-1',
      serialNumber: 'SN-DUP-99',
      existingActiveSerialNumbers: new Set(['SN-DUP-99']),
      commissionedYear: 1400,
      expectedServiceLifeYears: 12,
      currentYear: 1405,
      physicalConditionScore0To100: 65,
      explicitAccountingPolicyLinksConditionToDepreciation: false,
    },
    serviceRequest: {
      requestId: 'SR-1',
      residentReportedSymptomFa: 'بوی سوختگی از تابلو برق',
      engineerVerifiedDiagnosisFa: null,
    },
    workOrderAttempt: {
      workOrderId: 'WO-1',
      contractorSubmittedCompletedStatus: true,
      technicalInspectorVerified: false,
      requesterAcceptedOrSignedOff: false,
    },
  });
  assert.equal(regWo.specVerificationStatus, 'DECLARED_UNVERIFIED_CLAIM');
  assert.equal(regWo.equipmentRegistration.serialNumberConflictDetected, true);
  assert.equal(regWo.equipmentRegistration.estimatedRemainingPhysicalLifeYears, 7);
  assert.equal(regWo.equipmentRegistration.physicalConditionUsedForAccountingDepreciation, false);
  assert.equal(regWo.serviceRequestClassification.hasConfirmedEngineeringDiagnosis, false);
  assert.equal(regWo.workOrderLifecycleState, 'PENDING_TECHNICAL_VERIFICATION_AND_ACCEPTANCE');

  const pmEmg = evaluatePmScheduleEmergencyRepairReliabilityAndContractor({
    pmScheduleOccurrence: {
      planId: 'PM-1',
      scheduledOccurrenceKey: 'OCC-1405-08',
      alreadyGeneratedOccurrenceKeys: new Set(['OCC-1405-08']),
    },
    emergencyIncidentRepair: {
      incidentId: 'EMG-1',
      hasTemporaryMitigationApplied: true,
      hasPermanentRepairCompleted: false,
      hasPostRepairVerificationTest: false,
    },
    inspectionRecord: {
      inspectionId: 'INSP-1',
      hasVerifiedLegalAuthorityCertificate: false,
      isSavedFieldDraftOnly: true,
      backendConfirmedSync: false,
    },
    reliabilityAnalysis: {
      verifiedOperatingHours: 3000,
      totalRepairDowntimeHours: 15,
      failureEventsCount: 3,
      rootCauseStatus: 'CORRELATION_HYPOTHESIS_ONLY',
    },
    contractorQualification: {
      contractorId: 'CTR-1',
      hasUploadedLicenseFile: true,
      independentlyVerifiedByComplianceTeam: false,
    },
  });
  assert.equal(pmEmg.pmWorkOrderGenerated, false);
  assert.equal(pmEmg.duplicatePmOccurrenceBlocked, true);
  assert.equal(pmEmg.emergencyIncidentStatus, 'MITIGATED_TEMPORARILY_AWAITING_PERMANENT_REPAIR');
  assert.equal(pmEmg.temporaryMitigationTreatedAsPermanentRepair, false);
  assert.equal(pmEmg.inspectionStatus.legallyCertifiedBadgeAllowed, false);
  assert.equal(pmEmg.inspectionStatus.submissionState, 'LOCAL_DRAFT_NOT_SYNCHRONIZED');
  assert.equal(pmEmg.reliabilityMetrics.mtbfHours, 1000);
  assert.equal(pmEmg.reliabilityMetrics.mttrHours, 5);
  assert.equal(pmEmg.reliabilityMetrics.rootCauseConfirmed, false);
  assert.equal(pmEmg.contractorLicenseVerifiedStatus, 'UPLOADED_UNVERIFIED_DOCUMENT');

  const budgetAccess = evaluateMaintenanceBudgetContractorAccessAndSevenAudits({
    maintenanceBudgetLedger: {
      allocatedAnnualBudgetToman: 5_000_000_000,
      workOrderEstimatesTotalToman: 4_800_000_000,
      committedPurchaseOrdersToman: 2_000_000_000,
      verifiedInvoicedActualExpenseToman: 1_500_000_000,
      settledPaidCashToman: 1_200_000_000,
    },
    utilityMonitoring: {
      hasActiveOperationalIotMeterFeed: false,
    },
    contractorVisitRequest: {
      visitId: 'VST-1',
      linkedApprovedWorkOrderId: 'WO-1',
      hostApproved: true,
      emergencyRevoked: true,
      scheduledStartMs: 1000,
      scheduledEndMs: 5000,
      nowMs: 2500,
      hasVerifiedPhysicalAccessHardwareIntegration: false,
    },
  });
  assert.equal(budgetAccess.budgetSummary.workOrderEstimateTreatedAsActualExpense, false);
  assert.equal(budgetAccess.budgetSummary.remainingUncommittedBudgetToman, 3_000_000_000);
  assert.equal(budgetAccess.budgetSummary.unpaidInvoicedPayableToman, 300_000_000);
  assert.equal(budgetAccess.realTimeUtilityMonitoringClaimAllowed, false);
  assert.equal(budgetAccess.contractorVisitAuthorization.entryPermittedNow, false);
  assert.equal(budgetAccess.contractorVisitAuthorization.reason, 'BLOCKED_EMERGENCY_REVOKED_ACCESS');
  assert.equal(budgetAccess.contractorVisitAuthorization.claimsDirectSmartLockHardwareControlWithoutIntegration, false);
  assert.equal(budgetAccess.operationalStatusChangeSilentlyCreatesAccountingEntry, false);
  assert.equal(budgetAccess.sevenFacilityAuditsVerdict, 'ALL_7_AUDITS_VERIFIED_1819_TO_1825');
}

// 13. Bundle 129 Tests (Leasing & Tenant Lifecycle, Uploaded Doc != Verified Identity, Approved App -> Draft Only, Cheques != Cash Until Cleared, Visual Diff != Auto Deduction & 6 Audits)
{
  const appEsc = evaluateTenantApplicationAmendmentAndRentEscalation({
    tenantProfile: {
      tenantId: 'TNT-1',
      hasUploadedIdentityDocument: true,
      reviewerVerifiedIdentity: false,
    },
    rentalApplication: {
      applicationId: 'APP-1',
      targetUnitId: 'U-101',
      applicationDecision: 'APPROVED',
      otherActiveApprovedApplicationIdsForUnit: [],
    },
    rentEscalationInput: {
      preservedOriginalMonthlyRentToman: 40_000_000,
      adjustmentMechanism: 'PERCENTAGE_ESCALATION',
      escalationPercent: 25,
      isAmendmentApprovedAndEffective: false,
    },
  });
  assert.equal(appEsc.tenantIdentityVerified, false);
  assert.equal(appEsc.uploadedDocAloneTreatedAsVerifiedIdentity, false);
  assert.equal(appEsc.applicationConversion.resultingLeaseStage, 'DRAFT_LEASE_WORKFLOW');
  assert.equal(appEsc.applicationConversion.autoExecutedAgreementFromApplication, false);
  assert.equal(appEsc.rentEscalationOutcome.preservedHistoricalRentToman, 40_000_000);
  assert.equal(appEsc.rentEscalationOutcome.effectiveCurrentRentToman, 40_000_000);
  assert.equal(appEsc.rentEscalationOutcome.unapprovedEscalationAppliedToObligations, false);

  const depChq = evaluateDepositDeductionArrearsChequesAndAlerts({
    depositLedger: {
      receivedDepositCashToman: 1_500_000_000,
      proposedUnapprovedDeductionToman: 200_000_000,
      approvedVerifiedDeductionToman: 50_000_000,
      refundedCashToman: 0,
    },
    receivablesLedger: [
      { obligationId: 'OB-1', amountToman: 40_000_000, daysOverdue: 20, isDisputedByTenant: false },
      { obligationId: 'OB-2', amountToman: 15_000_000, daysOverdue: 10, isDisputedByTenant: true },
    ],
    rentalChequeInstruments: [
      { chequeSayadId: 'CHQ-1', amountToman: 40_000_000, status: 'CLEARED_SETTLED' },
      { chequeSayadId: 'CHQ-2', amountToman: 40_000_000, status: 'RECEIVED_IN_CUSTODY' },
      { chequeSayadId: 'CHQ-3', amountToman: 40_000_000, status: 'RETURNED_BOUNCED' },
    ],
    alertEvent: {
      alertId: 'ALT-1',
      scheduledInQueue: true,
      providerConfirmedDeliveryReceipt: false,
    },
  });
  assert.equal(depChq.depositCustody.refundableDepositRecognizedAsOrdinaryIncome, false);
  assert.equal(depChq.depositCustody.proposedDeductionTreatedAsExecutedMovement, false);
  assert.equal(depChq.depositCustody.netRefundableDepositLiabilityToman, 1_450_000_000);
  assert.equal(depChq.arrearsSummary.undisputedOverdueArrearsToman, 40_000_000);
  assert.equal(depChq.arrearsSummary.disputedQuarantinedBalanceToman, 15_000_000);
  assert.equal(depChq.chequeReconciliation.clearedSettledCashFromChequesToman, 40_000_000);
  assert.equal(depChq.chequeReconciliation.unclearedPendingChequesToman, 40_000_000);
  assert.equal(depChq.chequeReconciliation.bouncedReturnedChequesCount, 1);
  assert.equal(depChq.chequeReconciliation.unclearedChequeCountedAsCash, false);
  assert.equal(depChq.notificationMarkedDelivered, false);

  const handoverComm = evaluateHandoverMultiUnitCommercialAndSixLeasingAudits({
    handoverInspection: {
      visualConditionDifferenceDetected: true,
      classifiedAsOrdinaryWearAndTear: true,
      bothPartiesOrReviewerAuthorizedDeduction: true,
    },
    terminationCheck: {
      contractEndDatePassed: true,
      explicitAutoTerminationRuleConfigured: false,
      authorizedTerminationSignOff: false,
    },
    multiUnitCommercialLease: {
      leaseId: 'COM-1',
      totalContractMonths: 12,
      rentFreeFitOutMonths: 2,
      unitMonthlyBaseRentsToman: [
        { unitId: 'U-1', monthlyRentToman: 100_000_000 },
        { unitId: 'U-2', monthlyRentToman: 50_000_000 },
        { unitId: 'U-1', monthlyRentToman: 100_000_000 },
      ],
    },
  });
  assert.equal(handoverComm.handoverOutcome.visualDiffAloneAuthorizedDepositDeduction, false);
  assert.equal(handoverComm.handoverOutcome.depositDeductionPermitted, false);
  assert.equal(handoverComm.leaseTerminated, false);
  assert.equal(handoverComm.commercialMultiUnitSummary.deduplicatedMonthlyBaseRentToman, 150_000_000);
  assert.equal(handoverComm.commercialMultiUnitSummary.billableMonthsCount, 10);
  assert.equal(handoverComm.commercialMultiUnitSummary.totalContractBillableBaseRentToman, 1_500_000_000);
  assert.equal(handoverComm.sixLeasingAuditsVerdict, 'ALL_6_LEASING_AUDITS_VERIFIED_1847_TO_1852');
}

// 14. Bundle 130 Tests (Property Legal, Title vs Possession Separation, Registry District/Section Context, Preliminary Sale != Formal Transfer, Notary vs Possession State Machines & 9 Audits)
{
  const titleReg = evaluateOwnershipSeparationRegistryAndTitleConflicts({
    interestHolders: [
      { holderId: 'OWN-1', relationshipKind: 'REGISTERED_LEGAL_TITLE', documentedSharePercent: 60, hasVerifiedOfficialTitleDeed: true },
      { holderId: 'TNT-1', relationshipKind: 'PHYSICAL_POSSESSION_OCCUPANCY', documentedSharePercent: 0, hasVerifiedOfficialTitleDeed: false },
      { holderId: 'BUYER-PRELIM', relationshipKind: 'PRELIMINARY_CONTRACTUAL_CLAIM', documentedSharePercent: 40, hasVerifiedOfficialTitleDeed: false },
    ],
    registryIdentifierCheck: {
      mainParcelNumber: '124',
      subParcelNumber: '48',
      registrySection: null,
      registryDistrict: 'شمیران',
    },
    recordedActiveEncumbrancesCount: 0,
    competingTitleClaims: [
      { claimId: 'C1', claimantId: 'P1', claimedSharePercent: 60, documentRef: 'D1' },
      { claimId: 'C2', claimantId: 'P2', claimedSharePercent: 60, documentRef: 'D2' },
    ],
  });
  assert.equal(titleReg.ownershipSeparation.verifiedLegalTitleOwnersCount, 1);
  assert.equal(titleReg.ownershipSeparation.nonTitlePossessionOrBeneficialCount, 2);
  assert.equal(titleReg.ownershipSeparation.documentedLegalShareSumPercent, 60);
  assert.equal(titleReg.ownershipSeparation.unresolvedOwnershipShareGapPercent, 40);
  assert.equal(titleReg.ownershipSeparation.autoNormalizedInvalidShares, false);
  assert.equal(titleReg.ownershipSeparation.legalOwnershipInferredFromPossessionOrPayment, false);
  assert.equal(titleReg.registryIdentifierStatus.hasSufficientRegistryGeographicContext, false);
  assert.equal(titleReg.registryIdentifierStatus.assumedGloballyUniqueWithoutDistrictAndSection, false);
  assert.equal(titleReg.registryIdentifierStatus.canonicalCompositeKey, null);
  assert.equal(titleReg.encumbranceClearanceStatus.zeroRecordedRestrictionsImpliesClearTitle, false);
  assert.equal(titleReg.conflictResolution.hasCompetingTitleConflict, true);
  assert.equal(titleReg.conflictResolution.systemSilentlyAdjudicatedWinner, false);

  const sigSale = evaluateSignatoryAuthorityPreliminarySaleAndConditions({
    signatoryAttempt: {
      actorUserId: 'admin-1',
      actorHasWorkspaceAdminRole: true,
      actorIsVerifiedLegalOwner: false,
      poaEvidence: null,
    },
    saleTransaction: {
      transactionId: 'TX-1',
      hasAcceptedOffer: true,
      hasSignedPreliminaryAgreementMabayenameh: true,
      hasOfficialNotaryTransferInstrumentRef: false,
    },
    contractualConditions: [
      { conditionId: 'CND-1', userCheckedCompleteBox: true, hasVerifiedSupportingEvidenceDoc: false },
      { conditionId: 'CND-2', userCheckedCompleteBox: true, hasVerifiedSupportingEvidenceDoc: true },
    ],
  });
  assert.equal(sigSale.signatoryAuthorization.legallyAuthorizedToSignTransfer, false);
  assert.equal(sigSale.signatoryAuthorization.applicationRoleInterpretedAsLegalSignatoryAuthority, false);
  assert.equal(sigSale.signatoryAuthorization.reason, 'BLOCKED_APP_ADMIN_ROLE_IS_NOT_LEGAL_SIGNATORY_AUTHORITY');
  assert.equal(sigSale.transactionLifecycle.stage, 'PRELIMINARY_CONTRACT_SIGNED_AWAITING_FORMAL_TRANSFER');
  assert.equal(sigSale.transactionLifecycle.preliminaryAgreementEquatedWithFormalTitleRegistration, false);
  assert.equal(sigSale.conditionsEvaluation.verifiedFulfilledConditionsCount, 1);
  assert.equal(sigSale.conditionsEvaluation.unverifiedCheckboxOnlyBlockedCount, 1);

  const settleAudits = evaluateSettlementNotaryVsPossessionAndNineLegalAudits({
    settlementLedger: {
      contractualGrossPriceToman: 20_000_000_000,
      bankVerifiedSettledPaymentsToman: 15_000_000_000,
      unverifiedInternalRecordedPaymentsToman: 5_000_000_000,
      approvedAdjustmentsDiscountToman: 0,
      ancillaryRegistrationAndTaxCostsToman: 300_000_000,
      totalApprovedBrokerageCommissionToman: 200_000_000,
    },
    notaryTransferState: {
      notaryAppointmentScheduled: true,
      officialNotaryDeedRegisteredAndSighted: false,
    },
    possessionHandoverState: {
      keysAndMetersHandedOver: true,
      signedHandoverProtocolPresent: true,
    },
    legalDueDiligenceChecklist: {
      mandatoryItemsTotal: 4,
      acceptedWithLinkedEvidenceCount: 4,
    },
  });
  assert.equal(settleAudits.settlementStatement.remainingPrincipalPayableByBuyerToman, 5_000_000_000);
  assert.equal(settleAudits.settlementStatement.unverifiedInternalPaymentsCountedAsSettled, false);
  assert.equal(settleAudits.settlementStatement.netSellerProceedsAfterCommissionAndCostsToman, 14_500_000_000);
  assert.equal(settleAudits.independentStateMachines.formalOwnershipTransferState, 'NOTARY_SCHEDULED_NOT_TRANSFERRED');
  assert.equal(settleAudits.independentStateMachines.physicalPossessionHandoverState, 'POSSESSION_HANDED_OVER');
  assert.equal(settleAudits.independentStateMachines.ownershipInferredFromPossessionOrViceVersa, false);
  assert.equal(settleAudits.dueDiligenceReadiness.internalProcessChecklistComplete, true);
  assert.equal(settleAudits.dueDiligenceReadiness.checklistCompletionGuaranteesLegalClearance, false);
  assert.equal(settleAudits.nineBundle130AuditsVerdict, 'ALL_9_AUDITS_AND_E2E_VERIFIED_1881_TO_1889');
}

// 15. Bundle 131 Tests (Construction Delivery, Weighted Progress vs Naive Average, S-Curve No Fake Interpolation, Multi-Criteria Tendering, PO != Delivery, Gross vs Net Cost/Sqm, Handover != Legal Title & 4 Audits)
{
  const phaseProg = evaluateProjectPhaseWeightedProgressAndSiteProvenance({
    phaseTransitionAttempt: {
      phaseId: 'PH-1',
      unresolvedMandatoryPrerequisitesCount: 1,
      internallyMarkedCompleted: true,
      hasOfficialRegulatoryPermitApproval: false,
    },
    siteGeospatialRecord: {
      siteId: 'SITE-1',
      coordinateSource: 'MANUAL_MAP_PIN',
    },
    workPackagesProgress: [
      { workPackageId: 'WP-HEAVY', budgetWeight0To100: 80, plannedProgressPercent: 90, contractorReportedProgressPercent: 95, engineerApprovedProgressPercent: 50, hasSupportingMeasurementEvidence: true },
      { workPackageId: 'WP-LIGHT', budgetWeight0To100: 20, plannedProgressPercent: 100, contractorReportedProgressPercent: 100, engineerApprovedProgressPercent: 100, hasSupportingMeasurementEvidence: true },
    ],
  });
  assert.equal(phaseProg.phaseGate.canCompletePhaseInternally, false);
  assert.equal(phaseProg.phaseGate.internallyCompletedPhaseEqualsOfficialApproval, false);
  assert.equal(phaseProg.siteProvenance.manualMapCoordinateImpliesOfficialCadastralSurvey, false);
  assert.equal(phaseProg.siteProvenance.surveyAccuracyClassification, 'APPROXIMATE_MANUAL_PIN_ONLY');
  assert.equal(phaseProg.plannedComponentTreatedAsLegallyRegisteredProperty, false);
  assert.equal(phaseProg.physicalProgressSummary.weightedApprovedProjectProgressPercent, 60);
  assert.equal(phaseProg.physicalProgressSummary.naiveUnweightedAveragePercent, 75);
  assert.equal(phaseProg.physicalProgressSummary.projectCompletionCalculatedByBlindlyAveragingTaskPercents, false);

  const sCurveMat = evaluateSCurveEvmTenderingAndMaterialLifecycle({
    sCurveSeries: [
      { periodLabel: '1405-06', plannedPercent: 40, measuredApprovedPercent: 35 },
      { periodLabel: '1405-07', plannedPercent: 60, measuredApprovedPercent: null },
    ],
    evmInput: {
      plannedValuePvToman: 0,
      earnedValueEvToman: 50_000_000_000,
      actualCostAcToman: 45_000_000_000,
    },
    changeRequest: {
      changeId: 'CHG-1',
      approvedByAuthorizedBoard: false,
      activeBaselineBudgetToman: 100_000_000_000,
      proposedDeltaToman: 15_000_000_000,
    },
    tenderEvaluation: {
      awardPolicy: 'WEIGHTED_TECHNICAL_COMMERCIAL',
      bids: [
        { bidderId: 'CTR-QUALITY', technicalScore0To100: 95, commercialScore0To100: 75, priceToman: 52_000_000_000 },
        { bidderId: 'CTR-LOWBALL', technicalScore0To100: 50, commercialScore0To100: 95, priceToman: 40_000_000_000 },
      ],
    },
    materialRecord: {
      materialCode: 'CEMENT',
      orderedOnPurchaseOrderQty: 500,
      physicallyDeliveredAndAcceptedQty: 300,
      consumedInVerifiedWorkQty: 220,
    },
  });
  assert.equal(sCurveMat.sCurveIntegrity.missingPeriodsCount, 1);
  assert.equal(sCurveMat.sCurveIntegrity.missingPeriodValuesInterpolatedAsMeasuredFacts, false);
  assert.equal(sCurveMat.evmAnalytics.metricsAvailable, false);
  assert.equal(sCurveMat.evmAnalytics.spi, null);
  assert.equal(sCurveMat.changeControl.effectiveBaselineBudgetToman, 100_000_000_000);
  assert.equal(sCurveMat.changeControl.unapprovedChangeMutatedActiveBaseline, false);
  assert.equal(sCurveMat.tenderOutcome.recommendedBidderId, 'CTR-QUALITY');
  assert.equal(sCurveMat.tenderOutcome.autoDeclaredWinnerByPriceAloneWithoutPolicy, false);
  assert.equal(sCurveMat.materialControl.purchaseOrderTreatedAsProofOfDeliveryOrConsumption, false);
  assert.equal(sCurveMat.materialControl.unconsumedSiteStockQty, 80);
  assert.equal(sCurveMat.materialControl.undeliveredPurchaseOrderBacklogQty, 200);

  const costAudits = evaluateCostPerSqmEacHandoverAndFourConstructionAudits({
    unitCostAllocationInput: {
      verifiedActualConstructionCostToman: 90_000_000_000,
      grossBuiltAreaSqm: 4500,
      netSaleableAreaSqm: 3000,
      selectedBasis: 'NET_SALEABLE_AREA',
    },
    eacForecastInput: {
      actualCostIncurredToman: 60_000_000_000,
      estimatedCostToCompleteEtcToman: 35_000_000_000,
      approvedBaselineBudgetToman: 90_000_000_000,
    },
    punchListAndHandover: {
      contractorReportedDefectFixed: true,
      inspectorVerifiedDefectClosedWithEvidence: false,
      physicalUnitHandedOverToBuyer: true,
      officialNotaryTitleDeedTransferred: false,
    },
    financialVsPhysicalAuditInput: {
      approvedPhysicalProgressPercent: 60,
      contractorClaimedBillingPercent: 75,
    },
    contractorAccessCheck: {
      contractorProjectId: 'PRJ-1',
      targetResourceProjectId: 'PRJ-1',
      contractExpiredOrTerminated: true,
    },
  });
  assert.equal(costAudits.unitCostMetrics.costPerSqmToman, 30_000_000);
  assert.equal(costAudits.unitCostMetrics.mixedGrossAndNetAreaSilently, false);
  assert.equal(costAudits.eacForecast.estimateAtCompletionEacToman, 95_000_000_000);
  assert.equal(costAudits.eacForecast.forecastedVarianceAtCompletionVacToman, -5_000_000_000);
  assert.equal(costAudits.eacForecast.estimatedFinalCostPresentedAsAuditedActual, false);
  assert.equal(costAudits.handoverAndDefects.defectClosed, false);
  assert.equal(costAudits.handoverAndDefects.defectMarkedResolvedByContractorReportAlone, false);
  assert.equal(costAudits.handoverAndDefects.constructionHandoverEquatedWithLegalOwnershipTransfer, false);
  assert.equal(costAudits.handoverAndDefects.legalOwnershipTransferred, false);
  assert.equal(costAudits.audit1921PhysicalFinancialDiscrepancy.overbillingDiscrepancyDetected, true);
  assert.equal(costAudits.audit1921PhysicalFinancialDiscrepancy.classification, 'DISCREPANCY_REQUIRING_REVIEW');
  assert.equal(costAudits.audit1921PhysicalFinancialDiscrepancy.autoAccusedFraudWithoutReview, false);
  assert.equal(costAudits.audit1922ContractorAccessPermitted, false);
  assert.equal(costAudits.bundle131ReleaseReadinessVerdict, 'ALL_4_CONSTRUCTION_AUDITS_VERIFIED_1921_TO_1924');
}

console.log('✅ All Lazy GeoJSON and Bundles 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, and 131 tests passed!');

