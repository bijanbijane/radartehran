/** @file src/features/onboarding/services/landUseFunctionalStructureStage69Engine.ts — Stage 69 Pure Domain & Epistemic Guards (Zero React Imports) */
import type { Stage69LandUseDomainProfile, Stage69MixCalculationBasis } from './landUseFunctionalStructureStage69Types';

export interface Stage69ClassificationSectorGuardResult {
  landUseVsActivityAndColorRuleFa: string;
  residentialFourVarsAndPublicGreenGuardFa: string;
  educationHealthCapacityAndSatelliteLegalGuardFa: string;
}

export interface Stage69MixCompatibilityScenarioGuardResult {
  mixBasisDiversityAndCompatibilityGuardFa: string;
  historicalRangeAndConformanceVsViolationGuardFa: string;
  threeRealtyValuesScenarioAndPrivacyGuardFa: string;
}

export function evaluateLandUseClassificationMapAndSectors(
  profile: Stage69LandUseDomainProfile,
  enforceDistinctAlertColors: boolean,
  excludePrivateGardenFromPublicGreen: boolean,
): Stage69ClassificationSectorGuardResult {
  const colorRuleFa = enforceDistinctAlertColors
    ? 'تفکیک سه‌لایه رنگ برقرار است: رنگ کاربری زمین ≠ رنگ وضعیت اعتبار داده ≠ رنگ هشدار ناسازگاری (قرمز فقط برای هشدار، نه کاربری صنعتی).'
    : 'هشدار طراحی: تداخل پالت رنگ کاربری با رنگ هشدار یا وضعیت داده مجاز نیست و باید مجزا بماند.';

  const landUseVsActivityAndColorRuleFa =
    `تفکیک قطعی در قطعه ${profile.parcelId}: کاربری ثبت‌شده «${profile.registeredLandUseFa}» و کاربری مشاهده‌شده «${profile.observedLandUseFa}» جدا از فعالیت اقتصادی مستقر («${profile.activeEconomicActivityFa}») ذخیره و نمایش داده می‌شوند | ${colorRuleFa}`;

  const publicGreenHa = (profile.publicGreenSqm / 10000).toFixed(2);
  const privateGardenHa = (profile.privateGardenSqm / 10000).toFixed(2);
  const greenPolicyFa = excludePrivateGardenFromPublicGreen
    ? `تفکیک اجباری سرانه سبز: فضای سبز عمومی قابل استفاده (${publicGreenHa} هکتار) جدا از باغ خصوصی (${privateGardenHa} هکتار) محاسبه شد؛ مساحت سبز به معنای دسترسی عمومی نیست.`
    : `هشدار خطای سرانه: جمع زدن باغ خصوصی (${privateGardenHa} هکتار) با پارک عمومی (${publicGreenHa} هکتار) در یک شاخص واحد گمراه‌کننده است.`;

  const residentialFourVarsAndPublicGreenGuardFa =
    `۴ متغیر غیرقابل جایگزینی بخش مسکونی: ${profile.buildingCount.toLocaleString('fa-IR')} ساختمان ≠ ${profile.parcelAreaSqm.toLocaleString('fa-IR')} متر مساحت قطعه ≠ ${profile.floorAreaSqm.toLocaleString('fa-IR')} متر زیربنا ≠ ${profile.lotCoveragePct}٪ سطح اشغال | ${greenPolicyFa}`;

  const educationHealthCapacityAndSatelliteLegalGuardFa =
    `کفایت خدمات آموزشی و درمانی فقط با تعداد مرکز سنجیده نمی‌شود (ظرفیت، جمعیت هدف، فاصله دسترسی و تاریخ اعتبار منبع «${profile.updatedAtFa}» الزامی است و تخمین کنار آمار رسمی برچسب جدا دارد) | در اراضی باغی/کشاورزی، تشخیص تصویری ماهواره‌ای ≠ اثبات وضعیت حقوقی یا کاربری مصوب زمین.`;

  return {
    landUseVsActivityAndColorRuleFa,
    residentialFourVarsAndPublicGreenGuardFa,
    educationHealthCapacityAndSatelliteLegalGuardFa,
  };
}

export function evaluateLandUseMixCompatibilityConformanceAndScenarios(
  profile: Stage69LandUseDomainProfile,
  selectedMixBasis: Stage69MixCalculationBasis,
  treatScenarioAsApprovedPlan: boolean,
  publicExportSanitized: boolean,
): Stage69MixCompatibilityScenarioGuardResult {
  const mixBasisDiversityAndCompatibilityGuardFa =
    `تحلیل اختلاط با مبنای صریح «${selectedMixBasis}» (غیرقابل جایگزینی با سه مبنای دیگر: مساحت زمین، زیربنا، تعداد واحدها و تعداد فعالیت‌ها) | شاخص تنوع Shannon=${profile.shannonDiversityIndex}: تنوع زیاد به‌صورت خودکار نشانه کیفیت بهتر محله نیست و می‌تواند تعارض عملکردی بسازد | وضعیت ماتریس سازگاری: «${profile.compatibilityStatus}» (ماتریس اولیه جایگزین ضوابط رسمی، مطالعات آلودگی و نظر کارشناسی نیست).`;

  const historicalRangeAndConformanceVsViolationGuardFa =
    `تاریخچه تغییرات: «${profile.historicalPeriodRangeFa}» (در نبود تاریخ دقیق، فقط بازه احتمالی به‌جای تاریخ ساختگی نمایش داده می‌شود) | وضعیت تطابق مصوب و واقعی: «${profile.approvedVsObservedStatus}» — محدودیت کلیدی: اختلاف میان کاربری ثبت‌شده و استفاده مشاهدهشده بهتنهایی اثباتکننده تخلف ساختمانی یا شهرسازی نیست.`;

  const scenarioLabelFa = treatScenarioAsApprovedPlan
    ? 'خطای منع‌شده: سناریو صرفاً یک مدل تحلیلی است و هرگز نباید به‌عنوان طرح مصوب یا پیشنهاد رسمی شهرسازی نمایش داده شود.'
    : 'برچسب صحیح سناریو: مقایسه سه‌گانه وضعیت موجود / پیشنهادی / تفاوت — مدل تحلیلی (طرح مصوب یا ضابطه رسمی نیست).';

  const privacyRuleFa = publicExportSanitized
    ? 'خروجی گزارش عمومی پاکسازی‌شده است: اطلاعات مالکیت و هویت اشخاص به‌صورت پیش‌فرض مخفی مانده، فیلترها در انتقال بین نظام‌ها حفظ شده و سابقه تغییر تأیید ثبت می‌شود.'
    : 'حالت خروجی داخلی محدود: نمایش یادداشت‌های کارشناسی منوط به کنترل سطح دسترسی و ثبت تاریخچه است (اطلاعات مالکیتی پیش‌فرض غیرفعال).';

  const threeRealtyValuesScenarioAndPrivacyGuardFa =
    `تفکیک ۳ مفهوم ارزش املاک: «${profile.transactionValueFa}» (معاملاتی مشاهده‌شده) ≠ «${profile.estimatedMarketValueFa}» (برآورد بازار) ≠ «${profile.zoningCapacityValueFa}» (اثر ظرفیت/محدودیت کاربری) | ${scenarioLabelFa} | ${privacyRuleFa}`;

  return {
    mixBasisDiversityAndCompatibilityGuardFa,
    historicalRangeAndConformanceVsViolationGuardFa,
    threeRealtyValuesScenarioAndPrivacyGuardFa,
  };
}
