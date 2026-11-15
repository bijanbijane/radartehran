/** @file src/features/onboarding/services/urbanRegulationTypes.ts — Stage 55 Types, Boundaries, Categories, Metrics & Stage 56 Preview */

export type RegulationNatureKind = 'ضابطه مصوب' | 'وضعیت موجود' | 'برآورد تحلیلی';

export type RegulationUncertaintyLevel =
  | 'داده رسمی و قابل استناد'
  | 'داده استخراج‌شده از سند'
  | 'داده تطبیق‌یافته با نقشه'
  | 'برآورد مبتنی بر داده‌های ناقص'
  | 'داده تأییدنشده'
  | 'داده قدیمی یا دارای تعارض';

export type ConstraintCategoryKind =
  | 'محدودیت‌های کالبدی'
  | 'محدودیت‌های مکانی و زیرساختی'
  | 'محدودیت‌های میراثی و محیطی';

export type RegulationViewerRole =
  | 'خریدار یا فروشنده'
  | 'سرمایه‌گذار یا سازنده'
  | 'مشاور املاک'
  | 'کارشناس شهرسازی و پژوهشگر'
  | 'مدیر سامانه';

export interface ParcelRegulationProfile {
  parcelId: string;
  neighborhoodNameFa: string;
  districtFa: string;
  zoneCode: string;
  zoneTitleFa: string;
  approvedPrimaryUseFa: string;
  observedUseFa: string;
  conditionalUsesFa: string[];
  prohibitedUsesFa: string[];
  lotAreaSqm: number | null;
  lotAreaOfficialConfirmed: boolean;
  parcelBoundaryUncertain: boolean;
  streetWidthMeters: number | null;
  approvedMaxFarPercent: number | null;
  observedFarPercent: number;
  approvedMaxCoveragePercent: number | null;
  observedCoveragePercent: number;
  approvedMaxFloors: number | null;
  observedFloors: number;
  calculationBasisFa: string;
  uncertaintyLevel: RegulationUncertaintyLevel;
  sourceDocTitleFa: string;
  sourceAuthorityFa: string;
  sourceDocNumberFa: string;
  lastVerifiedDateFa: string;
  conflictingZoningSources: boolean;
  overlappingConstraintIds: string[];
  hasPrivateOwnerDataRestricted: boolean;
}

export interface RegulationConstraintItem {
  id: string;
  titleFa: string;
  category: ConstraintCategoryKind;
  scopeFa: string;
  authorityFa: string;
  validUntilFa: string;
  verificationStatusFa: 'تأییدشده' | 'نیازمند استعلام رسمی';
  potentialImpactFa: string;
}

export interface RegulationDocumentRecord {
  id: string;
  categoryFa: string;
  titleFa: string;
  authorityFa: string;
  docNumberFa: string;
  approvalDateFa: string;
  effectiveDateFa: string;
  versionFa: string;
  geographicScopeFa: string;
  validityStatusFa: 'معتبر' | 'اصلاح‌شده' | 'قدیمی / جایگزین‌شده';
  primaryTextExcerptFa: string;
  aiHelperSummaryFa: string;
}

export interface RegulationAmendmentEvent {
  id: string;
  publishedDateFa: string;
  effectiveDateFa: string;
  titleFa: string;
  scopeFa: string;
  previousRuleFa: string;
  newRuleFa: string;
  authorityFa: string;
  verificationStatusFa: string;
}

export interface DevelopmentScenarioInput {
  lotAreaSqm: number;
  baseFarPercent: number;
  coveragePercent: number;
  hypotheticalFloors: number;
  maxHeightMeters: number | null;
  setbackMeters: number;
}

export const STAGE55_BOUNDARIES_9: ReadonlyArray<{ stageFa: string; relationFa: string }> = [
  { stageFa: 'مرحله ۱۵: تجربه نقشه', relationFa: 'نمایش لایه‌های ضوابط، پهنه و کاربری روی نقشه با راهنمای مجزا' },
  { stageFa: 'مرحله ۱۶: مدیریت لایه‌ها', relationFa: 'کنترل فعال‌سازی لایه‌های شهرسازی و مقایسه دو لایه' },
  { stageFa: 'مرحله ۱۷: پروفایل محله', relationFa: 'نمایش الگوی ضوابط و محدودیت‌های محله' },
  { stageFa: 'مرحله ۱۹: کشف املاک', relationFa: 'دسترسی مستقیم به تحلیل ضوابط از صفحه ملک بدون وعده مجوز' },
  { stageFa: 'مرحله ۲۰: ارزش‌گذاری', relationFa: 'ورودی محتاطانه ظرفیت توسعه با برچسب عدم قطعیت' },
  { stageFa: 'مرحله ۲۳: مرکز دانش و پژوهش', relationFa: 'دسترسی به مخزن اسناد و مصوبات شهرسازی' },
  { stageFa: 'مرحله ۳۰: جست‌وجوی سراسری', relationFa: 'جست‌وجوی اسناد، کد پهنه و ضوابط' },
  { stageFa: 'مرحله ۳۷: منشأ و کیفیت داده', relationFa: 'نمایش منبع، شماره سند، تاریخ اعتبار و سطح اطمینان' },
  { stageFa: 'مرحله ۵۴: رصد ساختمان‌ها', relationFa: 'مقایسه وضعیت موجود بنا با ضوابط مصوب قطعه' },
];

export const STAGE55_DOCUMENT_CATEGORIES_10: ReadonlyArray<string> = [
  'طرح‌های جامع شهری',
  'طرح‌های تفصیلی',
  'ضوابط و مقررات شهرسازی',
  'مصوبات کمیسیون‌ها و مراجع ذی‌صلاح',
  'ضوابط پهنه‌بندی',
  'مقررات کاربری زمین',
  'ضوابط تراکم و سطح اشغال',
  'مقررات حفاظت از میراث و محیط‌زیست',
  'اصلاحیه‌ها و الحاقیه‌ها',
  'اسناد مرتبط با محدوده‌های ویژه',
];

export const STAGE55_SPECIAL_STATES_9: ReadonlyArray<{ stateFa: string; actionFa: string }> = [
  { stateFa: 'نبود سند رسمی برای قطعه', actionFa: 'اعلام صریح «داده موجود نیست / نیازمند استعلام» بدون تولید عدد فرضی' },
  { stateFa: 'تعارض پهنه بین دو منبع', actionFa: 'نمایش هر دو منبع با هشدار تعارض و منع نتیجه‌گیری قطعی' },
  { stateFa: 'مرز قطعه یا مساحت تأییدنشده', actionFa: 'اعمال برچسب برآورد ناقص و الزام ممیزی سندی' },
  { stateFa: 'تفاوت مبنای محاسبه زیربنا/مشاعات', actionFa: 'مسدودسازی مقایسه مستقیم دو ملک با فرمول متفاوت' },
  { stateFa: 'سند قدیمی یا اصلاح‌شده', actionFa: 'هشدار نسخه قدیمی و ارجاع به اصلاحیه تاریخچه تغییرات' },
];

export const STAGE55_UX_METRICS_8: ReadonlyArray<string> = [
  'زمان یافتن ضوابط یک محدوده',
  'نرخ موفقیت جست‌وجوی اسناد',
  'نرخ مشاهده منابع اصلی',
  'نرخ تشخیص داده رسمی از برآورد',
  'نرخ تکمیل تحلیل ملک',
  'نرخ خطا در تطبیق قطعه و پهنه',
  'نرخ استفاده از مقایسه املاک',
  'نرخ خروجی گرفتن از گزارش',
];

export const STAGE56_INFRASTRUCTURE_PREVIEW_AXES_10: ReadonlyArray<string> = [
  '۱. شبکه آب، برق، گاز و فاضلاب',
  '۲. شبکه حمل‌ونقل عمومی و معابر',
  '۳. دسترسی به مراکز درمانی، آموزشی و خدماتی',
  '۴. ظرفیت و پوشش خدمات شهری',
  '۵. توزیع فضایی امکانات و کمبودها',
  '۶. فاصله و زمان دسترسی به خدمات',
  '۷. شناسایی محدوده‌های کم‌برخوردار',
  '۸. مقایسه ظرفیت خدماتی محله‌ها',
  '۹. نمایش ارتباط زیرساخت با کیفیت زندگی و ارزش مکانی',
  '۱۰. تحلیل تغییرات زیرساختی در طول زمان',
];
