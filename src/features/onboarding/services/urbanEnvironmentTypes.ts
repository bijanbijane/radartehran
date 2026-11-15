/** @file src/features/onboarding/services/urbanEnvironmentTypes.ts — Stage 57 Types, 13 Sections, UI-ENV-001..025 & Stage 58 Preview */

export type EnvironmentDataType =
  | 'اندازه‌گیری مستقیم'
  | 'داده تخمینی'
  | 'داده ماهواره‌ای'
  | 'داده ترکیبی'
  | 'داده ناقص';

export type SoilPollutionConfidence =
  | 'آلودگی تأییدشده با مستندات معتبر'
  | 'آلودگی گزارش‌شده اما تأییدنشده'
  | 'احتمال آلودگی بر اساس سابقه فعالیت یا مدل تحلیلی'
  | 'نبود اطلاعات کافی';

export type ScenarioLifecycleKind =
  | 'سناریوی فرضی'
  | 'برآورد مدل'
  | 'برنامه مصوب'
  | 'اقدام اجراشده'
  | 'نتیجه مشاهده‌شده';

export interface StreetEnvironmentProfile {
  streetZoneId: string;
  neighborhoodNameFa: string;
  streetCorridorFa: string;
  airPm25Value: number | null;
  airDataType: EnvironmentDataType;
  nearestStationDistanceMeters: number | null;
  measurementDateFa: string;
  ingestionDateFa: string;
  noiseDbDay: number | null;
  noiseDbNight: number | null;
  nearestNoiseSourceFa: string;
  surfaceTempCelsius: number | null;
  airTempCelsius: number | null;
  satelliteVegetationPercent: number | null;
  verifiedPublicGreenSqmPerCapita: number | null;
  hasRecordedFloodEvents: boolean;
  soilConfidence: SoilPollutionConfidence;
  citizenReportsCountPending: number;
  sourceLabelFa: string;
}

export const STAGE57_SECTIONS_13: ReadonlyArray<{ id: string; titleFa: string }> = [
  { id: '01', titleFa: 'نمای کلی محیط‌زیست' },
  { id: '02', titleFa: 'کیفیت هوا' },
  { id: '03', titleFa: 'آلودگی صوتی' },
  { id: '04', titleFa: 'اقلیم و جزایر حرارتی' },
  { id: '05', titleFa: 'فضای سبز و پوشش گیاهی' },
  { id: '06', titleFa: 'آب و روان‌آب شهری' },
  { id: '07', titleFa: 'خاک و آلودگی زمین' },
  { id: '08', titleFa: 'پسماند و پاکیزگی محیط' },
  { id: '09', titleFa: 'کیفیت محیط پیرامون ملک' },
  { id: '10', titleFa: 'عدالت زیست‌محیطی' },
  { id: '11', titleFa: 'مقایسه محله‌ها' },
  { id: '12', titleFa: 'تغییرات زمانی' },
  { id: '13', titleFa: 'گزارش و سناریوسازی' },
];

export const STAGE57_INTEGRATIONS_8: ReadonlyArray<string> = [
  'نقشه اصلی',
  'پروفایل محله',
  'صفحه ملک',
  'تحلیل بازار',
  'رصد ساختمان‌ها (۵۴)',
  'تحلیل زیرساخت‌ها (۵۶)',
  'دانش و پژوهش',
  'مشارکت کاربران',
];

export const STAGE57_MAP_LAYERS_10: ReadonlyArray<string> = [
  'کیفیت هوا',
  'آلودگی صوتی',
  'دمای سطح زمین',
  'جزایر حرارتی',
  'پوشش گیاهی',
  'فضای سبز عمومی',
  'آب‌های سطحی و روان‌آب',
  'نقاط آلودگی خاک',
  'گزارش‌های محیطی',
  'مناطق مستعد آب‌گرفتگی',
];

export const STAGE57_ACCEPTANCE_TESTS_25: ReadonlyArray<{ id: string; checkFa: string }> = Array.from(
  { length: 25 },
  (_, idx) => ({
    id: `UI-ENV-${String(idx + 1).padStart(3, '0')}`,
    checkFa: [
      'نمایش نمای کلی محیط‌زیست',
      'امکان انتخاب شهر، منطقه و محله',
      'نمایش لایه کیفیت هوا',
      'تفکیک داده مستقیم از داده تخمینی',
      'نمایش تاریخ و زمان اندازه‌گیری',
      'نمایش نقشه آلودگی صوتی',
      'مقایسه شرایط صوتی در بازه‌های زمانی',
      'نمایش دمای سطح زمین',
      'تفکیک دمای هوا از دمای سطح زمین',
      'نمایش جزایر حرارتی',
      'نمایش پوشش گیاهی',
      'نمایش دسترسی شبکه‌ای به پارک‌ها',
      'نمایش لایه آب و روان‌آب',
      'تفکیک رخداد ثبت‌شده از استعداد مدل‌شده',
      'نمایش اطلاعات آلودگی خاک با سطح اعتبار',
      'ثبت و بررسی گزارش محیطی کاربران',
      'ارائه پروفایل محیطی ملک',
      'مقایسه زیست‌محیطی محله‌ها',
      'نمایش تغییرات تاریخی',
      'تفکیک سناریوی فرضی از واقعیت',
      'نمایش منشأ و کیفیت داده',
      'مدیریت داده‌های ناقص و متعارض',
      'رعایت دسترسی نقش‌محور',
      'عملکرد مناسب در موبایل',
      'رعایت اصول دسترس‌پذیری',
    ][idx],
  }),
);

export const STAGE57_UX_EVENTS_11: ReadonlyArray<string> = [
  'environment_hub_opened',
  'env_indicator_selected',
  'env_map_layer_toggled',
  'env_neighborhood_selected',
  'env_property_selected',
  'pollutant_details_viewed',
  'env_timeline_viewed',
  'env_neighborhoods_compared',
  'env_provenance_viewed',
  'env_report_exported',
  'citizen_env_report_submitted',
];

export const STAGE58_RISK_RESILIENCE_PREVIEW_AXES_12: ReadonlyArray<string> = [
  '۱. تحلیل خطر زلزله و آسیب‌پذیری کالبدی ساختمان‌ها',
  '۲. تحلیل فرونشست زمین و تغییرات ارتفاعی',
  '۳. تحلیل سیلاب، آب‌گرفتگی و مخاطرات مرتبط با روان‌آب',
  '۴. تحلیل خطر آتش‌سوزی شهری و آسیب‌پذیری محیطی',
  '۵. تحلیل رانش زمین و ناپایداری شیب‌ها',
  '۶. تحلیل ایمنی معابر و دسترسی خودروهای امدادی',
  '۷. تحلیل دسترسی به مراکز امداد و خدمات اضطراری',
  '۸. تحلیل تاب‌آوری زیرساخت‌ها و محله‌ها',
  '۹. نمایش سوابق رخدادها و تغییرات سطح خطر',
  '۱۰. طراحی پروفایل ریسک ساختمان، قطعه و محله',
  '۱۱. طراحی سناریوهای بحران و شبیه‌سازی پیامدها',
  '۱۲. تفکیک خطر طبیعی، آسیب‌پذیری کالبدی، مواجهه و ریسک نهایی',
];
