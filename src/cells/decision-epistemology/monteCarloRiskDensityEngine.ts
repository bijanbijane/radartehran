/**
 * @file monteCarloRiskDensityEngine.ts
 * @module cells/decision-epistemology
 * @description CASPER Monte Carlo Value-at-Risk (VaR), Merton Jump-Diffusion,
 * Liquidity-Haircut Adjusted Real VaR, and Downside Tail Risk (Sortino/CVaR) Engine.
 */

import { INITIAL_NEIGHBORHOODS, Neighborhood } from '../../data/neighborhoods';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { FAST_SALE_FACTOR } from '../../data/hedonicPricingEngine';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';

export interface MonteCarloSimulationConfig {
  horizonMonths: number;
  trialCount: number;
  annualDriftMu: number;
  annualVolSigma: number;
  annualInflationRate: number;
  jumpIntensityLambda: number;
  jumpMeanSize: number;
}

export interface MonteCarloDistributionBucket {
  nominalReturnPercent: number;
  realReturnPercent: number;
  frequency: number;
  densityPercent: number;
}

export interface ValueAtRiskMetrics {
  nominalMedianReturnPct: number;
  realMedianReturnPct: number;
  var95NominalPct: number;
  var95RealPct: number;
  illiquidityAdjustedVaR95RealPct: number; // Real VaR95 including emergency fast-sale haircut (12%)
  cvar95RealPct: number;
  probRealCapitalLossPct: number;
  maxSimulatedDrawdownPct: number;
  tailAsymmetryRatio: number; // Ratio of CVaR95 to VaR95 measuring tail fatness
  sortinoRatio: number;
  sharpeRatio: number;
  riskVerdict: 'DEFENSIVE_HAVEN' | 'MODERATE_VOLATILITY' | 'HIGH_TAIL_RISK';
  riskVerdictFa: string;
  strategicAdviceFa: string;
}

export interface CasperMonteCarloRiskReport {
  hoodId: number;
  hoodName: string;
  cityId: string;
  basePriceSqm: number;
  config: MonteCarloSimulationConfig;
  metrics: ValueAtRiskMetrics;
  distributionBuckets: MonteCarloDistributionBucket[];
  generatedAtIso: string;
}

function resolveNeighborhood(cityId: string, hoodId: number, fallbackName?: string): Neighborhood {
  const safeCity = (cityId in MULTI_CITY_CONFIGS ? cityId : 'tehran') as CityId;
  const hoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  const match = hoods.find((h) => h.id === hoodId || (fallbackName && h.name === fallbackName));
  return match ?? hoods[0] ?? INITIAL_NEIGHBORHOODS[0];
}

function nextUniform(seedRef: { value: number }): number {
  seedRef.value = (seedRef.value * 1664525 + 1013904223) % 4294967296;
  return Math.max(1e-7, Math.min(0.9999999, seedRef.value / 4294967296));
}

/**
 * Deterministic pseudo-random Gaussian generator (Box-Muller transform with seed).
 */
function pseudoGaussian(seedRef: { value: number }): number {
  const u1 = nextUniform(seedRef);
  const u2 = nextUniform(seedRef);
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Runs 1,000 Merton Jump-Diffusion simulation trials for the specified property,
 * challenging frictionless paper VaR by quantifying Illiquidity-Adjusted Real VaR.
 */
export function simulateMertonJumpDiffusionVaR(
  basePriceSqm: number,
  config: Partial<MonteCarloSimulationConfig> = {},
  initialSeed: number = 42
): { metrics: ValueAtRiskMetrics; distributionBuckets: MonteCarloDistributionBucket[] } {
  const safePrice = Math.max(40, Math.min(400, Number(basePriceSqm) || 120));
  const defaultSigma = Number((0.18 + ((safePrice - 60) / 300) * 0.14).toFixed(3));
  const resolvedConfig: MonteCarloSimulationConfig = {
    horizonMonths: config.horizonMonths ?? 12,
    trialCount: Math.max(200, Math.min(2000, config.trialCount ?? 1000)),
    annualDriftMu: config.annualDriftMu ?? 0.38,
    annualVolSigma: config.annualVolSigma ?? defaultSigma,
    annualInflationRate: config.annualInflationRate ?? 0.42,
    jumpIntensityLambda: config.jumpIntensityLambda ?? 0.45,
    jumpMeanSize: config.jumpMeanSize ?? 0.22,
  };

  const dt = resolvedConfig.horizonMonths / 12.0;
  const seedRef = { value: Math.abs(initialSeed) || 42 };
  const nominalReturns: number[] = [];
  const realReturns: number[] = [];

  const mu = resolvedConfig.annualDriftMu;
  const sigma = resolvedConfig.annualVolSigma;
  const lambda = resolvedConfig.jumpIntensityLambda;
  const jumpMean = resolvedConfig.jumpMeanSize;
  const cumulativeInflation = Math.pow(1 + resolvedConfig.annualInflationRate, dt) - 1;

  for (let i = 0; i < resolvedConfig.trialCount; i++) {
    const z = pseudoGaussian(seedRef);
    // Independent uniform draw for Poisson jump trigger (decoupled from Box-Muller u2)
    const jumpUniform = nextUniform(seedRef);
    const jumpOccurred = jumpUniform < Math.min(0.95, lambda * dt);
    const jumpImpact = jumpOccurred ? Math.max(-0.18, jumpMean + pseudoGaussian(seedRef) * 0.10) : 0;

    // Merton Jump-Diffusion log-return
    const logReturn = (mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z + jumpImpact;
    const nominalReturnPct = (Math.exp(logReturn) - 1) * 100;
    const realReturnPct = (((1 + nominalReturnPct / 100) / (1 + cumulativeInflation)) - 1) * 100;

    nominalReturns.push(nominalReturnPct);
    realReturns.push(realReturnPct);
  }

  nominalReturns.sort((a, b) => a - b);
  realReturns.sort((a, b) => a - b);

  const n = resolvedConfig.trialCount;
  const medianNominal = nominalReturns[Math.floor(n * 0.5)];
  const medianReal = realReturns[Math.floor(n * 0.5)];

  // 95% Value-at-Risk (5th percentile of distribution)
  const p05Idx = Math.floor(n * 0.05);
  const var95NominalPct = Number((-nominalReturns[p05Idx]).toFixed(1));
  const var95RealPct = Number((-realReturns[p05Idx]).toFixed(1));

  // Illiquidity-Adjusted Real VaR: incorporates FAST_SALE_FACTOR (12% emergency exit discount) + 2% closing friction
  const p05RealFactor = Math.max(0.1, 1 + realReturns[p05Idx] / 100);
  const illiquidExitRealFactor = p05RealFactor * FAST_SALE_FACTOR * 0.98;
  const illiquidityAdjustedVaR95RealPct = Number(((1 - illiquidExitRealFactor) * 100).toFixed(1));

  // Conditional VaR (Expected Shortfall): average of the worst 5% trials
  const worst5Real = realReturns.slice(0, p05Idx + 1);
  const cvar95RealPct = Number((-(worst5Real.reduce((acc, v) => acc + v, 0) / worst5Real.length)).toFixed(1));
  const tailAsymmetryRatio = Number((Math.abs(cvar95RealPct) / Math.max(1, Math.abs(var95RealPct))).toFixed(2));

  const lossTrials = realReturns.filter((r) => r < 0).length;
  const probRealCapitalLossPct = Number(((lossTrials / n) * 100).toFixed(1));
  const maxSimulatedDrawdownPct = Number((-nominalReturns[0]).toFixed(1));

  const meanReal = realReturns.reduce((acc, v) => acc + v, 0) / n;
  const varianceReal = realReturns.reduce((acc, v) => acc + Math.pow(v - meanReal, 2), 0) / n;
  const stdReal = Math.sqrt(varianceReal);
  const sharpeRatio = Number((meanReal / Math.max(0.01, stdReal)).toFixed(2));

  const downsideDev = Math.sqrt(realReturns.reduce((acc, v) => acc + (v < 0 ? Math.pow(v, 2) : 0), 0) / n);
  const sortinoRatio = Number((meanReal / Math.max(0.01, downsideDev)).toFixed(2));

  let riskVerdict: ValueAtRiskMetrics['riskVerdict'] = 'MODERATE_VOLATILITY';
  let riskVerdictFa = 'نوسان‌پذیری متوازن و مدیریت‌شده';
  let strategicAdviceFa = '';

  if (probRealCapitalLossPct <= 20 && var95RealPct <= 10) {
    riskVerdict = 'DEFENSIVE_HAVEN';
    riskVerdictFa = 'پناهگاه امن دفاعی ثروت (Defensive Wealth Haven)';
    strategicAdviceFa = 'احتمال حفظ ارزش واقعی سرمایه در برابر تورم عمومی بسیار بالاست؛ بتای شوک ارزی پوشش‌دهنده ریسک نوسان بازار است.';
  } else if (probRealCapitalLossPct >= 45 || var95RealPct >= 22) {
    riskVerdict = 'HIGH_TAIL_RISK';
    riskVerdictFa = 'ریسک دم‌بلند و کشش نزولی بالا (High Tail Risk)';
    strategicAdviceFa = 'در سناریوهای رکود معاملاتی و خروج اضطراری (نرخ فروش فوری v6.4)، زیان حقیقی نقدشوندگی قابل‌توجه است؛ حفظ پوزیشن نیازمند افق بلندمدت است.';
  } else {
    riskVerdict = 'MODERATE_VOLATILITY';
    riskVerdictFa = 'نوسان‌پذیری متعادل با پوشش تورمی نسبی';
    strategicAdviceFa = 'بازده انتظاری دارایی در بلندمدت با تورم عمومی همگام است، اما در افق کوتاه‌مدت ۱۲ ماهه شکاف بین VaR کاغذی و VaR نقدشوندگی نیازمند صبوری است.';
  }

  const minNom = nominalReturns[0];
  const maxNom = nominalReturns[n - 1];
  const step = Math.max(0.01, (maxNom - minNom) / 7);
  const distributionBuckets: MonteCarloDistributionBucket[] = [];

  for (let b = 0; b < 7; b++) {
    const bStart = minNom + b * step;
    const bEnd = bStart + step;
    const count = nominalReturns.filter((r) => r >= bStart && (b === 6 ? r <= bEnd : r < bEnd)).length;
    const midNom = (bStart + bEnd) / 2;
    const midReal = (((1 + midNom / 100) / (1 + cumulativeInflation)) - 1) * 100;

    distributionBuckets.push({
      nominalReturnPercent: Number(midNom.toFixed(1)),
      realReturnPercent: Number(midReal.toFixed(1)),
      frequency: count,
      densityPercent: Number(((count / n) * 100).toFixed(1)),
    });
  }

  return {
    metrics: {
      nominalMedianReturnPct: Number(medianNominal.toFixed(1)),
      realMedianReturnPct: Number(medianReal.toFixed(1)),
      var95NominalPct,
      var95RealPct,
      illiquidityAdjustedVaR95RealPct,
      cvar95RealPct,
      probRealCapitalLossPct,
      maxSimulatedDrawdownPct,
      tailAsymmetryRatio,
      sortinoRatio,
      sharpeRatio,
      riskVerdict,
      riskVerdictFa,
      strategicAdviceFa,
    },
    distributionBuckets,
  };
}

export function generateCasperMonteCarloRiskReport(
  hoodId: number,
  hoodName?: string,
  cityId: string = 'tehran',
  basePriceSqm?: number,
  horizonMonths: number = 12
): CasperMonteCarloRiskReport {
  const hood = resolveNeighborhood(cityId, hoodId, hoodName);
  const resolvedPrice = basePriceSqm ?? hood.buyPerSqm ?? 120;
  const agg = aggregateNeighborhoodMarketMetrics(hood.id, hood.name, resolvedPrice, buildNeighborhoodListingSamples(hood));
  const iqrSpreadRatio = Math.max(0.06, Math.min(0.28, (agg.iqrHighPerSqm - agg.iqrLowPerSqm) / Math.max(1, agg.estimatedDealPricePerSqm)));
  const tierSigma = resolvedPrice >= 170 ? 0.28 : resolvedPrice >= 100 ? 0.21 : 0.16;
  const annualVolSigma = Number(Math.min(0.38, tierSigma + iqrSpreadRatio * 0.25).toFixed(3));
  const annualDriftMu = resolvedPrice >= 170 ? 0.42 : resolvedPrice >= 100 ? 0.38 : 0.34;

  const simConfig: Partial<MonteCarloSimulationConfig> = {
    horizonMonths,
    trialCount: 1000,
    annualDriftMu,
    annualVolSigma,
    annualInflationRate: 0.40,
    jumpIntensityLambda: resolvedPrice >= 170 ? 0.55 : 0.35,
    jumpMeanSize: 0.22,
  };

  const simResult = simulateMertonJumpDiffusionVaR(resolvedPrice, simConfig, hood.id * 101);

  return {
    hoodId: hood.id,
    hoodName: hood.name,
    cityId,
    basePriceSqm: resolvedPrice,
    config: {
      horizonMonths,
      trialCount: 1000,
      annualDriftMu,
      annualVolSigma,
      annualInflationRate: 0.40,
      jumpIntensityLambda: simConfig.jumpIntensityLambda!,
      jumpMeanSize: simConfig.jumpMeanSize!,
    },
    metrics: simResult.metrics,
    distributionBuckets: simResult.distributionBuckets,
    generatedAtIso: new Date().toISOString(),
  };
}
