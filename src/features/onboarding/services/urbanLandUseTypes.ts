/** @file src/features/onboarding/services/urbanLandUseTypes.ts — Stage 61 Types, 16 Sections, 17 Categories, UI-LU-001..030 & Stage 62 Preview */

export type ApprovedPlanStatus =
  | 'مصوب و معتبر'
  | 'مصوب با اصلاحیه'
  | 'پیشنهادی'
  | 'در حال بررسی'
  | 'منقضی یا جایگزین‌شده'
  | 'وضعیت نامشخص';

export type LayerReconciliationStatus =
  | 'همخوانی اطلاعات'
  | 'اختلاف مشاهده‌شده'
  | 'نیازمند بررسی'
  | 'اطلاعات متعارض'
  | 'اطلاعات ناکافی';

export type LandUseChangeStatus =
  | 'تغییر تأییدشده'
  | 'تغییر مستند اما تأییدنشده'
  | 'تغییر برآوردی'
  | 'تغییر ناشی از اصلاح طبقه‌بندی'
  | 'اطلاعات ناکافی';

export interface ParcelLandUseProfile {
  zoneId: string;
  parcelNameFa: string;
  referencePeriodFa: string;
  approvedUseFa: string;
  approvedStatus: ApprovedPlanStatus;
  registeredUseFa: string;
  hasRegisteredSourceConflict: boolean;
  registeredConflictDetailFa: string;
  observedParcelUseFa: string;
  buildingFloorsUseNoteFa: string;
  observationMethodFa: string;
  reconciliationStatus: LayerReconciliationStatus;
  spatialMixVsDiversityNoteFa: string;
  adjacentCompatibilityNoteFa: string;
  vacantKind: 'زمین خالی' | 'زمین کم‌استفاده' | 'دارای کاربری فعال';
  vacantConstraintsNoteFa: string;
  changeStatus: LandUseChangeStatus;
}

export const STAGE61_SECTIONS_16: ReadonlyArray<{ id: string; titleFa: string }> = [
  { id: '01', titleFa: 'نمای کلی کاربری زمین' },
  { id: '02', titleFa: 'طبقه‌بندی کاربری‌ها' },
  { id: '03', titleFa: 'کاربری مصوب و قانونی' },
  { id: '04', titleFa: 'کاربری ثبت‌شده' },
  { id: '05', titleFa: 'استفاده واقعی از زمین' },
  { id: '06', titleFa: 'اختلاط کاربری‌ها' },
  { id: '07', titleFa: 'سازگاری و تعارض کاربری' },
  { id: '08', titleFa: 'کاربری مسکونی' },
  { id: '09', titleFa: 'کاربری تجاری و اداری' },
  { id: '10', titleFa: 'کاربری صنعتی و خدماتی' },
  { id: '11', titleFa: 'زمین خالی و کم‌استفاده' },
  { id: '12', titleFa: 'تغییرات کاربری' },
  { id: '13', titleFa: 'پروفایل قطعه و ساختمان' },
  { id: '14', titleFa: 'پروفایل کاربری محله' },
  { id: '15', titleFa: 'مقایسه و سناریوسازی' },
  { id: '16', titleFa: 'گزارش و مستندات' },
];

export const STAGE61_MAP_LAYERS_14: ReadonlyArray<string> = [
  'کاربری مسکونی',
  'تجاری',
  'اداری',
  'صنعتی',
  'خدماتی',
  'آموزشی',
  'درمانی',
  'فرهنگی',
  'ورزشی',
  'فضای سبز',
  'اراضی کشاورزی',
  'اراضی بایر',
  'کاربری مختلط',
  'سایر کاربری‌های ویژه',
];

export const STAGE61_CATEGORIES_17: ReadonlyArray<string> = [
  'مسکونی',
  'تجاری',
  'اداری',
  'صنعتی',
  'انبارداری',
  'آموزشی',
  'درمانی',
  'فرهنگی',
  'ورزشی',
  'فضای سبز',
  'مذهبی',
  'حمل‌ونقل',
  'زیرساختی',
  'کشاورزی',
  'بایر',
  'مختلط',
  'ویژه',
];

const UI_LU_LABELS: ReadonlyArray<string> = [
  'نمایش نمای کلی کاربری زمین',
  'انتخاب محدوده مکانی',
  'نمایش نظام طبقه‌بندی کاربری',
  'نمایش سلسله‌مراتبی دسته‌ها',
  'نمایش کاربری مصوب',
  'نمایش کاربری ثبت‌شده',
  'نمایش استفاده واقعی یا مشاهده‌شده',
  'تفکیک سه لایه اصلی کاربری',
  'مدیریت تعارض اطلاعات',
  'نمایش ترکیب کاربری‌ها',
  'تحلیل اختلاط عملکردی',
  'نمایش ماتریس سازگاری',
  'نمایش تعارض‌های مستند',
  'تحلیل کاربری مسکونی',
  'تحلیل کاربری تجاری و اداری',
  'تحلیل کاربری صنعتی و خدماتی',
  'شناسایی زمین‌های خالی',
  'تفکیک زمین خالی از کم‌استفاده',
  'نمایش تاریخچه تغییر کاربری',
  'نمایش پروفایل کاربری قطعه',
  'نمایش پروفایل عملکردی محله',
  'مقایسه محله‌ها',
  'اجرای سناریوی تغییر کاربری',
  'نمایش منشأ و کیفیت داده',
  'ثبت تاریخچه اصلاح اطلاعات',
  'رعایت سطح دسترسی',
  'هماهنگی با ماژول ضوابط شهری',
  'هماهنگی با پروفایل ملک',
  'طراحی واکنش‌گرای موبایل',
  'رعایت دسترس‌پذیری',
];

export const STAGE61_ACCEPTANCE_TESTS_30: ReadonlyArray<{ id: string; checkFa: string }> = UI_LU_LABELS.map(
  (checkFa, idx) => ({
    id: `UI-LU-${String(idx + 1).padStart(3, '0')}`,
    checkFa,
  }),
);

export const STAGE61_UX_EVENTS_14: ReadonlyArray<string> = [
  'landuse_hub_opened',
  'landuse_layer_toggled',
  'landuse_data_type_changed',
  'landuse_parcel_or_zone_selected',
  'approved_landuse_viewed',
  'observed_landuse_viewed',
  'layer_discrepancy_inspected',
  'functional_mix_viewed',
  'compatibility_conflict_checked',
  'landuse_history_viewed',
  'landuse_zones_compared',
  'landuse_scenario_executed',
  'landuse_provenance_viewed',
  'landuse_report_exported',
];

export const STAGE62_MORPHOLOGY_PREVIEW_AXES_16: ReadonlyArray<string> = [
  '۱. تحلیل ساختار بلوک‌های شهری و قطعات زمین',
  '۲. بررسی اندازه، شکل و هندسه قطعات',
  '۳. تحلیل فرم و ابعاد ساختمان‌ها',
  '۴. تحلیل ارتفاع، تعداد طبقات و تفاوت‌های ارتفاعی بافت',
  '۵. بررسی تراکم کالبدی و الگوی استقرار ساختمان‌ها',
  '۶. تحلیل سطح اشغال و فضای باز در مقیاس بافت',
  '۷. بررسی پیوستگی و گسستگی بافت شهری',
  '۸. تحلیل ساختار شبکه معابر و نفوذپذیری بلوک‌ها',
  '۹. بررسی نسبت فضای باز عمومی و خصوصی',
  '۱۰. تحلیل الگوهای بافت ریزدانه، درشت‌دانه و ترکیبی',
  '۱۱. شناسایی تغییرات مورفولوژیک و دگرگونی بافت',
  '۱۲. تحلیل ارتباط فرم کالبدی با نور، سایه، تهویه و شرایط محیطی',
  '۱۳. بررسی ارتباط مورفولوژی با دسترسی، کاربری و ارزش مکانی',
  '۱۴. طراحی پروفایل کالبدی بلوک، قطعه، ساختمان و محله',
  '۱۵. مقایسه الگوهای کالبدی محله‌ها',
  '۱۶. طراحی سناریوهای تغییر فرم و توسعه کالبدی',
];
