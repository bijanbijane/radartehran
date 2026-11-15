/** @file src/features/onboarding/services/urbanDemographicsTypes.ts — Stage 59 Types, 15 Sections, UI-DEM-001..028 & Stage 60 Preview */

export type DemographicForecastKind =
  | 'داده مشاهده‌شده'
  | 'روند تاریخی'
  | 'برآورد مدل'
  | 'سناریوی فرضی'
  | 'برنامه یا هدف رسمی';

export type ServicePressureStatusFa =
  | 'ظرفیت کافی بر اساس داده موجود'
  | 'احتمال فشار بر خدمات'
  | 'کمبود احتمالی ظرفیت'
  | 'داده ناکافی برای ارزیابی';

export interface NeighborhoodDemographicsProfile {
  zoneId: string;
  neighborhoodNameFa: string;
  referenceYearFa: string;
  districtAvgRefYearFa: string;
  isSmallBlockBelowThreshold: boolean;
  minThresholdPolicyNoteFa: string;
  totalPopulation: number | null;
  grossDensityPerKm2: number | null;
  netResidentialDensityPerKm2: number | null;
  buildingDensityFar: string;
  householdCount: number | null;
  avgHouseholdSize: number | null;
  ageSharesFa: string;
  housingUnitsCount: number | null;
  vacantUnitsSharePercent: number | null;
  vacancyDefinitionSourceFa: string;
  daytimePopulationEst: number | null;
  nighttimePopulationEst: number | null;
  dayNightIsDirectCount: boolean;
  netPopulationChangePercent: number | null;
  statisticalBoundaryChanged: boolean;
  boundaryChangeNoteFa: string;
  servicePressureStatusFa: ServicePressureStatusFa;
  linkedStage56ServicesNoteFa: string;
}

export const STAGE59_SECTIONS_15: ReadonlyArray<{ id: string; titleFa: string }> = [
  { id: '01', titleFa: 'نمای کلی جمعیت' },
  { id: '02', titleFa: 'تراکم و توزیع جمعیت' },
  { id: '03', titleFa: 'ساختار سنی' },
  { id: '04', titleFa: 'ساختار خانوار' },
  { id: '05', titleFa: 'الگوهای سکونت' },
  { id: '06', titleFa: 'مهاجرت و جابه‌جایی' },
  { id: '07', titleFa: 'جمعیت روز و شب' },
  { id: '08', titleFa: 'تحولات اجتماعی محله' },
  { id: '09', titleFa: 'جمعیت و خدمات شهری' },
  { id: '10', titleFa: 'جمعیت و مسکن' },
  { id: '11', titleFa: 'فشار جمعیتی بر زیرساخت' },
  { id: '12', titleFa: 'پروفایل جمعیتی محله' },
  { id: '13', titleFa: 'مقایسه محله‌ها' },
  { id: '14', titleFa: 'تغییرات تاریخی' },
  { id: '15', titleFa: 'پیش‌بینی و گزارش' },
];

export const STAGE59_INTEGRATIONS_10: ReadonlyArray<string> = [
  'پروفایل محله',
  'نقشه اصلی',
  'بازار املاک',
  'صفحه ملک',
  'تحلیل زیرساخت‌ها (۵۶)',
  'تحلیل محیط‌زیست (۵۷)',
  'تحلیل مخاطرات (۵۸)',
  'رصد ساختمان‌ها (۵۴)',
  'ضوابط شهرسازی (۵۵)',
  'مرکز پژوهش',
];

export const STAGE59_MAP_LAYERS_10: ReadonlyArray<string> = [
  'جمعیت کل',
  'تراکم جمعیت',
  'تراکم جمعیت سکونتی',
  'گروه‌های سنی',
  'تعداد خانوار',
  'تغییرات جمعیت',
  'جمعیت روزانه',
  'جمعیت شبانه',
  'مناطق دارای رشد جمعیت',
  'مناطق دارای کاهش جمعیت',
];

export const STAGE59_GLOSSARY_12: ReadonlyArray<string> = [
  'جمعیت ساکن',
  'جمعیت حاضر',
  'جمعیت روزانه',
  'جمعیت شبانه',
  'خانوار',
  'واحد مسکونی',
  'تراکم ناخالص',
  'تراکم خالص',
  'مهاجرت',
  'تغییر خالص جمعیت',
  'جمعیت برآوردی',
  'جمعیت پیش‌بینی‌شده',
];

const UI_DEM_LABELS: ReadonlyArray<string> = [
  'نمایش نمای کلی جمعیت',
  'انتخاب شهر، منطقه و محله',
  'نمایش تراکم ناخالص و خالص',
  'تفکیک تراکم جمعیت از تراکم ساختمانی',
  'نمایش ساختار سنی',
  'نمایش نمودار هرم سنی',
  'نمایش تعداد و اندازه خانوار',
  'نمایش الگوهای سکونت',
  'تفکیک ساختمان و واحد مسکونی',
  'نمایش تغییرات جمعیت',
  'نمایش جریان جمعیت تجمیعی',
  'رعایت حداقل آستانه محرمانگی',
  'نمایش جمعیت روز و شب',
  'تفکیک داده واقعی از برآورد',
  'تحلیل جمعیت و خدمات شهری',
  'تحلیل جمعیت و بازار مسکن',
  'تحلیل فشار جمعیتی بر زیرساخت',
  'نمایش پروفایل جمعیتی محله',
  'مقایسه چند محله',
  'نمایش روند تاریخی',
  'مدیریت تغییر مرزهای آماری',
  'اجرای سناریوی جمعیتی',
  'نمایش مفروضات مدل',
  'نمایش منشأ و کیفیت داده',
  'مدیریت داده ناقص و متعارض',
  'کنترل دسترسی و حریم خصوصی',
  'رعایت واکنش‌گرایی موبایل',
  'رعایت دسترس‌پذیری',
];

export const STAGE59_ACCEPTANCE_TESTS_28: ReadonlyArray<{ id: string; checkFa: string }> = UI_DEM_LABELS.map(
  (checkFa, idx) => ({
    id: `UI-DEM-${String(idx + 1).padStart(3, '0')}`,
    checkFa,
  }),
);

export const STAGE59_UX_EVENTS_12: ReadonlyArray<string> = [
  'demographics_hub_opened',
  'demographic_zone_selected',
  'demographic_indicator_changed',
  'statistical_year_selected',
  'age_structure_viewed',
  'household_structure_viewed',
  'demographic_history_viewed',
  'demographic_zones_compared',
  'day_night_population_viewed',
  'infra_population_pressure_analyzed',
  'demographic_provenance_viewed',
  'demographic_report_exported',
];

export const STAGE60_URBAN_ECONOMY_PREVIEW_AXES_14: ReadonlyArray<string> = [
  '۱. تحلیل ساختار اقتصادی شهر و توزیع فعالیت‌های اقتصادی',
  '۲. تحلیل اشتغال و تمرکز مکانی مشاغل در مناطق و محله‌ها',
  '۳. شناسایی و طبقه‌بندی فعالیت‌های تجاری، اداری، خدماتی و صنعتی',
  '۴. تحلیل تراکم واحدهای تجاری و الگوی پراکندگی کسب‌وکارها',
  '۵. تحلیل مراکز تجاری، بازارها، محورهای کسب‌وکار و قطب‌های اقتصادی شهری',
  '۶. بررسی تغییرات فعالیت اقتصادی محله‌ها در طول زمان',
  '۷. تحلیل ارتباط جمعیت، اشتغال، فعالیت اقتصادی و تقاضای مسکن',
  '۸. بررسی ارتباط کاربری زمین با ساختار اقتصادی محدوده‌ها',
  '۹. تحلیل دسترسی کسب‌وکارها به حمل‌ونقل، زیرساخت و خدمات شهری',
  '۱۰. بررسی تغییرات کاربری تجاری و اداری و جابه‌جایی فعالیت‌های اقتصادی',
  '۱۱. طراحی پروفایل اقتصادی محله و محدوده‌های تجاری',
  '۱۲. طراحی مقایسه اقتصادی مناطق و محله‌ها',
  '۱۳. تحلیل ظرفیت و پویایی اقتصادی محورهای شهری',
  '۱۴. طراحی گزارش‌ها و سناریوهای توسعه اقتصادی مکانی',
];
