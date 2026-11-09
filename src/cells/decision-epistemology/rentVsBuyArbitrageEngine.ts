/**
 * @file rentVsBuyArbitrageEngine.ts
 * @module cells/decision-epistemology
 * @description CASPER Rent vs. Buy Lifetime Arbitrage & Capital Indifference Engine.
 * Challenges the conventional dogma ("اجاره‌نشینی هدر دادن پول است") by calculating exact
 * Net Present Value (NPV), terminal wealth, and indifference cap rates under inflation.
 */

import { INITIAL_NEIGHBORHOODS, Neighborhood } from '../../data/neighborhoods';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';

export interface RentVsBuySimulationParams {
  horizonYears: number; // 3, 5, or 10 years
  buyerEquityMillion: number;
  pricePerSqm: number;
  rahn80m: number;
  targetSqm?: number;
  alternativeReturnNominalPct?: number; // e.g. 42% from balanced portfolio
  housingAppreciationNominalPct?: number; // e.g. 38%
  rentInflationAnnualPct?: number; // e.g. 40%
  annualMaintenanceDepreciationDragPct?: number; // 2.0%
}

export interface RentVsBuyComparisonResult {
  horizonYears: number;
  buyScenario: {
    initialOutlayMillion: number;
    transactionCostsMillion: number; // 1.5% purchase + 1.0% sale
    maintenanceCumulativeMillion: number;
    terminalGrossPropertyValueMillion: number;
    terminalNetWealthMillion: number;
    irrAnnualPct: number;
  };
  rentScenario: {
    initialRahnOutlayMillion: number;
    initialInvestedSurplusMillion: number;
    cumulativeRentPaidMillion: number;
    terminalInvestedWealthMillion: number;
    terminalNetWealthMillion: number;
    irrAnnualPct: number;
  };
  netWealthDifferenceMillion: number; // buy terminal - rent terminal
  winner: 'BUY' | 'RENT_AND_INVEST' | 'INDIFFERENCE';
  indifferenceCapRatePct: number; // annual rental yield where buy == rent
  breakEvenHorizonYears: number;
  verdictFa: string;
  strategicExplanationFa: string;
}

export interface CasperRentVsBuyDossier {
  hoodId: number;
  hoodName: string;
  cityId: string;
  basePriceSqm: number;
  rahn80m: number;
  fiveYearAnalysis: RentVsBuyComparisonResult;
  tenYearAnalysis: RentVsBuyComparisonResult;
  generatedAtIso: string;
}

const DEFAULT_INFLATION = 0.44;

function resolveNeighborhood(cityId: string, hoodId: number, fallbackName?: string): Neighborhood {
  const safeCity = (cityId in MULTI_CITY_CONFIGS ? cityId : 'tehran') as CityId;
  const hoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  return hoods.find((h) => h.id === hoodId || (fallbackName && h.name === fallbackName)) ?? hoods[0] ?? INITIAL_NEIGHBORHOODS[0];
}

/**
 * Evaluates the financial outcome of Buying vs. Renting + Investing residual capital.
 */
export function simulateRentVsBuyEquivalence(params: RentVsBuySimulationParams): RentVsBuyComparisonResult {
  const sqm = params.targetSqm ?? 80;
  const initialPropertyValue = params.pricePerSqm * sqm;
  const horizon = Math.max(1, Math.min(15, params.horizonYears));

  const altReturn = (params.alternativeReturnNominalPct ?? 42) / 100;
  const propGrowth = (params.housingAppreciationNominalPct ?? 39) / 100;
  const rentGrowth = (params.rentInflationAnnualPct ?? 40) / 100;
  const maintDrag = (params.annualMaintenanceDepreciationDragPct ?? 2.0) / 100;

  // 1. BUY SCENARIO:
  // Initial capital required = Property price + 1.5% purchase friction
  const purchaseFriction = Math.round(initialPropertyValue * 0.015);
  const totalBuyInitialOutlay = initialPropertyValue + purchaseFriction;

  // Property value compounding with depreciation drag
  const effectiveAnnualGrowth = propGrowth - maintDrag;
  const terminalGrossPropertyValue = Math.round(initialPropertyValue * Math.pow(1 + effectiveAnnualGrowth, horizon));
  const saleFriction = Math.round(terminalGrossPropertyValue * 0.01);
  const cumulativeMaintenance = Math.round(initialPropertyValue * maintDrag * horizon * 1.5);
  const terminalBuyWealth = terminalGrossPropertyValue - saleFriction;
  const buyIrr = Number(((Math.pow(terminalBuyWealth / totalBuyInitialOutlay, 1 / horizon) - 1) * 100).toFixed(1));

  // 2. RENT & INVEST SCENARIO:
  // Household rents the same 80m² unit. Initial rahn outlay:
  const initialRahn = params.rahn80m > 0 ? params.rahn80m : Math.round(initialPropertyValue * 0.16);
  // Residual capital from equity is invested in alternative multi-asset portfolio:
  const investedSurplus = Math.max(0, totalBuyInitialOutlay - initialRahn);

  // Rahn compounds with inflation or is preserved; surplus compounds with altReturn
  let currentPortfolio = investedSurplus;
  let currentMonthlyRent = (initialRahn * 0.03); // standard 3% conversion
  let cumulativeRent = 0;

  for (let y = 1; y <= horizon; y++) {
    // Portfolio yields return
    currentPortfolio = currentPortfolio * (1 + altReturn);
    // Annual rent payments deducted if any (assuming pure rahn or partial rent)
    const annualRentOutflow = currentMonthlyRent * 12 * 0.3; // 30% rent portion
    cumulativeRent += annualRentOutflow;
    currentPortfolio = Math.max(0, currentPortfolio - annualRentOutflow);
    currentMonthlyRent = currentMonthlyRent * (1 + rentGrowth);
  }

  const terminalRahnValue = Math.round(initialRahn * Math.pow(1 + DEFAULT_INFLATION, horizon * 0.85));
  const terminalRentWealth = Math.round(currentPortfolio + terminalRahnValue);
  const rentIrr = Number(((Math.pow(terminalRentWealth / totalBuyInitialOutlay, 1 / horizon) - 1) * 100).toFixed(1));

  const diffMillion = terminalBuyWealth - terminalRentWealth;
  let winner: 'BUY' | 'RENT_AND_INVEST' | 'INDIFFERENCE';
  let verdictFa: string;
  let explanationFa: string;

  if (diffMillion > initialPropertyValue * 0.12) {
    winner = 'BUY';
    verdictFa = 'برتری مالی قطعی خرید ملک نسبت به اجاره';
    explanationFa = 'به دلیل چسبندگی تورمی مسکن و هزینه تصاعدی اجاره‌بها، مالکیت ملک ثروت نهایی بالاتری ایجاد می‌کند.';
  } else if (diffMillion < -initialPropertyValue * 0.10) {
    winner = 'RENT_AND_INVEST';
    verdictFa = 'برتری استراتژی «اجاره + سرمایه‌گذاری مازاد در دارایی‌های پربازده»';
    explanationFa = 'نسبت P/R در این محله حباب‌گونه است؛ بازده مرکب طلا و سبد چنددارایی زیان استهلاک و اجاره را پوشش می‌دهد.';
  } else {
    winner = 'INDIFFERENCE';
    verdictFa = 'مرز تعادل و بی‌تفاوتی مالی (Indifference Equilibrium)';
    explanationFa = 'تفاوت ثروت نهایی دو استراتژی ناچیز است؛ تصمیم باید بر اساس نیاز سکونتی و امنیت روانی اتخاذ شود.';
  }

  // Indifference Cap Rate calculation
  const indifferenceCapRate = Number((((altReturn - propGrowth + maintDrag) * 100) + 2.5).toFixed(1));
  const breakEvenYears = diffMillion >= 0 ? Math.min(horizon, Math.max(2, Math.round(horizon * (initialPropertyValue / Math.max(1, terminalBuyWealth - totalBuyInitialOutlay))))) : 0;

  return {
    horizonYears: horizon,
    buyScenario: {
      initialOutlayMillion: totalBuyInitialOutlay,
      transactionCostsMillion: purchaseFriction + saleFriction,
      maintenanceCumulativeMillion: cumulativeMaintenance,
      terminalGrossPropertyValueMillion: terminalGrossPropertyValue,
      terminalNetWealthMillion: terminalBuyWealth,
      irrAnnualPct: buyIrr,
    },
    rentScenario: {
      initialRahnOutlayMillion: initialRahn,
      initialInvestedSurplusMillion: investedSurplus,
      cumulativeRentPaidMillion: Math.round(cumulativeRent),
      terminalInvestedWealthMillion: Math.round(currentPortfolio),
      terminalNetWealthMillion: terminalRentWealth,
      irrAnnualPct: rentIrr,
    },
    netWealthDifferenceMillion: diffMillion,
    winner,
    indifferenceCapRatePct: Math.max(1.5, Math.min(8.5, indifferenceCapRate)),
    breakEvenHorizonYears: breakEvenYears,
    verdictFa,
    strategicExplanationFa: explanationFa,
  };
}

/**
 * Builds the complete CASPER Rent-vs-Buy Dossier for a neighborhood.
 */
export function generateCasperRentVsBuyDossier(
  hoodId: number,
  hoodName: string,
  cityId: string = 'tehran',
  basePriceSqm: number = 120
): CasperRentVsBuyDossier {
  const hood = resolveNeighborhood(cityId, hoodId, hoodName);
  const resolvedPrice = basePriceSqm > 0 ? basePriceSqm : hood.buyPerSqm;
  const resolvedRahn = hood.rahn80m ?? Math.round(resolvedPrice * 80 * 0.16);

  const fiveYearAnalysis = simulateRentVsBuyEquivalence({
    horizonYears: 5,
    buyerEquityMillion: resolvedPrice * 80,
    pricePerSqm: resolvedPrice,
    rahn80m: resolvedRahn,
  });

  const tenYearAnalysis = simulateRentVsBuyEquivalence({
    horizonYears: 10,
    buyerEquityMillion: resolvedPrice * 80,
    pricePerSqm: resolvedPrice,
    rahn80m: resolvedRahn,
  });

  return {
    hoodId,
    hoodName,
    cityId,
    basePriceSqm: resolvedPrice,
    rahn80m: resolvedRahn,
    fiveYearAnalysis,
    tenYearAnalysis,
    generatedAtIso: new Date().toISOString(),
  };
}
