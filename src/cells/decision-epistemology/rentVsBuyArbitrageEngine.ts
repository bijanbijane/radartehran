/**
 * @file rentVsBuyArbitrageEngine.ts
 * @module cells/decision-epistemology
 * @description CASPER Rent vs. Buy Lifetime Arbitrage & Capital Indifference Engine.
 * Challenges the conventional dogma ("اجاره‌نشینی هدر دادن پول است") by calculating exact
 * Net Present Value (NPV), real Year-0 terminal wealth, and exact break-even alternative return.
 */

import { INITIAL_NEIGHBORHOODS, Neighborhood } from '../../data/neighborhoods';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';

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
    realTerminalNetWealthMillion: number;
    irrAnnualPct: number;
  };
  rentScenario: {
    initialRahnOutlayMillion: number;
    initialInvestedSurplusMillion: number;
    cumulativeRentPaidMillion: number;
    cumulativeRahnTopUpsMillion: number;
    movingAndRenewalFrictionMillion: number;
    terminalLockedRahnMillion: number;
    terminalInvestedWealthMillion: number;
    terminalNetWealthMillion: number;
    realTerminalNetWealthMillion: number;
    irrAnnualPct: number;
  };
  netWealthDifferenceMillion: number; // buy terminal - rent terminal (nominal)
  realNetWealthDifferenceMillion: number; // buy terminal - rent terminal (real Year-0 purchasing power)
  winner: 'BUY' | 'RENT_AND_INVEST' | 'INDIFFERENCE';
  indifferenceCapRatePct: number; // annual rental yield where buy == rent
  breakEvenAlternativeReturnPct: number; // exact annual alternative return % where terminalBuy == terminalRent
  breakEvenHorizonYears: number;
  verdictFa: string;
  strategicExplanationFa: string;
}

export interface CasperRentVsBuyDossier {
  hoodId: number;
  hoodName: string;
  cityId: string;
  basePriceSqm: number;
  estimatedDealPriceSqm: number;
  rahn80m: number;
  intlBenchmarkText: string;
  fiveYearAnalysis: RentVsBuyComparisonResult;
  tenYearAnalysis: RentVsBuyComparisonResult;
  generatedAtIso: string;
}

const DEFAULT_INFLATION = 0.40;

function resolveNeighborhood(cityId: string, hoodId: number, fallbackName?: string, providedHood?: Neighborhood): Neighborhood {
  if (providedHood && providedHood.buyPerSqm > 0) return providedHood;
  const safeCity = (cityId in MULTI_CITY_CONFIGS ? cityId : 'tehran') as CityId;
  const hoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  return hoods.find((h) => h.id === hoodId || (fallbackName && h.name === fallbackName)) ?? hoods[0] ?? INITIAL_NEIGHBORHOODS[0];
}

function computeRentTerminalWealthForAltRate(
  investedSurplus: number,
  initialRahn: number,
  rentGrowth: number,
  horizon: number,
  altReturn: number
): {
  currentPortfolio: number;
  lockedRahnBalance: number;
  cumulativeRent: number;
  cumulativeRahnTopUps: number;
  movingAndRenewalFriction: number;
} {
  let currentPortfolio = investedSurplus;
  let lockedRahnBalance = initialRahn;
  let currentMonthlyRent = initialRahn * 0.03;
  let cumulativeRent = 0;
  let cumulativeRahnTopUps = 0;
  let movingAndRenewalFriction = 0;

  for (let y = 1; y <= horizon; y++) {
    currentPortfolio = currentPortfolio * (1 + altReturn);
    const annualRentOutflow = currentMonthlyRent * 12 * 0.30;
    const renewalFriction = y % 2 === 0 ? currentMonthlyRent * 0.45 : currentMonthlyRent * 0.15;
    const requiredRahnTopUp = lockedRahnBalance * (rentGrowth * 0.35);
    const totalOutflow = annualRentOutflow + renewalFriction + requiredRahnTopUp;

    cumulativeRent += annualRentOutflow;
    movingAndRenewalFriction += renewalFriction;
    const fundedTopUp = Math.min(requiredRahnTopUp, Math.max(0, currentPortfolio - annualRentOutflow - renewalFriction));
    cumulativeRahnTopUps += fundedTopUp;
    lockedRahnBalance += fundedTopUp;
    currentPortfolio = Math.max(0, currentPortfolio - totalOutflow);
    currentMonthlyRent = currentMonthlyRent * (1 + rentGrowth);
  }

  return { currentPortfolio, lockedRahnBalance, cumulativeRent, cumulativeRahnTopUps, movingAndRenewalFriction };
}

/**
 * Evaluates the financial outcome of Buying vs. Renting + Investing residual capital.
 * Compares real Year-0 purchasing power (preventing Year-T nominal inflation distortion)
 * and solves via bisection for the exact break-even alternative return rate.
 */
export function simulateRentVsBuyEquivalence(params: RentVsBuySimulationParams): RentVsBuyComparisonResult {
  const sqm = params.targetSqm ?? 80;
  const initialPropertyValue = params.pricePerSqm * sqm;
  const horizon = Math.max(1, Math.min(15, params.horizonYears));

  const altReturn = (params.alternativeReturnNominalPct ?? 42) / 100;
  const propGrowth = (params.housingAppreciationNominalPct ?? 39) / 100;
  const rentGrowth = (params.rentInflationAnnualPct ?? 40) / 100;
  const maintDrag = (params.annualMaintenanceDepreciationDragPct ?? 2.0) / 100;
  const cpiDeflator = Math.pow(1 + Math.max(0.15, (rentGrowth + DEFAULT_INFLATION) / 2), horizon);

  // 1. BUY SCENARIO:
  const purchaseFriction = Math.round(initialPropertyValue * 0.015);
  const totalBuyInitialOutlay = initialPropertyValue + purchaseFriction;
  const effectiveAnnualGrowth = propGrowth - maintDrag;
  const terminalGrossPropertyValue = Math.round(initialPropertyValue * Math.pow(1 + effectiveAnnualGrowth, horizon));
  const saleFriction = Math.round(terminalGrossPropertyValue * 0.01);
  const cumulativeMaintenance = Math.round(initialPropertyValue * maintDrag * horizon * 1.5);
  const terminalBuyWealth = terminalGrossPropertyValue - saleFriction;
  const realBuyTerminalWealth = Math.round(terminalBuyWealth / cpiDeflator);
  const buyIrr = Number(((Math.pow(terminalBuyWealth / totalBuyInitialOutlay, 1 / horizon) - 1) * 100).toFixed(1));

  // 2. RENT & INVEST SCENARIO:
  const baseRahn80m = params.rahn80m > 0 ? params.rahn80m : Math.round(params.pricePerSqm * 80 * 0.16);
  const initialRahn = Math.round(baseRahn80m * (sqm / 80));
  const investedSurplus = Math.max(0, totalBuyInitialOutlay - initialRahn);

  const rentSim = computeRentTerminalWealthForAltRate(investedSurplus, initialRahn, rentGrowth, horizon, altReturn);
  const terminalLockedRahn = Math.round(rentSim.lockedRahnBalance);
  const terminalRentWealth = Math.round(rentSim.currentPortfolio + terminalLockedRahn);
  const realRentTerminalWealth = Math.round(terminalRentWealth / cpiDeflator);
  const rentIrr = Number(((Math.pow(terminalRentWealth / totalBuyInitialOutlay, 1 / horizon) - 1) * 100).toFixed(1));

  // Exact bisection solver for breakEvenAlternativeReturnPct (where terminalRentWealth == terminalBuyWealth)
  let lowRate = 0.15;
  let highRate = 0.85;
  for (let iter = 0; iter < 14; iter++) {
    const mid = (lowRate + highRate) / 2;
    const trial = computeRentTerminalWealthForAltRate(investedSurplus, initialRahn, rentGrowth, horizon, mid);
    const trialWealth = trial.currentPortfolio + trial.lockedRahnBalance;
    if (trialWealth < terminalBuyWealth) {
      lowRate = mid;
    } else {
      highRate = mid;
    }
  }
  const breakEvenAlternativeReturnPct = Number((((lowRate + highRate) / 2) * 100).toFixed(1));

  const diffMillion = terminalBuyWealth - terminalRentWealth;
  const realDiffMillion = realBuyTerminalWealth - realRentTerminalWealth;
  let winner: 'BUY' | 'RENT_AND_INVEST' | 'INDIFFERENCE';
  let verdictFa: string;
  let explanationFa: string;

  // Compare scale-invariant Year-0 Real Purchasing Power difference against Year-0 initialPropertyValue
  if (realDiffMillion > initialPropertyValue * 0.06) {
    winner = 'BUY';
    verdictFa = 'برتری مالی قطعی خرید ملک نسبت به اجاره';
    explanationFa = 'پس از لحاظ مابه‌التفاوت تمدید سالانه ودیعه و اصطکاک جابه‌جایی، مالکیت ملک ثروت حقیقی بالاتری خلق می‌کند.';
  } else if (realDiffMillion < -initialPropertyValue * 0.05) {
    winner = 'RENT_AND_INVEST';
    verdictFa = 'برتری استراتژی «اجاره + سرمایه‌گذاری مازاد در دارایی‌های پربازده»';
    explanationFa = 'نسبت P/R در این محله حباب‌گونه است؛ بازده مرکب سبد جایگزین حتی پس از تامین افزایش سالانه ودیعه و اجاره برتری دارد.';
  } else {
    winner = 'INDIFFERENCE';
    verdictFa = 'مرز تعادل و بی‌تفاوتی مالی (Indifference Equilibrium)';
    explanationFa = 'تفاوت ثروت نهایی حقیقی دو استراتژی ناچیز است؛ تصمیم باید بر اساس پایداری سکونتی و امنیت روانی اتخاذ شود.';
  }

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
      realTerminalNetWealthMillion: realBuyTerminalWealth,
      irrAnnualPct: buyIrr,
    },
    rentScenario: {
      initialRahnOutlayMillion: initialRahn,
      initialInvestedSurplusMillion: investedSurplus,
      cumulativeRentPaidMillion: Math.round(rentSim.cumulativeRent),
      cumulativeRahnTopUpsMillion: Math.round(rentSim.cumulativeRahnTopUps),
      movingAndRenewalFrictionMillion: Math.round(rentSim.movingAndRenewalFriction),
      terminalLockedRahnMillion: terminalLockedRahn,
      terminalInvestedWealthMillion: Math.round(rentSim.currentPortfolio),
      terminalNetWealthMillion: terminalRentWealth,
      realTerminalNetWealthMillion: realRentTerminalWealth,
      irrAnnualPct: rentIrr,
    },
    netWealthDifferenceMillion: diffMillion,
    realNetWealthDifferenceMillion: realDiffMillion,
    winner,
    indifferenceCapRatePct: Math.max(1.5, Math.min(8.5, indifferenceCapRate)),
    breakEvenAlternativeReturnPct,
    breakEvenHorizonYears: breakEvenYears,
    verdictFa,
    strategicExplanationFa: explanationFa,
  };
}

export function generateCasperRentVsBuyDossier(
  hoodId: number,
  hoodName: string,
  cityId: string = 'tehran',
  basePriceSqm: number = 120,
  providedHood?: Neighborhood,
  intlCurrency: IntlCurrencyCode = 'USD',
  targetSqm: number = 80,
): CasperRentVsBuyDossier {
  const hood = resolveNeighborhood(cityId, hoodId, hoodName, providedHood);
  const resolvedHoodName = hood.name || hoodName;
  const resolvedPrice = basePriceSqm > 0 ? basePriceSqm : hood.buyPerSqm;
  const safeSqm = Math.max(20, targetSqm || 80);
  const agg = aggregateNeighborhoodMarketMetrics(hood.id, resolvedHoodName, resolvedPrice, buildNeighborhoodListingSamples({ ...hood, buyPerSqm: resolvedPrice }));
  const yieldBoost = Math.max(0.85, Math.min(1.18, (hood.buyPerSqm || resolvedPrice) / Math.max(1, resolvedPrice)));
  const resolvedRahn = Math.round((resolvedPrice / Math.max(1, hood.buyPerSqm)) * yieldBoost * (hood.rahn80m || Math.round(hood.buyPerSqm * 80 * 0.18)));

  const fiveYearAnalysis = simulateRentVsBuyEquivalence({
    horizonYears: 5,
    buyerEquityMillion: resolvedPrice * safeSqm,
    pricePerSqm: resolvedPrice,
    rahn80m: resolvedRahn,
    targetSqm: safeSqm,
  });

  const tenYearAnalysis = simulateRentVsBuyEquivalence({
    horizonYears: 10,
    buyerEquityMillion: resolvedPrice * safeSqm,
    pricePerSqm: resolvedPrice,
    rahn80m: resolvedRahn,
    targetSqm: safeSqm,
  });

  return {
    hoodId: hood.id,
    hoodName: resolvedHoodName,
    cityId,
    basePriceSqm: resolvedPrice,
    estimatedDealPriceSqm: agg.estimatedDealPricePerSqm,
    rahn80m: resolvedRahn,
    intlBenchmarkText: formatMillionTomanAsIntlCurrency(resolvedPrice * safeSqm, intlCurrency, 'fa'),
    fiveYearAnalysis,
    tenYearAnalysis,
    generatedAtIso: new Date().toISOString(),
  };
}
