/** @file src/features/onboarding/services/urbanEconomyEngine.ts — Stage 60 Pure Urban Economy & Anti-Bias Guard Engine */
import type {
  EconomicScenarioLifecycleKind,
  NeighborhoodEconomyProfile,
} from './urbanEconomyTypes';

export interface ActivityEmploymentAndDeduplicationGuardResult {
  registeredVsActiveGuardFa: string;
  crossZoneComparisonGuardFa: string;
  employmentSeparationGuardFa: string;
  deduplicationGuardFa: string;
}

export function evaluateActivityEmploymentAndDeduplicationGuards(
  profile: NeighborhoodEconomyProfile,
  attemptCompareRegisteredWithVerified: boolean,
  attemptUntaggedEmploymentEstimate: boolean,
): ActivityEmploymentAndDeduplicationGuardResult {
  const registeredVsActiveGuardFa = `تفکیک وضعیت واحد اقتصادی: واحد ثبت‌شده (${profile.registeredUnitsCount}) ≠ واحد فعال تأییدشده (${profile.verifiedActiveUnitsCount}). حضور در فهرست ثبت به معنای فعال‌بودن فعلی نیست و نبود داده به معنای نبود فعالیت نیست.`;

  const crossZoneComparisonGuardFa = attemptCompareRegisteredWithVerified
    ? 'مسدودشدن مقایسه ناهم‌سنخ: مقایسه «واحدهای ثبت‌شده» یک محله با «واحدهای فعال تأییدشده» محله دیگر به دلیل تفاوت تعریف و روش گردآوری نامعتبر است.'
    : 'مقایسه هم‌تراز: مقایسه محدوده‌ها با بازه زمانی یکسان، تعریف یکسان و وضعیت اعتبار مشخص انجام می‌شود.';

  let employmentSeparationGuardFa: string;
  if (profile.employmentRegisteredCount !== null) {
    employmentSeparationGuardFa = `اشتغال ثبت‌شده (${profile.employmentRegisteredCount} نفر) جدا از تعداد کسب‌وکارها نمایش داده می‌شود: ${profile.employmentNoteFa}.`;
  } else if (attemptUntaggedEmploymentEstimate) {
    employmentSeparationGuardFa =
      'مسدودشدن برآورد بی‌برچسب اشتغال: به دلیل نبود داده اشتغال معتبر، تولید خودکار تعداد شاغلان از روی تعداد کسب‌وکارهای خرد ممنوع است.';
  } else {
    employmentSeparationGuardFa = `داده اشتغال موجود نیست — ${profile.employmentNoteFa}.`;
  }

  const deduplicationGuardFa = `کنترل شمارش چندباره: رکوردهای خام شعب/فهرست‌ها (${profile.multiBranchRawRecordsCount}) پس از تفکیک «واحد اقتصادی»، «شعبه»، «برند» و «شرکت» به ${profile.deduplicatedEconomicEntitiesCount} موجودیت یکتا تبدیل شدند (${profile.multiCategoryNoteFa}).`;

  return {
    registeredVsActiveGuardFa,
    crossZoneComparisonGuardFa,
    employmentSeparationGuardFa,
    deduplicationGuardFa,
  };
}

export interface CorridorAccessMarketAndPrivacyGuardResult {
  coverageVsRealGrowthGuardFa: string;
  networkAccessibilityAndPlacementGuardFa: string;
  propertyMarketCausalGuardFa: string;
  moduleSeparationAndPrivacyGuardFa: string;
  scenarioLifecycleGuardFa: string;
}

export function evaluateCorridorAccessMarketAndDynamicGuards(
  profile: NeighborhoodEconomyProfile,
  scenarioKind: EconomicScenarioLifecycleKind,
  publicPrivacyMode: boolean,
): CorridorAccessMarketAndPrivacyGuardResult {
  const coverageVsRealGrowthGuardFa = profile.isCoverageExpansionOnly
    ? `هشدار تغییر پوشش داده: ${profile.dataCoverageNoteFa} — افزایش ثبت یا افزودن منبع جدید هرگز به‌عنوان رشد قطعی فعالیت اقتصادی گزارش نمی‌شود.`
    : `پویایی دوره (${profile.referencePeriodFa}): ${profile.dataCoverageNoteFa}.`;

  const accessText =
    profile.networkAccessIsochrone15MinPop !== null
      ? `جمعیت قابل دسترسی ۱۵ دقیقه‌ای روی شبکه واقعی (${profile.isNetworkBasedAccess ? 'شبکه مسیر، نه خط مستقیم' : 'برآورد اولیه'}): ${profile.networkAccessIsochrone15MinPop} نفر.`
      : 'برآورد دقیق ایزوکرون شبکه نیازمند تکمیل داده‌های پیوند حمل‌ونقل است.';
  const networkAccessibilityAndPlacementGuardFa = `${accessText} تحلیل مکان‌یابی و ظرفیت مکانی فقط بررسی اولیه مکانی است و جایگزین ضوابط شهرسازی، مجوز قانونی یا تضمین سودآوری نمی‌شود.`;

  const propertyMarketCausalGuardFa = `${profile.commercialRentCorrelationNoteFa} — همبستگی تراکم فعالیت و اجاره تجاری به معنای رابطه علّی نیست و هیچ ضریبی بدون اعتبارسنجی مستقل وارد موتور ارزش‌گذاری نمی‌شود.`;

  const moduleSeparationAndPrivacyGuardFa = publicPrivacyMode
    ? 'حالت عمومی: داده‌های مالی محرمانه شرکت‌ها، درآمد اشخاص و اطلاعات شخصی کارکنان مسدود است؛ درخواست اصلاح کسب‌وکار تا پیش از تأیید وارد شاخص عمومی نمی‌شود و رزرو خدمات در ماژول خدمات حرفه‌ای (۴۳) باقی می‌ماند.'
    : 'نمای ارزیاب مجاز: بررسی تعارض منابع با ثبت سابقه و نگهداری پیوند تجمیعی به محیط‌زیست (۵۷) بدون اثبات خودکار آلودگی.';

  const scenarioLifecycleGuardFa = `برچسب وضعیت سناریو: «${scenarioKind}» — وجود سناریوی توسعه اقتصادی به معنای پروژه واقعی یا تضمین تحقق آن نیست. (${profile.industrialEnvironmentalNoteFa})`;

  return {
    coverageVsRealGrowthGuardFa,
    networkAccessibilityAndPlacementGuardFa,
    propertyMarketCausalGuardFa,
    moduleSeparationAndPrivacyGuardFa,
    scenarioLifecycleGuardFa,
  };
}
