/**
 * @file realOptionsLiquidityEngine.ts
 * @module cells/decision-epistemology
 * @description CASPER Real Options, Market Liquidity Survival, and Macro Elasticity Engine.
 * Formulates Dixit-Pindyck investment timing, exponential hazard rate liquidity half-life,
 * and USD/Gold/CPI pass-through elasticity for Iranian metropolitan real estate.
 */

import { MULTI_CITY_CONFIGS, CityId } from '../../data/multiCityData';
import { INITIAL_NEIGHBORHOODS, Neighborhood, toPersianNum } from '../../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';

export interface RealOptionsValuation {
  hurdleRateMultiplier: number;
  valueOfWaitingTomanMln: number;
  optimalAction: 'EXECUTE_IMMEDIATELY' | 'HOLD_OPTION_TO_WAIT' | 'RENEGOTIATE_TO_HURDLE';
  actionReasonFa: string;
  volatilitySigma: number;
  dividendYieldDelta: number;
  hurdlePricePerSqm: number;
  buyerReservationPricePerSqm: number;
  requiredBuyerDiscountPct: number;
}

export type LiquidityTier = 'INSTANT_LIQUID' | 'HEALTHY_TURNOVER' | 'STICKY_ILLIQUID' | 'FROZEN_LOCK';

export interface LiquiditySurvivalMetrics {
  expectedDaysOnMarket: number;
  absorptionHalfLifeDays: number;
  liquidityTier: LiquidityTier;
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
  basePriceIntlText?: string;
  valueOfWaitingIntlText?: string;
  buyerReservationIntlText?: string;
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

function normalCdf(x: number): number {
  const b1 = 0.31938153, b2 = -0.356563782, b3 = 1.781477937, b4 = -1.821255978, b5 = 1.330274429, p = 0.2316419, c = 0.39894228;
  const t = 1.0 / (1.0 + p * Math.abs(x));
  const poly = c * Math.exp((-x * x) / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  return x >= 0 ? 1.0 - poly : poly;
}

export function computeDixitPindyckRealOption(
  basePriceSqm: number,
  rentalYieldDelta: number,
  volatilitySigma: number,
  riskFreeRate: number = 0.22,
  horizonMonths: number = 6,
  targetSqm: number = 85
): RealOptionsValuation {
  const tau = horizonMonths / 12.0;
  const sigma = Math.max(0.12, Math.min(0.55, volatilitySigma));
  const r = Math.max(0.15, riskFreeRate);
  const delta = Math.max(0.02, Math.min(0.12, rentalYieldDelta));

  const a = 0.5 * sigma * sigma;
  const b = r - delta - a;
  const disc = b * b + 4 * a * r;
  const beta1 = (-b + Math.sqrt(Math.max(0.0001, disc))) / (2 * a);

  const perpetualSpread = beta1 / Math.max(1.05, beta1 - 1) - 1;
  const horizonWeight = 0.55 + 0.45 * (1 - Math.exp(-1.2 * Math.max(0.05, tau)));
  const hurdleRateMultiplier = Number((1 + perpetualSpread * horizonWeight).toFixed(3));
  const hurdlePricePerSqm = Number((basePriceSqm * hurdleRateMultiplier).toFixed(1));
  const buyerReservationPricePerSqm = Number((basePriceSqm / hurdleRateMultiplier).toFixed(1));
  const requiredBuyerDiscountPct = Number(((1 - 1 / hurdleRateMultiplier) * 100).toFixed(1));

  const d1 = (Math.log(basePriceSqm / (basePriceSqm * 0.95)) + (r - delta + 0.5 * sigma * sigma) * tau) / (sigma * Math.sqrt(tau));
  const d2 = d1 - sigma * Math.sqrt(tau);
  const valueOfWaitingPerSqm = basePriceSqm * Math.exp(-delta * tau) * normalCdf(d1) - (basePriceSqm * 0.95) * Math.exp(-r * tau) * normalCdf(d2);
  const valueOfWaitingTomanMln = Number((Math.max(0, valueOfWaitingPerSqm) * Math.max(10, targetSqm)).toFixed(1));

  let optimalAction: RealOptionsValuation['optimalAction'] = 'HOLD_OPTION_TO_WAIT';
  let actionReasonFa = '';

  if (hurdleRateMultiplier <= 1.12) {
    optimalAction = 'EXECUTE_IMMEDIATELY';
    actionReasonFa = 'هزینه فرصت تعویق (از دست رفتن بازده اجاره و شتاب بازار) بیش از ارزش اختیار صبر است؛ ورود فوری توصیه می‌شود.';
  } else if (hurdleRateMultiplier <= 1.25) {
    optimalAction = 'RENEGOTIATE_TO_HURDLE';
    actionReasonFa = `برای جبران حذف اختیار صبر در این سطح نوسان، خریدار باید تا سقف متری ${toPersianNum(buyerReservationPricePerSqm)} م.ت (${toPersianNum(requiredBuyerDiscountPct)}٪ تخفیف) مذاکره کند.`;
  } else {
    optimalAction = 'HOLD_OPTION_TO_WAIT';
    actionReasonFa = `نوسان بالا و بازده اجاره پایین، ارزش اختیار صبر ${toPersianNum(horizonMonths)} ماهه را به ${toPersianNum(valueOfWaitingTomanMln)} م.ت رسانده و سقف ورود فوری خریدار را به متری ${toPersianNum(buyerReservationPricePerSqm)} م.ت کاهش داده است.`;
  }

  return {
    hurdleRateMultiplier,
    valueOfWaitingTomanMln,
    optimalAction,
    actionReasonFa,
    volatilitySigma: Number(sigma.toFixed(3)),
    dividendYieldDelta: Number(delta.toFixed(3)),
    hurdlePricePerSqm,
    buyerReservationPricePerSqm,
    requiredBuyerDiscountPct,
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
    liquidityTierFa = 'انجماد شدید دارایی و زمان‌بری بالا (بیش از ۳ ماه)';
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
    usdExchangeRateBeta = 0.92;
    goldCoinBeta = 0.88;
    cpiInflationBeta = 0.65;
    assetRole = 'CAPITAL_PRESERVATION_GOLD_MIRROR';
    assetRoleFa = 'آینه حفظ ارزش طلا و ارز (دارایی سرمایه‌ای ممتاز)';
    lagMonthsToFullPassThrough = 2;
    resilienceRating = 'HIGH';
    strategicRecommendationFa = 'حفظ سرمایه در برابر جهش‌های ناگهانی ارزی؛ نقدشوندگی نیازمند انعطاف قیمتی پای نشست است.';
  } else if (pricePerSqm >= 95) {
    usdExchangeRateBeta = 0.74;
    goldCoinBeta = 0.70;
    cpiInflationBeta = 0.82;
    assetRole = 'BALANCED_WEALTH_COMPOUNDER';
    assetRoleFa = 'مرکب‌ساز متوازن ثروت (رشد سرمایه‌ای با پوشش تورم)';
    lagMonthsToFullPassThrough = 4;
    resilienceRating = 'HIGH';
    strategicRecommendationFa = 'بهترین توازن تاریخی میان رشد سرمایه‌ای پایدار و تقاضای مصرفی فعال؛ جریان نقد اجاره پوشش‌دهنده رکودهای موقت است.';
  } else {
    usdExchangeRateBeta = 0.52;
    goldCoinBeta = 0.48;
    cpiInflationBeta = 0.94;
    assetRole = 'INCOME_STICKY_CONSUMPTION';
    assetRoleFa = 'دارایی مصرفی و متکی به بازده اجاره';
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
  basePriceSqm?: number,
  providedHood?: Neighborhood,
  intlCurrency: IntlCurrencyCode = 'USD',
  targetSqm: number = 85
): CasperLiquidityAndRealOptionsReport {
  const hood = providedHood ?? resolveNeighborhood(cityId, hoodId, hoodName);
  const resolvedPrice = basePriceSqm ?? hood.buyPerSqm ?? 120;
  const baseNeighborhoodRahn = hood.rahn80m || Math.round(hood.buyPerSqm * 80 * 0.18);
  const annualRent80m = baseNeighborhoodRahn * 0.36;
  // Property Yield on Cost: actual annual market rent divided by total acquisition cost
  const annualRentalYield = annualRent80m / Math.max(1, resolvedPrice * 80);
  const agg = aggregateNeighborhoodMarketMetrics(hood.id, hood.name, resolvedPrice, buildNeighborhoodListingSamples(hood));

  const realOptions = computeDixitPindyckRealOption(
    resolvedPrice, annualRentalYield, resolvedPrice > 160 ? 0.31 : resolvedPrice > 110 ? 0.25 : 0.21, 0.22, 6, targetSqm
  );
  const transitAndQualityScore = Math.round(((hood.metro ?? 7) + (hood.air ?? 7)) / 2);
  const computedSpread = Number((((agg.askingPricePerSqm - agg.estimatedDealPricePerSqm) / Math.max(1, agg.askingPricePerSqm)) * 100).toFixed(1));
  const spreadPct = computedSpread > 0 ? computedSpread : resolvedPrice > 160 ? 12.5 : 8.5;
  const liquidity = computeLiquiditySurvival(resolvedPrice, spreadPct, transitAndQualityScore);
  const elasticity = computeMacroElasticity(resolvedPrice, annualRentalYield);

  return {
    hoodId: hood.id, hoodName: hood.name, cityId, basePriceSqm: resolvedPrice,
    basePriceIntlText: formatMillionTomanAsIntlCurrency(resolvedPrice, intlCurrency, 'fa'),
    valueOfWaitingIntlText: formatMillionTomanAsIntlCurrency(realOptions.valueOfWaitingTomanMln, intlCurrency, 'fa'),
    buyerReservationIntlText: formatMillionTomanAsIntlCurrency(realOptions.buyerReservationPricePerSqm, intlCurrency, 'fa'),
    realOptions, liquidity, elasticity, generatedAtIso: new Date().toISOString(),
  };
}
