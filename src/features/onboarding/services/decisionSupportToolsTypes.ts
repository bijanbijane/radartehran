/** @file src/features/onboarding/services/decisionSupportToolsTypes.ts — Stage 48 (RT-UI-DECISION-TOOLS-001) Types & Catalogs */

export type DecisionInputOrigin = 'داده سامانه' | 'ورودی کاربر' | 'فرض محاسباتی';
export type DecisionDataQuality = 'داده مستند' | 'داده تخمینی' | 'داده نامشخص';

export type DecisionResultStatus =
  | 'قابل محاسبه'
  | 'قابل محاسبه با محدودیت'
  | 'دارای عدم قطعیت بالا'
  | 'داده ناکافی'
  | 'نیازمند بررسی تخصصی'
  | 'محاسبه ناموفق';

export type PropertyObservationStatus =
  | 'مشاهده شد'
  | 'نشانه مشکل وجود دارد'
  | 'نیازمند بررسی'
  | 'قابل مشاهده نبود'
  | 'بررسی نشده'
  | 'بدون مشاهده مشکل ظاهری';

export type MaintenanceExpenseBucket =
  | 'هزینه انجام‌شده'
  | 'هزینه برنامه‌ریزی‌شده'
  | 'ذخیره پیشنهادی';

export type AreaMeasurementKind =
  | 'مساحت هندسی محاسبه‌شده'
  | 'مساحت اعلام‌شده توسط کاربر'
  | 'مساحت ثبت‌شده در سامانه'
  | 'مساحت مندرج در سند یا مدرک'
  | 'مساحت تأییدشده از طریق بررسی معتبر';

export type PersonalCriterionPriority =
  | 'الزامی'
  | 'بسیار مهم'
  | 'مهم'
  | 'ترجیحی'
  | 'بدون اهمیت';

export type ScenarioAccessRole =
  | 'owner'
  | 'invited_collaborator'
  | 'invited_specialist'
  | 'system_admin'
  | 'outsider';

export interface DecisionPropertyOption {
  propertyId: string;
  titleFa: string;
  entrySource: 'saved_list' | 'radar_database' | 'manual_external';
  originLabel: DecisionInputOrigin;
  updatedAtFa: string;
  areaSqm: number;
  ageYears: number;
  rooms: number;
  basePriceMillionToman: number | null;
  estimatedLegalCostM: number;
  inspectionCostM: number;
  initialRepairEstimateM: number | null;
  movingCostM: number;
  completenessPercent: number;
}

export interface ServiceOfferComparisonItem {
  offerId: string;
  providerNameFa: string;
  entrySource: 'marketplace' | 'request_bid' | 'manual_external';
  coveredScopeFa: string[];
  excludedScopeFa: string[];
  deliverableTypeFa: string;
  basePriceM: number;
  extraCostsM: number;
  durationDays: number;
  verifiedCredentialCount: number;
}

export interface RenovationOperationRow {
  rowId: string;
  categoryFa: string;
  titleFa: string;
  unitFa: string;
  quantity: number;
  unitPriceM: number;
  laborCostM: number;
  equipmentCostM: number;
  transportCostM: number;
  otherCostM: number;
  priceSourceStatus:
    | 'ثبت‌شده از پیشنهاد واقعی'
    | 'دریافت‌شده از منبع بازار'
    | 'واردشده توسط کاربر'
    | 'تخمین سیستم'
    | 'قدیمی و نیازمند به‌روزرسانی'
    | 'نامشخص';
  priceDateFa: string;
}

export interface ProjectActivityItem {
  activityId: string;
  titleFa: string;
  assigneeFa: string;
  durationDays: number;
  prerequisiteIds: string[];
  plannedStartDay: number;
  status: 'برنامه‌ریزی‌شده' | 'آغازشده' | 'تکمیل‌شده';
}

export interface MaintenanceCostEntry {
  entryId: string;
  titleFa: string;
  categoryFa: string;
  amountM: number;
  dateFa: string;
  bucket: MaintenanceExpenseBucket;
}

export interface SavedDecisionScenario {
  scenarioId: string;
  nameFa: string;
  toolTypeFa: string;
  methodVersion: string;
  calculatedAtFa: string;
  totalResultM: number;
  reservePercent: number;
  previousVersionSnapshot?: {
    versionLabel: string;
    methodVersion: string;
    totalResultM: number;
  };
}

export const STAGE48_BOUNDARIES_8 = [
  { prevStageFa: '۱۵: تجربه نقشه', diffFa: 'استفاده از اطلاعات نقشه در تصمیم‌گیری' },
  { prevStageFa: '۱۷: شناخت محله', diffFa: 'مقایسه چند محله با معیارهای انتخابی' },
  { prevStageFa: '۱۸: هوشمندی بازار', diffFa: 'استفاده از داده‌ها در سناریوهای تصمیم' },
  { prevStageFa: '۱۹: کشف ملک', diffFa: 'مقایسه ساختاریافته گزینه‌ها' },
  { prevStageFa: '۲۰: ارزش‌گذاری', diffFa: 'بررسی اثر فرض‌های مختلف بر ارزش یا هزینه (بدون موتور موازی)' },
  { prevStageFa: '۲۱: بازار خدمات', diffFa: 'مقایسه پیشنهادهای خدماتی' },
  { prevStageFa: '۴۵: اجرای پروژه', diffFa: 'برآورد و مقایسه سناریوهای اجرایی' },
  { prevStageFa: '۴۷: دانش حرفه‌ای', diffFa: 'تبدیل دانش به ابزارهای تعاملی' },
] as const;

export const STAGE48_FORBIDDEN_DETERMINISTIC_PHRASES_FA = [
  'بهترین ملک برای شما',
  'خرید تضمینی',
  'سود قطعی',
  'محله کاملاً مناسب',
  'هزینه نهایی قطعی',
  'بدون ریسک',
] as const;

export const STAGE48_DT_COMPONENT_IDS_40 = Array.from(
  { length: 40 },
  (_, idx) => `DT-${String(idx + 1).padStart(2, '0')}`,
);

export const STAGE48_UI_DT_TASKS_35 = Array.from(
  { length: 35 },
  (_, idx) => `UI-DT-${String(idx + 1).padStart(2, '0')}`,
);

export const STAGE48_UX_EVENTS_19 = [
  'decision_tool_opened', 'decision_tool_started', 'decision_input_updated',
  'decision_assumption_changed', 'property_comparison_created', 'neighborhood_comparison_created',
  'service_offer_comparison_created', 'renovation_estimate_created', 'maintenance_tool_used',
  'area_calculation_completed', 'scenario_created', 'scenario_updated', 'scenario_compared',
  'scenario_saved', 'scenario_shared', 'decision_report_exported', 'decision_tool_error',
  'decision_source_opened', 'decision_method_opened',
] as const;

export const STAGE49_MONITORING_AXES_16 = [
  'مرکز هشدارها و اعلان‌ها', 'پایش تغییرات قیمت آگهی‌ها', 'پایش تغییر وضعیت آگهی و حذف آن',
  'هشدار تغییر مشخصات ملک', 'پایش محله‌ها و محدوده‌های مکانی', 'هشدار تغییرات شاخص‌های بازار',
  'هشدار فرصت‌های جدید متناسب با معیارهای کاربر', 'مدیریت جست‌وجوها و فهرست‌های پایش‌شده',
  'مقایسه تغییرات تاریخی قیمت و اطلاعات', 'هشدارهای افزایش یا کاهش غیرعادی داده‌ها',
  'تشخیص داده‌های تکراری و تغییرات مشکوک', 'تنظیم شدت و اهمیت هشدار',
  'مدیریت کانال‌های اعلان و ترجیحات کاربر', 'سابقه هشدارها و وضعیت پیگیری',
  'اتصال هشدارها به نقشه، ملک، محله و ابزارهای تصمیم‌یار', 'هشدارهای مبتنی بر رویداد (غیرتبلیغاتی)',
] as const;
