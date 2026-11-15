/** @file src/features/onboarding/services/marketReportingTypes.ts — Stage 50 (RT-UI-MARKET-REPORTING-001) Types & Catalogs */

export type ReportDataLayerKind = 'داده' | 'محاسبه' | 'تفسیر' | 'محدودیت';

export type MarketReportPriceDataType =
  | 'قیمت آگهی'
  | 'قیمت پیشنهادی'
  | 'قیمت معامله'
  | 'برآورد ارزش'
  | 'قیمت شاخصی';

export type AnalyticalClaimKind =
  | 'واقعیت ثبت‌شده'
  | 'نتیجه محاسبه'
  | 'تفسیر'
  | 'فرضیه'
  | 'محدودیت';

export type MarketReportLifecycleStatus =
  | 'پیش‌نویس'
  | 'در انتظار داده'
  | 'در حال پردازش'
  | 'در کنترل کیفیت'
  | 'نیازمند اصلاح'
  | 'آماده انتشار'
  | 'منتشرشده'
  | 'به‌روزرسانی‌شده'
  | 'تعلیق‌شده'
  | 'منسوخ‌شده';

export type MarketReportAccessLevel =
  | 'عمومی'
  | 'کاربری'
  | 'اشتراکی'
  | 'حرفه‌ای'
  | 'مدیریتی'
  | 'محرمانه';

export type MapCoverageZoneState =
  | 'پوشش کافی'
  | 'پوشش کم داده'
  | 'فاقد داده (غیرقابل تفسیر به‌عنوان ارزان)'
  | 'بررسی‌نشده';

export interface SixAxisReportQualityProfile {
  freshnessFa: string;
  coverageFa: string;
  completenessFa: string;
  provenanceFa: string;
  consistencyFa: string;
  reproducibilityFa: string;
  usesSingleOpaqueScore: false;
}

export interface ChangeNarrativeBlockRecord {
  narrativeId: string;
  observationFa: string;
  comparisonFa: string;
  plausibleExplanationFa: string;
  supportingEvidenceFa: string;
  limitationFa: string;
  statements: ReadonlyArray<{
    statementId: string;
    claimKind: AnalyticalClaimKind;
    textFa: string;
    linkedMetricId: string;
  }>;
  claimsDefinitiveCausationFromCooccurrence: false;
}

export interface ReportErrataRecord {
  errataId: string;
  reportId: string;
  previousVersion: string;
  newVersion: string;
  affectedSectionFa: string;
  previousValueFa: string;
  correctedValueFa: string;
  reasonFa: string;
  impactOnConclusionFa: string;
  correctedAtFa: string;
  previousVersionPreserved: true;
}

export interface MarketReportSummaryRecord {
  reportId: string;
  titleFa: string;
  categoryFa: 'کلان‌شهری' | 'منطقه‌ای' | 'محله‌ای' | 'موضوعی' | 'نوع ملکی' | 'زمانی' | 'تحلیلی' | 'شخصی' | 'پژوهشی';
  reportPeriodFa: string;
  reportVersion: string;
  generatedAtFa: string;
  geographicScopeFa: string;
  propertyTypeFa: string;
  priceDataType: MarketReportPriceDataType;
  methodNameFa: string;
  methodVersion: string;
  observationCount: number;
  medianAskingPricePerSqmM: number;
  previousPeriodMedianM: number;
  sampleCompositionChanged: boolean;
  status: MarketReportLifecycleStatus;
  accessLevel: MarketReportAccessLevel;
  qualityAxes: SixAxisReportQualityProfile;
}

export const STAGE50_BOUNDARIES_7 = [
  { prevStageFa: '۱۷: شناخت محله', roleFa: 'تحلیل تغییرات محله در طول زمان' },
  { prevStageFa: '۱۸: هوشمندی بازار', roleFa: 'ارائه گزارش‌های منظم و قابل مقایسه بدون ساخت شاخص متناقض' },
  { prevStageFa: '۲۰: ارزش‌گذاری', roleFa: 'گزارش روند و عوامل مؤثر در داده‌های بازار' },
  { prevStageFa: '۲۳: دانش و پژوهش', roleFa: 'انتشار گزارش‌های تحلیلی مبتنی بر داده' },
  { prevStageFa: '۳۷: اعتماد داده', roleFa: 'نمایش شناسنامه و اعتبار داده در هر گزارش' },
  { prevStageFa: '۴۸: ابزارهای تصمیم‌یار', roleFa: 'استفاده از گزارش برای تصمیم‌گیری و مقایسه' },
  { prevStageFa: '۴۹: پایش و هشدار', roleFa: 'تبدیل مجموعه تغییرات پایش‌شده به گزارش روندی' },
] as const;

export const STAGE50_STANDARD_REPORT_SECTIONS_16 = [
  '۱. عنوان و موضوع گزارش', '۲. محدوده جغرافیایی', '۳. بازه زمانی', '۴. نوع داده',
  '۵. زمان تولید گزارش', '۶. خلاصه اجرایی', '۷. شاخص‌های اصلی', '۸. نمودارها و جداول',
  '۹. نقشه و توزیع مکانی', '۱۰. تحلیل تغییرات', '۱۱. مقایسه تاریخی یا منطقه‌ای', '۱۲. روش محاسبه',
  '۱۳. منابع و کیفیت داده', '۱۴. محدودیت‌ها', '۱۵. گزارش‌های مرتبط', '۱۶. اشتراک‌گذاری و دریافت خروجی',
] as const;

export const STAGE50_MR_COMPONENT_IDS_50 = Array.from(
  { length: 50 },
  (_, idx) => `MR-${String(idx + 1).padStart(2, '0')}`,
);

export const STAGE50_UI_MR_TASKS_39 = Array.from(
  { length: 39 },
  (_, idx) => `UI-MR-${String(idx + 1).padStart(2, '0')}`,
);

export const STAGE50_UX_EVENTS_17 = [
  'market_report_opened', 'market_report_filtered', 'market_report_period_changed',
  'market_report_area_changed', 'market_report_type_changed', 'market_report_chart_opened',
  'market_report_data_table_opened', 'market_report_method_opened', 'market_report_sources_opened',
  'market_report_comparison_created', 'market_report_saved', 'market_report_shared',
  'market_report_exported', 'market_report_feedback_submitted', 'market_report_error_reported',
  'market_report_revision_opened', 'market_report_updated',
] as const;

export const STAGE50_FORBIDDEN_ERRORS_20 = [
  'یکی‌گرفتن قیمت آگهی، قیمت معامله و برآورد ارزش',
  'معرفی تغییر میانه قیمت به‌عنوان تغییر قطعی ارزش همه املاک',
  'انتشار گزارش بدون ذکر محدوده جغرافیایی و دوره زمانی',
  'پنهان‌کردن تعداد مشاهدات',
  'نمایش مناطق فاقد داده با رنگ مناطق دارای شاخص پایین',
  'مقایسه محله‌ها با دوره‌ها یا تعاریف متفاوت بدون توضیح',
  'نمایش نمودار بدون واحد اندازه‌گیری',
  'پنهان‌کردن تغییر روش محاسبه',
  'ایجاد سری تاریخی مصنوعی از داده‌های غیرقابل مقایسه',
  'معرفی هم‌زمانی دو رویداد به‌عنوان رابطه علت و معلولی',
  'انتشار روایت تولیدشده با هوش مصنوعی بدون کنترل داده',
  'حذف نسخه قبلی گزارش پس از اصلاح',
  'اشتراک‌گذاری گزارش داخلی یا خصوصی بدون مجوز',
  'نمایش شاخص کلی که ضعف کیفیت داده را پنهان کند',
  'ارائه پیش‌بینی بازار بدون توضیح روش و عدم قطعیت',
  'استفاده از عنوان‌های تبلیغاتی برای نتایج تحلیلی',
  'تعمیم داده یک محله به کل شهر',
  'استفاده از میانگین بدون بررسی اثر مقادیر پرت',
  'مقایسه روند دو محدوده با پوشش نمونه کاملاً متفاوت، بدون هشدار',
  'انتشار گزارش دوره‌ای ناقص با ظاهر گزارش نهایی',
] as const;

export const STAGE51_GEOSPATIAL_AXES_20 = [
  'طراحی مرکز تحلیل مکانی', 'تحلیل فاصله و دسترسی جغرافیایی', 'تحلیل ارتباط ملک با مراکز و خدمات اطراف',
  'تحلیل همجواری و مجاورت املاک و کاربری‌ها', 'تحلیل تراکم و توزیع مکانی', 'تحلیل خوشه‌های قیمتی و فضایی',
  'تحلیل تفاوت‌های درون‌محله‌ای', 'تحلیل ارتباط کاربری زمین با بازار املاک', 'تحلیل دسترسی به حمل‌ونقل عمومی',
  'تحلیل محدوده‌های دارای کمبود خدمات', 'تحلیل تغییرات کالبدی و فضایی در طول زمان', 'تحلیل محدوده‌های مستعد تحول شهری',
  'طراحی نقشه‌های چندمعیاره', 'تحلیل ارتباط موقعیت مکانی با شاخص‌های بازار', 'طراحی نمایش عدم قطعیت نتایج مکانی',
  'طراحی مقایسه چند محدوده از نظر روابط فضایی', 'طراحی اتصال تحلیل مکانی با ابزارهای تصمیم‌یار',
  'اتصال تحلیل مکانی به گزارش‌های بازار و پروفایل محله', 'طراحی رابط توضیح روش‌های تحلیل فضایی',
  'طراحی گزارش‌های مکانی قابل ذخیره و اشتراک‌گذاری',
] as const;
