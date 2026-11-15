/** @file src/features/onboarding/services/urbanProjectsTypes.ts — Stage 53 (RT-UI-URBAN-PROJECTS-001) Types & Catalogs */

export type UrbanProjectConceptKind =
  | 'پروژه شهری'
  | 'طرح شهری'
  | 'خبر یا اعلام عمومی'
  | 'وضعیت رسمی پروژه'
  | 'تغییر کالبدی مشاهده‌شده'
  | 'محدوده اثر پروژه';

export type UrbanProjectCategory =
  | 'حمل‌ونقل عمومی'
  | 'معابر و راه‌ها'
  | 'زیرساخت'
  | 'فضای عمومی'
  | 'خدمات شهری'
  | 'مسکن و توسعه'
  | 'نوسازی شهری'
  | 'محیط زیست'
  | 'مدیریت آب'
  | 'حفاظت و مرمت'
  | 'کاربری زمین'
  | 'توسعه تجاری';

export type UrbanProjectLifecycleStatus =
  | 'ایده یا پیشنهاد'
  | 'در حال مطالعه'
  | 'اعلام‌شده'
  | 'تصویب‌شده'
  | 'دارای مجوز'
  | 'دارای تأمین مالی'
  | 'در مرحله قرارداد'
  | 'آماده اجرا'
  | 'در حال اجرا'
  | 'متوقف‌شده'
  | 'تکمیل‌شده'
  | 'در حال بهره‌برداری'
  | 'لغوشده'
  | 'نامشخص';

export type ProjectInformationCredibilityStatus =
  | 'دارای سند رسمی'
  | 'دارای منبع معتبر'
  | 'تأییدشده در فرایند داخلی'
  | 'مشاهده میدانی'
  | 'نیازمند تأیید'
  | 'متعارض'
  | 'قدیمی'
  | 'نامشخص';

export type ProjectSpatialRelationKind =
  | 'واقع در محدوده پروژه'
  | 'مجاور محدوده'
  | 'واقع در مسیر پروژه'
  | 'داخل محدوده اثر انتخابی'
  | 'دارای ارتباط غیرمستقیم'
  | 'ارتباط نامشخص';

export interface ProjectPhaseRecord {
  phaseId: string;
  titleFa: string;
  zoneScopeFa: string;
  plannedStartFa: string;
  actualStartFa: string | null;
  status: UrbanProjectLifecycleStatus;
  documentedProgressPercent: number | null;
}

export interface ProjectDocumentRecord {
  docId: string;
  titleFa: string;
  docTypeFa: 'سند تصویب' | 'نقشه مصوب' | 'مجوز' | 'قرارداد' | 'گزارش پیشرفت' | 'اطلاعیه رسمی';
  authorityFa: string;
  issueDateFa: string;
  accessLevel: 'عمومی' | 'عمومی با محدودیت' | 'داخلی' | 'محرمانه' | 'غیرقابل انتشار';
  authenticityStatus: 'تطبیق‌شده با مرجع' | 'منبع قابل شناسایی' | 'دریافت‌شده' | 'نیازمند بررسی';
}

export interface ProjectFinancialFigures {
  initialEstimateTomanB: number | null;
  approvedBudgetTomanB: number | null;
  allocatedCreditTomanB: number | null;
  contractAmountTomanB: number | null;
  recordedPaymentTomanB: number | null;
  pricePeriodBaseFa: string;
  adjustmentMethodDeclared: boolean;
}

export interface UrbanProjectRecord {
  projectId: string;
  alternativeNamesFa: string[];
  titleFa: string;
  conceptKind: UrbanProjectConceptKind;
  category: UrbanProjectCategory;
  parentPlanTitleFa: string | null;
  status: UrbanProjectLifecycleStatus;
  credibility: ProjectInformationCredibilityStatus;
  geometryTypeFa: 'نقطه‌ای' | 'خطی' | 'محدوده‌ای' | 'چندبخشی' | 'محدوده تقریبی';
  geometryPrecisionFa: 'دقیق مصوب' | 'تقریبی (نیازمند ممیزی)' | 'نامشخص';
  executionFootprintFa: string;
  analyticalEffectZoneFa: string;
  neighborhoodsLinkedFa: string[];
  lastUpdatedDateFa: string;
  isStaleInfo: boolean;
  documentedProgressPercent: number | null;
  progressCalculationMethodFa: string | null;
  progressReportsConflict?: { sourceAFa: string; valueA: number; sourceBFa: string; valueB: number };
  phases: ProjectPhaseRecord[];
  documents: ProjectDocumentRecord[];
  financials: ProjectFinancialFigures;
}

export const STAGE53_BOUNDARIES_8 = [
  { prevStageFa: '۱۵ و ۱۶: نقشه و لایه‌ها', roleFa: 'نمایش پروژه‌ها و محدوده عملیات' },
  { prevStageFa: '۱۷: شناخت محله', roleFa: 'نمایش پروژه‌ها و تحولات مرتبط با محله' },
  { prevStageFa: '۳۷: اعتماد داده', roleFa: 'مستندسازی وضعیت و اعتبار اطلاعات پروژه' },
  { prevStageFa: '۴۹: پایش و هشدار', roleFa: 'پایش تغییر وضعیت پروژه‌های مشخص' },
  { prevStageFa: '۵۰: گزارش بازار', roleFa: 'ارتباط تحولات شهری با گزارش‌های بازار' },
  { prevStageFa: '۵۱: تحلیل مکانی', roleFa: 'تحلیل مجاورت و محدوده اثر پروژه' },
  { prevStageFa: '۵۲: اطلس داده شهری', roleFa: 'معرفی منابع و لایه‌های مورد استفاده در پروژه‌ها' },
  { prevStageFa: '۵۳: پروژه‌های شهری', roleFa: 'چرخه اطلاعاتی پروژه از پیشنهاد تا بهره‌برداری' },
] as const;

export const STAGE53_UP_COMPONENT_IDS_50 = Array.from(
  { length: 50 },
  (_, i) => `UP-${String(i + 1).padStart(2, '0')}`,
);

export const STAGE53_UX_EVENTS_18 = [
  'urban_project_hub_opened', 'urban_project_search_submitted', 'urban_project_filter_applied',
  'urban_project_opened', 'urban_project_map_opened', 'urban_project_timeline_opened',
  'urban_project_document_opened', 'urban_project_source_opened', 'urban_project_saved',
  'urban_project_monitoring_created', 'urban_project_report_submitted', 'urban_project_issue_reported',
  'urban_project_comparison_created', 'urban_project_area_relation_opened',
  'urban_project_market_analysis_opened', 'urban_project_report_exported',
  'urban_project_version_opened', 'urban_project_alert_opened',
] as const;

export const STAGE53_CRITICAL_CONTROLS_5 = [
  'هر وضعیت مهم به منبع یا سند مشخص متصل باشد.',
  'محدوده عملیات از محدوده اثر تحلیلی جدا باشد.',
  'خبر، مشاهده میدانی و سند رسمی از یکدیگر قابل تشخیص باشند.',
  'هر تغییر در وضعیت، هندسه و زمان‌بندی در تاریخچه باقی بماند.',
  'هیچ ارتباط مکانی به‌صورت خودکار به پیش‌بینی تغییر ارزش ملک تبدیل نشود.',
] as const;

export const STAGE54_BUILT_ENV_AXES_25 = [
  'مرکز اطلاعات ساختمان‌های شهری',
  'تفکیک داده ثبتی، اعلامی، مشاهده‌شده و برآوردی ساختمان',
  'تفکیک مجوز ساخت، عملیات اجرایی و ساختمان تکمیل‌شده',
  'پایش تخریب، نوسازی و تغییرات تراکم/ارتفاع و بافت فرسوده',
  'اتصال کالبد ساختمان به ارزش‌گذاری ملک بدون حذف شواهد',
] as const;
