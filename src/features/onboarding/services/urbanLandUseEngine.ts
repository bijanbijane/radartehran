/** @file src/features/onboarding/services/urbanLandUseEngine.ts — Stage 61 Pure Three-Layer & Spatial Compatibility Engine */
import type { ParcelLandUseProfile } from './urbanLandUseTypes';

export interface ThreeLayerSeparationGuardResult {
  threeLayersComparisonFa: string;
  violationVerdictGuardFa: string;
  registeredConflictAndLegalGuardFa: string;
  visualColorConfidenceRuleFa: string;
}

export function evaluateThreeLayerSeparationAndConflictGuard(
  profile: ParcelLandUseProfile,
  attemptAutoViolationVerdict: boolean,
  attemptCombineColorAndConfidence: boolean,
): ThreeLayerSeparationGuardResult {
  const threeLayersComparisonFa = `تفکیک ۳ لایه مستقل: مصوب (${profile.approvedUseFa} — وضعیت: ${profile.approvedStatus}) | ثبت‌شده (${profile.registeredUseFa}) | استفاده مشاهده‌شده (${profile.observedParcelUseFa}؛ روش: ${profile.observationMethodFa}). وضعیت تطبیق: «${profile.reconciliationStatus}».`;

  const violationVerdictGuardFa = attemptAutoViolationVerdict
    ? 'مسدودشدن برچسب خودکار تخلف: اختلاف میان کاربری مصوب، ثبت‌شده و استفاده مشاهده‌شده بدون بررسی سند معتبر هرگز به عنوان «تخلف یا استفاده غیرقانونی قطعی» اعلام نمی‌شود.'
    : 'نمایش اختلاف لایه‌ها به‌عنوان موضوع تحلیل کارشناسی، همراه با ذکر محدودیت روش شناسایی و ظاهر بنا.';

  const registeredConflictAndLegalGuardFa = profile.hasRegisteredSourceConflict
    ? `تعارض سوابق ثبتی: ${profile.registeredConflictDetailFa} — ثبت کاربری در یک پایگاه به‌تنهایی به‌معنای مجازبودن قانونی تمام فعالیت‌های جاری نیست.`
    : 'رکورد ثبت‌شده با ارجاع به مرجع و تاریخ ثبت ارائه می‌شود و جایگزین کاربری مصوب طرح تفصیلی (مرحله ۵۵) نیست.';

  const visualColorConfidenceRuleFa = attemptCombineColorAndConfidence
    ? 'مسدودشدن ادغام بصری رنگ و اعتبار: رنگ زمینه صرفاً نوع کاربری را نمایش می‌دهد و خطوط حاشیه/بافت به‌صورت مستقل سطح اطمینان داده را مشخص می‌کنند.'
    : 'جداسازی بصری استاندارد: رنگ = نوع کاربری | بافت/حاشیه = وضعیت اعتبارسنجی و عدم قطعیت.';

  return {
    threeLayersComparisonFa,
    violationVerdictGuardFa,
    registeredConflictAndLegalGuardFa,
    visualColorConfidenceRuleFa,
  };
}

export interface MixVacantValuationAndPrivacyGuardResult {
  mixAndBuildingSplitFa: string;
  compatibilityBoundaryFa: string;
  vacantDevelopabilityGuardFa: string;
  changeHistoryAndValuationGuardFa: string;
}

export function evaluateMixCompatibilityVacantAndValuationGuards(
  profile: ParcelLandUseProfile,
  publicPrivacyMode: boolean,
  attemptUnvalidatedValuationFactor: boolean,
): MixVacantValuationAndPrivacyGuardResult {
  const mixAndBuildingSplitFa = `سطح قطعه ≠ عملکرد طبقات بنا (${profile.buildingFloorsUseNoteFa}) — ${profile.spatialMixVsDiversityNoteFa}.`;

  const compatibilityBoundaryFa = `${profile.adjacentCompatibilityNoteFa} — صرف هم‌جواری دو عملکرد بدون بررسی ساعت فعالیت، سروصدا، ترافیک و ضوابط به‌معنای تعارض قطعی نیست.`;

  const vacantDevelopabilityGuardFa = `وضعیت «${profile.vacantKind}» (زمین خالی ≠ زمین کم‌استفاده): ${profile.vacantConstraintsNoteFa} — قابلیت توسعه نیازمند اتصال هم‌زمان به ضوابط (۵۵)، زیرساخت (۵۶) و مخاطرات (۵۸) است.`;

  const valuationPart = attemptUnvalidatedValuationFactor
    ? 'مسدودشدن ورود بی‌برچسب به موتور ارزش‌گذاری: تغییر کاربری تأییدنشده یا داده تخمینی بدون اعتبارسنجی مستقل وارد ارزش ملک نمی‌شود.'
    : 'انتقال کاربری به صفحه ملک صرفاً با برچسب منشأ، وضعیت تأیید و تفکیک مصوب از مشاهده‌شده انجام می‌شود.';

  const privacyPart = publicPrivacyMode
    ? 'حالت عمومی: اسناد غیرعمومی مالکیت خصوصی و درخواست‌های تأییدنشده تغییر کاربری پنهان شده‌اند.'
    : 'نمای مدیر داده: ثبت نسخه قبلی، مقدار جدید، منبع و نقش تأییدکننده فعال است.';

  const changeHistoryAndValuationGuardFa = `وضعیت تغییر در تاریخچه: «${profile.changeStatus}» (تغییر تصویر یا اصلاح طبقه‌بندی ≠ تغییر قطعی کاربری). ${valuationPart} ${privacyPart}`;

  return {
    mixAndBuildingSplitFa,
    compatibilityBoundaryFa,
    vacantDevelopabilityGuardFa,
    changeHistoryAndValuationGuardFa,
  };
}
