/** @file src/features/onboarding/services/economicIntelligenceStage68Engine.ts — Stage 68 Pure Epistemic & Privacy Guards (Zero React) */
import type { Stage68EconomicZoneProfile } from './economicIntelligenceStage68Types';

export interface EconomicDensityHubAndEmploymentGuardResult {
  registeredDbVsDensityVsPowerGuardFa: string;
  hubEstablishedVsPotentialAndWorkshopGuardFa: string;
  employmentThreeWayAndBoundaryGuardFa: string;
  mobileClusteringGuardFa: string;
}

export interface EconomicCatchmentLifecycleRealtyAndPrivacyGuardResult {
  catchmentNetworkAndFootfallGuardFa: string;
  lifecycleVerificationAndDedupGuardFa: string;
  realtyCausalityAndZoningPermitGuardFa: string;
  compareTransparentCompositeAndPrivacyGuardFa: string;
}

export function evaluateEconomicDensityHubsEmploymentAndBoundaries(
  profile: Stage68EconomicZoneProfile,
  isMobileViewport: boolean,
): EconomicDensityHubAndEmploymentGuardResult {
  const registeredDbVsDensityVsPowerGuardFa = `واحدهای ثبت‌شده در پایگاه رادار (${profile.registeredUnitsInDb.toLocaleString('fa-IR')} مورد، نسخه ${profile.taxonomyVersion}) ≠ کل واحدهای فعال شهر | تراکم مکانی (${profile.economicDensityPerKm2.toLocaleString('fa-IR')}/km²) ≠ شاخص قدرت/تمرکز اقتصادی (${profile.economicConcentrationIndex})؛ تراکم زیاد کسب‌وکار کوچک معادل قدرت اشتغال یا گردش بالا نیست.`;

  const workshopGuard =
    profile.smallWorkshopsCount > 0
      ? `تفکیک صنعتی/کارگاهی فعال: ${profile.smallWorkshopsCount.toLocaleString('fa-IR')} کارگاه کوچک محلی در دسته کارخانه صنعتی (${profile.industrialPlantsCount} واحد) تجمیع نشد.`
      : `تعداد کارخانه صنعتی: ${profile.industrialPlantsCount}.`;

  const hubStatus =
    profile.hubClassification === 'قطب اقتصادی شناساییشده'
      ? 'وضعیت «قطب اقتصادی شناسایی‌شده» بر پایه داده تأییدشده است.'
      : 'وضعیت «محدوده دارای ظرفیت بالقوه» — معرفی به‌عنوان قطب تثبیت‌شده مسدود است.';

  const hubEstablishedVsPotentialAndWorkshopGuardFa = `${hubStatus} | ${workshopGuard}`;

  const openingsText =
    profile.registeredJobOpeningsCount === null
      ? '«داده در دسترس نیست»'
      : `${profile.registeredJobOpeningsCount.toLocaleString('fa-IR')} فرصت`;

  const employmentThreeWayAndBoundaryGuardFa = `تفکیک سه‌گانه اشتغال: شاغلان ساکن (${profile.residentEmployedCount.toLocaleString('fa-IR')}) ≠ شاغلان شاغل در محدوده (${profile.inZoneWorkingEmployedCount.toLocaleString('fa-IR')}) ≠ فرصت‌های شغلی ثبت‌شده (${openingsText}) | مرزبندی: ارزش‌گذاری ← نظام املاک، آگهی خدمت ← بازار خدمات، کاریابی عمومی مسدود.`;

  const mobileClusteringGuardFa = isMobileViewport
    ? 'نمای موبایل فعال: رندر هم‌زمان هزاران نقطه کسب‌وکار مسدود شد؛ نمایش از طریق خوشه‌بندی مکانی و Bottom Sheet تدریجی انجام می‌شود.'
    : 'نمای دسکتاپ/تبلت: کنترل تجمیع مکانی در زوم‌های کلان با حفظ فیلترهای تخصصی فعال است.';

  return {
    registeredDbVsDensityVsPowerGuardFa,
    hubEstablishedVsPotentialAndWorkshopGuardFa,
    employmentThreeWayAndBoundaryGuardFa,
    mobileClusteringGuardFa,
  };
}

export function evaluateCatchmentLifecycleRealtyCapacityAndGovernance(
  profile: Stage68EconomicZoneProfile,
  comparedZonesCount: number,
  discloseCompositeFormula: boolean,
  publicExportMode: boolean,
): EconomicCatchmentLifecycleRealtyAndPrivacyGuardResult {
  const footfallBadge = profile.hasActualFootfallData
    ? 'داده مراجعه واقعی ثبت‌شده'
    : 'برچسب الزامی: «محدوده جذب برآوردی / ظرفیت بالقوه جذب» (منع ادعای تعداد مشتری صرفاً از روی فاصله جغرافیایی)';

  const catchmentNetworkAndFootfallGuardFa = `تحلیل جذب شبکه‌ای (نه صرفاً دایره هندسی): ${profile.estimatedCatchmentRadiusNoteFa} | ${footfallBadge}.`;

  const lifecycleVerificationAndDedupGuardFa = `پاک‌سازی چرخه حیات: ${profile.closedUnitsExcludedCount} واحد تعطیل‌شده از فعال‌ها حذف و ${profile.nameChangeNotCountedAsOpening} تغییر نام به‌عنوان افتتاح جدید ثبت نشد؛ ${profile.relocatedFromOtherZoneCount} جابه‌جایی مجزا ماند | ${profile.pendingUserClosureReports} گزارش تعطیلی کاربر در وضعیت «در حال بررسی» است و بلافاصله روی نقشه قطعی نشد.`;

  const zoningWarn = profile.zoningPermitsExpansion
    ? 'ضوابط شهرسازی توسعه این کاربری را مشروط به استعلام مجاز می‌داند.'
    : 'هشدار مهم: ظرفیت اقتصادی بالا (${score}) به معنای مجازبودن ساخت‌وساز یا تغییر کاربری نیست؛ ضوابط شهرسازی محدودیت دارد.'.replace(
        '${score}',
        String(profile.economicDevCapacityScore),
      );

  const realtyCausalityAndZoningPermitGuardFa = `املاک تجاری (${profile.commercialPriceMillionPerSqm}م/متر): همبستگی قیمت با تمرکز فعالیت ≠ علیت قطعی (موقعیت، کیفیت بنا و عرضه مؤثرند) | ${zoningWarn}`;

  const clampedCompare = Math.min(Math.max(comparedZonesCount, 1), 4);
  const compositeRule = discloseCompositeFormula
    ? 'شاخص‌های ترکیبی با فرمول، دامنه، وزن و تاریخ محاسبه شفاف منتشر می‌شوند.'
    : 'منع امتیاز مبهم: بدون افشای فرمول و وزن، رتبه‌بندی عددی محله‌ها مسدود است (-- نیازمند شناسنامه روش).';

  const privacyRule = publicExportMode
    ? 'حالت انتشار عمومی: اطلاعات شخصی صاحبان کسب‌وکار و داده‌های تجاری محرمانه حذف و منشأ داده در گزارش حفظ شد.'
    : 'حالت داخلی مجاز: دسترسی به داده‌های تفصیلی تحت کنترل نقش و ثبت تاریخچه تأیید.';

  return {
    catchmentNetworkAndFootfallGuardFa,
    lifecycleVerificationAndDedupGuardFa,
    realtyCausalityAndZoningPermitGuardFa,
    compareTransparentCompositeAndPrivacyGuardFa: `مقایسه (${clampedCompare} از حداکثر ۴ محدوده سازگار) | ${compositeRule} | ${privacyRule}`,
  };
}
