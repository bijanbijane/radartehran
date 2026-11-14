/** @file src/interaction-system/contracts/validationAndImplementContract.ts — RT-UI-VALIDATION-001 & RT-UI-IMPLEMENT-001 Contracts */

export interface QaDomainSpec {
  id: 'QA-01' | 'QA-02' | 'QA-03' | 'QA-04' | 'QA-05';
  titleFa: string;
  focusFa: string;
}

export const QA_VALIDATION_DOMAINS: readonly QaDomainSpec[] = [
  { id: 'QA-01', titleFa: 'اعتبارسنجی معماری اطلاعات', focusFa: 'درک ساختار بخش‌ها، دسته‌بندی‌ها و محل قابلیت‌ها' },
  { id: 'QA-02', titleFa: 'اعتبارسنجی ناوبری', focusFa: 'پیدا کردن مسیرها و تشخیص موقعیت فعلی در محصول' },
  { id: 'QA-03', titleFa: 'اعتبارسنجی بصری', focusFa: 'خوانایی، سلسله‌مراتب، کنتراست و تراکم اطلاعات' },
  { id: 'QA-04', titleFa: 'اعتبارسنجی تعاملی', focusFa: 'رفتار واقعی نقشه، فیلترها، فرم‌ها، پنل‌ها و بازیابی خطا' },
  { id: 'QA-05', titleFa: 'اعتبارسنجی فنی', focusFa: 'عملکرد Core Web Vitals، دسترس‌پذیری WCAG 2.2 AA و سازگاری' },
];

export const PROTOTYPE_SCOPE_VP: readonly { id: string; titleFa: string; testTypeFa: string }[] = [
  { id: 'VP-01', titleFa: 'صفحه خانه', testTypeFa: 'هدایت کاربر' },
  { id: 'VP-02', titleFa: 'نقشه در حالت اولیه', testTypeFa: 'اکتشاف' },
  { id: 'VP-03', titleFa: 'انتخاب محله روی نقشه', testTypeFa: 'تعامل مکانی' },
  { id: 'VP-04', titleFa: 'انتخاب ملک روی نقشه', testTypeFa: 'انتخاب موجودیت' },
  { id: 'VP-05', titleFa: 'پنل لایه‌های نقشه', testTypeFa: 'مدیریت لایه' },
  { id: 'VP-06', titleFa: 'فیلترهای نقشه', testTypeFa: 'فیلتر و جست‌وجو' },
  { id: 'VP-07', titleFa: 'ترسیم محدوده', testTypeFa: 'ابزار مکانی' },
  { id: 'VP-08', titleFa: 'شناسنامه محله', testTypeFa: 'شناخت اطلاعات' },
  { id: 'VP-09', titleFa: 'جست‌وجوی املاک', testTypeFa: 'کشف و فیلتر' },
  { id: 'VP-10', titleFa: 'جزئیات ملک', testTypeFa: 'بررسی موجودیت' },
  { id: 'VP-11', titleFa: 'تحلیل بازار', testTypeFa: 'فهم داده' },
  { id: 'VP-12', titleFa: 'فرم ارزش‌گذاری', testTypeFa: 'ورود اطلاعات' },
  { id: 'VP-13', titleFa: 'نتیجه ارزش‌گذاری', testTypeFa: 'تفسیر خروجی' },
  { id: 'VP-14', titleFa: 'نسخه موبایل نقشه', testTypeFa: 'تعامل لمسی' },
];

export const CORE_USER_JOURNEYS: readonly { id: string; titleFa: string; pathFa: string }[] = [
  { id: 'Journey 01', titleFa: 'از خانه تا شناخت محله', pathFa: 'خانه ← جست‌وجو ← انتخاب محله ← نقشه ← شناسنامه ← تحلیل بازار' },
  { id: 'Journey 02', titleFa: 'از نقشه تا کشف ملک', pathFa: 'نقشه ← فیلتر ← نتایج ← انتخاب ملک ← جزئیات ملک' },
  { id: 'Journey 03', titleFa: 'از ملک تا ارزش‌گذاری', pathFa: 'جزئیات ملک ← انتقال مشخصات ← فرم ← محاسبه ← بررسی نتیجه' },
  { id: 'Journey 04', titleFa: 'از گزارش تا تحلیل مکانی', pathFa: 'گزارش ← انتخاب محدوده ← ورود به نقشه ← لایه ← بررسی داده' },
  { id: 'Journey 05', titleFa: 'از موبایل تا عملیات مکانی', pathFa: 'جست‌وجو ← انتخاب محله ← Bottom Sheet ← تغییر لایه ← بازگشت' },
];

export const DEVICE_TEST_MATRIX: readonly { id: string; width: number; height: number; label: string }[] = [
  { id: 'DV-01', width: 360, height: 800, label: 'Mobile Compact' },
  { id: 'DV-02', width: 390, height: 844, label: 'Mobile Standard' },
  { id: 'DV-03', width: 430, height: 932, label: 'Mobile Large' },
  { id: 'DV-04', width: 768, height: 1024, label: 'Tablet Portrait' },
  { id: 'DV-05', width: 1024, height: 768, label: 'Tablet Landscape' },
  { id: 'DV-06', width: 1280, height: 800, label: 'Laptop' },
  { id: 'DV-07', width: 1440, height: 900, label: 'Desktop Standard' },
  { id: 'DV-08', width: 1920, height: 1080, label: 'Desktop Wide' },
];

export const PERFORMANCE_BUDGETS = {
  coreWebVitals: { lcpMaxMs: 2500, inpMaxMs: 200, clsMax: 0.1 },
  mapMetrics: [
    { id: 'MAP-P01', name: 'Basemap Ready', targetMs: 3000, labelFa: 'زمان نمایش نقشه پایه' },
    { id: 'MAP-P02', name: 'First Layer Ready', targetMs: 3500, labelFa: 'زمان نمایش اولین لایه داده' },
    { id: 'MAP-P03', name: 'Interaction Ready', targetMs: 200, labelFa: 'زمان آماده شدن تعامل محلی' },
    { id: 'MAP-P04', name: 'Layer Switch', targetMs: 2500, labelFa: 'زمان تغییر لایه' },
    { id: 'MAP-P05', name: 'Map Pan Stability', targetMs: 100, labelFa: 'پایداری فریم هنگام حرکت نقشه' },
    { id: 'MAP-P06', name: 'Selection Latency', targetMs: 300, labelFa: 'زمان نمایش پنل انتخاب موجودیت' },
  ],
} as const;

export type IssueSeverity = 'S0' | 'S1' | 'S2' | 'S3' | 'S4';

export interface DesignQaIssue {
  id: string;
  pageId: string;
  componentId: string;
  scenarioId: string;
  severity: IssueSeverity;
  impact: number;
  frequency: number;
  recoveryDifficulty: number;
  descriptionFa: string;
  status: 'open' | 'fixed' | 'verified';
}

export const DESIGN_DOC_LIFECYCLE = ['Draft', 'Under Review', 'Approved', 'Implemented', 'Verified', 'Deprecated'] as const;

export const VALIDATION_GATES = [
  { id: 'Gate 01', titleFa: 'آمادگی پروتوتایپ', summaryFa: 'صفحات VP-01..VP-14 و پنج جریان اصلی قابل اجرا هستند.' },
  { id: 'Gate 02', titleFa: 'پذیرش کاربران', summaryFa: 'مشکلات اصلی ناوبری، فهم داده و تعامل اصلاح شده‌اند.' },
  { id: 'Gate 03', titleFa: 'پذیرش فنی', summaryFa: 'عملکرد Core Web Vitals، دسترس‌پذیری WCAG 2.2 AA و پایداری تایید شده است.' },
  { id: 'Gate 04', titleFa: 'تثبیت طراحی (Design Freeze)', summaryFa: 'اسناد، توکن‌ها و کامپوننت‌ها به نسخه مرجع رسیده‌اند.' },
] as const;

export const STAGE_10_DELIVERABLE_DOCS = [
  'VAL-001', 'VAL-002', 'VAL-003', 'VAL-004', 'VAL-005', 'VAL-006', 'VAL-007', 'VAL-008', 'RT-UI-VALIDATION-REPORT-001',
] as const;

export const STAGE_10_ACCEPTANCE_COUNT = 30;
export const STAGE_11_ACCEPTANCE_COUNT = 18;

export const PILOT_MAP_SCOPE_ITEMS: readonly { key: string; titleFa: string; status: 'required' | 'after_core' | 'next_phase' }[] = [
  { key: 'compact_header', titleFa: 'هدر فشرده نقشه', status: 'required' },
  { key: 'toolbar', titleFa: 'نوار ابزار کناری (MapToolRail)', status: 'required' },
  { key: 'basemap', titleFa: 'نقشه پایه Leaflet', status: 'required' },
  { key: 'select_hood', titleFa: 'انتخاب محله روی نقشه', status: 'required' },
  { key: 'preview_hood', titleFa: 'پیش‌نمایش محله در پنل زمینه‌ای', status: 'required' },
  { key: 'select_property', titleFa: 'انتخاب ملک روی نقشه', status: 'required' },
  { key: 'preview_property', titleFa: 'پیش‌نمایش ملک و انتقال به جزئیات', status: 'required' },
  { key: 'spatial_search', titleFa: 'جست‌وجوی مکانی و پیشنهاد محله', status: 'required' },
  { key: 'basic_filters', titleFa: 'فیلتر پایه با تفکیک Draft/Applied', status: 'required' },
  { key: 'layer_selector', titleFa: 'انتخاب لایه و جداسازی خطا', status: 'required' },
  { key: 'legend', titleFa: 'راهنمای نقشه (Legend) و تاریخ داده', status: 'required' },
  { key: 'bottom_sheet', titleFa: 'Bottom Sheet موبایل با Dynamic Viewport', status: 'required' },
  { key: 'error_state', titleFa: 'وضعیت خطای مستقل با بازیابی', status: 'required' },
  { key: 'restore_back', titleFa: 'حفظ وضعیت هنگام بازگشت', status: 'required' },
  { key: 'draw_bounds', titleFa: 'رسم محدوده ترسیمی', status: 'after_core' },
  { key: 'advanced_compare', titleFa: 'مقایسه پیشرفته محدوده‌ها', status: 'next_phase' },
];

export type UiRolloutFlagKey =
  | 'new_map_shell'
  | 'new_map_context_panel'
  | 'new_layer_manager'
  | 'new_property_search'
  | 'new_neighborhood_profile'
  | 'new_valuation_flow';

export interface UiRolloutFlagConfig {
  key: UiRolloutFlagKey;
  titleFa: string;
  owner: string;
  enabled: boolean;
  rolloutPhase: 'Release 01 (Internal)' | 'Release 02 (Controlled)' | 'Release 03 (Public)';
}

export const DEFAULT_UI_ROLLOUT_FLAGS: readonly UiRolloutFlagConfig[] = [
  { key: 'new_map_shell', titleFa: 'پوسته جدید محیط نقشه (RT-PILOT-MAP-001)', owner: 'Map Guild', enabled: true, rolloutPhase: 'Release 03 (Public)' },
  { key: 'new_map_context_panel', titleFa: 'پنل زمینه‌ای محله و ملک (۳۵۲px)', owner: 'Map Guild', enabled: true, rolloutPhase: 'Release 03 (Public)' },
  { key: 'new_layer_manager', titleFa: 'مدیریت لایه و ایزوله‌سازی خطا', owner: 'Geo Data', enabled: true, rolloutPhase: 'Release 02 (Controlled)' },
  { key: 'new_property_search', titleFa: 'جست‌وجوی املاک با Draft/Applied Filters', owner: 'Search Squad', enabled: true, rolloutPhase: 'Release 02 (Controlled)' },
  { key: 'new_neighborhood_profile', titleFa: 'شناسنامه محله یکپارچه', owner: 'Intel Squad', enabled: true, rolloutPhase: 'Release 02 (Controlled)' },
  { key: 'new_valuation_flow', titleFa: 'جریان ارزش‌گذاری هدونیک و Idempotency', owner: 'Valuation Squad', enabled: true, rolloutPhase: 'Release 01 (Internal)' },
];

export const IMPLEMENTATION_PROHIBITIONS_DEV: readonly { id: string; titleFa: string }[] = [
  { id: 'DEV-001', titleFa: 'بازنویسی گسترده بدون ممیزی' },
  { id: 'DEV-002', titleFa: 'ساخت نسخه‌های تکراری کامپوننت' },
  { id: 'DEV-003', titleFa: 'تعریف رنگ و فاصله خارج از توکن‌ها' },
  { id: 'DEV-004', titleFa: 'قرار دادن منطق تجاری در کامپوننت عمومی' },
  { id: 'DEV-005', titleFa: 'وابستگی مستقیم ماژول‌ها به پیاده‌سازی داخلی یکدیگر' },
  { id: 'DEV-006', titleFa: 'تغییر Design System بدون کنترل نسخه' },
  { id: 'DEV-007', titleFa: 'انتشار بدون تست رگرسیون' },
  { id: 'DEV-008', titleFa: 'تغییر کتابخانه نقشه بدون ارزیابی فنی' },
  { id: 'DEV-009', titleFa: 'انتشار همزمان تمام ماژول‌های بازطراحی‌شده' },
  { id: 'DEV-010', titleFa: 'حذف نسخه قبلی بدون برنامه بازگشت (Rollback)' },
  { id: 'DEV-011', titleFa: 'اعلام موفقیت عملیات پیش از تأیید واقعی' },
  { id: 'DEV-012', titleFa: 'نادیده گرفتن خطاهای موبایل و دسترس‌پذیری' },
];

export const MAP_QA_SCENARIOS_12: readonly { id: string; titleFa: string }[] = [
  { id: 'MAP-01', titleFa: 'بارگذاری اولیه نقشه و کنترل‌های اصلی بدون اختلال' },
  { id: 'MAP-02', titleFa: 'تغییر بزرگنمایی و سطح جزئیات متناسب با مقیاس' },
  { id: 'MAP-03', titleFa: 'جابه‌جایی نقشه بدون انتخاب تصادفی عارضه' },
  { id: 'MAP-04', titleFa: 'تشخیص درست محدوده و نام محله انتخاب‌شده' },
  { id: 'MAP-05', titleFa: 'تطابق کامل اطلاعات ملک با نشانگر انتخاب‌شده' },
  { id: 'MAP-06', titleFa: 'خوشه‌بندی قابل فهم نشانگرهای متراکم' },
  { id: 'MAP-07', titleFa: 'تغییر مستقل و قابل پیش‌بینی لایه‌های نقشه' },
  { id: 'MAP-08', titleFa: 'تفسیرپذیری رنگ‌ها و علائم در راهنمای نقشه' },
  { id: 'MAP-09', titleFa: 'شفافیت زمان به‌روزرسانی نتایج در جست‌وجوی محدوده' },
  { id: 'MAP-10', titleFa: 'عدم ازکارافتادن کل نقشه هنگام شکست یک منبع داده' },
  { id: 'MAP-11', titleFa: 'عدم پنهان‌شدن کنترل‌ها زیر Bottom Sheet یا نوار موبایل' },
  { id: 'MAP-12', titleFa: 'نمایش درست وضعیت بارگذاری، کش قدیمی و خطا در شبکه ضعیف' },
];

export const IMPLEMENTATION_PACKAGES_IMP: readonly { id: string; titleFa: string; priority: 'P0' | 'P1' | 'P2' }[] = [
  { id: 'IMP-01', titleFa: 'Design Tokens و فونت‌ها', priority: 'P0' },
  { id: 'IMP-02', titleFa: 'Primitive Components', priority: 'P0' },
  { id: 'IMP-03', titleFa: 'Public Shell و Navigation', priority: 'P0' },
  { id: 'IMP-04', titleFa: 'Map Shell و کنترل‌های نقشه', priority: 'P0' },
  { id: 'IMP-05', titleFa: 'Neighborhood و Market', priority: 'P1' },
  { id: 'IMP-06', titleFa: 'Property و Valuation', priority: 'P1' },
  { id: 'IMP-07', titleFa: 'Research، Services و Community', priority: 'P2' },
  { id: 'IMP-08', titleFa: 'Admin Shell و صفحات مدیریتی', priority: 'P1' },
];

export const PAGE_QA_CHECKLIST_15: readonly string[] = [
  'هدف صفحه در نگاه اول قابل تشخیص است',
  'ناوبری و مسیر بازگشت روشن است',
  'سلسله‌مراتب بصری درست است',
  'اطلاعات مهم در اولویت دیداری قرار دارند',
  'تراکم محتوا کنترل شده است',
  'حالت‌های Loading، Empty، Error و Stale طراحی شده‌اند',
  'رفتار دسکتاپ و موبایل مشخص است',
  'تعاملات اصلی بدون راهنمایی قابل انجام‌اند',
  'منبع و زمان داده در محل مناسب دیده می‌شوند',
  'رنگ‌های برند، معنایی و نقشه با هم اشتباه نمی‌شوند',
  'کنتراست و فوکوس بررسی شده‌اند',
  'داده‌های عددی و متن فارسی درست نمایش داده می‌شوند',
  'خرابی یک بخش باعث از کار افتادن کل صفحه نمی‌شود',
  'خطاها راه بازیابی روشن دارند',
  'هیچ اقدام حساس بدون تأیید مناسب انجام نمی‌شود',
];

export const CONTROLLED_MIGRATION_AUDIT: readonly { featureFa: string; targetFa: string; strategy: 'REUSE' | 'REFACTOR' | 'REBUILD' }[] = [
  { featureFa: 'جست‌وجوی محله', targetFa: 'جست‌وجوی سراسری (Race-Guarded)', strategy: 'REFACTOR' },
  { featureFa: 'نقشه Leaflet', targetFa: 'Map Shell و پنل زمینه‌ای جدید', strategy: 'REUSE' },
  { featureFa: 'فیلتر املاک', targetFa: 'پنل فیلتر با تفکیک Draft/Applied', strategy: 'REFACTOR' },
  { featureFa: 'صفحه محله', targetFa: 'شناسنامه محله یکپارچه', strategy: 'REFACTOR' },
  { featureFa: 'ارزش‌گذاری', targetFa: 'فرآیند Idempotent با حفظ فرم', strategy: 'REUSE' },
  { featureFa: 'پنل مدیریت', targetFa: 'Admin Shell ایزوله با Zero-Trust RBAC', strategy: 'REUSE' },
];

