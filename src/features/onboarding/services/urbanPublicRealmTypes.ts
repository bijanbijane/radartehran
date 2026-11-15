/** @file src/features/onboarding/services/urbanPublicRealmTypes.ts — Stage 63 Types, 16 Sections, 12 Layers, UI-PR-001..028 & Stage 64 Preview */

export type PublicRealmReportStatus =
  | 'ثبت‌شده'
  | 'در حال بررسی'
  | 'تأییدشده'
  | 'ارجاع‌شده'
  | 'در حال اصلاح'
  | 'رفع‌شده'
  | 'ردشده با توضیح';

export interface PublicRealmAccessibilityGroupRow {
  groupFa:
    | 'ویلچر'
    | 'افراد دارای محدودیت حرکتی'
    | 'نابینا یا کم‌بینا'
    | 'سالمندان'
    | 'کودکان'
    | 'والدین همراه کودک / کالسکه'
    | 'محدودیت موقت حرکت';
  isChainPassable: boolean;
  barrierReasonFa: string;
}

export interface PublicRealmZoneProfile {
  zoneId: string;
  streetOrSpaceNameFa: string;
  spaceTypeFa: 'خیابان تجاری' | 'پیاده‌راه' | 'میدان شهری' | 'گذر محله‌ای';
  isPubliclyAccessibleSpace: boolean;
  nominalWidthMeters: number;
  effectiveUsableWidthMeters: number;
  obstacleDeductionNoteFa: string;
  continuityPercent: number;
  hasMidRouteStepOrBreak: boolean;
  hasTactilePaving: boolean;
  lightingCoveragePercent: number;
  perceivedSafetySurveyFa: string;
  shadeCoveragePercent: number;
  hasFullThermalComfortData: boolean;
  thermalDataLimitationFa: string;
  activeGroundFloorEntrancesCount: number;
  dayVitalityNoteFa: string;
  nightVitalityNoteFa: string;
  duplicateReportClusterCount: number;
  latestReportAgeMonths: number;
  hasReporterPiiOrPlateInPhoto: boolean;
  groupRows: ReadonlyArray<PublicRealmAccessibilityGroupRow>;
}

export const STAGE63_SECTIONS_16: ReadonlyArray<{ id: string; titleFa: string }> = [
  { id: '01', titleFa: 'نمای کلی فضای عمومی' },
  { id: '02', titleFa: 'شبکه پیاده‌روها' },
  { id: '03', titleFa: 'دسترس‌پذیری' },
  { id: '04', titleFa: 'موانع و محدودیت حرکت' },
  { id: '05', titleFa: 'ایمنی و روشنایی' },
  { id: '06', titleFa: 'سایه و آسایش حرارتی' },
  { id: '07', titleFa: 'جداره و منظر خیابان' },
  { id: '08', titleFa: 'میدان‌ها و فضاهای عمومی' },
  { id: '09', titleFa: 'مبلمان و امکانات شهری' },
  { id: '10', titleFa: 'سرزندگی و حضورپذیری' },
  { id: '11', titleFa: 'خیابان‌های تجاری' },
  { id: '12', titleFa: 'تجربه زمانی فضا' },
  { id: '13', titleFa: 'گزارش و ارزیابی کاربران' },
  { id: '14', titleFa: 'پروفایل خیابان و فضا' },
  { id: '15', titleFa: 'مقایسه و سناریوسازی' },
  { id: '16', titleFa: 'گزارش و مستندات' },
];

export const STAGE63_MAP_LAYERS_12: ReadonlyArray<string> = [
  'شبکه پیاده‌روها',
  'مسیرهای پیاده پیوسته',
  'مسیرهای دارای گسست',
  'موانع ثبت‌شده',
  'گذرگاه‌های عابر پیاده',
  'رمپ‌ها و مسیرهای دسترس‌پذیر',
  'مبلمان شهری',
  'روشنایی',
  'درختان و سایه',
  'میدان‌ها و فضاهای عمومی',
  'نقاط دارای گزارش مشکل',
  'مسیرهای مناسب افراد دارای محدودیت حرکتی (با داده معتبر)',
];

export const STAGE63_QUALITY_DIMENSIONS_6: ReadonlyArray<{ titleFa: string; scopeFa: string }> = [
  { titleFa: '۱. دسترسی و اتصال', scopeFa: 'پیوستگی شبکه، امکان عبور و ارتباط با سایر فضاها' },
  { titleFa: '۲. دسترس‌پذیری فراگیر', scopeFa: 'امکان استفاده مستقل برای گروه‌های مختلف بدون مانع' },
  { titleFa: '۳. راحتی فیزیکی', scopeFa: 'عرض مفید، جنس سطح، شیب، سایه و مبلمان' },
  { titleFa: '۴. ایمنی فیزیکی', scopeFa: 'روشنایی، گذرگاه عابر و حذف موانع خطرناک' },
  { titleFa: '۵. کیفیت بصری و کالبدی', scopeFa: 'جداره فعال، نظم، مبلمان و کیفیت نگهداری' },
  { titleFa: '۶. حضورپذیری و فعالیت', scopeFa: 'تنوع فعالیت تجمیعی، نقاط توقف و حضور در ساعات مختلف' },
];

const UI_PR_LABELS: ReadonlyArray<string> = [
  'نمایش نمای کلی فضای عمومی و تجربه پیاده',
  'انتخاب شهر، محله، خیابان یا فضای عمومی',
  'تفکیک عرض اسمی پیاده‌رو از عرض مفید قابل استفاده',
  'نمایش شبکه پیاده‌روها و پروفایل طولی مسیر',
  'تفکیک پیوستگی شبکه از دسترس‌پذیری فراگیر',
  'ارزیابی زنجیره دسترسی بدون امتیازدهی گمراه‌کننده به کل مسیر',
  'ارزیابی مستقل گروه‌های استفاده‌کننده (ویلچر، نابینا، سالمند، کالسکه)',
  'دسته‌بندی و نمایش مکانی موانع حرکت با تاریخ و وضعیت',
  'خوشه‌بندی گزارش‌های تکراری بدون حذف سابقه زمانی',
  'تفکیک ایمنی فیزیکی قابل سنجش از احساس امنیت ادراکی',
  'نمایش خوانایی محیط و نقاط تصمیم‌گیری مسیر',
  'نمایش پوشش سایه در تاریخ و ساعت منتخب',
  'ممانعت از معرفی سایه به عنوان آسایش حرارتی کامل',
  'تحلیل هندسی جداره و ورودی‌های فعال طبقه همکف',
  'تفکیک ارزیابی هندسی جداره از کیفیت بصری بدون روش شفاف',
  'تمایز وسعت میدان یا پارک از کیفیت و امکانات آن',
  'تفکیک فضای باز عمومی از فضای خصوصی یا نیمه‌خصوصی',
  'تحلیل توزیع مبلمان شهری متناسب با نوع فضا',
  'نمایش سرزندگی تجمیعی با بازه زمانی و روش گردآوری',
  'نمایش تعارض حرکت پیاده و توقف در محورهای تجاری بدون قضاوت کلی',
  'مقایسه هم‌زمان شرایط روز و شب با برچسب ساعت',
  'ثبت گزارش مردمی موبایل‌محور و تفکیک از ارزیابی کارشناسی',
  'پوشاندن چهره، پلاک و موقعیت خصوصی گزارش‌دهنده در انتشار عمومی',
  'ممانعت از نمایش خودکار داده قدیمی به‌عنوان وضعیت جاری',
  'شناسنامه مستقل خیابان، مسیر پیاده و فضای عمومی',
  'اجرای سناریوی فرضی بهبود پیاده‌رو و برچسب‌گذاری غیرمصوب',
  'حفظ دسترسی‌پذیری کیبورد و تفکیک غیرمتکی بر رنگ صرف',
  'پاسخ‌گویی واکنش‌گرا در دسکتاپ، تبلت و موبایل',
];

export const STAGE63_ACCEPTANCE_TESTS_28: ReadonlyArray<{ id: string; checkFa: string }> = UI_PR_LABELS.map(
  (checkFa, idx) => ({
    id: `UI-PR-${String(idx + 1).padStart(3, '0')}`,
    checkFa,
  }),
);

export const STAGE63_UX_EVENTS_15: ReadonlyArray<string> = [
  'public_realm_hub_opened',
  'street_selected',
  'pedestrian_route_selected',
  'obstacles_layer_enabled',
  'accessibility_chain_viewed',
  'shade_analysis_viewed',
  'lighting_safety_viewed',
  'facade_profile_inspected',
  'street_furniture_checked',
  'public_spaces_compared',
  'public_realm_report_submitted',
  'report_resolution_status_viewed',
  'improvement_scenario_executed',
  'public_realm_provenance_viewed',
  'public_realm_report_exported',
];

export const STAGE64_MOBILITY_PREVIEW_AXES_16: ReadonlyArray<string> = [
  '۱. تحلیل شبکه حمل‌ونقل عمومی و ارتباط میان شیوه‌های جابه‌جایی',
  '۲. تحلیل سفرهای درون‌شهری و جریان حرکت میان مناطق',
  '۳. بررسی الگوهای سفر روزانه و تغییرات زمانی',
  '۴. تحلیل دسترسی به مترو، اتوبوس، تاکسی و سایر خدمات حمل‌ونقل',
  '۵. بررسی ارتباط حمل‌ونقل عمومی با مسیرهای پیاده و دوچرخه',
  '۶. تحلیل گره‌ها، پایانه‌ها و مراکز تبادل سفر',
  '۷. بررسی نقاط پرترافیک و گلوگاه‌های حرکتی',
  '۸. تحلیل اتصال شبکه معابر و مسیرهای جایگزین',
  '۹. تحلیل دسترسی مکانی به فرصت‌های شغلی و خدمات شهری',
  '۱۰. بررسی تفاوت دسترسی در ساعات مختلف روز و روزهای هفته',
  '۱۱. طراحی پروفایل دسترسی حمل‌ونقلی محله‌ها و املاک',
  '۱۲. تحلیل ارتباط حمل‌ونقل با فعالیت اقتصادی و بازار املاک',
  '۱۳. بررسی تغییرات شبکه و الگوهای سفر در طول زمان',
  '۱۴. طراحی سناریوهای تغییر مسیر، توسعه شبکه و بهبود اتصال',
  '۱۵. مقایسه عملکردی شبکه‌های جابه‌جایی در مناطق مختلف',
  '۱۶. طراحی گزارش تحلیلی تحرک شهری و دسترسی چندوجهی',
];
