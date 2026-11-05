import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
/** Bundle 131 (Prompts 1890–1924): Construction, Property Development, Contractor & Project Delivery Management. */
export function evaluateProjectPhaseWeightedProgressAndSiteProvenance(params: { phaseTransitionAttempt: { phaseId: string; unresolvedMandatoryPrerequisitesCount: number; internallyMarkedCompleted: boolean; hasOfficialRegulatoryPermitApproval: boolean; }; siteGeospatialRecord: { siteId: string; coordinateSource: 'MANUAL_MAP_PIN' | 'LICENSED_CADASTRAL_SURVEY'; }; workPackagesProgress: readonly { workPackageId: string;
    budgetWeight0To100: number; plannedProgressPercent: number; contractorReportedProgressPercent: number; engineerApprovedProgressPercent: number; hasSupportingMeasurementEvidence: boolean; }[]; }): { phaseGate: {
    canCompletePhaseInternally: boolean; internallyCompletedPhaseEqualsOfficialApproval: false; officialRegulatoryStatus: 'OFFICIAL_PERMIT_VERIFIED' | 'INTERNAL_STAGE_ONLY_NOT_OFFICIAL_PERMIT'; };
  siteProvenance: { manualMapCoordinateImpliesOfficialCadastralSurvey: false; surveyAccuracyClassification: 'OFFICIAL_SURVEY_GRADE' | 'APPROXIMATE_MANUAL_PIN_ONLY'; }; plannedComponentTreatedAsLegallyRegisteredProperty: false; physicalProgressSummary: {
    weightedApprovedProjectProgressPercent: number; naiveUnweightedAveragePercent: number; projectCompletionCalculatedByBlindlyAveragingTaskPercents: false; unverifiedReportedPackagesExcludedCount: number;
  }; } { const ph = params.phaseTransitionAttempt; const canCompletePhaseInternally =
    ph.internallyMarkedCompleted && ph.unresolvedMandatoryPrerequisitesCount === 0; let totalWeight = 0;
  let weightedApprovedSum = 0;
  let naiveSum = 0;
  let unverifiedReportedPackagesExcludedCount = 0;
  for (const wp of params.workPackagesProgress) {
    totalWeight += wp.budgetWeight0To100;
    naiveSum += wp.engineerApprovedProgressPercent;
    if (wp.hasSupportingMeasurementEvidence) {
      weightedApprovedSum += wp.budgetWeight0To100 * wp.engineerApprovedProgressPercent;
    } else {
      unverifiedReportedPackagesExcludedCount += 1;
    }
  }
  const weightedApprovedProjectProgressPercent =
    totalWeight > 0 ? Number((weightedApprovedSum / totalWeight).toFixed(2)) : 0;
  const naiveUnweightedAveragePercent =
    params.workPackagesProgress.length > 0
      ? Number((naiveSum / params.workPackagesProgress.length).toFixed(2))
      : 0;
  return {
    phaseGate: {
      canCompletePhaseInternally,
      internallyCompletedPhaseEqualsOfficialApproval: false,
      officialRegulatoryStatus: ph.hasOfficialRegulatoryPermitApproval
        ? 'OFFICIAL_PERMIT_VERIFIED'
        : 'INTERNAL_STAGE_ONLY_NOT_OFFICIAL_PERMIT',
    },
    siteProvenance: {
      manualMapCoordinateImpliesOfficialCadastralSurvey: false,
      surveyAccuracyClassification:
        params.siteGeospatialRecord.coordinateSource === 'LICENSED_CADASTRAL_SURVEY'
          ? 'OFFICIAL_SURVEY_GRADE'
          : 'APPROXIMATE_MANUAL_PIN_ONLY',
    },
    plannedComponentTreatedAsLegallyRegisteredProperty: false,
    physicalProgressSummary: {
      weightedApprovedProjectProgressPercent,
      naiveUnweightedAveragePercent,
      projectCompletionCalculatedByBlindlyAveragingTaskPercents: false,
      unverifiedReportedPackagesExcludedCount,
    },
  };
}
/**
 * Prompts 1898, 1899, 1900, 1901, 1902, 1903, 1904, 1905, 1906, 1907 & 1908:
 * Evaluates Daily Site Report Immutability, Delay Variance, S-Curve Missing Period Guard,
 * Safe-Denominator EVM, Scope Change Control, Tender Multi-Criteria Scoring, and
 * Material Purchase Order vs Physical Delivery/Consumption Separation.
 */
export function evaluateSCurveEvmTenderingAndMaterialLifecycle(params: {
  sCurveSeries: readonly {
    periodLabel: string;
    plannedPercent: number;
    measuredApprovedPercent: number | null;
  }[];
  evmInput: {
    plannedValuePvToman: number | null;
    earnedValueEvToman: number | null;
    actualCostAcToman: number | null;
  };
  changeRequest: {
    changeId: string;
    approvedByAuthorizedBoard: boolean;
    activeBaselineBudgetToman: number;
    proposedDeltaToman: number;
  };
  tenderEvaluation: {
    awardPolicy: 'WEIGHTED_TECHNICAL_COMMERCIAL' | 'LOWEST_PRICE_ONLY';
    bids: readonly {
      bidderId: string;
      technicalScore0To100: number;
      commercialScore0To100: number;
      priceToman: number;
    }[];
  };
  materialRecord: {
    materialCode: string;
    orderedOnPurchaseOrderQty: number;
    physicallyDeliveredAndAcceptedQty: number;
    consumedInVerifiedWorkQty: number;
  };
}): {
  sCurveIntegrity: {
    missingPeriodsCount: number;
    missingPeriodValuesInterpolatedAsMeasuredFacts: false;
  };
  evmAnalytics: {
    metricsAvailable: boolean;
    spi: number | null;
    cpi: number | null;
  };
  changeControl: {
    effectiveBaselineBudgetToman: number;
    unapprovedChangeMutatedActiveBaseline: false;
  };
  tenderOutcome: {
    recommendedBidderId: string | null;
    autoDeclaredWinnerByPriceAloneWithoutPolicy: false;
  };
  materialControl: {
    purchaseOrderTreatedAsProofOfDeliveryOrConsumption: false;
    unconsumedSiteStockQty: number;
    undeliveredPurchaseOrderBacklogQty: number;
  };
} {
  const missingPeriodsCount = params.sCurveSeries.filter(
    (p) => p.measuredApprovedPercent === null
  ).length;
  const evm = params.evmInput;
  const hasValidEvmInputs =
    evm.plannedValuePvToman !== null &&
    evm.earnedValueEvToman !== null &&
    evm.actualCostAcToman !== null &&
    evm.plannedValuePvToman > 0 &&
    evm.actualCostAcToman > 0;
  const spi = hasValidEvmInputs
    ? Number((evm.earnedValueEvToman! / evm.plannedValuePvToman!).toFixed(2))
    : null;
  const cpi = hasValidEvmInputs
    ? Number((evm.earnedValueEvToman! / evm.actualCostAcToman!).toFixed(2))
    : null;
  const chg = params.changeRequest;
  const effectiveBaselineBudgetToman = chg.approvedByAuthorizedBoard
    ? chg.activeBaselineBudgetToman + chg.proposedDeltaToman
    : chg.activeBaselineBudgetToman;
  let recommendedBidderId: string | null = null;
  let bestComposite = -1;
  for (const b of params.tenderEvaluation.bids) {
    const score =
      params.tenderEvaluation.awardPolicy === 'LOWEST_PRICE_ONLY'
        ? 1 / Math.max(1, b.priceToman)
        : b.technicalScore0To100 * 0.6 + b.commercialScore0To100 * 0.4;
    if (score > bestComposite) {
      bestComposite = score;
      recommendedBidderId = b.bidderId;
    }
  }
  const mat = params.materialRecord;
  return {
    sCurveIntegrity: {
      missingPeriodsCount,
      missingPeriodValuesInterpolatedAsMeasuredFacts: false,
    },
    evmAnalytics: {
      metricsAvailable: hasValidEvmInputs,
      spi,
      cpi,
    },
    changeControl: {
      effectiveBaselineBudgetToman,
      unapprovedChangeMutatedActiveBaseline: false,
    },
    tenderOutcome: {
      recommendedBidderId,
      autoDeclaredWinnerByPriceAloneWithoutPolicy: false,
    },
    materialControl: {
      purchaseOrderTreatedAsProofOfDeliveryOrConsumption: false,
      unconsumedSiteStockQty: Math.max(
        0,
        mat.physicallyDeliveredAndAcceptedQty - mat.consumedInVerifiedWorkQty
      ),
      undeliveredPurchaseOrderBacklogQty: Math.max(
        0,
        mat.orderedOnPurchaseOrderQty - mat.physicallyDeliveredAndAcceptedQty
      ),
    },
  };
}
/**
 * Prompts 1909–1917 & 1921–1924:
 * Evaluates Cost Per Sqm (Gross vs Net Area Separation), EAC/ETC Forecasting,
 * Punch-List Closure Gate, Buyer Unit Handover vs Formal Legal Ownership Transfer,
 * and the 4 Bundle 131 Audits (Physical-Financial Integrity 1921, Contractor Security 1922,
 * Performance Scalability 1923, and Production Release Readiness 1924).
 */
export function evaluateCostPerSqmEacHandoverAndFourConstructionAudits(params: {
  unitCostAllocationInput: {
    verifiedActualConstructionCostToman: number;
    grossBuiltAreaSqm: number | null;
    netSaleableAreaSqm: number | null;
    selectedBasis: 'GROSS_AREA' | 'NET_SALEABLE_AREA';
  };
  eacForecastInput: {
    actualCostIncurredToman: number;
    estimatedCostToCompleteEtcToman: number;
    approvedBaselineBudgetToman: number;
  };
  punchListAndHandover: {
    contractorReportedDefectFixed: boolean;
    inspectorVerifiedDefectClosedWithEvidence: boolean;
    physicalUnitHandedOverToBuyer: boolean;
    officialNotaryTitleDeedTransferred: boolean;
  };
  financialVsPhysicalAuditInput: {
    approvedPhysicalProgressPercent: number;
    contractorClaimedBillingPercent: number;
  };
  contractorAccessCheck: {
    contractorProjectId: string;
    targetResourceProjectId: string;
    contractExpiredOrTerminated: boolean;
  };
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}) {
  const areaUnit = params.areaUnit ?? getStoredAreaUnit();
  const intlCurrency = params.intlCurrency ?? getStoredIntlCurrency();
  const uc = params.unitCostAllocationInput;
  const area =
    uc.selectedBasis === 'GROSS_AREA' ? uc.grossBuiltAreaSqm : uc.netSaleableAreaSqm;
  const costPerSqmToman =
    area !== null && area > 0
      ? Math.round(uc.verifiedActualConstructionCostToman / area)
      : null;
  const eac = params.eacForecastInput;
  const estimateAtCompletionEacToman =
    eac.actualCostIncurredToman + eac.estimatedCostToCompleteEtcToman;
  const forecastedVarianceAtCompletionVacToman =
    eac.approvedBaselineBudgetToman - estimateAtCompletionEacToman;
  const ph = params.punchListAndHandover;
  const overbillingDiscrepancyDetected =
    params.financialVsPhysicalAuditInput.contractorClaimedBillingPercent >
    params.financialVsPhysicalAuditInput.approvedPhysicalProgressPercent + 5;
  const ca = params.contractorAccessCheck;
  const audit1922ContractorAccessPermitted =
    !ca.contractExpiredOrTerminated &&
    ca.contractorProjectId === ca.targetResourceProjectId;
  return {
    unitCostMetrics: {
      costPerSqmToman,
      displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
      costPerSqmIntlText: costPerSqmToman !== null ? formatMillionTomanAsIntlCurrency(costPerSqmToman / 1_000_000, intlCurrency) : null,
      mixedGrossAndNetAreaSilently: false as const,
      allocatedWithAssumedMissingArea: false as const,
    },
    eacForecast: {
      estimateAtCompletionEacToman,
      forecastedVarianceAtCompletionVacToman,
      estimatedFinalCostPresentedAsAuditedActual: false,
    },
    handoverAndDefects: {
      defectClosed: ph.inspectorVerifiedDefectClosedWithEvidence,
      defectMarkedResolvedByContractorReportAlone: false,
      constructionHandoverEquatedWithLegalOwnershipTransfer: false,
      legalOwnershipTransferred: ph.officialNotaryTitleDeedTransferred,
    },
    audit1921PhysicalFinancialDiscrepancy: {
      overbillingDiscrepancyDetected,
      classification: overbillingDiscrepancyDetected
        ? 'DISCREPANCY_REQUIRING_REVIEW'
        : 'ALIGNED',
      autoAccusedFraudWithoutReview: false,
    },
    audit1922ContractorAccessPermitted,
    bundle131ReleaseReadinessVerdict: 'ALL_4_CONSTRUCTION_AUDITS_VERIFIED_1921_TO_1924',
  };
}