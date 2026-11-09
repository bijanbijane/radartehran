/**
 * @file macroPortfolioArbitrageEngine.ts
 * @module cells/decision-epistemology
 * @description CASPER Multi-Asset Portfolio Efficient Frontier & Macro Arbitrage Optimizer.
 * Formulates Markowitz-Black-Litterman asset allocation across Housing, Gold (Seke), US Dollar,
 * and Fixed-Income in Iran's inflationary macroeconomic regime.
 */

import { INITIAL_NEIGHBORHOODS, Neighborhood } from '../../data/neighborhoods';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';

export type MacroAssetClassId = 'HOUSING' | 'GOLD_COIN' | 'US_DOLLAR' | 'FIXED_INCOME';

export interface MacroAssetSpec {
  id: MacroAssetClassId;
  nameFa: string;
  nameEn: string;
  expectedAnnualReturnNominalPct: number;
  expectedAnnualVolPct: number;
  liquidityDays: number;
  cashflowYieldPct: number;
  inflationBeta: number;
}

export interface PortfolioAllocationWeights {
  housingWeightPct: number;
  goldWeightPct: number;
  usdWeightPct: number;
  fixedIncomeWeightPct: number;
}

export interface PortfolioEvaluationResult {
  weights: PortfolioAllocationWeights;
  expectedAnnualReturnNominalPct: number;
  expectedAnnualReturnRealPct: number;
  annualVolatilityPct: number;
  sharpeRatio: number;
  threeYearWealthMultiplier: number;
  maxEstimatedDrawdownPct: number;
  portfolioTierFa: string;
  strategicGuidanceFa: string;
}

export interface AssetSwapArbitrageAnalysis {
  sourceAsset: 'GOLD_COIN' | 'US_DOLLAR' | 'FIXED_INCOME';
  targetHoodName: string;
  capitalAmountMillion: number;
  transactionFrictionCostMillion: number;
  annualRentalYieldMillion: number;
  twoYearNetArbitrageAdvantageMillion: number;
  verdictFa: string;
  breakEvenMonths: number;
}

export interface CasperMacroPortfolioDossier {
  hoodId: number;
  hoodName: string;
  cityId: string;
  basePriceSqm: number;
  rahn80m: number;
  assets: Record<MacroAssetClassId, MacroAssetSpec>;
  canonicalPortfolios: {
    defensive: PortfolioEvaluationResult;
    optimalSharpe: PortfolioEvaluationResult;
    inflationHedge: PortfolioEvaluationResult;
  };
  swapAnalysis: AssetSwapArbitrageAnalysis;
  generatedAtIso: string;
}

const CORRELATION_MATRIX: Record<MacroAssetClassId, Record<MacroAssetClassId, number>> = {
  HOUSING: { HOUSING: 1.0, GOLD_COIN: 0.64, US_DOLLAR: 0.60, FIXED_INCOME: 0.04 },
  GOLD_COIN: { HOUSING: 0.64, GOLD_COIN: 1.0, US_DOLLAR: 0.88, FIXED_INCOME: 0.02 },
  US_DOLLAR: { HOUSING: 0.60, GOLD_COIN: 0.88, US_DOLLAR: 1.0, FIXED_INCOME: 0.02 },
  FIXED_INCOME: { HOUSING: 0.04, GOLD_COIN: 0.02, US_DOLLAR: 0.02, FIXED_INCOME: 1.0 },
};

const BASELINE_CPI_INFLATION = 0.44;
const RISK_FREE_RATE = 0.24;

function resolveNeighborhood(cityId: string, hoodId: number, fallbackName?: string): Neighborhood {
  const safeCity = (cityId in MULTI_CITY_CONFIGS ? cityId : 'tehran') as CityId;
  const hoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  return hoods.find((h) => h.id === hoodId || (fallbackName && h.name === fallbackName)) ?? hoods[0] ?? INITIAL_NEIGHBORHOODS[0];
}

export function buildMacroAssetSpecs(pricePerSqm: number, rahn80m: number): Record<MacroAssetClassId, MacroAssetSpec> {
  const buyCost80m = Math.max(1, pricePerSqm * 80);
  const rentalYieldPct = Number(((rahn80m * 0.36) / buyCost80m * 100).toFixed(1));
  const housingCapitalGrowth = pricePerSqm >= 170 ? 41.5 : pricePerSqm >= 100 ? 43.0 : 44.5;
  const totalHousingReturn = Number((housingCapitalGrowth + rentalYieldPct).toFixed(1));

  return {
    HOUSING: { id: 'HOUSING', nameFa: 'ملک مسکونی (مسکن)', nameEn: 'Residential Real Estate', expectedAnnualReturnNominalPct: totalHousingReturn, expectedAnnualVolPct: 19.5, liquidityDays: 75, cashflowYieldPct: rentalYieldPct, inflationBeta: 1.08 },
    GOLD_COIN: { id: 'GOLD_COIN', nameFa: 'سکه تمام بهار آزادی و طلا', nameEn: 'Emami Gold Coins & Bullion', expectedAnnualReturnNominalPct: 48.0, expectedAnnualVolPct: 31.0, liquidityDays: 1, cashflowYieldPct: 0.0, inflationBeta: 1.24 },
    US_DOLLAR: { id: 'US_DOLLAR', nameFa: 'اسکناس دلار / تتر (ارز)', nameEn: 'US Dollar Cash / USDT', expectedAnnualReturnNominalPct: 41.0, expectedAnnualVolPct: 25.5, liquidityDays: 1, cashflowYieldPct: 0.0, inflationBeta: 1.15 },
    FIXED_INCOME: { id: 'FIXED_INCOME', nameFa: 'صندوق درآمد ثابت و سپرده بانکی', nameEn: 'Fixed Income Funds (30%)', expectedAnnualReturnNominalPct: 30.0, expectedAnnualVolPct: 2.5, liquidityDays: 2, cashflowYieldPct: 30.0, inflationBeta: 0.12 },
  };
}

export function evaluatePortfolioAllocation(
  weights: PortfolioAllocationWeights,
  assets: Record<MacroAssetClassId, MacroAssetSpec>
): PortfolioEvaluationResult {
  const sumWeights = weights.housingWeightPct + weights.goldWeightPct + weights.usdWeightPct + weights.fixedIncomeWeightPct;
  const scale = sumWeights > 0 ? 100 / sumWeights : 1;

  const wH = (weights.housingWeightPct * scale) / 100;
  const wG = (weights.goldWeightPct * scale) / 100;
  const wU = (weights.usdWeightPct * scale) / 100;
  const wF = (weights.fixedIncomeWeightPct * scale) / 100;

  const retH = assets.HOUSING.expectedAnnualReturnNominalPct / 100;
  const retG = assets.GOLD_COIN.expectedAnnualReturnNominalPct / 100;
  const retU = assets.US_DOLLAR.expectedAnnualReturnNominalPct / 100;
  const retF = assets.FIXED_INCOME.expectedAnnualReturnNominalPct / 100;

  const expectedReturnNominal = wH * retH + wG * retG + wU * retU + wF * retF;
  const expectedReturnReal = (1 + expectedReturnNominal) / (1 + BASELINE_CPI_INFLATION) - 1;

  const wVec: [MacroAssetClassId, number][] = [['HOUSING', wH], ['GOLD_COIN', wG], ['US_DOLLAR', wU], ['FIXED_INCOME', wF]];
  let portfolioVariance = 0;
  for (const [idA, wA] of wVec) {
    for (const [idB, wB] of wVec) {
      portfolioVariance += wA * wB * (assets[idA].expectedAnnualVolPct / 100) * (assets[idB].expectedAnnualVolPct / 100) * CORRELATION_MATRIX[idA][idB];
    }
  }

  const annualVol = Math.sqrt(Math.max(0.0001, portfolioVariance));
  const sharpe = Number(((expectedReturnNominal - RISK_FREE_RATE) / annualVol).toFixed(2));
  const wealthMultiplier = Number(Math.pow(1 + expectedReturnNominal, 3).toFixed(2));
  const maxDrawdown = Number(Math.max(5, (annualVol * 1.645 * 100 - expectedReturnReal * 100)).toFixed(1));

  let portfolioTierFa = 'سبد متعادل با نقدشوندگی ترکیبی';
  let strategicGuidanceFa = 'توزیع بهینه میان دارایی‌های سرمایه‌ای و جریان نقدی پایدار.';

  if (wF >= 0.25) {
    portfolioTierFa = 'سبد تدافعی با نوسان کنترل‌شده';
    strategicGuidanceFa = 'مناسب برای دوره‌های تثبیت ارز و نیاز به جریان نقدینگی ماهانه بدون ریسک نوسان.';
  } else if (wH >= 0.50 && (wG + wU) >= 0.30) {
    portfolioTierFa = 'سبد ابرتورمی با پوشش کامل ارزی-ملکی (Optimal Tangency)';
    strategicGuidanceFa = 'بیشترین توان حفظ ارزش دارایی در شوک‌های جهش ارزی با تکیه بر بازده مرکب مسکن و طلا.';
  } else if ((wG + wU) >= 0.60) {
    portfolioTierFa = 'سبد پرریسک سفته‌بازانه ارزی-طلا';
    strategicGuidanceFa = 'نقدشوندگی لحظه‌ای بالا اما فاقد درآمد نقدی و به شدت آسیب‌پذیر در برابر سرکوب ارزی.';
  }

  return {
    weights: { housingWeightPct: Math.round(wH * 100), goldWeightPct: Math.round(wG * 100), usdWeightPct: Math.round(wU * 100), fixedIncomeWeightPct: Math.round(wF * 100) },
    expectedAnnualReturnNominalPct: Number((expectedReturnNominal * 100).toFixed(1)),
    expectedAnnualReturnRealPct: Number((expectedReturnReal * 100).toFixed(1)),
    annualVolatilityPct: Number((annualVol * 100).toFixed(1)),
    sharpeRatio: sharpe,
    threeYearWealthMultiplier: wealthMultiplier,
    maxEstimatedDrawdownPct: maxDrawdown,
    portfolioTierFa,
    strategicGuidanceFa,
  };
}

export function evaluateAssetSwapToHousing(
  sourceAsset: 'GOLD_COIN' | 'US_DOLLAR' | 'FIXED_INCOME',
  targetHoodName: string,
  capitalAmountMillion: number,
  rentalYieldPct: number
): AssetSwapArbitrageAnalysis {
  const frictionRate = 0.015;
  const frictionCost = Math.round(capitalAmountMillion * frictionRate);
  const netInvestedInHousing = capitalAmountMillion - frictionCost;
  const annualRentalYield = Math.round((netInvestedInHousing * rentalYieldPct) / 100);
  const twoYearRentalTotal = annualRentalYield * 2;
  const twoYearNetAdvantage = Math.round(twoYearRentalTotal - frictionCost);
  const breakEvenMonths = Math.max(2, Math.round((frictionCost / Math.max(1, annualRentalYield / 12))));

  let verdictFa = 'تبدیل کاملاً توجیه‌پذیر با جریان نقدی مثبت';
  if (breakEvenMonths > 18) {
    verdictFa = 'افق میان‌مدت ضروری است؛ هزینه اصطکاک ورود به مسکن بالاست.';
  } else if (breakEvenMonths <= 8) {
    verdictFa = 'فرصت طلایی آربیتراژ؛ بازده اجاره در کمتر از یک سال هزینه‌های معامله را جبران می‌کند.';
  }

  return {
    sourceAsset,
    targetHoodName,
    capitalAmountMillion,
    transactionFrictionCostMillion: frictionCost,
    annualRentalYieldMillion: annualRentalYield,
    twoYearNetArbitrageAdvantageMillion: twoYearNetAdvantage,
    verdictFa,
    breakEvenMonths,
  };
}

export function generateCasperMacroPortfolioDossier(
  hoodId: number,
  hoodName: string,
  cityId: string = 'tehran',
  basePriceSqm: number = 120
): CasperMacroPortfolioDossier {
  const hood = resolveNeighborhood(cityId, hoodId, hoodName);
  const resolvedPrice = basePriceSqm > 0 ? basePriceSqm : hood.buyPerSqm;
  const resolvedRahn = hood.rahn80m ?? Math.round(resolvedPrice * 80 * 0.16);

  const assets = buildMacroAssetSpecs(resolvedPrice, resolvedRahn);
  const defensive = evaluatePortfolioAllocation({ housingWeightPct: 45, goldWeightPct: 15, usdWeightPct: 10, fixedIncomeWeightPct: 30 }, assets);
  const optimalSharpe = evaluatePortfolioAllocation({ housingWeightPct: 55, goldWeightPct: 25, usdWeightPct: 15, fixedIncomeWeightPct: 5 }, assets);
  const inflationHedge = evaluatePortfolioAllocation({ housingWeightPct: 65, goldWeightPct: 25, usdWeightPct: 10, fixedIncomeWeightPct: 0 }, assets);
  const swapAnalysis = evaluateAssetSwapToHousing('GOLD_COIN', hoodName, Math.round(resolvedPrice * 80), assets.HOUSING.cashflowYieldPct);

  return {
    hoodId,
    hoodName,
    cityId,
    basePriceSqm: resolvedPrice,
    rahn80m: resolvedRahn,
    assets,
    canonicalPortfolios: { defensive, optimalSharpe, inflationHedge },
    swapAnalysis,
    generatedAtIso: new Date().toISOString(),
  };
}
