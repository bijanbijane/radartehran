/**
 * @file src/features/onboarding/services/rtFeIa002InformationArchitectureTypes.ts
 * @description RT-FE-IA-002 (Part 2 of 28) — Information Architecture, Page Hierarchy & Routing Registry Types.
 */
import { formatMillionTomanAsIntlCurrency } from '../../../utils/areaUnit';

export const RT_FE_IA_002_SPEC_ID = 'RT-FE-IA-002' as const;
export const RT_FE_IA_002_PART_LABEL = 'بخش دوم از ۲۸ — مرحله دوم: طراحی معماری اطلاعات، ساختار صفحات و نظام مسیریابی' as const;
export const RT_FE_IA_002_NEXT_STAGE = 'مرحله سوم: طراحی معماری پوسته اصلی فرانت‌اند، ساختار Layoutها، هدر، منوهای اصلی، سایدبار، نوار ابزار و سیستم نمایش صفحات رادار تهران' as const;
export const RT_FE_IA_002_FX_BENCHMARK = formatMillionTomanAsIntlCurrency(10000, 'USD', 'en');

export type AccessLevel = 'public' | 'guest' | 'authenticated' | 'verified_user' | 'professional' | 'moderator' | 'permission' | 'admin' | 'super_admin';
export type LayoutType = 'public' | 'workspace' | 'admin' | 'system' | 'PublicLayout' | 'WorkspaceLayout' | 'AdminLayout' | 'SystemLayout';
export type InformationSpaceId = 'public' | 'analytical' | 'workspace' | 'admin' | 'system';

export interface IaRouteDefinition {
  id: string;
  path: string;
  name: string;
  module: string;
  space: InformationSpaceId;
  layout: LayoutType;
  access: AccessLevel;
  permissions?: string[];
  featureFlag?: string;
  title: string;
  breadcrumb?: string;
  lazy: boolean;
  errorBoundary: string;
  responsibilityFa: string;
  connectedPagesFa?: string;
}

export const RT_FE_IA_PRINCIPLES_10: ReadonlyArray<{ id: string; titleFa: string; requirementFa: string }> = [
  { id: 'IA-001', titleFa: 'سلسله‌مراتب مشخص', requirementFa: 'هر صفحه باید جایگاه مشخصی در ساختار محصول داشته باشد' },
  { id: 'IA-002', titleFa: 'مسیر قابل پیش‌بینی', requirementFa: 'آدرس صفحات باید قابل فهم، پایدار و معنادار باشد' },
  { id: 'IA-003', titleFa: 'استقلال ماژول‌ها', requirementFa: 'هر ماژول باید محدوده صفحات و مسیرهای مشخص داشته باشد' },
  { id: 'IA-004', titleFa: 'جلوگیری از تکرار', requirementFa: 'یک صفحه نباید در چند مسیر مستقل با محتوای یکسان ساخته شود' },
  { id: 'IA-005', titleFa: 'دسترسی متناسب با نقش', requirementFa: 'صفحات اختصاصی باید متناسب با سطح دسترسی کاربر باشند' },
  { id: 'IA-006', titleFa: 'پیوند میان اطلاعات', requirementFa: 'حرکت از ملک به محله، ساختمان، قیمت و خدمات مرتبط باید امکان‌پذیر باشد' },
  { id: 'IA-007', titleFa: 'حفظ وضعیت کاربر', requirementFa: 'جست‌وجوها و فیلترهای قابل اشتراک باید در URL بازسازی‌پذیر باشند' },
  { id: 'IA-008', titleFa: 'قابلیت توسعه', requirementFa: 'اضافه‌شدن ماژول جدید نباید مستلزم بازطراحی کل مسیریابی باشد' },
  { id: 'IA-009', titleFa: 'پشتیبانی از لینک مستقیم', requirementFa: 'هر صفحه‌ای که قابلیت اشتراک دارد باید مستقیماً قابل باز شدن باشد' },
  { id: 'IA-010', titleFa: 'سازگاری با موبایل', requirementFa: 'ساختار مسیرها نباید به نوع نمایش منو یا دستگاه وابسته باشد' },
];

export const RT_FE_IA_5_SPACES: ReadonlyArray<{
  id: InformationSpaceId;
  titleFa: string;
  subtitleFa: string;
  defaultLayout: LayoutType;
}> = [
  { id: 'public', titleFa: 'فضای عمومی', subtitleFa: 'اطلاعات و جست‌وجو بدون اجبار به ورود کاربر', defaultLayout: 'public' },
  { id: 'analytical', titleFa: 'فضای تحلیلی', subtitleFa: 'بازار، ارزش‌گذاری، تحرک شهری و هوشمندی محله و ساختمان', defaultLayout: 'public' },
  { id: 'workspace', titleFa: 'فضای کاربری', subtitleFa: 'حساب کاربری، ذخیره‌ها، مقایسه‌ها و ابزارهای شخصی (/account)', defaultLayout: 'workspace' },
  { id: 'admin', titleFa: 'فضای مدیریتی', subtitleFa: 'کنترل، حاکمیت داده، ممیزی و مدیریت سامانه (/admin)', defaultLayout: 'admin' },
  { id: 'system', titleFa: 'صفحات سیستمی و مشترک', subtitleFa: 'خطاها، راهنما، وضعیت سرویس، قوانین و احراز هویت (/auth)', defaultLayout: 'system' },
];

export const RT_FE_IA_CENTRAL_ROUTE_REGISTRY: readonly IaRouteDefinition[] = [
  // ۱. فضای عمومی و تحلیلی (۱۳ مسیر اصلی + زیرمسیرهای شناسنامه)
  { id: 'home', path: '/', name: 'home', module: 'global-search', space: 'public', layout: 'public', access: 'public', title: 'صفحه اصلی رادار تهران', breadcrumb: 'خانه', lazy: false, errorBoundary: 'PublicPageErrorBoundary', responsibilityFa: 'معرفی وضعیت کلی بازار و امکانات رادار', connectedPagesFa: 'تمام بخش‌های اصلی' },
  { id: 'map', path: '/map', name: 'interactive-map', module: 'geo-map', space: 'public', layout: 'public', access: 'public', title: 'نقشه تعاملی تهران', breadcrumb: 'نقشه', lazy: true, errorBoundary: 'MapCanvasErrorBoundary', responsibilityFa: 'نمایش اطلاعات جغرافیایی و لایه‌های مکانی', connectedPagesFa: 'ملک، محله، ساختمان و حمل‌ونقل' },
  { id: 'search', path: '/search', name: 'global-search', module: 'global-search', space: 'public', layout: 'public', access: 'public', title: 'جست‌وجوی سراسری', breadcrumb: 'جست‌وجو', lazy: true, errorBoundary: 'PublicPageErrorBoundary', responsibilityFa: 'جست‌وجوی یکپارچه موجودیت‌ها', connectedPagesFa: 'تمام ماژول‌های قابل جست‌وجو' },
  { id: 'properties-list', path: '/properties', name: 'properties-list', module: 'property-listings', space: 'public', layout: 'public', access: 'public', title: 'فهرست املاک', breadcrumb: 'املاک', lazy: true, errorBoundary: 'PropertyModuleErrorBoundary', responsibilityFa: 'فهرست و فیلتر املاک', connectedPagesFa: 'ارزش‌گذاری و محله' },
  { id: 'property-detail', path: '/properties/:propertyId', name: 'property-detail', module: 'property-listings', space: 'public', layout: 'public', access: 'public', title: 'شناسنامه ملک', breadcrumb: 'اطلاعات ملک', lazy: true, errorBoundary: 'PropertyModuleErrorBoundary', responsibilityFa: 'نمایش جزئیات ملک', connectedPagesFa: 'ساختمان، محله و ارزش‌گذاری' },
  { id: 'neighborhoods-list', path: '/neighborhoods', name: 'neighborhoods-list', module: 'neighborhood-intelligence', space: 'analytical', layout: 'public', access: 'public', title: 'فهرست محله‌ها', breadcrumb: 'محله‌ها', lazy: true, errorBoundary: 'NeighborhoodErrorBoundary', responsibilityFa: 'فهرست محله‌ها', connectedPagesFa: 'نقشه و تحلیل شهری' },
  { id: 'neighborhood-detail', path: '/neighborhoods/:neighborhoodId', name: 'neighborhood-detail', module: 'neighborhood-intelligence', space: 'analytical', layout: 'public', access: 'public', title: 'شناسنامه محله', breadcrumb: 'شناسنامه محله', lazy: true, errorBoundary: 'NeighborhoodErrorBoundary', responsibilityFa: 'شناسنامه تحلیلی محله', connectedPagesFa: 'ملک، جمعیت، ساختمان و خدمات' },
  { id: 'buildings-list', path: '/buildings', name: 'buildings-list', module: 'building-intelligence', space: 'analytical', layout: 'public', access: 'public', title: 'اطلاعات ساختمان‌ها', breadcrumb: 'ساختمان‌ها', lazy: true, errorBoundary: 'BuildingModuleErrorBoundary', responsibilityFa: 'فهرست و تحلیل بافت کالبدی ساختمان‌ها', connectedPagesFa: 'ملک و محله' },
  { id: 'building-detail', path: '/buildings/:buildingId', name: 'building-detail', module: 'building-intelligence', space: 'analytical', layout: 'public', access: 'public', title: 'شناسنامه ساختمان', breadcrumb: 'شناسنامه ساختمان', lazy: true, errorBoundary: 'BuildingModuleErrorBoundary', responsibilityFa: 'شناسنامه ساختمان', connectedPagesFa: 'ملک و محله' },
  { id: 'valuation', path: '/valuation', name: 'property-valuation', module: 'property-valuation', space: 'analytical', layout: 'public', access: 'public', title: 'ارزش‌گذاری املاک', breadcrumb: 'ارزش‌گذاری', lazy: true, errorBoundary: 'ValuationModuleErrorBoundary', responsibilityFa: 'دسترسی به ابزار ارزش‌گذاری', connectedPagesFa: 'ملک و تحلیل بازار' },
  { id: 'mobility', path: '/mobility', name: 'urban-mobility', module: 'urban-mobility', space: 'analytical', layout: 'public', access: 'public', title: 'حمل‌ونقل و تحرک شهری', breadcrumb: 'حمل‌ونقل', lazy: true, errorBoundary: 'MobilityModuleErrorBoundary', responsibilityFa: 'تحلیل شبکه و دسترسی حمل‌ونقل', connectedPagesFa: 'محله و نقشه' },
  { id: 'housing-market', path: '/housing-market', name: 'housing-market', module: 'housing-supply-demand', space: 'analytical', layout: 'public', access: 'public', title: 'عرضه و تقاضای مسکن', breadcrumb: 'تحلیل بازار', lazy: true, errorBoundary: 'MarketModuleErrorBoundary', responsibilityFa: 'تحلیل عرضه و تقاضای مسکن', connectedPagesFa: 'محله و بازار املاک' },
  { id: 'services-list', path: '/services', name: 'services-marketplace', module: 'services-marketplace', space: 'public', layout: 'public', access: 'public', title: 'بازارگاه خدمات', breadcrumb: 'خدمات', lazy: true, errorBoundary: 'ServicesModuleErrorBoundary', responsibilityFa: 'جست‌وجوی خدمات و متخصصان', connectedPagesFa: 'ملک و پروفایل ارائه‌دهنده' },
  { id: 'service-detail', path: '/services/:serviceId', name: 'service-detail', module: 'services-marketplace', space: 'public', layout: 'public', access: 'public', title: 'شناسنامه خدمت', breadcrumb: 'جزئیات خدمت', lazy: true, errorBoundary: 'ServicesModuleErrorBoundary', responsibilityFa: 'معرفی و ارتباط با ارائه‌دهنده خدمت', connectedPagesFa: 'ملک و جامعه کاربران' },
  { id: 'community-hub', path: '/community', name: 'user-community', module: 'user-community', space: 'public', layout: 'public', access: 'public', title: 'جامعه و مشارکت کاربران', breadcrumb: 'جامعه', lazy: true, errorBoundary: 'CommunityModuleErrorBoundary', responsibilityFa: 'محتوای مشارکتی و اجتماعی', connectedPagesFa: 'محله، ملک و کاربران' },
  { id: 'community-post', path: '/community/posts/:postId', name: 'community-post', module: 'user-community', space: 'public', layout: 'public', access: 'public', title: 'صفحه محتوای مشارکتی', breadcrumb: 'مطلب جامعه', lazy: true, errorBoundary: 'CommunityModuleErrorBoundary', responsibilityFa: 'نمایش بحث یا تجربه ثبت‌شده کاربر', connectedPagesFa: 'جامعه، محله و ملک' },

  // ۲. فضای حساب کاربری (/account)
  { id: 'account-profile-personal', path: '/account/profile/personal', name: 'account-profile-personal', module: 'user-workspace', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'پروفایل شخصی کاربر', breadcrumb: 'اطلاعات فردی', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'مدیریت اطلاعات پایه حساب شخصی کاربر' },
  { id: 'account-profile-professional', path: '/account/profile/professional', name: 'account-profile-professional', module: 'user-workspace', space: 'workspace', layout: 'workspace', access: 'permission', permissions: ['profile:professional'], title: 'پروفایل حرفه‌ای و تخصصی', breadcrumb: 'پروفایل حرفه‌ای', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'اطلاعات حرفه‌ای مجزا از پروفایل عمومی' },
  { id: 'account-profile-verification', path: '/account/profile/verification', name: 'account-profile-verification', module: 'user-workspace', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'وضعیت اعتبارسنجی هویت و مدارک', breadcrumb: 'احراز هویت', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'پیگیری و ثبت مدارک اعتبارسنجی تخصصی' },
  { id: 'account-settings-preferences', path: '/account/settings/preferences', name: 'account-settings-preferences', module: 'user-workspace', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'تنظیمات و ترجیحات نمایشی', breadcrumb: 'ترجیحات', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'تنظیم واحد متراژ، ارز، قالب و زبان' },
  { id: 'account-settings-notifications', path: '/account/settings/notifications', name: 'account-settings-notifications', module: 'user-workspace', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'تنظیمات اعلان‌ها', breadcrumb: 'تنظیمات اعلان', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'مدیریت کانال‌های دریافت هشدارهای قیمتی' },
  { id: 'account-settings-privacy', path: '/account/settings/privacy', name: 'account-settings-privacy', module: 'user-workspace', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'تنظیمات حریم خصوصی', breadcrumb: 'حریم خصوصی حساب', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'کنترل نمایش اطلاعات عمومی و خروجی داده‌ها' },
  { id: 'account-settings-security', path: '/account/settings/security', name: 'account-settings-security', module: 'user-workspace', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'امنیت حساب و نشست‌ها', breadcrumb: 'امنیت حساب', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'مدیریت نشست‌های فعال و امنیت ورود' },
  { id: 'account-saved-properties', path: '/account/saved/properties', name: 'account-saved-properties', module: 'user-workspace', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'املاک ذخیره‌شده', breadcrumb: 'املاک ذخیره‌شده', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'فهرست املاک نشان‌شده کاربر' },
  { id: 'account-saved-neighborhoods', path: '/account/saved/neighborhoods', name: 'account-saved-neighborhoods', module: 'user-workspace', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'محله‌های منتخب', breadcrumb: 'محله‌های ذخیره‌شده', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'فهرست محله‌های موردعلاقه کاربر' },
  { id: 'account-saved-services', path: '/account/saved/services', name: 'account-saved-services', module: 'user-workspace', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'خدمات ذخیره‌شده', breadcrumb: 'خدمات منتخب', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'متخصصان و خدمات نشان‌شده کاربر' },
  { id: 'account-searches', path: '/account/searches', name: 'account-searches', module: 'user-workspace', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'جست‌وجوهای ذخیره‌شده', breadcrumb: 'جست‌وجوهای من', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'فیلترها و جست‌وجوهای ذخیره‌شده کاربر' },
  { id: 'account-comparisons', path: '/account/comparisons', name: 'account-comparisons', module: 'user-workspace', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'مقایسه‌های ذخیره‌شده', breadcrumb: 'مقایسه‌ها', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'ماتریس‌های مقایسه ملک و محله کاربر' },
  { id: 'account-contributions-submitted', path: '/account/contributions/submitted', name: 'account-contributions-submitted', module: 'user-community', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'مشارکت‌های ارسال‌شده', breadcrumb: 'مشارکت‌های من', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'گزارش‌ها و نظرات ثبت‌شده توسط کاربر' },
  { id: 'account-contributions-status', path: '/account/contributions/status', name: 'account-contributions-status', module: 'user-community', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'وضعیت بررسی مشارکت‌ها', breadcrumb: 'وضعیت مشارکت', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'رهگیری وضعیت تأیید یا بازبینی مشارکت‌ها' },
  { id: 'account-notifications', path: '/account/notifications', name: 'account-notifications', module: 'user-workspace', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'صندوق اعلان‌های کاربر', breadcrumb: 'اعلان‌ها', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'مشاهده پیام‌ها و هشدارهای دریافتی' },
  { id: 'account-activity', path: '/account/activity', name: 'account-activity', module: 'user-workspace', space: 'workspace', layout: 'workspace', access: 'authenticated', title: 'تاریخچه فعالیت حساب', breadcrumb: 'فعالیت‌ها', lazy: true, errorBoundary: 'WorkspaceErrorBoundary', responsibilityFa: 'مرور بازدیدها و تعاملات اخیر حساب' },

  // ۳. فضای مدیریتی (/admin — ۱۲ مسیر اصلی + مسیرهای جزئیات)
  { id: 'admin-dashboard', path: '/admin/dashboard', name: 'admin-dashboard', module: 'data-governance', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:dashboard:view'], title: 'داشبورد مدیریت سامانه', breadcrumb: 'داشبورد مدیریت', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'وضعیت کلی سامانه و شاخص‌های مدیریتی' },
  { id: 'admin-users', path: '/admin/users', name: 'admin-users', module: 'data-governance', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:users:manage'], title: 'مدیریت کاربران', breadcrumb: 'کاربران', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'مدیریت کاربران' },
  { id: 'admin-user-detail', path: '/admin/users/:userId', name: 'admin-user-detail', module: 'data-governance', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:users:manage'], title: 'پرونده کاربر در پنل مدیریت', breadcrumb: 'جزئیات کاربر', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'بررسی وضعیت حساب و دسترسی‌های یک کاربر' },
  { id: 'admin-user-roles', path: '/admin/users/roles', name: 'admin-user-roles', module: 'data-governance', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:roles:manage'], title: 'مدیریت نقش‌ها و مجوزها', breadcrumb: 'نقش‌ها', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'تعریف و تخصیص مجوزهای RBAC' },
  { id: 'admin-content', path: '/admin/content', name: 'admin-content', module: 'data-governance', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:content:moderate'], title: 'مدیریت محتوا', breadcrumb: 'محتوا', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'مدیریت محتوا' },
  { id: 'admin-properties', path: '/admin/properties', name: 'admin-properties', module: 'property-listings', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:properties:review'], title: 'نظارت بر اطلاعات املاک', breadcrumb: 'نظارت املاک', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'نظارت بر اطلاعات املاک' },
  { id: 'admin-data-sources', path: '/admin/data-sources', name: 'admin-data-sources', module: 'data-governance', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:sources:manage'], title: 'مدیریت منابع اطلاعاتی', breadcrumb: 'منابع داده', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'مدیریت منابع اطلاعاتی' },
  { id: 'admin-data-source-detail', path: '/admin/data-sources/:sourceId', name: 'admin-data-source-detail', module: 'data-governance', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:sources:manage'], title: 'جزئیات منبع داده', breadcrumb: 'شناسنامه منبع داده', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'پیکربندی و پایش اتصال منبع داده مشخص' },
  { id: 'admin-data-quality', path: '/admin/data-quality', name: 'admin-data-quality', module: 'data-governance', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:quality:view'], title: 'نظارت بر کیفیت و تازگی داده', breadcrumb: 'کیفیت داده', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'نظارت بر کیفیت و تازگی داده' },
  { id: 'admin-data-review', path: '/admin/data-review', name: 'admin-data-review', module: 'data-governance', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:data:approve'], title: 'بررسی و تأیید اطلاعات', breadcrumb: 'تأیید داده', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'بررسی و تأیید اطلاعات' },
  { id: 'admin-contributions', path: '/admin/contributions', name: 'admin-contributions', module: 'user-community', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:contributions:review'], title: 'بررسی مشارکت‌های کاربران', breadcrumb: 'مشارکت‌ها', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'بررسی مشارکت‌های کاربران' },
  { id: 'admin-contribution-detail', path: '/admin/contributions/:contributionId', name: 'admin-contribution-detail', module: 'user-community', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:contributions:review'], title: 'جزئیات مشارکت کاربر', breadcrumb: 'پرونده مشارکت', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'داوری و بررسی شواهد یک مشارکت ثبت‌شده' },
  { id: 'admin-modules', path: '/admin/modules', name: 'admin-modules', module: 'data-governance', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:modules:configure'], title: 'مدیریت وضعیت و تنظیمات ماژول‌ها', breadcrumb: 'ماژول‌ها و پرچم‌ها', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'مدیریت وضعیت و تنظیمات ماژول‌ها' },
  { id: 'admin-reports', path: '/admin/reports', name: 'admin-reports', module: 'data-visualization', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:reports:view'], title: 'گزارش‌های مدیریتی', breadcrumb: 'گزارش‌های مدیریتی', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'گزارش‌های مدیریتی' },
  { id: 'admin-audit-logs', path: '/admin/audit-logs', name: 'admin-audit-logs', module: 'data-governance', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:audit:read'], title: 'مشاهده رویدادهای ثبت‌شده', breadcrumb: 'لاگ‌های ممیزی', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'مشاهده رویدادهای ثبت‌شده' },
  { id: 'admin-system-status', path: '/admin/system-status', name: 'admin-system-status', module: 'data-governance', space: 'admin', layout: 'admin', access: 'admin', permissions: ['admin:system:monitor'], title: 'وضعیت عملیاتی اجزای برنامه', breadcrumb: 'وضعیت سیستم', lazy: true, errorBoundary: 'AdminErrorBoundary', responsibilityFa: 'وضعیت عملیاتی اجزای برنامه' },

  // ۴. صفحات سیستمی و احراز هویت (۱۰ صفحه سیستمی + /auth)
  { id: 'system-404', path: '/404', name: 'not-found', module: 'shared-system', space: 'system', layout: 'system', access: 'public', title: 'صفحه پیدا نشد', breadcrumb: '۴۰۴', lazy: false, errorBoundary: 'RootSystemErrorBoundary', responsibilityFa: 'مسیر نامعتبر یا موجودیت ناموجود' },
  { id: 'system-403', path: '/403', name: 'forbidden', module: 'shared-system', space: 'system', layout: 'system', access: 'public', title: 'دسترسی غیرمجاز', breadcrumb: '۴۰۳', lazy: false, errorBoundary: 'RootSystemErrorBoundary', responsibilityFa: 'نداشتن مجوز مشاهده یا اجرای مسیر' },
  { id: 'system-500', path: '/500', name: 'server-error', module: 'shared-system', space: 'system', layout: 'system', access: 'public', title: 'خطای سامانه', breadcrumb: '۵۰۰', lazy: false, errorBoundary: 'RootSystemErrorBoundary', responsibilityFa: 'خطای پیش‌بینی‌نشده سامانه' },
  { id: 'system-maintenance', path: '/maintenance', name: 'maintenance', module: 'shared-system', space: 'system', layout: 'system', access: 'public', title: 'تعمیرات سامانه', breadcrumb: 'تعمیرات', lazy: false, errorBoundary: 'RootSystemErrorBoundary', responsibilityFa: 'توقف برنامه‌ریزی‌شده سامانه' },
  { id: 'system-network-error', path: '/network-error', name: 'network-error', module: 'shared-system', space: 'system', layout: 'system', access: 'public', title: 'خطای ارتباط', breadcrumb: 'خطای شبکه', lazy: false, errorBoundary: 'RootSystemErrorBoundary', responsibilityFa: 'قطع یا اختلال ارتباط شبکه' },
  { id: 'system-unavailable', path: '/unavailable', name: 'feature-unavailable', module: 'shared-system', space: 'system', layout: 'system', access: 'public', title: 'قابلیت موقتاً در دسترس نیست', breadcrumb: 'عدم دسترسی موقت', lazy: false, errorBoundary: 'RootSystemErrorBoundary', responsibilityFa: 'توقف یک قابلیت از طریق Feature Flag' },
  { id: 'system-help', path: '/help', name: 'system-help', module: 'shared-system', space: 'system', layout: 'system', access: 'public', title: 'راهنمای استفاده', breadcrumb: 'راهنما', lazy: true, errorBoundary: 'RootSystemErrorBoundary', responsibilityFa: 'راهنمای عمومی استفاده از رادار' },
  { id: 'system-about', path: '/about', name: 'system-about', module: 'shared-system', space: 'system', layout: 'system', access: 'public', title: 'درباره رادار', breadcrumb: 'درباره ما', lazy: true, errorBoundary: 'RootSystemErrorBoundary', responsibilityFa: 'معرفی محصول و روش‌شناسی' },
  { id: 'system-terms', path: '/terms', name: 'system-terms', module: 'shared-system', space: 'system', layout: 'system', access: 'public', title: 'شرایط استفاده', breadcrumb: 'شرایط استفاده', lazy: true, errorBoundary: 'RootSystemErrorBoundary', responsibilityFa: 'ضوابط حقوقی و شرایط بهره‌برداری از محصول' },
  { id: 'system-privacy', path: '/privacy', name: 'system-privacy', module: 'shared-system', space: 'system', layout: 'system', access: 'public', title: 'حریم خصوصی', breadcrumb: 'حریم خصوصی', lazy: true, errorBoundary: 'RootSystemErrorBoundary', responsibilityFa: 'سیاست حفاظت از داده کاربران' },
  { id: 'auth-login', path: '/auth/login', name: 'auth-login', module: 'shared-system', space: 'system', layout: 'system', access: 'public', title: 'ورود به حساب رادار', breadcrumb: 'ورود', lazy: true, errorBoundary: 'RootSystemErrorBoundary', responsibilityFa: 'احراز هویت و بازگشت ایمن به مسیر مقصد' },
];

export const RT_FE_IA_ROUTE_REQUIREMENTS_15: ReadonlyArray<{ id: string; titleFa: string; acceptanceFa: string }> = [
  { id: 'ROUTE-001', titleFa: 'Route Registry مرکزی', acceptanceFa: 'مسیرهای اصلی از یک مرجع واحد مدیریت شوند' },
  { id: 'ROUTE-002', titleFa: 'Lazy Loading', acceptanceFa: 'صفحات سنگین در زمان نیاز بارگذاری شوند' },
  { id: 'ROUTE-003', titleFa: 'Route Guard', acceptanceFa: 'مسیرهای محدودشده کنترل دسترسی داشته باشند' },
  { id: 'ROUTE-004', titleFa: 'Deep Linking', acceptanceFa: 'لینک مستقیم به صفحه جزئیات کار کند' },
  { id: 'ROUTE-005', titleFa: 'URL State', acceptanceFa: 'فیلترها و پارامترهای قابل اشتراک بازیابی شوند' },
  { id: 'ROUTE-006', titleFa: 'Breadcrumb', acceptanceFa: 'مسیر راهنمای صفحات قابل تولید باشد' },
  { id: 'ROUTE-007', titleFa: 'Error Handling', acceptanceFa: 'خطاهای مسیر و دریافت داده تفکیک شوند' },
  { id: 'ROUTE-008', titleFa: 'Redirect', acceptanceFa: 'مسیرهای قدیمی مدیریت شوند' },
  { id: 'ROUTE-009', titleFa: 'Unknown Route', acceptanceFa: 'مسیر نامعتبر صفحه 404 نمایش دهد' },
  { id: 'ROUTE-010', titleFa: 'Navigation State', acceptanceFa: 'وضعیت منو و مسیر فعال صحیح باشد' },
  { id: 'ROUTE-011', titleFa: 'Responsive Navigation', acceptanceFa: 'ناوبری در موبایل و دسکتاپ قابل استفاده باشد' },
  { id: 'ROUTE-012', titleFa: 'Access Isolation', acceptanceFa: 'صفحات کاربری و مدیریتی از یکدیگر تفکیک شوند' },
  { id: 'ROUTE-013', titleFa: 'Module Ownership', acceptanceFa: 'مالک هر مسیر مشخص باشد' },
  { id: 'ROUTE-014', titleFa: 'Browser History', acceptanceFa: 'Back و Forward رفتار صحیح داشته باشند' },
  { id: 'ROUTE-015', titleFa: 'Route Testing', acceptanceFa: 'تمام مسیرهای کلیدی آزمون‌پذیر باشند' },
];

export const RT_FE_IA_DELIVERABLES_15: ReadonlyArray<{ id: string; titleFa: string }> = [
  { id: 'OUT-01', titleFa: 'نقشه کلان معماری اطلاعات رادار' },
  { id: 'OUT-02', titleFa: 'نمودار سلسله‌مراتب صفحات' },
  { id: 'OUT-03', titleFa: 'فهرست صفحات عمومی' },
  { id: 'OUT-04', titleFa: 'فهرست صفحات حساب کاربری' },
  { id: 'OUT-05', titleFa: 'فهرست صفحات مدیریتی' },
  { id: 'OUT-06', titleFa: 'فهرست صفحات سیستمی' },
  { id: 'OUT-07', titleFa: 'نقشه ارتباط صفحات و ماژول‌ها' },
  { id: 'OUT-08', titleFa: 'استاندارد نام‌گذاری URL' },
  { id: 'OUT-09', titleFa: 'Route Registry و قراردادهای آن' },
  { id: 'OUT-10', titleFa: 'نقشه Layoutها' },
  { id: 'OUT-11', titleFa: 'نقشه کنترل دسترسی مسیرها' },
  { id: 'OUT-12', titleFa: 'قرارداد Query Parameters' },
  { id: 'OUT-13', titleFa: 'استاندارد Breadcrumb و Navigation' },
  { id: 'OUT-14', titleFa: 'سیاست Redirect و سازگاری مسیرها' },
  { id: 'OUT-15', titleFa: 'سناریوها و معیارهای آزمون مسیریابی' },
];
