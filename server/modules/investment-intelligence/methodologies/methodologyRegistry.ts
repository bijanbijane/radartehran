export const CURRENT_INVESTMENT_METHODOLOGY_VERSION = '1.0.0';

export interface InvestmentMethodologyDefinition {
  methodologyId: string;
  version: string;
  domainArea:
    | 'RENTAL_YIELD'
    | 'CASH_FLOW'
    | 'RETURN_ON_INVESTMENT'
    | 'SCENARIO_MODELING'
    | 'PORTFOLIO_DIVERSIFICATION_AND_CONCENTRATION'
    | 'RISK_FACTOR_ANALYSIS'
    | 'CURRENCY_AND_INFLATION';
  name: string;
  formulas: Record<string, string>;
  includedComponents: string[];
  excludedComponents: string[];
  assumptionsAndLimitations: string[];
}

export const CANONICAL_INVESTMENT_METHODOLOGIES: readonly InvestmentMethodologyDefinition[] = [
  {
    methodologyId: 'meth_rental_yield_v1',
    version: CURRENT_INVESTMENT_METHODOLOGY_VERSION,
    domainArea: 'RENTAL_YIELD',
    name: 'Explainable Gross and Net Rental Yield Methodology',
    formulas: {
      annualizationFactor: '365 / observedDaysInPeriod (when observedDaysInPeriod > 0)',
      annualizedGrossRentalIncome: 'ObservedGrossRentalIncome * (365 / observedDaysInPeriod)',
      annualizedNetOperatingIncome: 'AnnualizedGrossRentalIncome - AnnualizedOperatingExpenses',
      grossRentalYieldPct: '(AnnualizedGrossRentalIncome / PropertyValueBasis) * 100',
      netRentalYieldPct: '(AnnualizedNetOperatingIncome / PropertyValueBasis) * 100',
    },
    includedComponents: [
      'Contractual or confirmed rental income during occupied days',
      'Recurring and documented operating expenses (management, maintenance, insurance, building charges, owner-paid utilities, property taxes, vacancy costs)',
    ],
    excludedComponents: [
      'Capital expenditures (CapEx)',
      'Debt service / mortgage principal and interest',
      'Personal income tax of the investor',
    ],
    assumptionsAndLimitations: [
      'Acquisition cost basis and current valuation estimate basis are calculated separately and never mixed.',
      'Vacant days reduce observed rental income and are never filled with fabricated rent.',
    ],
  },
  {
    methodologyId: 'meth_cash_flow_v1',
    version: CURRENT_INVESTMENT_METHODOLOGY_VERSION,
    domainArea: 'CASH_FLOW',
    name: 'Multi-Stage Property Cash-Flow Classification & Reconciliation',
    formulas: {
      netOperatingCashFlowConfirmed: 'ConfirmedRentalIncome - TotalOperatingExpenses',
      netOperatingCashFlowIncludingReported: '(ConfirmedRentalIncome + ReportedUnverifiedRentalIncome) - TotalOperatingExpenses',
      netCashFlowAfterCapexAndFinancing:
        'NetOperatingCashFlowConfirmed - CapitalExpenditureTotal - FinancingCostReferencesTotal - TaxCostReferencesTotal',
    },
    includedComponents: [
      'Authoritatively confirmed rental collections',
      'Reported unverified rental payments (separated)',
      'Scheduled unpaid obligations (tracked separately, excluded from collected cash flow)',
      'Operating expenses, CapEx, authorized financing cost references, and documented property taxes',
    ],
    excludedComponents: [
      'Unverified bank balance claims',
      'Duplicate entries across Property Management and manual entries (filtered via deduplicationKey)',
    ],
    assumptionsAndLimitations: [
      'Does not execute payment processing or claim direct access to bank accounts.',
    ],
  },
  {
    methodologyId: 'meth_roi_irr_v1',
    version: CURRENT_INVESTMENT_METHODOLOGY_VERSION,
    domainArea: 'RETURN_ON_INVESTMENT',
    name: 'Realized & Unrealized Return, CAGR, Cash-on-Cash, Equity Multiple, and XIRR Methodology',
    formulas: {
      totalAcquisitionBasis:
        'AcquisitionPrice + InitialTransactionCostEstimate + InitialRenovationCostEstimate',
      capitalAppreciationAmount: 'TerminalValue - AcquisitionPrice',
      capitalAppreciationPct: '((TerminalValue - AcquisitionPrice) / AcquisitionPrice) * 100',
      totalInvestmentReturnAmount:
        '(TerminalValue - TotalAcquisitionBasis - CapitalExpenditureTotal) + CumulativeNetOperatingIncome',
      holdingPeriodTotalReturnPct:
        '(TotalInvestmentReturnAmount / (TotalAcquisitionBasis + CapitalExpenditureTotal)) * 100',
      annualizedReturnCagrPct:
        '(((1 + HoldingPeriodTotalReturnRatio) ^ (365 / HoldingPeriodDays)) - 1) * 100 (requires HoldingPeriodDays >= 180)',
      cashOnCashReturnPct: '(AnnualNetCashFlow / TotalCashInvested) * 100',
      equityMultiple: 'TotalCumulativeCashInflows / TotalCumulativeCashOutflows',
      xirrAnnualPct: 'Root r of sum_{i} [ CF_i / (1 + r)^((t_i - t_0) / 365) ] = 0',
      realInflationAdjustedReturnPct: '(((1 + NominalReturnRatio) / (CPI_End / CPI_Start)) - 1) * 100',
    },
    includedComponents: [
      'Verified or estimated acquisition basis',
      'Cumulative net operating income',
      'Capital expenditures',
      'Confirmed disposal sale price (for realized returns) or authoritative Valuation estimate (for unrealized returns)',
    ],
    excludedComponents: ['Speculative future appreciation not backed by historical valuation or transaction'],
    assumptionsAndLimitations: [
      'Annualized return (CAGR) is suppressed when holding period is shorter than 180 days or dates are missing.',
      'IRR requires at least one negative cash flow (outflow) and one positive cash flow (inflow) with valid dates.',
    ],
  },
  {
    methodologyId: 'meth_portfolio_concentration_v1',
    version: CURRENT_INVESTMENT_METHODOLOGY_VERSION,
    domainArea: 'PORTFOLIO_DIVERSIFICATION_AND_CONCENTRATION',
    name: 'Portfolio Allocation and Herfindahl-Hirschman Concentration Index (HHI)',
    formulas: {
      assetSharePct: '(AssetValue / TotalValuedPortfolioAmount) * 100',
      herfindahlHirschmanIndex: 'sum_{i=1..N} (AssetShareFraction_i ^ 2) * 10000 (scale 0 to 10000)',
      largestSingleAssetSharePct: 'max_i(AssetSharePct_i)',
    },
    includedComponents: ['Assets with valid non-missing value on the selected valuation basis'],
    excludedComponents: ['Assets with missing values (explicitly listed in assetsMissingValueIds, never treated as 0)'],
    assumptionsAndLimitations: [
      'Diversification metrics are descriptive and never guarantee protection against market losses.',
    ],
  },
];
