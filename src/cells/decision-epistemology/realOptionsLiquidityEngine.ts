/**
 * @file realOptionsLiquidityEngine.ts
 * @module cells/decision-epistemology
 * @description CASPER Real Options, Market Liquidity Survival, and Macro Elasticity Engine.
 * Formulates Dixit-Pindyck investment timing, exponential hazard rate liquidity half-life,
 * and USD/Gold/CPI pass-through elasticity for Iranian metropolitan real estate.
 */

import { MULTI_CITY_CONFIGS, CityId } from '../../data/multiCityData';
import { INITIAL_NEIGHBORHOODS, Neighborhood } from '../../data/neighborhoods';

export interface RealOptionsValuation {
  hurdleRateMultiplier: number;
  valueOfWaitingTomanMln: number;
  optimalAction: 'EXECUTE_IMMEDIATELY' | 'HOLD_OPTION_TO_WAIT' | 'RENEGOTIATE_TO_HURDLE';
  actionReasonFa: string;
  volatilitySigma: number;
  dividendYieldDelta: number;
  hurdlePricePerSqm: number;
}

export interface LiquiditySurvivalMetrics {
  expectedDaysOnMarket: number;
  absorptionHalfLifeDays: number;
  liquidityTier: 'INSTANT_LIQUID' | 'HEALTHY_TURNOVER' | 'STICKY_ILLIQUID' | 'FROZEN_LOCK';
  liquidityTierFa: string;
  hazardRateLambda: number;
  probSaleWithin30DaysPct: number;
  probSaleWithin60DaysPct: number;
  probSaleWithin90DaysPct: number;
  emergencyFastSaleDiscountPct: number;
}

export interface MacroElasticityProfile {
  usdExchangeRateBeta: number;
  goldCoinBeta: number;
  cpiInflationBeta: number;
  assetRole: 'CAPITAL_PRESERVATION_GOLD_MIRROR' | 'BALANCED_WEALTH_COMPOUNDER' | 'INCOME_STICKY_CONSUMPTION';
  assetRoleFa: string;
  lagMonthsToFullPassThrough: number;
  resilienceRating: 'HIGH' | 'MODERATE' | 'VULNERABLE';
  strategicRecommendationFa: string;
}

export interface CasperLiquidityAndRealOptionsReport {
  hoodId: number;
  hoodName: string;
  cityId: string;
  basePriceSqm: number;
  realOptions: RealOptionsValuation;
  liquidity: LiquiditySurvivalMetrics;
  elasticity: MacroElasticityProfile;
  generatedAtIso: string;
}

function resolveNeighborhood(cityId: string, hoodId: number, fallbackName?: string): Neighborhood {
  const safeCity = (cityId in MULTI_CITY_CONFIGS ? cityId : 'tehran') as CityId;
  const hoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  const match = hoods.find((h) => h.id === hoodId || (fallbackName && h.name === fallbackName));
  return match ?? hoods[0] ?? INITIAL_NEIGHBORHOODS[0];
}

/**
 * Standard Normal Cumulative Distribution Function approximation (Abramowitz & Stegun)
 */
function normalCdf(x: number): number {
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228;

  if (x >= 0) {
    const t = 1.0 / (1.0 + p * x);
    return 1.0 - c * Math.exp((-x * x) / 2.0) * t * (t * (t * (t * b5 + b4) + b3) + b2 + b1);
  } else {
    const t = 1.0 / (1.0 - p * x);
    return c * Math.exp((-x * x) / 2.0) * t * (t * (t * (t * b5 + b4) + b3) + b2 + b1);
  }
}

/**
 * Compute Dixit-Pindyck Real Option to Wait before entering or liquidating.
 */
export function computeDixitPindyckRealOption(
  basePriceSqm: number,
  rentalYieldDelta: number,
  volatilitySigma: number,
  riskFreeRate: number = 0.22,
  horizonMonths: number = 6
): RealOptionsValuation {
  const tau = horizonMonths / 12.0;
  const sigma = Math.max(0.12, Math.min(0.55, volatilitySigma));
  const r = Math.max(0.15, riskFreeRate);
  const delta = Math.max(0.02, Math.min(0.12, rentalYieldDelta));

  // Positive root of quadratic equation: 0.5 * sigma^2 * beta * (beta - 1) + (r - delta) * beta - r = 0
  const a = 0.5 * sigma * sigma;
  const b = r - delta - a;
  const disc = b * b + 4 * a * r;
  const beta1 = (-b + Math.sqrt(Math.max(0.0001, disc))) / (2 * a);

  // Hurdle multiplier required to overcome option value of waiting
  const hurdleRateMultiplier = Number((beta1 / Math.max(1.05, beta1 - 1)).toFixed(3));
  const hurdlePricePerSqm = Number((basePriceSqm * hurdleRateMultiplier).toFixed(1));

  // Black-Scholes styled option to delay value
  const d1 = (Math.log(basePriceSqm / (basePriceSqm * 0.95)) + (r - delta + 0.5 * sigma * sigma) * tau) / (sigma * Math.sqrt(tau));
  const d2 = d1 - sigma * Math.sqrt(tau);
  const valueOfWaitingPerSqm = basePriceSqm * Math.exp(-delta * tau) * normalCdf(d1) - (basePriceSqm * 0.95) * Math.exp(-r * tau) * normalCdf(d2);
  const valueOfWaitingTomanMln = Number((Math.max(0, valueOfWaitingPerSqm) * 85).toFixed(1)); // for standard 85m² home

  let optimalAction: RealOptionsValuation['optimalAction'] = 'HOLD_OPTION_TO_WAIT';
  let actionReasonFa = '';

  if (hurdleRateMultiplier <= 1.12) {
    optimalAction = 'EXECUTE_IMMEDIATELY';
    actionReasonFa = 'هزینه فرصت تعویق (از دست رفتن بازده اجاره و شتاب بازار) بیش از ارزش اختیار صبر است؛ ورود فوری توصیه می‌شود.';
  } else if (hurdleRateMultiplier <= 1.25) {
    optimalAction = 'RENEGOTIATE_TO_HURDLE';
    actionReasonFa = `برای پوشش نااطمینانی نوسانات، خرید نیازمند تخفیف ${toPersianPct((hurdleRateMultiplier - 1) * 100)} درصدی تا مرز آستانه است.`;
  } else {
    optimalAction = 'HOLD_OPTION_TO_WAIT';
    actionReasonFa = `نوسان بازاری بالا و بازده اجاره پایین، ارزش اختیار صبر ۶ ماهه را تا ${valueOfWaitingTomanMln} میلیون تومان افزایش داده است.`;
  }

  return {
    hurdleRateMultiplier,
    valueOfWaitingTomanMln,
    optimalAction,
    actionReasonFa,
    volatilitySigma: Number(sigma.toFixed(3)),
    dividendYieldDelta: Number(delta.toFixed(3)),
    hurdlePricePerSqm,
  };
}

/**
 * Compute exponential hazard rate liquidity survival and half-life.
 */
export function computeLiquiditySurvival(
  pricePerSqm: number,
  askingToDealSpreadPct: number,
  trafficScore: number = 7
): LiquiditySurvivalMetrics {
  // Base daily hazard rate (probability of transaction per day)
  // Higher asking-to-deal spread drastically slows down transaction velocity
  const baseVelocity = pricePerSqm > 180 ? 0.015 : pricePerSqm > 100 ? 0.024 : 0.035;
  const spreadPenalty = Math.max(0.001, (askingToDealSpreadPct / 100) * 0.08);
  const locationBonus = (trafficScore / 10) * 0.006;

  const lambda = Math.max(0.005, Math.min(0.065, baseVelocity - spreadPenalty + locationBonus));
  const expectedDaysOnMarket = Math.round(1.0 / lambda);
  const absorptionHalfLifeDays = Math.round(Math.log(2) / lambda);

  const probSaleWithin30DaysPct = Number(((1 - Math.exp(-lambda * 30)) * 100).toFixed(1));
  const probSaleWithin60DaysPct = Number(((1 - Math.exp(-lambda * 60)) * 100).toFixed(1));
  const probSaleWithin90DaysPct = Number(((1 - Math.exp(-lambda * 90)) * 100).toFixed(1));

  let liquidityTier: LiquiditySurvivalMetrics['liquidityTier'] = 'HEALTHY_TURNOVER';
  let liquidityTierFa = 'نقدشوندگی روان و متعادل';
  let emergencyFastSaleDiscountPct = 12;

  if (expectedDaysOnMarket <= 28) {
    liquidityTier = 'INSTANT_LIQUID';
    liquidityTierFa = 'نقدشوندگی برق‌آسا (زیر ۱ ماه)';
    emergencyFastSaleDiscountPct = 7;
  } else if (expectedDaysOnMarket <= 55) {
    liquidityTier = 'HEALTHY_TURNOVER';
    liquidityTierFa = 'نقدشوندگی نرمال و متعادل (۱ تا ۲ ماه)';
    emergencyFastSaleDiscountPct = 12;
  } else if (expectedDaysOnMarket <= 90) {
    liquidityTier = 'STICKY_ILLIQUID';
    liquidityTierFa = 'چسبندگی و انجماد نسبی (۲ تا ۳ ماه)';
    emergencyFastSaleDiscountPct = 18;
  } else {
    liquidityTier = 'FROZEN_LOCK';
    liquidityTierFa = 'انجماد شدید دارایی و زمان‌بری بالا (> ۳ ماه)';
    emergencyFastSaleDiscountPct = 25;
  }

  return {
    expectedDaysOnMarket,
    absorptionHalfLifeDays,
    liquidityTier,
    liquidityTierFa,
    hazardRateLambda: Number(lambda.toFixed(4)),
    probSaleWithin30DaysPct,
    probSaleWithin60DaysPct,
    probSaleWithin90DaysPct,
    emergencyFastSaleDiscountPct,
  };
}

/**
 * Compute macroeconomic elasticity profile (USD/Gold/CPI pass-through).
 */
export function computeMacroElasticity(
  pricePerSqm: number,
  rentYield: number
): MacroElasticityProfile {
  let usdExchangeRateBeta: number;
  let goldCoinBeta: number;
  let cpiInflationBeta: number;
  let assetRole: MacroElasticityProfile['assetRole'];
  let assetRoleFa: string;
  let lagMonthsToFullPassThrough: number;
  let resilienceRating: MacroElasticityProfile['resilienceRating'];
  let strategicRecommendationFa: string;

  if (pricePerSqm >= 170) {
    // Luxury Capital Preservation / Gold Mirror
    usdExchangeRateBeta = 0.92;
    goldCoinBeta = 0.88;
    cpiInflationBeta = 0.65;
    assetRole = 'CAPITAL_PRESERVATION_GOLD_MIRROR';
    assetRoleFa = 'آینه حفظ ارزش طلا و ارز (شبه‌دلار نقدینگی لوکس)';
    lagMonthsToFullPassThrough = 2;
    resilienceRating = 'HIGH';
    strategicRecommendationFa = 'حفظ سرمایه در برابر جهش‌های ناگهانی ارزی بدون حساسیت به درآمد اجاره‌ای؛ نقدشوندگی مشروط به قیمت‌گذاری منعطف.';
  } else if (pricePerSqm >= 95) {
    // Balanced Compounder
    usdExchangeRateBeta = 0.74;
    goldCoinBeta = 0.70;
    cpiInflationBeta = 0.82;
    assetRole = 'BALANCED_WEALTH_COMPOUNDER';
    assetRoleFa = 'مرکب‌ساز متوازن ثروت (رشد سرمایه‌ای با پوشش تورم)';
    lagMonthsToFullPassThrough = 4;
    resilienceRating = 'HIGH';
    strategicRecommendationFa = 'بهترین توازن تاریخی میان رشد سرمایه‌ای پایدار و تقاضای مصرفی فعال؛ جریان نقد اجاره پوشش‌دهنده رکودهای موقت.';
  } else {
    // Income Sticky / Consumption Dominant
    usdExchangeRateBeta = 0.52;
    goldCoinBeta = 0.48;
    cpiInflationBeta = 0.94;
    assetRole = 'INCOME_STICKY_CONSUMPTION';
    assetRoleFa = 'دارایی مصرفی و چسبنده به درآمد اجاره (Yield-Driven)';
    lagMonthsToFullPassThrough = 6;
    resilienceRating = rentYield > 0.05 ? 'MODERATE' : 'VULNERABLE';
    strategicRecommendationFa = 'وابستگی بالا به قدرت خرید ریالی مستأجران و شاخص تورم عمومی؛ نوسان ارزی با تأخیر ۵ تا ۷ ماهه سرریز می‌شود.';
  }

  return {
    usdExchangeRateBeta,
    goldCoinBeta,
    cpiInflationBeta,
    assetRole,
    assetRoleFa,
    lagMonthsToFullPassThrough,
    resilienceRating,
    strategicRecommendationFa,
  };
}

/**
 * Master assessment method uniting Real Options, Liquidity Survival, and Macro Elasticity.
 */
export function generateCasperLiquidityReport(
  hoodId: number,
  hoodName?: string,
  cityId: string = 'tehran',
  basePriceSqm?: number
): CasperLiquidityAndRealOptionsReport {
  const hood = resolveNeighborhood(cityId, hoodId, hoodName);
  const resolvedPrice = basePriceSqm ?? hood.buyPerSqm ?? 120;
  const rahn80m = hood.rahn80m ?? (resolvedPrice * 80 * 0.2);
  const annualRentalYield = rahn80m / Math.max(1, resolvedPrice * 80);

  const realOptions = computeDixitPindyckRealOption(
    resolvedPrice,
    annualRentalYield,
    resolvedPrice > 160 ? 0.32 : 0.24,
    0.22,
    6
  );

  const trafficScore = hood.trafficInfo?.trafficScore ?? hood.air ?? 7;
  const spreadPct = resolvedPrice > 160 ? 14 : 9.5;
  const liquidity = computeLiquiditySurvival(resolvedPrice, spreadPct, trafficScore);
  const elasticity = computeMacroElasticity(resolvedPrice, annualRentalYield);

  return {
    hoodId: hood.id,
    hoodName: hood.name,
    cityId,
    basePriceSqm: resolvedPrice,
    realOptions,
    liquidity,
    elasticity,
    generatedAtIso: new Date().toISOString(),
  };
}

function toPersianPct(val: number): string {
  return Number(val.toFixed(1)).toLocaleString('fa-IR');
}
