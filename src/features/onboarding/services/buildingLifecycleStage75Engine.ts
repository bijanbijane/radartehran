/** @file src/features/onboarding/services/buildingLifecycleStage75Engine.ts — Stage 75 Pure Building Lifecycle & Deterioration Engine (Zero React Imports) */
import type { Stage75BuildingLifecycleProfile } from './buildingLifecycleStage75Types';

export const STAGE75_MANDATED_MISSING_STRUCTURAL_TEXT =
  'وضعیت سازه‌ای این ساختمان بر اساس داده‌های موجود قابل تعیین نیست. برای ارزیابی ایمنی، بررسی تخصصی و مستندات فنی معتبر لازم است.';

export interface Stage75AgeVisibleStructuralResult {
  ageVsDeteriorationAndMissingZeroGuardFa: string;
  structuralSafetyMandatedGuardFa: string;
  mepAndMaintenanceRecordGuardFa: string;
}

export interface Stage75RiskValuationPrivacyResult {
  threeRiskSplitAndPriorityNotUnsafeGuardFa: string;
  valuationHedonicIntegrationGuardFa: string;
  privacyTelemetryAndVerificationTagGuardFa: string;
}

export function evaluateAgeVisibleAndStructural(
  profile: Stage75BuildingLifecycleProfile,
  compareBuildQualityExplicitly: boolean,
  separateInstallFromRepairDates: boolean,
): Stage75AgeVisibleStructuralResult {
  const ageText =
    profile.calendarAgeYears === null
      ? 'سن تقویمی: اطلاعات ناموجود (هرگز صفر نمایش داده نمی‌شود)'
      : `سن تقویمی ${profile.calendarAgeYears} سال (عمر مفید برآوردی ${profile.estimatedUsefulLifeYears} سال، عمر باقیمانده ${profile.estimatedRemainingLifeYears ?? 'ناموجود'} سال)`;

  const ageVsDeteriorationAndMissingZeroGuardFa =
    `${ageText} — سن ساختمان به‌تنهایی شاخص فرسودگی نیست | وضعیت ظاهری: «${profile.visiblePhysicalStateFa}» | کیفیت ساخت (${compareBuildQualityExplicitly ? 'تضمین تفکیک ۳ وضعیت تأیید بدون یک رنگ/امتیاز کلی' : 'نیازمند تفکیک'}): ${profile.initialBuildQualityVerification}.`;

  const structuralSafetyMandatedGuardFa = profile.hasStructuralExpertDoc
    ? `مستند سازه‌ای: ${profile.structuralEvalStatusFa} (مجزا از وضعیت ظاهری).`
    : `${STAGE75_MANDATED_MISSING_STRUCTURAL_TEXT} (ساختمان بدون سند نه سالم و نه ناایمن اعلام می‌شود).`;

  const mepDatesText = separateInstallFromRepairDates
    ? `${profile.mepInstallYearFa} | ${profile.mepLastServiceYearFa}`
    : 'هشدار: تاریخ نصب و تاریخ آخرین تعمیر باید جداگانه نگهداری شوند.';

  const maintenanceRuleFa =
    profile.maintenanceCategoryFa === 'فاقد سابقه نگهداری'
      ? 'وضعیت: «فاقد سابقه نگهداری» ≠ «بدون نگهداری» (ممکن است فقط اطلاعات ثبت نشده باشد).'
      : `وضعیت نگهداری: «${profile.maintenanceCategoryFa}».`;

  const mepAndMaintenanceRecordGuardFa = `${mepDatesText} | ${maintenanceRuleFa}`;

  return {
    ageVsDeteriorationAndMissingZeroGuardFa,
    structuralSafetyMandatedGuardFa,
    mepAndMaintenanceRecordGuardFa,
  };
}

export function evaluateRiskValuationAndPrivacy(
  profile: Stage75BuildingLifecycleProfile,
  integrateWithRadarHedonic: boolean,
  redactPrivatePiiAndTelemetry: boolean,
): Stage75RiskValuationPrivacyResult {
  const threeRiskSplitAndPriorityNotUnsafeGuardFa =
    `تفکیک سه‌گانه ریسک (عمر و استهلاک ظاهری ≠ ضعف سازه‌ای ≠ اولویت بررسی) | سطح اولویت: «${profile.inspectionPriorityFa}» (رنگ قرمز به‌طور خودکار به معنای «ساختمان ناایمن» نیست و جایگزین ارزیابی مهندسی نمی‌شود) | مداخله پیشنهادی: «${profile.recommendedInterventionFa}» (بدون شواهد حکم اجرایی نیست).`;

  const valuationHedonicIntegrationGuardFa = integrateWithRadarHedonic
    ? 'ارزش اقتصادی: یکپارچه با موتور ارزش‌گذاری هدونیک رادار (بدون موتور ارزش‌گذاری موازی)؛ تفاوت قیمت بدون کنترل موقعیت، امکانات و متراژ صرفاً به فرسودگی نسبت داده نمی‌شود.'
    : 'هشدار معماری: ایجاد موتور ارزش‌گذاری مستقل و متناقض مجاز نیست.';

  const verificationBadge =
    profile.initialBuildQualityVerification === 'اطلاعات تأییدشده'
      ? `منبع: ${profile.dataSourceFa}، تأییدشده، تاریخ ارزیابی: ${profile.evaluationDateFa}`
      : `وضعیت مستندات: «گزارش‌شده، تأییدنشده / ناموجود» (${profile.dataSourceFa})`;

  const privacyTelemetryAndVerificationTagGuardFa = redactPrivatePiiAndTelemetry
    ? `${verificationBadge} | حریم خصوصی و Telemetry: اطلاعات ساکنان، تصاویر داخلی بدون مجوز، اسناد مالکیت و محتوای پرونده محرمانه در خروجی عمومی و Telemetry ثبت نمی‌شود.`
    : 'هشدار امنیتی: انتشار اسناد مالکیت، تصاویر داخلی و هویت ساکنان در Telemetry غیرمجاز است.';

  return {
    threeRiskSplitAndPriorityNotUnsafeGuardFa,
    valuationHedonicIntegrationGuardFa,
    privacyTelemetryAndVerificationTagGuardFa,
  };
}
