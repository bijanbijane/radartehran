/** @file src/features/onboarding/services/urbanInfrastructureTypes.ts — Stage 56 Types, 12 Sections, Acceptance Tests & Stage 57 Preview */

export type UtilityCoverageStatus =
  | 'دارای پوشش تأییدشده'
  | 'دارای پوشش گزارش‌شده اما تأییدنشده'
  | 'فاقد پوشش بر اساس داده موجود'
  | 'نامشخص به علت کمبود داده';

export type TravelModeKind = 'پیاده' | 'دوچرخه' | 'خودرو' | 'حمل‌ونقل عمومی';

export type CapacitySufficiencyLevel =
  | 'ظرفیت کافی بر اساس داده موجود'
  | 'احتمال فشار بر ظرفیت'
  | 'کمبود احتمالی خدمات'
  | 'اطلاعات ناکافی برای ارزیابی';

export type InfrastructureViewerRole = 'کاربر عمومی' | 'تحلیل‌گر شهری' | 'مدیر زیرساخت';

export interface NeighborhoodInfrastructureProfile {
  neighborhoodId: string;
  neighborhoodNameFa: string;
  districtFa: string;
  waterCoverageStatus: UtilityCoverageStatus;
  wastewaterCoveragePercent: number | null;
  electricityStabilityStatusFa: string;
  gasCoverageStatus: UtilityCoverageStatus;
  nominalCapacityUnits: number | null;
  operationalCapacityUnits: number | null;
  estimatedDemandUnits: number | null;
  transitStationsCount: number;
  hospitalsAndClinicsCount: number;
  schoolsCount: number;
  targetAgePopulationKnown: boolean;
  parksAndPublicSpacesCount: number;
  dataCollectedDateFa: string;
  realChangeEventDateFa: string;
  sourceLabelFa: string;
  hasSensitiveCriticalNodeDetails: boolean;
}

export interface InfrastructureScenarioInput {
  populationDeltaPercent: number;
  addedHealthCenters: number;
  addedTransitLines: number;
  addedCapacityPercent: number;
}

export const STAGE56_SECTIONS_12: ReadonlyArray<{ id: string; titleFa: string; subtitleFa: string }> = [
  { id: '01', titleFa: 'نمای کلی زیرساخت‌ها', subtitleFa: 'تصویر جامع وضعیت خدمات' },
  { id: '02', titleFa: 'زیرساخت‌های آب و فاضلاب', subtitleFa: 'پوشش و ظرفیت شبکه' },
  { id: '03', titleFa: 'زیرساخت انرژی', subtitleFa: 'برق و گاز' },
  { id: '04', titleFa: 'حمل‌ونقل و دسترسی', subtitleFa: 'معابر و حمل‌ونقل عمومی' },
  { id: '05', titleFa: 'خدمات درمانی', subtitleFa: 'پوشش و ظرفیت درمان' },
  { id: '06', titleFa: 'خدمات آموزشی', subtitleFa: 'مدارس و مراکز آموزشی' },
  { id: '07', titleFa: 'خدمات عمومی و شهری', subtitleFa: 'فضای سبز، فرهنگی، اضطراری' },
  { id: '08', titleFa: 'تحلیل عدالت فضایی', subtitleFa: 'توزیع خدمات و محرومیت' },
  { id: '09', titleFa: 'تحلیل ظرفیت', subtitleFa: 'تقاضا در برابر عرضه' },
  { id: '10', titleFa: 'مقایسه محله‌ها', subtitleFa: 'مقایسه چندمکانی' },
  { id: '11', titleFa: 'تغییرات زمانی', subtitleFa: 'تاریخچه و روند تغییرات' },
  { id: '12', titleFa: 'گزارش و سناریوسازی', subtitleFa: 'خروجی و تحلیل فرضی' },
];

export const STAGE56_INTEGRATIONS_5: ReadonlyArray<{ moduleFa: string; relationFa: string }> = [
  { moduleFa: 'پروفایل محله', relationFa: 'نمایش کیفیت زیرساخت و خدمات محله با روش محاسبه شفاف' },
  { moduleFa: 'نقشه اصلی', relationFa: 'نمایش لایه‌های زیرساختی و دسترسی با کنترل شلوغی نقشه' },
  { moduleFa: 'تحلیل بازار', relationFa: 'بررسی تأثیر خدمات شهری بر جذابیت مکانی' },
  { moduleFa: 'تحلیل ضوابط شهری (۵۵)', relationFa: 'بررسی ظرفیت زیرساخت برای توسعه و ساخت‌وساز' },
  { moduleFa: 'رصد ساختمان‌ها (۵۴)', relationFa: 'بررسی ارتباط توسعه کالبدی با فشار بر خدمات شهری' },
];

export const STAGE56_MAP_LAYERS_10: ReadonlyArray<string> = [
  'آب و فاضلاب',
  'برق',
  'گاز',
  'حمل‌ونقل عمومی',
  'معابر',
  'درمان',
  'آموزش',
  'خدمات شهری',
  'فضای سبز',
  'خدمات اضطراری',
];

export const STAGE56_ACCEPTANCE_TESTS_18: ReadonlyArray<{ id: string; checkFa: string }> = Array.from(
  { length: 18 },
  (_, idx) => ({
    id: `UI-INF-${String(idx + 1).padStart(3, '0')}`,
    checkFa: [
      'امکان انتخاب شهر، منطقه و محله',
      'نمایش لایه‌های زیرساختی مستقل',
      'امکان فعال‌سازی چند لایه با کنترل شلوغی',
      'نمایش جزئیات محدوده انتخاب‌شده',
      'تفکیک پوشش از ظرفیت',
      'امکان تحلیل دسترسی زمانی شبکه‌ای',
      'تفکیک انواع خدمات درمانی',
      'تفکیک انواع خدمات آموزشی',
      'نمایش شکاف خدماتی',
      'امکان مقایسه محله‌ها',
      'نمایش تغییرات تاریخی (تاریخ وقوع ≠ دریافت داده)',
      'امکان تولید گزارش',
      'تفکیک داده واقعی از سناریوی فرضی',
      'نمایش منشأ و تاریخ داده',
      'مدیریت داده ناقص و متعارض بدون جعل عدد',
      'رعایت دسترسی نقش‌محور',
      'عملکرد مناسب در موبایل',
      'خوانایی و دسترس‌پذیری نقشه',
    ][idx],
  }),
);

export const STAGE56_UX_EVENTS_10: ReadonlyArray<string> = [
  'infrastructure_module_opened',
  'service_category_selected',
  'infrastructure_layer_toggled',
  'area_selected_for_infrastructure',
  'facility_details_viewed',
  'isochrone_accessibility_analyzed',
  'neighborhoods_infrastructure_compared',
  'infrastructure_history_viewed',
  'infrastructure_report_generated',
  'infrastructure_provenance_viewed',
];

export const STAGE57_ENVIRONMENT_PREVIEW_AXES_10: ReadonlyArray<string> = [
  '۱. تحلیل آلودگی هوا و توزیع مکانی آلاینده‌ها',
  '۲. تحلیل آلودگی صوتی و منابع تولید صدا',
  '۳. تحلیل دما، جزایر حرارتی شهری و تغییرات اقلیمی',
  '۴. تحلیل پوشش گیاهی، فضای سبز و کیفیت آن',
  '۵. تحلیل منابع آب، روان‌آب و خطر آب‌گرفتگی',
  '۶. تحلیل کیفیت محیط پیرامونی ساختمان‌ها و محله‌ها',
  '۷. ارتباط شرایط زیست‌محیطی با کیفیت سکونت (بدون ادعای تشخیص پزشکی)',
  '۸. مقایسه زیست‌محیطی محله‌ها',
  '۹. تحلیل تغییرات محیطی در طول زمان',
  '۱۰. بررسی ارتباط شاخص‌های محیطی با ارزش و جذابیت مکانی',
];
