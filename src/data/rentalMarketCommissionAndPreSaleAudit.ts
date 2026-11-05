import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit'; export type ConversionRuleSourceType = 'MARKET_CONVENTION_3PCT_MONTHLY'
  | 'VALUATION_MODEL_2_5PCT_MONTHLY'
  | 'TAX_STATUTORY_18PCT_ANNUAL'
  | 'USER_CUSTOM_HYPOTHETICAL'; export interface RentConversionRuleSpec { ruleId: string; sourceType: ConversionRuleSourceType; monthlyRatePerMillionRahn: number; annualRatePercent: number; effectiveJalaliRange: string; jurisdiction: string; isLegallyBindingOnLandlordTenant: false; labelFa: string; }
export const RENT_CONVERSION_RULE_REGISTRY: Record<string, RentConversionRuleSpec> = { 'IR-MKT-3PCT-1403': { ruleId: 'IR-MKT-3PCT-1403', sourceType: 'MARKET_CONVENTION_3PCT_MONTHLY', monthlyRatePerMillionRahn: 0.03, annualRatePercent: 36, effectiveJalaliRange: '1403-01-01..1405-12-29', jurisdiction: 'IR-TEHRAN-MARKET-CUSTOM', isLegallyBindingOnLandlordTenant: false, labelFa: 'عرف رایج بازار مسکن (۳٪ ماهانه / ۳۶٪ سالانه)', }, 'IR-VAL-2.5PCT-1403': { ruleId: 'IR-VAL-2.5PCT-1403', sourceType: 'VALUATION_MODEL_2_5PCT_MONTHLY', monthlyRatePerMillionRahn: 0.025, annualRatePercent: 30, effectiveJalaliRange: '1403-01-01..1405-12-29', jurisdiction: 'IR-HEDONIC-VALUATION-MODEL', isLegallyBindingOnLandlordTenant: false, labelFa: 'مدل تحلیلی بازده اجاره (۲.۵٪ ماهانه / ۳۰٪ سالانه)', }, 'IR-TAX-ART53-18PCT': { ruleId: 'IR-TAX-ART53-18PCT', sourceType: 'TAX_STATUTORY_18PCT_ANNUAL', monthlyRatePerMillionRahn: 0.015, annualRatePercent: 18, effectiveJalaliRange: '1394-01-01..1405-12-29', jurisdiction: 'IR-DIRECT-TAX-LAW-ART53', isLegallyBindingOnLandlordTenant: false, labelFa: 'نرخ تقویم مالیات بر درآمد اجاره (۱۸٪ سالانه / ۱.۵٪ ماهانه)', },
}; export interface RentalLeaseContractInput { contractId: string; refundableSecurityDepositMillionToman: number; contractualMonthlyRentMillionToman: number; monthlyChargeOrMaintenanceMillionToman?: number; leaseDurationMonths: number; commencementJalaliDate: string; expirationJalaliDate: string; conversionRuleId?: string; userCustomMonthlyRate?: number; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; } const JALALI_DATE_REGEX = /^1[34]\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/; export function evaluateRentalContractAndDepositConversion(input: RentalLeaseContractInput) { const errors: string[] = []; if (!Number.isFinite(input.refundableSecurityDepositMillionToman) || input.refundableSecurityDepositMillionToman < 0)
    errors.push('INVALID_NEGATIVE_OR_NAN_DEPOSIT'); if (!Number.isFinite(input.contractualMonthlyRentMillionToman) || input.contractualMonthlyRentMillionToman < 0)
    errors.push('INVALID_NEGATIVE_OR_NAN_MONTHLY_RENT'); if (input.refundableSecurityDepositMillionToman === 0 && input.contractualMonthlyRentMillionToman === 0)
    errors.push('ZERO_DEPOSIT_AND_ZERO_RENT_INVALID'); if (!Number.isInteger(input.leaseDurationMonths) || input.leaseDurationMonths <= 0 || input.leaseDurationMonths > 120)
    errors.push('INVALID_LEASE_DURATION_MONTHS'); if (!JALALI_DATE_REGEX.test(input.commencementJalaliDate) || !JALALI_DATE_REGEX.test(input.expirationJalaliDate))
    errors.push('INVALID_JALALI_DATE_FORMAT'); else if (input.expirationJalaliDate <= input.commencementJalaliDate)
    errors.push('EXPIRATION_DATE_NOT_AFTER_COMMENCEMENT'); const charge = Math.max(0, input.monthlyChargeOrMaintenanceMillionToman ?? 0); const deposit = Math.max(0, input.refundableSecurityDepositMillionToman); const monthlyRent = Math.max(0, input.contractualMonthlyRentMillionToman); const duration = Math.max(1, input.leaseDurationMonths); let rule = RENT_CONVERSION_RULE_REGISTRY[input.conversionRuleId ?? 'IR-MKT-3PCT-1403'] ?? RENT_CONVERSION_RULE_REGISTRY['IR-MKT-3PCT-1403']; if (typeof input.userCustomMonthlyRate === 'number' && input.userCustomMonthlyRate > 0 && input.userCustomMonthlyRate <= 0.1) { rule = {
      ruleId: `USER-CUSTOM-${(input.userCustomMonthlyRate * 100).toFixed(2)}PCT`, sourceType: 'USER_CUSTOM_HYPOTHETICAL',
      monthlyRatePerMillionRahn: input.userCustomMonthlyRate, annualRatePercent: Number((input.userCustomMonthlyRate * 1200).toFixed(2)), effectiveJalaliRange: 'USER-SESSION', jurisdiction: 'USER-HYPOTHETICAL', isLegallyBindingOnLandlordTenant: false, labelFa: 'نرخ تبدیل فرضی انتخاب‌شده توسط کاربر', }; } const rate = rule.monthlyRatePerMillionRahn; const equivalentFullRahn = Number((deposit + monthlyRent / rate).toFixed(2)); const equivalentMonthlyCost = Number((monthlyRent + deposit * rate + charge).toFixed(3)); const activeUnit = input.areaUnit ?? getStoredAreaUnit(); const activeCurrency = input.intlCurrency ?? getStoredIntlCurrency(); return { contractId: input.contractId, isValid: errors.length === 0, validationErrors: errors, contractualObligations: { refundableDepositMillionToman: deposit, monthlyRentMillionToman: monthlyRent, monthlyChargeMillionToman: charge, leaseDurationMonths: duration, totalOutOfPocketRecurringRentOverLeaseMillionToman: Number((monthlyRent * duration).toFixed(3)),
      totalRecurringWithChargeOverLeaseMillionToman: Number(((monthlyRent + charge) * duration).toFixed(3)), annualizedContractualRentMillionToman: Number((monthlyRent * 12).toFixed(3)), depositIncludedInRecurringExpense: false as const, },
    hypotheticalEquivalents: { conversionRuleId: rule.ruleId, conversionSourceType: rule.sourceType, monthlyConversionRate: rate, isHypotheticalEstimate: true as const, equivalentFullRahnMillionToman: equivalentFullRahn, equivalentMonthlyCostMillionToman: equivalentMonthlyCost,
      annualizedEquivalentCostMillionToman: Number((equivalentMonthlyCost * 12).toFixed(3)), displayAreaUnitLabel: formatAreaUnitLabel(activeUnit), equivalentFullRahnIntlText: formatMillionTomanAsIntlCurrency(equivalentFullRahn, activeCurrency),
      disclaimerFa: `مقادیر هم‌ارز صرفاً بر پایه «${rule.labelFa}» محاسبه شده‌اند؛ اصل ودیعه قابل استرداد است.`,
    }, }; }
export function compareTwoRentalLeaseOptions( optionA: RentalLeaseContractInput, optionB: RentalLeaseContractInput, sharedConversionRuleId = 'IR-MKT-3PCT-1403'
) { const evalA = evaluateRentalContractAndDepositConversion({ ...optionA, conversionRuleId: sharedConversionRuleId }); const evalB = evaluateRentalContractAndDepositConversion({ ...optionB, conversionRuleId: sharedConversionRuleId }); return {
    optionA: evalA, optionB: evalB, lowerContractualMonthlyCashOutflowId: evalA.contractualObligations.monthlyRentMillionToman <= evalB.contractualObligations.monthlyRentMillionToman ? evalA.contractId : evalB.contractId,
    lowerUpfrontDepositId: evalA.contractualObligations.refundableDepositMillionToman <= evalB.contractualObligations.refundableDepositMillionToman ? evalA.contractId : evalB.contractId,
    lowerHypotheticalEquivalentCostId: evalA.hypotheticalEquivalents.equivalentMonthlyCostMillionToman <= evalB.hypotheticalEquivalents.equivalentMonthlyCostMillionToman ? evalA.contractId : evalB.contractId, };
}
export type MarketObservationSourceKind = 'ADVERTISED_ASKING_PRICE' | 'VERIFIED_OFFICIAL_TRANSACTION'; export interface MarketListingObservation {
  listingId: string; canonicalPropertyUnitKey: string; neighborhoodId: number; propertySegment: 'APARTMENT_RESIDENTIAL' | 'VILLA' | 'TOWER_LUXURY' | 'COMMERCIAL';
  areaSqm: number; pricePerSqmMillionToman: number; observedTimestampMs: number;
  status: 'ACTIVE' | 'EXPIRED' | 'WITHDRAWN' | 'SOLD' | 'RENTED'; sourceKind: MarketObservationSourceKind;
}
function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] * (1 - (idx - lo)) + sorted[hi] * (idx - lo);
}
export function evaluateHousingMarketStatisticalIndicators(
  observations: MarketListingObservation[],
  options: { nowMs: number; maxStaleAgeMs?: number; minimumSampleThreshold?: number; expectedSourceKind?: MarketObservationSourceKind }
) {
  const maxAge = options.maxStaleAgeMs ?? 30 * 24 * 3600 * 1000;
  const minSample = options.minimumSampleThreshold ?? 5;
  const expectedSource = options.expectedSourceKind ?? 'ADVERTISED_ASKING_PRICE';
  let excludedInactiveOrStaleCount = 0;
  let excludedDuplicatesCount = 0;
  const latestByUnitKey = new Map<string, MarketListingObservation>();
  for (const obs of observations) {
    const isFresh = options.nowMs - obs.observedTimestampMs <= maxAge && obs.observedTimestampMs <= options.nowMs;
    const isValid = Number.isFinite(obs.areaSqm) && obs.areaSqm >= 20 && Number.isFinite(obs.pricePerSqmMillionToman) && obs.pricePerSqmMillionToman > 0;
    if (obs.status !== 'ACTIVE' || !isFresh || !isValid || obs.sourceKind !== expectedSource) {
      excludedInactiveOrStaleCount += 1;
      continue;
    }
    const existing = latestByUnitKey.get(obs.canonicalPropertyUnitKey);
    if (!existing) latestByUnitKey.set(obs.canonicalPropertyUnitKey, obs);
    else {
      excludedDuplicatesCount += 1;
      if (obs.observedTimestampMs > existing.observedTimestampMs) latestByUnitKey.set(obs.canonicalPropertyUnitKey, obs);
    }
  }
  const deduped = Array.from(latestByUnitKey.values());
  if (deduped.length === 0) {
    return {
      sampleSizeRaw: observations.length, sampleSizeDeduplicatedActive: 0, minimumSampleThreshold: minSample,
      isLowSampleWarning: true, sourceKind: expectedSource, meanPricePerSqm: null, medianPricePerSqm: null,
      p25PricePerSqm: null, p75PricePerSqm: null, iqrPricePerSqm: null, areaWeightedMeanPricePerSqm: null,
      trimmedMeanPricePerSqm: null, detectedOutlierListingIds: [] as string[], excludedDuplicatesCount, excludedInactiveOrStaleCount,
    };
  }
  const sortedByPrice = [...deduped].sort((a, b) => a.pricePerSqmMillionToman - b.pricePerSqmMillionToman);
  const prices = sortedByPrice.map((d) => d.pricePerSqmMillionToman);
  const p25 = computePercentile(prices, 0.25);
  const median = computePercentile(prices, 0.5);
  const p75 = computePercentile(prices, 0.75);
  const iqr = p75 - p25;
  const outliers = sortedByPrice
    .filter((d) => iqr > 0 && (d.pricePerSqmMillionToman < p25 - 1.5 * iqr || d.pricePerSqmMillionToman > p75 + 1.5 * iqr))
    .map((d) => d.listingId);
  const inliers = sortedByPrice.filter((d) => !outliers.includes(d.listingId));
  const mean = prices.reduce((a, v) => a + v, 0) / prices.length;
  const areaWeightedMean = deduped.reduce((a, d) => a + d.areaSqm * d.pricePerSqmMillionToman, 0) / deduped.reduce((a, d) => a + d.areaSqm, 0);
  const trimmedMean = inliers.length > 0 ? inliers.reduce((a, d) => a + d.pricePerSqmMillionToman, 0) / inliers.length : mean;
  return {
    sampleSizeRaw: observations.length, sampleSizeDeduplicatedActive: deduped.length, minimumSampleThreshold: minSample,
    isLowSampleWarning: deduped.length < minSample, sourceKind: expectedSource,
    meanPricePerSqm: Number(mean.toFixed(2)), medianPricePerSqm: Number(median.toFixed(2)),
    p25PricePerSqm: Number(p25.toFixed(2)), p75PricePerSqm: Number(p75.toFixed(2)), iqrPricePerSqm: Number(iqr.toFixed(2)),
    areaWeightedMeanPricePerSqm: Number(areaWeightedMean.toFixed(2)), trimmedMeanPricePerSqm: Number(trimmedMean.toFixed(2)),
    detectedOutlierListingIds: outliers, excludedDuplicatesCount, excludedInactiveOrStaleCount,
  };
}
export function computeCompositionAdjustedPriceChange(
  period1: MarketListingObservation[],
  period2: MarketListingObservation[],
  baselineSegmentWeights: Record<MarketListingObservation['propertySegment'], number>
) {
  const rawMean1 = period1.reduce((s, x) => s + x.pricePerSqmMillionToman, 0) / Math.max(1, period1.length);
  const rawMean2 = period2.reduce((s, x) => s + x.pricePerSqmMillionToman, 0) / Math.max(1, period2.length);
  const rawGrowthPercent = Number((((rawMean2 - rawMean1) / rawMean1) * 100).toFixed(2));
  let weighted1 = 0, weighted2 = 0, weightSum = 0;
  for (const [seg, weight] of Object.entries(baselineSegmentWeights) as [MarketListingObservation['propertySegment'], number][]) {
    const g1 = period1.filter((x) => x.propertySegment === seg);
    const g2 = period2.filter((x) => x.propertySegment === seg);
    if (g1.length > 0 && g2.length > 0 && weight > 0) {
      weighted1 += (g1.reduce((s, x) => s + x.pricePerSqmMillionToman, 0) / g1.length) * weight;
      weighted2 += (g2.reduce((s, x) => s + x.pricePerSqmMillionToman, 0) / g2.length) * weight;
      weightSum += weight;
    }
  }
  const mixAdjustedGrowthPercent = weightSum > 0 ? Number((((weighted2 - weighted1) / weighted1) * 100).toFixed(2)) : rawGrowthPercent;
  return {
    rawMeanPeriod1: Number(rawMean1.toFixed(2)), rawMeanPeriod2: Number(rawMean2.toFixed(2)),
    rawGrowthPercent, mixAdjustedGrowthPercent, compositionShiftDistortionPercent: Number((rawGrowthPercent - mixAdjustedGrowthPercent).toFixed(2)),
  };
}
export const TEHRAN_UNION_COMMISSION_RULE_1403 = {
  ruleVersionId: 'IR-TEHRAN-UNION-TARIFF-1403-V1',
  jurisdiction: 'IR-TEHRAN-REAL-ESTATE-UNION',
  effectiveFromJalali: '1403-01-01',
  effectiveToJalali: '1405-12-29',
  vatRate: 0.1,
  saleTier1CapMillionToman: 500,
  saleTier1RatePerSide: 0.005,
  saleTier2RatePerSide: 0.0025,
  rentCommissionFractionOfMonthlyRentPerSide: 0.25,
};
export function calculateVersionedBrokerageCommission(
  input: {
    mode: 'buy' | 'rent';
    salePriceMillionToman?: number;
    depositMillionToman?: number;
    monthlyRentMillionToman?: number;
    rentConversionRatePerMonth?: number;
    buyerCustomDiscountRate?: number;
    sellerCustomDiscountRate?: number;
  },
  rule = TEHRAN_UNION_COMMISSION_RULE_1403
) {
  const errors: string[] = [];
  if (input.mode === 'buy' && (typeof input.salePriceMillionToman !== 'number' || !Number.isFinite(input.salePriceMillionToman) || input.salePriceMillionToman <= 0)) {
    errors.push('INVALID_OR_NON_POSITIVE_SALE_PRICE');
  } else if (input.mode === 'rent') {
    const dep = input.depositMillionToman ?? 0, rent = input.monthlyRentMillionToman ?? 0;
    if (!Number.isFinite(dep) || dep < 0 || !Number.isFinite(rent) || rent < 0 || (dep === 0 && rent === 0))
      errors.push('INVALID_OR_ZERO_RENTAL_CONTRACT_VALUES');
  }
  if (errors.length > 0) return { isValid: false as const, errors, ruleMetadata: rule };
  const bDisc = Math.min(1, Math.max(0, input.buyerCustomDiscountRate ?? 0));
  const sDisc = Math.min(1, Math.max(0, input.sellerCustomDiscountRate ?? 0));
  const ceilingPerSide =
    input.mode === 'buy'
      ? Math.min(input.salePriceMillionToman!, rule.saleTier1CapMillionToman) * rule.saleTier1RatePerSide +
        Math.max(0, input.salePriceMillionToman! - rule.saleTier1CapMillionToman) * rule.saleTier2RatePerSide
      : ((input.monthlyRentMillionToman ?? 0) + (input.depositMillionToman ?? 0) * (input.rentConversionRatePerMonth ?? 0.03)) *
        rule.rentCommissionFractionOfMonthlyRentPerSide;
  const buyerBase = Number((ceilingPerSide * (1 - bDisc)).toFixed(4));
  const buyerVat = Number((buyerBase * rule.vatRate).toFixed(4));
  const sellerBase = Number((ceilingPerSide * (1 - sDisc)).toFixed(4));
  const sellerVat = Number((sellerBase * rule.vatRate).toFixed(4));
  const price = input.salePriceMillionToman ?? 0;
  return {
    isValid: true as const,
    errors: [] as string[],
    ruleMetadata: rule,
    statutoryAndUnionTariff: {
      classification: 'UNION_TARIFF_CEILING_PLUS_STATUTORY_VAT' as const,
      buyerSideBaseMillionToman: buyerBase,
      buyerSideVatMillionToman: buyerVat,
      buyerSideTotalMillionToman: Number((buyerBase + buyerVat).toFixed(4)),
      sellerSideBaseMillionToman: sellerBase,
      sellerSideVatMillionToman: sellerVat,
      sellerSideTotalMillionToman: Number((sellerBase + sellerVat).toFixed(4)),
    },
    illustrativeNonBindingEstimates: {
      classification: 'ILLUSTRATIVE_MARKET_ESTIMATE_NOT_STATUTORY_EXACT' as const,
      estimatedSellerTransferTaxMillionToman: input.mode === 'buy' ? Number((price * 0.002).toFixed(4)) : 0,
      estimatedNotaryFeeEachSideMillionToman: input.mode === 'buy' ? Number((price * 0.0009).toFixed(4)) : 0.35,
    },
  };
}
export type ConstructionMilestoneStage =
  | 'PERMIT_AND_EXCAVATION'
  | 'FOUNDATION'
  | 'SKELETON_STRUCTURE'
  | 'WALLS_AND_MEP'
  | 'FINISHING_AND_FACADE'
  | 'END_OF_WORK_CERTIFICATE'
  | 'SEPARATED_TITLE_DEED_ISSUED';
export interface PreSaleProjectUnit {
  unitId: string;
  buildingBlockId: string;
  floorNumber: number;
  areaSqm: number;
  status: 'AVAILABLE' | 'RESERVED' | 'UNDER_CONTRACT' | 'SOLD' | 'WITHDRAWN';
  reservedByBuyerId?: string;
  reservationVersion: number;
}
export class PreSaleProjectLifecycleCoordinator {
  private developerReportedProgressPercent = 0;
  private independentInspectorVerifiedProgressPercent: number | null = null;
  private currentStage: ConstructionMilestoneStage = 'PERMIT_AND_EXCAVATION';
  private targetHandoverJalali: string;
  private handoverHistory: Array<{ revisedAtIso: string; previousTargetJalali: string; newTargetJalali: string; delayReason: string }> = [];
  private units = new Map<string, PreSaleProjectUnit>();
  constructor(initialTargetHandoverJalali: string, initialUnits: PreSaleProjectUnit[]) {
    this.targetHandoverJalali = initialTargetHandoverJalali;
    for (const u of initialUnits) this.units.set(u.unitId, { ...u });
  }
  public updateProgress(params: { developerClaimedPercent: number; inspectorVerifiedPercent?: number; stage: ConstructionMilestoneStage }) {
    this.developerReportedProgressPercent = Math.min(100, Math.max(0, params.developerClaimedPercent));
    if (typeof params.inspectorVerifiedPercent === 'number')
      this.independentInspectorVerifiedProgressPercent = Math.min(100, Math.max(0, params.inspectorVerifiedPercent));
    this.currentStage = params.stage;
  }
  public reviseHandoverDate(newTargetJalali: string, delayReason: string, revisedAtIso: string) {
    if (newTargetJalali !== this.targetHandoverJalali) {
      this.handoverHistory.push({ revisedAtIso, previousTargetJalali: this.targetHandoverJalali, newTargetJalali, delayReason });
      this.targetHandoverJalali = newTargetJalali;
    }
  }
  public reserveUnitAtomically(unitId: string, buyerId: string, expectedVersion: number) {
    const unit = this.units.get(unitId);
    if (!unit) return { ok: false as const, reason: 'UNIT_NOT_FOUND' };
    if (unit.reservationVersion !== expectedVersion) return { ok: false as const, reason: 'CONCURRENT_VERSION_CONFLICT' };
    if (unit.status !== 'AVAILABLE') return { ok: false as const, reason: `UNIT_NOT_AVAILABLE_${unit.status}` };
    unit.status = 'RESERVED';
    unit.reservedByBuyerId = buyerId;
    unit.reservationVersion += 1;
    return { ok: true as const, unit: { ...unit } };
  }
  public getProjectSnapshot(currentJalaliDate: string) {
    const isVerifiedComplete = this.currentStage === 'END_OF_WORK_CERTIFICATE' || this.currentStage === 'SEPARATED_TITLE_DEED_ISSUED';
    const unitList = Array.from(this.units.values());
    return {
      currentStage: this.currentStage,
      developerReportedProgressPercent: this.developerReportedProgressPercent,
      independentInspectorVerifiedProgressPercent: this.independentInspectorVerifiedProgressPercent,
      authoritativeProgressForRiskScoring: this.independentInspectorVerifiedProgressPercent ?? this.developerReportedProgressPercent,
      targetHandoverJalali: this.targetHandoverJalali,
      handoverRevisionCount: this.handoverHistory.length,
      handoverHistory: [...this.handoverHistory],
      isPastTargetHandoverWithoutCompletion: currentJalaliDate > this.targetHandoverJalali && !isVerifiedComplete,
      isCompletedAndReadyForDelivery: isVerifiedComplete,
      inventorySummary: {
        totalUnits: unitList.length,
        availableCount: unitList.filter((u) => u.status === 'AVAILABLE').length,
        reservedCount: unitList.filter((u) => u.status === 'RESERVED').length,
        soldCount: unitList.filter((u) => u.status === 'SOLD').length,
      },
    };
  }
}
export function evaluateBuildingConditionAndSeparatedDepreciation(input: {
  constructionYearJalali: number;
  currentYearJalali: number;
  lastRenovationYearJalali?: number;
  renovationScope: 'NONE' | 'COSMETIC_INTERIOR_ONLY' | 'MAJOR_STRUCTURAL_AND_MEP';
  maintenanceGrade: 'EXCELLENT' | 'NORMAL' | 'DEFERRED_MAINTENANCE_NEEDS_REBUILD';
  totalNewBenchmarkPropertyValueMillionToman: number;
  landValueShareRatio: number;
  annualBuildingDepreciationRate?: number;
  maxBuildingCumulativeDepreciationRatio?: number;
}) {
  const errors: string[] = [];
  const chronologicalAge = input.currentYearJalali - input.constructionYearJalali;
  if (chronologicalAge < 0 || chronologicalAge > 120) errors.push('INVALID_CONSTRUCTION_YEAR_OR_NEGATIVE_AGE');
  if (typeof input.lastRenovationYearJalali === 'number') {
    if (input.lastRenovationYearJalali < input.constructionYearJalali) errors.push('RENOVATION_YEAR_BEFORE_CONSTRUCTION_YEAR');
    if (input.lastRenovationYearJalali > input.currentYearJalali) errors.push('RENOVATION_YEAR_IN_FUTURE');
  }
  if (input.landValueShareRatio <= 0 || input.landValueShareRatio >= 0.95) errors.push('INVALID_LAND_VALUE_SHARE_RATIO');
  const landShare = Math.min(0.9, Math.max(0.2, input.landValueShareRatio));
  const nonDepreciableLandValueMillionToman = Number((input.totalNewBenchmarkPropertyValueMillionToman * landShare).toFixed(2));
  const replacementStructureValueMillionToman = Number((input.totalNewBenchmarkPropertyValueMillionToman * (1 - landShare)).toFixed(2));
  let effectiveAgeYears = Math.max(0, chronologicalAge);
  if (typeof input.lastRenovationYearJalali === 'number' && input.lastRenovationYearJalali >= input.constructionYearJalali && input.lastRenovationYearJalali <= input.currentYearJalali) {
    const sinceReno = input.currentYearJalali - input.lastRenovationYearJalali;
    if (input.renovationScope === 'MAJOR_STRUCTURAL_AND_MEP') effectiveAgeYears = Math.round(chronologicalAge * 0.35 + sinceReno * 0.65);
    else if (input.renovationScope === 'COSMETIC_INTERIOR_ONLY') effectiveAgeYears = Math.round(chronologicalAge * 0.75 + sinceReno * 0.25);
  }
  if (input.maintenanceGrade === 'DEFERRED_MAINTENANCE_NEEDS_REBUILD') effectiveAgeYears = Math.max(effectiveAgeYears, Math.round(chronologicalAge * 1.25));
  else if (input.maintenanceGrade === 'EXCELLENT') effectiveAgeYears = Math.round(effectiveAgeYears * 0.9);
  const structureDepreciationRatio = Math.min(input.maxBuildingCumulativeDepreciationRatio ?? 0.55, Number((effectiveAgeYears * (input.annualBuildingDepreciationRate ?? 0.015)).toFixed(4)));
  const depreciatedStructureValueMillionToman = Number((replacementStructureValueMillionToman * (1 - structureDepreciationRatio)).toFixed(2));
  const totalSeparatedValuationMillionToman = Number((nonDepreciableLandValueMillionToman + depreciatedStructureValueMillionToman).toFixed(2));
  return {
    isValid: errors.length === 0,
    validationErrors: errors,
    chronologicalAgeYears: chronologicalAge, effectiveAgeYears, isNewBuildLabeled: chronologicalAge === 0, landValueDepreciated: false as const, nonDepreciableLandValueMillionToman, replacementStructureValueMillionToman, structureDepreciationRatio, depreciatedStructureValueMillionToman, totalSeparatedValuationMillionToman, }; }