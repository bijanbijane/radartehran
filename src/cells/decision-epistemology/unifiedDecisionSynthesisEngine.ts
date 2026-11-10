/**
 * @file unifiedDecisionSynthesisEngine.ts
 * @module cells/decision-epistemology
 * @description CASPER Unified Decision Quality & Multi-Criteria Epistemic Synthesis Engine.
 * Synthesizes all 8 underlying decision dimensions into a composite Deal Execution Readiness Index,
 * Walk-Away Price Ceiling, and actionable executive negotiation directive.
 */

import { INITIAL_NEIGHBORHOODS, Neighborhood, toPersianNum } from '../../data/neighborhoods';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
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
  targetTabId: string;
  nameFa: string;
  score: number; // 0 to 100
  weightPct: number;
  gradeFa: string;
  detailFa: string;
}

export interface DealExecutionPlaybook {
  signingStagePct: number;
  handoverStagePct: number;
  deedStagePct: number;
  signingStageMillion: number;
  handoverStageMillion: number;
  deedStageMillion: number;
  protectiveClausesFa: string[];
  copyableActionSheetFa: string;
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
  fairTotalIntlText: string;
  walkAwayTotalIntlText: string;
  isStagflationaryIllusion: boolean;
  illiquidityAdjustedVaR95RealPct: number;
  nonCompensatoryVetoTriggered: boolean;
  vetoReasonsFa: string[];
  executionPlaybook: DealExecutionPlaybook;
  pillars: DecisionPillarScore[];
  generatedAtIso: string;
}

export function resolveNeighborhood(cityId: string, hoodId: number, fallbackName?: string, providedHood?: Neighborhood): Neighborhood {
  if (providedHood && providedHood.buyPerSqm > 0) return providedHood;
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
  targetSqm: number = 80,
  intlCurrency: IntlCurrencyCode = 'USD',
  providedHood?: Neighborhood,
): UnifiedDecisionSynthesisReport {
  const hood = resolveNeighborhood(cityId, hoodId, hoodName, providedHood);
  const resolvedHoodName = hood.name || hoodName;
  const fairPrice = basePriceSqm > 0 ? basePriceSqm : hood.buyPerSqm;
  const hoodBaselineAsk = hood.buyPerSqm || fairPrice;
  const askingPrice = customAskingPriceSqm ?? Math.round(fairPrice * 1.085);
  const rahn80m = Math.round((fairPrice / Math.max(1, hood.buyPerSqm)) * (hood.rahn80m || Math.round(hood.buyPerSqm * 80 * 0.18)));

  // 1. Valuation Pillar: spread between asking and fair price
  const spreadPct = Number((((askingPrice - fairPrice) / Math.max(1, fairPrice)) * 100).toFixed(1));
  const valuationScore = Math.round(Math.min(100, Math.max(5, 100 - spreadPct * 6.0)));

  // 2. Cycle Pillar: bubble exhaustion evaluated at the proposed transaction price
  const cycleReport = classifyHousingCycleRegime(askingPrice, rahn80m, 6, Math.max(5, spreadPct));
  const cycleScore = Math.round(Math.min(100, Math.max(10, 100 - cycleReport.bubbleExhaustionRiskPct * 0.9)));

  // 3. Information Asymmetry Pillar: Akerlof index + seller asking distortion
  const akerlof = computeAkerlofLemonIndex(hood.id, hood.name || hoodName, hoodBaselineAsk, hood);
  const effectiveLemonScore = Math.min(98, Math.round(akerlof.lemonIndexScore + Math.max(0, spreadPct - 8) * 0.75));
  const asymmetryScore = Math.round(Math.min(100, Math.max(10, 100 - effectiveLemonScore * 0.9)));

  // 4. Liquidity & Real Options Pillar: hurdle rate inverse + illiquidity of overpriced listing
  const annualRentalYield = (rahn80m * 0.36) / Math.max(1, askingPrice * 80);
  const option = computeDixitPindyckRealOption(askingPrice, annualRentalYield, askingPrice > 160 ? 0.30 : 0.24, 0.22, 6);
  const hurdleExcess = Math.max(0, (option.hurdleRateMultiplier - 1.25) * 100) + Math.max(0, spreadPct - 10) * 1.1;
  const liquidityScore = Math.round(Math.min(100, Math.max(10, 95 - hurdleExcess * 0.8)));

  // 5. Data Provenance & Epistemic Confidence Pillar + Empirical IQR Volatility for Monte Carlo
  const agg = aggregateNeighborhoodMarketMetrics(hood.id, hood.name || hoodName, hoodBaselineAsk, buildNeighborhoodListingSamples(hood));
  const epistemicOutlierPenalty = Math.max(0, spreadPct - 18) * 0.35;
  const confidenceScore = Math.round(Math.min(100, Math.max(35, (agg.confidenceScore ?? 75) + 8 - epistemicOutlierPenalty)));

  // 6. Downside Tail Risk Pillar: Monte Carlo VaR calibrated with empirical IQR volatility & immediate drawdown risk
  const iqrSpreadRatio = Math.max(0.06, Math.min(0.28, (agg.iqrHighPerSqm - agg.iqrLowPerSqm) / Math.max(1, agg.estimatedDealPricePerSqm)));
  const calibratedSigma = Number(Math.min(0.38, (askingPrice >= 170 ? 0.28 : askingPrice >= 100 ? 0.21 : 0.16) + iqrSpreadRatio * 0.25).toFixed(3));
  const merton = simulateMertonJumpDiffusionVaR(
    askingPrice,
    { horizonMonths: 24, trialCount: 500, annualVolSigma: calibratedSigma },
    hood.id * 101 + 77,
  );
  const overpaymentDrawdownPenalty = Math.max(0, spreadPct - 8) * 0.9;
  const downsideScore = Math.round(Math.min(100, Math.max(10, 100 - merton.metrics.probRealCapitalLossPct * 1.2 - overpaymentDrawdownPenalty)));

  const pillars: DecisionPillarScore[] = [
    { id: 'VALUATION', targetTabId: 'PARETO_REGRET', nameFa: 'حاشیه امنیت قیمت‌گذاری (v6.4)', score: valuationScore, weightPct: 25, gradeFa: valuationScore >= 70 ? 'عالی' : valuationScore >= 50 ? 'متوسط' : 'پرریسک', detailFa: `شکاف قیمت پیشنهادی: ${toPersianNum(spreadPct)}٪` },
    { id: 'CYCLE', targetTabId: 'HOUSING_CYCLE', nameFa: 'رژیم چرخه مسکن و حباب‌سنجی', score: cycleScore, weightPct: 20, gradeFa: cycleScore >= 70 ? 'کف‌سازی/رشد' : cycleScore >= 50 ? 'نوسانی' : 'اشباع حباب', detailFa: cycleReport.regimeNameFa.split('(')[0].trim() },
    { id: 'ASYMMETRY', targetTabId: 'SPATIAL_CONTAGION', nameFa: 'تقارن اطلاعاتی و سلامت آگهی‌ها', score: asymmetryScore, weightPct: 15, gradeFa: asymmetryScore >= 70 ? 'شفاف' : 'عدم تقارن', detailFa: `شاخص آکرلوف: ${toPersianNum(effectiveLemonScore)} از ۱۰۰` },
    { id: 'LIQUIDITY', targetTabId: 'REAL_OPTIONS', nameFa: 'نقدشوندگی و ارزش اختیار تعویق', score: liquidityScore, weightPct: 15, gradeFa: liquidityScore >= 70 ? 'روان' : 'انجماد نسبی', detailFa: `ضریب آستانه تعویق: ${toPersianNum(option.hurdleRateMultiplier)} برابر` },
    { id: 'TAIL_RISK', targetTabId: 'MONTE_CARLO_VAR', nameFa: 'پوشش ریسک دم بلند (مونت‌کارلو)', score: downsideScore, weightPct: 15, gradeFa: downsideScore >= 70 ? 'امن' : 'نوسان‌پذیر', detailFa: `احتمال زیان واقعی: ${toPersianNum(merton.metrics.probRealCapitalLossPct)}٪` },
    { id: 'EPISTEMIC', targetTabId: 'EPISTEMIC_PROVENANCE', nameFa: 'قطعیت معرفتی داده‌های میدانی', score: confidenceScore, weightPct: 10, gradeFa: confidenceScore >= 75 ? 'مستند' : 'نیازمند استعلام', detailFa: `امتیاز اعتبارسنجی: ${toPersianNum(confidenceScore)}٪` },
  ];

  // Non-Compensatory MCDA Veto Rules: high secondary scores cannot mask critical risks
  const vetoReasonsFa: string[] = [];
  if (spreadPct >= 35) {
    vetoReasonsFa.push(`بیش‌قیمت‌گذاری شدید فروشنده (+${toPersianNum(spreadPct)}٪ بالاتر از ارزش ذاتی قطعی v6.4)`);
  }
  if (effectiveLemonScore >= 85) {
    vetoReasonsFa.push(`عدم تقارن اطلاعاتی حاد و ریسک بازار لیمو (شاخص آکرلوف ${toPersianNum(effectiveLemonScore)} از ۱۰۰)`);
  }
  if (cycleReport.bubbleExhaustionRiskPct >= 80) {
    vetoReasonsFa.push(`ریسک اشباع حباب مسکن (${toPersianNum(cycleReport.bubbleExhaustionRiskPct)}٪ در فاز توزیع/اشباع)`);
  }
  if (merton.metrics.probRealCapitalLossPct >= 65) {
    vetoReasonsFa.push(`ریسک بحرانی زیان سرمایه حقیقی در مدل مونت‌کارلو (${toPersianNum(merton.metrics.probRealCapitalLossPct)}٪)`);
  }
  const nonCompensatoryVetoTriggered = vetoReasonsFa.length > 0;

  // Weighted Composite Deal Execution Readiness Score
  const rawReadiness = pillars.reduce((acc, p) => acc + (p.score * p.weightPct) / 100, 0);
  const severeOverpricePenalty = spreadPct > 25 ? (spreadPct - 25) * 0.45 : 0;
  const rawScore = Math.round(Math.max(5, Math.min(100, rawReadiness - severeOverpricePenalty)));
  const readinessScore = nonCompensatoryVetoTriggered ? Math.min(38, rawScore) : rawScore;

  let verdictId: DealExecutionVerdictId;
  let verdictTitleFa: string;
  let verdictBadgeColor: string;
  let executiveDirectiveFa: string;

  if (nonCompensatoryVetoTriggered) {
    verdictId = 'ABORT_HIGH_RISK';
    verdictTitleFa = 'قرمز · وتوی غیرجبرانی ریسک بحرانی (Non-Compensatory Veto)';
    verdictBadgeColor = 'rose';
    executiveDirectiveFa = `به دلیل فعال شدن خط قرمز غیرجبرانی (${vetoReasonsFa.join('؛ ')})، امتیاز سایر اضلاع تصمیم مجوز ورود به معامله را صادر نمی‌کند؛ از معامله با این شرایط انصراف دهید یا قیمت را تا ارزش قطعی v6.4 تعدیل کنید.`;
  } else if (readinessScore >= 74) {
    verdictId = 'IMMEDIATE_EXECUTION';
    verdictTitleFa = 'سبز · آماده ورود و نهایی‌سازی معامله در محدوده ارزش ذاتی';
    verdictBadgeColor = 'emerald';
    executiveDirectiveFa = 'ملک دارای حاشیه امنیت قیمتی مناسب، ریسک حباب پایین و شفافیت اطلاعاتی مطلوب است؛ پیشنهاد قیمت منصفانه را ارائه و به سمت اتاق قرارداد حرکت کنید.';
  } else if (readinessScore >= 58) {
    verdictId = 'AGGRESSIVE_NEGOTIATION';
    verdictTitleFa = 'آبی · ورود مشروط به چانه‌زنی تهاجمی و اخذ تخفیف پای نشست';
    verdictBadgeColor = 'indigo';
    executiveDirectiveFa = 'فاصله قیمت پیشنهادی با ارزش قطعی مدل v6.4 نیازمند تعدیل در جلسه نشست است؛ تنها با پذیرش تخفیف پای قرارداد و رعایت خط قرمز قیمت وارد معامله شوید.';
  } else if (readinessScore >= 42) {
    verdictId = 'STRATEGIC_PATIENCE';
    verdictTitleFa = 'زرد · صبر راهبردی، حفظ اختیار تعویق و انباشت نقدینگی';
    verdictBadgeColor = 'amber';
    executiveDirectiveFa = 'ارزش اختیار تعویق بالاست و بازار در فاز فرسایش حباب قرار دارد؛ از تعقیب قیمت فروشنده خودداری کرده و سرمایه را در سبد طلا/درآمد ثابت حفظ کنید.';
  } else {
    verdictId = 'ABORT_HIGH_RISK';
    verdictTitleFa = 'قرمز · انصراف قطعی و ترک مذاکره به دلیل حباب و عدم تقارن';
    verdictBadgeColor = 'rose';
    executiveDirectiveFa = 'ملک به شدت بیش‌قیمت‌گذاری شده و عدم تقارن اطلاعاتی و ریسک دم بلند در سقف تاریخی است؛ خرید در این شرایط تله ثروت ایجاد می‌کند.';
  }

  // Risk-adaptive Walk-Away Ceiling & 3-Stage Escrow Playbook (eliminating flat +2% & static 30/40/30 shortcuts)
  const totalAskingMillion = Math.round(askingPrice * targetSqm);
  const totalFairMillion = Math.round(fairPrice * targetSqm);
  const isHighRiskRegime = cycleReport.bubbleExhaustionRiskPct >= 65 || effectiveLemonScore >= 60 || spreadPct >= 12;
  const walkAwayMarkupFactor = isHighRiskRegime ? 1.0 : 1.02;
  const walkAwayPriceCeilingPerSqm = askingPrice < fairPrice ? askingPrice : Math.round(fairPrice * walkAwayMarkupFactor);
  const walkAwayCeilingTotalMillion = Math.round(walkAwayPriceCeilingPerSqm * targetSqm);
  const targetDiscountMillion = Math.max(0, totalAskingMillion - totalFairMillion);
  const negotiationOpeningOfferMillion = Math.round(Math.min(askingPrice * 0.95, (totalFairMillion * 0.95) / targetSqm) * targetSqm);

  const targetExecutionMillion = Math.min(totalAskingMillion, totalFairMillion);
  const signingStagePct = isHighRiskRegime ? 25 : 30;
  const handoverStagePct = isHighRiskRegime ? 35 : 40;
  const deedStagePct = 100 - signingStagePct - handoverStagePct;
  const signingStageMillion = Math.round(targetExecutionMillion * (signingStagePct / 100));
  const handoverStageMillion = Math.round(targetExecutionMillion * (handoverStagePct / 100));
  const deedStageMillion = targetExecutionMillion - signingStageMillion - handoverStageMillion;

  const executionPlaybook: DealExecutionPlaybook = {
    signingStagePct,
    handoverStagePct,
    deedStagePct,
    signingStageMillion,
    handoverStageMillion,
    deedStageMillion,
    protectiveClausesFa: [
      'شرط استعلام آنی ثبتی و عدم بازداشت پلاک پیش از آزادسازی مرحله اول ثمن معامله',
      'منوط کردن پرداخت قسط تحویل کلید به تحویل فیزیکی واحد، پارکینگ و انباری منطبق با صورتمجلس تفکیکی',
      'تعیین وجه التزام روزانه بابت تأخیر در اخذ مفاصاحساب شهرداری، دارایی و حضور در دفترخانه اسناد رسمی',
    ],
    copyableActionSheetFa: `برگه اقدام اتاق قرارداد (${resolvedHoodName} - ${toPersianNum(targetSqm)} متر): پیشنهاد افتتاحیه ${toPersianNum(negotiationOpeningOfferMillion)} م.ت | ارزش منصفانه ${toPersianNum(totalFairMillion)} م.ت | سقف ترک مذاکره ${toPersianNum(walkAwayCeilingTotalMillion)} م.ت`,
  };

  return {
    hoodId,
    hoodName: resolvedHoodName,
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
    fairTotalIntlText: formatMillionTomanAsIntlCurrency(totalFairMillion, intlCurrency, 'fa'),
    walkAwayTotalIntlText: formatMillionTomanAsIntlCurrency(walkAwayCeilingTotalMillion, intlCurrency, 'fa'),
    isStagflationaryIllusion: cycleReport.isStagflationaryIllusion,
    illiquidityAdjustedVaR95RealPct: merton.metrics.illiquidityAdjustedVaR95RealPct,
    nonCompensatoryVetoTriggered,
    vetoReasonsFa,
    executionPlaybook,
    pillars,
    generatedAtIso: new Date().toISOString(),
  };
}
