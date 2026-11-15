/**
 * RT-FE-LAYOUT-006: مرحله ششم — طراحی و معماری سیستم Layout، Page Shell و ساختار فضایی صفحات
 * (20 Layout Units LAY-001..LAY-020, 8 Layout Templates LAY-008..LAY-015, PageShell & GlobalHeader with City Context,
 * Responsive Adaptation <480..1440+, Scroll & RTL LayoutConfig, State Governance & Sub-Module Fault Isolation, LT-001..016, LO-OUT-001..023)
 */

export const RT_FE_LAYOUT_006_SPEC_ID = 'RT-FE-LAYOUT-006' as const;

export type LayoutDirection = 'rtl' | 'ltr';

export interface LayoutConfig {
  direction: LayoutDirection;
  sidebarPosition: 'start' | 'end';
  contentWidth: 'fluid' | 'wide' | 'constrained';
}

export type LayoutTemplateCode =
  | 'LAY-008'
  | 'LAY-009'
  | 'LAY-010'
  | 'LAY-011'
  | 'LAY-012'
  | 'LAY-013'
  | 'LAY-014'
  | 'LAY-015';

export interface LayoutTemplateSpec {
  code: LayoutTemplateCode;
  nameEn: string;
  titleFa: string;
  contentWidth: 'fluid' | 'wide' | 'constrained';
  regions: readonly string[];
  useCasesFa: readonly string[];
  mobileAdaptationFa: string;
}

export const RT_FE_LAYOUT_8_TEMPLATES: readonly LayoutTemplateSpec[] = [
  {
    code: 'LAY-008',
    nameEn: 'Dashboard Layout',
    titleFa: 'الگوی چیدمان داشبورد',
    contentWidth: 'wide',
    regions: ['Page Header', 'Global Filters', 'KPI Region', 'Primary Analysis (Main + Secondary Chart)', 'Secondary Analysis (Data Table + Summary Panel)', 'Additional Sections'],
    useCasesFa: ['صفحه اصلی', 'داشبورد بازار', 'داشبورد محله', 'داشبورد مدیریت', 'داشبورد داده‌پژوهی'],
    mobileAdaptationFa: 'چیدمان عمودی بر اساس اولویت شاخص‌ها (KPI در بالا) و تبدیل جدول به نمایش خلاصه',
  },
  {
    code: 'LAY-009',
    nameEn: 'Listing Layout',
    titleFa: 'الگوی چیدمان فهرست',
    contentWidth: 'wide',
    regions: ['Page Header', 'Search Region', 'Filter Region', 'Results Header (Count, Sort, View Mode)', 'Results Region (Grid / List / Compact / Table + Pagination)'],
    useCasesFa: ['فهرست املاک', 'فهرست آگهی‌ها', 'فهرست خدمات', 'فهرست ساختمان‌ها', 'فهرست متخصصان'],
    mobileAdaptationFa: 'انتقال فیلترها به Drawer یا Bottom Sheet و نمایش کارت‌های تک‌ستونه',
  },
  {
    code: 'LAY-010',
    nameEn: 'Detail Layout',
    titleFa: 'الگوی چیدمان شناسنامه و جزئیات',
    contentWidth: 'constrained',
    regions: ['Breadcrumb', 'Hero Section', 'Main Information', 'Main Column (Overview, Details, History, Related)', 'Secondary Column (Sticky Summary Card, Main Actions)'],
    useCasesFa: ['شناسنامه ملک', 'شناسنامه ساختمان', 'شناسنامه محله', 'صفحه خدمات', 'پروفایل متخصص'],
    mobileAdaptationFa: 'چیدمان تک‌ستونه به ترتیب اولویت (اطلاعات اصلی پیش از تکمیلی) و نوار عملیات در دسترس',
  },
  {
    code: 'LAY-011',
    nameEn: 'Analytics Layout',
    titleFa: 'الگوی چیدمان تحلیل تخصصی',
    contentWidth: 'wide',
    regions: ['Analysis Header', 'Scope Selector', 'Time Range', 'Comparison Controls', 'Key Metrics', 'Primary Visualization', 'Secondary Visualizations', 'Data Table', 'Methodology / Sources'],
    useCasesFa: ['تحلیل بازار مسکن', 'تحلیل عرضه و تقاضا', 'تحلیل حمل‌ونقل', 'تحلیل ساختمان', 'تحلیل جمعیت'],
    mobileAdaptationFa: 'فشرده‌سازی کنترل‌های بازه زمانی و مقایسه در نوار بالای صفحه و اسکرول افقی ایمن نمودارها',
  },
  {
    code: 'LAY-012',
    nameEn: 'Map Layout',
    titleFa: 'الگوی چیدمان نقشه تعاملی',
    contentWidth: 'fluid',
    regions: ['Map Header (Search, Location, Map Actions)', 'Layer Panel (Collapsible)', 'Interactive Map Canvas', 'Floating Controls (Zoom, Reset, Locate)', 'Collapsible Legend', 'Information Panel (Selected Feature)'],
    useCasesFa: ['نقشه جامع تهران', 'کاوش مکانی املاک و محله‌ها', 'تحلیل لایه‌های جغرافیایی'],
    mobileAdaptationFa: 'حفظ بوم نقشه در حداکثر فضا، تبدیل Layer Panel به Drawer و تبدیل Info Panel به Bottom Sheet',
  },
  {
    code: 'LAY-013',
    nameEn: 'Form Layout',
    titleFa: 'الگوی چیدمان فرم‌های چندبخشی',
    contentWidth: 'constrained',
    regions: ['Form Header', 'Progress Indicator', 'Form Sections (Section 1..4)', 'Validation Summary', 'Form Actions (Save Draft, Previous, Continue / Submit)'],
    useCasesFa: ['ثبت ملک', 'ویرایش آگهی', 'ثبت خدمات', 'تکمیل پروفایل', 'فرم کارشناسی'],
    mobileAdaptationFa: 'نمایش تک‌ستونی مراحل با حفظ کامل پیش‌نویس هنگام جابه‌جایی بین مراحل',
  },
  {
    code: 'LAY-014',
    nameEn: 'Workspace Layout',
    titleFa: 'الگوی میز کار چندپنلی حرفه‌ای',
    contentWidth: 'fluid',
    regions: ['Workspace Toolbar', 'Main Workspace (Panel A, Panel B, Panel C)', 'Context Panel', 'Workspace Status'],
    useCasesFa: ['ابزار تحلیل پیشرفته', 'بررسی هم‌زمان نقشه و داده', 'مقایسه چند ملک یا محله', 'بررسی پرونده‌های کارشناسی'],
    mobileAdaptationFa: 'تبدیل پنل‌های هم‌زمان به تب‌های قابل سوئیچ برای جلوگیری از کوچک‌شدن غیرقابل استفاده پنل‌ها',
  },
  {
    code: 'LAY-015',
    nameEn: 'Admin Layout',
    titleFa: 'الگوی چیدمان پنل مدیریت',
    contentWidth: 'wide',
    regions: ['Admin Header', 'Admin Navigation', 'Management Workspace (Page Header, Operational Toolbar, Data Region, Detail Panel)', 'Admin Status Layer'],
    useCasesFa: ['مدیریت کاربران', 'مدیریت آگهی‌ها', 'مدیریت منابع داده', 'مدیریت گزارش‌ها و تأییدها'],
    mobileAdaptationFa: 'تبدیل Admin Navigation به Drawer و نمایش خلاصه ردیف‌ها با پنل جزئیات کشویی',
  },
];

export const RT_FE_LAYOUT_20_UNITS: readonly { id: string; titleEn: string; titleFa: string }[] = [
  { id: 'LAY-001', titleEn: 'Global Header', titleFa: 'هدر سراسری با نمایش صریح شهر/محدوده فعال (City Context)' },
  { id: 'LAY-002', titleEn: 'Sidebar', titleFa: 'سایدبار ناوبری حوزه‌های اصلی در ۶ وضعیت' },
  { id: 'LAY-003', titleEn: 'Workspace', titleFa: 'فضای کاری اصلی و مدیریت اسکرول و عرض محتوا' },
  { id: 'LAY-004', titleEn: 'Global Notification Layer', titleFa: 'لایه اعلان‌های سراسری مستقل از محتوای صفحه' },
  { id: 'LAY-005', titleEn: 'Page Header', titleFa: 'هدر استاندارد صفحه (عنوان، توضیح، وضعیت و عملیات)' },
  { id: 'LAY-006', titleEn: 'Page Toolbar', titleFa: 'نوار ابزار عملیات اختصاصی هر صفحه' },
  { id: 'LAY-007', titleEn: 'Page Navigation', titleFa: 'تب‌های ناوبری داخلی شناسنامه ملک و شناسنامه محله' },
  { id: 'LAY-008', titleEn: 'Dashboard Layout', titleFa: 'قالب داشبورد و شاخص‌های کلیدی (KPI)' },
  { id: 'LAY-009', titleEn: 'Listing Layout', titleFa: 'قالب فهرست، فیلتر و حالت‌های نمایش چهارگانه' },
  { id: 'LAY-010', titleEn: 'Detail Layout', titleFa: 'قالب شناسنامه و جزئیات دوستونه با کارت خلاصه چسبان' },
  { id: 'LAY-011', titleEn: 'Analytics Layout', titleFa: 'قالب تحلیل، مقایسه زمانی و روش‌شناسی' },
  { id: 'LAY-012', titleEn: 'Map Layout', titleFa: 'قالب نقشه سه‌بخشی (پنل لایه، بوم نقشه، پنل اطلاعات)' },
  { id: 'LAY-013', titleEn: 'Form Layout', titleFa: 'قالب فرم‌های چندمرحله‌ای با ذخیره پیش‌نویس' },
  { id: 'LAY-014', titleEn: 'Workspace Layout', titleFa: 'قالب میز کار چندپنلی با قابلیت تغییر اندازه' },
  { id: 'LAY-015', titleEn: 'Admin Layout', titleFa: 'قالب مستقل عملیات و جداول مدیریتی' },
  { id: 'LAY-016', titleEn: 'Responsive Layout Engine', titleFa: 'موتور واکنش‌گرایی ۵سطحی (Small Mobile تا Large Desktop)' },
  { id: 'LAY-017', titleEn: 'Width, Height & Scroll Management', titleFa: 'مدیریت عرض (Fluid/Wide/Constrained) و تفکیک اسکرول‌ها' },
  { id: 'LAY-018', titleEn: 'RTL & Layout Direction', titleFa: 'معماری جهت چیدمان دوجهته (LayoutConfig)' },
  { id: 'LAY-019', titleEn: 'Route-to-Layout Binding', titleFa: 'زنجیره اتصال مسیر به سیاست دسترسی و قالب صفحه' },
  { id: 'LAY-020', titleEn: 'Layout State Governance', titleFa: 'تفکیک وضعیت چیدمان (Global / Route / Local State)' },
];

export type SubModuleStatus = 'Ready' | 'Loading' | 'Error' | 'Empty';

export interface DashboardFaultIsolationState {
  kpiModule: SubModuleStatus;
  chartModule: SubModuleStatus;
  tableModule: SubModuleStatus;
  mapModule: SubModuleStatus;
}

export function evaluateDashboardModuleFaultIsolation(state: DashboardFaultIsolationState): {
  overallShellIntact: true;
  healthyModulesCount: number;
  failedModules: string[];
  isolationVerdictFa: string;
} {
  const entries = Object.entries(state) as [keyof DashboardFaultIsolationState, SubModuleStatus][];
  const failedModules = entries.filter(([, st]) => st === 'Error').map(([k]) => k);
  const healthyModulesCount = entries.filter(([, st]) => st !== 'Error').length;

  return {
    overallShellIntact: true,
    healthyModulesCount,
    failedModules,
    isolationVerdictFa:
      failedModules.length === 0
        ? 'تمام ۴ بخش داشبورد (KPI، نمودار، جدول و نقشه) در وضعیت پایدار هستند.'
        : `ایزولاسیون خطا فعال است: با وجود خطا در (${failedModules.join(', ')})، ساختار کلی صفحه و ${healthyModulesCount} ماژول دیگر بدون اختلال فعال مانده‌اند.`,
  };
}

export function resolveResponsiveLayoutTier(widthPx: number): {
  tierId: 'small_mobile' | 'mobile' | 'tablet' | 'desktop' | 'large_desktop';
  labelFa: string;
  sidebarBehavior: 'drawer' | 'compact' | 'expanded_or_collapsed';
  tableBehavior: 'card_summary' | 'hide_secondary_columns' | 'full_columns';
  mapInfoPanelBehavior: 'bottom_sheet' | 'floating_overlay' | 'docked_side_panel';
} {
  if (widthPx < 480) {
    return {
      tierId: 'small_mobile',
      labelFa: 'Small Mobile (< 480px)',
      sidebarBehavior: 'drawer',
      tableBehavior: 'card_summary',
      mapInfoPanelBehavior: 'bottom_sheet',
    };
  }
  if (widthPx < 768) {
    return {
      tierId: 'mobile',
      labelFa: 'Mobile (480px - 767px)',
      sidebarBehavior: 'drawer',
      tableBehavior: 'card_summary',
      mapInfoPanelBehavior: 'bottom_sheet',
    };
  }
  if (widthPx < 1024) {
    return {
      tierId: 'tablet',
      labelFa: 'Tablet (768px - 1023px)',
      sidebarBehavior: 'compact',
      tableBehavior: 'hide_secondary_columns',
      mapInfoPanelBehavior: 'floating_overlay',
    };
  }
  if (widthPx < 1440) {
    return {
      tierId: 'desktop',
      labelFa: 'Desktop (1024px - 1439px)',
      sidebarBehavior: 'expanded_or_collapsed',
      tableBehavior: 'full_columns',
      mapInfoPanelBehavior: 'docked_side_panel',
    };
  }
  return {
    tierId: 'large_desktop',
    labelFa: 'Large Desktop (>= 1440px)',
    sidebarBehavior: 'expanded_or_collapsed',
    tableBehavior: 'full_columns',
    mapInfoPanelBehavior: 'docked_side_panel',
  };
}

export const RT_FE_LAYOUT_TESTS_16: readonly { id: string; titleEn: string; criteriaFa: string }[] = [
  { id: 'LT-001', titleEn: 'Application Shell', criteriaFa: 'نمایش صحیح اجزای اصلی' },
  { id: 'LT-002', titleEn: 'Sidebar', criteriaFa: 'تغییر صحیح حالت (Expanded / Collapsed / Drawer)' },
  { id: 'LT-003', titleEn: 'Page Shell', criteriaFa: 'حفظ ساختار عنوان و محتوا' },
  { id: 'LT-004', titleEn: 'Dashboard Layout', criteriaFa: 'چیدمان صحیح کارت‌ها و نمودارها' },
  { id: 'LT-005', titleEn: 'Listing Layout', criteriaFa: 'نمایش صحیح فهرست و فیلترها' },
  { id: 'LT-006', titleEn: 'Detail Layout', criteriaFa: 'حفظ ترتیب اطلاعات و ستون چسبان' },
  { id: 'LT-007', titleEn: 'Analytics Layout', criteriaFa: 'نمایش صحیح ابزارهای تحلیل و روش‌شناسی' },
  { id: 'LT-008', titleEn: 'Map Layout', criteriaFa: 'حفظ حداکثر فضای بوم نقشه' },
  { id: 'LT-009', titleEn: 'Form Layout', criteriaFa: 'حفظ اطلاعات میان مراحل فرم' },
  { id: 'LT-010', titleEn: 'Admin Layout', criteriaFa: 'جداسازی پوسته مدیریت' },
  { id: 'LT-011', titleEn: 'Responsive', criteriaFa: 'سازگاری در عرض‌های مختلف (<480 تا 1440+)' },
  { id: 'LT-012', titleEn: 'RTL', criteriaFa: 'جهت صحیح تمام بخش‌ها با CSS Logical Properties' },
  { id: 'LT-013', titleEn: 'Scroll', criteriaFa: 'نبود تداخل اسکرول بین سایدبار، محتوا و نقشه' },
  { id: 'LT-014', titleEn: 'Route Integration', criteriaFa: 'اتصال درست مسیر و Layout' },
  { id: 'LT-015', titleEn: 'Error Isolation', criteriaFa: 'حفظ سایر بخش‌ها هنگام خطای یک ماژول' },
  { id: 'LT-016', titleEn: 'Accessibility', criteriaFa: 'ناوبری و مدیریت Focus صحیح' },
];

export const RT_FE_LAYOUT_DELIVERABLES_23: readonly { id: string; titleFa: string }[] = [
  { id: 'LO-OUT-001', titleFa: 'سند معماری Application Shell' },
  { id: 'LO-OUT-002', titleFa: 'طراحی Global Header با City Context' },
  { id: 'LO-OUT-003', titleFa: 'طراحی Sidebar' },
  { id: 'LO-OUT-004', titleFa: 'طراحی Workspace' },
  { id: 'LO-OUT-005', titleFa: 'طراحی Page Shell' },
  { id: 'LO-OUT-006', titleFa: 'قرارداد Page Header (PageHeaderConfig)' },
  { id: 'LO-OUT-007', titleFa: 'قرارداد Page Toolbar' },
  { id: 'LO-OUT-008', titleFa: 'معماری Dashboard Layout (LAY-008)' },
  { id: 'LO-OUT-009', titleFa: 'معماری Listing Layout (LAY-009)' },
  { id: 'LO-OUT-010', titleFa: 'معماری Detail Layout (LAY-010)' },
  { id: 'LO-OUT-011', titleFa: 'معماری Analytics Layout (LAY-011)' },
  { id: 'LO-OUT-012', titleFa: 'معماری Map Layout (LAY-012)' },
  { id: 'LO-OUT-013', titleFa: 'معماری Form Layout (LAY-013)' },
  { id: 'LO-OUT-014', titleFa: 'معماری Workspace Layout (LAY-014)' },
  { id: 'LO-OUT-015', titleFa: 'معماری Admin Layout (LAY-015)' },
  { id: 'LO-OUT-016', titleFa: 'استاندارد Responsive (LAY-016)' },
  { id: 'LO-OUT-017', titleFa: 'استاندارد RTL (LAY-018)' },
  { id: 'LO-OUT-018', titleFa: 'قرارداد Route و Layout (LAY-019)' },
  { id: 'LO-OUT-019', titleFa: 'قرارداد Layout State (LAY-020)' },
  { id: 'LO-OUT-020', titleFa: 'قرارداد مدیریت Scroll (LAY-017)' },
  { id: 'LO-OUT-021', titleFa: 'معماری جداسازی خطا در Layout' },
  { id: 'LO-OUT-022', titleFa: 'مجموعه آزمون Layout (LT-001..LT-016)' },
  { id: 'LO-OUT-023', titleFa: 'نسخه اولیه Layout System' },
];
