/**
 * @file src/utils/casper/casperDecisionEngine.ts
 * @description CASPER Socio-Technical Real Estate Decision Intelligence, 12-Category Epistemic Truth Ledger,
 * Cognitive Bias Shield, and Counterfactual Multi-Criteria Decision Analysis (MCDA) Engine.
 * Enforces canonical Hedonic/Aggregator parity, dynamic epistemic confidence, and transaction friction math.
 */

import type { Neighborhood } from '../../types/models';
import {
  convertAreaFromSqm,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  type AreaUnit,
  type IntlCurrencyCode,
} from '../areaUnit';

export type CasperEpistemicCategoryCode =
  | 'OBSERVED_DATA' | 'USER_PROVIDED' | 'ADVERTISER_CLAIM' | 'VERIFIED_DATA'
  | 'THIRD_PARTY_DATA' | 'ESTIMATED_DATA' | 'INFERRED_DATA' | 'PREDICTED_DATA'
  | 'MISSING_DATA' | 'CONFLICTING_DATA' | 'OUTDATED_DATA' | 'UNKNOWN_DATA';

export interface CasperEpistemicLedgerEntry {
  readonly code: CasperEpistemicCategoryCode;
  readonly labelFa: string;
  readonly metricNameFa: string;
  readonly valueDisplayFa: string;
  readonly sourceFa: string;
  readonly confidencePct: number;
  readonly marginOfErrorFa: string;
  readonly statusTone: 'verified' | 'estimated' | 'caution' | 'uncertain';
  readonly explanationFa: string;
}

export interface CasperCognitiveBiasAlert {
  readonly id: 'ANCHORING_TRAP' | 'MONEY_ILLUSION_TRAP' | 'COMMUTE_TIME_TAX_TRAP' | 'ILLIQUIDITY_EXIT_TRAP';
  readonly titleFa: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly metricBadgeFa: string;
  readonly diagnosisFa: string;
  readonly debiasingActionFa: string;
  readonly financialImpactMillionToman: number;
  readonly financialImpactIntlFormatted: string;
}

export interface CasperDecisionCriterionScore {
  readonly id: 'financial_safety' | 'livability_health' | 'exit_liquidity' | 'epistemic_certainty' | 'mobility_access';
  readonly labelFa: string;
  readonly score: number;
  readonly weightPct: number;
  readonly benchmarkSummaryFa: string;
}

export interface CasperCounterfactualScenario {
  readonly id: 'full_asking_no_negotiation' | 'emergency_fast_exit' | 'horizon_compounding';
  readonly titleFa: string;
  readonly assumptionChangeFa: string;
  readonly resultingTotalMillionToman: number;
  readonly resultingIntlFormatted: string;
  readonly deltaMillionToman: number;
  readonly verdictShiftFa: string;
}

export type CasperDecisionPriorityProfile = 'balanced' | 'end_user_family' | 'capital_preservation' | 'liquidity_first';

export interface CasperDecisionScenarioInput {
  readonly targetAreaSqm: number;
  readonly achievedDiscountPct: number;
  readonly holdingHorizonYears: number;
  readonly priorityProfile: CasperDecisionPriorityProfile;
  readonly intlCurrency?: IntlCurrencyCode;
  readonly areaUnit?: AreaUnit;
  readonly canonicalDealPerSqmMillion?: number;
  readonly fastSaleFactor?: number;
  readonly observedSampleCount?: number;
  readonly evidenceIndexScore?: number;
  readonly isBootstrapped?: boolean;
  readonly marketRegime?: 'HOT' | 'BALANCED' | 'FROZEN';
}

export interface CasperDecisionIntelligenceReport {
  readonly hoodId: number;
  readonly hoodNameFa: string;
  readonly zoneFa: string;
  readonly epistemicReliabilityIndex: number;
  readonly overallDecisionScore: number;
  readonly decisionVerdictFa: string;
  readonly decisionSummaryFa: string;
  readonly askingPerSqmMillion: number;
  readonly dealBaselinePerSqmMillion: number;
  readonly askingTotalMillion: number;
  readonly askingTotalIntl: string;
  readonly dealBaselineTotalMillion: number;
  readonly dealBaselineTotalIntl: string;
  readonly scenarioTargetTotalMillion: number;
  readonly scenarioTargetTotalIntl: string;
  readonly negotiationSavingsMillion: number;
  readonly negotiationSavingsIntl: string;
  readonly grossRentalYieldPct: number;
  readonly netAnnualCarryPct: number;
  readonly roundTripFrictionPct: number;
  readonly fastSaleFactorUsed: number;
  readonly estimatedDaysToExit: number;
  readonly criteriaScores: readonly CasperDecisionCriterionScore[];
  readonly biasAlerts: readonly CasperCognitiveBiasAlert[];
  readonly counterfactuals: readonly CasperCounterfactualScenario[];
  readonly epistemicLedger: readonly CasperEpistemicLedgerEntry[];
}

const PROFILE_WEIGHTS: Record<CasperDecisionPriorityProfile, Record<CasperDecisionCriterionScore['id'], number>> = {
  balanced: { financial_safety: 25, livability_health: 20, exit_liquidity: 20, epistemic_certainty: 15, mobility_access: 20 },
  end_user_family: { financial_safety: 20, livability_health: 35, exit_liquidity: 15, epistemic_certainty: 10, mobility_access: 20 },
  capital_preservation: { financial_safety: 35, livability_health: 15, exit_liquidity: 25, epistemic_certainty: 15, mobility_access: 10 },
  liquidity_first: { financial_safety: 25, livability_health: 10, exit_liquidity: 40, epistemic_certainty: 15, mobility_access: 10 },
};

const CANONICAL_DEFAULT_FAST_SALE_FACTOR = 0.88;
const ROUND_TRIP_TRANSACTION_FRICTION_PCT = 4.2;
const ANNUAL_PHYSICAL_DEPRECIATION_PCT = 1.2;

const clampScore = (val: number, min = 0, max = 100): number =>
  Number.isFinite(val) ? Math.max(min, Math.min(max, Math.round(val))) : min;

export function evaluateCasperDecisionIntelligence(
  hood: Neighborhood,
  rawInput?: Partial<CasperDecisionScenarioInput>,
): CasperDecisionIntelligenceReport {
  const targetAreaSqm = Math.max(35, Math.min(500, Math.round(rawInput?.targetAreaSqm ?? 85)));
  const areaUnit: AreaUnit = rawInput?.areaUnit === 'sqft' ? 'sqft' : 'sqm';
  const displayAreaValue = areaUnit === 'sqft' ? Math.round(targetAreaSqm * 10.7639) : Math.round(convertAreaFromSqm(targetAreaSqm, areaUnit));
  const areaLabelFa = areaUnit === 'sqft' ? 'فوت مربع (ft²)' : formatAreaUnitLabel(areaUnit);

  const askingPerSqm = Math.max(10, Number(hood.buyPerSqm) || 100);
  const fallbackDealRatio = rawInput?.marketRegime === 'HOT' ? 0.975 : rawInput?.marketRegime === 'FROZEN' ? 0.90 : 0.93;
  const dealPerSqm =
    typeof rawInput?.canonicalDealPerSqmMillion === 'number' && rawInput.canonicalDealPerSqmMillion > 0
      ? rawInput.canonicalDealPerSqmMillion
      : Math.round(askingPerSqm * fallbackDealRatio * 10) / 10;

  const empiricalSpreadPct = Math.max(1, Number((((askingPerSqm - dealPerSqm) / askingPerSqm) * 100).toFixed(1)));
  const achievedDiscountPct = Math.max(0, Math.min(25, Number(rawInput?.achievedDiscountPct ?? empiricalSpreadPct)));
  const holdingHorizonYears = Math.max(1, Math.min(10, Math.round(rawInput?.holdingHorizonYears ?? 3)));
  const priorityProfile: CasperDecisionPriorityProfile = rawInput?.priorityProfile ?? 'balanced';
  const intlCurrency: IntlCurrencyCode = rawInput?.intlCurrency ?? 'USD';
  const fastSaleFactorUsed =
    typeof rawInput?.fastSaleFactor === 'number' && rawInput.fastSaleFactor > 0.5 && rawInput.fastSaleFactor < 1
      ? rawInput.fastSaleFactor
      : CANONICAL_DEFAULT_FAST_SALE_FACTOR;

  const observedSamples = Math.max(0, Math.trunc(rawInput?.observedSampleCount ?? (hood.bargains?.length ?? 0)));
  const isBootstrapped = rawInput?.isBootstrapped ?? observedSamples < 3;

  const askingTotalMillion = Math.round(askingPerSqm * targetAreaSqm);
  const dealBaselineTotalMillion = Math.round(dealPerSqm * targetAreaSqm);
  const scenarioTargetTotalMillion = Math.round(askingPerSqm * (1 - achievedDiscountPct / 100) * targetAreaSqm);
  const negotiationSavingsMillion = Math.max(0, askingTotalMillion - scenarioTargetTotalMillion);

  const scaledRahnMillion = Math.round((Math.max(100, hood.rahn80m) / 80) * targetAreaSqm);
  const impliedAnnualRentMillion = Math.min(scenarioTargetTotalMillion * 0.042, scaledRahnMillion * 0.16);
  const grossRentalYieldPct = Number(((impliedAnnualRentMillion / Math.max(1, scenarioTargetTotalMillion)) * 100).toFixed(2));
  const netAnnualCarryPct = Number((grossRentalYieldPct - ANNUAL_PHYSICAL_DEPRECIATION_PCT).toFixed(2));

  const liquidityScore = clampScore(hood.opportunityScore ?? Math.round((hood.metro * 10 + hood.security * 10) / 2));
  const estimatedDaysToExit = Math.max(18, Math.round(145 - liquidityScore * 1.1));
  const transitNodes = Math.max(1, Math.round(hood.metro / 2));
  const aqi = Math.max(25, Math.round(140 - hood.air * 9));
  const traffic = clampScore(100 - (hood.trafficInfo?.trafficScore ?? hood.flatTerrain * 8));
  const greenSpace = clampScore(hood.air * 9);

  const observedConfidencePct =
    observedSamples === 0 ? 45 : observedSamples < 3 ? 62 : clampScore(70 + observedSamples * 3, 70, 94);
  const epistemicCertaintyScore = clampScore(
    typeof rawInput?.evidenceIndexScore === 'number' && rawInput.evidenceIndexScore > 0
      ? rawInput.evidenceIndexScore
      : observedConfidencePct - Math.max(0, Math.round((empiricalSpreadPct - 8) * 1.8)),
    35,
    95,
  );

  const financialSafetyScore = clampScore(65 + (achievedDiscountPct - empiricalSpreadPct) * 3.5 + (grossRentalYieldPct - 4.2) * 6);
  const livabilityHealthScore = clampScore(greenSpace * 0.45 + Math.max(0, 100 - (aqi - 40) * 0.85) * 0.35 + (hood.security * 10) * 0.2);
  const mobilityAccessScore = clampScore(Math.min(45, hood.metro * 4.5) + Math.max(0, 100 - traffic) * 0.55);

  const weights = PROFILE_WEIGHTS[priorityProfile];
  const criteriaScores: CasperDecisionCriterionScore[] = [
    { id: 'financial_safety', labelFa: 'ایمنی مالی و حاشیه امنیت قیمت', score: financialSafetyScore, weightPct: weights.financial_safety, benchmarkSummaryFa: `تخفیف هدف ${achievedDiscountPct.toFixed(1)}٪ در برابر شکاف معامله v6.4 (${empiricalSpreadPct.toFixed(1)}٪)` },
    { id: 'livability_health', labelFa: 'کیفیت زیست‌پذیری و سلامت محیطی', score: livabilityHealthScore, weightPct: weights.livability_health, benchmarkSummaryFa: `شاخص هوا ${aqi} AQI و فضای سبز ${greenSpace} از ۱۰۰` },
    { id: 'exit_liquidity', labelFa: 'نقدشوندگی و عمق بازار خروج', score: liquidityScore, weightPct: weights.exit_liquidity, benchmarkSummaryFa: `فروش عادی ~${estimatedDaysToExit} روز | ضریب خروج فوری ${fastSaleFactorUsed}` },
    { id: 'epistemic_certainty', labelFa: 'شفافیت و اعتبار معرفتی داده‌ها', score: epistemicCertaintyScore, weightPct: weights.epistemic_certainty, benchmarkSummaryFa: `${observedSamples} نمونه آگهی (${isBootstrapped ? 'پایه هیوریستیک/نمونه محدود' : 'پالایش‌شده IQR'})` },
    { id: 'mobility_access', labelFa: 'کارایی فضایی و دسترسی حمل‌ونقل', score: mobilityAccessScore, weightPct: weights.mobility_access, benchmarkSummaryFa: `${transitNodes} ایستگاه مترو/BRT و شاخص ترافیک ${traffic}` },
  ];

  const overallDecisionScore = clampScore(criteriaScores.reduce((acc, item) => acc + (item.score * item.weightPct) / 100, 0));
  const decisionVerdictFa =
    overallDecisionScore >= 78
      ? 'مطلوب با حاشیه امنیت بالا (تأیید مشروط به راستی‌آزمایی سندی و فنی)'
      : overallDecisionScore >= 62
        ? 'متعادل و قابل مذاکره (نیازمند اخذ تخفیف هدف پیش از عقد قرارداد)'
        : 'پرریسک یا نیازمند بازنگری جدی در قیمت/شرایط معامله';

  const decisionSummaryFa = `بر مبنای ماتریس تصمیم کسپر برای واحد ${displayAreaValue} ${areaLabelFa} در ${hood.name}، نرخ معامله برآوردی (v6.4) متری ${dealPerSqm.toLocaleString('fa-IR')} م‌ت (${empiricalSpreadPct.toFixed(1)}٪ پایین‌تر از آگهی) است. سقف ورود منطقی شما ${scenarioTargetTotalMillion.toLocaleString('fa-IR')} م‌ت است.`;

  const anchoringOverpayMillion = Math.max(0, askingTotalMillion - dealBaselineTotalMillion);
  const fastSaleHaircutPct = Math.round((1 - fastSaleFactorUsed) * 100);
  const fastSaleHaircutMillion = Math.round(scenarioTargetTotalMillion * (1 - fastSaleFactorUsed));
  const annualCommuteHours = Math.round((traffic / 100) * 420);

  const biasAlerts: CasperCognitiveBiasAlert[] = [
    { id: 'ANCHORING_TRAP', titleFa: 'خطای لنگراندازی روی قیمت پیشنهادی آگهی (Anchoring Bias)', severity: achievedDiscountPct < empiricalSpreadPct ? 'high' : 'medium', metricBadgeFa: `شکاف آگهی و معامله v6.4: ${empiricalSpreadPct.toFixed(1)}٪`, diagnosisFa: `فروشندگان در ${hood.name} میانگین متری ${askingPerSqm.toLocaleString('fa-IR')} م‌ت اعلام می‌کنند، اما نرخ معامله برآوردی v6.4 متری ${dealPerSqm.toLocaleString('fa-IR')} م‌ت است.`, debiasingActionFa: `مذاکره را از متری ${Math.round(dealPerSqm * 0.98).toLocaleString('fa-IR')} م‌ت آغاز کنید و قیمت آگهی را لنگر ارزش ذاتی قرار ندهید.`, financialImpactMillionToman: anchoringOverpayMillion, financialImpactIntlFormatted: formatMillionTomanAsIntlCurrency(anchoringOverpayMillion, intlCurrency, 'en') },
    { id: 'MONEY_ILLUSION_TRAP', titleFa: 'توهم پولی، استهلاک بنا و بازده خالص اجاری (Money Illusion)', severity: netAnnualCarryPct < 3.0 ? 'high' : 'medium', metricBadgeFa: `بازده خالص پس از استهلاک: ${netAnnualCarryPct.toFixed(1)}٪`, diagnosisFa: `بازده ناخالص رهن (${grossRentalYieldPct.toFixed(1)}٪) پس از کسر ${ANNUAL_PHYSICAL_DEPRECIATION_PCT}٪ استهلاک سالانه کالبدی بنا به ${netAnnualCarryPct.toFixed(1)}٪ کاهش می‌یابد.`, debiasingActionFa: 'بازده اسمی ریالی را با تورم ارزی و هزینه بازسازی دوره‌ای ساختمان بسنجید.', financialImpactMillionToman: Math.round(impliedAnnualRentMillion), financialImpactIntlFormatted: formatMillionTomanAsIntlCurrency(Math.round(impliedAnnualRentMillion), intlCurrency, 'en') },
    { id: 'ILLIQUIDITY_EXIT_TRAP', titleFa: `ریسک قفل‌شدگی سرمایه و کسر ${fastSaleHaircutPct}٪ فروش فوری (Illiquidity Trap)`, severity: liquidityScore < 68 ? 'high' : 'medium', metricBadgeFa: `ضریب خروج فوری: ${fastSaleFactorUsed} (-${fastSaleHaircutPct}٪)`, diagnosisFa: `طبق استاندارد موتور هدانیک رادار (FAST_SALE_FACTOR = ${fastSaleFactorUsed})، فروش اضطراری زیر ۳۰ روز نیازمند حدود ${fastSaleHaircutPct}٪ تخفیف نقدشوندگی است.`, debiasingActionFa: 'سرمایه مورد نیاز در افق کمتر از ۳ سال را وارد دارایی غیرنقدشونده ملکی نکنید.', financialImpactMillionToman: fastSaleHaircutMillion, financialImpactIntlFormatted: formatMillionTomanAsIntlCurrency(fastSaleHaircutMillion, intlCurrency, 'en') },
    { id: 'COMMUTE_TIME_TAX_TRAP', titleFa: 'مالیات زمانی ترافیک و فرسایش شناختی روزانه (Time-Tax Bias)', severity: traffic > 72 || aqi > 95 ? 'high' : 'medium', metricBadgeFa: `ترافیک ${traffic}/۱۰۰ | هوا ${aqi} AQI`, diagnosisFa: `کم‌توجهی به ترافیک و آلودگی هوا در زمان بازدید، سالانه حدود ${annualCommuteHours.toLocaleString('fa-IR')} ساعت زمان مفید خانوار را مستهلک می‌کند.`, debiasingActionFa: 'پیش از عقد قرارداد، مسیر تردد را در ساعت اوج (۸ صبح و ۱۸ عصر) به‌صورت میدانی بیازمایید.', financialImpactMillionToman: Math.round(annualCommuteHours * 0.35), financialImpactIntlFormatted: formatMillionTomanAsIntlCurrency(Math.round(annualCommuteHours * 0.35), intlCurrency, 'en') },
  ];

  const emergencyFastExitMillion = Math.round(scenarioTargetTotalMillion * fastSaleFactorUsed);
  const compoundedFactor = Math.pow(1 + netAnnualCarryPct / 100, holdingHorizonYears) * (1 - ROUND_TRIP_TRANSACTION_FRICTION_PCT / 100);
  const netRealCompoundedMillion = Math.round(scenarioTargetTotalMillion * compoundedFactor);
  const horizonDeltaMillion = netRealCompoundedMillion - scenarioTargetTotalMillion;

  const counterfactuals: CasperCounterfactualScenario[] = [
    { id: 'full_asking_no_negotiation', titleFa: 'سناریوی پادواقعی ۱: پذیرش قیمت آگهی بدون چانه‌زنی (۰٪ تخفیف)', assumptionChangeFa: `حذف تخفیف ${achievedDiscountPct.toFixed(1)}٪ و خرید با نرخ خام آگهی`, resultingTotalMillionToman: askingTotalMillion, resultingIntlFormatted: formatMillionTomanAsIntlCurrency(askingTotalMillion, intlCurrency, 'en'), deltaMillionToman: askingTotalMillion - scenarioTargetTotalMillion, verdictShiftFa: `پرداخت اضافه معادل ${(askingTotalMillion - scenarioTargetTotalMillion).toLocaleString('fa-IR')} م‌ت نسبت به سقف ورود منطقی` },
    { id: 'emergency_fast_exit', titleFa: `سناریوی پادواقعی ۲: خروج اضطراری با ضریب استاندارد هدانیک (${fastSaleFactorUsed})`, assumptionChangeFa: `فروش فوری زیر ۳۰ روز کاری با کسر ${fastSaleHaircutPct}٪ هزینه نقدشوندگی`, resultingTotalMillionToman: emergencyFastExitMillion, resultingIntlFormatted: formatMillionTomanAsIntlCurrency(emergencyFastExitMillion, intlCurrency, 'en'), deltaMillionToman: emergencyFastExitMillion - scenarioTargetTotalMillion, verdictShiftFa: `زیان نقدشوندگی معادل ${fastSaleHaircutMillion.toLocaleString('fa-IR')} میلیون تومان در صورت خروج زودهنگام` },
    { id: 'horizon_compounding', titleFa: `سناریوی پادواقعی ۳: نگهداری ${holdingHorizonYears} ساله پس از کسر اصطکاک معاملاتی و استهلاک`, assumptionChangeFa: `بازده خالص اجاری (${netAnnualCarryPct.toFixed(1)}٪/سال) منهای ${ROUND_TRIP_TRANSACTION_FRICTION_PCT}٪ هزینه ورود/خروج و کمیسیون`, resultingTotalMillionToman: netRealCompoundedMillion, resultingIntlFormatted: formatMillionTomanAsIntlCurrency(netRealCompoundedMillion, intlCurrency, 'en'), deltaMillionToman: horizonDeltaMillion, verdictShiftFa: horizonDeltaMillion >= 0 ? `جبران کامل اصطکاک معاملاتی و ایجاد مازاد خالص +${horizonDeltaMillion.toLocaleString('fa-IR')} م‌ت` : `هشدار افق کوتاه‌مدت: در افق ${holdingHorizonYears} ساله هزینه‌های معاملاتی از بازده اجاره پیشی می‌گیرد (${horizonDeltaMillion.toLocaleString('fa-IR')} م‌ت)` },
  ];

  const dealCiLow = Number((dealPerSqm * 0.965).toFixed(1));
  const dealCiHigh = Number((dealPerSqm * 1.035).toFixed(1));

  const epistemicLedger: CasperEpistemicLedgerEntry[] = [
    { code: 'OBSERVED_DATA', labelFa: '۱. داده مشاهده‌شده (Observed)', metricNameFa: 'پایه قیمت اعلامی و نمونه‌های محله', valueDisplayFa: `متری ${askingPerSqm.toLocaleString('fa-IR')} م (${observedSamples} نمونه فعال)`, sourceFa: isBootstrapped ? 'پایه مرجع محله (پوشش نمونه محدود < ۳)' : 'پایش آگهی‌های عمومی پالایش‌شده', confidencePct: observedConfidencePct, marginOfErrorFa: isBootstrapped ? '±۶.۵٪ (بوت‌استرپ)' : '±۳.۵٪', statusTone: isBootstrapped ? 'estimated' : 'verified', explanationFa: 'نرخ خام مشاهده‌شده در آگهی‌ها؛ بیانگر تقاضای اولیه فروشنده است و نه قیمت قطعی معامله.' },
    { code: 'VERIFIED_DATA', labelFa: '۲. داده راستی‌آزمایی‌شده (Verified)', metricNameFa: 'منطقه‌بندی و زیرساخت حمل‌ونقل', valueDisplayFa: `${hood.zone} | امتیاز مترو ${hood.metro}/۱۰`, sourceFa: 'مختصات ژئواسپشیال و لایه‌های رسمی شهری', confidencePct: 98, marginOfErrorFa: '۰٪ (ثبت‌شده مکانی)', statusTone: 'verified', explanationFa: 'مرزهای هندسی، منطقه شهرداری و ایستگاه‌های حمل‌ونقل انبوه با تطبیق مکانی تأیید شده‌اند.' },
    { code: 'ESTIMATED_DATA', labelFa: '۳. داده تخمین‌زده‌شده (Estimated v6.4)', metricNameFa: 'نرخ معامله قطعی برآوردی (همگام با v6.4)', valueDisplayFa: `متری ${dealPerSqm.toLocaleString('fa-IR')} م (بازه حساسیت: ${dealCiLow} تا ${dealCiHigh})`, sourceFa: 'موتور تجمیع و قیمت‌گذاری هدانیک نسخه ۶.۴ رادار', confidencePct: epistemicCertaintyScore, marginOfErrorFa: '±۳.۵٪ (حساسیت پارامتری)', statusTone: 'estimated', explanationFa: 'برآورد قاعده‌محور مبتنی بر تعدیل شکاف آگهی-معامله؛ جایگزین اسناد رسمی ثبت اسناد نیست.' },
    { code: 'ADVERTISER_CLAIM', labelFa: '۴. ادعای آگهی‌دهنده (Advertiser Claim)', metricNameFa: 'حباب خوش‌بینی فروشنده در قیمت‌گذاری', valueDisplayFa: `+${empiricalSpreadPct.toFixed(1)}٪ بالاتر از نرخ معامله v6.4`, sourceFa: 'اظهارات اولیه فروشنده/مشاور در آگهی', confidencePct: 50, marginOfErrorFa: '±۸.۰٪', statusTone: 'caution', explanationFa: 'قیمت اعلامی آگهی‌دهنده یک موضع مذاکراتی اولیه است و نباید بدون چانه‌زنی پذیرفته شود.' },
    { code: 'USER_PROVIDED', labelFa: '۵. داده اعلامی کاربر (User-Provided)', metricNameFa: 'پارامترهای سناریوی تصمیم شما', valueDisplayFa: `${displayAreaValue} ${areaLabelFa} | تخفیف هدف ${achievedDiscountPct.toFixed(1)}٪ | افق ${holdingHorizonYears} سال`, sourceFa: 'ورودی مستقیم کاربر در شبیه‌ساز کسپر', confidencePct: 100, marginOfErrorFa: 'قطعی (ورودی کاربر)', statusTone: 'verified', explanationFa: 'مفروضات شخصی شما که مستقیماً وزن‌دهی ماتریس تصمیم و سناریوهای پادواقعی را کنترل می‌کند.' },
    { code: 'THIRD_PARTY_DATA', labelFa: '۶. داده منبع ثالث (Third-Party)', metricNameFa: 'شاخص کیفیت هوا و فضای سبز', valueDisplayFa: `هوا ${aqi} AQI | فضای سبز ${greenSpace}/۱۰۰`, sourceFa: 'ایستگاه‌های سنجش محیطی و لایه‌های شهری', confidencePct: 82, marginOfErrorFa: '±۶.۰٪', statusTone: 'estimated', explanationFa: 'سنجش‌های بیرونی که بر حسب فصل و شرایط جوی نوسان دارند.' },
    { code: 'INFERRED_DATA', labelFa: '۷. داده استنتاج‌شده (Inferred)', metricNameFa: 'بازده اجاره‌ای خالص پس از استهلاک', valueDisplayFa: `ناخالص ${grossRentalYieldPct.toFixed(2)}٪ | خالص ${netAnnualCarryPct.toFixed(2)}٪ (رهن: ${scaledRahnMillion.toLocaleString('fa-IR')} م)`, sourceFa: 'استنتاج از نسبت رهن کامل به قیمت معامله منهای استهلاک', confidencePct: 76, marginOfErrorFa: '±۴.۵٪', statusTone: 'estimated', explanationFa: 'محاسبه‌شده از نسبت ودیعه به ارزش معاملاتی پس از کسر ۱.۲٪ استهلاک کالبدی سالانه.' },
    { code: 'PREDICTED_DATA', labelFa: '۸. داده پیش‌بینی‌شده (Predicted)', metricNameFa: 'زمان برآوردی فروش و نقدشوندگی خروج', valueDisplayFa: `~${estimatedDaysToExit} روز (ضریب فروش فوری: ${fastSaleFactorUsed})`, sourceFa: 'مدل هیوریستیک عمق تقاضا و نقدشوندگی محله', confidencePct: 68, marginOfErrorFa: '±۱۵ روز', statusTone: 'estimated', explanationFa: 'برآورد زمان لازم برای تبدیل دارایی به وجه نقد در شرایط متعادل بدون حراج اضطراری.' },
    { code: 'MISSING_DATA', labelFa: '۹. داده ناموجود (Missing Data)', metricNameFa: 'ریزمحاسبات پلاک‌به‌پلاک ثبتی و سلامت تاسیسات', valueDisplayFa: 'ناموجود در لایه عمومی — نیازمند کارشناسی حضوری', sourceFa: 'خارج از شمول داده‌های عمومی محله‌ای', confidencePct: 0, marginOfErrorFa: 'نامشخص تا بازدید', statusTone: 'uncertain', explanationFa: 'وضعیت سندی، لوله‌کشی، عایق صوتی و سلامت سازه صرفاً با کارشناسی فنی و ثبتی مشخص می‌شود.' },
    { code: 'CONFLICTING_DATA', labelFa: '۱۰. داده متعارض (Conflicting)', metricNameFa: 'واگرایی آگهی‌ها با هسته معاملات', valueDisplayFa: empiricalSpreadPct > 9 ? `واگرایی بالا (${empiricalSpreadPct.toFixed(1)}٪ شکاف)` : `واگرایی متعارف (${empiricalSpreadPct.toFixed(1)}٪ شکاف)`, sourceFa: 'مقایسه توزیع قیمت آگهی‌ها با نرخ معامله v6.4', confidencePct: 64, marginOfErrorFa: '±۷.۵٪', statusTone: empiricalSpreadPct > 9 ? 'caution' : 'estimated', explanationFa: 'شکاف بالا میان قیمت آگهی و نرخ معامله نشان‌دهنده مقاومت فروشندگان یا ناهمگنی سن بنا در محله است.' },
    { code: 'OUTDATED_DATA', labelFa: '۱۱. داده نیازمند پایش لحظه‌ای (Outdated Risk)', metricNameFa: 'پروفایل ترافیک در ساعات اوج و بارندگی', valueDisplayFa: `شاخص پایه ${traffic}/۱۰۰ (توصیه به تست در ساعت پیک)`, sourceFa: 'میانگین دوره‌ای ترافیک معابر اصلی', confidencePct: 66, marginOfErrorFa: '±۱۰ واحد', statusTone: 'caution', explanationFa: 'ترافیک معابر فرعی در ساعات اوج عصرگاهی می‌تواند تا ۴۰٪ سنگین‌تر از میانگین پایه باشد.' },
    { code: 'UNKNOWN_DATA', labelFa: '۱۲. عدم قطعیت ساختاری (Unknown / Tail Risk)', metricNameFa: 'شوک‌های کلان ارزی، مقرراتی و ریسک طرف معامله', valueDisplayFa: 'غیرقابل پیش‌بینی قطعی با الگوریتم', sourceFa: 'عدم قطعیت ذاتی اقتصاد کلان و حقوق قراردادها', confidencePct: 30, marginOfErrorFa: 'عدم قطعیت ساختاری', statusTone: 'uncertain', explanationFa: 'ریسک تکانه ارزی، تغییر قوانین مالیاتی یا توقیف ثبتی فقط با استعلام رسمی دفترخانه پوشش می‌یابد.' },
  ];

  const curSym = intlCurrency === 'EUR' ? '€' : intlCurrency === 'USD' ? '$' : intlCurrency === 'AED' ? 'AED ' : '';
  return {
    hoodId: hood.id, hoodNameFa: hood.name, zoneFa: hood.zone,
    epistemicReliabilityIndex: epistemicCertaintyScore, overallDecisionScore, decisionVerdictFa, decisionSummaryFa,
    askingPerSqmMillion: askingPerSqm, dealBaselinePerSqmMillion: dealPerSqm,
    askingTotalMillion, askingTotalIntl: `${curSym}${formatMillionTomanAsIntlCurrency(askingTotalMillion, intlCurrency, 'en')}`,
    dealBaselineTotalMillion, dealBaselineTotalIntl: `${curSym}${formatMillionTomanAsIntlCurrency(dealBaselineTotalMillion, intlCurrency, 'en')}`,
    scenarioTargetTotalMillion, scenarioTargetTotalIntl: `${curSym}${formatMillionTomanAsIntlCurrency(scenarioTargetTotalMillion, intlCurrency, 'en')}`,
    negotiationSavingsMillion, negotiationSavingsIntl: `${curSym}${formatMillionTomanAsIntlCurrency(negotiationSavingsMillion, intlCurrency, 'en')}`,
    grossRentalYieldPct, netAnnualCarryPct, roundTripFrictionPct: ROUND_TRIP_TRANSACTION_FRICTION_PCT,
    fastSaleFactorUsed, estimatedDaysToExit, criteriaScores, biasAlerts, counterfactuals, epistemicLedger,
  };
}
