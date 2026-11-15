/** @file src/features/onboarding/services/urbanRiskStage65Engine.ts — Stage 65 Pure Risk & Resilience Guards (Zero React) */
import type { Stage65RiskResilienceProfile } from './urbanRiskStage65Types';

export interface MultiHazardAndInfraGuardResult {
  hazardVsResilienceAndMissingDataFa: string;
  buildingSafetyLabelGuardFa: string;
  subsidenceAndFloodModelGuardFa: string;
  infrastructureDependencyAndPrivacyFa: string;
}

export interface EmergencyCapacityAlertAndIndexGuardResult {
  populationAndEmergencyRouteGuardFa: string;
  openSpaceTheoreticalCapacityGuardFa: string;
  resilienceScoreCompletenessGuardFa: string;
  officialAlertAndScenarioBoundaryFa: string;
  antiAlarmistPublicationGuardFa: string;
}

export function evaluateMultiHazardVulnerabilityAndResilience(
  profile: Stage65RiskResilienceProfile,
  publicAccessMode: boolean,
  attemptUnsafeByAgeLabel: boolean,
): MultiHazardAndInfraGuardResult {
  const missingRule = profile.hasMissingHazardZoneData
    ? 'اصل بنیادین فعال: در این محدوده بخشی از داده‌ها ناقص است و «نبود داده هرگز به معنی نبود خطر نیست».'
    : 'پوشش پایه‌ای لایه‌های مخاطره در محدوده ثبت شده است.';

  const hazardVsResilienceAndMissingDataFa = `سطح مخاطره (${profile.hazardLevelLabelFa}) ≠ سطح تاب‌آوری (${profile.resilienceOverallLabelFa}) | ${missingRule}`;

  const buildingSafetyLabelGuardFa =
    attemptUnsafeByAgeLabel && profile.buildingInfoTier !== 'دارای ارزیابی تخصصی'
      ? `مسدودشدن برچسب «ناایمن»: سال ساخت (${profile.buildingYearBuilt}) یا اطلاعات پایه (${profile.buildingInfoTier}) جایگزین ارزیابی سازه‌ای معتبر نیست.`
      : `وضعیت مستندات ساختمان (${profile.buildingInfoTier}) با سال ساخت ${profile.buildingYearBuilt} نمایش داده می‌شود.`;

  const subsidenceAndFloodModelGuardFa = `فرونشست: تغییر تجمعی (${profile.subsidenceCumulativeMm}mm) ≠ سرعت سالانه (${profile.subsidenceRateMmPerYear}mm/yr) ≠ عدم قطعیت (${profile.subsidenceUncertaintyNoteFa}) | سیلاب بارش ${profile.floodScenarioRainMmPerHour}mm/h به‌عنوان «خروجی مدل سناریویی» معرفی می‌شود، نه پیش‌بینی قطعی.`;

  const exposedSectors = profile.infraDependencies
    .map((dep) =>
      publicAccessMode && dep.isSensitivePublicRestricted
        ? `${dep.sectorFa} (مختصات دقیق و جزئیات عملیاتی در نمای عمومی محدود شد)`
        : `${dep.sectorFa} (وابسته به: ${dep.dependsOnFa} ← ${dep.cascadeImpactNoteFa})`,
    )
    .join(' | ');

  return {
    hazardVsResilienceAndMissingDataFa,
    buildingSafetyLabelGuardFa,
    subsidenceAndFloodModelGuardFa,
    infrastructureDependencyAndPrivacyFa: exposedSectors,
  };
}

export function evaluateEmergencyAccessCapacityAlertAndIndexGuards(
  profile: Stage65RiskResilienceProfile,
  allowIncompleteCompositeScore: boolean,
  isHypotheticalScenario: boolean,
): EmergencyCapacityAlertAndIndexGuardResult {
  const popText =
    profile.populationExposedCount === null
      ? `داده جمعیت در معرض نامشخص (مرجع ${profile.populationReferenceYearFa})`
      : `${profile.populationExposedCount.toLocaleString('fa-IR')} نفر تجمیعی (مرجع ${profile.populationReferenceYearFa} — بدون ردیابی اشخاص)`;

  const populationAndEmergencyRouteGuardFa = `مواجهه جمعیتی: ${popText} | مسیر عادی (${profile.normalRouteMinutes} دقیقه) و سناریوی انسداد پل (${profile.blockedBridgeScenarioMinutes} دقیقه) هرگز جایگزین زمان پاسخ اضطراری عملیاتی نمی‌شوند.`;

  const openSpaceTheoreticalCapacityGuardFa = profile.isOpenSpaceFieldVerified
    ? `فضای باز (${profile.openSpaceAreaSqm}متر مربع، ظرفیت نظری ${profile.openSpaceTheoreticalCapacity} نفر) دارای بازبینی میدانی است.`
    : `ظرفیت نظری فضای باز (${profile.openSpaceTheoreticalCapacity} نفر برای ${profile.openSpaceAreaSqm}متر مربع) بدون ارزیابی میدانی زیرساخت و مخاطرات مجاور، ظرفیت قطعی پذیرش نیست.`;

  const resilienceScoreCompletenessGuardFa =
    !allowIncompleteCompositeScore && profile.dataCoveragePercent < 80
      ? `امتیاز کلی تاب‌آوری: «-- (فاقد داده کافی — پوشش ${profile.dataCoveragePercent}٪)»؛ جلوگیری از امتیازسازی گمراه‌کننده و مقایسه مستقیم با محله‌های کامل.`
      : `پوشش داده ${profile.dataCoveragePercent}٪ همراه با شناسنامه وزن‌ها، ورودی‌ها، روش محاسبه و عدم قطعیت نمایش داده می‌شود.`;

  const alertSourceText = profile.hasOfficialAlert
    ? `هشدار رسمی فقط از مرجع «${profile.officialAlertAgencyFa ?? 'مدیریت بحران'}» با ظاهر تفکیک‌شده از برآورد داخلی رادار`
    : 'برآورد تحلیلی داخلی رادار (غیرجایگزین صدور هشدار رسمی و فرماندهی بحران)';

  const officialAlertAndScenarioBoundaryFa = isHypotheticalScenario
    ? `${alertSourceText} | برچسب الزامی: «سناریوی فرضی — واقعیت یا پیش‌بینی قطعی نیست».`
    : `${alertSourceText} | وضعیت ثبت‌شده داده: «${profile.statusKind}».`;

  const antiAlarmistPublicationGuardFa =
    'منع واژگان اضطراب‌زا: استفاده از برچسب‌های مطلق «خطرناک»، «ناامن» یا «غیرقابل سکونت» مسدود است و به‌جای آن شاخص، محدوده و روش نمایش داده می‌شود.';

  return {
    populationAndEmergencyRouteGuardFa,
    openSpaceTheoreticalCapacityGuardFa,
    resilienceScoreCompletenessGuardFa,
    officialAlertAndScenarioBoundaryFa,
    antiAlarmistPublicationGuardFa,
  };
}
