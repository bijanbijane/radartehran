/**
 * Stage 14 — Spec Constants & Registries for RT-FE-NAVIGATION-WORKSPACE-014
 * Frontend Navigation, Feature Discovery & Workspace Architecture
 */

export const RT_FE_NAVIGATION_WORKSPACE_014_SPEC_ID = 'RT-FE-NAVIGATION-WORKSPACE-014' as const;
export const RT_FE_STAGE15_BRIDGE_SPEC_ID = 'RT-FE-PAGE-COMPOSITION-015' as const;

export const RT_NAV_SUBSYSTEMS_7 = [
  { id: 'NAV-S1', nameEn: 'Global Navigation', roleFa: 'دروازه سراسری دسترسی به بخش‌های اصلی محصول در دسکتاپ، تبلت و موبایل' },
  { id: 'NAV-S2', nameEn: 'Local Navigation', roleFa: 'هدایت داخلی بخش‌های یک Feature (مانند پرونده محله یا ملک) متمایز از Tabهای ساده' },
  { id: 'NAV-S3', nameEn: 'Workspace Navigation', roleFa: 'حرکت بین محیط‌های کاری (عمومی، بازار، پژوهش، حرفه‌ای و مدیریت)' },
  { id: 'NAV-S4', nameEn: 'Discovery System', roleFa: 'کشف قابلیت‌ها و جست‌وجوی موجودیت‌ها با دسته‌بندی مجزا و نرمال‌سازی فارسی' },
  { id: 'NAV-S5', nameEn: 'Command System', roleFa: 'Command Palette (Ctrl+K / ⌘+K) برای اجرای سریع فرمان‌های مجاز و تأیید عملیات حساس' },
  { id: 'NAV-S6', nameEn: 'Navigation Context & History', roleFa: 'حفظ زمینه کاری بین Featureها، Browser History و Workspace History بدون نشت حریم خصوصی' },
  { id: 'NAV-S7', nameEn: 'Navigation Infrastructure', roleFa: 'Registry متصل به featureId، Deep Link Resolver، Metadata مسیرها و Permission Guard' },
] as const;

export const RT_NAV_GLOBAL_GROUPS_10 = [
  { id: 'home', labelFa: 'خانه', priorityTier: 1, contentFa: 'داشبورد و نمای کلی' },
  { id: 'properties', labelFa: 'املاک', priorityTier: 1, contentFa: 'ملک، ساختمان، واحد و آگهی' },
  { id: 'geography', labelFa: 'نقشه و محله‌ها', priorityTier: 1, contentFa: 'نقشه، محله‌ها و لایه‌های شهری' },
  { id: 'market', labelFa: 'بازار', priorityTier: 1, contentFa: 'خرید، فروش، اجاره و روند قیمت' },
  { id: 'valuation', labelFa: 'ارزش‌گذاری', priorityTier: 1, contentFa: 'ارزش‌گذاری و مقایسه املاک' },
  { id: 'urban', labelFa: 'تحلیل شهری', priorityTier: 2, contentFa: 'جمعیت، حمل‌ونقل، محیط و زیرساخت' },
  { id: 'reports', labelFa: 'گزارش‌ها', priorityTier: 2, contentFa: 'گزارش‌های تحلیلی و پژوهشی' },
  { id: 'services', labelFa: 'خدمات', priorityTier: 2, contentFa: 'متخصصان و خدمات ملکی' },
  { id: 'personal', labelFa: 'فضای شخصی', priorityTier: 2, contentFa: 'ذخیره‌ها، مشارکت‌ها و فعالیت‌ها' },
  { id: 'admin', labelFa: 'مدیریت', priorityTier: 3, contentFa: 'ابزارهای مدیریتی و عملیاتی ایزوله' },
] as const;

export const RT_NAV_WORKSPACES_7 = [
  { id: 'public', nameEn: 'Public Workspace', audienceFa: 'کاربران عمومی', goalFa: 'کشف اطلاعات و استفاده عمومی', defaultRoute: '/', requiresAuth: false, adminOnly: false },
  { id: 'property', nameEn: 'Property Workspace', audienceFa: 'کاربران فعال بازار ملک', goalFa: 'بررسی و مدیریت املاک', defaultRoute: '/properties', requiresAuth: false, adminOnly: false },
  { id: 'market', nameEn: 'Market Workspace', audienceFa: 'تحلیل‌گران بازار', goalFa: 'تحلیل بازار و روندها', defaultRoute: '/market', requiresAuth: false, adminOnly: false },
  { id: 'research', nameEn: 'Research Workspace', audienceFa: 'پژوهشگران', goalFa: 'بررسی داده‌ها و گزارش‌ها', defaultRoute: '/workspace/research', requiresAuth: true, adminOnly: false },
  { id: 'professional', nameEn: 'Professional Workspace', audienceFa: 'متخصصان', goalFa: 'مدیریت خدمات و فعالیت حرفه‌ای', defaultRoute: '/workspace/pro', requiresAuth: true, adminOnly: false },
  { id: 'admin', nameEn: 'Admin Workspace', audienceFa: 'مدیران مجاز', goalFa: 'مدیریت و کنترل سامانه', defaultRoute: '/admin', requiresAuth: true, adminOnly: true },
  { id: 'data-ops', nameEn: 'Data Operations Workspace', audienceFa: 'مسئولان داده', goalFa: 'مدیریت کیفیت و جریان داده', defaultRoute: '/workspace/data-ops', requiresAuth: true, adminOnly: true },
] as const;

export const RT_NAV_FAILURE_STATES_10 = [
  { condition: 'Route نامعتبر', behaviorFa: 'نمایش صفحه 404 (هرگز با 403 اشتباه نشود)' },
  { condition: 'Feature غیرفعال', behaviorFa: 'نمایش وضعیت عدم دسترسی موقت یا مسیر جایگزین' },
  { condition: 'مجوز ناکافی', behaviorFa: 'نمایش پیام 403 با تأیید محدودیت Backend' },
  { condition: 'Session منقضی', behaviorFa: 'هدایت به ورود و بازگشت امن به مقصد مجاز اعتبارسنجی‌شده' },
  { condition: 'Entity حذف‌شده', behaviorFa: 'نمایش صفحه موجودیت حذف‌شده متمایز از خطای شبکه' },
  { condition: 'Entity بارگذاری‌نشده', behaviorFa: 'نمایش خطای شبکه با دکمه تلاش مجدد بدون حذف صفحه' },
  { condition: 'Context نامعتبر', behaviorFa: 'بازگشت کنترل‌شده به Context پیش‌فرض معتبر' },
  { condition: 'Workspace ناشناخته', behaviorFa: 'انتقال امن به Workspace پیش‌فرض عمومی' },
  { condition: 'Route قدیمی', behaviorFa: 'Redirect معتبر یا پیام مهاجرت بدون ایجاد حلقه' },
  { condition: 'شکست بارگذاری ماژول', behaviorFa: 'نمایش Fallback اختصاصی در Feature Error Boundary' },
] as const;

export const RT_NAV_MIGRATION_PHASES_7 = [
  { phase: 1, titleFa: 'شناسایی Routeها و لینک‌های پراکنده', detailFa: 'استخراج مسیرها، Layoutها و Workspaceهای ضمنی فعلی' },
  { phase: 2, titleFa: 'طراحی Navigation & Workspace Registry', detailFa: 'ثبت Route Metadata و مالکیت رسمی هر مسیر به ازای Feature' },
  { phase: 3, titleFa: 'ایجاد زیرساخت مرکزی ناوبری', detailFa: 'Navigation Service، Resolver، Breadcrumb، Context Transfer و خطاها' },
  { phase: 4, titleFa: 'مهاجرت ناوبری سراسری', detailFa: 'Header، Sidebar دسکتاپ، Mobile Navigation و Global Search Entry' },
  { phase: 5, titleFa: 'مهاجرت ناوبری محلی ماژول‌ها', detailFa: 'املاک، محله‌ها، بازار، تحلیل شهری و خدمات' },
  { phase: 6, titleFa: 'افزودن قابلیت‌های پیشرفته', detailFa: 'Command Palette (Ctrl+K)، Deep Link Resolver، Quick Access و Launcher' },
  { phase: 7, titleFa: 'تثبیت و حذف مسیرهای تکراری', detailFa: 'اصلاح Redirectها، تست CI ناوبری و همگام‌سازی مستندات' },
] as const;

export const RT_NAV_DELIVERABLES_33 = [
  { id: 'RT-NAV-OUT-001', titleFa: 'سند معماری کلان ناوبری' },
  { id: 'RT-NAV-OUT-002', titleFa: 'نقشه Global Navigation' },
  { id: 'RT-NAV-OUT-003', titleFa: 'استاندارد Local Navigation' },
  { id: 'RT-NAV-OUT-004', titleFa: 'Navigation Registry' },
  { id: 'RT-NAV-OUT-005', titleFa: 'استاندارد Navigation Item' },
  { id: 'RT-NAV-OUT-006', titleFa: 'معماری Workspace' },
  { id: 'RT-NAV-OUT-007', titleFa: 'Workspace Registry' },
  { id: 'RT-NAV-OUT-008', titleFa: 'Workspace Context Contract' },
  { id: 'RT-NAV-OUT-009', titleFa: 'Breadcrumb Architecture' },
  { id: 'RT-NAV-OUT-010', titleFa: 'Deep Linking Architecture' },
  { id: 'RT-NAV-OUT-011', titleFa: 'Navigation History Policy' },
  { id: 'RT-NAV-OUT-012', titleFa: 'Command Palette Architecture' },
  { id: 'RT-NAV-OUT-013', titleFa: 'Global Search & Discovery Contract' },
  { id: 'RT-NAV-OUT-014', titleFa: 'Navigation State Policy' },
  { id: 'RT-NAV-OUT-015', titleFa: 'Navigation Context Transfer Contract' },
  { id: 'RT-NAV-OUT-016', titleFa: 'Route Metadata Standard' },
  { id: 'RT-NAV-OUT-017', titleFa: 'Desktop Navigation Specification' },
  { id: 'RT-NAV-OUT-018', titleFa: 'Tablet Navigation Specification' },
  { id: 'RT-NAV-OUT-019', titleFa: 'Mobile Navigation Specification' },
  { id: 'RT-NAV-OUT-020', titleFa: 'Permission-aware Navigation Policy' },
  { id: 'RT-NAV-OUT-021', titleFa: 'Feature Availability Display Policy' },
  { id: 'RT-NAV-OUT-022', titleFa: 'Navigation API Contract' },
  { id: 'RT-NAV-OUT-023', titleFa: 'Accessibility Specification (WCAG 2.2 AA)' },
  { id: 'RT-NAV-OUT-024', titleFa: 'RTL Navigation Specification' },
  { id: 'RT-NAV-OUT-025', titleFa: 'Navigation Personalization Policy' },
  { id: 'RT-NAV-OUT-026', titleFa: 'Quick Access Architecture' },
  { id: 'RT-NAV-OUT-027', titleFa: 'Workspace Launcher Specification' },
  { id: 'RT-NAV-OUT-028', titleFa: 'Navigation Error Handling Policy' },
  { id: 'RT-NAV-OUT-029', titleFa: 'Navigation Test Plan' },
  { id: 'RT-NAV-OUT-030', titleFa: 'Navigation Telemetry Contract' },
  { id: 'RT-NAV-OUT-031', titleFa: 'Navigation Performance Budget' },
  { id: 'RT-NAV-OUT-032', titleFa: 'Migration Plan' },
  { id: 'RT-NAV-OUT-033', titleFa: 'گزارش تطبیق با Routeها و منوهای واقعی پروژه' },
] as const;
