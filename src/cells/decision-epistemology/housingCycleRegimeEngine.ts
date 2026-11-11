/**
 * @file housingCycleRegimeEngine.ts
 * @module cells/decision-epistemology
 * @description CASPER Housing Market Cycle & Bubble Exhaustion Radar.
 * Classifies neighborhoods and metropolitan regions into 4 macroeconomic cycle regimes:
 * ACCUMULATION_RECOVERY, EXPANSION_SURGE, DISTRIBUTION_EXHAUSTION, and CONTRACTION_STAGNATION.
 */

import { INITIAL_NEIGHBORHOODS, Neighborhood } from '../../data/neighborhoods';
import { getNeighborhoodDeepInsight } from '../../data/neighborhoodInsights';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';

export type HousingCycleRegimeId =
  | 'ACCUMULATION_RECOVERY'
  | 'EXPANSION_SURGE'
  | 'DISTRIBUTION_EXHAUSTION'
  | 'CONTRACTION_STAGNATION';

export interface PersonaStrategicGuidance {
  firstTimeBuyerActionFa: string;
  tradeUpUpgraderActionFa: string;
  investorPreservationActionFa: string;
}

export interface HousingCycleRegimeReport {
  regimeId: HousingCycleRegimeId;
  regimeNameFa: string;
  cycleScore: number; // 0 (deep freeze) to 100 (extreme speculative bubble)
  bubbleExhaustionRiskPct: number; // probability that current growth is near market peak
  priceToRentRatio: number; // P/R multiple (equilibrium ~ 18-22x annual rent)
  dynamicEquilibriumPR: number; // transit & real-growth adjusted equilibrium P/R
  historicalMomentum6mPct: number;
  realMomentum6mPct: number;
  isStagflationaryIllusion: boolean;
  stagflationWarningFa: string;
  askingToDealSpreadPct: number;
  regimeDescriptionFa: string;
  guidance: PersonaStrategicGuidance;
}

export interface CasperHousingCycleDossier {
  hoodId: number;
  hoodName: string;
  cityId: string;
  basePriceSqm: number;
  rahn80m: number;
  basePriceIntlText?: string;
  rahn80mIntlText?: string;
  cycle: HousingCycleRegimeReport;
  generatedAtIso: string;
}

function resolveNeighborhood(cityId: string, hoodId: number, fallbackName?: string): Neighborhood {
  const safeCity = (cityId in MULTI_CITY_CONFIGS ? cityId : 'tehran') as CityId;
  const hoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  const match = hoods.find((h) => h.id === hoodId || (fallbackName && h.name === fallbackName));
  return match ?? hoods[0] ?? INITIAL_NEIGHBORHOODS[0];
}

/**
  * Classifies neighborhood market dynamics into one of 4 macroeconomic cycle regimes.
  */
export function classifyHousingCycleRegime(
  pricePerSqm: number,
  rahn80m: number,
  trafficScore: number = 7,
  customSpreadPct?: number,
  customMomentum6mPct?: number
): HousingCycleRegimeReport {
  const buyCost80m = pricePerSqm * 80;
  // True Price-to-Annual-Rent (P/R) ratio: purchase price divided by annual rent equivalent (rahn80m * 0.36)
  const annualRent80m = Math.max(1, rahn80m * 0.36);
  const priceToRentRatio = Number((buyCost80m / annualRent80m).toFixed(1));

  // Inferred or provided asking-to-deal spread
  const askingToDealSpreadPct = customSpreadPct ?? (pricePerSqm >= 170 ? 14 : pricePerSqm >= 100 ? 10.5 : 7.5);

  // Inferred or empirical 6-month growth momentum & CPI-deflated real momentum
  const historicalMomentum6mPct = customMomentum6mPct ?? (pricePerSqm >= 160 ? 28 : pricePerSqm >= 95 ? 22 : 16);
  const cpi6mBaselinePct = 18;
  const realMomentum6mPct = Number((historicalMomentum6mPct - cpi6mBaselinePct).toFixed(1));
  const isStagflationaryIllusion = historicalMomentum6mPct > 0 && realMomentum6mPct < 0;
  const dynamicEquilibriumPR = Number(
    (18.5 + (trafficScore - 7) * 0.8 + (realMomentum6mPct > 0 ? 1.2 : 0)).toFixed(1)
  );
  const stagflationWarningFa = isStagflationaryIllusion
    ? 'توهم پولی رکود تورمی: رشد اسمی مثبت است اما از تورم عمومی ۶ماهه (۱۸٪) جا مانده و بازده حقیقی ملک منفی است.'
    : 'رشد ۶ماهه ملک از نرخ تورم عمومی پیشی گرفته و حفظ قدرت خرید حقیقی برقرار است.';

  // Composite Cycle Score (0 to 100)
  const prComponent = Math.min(40, Math.max(0, (priceToRentRatio - 18.0) * 1.35));
  const spreadComponent = Math.min(30, Math.max(0, askingToDealSpreadPct * 2.0));
  const momentumComponent = Math.min(30, Math.max(0, (historicalMomentum6mPct - 10) * 1.5 - (trafficScore - 7) * 0.5));
  const cycleScore = Math.round(Math.min(99, Math.max(10, prComponent + spreadComponent + momentumComponent)));

  let regimeId: HousingCycleRegimeId;
  let regimeNameFa: string;
  let bubbleExhaustionRiskPct: number;
  let regimeDescriptionFa: string;
  let guidance: PersonaStrategicGuidance;

  if (cycleScore >= 75) {
    regimeId = 'DISTRIBUTION_EXHAUSTION';
    regimeNameFa = 'اشباع، قله چرخه و فرسایش حباب';
    bubbleExhaustionRiskPct = Math.min(92, Math.round(cycleScore * 0.95));
    regimeDescriptionFa = 'شکاف قیمت پیشنهادی تا معامله عمیق شده و نسبت قیمت به اجاره سالانه در محدوده اشباع قرار دارد؛ تقاضای مصرفی توان همراهی ندارد.';
    guidance = {
      firstTimeBuyerActionFa: 'از تعقیب قیمت‌های حبابی خودداری کنید؛ صبر در برابر آگهی‌های هیجانی یا تمرکز بر فایل‌های با تخفیف بیش از ۱۲٪ توصیه می‌شود.',
      tradeUpUpgraderActionFa: 'زمان ایده‌آل برای فروش ملک قبلی پیش از فرسایش بیشتر نقدینگی، مشروط به قطعی کردن همزمان خرید واحد مقصد.',
      investorPreservationActionFa: 'ریسک بازده واقعی منفی در افق ۱۲ ماهه بالاست؛ تبدیل به دارایی‌های نقدتر یا املاک با بازده اجاره بالاتر ترجیح دارد.',
    };
  } else if (cycleScore >= 55) {
    regimeId = 'EXPANSION_SURGE';
    regimeNameFa = 'رونق پرشتاب و سرریز تورمی';
    bubbleExhaustionRiskPct = 48;
    regimeDescriptionFa = 'سرعت گردش معاملات بالاست و تمایل به حفظ دارایی ملکی از رشد عمومی تورم پیشی می‌گیرد؛ روند قیمتی صعودی اما نوسان‌پذیر است.';
    guidance = {
      firstTimeBuyerActionFa: 'خرید سریع‌تر با اولویت متراژ کمتر یا سن بنای میانی برای پوشش ریسک جهش بعدی قیمت.',
      tradeUpUpgraderActionFa: 'تسریع در ارتقای متراژ؛ در فاز رونق، شکاف ریالی میان متراژ کوچک و بزرگ روزبه‌روز افزایش می‌یابد.',
      investorPreservationActionFa: 'حفظ موقعیت و همراهی با روند؛ بیشترین بازدهی ناشی از اهرم زمانی در این فاز محقق می‌شود.',
    };
  } else if (cycleScore >= 35) {
    regimeId = 'CONTRACTION_STAGNATION';
    regimeNameFa = 'رکود معاملاتی و چسبندگی قیمتی';
    bubbleExhaustionRiskPct = 25;
    regimeDescriptionFa = 'حجم معاملات کاهش یافته و فروشندگان با مقاومت در برابر کاهش اسمی، بازار را به انجماد کشانده‌اند؛ فرصت مناسب برای چانه‌زنی.';
    guidance = {
      firstTimeBuyerActionFa: 'بهترین فرصت برای چانه‌زنی تهاجمی (۸ تا ۱۵ درصد زیر قیمت پیشنهادی) با فروشندگانی که نیاز مبرم به نقدینگی دارند.',
      tradeUpUpgraderActionFa: 'جابه‌جایی نیازمند حوصله برای فروش واحد فعلی است؛ مبایعه‌نامه مشروط به تسویه مرحله‌ای تنظیم کنید.',
      investorPreservationActionFa: 'انباشت تدریجی نقدینگی و شکار فایل‌های زیر قیمت قطعی کارشناسی (v6.4).',
    };
  } else {
    regimeId = 'ACCUMULATION_RECOVERY';
    regimeNameFa = 'کف‌سازی تعادلی و پیش‌رونق';
    bubbleExhaustionRiskPct = 12;
    regimeDescriptionFa = 'نسبت قیمت به اجاره سالانه در محدوده تعادلی و بنیادی قرار دارد؛ خریداران مصرفی به دور از هیجان در حال معامله هستند.';
    guidance = {
      firstTimeBuyerActionFa: 'امن‌ترین زمان برای ورود به بازار مسکن با کمترین ریسک افت قدرت خرید در افق چندساله.',
      tradeUpUpgraderActionFa: 'شرایط متعادل جابه‌جایی ملک به دلیل نزدیک بودن قیمت‌های پیشنهادی به قیمت معامله.',
      investorPreservationActionFa: 'ورود با افق میان‌مدت؛ بالاترین نسبت بازده به ریسک در این فاز ثبت می‌شود.',
    };
  }

  return {
    regimeId,
    regimeNameFa,
    cycleScore,
    bubbleExhaustionRiskPct,
    priceToRentRatio,
    dynamicEquilibriumPR,
    historicalMomentum6mPct,
    realMomentum6mPct,
    isStagflationaryIllusion,
    stagflationWarningFa,
    askingToDealSpreadPct,
    regimeDescriptionFa,
    guidance,
  };
}

/**
 * Master generator for CASPER Housing Cycle & Regime Exhaustion Report.
 */
export function generateCasperHousingCycleReport(
  hoodId: number,
  hoodName?: string,
  cityId: string = 'tehran',
  basePriceSqm?: number,
  providedHood?: Neighborhood,
  intlCurrency: IntlCurrencyCode = 'USD',
  targetSqm: number = 80
): CasperHousingCycleDossier {
  const hood = providedHood ?? resolveNeighborhood(cityId, hoodId, hoodName);
  const resolvedPrice = basePriceSqm ?? hood.buyPerSqm ?? 120;
  const safeSqm = Math.max(20, targetSqm || 80);
  const yieldBoost = Math.max(0.85, Math.min(1.18, (hood.buyPerSqm || resolvedPrice) / Math.max(1, resolvedPrice)));
  const resolvedRahn80m = Math.round((resolvedPrice / Math.max(1, hood.buyPerSqm)) * yieldBoost * (hood.rahn80m || Math.round(hood.buyPerSqm * 80 * 0.18)));
  const resolvedRahn = Math.round(resolvedRahn80m * (safeSqm / 80));
  const transitScore = hood.metro ?? 7;
  const samples = buildNeighborhoodListingSamples({ ...hood, buyPerSqm: resolvedPrice });
  const agg = aggregateNeighborhoodMarketMetrics(hood.id, hood.name, resolvedPrice, samples);
  const insight = getNeighborhoodDeepInsight(hood);
  const computedSpread = Number((((agg.askingPricePerSqm - agg.estimatedDealPricePerSqm) / Math.max(1, agg.askingPricePerSqm)) * 100).toFixed(1));
  const empiricalSpreadPct = computedSpread > 0 ? computedSpread : undefined;
  const empiricalMomentum6mPct =
    insight?.futureGrowthScore && insight.futureGrowthScore > 0
      ? Math.round((insight.futureGrowthScore - 6.0) * 8.2)
      : undefined;

  const cycle = classifyHousingCycleRegime(
    resolvedPrice,
    resolvedRahn80m,
    transitScore,
    empiricalSpreadPct,
    empiricalMomentum6mPct
  );

  return {
    hoodId: hood.id,
    hoodName: hood.name,
    cityId,
    basePriceSqm: resolvedPrice,
    rahn80m: resolvedRahn,
    basePriceIntlText: formatMillionTomanAsIntlCurrency(resolvedPrice, intlCurrency, 'fa'),
    rahn80mIntlText: formatMillionTomanAsIntlCurrency(resolvedRahn, intlCurrency, 'fa'),
    cycle,
    generatedAtIso: new Date().toISOString(),
  };
}
