/** @file src/features/onboarding/services/urbanDemographicsEngine.ts — Stage 59 Pure Demographics, Privacy & Housing-Boundary Engine */
import type { DemographicForecastKind, NeighborhoodDemographicsProfile } from './urbanDemographicsTypes';

export interface DensityAndHouseholdGuardResult {
  densitySeparationFa: string;
  householdVsUnitDistinctionFa: string;
  yearMismatchGuardFa: string;
  districtExtrapolationGuardFa: string;
}

export function evaluateDensityAndHouseholdGuards(
  profile: NeighborhoodDemographicsProfile,
  compareTargetYearFa: string,
  attemptDistrictExtrapolation: boolean,
): DensityAndHouseholdGuardResult {
  const densitySeparationFa = `تفکیک ۳گانه تراکم: ناخالص (${
    profile.grossDensityPerKm2 !== null ? `${profile.grossDensityPerKm2} نفر/کم²` : 'محرمانه یا ناموجود'
  }) ≠ خالص سکونتی (${
    profile.netResidentialDensityPerKm2 !== null ? `${profile.netResidentialDensityPerKm2} نفر/کم²` : 'نیازمند داده کاربری'
  }) ≠ تراکم ساختمانی کالبدی (${profile.buildingDensityFar}).`;

  const householdVsUnitDistinctionFa =
    `تفکیک مفاهیم: ساختمان مسکونی ≠ واحد مسکونی (${
      profile.housingUnitsCount ?? 'محرمانه/ناموجود'
    }) ≠ خانوار (${profile.householdCount ?? 'محرمانه/ناموجود'}) ≠ جمعیت ساکن (${
      profile.totalPopulation ?? 'محرمانه/ناموجود'
    }). نوع خانوار از روی تعداد واحد حدس زده نمی‌شود.`;

  const yearMismatchGuardFa =
    profile.referenceYearFa !== compareTargetYearFa
      ? `هشدار ناهم‌زمانی سال مرجع: مقایسه داده ${profile.referenceYearFa} با سال ${compareTargetYearFa} بدون همسان‌سازی دوره و توضیح تفاوت تعریف مجاز نیست.`
      : `مقایسه هم‌سال (${profile.referenceYearFa}): تعریف شاخص و سال مرجع در محدوده‌های منتخب هم‌تراز است.`;

  const districtExtrapolationGuardFa = attemptDistrictExtrapolation
    ? 'مسدودشدن تعمیم مستقیم داده منطقه به محله: تولید عدد دقیق محله از روی آمار کلان منطقه بدون مدل برآورد معتبر و برچسب‌گذاری صریح ممنوع است.'
    : 'نمایش دقیق سطح آماری واقعی: هر داده در سطح معتبر خودش (محله/بلوک مجاز یا تجمیعی منطقه) ارائه می‌شود.';

  return {
    densitySeparationFa,
    householdVsUnitDistinctionFa,
    yearMismatchGuardFa,
    districtExtrapolationGuardFa,
  };
}

export interface PrivacyMigrationAndSocialGuardResult {
  privacyThresholdGuardFa: string;
  migrationCausalityGuardFa: string;
  dayNightAccuracyGuardFa: string;
  boundaryHistoryGuardFa: string;
  antiStigmatizationRuleFa: string;
}

export function evaluatePrivacyMigrationDayNightAndSocialGuards(
  profile: NeighborhoodDemographicsProfile,
  combineSmallFiltersAttempt: boolean,
): PrivacyMigrationAndSocialGuardResult {
  let privacyThresholdGuardFa: string;
  if (profile.isSmallBlockBelowThreshold) {
    privacyThresholdGuardFa = `اعمال آستانه محرمانگی (${profile.minThresholdPolicyNoteFa}): مقدار دقیق این واحد خرد به دلیل خطر بازشناسایی منتشر نمی‌شود و با واحد بزرگ‌تر تجمیع می‌گردد.`;
  } else if (combineSmallFiltersAttempt) {
    privacyThresholdGuardFa =
      'هشدار خطر بازشناسایی در ترکیب فیلترها: ترکیب هم‌زمان چند فیلتر برای استخراج گروه‌های بسیار کوچک یا ردیابی خانوار مسدود شد.';
  } else {
    privacyThresholdGuardFa =
      'سطح انتشار تجمیعی مجاز: مسیر حرکت اشخاص، آدرس خانوار و پرونده‌سازی فردی در تمام لایه‌ها و خروجی‌ها ممنوع است.';
  }

  const migrationCausalityGuardFa =
    'مرزبندی مهاجرت: تغییر خالص جمعیت لزوماً معادل مهاجرت نیست؛ تولد، فوت، اصلاح سرشماری، تغییر روش برآورد و تغییر مرز آماری نیز اثرگذارند.';

  const dayNightAccuracyGuardFa = profile.dayNightIsDirectCount
    ? `جمعیت روز (${profile.daytimePopulationEst ?? 'نامشخص'}) و شب (${profile.nighttimePopulationEst ?? 'نامشخص'}) از پیمایش مستقیم ثبت شده است.`
    : `جمعیت روزانه (${profile.daytimePopulationEst ?? 'نامشخص'}) و شبانه (${
        profile.nighttimePopulationEst ?? 'نامشخص'
      }) «برآوردی / غیرمستقیم» است و هرگز به‌عنوان شمارش قطعی کاربران تلفن همراه یا حضور دقیق افراد اعلام نمی‌شود.`;

  const boundaryHistoryGuardFa = profile.statisticalBoundaryChanged
    ? `هشدار تغییر مرز آماری: ${profile.boundaryChangeNoteFa} — پیش از همسان‌سازی مرزها، رشد یا کاهش کاذب نمایش داده نمی‌شود.`
    : 'ثبات مرز آماری در دوره‌های مقایسه‌شده تأیید شده است.';

  const antiStigmatizationRuleFa =
    'قانون منع برچسب‌گذاری اجتماعی: استفاده از صفاتی نظیر «محله فرسوده اجتماعی»، «کم‌کیفیت» یا «نامطلوب» بدون تعریف عملیاتی و مستندات معتبر در رادار ممنوع است.';

  return {
    privacyThresholdGuardFa,
    migrationCausalityGuardFa,
    dayNightAccuracyGuardFa,
    boundaryHistoryGuardFa,
    antiStigmatizationRuleFa,
  };
}

export interface HousingServicesAndForecastGuardResult {
  housingDemandFourTierGuardFa: string;
  stage56SingleSourceLinkFa: string;
  forecastLifecycleBadgeFa: string;
}

export function evaluateHousingServicesAndScenarioGuards(
  profile: NeighborhoodDemographicsProfile,
  forecastKind: DemographicForecastKind,
): HousingServicesAndForecastGuardResult {
  const housingDemandFourTierGuardFa =
    'تفکیک ۴ سطح مسکن: «نیاز بالقوه سکونت» ≠ «تقاضای آماری» ≠ «تقاضای مؤثر بازار» ≠ «معاملات مشاهده‌شده». افزایش خانوار به‌تنهایی توان خرید یا قیمت را تعیین نمی‌کند.';

  const stage56SingleSourceLinkFa = `منبع یکپارچه خدمات (بدون تکرار بانک اطلاعاتی): وضعیت «${profile.servicePressureStatusFa}» — ${profile.linkedStage56ServicesNoteFa}`;

  const forecastLifecycleBadgeFa = `برچسب وضعیت آینده‌نگر: «${forecastKind}» — سناریوهای جمعیتی و فشار زیرساخت به مفروضات مدل وابسته‌اند و هرگز به‌عنوان آمار قطعی آینده نمایش داده نمی‌شوند.`;

  return {
    housingDemandFourTierGuardFa,
    stage56SingleSourceLinkFa,
    forecastLifecycleBadgeFa,
  };
}
