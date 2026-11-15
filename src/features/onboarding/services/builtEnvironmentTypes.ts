/** @file src/features/onboarding/services/builtEnvironmentTypes.ts — Stage 54 Types, Boundaries, Component IDs, UX Events, Tasks & Stage 55 Preview */

export type BuiltEntityKind =
  | 'ساختمان (Building)'
  | 'قطعه زمین (Parcel)'
  | 'واحد ساختمانی (Building Unit)'
  | 'پرونده ساخت‌وساز (Construction Case)'
  | 'تغییر کالبدی (Physical Change)'
  | 'بلوک ساختمانی (Building Block)';

export type BuildingPhysicalStatus =
  | 'موجود'
  | 'در حال ساخت'
  | 'در حال تخریب'
  | 'تخریب‌شده'
  | 'بازسازی‌شده'
  | 'توسعه‌یافته'
  | 'متروکه احتمالی'
  | 'وضعیت نامشخص';

export type PermitCaseStatus =
  | 'ثبت درخواست'
  | 'صدور پروانه'
  | 'شروع عملیات'
  | 'گزارش پیشرفت'
  | 'توقف یا تعلیق'
  | 'پایان عملیات'
  | 'بهره‌برداری'
  | 'وضعیت نامشخص';

export type QualityCheckOutcome =
  | 'موفق'
  | 'ناموفق'
  | 'نیازمند بررسی'
  | 'دارای محدودیت'
  | 'اجرا نشده'
  | 'غیرقابل اعمال';

export type AreaDenominatorKind =
  | 'مساحت کل محدوده (Gross Block Area)'
  | 'مساحت مجموع قطعات (Parcel Sum Area)'
  | 'مساحت خالص زمین ساختمانی (Net Plot Area)';

export type BuiltEnvironmentViewerRole =
  | 'کاربر عمومی'
  | 'خریدار یا مستأجر'
  | 'تحلیل‌گر بازار'
  | 'شهرساز و متخصص'
  | 'مدیر داده و سامانه';

export interface BuildingRecord {
  id: string;
  parcelId: string;
  blockId: string;
  neighborhoodId: string;
  neighborhoodNameFa: string;
  districtFa: string;
  geometryAccuracy: 'دقیق' | 'تقریبی' | 'نیازمند بررسی';
  physicalStatus: BuildingPhysicalStatus;
  permitStatus: PermitCaseStatus;
  floorsCount: number | null;
  measuredHeightMeters: number | null;
  is3dSchematicOnly: boolean;
  occupancyAreaSqm: number | null;
  floorAreaSqm: number | null;
  unitsCount: number | null;
  activeListingsCount: number;
  declaredListingYear: number | null;
  officialRecordYear: number | null;
  yearSourceLabel: string;
  hasStructuralSafetyInspection: boolean;
  hasRestrictedUnitPii: boolean;
  previousDemolishedBuildingId: string | null;
  hasDemolitionBeforeCreationAnomaly: boolean;
  dataQualityStatus: 'کامل' | 'ناقص' | 'دارای تعارض';
}

export interface DetectedPhysicalChangeRecord {
  id: string;
  buildingId: string;
  parcelId: string;
  changeType: 'ساخت جدید' | 'تخریب' | 'تغییر ارتفاع/حجم' | 'بازسازی' | 'تغییر ثبت داده (Import)';
  observationStage: 'تغییر مشاهده‌شده' | 'تغییر تأییدشده' | 'تغییر منتسب به پروژه';
  linkedConstructionCaseId: string | null;
  observedDateFa: string;
  sourceName: string;
  aiSuggestedConfidencePercent: number | null;
}

export const STAGE54_BOUNDARIES_7: ReadonlyArray<{ stage: string; responsibilityFa: string; stage54RoleFa: string }> = [
  { stage: '۱۷: شناخت محله', responsibilityFa: 'معرفی ویژگی‌های محله', stage54RoleFa: 'تحلیل ساختار کالبدی ساختمان‌های محله' },
  { stage: '۱۹: کشف ملک', responsibilityFa: 'نمایش املاک قابل عرضه', stage54RoleFa: 'شناخت ساختمان مستقل از وضعیت آگهی' },
  { stage: '۲۰: ارزش‌گذاری', responsibilityFa: 'برآورد ارزش ملک', stage54RoleFa: 'استفاده از داده‌های کالبدی معتبر به‌عنوان ورودی (بدون موتور رقیب)' },
  { stage: '۱۶ و ۵۱: نقشه و تحلیل مکانی', responsibilityFa: 'نمایش و تحلیل روابط فضایی', stage54RoleFa: 'تحلیل ساختمان‌ها و بافت در مقیاس مکانی' },
  { stage: '۵۲: اطلس داده شهری', responsibilityFa: 'مدیریت مجموعه‌داده‌ها', stage54RoleFa: 'استفاده از منابع و شناسنامه‌های ساختمانی' },
  { stage: '۵۳: پروژه‌های شهری', responsibilityFa: 'ثبت پروژه‌ها و تحولات عمرانی', stage54RoleFa: 'تفکیک پروژه ساختمانی از ساختمان موجود و تغییر مشاهده‌شده' },
  { stage: '۵۴: رصد بافت کالبدی', responsibilityFa: 'شناخت ساختمان و تغییرات آن', stage54RoleFa: 'ایجاد تجربه مستقل اطلاعات ساختمانی' },
];

export const STAGE54_BUILT_ENTITIES_6: ReadonlyArray<{ kind: BuiltEntityKind; ruleFa: string }> = [
  { kind: 'ساختمان (Building)', ruleFa: 'سازه فیزیکی مستقل در موقعیت جغرافیایی؛ دارای شناسه پایدار حتی در نبود آگهی.' },
  { kind: 'قطعه زمین (Parcel)', ruleFa: 'محدوده زمین ثبتی؛ ممکن است بدون ساختمان یا دارای چند بنای مستقل باشد.' },
  { kind: 'واحد ساختمانی (Building Unit)', ruleFa: 'فضای مستقل داخل ساختمان؛ آگهی به واحد یا ساختمان یا موقعیت تقریبی وصل می‌شود.' },
  { kind: 'پرونده ساخت‌وساز (Construction Case)', ruleFa: 'فرایند مجوز، شروع، پیشرفت و پایان کار؛ رویداد است نه خود بنا.' },
  { kind: 'تغییر کالبدی (Physical Change)', ruleFa: 'تغییر مشاهده‌شده در بنا/حجم؛ بدون شواهد نباید به پروژه منتسب فرض شود.' },
  { kind: 'بلوک ساختمانی (Building Block)', ruleFa: 'گروه‌بندی قطعات/بناها برای تحلیل بافت؛ بدون بررسی معادل بلوک آماری فرض نمی‌شود.' },
];

export const STAGE54_BE_COMPONENT_IDS_50: ReadonlyArray<string> = Array.from(
  { length: 50 },
  (_, idx) => `BE-${String(idx + 1).padStart(2, '0')}`,
);

export const STAGE54_UX_EVENTS_19: ReadonlyArray<string> = [
  'building_hub_viewed',
  'building_searched',
  'building_filtered',
  'building_selected_from_map',
  'building_profile_viewed',
  'building_attribute_source_viewed',
  'building_parcel_viewed',
  'building_units_viewed',
  'building_construction_case_viewed',
  'building_physical_change_viewed',
  'building_history_compared',
  'building_3d_view_opened',
  'urban_fabric_atlas_viewed',
  'density_layer_toggled',
  'building_age_analysis_viewed',
  'neighborhood_built_report_viewed',
  'building_listings_viewed',
  'field_change_report_submitted',
  'building_data_issue_reported',
];

export const STAGE54_FORBIDDEN_ERRORS_25: ReadonlyArray<string> = [
  'ساختمان با قطعه یا واحد یکسان فرض شود',
  'تعداد آگهی‌ها به‌عنوان تعداد ساختمان‌ها گزارش شود',
  'ساختمان بدون آگهی وجود خارجی نداشته باشد',
  'ارتفاع یا متراژ تخمینی به‌عنوان اندازه دقیق نمایش داده شود',
  'مدل سه‌بعدی نمایشی به‌عنوان مدل مهندسی معرفی شود',
  'سال ساخت آگهی به‌عنوان تاریخ رسمی بنا نمایش داده شود',
  'ساختمان قدیمی صرفاً به‌دلیل سن، ناایمن یا فرسوده اعلام شود',
  'صدور مجوز به‌معنای ساخت واقعی نمایش داده شود',
  'پایان عملیات به‌معنای بهره‌برداری قطعی فرض شود',
  'هر تغییر داده به‌عنوان تغییر فیزیکی ساخت‌وساز تلقی شود',
  'تشخیص خودکار تصویر به‌عنوان تخریب قطعی نمایش داده شود',
  'اطلاعات محرمانه مالکان یا واحدها به‌صورت عمومی منتشر شود',
  'رابط بین شاخص‌های بافت با مخرج‌های متفاوت مقایسه گمراه‌کننده انجام دهد',
  'تصویر ساختمانی بدون کنترل حریم خصوصی (چهره/پلاک) منتشر شود',
  'منشأ داده‌های ساختمانی مخفی باشد',
];

export const STAGE54_UI_BE_TASK_IDS_46: ReadonlyArray<string> = Array.from(
  { length: 46 },
  (_, idx) => `UI-BE-${String(idx + 1).padStart(2, '0')}`,
);

export const STAGE55_LIVABILITY_PREVIEW_AXES_25: ReadonlyArray<string> = [
  '۱. مرکز کیفیت محیط محله',
  '۲. طبقه‌بندی شاخص‌های زیست‌پذیری (بدون یک امتیاز کلی مبهم)',
  '۳. دسترسی واقعی به خدمات روزمره (نه صرفاً وجود روی نقشه)',
  '۴. کیفیت محیط پیاده‌مدار و پیوستگی فضای عمومی',
  '۵. پوشش فضای سبز و دسترسی به پارک‌ها',
  '۶. شاخص‌های محیطی، آلودگی و آسایش حرارتی',
  '۷. دسترسی حمل‌ونقل عمومی و کاربری‌های ناسازگار',
  '۸. تفکیک داده اندازه‌گیری‌شده از گزارش شهروندان و عدم قطعیت',
  '۹. اتصال به پروفایل محله، ابزار مقایسه ۴۸، تحلیل ۵۱ و اطلس ۵۲',
];
