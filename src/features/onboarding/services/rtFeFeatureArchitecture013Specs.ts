/**
 * Stage 13 (Modularization Track) — Spec Constants & Registries for RT-FE-FEATURE-ARCHITECTURE-013
 * Covers §13.3–§13.6, §13.15, §13.19, §13.22, §13.31–§13.35 (51 Features in 8 Domains, 36 Steps, 36 Deliverables)
 */

export const RT_FE_FEATURE_ARCHITECTURE_013_SPEC_ID = 'RT-FE-FEATURE-ARCHITECTURE-013' as const;

export const RT_FEAT_ARCHITECTURE_LEVELS_5 = [
  { id: 'L1', levelEn: 'Application Shell', responsibilityFa: 'راه‌اندازی React، Router، Session، Error Boundary سراسری و ترکیب Featureها' },
  { id: 'L2', levelEn: 'Product Modules', responsibilityFa: 'ماژول‌های مستقل محصول (search, properties, neighborhoods, valuation, listings, urban-analytics)' },
  { id: 'L3', levelEn: 'Feature Internal Architecture', responsibilityFa: 'ساختار درونی متناسب با پیچیدگی (public, application, domain, data, ui, routes, tests)' },
  { id: 'L4', levelEn: 'Shared Platform', responsibilityFa: 'زیرساخت مشترک واقعی (Design System, Data Infra, Auth, Map/Chart Infra, Localization)' },
  { id: 'L5', levelEn: 'Backend Integration', responsibilityFa: 'قراردادهای ارتباطی رسمی با Express / Cloudflare Workers و سرویس‌های عملیاتی' },
] as const;

export interface FeatureDomainCatalogGroup {
  groupIndex: number;
  groupTitleFa: string;
  domainEn: string;
  features: ReadonlyArray<{ id: string; nameEn: string; responsibilityFa: string; primaryOwnerTeam: string }>;
}

export const RT_FEAT_DOMAINS_8_51_FEATURES: readonly FeatureDomainCatalogGroup[] = [
  {
    groupIndex: 1,
    groupTitleFa: 'ماژول‌های هسته ملکی',
    domainEn: 'Core Property Domain',
    features: [
      { id: 'FEAT-001', nameEn: 'Properties', responsibilityFa: 'اطلاعات و هویت ملک', primaryOwnerTeam: 'Property Domain' },
      { id: 'FEAT-002', nameEn: 'Buildings', responsibilityFa: 'اطلاعات ساختمان و مشخصات کالبدی', primaryOwnerTeam: 'Property Domain' },
      { id: 'FEAT-003', nameEn: 'Units', responsibilityFa: 'اطلاعات واحدهای ساختمانی', primaryOwnerTeam: 'Property Domain' },
      { id: 'FEAT-004', nameEn: 'Listings', responsibilityFa: 'آگهی‌های خرید، فروش و اجاره', primaryOwnerTeam: 'Marketplace' },
      { id: 'FEAT-005', nameEn: 'Transactions', responsibilityFa: 'اطلاعات معاملات', primaryOwnerTeam: 'Marketplace' },
      { id: 'FEAT-006', nameEn: 'Property Documents', responsibilityFa: 'اسناد و مدارک مرتبط با ملک', primaryOwnerTeam: 'Property Domain' },
    ],
  },
  {
    groupIndex: 2,
    groupTitleFa: 'ماژول‌های جغرافیا و مکان',
    domainEn: 'Geospatial Domain',
    features: [
      { id: 'FEAT-007', nameEn: 'Geography', responsibilityFa: 'ساختار جغرافیایی و محدوده‌ها', primaryOwnerTeam: 'Geospatial' },
      { id: 'FEAT-008', nameEn: 'Map Workspace', responsibilityFa: 'محیط تعامل با نقشه', primaryOwnerTeam: 'Geospatial' },
      { id: 'FEAT-009', nameEn: 'Neighborhoods', responsibilityFa: 'اطلاعات محله‌ها', primaryOwnerTeam: 'Geospatial' },
      { id: 'FEAT-010', nameEn: 'Urban Boundaries', responsibilityFa: 'مرزهای اداری و آماری', primaryOwnerTeam: 'Geospatial' },
      { id: 'FEAT-011', nameEn: 'Geospatial Layers', responsibilityFa: 'لایه‌های مکانی', primaryOwnerTeam: 'Geospatial' },
      { id: 'FEAT-012', nameEn: 'Location Intelligence', responsibilityFa: 'تحلیل‌های مکانی', primaryOwnerTeam: 'Geospatial' },
    ],
  },
  {
    groupIndex: 3,
    groupTitleFa: 'ماژول‌های بازار و ارزش‌گذاری',
    domainEn: 'Real Estate Intelligence',
    features: [
      { id: 'FEAT-013', nameEn: 'Valuation', responsibilityFa: 'ارزش‌گذاری ملک', primaryOwnerTeam: 'Intelligence' },
      { id: 'FEAT-014', nameEn: 'Market Analytics', responsibilityFa: 'تحلیل بازار', primaryOwnerTeam: 'Intelligence' },
      { id: 'FEAT-015', nameEn: 'Price Intelligence', responsibilityFa: 'تحلیل قیمت', primaryOwnerTeam: 'Intelligence' },
      { id: 'FEAT-016', nameEn: 'Rental Analytics', responsibilityFa: 'تحلیل بازار اجاره', primaryOwnerTeam: 'Intelligence' },
      { id: 'FEAT-017', nameEn: 'Supply Analytics', responsibilityFa: 'تحلیل عرضه', primaryOwnerTeam: 'Intelligence' },
      { id: 'FEAT-018', nameEn: 'Demand Analytics', responsibilityFa: 'تحلیل تقاضا', primaryOwnerTeam: 'Intelligence' },
      { id: 'FEAT-019', nameEn: 'Investment Analytics', responsibilityFa: 'تحلیل سرمایه‌گذاری', primaryOwnerTeam: 'Intelligence' },
    ],
  },
  {
    groupIndex: 4,
    groupTitleFa: 'ماژول‌های تحلیل شهری',
    domainEn: 'Urban Intelligence',
    features: [
      { id: 'FEAT-020', nameEn: 'Population Analytics', responsibilityFa: 'تحلیل جمعیت', primaryOwnerTeam: 'Urban Analytics' },
      { id: 'FEAT-021', nameEn: 'Transportation Analytics', responsibilityFa: 'تحلیل حمل‌ونقل', primaryOwnerTeam: 'Urban Analytics' },
      { id: 'FEAT-022', nameEn: 'Infrastructure Analytics', responsibilityFa: 'تحلیل زیرساخت', primaryOwnerTeam: 'Urban Analytics' },
      { id: 'FEAT-023', nameEn: 'Environmental Analytics', responsibilityFa: 'تحلیل محیط‌زیست', primaryOwnerTeam: 'Urban Analytics' },
      { id: 'FEAT-024', nameEn: 'Construction Monitoring', responsibilityFa: 'رصد ساخت‌وساز', primaryOwnerTeam: 'Urban Analytics' },
      { id: 'FEAT-025', nameEn: 'Urban Development', responsibilityFa: 'تحلیل توسعه شهری', primaryOwnerTeam: 'Urban Analytics' },
      { id: 'FEAT-026', nameEn: 'Social Analytics', responsibilityFa: 'تحلیل اجتماعی تجمیعی', primaryOwnerTeam: 'Urban Analytics' },
    ],
  },
  {
    groupIndex: 5,
    groupTitleFa: 'ماژول‌های خدمات و بازار حرفه‌ای',
    domainEn: 'Marketplace Domain',
    features: [
      { id: 'FEAT-027', nameEn: 'Professionals', responsibilityFa: 'متخصصان و پروفایل حرفه‌ای', primaryOwnerTeam: 'Marketplace' },
      { id: 'FEAT-028', nameEn: 'Professional Verification', responsibilityFa: 'فرایند تأیید متخصص', primaryOwnerTeam: 'Marketplace' },
      { id: 'FEAT-029', nameEn: 'Services', responsibilityFa: 'خدمات ساختمانی و ملکی', primaryOwnerTeam: 'Marketplace' },
      { id: 'FEAT-030', nameEn: 'Service Requests', responsibilityFa: 'درخواست خدمات', primaryOwnerTeam: 'Marketplace' },
      { id: 'FEAT-031', nameEn: 'Orders', responsibilityFa: 'سفارش‌ها', primaryOwnerTeam: 'Marketplace' },
      { id: 'FEAT-032', nameEn: 'Reviews', responsibilityFa: 'ارزیابی و بازخورد خدمات', primaryOwnerTeam: 'Marketplace' },
    ],
  },
  {
    groupIndex: 6,
    groupTitleFa: 'ماژول‌های کاربران و مشارکت اجتماعی',
    domainEn: 'Community Domain',
    features: [
      { id: 'FEAT-033', nameEn: 'User Profiles', responsibilityFa: 'پروفایل کاربران', primaryOwnerTeam: 'Community' },
      { id: 'FEAT-034', nameEn: 'Contributions', responsibilityFa: 'مشارکت‌های اطلاعاتی', primaryOwnerTeam: 'Community' },
      { id: 'FEAT-035', nameEn: 'Comments', responsibilityFa: 'دیدگاه‌ها', primaryOwnerTeam: 'Community' },
      { id: 'FEAT-036', nameEn: 'Voting', responsibilityFa: 'رأی‌دهی و ارزیابی مشارکت', primaryOwnerTeam: 'Community' },
      { id: 'FEAT-037', nameEn: 'Bookmarks', responsibilityFa: 'موارد ذخیره‌شده', primaryOwnerTeam: 'Community' },
      { id: 'FEAT-038', nameEn: 'Notifications', responsibilityFa: 'اعلان‌ها', primaryOwnerTeam: 'Community' },
    ],
  },
  {
    groupIndex: 7,
    groupTitleFa: 'ماژول‌های پژوهش و گزارش',
    domainEn: 'Research Domain',
    features: [
      { id: 'FEAT-039', nameEn: 'Research Workspace', responsibilityFa: 'محیط پژوهش', primaryOwnerTeam: 'Intelligence' },
      { id: 'FEAT-040', nameEn: 'Reports', responsibilityFa: 'گزارش‌ها', primaryOwnerTeam: 'Intelligence' },
      { id: 'FEAT-041', nameEn: 'Indicator Explorer', responsibilityFa: 'بررسی شاخص‌ها', primaryOwnerTeam: 'Intelligence' },
      { id: 'FEAT-042', nameEn: 'Data Sources', responsibilityFa: 'منابع داده', primaryOwnerTeam: 'Core Frontend' },
      { id: 'FEAT-043', nameEn: 'Methodology', responsibilityFa: 'روش‌شناسی', primaryOwnerTeam: 'Intelligence' },
      { id: 'FEAT-044', nameEn: 'Data Quality', responsibilityFa: 'کیفیت و اعتبار داده', primaryOwnerTeam: 'Core Frontend' },
    ],
  },
  {
    groupIndex: 8,
    groupTitleFa: 'ماژول‌های مدیریت و عملیات',
    domainEn: 'Administration Domain',
    features: [
      { id: 'FEAT-045', nameEn: 'Admin Dashboard', responsibilityFa: 'داشبورد مدیریت', primaryOwnerTeam: 'Administration' },
      { id: 'FEAT-046', nameEn: 'User Administration', responsibilityFa: 'مدیریت کاربران', primaryOwnerTeam: 'Administration' },
      { id: 'FEAT-047', nameEn: 'Content Moderation', responsibilityFa: 'مدیریت محتوای ارسالی', primaryOwnerTeam: 'Administration' },
      { id: 'FEAT-048', nameEn: 'Access Management', responsibilityFa: 'مدیریت دسترسی', primaryOwnerTeam: 'Administration' },
      { id: 'FEAT-049', nameEn: 'System Configuration', responsibilityFa: 'تنظیمات سیستم', primaryOwnerTeam: 'Administration' },
      { id: 'FEAT-050', nameEn: 'Operational Monitoring', responsibilityFa: 'پایش عملیات', primaryOwnerTeam: 'Administration' },
      { id: 'FEAT-051', nameEn: 'Audit Explorer', responsibilityFa: 'مشاهده رویدادهای حسابرسی', primaryOwnerTeam: 'Administration' },
    ],
  },
] as const;

export const RT_FEAT_INTERNAL_LAYERS_6 = [
  { folder: 'public/', roleFa: 'تنها سطح رسمی دسترسی سایر Featureها (contracts, types, public hooks, events)' },
  { folder: 'application/', roleFa: 'Use Caseها، Serviceها و Workflowهای چندمرحله‌ای مستقل از UI' },
  { folder: 'domain/', roleFa: 'Entities، Value Objects، Rules و Policies با تفکیک از Backend' },
  { folder: 'data/', roleFa: 'API، Repositories، Queries، Mutations، Zod Schemas و Mappers همسو با مرحله ۱۲' },
  { folder: 'ui/', roleFa: 'Pages، Components، Widgets و UI Hooks بدون بازپیاده‌سازی قواعد Domain' },
  { folder: 'routes/ & tests/', roleFa: 'مالکیت Route ماژول با Lazy Loading و تست‌های Unit / Integration / Contract' },
] as const;

export const RT_FEAT_COMMUNICATION_PATTERNS_4 = [
  { pattern: 'Public Contract', summaryFa: 'مصرف داده یا عملیات ماژول دیگر فقط از public/index.ts (مانند PropertyReader)' },
  { pattern: 'Application Composition', summaryFa: 'ترکیب چند Feature مستقل در سطح Workspace یا صفحه (مانند Property Detail Workspace)' },
  { pattern: 'Event-Based Communication', summaryFa: 'اطلاع‌رسانی رخدادهای فرانت‌اند با FeatureEvent<T> نسخه‌بندی‌شده بدون عبور از مرز Backend' },
  { pattern: 'Shared Read Models', summaryFa: 'مدل نمایشی محدود و فاقد داده حساس (مانند PropertyCardModel) برای استفاده مشترک' },
] as const;

export const RT_FEAT_LIFECYCLE_STATUSES_7 = [
  'Proposed', 'Designed', 'Development', 'Preview', 'Active', 'Deprecated', 'Retired',
] as const;

export const RT_FEAT_TEAM_OWNERSHIP_8 = [
  { domain: 'Core Frontend', scopeFa: 'Application Shell و زیرساخت فرانت‌اند' },
  { domain: 'Property Domain', scopeFa: 'ملک، ساختمان، واحد و اسناد' },
  { domain: 'Marketplace', scopeFa: 'آگهی، معاملات، متخصصان، خدمات و سفارش' },
  { domain: 'Geospatial', scopeFa: 'نقشه، محدوده‌ها، محله‌ها و تحلیل مکانی' },
  { domain: 'Intelligence', scopeFa: 'ارزش‌گذاری، بازار، پژوهش و گزارش' },
  { domain: 'Urban Analytics', scopeFa: 'جمعیت، حمل‌ونقل، زیرساخت، محیط‌زیست و ساخت‌وساز' },
  { domain: 'Community', scopeFa: 'کاربران، مشارکت‌ها، دیدگاه‌ها و اعلان‌ها' },
  { domain: 'Administration', scopeFa: 'داشبورد مدیریت، نظارت، دسترسی و حسابرسی' },
] as const;

export const RT_FEAT_MIGRATION_PHASES_6 = [
  { phase: 1, titleFa: 'شناخت و تثبیت مرزها', outputFa: 'استخراج قابلیت‌ها، مالکیت موجودیت‌ها و Feature Manifest اولیه' },
  { phase: 2, titleFa: 'ایجاد زیرساخت معماری', outputFa: 'ساختار پوشه‌ها، Public API، Dependency Registry و تست‌های CI' },
  { phase: 3, titleFa: 'انتخاب ماژول آزمایشی (Pilot)', outputFa: 'اجرای الگوی کامل در یک Feature کم‌ریسک و قابل آزمون مستقل' },
  { phase: 4, titleFa: 'مهاجرت Featureهای هسته', outputFa: 'Properties → Buildings → Neighborhoods → Search → Listings → Valuation' },
  { phase: 5, titleFa: 'مهاجرت ماژول‌های تخصصی', outputFa: 'Map، Geospatial، Analytics، Marketplace، Community، Research و Admin' },
  { phase: 6, titleFa: 'تثبیت و پایش مداوم', outputFa: 'حذف Importهای غیرمجاز، بررسی Bundleها و تکمیل ADRها' },
] as const;

export const RT_FEAT_EXECUTION_STEPS_36 = [
  'استخراج Featureهای موجود', 'طبقه‌بندی قابلیت‌ها در ۸ دامنه', 'تعیین مالکیت هر مفهوم', 'تعریف Feature Boundary',
  'تعریف Feature Manifest', 'طراحی Feature Internal Architecture', 'طراحی Public API Contract', 'ایجاد Dependency Registry',
  'تعیین جهت وابستگی (Dependency Direction)', 'طراحی الگوهای ارتباط ماژول‌ها', 'طراحی Event Contracts نسخه‌مند', 'طراحی Shared Read Models',
  'طراحی Use Cases مستقل از UI', 'طراحی Multi-Feature Workflows', 'طراحی Route Ownership', 'ایجاد Feature Registry مرکزی',
  'تعریف سیاست Feature Flags جدا از Permission', 'طراحی Error Isolation سه‌سطحی', 'طراحی Lazy Loading و Code Splitting', 'تعیین Team Ownership Model',
  'تعریف AI Agent Task Boundary Contract', 'تعریف Contract Versioning Policy', 'تعیین Feature Lifecycle (7 وضعیت)', 'تعریف Shared Code Governance',
  'ثبت External Dependency Manifest', 'طراحی Subfeature Architecture', 'جداسازی دسترسی Public / Auth / Admin', 'تثبیت Feature Folder Structure',
  'ایجاد Architecture CI Checks', 'طراحی راهبرد ۶لایه Feature Testing', 'تعریف ۱۰ شاخص Performance Baseline', 'تعریف Architecture Decision Records',
  'تدوین نقشه ۶فازی مهاجرت تدریجی', 'اجرای Pilot Feature استاندارد', 'مهاجرت تدریجی ماژول‌های هسته و تخصصی', 'تثبیت و انتشار نسخه نهایی معماری',
] as const;

export const RT_FEAT_DELIVERABLES_36 = [
  { id: 'RT-FEAT-OUT-001', titleFa: 'سند معماری کلان Featureها' },
  { id: 'RT-FEAT-OUT-002', titleFa: 'نقشه طبقه‌بندی قابلیت‌های محصول (۵۱ ماژول)' },
  { id: 'RT-FEAT-OUT-003', titleFa: 'Feature Ownership Registry' },
  { id: 'RT-FEAT-OUT-004', titleFa: 'Feature Boundary Specification' },
  { id: 'RT-FEAT-OUT-005', titleFa: 'Feature Manifest Schema' },
  { id: 'RT-FEAT-OUT-006', titleFa: 'استاندارد Feature Internal Architecture' },
  { id: 'RT-FEAT-OUT-007', titleFa: 'Public API Contract' },
  { id: 'RT-FEAT-OUT-008', titleFa: 'Dependency Registry' },
  { id: 'RT-FEAT-OUT-009', titleFa: 'Dependency Direction Rules' },
  { id: 'RT-FEAT-OUT-010', titleFa: 'Feature Communication Contract' },
  { id: 'RT-FEAT-OUT-011', titleFa: 'Event Contract Standard' },
  { id: 'RT-FEAT-OUT-012', titleFa: 'Shared Read Model Standard' },
  { id: 'RT-FEAT-OUT-013', titleFa: 'Use Case Architecture' },
  { id: 'RT-FEAT-OUT-014', titleFa: 'Multi-Feature Workflow Architecture' },
  { id: 'RT-FEAT-OUT-015', titleFa: 'Route Ownership Registry' },
  { id: 'RT-FEAT-OUT-016', titleFa: 'Feature Registry' },
  { id: 'RT-FEAT-OUT-017', titleFa: 'Feature Flag Policy' },
  { id: 'RT-FEAT-OUT-018', titleFa: 'Error Isolation Architecture' },
  { id: 'RT-FEAT-OUT-019', titleFa: 'Lazy Loading & Code Splitting Policy' },
  { id: 'RT-FEAT-OUT-020', titleFa: 'Team Ownership Model' },
  { id: 'RT-FEAT-OUT-021', titleFa: 'AI Agent Task Boundary Contract' },
  { id: 'RT-FEAT-OUT-022', titleFa: 'Feature Contract Versioning Policy' },
  { id: 'RT-FEAT-OUT-023', titleFa: 'Feature Lifecycle Specification' },
  { id: 'RT-FEAT-OUT-024', titleFa: 'Shared Code Governance' },
  { id: 'RT-FEAT-OUT-025', titleFa: 'External Dependency Manifest' },
  { id: 'RT-FEAT-OUT-026', titleFa: 'Subfeature Architecture' },
  { id: 'RT-FEAT-OUT-027', titleFa: 'Feature Access Separation Model' },
  { id: 'RT-FEAT-OUT-028', titleFa: 'Feature Folder Structure' },
  { id: 'RT-FEAT-OUT-029', titleFa: 'Architecture CI Rules' },
  { id: 'RT-FEAT-OUT-030', titleFa: 'Feature Testing Strategy' },
  { id: 'RT-FEAT-OUT-031', titleFa: 'Performance Baseline & Metrics' },
  { id: 'RT-FEAT-OUT-032', titleFa: 'Architecture Decision Record Standard' },
  { id: 'RT-FEAT-OUT-033', titleFa: 'Migration Plan' },
  { id: 'RT-FEAT-OUT-034', titleFa: 'Pilot Feature Implementation' },
  { id: 'RT-FEAT-OUT-035', titleFa: 'Feature Migration Report' },
  { id: 'RT-FEAT-OUT-036', titleFa: 'Final Architecture Specification' },
] as const;
