/**
 * Stage 15 — Spec Constants & Catalogs for RT-FE-PAGE-COMPOSITION-015
 * Frontend Page Composition, Layout Architecture & Content Regions
 */

export const RT_FE_PAGE_COMPOSITION_015_SPEC_ID = 'RT-FE-PAGE-COMPOSITION-015' as const;
export const RT_FE_STAGE16_BRIDGE_SPEC_ID = 'RT-FE-INTERACTION-PATTERNS-016' as const;

export type LayoutId =
  | 'public'
  | 'standard'
  | 'detail'
  | 'dashboard'
  | 'analytics'
  | 'map-centric'
  | 'data-dense'
  | 'workflow'
  | 'admin'
  | 'fullscreen';

export type RegionId = 'main' | 'primary' | 'secondary' | 'aside' | 'inspector' | 'utility' | 'bottom';

export interface LayoutDefinition {
  code: string;
  id: LayoutId;
  version: number;
  titleFa: string;
  descriptionFa: string;
  regions: readonly RegionId[];
  minWidthPx: number;
  capabilities: {
    sidebar: boolean;
    inspector: boolean;
    toolbar: boolean;
    fullscreen: boolean;
    responsive: boolean;
  };
}

export const RT_PAGE_HIERARCHY_6 = [
  { level: 1, nameEn: 'Application Shell', roleFa: 'چارچوب اصلی برنامه، Global Navigation، Overlay Host سراسری و محدودیت نمایش' },
  { level: 2, nameEn: 'Workspace Shell', roleFa: 'پوسته فضای کاری متناسب با Workspace (عمومی، املاک، پژوهش، حرفه‌ای، مدیریت)' },
  { level: 3, nameEn: 'Page Layout', roleFa: 'الگوی استاندارد چیدمان (دوستونه، نقشه‌محور، داشبوردی، داده‌محور، فرم‌محور)' },
  { level: 4, nameEn: 'Content Regions', roleFa: 'ناحیه‌های مشخص با مالکیت روشن برای جای‌گذاری محتوای صفحات' },
  { level: 5, nameEn: 'Feature Content', roleFa: 'محتوای واقعی Feature تزریق‌شده از طریق Public Composition API' },
  { level: 6, nameEn: 'UI Components', roleFa: 'اجزای استاندارد دریافت‌شده از Shared Component Library مرحله پنجم' },
] as const;

export const RT_PAGE_LAYOUT_CATALOG_10: readonly LayoutDefinition[] = [
  { code: 'LYT-001', id: 'public', version: 1, titleFa: 'Public Layout', descriptionFa: 'صفحات عمومی و معرفی محصول', regions: ['main', 'aside', 'bottom'], minWidthPx: 320, capabilities: { sidebar: false, inspector: false, toolbar: false, fullscreen: false, responsive: true } },
  { code: 'LYT-002', id: 'standard', version: 1, titleFa: 'Standard Content', descriptionFa: 'صفحات محتوایی معمولی', regions: ['main', 'aside', 'bottom'], minWidthPx: 320, capabilities: { sidebar: true, inspector: false, toolbar: true, fullscreen: false, responsive: true } },
  { code: 'LYT-003', id: 'detail', version: 1, titleFa: 'Detail / Entity', descriptionFa: 'جزئیات ملک، محله و موجودیت‌ها', regions: ['main', 'secondary', 'aside', 'inspector', 'bottom'], minWidthPx: 360, capabilities: { sidebar: true, inspector: true, toolbar: true, fullscreen: false, responsive: true } },
  { code: 'LYT-004', id: 'dashboard', version: 1, titleFa: 'Dashboard', descriptionFa: 'داشبوردهای اطلاعاتی', regions: ['primary', 'main', 'secondary', 'aside', 'bottom'], minWidthPx: 360, capabilities: { sidebar: true, inspector: false, toolbar: true, fullscreen: true, responsive: true } },
  { code: 'LYT-005', id: 'analytics', version: 1, titleFa: 'Analytics', descriptionFa: 'تحلیل‌های آماری و اقتصادی', regions: ['primary', 'main', 'secondary', 'aside', 'bottom'], minWidthPx: 360, capabilities: { sidebar: true, inspector: true, toolbar: true, fullscreen: true, responsive: true } },
  { code: 'LYT-006', id: 'map-centric', version: 1, titleFa: 'Map-centric', descriptionFa: 'جست‌وجو و تحلیل نقشه‌محور با اولویت فضای نقشه', regions: ['main', 'aside', 'inspector', 'utility'], minWidthPx: 360, capabilities: { sidebar: true, inspector: true, toolbar: true, fullscreen: true, responsive: true } },
  { code: 'LYT-007', id: 'data-dense', version: 1, titleFa: 'Data-dense', descriptionFa: 'جداول و داده‌های پرتراکم', regions: ['main', 'aside', 'inspector', 'bottom'], minWidthPx: 360, capabilities: { sidebar: true, inspector: true, toolbar: true, fullscreen: true, responsive: true } },
  { code: 'LYT-008', id: 'workflow', version: 1, titleFa: 'Form / Workflow', descriptionFa: 'فرم‌ها و فرایندهای چندمرحله‌ای', regions: ['main', 'aside', 'bottom'], minWidthPx: 320, capabilities: { sidebar: false, inspector: false, toolbar: false, fullscreen: false, responsive: true } },
  { code: 'LYT-009', id: 'admin', version: 1, titleFa: 'Admin / Operations', descriptionFa: 'مدیریت و عملیات ایزوله', regions: ['primary', 'main', 'secondary', 'aside', 'inspector'], minWidthPx: 768, capabilities: { sidebar: true, inspector: true, toolbar: true, fullscreen: false, responsive: true } },
  { code: 'LYT-010', id: 'fullscreen', version: 1, titleFa: 'Fullscreen / Immersive', descriptionFa: 'نمایش تمام‌صفحه و متمرکز با مسیر خروج روشن', regions: ['main', 'inspector', 'utility'], minWidthPx: 360, capabilities: { sidebar: false, inspector: true, toolbar: true, fullscreen: true, responsive: true } },
] as const;

export const RT_PAGE_CONTENT_REGIONS_7 = [
  { id: 'main' as const, labelFa: 'Main Region', roleFa: 'محتوای اصلی صفحه با بالاترین اولویت فضا و نمایش در موبایل' },
  { id: 'primary' as const, labelFa: 'Primary Region', roleFa: 'بخش شاخص‌های کلیدی (KPI) بالای داشبورد و عملیات' },
  { id: 'secondary' as const, labelFa: 'Secondary Region', roleFa: 'نمودارهای مقایسه‌ای و داده‌های مکمل مرتبط با محتوای اصلی' },
  { id: 'aside' as const, labelFa: 'Aside Region', roleFa: 'اطلاعات مرجع، کیفیت داده، راهنما و فیلترهای تکمیلی' },
  { id: 'inspector' as const, labelFa: 'Inspector Region', roleFa: 'پنل بررسی جزئیات موجودیت انتخاب‌شده وابسته به Context جاری' },
  { id: 'utility' as const, labelFa: 'Utility Region', roleFa: 'ابزارهای کمکی اندازه‌گیری نقشه، انتخاب و تنظیمات نمایش' },
  { id: 'bottom' as const, labelFa: 'Bottom Region', roleFa: 'جدول جزئیات، نوار عملیات یا خلاصه وضعیت پایین صفحه' },
] as const;

export const RT_PAGE_PANEL_TYPES_7 = [
  { id: 'nav-side', labelFa: 'Navigation Side Panel', roleFa: 'جایگاه ناوبری محلی (قواعد مسیر از مرحله ۱۴)' },
  { id: 'filter', labelFa: 'Filter Panel', roleFa: 'پنل فیلترهای جست‌وجو و نقشه با تبدیل Drawer در موبایل' },
  { id: 'inspector', labelFa: 'Inspector Panel', roleFa: 'نمایش جزئیات موجودیت انتخاب‌شده بدون ترک صفحه' },
  { id: 'info', labelFa: 'Information Panel', roleFa: 'توضیحات تحلیلی و منشأ داده' },
  { id: 'action', labelFa: 'Action Panel', roleFa: 'عملیات زمینه‌ای صفحه‌محور' },
  { id: 'summary', labelFa: 'Summary Panel', roleFa: 'خلاصه فرایند یا مقایسه چندمرحله‌ای' },
  { id: 'utility', labelFa: 'Utility Panel', roleFa: 'ابزارهای کمکی کنترل نمایش' },
] as const;

export const RT_PAGE_OVERLAY_ZINDEX_7 = [
  { token: '--z-base', zIndex: 0, layerFa: 'لایه پایه صفحه' },
  { token: '--z-sticky', zIndex: 100, layerFa: 'Header و ستون‌های Sticky جدول' },
  { token: '--z-dropdown', zIndex: 200, layerFa: 'منوهای کشویی و Overflow Toolbar' },
  { token: '--z-drawer', zIndex: 300, layerFa: 'پنل‌های Drawer و Bottom Sheet موبایل' },
  { token: '--z-modal', zIndex: 400, layerFa: 'پنجره Modal و Dialog متمرکز' },
  { token: '--z-popover', zIndex: 500, layerFa: 'Popover و Command Surface' },
  { token: '--z-toast', zIndex: 600, layerFa: 'پیام‌های اطلاع‌رسانی Toast' },
] as const;

export const RT_PAGE_ERROR_BOUNDARY_5 = [
  { level: 1, scopeFa: 'Application Error Boundary', fallbackFa: 'صفحه بازیابی سطح کل برنامه بدون افشای جزئیات حساس' },
  { level: 2, scopeFa: 'Workspace Error Boundary', fallbackFa: 'حالت بازیابی فضای کاری بدون تخریب ناوبری کلان' },
  { level: 3, scopeFa: 'Page Error Boundary', fallbackFa: 'صفحه خطای کنترل‌شده با حفظ Shell و بازگشت امن' },
  { level: 4, scopeFa: 'Region / Panel Error Boundary', fallbackFa: 'مهار خطای Inspector یا Toolbar بدون توقف Main Region' },
  { level: 5, scopeFa: 'Widget Error Boundary', fallbackFa: 'پیام خطای موضعی با دکمه تلاش مجدد در همان Widget (§۱۵.۲۸)' },
] as const;

export const RT_PAGE_EXECUTION_PHASES_10 = [
  { phase: 1, outputId: 'RT-FE-PAGE-INV-001', titleFa: 'شناسایی صفحات و ساختار موجود' },
  { phase: 2, outputId: 'RT-FE-PAGE-CONTRACT-001', titleFa: 'تعریف قراردادهای Page Composition و Registry' },
  { phase: 3, outputId: 'RT-FE-PAGE-SHELL-001', titleFa: 'ساخت Page Shell، Slotها و Overlay Host' },
  { phase: 4, outputId: 'RT-FE-LAYOUT-BASE-001', titleFa: 'ساخت Layoutهای پایه (Standard/Detail/Dashboard/Analytics/Data-dense)' },
  { phase: 5, outputId: 'RT-FE-LAYOUT-SPECIAL-001', titleFa: 'ساخت Layoutهای تخصصی (Map-centric/Workflow/Admin/Fullscreen)' },
  { phase: 6, outputId: 'RT-FE-PANEL-WIDGET-001', titleFa: 'زیرساخت Resizable/Collapsible Panel، Inspector و Widget' },
  { phase: 7, outputId: 'RT-FE-RESPONSIVE-LAYOUT-001', titleFa: 'پیاده‌سازی Responsive واقعی، Logical CSS و RTL' },
  { phase: 8, outputId: 'RT-FE-PAGE-MIGRATION-001', titleFa: 'مهاجرت ۵ صفحه منتخب (محله، ملک، نقشه، بازار، مدیریت)' },
  { phase: 9, outputId: 'RT-FE-PAGE-VALIDATION-001', titleFa: 'آزمون Unit، Integration، Responsive، A11y و Visual Regression' },
  { phase: 10, outputId: 'RT-FE-PAGE-ROLLOUT-001', titleFa: 'استقرار تدریجی و حذف ساختارهای تکراری قدیمی' },
] as const;

export const RT_PAGE_DELIVERABLES_33 = [
  { id: 'RT-FE-PAGE-OUT-001', titleFa: 'سند معماری Page Composition' },
  { id: 'RT-FE-PAGE-OUT-002', titleFa: 'فهرست صفحات و طبقه‌بندی Layout' },
  { id: 'RT-FE-PAGE-OUT-003', titleFa: 'معماری Application و Page Shell' },
  { id: 'RT-FE-PAGE-OUT-004', titleFa: 'قرارداد Workspace Shell' },
  { id: 'RT-FE-PAGE-OUT-005', titleFa: 'Layout Registry و Template Catalog' },
  { id: 'RT-FE-PAGE-OUT-006', titleFa: 'قرارداد Content Region' },
  { id: 'RT-FE-PAGE-OUT-007', titleFa: 'معماری Grid و تقسیم‌بندی صفحه' },
  { id: 'RT-FE-PAGE-OUT-008', titleFa: 'قرارداد پنل‌های جانبی' },
  { id: 'RT-FE-PAGE-OUT-009', titleFa: 'معماری Inspector' },
  { id: 'RT-FE-PAGE-OUT-010', titleFa: 'معماری Toolbar و Context Bar' },
  { id: 'RT-FE-PAGE-OUT-011', titleFa: 'قرارداد Widget' },
  { id: 'RT-FE-PAGE-OUT-012', titleFa: 'معماری Dashboard Composition' },
  { id: 'RT-FE-PAGE-OUT-013', titleFa: 'معماری Map-centric Layout' },
  { id: 'RT-FE-PAGE-OUT-014', titleFa: 'معماری Data-dense Layout' },
  { id: 'RT-FE-PAGE-OUT-015', titleFa: 'معماری Detail Layout' },
  { id: 'RT-FE-PAGE-OUT-016', titleFa: 'معماری Workflow Layout' },
  { id: 'RT-FE-PAGE-OUT-017', titleFa: 'معماری Admin Layout' },
  { id: 'RT-FE-PAGE-OUT-018', titleFa: 'معماری Fullscreen Layout' },
  { id: 'RT-FE-PAGE-OUT-019', titleFa: 'قرارداد Overlay' },
  { id: 'RT-FE-PAGE-OUT-020', titleFa: 'سیاست Layout Persistence' },
  { id: 'RT-FE-PAGE-OUT-021', titleFa: 'استاندارد Responsive' },
  { id: 'RT-FE-PAGE-OUT-022', titleFa: 'استاندارد RTL' },
  { id: 'RT-FE-PAGE-OUT-023', titleFa: 'استاندارد Accessibility' },
  { id: 'RT-FE-PAGE-OUT-024', titleFa: 'استاندارد Performance' },
  { id: 'RT-FE-PAGE-OUT-025', titleFa: 'معماری Error Boundary' },
  { id: 'RT-FE-PAGE-OUT-026', titleFa: 'قرارداد TypeScript' },
  { id: 'RT-FE-PAGE-OUT-027', titleFa: 'Feature Page Composition API' },
  { id: 'RT-FE-PAGE-OUT-028', titleFa: 'ساختار پوشه و مالکیت فایل‌ها' },
  { id: 'RT-FE-PAGE-OUT-029', titleFa: 'مجموعه آزمون‌های Layout' },
  { id: 'RT-FE-PAGE-OUT-030', titleFa: 'برنامه مهاجرت صفحات' },
  { id: 'RT-FE-PAGE-OUT-031', titleFa: 'سیاست Telemetry' },
  { id: 'RT-FE-PAGE-OUT-032', titleFa: 'گزارش معیارهای پذیرش' },
  { id: 'RT-FE-PAGE-OUT-033', titleFa: 'مستند نهایی پیاده‌سازی و استقرار' },
] as const;
