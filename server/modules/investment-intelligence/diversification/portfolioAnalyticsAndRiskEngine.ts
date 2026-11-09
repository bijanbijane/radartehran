import crypto from 'crypto';
import type {
  AuthoritativePropertyValuationSnapshot,
  MarketBenchmarkSnapshot,
  NormalizedTimestamp,
  SupportedCurrencyCode,
} from '../contracts/externalAdapters';
import type {
  ExplainableRiskIndicatorItem,
  InvestmentAssetRecord,
  InvestmentRiskAnalysisResult,
  PortfolioAllocationAndConcentrationResult,
  PropertyValueBasisType,
} from '../domain/types';
import { CURRENT_INVESTMENT_METHODOLOGY_VERSION } from '../methodologies/methodologyRegistry';
import { round2 } from '../returns/yieldsCashflowsAndReturnsEngine';

export interface AssetAnalyticalSummaryForPortfolio {
  asset: InvestmentAssetRecord;
  valuation: AuthoritativePropertyValuationSnapshot | null;
  annualRentalIncome: number;
  annualOperatingExpenses: number;
  annualMaintenanceExpenses: number;
  vacantDaysInPeriod: number;
  totalDaysInPeriod: number;
  singleLeaseConcentrationRatio: number | null;
}

/**
 * Section 15: Portfolio Diversification and Concentration Analysis
 */
export function evaluatePortfolioDiversificationAndConcentration(params: {
  portfolioId: string;
  reportingCurrency: SupportedCurrencyCode;
  valuationBasis: PropertyValueBasisType;
  assetSummaries: AssetAnalyticalSummaryForPortfolio[];
  nowTs: NormalizedTimestamp;
}): PortfolioAllocationAndConcentrationResult {
  const analysisId = `palloc_${crypto.randomBytes(6).toString('hex')}`;
  const assetsMissingValueIds: string[] = [];
  const valuedAssets: Array<{
    summary: AssetAnalyticalSummaryForPortfolio;
    valueAmount: number;
  }> = [];

  for (const item of params.assetSummaries) {
    if (item.asset.acquisitionCurrency !== params.reportingCurrency) {
      assetsMissingValueIds.push(item.asset.investmentAssetId);
      continue;
    }

    let val: number | null = null;
    if (params.valuationBasis === 'ORIGINAL_ACQUISITION_COST_BASIS') {
      val =
        typeof item.asset.acquisitionPrice === 'number' && item.asset.acquisitionPrice > 0
          ? item.asset.acquisitionPrice
          : null;
    } else {
      val =
        item.valuation &&
        !item.valuation.isStale &&
        item.valuation.currency === params.reportingCurrency &&
        item.valuation.estimatedMarketValue > 0
          ? item.valuation.estimatedMarketValue
          : null;
    }

    // Never treat missing values as zero
    if (val === null || val <= 0) {
      assetsMissingValueIds.push(item.asset.investmentAssetId);
    } else {
      valuedAssets.push({ summary: item, valueAmount: val });
    }
  }

  const totalValuedPortfolioAmount = round2(
    valuedAssets.reduce((sum, a) => sum + a.valueAmount, 0),
  );

  const geographicAllocationByCity: PortfolioAllocationAndConcentrationResult['geographicAllocationByCity'] =
    {};
  const propertyCategoryAllocation: PortfolioAllocationAndConcentrationResult['propertyCategoryAllocation'] =
    {};

  let residentialAmount = 0;
  let commercialAndOtherAmount = 0;
  let rentalProducingAssetCount = 0;
  let nonRentalAssetCount = 0;

  for (const item of params.assetSummaries) {
    if (item.annualRentalIncome > 0 || item.asset.investmentClassification === 'CORE_RENTAL') {
      rentalProducingAssetCount++;
    } else {
      nonRentalAssetCount++;
    }
  }

  let hhiSum = 0;
  let largestSingleAssetValueSharePct: number | null = null;

  for (const { summary, valueAmount } of valuedAssets) {
    const sharePct =
      totalValuedPortfolioAmount > 0
        ? round2((valueAmount / totalValuedPortfolioAmount) * 100)
        : 0;
    const shareFrac =
      totalValuedPortfolioAmount > 0 ? valueAmount / totalValuedPortfolioAmount : 0;
    hhiSum += shareFrac * shareFrac * 10000;

    if (
      largestSingleAssetValueSharePct === null ||
      sharePct > largestSingleAssetValueSharePct
    ) {
      largestSingleAssetValueSharePct = sharePct;
    }

    const cityKey = summary.asset.cityId;
    const existingCity = geographicAllocationByCity[cityKey] ?? {
      amount: 0,
      sharePct: 0,
      assetCount: 0,
    };
    existingCity.amount = round2(existingCity.amount + valueAmount);
    existingCity.assetCount += 1;
    existingCity.sharePct =
      totalValuedPortfolioAmount > 0
        ? round2((existingCity.amount / totalValuedPortfolioAmount) * 100)
        : 0;
    geographicAllocationByCity[cityKey] = existingCity;

    const catKey = summary.asset.propertyCategory;
    const existingCat = propertyCategoryAllocation[catKey] ?? {
      amount: 0,
      sharePct: 0,
      assetCount: 0,
    };
    existingCat.amount = round2(existingCat.amount + valueAmount);
    existingCat.assetCount += 1;
    existingCat.sharePct =
      totalValuedPortfolioAmount > 0
        ? round2((existingCat.amount / totalValuedPortfolioAmount) * 100)
        : 0;
    propertyCategoryAllocation[catKey] = existingCat;

    if (summary.asset.propertyCategory === 'RESIDENTIAL') {
      residentialAmount += valueAmount;
    } else {
      commercialAndOtherAmount += valueAmount;
    }
  }

  const totalIncome = params.assetSummaries.reduce((s, a) => s + a.annualRentalIncome, 0);
  const maxAssetIncome = params.assetSummaries.reduce(
    (max, a) => Math.max(max, a.annualRentalIncome),
    0,
  );
  const largestSingleAssetRentalIncomeSharePct =
    totalIncome > 0 ? round2((maxAssetIncome / totalIncome) * 100) : null;

  const totalExpenses = params.assetSummaries.reduce((s, a) => s + a.annualOperatingExpenses, 0);
  const maxAssetExpense = params.assetSummaries.reduce(
    (max, a) => Math.max(max, a.annualOperatingExpenses),
    0,
  );
  const largestSingleAssetExpenseSharePct =
    totalExpenses > 0 ? round2((maxAssetExpense / totalExpenses) * 100) : null;

  const totalPossibleDays = params.assetSummaries.reduce((s, a) => s + a.totalDaysInPeriod, 0);
  const totalVacantDays = params.assetSummaries.reduce((s, a) => s + a.vacantDaysInPeriod, 0);
  const portfolioVacancyExposurePct =
    totalPossibleDays > 0 ? round2((totalVacantDays / totalPossibleDays) * 100) : null;

  return {
    analysisId,
    portfolioId: params.portfolioId,
    reportingCurrency: params.reportingCurrency,
    valuationBasis: params.valuationBasis,
    totalAssetsCount: params.assetSummaries.length,
    assetsWithValidValueCount: valuedAssets.length,
    assetsMissingValueIds,
    totalValuedPortfolioAmount,
    geographicAllocationByCity,
    propertyCategoryAllocation,
    residentialVsCommercialAllocation: {
      residentialSharePct:
        totalValuedPortfolioAmount > 0
          ? round2((residentialAmount / totalValuedPortfolioAmount) * 100)
          : 0,
      commercialAndOtherSharePct:
        totalValuedPortfolioAmount > 0
          ? round2((commercialAndOtherAmount / totalValuedPortfolioAmount) * 100)
          : 0,
    },
    rentalVsNonRentalAllocation: {
      rentalProducingAssetCount,
      nonRentalAssetCount,
    },
    concentrationMetrics: {
      largestSingleAssetValueSharePct,
      assetValueHerfindahlHirschmanIndex: valuedAssets.length > 0 ? round2(hhiSum) : null,
      largestSingleAssetRentalIncomeSharePct,
      largestSingleAssetExpenseSharePct,
      portfolioVacancyExposurePct,
      concentrationFormulas: {
        herfindahlHirschmanIndex: 'sum((AssetValue_i / TotalValuedPortfolio)^2) * 10000',
        largestSingleAssetSharePct: 'max(AssetValue_i / TotalValuedPortfolio) * 100',
        portfolioVacancyExposurePct: '(TotalPortfolioVacantDays / TotalPortfolioObservedDays) * 100',
      },
    },
    nonLossGuaranteeDisclaimer:
      'DIVERSIFICATION_DISCLAIMER: Allocation and concentration metrics describe portfolio structure and never guarantee protection against financial loss.',
    methodologyVersion: CURRENT_INVESTMENT_METHODOLOGY_VERSION,
    createdAt: params.nowTs,
  };
}

/**
 * Section 16: Explainable Investment Risk Factor Analysis (No arbitrary risk scores, no tenant profiling)
 */
export function evaluatePortfolioRiskIndicators(params: {
  portfolioId: string;
  allocation: PortfolioAllocationAndConcentrationResult;
  assetSummaries: AssetAnalyticalSummaryForPortfolio[];
  nowTs: NormalizedTimestamp;
}): InvestmentRiskAnalysisResult {
  const riskAnalysisId = `prisk_${crypto.randomBytes(6).toString('hex')}`;
  const indicators: ExplainableRiskIndicatorItem[] = [];

  // 1. Vacancy Exposure Risk
  const vacPct = params.allocation.concentrationMetrics.portfolioVacancyExposurePct;
  indicators.push({
    indicatorCode: 'VACANCY_EXPOSURE_RISK',
    riskBasis: 'OBSERVED_EVIDENCE',
    qualitativeSeverity:
      vacPct === null
        ? 'INSUFFICIENT_EVIDENCE'
        : vacPct > 20
          ? 'ELEVATED_OBSERVED_EXPOSURE'
          : vacPct > 8
            ? 'MODERATE_OBSERVED_EXPOSURE'
            : 'LOW_OBSERVED_EXPOSURE',
    observedMetricValue: vacPct,
    measurementUnit: 'PERCENT_VACANT_DAYS',
    evidenceSummary:
      vacPct !== null
        ? `Observed portfolio vacancy rate is ${vacPct}% of total property-days.`
        : 'Occupancy/vacancy day tracking is unavailable for the portfolio period.',
    limitations: ['Reflects historical observed vacancy days; does not predict future tenant turnover.'],
  });

  // 2. Rental Income Concentration Risk
  const rentConc = params.allocation.concentrationMetrics.largestSingleAssetRentalIncomeSharePct;
  indicators.push({
    indicatorCode: 'RENTAL_INCOME_CONCENTRATION_RISK',
    riskBasis: 'OBSERVED_EVIDENCE',
    qualitativeSeverity:
      rentConc === null
        ? 'INSUFFICIENT_EVIDENCE'
        : rentConc >= 60
          ? 'ELEVATED_OBSERVED_EXPOSURE'
          : rentConc >= 35
            ? 'MODERATE_OBSERVED_EXPOSURE'
            : 'LOW_OBSERVED_EXPOSURE',
    observedMetricValue: rentConc,
    measurementUnit: 'PERCENT_OF_PORTFOLIO_RENT',
    evidenceSummary:
      rentConc !== null
        ? `Largest single income-producing asset accounts for ${rentConc}% of total portfolio rental income.`
        : 'No rental income observed across portfolio assets.',
    limitations: ['Based on observed rental collections within the reporting window.'],
  });

  // 3. Geographic Concentration Risk
  const cityShares = Object.values(params.allocation.geographicAllocationByCity).map(
    (c) => c.sharePct,
  );
  const maxCityShare = cityShares.length > 0 ? Math.max(...cityShares) : null;
  indicators.push({
    indicatorCode: 'GEOGRAPHIC_CONCENTRATION_RISK',
    riskBasis: 'OBSERVED_EVIDENCE',
    qualitativeSeverity:
      maxCityShare === null
        ? 'INSUFFICIENT_EVIDENCE'
        : maxCityShare >= 80
          ? 'ELEVATED_OBSERVED_EXPOSURE'
          : maxCityShare >= 50
            ? 'MODERATE_OBSERVED_EXPOSURE'
            : 'LOW_OBSERVED_EXPOSURE',
    observedMetricValue: maxCityShare,
    measurementUnit: 'PERCENT_IN_SINGLE_CITY',
    evidenceSummary:
      maxCityShare !== null
        ? `Top city exposure represents ${maxCityShare}% of valued portfolio assets.`
        : 'Insufficient valued assets to determine geographic share.',
    limitations: ['Evaluated on assets with non-missing valuation basis.'],
  });

  // 4. Building Age Exposure Risk
  const ages = params.assetSummaries
    .map((a) => a.asset.buildingAgeYears)
    .filter((v): v is number => typeof v === 'number' && v >= 0);
  const olderAssetsCount = ages.filter((age) => age > 20).length;
  const olderSharePct = ages.length > 0 ? round2((olderAssetsCount / ages.length) * 100) : null;
  indicators.push({
    indicatorCode: 'BUILDING_AGE_EXPOSURE_RISK',
    riskBasis: 'OBSERVED_EVIDENCE',
    qualitativeSeverity:
      olderSharePct === null
        ? 'INSUFFICIENT_EVIDENCE'
        : olderSharePct >= 50
          ? 'ELEVATED_OBSERVED_EXPOSURE'
          : olderSharePct > 0
            ? 'MODERATE_OBSERVED_EXPOSURE'
            : 'LOW_OBSERVED_EXPOSURE',
    observedMetricValue: olderSharePct,
    measurementUnit: 'PERCENT_ASSETS_OVER_20_YEARS',
    evidenceSummary:
      olderSharePct !== null
        ? `${olderSharePct}% of assets with known building age are older than 20 years.`
        : 'Building age metadata is unavailable.',
    limitations: ['Building age alone does not capture structural renovation quality.'],
  });

  // 5. Valuation Uncertainty and Staleness Risk
  const staleOrMissingValCount = params.assetSummaries.filter(
    (a) => !a.valuation || a.valuation.isStale || a.valuation.confidenceGrade === 'LOW',
  ).length;
  const staleSharePct =
    params.assetSummaries.length > 0
      ? round2((staleOrMissingValCount / params.assetSummaries.length) * 100)
      : null;
  indicators.push({
    indicatorCode: 'VALUATION_UNCERTAINTY_AND_STALENESS_RISK',
    riskBasis: 'OBSERVED_EVIDENCE',
    qualitativeSeverity:
      staleSharePct === null
        ? 'INSUFFICIENT_EVIDENCE'
        : staleSharePct >= 50
          ? 'ELEVATED_OBSERVED_EXPOSURE'
          : staleSharePct > 0
            ? 'MODERATE_OBSERVED_EXPOSURE'
            : 'LOW_OBSERVED_EXPOSURE',
    observedMetricValue: staleSharePct,
    measurementUnit: 'PERCENT_ASSETS_WITH_STALE_OR_MISSING_VALUATION',
    evidenceSummary:
      staleSharePct !== null
        ? `${staleOrMissingValCount} of ${params.assetSummaries.length} assets (${staleSharePct}%) have missing, stale, or low-confidence valuation estimates.`
        : 'No assets in portfolio.',
    limitations: ['Consumes valuation metadata directly from the Valuation module.'],
  });

  // 6. Data Quality & Completeness Risk
  const missingValCount = params.allocation.assetsMissingValueIds.length;
  indicators.push({
    indicatorCode: 'DATA_QUALITY_AND_COMPLETENESS_RISK',
    riskBasis: 'OBSERVED_EVIDENCE',
    qualitativeSeverity:
      missingValCount > 0 ? 'MODERATE_OBSERVED_EXPOSURE' : 'LOW_OBSERVED_EXPOSURE',
    observedMetricValue: missingValCount,
    measurementUnit: 'ASSET_COUNT_MISSING_VALUE_BASIS',
    evidenceSummary: `${missingValCount} portfolio asset(s) lack a valid value on basis ${params.allocation.valuationBasis}.`,
    limitations: ['Assets with missing values are excluded from value-weighted denominators rather than treated as zero.'],
  });

  return {
    riskAnalysisId,
    portfolioId: params.portfolioId,
    indicators,
    tenantPrivacyAndNonCreditworthinessDisclaimer:
      'PRIVACY_AND_RISK_INVARIANT: Risk indicators use only aggregated lease/property metrics and never profile individual tenants, infer tenant creditworthiness, or expose personal data.',
    nonProfitabilityGuaranteeDisclaimer:
      'NO_INVESTMENT_GUARANTEE: Analytical risk indicators describe historical and structural exposures and never guarantee safety or future profitability.',
    methodologyVersion: CURRENT_INVESTMENT_METHODOLOGY_VERSION,
    createdAt: params.nowTs,
  };
}

/**
 * Section 17: Benchmarking and Market Comparison
 */
export function comparePortfolioAgainstMarketBenchmark(params: {
  portfolioId: string;
  portfolioCategory: string;
  reportingPeriodKey: string;
  portfolioCurrency: SupportedCurrencyCode;
  portfolioGrossYieldPct: number | null;
  portfolioVacancyRatePct: number | null;
  benchmark: MarketBenchmarkSnapshot | null;
}) {
  if (!params.benchmark) {
    return {
      compatible: false,
      status: 'BENCHMARK_UNAVAILABLE' as const,
      incompatibilityReason: 'No authoritative Market Intelligence benchmark record available for the requested geography, category, and period.',
      portfolioMetrics: {
        grossRentalYieldPct: params.portfolioGrossYieldPct,
        vacancyRatePct: params.portfolioVacancyRatePct,
      },
      benchmarkMetrics: null,
      nonPredictiveDisclaimer:
        'BENCHMARK_DISCLAIMER: Market-wide averages describe aggregate observations and never predict an individual property or portfolio outcome.',
    };
  }

  const categoryMatches = params.benchmark.propertyCategory === params.portfolioCategory;
  const periodMatches = params.benchmark.reportingPeriodKey === params.reportingPeriodKey;
  const currencyMatches = params.benchmark.currency === params.portfolioCurrency;
  const compatible = categoryMatches && periodMatches && currencyMatches;

  return {
    compatible,
    status: compatible ? ('COMPATIBLE_COMPARISON' as const) : ('INCOMPATIBLE_BENCHMARK_DIMENSIONS' as const),
    ...(!compatible
      ? {
          incompatibilityReason: `Dimension mismatch: categoryMatches=${categoryMatches}, periodMatches=${periodMatches}, currencyMatches=${currencyMatches}.`,
        }
      : {}),
    portfolioMetrics: {
      grossRentalYieldPct: params.portfolioGrossYieldPct,
      vacancyRatePct: params.portfolioVacancyRatePct,
    },
    benchmarkMetrics: {
      benchmarkId: params.benchmark.benchmarkId,
      geographicEntityId: params.benchmark.geographicEntityId,
      propertyCategory: params.benchmark.propertyCategory,
      reportingPeriodKey: params.benchmark.reportingPeriodKey,
      medianGrossRentalYieldPct: params.benchmark.medianGrossRentalYieldPct,
      salePricePeriodChangePct: params.benchmark.salePricePeriodChangePct,
      rentalRatePeriodChangePct: params.benchmark.rentalRatePeriodChangePct,
      medianVacancyRatePct: params.benchmark.medianVacancyRatePct,
      sampleSize: params.benchmark.sampleSize,
      methodologyVersion: params.benchmark.methodologyVersion,
      sourceCoverageNote: params.benchmark.sourceCoverageNote,
    },
    yieldSpreadVsBenchmarkPctPoints:
      compatible &&
      params.portfolioGrossYieldPct !== null &&
      params.benchmark.medianGrossRentalYieldPct !== null
        ? round2(params.portfolioGrossYieldPct - params.benchmark.medianGrossRentalYieldPct)
        : null,
    nonPredictiveDisclaimer:
      'BENCHMARK_DISCLAIMER: Market-wide averages describe aggregate observations and never predict an individual property or portfolio outcome.',
  };
}
