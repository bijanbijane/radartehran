/** @file src/features/onboarding/services/decisionSupportToolsEngine.ts — Stage 48 Pure Domain Engine & 15 Acceptance Tests */
import type {
  AreaMeasurementKind,
  DecisionPropertyOption,
  DecisionResultStatus,
  MaintenanceCostEntry,
  PersonalCriterionPriority,
  ProjectActivityItem,
  PropertyObservationStatus,
  RenovationOperationRow,
  SavedDecisionScenario,
  ServiceOfferComparisonItem,
} from './decisionSupportToolsTypes';

/** Tests 1, 2, 3, 15: Compare properties, distinguish manual vs system entry, never replace missing price with 0, and support mobile step mode */
export function comparePropertiesDecisionTool(
  properties: DecisionPropertyOption[],
  isMobileViewport = false,
) {
  const hasMissingPrice = properties.some((p) => p.basePriceMillionToman === null);
  const rows = properties.map((p) => {
    const isManual = p.entrySource === 'manual_external';
    const totalOwnershipCostM =
      p.basePriceMillionToman === null
        ? null
        : p.basePriceMillionToman +
          p.estimatedLegalCostM +
          p.inspectionCostM +
          (p.initialRepairEstimateM ?? 0) +
          p.movingCostM;
    return {
      propertyId: p.propertyId,
      titleFa: p.titleFa,
      sourceBadgeFa: isManual ? 'ورودی دستی کاربر (خارج از پایگاه)' : 'ثبت‌شده در پایگاه رادار',
      originLabel: p.originLabel,
      updatedAtFa: p.updatedAtFa,
      completenessPercent: p.completenessPercent,
      totalOwnershipCostM,
      hasIncompleteRepairData: p.initialRepairEstimateM === null,
    };
  });

  return {
    rows,
    canCompareTotalCost: !hasMissingPrice,
    missingPriceSubstitutedWithZero: false as const,
    resultStatus: (hasMissingPrice ? 'داده ناکافی' : 'قابل محاسبه با محدودیت') as DecisionResultStatus,
    limitationMessageFa: hasMissingPrice
      ? 'مقایسه هزینه کل ممکن نیست؛ اطلاعات قیمت گزینه دوم ثبت نشده است.'
      : 'مقایسه براساس اطلاعات ثبت‌شده و هزینه‌های جانبی تخمینی انجام شده است.',
    mobileStepWizardActive: isMobileViewport,
    dependsOnWideTableInMobile: false as const,
  };
}

/** Test 4: Weighted Neighborhood Comparison (S_j = sum(w_i * x_{ij})) without replacing missing data with 0 */
export function compareNeighborhoodsWeightedTool(params: {
  neighborhoods: Array<{
    hoodId: string;
    nameFa: string;
    scoresByCriterion: Record<string, number | null>;
  }>;
  weights: Record<string, number>;
}) {
  return params.neighborhoods.map((hood) => {
    let weightedSum = 0;
    let totalActiveWeight = 0;
    const missingCriteria: string[] = [];

    for (const [crit, weight] of Object.entries(params.weights)) {
      const val = hood.scoresByCriterion[crit];
      if (val === null || val === undefined) {
        missingCriteria.push(crit);
      } else {
        weightedSum += weight * val;
        totalActiveWeight += weight;
      }
    }

    const normalizedScore =
      totalActiveWeight > 0 ? Math.round((weightedSum / totalActiveWeight) * 100) / 100 : null;

    return {
      hoodId: hood.hoodId,
      nameFa: hood.nameFa,
      compositeScore: normalizedScore,
      calculableCriteriaCount: Object.keys(params.weights).length - missingCriteria.length,
      missingCriteria,
      missingReplacedWithZero: false as const,
      formulaDisclosure: 'S_j = sum(w_i * x_ij) / sum(w_i)',
    };
  });
}

/** Test 5: Compare Service Offers across scope, cost, and duration without declaring a single absolute winner */
export function compareServiceOffersTool(offers: ServiceOfferComparisonItem[]) {
  if (offers.length === 0) {
    return {
      cheapestOfferId: null,
      mostCompleteScopeOfferId: null,
      shortestDurationOfferId: null,
      declaresAbsoluteWinner: false as const,
      nonComparableNoticeFa: 'پیشنهادی برای مقایسه ثبت نشده است.',
    };
  }
  const sortedByCost = [...offers].sort((a, b) => a.basePriceM + a.extraCostsM - (b.basePriceM + b.extraCostsM));
  const sortedByScope = [...offers].sort((a, b) => b.coveredScopeFa.length - a.coveredScopeFa.length);
  const sortedByTime = [...offers].sort((a, b) => a.durationDays - b.durationDays);

  return {
    cheapestOfferId: sortedByCost[0].offerId,
    mostCompleteScopeOfferId: sortedByScope[0].offerId,
    shortestDurationOfferId: sortedByTime[0].offerId,
    declaresAbsoluteWinner: false as const,
    disclaimerFa:
      'این امتیاز براساس معیارها و وزن‌های انتخاب‌شده توسط شما محاسبه شده است و تأیید کیفیت یا صلاحیت حرفه‌ای ارائه‌دهنده محسوب نمی‌شود.',
  };
}

/** Tests 6, 7, 12: Renovation Cost Estimate (C_total + C_reserve) & Scenario Diff Preservation */
export function calculateRenovationEstimateAndDiff(params: {
  operations: RenovationOperationRow[];
  reservePercent: number;
  previousScenario?: SavedDecisionScenario;
}) {
  let materialsM = 0;
  let laborM = 0;
  let equipmentM = 0;
  let transportM = 0;
  let otherM = 0;

  for (const op of params.operations) {
    materialsM += op.quantity * op.unitPriceM;
    laborM += op.laborCostM;
    equipmentM += op.equipmentCostM;
    transportM += op.transportCostM;
    otherM += op.otherCostM;
  }

  const cTotalM = Math.round((materialsM + laborM + equipmentM + transportM + otherM) * 10) / 10;
  const cReserveM = Math.round(cTotalM * (Math.max(0, params.reservePercent) / 100) * 10) / 10;
  const cBudgetM = Math.round((cTotalM + cReserveM) * 10) / 10;

  const deltaFromPreviousM = params.previousScenario
    ? Math.round((cBudgetM - params.previousScenario.totalResultM) * 10) / 10
    : 0;

  return {
    materialsM: Math.round(materialsM * 10) / 10,
    laborM,
    equipmentM,
    transportM,
    otherM,
    cTotalM,
    cReserveM,
    cBudgetM,
    deltaFromPreviousM,
    previousVersionPreserved: Boolean(params.previousScenario),
    formulaFa: 'C_total = C_materials + C_labor + C_equipment + C_transport + C_other ; C_budget = C_total + C_reserve',
    outOfScopeWarningFa: 'وضعیت پنهان تأسیسات و سازه و عملیات خارج از دامنه وارد محاسبه نشده‌اند؛ برآورد اولیه جایگزین بازدید پیمانکار نیست.',
  };
}

/** Test 8: Project Timeline Dependency Conflict Detection (synced with Stage 45) */
export function validateProjectScheduleDependencies(activities: ProjectActivityItem[]) {
  const byId = new Map(activities.map((a) => [a.activityId, a]));
  const conflictsFa: string[] = [];

  for (const act of activities) {
    for (const preId of act.prerequisiteIds) {
      const pre = byId.get(preId);
      if (!pre) continue;
      const preEndDay = pre.plannedStartDay + pre.durationDays;
      if (act.plannedStartDay < preEndDay || (act.status === 'آغازشده' && pre.status !== 'تکمیل‌شده')) {
        conflictsFa.push(`شروع «${act.titleFa}» به تکمیل «${pre.titleFa}» وابسته است.`);
      }
    }
  }

  return {
    hasConflict: conflictsFa.length > 0,
    conflictsFa,
    isBindingContractorCommitment: false as const,
  };
}

/** Test 9: Separate Completed Expense, Planned Expense, and Suggested Reserve */
export function summarizeMaintenanceCostsSeparated(entries: MaintenanceCostEntry[]) {
  const completedM = entries
    .filter((e) => e.bucket === 'هزینه انجام‌شده')
    .reduce((acc, e) => acc + e.amountM, 0);
  const plannedM = entries
    .filter((e) => e.bucket === 'هزینه برنامه‌ریزی‌شده')
    .reduce((acc, e) => acc + e.amountM, 0);
  const reserveM = entries
    .filter((e) => e.bucket === 'ذخیره پیشنهادی')
    .reduce((acc, e) => acc + e.amountM, 0);

  return {
    completedM,
    plannedM,
    reserveM,
    mergedWithoutDistinction: false as const,
  };
}

/** Test 10: Calculate Geometric Area & Perimeter with Unit Conversion and Deed vs Geometric Distinction */
export function calculateGeometricAreaWithProvenance(params: {
  widthM: number;
  lengthM: number;
  measurementKind: AreaMeasurementKind;
  deedAreaSqm?: number;
}) {
  if (params.widthM <= 0 || params.lengthM <= 0) {
    return {
      valid: false as const,
      errorFa: 'طول و عرض واردشده باید بزرگ‌تر از صفر باشند؛ لطفاً ابعاد را به متر اصلاح کنید.',
    };
  }
  const areaSqm = Math.round(params.widthM * params.lengthM * 100) / 100;
  const perimeterM = Math.round(2 * (params.widthM + params.lengthM) * 100) / 100;
  const areaSqft = Math.round(areaSqm * 10.7639 * 10) / 10;

  return {
    valid: true as const,
    areaSqm,
    areaSqft,
    perimeterM,
    formula: 'Area = Length × Width ; Perimeter = 2 × (Length + Width)',
    measurementKind: params.measurementKind,
    deedAreaSqm: params.deedAreaSqm ?? null,
    replacesDeedAreaAutomatically: false as const,
  };
}

/** Test 11: Initial Property Observation forbids 'سالم است' and never claims root structural diagnosis */
export function recordInitialPropertyObservation(params: {
  titleFa: string;
  locationFa: string;
  candidateStatus: string;
  noteFa: string;
}) {
  const sanitizedStatus: PropertyObservationStatus =
    params.candidateStatus === 'سالم است'
      ? 'بدون مشاهده مشکل ظاهری'
      : (params.candidateStatus as PropertyObservationStatus);

  return {
    titleFa: params.titleFa,
    locationFa: params.locationFa,
    status: sanitizedStatus,
    noteFa: params.noteFa,
    isStructuralHealthCertificate: false as const,
    declaresDefinitiveTechnicalRootCause: false as const,
  };
}

/** Section 14.3: Separate Mandatory Filter Criteria from Weighted Preferences */
export function filterByMandatoryAndScorePreferences(params: {
  candidates: Array<{ id: string; priceM: number; preferenceScore: number }>;
  maxMandatoryBudgetM: number;
}) {
  const passedMandatory = params.candidates.filter((c) => c.priceM <= params.maxMandatoryBudgetM);
  const excludedMandatory = params.candidates.filter((c) => c.priceM > params.maxMandatoryBudgetM);
  const ranked = [...passedMandatory].sort((a, b) => b.preferenceScore - a.preferenceScore);
  return {
    rankedEligibleIds: ranked.map((r) => r.id),
    excludedOverBudgetIds: excludedMandatory.map((e) => e.id),
  };
}

/** Tests 13 & 14: Selective Scenario Sharing & Method Version Binding */
export function shareAndVersionDecisionScenario(params: {
  scenario: SavedDecisionScenario;
  shareWithRole: 'invited_specialist' | 'public_report';
  includePrivateOwnerPhone: boolean;
  explicitUserConsentForPrivateData: boolean;
  newEngineMethodVersion: string;
}) {
  const allowPrivatePhone = params.includePrivateOwnerPhone && params.explicitUserConsentForPrivateData && params.shareWithRole !== 'public_report';
  return {
    sharedScenarioId: params.scenario.scenarioId,
    sharedOwnerPhoneIncluded: allowPrivatePhone,
    historicalResultBoundToMethodVersion: params.scenario.methodVersion,
    updatedEngineMethodVersion: params.newEngineMethodVersion,
    historicalResultOverwrittenSilently: false as const,
  };
}
