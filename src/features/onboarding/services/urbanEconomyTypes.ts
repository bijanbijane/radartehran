/** @file src/features/onboarding/services/urbanEconomyTypes.ts — Stage 60 Types, 16 Sections, UI-ECO-001..028 & Stage 61 Preview */

export type BusinessActivityStatus =
  | 'ثبت‌شده'
  | 'شناسایی‌شده'
  | 'فعال تأییدشده'
  | 'فعالیت گزارش‌شده'
  | 'غیرفعال تأییدشده'
  | 'وضعیت نامشخص';

export type CommercialCorridorType =
  | 'محور تجاری محلی'
  | 'محور تجاری منطقه‌ای'
  | 'خیابان تجاری اصلی'
  | 'محور اداری'
  | 'محور خدماتی'
  | 'محور صنعتی'
  | 'محور مختلط تجاری و خدماتی';

export type EconomicScenarioLifecycleKind =
  | 'وضعیت مشاهده‌شده'
  | 'روند تاریخی'
  | 'برآورد مدل'
  | 'سناریوی فرضی'
  | 'برنامه مصوب'
  | 'پروژه در حال اجرا'
  | 'نتیجه مشاهده‌شده پس از اجرا';

export interface NeighborhoodEconomyProfile {
  zoneId: string;
  neighborhoodNameFa: string;
  referencePeriodFa: string;
  registeredUnitsCount: number;
  verifiedActiveUnitsCount: number;
  businessDensityPerKm2: number;
  employmentRegisteredCount: number | null;
  employmentNoteFa: string;
  dominantActivityGroupFa: string;
  diversityIndexMethodFa: string;
  corridorType: CommercialCorridorType;
  corridorSegmentsNoteFa: string;
  multiBranchRawRecordsCount: number;
  deduplicatedEconomicEntitiesCount: number;
  multiCategoryNoteFa: string;
  isCoverageExpansionOnly: boolean;
  dataCoverageNoteFa: string;
  networkAccessIsochrone15MinPop: number | null;
  isNetworkBasedAccess: boolean;
  industrialEnvironmentalNoteFa: string;
  hasSourceConflict: boolean;
  sourceConflictDetailFa: string;
  commercialRentCorrelationNoteFa: string;
}

export const STAGE60_SECTIONS_16: ReadonlyArray<{ id: string; titleFa: string }> = [
  { id: '01', titleFa: 'نمای کلی اقتصاد شهری' },
  { id: '02', titleFa: 'پراکندگی کسب‌وکارها' },
  { id: '03', titleFa: 'طبقه‌بندی فعالیت‌ها' },
  { id: '04', titleFa: 'اشتغال و تمرکز شغلی' },
  { id: '05', titleFa: 'محورهای تجاری' },
  { id: '06', titleFa: 'مراکز و پهنه‌های اقتصادی' },
  { id: '07', titleFa: 'اقتصاد خدمات و کسب‌وکار' },
  { id: '08', titleFa: 'اقتصاد صنعتی و تولیدی' },
  { id: '09', titleFa: 'اقتصاد و دسترسی' },
  { id: '10', titleFa: 'پویایی اقتصادی محله‌ها' },
  { id: '11', titleFa: 'اقتصاد و بازار املاک' },
  { id: '12', titleFa: 'ظرفیت اقتصادی مکانی' },
  { id: '13', titleFa: 'پروفایل اقتصادی محله' },
  { id: '14', titleFa: 'مقایسه محله‌ها' },
  { id: '15', titleFa: 'تغییرات تاریخی' },
  { id: '16', titleFa: 'سناریو و گزارش' },
];

export const STAGE60_MAP_LAYERS_10: ReadonlyArray<string> = [
  'تراکم کسب‌وکارها',
  'فعالیت‌های تجاری',
  'فعالیت‌های اداری',
  'فعالیت‌های خدماتی',
  'فعالیت‌های صنعتی',
  'مراکز تجاری',
  'محورهای اقتصادی',
  'تمرکز اشتغال',
  'تغییرات فعالیت اقتصادی',
  'پهنه‌های دارای تمرکز فعالیت',
];

export const STAGE60_GLOSSARY_16: ReadonlyArray<string> = [
  'واحد اقتصادی',
  'کسب‌وکار',
  'شرکت',
  'کارگاه',
  'واحد فعال',
  'واحد ثبت‌شده',
  'شاغل',
  'اشتغال',
  'فرصت شغلی',
  'تراکم اقتصادی',
  'تمرکز اقتصادی',
  'تنوع فعالیت',
  'قطب اقتصادی',
  'محور تجاری',
  'تقاضای بالقوه',
  'ظرفیت مکانی',
];

const UI_ECO_LABELS: ReadonlyArray<string> = [
  'نمایش نمای کلی اقتصاد شهری',
  'انتخاب شهر، منطقه، محله و محدوده',
  'نمایش پراکندگی و تراکم کسب‌وکارها',
  'تفکیک وضعیت واحد ثبت‌شده از فعال تأییدشده',
  'نمایش طبقه‌بندی فعالیت‌ها بدون شمارش چندباره',
  'تفکیک واحد اقتصادی، شعبه، برند و شرکت',
  'نمایش اشتغال جدا از تعداد کسب‌وکار',
  'ممانعت از تخمین بی‌برچسب اشتغال',
  'نمایش محورهای تجاری و تحلیل طولی قطعات',
  'نمایش مراکز و پهنه‌های اقتصادی با معیار روشن',
  'تفکیک تحلیل اقتصادی از دایرکتوری خدمات حرفه‌ای (۴۳)',
  'نمایش اقتصاد صنعتی و اتصال تجمیعی به محیط‌زیست (۵۷)',
  'محاسبه دسترسی بر اساس شبکه مسیر نه خط مستقیم',
  'مرزبندی تحلیل مکان‌یابی از تضمین سودآوری',
  'تفکیک تغییر پوشش داده از رشد واقعی بازار',
  'بررسی همبستگی اقتصاد و بازار املاک بدون جهش علّی',
  'شفاف‌سازی وزن‌ها در ظرفیت اقتصادی مکانی',
  'نمایش پروفایل اقتصادی محله در کنار پروفایل جمعیتی (۵۹)',
  'جلوگیری از مقایسه ناهم‌سنخ ثبت‌شده در برابر تأییدشده',
  'نمایش تغییرات تاریخی با دسته تغییر پوشش و اصلاح داده',
  'تفکیک سناریوی فرضی از وضعیت مشاهده‌شده و پروژه واقعی',
  'ارائه روش محاسبه شاخص تنوع و تمرکز اقتصادی',
  'مدیریت تعارض منابع و حفظ سابقه اصلاح',
  'حفظ حریم خصوصی کارکنان، درآمد اشخاص و اطلاعات مالی محرمانه',
  'جداسازی درخواست اصلاح کسب‌وکار تا پیش از تأیید',
  'کنترل دسترسی نقش‌محور (عمومی تا مدیر سامانه)',
  'طراحی واکنش‌گرای موبایل با فیلتر جست‌وجوپذیر',
  'رعایت اصول دسترس‌پذیری و شفافیت واحد/دوره',
];

export const STAGE60_ACCEPTANCE_TESTS_28: ReadonlyArray<{ id: string; checkFa: string }> = UI_ECO_LABELS.map(
  (checkFa, idx) => ({
    id: `UI-ECO-${String(idx + 1).padStart(3, '0')}`,
    checkFa,
  }),
);

export const STAGE60_UX_EVENTS_12: ReadonlyArray<string> = [
  'economy_hub_opened',
  'economy_zone_selected',
  'economic_activity_group_selected',
  'business_density_layer_toggled',
  'commercial_corridor_viewed',
  'employment_concentration_checked',
  'economy_zones_compared',
  'economic_dynamics_viewed',
  'economic_accessibility_analyzed',
  'economy_property_link_viewed',
  'economy_provenance_viewed',
  'economy_report_exported',
];

export const STAGE61_LANDUSE_PREVIEW_AXES_15: ReadonlyArray<string> = [
  '۱. تحلیل کاربری زمین در مقیاس شهر، منطقه، محله و قطعه',
  '۲. طبقه‌بندی کاربری‌های مسکونی، تجاری، اداری، صنعتی، خدماتی، آموزشی و درمانی',
  '۳. تحلیل اختلاط کاربری‌ها و تنوع عملکردی محله‌ها',
  '۴. بررسی سازگاری و تعارض کاربری‌های مجاور',
  '۵. تحلیل نسبت کاربری‌های مسکونی، تجاری، خدماتی و عمومی',
  '۶. تحلیل کاربری غالب و عملکرد واقعی محدوده‌ها',
  '۷. بررسی تفاوت کاربری مصوب، کاربری ثبت‌شده و کاربری مشاهده‌شده',
  '۸. تحلیل تغییر کاربری زمین و ساختمان در طول زمان',
  '۹. شناسایی محدوده‌های دارای تغییر عملکردی سریع',
  '۱۰. تحلیل ارتباط کاربری زمین با جمعیت، اشتغال و بازار املاک',
  '۱۱. بررسی اختلاط عملکردی در محورهای شهری و مراکز محله',
  '۱۲. طراحی پروفایل کاربری زمین برای محله و قطعه',
  '۱۳. طراحی نقشه تعارض و سازگاری کاربری‌ها',
  '۱۴. مقایسه ساختار عملکردی محله‌ها',
  '۱۵. طراحی سناریوهای تغییر کاربری و توسعه فضایی',
];
