/** @file src/features/onboarding/services/urbanRegenerationStage82Engine.ts — Stage 82 Pure Urban Regeneration & Social Displacement Engine (Zero React Imports) */
import type {
  Stage82FeasibilityBand,
  Stage82InterventionNeedBand,
  Stage82PriorityMatrixQuadrant,
  Stage82RegenerationZoneProfile,
} from './urbanRegenerationStage82Types';

export interface Stage82AtlasInefficiencyResult {
  fiveEntitiesAndLifecycleGuardFa: string;
  compositeVsDisaggregatedBreakdownFa: string;
  decayVsDysfunctionAndDiagnosticGuardFa: string;
}

export interface Stage82InterventionDisplacementResult {
  priorityMatrixQuadrant: Stage82PriorityMatrixQuadrant;
  financialVsSocialAndNonMonetaryGuardFa: string;
  displacementPressureWarningFa: string;
  didVsDescriptiveAndPrivacyGuardFa: string;
}

export function classifyPriorityMatrix(
  need: Stage82InterventionNeedBand,
  feasibility: Stage82FeasibilityBand,
): Stage82PriorityMatrixQuadrant {
  if (need === 'بالا' && feasibility === 'بالا') return 'اولویت اجرای فوری';
  if (need === 'بالا' && feasibility === 'پایین') return 'نیازمند رفع موانع';
  if (need === 'پایین' && feasibility === 'بالا') return 'مداخله فرصت‌محور';
  return 'پایش و بررسی دوره‌ای';
}

export function evaluateAtlasAndInefficiencyBreakdown(
  profile: Stage82RegenerationZoneProfile,
  weightingBasisFa: 'نظر کارشناسی' | 'روش آماری' | 'سیاست مصوب' | 'ترکیب چند روش',
): Stage82AtlasInefficiencyResult {
  const fiveEntitiesAndLifecycleGuardFa =
    `تفکیک ۵ موجودیت: محدوده مداخله («${profile.zoneNameFa}») ≠ وضعیت پایه ≠ برنامه/سناریو ≠ پروژه اجرایی («${profile.projectLifecyclePhaseFa}») ≠ نتیجه و پیامد (تصویب برنامه ≠ شروع اجرا ≠ تحقق هدف).`;

  const compositeVsDisaggregatedBreakdownFa =
    `شاخص کل ناکارآمدی: ${profile.compositeInefficiencyScore}/۱۰۰ (±${profile.uncertaintyPct}% عدم قطعیت، مبنای وزن‌دهی: ${weightingBasisFa}) | تفکیک اجباری ابعاد: کالبدی ${profile.physicalDecayScore} • زیرساختی ${profile.infrastructureDeficitScore} • خدماتی ${profile.serviceDeprivationScore} • اجتماعی ${profile.socialVulnerabilityScore} • اقتصادی ${profile.economicPressureScore} • محیطی ${profile.environmentalRiskScore}.`;

  const decayVsDysfunctionAndDiagnosticGuardFa =
    `فرسودگی کالبدی ≠ ناکارآمدی شهری | منشأ اصلی: «${profile.dominantIssueFa}» | مداخله متناسب: «${profile.recommendedInterventionFa}» (تشخیص ظاهری ماهواره‌ای بدون بررسی فنی و مستندات سازه‌ای قطعی نیست).`;

  return {
    fiveEntitiesAndLifecycleGuardFa,
    compositeVsDisaggregatedBreakdownFa,
    decayVsDysfunctionAndDiagnosticGuardFa,
  };
}

export function evaluateInterventionDisplacementAndPrivacy(
  profile: Stage82RegenerationZoneProfile,
  monetizeNonMarketBenefits: boolean,
  redactResidentPiiAndOnlineBiasGuard: boolean,
): Stage82InterventionDisplacementResult {
  const priorityMatrixQuadrant = classifyPriorityMatrix(profile.needBand, profile.feasibilityBand);

  const nonMonetaryGuard = monetizeNonMarketBenefits
    ? 'هشدار طراحی: تبدیل اجباری منافع غیرمالی (ایمنی، شبکه اجتماعی، کیفیت محیط) به عدد پولی نامعتبر مجاز نیست.'
    : 'کنترل فعال: امکان‌پذیری مالی ≠ توجیه اجتماعی و عمومی؛ منافع غیرمالی به‌صورت شاخص‌های مستقل نمایش داده می‌شوند.';

  const displacementTriggered =
    profile.rentGrowthPct >= 30 && profile.affordableStockChangePct <= -10;

  const displacementPressureWarningFa = displacementTriggered
    ? `هشدار «نیازمند پایش اجتماعی»: رشد هم‌زمان اجاره‌بها (${profile.rentGrowthPct}%) و کاهش عرضه مسکن استطاعت‌پذیر (${profile.affordableStockChangePct}%) — تغییر جمعیت به‌تنهایی اثبات جابه‌جایی اجباری نیست.`
    : `وضعیت فشار سکونتی: رشد اجاره ${profile.rentGrowthPct}% و تغییر عرضه استطاعت‌پذیر ${profile.affordableStockChangePct}% (افزایش قیمت ملک به‌تنهایی موفقیت بازآفرینی نیست).`;

  const didText = profile.hasControlGroupForDiD
    ? 'مقایسه قبل و بعد با گروه کنترل مشابه (DiD) در کنار مقایسه توصیفی قابل انجام است.'
    : 'فاقد گروه کنترل معتبر؛ نتیجه قبل و بعد صرفاً به‌عنوان مقایسه توصیفی نمایش داده می‌شود.';

  const privacyText = redactResidentPiiAndOnlineBiasGuard
    ? 'داده‌های اجتماعی تجمیعی و غیرقابل انتساب به افرادند؛ مذاکرات خصوصی تجمیع و PII ساکنان پنهان شده و مشارکت آنلاین نماینده قطعی تمام ساکنان تلقی نمی‌شود.'
    : 'هشدار امنیتی: انتشار اطلاعات خصوصی ساکنان یا مالکان در پرونده عمومی پروژه مجاز نیست.';

  return {
    priorityMatrixQuadrant,
    financialVsSocialAndNonMonetaryGuardFa: `ماتریس اولویت: «${priorityMatrixQuadrant}» (نیاز ${profile.needBand} / امکان ${profile.feasibilityBand}) | ${nonMonetaryGuard}`,
    displacementPressureWarningFa,
    didVsDescriptiveAndPrivacyGuardFa: `${didText} | ${privacyText}`,
  };
}
