/**
 * @file unifiedDecisionSynthesisEngine.ts
 * @module cells/decision-epistemology
 * @description CASPER Unified Decision Quality & Multi-Criteria Epistemic Synthesis Engine.
 * Synthesizes all 8 underlying decision dimensions into a composite Deal Execution Readiness Index,
 * Walk-Away Price Ceiling, and actionable executive negotiation directive.
 */

import { INITIAL_NEIGHBORHOODS, Neighborhood } from '../../data/neighborhoods';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { classifyHousingCycleRegime } from './housingCycleRegimeEngine';
import { computeAkerlofLemonIndex } from './spatialContagionEngine';
import { computeDixitPindyckRealOption } from './realOptionsLiquidityEngine';
import { simulateMertonJumpDiffusionVaR } from './monteCarloRiskDensityEngine';

export type DealExecutionVerdictId =
  | 'IMMEDIATE_EXECUTION'
  | 'AGGRESSIVE_NEGOTIATION'
  | 'STRATEGIC_PATIENCE'
  | 'ABORT_HIGH_RISK';

export interface DecisionPillarScore {
  id: string;
  nameFa: string;
  score: number; // 0 to 100
  weightPct: number;
  gradeFa: string;
  detailFa: string;
}

export interface UnifiedDecisionSynthesisReport {
  hoodId: number;
  hoodName: string;
  cityId: string;
  askingPricePerSqm: number;
  fairPricePerSqm: number;
  walkAwayPriceCeilingPerSqm: number;
  targetSqm: number;
  readinessScore: number; // 0 to 100
  verdictId: DealExecutionVerdictId;
  verdictTitleFa: string;
  verdictBadgeColor: string;
  executiveDirectiveFa: string;
  targetDiscountMillion: number;
  negotiationOpeningOfferMillion: number;
  walkAwayCeilingTotalMillion: number;
  pillars: DecisionPillarScore[];
  generatedAtIso: string;
}

function resolveNeighborhood(cityId: string, hoodId: number, fallbackName?: string): Neighborhood {
  const safeCity = (cityId in MULTI_CITY_CONFIGS ? cityId : 'tehran') as CityId;
  const hoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  return hoods.find((h) => h.id === hoodId || (fallbackName && h.name === fallbackName)) ?? hoods[0] ?? INITIAL_NEIGHBORHOODS[0];
}

/**
 * Synthesizes multi-criteria real estate decision metrics into an executive verdict.
 */
export function synthesizeExecutiveDecisionReport(
  hoodId: number,
  hoodName: string,
  cityId: string = 'tehran',
  basePriceSqm: number = 120,
  customAskingPriceSqm?: number,
  targetSqm: number = 80
): UnifiedDecisionSynthesisReport {
  const hood = resolveNeighborhood(cityId, hoodId, hoodName);
  const fairPrice = basePriceSqm > 0 ? basePriceSqm : hood.buyPerSqm;
  const askingPrice = customAskingPriceSqm ?? Math.round(fairPrice * 1.085);
  const rahn80m = hood.rahn80m ?? Math.round(fairPrice * 80 * 0.16);

  // 1. Valuation Pillar: spread between asking and fair price
  const spreadPct = Number((((askingPrice - fairPrice) / fairPrice) * 100).toFixed(1));
  const valuationScore = Math.round(Math.min(100, Math.max(10, 100 - spreadPct * 6.0)));

  // 2. Cycle Pillar: bubble exhaustion inverse
  const cycleReport = classifyHousingCycleRegime(fairPrice, rahn80m);
  const cycleScore = Math.round(Math.min(100, Math.max(10, 100 - cycleReport.bubbleExhaustionRiskPct * 0.9)));

  // 3. Information Asymmetry Pillar: Akerlof index inverse
  const akerlof = computeAkerlofLemonIndex(fairPrice, spreadPct);
  const asymmetryScore = Math.round(Math.min(100, Math.max(10, 100 - akerlof.lemonIndex * 0.9)));

  // 4. Liquidity & Real Options Pillar: hurdle rate inverse
  const option = computeDixitPindyckRealOption(fairPrice, 0.22, 0.24, 0.035);
  const hurdleExcess = Math.max(0, (option.hurdleRateMultiplier - 1.25) * 100);
  const liquidityScore = Math.round(Math.min(100, Math.max(15, 95 - hurdleExcess * 0.8)));

  // 5. Downside Tail Risk Pillar: Monte Carlo VaR
  const merton = simulateMertonJumpDiffusionVaR(fairPrice, { horizonMonths: 24, trialCount: 500 }, 777);
  const downsideScore = Math.round(Math.min(100, Math.max(10, 100 - merton.metrics.probRealCapitalLossPct * 1.2)));

  // 6. Data Provenance & Epistemic Confidence Pillar
  const confidenceScore = Math.round(Math.min(100, Math.max(40, (hood.confidenceScore ?? 75) + 10)));

  const pillars: DecisionPillarScore[] = [
    { id: 'VALUATION', nameFa: 'حاشیه امنیت قیمت‌گذاری (Hedonic)', score: valuationScore, weightPct: 25, gradeFa: valuationScore >= 70 ? 'عالی' : valuationScore >= 50 ? 'متوسط' : 'پرریسک', detailFa: `شکاف قیمت پیشنهادی: ٪${spreadPct}` },
    { id: 'CYCLE', nameFa: 'رژیم چرخه مسکن و حباب‌سنجی', score: cycleScore, weightPct: 20, gradeFa: cycleScore >= 70 ? 'کف‌سازی/رشد' : cycleScore >= 50 ? 'نوسانی' : 'اشباع حباب', detailFa: cycleReport.regimeNameFa.split('(')[0].trim() },
    { id: 'ASYMMETRY', nameFa: 'تقارن اطلاعاتی و سلامت آگهی‌ها', score: asymmetryScore, weightPct: 15, gradeFa: asymmetryScore >= 70 ? 'شفاف' : 'عدم تقارن', detailFa: `شاخص آکرلوف: ${akerlof.lemonIndex} از ۱۰۰` },
    { id: 'LIQUIDITY', nameFa: 'نقدشوندگی و ارزش اختیار تعویق', score: liquidityScore, weightPct: 15, gradeFa: liquidityScore >= 70 ? 'روان' : 'انجماد نسبی', detailFa: `ضریب هردل: ${option.hurdleRateMultiplier}x` },
    { id: 'TAIL_RISK', nameFa: 'پوشش ریسک دم بلند (Merton VaR)', score: downsideScore, weightPct: 15, gradeFa: downsideScore >= 70 ? 'امن' : 'نوسان‌پذیر', detailFa: `احتمال زیان واقعی: ٪${merton.metrics.probRealCapitalLossPct}` },
    { id: 'EPISTEMIC', nameFa: 'قطعیت معرفتی داده‌های میدانی', score: confidenceScore, weightPct: 10, gradeFa: confidenceScore >= 75 ? 'مستند' : 'نیازمند استعلام', detailFa: `امتیاز اعتبارسنجی: ${confidenceScore}٪` },
  ];

  // Weighted Composite Deal Execution Readiness Score
  const readinessScore = Math.round(
    pillars.reduce((acc, p) => acc + (p.score * p.weightPct) / 100, 0)
  );

  let verdictId: DealExecutionVerdictId;
  let verdictTitleFa: string;
  let verdictBadgeColor: string;
  let executiveDirectiveFa: string;

  if (readinessScore >= 74) {
    verdictId = 'IMMEDIATE_EXECUTION';
    verdictTitleFa = 'سبز · آماده برای ورود و نهایی‌سازی معامله (Execute Now)';
    verdictBadgeColor = 'emerald';
    executiveDirectiveFa = 'ملک دارای حاشیه امنیت قیمتی مناسب، ریسک حباب پایین و شفافیت اطلاعاتی مطلوب است؛ پیشنهاد قیمت منصفانه را ارائه و به سمت اتاق قرارداد حرکت کنید.';
  } else if (readinessScore >= 58) {
    verdictId = 'AGGRESSIVE_NEGOTIATION';
    verdictTitleFa = 'آبی · چانه‌زنی تهاجمی الزامی است (Aggressive Bargain)';
    verdictBadgeColor = 'indigo';
    executiveDirectiveFa = 'فاصله قیمت پیشنهادی با ارزش کارشناسی نیازمند تعدیل ۸ تا ۱۲ درصدی است؛ تنها با پذیرش تخفیف پای قرارداد و شرط سقف قیمت وارد معامله شوید.';
  } else if (readinessScore >= 42) {
    verdictId = 'STRATEGIC_PATIENCE';
    verdictTitleFa = 'زرد · صبر استراتژیک و انباشت نقدینگی (Wait & Accumulate)';
    verdictBadgeColor = 'amber';
    executiveDirectiveFa = 'ارزش اختیار تعویق بالاست و بازار در فاز فرسایش حباب قرار دارد؛ از تعقیب قیمت فروشنده خودداری کرده و سرمایه را در سبد طلا/درآمد ثابت حفظ کنید.';
  } else {
    verdictId = 'ABORT_HIGH_RISK';
    verdictTitleFa = 'قرمز · انصراف قطعی و خروج از مذاکره (Abort / Walk Away)';
    verdictBadgeColor = 'rose';
    executiveDirectiveFa = 'ملک به شدت بیش‌قیمت‌گذاری شده و عدم تقارن اطلاعاتی و ریسک دم بلند در سقف تاریخی است؛ خرید در این شرایط تله ثروت ایجاد می‌کند.';
  }

  // Financial figures for negotiation
  const totalAskingMillion = Math.round(askingPrice * targetSqm);
  const totalFairMillion = Math.round(fairPrice * targetSqm);
  const walkAwayPriceCeilingPerSqm = Math.round(fairPrice * 1.02);
  const walkAwayCeilingTotalMillion = Math.round(walkAwayPriceCeilingPerSqm * targetSqm);
  const targetDiscountMillion = Math.max(0, totalAskingMillion - totalFairMillion);
  const negotiationOpeningOfferMillion = Math.round(totalFairMillion * 0.95);

  return {
    hoodId,
    hoodName,
    cityId,
    askingPricePerSqm: askingPrice,
    fairPricePerSqm: fairPrice,
    walkAwayPriceCeilingPerSqm,
    targetSqm,
    readinessScore,
    verdictId,
    verdictTitleFa,
    verdictBadgeColor,
    executiveDirectiveFa,
    targetDiscountMillion,
    negotiationOpeningOfferMillion,
    walkAwayCeilingTotalMillion,
    pillars,
    generatedAtIso: new Date().toISOString(),
  };
}
