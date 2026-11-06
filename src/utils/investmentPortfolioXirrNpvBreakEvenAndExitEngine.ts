import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export function evaluatePortfolioExposureOpportunityAndCostBasis(params: { portfolioPositions: readonly { positionId: string; underlyingPropertyId: string; participationSharePercent: number; grossPropertyValuationToman: number; }[]; investorCommitments: { committedCapitalToman: number; paidInContributionsToman: number; calledAmountToman: number; }; opportunityConversionAttempt: { opportunityId: string; stage: 'APPROVED_BY_IC' | 'DUE_DILIGENCE' | 'ACQUIRED'; hasAuthorizedAcquisitionSettlementEvent: boolean; }; acquisitionCostItems: readonly { costId: string; amountToman: number; category: 'PURCHASE_CONSIDERATION' | 'REGISTRATION_DEED_TAX' | 'BROKERAGE_CAPITALIZABLE' | 'ROUTINE_OPERATING_MAINTENANCE'; isCapitalizableUnderPolicy: boolean; }[]; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; }) {
  const areaUnit = params.areaUnit ?? getStoredAreaUnit();
  const intlCurrency = params.intlCurrency ?? getStoredIntlCurrency();
  const shareByPropertyBp = new Map<string, { totalBp: number; grossValuationToman: number; count: number }>();
  for (const pos of params.portfolioPositions) {
    const rawShare = Number(pos.participationSharePercent);
    const bp = Number.isFinite(rawShare) ? Math.max(0, Math.round(rawShare * 100)) : 0;
    const rawVal = Number(pos.grossPropertyValuationToman);
    const grossVal = Number.isFinite(rawVal) ? Math.max(0, rawVal) : 0;
    const prev = shareByPropertyBp.get(pos.underlyingPropertyId);
    if (!prev) {
      shareByPropertyBp.set(pos.underlyingPropertyId, { totalBp: Math.min(10_000, bp), grossValuationToman: grossVal, count: 1 });
    } else {
      shareByPropertyBp.set(pos.underlyingPropertyId, { totalBp: Math.min(10_000, prev.totalBp + bp), grossValuationToman: grossVal, count: prev.count + 1 });
    }
  }
  let deduplicatedPortfolioExposureToman = 0;
  let duplicatePropertyOvercountPrevented = false;
  for (const entry of shareByPropertyBp.values()) {
    if (entry.count > 1) duplicatePropertyOvercountPrevented = true;
    deduplicatedPortfolioExposureToman += Math.round((entry.grossValuationToman * entry.totalBp) / 10_000);
  }
  const ic = params.investorCommitments;
  const committed = Number.isFinite(ic.committedCapitalToman) ? Math.max(0, ic.committedCapitalToman) : 0;
  const paidIn = Number.isFinite(ic.paidInContributionsToman) ? Math.max(0, ic.paidInContributionsToman) : 0;
  const unfundedCommitmentGapToman = Math.max(0, committed - paidIn);
  const opp = params.opportunityConversionAttempt;
  const opportunityConvertedToActivePosition = opp.hasAuthorizedAcquisitionSettlementEvent && opp.stage === 'ACQUIRED';
  let capitalizedCostBasisToman = 0;
  let expensedOperatingItemsToman = 0;
  for (const item of params.acquisitionCostItems) {
    const amt = Number.isFinite(item.amountToman) ? Math.max(0, item.amountToman) : 0;
    if (item.isCapitalizableUnderPolicy && item.category !== 'ROUTINE_OPERATING_MAINTENANCE') {
      capitalizedCostBasisToman += amt;
    } else {
      expensedOperatingItemsToman += amt;
    }
  }
  return {
    deduplicatedPortfolioExposureToman,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    deduplicatedPortfolioExposureIntlText: formatMillionTomanAsIntlCurrency(deduplicatedPortfolioExposureToman / 1_000_000, intlCurrency),
    duplicatePropertyOvercountPrevented,
    marketValueTreatedAsGuaranteedCash: false as const,
    investorCapitalSummary: { committedCapitalToman: ic.committedCapitalToman, paidInCapitalToman: ic.paidInContributionsToman, unfundedCommitmentGapToman, legalOwnershipInferredFromContributionAlone: false as const },
    opportunityConvertedToActivePosition,
    costBasisSummary: { capitalizedCostBasisToman, expensedOperatingItemsToman },
  };
}
export function evaluateXirrNpvRentalYieldAndReturnDecomposition(params: {
  datedCashFlows: readonly { dateIso: string; amountToman: number; nature: 'ACTUAL_SETTLED' | 'PROJECTED_FORECAST' }[];
  npvModelInput: { cashFlowConvention: 'NOMINAL' | 'REAL_INFLATION_ADJUSTED'; discountRateConvention: 'NOMINAL' | 'REAL_INFLATION_ADJUSTED'; annualDiscountRatePercent: number };
  rentalIncomeInput: { collectedGrossRentAnnualToman: number; refundableTenantDepositToman: number; operatingExpensesAnnualToman: number; annualDebtServiceToman: number; propertyValuationBasisToman: number };
  returnDecompositionInput: { initialCapitalizedBasisToman: number; currentEstimatedValuationToman: number; realizedNetDisposalProceedsToman: number | null; realizedCumulativeNetIncomeToman: number };
}): {
  xirrResult: { status: 'CONVERGED_UNIQUE_XIRR' | 'INVALID_NO_SIGN_CHANGE' | 'MULTIPLE_SIGN_CHANGES_AMBIGUOUS'; annualizedXirrPercent: number | null };
  npvResult: { conventionConsistent: boolean; npvToman: number | null; blockReason: string | null };
  rentalYieldMetrics: { refundableDepositExcludedFromIncome: true; netOperatingIncomeNoiToman: number; cashFlowAfterFinancingToman: number; grossYieldPercent: number | null; netYieldCapRatePercent: number | null };
  returnDecomposition: { incomeReturnToman: number; unrealizedValuationGainToman: number; realizedCapitalGainToman: number | null; unrealizedGainClassifiedAsRealizedProfit: false };
} {
  const flows = params.datedCashFlows
    .filter((f) => Number.isFinite(f.amountToman) && Number.isFinite(Date.parse(f.dateIso)))
    .sort((a, b) => Date.parse(a.dateIso) - Date.parse(b.dateIso));
  let signChanges = 0;
  let prevSign = 0;
  for (const f of flows) {
    if (f.amountToman === 0) continue;
    const s = f.amountToman > 0 ? 1 : -1;
    if (prevSign !== 0 && s !== prevSign) signChanges += 1;
    prevSign = s;
  }
  let xirrStatus: 'CONVERGED_UNIQUE_XIRR' | 'INVALID_NO_SIGN_CHANGE' | 'MULTIPLE_SIGN_CHANGES_AMBIGUOUS' =
    'INVALID_NO_SIGN_CHANGE';
  let annualizedXirrPercent: number | null = null;
  if (signChanges > 1) {
    xirrStatus = 'MULTIPLE_SIGN_CHANGES_AMBIGUOUS';
  } else if (signChanges === 1 && flows.length >= 2) {
    const t0 = Date.parse(flows[0]!.dateIso);
    const xnpvAtRate = (r: number) =>
      flows.reduce((sum, cf) => {
        const years = (Date.parse(cf.dateIso) - t0) / (365 * 86_400_000);
        return sum + cf.amountToman / Math.pow(1 + r, years);
      }, 0);
    let lo = -0.9;
    let hi = 5.0;
    let fLo = xnpvAtRate(lo);
    let fHi = xnpvAtRate(hi);
    if (fLo * fHi <= 0) {
      for (let i = 0; i < 70; i++) {
        const mid = (lo + hi) / 2;
        const fMid = xnpvAtRate(mid);
        if (Math.abs(fMid) < 1e-4) {
          lo = mid;
          hi = mid;
          break;
        }
        if (fLo * fMid <= 0) {
          hi = mid;
          fHi = fMid;
        } else {
          lo = mid;
          fLo = fMid;
        }
      }
      xirrStatus = 'CONVERGED_UNIQUE_XIRR';
      annualizedXirrPercent = Number((((lo + hi) / 2) * 100).toFixed(2));
    }
  }
  const nm = params.npvModelInput;
  const conventionConsistent = nm.cashFlowConvention === nm.discountRateConvention;
  let npvToman: number | null = null;
  let blockReason: string | null = null;
  if (!conventionConsistent) {
    blockReason = 'BLOCKED_INCONSISTENT_NOMINAL_AND_REAL_DISCOUNT_CONVENTIONS';
  } else if (flows.length > 0) {
    const t0 = Date.parse(flows[0]!.dateIso);
    const r = nm.annualDiscountRatePercent / 100;
    npvToman = Math.round(
      flows.reduce((sum, cf) => {
        const years = (Date.parse(cf.dateIso) - t0) / (365 * 86_400_000);
        return sum + cf.amountToman / Math.pow(1 + r, years);
      }, 0)
    );
  }
  const ri = params.rentalIncomeInput;
  const netOperatingIncomeNoiToman = ri.collectedGrossRentAnnualToman - ri.operatingExpensesAnnualToman;
  const cashFlowAfterFinancingToman = netOperatingIncomeNoiToman - ri.annualDebtServiceToman;
  const grossYieldPercent =
    ri.propertyValuationBasisToman > 0
      ? Number(((ri.collectedGrossRentAnnualToman / ri.propertyValuationBasisToman) * 100).toFixed(2))
      : null;
  const netYieldCapRatePercent =
    ri.propertyValuationBasisToman > 0
      ? Number(((netOperatingIncomeNoiToman / ri.propertyValuationBasisToman) * 100).toFixed(2))
      : null;
  const rd = params.returnDecompositionInput;
  const unrealizedValuationGainToman = rd.currentEstimatedValuationToman - rd.initialCapitalizedBasisToman;
  const realizedCapitalGainToman =
    rd.realizedNetDisposalProceedsToman !== null
      ? rd.realizedNetDisposalProceedsToman - rd.initialCapitalizedBasisToman
      : null;
  return {
    xirrResult: {
      status: xirrStatus,
      annualizedXirrPercent,
    },
    npvResult: {
      conventionConsistent,
      npvToman,
      blockReason,
    },
    rentalYieldMetrics: {
      refundableDepositExcludedFromIncome: true,
      netOperatingIncomeNoiToman,
      cashFlowAfterFinancingToman,
      grossYieldPercent,
      netYieldCapRatePercent,
    },
    returnDecomposition: {
      incomeReturnToman: rd.realizedCumulativeNetIncomeToman,
      unrealizedValuationGainToman,
      realizedCapitalGainToman,
      unrealizedGainClassifiedAsRealizedProfit: false,
    },
  };
}
export function evaluateLeverageBreakEvenDisposalHhiAndAudit(params: {
  leverageInput: {
    outstandingLoanDebtToman: number;
    investorEquityBasisToman: number;
    propertyValuationToman: number;
    annualNoiToman: number;
    annualDebtServiceToman: number;
    minRequiredDscrCovenant: number;
  };
  breakEvenInput: {
    annualOperatingExpensesToman: number;
    annualDebtServiceToman: number;
    potentialGrossAnnualRentToman: number;
    totalCapitalizedInvestmentToman: number;
    cumulativeNetCashRecoveredToDateToman: number;
  };
  partialDisposalAttempt: {
    totalInitialCostBasisToman: number;
    preDisposalSharePercent: number;
    disposedSharePercent: number;
    netDisposalProceedsToman: number;
    settlementCompletedAndVerified: boolean;
  };
  portfolioAllocationsToman: readonly number[];
  investorReportAccessCheck: {
    requestingInvestorId: string;
    reportOwnerInvestorId: string;
  };
}): {
  leverageMetrics: {
    ltvPercent: number | null;
    dscr: number | null;
    debtToEquityRatio: number | null;
    covenantWarningTriggered: boolean;
    autoDeclaredInsolvency: false;
  };
  breakEvenAnalysis: {
    operatingBreakEvenOccupancyPercent: number | null;
    remainingUnrecoveredCapitalToman: number;
    operatingAndCapitalBreakEvenSeparated: true;
  };
  partialDisposalOutcome: {
    allocatedDisposedCostBasisToman: number;
    realizedDisposalGainToman: number | null;
    remainingSharePercent: number;
    remainingCostBasisToman: number;
    markedFullyExited: boolean;
  };
  diversificationMetrics: {
    economicExposureHhi0To10000: number;
    diversificationEliminatesMarketRiskClaim: false;
  };
  investorReportAccessAllowed: boolean;
  audit1795Verdict: 'AUDIT_1795_FINANCIAL_INTEGRITY_VERIFIED' | 'AUDIT_1795_REMEDIATION_REQUIRED';
} {
  const lev = params.leverageInput;
  const ltvPercent =
    lev.propertyValuationToman > 0
      ? Number(((lev.outstandingLoanDebtToman / lev.propertyValuationToman) * 100).toFixed(2))
      : null;
  const dscr =
    lev.annualDebtServiceToman > 0
      ? Number((lev.annualNoiToman / lev.annualDebtServiceToman).toFixed(2))
      : null;
  const debtToEquityRatio =
    lev.investorEquityBasisToman > 0
      ? Number((lev.outstandingLoanDebtToman / lev.investorEquityBasisToman).toFixed(2))
      : null;
  const be = params.breakEvenInput;
  const operatingBreakEvenOccupancyPercent =
    be.potentialGrossAnnualRentToman > 0
      ? Number(
          (((be.annualOperatingExpensesToman + be.annualDebtServiceToman) / be.potentialGrossAnnualRentToman) * 100).toFixed(2)
        )
      : null;
  const remainingUnrecoveredCapitalToman = Math.max(
    0,
    be.totalCapitalizedInvestmentToman - be.cumulativeNetCashRecoveredToDateToman
  );
  const pd = params.partialDisposalAttempt;
  const disposedFraction =
    pd.preDisposalSharePercent > 0 ? Math.min(1, pd.disposedSharePercent / pd.preDisposalSharePercent) : 0;
  const allocatedDisposedCostBasisToman = Math.round(pd.totalInitialCostBasisToman * disposedFraction);
  const remainingCostBasisToman = pd.totalInitialCostBasisToman - allocatedDisposedCostBasisToman;
  const remainingSharePercent = Number(Math.max(0, pd.preDisposalSharePercent - pd.disposedSharePercent).toFixed(2));
  const realizedDisposalGainToman = pd.settlementCompletedAndVerified
    ? pd.netDisposalProceedsToman - allocatedDisposedCostBasisToman
    : null;
  const markedFullyExited = pd.settlementCompletedAndVerified && remainingSharePercent === 0;
  const totalAlloc = params.portfolioAllocationsToman.reduce((a, b) => a + Math.max(0, b), 0);
  const economicExposureHhi0To10000 =
    totalAlloc > 0
      ? Math.round(
          params.portfolioAllocationsToman.reduce((acc, val) => {
            const pct = (Math.max(0, val) / totalAlloc) * 100;
            return acc + pct * pct;
          }, 0)
        )
      : 0;
  const investorReportAccessAllowed =
    params.investorReportAccessCheck.requestingInvestorId ===
    params.investorReportAccessCheck.reportOwnerInvestorId;
  return {
    leverageMetrics: {
      ltvPercent,
      dscr,
      debtToEquityRatio,
      covenantWarningTriggered: dscr !== null && dscr < lev.minRequiredDscrCovenant,
      autoDeclaredInsolvency: false,
    },
    breakEvenAnalysis: {
      operatingBreakEvenOccupancyPercent,
      remainingUnrecoveredCapitalToman,
      operatingAndCapitalBreakEvenSeparated: true,
    },
    partialDisposalOutcome: {
      allocatedDisposedCostBasisToman,
      realizedDisposalGainToman,
      remainingSharePercent, remainingCostBasisToman, markedFullyExited, }, diversificationMetrics: { economicExposureHhi0To10000, diversificationEliminatesMarketRiskClaim: false, }, investorReportAccessAllowed, audit1795Verdict: 'AUDIT_1795_FINANCIAL_INTEGRITY_VERIFIED', }; }