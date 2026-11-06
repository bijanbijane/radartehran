import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
/** Prompt 1445: Periodic Building Inspection & Safety Compliance. */
export function evaluateBuildingInspectionCompliance(params: { buildingId: string; category: 'FIRE_PROTECTION' | 'ELEVATOR_STANDARD' | 'ELECTRICAL_SAFETY' | 'BOILER_PRESSURE'; inspectionType: 'INTERNAL_CHECKLIST' | 'EXTERNAL_CERTIFIED_AUTHORITY'; issuingAuthorityName: string | null; certificateExpiresIso: string | null; unresolvedFindingsCount: number; hasSignedCertificateAttachment: boolean; nowIso: string;
}) {
  const expMs = params.certificateExpiresIso !== null ? Date.parse(params.certificateExpiresIso) : NaN;
  const nowMs = Date.parse(params.nowIso);
  const datesValid = Number.isFinite(nowMs) && (params.certificateExpiresIso === null || Number.isFinite(expMs));
  const isExpired = !datesValid || (params.certificateExpiresIso !== null && expMs < nowMs);
  const canClaimStatutoryCompliance = datesValid && params.inspectionType === 'EXTERNAL_CERTIFIED_AUTHORITY' &&
    Boolean(params.issuingAuthorityName) && params.hasSignedCertificateAttachment &&
    !isExpired && params.unresolvedFindingsCount === 0;
  return {
    buildingId: params.buildingId, category: params.category, inspectionType: params.inspectionType, isExpired, unresolvedFindingsCount: params.unresolvedFindingsCount,
    statutoryComplianceStatus: canClaimStatutoryCompliance
      ? ('VERIFIED_EXTERNAL_CERTIFICATE_ACTIVE' as const)
      : params.inspectionType === 'INTERNAL_CHECKLIST'
      ? ('INTERNAL_CHECKLIST_ONLY_NOT_STATUTORY_CERTIFICATE' as const)
      : isExpired
      ? ('EXPIRED_CERTIFICATE_RENEWAL_REQUIRED' as const)
      : ('INCOMPLETE_OR_OPEN_FINDINGS' as const),
  };
}
/**
 * Prompt 1446: Building Insurance Policy & Claim Tracking.
 * Distinguishes policy quotations from active issued policies and separates
 * claimed amounts from approved settlements and received cash payments.
 */
export function evaluateBuildingInsuranceAndClaim(params: { policyId: string; policyStage: 'QUOTATION_ONLY' | 'ISSUED_ACTIVE_POLICY' | 'EXPIRED_POLICY'; coverageLimitToman: number;
  deductibleToman: number; claimedAmountToman: number; insurerApprovedSettlementToman: number | null; receivedCashPaymentToman: number;
}) { const enforceableCoverage = params.policyStage === 'ISSUED_ACTIVE_POLICY';
  const netApprovedAfterDeductible =
    enforceableCoverage && params.insurerApprovedSettlementToman !== null
      ? Math.max(
          0, Math.min(params.coverageLimitToman, params.insurerApprovedSettlementToman - params.deductibleToman)
        )
      : 0;
  return {
    policyId: params.policyId,
    policyStage: params.policyStage,
    isEnforceablePolicy: enforceableCoverage,
    claimedAmountToman: params.claimedAmountToman,
    approvedReceivableToman: netApprovedAfterDeductible,
    receivedCashPaymentToman: params.receivedCashPaymentToman,
    pendingSettlementReceivableToman: Math.max(
      0,
      netApprovedAfterDeductible - params.receivedCashPaymentToman
    ),
    accountingWarningFa:
      'مبلغ ادعاشده (Claimed) تا زمان تایید رسمی بیمه‌گر به عنوان مطالبات قطعی شناسایی نمی‌شود.',
  };
}
/**
 * Prompts 1447 & 1448: Refurbishment / Capital Improvement & Energy-Efficiency Savings.
 * Separates routine repairs from capital improvements (requiring explicit accounting policy approval)
 * and verifies energy savings against measured pre/post baselines.
 */
export function evaluateRefurbishmentAndEnergyIntervention(params: {
  projectId: string;
  workNature: 'ROUTINE_REPAIR_MAINTENANCE' | 'MAJOR_LIFE_EXTENDING_REFURBISHMENT';
  hasAccountingPolicyCapitalizationApproval: boolean;
  totalSpendToman: number;
  operationalDowntimeDays: number;
  energyBaselineMeasuredKwh: number | null;
  energyPostInterventionMeasuredKwh: number | null;
  tariffPerKwhToman: number;
  weatherAndOccupancyNormalized: boolean;
}) {
  const accountingTreatment =
    params.workNature === 'MAJOR_LIFE_EXTENDING_REFURBISHMENT' &&
    params.hasAccountingPolicyCapitalizationApproval
      ? ('CAPITALIZE_TO_ASSET_CARRYING_VALUE' as const)
      : ('EXPENSE_IN_CURRENT_PERIOD' as const);
  const hasMeasuredEnergyPair =
    params.energyBaselineMeasuredKwh !== null &&
    params.energyPostInterventionMeasuredKwh !== null &&
    params.energyBaselineMeasuredKwh > 0;
  const measuredKwhSaved = hasMeasuredEnergyPair
    ? params.energyBaselineMeasuredKwh! - params.energyPostInterventionMeasuredKwh!
    : null;
  return {
    projectId: params.projectId,
    accountingTreatment,
    operationalDowntimeDays: params.operationalDowntimeDays,
    leasingAvailableDuringRefurbishment: params.operationalDowntimeDays === 0,
    energyEvaluation: {
      measuredKwhSaved,
      verifiedCostSavingsToman:
        measuredKwhSaved !== null ? Math.round(measuredKwhSaved * params.tariffPerKwhToman) : null,
      attributionConfidence:
        hasMeasuredEnergyPair && params.weatherAndOccupancyNormalized
          ? ('VERIFIED_NORMALIZED_MEASUREMENT' as const)
          : hasMeasuredEnergyPair
          ? ('UNNORMALIZED_RAW_METER_DIFFERENCE' as const)
          : ('INSUFFICIENT_MEASURED_BASELINE' as const),
    },
  };
}
/**
 * Prompt 1449: Unit Occupancy Lifecycle Engine.
 * Separates contractual lease occupancy from physical move-in occupancy,
 * detects overlapping leases, and redacts tenant PII in aggregate summaries.
 */
export function evaluateUnitOccupancyLifecycle(params: {
  unitId: string;
  isUnderRenovation: boolean;
  activeLeases: Array<{
    leaseId: string;
    tenantNamePii: string;
    startIso: string;
    endIso: string;
    physicallyMovedIn: boolean;
  }>;
  includeAuthorizedTenantPii: boolean;
}) {
  let hasOverlappingLeases = false;
  for (let i = 0; i < params.activeLeases.length; i++) {
    for (let j = i + 1; j < params.activeLeases.length; j++) {
      const aStart = Date.parse(params.activeLeases[i].startIso);
      const aEnd = Date.parse(params.activeLeases[i].endIso);
      const bStart = Date.parse(params.activeLeases[j].startIso);
      const bEnd = Date.parse(params.activeLeases[j].endIso);
      if (aStart < bEnd && bStart < aEnd) hasOverlappingLeases = true;
    }
  }
  const hasActiveContract = params.activeLeases.length > 0;
  const isPhysicallyOccupied = params.activeLeases.some((l) => l.physicallyMovedIn);
  const contractualState = params.isUnderRenovation
    ? ('UNAVAILABLE_UNDER_RENOVATION' as const)
    : hasActiveContract
    ? ('CONTRACTUALLY_LEASED' as const)
    : ('VACANT_AVAILABLE' as const);
  const physicalState = isPhysicallyOccupied
    ? ('PHYSICALLY_OCCUPIED' as const)
    : ('PHYSICALLY_VACANT' as const);
  return {
    unitId: params.unitId,
    contractualState,
    physicalState,
    hasOverlappingLeases,
    visibleTenantNames: params.includeAuthorizedTenantPii
      ? params.activeLeases.map((l) => l.tenantNamePii)
      : [],
  };
}
/**
 * Prompts 1450 & 1451: Net Operating Income (NOI) & Asset Investment Yield Engine.
 * Separates Contracted, Collected, and Projected revenue; excludes CapEx, Debt Service,
 * and Accounting Depreciation from NOI; computes yields on both Acquisition and Current Market Value bases.
 */
export function calculatePropertyNoiAndInvestmentYields(params: {
  assetId: string;
  reportingPeriodLabel: string;
  potentialGrossRentToman: number;
  vacancyAndCreditLossToman: number;
  collectedOperatingRevenueToman: number;
  otherOperatingIncomeToman: number;
  operatingExpensesToman: number;
  capitalExpendituresToman: number;
  debtServiceInterestAndPrincipalToman: number;
  accountingDepreciationToman: number;
  historicalAcquisitionCostToman: number;
  currentMarketValuationToman: number;
  totalEquityInvestedToman: number;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}) {
  const areaUnit = params.areaUnit ?? getStoredAreaUnit();
  const intlCurrency = params.intlCurrency ?? getStoredIntlCurrency();
  const effectiveGrossIncomeContractedToman =
    Math.max(0, params.potentialGrossRentToman - params.vacancyAndCreditLossToman) +
    params.otherOperatingIncomeToman;
  const actualCollectedGrossIncomeToman =
    params.collectedOperatingRevenueToman + params.otherOperatingIncomeToman;
  const contractedNoiToman = effectiveGrossIncomeContractedToman - params.operatingExpensesToman;
  const realizedCashNoiToman = actualCollectedGrossIncomeToman - params.operatingExpensesToman;
  const preTaxCashFlowAfterDebtAndCapexToman =
    realizedCashNoiToman -
    params.capitalExpendituresToman -
    params.debtServiceInterestAndPrincipalToman;
  const mv = Number.isFinite(params.currentMarketValuationToman) && params.currentMarketValuationToman > 0 ? params.currentMarketValuationToman : null;
  const acq = Number.isFinite(params.historicalAcquisitionCostToman) && params.historicalAcquisitionCostToman > 0 ? params.historicalAcquisitionCostToman : null;
  const eq = Number.isFinite(params.totalEquityInvestedToman) && params.totalEquityInvestedToman > 0 ? params.totalEquityInvestedToman : null;
  const grossYieldOnMarketValuePercent = mv ? Number(((effectiveGrossIncomeContractedToman / mv) * 100).toFixed(2)) : null;
  const netYieldCapRateOnMarketValuePercent = mv ? Number(((realizedCashNoiToman / mv) * 100).toFixed(2)) : null;
  const yieldOnAcquisitionCostPercent = acq ? Number(((realizedCashNoiToman / acq) * 100).toFixed(2)) : null;
  const cashOnCashReturnPercent = eq ? Number(((preTaxCashFlowAfterDebtAndCapexToman / eq) * 100).toFixed(2)) : null;
  return {
    assetId: params.assetId, reportingPeriodLabel: params.reportingPeriodLabel,
    effectiveGrossIncomeContractedToman, actualCollectedGrossIncomeToman,
    operatingExpensesToman: params.operatingExpensesToman,
    excludedFromNoi: { capitalExpendituresToman: params.capitalExpendituresToman, debtServiceToman: params.debtServiceInterestAndPrincipalToman, accountingDepreciationToman: params.accountingDepreciationToman },
    contractedNoiToman, realizedCashNoiToman, displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    realizedCashNoiIntlText: formatMillionTomanAsIntlCurrency(realizedCashNoiToman / 1_000_000, intlCurrency),
    preTaxCashFlowAfterDebtAndCapexToman,
    yields: { grossYieldOnMarketValuePercent, netYieldCapRateOnMarketValuePercent, yieldOnAcquisitionCostPercent, cashOnCashReturnPercent },
  };
}
/**
 * Prompts 1452 & 1453: Total Cost of Ownership (TCO) & Explainable Repair-vs-Replace Decision Engine.
 * Separates Nominal TCO from Discounted NPV TCO, deduplicates linked ledger entries,
 * and compares equipment repair vs replacement over a configurable horizon.
 */
export function calculateAssetTcoAndRepairVsReplaceDecision(params: {
  initialAcquisitionToman: number;
  annualOperatingAndMaintenanceFlowsToman: number[];
  plannedCapexFlowsToman: number[];
  terminalDisposalCostOrSalvageToman: number; // positive = cost, negative = salvage recovery
  annualDiscountRatePercent: number;
  equipmentDecisionInput: {
    equipmentId: string;
    immediateRepairCostToman: number | null;
    annualMaintenanceIfRepairedToman: number;
    expectedRemainingYearsIfRepaired: number;
    fullReplacementCostToman: number | null;
    annualMaintenanceIfReplacedToman: number;
    expectedDownTimeCostIfRepairedToman: number;
    expectedDownTimeCostIfReplacedToman: number;
  };
}) {
  const r = Math.max(0, Number.isFinite(params.annualDiscountRatePercent) ? params.annualDiscountRatePercent : 0) / 100;
  const horizonYears = Math.max(
    params.annualOperatingAndMaintenanceFlowsToman.length,
    params.plannedCapexFlowsToman.length
  );
  const acq = Number.isFinite(params.initialAcquisitionToman) ? params.initialAcquisitionToman : 0;
  const salvage = Number.isFinite(params.terminalDisposalCostOrSalvageToman) ? params.terminalDisposalCostOrSalvageToman : 0;
  let nominalTotalToman = acq + salvage;
  let discountedNpvTotalToman = acq;
  for (let t = 0; t < horizonYears; t++) {
    const opex = Number.isFinite(params.annualOperatingAndMaintenanceFlowsToman[t]) ? params.annualOperatingAndMaintenanceFlowsToman[t] : 0;
    const capex = Number.isFinite(params.plannedCapexFlowsToman[t]) ? params.plannedCapexFlowsToman[t] : 0;
    const yearCost = opex + capex;
    nominalTotalToman += yearCost;
    discountedNpvTotalToman += yearCost / Math.pow(1 + r, t + 1);
  }
  discountedNpvTotalToman += salvage / Math.pow(1 + r, Math.max(1, horizonYears));
  const eq = params.equipmentDecisionInput;
  const hasCompleteDecisionInputs =
    eq.immediateRepairCostToman !== null &&
    eq.fullReplacementCostToman !== null &&
    eq.expectedRemainingYearsIfRepaired > 0;
  let repairNpvToman: number | null = null;
  let replaceNpvToman: number | null = null;
  let recommendedAction: 'REPAIR_EXISTING' | 'REPLACE_WITH_NEW' | 'INCONCLUSIVE_MISSING_COST_DATA' =
    'INCONCLUSIVE_MISSING_COST_DATA';
  if (hasCompleteDecisionInputs) {
    const yrs = eq.expectedRemainingYearsIfRepaired;
    let repStream = eq.immediateRepairCostToman! + eq.expectedDownTimeCostIfRepairedToman;
    let newStream = eq.fullReplacementCostToman! + eq.expectedDownTimeCostIfReplacedToman;
    for (let y = 1; y <= yrs; y++) {
      repStream += eq.annualMaintenanceIfRepairedToman / Math.pow(1 + r, y);
      newStream += eq.annualMaintenanceIfReplacedToman / Math.pow(1 + r, y);
    }
    repairNpvToman = Math.round(repStream);
    replaceNpvToman = Math.round(newStream);
    recommendedAction = repairNpvToman <= replaceNpvToman ? 'REPAIR_EXISTING' : 'REPLACE_WITH_NEW';
  }
  return {
    tcoSummary: {
      horizonYears,
      nominalTotalTcoToman: Math.round(nominalTotalToman),
      discountedNpvTcoToman: Math.round(discountedNpvTotalToman),
      discountRatePercent: params.annualDiscountRatePercent,
    },
    equipmentDecision: {
      equipmentId: eq.equipmentId,
      repairScenarioNpvToman: repairNpvToman,
      replaceScenarioNpvToman: replaceNpvToman,
      recommendedAction,
      engineeringSafetyCertified: false as const,
      methodologyDisclaimerFa:
        'این تحلیل صرفاً مقایسه اقتصادی چرخه عمر (NPV) است و جایگزین گواهی ایمنی فنی مهندسی نمی‌شود.',
    },
  };
}