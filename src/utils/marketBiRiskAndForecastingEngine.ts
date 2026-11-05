import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface MetricRegistryDefinition { metricId: string; version: number; labelFa: string;
  unit: 'TOMAN' | 'TOMAN_PER_SQM' | 'PERCENT' | 'DAYS' | 'COUNT' | 'RATIO'; priceBasis: 'ASKING_LISTING' | 'CONFIRMED_TRANSACTION' | 'NOT_APPLICABLE'; valueBasis: 'NOMINAL' | 'INFLATION_ADJUSTED_REAL' | 'NOT_APPLICABLE'; areaDenominator: 'BUILT_AREA_SQM' | 'LAND_AREA_SQM' | 'USABLE_AREA_SQM' | 'NONE'; formulaSummaryFa: string; }
export const REAL_ESTATE_METRICS_REGISTRY: Readonly<Record<string, MetricRegistryDefinition>> = { ASKING_PRICE_PER_SQM_MEDIAN: {
    metricId: 'ASKING_PRICE_PER_SQM_MEDIAN', version: 2, labelFa: 'میانه قیمت پیشنهادی هر مترمربع بنا (آگهی‌ها)', unit: 'TOMAN_PER_SQM', priceBasis: 'ASKING_LISTING', valueBasis: 'NOMINAL', areaDenominator: 'BUILT_AREA_SQM',
    formulaSummaryFa: 'Median(totalAskingPriceToman / builtAreaSqm) پس از حذف رکوردهای تکراری و مساحت نامعتبر', }, TRANSACTION_PRICE_PER_SQM_MEDIAN: { metricId: 'TRANSACTION_PRICE_PER_SQM_MEDIAN', version: 2, labelFa: 'میانه قیمت قطعی معامله‌شده هر مترمربع بنا',
    unit: 'TOMAN_PER_SQM', priceBasis: 'CONFIRMED_TRANSACTION', valueBasis: 'NOMINAL', areaDenominator: 'BUILT_AREA_SQM', formulaSummaryFa: 'Median(verifiedTransactionPriceToman / builtAreaSqm) روی معاملات ثبت‌شده', }, LISTING_TO_TRANSACTION_GAP_PCT: {
    metricId: 'LISTING_TO_TRANSACTION_GAP_PCT', version: 1, labelFa: 'درصد شکاف قیمت پیشنهادی و قیمت قطعی معامله', unit: 'PERCENT', priceBasis: 'CONFIRMED_TRANSACTION', valueBasis: 'NOMINAL', areaDenominator: 'NONE', formulaSummaryFa: '((transactionPrice - askingPrice) / askingPrice) * 100 روی جفت‌های معتبر', },
  NET_RENTAL_YIELD_PCT: { metricId: 'NET_RENTAL_YIELD_PCT', version: 1, labelFa: 'بازده خالص اجاره سالانه',
    unit: 'PERCENT', priceBasis: 'NOT_APPLICABLE', valueBasis: 'NOMINAL', areaDenominator: 'NONE', formulaSummaryFa: '((annualEffectiveRent - annualOperatingExpenses) / totalAcquisitionCost) * 100',
  }, };
export interface AnalyticalObservationRecord {
  observationId: string; workspaceId: string; propertyId: string; city: string; districtId: number; hoodId: number;
  propertyType: 'APARTMENT' | 'VILLA' | 'COMMERCIAL'; areaBasis: 'BUILT_AREA_SQM' | 'LAND_AREA_SQM';
  areaSqm: number; ageYears: number; bedrooms: number; priceBasis: 'ASKING_LISTING' | 'CONFIRMED_TRANSACTION';
  totalPriceToman: number; observedAtIso: string; lifecycleState: 'ACTIVE' | 'SOLD' | 'RENTED' | 'WITHDRAWN' | 'EXPIRED'; daysOnMarket?: number | null;
}
export function computePricePerSqmIndexAndGap(params: {
  workspaceId: string;
  observations: readonly AnalyticalObservationRecord[];
  minSampleSize?: number;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}) {
  const minSample = params.minSampleSize ?? 3;
  const areaUnit = params.areaUnit ?? getStoredAreaUnit();
  const intlCurrency = params.intlCurrency ?? getStoredIntlCurrency();
  const seenKeys = new Set<string>();
  const validAskingPerSqm: number[] = [];
  const validTxPerSqm: number[] = [];
  const askingByProperty = new Map<string, number>();
  const txByProperty = new Map<string, number>();
  let rejectedInvalidAreaCount = 0;
  let deduplicatedCount = 0;
  for (const obs of params.observations) {
    if (obs.workspaceId !== params.workspaceId) continue;
    const dedupKey = `${obs.propertyId}:${obs.priceBasis}:${obs.observedAtIso.slice(0, 10)}`;
    if (seenKeys.has(dedupKey)) {
      deduplicatedCount++;
      continue;
    }
    seenKeys.add(dedupKey);
    if (obs.areaBasis !== 'BUILT_AREA_SQM' || !Number.isFinite(obs.areaSqm) || obs.areaSqm <= 15 || obs.areaSqm > 5000 || !Number.isFinite(obs.totalPriceToman) || obs.totalPriceToman <= 0) {
      rejectedInvalidAreaCount++;
      continue;
    }
    const perSqm = Math.round(obs.totalPriceToman / obs.areaSqm);
    if (obs.priceBasis === 'ASKING_LISTING') {
      validAskingPerSqm.push(perSqm);
      askingByProperty.set(obs.propertyId, obs.totalPriceToman);
    } else if (obs.priceBasis === 'CONFIRMED_TRANSACTION' && obs.lifecycleState === 'SOLD') {
      validTxPerSqm.push(perSqm);
      txByProperty.set(obs.propertyId, obs.totalPriceToman);
    }
  }
  const medianOf = (arr: number[]): number | null => {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  };
  const gapPercents: number[] = [];
  for (const [propId, txPrice] of txByProperty.entries()) {
    const askPrice = askingByProperty.get(propId);
    if (askPrice && askPrice > 0) gapPercents.push(Number((((txPrice - askPrice) / askPrice) * 100).toFixed(2)));
  }
  const meanGap = gapPercents.length > 0 ? Number((gapPercents.reduce((s, v) => s + v, 0) / gapPercents.length).toFixed(2)) : null;
  const lowSample = validAskingPerSqm.length < minSample && validTxPerSqm.length < minSample;
  const askingMedianPerSqmToman = medianOf(validAskingPerSqm);
  const transactionMedianPerSqmToman = medianOf(validTxPerSqm);
  return {
    askingMedianPerSqmToman,
    transactionMedianPerSqmToman,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    askingMedianPerSqmIntlText: askingMedianPerSqmToman !== null ? formatMillionTomanAsIntlCurrency(askingMedianPerSqmToman / 1_000_000, intlCurrency) : null,
    askingSampleCount: validAskingPerSqm.length,
    transactionSampleCount: validTxPerSqm.length,
    pairedGapSampleCount: gapPercents.length,
    meanListingToTransactionGapPercent: meanGap,
    rejectedInvalidAreaCount,
    deduplicatedCount,
    lowConfidenceWarningFa: lowSample ? `تعداد نمونه کمتر از حد نصاب آماری (${minSample}) است.` : null,
  };
}
export function estimatePropertyValueRangeFromComparables(params: {
  subject: { propertyId: string; hoodId: number; districtId: number; propertyType: 'APARTMENT' | 'VILLA' | 'COMMERCIAL'; areaSqm: number; ageYears: number; bedrooms: number };
  candidates: readonly AnalyticalObservationRecord[];
  excludedObservationIds?: readonly string[];
}) {
  const { subject, candidates, excludedObservationIds = [] } = params;
  const disclaimer = 'این برآورد صرفاً یک بازه تحلیلی مبتنی بر داده‌های مشابه بازار است و کارشناسی رسمی دادگستری محسوب نمی‌شود.';
  if (subject.areaSqm < 25 || subject.areaSqm > 1200) {
    return { status: 'INSUFFICIENT_DATA_OR_OOD' as const, comparables: [], estimatedRangeToman: null, confidenceLevel: 'LOW' as const, modelVersion: 'val-range-v2.1', nonAppraisalDisclaimerFa: disclaimer };
  }
  const seenProps = new Set<string>();
  const scored: Array<{ observationId: string; propertyId: string; priceBasis: 'ASKING_LISTING' | 'CONFIRMED_TRANSACTION'; similarityScore0To100: number; adjustedPerSqmToman: number; selectionReasonsFa: string[] }> = [];
  for (const c of candidates) {
    if (c.propertyId === subject.propertyId || excludedObservationIds.includes(c.observationId) || c.propertyType !== subject.propertyType || c.districtId !== subject.districtId || seenProps.has(c.propertyId)) continue;
    const areaDiffRatio = Math.abs(c.areaSqm - subject.areaSqm) / subject.areaSqm;
    if (areaDiffRatio > 0.35) continue;
    seenProps.add(c.propertyId);
    let score = 50 + (c.hoodId === subject.hoodId ? 25 : 10) + Math.round((1 - areaDiffRatio) * 15);
    const reasons = [c.hoodId === subject.hoodId ? 'هم‌محله با ملک هدف' : 'هم‌منطقه با ملک هدف', `نزدیکی متراژ (${c.areaSqm} مترمربع)`];
    if (Math.abs(c.ageYears - subject.ageYears) <= 3) {
      score += 10;
      reasons.push(`سن بنای مشابه (${c.ageYears} سال)`);
    }
    const adjustedPerSqmToman = Math.round((c.totalPriceToman / c.areaSqm) * (1 + (c.ageYears - subject.ageYears) * 0.008));
    scored.push({ observationId: c.observationId, propertyId: c.propertyId, priceBasis: c.priceBasis, similarityScore0To100: Math.min(100, score), adjustedPerSqmToman, selectionReasonsFa: reasons });
  }
  scored.sort((a, b) => b.similarityScore0To100 - a.similarityScore0To100);
  const topComps = scored.slice(0, 5);
  if (topComps.length < 2) {
    return { status: 'INSUFFICIENT_DATA_OR_OOD' as const, comparables: topComps, estimatedRangeToman: null, confidenceLevel: 'LOW' as const, modelVersion: 'val-range-v2.1', nonAppraisalDisclaimerFa: disclaimer };
  }
  const avgPerSqm = topComps.reduce((s, x) => s + x.adjustedPerSqmToman, 0) / topComps.length;
  const midToman = Math.round((avgPerSqm * subject.areaSqm) / 1_000_000) * 1_000_000;
  const bandPct = topComps.length >= 4 ? 0.06 : 0.1;
  return {
    status: 'ESTIMATED_RANGE' as const,
    comparables: topComps,
    estimatedRangeToman: {
      lowToman: Math.round((midToman * (1 - bandPct)) / 1_000_000) * 1_000_000,
      midToman,
      highToman: Math.round((midToman * (1 + bandPct)) / 1_000_000) * 1_000_000,
    },
    confidenceLevel: (topComps.length >= 4 ? 'HIGH' : 'MEDIUM') as 'HIGH' | 'MEDIUM',
    modelVersion: 'val-range-v2.1',
    nonAppraisalDisclaimerFa: disclaimer,
  };
}
export interface InvestmentSimulationInput {
  purchasePriceToman: number;
  acquisitionCostsToman: number;
  monthlyGrossRentToman: number;
  vacancyRatePercent: number;
  annualOperatingExpensesToman: number;
  annualCapexReserveToman: number;
  annualDebtServiceToman: number;
  equityInvestedToman: number;
  randomSeed: number;
}
export function runInvestmentCashFlowBreakEvenAndMonteCarlo(input: InvestmentSimulationInput) {
  const totalAcquisitionCostToman = Math.max(1, input.purchasePriceToman + Math.max(0, input.acquisitionCostsToman));
  const annualPotentialRent = Math.max(0, input.monthlyGrossRentToman) * 12;
  const clampedVacancy = Math.min(100, Math.max(0, input.vacancyRatePercent));
  const effectiveGrossIncome = annualPotentialRent * (1 - clampedVacancy / 100);
  const fixedOutflows = Math.max(0, input.annualOperatingExpensesToman) + Math.max(0, input.annualCapexReserveToman);
  const annualNetOperatingIncomeToman = Math.round(effectiveGrossIncome - fixedOutflows);
  const annualPreTaxCashFlowToman = Math.round(annualNetOperatingIncomeToman - Math.max(0, input.annualDebtServiceToman));
  const grossRentalYieldPercent = Number(((annualPotentialRent / totalAcquisitionCostToman) * 100).toFixed(2));
  const netRentalYieldPercent = Number(((annualNetOperatingIncomeToman / totalAcquisitionCostToman) * 100).toFixed(2));
  const cashOnCashReturnPercent = input.equityInvestedToman > 0 ? Number(((annualPreTaxCashFlowToman / input.equityInvestedToman) * 100).toFixed(2)) : 0;
  const totalAnnualRequiredOutflow = fixedOutflows + Math.max(0, input.annualDebtServiceToman);
  const breakEvenOccupancyPercent = annualPotentialRent > 0 ? Number(Math.min(100, (totalAnnualRequiredOutflow / annualPotentialRent) * 100).toFixed(1)) : null;
  const paybackYearsNominal = annualPreTaxCashFlowToman > 0 ? Number((totalAcquisitionCostToman / annualPreTaxCashFlowToman).toFixed(1)) : null;
  const consEffective = annualPotentialRent * 0.95 * (1 - Math.min(100, clampedVacancy + 5) / 100);
  const conservativeAnnualCashFlowToman = Math.round(consEffective - fixedOutflows * 1.15 - Math.max(0, input.annualDebtServiceToman));
  const optEffective = annualPotentialRent * 1.08 * (1 - Math.max(0, clampedVacancy - 3) / 100);
  const optimisticAnnualCashFlowToman = Math.round(optEffective - fixedOutflows * 0.95 - Math.max(0, input.annualDebtServiceToman));
  let s = input.randomSeed >>> 0;
  const nextRand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const simCount = 200;
  const yields: number[] = [];
  for (let i = 0; i < simCount; i++) {
    const rentFactor = 0.88 + nextRand() * 0.24;
    const vacSim = Math.min(45, Math.max(0, clampedVacancy + (nextRand() - 0.5) * 14));
    const expFactor = 0.9 + nextRand() * 0.3;
    const noiSim = annualPotentialRent * rentFactor * (1 - vacSim / 100) - fixedOutflows * expFactor;
    yields.push(Number(((noiSim / totalAcquisitionCostToman) * 100).toFixed(2)));
  }
  yields.sort((a, b) => a - b);
  return {
    totalAcquisitionCostToman,
    grossRentalYieldPercent,
    netRentalYieldPercent,
    annualNetOperatingIncomeToman,
    annualPreTaxCashFlowToman,
    cashOnCashReturnPercent,
    breakEvenOccupancyPercent,
    paybackYearsNominal,
    scenarios: { baseAnnualCashFlowToman: annualPreTaxCashFlowToman, conservativeAnnualCashFlowToman, optimisticAnnualCashFlowToman },
    monteCarloNetYieldPercentiles: {
      simulationCount: simCount,
      seed: input.randomSeed,
      p10Percent: yields[Math.floor(simCount * 0.1)],
      p50Percent: yields[Math.floor(simCount * 0.5)],
      p90Percent: yields[Math.floor(simCount * 0.9)],
    },
  };
}
export function evaluatePortfolioConcentrationVacancyAndDelinquency(params: {
  assets: ReadonlyArray<{ assetId: string; districtId: number; propertyType: string; estimatedValueToman: number; ownershipSharePercent: number; occupiedDays: number; marketVacantDays: number; plannedRenovationDays: number }>;
  rentObligations: ReadonlyArray<{ obligationId: string; dueAmountToman: number; receivedAmountToman: number; daysPastDue: number; status: 'NORMAL' | 'DISPUTED' | 'WAIVED' }>;
}) {
  let totalVal = 0;
  const byDistrict = new Map<number, number>();
  let totalOccupied = 0;
  let totalMarketVacant = 0;
  for (const a of params.assets) {
    const share = Math.min(100, Math.max(0, a.ownershipSharePercent)) / 100;
    const weightedVal = Math.max(0, a.estimatedValueToman) * share;
    totalVal += weightedVal;
    byDistrict.set(a.districtId, (byDistrict.get(a.districtId) || 0) + weightedVal);
    totalOccupied += Math.max(0, a.occupiedDays);
    totalMarketVacant += Math.max(0, a.marketVacantDays);
  }
  let maxDistrictVal = 0;
  let hhi = 0;
  if (totalVal > 0) {
    for (const v of byDistrict.values()) {
      if (v > maxDistrictVal) maxDistrictVal = v;
      const s = v / totalVal;
      hhi += s * s;
    }
  }
  const availableDays = totalOccupied + totalMarketVacant;
  const marketVacancyRatePercent = availableDays > 0 ? Number(((totalMarketVacant / availableDays) * 100).toFixed(2)) : 0;
  let overdueRentTotalToman = 0;
  const buckets = { days1To30Toman: 0, days31To90Toman: 0, days90PlusToman: 0 };
  for (const ob of params.rentObligations) {
    if (ob.status === 'WAIVED' || ob.status === 'DISPUTED') continue;
    const unpaid = Math.max(0, ob.dueAmountToman - ob.receivedAmountToman);
    if (unpaid > 0 && ob.daysPastDue > 0) {
      overdueRentTotalToman += unpaid;
      if (ob.daysPastDue <= 30) buckets.days1To30Toman += unpaid;
      else if (ob.daysPastDue <= 90) buckets.days31To90Toman += unpaid;
      else buckets.days90PlusToman += unpaid;
    }
  }
  return {
    totalWeightedPortfolioValueToman: Math.round(totalVal),
    topDistrictSharePercent: totalVal > 0 ? Number(((maxDistrictVal / totalVal) * 100).toFixed(1)) : 0,
    herfindahlConcentrationIndex0To1: Number(hhi.toFixed(3)),
    marketVacancyRatePercent,
    overdueRentTotalToman,
    delinquencyAgingBuckets: buckets,
  };
}
export function evaluateChronologicalForecastAndRisk(params: {
  chronologicalMonthlyPerSqmToman: readonly number[];
  cpiIndexSeries: readonly number[];
  hasVerifiedTitleDeed: boolean;
  vacancyRatePercent: number;
  concentrationSharePercent: number;
}) {
  const series = params.chronologicalMonthlyPerSqmToman;
  const cpi = params.cpiIndexSeries;
  let inflationAdjustedGrowthPercent: number | null = null;
  if (series.length >= 2 && cpi.length === series.length && cpi[0] > 0 && cpi[cpi.length - 1] > 0) {
    const realStart = series[0] / cpi[0];
    const realEnd = series[series.length - 1] / cpi[cpi.length - 1];
    inflationAdjustedGrowthPercent = Number((((realEnd - realStart) / realStart) * 100).toFixed(2));
  }
  let forecastAllowed = false;
  let nextPeriodForecastToman: number | null = null;
  let uncertaintyIntervalToman: { low: number; high: number } | null = null;
  let backtestMapePercent: number | null = null;
  if (series.length >= 6) {
    forecastAllowed = true;
    const n = series.length;
    nextPeriodForecastToman = Math.round(series[n - 1] + (series[n - 1] - series[n - 4]) / 3);
    let apeSum = 0;
    for (let i = n - 3; i < n; i++) {
      const pred = series[i - 1] + (series[i - 1] - series[i - 2]);
      apeSum += Math.abs(series[i] - pred) / Math.max(1, series[i]);
    }
    backtestMapePercent = Number(((apeSum / 3) * 100).toFixed(2));
    const margin = Math.round(nextPeriodForecastToman * Math.max(0.04, (backtestMapePercent / 100) * 1.5));
    uncertaintyIntervalToman = { low: nextPeriodForecastToman - margin, high: nextPeriodForecastToman + margin };
  }
  const riskComponents = [
    { dimensionFa: 'ریسک مدارک و اسناد مالکیت', score0To100: params.hasVerifiedTitleDeed ? 15 : 75, weight: 0.35 },
    { dimensionFa: 'ریسک خالی‌ماندن ملک (Vacancy)', score0To100: Math.min(100, Math.round(params.vacancyRatePercent * 2.5)), weight: 0.3 },
    { dimensionFa: 'ریسک تمرکز جغرافیایی سبد', score0To100: Math.min(100, Math.round(params.concentrationSharePercent)), weight: 0.35 },
  ];
  const decomposableRiskScore0To100 = Math.round(riskComponents.reduce((acc, c) => acc + c.score0To100 * c.weight, 0));
  return { forecastAllowed, nextPeriodForecastToman, uncertaintyIntervalToman, backtestMapePercent, inflationAdjustedGrowthPercent, decomposableRiskScore0To100, riskComponents };
}