/** @file src/features/onboarding/services/marketMonitoringTypes.ts — Stage 49 (RT-UI-MARKET-MONITORING-001) Types & Catalogs */

export type AlertEpistemicKind =
  | 'تغییر ثبت‌شده'
  | 'وضعیت مشاهده‌شده'
  | 'استنباط سامانه'
  | 'سیگنال تحلیلی'
  | 'پیش‌بینی';

export type PriceConceptKind = 'قیمت آگهی' | 'قیمت پیشنهادی' | 'قیمت معامله';

export type AlertPriorityTier = 'مهم' | 'متوسط' | 'اطلاعاتی' | 'نیازمند بررسی';

export type ActiveMonitorStatus =
  | 'فعال'
  | 'متوقف‌شده'
  | 'نیازمند تنظیم'
  | 'منقضی'
  | 'بدون داده جدید'
  | 'با خطا'
  | 'حذف‌شده';

export type SourceCheckStatus =
  | 'بررسی موفق، بدون تغییر'
  | 'بررسی موفق، با تغییر'
  | 'بررسی ناقص'
  | 'بررسی ناموفق'
  | 'داده قدیمی'
  | 'عدم امکان تأیید';

export type DuplicateListingClassification =
  | 'آگهی جدید و مستقل'
  | 'آگهی مشابه'
  | 'آگهی احتمالاً تکراری'
  | 'بازنشر آگهی قبلی'
  | 'ارتباط نامشخص';

export type MonitorSensitivityLevel = 'حساس' | 'متعادل' | 'محدود';

export type NotificationDeliveryStatus =
  | 'در صف'
  | 'در حال ارسال'
  | 'ارسال‌شده'
  | 'ناموفق'
  | 'ردشده'
  | 'لغوشده'
  | 'تجمیع‌شده';

export interface MarketMonitorRuleRecord {
  monitorId: string;
  titleFa: string;
  targetType: 'ملک مشخص' | 'جست‌وجوی ذخیره‌شده' | 'محله' | 'محدوده مکانی ترسیمی' | 'شاخص بازار';
  scopeLabelFa: string;
  boundaryType: 'مرز رسمی محله' | 'محدوده ترسیمی کاربر' | 'فیلتر جست‌وجو' | 'تک‌ملک';
  polygonBounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  baselineAskingPriceM?: number;
  thresholdPercent?: number;
  thresholdAmountM?: number;
  hysteresisDeactivatePercent: number;
  sensitivity: MonitorSensitivityLevel;
  status: ActiveMonitorStatus;
  createdAtFa: string;
  lastCheckedAtFa: string;
  lastSourceCheckStatus: SourceCheckStatus;
  newAlertsCount: number;
}

export interface MarketAlertItemRecord {
  eventId: string;
  alertId: string;
  monitorIds: string[];
  eventTypeFa:
    | 'کاهش قیمت آگهی'
    | 'افزایش قیمت آگهی'
    | 'آگهی جدید'
    | 'عدم دسترسی به آگهی'
    | 'بازنشر احتمالی'
    | 'تغییر مشخصات ملک'
    | 'تغییر شاخص بازار محله'
    | 'تغییر کیفیت داده';
  epistemicKind: AlertEpistemicKind;
  priceConcept: PriceConceptKind;
  subjectTitleFa: string;
  previousValueFa: string;
  newValueFa: string;
  changeTimeFa: string;
  observedTimeFa: string;
  sourceNameFa: string;
  dataQualityStatus: 'تأییدشده' | 'تخمینی' | 'نامشخص' | 'نیازمند بررسی';
  triggerRuleReasonFa: string;
  priority: AlertPriorityTier;
  handlingStatus: 'جدید' | 'دیده‌شده' | 'پیگیری‌شده' | 'بایگانی‌شده' | 'اصلاح‌شده';
  correctionHistoryFa?: string[];
}

export interface AlertFeedbackReport {
  feedbackId: string;
  alertId: string;
  errorTypeFa:
    | 'تغییر قیمت اشتباه است'
    | 'آگهی تکراری است'
    | 'ملک اشتباه شناسایی شده است'
    | 'اطلاعات قدیمی است'
    | 'محدوده مکانی اشتباه است'
    | 'رویداد در منبع قابل تأیید نیست';
  descriptionFa: string;
  status:
    | 'دریافت‌شده'
    | 'در انتظار بررسی'
    | 'نیازمند اطلاعات بیشتر'
    | 'تأیید خطا'
    | 'رد گزارش'
    | 'اصلاح‌شده'
    | 'بسته‌شده';
}

export const STAGE49_BOUNDARIES_8 = [
  { prevStageFa: '۱۵: تجربه نقشه', roleFa: 'پایش تغییرات مکانی و رویدادهای محدوده' },
  { prevStageFa: '۱۷: شناخت محله', roleFa: 'اطلاع‌رسانی درباره تغییرات شاخص‌های محله' },
  { prevStageFa: '۱۸: هوشمندی بازار', roleFa: 'اطلاع‌رسانی درباره تغییرات معنادار بازار' },
  { prevStageFa: '۱۹: کشف ملک', roleFa: 'پایش تغییرات ملک و جست‌وجو' },
  { prevStageFa: '۲۰: ارزش‌گذاری', roleFa: 'اطلاع‌رسانی درباره تغییر داده‌های مؤثر بر برآورد' },
  { prevStageFa: '۲۲ و ۳۰: فضای شخصی و جست‌وجو', roleFa: 'تبدیل جست‌وجوهای انتخابی به پایش فعال' },
  { prevStageFa: '۴۸: ابزارهای تصمیم‌یار', roleFa: 'تبدیل تغییرات تازه به ورودی مقایسه و تصمیم' },
  { prevStageFa: '۴۹: پایش و هشدار', roleFa: 'ایجاد چرخه آگاهی و اقدام بدون هیجان‌زدگی کاذب' },
] as const;

export const STAGE49_MM_COMPONENT_IDS_45 = Array.from(
  { length: 45 },
  (_, idx) => `MM-${String(idx + 1).padStart(2, '0')}`,
);

export const STAGE49_UI_MM_TASKS_35 = Array.from(
  { length: 35 },
  (_, idx) => `UI-MM-${String(idx + 1).padStart(2, '0')}`,
);

export const STAGE49_UX_EVENTS_20 = [
  'monitoring_created', 'monitoring_rule_updated', 'monitoring_paused', 'monitoring_resumed',
  'monitoring_deleted', 'alert_generated', 'alert_delivered', 'alert_opened',
  'alert_followed_up', 'alert_archived', 'alert_feedback_submitted', 'alert_correction_recorded',
  'market_digest_opened', 'price_change_detected', 'new_listing_detected',
  'duplicate_listing_detected', 'monitoring_source_failed', 'notification_delivery_failed',
  'monitoring_rule_previewed', 'alert_source_opened',
] as const;

export const STAGE50_REPORTING_AXES_16 = [
  'مرکز گزارش‌های بازار', 'گزارش‌های دوره‌ای تهران و شهرهای تحت پوشش', 'گزارش تحولات بازار محله‌ها',
  'گزارش تغییرات قیمت آگهی و معاملات با تفکیک منشأ', 'مقایسه تاریخی دوره‌ها', 'گزارش تغییرات عرضه و ترکیب فایل‌ها',
  'تحلیل روندهای منطقه‌ای', 'گزارش مقایسه محله‌ها و مناطق', 'نمودارهای توزیع قیمت',
  'گزارش‌های اختصاصی نوع ملک', 'روایت تغییرات بازار با توضیح عوامل و محدودیت‌ها',
  'نمایش کیفیت، پوشش و کفایت داده‌های هر گزارش', 'گزارش‌های شخصی براساس پایش‌های کاربر',
  'اشتراک‌گذاری و خروجی گرفتن از گزارش', 'گزارش‌های مدیریتی و پژوهشی',
  'اتصال گزارش‌ها به نقشه، مرکز دانش و ابزارهای تصمیم‌یار',
] as const;
