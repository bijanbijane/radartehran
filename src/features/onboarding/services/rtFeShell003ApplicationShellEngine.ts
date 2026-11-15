/**
 * RT-FE-SHELL-003: مرحله سوم — طراحی معماری پوسته اصلی فرانت‌اند، Layoutها و نظام ناوبری
 */
import type { LayoutType } from './rtFeIa002InformationArchitectureTypes';

export const RT_FE_SHELL_003_SPEC_ID = 'RT-FE-SHELL-003' as const;
export type ContentMode = 'standard' | 'wide' | 'full-screen';

export interface PagePresentation {
  title: string;
  description?: string;
  contentMode: ContentMode;
  showBreadcrumbs: boolean;
  showFooter: boolean;
  showModuleSidebar: boolean;
}

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon?: string;
  permission?: string;
  featureFlag?: string;
  children?: NavigationItem[];
  external?: boolean;
  disabled?: boolean;
}

export interface ShellConfiguration {
  layout: LayoutType;
  header: { visible: boolean; variant: 'full' | 'compact' | 'minimal' };
  navigation: { primary: boolean; secondary: boolean; sidebar: boolean; bottomNavigation: boolean };
  content: { mode: ContentMode; maxWidth?: 'standard' | 'wide' | 'fluid' };
  footer: { visible: boolean };
}

export interface HeaderConfiguration {
  variant: 'public' | 'workspace' | 'admin' | 'minimal';
  showSearch: boolean;
  showNotifications: boolean;
  showAccountMenu: boolean;
  showPrimaryNavigation: boolean;
}

export interface ShellLayoutSpec {
  layout: LayoutType;
  ownerSpaceFa: string;
  headerComponent: string;
  subComponents: readonly string[];
  keyRulesFa: readonly string[];
}

export const RT_FE_SHELL_4_LAYOUTS: readonly ShellLayoutSpec[] = [
  {
    layout: 'PublicLayout',
    ownerSpaceFa: 'فضای عمومی و تحلیلی محصول',
    headerComponent: 'PublicHeader (Brand + PrimaryNavigation + GlobalSearchEntry + HeaderActions)',
    subComponents: ['PublicHeader', 'SecondaryNavigation', 'Breadcrumbs', 'MainContent (PageHeader, PageToolbar, PageOutlet)', 'PublicFooter', 'GlobalOverlayHost'],
    keyRulesFa: [
      'ساختار هدر عمومی در تمام صفحات عمومی یکسان است و ورود کاربر صرفاً هدر را به‌روزرسانی می‌کند',
      'صفحات نقشه و تحلیل‌های تمام‌صفحه حالت full-screen و بدون محدودیت عرض درخواست می‌کنند',
      'Footer در صفحات نقشه یا داشبورد تمام‌صفحه اجباری نیست',
    ],
  },
  {
    layout: 'WorkspaceLayout',
    ownerSpaceFa: 'فضای حساب و میز کار کاربر (/account/*)',
    headerComponent: 'WorkspaceHeader (Brand + WorkspaceTitle + GlobalActions + AccountMenu)',
    subComponents: ['WorkspaceHeader', 'WorkspaceNavigation', 'WorkspaceSidebar', 'WorkspaceMain (Breadcrumbs, PageHeader, PageActions, PageOutlet)', 'GlobalOverlayHost'],
    keyRulesFa: [
      'بارگذاری اطلاعات شخصی فقط پس از احراز هویت معتبر و منع کامل قرارگیری در کش عمومی',
      'کنترل وضعیت فرم‌های ذخیره‌نشده هنگام جابه‌جایی مسیر',
      'منع دسترسی به اطلاعات سایر کاربران از طریق تغییر URL (جلوگیری از IDOR)',
    ],
  },
  {
    layout: 'AdminLayout',
    ownerSpaceFa: 'فضای مدیریتی و حاکمیت داده (/admin/*)',
    headerComponent: 'AdminHeader (AdminBrand + EnvironmentIndicator + GlobalAdminSearch + SystemStatus + AdminAccountMenu)',
    subComponents: ['AdminHeader', 'AdminSidebar (11 بخش مدیریتی)', 'AdminMain (AdminBreadcrumbs, AdminPageHeader, AdminToolbar, AdminPageOutlet)', 'AdminOverlayHost'],
    keyRulesFa: [
      'نمایش دائمی محیط جاری (آزمایشی / عملیاتی) در AdminHeader',
      'نمایش وضعیت سرویس‌ها با عنوان متنی و توضیح علاوه بر رنگ',
      'تأیید مستقل برای عملیات حساس و بررسی مجوز مجزا برای هر صفحه مدیریتی',
    ],
  },
  {
    layout: 'SystemLayout',
    ownerSpaceFa: 'صفحات سیستمی، خطا، تعمیرات و وضعیت ارتباط',
    headerComponent: 'MinimalHeader (Brand)',
    subComponents: ['MinimalHeader', 'SystemMain (SystemPage)', 'SupportFooter'],
    keyRulesFa: ['عدم وابستگی به منوها، وضعیت احراز هویت یا ماژول‌هایی که ممکن است در زمان بروز خطا از کار افتاده باشند'],
  },
];

export const RT_FE_SHELL_PRIMARY_NAV_7: readonly NavigationItem[] = [
  { id: 'nav-map', label: 'نقشه', path: '/map', icon: 'map' },
  { id: 'nav-properties', label: 'املاک', path: '/properties', icon: 'building' },
  { id: 'nav-neighborhoods', label: 'محله‌ها', path: '/neighborhoods', icon: 'compass' },
  { id: 'nav-mobility', label: 'تحلیل شهری', path: '/mobility', icon: 'route' },
  { id: 'nav-housing-market', label: 'بازار مسکن', path: '/housing-market', icon: 'chart-bar' },
  { id: 'nav-services', label: 'خدمات', path: '/services', icon: 'briefcase' },
  { id: 'nav-community', label: 'جامعه', path: '/community', icon: 'users' },
];

export const RT_FE_SHELL_MODULE_SIDEBARS: Record<'properties' | 'neighborhoods' | 'workspace' | 'admin', readonly NavigationItem[]> = {
  properties: [
    { id: 'prop-overview', label: 'نمای کلی', path: '/properties' },
    { id: 'prop-search', label: 'جست‌وجوی املاک', path: '/search' },
    {
      id: 'prop-types',
      label: 'انواع املاک',
      path: '/properties?category=all',
      children: [
        { id: 'prop-res', label: 'مسکونی', path: '/properties?type=residential' },
        { id: 'prop-com', label: 'تجاری', path: '/properties?type=commercial' },
        { id: 'prop-off', label: 'اداری', path: '/properties?type=office' },
        { id: 'prop-land', label: 'زمین', path: '/properties?type=land' },
      ],
    },
    { id: 'prop-compare', label: 'مقایسه املاک', path: '/account/comparisons' },
    { id: 'prop-valuation', label: 'ارزش‌گذاری', path: '/valuation' },
    { id: 'prop-market', label: 'تحلیل بازار املاک', path: '/housing-market' },
  ],
  neighborhoods: [
    { id: 'hood-overview', label: 'نمای کلی', path: '/neighborhoods' },
    { id: 'hood-demographics', label: 'جمعیت و ویژگی‌های اجتماعی', path: '/neighborhoods?section=demographics' },
    { id: 'hood-real-estate', label: 'بازار املاک', path: '/neighborhoods?section=market' },
    { id: 'hood-buildings', label: 'ساختمان و بافت کالبدی', path: '/buildings' },
    { id: 'hood-mobility', label: 'حمل‌ونقل و دسترسی', path: '/mobility' },
    { id: 'hood-amenities', label: 'امکانات و خدمات', path: '/services' },
    { id: 'hood-livability', label: 'محیط و کیفیت زندگی', path: '/neighborhoods?section=livability' },
    { id: 'hood-trends', label: 'تحولات و روندهای محله', path: '/neighborhoods?section=trends' },
  ],
  workspace: [
    { id: 'ws-overview', label: 'نمای کلی حساب', path: '/account' },
    { id: 'ws-profile', label: 'پروفایل (شخصی، حرفه‌ای، اعتبارسنجی)', path: '/account/profile' },
    { id: 'ws-saved', label: 'اطلاعات ذخیره‌شده (املاک، محله‌ها، خدمات)', path: '/account/saved' },
    { id: 'ws-searches', label: 'جست‌وجوهای ذخیره‌شده', path: '/account/searches' },
    { id: 'ws-comparisons', label: 'مقایسه‌ها', path: '/account/comparisons' },
    { id: 'ws-contributions', label: 'مشارکت‌های من', path: '/account/contributions' },
    { id: 'ws-notifications', label: 'اعلان‌ها', path: '/account/notifications' },
    { id: 'ws-settings', label: 'تنظیمات (ترجیحات، حریم خصوصی، امنیت)', path: '/account/settings' },
  ],
  admin: [
    { id: 'adm-dashboard', label: 'Dashboard (نمای کلی مدیریت)', path: '/admin/dashboard', permission: 'admin' },
    { id: 'adm-users', label: 'Users (مدیریت کاربران و نقش‌ها)', path: '/admin/users', permission: 'admin' },
    { id: 'adm-content', label: 'Content (مدیریت محتوا)', path: '/admin/content', permission: 'moderator' },
    { id: 'adm-properties', label: 'PropertyManagement (مدیریت املاک)', path: '/admin/properties', permission: 'moderator' },
    { id: 'adm-sources', label: 'DataSources (منابع داده)', path: '/admin/data-sources', permission: 'admin' },
    { id: 'adm-quality', label: 'DataQuality (کیفیت داده)', path: '/admin/data-quality', permission: 'moderator' },
    { id: 'adm-review', label: 'DataReview (بررسی و اصلاح داده)', path: '/admin/data-review', permission: 'moderator' },
    { id: 'adm-contributions', label: 'Contributions (مشارکت‌های کاربران)', path: '/admin/contributions', permission: 'moderator' },
    { id: 'adm-modules', label: 'Modules (مدیریت ماژول‌ها)', path: '/admin/modules', permission: 'super_admin' },
    { id: 'adm-reports', label: 'Reports (گزارش‌های مدیریتی)', path: '/admin/reports', permission: 'admin' },
    { id: 'adm-audit', label: 'AuditLogs (لاگ ممیزی)', path: '/admin/audit-logs', permission: 'super_admin' },
  ],
};

export interface OverlayHostSpec {
  code: 'OVL-01' | 'OVL-02' | 'OVL-03' | 'OVL-04' | 'OVL-05' | 'OVL-06' | 'OVL-07' | 'OVL-08';
  componentName: string;
  zIndexTier: number;
  supportsEscapeClose: boolean;
  supportsBackdropClose: boolean;
  restoresFocusOnClose: boolean;
  responsibilityFa: string;
}

export const RT_FE_SHELL_OVERLAY_HOSTS_8: readonly OverlayHostSpec[] = [
  { code: 'OVL-01', componentName: 'DialogHost', zIndexTier: 70, supportsEscapeClose: true, supportsBackdropClose: false, restoresFocusOnClose: true, responsibilityFa: 'مدیریت پنجره‌های تأیید و فرم‌های حساس' },
  { code: 'OVL-02', componentName: 'DrawerHost', zIndexTier: 60, supportsEscapeClose: true, supportsBackdropClose: true, restoresFocusOnClose: true, responsibilityFa: 'نمایش پنل‌های کشویی و سایدبار موبایل' },
  { code: 'OVL-03', componentName: 'NotificationHost', zIndexTier: 90, supportsEscapeClose: false, supportsBackdropClose: false, restoresFocusOnClose: false, responsibilityFa: 'نمایش اعلان‌های کوتاه نتیجه عملیات' },
  { code: 'OVL-04', componentName: 'TooltipHost', zIndexTier: 85, supportsEscapeClose: true, supportsBackdropClose: false, restoresFocusOnClose: false, responsibilityFa: 'نمایش راهنمای عناصر و آیکن‌های جمع‌شده' },
  { code: 'OVL-05', componentName: 'PopoverHost', zIndexTier: 65, supportsEscapeClose: true, supportsBackdropClose: true, restoresFocusOnClose: true, responsibilityFa: 'نمایش محتوای شناور سبک' },
  { code: 'OVL-06', componentName: 'CommandPaletteHost', zIndexTier: 80, supportsEscapeClose: true, supportsBackdropClose: true, restoresFocusOnClose: true, responsibilityFa: 'دسترسی سریع با صفحه‌کلید به عملیات و مسیرها' },
  { code: 'OVL-07', componentName: 'GlobalSearchHost', zIndexTier: 75, supportsEscapeClose: true, supportsBackdropClose: true, restoresFocusOnClose: true, responsibilityFa: 'نمایش رابط جست‌وجوی سراسری از هدر' },
  { code: 'OVL-08', componentName: 'ContextMenuHost', zIndexTier: 68, supportsEscapeClose: true, supportsBackdropClose: true, restoresFocusOnClose: true, responsibilityFa: 'نمایش منوهای وابسته به عنصر' },
];

export interface ResponsiveBreakpointSpec {
  id: 'XS' | 'SM' | 'MD' | 'LG' | 'XL' | '2XL';
  minWidthPx: number;
  maxWidthPx: number | null;
  labelFa: string;
  headerVariant: 'minimal' | 'compact' | 'full';
  sidebarMode: 'drawer' | 'collapsible' | 'docked';
  bottomNavigationAllowed: boolean;
}

export const RT_FE_SHELL_BREAKPOINTS_6: readonly ResponsiveBreakpointSpec[] = [
  { id: 'XS', minWidthPx: 0, maxWidthPx: 639, labelFa: 'موبایل کوچک (کمتر از 640px)', headerVariant: 'compact', sidebarMode: 'drawer', bottomNavigationAllowed: true },
  { id: 'SM', minWidthPx: 640, maxWidthPx: 767, labelFa: 'موبایل بزرگ (640px تا 767px)', headerVariant: 'compact', sidebarMode: 'drawer', bottomNavigationAllowed: true },
  { id: 'MD', minWidthPx: 768, maxWidthPx: 1023, labelFa: 'تبلت (768px تا 1023px)', headerVariant: 'compact', sidebarMode: 'collapsible', bottomNavigationAllowed: false },
  { id: 'LG', minWidthPx: 1024, maxWidthPx: 1279, labelFa: 'دسکتاپ کوچک (1024px تا 1279px)', headerVariant: 'full', sidebarMode: 'collapsible', bottomNavigationAllowed: false },
  { id: 'XL', minWidthPx: 1280, maxWidthPx: 1535, labelFa: 'دسکتاپ (1280px تا 1535px)', headerVariant: 'full', sidebarMode: 'docked', bottomNavigationAllowed: false },
  { id: '2XL', minWidthPx: 1536, maxWidthPx: null, labelFa: 'نمایشگر عریض (1536px به بالا)', headerVariant: 'full', sidebarMode: 'docked', bottomNavigationAllowed: false },
];

export const RT_FE_SHELL_A11Y_10: readonly { id: string; titleFa: string; acceptanceCriteriaFa: string }[] = [
  { id: 'A11Y-SH-001', titleFa: 'ناوبری صفحه‌کلید', acceptanceCriteriaFa: 'تمام منوها قابل استفاده با کیبورد باشند' },
  { id: 'A11Y-SH-002', titleFa: 'Focus Visible', acceptanceCriteriaFa: 'محل تمرکز کاربر مشخص باشد' },
  { id: 'A11Y-SH-003', titleFa: 'Semantic HTML', acceptanceCriteriaFa: 'استفاده صحیح از Header، Nav، Main و Footer' },
  { id: 'A11Y-SH-004', titleFa: 'ARIA Labels', acceptanceCriteriaFa: 'عناصر تعاملی نام قابل تشخیص داشته باشند' },
  { id: 'A11Y-SH-005', titleFa: 'Drawer Accessibility', acceptanceCriteriaFa: 'باز و بسته شدن Drawer با مدیریت Focus انجام شود' },
  { id: 'A11Y-SH-006', titleFa: 'Contrast', acceptanceCriteriaFa: 'متن‌ها و کنترل‌ها کنتراست مناسب داشته باشند' },
  { id: 'A11Y-SH-007', titleFa: 'RTL', acceptanceCriteriaFa: 'ترتیب و جهت عناصر در فارسی صحیح باشد' },
  { id: 'A11Y-SH-008', titleFa: 'Screen Reader', acceptanceCriteriaFa: 'تغییرات مهم وضعیت قابل اعلام باشند' },
  { id: 'A11Y-SH-009', titleFa: 'Reduced Motion', acceptanceCriteriaFa: 'انیمیشن‌های غیرضروری قابل کاهش باشند' },
  { id: 'A11Y-SH-010', titleFa: 'Touch Targets', acceptanceCriteriaFa: 'کنترل‌های لمسی اندازه و فاصله مناسب داشته باشند' },
];

export const RT_FE_SHELL_DELIVERABLES_15: readonly { id: string; titleFa: string }[] = [
  { id: 'SH-OUT-01', titleFa: 'نمودار معماری Application Shell' },
  { id: 'SH-OUT-02', titleFa: 'قرارداد چهار Layout اصلی' },
  { id: 'SH-OUT-03', titleFa: 'نقشه اجزای هدر عمومی' },
  { id: 'SH-OUT-04', titleFa: 'نقشه ناوبری اصلی' },
  { id: 'SH-OUT-05', titleFa: 'نقشه سایدبارها و ناوبری ثانویه' },
  { id: 'SH-OUT-06', titleFa: 'قرارداد ناحیه محتوای صفحات (standard / wide / full-screen)' },
  { id: 'SH-OUT-07', titleFa: 'نقشه Page Toolbar' },
  { id: 'SH-OUT-08', titleFa: 'معماری Global Overlay Host (OVL-01..OVL-08)' },
  { id: 'SH-OUT-09', titleFa: 'نقشه واکنش‌گرایی پوسته (XS..2XL)' },
  { id: 'SH-OUT-10', titleFa: 'قراردادهای TypeScript پوسته' },
  { id: 'SH-OUT-11', titleFa: 'ساختار پوشه‌ها و فایل‌های پوسته' },
  { id: 'SH-OUT-12', titleFa: 'قواعد اتصال به Router' },
  { id: 'SH-OUT-13', titleFa: 'قواعد اتصال به Cloudflare' },
  { id: 'SH-OUT-14', titleFa: 'استانداردهای دسترس‌پذیری (A11Y-SH-001..010)' },
  { id: 'SH-OUT-15', titleFa: 'معیارهای آزمون و پذیرش مرحله سوم' },
];

export function resolveShellConfigurationForRoute(input: {
  pathname: string;
  viewportWidthPx: number;
  pagePresentation?: Partial<PagePresentation>;
}): {
  shellConfig: ShellConfiguration;
  headerConfig: HeaderConfiguration;
  breakpoint: ResponsiveBreakpointSpec;
  activePrimaryNavId: string | null;
  errorBoundaryHierarchy: readonly ['ApplicationErrorBoundary', 'LayoutErrorBoundary', 'PageErrorBoundary', 'FeatureErrorBoundary'];
} {
  const bp =
    RT_FE_SHELL_BREAKPOINTS_6.find((b) => input.viewportWidthPx >= b.minWidthPx && (b.maxWidthPx === null || input.viewportWidthPx <= b.maxWidthPx)) ??
    RT_FE_SHELL_BREAKPOINTS_6[4];
  const isSystem = ['/404', '/403', '/500', '/maintenance', '/network-error', '/unavailable', '/auth/login'].includes(input.pathname);
  const isAdmin = input.pathname.startsWith('/admin');
  const isWorkspace = input.pathname.startsWith('/account');
  const isMapFullScreen = input.pathname === '/map';
  const layout: LayoutType = isSystem ? 'SystemLayout' : isAdmin ? 'AdminLayout' : isWorkspace ? 'WorkspaceLayout' : 'PublicLayout';
  const contentMode: ContentMode =
    input.pagePresentation?.contentMode ?? (isMapFullScreen ? 'full-screen' : isAdmin || input.pathname === '/housing-market' ? 'wide' : 'standard');
  const showFooter = input.pagePresentation?.showFooter ?? (layout === 'PublicLayout' && contentMode !== 'full-screen');
  const showSidebar =
    input.pagePresentation?.showModuleSidebar ??
    (layout === 'WorkspaceLayout' || layout === 'AdminLayout' || input.pathname.startsWith('/properties') || input.pathname.startsWith('/neighborhoods'));
  const activePrimaryNav =
    RT_FE_SHELL_PRIMARY_NAV_7.find((item) => input.pathname === item.path || input.pathname.startsWith(`${item.path}/`))?.id ?? null;

  return {
    shellConfig: {
      layout,
      header: { visible: true, variant: layout === 'SystemLayout' ? 'minimal' : bp.headerVariant },
      navigation: {
        primary: layout === 'PublicLayout',
        secondary: layout === 'PublicLayout' && contentMode !== 'full-screen',
        sidebar: showSidebar,
        bottomNavigation: layout === 'PublicLayout' && bp.bottomNavigationAllowed && contentMode !== 'full-screen',
      },
      content: { mode: contentMode, maxWidth: contentMode === 'full-screen' ? 'fluid' : contentMode === 'wide' ? 'wide' : 'standard' },
      footer: { visible: showFooter },
    },
    headerConfig: {
      variant: layout === 'SystemLayout' ? 'minimal' : layout === 'AdminLayout' ? 'admin' : layout === 'WorkspaceLayout' ? 'workspace' : 'public',
      showSearch: layout !== 'SystemLayout',
      showNotifications: layout !== 'SystemLayout',
      showAccountMenu: layout !== 'SystemLayout',
      showPrimaryNavigation: layout === 'PublicLayout',
    },
    breakpoint: bp,
    activePrimaryNavId: activePrimaryNav,
    errorBoundaryHierarchy: ['ApplicationErrorBoundary', 'LayoutErrorBoundary', 'PageErrorBoundary', 'FeatureErrorBoundary'],
  };
}
