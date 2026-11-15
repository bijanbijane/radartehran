/** @file src/features/onboarding/services/urbanRiskTypes.ts — Stage 58 Types, 14 Sections, UI-RISK-001..028 & Stage 59 Preview */

export type RiskDataProvenanceKind =
  | 'اندازه‌گیری مستقیم'
  | 'سابقه رخداد ثبت‌شده'
  | 'نقشه رسمی مخاطره'
  | 'مدل تحلیلی'
  | 'برآورد مبتنی بر داده‌های ثانویه'
  | 'گزارش تأییدنشده';

export type BuildingStructuralEvalTier =
  | 'ارزیابی تخصصی موجود'
  | 'مشخصات ساختمانی ثبت‌شده'
  | 'برآورد مدل'
  | 'اطلاعات ناقص'
  | 'فاقد داده';

export type SlopeStabilityClass = 'رانش ثبت‌شده' | 'استعداد رانش بر اساس مدل' | 'اطلاعات ناکافی';

export type InfrastructureResilienceDimensionStatus =
  | 'اطلاعات کافی برای ارزیابی'
  | 'آسیب‌پذیری شناسایی‌شده'
  | 'وابستگی قابل توجه'
  | 'ظرفیت جایگزین ثبت‌شده'
  | 'اطلاعات ناکافی';

export interface InfrastructureResilienceRow {
  sectorFa: 'آب' | 'برق' | 'گاز' | 'حمل‌ونقل' | 'درمان';
  coverageStatusFa: InfrastructureResilienceDimensionStatus;
  dependencyNoteFa: string;
  continuityNoteFa: string;
  isOperationalDetailRestricted: boolean;
}

export interface NeighborhoodRiskProfile {
  zoneId: string;
  neighborhoodNameFa: string;
  zoneContextFa: string;
  seismicHazardClassFa: string;
  buildingYearBuilt: number | null;
  buildingFloors: number | null;
  structuralSystemFa: string | null;
  structuralTier: BuildingStructuralEvalTier;
  subsidenceRateMmPerYear: number | null;
  subsidenceConfidenceFa: string;
  hasRecordedFloodHistory: boolean;
  floodModeledSusceptibilityFa: string;
  fireSuppressionRegisteredInDb: boolean;
  slopeClass: SlopeStabilityClass;
  hasUnverifiedCitizenEvent: boolean;
  normalDriveMinutes: number;
  emergencyScenarioRangeMinutes: string;
  nearbyFireStationNoteFa: string;
  eventOccurredDateFa: string;
  reportPublishedDateFa: string;
  radarIngestedDateFa: string;
  modelEvaluatedDateFa: string;
  hasSourceConflict: boolean;
  sourceConflictDetailFa: string;
  provenanceKind: RiskDataProvenanceKind;
  infrastructureMatrix: ReadonlyArray<InfrastructureResilienceRow>;
}

export const STAGE58_CONCEPTUAL_PILLARS_5: ReadonlyArray<{ titleFa: string; roleFa: string }> = [
  { titleFa: '۱. مخاطره (Hazard)', roleFa: 'احتمال یا شدت وقوع پدیده زیان‌بار مانند زلزله، سیلاب یا فرونشست' },
  { titleFa: '۲. مواجهه (Exposure)', roleFa: 'جمعیت، ساختمان‌ها، زیرساخت‌ها و دارایی‌های واقع در محدوده مخاطره' },
  { titleFa: '۳. آسیب‌پذیری (Vulnerability)', roleFa: 'میزان حساسیت یا آمادگی کالبدی/عملکردی عناصر در معرض نسبت به آسیب' },
  { titleFa: '۴. ظرفیت پاسخ‌گویی (Response Capacity)', roleFa: 'توان زیرساخت‌ها، معابر دسترسی، مراکز امداد و نهادهای مرتبط' },
  { titleFa: '۵. ریسک (Risk)', roleFa: 'برآورد پیامد محتمل وابسته به نوع مخاطره، داده ورودی و مدل ارزیابی' },
];

export const STAGE58_SECTIONS_14: ReadonlyArray<{ id: string; titleFa: string }> = [
  { id: '01', titleFa: 'نمای کلی ریسک شهری' },
  { id: '02', titleFa: 'زلزله و آسیب‌پذیری ساختمان' },
  { id: '03', titleFa: 'فرونشست زمین' },
  { id: '04', titleFa: 'سیلاب و آب‌گرفتگی' },
  { id: '05', titleFa: 'آتش‌سوزی شهری' },
  { id: '06', titleFa: 'رانش و ناپایداری زمین' },
  { id: '07', titleFa: 'سایر مخاطرات شهری' },
  { id: '08', titleFa: 'ایمنی معابر و دسترسی امدادی' },
  { id: '09', titleFa: 'مراکز امداد و پاسخ‌گویی' },
  { id: '10', titleFa: 'تاب‌آوری زیرساخت‌ها' },
  { id: '11', titleFa: 'پروفایل ریسک ملک و محله' },
  { id: '12', titleFa: 'تغییرات و سوابق مخاطرات' },
  { id: '13', titleFa: 'سناریوسازی بحران' },
  { id: '14', titleFa: 'گزارش و مستندات' },
];

export const STAGE58_INTEGRATIONS_9: ReadonlyArray<string> = [
  'نقشه اصلی',
  'پروفایل محله',
  'پروفایل ملک',
  'رصد ساختمان‌ها (۵۴)',
  'تحلیل ضوابط شهری (۵۵)',
  'تحلیل زیرساخت (۵۶)',
  'تحلیل محیط‌زیست (۵۷)',
  'خدمات شهری',
  'گزارش و پژوهش',
];

export const STAGE58_MAP_LAYERS_10: ReadonlyArray<string> = [
  'خطر لرزه‌ای',
  'آسیب‌پذیری ساختمان‌ها',
  'فرونشست',
  'سیلاب',
  'آتش‌سوزی',
  'رانش زمین',
  'سوابق رخدادها',
  'مسیرهای دسترسی اضطراری',
  'مراکز امدادی',
  'زیرساخت‌های حیاتی در سطح مجاز انتشار',
];

const UI_RISK_LABELS: ReadonlyArray<string> = [
  'نمایش نمای کلی مخاطرات شهری',
  'انتخاب شهر، منطقه، محله و محدوده',
  'تفکیک مخاطره از آسیب‌پذیری',
  'نمایش لایه خطر لرزه‌ای',
  'نمایش اطلاعات کالبدی ساختمان',
  'تفکیک داده ارزیابی‌شده از تخمین',
  'نمایش داده‌های فرونشست',
  'مقایسه تغییرات فرونشست در زمان',
  'نمایش نقشه سیلاب و آب‌گرفتگی',
  'تفکیک رخداد ثبت‌شده از مدل خطر',
  'نمایش اطلاعات مخاطرات آتش‌سوزی',
  'نمایش تحلیل ناپایداری شیب',
  'ثبت و دسته‌بندی رخدادهای شهری',
  'نمایش شبکه معابر و محدودیت‌ها',
  'تحلیل دسترسی اضطراری',
  'نمایش مراکز امدادی',
  'تحلیل پوشش مکانی مراکز',
  'نمایش وضعیت تاب‌آوری زیرساخت',
  'ارائه پروفایل ریسک ملک',
  'ارائه پروفایل ریسک محله',
  'نمایش تاریخچه رخدادها',
  'اجرای سناریوی فرضی',
  'تفکیک سناریو از وضعیت واقعی',
  'نمایش روش محاسبه و عدم قطعیت',
  'مدیریت تعارض منابع',
  'رعایت سطح دسترسی اطلاعات',
  'طراحی واکنش‌گرای موبایل',
  'رعایت دسترس‌پذیری',
];

export const STAGE58_ACCEPTANCE_TESTS_28: ReadonlyArray<{ id: string; checkFa: string }> = UI_RISK_LABELS.map(
  (checkFa, idx) => ({
    id: `UI-RISK-${String(idx + 1).padStart(3, '0')}`,
    checkFa,
  }),
);

export const STAGE58_UX_EVENTS_12: ReadonlyArray<string> = [
  'risk_hub_opened',
  'hazard_type_selected',
  'risk_map_layer_toggled',
  'risk_zone_selected',
  'property_risk_profile_viewed',
  'hazard_event_details_viewed',
  'emergency_centers_checked',
  'emergency_access_analyzed',
  'risk_zones_compared',
  'crisis_scenario_executed',
  'risk_provenance_viewed',
  'risk_report_exported',
];

export const STAGE59_DEMOGRAPHICS_PREVIEW_AXES_13: ReadonlyArray<string> = [
  '۱. تحلیل جمعیت و تراکم جمعیتی در مقیاس شهر، منطقه و محله',
  '۲. تحلیل ساختار سنی و ترکیب جمعیتی',
  '۳. تحلیل خانوار، اندازه خانوار و الگوهای سکونت',
  '۴. بررسی تغییرات جمعیت در طول زمان',
  '۵. تحلیل مهاجرت و جابه‌جایی جمعیت در سطح تجمیعی',
  '۶. تحلیل جمعیت روز و شب و تفاوت الگوهای حضور در محدوده‌ها در صورت داده معتبر',
  '۷. بررسی تغییرات ترکیب سکونتی و تحولات محله‌ای',
  '۸. تحلیل ارتباط جمعیت با دسترسی به خدمات عمومی، آموزشی، درمانی و حمل‌ونقل',
  '۹. بررسی ظرفیت سکونتی و فشار جمعیتی بر زیرساخت‌ها',
  '۱۰. تحلیل ارتباط ساختار جمعیتی با تقاضای مسکن و بازار املاک',
  '۱۱. طراحی پروفایل جمعیتی محله',
  '۱۲. طراحی مقایسه اجتماعی و جمعیتی محله‌ها',
  '۱۳. طراحی گزارش روندهای جمعیتی و سناریوهای تغییر جمعیت',
];
