/** @file src/features/onboarding/services/urbanPublicRealmEngine.ts — Stage 63 Pure Epistemic & Accessibility Guards (Zero React) */
import type { PublicRealmZoneProfile } from './urbanPublicRealmTypes';

export interface SidewalkAndAccessibilityGuardResult {
  widthSeparationFa: string;
  continuityVsAccessibilityFa: string;
  accessibilityChainVerdictFa: string;
  compositeMaskingGuardFa: string;
}

export interface SafetyShadeFacadePrivacyGuardResult {
  safetySeparationFa: string;
  shadeVsThermalGuardFa: string;
  facadeAndVitalityGuardFa: string;
  duplicateStaleAndPrivacyGuardFa: string;
  scenarioAndSpaceBoundaryFa: string;
}

export function evaluateSidewalkAndAccessibilityChain(
  profile: PublicRealmZoneProfile,
  preventCompositeMasking: boolean,
): SidewalkAndAccessibilityGuardResult {
  const widthSeparationFa = `عرض اسمی پیاده‌رو (${profile.nominalWidthMeters}متر) ≠ عرض مفید قابل عبور (${profile.effectiveUsableWidthMeters}متر) — کسر به دلیل: ${profile.obstacleDeductionNoteFa}.`;

  const allGroupsPass = profile.groupRows.every((g) => g.isChainPassable);
  const failedGroups = profile.groupRows.filter((g) => !g.isChainPassable).map((g) => g.groupFa);

  const continuityVsAccessibilityFa = profile.hasMidRouteStepOrBreak
    ? `پیوستگی شبکه ${profile.continuityPercent}٪ است اما به دلیل وجود پله/گسست در میانه مسیر، «پیوسته بودن خط معبر» معادل دسترس‌پذیری نیست.`
    : `پیوستگی مسیر ${profile.continuityPercent}٪ با نبود پله در قطعه اصلی؛ در عین حال مسیر راهنمای نابینایان (${profile.hasTactilePaving ? 'دارد' : 'ندارد'}) مستقل سنجیده می‌شود.`;

  const accessibilityChainVerdictFa = allGroupsPass
    ? 'زنجیره دسترسی (مبدأ ← پیاده‌رو ← تقاطع ← گذرگاه ← ورودی) برای گروه‌های ارزیابی‌شده بدون گسست تأیید شد.'
    : `هشدار زنجیره دسترسی: مسیر برای گروه‌های (${failedGroups.join('، ')}) دارای گسست است؛ کل مسیر دسترس‌پذیر اعلام نمی‌شود.`;

  const compositeMaskingGuardFa = preventCompositeMasking
    ? 'مسدودشدن پنهان‌کاری امتیاز ترکیبی: ضعف دسترس‌پذیری حتی با امتیاز بالای مبلمان یا جداره پنهان نمی‌شود و وضعیت هر گروه جداگانه نمایش می‌یابد.'
    : 'هشدار روش‌شناسی: ادغام در یک عدد کل بدون تفکیک گروه‌ها می‌تواند مانع حرکتی یا نبود خط بساوایی را پنهان کند.';

  return {
    widthSeparationFa,
    continuityVsAccessibilityFa,
    accessibilityChainVerdictFa,
    compositeMaskingGuardFa,
  };
}

export function evaluateSafetyShadeFacadePrivacyAndScenario(
  profile: PublicRealmZoneProfile,
  publicPrivacyMode: boolean,
  isHypotheticalScenario: boolean,
): SafetyShadeFacadePrivacyGuardResult {
  const safetySeparationFa = `ایمنی فیزیکی (پوشش روشنایی ثبت‌شده: ${profile.lightingCoveragePercent}٪) ≠ احساس امنیت ادراکی (${profile.perceivedSafetySurveyFa})؛ احساس امنیت جایگزین نرخ جرم یا حادثه نیست.`;

  const shadeVsThermalGuardFa = profile.hasFullThermalComfortData
    ? `پوشش سایه (${profile.shadeCoveragePercent}٪) همراه با داده‌های دما، رطوبت و جریان باد برای برآورد آسایش حرارتی در دسترس است.`
    : `صرفاً «پوشش سایه» (${profile.shadeCoveragePercent}٪) گزارش می‌شود: ${profile.thermalDataLimitationFa}؛ بدون جریان باد، رطوبت و جنس سطح، برچسب آسایش حرارتی قطعی مسدود است.`;

  const facadeAndVitalityGuardFa = `جداره فعال (${profile.activeGroundFloorEntrancesCount} ورودی فعال) شاخص هندسی/عملکردی است و به‌تنهایی امتیاز زیبایی بصری نمی‌سازد. سرزندگی روز (${profile.dayVitalityNoteFa}) ≠ شب (${profile.nightVitalityNoteFa})؛ تعمیم یک ساعت به کل شبانه‌روز مسدود است.`;

  const staleWarning =
    profile.latestReportAgeMonths >= 3
      ? `هشدار تازگی: گزارش ${profile.latestReportAgeMonths}ماهه بدون تأیید مجدد به‌عنوان وضعیت جاری نمایش داده نمی‌شود.`
      : `تازگی گزارش (${profile.latestReportAgeMonths} ماه) در بازه بازبینی است.`;

  const privacyNote = publicPrivacyMode
    ? profile.hasReporterPiiOrPlateInPhoto
      ? 'حفاظت حریم خصوصی فعال: چهره، پلاک خودرو و مختصات دقیق گزارش‌دهنده پوشانده شد و گزارش ارزیاب کارشناسی از گزارش مردمی جدا ماند.'
      : 'حالت عمومی: داده‌های حضور صرفاً تجمیعی و بدون ردیابی افراد نمایش داده می‌شوند.'
    : 'نمای کارشناسی بازبین: سوابق کامل برای راستی‌آزمایی و پیوستن گزارش تکراری (خوشه ' + profile.duplicateReportClusterCount + ' تایی) بدون حذف تاریخچه نمایش داده می‌شود.';

  const duplicateStaleAndPrivacyGuardFa = `خوشه‌بندی ${profile.duplicateReportClusterCount} گزارش مجاور بدون حذف تاریخچه | ${staleWarning} | ${privacyNote}`;

  const spaceBoundary = profile.isPubliclyAccessibleSpace
    ? `فضای عمومی در دسترس (${profile.spaceTypeFa})`
    : `فضای باز غیرعمومی/محدود (${profile.spaceTypeFa}): صرف بازبودن فضا در نقشه به معنای حق استفاده عمومی نیست`;

  const scenarioAndSpaceBoundaryFa = isHypotheticalScenario
    ? `${spaceBoundary} | برچسب الزامی: «سناریوی فرضی بهبود فضای عمومی — پروژه مصوب یا اجراشده نیست».`
    : `${spaceBoundary} | نمایش وضعیت مشاهده‌شده با اتصال به تاریخ و منبع.`;

  return {
    safetySeparationFa,
    shadeVsThermalGuardFa,
    facadeAndVitalityGuardFa,
    duplicateStaleAndPrivacyGuardFa,
    scenarioAndSpaceBoundaryFa,
  };
}
