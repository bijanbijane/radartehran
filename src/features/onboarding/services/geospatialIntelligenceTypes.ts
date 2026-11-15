/** @file src/features/onboarding/services/geospatialIntelligenceTypes.ts — Stage 51 (RT-UI-GEOSPATIAL-INTELLIGENCE-001) Types & Catalogs */

export type SpatialExperienceLevel = 'نمایش مکانی' | 'تحلیل فضایی' | 'تفسیر تحلیلی';

export type DistanceMeasurementKind =
  | 'فاصله مستقیم (هندسی)'
  | 'فاصله شبکه‌ای (مسیر معابر)'
  | 'زمان پیاده‌روی تخمینی'
  | 'زمان رانندگی تخمینی'
  | 'زمان حمل‌ونقل عمومی'
  | 'شعاع پوشش';

export type PositionalAccuracyLevel = 'دقیق (مختصات تاییدشده)' | 'تقریبی (محدوده خیابان/بلوک)' | 'نامشخص';

export type SpatialClusterMode =
  | 'خوشه‌بندی بصری (صرفاً برای خوانایی نقشه)'
  | 'خوشه‌بندی آماری (الگوریتم و معیار آماری مشخص)';

export type SpatialNeighborhoodWeightRule =
  | 'مرز مشترک (Contiguity)'
  | 'تماس در نقطه (Queen)'
  | 'فاصله مشخص (Distance Band)'
  | 'نزدیک‌ترین همسایه‌ها (K-Nearest)';

export type ServiceEvaluationConcept = 'تراکم خدمت' | 'پوشش دسترسی' | 'کفایت خدمت';

export type UrbanTransformationSignalKind =
  | 'تغییر مشاهده‌شده'
  | 'نشانه تحول'
  | 'سناریوی احتمالی';

export type SpatialProcessingStageStatus =
  | 'آماده اجرا'
  | 'در حال آماده‌سازی داده'
  | 'در حال محاسبه'
  | 'در حال نمایش نتیجه'
  | 'تکمیل‌شده'
  | 'تکمیل‌شده با محدودیت'
  | 'ناموفق';

export interface SpatialDestinationAccessRecord {
  destinationId: string;
  nameFa: string;
  categoryFa: 'مراکز درمانی' | 'مراکز آموزشی' | 'ایستگاه‌های حمل‌ونقل' | 'پارک‌ها و فضاهای عمومی';
  straightLineMeters: number;
  networkRouteMeters: number | null;
  estimatedTravelMinutes: number | null;
  travelModeFa: string;
  sourceNameFa: string;
  updatedAtFa: string;
  originPositionalAccuracy: PositionalAccuracyLevel;
}

export interface IntraNeighborhoodCellRecord {
  cellId: string;
  labelFa: string;
  cellSizeMeters: number;
  observationCount: number;
  medianAskingPriceM: number | null;
  landUseReportedInListingsFa: string;
  officialZoningLandUseFa: string;
}

export interface SavedSpatialArtifactRecord {
  artifactId: string;
  saveKind: 'ذخیره نقشه (نمای دید و لایه‌ها)' | 'ذخیره تحلیل (پرسش، پارامترها، نسخه روش و خروجی)';
  titleFa: string;
  methodNameFa: string;
  methodVersion: string;
  geographicScopeFa: string;
  scaleFa: 'سطح منطقه' | 'سطح محله' | 'شبکه سلولی درون‌محله‌ای';
  parametersSummaryFa: string;
  positionalAccuracy: PositionalAccuracyLevel;
  analyticalConfidenceFa: 'کافی' | 'محدود (نیازمند احتیاط)' | 'ناکافی برای استنباط آماری';
  createdAtFa: string;
  isPrivateScope: boolean;
}

export const STAGE51_BOUNDARIES_8 = [
  { prevStageFa: '۱۵: تجربه نقشه', roleFa: 'تحلیل روابط و الگوهای مکانی فراتر از نمایش ساده' },
  { prevStageFa: '۱۶: مدیریت لایه‌ها', roleFa: 'ترکیب و تحلیل لایه‌های جغرافیایی منطبق با کاتالوگ' },
  { prevStageFa: '۱۷: شناخت محله', roleFa: 'تحلیل تفاوت‌های درون‌محله‌ای و شبکه سلولی' },
  { prevStageFa: '۱۸: هوشمندی بازار', roleFa: 'بررسی توزیع فضایی شاخص‌های بازار املاک' },
  { prevStageFa: '۳۷: منشأ و کیفیت داده', roleFa: 'نمایش دقت مکانی و عدم قطعیت جغرافیایی' },
  { prevStageFa: '۴۸: ابزارهای تصمیم‌یار', roleFa: 'استفاده از نتایج تحلیل فضایی در تصمیم‌گیری و مقایسه' },
  { prevStageFa: '۵۰: گزارش‌های بازار', roleFa: 'تولید گزارش‌های تحلیلی مکانی مستند' },
  { prevStageFa: '۵۱: هوشمندی جغرافیایی', roleFa: 'لایه پیشرفته تحلیل روابط فضایی بدون ادعای علّی کاذب' },
] as const;

export const STAGE51_FORBIDDEN_URBAN_PHRASES_3 = [
  'منطقه قطعی رشد قیمت',
  'فرصت تضمینی سرمایه‌گذاری',
  'بهترین منطقه آینده',
] as const;

export const STAGE51_GI_COMPONENT_IDS_50 = Array.from(
  { length: 50 },
  (_, idx) => `GI-${String(idx + 1).padStart(2, '0')}`,
);

export const STAGE51_UI_GI_TASKS_40 = Array.from(
  { length: 40 },
  (_, idx) => `UI-GI-${String(idx + 1).padStart(2, '0')}`,
);

export const STAGE51_UX_EVENTS_19 = [
  'spatial_analysis_opened', 'spatial_analysis_started', 'spatial_method_selected',
  'spatial_area_selected', 'spatial_layer_added', 'spatial_layer_removed',
  'spatial_parameter_updated', 'spatial_analysis_completed', 'spatial_analysis_limited',
  'spatial_analysis_failed', 'spatial_result_opened', 'spatial_method_opened',
  'spatial_source_opened', 'spatial_scenario_saved', 'spatial_scenario_compared',
  'spatial_report_created', 'spatial_report_exported', 'spatial_analysis_shared',
  'spatial_result_feedback_submitted',
] as const;

export const STAGE51_FORBIDDEN_ERRORS_20 = [
  'یکی‌گرفتن فاصله مستقیم و زمان دسترسی',
  'معرفی نقشه تراکم بصری به‌عنوان خوشه آماری',
  'معرفی همبستگی مکانی به‌عنوان رابطه علت و معلولی',
  'استفاده از داده تقریبی بدون اعلام دقت مکانی',
  'تفسیر نبود داده به‌عنوان مقدار صفر',
  'مقایسه دو محدوده با مقیاس‌های ناسازگار بدون هشدار',
  'نمایش نتیجه خوشه‌بندی بدون توضیح روش و پارامترها',
  'معرفی تعداد مراکز خدماتی به‌عنوان کفایت خدمات',
  'معرفی کاربری اعلام‌شده در آگهی به‌عنوان کاربری رسمی',
  'معرفی محدوده مستعد تحول به‌عنوان فرصت قطعی سرمایه‌گذاری',
  'پنهان‌کردن اثر اندازه سلول یا پهنای باند',
  'تغییر رنگ‌بندی نقشه در دوره‌های مختلف به‌گونه‌ای که مقایسه را گمراه کند',
  'اجرای تحلیل آماری روی نمونه ناکافی بدون هشدار',
  'ادغام دقت مکانی و اطمینان آماری در یک امتیاز مبهم',
  'افشای موقعیت دقیق داده‌های خصوصی',
  'تغییر روش تحلیل بدون نسخه‌بندی',
  'ایجاد روش تحلیلی موازی با موتورهای مرجع',
  'نمایش نتیجه ناموفق به‌عنوان خروجی معتبر',
  'ایجاد لایه‌های تکراری و ناسازگار با معماری لایه‌های مرحله ۱۶',
  'نمایش خروجی هوش مصنوعی به‌عنوان نتیجه قطعی تحلیل جغرافیایی',
] as const;

export const STAGE52_URBAN_ATLAS_AXES_24 = [
  'طراحی مرکز داده‌های شهری', 'طراحی کاتالوگ مجموعه‌داده‌ها', 'طراحی اطلس لایه‌های مکانی',
  'طبقه‌بندی داده‌های شهری و کالبدی', 'طراحی شناسنامه هر مجموعه‌داده', 'مدیریت نسخه، تاریخ و منشأ اطلاعات',
  'طراحی جست‌وجو و کشف داده', 'نمایش پوشش جغرافیایی و زمانی داده‌ها', 'تفکیک داده رسمی، مشارکتی، تجمیعی و برآوردی',
  'طراحی فهرست منابع و مراجع شهری', 'طراحی دسترسی به لایه‌های قابل مشاهده و قابل استفاده',
  'طراحی وضعیت کیفیت، کامل‌بودن و تازگی داده‌ها', 'طراحی درخواست اصلاح یا تکمیل داده',
  'طراحی گزارش تغییرات و نسخه‌های لایه‌ها', 'طراحی مقایسه مجموعه‌داده‌ها',
  'طراحی ارتباط کاتالوگ داده با مرکز تحلیل مکانی', 'طراحی ارتباط داده‌ها با پروفایل محله‌ها',
  'طراحی اتصال لایه‌ها به گزارش‌های بازار', 'طراحی دسترسی کاربران حرفه‌ای و پژوهشگران',
  'طراحی حریم خصوصی و محدودیت انتشار اطلاعات', 'طراحی پنل مدیریت مجموعه‌داده‌ها',
  'طراحی کنترل تعارض و تناقض میان منابع', 'طراحی استاندارد نام‌گذاری و طبقه‌بندی لایه‌ها',
  'طراحی چرخه بازبینی و منسوخ‌کردن داده‌های مرجع',
] as const;
