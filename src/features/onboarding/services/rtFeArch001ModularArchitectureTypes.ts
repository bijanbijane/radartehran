/**
 * @file src/features/onboarding/services/rtFeArch001ModularArchitectureTypes.ts
 * @description RT-FE-ARCH-001 (Part 1 of 28) — Modular Monolith Frontend Architecture Types & Contracts.
 */
import { formatMillionTomanAsIntlCurrency } from '../../../utils/areaUnit';

export const RT_FE_ARCH_001_SPEC_ID = 'RT-FE-ARCH-001' as const;
export const RT_FE_ARCH_001_PART_LABEL = 'بخش اول از ۲۸ — مرحله اول: طراحی معماری ماژولار فرانت‌اند' as const;
export const RT_FE_ARCH_001_PATTERN = 'MODULAR_MONOLITH_SPA' as const;
export const RT_FE_ARCH_001_NEXT_STAGE = 'RT-FE-IA-002: طراحی معماری اطلاعات، ساختار صفحات و نظام مسیریابی فرانت‌اند رادار تهران' as const;
export const RT_FE_ARCH_001_FX_BENCHMARK = formatMillionTomanAsIntlCurrency(10000, 'USD', 'en');

export type FrontendArchitectureLayerId =
  | 'application'
  | 'pages_layouts'
  | 'features'
  | 'domain'
  | 'platform'
  | 'shared';

export interface FrontendArchitectureLayerSpec {
  id: FrontendArchitectureLayerId;
  rank: number; // 1 (top) to 6 (bottom)
  titleFa: string;
  titleEn: string;
  summaryFa: string;
  allowedDownwardTargets: readonly FrontendArchitectureLayerId[];
}

export const RT_FE_ARCH_6_LAYERS: readonly FrontendArchitectureLayerSpec[] = [
  {
    id: 'application',
    rank: 1,
    titleFa: 'لایه برنامه اصلی (Application)',
    titleEn: 'Application',
    summaryFa: 'راه‌اندازی، مسیریابی، تنظیمات و اتصال اجزای اصلی',
    allowedDownwardTargets: ['pages_layouts', 'features', 'domain', 'platform', 'shared'],
  },
  {
    id: 'pages_layouts',
    rank: 2,
    titleFa: 'لایه صفحات و چیدمان (Pages & Layouts)',
    titleEn: 'Pages & Layouts',
    summaryFa: 'صفحات، قالب‌ها و ترکیب قابلیت‌ها (بدون درخواست خام شبکه یا منطق داخلی ماژول)',
    allowedDownwardTargets: ['features', 'domain', 'platform', 'shared'],
  },
  {
    id: 'features',
    rank: 3,
    titleFa: 'لایه قابلیت‌ها (Features)',
    titleEn: 'Features',
    summaryFa: 'جست‌وجو، نقشه، ارزش‌گذاری، آگهی، تحلیل محله و سایر امکانات',
    allowedDownwardTargets: ['domain', 'platform', 'shared'],
  },
  {
    id: 'domain',
    rank: 4,
    titleFa: 'لایه مدل‌های دامنه (Domain Models)',
    titleEn: 'Domain Models',
    summaryFa: 'ملک، محله، ساختمان، کاربر، بازار، مکان و سایر موجودیت‌ها',
    allowedDownwardTargets: ['shared'],
  },
  {
    id: 'platform',
    rank: 5,
    titleFa: 'لایه زیرساخت فرانت‌اند (Frontend Platform)',
    titleEn: 'Frontend Platform',
    summaryFa: 'API، احراز هویت، مجوزها، کش، ذخیره‌سازی و مدیریت وضعیت',
    allowedDownwardTargets: ['domain', 'shared'],
  },
  {
    id: 'shared',
    rank: 6,
    titleFa: 'لایه مشترک (Shared)',
    titleEn: 'Shared',
    summaryFa: 'کامپوننت‌های عمومی، ابزارها، توابع و انواع مشترک',
    allowedDownwardTargets: [],
  },
];

export const RT_FE_ARCH_9_EXECUTION_STEPS: ReadonlyArray<{
  step: number;
  nodeEn: string;
  titleFa: string;
  descriptionFa: string;
}> = [
  { step: 1, nodeEn: 'Browser', titleFa: 'مرورگر', descriptionFa: 'مرورگر برنامه را بارگذاری می‌کند.' },
  { step: 2, nodeEn: 'Application Bootstrap', titleFa: 'راه‌اندازی برنامه', descriptionFa: 'نقطه شروع برنامه تنظیمات پایه را اجرا می‌کند.' },
  { step: 3, nodeEn: 'Global Providers', titleFa: 'Providerهای عمومی', descriptionFa: 'Providerهای عمومی، سرویس‌های موردنیاز برنامه را در دسترس قرار می‌دهند.' },
  { step: 4, nodeEn: 'Application Router', titleFa: 'مسیریاب برنامه', descriptionFa: 'Router مسیر درخواست‌شده را تشخیص می‌دهد.' },
  { step: 5, nodeEn: 'Layout Selection', titleFa: 'انتخاب قالب صفحه', descriptionFa: 'قالب مناسب صفحه (Public / Workspace / Admin) انتخاب می‌شود.' },
  { step: 6, nodeEn: 'Page Composition', titleFa: 'ترکیب صفحه', descriptionFa: 'صفحه، قابلیت‌های موردنیاز را کنار یکدیگر قرار می‌دهد.' },
  { step: 7, nodeEn: 'Feature Modules', titleFa: 'ماژول‌های قابلیت', descriptionFa: 'ماژول قابلیت، منطق اختصاصی خود را اجرا می‌کند.' },
  { step: 8, nodeEn: 'Domain / Platform / Shared', titleFa: 'دامنه، زیرساخت و اجزای مشترک', descriptionFa: 'در صورت نیاز از مدل‌های دامنه، زیرساخت یا اجزای مشترک استفاده می‌کند.' },
  { step: 9, nodeEn: 'API Adapters → Backend Services', titleFa: 'آداپتورهای ارتباطی و سرویس‌های بک‌اند', descriptionFa: 'اطلاعات موردنیاز از مسیر ارتباطی استاندارد دریافت می‌شوند.' },
];

export type RadarFrontendModuleId =
  | 'FE-M01' | 'FE-M02' | 'FE-M03' | 'FE-M04' | 'FE-M05' | 'FE-M06' | 'FE-M07'
  | 'FE-M08' | 'FE-M09' | 'FE-M10' | 'FE-M11' | 'FE-M12' | 'FE-M13';

export interface RadarFrontendModuleSpec {
  id: RadarFrontendModuleId;
  slug: string;
  titleFa: string;
  responsibilityFa: string;
  publicContractName: string;
  ownedCapabilityFa: string;
  allowedContractConsumers: readonly RadarFrontendModuleId[];
}

export const RT_FE_ARCH_13_MODULES: readonly RadarFrontendModuleSpec[] = [
  { id: 'FE-M01', slug: 'geo-map', titleFa: 'نقشه و اطلاعات مکانی', responsibilityFa: 'نمایش نقشه، لایه‌های جغرافیایی و تعامل مکانی', publicContractName: 'GeoMapModuleContract', ownedCapabilityFa: 'نمایش نقشه', allowedContractConsumers: ['FE-M03', 'FE-M05', 'FE-M06', 'FE-M07'] },
  { id: 'FE-M02', slug: 'global-search', titleFa: 'جست‌وجو و کشف', responsibilityFa: 'جست‌وجوی سراسری و فیلتر اطلاعات', publicContractName: 'GlobalSearchModuleContract', ownedCapabilityFa: 'جست‌وجوی سراسری', allowedContractConsumers: ['FE-M01', 'FE-M03', 'FE-M04', 'FE-M05', 'FE-M06', 'FE-M07', 'FE-M08', 'FE-M09', 'FE-M10', 'FE-M11', 'FE-M12', 'FE-M13'] },
  { id: 'FE-M03', slug: 'property-listings', titleFa: 'املاک و آگهی‌ها', responsibilityFa: 'مدیریت و نمایش اطلاعات املاک', publicContractName: 'PropertyModuleContract', ownedCapabilityFa: 'اطلاعات پایه ملک', allowedContractConsumers: ['FE-M04', 'FE-M08', 'FE-M12', 'FE-M13'] },
  { id: 'FE-M04', slug: 'property-valuation', titleFa: 'ارزش‌گذاری', responsibilityFa: 'نمایش برآورد ارزش و تحلیل قیمت', publicContractName: 'PropertyValuationModuleContract', ownedCapabilityFa: 'محاسبه ارزش ملک', allowedContractConsumers: ['FE-M03', 'FE-M08', 'FE-M13'] },
  { id: 'FE-M05', slug: 'neighborhood-intelligence', titleFa: 'هوشمندی محله', responsibilityFa: 'نمایش اطلاعات و شاخص‌های محله', publicContractName: 'NeighborhoodIntelligenceContract', ownedCapabilityFa: 'اطلاعات پایه محله', allowedContractConsumers: ['FE-M01', 'FE-M04', 'FE-M07', 'FE-M08'] },
  { id: 'FE-M06', slug: 'building-intelligence', titleFa: 'هوشمندی ساختمان', responsibilityFa: 'اطلاعات و تحلیل ساختمان و بافت کالبدی', publicContractName: 'BuildingIntelligenceContract', ownedCapabilityFa: 'اطلاعات ساختمان', allowedContractConsumers: ['FE-M04', 'FE-M05'] },
  { id: 'FE-M07', slug: 'urban-mobility', titleFa: 'حمل‌ونقل', responsibilityFa: 'نمایش شبکه و شاخص‌های تحرک شهری', publicContractName: 'UrbanMobilityModuleContract', ownedCapabilityFa: 'داده حمل‌ونقل', allowedContractConsumers: ['FE-M05', 'FE-M13'] },
  { id: 'FE-M08', slug: 'housing-supply-demand', titleFa: 'عرضه و تقاضای مسکن', responsibilityFa: 'تحلیل نیاز سکونتی و تعادل بازار', publicContractName: 'HousingSupplyDemandContract', ownedCapabilityFa: 'تقاضا و عرضه مسکن', allowedContractConsumers: ['FE-M05', 'FE-M13'] },
  { id: 'FE-M09', slug: 'services-marketplace', titleFa: 'بازارگاه خدمات', responsibilityFa: 'معرفی و ارتباط با ارائه‌دهندگان خدمات', publicContractName: 'ServicesMarketplaceContract', ownedCapabilityFa: 'اطلاعات ارائه‌دهندگان خدمات', allowedContractConsumers: ['FE-M10', 'FE-M12'] },
  { id: 'FE-M10', slug: 'user-community', titleFa: 'جامعه کاربران', responsibilityFa: 'مشارکت، نظرات و پیشنهادهای کاربران', publicContractName: 'UserCommunityModuleContract', ownedCapabilityFa: 'مشارکت و بازخورد اجتماعی', allowedContractConsumers: ['FE-M05', 'FE-M09'] },
  { id: 'FE-M11', slug: 'data-governance', titleFa: 'مدیریت و حاکمیت داده', responsibilityFa: 'مدیریت منابع، کیفیت و اعتبار داده‌ها', publicContractName: 'DataGovernanceModuleContract', ownedCapabilityFa: 'منشأ و کیفیت داده', allowedContractConsumers: ['FE-M01', 'FE-M03', 'FE-M04', 'FE-M05', 'FE-M06', 'FE-M07', 'FE-M08', 'FE-M13'] },
  { id: 'FE-M12', slug: 'user-workspace', titleFa: 'ابزارهای شخصی کاربر', responsibilityFa: 'ذخیره، مقایسه، علاقه‌مندی و جست‌وجوهای ذخیره‌شده', publicContractName: 'UserWorkspaceModuleContract', ownedCapabilityFa: 'فضای شخصی و مقایسه‌های ذخیره‌شده', allowedContractConsumers: ['FE-M02', 'FE-M03', 'FE-M05'] },
  { id: 'FE-M13', slug: 'data-visualization', titleFa: 'تحلیل و مصورسازی', responsibilityFa: 'نمودارها، داشبوردها و نمایش داده‌های تحلیلی', publicContractName: 'DataVisualizationContract', ownedCapabilityFa: 'نمودارها و نمایش تحلیلی', allowedContractConsumers: ['FE-M04', 'FE-M05', 'FE-M08'] },
];

export const RT_FE_ARCH_MODULE_INTERNAL_FOLDERS_9: ReadonlyArray<{
  folder: string;
  roleFa: string;
}> = [
  { folder: 'components', roleFa: 'اجزای نمایشی اختصاصی ماژول' },
  { folder: 'pages', roleFa: 'صفحات اختصاصی ماژول در صورت نیاز' },
  { folder: 'application', roleFa: 'اجرای عملیات و جریان‌های کاری ماژول' },
  { folder: 'model', roleFa: 'انواع داده، ساختارها و قواعد اعتبارسنجی' },
  { folder: 'adapters', roleFa: 'تبدیل قراردادهای دریافتی به مدل قابل استفاده در ماژول' },
  { folder: 'hooks', roleFa: 'هوک‌های اختصاصی' },
  { folder: 'config', roleFa: 'تنظیمات اختصاصی' },
  { folder: 'tests', roleFa: 'آزمون‌های همان ماژول' },
  { folder: 'index.ts', roleFa: 'رابط عمومی و رسمی ماژول (تنها نقطه مجاز واردسازی خارجی)' },
];

export const RT_FE_ARCH_OWNERSHIP_MATRIX_11: ReadonlyArray<{
  capabilityFa: string;
  primaryOwnerFa: string;
  consumersFa: string;
}> = [
  { capabilityFa: 'نمایش نقشه', primaryOwnerFa: 'نقشه و اطلاعات مکانی', consumersFa: 'محله، ملک، ساختمان، حمل‌ونقل' },
  { capabilityFa: 'جست‌وجوی سراسری', primaryOwnerFa: 'جست‌وجو و کشف', consumersFa: 'همه ماژول‌های محصول' },
  { capabilityFa: 'اطلاعات پایه ملک', primaryOwnerFa: 'املاک و آگهی‌ها', consumersFa: 'ارزش‌گذاری، تحلیل بازار' },
  { capabilityFa: 'محاسبه ارزش ملک', primaryOwnerFa: 'ارزش‌گذاری', consumersFa: 'صفحه ملک، تحلیل بازار' },
  { capabilityFa: 'اطلاعات پایه محله', primaryOwnerFa: 'هوشمندی محله', consumersFa: 'نقشه، بازار مسکن، حمل‌ونقل' },
  { capabilityFa: 'اطلاعات ساختمان', primaryOwnerFa: 'هوشمندی ساختمان', consumersFa: 'ارزش‌گذاری، محله' },
  { capabilityFa: 'داده حمل‌ونقل', primaryOwnerFa: 'حمل‌ونقل', consumersFa: 'هوشمندی محله، تحلیل شهری' },
  { capabilityFa: 'تقاضا و عرضه مسکن', primaryOwnerFa: 'تحلیل عرضه و تقاضا', consumersFa: 'بازار و محله' },
  { capabilityFa: 'اطلاعات ارائه‌دهندگان خدمات', primaryOwnerFa: 'بازارگاه خدمات', consumersFa: 'پروفایل و جامعه کاربران' },
  { capabilityFa: 'هویت و نقش کاربر', primaryOwnerFa: 'زیرساخت احراز هویت و مجوزها', consumersFa: 'همه ماژول‌ها' },
  { capabilityFa: 'منشأ و کیفیت داده', primaryOwnerFa: 'حاکمیت داده', consumersFa: 'همه بخش‌های نمایش اطلاعات' },
];

export interface PropertySummary {
  id: string;
  title: string;
  propertyType: string;
  neighborhoodId: string;
  area: number | null;
}

export interface PropertyModuleContract {
  readonly contractName: 'PropertyModuleContract';
  readonly contractVersion: '1.0.0';
  getPropertyById(propertyId: string): Promise<PropertySummary | null>;
  getPropertySummary(propertyId: string): Promise<PropertySummary>;
}

export const RT_FE_ARCH_STATE_GOVERNANCE_8: ReadonlyArray<{
  stateTypeFa: string;
  storageLocationId: string;
  storageLocationFa: string;
}> = [
  { stateTypeFa: 'باز و بسته بودن منو', storageLocationId: 'component_local', storageLocationFa: 'وضعیت محلی کامپوننت' },
  { stateTypeFa: 'فیلترهای قابل اشتراک‌گذاری', storageLocationId: 'url_query_params', storageLocationFa: 'URL و Query Parameters' },
  { stateTypeFa: 'اطلاعات دریافتی از سرور', storageLocationId: 'server_query_cache', storageLocationFa: 'لایه داده و کش درخواست‌ها' },
  { stateTypeFa: 'نشست و هویت کاربر', storageLocationId: 'auth_platform', storageLocationFa: 'زیرساخت احراز هویت' },
  { stateTypeFa: 'تنظیمات نمایشی کاربر', storageLocationId: 'sensitivity_aware_storage', storageLocationFa: 'ذخیره‌سازی متناسب با حساسیت داده' },
  { stateTypeFa: 'اطلاعات موقت فرم', storageLocationId: 'form_local', storageLocationFa: 'وضعیت محلی فرم' },
  { stateTypeFa: 'وضعیت نقشه و محدوده نمایش', storageLocationId: 'map_module', storageLocationFa: 'ماژول نقشه' },
  { stateTypeFa: 'وضعیت چندماژولی و سراسری', storageLocationId: 'shared_global_minimal', storageLocationFa: 'مدیریت وضعیت مشترک، فقط در صورت نیاز' },
];

export const RT_FE_ARCH_REQUIREMENTS_10: ReadonlyArray<{
  id: string;
  requirementFa: string;
  acceptanceCriteriaFa: string;
}> = [
  { id: 'ARCH-001', requirementFa: 'معماری یکپارچه ماژولار', acceptanceCriteriaFa: 'مرز مشخص میان ماژول‌ها وجود داشته باشد' },
  { id: 'ARCH-002', requirementFa: 'جداسازی لایه‌ها', acceptanceCriteriaFa: 'صفحات، قابلیت‌ها، دامنه و زیرساخت مسئولیت مجزا داشته باشند' },
  { id: 'ARCH-003', requirementFa: 'رابط عمومی ماژول‌ها', acceptanceCriteriaFa: 'دسترسی خارجی فقط از مسیر API عمومی هر ماژول انجام شود' },
  { id: 'ARCH-004', requirementFa: 'کنترل وابستگی', acceptanceCriteriaFa: 'وابستگی چرخه‌ای وجود نداشته باشد' },
  { id: 'ARCH-005', requirementFa: 'مالکیت داده', acceptanceCriteriaFa: 'مالک اصلی هر موجودیت مشخص باشد' },
  { id: 'ARCH-006', requirementFa: 'جداسازی منطق از UI', acceptanceCriteriaFa: 'منطق کاربردی در کامپوننت نمایشی انباشته نشود' },
  { id: 'ARCH-007', requirementFa: 'استقلال ماژول‌ها', acceptanceCriteriaFa: 'آزمون مستقل هر ماژول ممکن باشد' },
  { id: 'ARCH-008', requirementFa: 'توسعه تدریجی', acceptanceCriteriaFa: 'افزودن ماژول جدید نیازمند بازنویسی هسته برنامه نباشد' },
  { id: 'ARCH-009', requirementFa: 'مدیریت خطا', acceptanceCriteriaFa: 'خطای یک ماژول تا حد امکان سایر ماژول‌ها را از کار نیندازد' },
  { id: 'ARCH-010', requirementFa: 'سازگاری با پروژه فعلی', acceptanceCriteriaFa: 'معماری جدید امکان انتقال تدریجی کدهای موجود را فراهم کند' },
];

export const RT_FE_ARCH_DELIVERABLES_10: ReadonlyArray<{
  id: string;
  titleFa: string;
}> = [
  { id: 'OUT-01', titleFa: 'نمودار کلان معماری فرانت‌اند' },
  { id: 'OUT-02', titleFa: 'نمودار شش لایه و روابط میان آن‌ها' },
  { id: 'OUT-03', titleFa: 'فهرست ۱۳ ماژول و شرح مسئولیت هرکدام' },
  { id: 'OUT-04', titleFa: 'نمودار وابستگی مجاز میان ماژول‌ها' },
  { id: 'OUT-05', titleFa: 'ساختار نهایی پوشه‌ها و فایل‌های پایه' },
  { id: 'OUT-06', titleFa: 'قرارداد رابط عمومی ماژول‌ها' },
  { id: 'OUT-07', titleFa: 'جدول مالکیت موجودیت‌ها و داده‌ها' },
  { id: 'OUT-08', titleFa: 'قواعد مدیریت وضعیت' },
  { id: 'OUT-09', titleFa: 'استانداردهای نام‌گذاری و توسعه' },
  { id: 'OUT-10', titleFa: 'معیارهای پذیرش معماری' },
];
