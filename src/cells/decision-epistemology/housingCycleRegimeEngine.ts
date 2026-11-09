/**
 * @file housingCycleRegimeEngine.ts
 * @module cells/decision-epistemology
 * @description CASPER Housing Market Cycle & Bubble Exhaustion Radar.
 * Classifies neighborhoods and metropolitan regions into 4 macroeconomic cycle regimes:
 * ACCUMULATION_RECOVERY, EXPANSION_SURGE, DISTRIBUTION_EXHAUSTION, and CONTRACTION_STAGNATION.
 */

import { INITIAL_NEIGHBORHOODS, Neighborhood } from '../../data/neighborhoods';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';

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
  priceToRentRatio: number; // P/R multiple (equilibrium ~ 18-22x)
  historicalMomentum6mPct: number;
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
  customSpreadPct?: number
): HousingCycleRegimeReport {
  const buyCost80m = pricePerSqm * 80;
  // Annual price-to-rahn ratio
  const priceToRentRatio = Number((buyCost80m / Math.max(1, rahn80m)).toFixed(1));

  // Inferred or provided asking-to-deal spread
  const askingToDealSpreadPct = customSpreadPct ?? (pricePerSqm >= 170 ? 14 : pricePerSqm >= 100 ? 10.5 : 7.5);

  // Inferred 6-month growth momentum proxy
  const historicalMomentum6mPct = pricePerSqm >= 160 ? 28 : pricePerSqm >= 95 ? 22 : 16;

  // Composite Cycle Score (0 to 100)
  // Higher P/R ratio, higher spread, higher momentum increase score towards exhaustion
  const prComponent = Math.min(40, Math.max(0, (priceToRentRatio - 12) * 2.5));
  const spreadComponent = Math.min(30, Math.max(0, askingToDealSpreadPct * 2.0));
  const momentumComponent = Math.min(30, Math.max(0, (historicalMomentum6mPct - 10) * 1.5));
  const cycleScore = Math.round(Math.min(99, Math.max(10, prComponent + spreadComponent + momentumComponent)));

  let regimeId: HousingCycleRegimeId;
  let regimeNameFa: string;
  let bubbleExhaustionRiskPct: number;
  let regimeDescriptionFa: string;
  let guidance: PersonaStrategicGuidance;

  if (cycleScore >= 75) {
    regimeId = 'DISTRIBUTION_EXHAUSTION';
    regimeNameFa = 'اشباع، قله چرخه و فرسایش حباب (Distribution Exhaustion)';
    bubbleExhaustionRiskPct = Math.min(92, Math.round(cycleScore * 0.95));
    regimeDescriptionFa = 'شکاف قیمت پیشنهادی تا معامله عمیق شده و نسبت قیمت به رهن در محدوده اشباع سقف تاریخی قرار دارد؛ تقاضای مصرفی توان همراهی ندارد.';
    guidance = {
      firstTimeBuyerActionFa: 'از تعقیب قیمت‌های حبابی خودداری کنید؛ صبر در برابر آگهی‌های هیجانی یا تمرکز بر فایل‌های با تخفیف بیش از ۱۲٪ توصیه می‌شود.',
      tradeUpUpgraderActionFa: 'زمان ایده‌آل برای فروش ملک قبلی پیش از فرسایش بیشتر نقدینگی، مشروط به قطعی کردن همزمان خرید واحد مقصد.',
      investorPreservationActionFa: 'ریسک بازده منفی در افق ۱۲ ماهه بالاست؛ تبدیل به دارایی‌های نقدتر یا املاک با بازده اجاره بالاتر ترجیح دارد.',
    };
  } else if (cycleScore >= 55) {
    regimeId = 'EXPANSION_SURGE';
    regimeNameFa = 'رونق پرشتاب و سرریز تورمی (Expansion Surge)';
    bubbleExhaustionRiskPct = 48;
    regimeDescriptionFa = 'سرعت گردش معاملات بالاست و تمایل به حفظ دارایی ملکی از رشد عمومی تورم پیشی می‌گیرد؛ روند قیمتی صعودی اما نوسان‌پذیر است.';
    guidance = {
      firstTimeBuyerActionFa: 'خرید سریع‌تر با اولویت متراژ کمتر یا سن بنای بالاتر برای سوار شدن بر موج تورمی پیش از پرش بعدی قیمت.',
      tradeUpUpgraderActionFa: 'تسریع در ارتقای متراژ؛ در فاز رونق، شکاف ریالی میان متراژ کوچک و بزرگ روزبه‌روز افزایش می‌یابد.',
      investorPreservationActionFa: 'حفظ موقعیت و همراهی با روند؛ بیشترین بازدهی ناشی از اهرم زمانی در این فاز محقق می‌شود.',
    };
  } else if (cycleScore >= 35) {
    regimeId = 'CONTRACTION_STAGNATION';
    regimeNameFa = 'رکود معاملاتی و چسبندگی قیمتی (Contraction Stagnation)';
    bubbleExhaustionRiskPct = 25;
    regimeDescriptionFa = 'حجم معاملات به حداقل رسیده و فروشندگان سرسخت با مقاومت در برابر کاهش اسمی، بازار را به انجماد کشانده‌اند؛ فرصت طلایی شکار تخفیف.';
    guidance = {
      firstTimeBuyerActionFa: 'بهترین فرصت برای چانه‌زنی تهاجمی (۸ تا ۱۵ درصد زیر قیمت پیشنهادی) با فروشندگانی که نیاز مبرم به نقدینگی دارند.',
      tradeUpUpgraderActionFa: 'جابه‌جایی نیازمند حوصله زیاد برای فروش واحد فعلی است؛ مبایعه‌نامه معلق و مشروط به فروش امضا کنید.',
      investorPreservationActionFa: 'انباشت تدریجی نقدینگی و شناسایی موقعیت‌های اکازیون زیر قیمت منصفانه کارشناسی (Hedonic).',
    };
  } else {
    regimeId = 'ACCUMULATION_RECOVERY';
    regimeNameFa = 'کف‌سازی تعادلی و پیش‌رونق (Accumulation Recovery)';
    bubbleExhaustionRiskPct = 12;
    regimeDescriptionFa = 'نسبت قیمت به رهن کاملاً منطقی و در کف تاریخی است؛ خریداران هوشمند به دور از هیجان رسانه‌ای در حال خرید آرام هستند.';
    guidance = {
      firstTimeBuyerActionFa: 'امن‌ترین زمان ممکن برای ورود به بازار مسکن با کمترین ریسک سقوط قیمت در افق چندساله.',
      tradeUpUpgraderActionFa: 'آسان‌ترین شرایط جابه‌جایی ملک به دلیل منطقی بودن قیمت‌های هر دو طرف معامله.',
      investorPreservationActionFa: 'ورود حداکثری با افق ۳ ساله؛ بالاترین نسبت بازده به ریسک در این مرحله ثبت می‌شود.',
    };
  }

  return {
    regimeId,
    regimeNameFa,
    cycleScore,
    bubbleExhaustionRiskPct,
    priceToRentRatio,
    historicalMomentum6mPct,
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
  basePriceSqm?: number
): CasperHousingCycleDossier {
  const hood = resolveNeighborhood(cityId, hoodId, hoodName);
  const resolvedPrice = basePriceSqm ?? hood.buyPerSqm ?? 120;
  const resolvedRahn = hood.rahn80m ?? (resolvedPrice * 80 * 0.2);
  const trafficScore = hood.trafficInfo?.trafficScore ?? hood.air ?? 7;

  const cycle = classifyHousingCycleRegime(resolvedPrice, resolvedRahn, trafficScore);

  return {
    hoodId: hood.id,
    hoodName: hood.name,
    cityId,
    basePriceSqm: resolvedPrice,
    rahn80m: resolvedRahn,
    cycle,
    generatedAtIso: new Date().toISOString(),
  };
}
