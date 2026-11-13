/**
 * @file src/cells/socioeconomic-intelligence/casperDecisionEngine.ts
 * @description CASPER Multidisciplinary Decision Intelligence Engine:
 * 1) 4-Layer Epistemic Data Separation (Observed vs. Claim vs. Model Inference vs. Field Unknowns)
 * 2) Behavioral Economics & Cognitive Bias Guardrail Audit (Anchoring, Framing, FOMO, Base-Rate Neglect)
 * 3) Weighted Multi-Criteria Decision Analysis (MCDA) & Counterfactual Sensitivity Simulator
 */
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';

export type EpistemicLayerStatus =
  | 'VERIFIED_OBSERVATION'
  | 'LOW_SAMPLE_CAUTION'
  | 'UNVERIFIED_CLAIM'
  | 'MODEL_INFERENCE'
  | 'FIELD_VERIFICATION_REQUIRED';

export interface EpistemicDataLayerItem {
  id: 'observed' | 'claim' | 'model' | 'unknown';
  titleFa: string;
  status: EpistemicLayerStatus;
  badgeTextFa: string;
  primaryMetricFa: string;
  secondaryDetailFa: string;
}

export interface CognitiveBiasAlert {
  id: 'anchoring' | 'framing' | 'fomo' | 'base_rate';
  titleFa: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  explanationFa: string;
  countermeasureFa: string;
}

export interface UserDecisionWeights {
  priceWeight: number;       // 0..100
  commuteWeight: number;     // 0..100
  environmentWeight: number; // 0..100
  liquidityWeight: number;   // 0..100
  safetyWeight: number;      // 0..100
}

export interface CasperNeighborhoodDecisionInput {
  hoodId: number;
  hoodName: string;
  askingPricePerSqm: number;
  estimatedDealPricePerSqm: number;
  iqrLowPerSqm: number;
  iqrHighPerSqm: number;
  validSampleCount: number;
  rejectedFraudCount: number;
  confidenceScore: number;
  marketStatus?: 'undervalued' | 'balanced' | 'bubble';
  marketRegime?: 'HOT' | 'BALANCED' | 'FROZEN';
  overallScore?: number;     // 0..10
  transitScore?: number;     // 0..10
  safetyScore?: number;      // 0..10
  liquidityScore?: number;   // 1..10 intrinsic market liquidity score
  rahn80m?: number;          // Million Toman for 80m²
  targetSqm?: number;
  intlCurrency?: IntlCurrencyCode;
}

export interface CasperDecisionEvaluation {
  epistemicLayers: EpistemicDataLayerItem[];
  biasAlerts: CognitiveBiasAlert[];
  dimensionScores: {
    priceUtility: number;
    commuteUtility: number;
    environmentUtility: number;
    liquidityUtility: number;
    safetyUtility: number;
  };
  annualRentalYieldPct: number;
  nonCompensatoryVetoTriggered: boolean;
  vetoReasonsFa: string[];
  expectedUtilityScore: number;
  riskAdjustedUtilityScore: number;
  uncertaintyMarginPct: number;
  anchoringPremiumPct: number;
  overpaymentRisk80mMillion: number;
  targetOfferPerSqm: number;
  targetOfferIntlText: string;
  decisionVerdict: 'OPTIMAL_BUY' | 'NEGOTIATE_HARD' | 'CAUTIOUS_HOLD' | 'HIGH_RISK_AVOID';
  verdictTitleFa: string;
  verdictSummaryFa: string;
  counterfactualFlipFa: string;
}

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

export const DEFAULT_CASPER_DECISION_WEIGHTS: UserDecisionWeights = {
  priceWeight: 35,
  commuteWeight: 20,
  environmentWeight: 15,
  liquidityWeight: 15,
  safetyWeight: 15,
};

export function evaluateCasperNeighborhoodDecision(
  input: CasperNeighborhoodDecisionInput,
  weights: UserDecisionWeights = DEFAULT_CASPER_DECISION_WEIGHTS,
): CasperDecisionEvaluation {
  const ask = Math.max(1, input.askingPricePerSqm);
  const deal = Math.max(1, input.estimatedDealPricePerSqm);
  const samples = Math.max(0, Math.round(input.validSampleCount));
  const hasObservedIqr = samples > 0 && input.iqrLowPerSqm > 0 && input.iqrHighPerSqm > 0;
  const iqrLow = hasObservedIqr ? Math.max(1, Math.min(input.iqrLowPerSqm, deal)) : Math.max(1, Math.round(deal * 0.94));
  const iqrHigh = hasObservedIqr ? Math.max(deal, input.iqrHighPerSqm) : Math.max(deal + 1, Math.round(ask * 1.04));
  const rejected = Math.max(0, Math.round(input.rejectedFraudCount));
  const confidence = samples === 0 && input.confidenceScore <= 0 ? 0 : clamp(Math.round(input.confidenceScore), 0, 99);
  const areaSqm = clamp(Math.round(input.targetSqm ?? 80), 35, 500);
  const currency = input.intlCurrency ?? 'USD';

  const anchoringPremiumPct = Number(clamp(((ask - deal) / deal) * 100, 0, 60).toFixed(1));
  const overpaymentRisk80mMillion = Math.max(0, Math.round((ask - deal) * areaSqm));
  const uncertaintyMarginPct = Number(clamp(((iqrHigh - iqrLow) / (2 * deal)) * 100, 2, 45).toFixed(1));
  const annualRentalYieldPct = input.rahn80m ? Number((((input.rahn80m * 0.36) / (deal * 80)) * 100).toFixed(2)) : 5.2;

  const rawTargetOffer =
    input.marketStatus === 'bubble'
      ? Math.round(deal * 0.96)
      : input.marketStatus === 'undervalued'
        ? Math.round(deal)
        : Math.round((deal + iqrLow) / 2);
  const targetOfferPerSqm = clamp(rawTargetOffer, iqrLow, deal);
  const targetOfferIntlText = formatMillionTomanAsIntlCurrency(targetOfferPerSqm, currency, 'fa');

  const epistemicLayers: EpistemicDataLayerItem[] = [
    {
      id: 'observed',
      titleFa: '۱. داده مشاهده‌شده (پالایش آماری IQR)',
      status: samples >= 12 ? 'VERIFIED_OBSERVATION' : 'LOW_SAMPLE_CAUTION',
      badgeTextFa: samples >= 12 ? 'مشاهده مستقیم پالایش‌شده' : samples === 0 ? 'فاقد آگهی زنده · اتکا به مدل پایه' : 'نمونه محدود · احتیاط آماری',
      primaryMetricFa: samples === 0 ? `فاقد آگهی زنده دیوار در مدل · بازه برآوردی پایه ${iqrLow} تا ${iqrHigh} م.ت` : `${samples} نمونه معتبر · بازه ${iqrLow} تا ${iqrHigh} م.ت`,
      secondaryDetailFa: samples === 0 ? `اتکا به نرخ پایه کالیبره‌شده محله (${deal} م.ت) تا ثبت آگهی زنده (${rejected} مورد ردشده)` : `حذف ${rejected} آگهی پرت/طعمه توسط فیلتر ضدتقلب`,
    },
    {
      id: 'claim',
      titleFa: '۲. ادعای آگهی‌دهنده (قیمت تابلو)',
      status: 'UNVERIFIED_CLAIM',
      badgeTextFa: 'ادعای فروشنده (نیازمند تعدیل)',
      primaryMetricFa: `متری ${ask} م.ت (+${anchoringPremiumPct}٪ بالاتر از نرخ معامله)`,
      secondaryDetailFa: `ریسک اضافه‌پرداخت واحد ${areaSqm} متری بدون چانه‌زنی: ${overpaymentRisk80mMillion} میلیون تومان`,
    },
    {
      id: 'model',
      titleFa: '۳. تخمین مدل هدونیک v6.4 (استنتاج آماری)',
      status: 'MODEL_INFERENCE',
      badgeTextFa: `ضریب اطمینان ${confidence}٪ · خطای ±${uncertaintyMarginPct}٪`,
      primaryMetricFa: `تخمین پای معامله: متری ${deal} م.ت (پیشنهاد هدف: ${targetOfferPerSqm} م.ت)`,
      secondaryDetailFa: `مبتنی بر شکاف تاریخی قیمت اعلامی و قطعی در رژیم ${input.marketRegime === 'HOT' ? 'رقابتی' : input.marketRegime === 'FROZEN' ? 'رکودی' : 'متعادل'}`,
    },
    {
      id: 'unknown',
      titleFa: '۴. متغیرهای نامعلوم (الزام راستی‌آزمایی میدانی)',
      status: 'FIELD_VERIFICATION_REQUIRED',
      badgeTextFa: 'غیرقابل استنتاج از داده آگهی',
      primaryMetricFa: 'اصالت سند، خلافی ماده ۱۰۰، سلامت تاسیسات و فرهنگ ساختمان',
      secondaryDetailFa: 'پیش از هرگونه بیعانه، چک‌لیست ۵۰ نقطه‌ای بازدید و استعلام ثبتی اجرا شود',
    },
  ];

  const biasAlerts: CognitiveBiasAlert[] = [
    {
      id: 'anchoring',
      titleFa: 'سوگیری لنگراندازی (Anchoring Bias)',
      severity: anchoringPremiumPct >= 9 ? 'HIGH' : anchoringPremiumPct >= 5 ? 'MEDIUM' : 'LOW',
      explanationFa: `فروشندگان در ${input.hoodName} به طور میانگین ${anchoringPremiumPct}٪ بالاتر از ارزش تسویه قیمت‌گذاری می‌کنند تا نقطه مرجع ذهنی شما را جابه‌جا کنند.`,
      countermeasureFa: `مذاکره را از عدد اعلامی (${ask} م.ت) شروع نکنید؛ لنگر پیشنهاد اول را روی متری ${targetOfferPerSqm} م.ت قرار دهید.`,
    },
    {
      id: 'fomo',
      titleFa: 'تله فوریت ساختگی و ترس از جاماندن (FOMO)',
      severity: input.marketStatus === 'bubble' || input.marketRegime === 'HOT' ? 'HIGH' : 'LOW',
      explanationFa:
        input.marketStatus === 'bubble'
          ? 'محله در ناحیه حباب مثبت قرار دارد؛ عبارت «مشتری نقد پای قولنامه است» اغلب تکنیک فشار شناختی است.'
          : 'پراکندگی قیمت‌ها متعادل است؛ تصمیم‌گیری شتاب‌زده بدون استعلام حقوقی ریسک غبن ایجاد می‌کند.',
      countermeasureFa: 'قانون ۲۴ ساعت تنفس شناختی و مقایسه هم‌زمان با حداقل ۲ محله جایگزین را رعایت کنید.',
    },
    {
      id: 'framing',
      titleFa: 'خطای قاب‌بندی هزینه کل (Total Cost Framing)',
      severity: 'MEDIUM',
      explanationFa: 'تمرکز صرف روی قیمت هر مترمربع، هزینه‌های پنهان (کمیسیون، مالیات و بازسازی تاسیسات) را پنهان می‌کند.',
      countermeasureFa: 'حداقل ۳ تا ۵ درصد بودجه کل را به عنوان ذخیره احتیاطی خارج از ثمن معامله نگه دارید.',
    },
    {
      id: 'base_rate',
      titleFa: 'غفلت از نرخ پایه نقدشوندگی و بازده اجاره (Base-Rate Neglect)',
      severity: annualRentalYieldPct < 4.5 || samples < 12 ? 'HIGH' : 'MEDIUM',
      explanationFa: `بازده خالص اجاره سالانه در این محله حدود ${annualRentalYieldPct}٪ (معادل ۳۶٪ رهن کامل بر ارزش کل) و حجم نمونه معتبر ${samples} مورد است.`,
      countermeasureFa: 'پیش از تصمیم‌گیری بر اساس روایت‌های هیجانی، نرخ پایه زمان فروش و بازده اجاره محله را با میانگین منطقه مقایسه کنید.',
    },
  ];

  const baseOverall = clamp((input.overallScore ?? 7.2) * 10, 35, 96);
  const statusBonus = input.marketStatus === 'undervalued' ? 14 : input.marketStatus === 'bubble' ? -14 : 2;
  const priceUtility = Math.round(clamp(72 + statusBonus - (anchoringPremiumPct - 6) * 1.1, 25, 98));
  const commuteUtility = Math.round(clamp(((input.transitScore ?? (input.overallScore ?? 7.0)) * 10), 30, 98));
  const environmentUtility = Math.round(clamp(baseOverall, 35, 96));
  const regimeLiquidityBonus = input.marketRegime === 'HOT' ? 16 : input.marketRegime === 'FROZEN' ? -8 : 8;
  const tierLiquidityBase = deal <= 160 ? 56 : deal <= 350 ? 50 : deal <= 550 ? 44 : 38;
  const intrinsicLiquidity = clamp(tierLiquidityBase + regimeLiquidityBonus + clamp(annualRentalYieldPct * 4.5, 10, 30), 35, 96);
  const liquidityUtility = Math.round(
    typeof input.liquidityScore === 'number' && Number.isFinite(input.liquidityScore)
      ? clamp(input.liquidityScore * 10, 35, 98)
      : intrinsicLiquidity,
  );
  const safetyUtility = Math.round(clamp(((input.safetyScore ?? (input.overallScore ?? 7.2)) * 10), 35, 98));

  const wPrice = Math.max(0, weights.priceWeight);
  const wCommute = Math.max(0, weights.commuteWeight);
  const wEnv = Math.max(0, weights.environmentWeight);
  const wLiq = Math.max(0, weights.liquidityWeight);
  const wSafety = Math.max(0, weights.safetyWeight);
  const wSum = wPrice + wCommute + wEnv + wLiq + wSafety || 1;

  const expectedUtilityScore = Math.round(
    (priceUtility * wPrice + commuteUtility * wCommute + environmentUtility * wEnv + liquidityUtility * wLiq + safetyUtility * wSafety) / wSum,
  );

  const vetoReasonsFa: string[] = [];
  if (safetyUtility < 52) vetoReasonsFa.push('ریسک بحرانی ایمنی و فرسودگی سازه‌ای (امتیاز ایمنی زیر حد نصاب غیرجبرانی ۵۲)');
  if (liquidityUtility < 48) vetoReasonsFa.push('قفل نقدشوندگی و ریسک رکود خروج سرمایه (امتیاز نقدشوندگی زیر حد نصاب ۴۸)');
  if (priceUtility < 40) vetoReasonsFa.push('حباب قیمتی شدید یا شکاف غیرمنطقی قیمت اعلامی (امتیاز قیمت زیر حد نصاب ۴۰)');
  const nonCompensatoryVetoTriggered = vetoReasonsFa.length > 0;

  const epistemicUncertaintyAdj = samples === 0 ? 5 : samples < 5 ? 2 : 0;
  const uncertaintyPenalty = Math.round(Math.max(0, (uncertaintyMarginPct - 8) * 0.6) + (input.marketStatus === 'bubble' ? 6 : 0) + epistemicUncertaintyAdj);
  const rawRiskAdjusted = clamp(expectedUtilityScore - uncertaintyPenalty - vetoReasonsFa.length * 14, 15, 98);
  const riskAdjustedUtilityScore = nonCompensatoryVetoTriggered ? Math.min(58, rawRiskAdjusted) : rawRiskAdjusted;

  let decisionVerdict: CasperDecisionEvaluation['decisionVerdict'] = 'CAUTIOUS_HOLD';
  let verdictTitleFa = 'بررسی مشروط و مذاکره مرحله‌ای';
  let verdictSummaryFa = `امتیاز مطلوبیت تعدیل‌شده با ریسک (${riskAdjustedUtilityScore} از ۱۰۰) نشان می‌دهد خرید تنها در صورت اخذ تخفیف تا سقف متری ${targetOfferPerSqm} م.ت توجیه اقتصادی دارد.`;

  if (!nonCompensatoryVetoTriggered && riskAdjustedUtilityScore >= 76 && input.marketStatus !== 'bubble') {
    decisionVerdict = 'OPTIMAL_BUY';
    verdictTitleFa = 'گزینه مطلوب با ارزش ذاتی مناسب (Optimal)';
    verdictSummaryFa = `با توجه به اولویت‌های شما، محله ${input.hoodName} تعادل مطلوبی بین ارزش ذاتی، نقدشوندگی و کیفیت زیست‌پذیری دارد.`;
  } else if (riskAdjustedUtilityScore >= 62 && !nonCompensatoryVetoTriggered) {
    decisionVerdict = 'NEGOTIATE_HARD';
    verdictTitleFa = 'ورود مشروط به چانه‌زنی سنگین (Negotiate Hard)';
    verdictSummaryFa = `شکاف ${anchoringPremiumPct} درصدی قیمت تابلو و معامله نیازمند مذاکره هدفمند روی نرخ متری ${targetOfferPerSqm} م.ت است.`;
  } else if (riskAdjustedUtilityScore < 48 || nonCompensatoryVetoTriggered) {
    decisionVerdict = 'HIGH_RISK_AVOID';
    verdictTitleFa = nonCompensatoryVetoTriggered ? 'وتوی غیرجبرانی ریسک بحرانی (Non-Compensatory Veto)' : 'عدم تناسب ریسک به بازده (نیازمند محله جایگزین)';
    verdictSummaryFa = nonCompensatoryVetoTriggered
      ? `به دلیل فعال شدن خط قرمز غیرجبرانی (${vetoReasonsFa.join('؛ ')})، امتیاز بالای سایر معیارها مجوز جبران این ریسک را ندارد.`
      : `با وزن‌های انتخابی شما، ریسک حباب یا عدم قطعیت قیمتی در این محله بالاست؛ بررسی محلات هم‌جوار زیر ارزش ذاتی توصیه می‌شود.`;
  }

  const neededDiscountPct = Math.max(3, Math.round(((ask - targetOfferPerSqm) / ask) * 100));
  const counterfactualFlipFa =
    decisionVerdict === 'OPTIMAL_BUY'
      ? `آستانه ابطال تصمیم: اگر قیمت پیشنهادی فروشنده بیش از متری ${Math.round(deal * 1.04)} م.ت باشد یا در بازدید میدانی نقص سندی/تاسیساتی محرز شود، مطلوبیت به زیر حد مجاز سقوط می‌کند.`
      : `شرط تغییر تصمیم به «خرید مطلوب»: کاهش حداقل ${neededDiscountPct}٪ از قیمت اعلامی فروشنده (رسیدن به متری ${targetOfferPerSqm} م.ت) و تایید سلامت ثبتی و تاسیساتی ساختمان.`;

  return {
    epistemicLayers,
    biasAlerts,
    dimensionScores: { priceUtility, commuteUtility, environmentUtility, liquidityUtility, safetyUtility },
    annualRentalYieldPct,
    nonCompensatoryVetoTriggered,
    vetoReasonsFa,
    expectedUtilityScore,
    riskAdjustedUtilityScore,
    uncertaintyMarginPct,
    anchoringPremiumPct,
    overpaymentRisk80mMillion,
    targetOfferPerSqm,
    targetOfferIntlText,
    decisionVerdict,
    verdictTitleFa,
    verdictSummaryFa,
    counterfactualFlipFa,
  };
}
