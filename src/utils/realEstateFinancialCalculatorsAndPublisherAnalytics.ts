import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export const FINANCIAL_FORMULA_VERSION = '2026.109.1'; export interface RentalYieldInput { acquisitionPrice: number; initialDepositRahn?: number; monthlyRentIncome: number; acquisitionExpenses?: number; annualOperatingExpenses?: number; annualMaintenanceExpenses?: number; vacancyRatePercent?: number; rahnAnnualImputedRatePercent?: number; areaUnit?: AreaUnit; referenceCurrency?: IntlCurrencyCode; }
export interface RentalYieldResult { valid: boolean; error?: string; formulaVersion: string; totalInitialInvestment: number; annualGrossRentalIncome: number; effectiveGrossIncome: number; annualOperatingExpensesTotal: number; netOperatingIncome: number; grossRentalYieldPercent: number; netRentalYieldPercent: number; displayAreaUnitLabel?: string; totalInitialInvestmentIntlText?: string; netOperatingIncomeIntlText?: string; }
export function calculateRentalPropertyYield(input: RentalYieldInput): RentalYieldResult { const acquisitionPrice = Number(input.acquisitionPrice); const monthlyRent = Number(input.monthlyRentIncome); const depositRahn = Number(input.initialDepositRahn ?? 0); const acqExpenses = Number(input.acquisitionExpenses ?? 0); const opEx = Number(input.annualOperatingExpenses ?? 0); const maintEx = Number(input.annualMaintenanceExpenses ?? 0); const vacancyPct = Number(input.vacancyRatePercent ?? 0); const rahnRatePct = Number(input.rahnAnnualImputedRatePercent ?? 0); const displayAreaUnitLabel = formatAreaUnitLabel(input.areaUnit ?? getStoredAreaUnit()); const curr = input.referenceCurrency ?? getStoredIntlCurrency(); if ( !Number.isFinite(acquisitionPrice) || acquisitionPrice <= 0 || !Number.isFinite(monthlyRent) || monthlyRent < 0 ||
    depositRahn < 0 || acqExpenses < 0 || opEx < 0 || maintEx < 0 || vacancyPct < 0 || vacancyPct > 100
  ) { return { valid: false, error: 'INVALID_FINANCIAL_INPUTS', formulaVersion: FINANCIAL_FORMULA_VERSION, totalInitialInvestment: 0, annualGrossRentalIncome: 0, effectiveGrossIncome: 0, annualOperatingExpensesTotal: 0, netOperatingIncome: 0, grossRentalYieldPercent: 0, netRentalYieldPercent: 0, displayAreaUnitLabel, totalInitialInvestmentIntlText: formatMillionTomanAsIntlCurrency(0, curr), netOperatingIncomeIntlText: formatMillionTomanAsIntlCurrency(0, curr) }; } const totalInitialInvestment = acquisitionPrice + acqExpenses; const imputedRahnAnnual = rahnRatePct > 0 ? depositRahn * (rahnRatePct / 100) : 0; const annualGrossRentalIncome = monthlyRent * 12 + imputedRahnAnnual; const effectiveGrossIncome = annualGrossRentalIncome * (1 - vacancyPct / 100); const annualOperatingExpensesTotal = opEx + maintEx; const netOperatingIncome = effectiveGrossIncome - annualOperatingExpensesTotal; const roundedInit = Math.round(totalInitialInvestment); const roundedNoi = Math.round(netOperatingIncome); return { valid: true, formulaVersion: FINANCIAL_FORMULA_VERSION, totalInitialInvestment: roundedInit,
    annualGrossRentalIncome: Math.round(annualGrossRentalIncome), effectiveGrossIncome: Math.round(effectiveGrossIncome), annualOperatingExpensesTotal: Math.round(annualOperatingExpensesTotal), netOperatingIncome: roundedNoi, grossRentalYieldPercent: Number(((annualGrossRentalIncome / acquisitionPrice) * 100).toFixed(2)), netRentalYieldPercent: Number(((netOperatingIncome / totalInitialInvestment) * 100).toFixed(2)), displayAreaUnitLabel, totalInitialInvestmentIntlText: formatMillionTomanAsIntlCurrency(roundedInit, curr), netOperatingIncomeIntlText: formatMillionTomanAsIntlCurrency(roundedNoi, curr) }; } export interface CashFlowPeriodRow { periodIndex: number;
  grossOperatingIncome: number; vacancyLoss: number; operatingExpenses: number; netOperatingIncome: number; financingPayment: number; netCashFlow: number; cumulativeCashFlow: number; } export function analyzePropertyInvestmentCashFlow(params: { initialCapitalOutlay: number; periodicGrossIncome: number; vacancyRatePercent: number;
  periodicOperatingExpenses: number; periodicFinancingPayment?: number; periodsCount: number; incomeGrowthRatePerPeriodPercent?: number; expenseGrowthRatePerPeriodPercent?: number; }) { const initialOutlay = Math.max(0, Number(params.initialCapitalOutlay) || 0); const baseIncome = Math.max(0, Number(params.periodicGrossIncome) || 0);
  const vacancyPct = Math.min(100, Math.max(0, Number(params.vacancyRatePercent) || 0)); const baseOpEx = Math.max(0, Number(params.periodicOperatingExpenses) || 0); const debtService = Math.max(0, Number(params.periodicFinancingPayment ?? 0) || 0); const periods = Math.min(360, Math.max(1, Math.floor(params.periodsCount || 1)));
  const incGrowth = Number(params.incomeGrowthRatePerPeriodPercent ?? 0) / 100; const expGrowth = Number(params.expenseGrowthRatePerPeriodPercent ?? 0) / 100; const rows: CashFlowPeriodRow[] = []; let cumulative = -initialOutlay;
  let totalNoi = 0; let totalNetCf = 0; for (let i = 1; i <= periods; i++) { const grossOperatingIncome = Math.round(baseIncome * Math.pow(1 + incGrowth, i - 1)); const vacancyLoss = Math.round(grossOperatingIncome * (vacancyPct / 100)); const operatingExpenses = Math.round(baseOpEx * Math.pow(1 + expGrowth, i - 1));
    const netOperatingIncome = grossOperatingIncome - vacancyLoss - operatingExpenses; const netCashFlow = netOperatingIncome - debtService;
    cumulative += netCashFlow; totalNoi += netOperatingIncome;
    totalNetCf += netCashFlow;
    rows.push({
      periodIndex: i, grossOperatingIncome, vacancyLoss, operatingExpenses,
      netOperatingIncome, financingPayment: debtService, netCashFlow, cumulativeCashFlow: cumulative, });
  }
  return {
    initialCapitalOutlay: initialOutlay, rows,
    totalNetOperatingIncome: totalNoi, totalNetCashFlow: totalNetCf, endingCumulativeCashFlow: cumulative,
  };
}
export function calculatePurchaseAffordabilityBudget(params: {
  availableCashCapital: number;
  reserveBufferCash?: number;
  maxLoanAmount?: number;
  transactionCostPercent?: number;
  fixedClosingFee?: number;
}) {
  const cash = Number(params.availableCashCapital);
  const reserve = Math.max(0, Number(params.reserveBufferCash ?? 0));
  const loan = Math.max(0, Number(params.maxLoanAmount ?? 0));
  const txPct = Math.max(0, Number(params.transactionCostPercent ?? 1.5));
  const fixedFee = Math.max(0, Number(params.fixedClosingFee ?? 0));
  const disclaimer = 'برآورد تقریبی بر اساس ورودی کاربر؛ تایید وام بانکی لحاظ نشده است.';
  if (!Number.isFinite(cash) || cash <= reserve + fixedFee) {
    return {
      valid: false, maxAffordablePropertyPrice: 0, estimatedAcquisitionCosts: 0,
      requiredFinancingAmount: 0, remainingCashReserve: Math.max(0, cash), disclaimer,
    };
  }
  const deployableCapital = cash - reserve + loan - fixedFee;
  const maxAffordablePropertyPrice = Math.floor(deployableCapital / (1 + txPct / 100));
  const estimatedAcquisitionCosts = Math.round(maxAffordablePropertyPrice * (txPct / 100) + fixedFee);
  return {
    valid: true, maxAffordablePropertyPrice, estimatedAcquisitionCosts,
    requiredFinancingAmount: loan, remainingCashReserve: reserve, disclaimer,
  };
}
export function compareRentVersusBuyScenarios(params: {
  horizonYears: number; buyPropertyPrice: number; buyAcquisitionCostPercent: number; buyAnnualMaintenanceCost: number;
  buyAssumedAnnualAppreciationPercent: number; rentInitialDepositRahn: number; rentInitialMonthlyPayment: number; rentAssumedAnnualIncreasePercent: number;
}) {
  const years = Math.min(30, Math.max(1, Math.floor(params.horizonYears || 1)));
  const price = Number.isFinite(params.buyPropertyPrice) && params.buyPropertyPrice >= 0 ? params.buyPropertyPrice : 0;
  const acqPct = Number.isFinite(params.buyAcquisitionCostPercent) && params.buyAcquisitionCostPercent >= 0 ? params.buyAcquisitionCostPercent : 0;
  const acqCost = Math.round(price * (acqPct / 100));
  const buyInitialCapitalCommitted = price + acqCost;
  const maint = Number.isFinite(params.buyAnnualMaintenanceCost) && params.buyAnnualMaintenanceCost >= 0 ? params.buyAnnualMaintenanceCost : 0;
  const buyCumulativeMaintenanceCost = Math.round(maint * years);
  const apprecRate = Number.isFinite(params.buyAssumedAnnualAppreciationPercent) ? params.buyAssumedAnnualAppreciationPercent : 0;
  const buyHypotheticalResaleValue = Math.round(price * Math.pow(1 + apprecRate / 100, years));
  const buyNetWealthChangeNominal = buyHypotheticalResaleValue - buyInitialCapitalCommitted - buyCumulativeMaintenanceCost;
  const initRent = Number.isFinite(params.rentInitialMonthlyPayment) && params.rentInitialMonthlyPayment >= 0 ? params.rentInitialMonthlyPayment : 0;
  const rentIncRate = Number.isFinite(params.rentAssumedAnnualIncreasePercent) ? params.rentAssumedAnnualIncreasePercent : 0;
  let rentTotalOutOfPocketPayments = 0;
  for (let y = 0; y < years; y++) {
    rentTotalOutOfPocketPayments += Math.round(initRent * Math.pow(1 + rentIncRate / 100, y) * 12);
  }
  const rentDeposit = Number.isFinite(params.rentInitialDepositRahn) && params.rentInitialDepositRahn >= 0 ? params.rentInitialDepositRahn : 0;
  return {
    horizonYears: years, rentTotalOutOfPocketPayments, rentRefundableDepositNominal: rentDeposit,
    buyInitialCapitalCommitted, buyCumulativeMaintenanceCost, buyHypotheticalResaleValue, buyNetWealthChangeNominal,
    netBuyAdvantageOverRentNominal: buyNetWealthChangeNominal + rentTotalOutOfPocketPayments,
  };
}
export function runInvestmentSensitivityGrid(
  baseInput: RentalYieldInput,
  rentDeltaPercents: number[],
  vacancyRatePoints: number[]
) {
  const cells: Array<{
    rentDeltaPercent: number;
    vacancyRatePercent: number;
    isBaseline: boolean;
    netRentalYieldPercent: number;
    netOperatingIncome: number;
  }> = [];
  for (const rDelta of rentDeltaPercents.slice(0, 7)) {
    for (const vac of vacancyRatePoints.slice(0, 7)) {
      const res = calculateRentalPropertyYield({
        ...baseInput,
        monthlyRentIncome: baseInput.monthlyRentIncome * (1 + rDelta / 100),
        vacancyRatePercent: vac,
      });
      cells.push({
        rentDeltaPercent: rDelta,
        vacancyRatePercent: vac,
        isBaseline: rDelta === 0 && vac === (baseInput.vacancyRatePercent ?? 0),
        netRentalYieldPercent: res.netRentalYieldPercent,
        netOperatingIncome: res.netOperatingIncome,
      });
    }
  }
  return cells;
}
export function calculateNetPresentValueAndIrr(
  cashFlows: number[],
  periodicDiscountRatePercent: number
): {
  npv: number;
  irrPercent: number | null;
  irrStatus: 'converged' | 'no_sign_change' | 'multiple_sign_changes' | 'non_convergent';
} {
  const r = (Number.isFinite(periodicDiscountRatePercent) ? periodicDiscountRatePercent : 0) / 100;
  const validCfs = cashFlows.filter((cf) => Number.isFinite(cf));
  let npv = 0;
  for (let t = 0; t < validCfs.length; t++) npv += validCfs[t] / Math.pow(Math.max(0.01, 1 + r), t);
  npv = Math.round(npv);
  let signChanges = 0;
  let prevSign = 0;
  for (const cf of validCfs) {
    const sign = cf > 0 ? 1 : cf < 0 ? -1 : 0;
    if (sign !== 0) {
      if (prevSign !== 0 && sign !== prevSign) signChanges++;
      prevSign = sign;
    }
  }
  if (signChanges === 0) return { npv, irrPercent: null, irrStatus: 'no_sign_change' };
  if (signChanges > 1) return { npv, irrPercent: null, irrStatus: 'multiple_sign_changes' };
  const evalNpv = (rate: number) =>
    validCfs.reduce((sum, cf, t) => sum + cf / Math.pow(Math.max(0.01, 1 + rate), t), 0);
  let low = -0.95;
  let high = 10.0;
  let fLow = evalNpv(low);
  if (fLow * evalNpv(high) > 0) return { npv, irrPercent: null, irrStatus: 'non_convergent' };
  for (let iter = 0; iter < 100; iter++) {
    const mid = (low + high) / 2;
    const fMid = evalNpv(mid);
    if (Math.abs(fMid) < 1e-4 || (high - low) / 2 < 1e-6) {
      return { npv, irrPercent: Number((mid * 100).toFixed(2)), irrStatus: 'converged' };
    }
    if (fLow * fMid <= 0) high = mid;
    else { low = mid; fLow = fMid; }
  }
  return { npv, irrPercent: null, irrStatus: 'non_convergent' };
}
export function modelPropertyAppreciationScenarios(params: {
  initialPropertyValue: number;
  horizonYears: number;
  annualGrowthRatePercent: number;
  mode: 'compound' | 'simple';
}) {
  const base = Math.max(0, params.initialPropertyValue);
  const years = Math.min(30, Math.max(1, Math.floor(params.horizonYears)));
  const rate = params.annualGrowthRatePercent / 100;
  const yearlySchedule = Array.from({ length: years }, (_, i) => {
    const y = i + 1;
    const projectedValue = params.mode === 'compound'
      ? Math.round(base * Math.pow(1 + rate, y))
      : Math.round(base * (1 + rate * y));
    return { year: y, projectedValue };
  });
  const projectedNominalValue = yearlySchedule[yearlySchedule.length - 1]?.projectedValue ?? base;
  const cumulativeNominalGain = projectedNominalValue - base;
  return {
    isHypotheticalScenario: true as const,
    initialPropertyValue: base,
    projectedNominalValue,
    cumulativeNominalGain,
    cumulativeGrowthPercent: base > 0 ? Number(((cumulativeNominalGain / base) * 100).toFixed(2)) : 0,
    yearlySchedule,
  };
}
export function calculateTransactionAndRenovationBudget(params: {
  propertyPrice: number;
  agencyFeePercent: number;
  vatOnAgencyPercent: number;
  transferTaxPercent: number;
  notaryFixedFee: number;
  renovationItems: Array<{ category: string; areaOrQty: number; unitCost: number }>;
  contingencyPercent: number;
}) {
  const price = Math.max(0, params.propertyPrice);
  const agencyCommission = Math.round(price * (Math.max(0, params.agencyFeePercent) / 100));
  const vatOnCommission = Math.round(agencyCommission * (Math.max(0, params.vatOnAgencyPercent) / 100));
  const transferTax = Math.round(price * (Math.max(0, params.transferTaxPercent) / 100));
  const notaryFixedFee = Math.round(Math.max(0, params.notaryFixedFee));
  const totalTransactionCosts = agencyCommission + vatOnCommission + transferTax + notaryFixedFee;
  let renovationBaseSubtotal = 0;
  for (const item of params.renovationItems) {
    if (item.areaOrQty > 0 && item.unitCost >= 0) {
      renovationBaseSubtotal += Math.round(item.areaOrQty * item.unitCost);
    }
  }
  const renovationContingencyReserve = Math.round(
    renovationBaseSubtotal * (Math.max(0, params.contingencyPercent) / 100)
  );
  const totalRenovationBudget = renovationBaseSubtotal + renovationContingencyReserve;
  return {
    agencyCommission, vatOnCommission, transferTax, notaryFixedFee, totalTransactionCosts,
    renovationBaseSubtotal, renovationContingencyReserve, totalRenovationBudget,
    grandTotalUpfrontCapital: price + totalTransactionCosts + totalRenovationBudget,
  };
}
export function calculateInvestmentBreakEvenPeriod(
  initialOutlay: number,
  periodicNetCashFlows: number[]
): {
  status: 'reached' | 'never_reached' | 'invalid_initial_outlay';
  breakEvenPeriodIndex: number | null;
  cumulativeSeries: number[];
} {
  if (!Number.isFinite(initialOutlay) || initialOutlay <= 0) {
    return { status: 'invalid_initial_outlay', breakEvenPeriodIndex: null, cumulativeSeries: [] };
  }
  let cumulative = -initialOutlay;
  let breakEvenPeriodIndex: number | null = null;
  const cumulativeSeries: number[] = [];
  for (let i = 0; i < periodicNetCashFlows.length; i++) {
    cumulative += periodicNetCashFlows[i];
    cumulativeSeries.push(cumulative);
    if (breakEvenPeriodIndex === null && cumulative >= 0) breakEvenPeriodIndex = i + 1;
  }
  return {
    status: breakEvenPeriodIndex !== null ? 'reached' : 'never_reached',
    breakEvenPeriodIndex,
    cumulativeSeries,
  };
}
export function computePublisherAnalyticsAndComparePeriods(params: {
  currentPeriodViews: number;
  currentPeriodUniqueViewers: number;
  currentPeriodInquiries: number;
  previousPeriodViews: number;
  previousPeriodInquiries: number;
  inquiryTimestamps: Array<{ createdAtMs: number; firstRespondedAtMs: number | null }>;
}) {
  const views = Math.max(0, params.currentPeriodViews);
  const inquiries = Math.max(0, params.currentPeriodInquiries);
  const conversionRatePercent = views > 0 ? Number(((inquiries / views) * 100).toFixed(2)) : null;
  const responseMinutes: number[] = [];
  let unansweredCount = 0;
  for (const item of params.inquiryTimestamps) {
    if (item.firstRespondedAtMs === null) unansweredCount++;
    else if (item.firstRespondedAtMs >= item.createdAtMs) {
      responseMinutes.push((item.firstRespondedAtMs - item.createdAtMs) / 60_000);
    }
  }
  responseMinutes.sort((a, b) => a - b);
  const medianFirstResponseMinutes = responseMinutes.length > 0
    ? Number(responseMinutes[Math.floor(responseMinutes.length / 2)].toFixed(1)) : null;
  const p90FirstResponseMinutes = responseMinutes.length > 0
    ? Number(responseMinutes[Math.min(responseMinutes.length - 1, Math.floor(responseMinutes.length * 0.9))].toFixed(1)) : null;
  const viewsDeltaAbsolute = views - Math.max(0, params.previousPeriodViews);
  const viewsDeltaPercent = params.previousPeriodViews > 0
    ? Number(((viewsDeltaAbsolute / params.previousPeriodViews) * 100).toFixed(2)) : null;
  return {
    conversionRatePercent, conversionRateReliable: views >= 20,
    medianFirstResponseMinutes, p90FirstResponseMinutes, unansweredCount,
    viewsDeltaAbsolute, viewsDeltaPercent,
    inquiriesDeltaAbsolute: inquiries - Math.max(0, params.previousPeriodInquiries),
  };
}
export function inspectListingContentAndMediaQuality(params: {
  title: string;
  description: string;
  price: number;
  areaSqm: number;
  neighborhoodId: string;
  mediaItems: Array<{ id: string; width: number; height: number; fileSizeBytes: number; isCover?: boolean }>;
}) {
  const blockingMissingFields: string[] = [];
  const recommendedImprovements: string[] = [];
  if (!params.title || params.title.trim().length < 5) blockingMissingFields.push('title');
  if (!Number.isFinite(params.price) || params.price <= 0) blockingMissingFields.push('price');
  if (!Number.isFinite(params.areaSqm) || params.areaSqm <= 0) blockingMissingFields.push('areaSqm');
  if (!params.neighborhoodId) blockingMissingFields.push('neighborhoodId'); if (!params.description || params.description.trim().length < 40) recommendedImprovements.push('ADD_DETAILED_PROPERTY_DESCRIPTION'); if (params.mediaItems.length === 0) recommendedImprovements.push('UPLOAD_PROPERTY_PHOTOS'); const lowResolutionMediaIds = params.mediaItems.filter((m) => m.width < 800 || m.height < 600).map((m) => m.id); if (lowResolutionMediaIds.length > 0) recommendedImprovements.push('REPLACE_LOW_RESOLUTION_IMAGES'); const explicitCover = params.mediaItems.find((m) => m.isCover); const primaryCoverMediaId = explicitCover?.id ?? params.mediaItems[0]?.id ?? null; const orderedMediaIds = primaryCoverMediaId
    ? [primaryCoverMediaId, ...params.mediaItems.filter((m) => m.id !== primaryCoverMediaId).map((m) => m.id)]
    : []; return { readyForPublication: blockingMissingFields.length === 0, blockingMissingFields, recommendedImprovements, primaryCoverMediaId, orderedMediaIds, lowResolutionMediaIds, }; }