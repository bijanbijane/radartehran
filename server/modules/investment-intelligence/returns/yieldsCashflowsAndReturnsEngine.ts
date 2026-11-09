import crypto from 'crypto';
import type {
  AggregatedRentalOccupancySummary,
  AuthoritativePropertyValuationSnapshot,
  NormalizedTimestamp,
  SupportedCurrencyCode,
} from '../contracts/externalAdapters';
import type {
  CashFlowAnalysisResult,
  DatedCashFlowPoint,
  InvestmentAssetRecord,
  InvestmentFinancialEntryRecord,
  InvestmentScenarioRecord,
  PeriodCashFlowSummary,
  PropertyValueBasisType,
  RentalYieldAnalysisResult,
  ReturnOnInvestmentAnalysisResult,
} from '../domain/types';
import { CURRENT_INVESTMENT_METHODOLOGY_VERSION } from '../methodologies/methodologyRegistry';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Section 8: Explainable Rental Yield Analysis
 */
export function calculateRentalYieldAnalysis(params: {
  asset: InvestmentAssetRecord;
  entries: InvestmentFinancialEntryRecord[];
  pmSummary: AggregatedRentalOccupancySummary | null;
  valuation: AuthoritativePropertyValuationSnapshot | null;
  periodStartIso: string;
  periodEndIso: string;
  preferredValueBasis: PropertyValueBasisType;
  nowTs: NormalizedTimestamp;
}): RentalYieldAnalysisResult {
  const analysisId = `yld_${crypto.randomBytes(6).toString('hex')}`;
  const startMs = Date.parse(params.periodStartIso);
  const endMs = Date.parse(params.periodEndIso);
  const rawPeriodDays = Math.max(1, Math.round((endMs - startMs) / 86_400_000));

  const observedDays = params.pmSummary?.totalDaysInPeriod ?? rawPeriodDays;
  const vacantDays = params.pmSummary?.vacantDaysInPeriod ?? 0;
  const occupiedDays = params.pmSummary
    ? params.pmSummary.occupiedDaysInPeriod
    : Math.max(0, observedDays - vacantDays);

  const annualizationFactor = round2(365 / Math.max(1, observedDays));

  // Filter entries matching asset currency and within period
  const periodEntries = params.entries.filter(
    (e) =>
      e.currency === params.asset.acquisitionCurrency &&
      e.provenance.calculationInclusionStatus === 'INCLUDED' &&
      Date.parse(e.periodEndIso) >= startMs &&
      Date.parse(e.periodStartIso) <= endMs,
  );

  const entryRentalIncome = periodEntries
    .filter((e) => e.majorClass === 'OPERATING_INCOME')
    .reduce((sum, e) => sum + e.amount, 0);

  const pmConfirmedRent =
    params.pmSummary && params.pmSummary.currency === params.asset.acquisitionCurrency
      ? params.pmSummary.authoritativelyConfirmedCollectedRentTotal
      : 0;

  // Avoid double counting: if PM summary provides confirmed rent, add only non-PM income entries
  const nonPmIncomeEntries = periodEntries
    .filter(
      (e) =>
        e.majorClass === 'OPERATING_INCOME' && e.provenance.sourceModule !== 'PROPERTY_MANAGEMENT',
    )
    .reduce((sum, e) => sum + e.amount, 0);

  const totalObservedIncome =
    params.pmSummary && pmConfirmedRent > 0
      ? round2(pmConfirmedRent + nonPmIncomeEntries)
      : entryRentalIncome > 0
        ? round2(entryRentalIncome)
        : occupiedDays === 0 && vacantDays > 0
          ? 0
          : null;

  const nonPmOpEx = periodEntries
    .filter(
      (e) =>
        e.majorClass === 'OPERATING_EXPENSE' && e.provenance.sourceModule !== 'PROPERTY_MANAGEMENT',
    )
    .reduce((sum, e) => sum + e.amount, 0);

  const pmOpEx =
    params.pmSummary && params.pmSummary.currency === params.asset.acquisitionCurrency
      ? params.pmSummary.documentedManagementExpensesTotal +
        params.pmSummary.documentedMaintenanceExpensesTotal
      : 0;

  const observedOperatingExpenses = round2(nonPmOpEx + pmOpEx);
  const annualizedOperatingExpenses = round2(observedOperatingExpenses * annualizationFactor);

  const annualizedGrossRentalIncome =
    totalObservedIncome !== null ? round2(totalObservedIncome * annualizationFactor) : null;
  const annualizedNetOperatingIncome =
    annualizedGrossRentalIncome !== null
      ? round2(annualizedGrossRentalIncome - annualizedOperatingExpenses)
      : null;

  const acquisitionCostBasisTotal =
    typeof params.asset.acquisitionPrice === 'number' && params.asset.acquisitionPrice > 0
      ? round2(
          params.asset.acquisitionPrice +
            (params.asset.initialTransactionCostEstimate ?? 0) +
            (params.asset.initialRenovationCostEstimate ?? 0),
        )
      : null;

  const valuationValidAndFresh =
    params.valuation &&
    !params.valuation.isStale &&
    params.valuation.currency === params.asset.acquisitionCurrency &&
    params.valuation.estimatedMarketValue > 0;

  const currentEstimatedValue = valuationValidAndFresh
    ? params.valuation!.estimatedMarketValue
    : null;

  const grossRentalYieldOnAcquisitionCostPct =
    annualizedGrossRentalIncome !== null &&
    acquisitionCostBasisTotal !== null &&
    acquisitionCostBasisTotal > 0
      ? round2((annualizedGrossRentalIncome / acquisitionCostBasisTotal) * 100)
      : null;

  const netRentalYieldOnAcquisitionCostPct =
    annualizedNetOperatingIncome !== null &&
    acquisitionCostBasisTotal !== null &&
    acquisitionCostBasisTotal > 0
      ? round2((annualizedNetOperatingIncome / acquisitionCostBasisTotal) * 100)
      : null;

  const grossRentalYieldOnCurrentValuationPct =
    annualizedGrossRentalIncome !== null &&
    currentEstimatedValue !== null &&
    currentEstimatedValue > 0
      ? round2((annualizedGrossRentalIncome / currentEstimatedValue) * 100)
      : null;

  const netRentalYieldOnCurrentValuationPct =
    annualizedNetOperatingIncome !== null &&
    currentEstimatedValue !== null &&
    currentEstimatedValue > 0
      ? round2((annualizedNetOperatingIncome / currentEstimatedValue) * 100)
      : null;

  const selectedBasisAvailable =
    params.preferredValueBasis === 'ORIGINAL_ACQUISITION_COST_BASIS'
      ? grossRentalYieldOnAcquisitionCostPct !== null
      : grossRentalYieldOnCurrentValuationPct !== null;

  return {
    analysisId,
    portfolioId: params.asset.portfolioId,
    investmentAssetId: params.asset.investmentAssetId,
    canonicalPropertyId: params.asset.canonicalPropertyId,
    periodStartIso: params.periodStartIso,
    periodEndIso: params.periodEndIso,
    observedDaysInPeriod: observedDays,
    occupiedDaysInPeriod: occupiedDays,
    vacantDaysInPeriod: vacantDays,
    annualizationFactorUsed: annualizationFactor,
    currency: params.asset.acquisitionCurrency,
    valueBasisUsed: params.preferredValueBasis,
    acquisitionCostBasisTotal,
    currentEstimatedValue,
    valuationRefId: params.valuation?.valuationId ?? null,
    valuationDateIso: params.valuation?.valuationDateIso ?? null,
    valuationMethodologyVersion: params.valuation?.methodologyVersion ?? null,
    valuationIsStale: params.valuation?.isStale ?? false,
    observedGrossRentalIncome: totalObservedIncome,
    annualizedGrossRentalIncome,
    observedOperatingExpenses,
    annualizedOperatingExpenses,
    annualizedNetOperatingIncome,
    grossRentalYieldOnAcquisitionCostPct,
    netRentalYieldOnAcquisitionCostPct,
    grossRentalYieldOnCurrentValuationPct,
    netRentalYieldOnCurrentValuationPct,
    excludedExpenseCategories: [
      'CAPITAL_EXPENDITURE',
      'FINANCING_COST_REFERENCE',
      'INVESTOR_INCOME_TAX',
    ],
    status: selectedBasisAvailable ? 'CALCULATED' : 'INSUFFICIENT_INCOME_OR_VALUE_BASIS',
    ...(!selectedBasisAvailable
      ? {
          statusReason:
            totalObservedIncome === null
              ? 'Rental income is missing for the period; yield cannot be fabricated.'
              : params.valuation?.isStale
                ? 'Current valuation estimate is stale and cannot be used as current value basis.'
                : 'Required property value basis is unavailable or zero.',
        }
      : {}),
    formulasUsed: {
      grossRentalYieldFormula: 'Annual gross rental income / Property value × 100',
      netOperatingYieldFormula: 'Annual net operating income / Property value × 100',
    },
    methodologyVersion: CURRENT_INVESTMENT_METHODOLOGY_VERSION,
    createdAt: params.nowTs,
  };
}

/**
 * Section 9: Historical and Projected Cash-Flow Analysis
 */
export function calculatePropertyCashFlowAnalysis(params: {
  portfolioId: string;
  investmentAssetId: string;
  baseCurrency: SupportedCurrencyCode;
  entries: InvestmentFinancialEntryRecord[];
  pmSummary: AggregatedRentalOccupancySummary | null;
  periodStartIso: string;
  periodEndIso: string;
  nowTs: NormalizedTimestamp;
}): CashFlowAnalysisResult {
  const cashFlowAnalysisId = `cf_${crypto.randomBytes(6).toString('hex')}`;
  const startMs = Date.parse(params.periodStartIso);
  const endMs = Date.parse(params.periodEndIso);

  const seenDedupKeys = new Set<string>();
  let duplicateEntriesExcludedCount = 0;
  let currencyMismatchesExcludedCount = 0;

  const validEntries: InvestmentFinancialEntryRecord[] = [];
  for (const entry of params.entries) {
    if (Date.parse(entry.periodEndIso) < startMs || Date.parse(entry.periodStartIso) > endMs) {
      continue;
    }
    if (entry.currency !== params.baseCurrency) {
      currencyMismatchesExcludedCount++;
      continue;
    }
    if (seenDedupKeys.has(entry.deduplicationKey)) {
      duplicateEntriesExcludedCount++;
      continue;
    }
    seenDedupKeys.add(entry.deduplicationKey);
    validEntries.push(entry);
  }

  function buildSummaryForSlice(
    slice: InvestmentFinancialEntryRecord[],
    periodKey: string,
    periodType: PeriodCashFlowSummary['periodType'],
    includePmSummary: boolean,
  ): PeriodCashFlowSummary {
    let confirmedRentalIncome = 0;
    let reportedUnverifiedRentalIncome = 0;
    let scheduledUnpaidRentalObligations = 0;
    let projectedRentalIncome = 0;

    let operatingExpensesTotal = 0;
    let maintenanceExpensesTotal = 0;
    let propertyManagementExpensesTotal = 0;
    let vacancyCostsTotal = 0;
    let capitalExpenditureTotal = 0;
    let financingCostReferencesTotal = 0;
    let taxCostReferencesTotal = 0;

    if (includePmSummary && params.pmSummary && params.pmSummary.currency === params.baseCurrency) {
      confirmedRentalIncome += params.pmSummary.authoritativelyConfirmedCollectedRentTotal;
      reportedUnverifiedRentalIncome += params.pmSummary.tenantSelfReportedPaymentTotal;
      const unpaidScheduled = Math.max(
        0,
        params.pmSummary.scheduledRentObligationTotal -
          params.pmSummary.authoritativelyConfirmedCollectedRentTotal -
          params.pmSummary.tenantSelfReportedPaymentTotal,
      );
      scheduledUnpaidRentalObligations += unpaidScheduled;
      propertyManagementExpensesTotal += params.pmSummary.documentedManagementExpensesTotal;
      maintenanceExpensesTotal += params.pmSummary.documentedMaintenanceExpensesTotal;
      operatingExpensesTotal +=
        params.pmSummary.documentedManagementExpensesTotal +
        params.pmSummary.documentedMaintenanceExpensesTotal;
    }

    for (const e of slice) {
      if (includePmSummary && e.provenance.sourceModule === 'PROPERTY_MANAGEMENT') {
        continue;
      }
      if (e.majorClass === 'OPERATING_INCOME') {
        if (e.paymentStatus === 'AUTHORITATIVELY_CONFIRMED_CASH_MOVEMENT') {
          confirmedRentalIncome += e.amount;
        } else if (e.paymentStatus === 'REPORTED_UNVERIFIED_PAYMENT') {
          reportedUnverifiedRentalIncome += e.amount;
        } else if (e.paymentStatus === 'SCHEDULED_OBLIGATION') {
          scheduledUnpaidRentalObligations += e.amount;
        } else if (e.paymentStatus === 'PROJECTED_FORECAST') {
          projectedRentalIncome += e.amount;
        }
      } else if (e.majorClass === 'OPERATING_EXPENSE') {
        operatingExpensesTotal += e.amount;
        if (e.subcategory === 'MAINTENANCE_COSTS') maintenanceExpensesTotal += e.amount;
        if (e.subcategory === 'PROPERTY_MANAGEMENT_COSTS') propertyManagementExpensesTotal += e.amount;
        if (e.subcategory === 'VACANCY_RELATED_COSTS') vacancyCostsTotal += e.amount;
      } else if (e.majorClass === 'CAPITAL_EXPENDITURE') {
        capitalExpenditureTotal += e.amount;
      } else if (e.majorClass === 'FINANCING_COST_REFERENCE') {
        financingCostReferencesTotal += e.amount;
      } else if (e.majorClass === 'TAX_COST_REFERENCE') {
        taxCostReferencesTotal += e.amount;
      }
    }

    const netOperatingCashFlowConfirmed = round2(confirmedRentalIncome - operatingExpensesTotal);
    const netOperatingCashFlowIncludingReported = round2(
      confirmedRentalIncome + reportedUnverifiedRentalIncome - operatingExpensesTotal,
    );
    const netCashFlowAfterCapexAndFinancing = round2(
      netOperatingCashFlowConfirmed -
        capitalExpenditureTotal -
        financingCostReferencesTotal -
        taxCostReferencesTotal,
    );

    const missingFlags: string[] = [];
    if (
      confirmedRentalIncome === 0 &&
      reportedUnverifiedRentalIncome === 0 &&
      scheduledUnpaidRentalObligations === 0 &&
      projectedRentalIncome === 0
    ) {
      missingFlags.push('NO_RENTAL_INCOME_OBSERVED_IN_PERIOD');
    }

    return {
      periodKey,
      periodType,
      currency: params.baseCurrency,
      confirmedRentalIncome: round2(confirmedRentalIncome),
      reportedUnverifiedRentalIncome: round2(reportedUnverifiedRentalIncome),
      scheduledUnpaidRentalObligations: round2(scheduledUnpaidRentalObligations),
      projectedRentalIncome: round2(projectedRentalIncome),
      operatingExpensesTotal: round2(operatingExpensesTotal),
      maintenanceExpensesTotal: round2(maintenanceExpensesTotal),
      propertyManagementExpensesTotal: round2(propertyManagementExpensesTotal),
      vacancyCostsTotal: round2(vacancyCostsTotal),
      capitalExpenditureTotal: round2(capitalExpenditureTotal),
      financingCostReferencesTotal: round2(financingCostReferencesTotal),
      taxCostReferencesTotal: round2(taxCostReferencesTotal),
      netOperatingCashFlowConfirmed,
      netOperatingCashFlowIncludingReported,
      netCashFlowAfterCapexAndFinancing,
      missingHistoricalDataFlags: missingFlags,
    };
  }

  const byMonth = new Map<string, InvestmentFinancialEntryRecord[]>();
  for (const e of validEntries) {
    const monthKey = e.periodStartIso.slice(0, 7);
    const arr = byMonth.get(monthKey) ?? [];
    arr.push(e);
    byMonth.set(monthKey, arr);
  }

  const monthlyBreakdown = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, slice]) => buildSummaryForSlice(slice, monthKey, 'MONTHLY', false));

  const aggregateSummary = buildSummaryForSlice(
    validEntries,
    `${params.periodStartIso.slice(0, 10)}..${params.periodEndIso.slice(0, 10)}`,
    'CUSTOM_WINDOW',
    true,
  );

  return {
    cashFlowAnalysisId,
    portfolioId: params.portfolioId,
    investmentAssetId: params.investmentAssetId,
    periodStartIso: params.periodStartIso,
    periodEndIso: params.periodEndIso,
    currency: params.baseCurrency,
    aggregateSummary,
    monthlyBreakdown,
    reconciliationMetadata: {
      duplicateEntriesExcludedCount,
      currencyMismatchesExcludedCount,
      authoritativeBankAccessClaimed: false,
      reconciliationDisclaimer:
        'CASHFLOW_RECONCILIATION_INVARIANT: Separates confirmed cash collections, tenant-reported payments, scheduled obligations, and projected cash flows. Never claims direct bank account access.',
    },
    methodologyVersion: CURRENT_INVESTMENT_METHODOLOGY_VERSION,
    createdAt: params.nowTs,
  };
}

/**
 * Newton-Raphson + Bisection solver for annualized Internal Rate of Return (XIRR) on dated cash flows.
 */
export function computeDatedInternalRateOfReturn(
  cashFlows: DatedCashFlowPoint[],
): { irrAnnualPct: number | null; status: ReturnOnInvestmentAnalysisResult['irrStatus'] } {
  if (cashFlows.length < 2) {
    return { irrAnnualPct: null, status: 'INSUFFICIENT_DATED_CASHFLOWS' };
  }
  const sorted = [...cashFlows].sort((a, b) => Date.parse(a.dateIso) - Date.parse(b.dateIso));
  const hasPositive = sorted.some((c) => c.netAmount > 0);
  const hasNegative = sorted.some((c) => c.netAmount < 0);
  if (!hasPositive || !hasNegative) {
    return { irrAnnualPct: null, status: 'NON_CONVERGENT_OR_NO_SIGN_CHANGE' };
  }

  const t0 = Date.parse(sorted[0]!.dateIso);
  const totalSpanDays = (Date.parse(sorted[sorted.length - 1]!.dateIso) - t0) / 86_400_000;
  if (totalSpanDays < 30) {
    return { irrAnnualPct: null, status: 'INSUFFICIENT_DATED_CASHFLOWS' };
  }

  const npvAtRate = (r: number): number => {
    let sum = 0;
    for (const cf of sorted) {
      const years = (Date.parse(cf.dateIso) - t0) / (365 * 86_400_000);
      sum += cf.netAmount / Math.pow(1 + r, years);
    }
    return sum;
  };

  // Bisection over [-0.90, 5.0] (-90% to +500% annual IRR)
  let low = -0.9;
  let high = 5.0;
  let fLow = npvAtRate(low);
  let fHigh = npvAtRate(high);

  if (fLow * fHigh > 0) {
    return { irrAnnualPct: null, status: 'NON_CONVERGENT_OR_NO_SIGN_CHANGE' };
  }

  let mid = 0.1;
  for (let iter = 0; iter < 80; iter++) {
    mid = (low + high) / 2;
    const fMid = npvAtRate(mid);
    if (Math.abs(fMid) < 1e-4) break;
    if (fLow * fMid <= 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }

  return {
    irrAnnualPct: round2(mid * 100),
    status: 'CALCULATED',
  };
}

/**
 * Section 10: Return-on-Investment (ROI) Analysis
 */
export function calculateReturnOnInvestmentAnalysis(params: {
  asset: InvestmentAssetRecord;
  cashFlowResult: CashFlowAnalysisResult;
  valuation: AuthoritativePropertyValuationSnapshot | null;
  datedCashFlows?: DatedCashFlowPoint[];
  startCpiIndex?: number | null;
  endCpiIndex?: number | null;
  asOfDateIso: string;
  nowTs: NormalizedTimestamp;
}): ReturnOnInvestmentAnalysisResult {
  const returnAnalysisId = `roi_${crypto.randomBytes(6).toString('hex')}`;
  const missingInputs: string[] = [];

  if (params.asset.acquisitionPrice === null || params.asset.acquisitionPrice <= 0) {
    missingInputs.push('ACQUISITION_PRICE_MISSING');
  }
  if (!params.asset.acquisitionDateIso) {
    missingInputs.push('ACQUISITION_DATE_MISSING');
  }

  const totalAcquisitionBasis =
    params.asset.acquisitionPrice !== null && params.asset.acquisitionPrice > 0
      ? round2(
          params.asset.acquisitionPrice +
            (params.asset.initialTransactionCostEstimate ?? 0) +
            (params.asset.initialRenovationCostEstimate ?? 0),
        )
      : null;

  const endRefIso = params.asset.disposalDateIso ?? params.asOfDateIso;
  const holdingPeriodDays =
    params.asset.acquisitionDateIso && Date.parse(endRefIso) > Date.parse(params.asset.acquisitionDateIso)
      ? Math.round((Date.parse(endRefIso) - Date.parse(params.asset.acquisitionDateIso)) / 86_400_000)
      : null;

  const holdingPeriodYears =
    holdingPeriodDays !== null ? round2(holdingPeriodDays / 365) : null;
  const annualizationEligible = holdingPeriodDays !== null && holdingPeriodDays >= 180;

  // Determine terminal value: Realized (completed disposal) vs Unrealized (fresh valuation)
  let terminalValueUsed: number | null = null;
  let terminalValueClassification: ReturnOnInvestmentAnalysisResult['terminalValueClassification'] =
    'UNAVAILABLE';
  let returnRealizationStatus: ReturnOnInvestmentAnalysisResult['returnRealizationStatus'] =
    'INCOMPLETE_BASIS';

  if (
    params.asset.disposalPriceClassification === 'AUTHORITATIVELY_CONFIRMED_DISPOSAL' &&
    typeof params.asset.disposalPrice === 'number' &&
    params.asset.disposalPrice > 0
  ) {
    terminalValueUsed = params.asset.disposalPrice;
    terminalValueClassification = 'CONFIRMED_DISPOSAL_SALE_PRICE';
    returnRealizationStatus = 'REALIZED_ON_COMPLETED_DISPOSAL';
  } else if (
    params.valuation &&
    !params.valuation.isStale &&
    params.valuation.currency === params.asset.acquisitionCurrency &&
    params.valuation.estimatedMarketValue > 0
  ) {
    terminalValueUsed = params.valuation.estimatedMarketValue;
    terminalValueClassification = 'AUTHORITATIVE_VALUATION_ESTIMATE';
    returnRealizationStatus = 'UNREALIZED_ON_VALUATION_ESTIMATE';
  } else {
    missingInputs.push(
      params.valuation?.isStale
        ? 'TERMINAL_VALUATION_IS_STALE'
        : 'TERMINAL_VALUATION_OR_DISPOSAL_PRICE_MISSING',
    );
  }

  const capexTotal = params.cashFlowResult.aggregateSummary.capitalExpenditureTotal;
  const cumulativeNoi = params.cashFlowResult.aggregateSummary.netOperatingCashFlowConfirmed;

  const capitalAppreciationAmount =
    terminalValueUsed !== null && params.asset.acquisitionPrice !== null
      ? round2(terminalValueUsed - params.asset.acquisitionPrice)
      : null;

  const capitalAppreciationPct =
    capitalAppreciationAmount !== null &&
    params.asset.acquisitionPrice !== null &&
    params.asset.acquisitionPrice > 0
      ? round2((capitalAppreciationAmount / params.asset.acquisitionPrice) * 100)
      : null;

  const totalCapitalInvested =
    totalAcquisitionBasis !== null ? round2(totalAcquisitionBasis + capexTotal) : null;

  const totalInvestmentReturnAmount =
    terminalValueUsed !== null && totalCapitalInvested !== null
      ? round2(terminalValueUsed - totalCapitalInvested + cumulativeNoi)
      : null;

  const holdingPeriodTotalReturnPct =
    totalInvestmentReturnAmount !== null && totalCapitalInvested !== null && totalCapitalInvested > 0
      ? round2((totalInvestmentReturnAmount / totalCapitalInvested) * 100)
      : null;

  let annualizedReturnCagrPct: number | null = null;
  if (
    annualizationEligible &&
    holdingPeriodDays !== null &&
    holdingPeriodTotalReturnPct !== null &&
    holdingPeriodTotalReturnPct > -100
  ) {
    const totalRatio = 1 + holdingPeriodTotalReturnPct / 100;
    const cagr = Math.pow(totalRatio, 365 / holdingPeriodDays) - 1;
    annualizedReturnCagrPct = round2(cagr * 100);
  }

  const equityInvested =
    totalCapitalInvested !== null
      ? Math.max(1, totalCapitalInvested - (params.asset.financedPrincipalAmount ?? 0))
      : null;

  const cashOnCashReturnPct =
    equityInvested !== null && equityInvested > 0
      ? round2(
          (params.cashFlowResult.aggregateSummary.netCashFlowAfterCapexAndFinancing /
            equityInvested) *
            100,
        )
      : null;

  const totalInflows =
    terminalValueUsed !== null
      ? round2(
          terminalValueUsed +
            Math.max(0, params.cashFlowResult.aggregateSummary.confirmedRentalIncome),
        )
      : null;
  const totalOutflows =
    totalCapitalInvested !== null
      ? round2(
          totalCapitalInvested +
            params.cashFlowResult.aggregateSummary.operatingExpensesTotal +
            params.cashFlowResult.aggregateSummary.financingCostReferencesTotal +
            params.cashFlowResult.aggregateSummary.taxCostReferencesTotal,
        )
      : null;

  const equityMultiple =
    totalInflows !== null && totalOutflows !== null && totalOutflows > 0
      ? round2(totalInflows / totalOutflows)
      : null;

  // Build or evaluate dated cash flows for IRR
  const flowsForIrr: DatedCashFlowPoint[] = params.datedCashFlows ? [...params.datedCashFlows] : [];
  if (
    flowsForIrr.length === 0 &&
    totalAcquisitionBasis !== null &&
    params.asset.acquisitionDateIso &&
    terminalValueUsed !== null
  ) {
    flowsForIrr.push({
      dateIso: params.asset.acquisitionDateIso,
      netAmount: -totalCapitalInvested!,
      classification: 'CONFIRMED',
    });
    flowsForIrr.push({
      dateIso: endRefIso,
      netAmount: terminalValueUsed + cumulativeNoi,
      classification:
        returnRealizationStatus === 'REALIZED_ON_COMPLETED_DISPOSAL' ? 'CONFIRMED' : 'ESTIMATED',
    });
  }

  const irrRes = computeDatedInternalRateOfReturn(flowsForIrr);

  let inflationAdjustedRealTotalReturnPct: number | null = null;
  let inflationMethodologyNote: string | undefined;
  if (
    holdingPeriodTotalReturnPct !== null &&
    typeof params.startCpiIndex === 'number' &&
    params.startCpiIndex > 0 &&
    typeof params.endCpiIndex === 'number' &&
    params.endCpiIndex > 0
  ) {
    const nominalFactor = 1 + holdingPeriodTotalReturnPct / 100;
    const cpiFactor = params.endCpiIndex / params.startCpiIndex;
    inflationAdjustedRealTotalReturnPct = round2((nominalFactor / cpiFactor - 1) * 100);
    inflationMethodologyNote = `Deflated using verified CPI ratio (${params.endCpiIndex} / ${params.startCpiIndex}).`;
  }

  return {
    returnAnalysisId,
    portfolioId: params.asset.portfolioId,
    investmentAssetId: params.asset.investmentAssetId,
    currency: params.asset.acquisitionCurrency,
    returnRealizationStatus:
      totalAcquisitionBasis === null ? 'INCOMPLETE_BASIS' : returnRealizationStatus,
    holdingPeriodDays,
    holdingPeriodYears,
    annualizationEligible,
    totalAcquisitionBasis,
    capitalExpenditureTotal: capexTotal,
    terminalValueUsed,
    terminalValueClassification,
    valuationRefId: params.valuation?.valuationId ?? null,
    valuationDateIso: params.valuation?.valuationDateIso ?? null,
    cumulativeNetOperatingIncome: cumulativeNoi,
    capitalAppreciationAmount,
    capitalAppreciationPct,
    totalInvestmentReturnAmount,
    holdingPeriodTotalReturnPct,
    annualizedReturnCagrPct,
    cashOnCashReturnPct,
    internalRateOfReturnAnnualPct: irrRes.irrAnnualPct,
    irrStatus: irrRes.status,
    equityMultiple,
    inflationAdjustedRealTotalReturnPct,
    ...(inflationMethodologyNote ? { inflationMethodologyNote } : {}),
    missingFinancialInputs: missingInputs,
    formulasDocumented: {
      totalReturnAmount:
        '(TerminalValue - TotalAcquisitionBasis - CapEx) + CumulativeNetOperatingIncome',
      holdingPeriodReturnPct: '(TotalReturnAmount / (TotalAcquisitionBasis + CapEx)) * 100',
      annualizedCagrPct: '(((1 + HoldingPeriodReturnRatio) ^ (365 / HoldingPeriodDays)) - 1) * 100',
      cashOnCashReturnPct: '(NetCashFlowAfterCapexAndFinancing / EquityInvested) * 100',
    },
    methodologyVersion: CURRENT_INVESTMENT_METHODOLOGY_VERSION,
    nonGuaranteeDisclaimer:
      'INVESTMENT_RETURN_INVARIANT: Unrealized returns based on property valuation estimates are strictly separated from realized disposal outcomes and never constitute guaranteed returns.',
    createdAt: params.nowTs,
  };
}

/**
 * Section 14: Hypothetical Investment Scenario Modeling
 */
export function evaluateHypotheticalInvestmentScenario(params: {
  portfolioId: string;
  investmentAssetId: string | null;
  scenarioName: string;
  currency: SupportedCurrencyCode;
  baselineAnnualGrossRent: number;
  baselineAnnualMaintenanceCost: number;
  baselineAnnualOtherOpEx: number;
  baselineAcquisitionAndCapexBasis: number | null;
  baselinePropertyValue: number | null;
  assumptions: InvestmentScenarioRecord['explicitAssumptions'];
  nowTs: NormalizedTimestamp;
}): InvestmentScenarioRecord {
  const scenarioId = `invscn_${crypto.randomBytes(6).toString('hex')}`;
  const baselineNoi = round2(
    params.baselineAnnualGrossRent -
      params.baselineAnnualMaintenanceCost -
      params.baselineAnnualOtherOpEx,
  );
  const baselineNetYieldPct =
    params.baselinePropertyValue && params.baselinePropertyValue > 0
      ? round2((baselineNoi / params.baselinePropertyValue) * 100)
      : null;

  const baselineHoldingReturnPct =
    params.baselinePropertyValue !== null &&
    params.baselineAcquisitionAndCapexBasis !== null &&
    params.baselineAcquisitionAndCapexBasis > 0
      ? round2(
          ((params.baselinePropertyValue -
            params.baselineAcquisitionAndCapexBasis +
            baselineNoi * params.assumptions.hypotheticalHoldingPeriodYears) /
            params.baselineAcquisitionAndCapexBasis) *
            100,
        )
      : null;

  // Apply hypothetical shock assumptions
  const vacancyOccupancyFactor = Math.max(
    0,
    (365 - Math.max(0, params.assumptions.additionalVacancyDaysPerYear)) / 365,
  );
  const projectedGrossRent = round2(
    params.baselineAnnualGrossRent *
      (1 + params.assumptions.monthlyRentalIncomeChangePct / 100) *
      vacancyOccupancyFactor,
  );
  const projectedMaintenance = round2(
    params.baselineAnnualMaintenanceCost * (1 + params.assumptions.maintenanceCostChangePct / 100),
  );
  const projectedAnnualNoi = round2(
    projectedGrossRent - projectedMaintenance - params.baselineAnnualOtherOpEx,
  );

  const projectedTerminalValue =
    params.assumptions.hypotheticalFutureSalePrice !== null &&
    params.assumptions.hypotheticalFutureSalePrice > 0
      ? params.assumptions.hypotheticalFutureSalePrice
      : params.baselinePropertyValue !== null
        ? round2(
            params.baselinePropertyValue *
              (1 + params.assumptions.hypotheticalPropertyValueChangePct / 100),
          )
        : null;

  const projectedNetYieldPct =
    projectedTerminalValue && projectedTerminalValue > 0
      ? round2((projectedAnnualNoi / projectedTerminalValue) * 100)
      : null;

  const scenarioBasis =
    params.baselineAcquisitionAndCapexBasis !== null
      ? params.baselineAcquisitionAndCapexBasis + params.assumptions.majorRenovationCapexAmount
      : null;

  const projectedHoldingReturnPct =
    projectedTerminalValue !== null && scenarioBasis !== null && scenarioBasis > 0
      ? round2(
          ((projectedTerminalValue -
            scenarioBasis +
            projectedAnnualNoi * params.assumptions.hypotheticalHoldingPeriodYears) /
            scenarioBasis) *
            100,
        )
      : null;

  return {
    scenarioId,
    outputClassification: 'HYPOTHETICAL_INVESTMENT_SCENARIO_NOT_A_FORECAST',
    portfolioId: params.portfolioId,
    investmentAssetId: params.investmentAssetId,
    scenarioName: params.scenarioName,
    currency: params.currency,
    projectionHorizonYears: params.assumptions.hypotheticalHoldingPeriodYears,
    explicitAssumptions: params.assumptions,
    baselineSummary: {
      annualNetOperatingIncome: baselineNoi,
      netRentalYieldPct: baselineNetYieldPct,
      holdingPeriodReturnPct: baselineHoldingReturnPct,
      terminalPropertyValue: params.baselinePropertyValue,
    },
    projectedScenarioSummary: {
      projectedAnnualNetOperatingIncome: projectedAnnualNoi,
      projectedNetRentalYieldPct: projectedNetYieldPct,
      projectedHoldingPeriodReturnPct: projectedHoldingReturnPct,
      projectedTerminalValue,
      noiDeltaFromBaseline: round2(projectedAnnualNoi - baselineNoi),
      returnPctDeltaFromBaseline:
        projectedHoldingReturnPct !== null && baselineHoldingReturnPct !== null
          ? round2(projectedHoldingReturnPct - baselineHoldingReturnPct)
          : null,
    },
    limitations: [
      'Hypothetical scenario analysis evaluates user-defined sensitivity parameters and is NOT a market forecast.',
      'Scenario outputs never overwrite historical asset records or confirmed financial entries.',
      'Does not assume future appreciation rates, inflation, or interest rates unless explicitly supplied.',
    ],
    methodologyVersion: CURRENT_INVESTMENT_METHODOLOGY_VERSION,
    createdAt: params.nowTs,
  };
}
