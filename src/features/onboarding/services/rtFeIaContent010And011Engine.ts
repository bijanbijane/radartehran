/**
 * Stages 10 & 11 — Tehran Radar Comprehensive Frontend Roadmap
 * Spec IDs: RT-FE-PAGE-TEMPLATES-010 & RT-FE-INFORMATION-ARCHITECTURE-011
 * Page Templates & Information Architecture / Content Structure (IA-001..IA-031, 57 Entities,
 * 16 Information Domains, Persian Search Normalization, Conflict Resolution & IA-OUT-001..035)
 */

export const RT_FE_PAGE_TEMPLATES_010_SPEC_ID = 'RT-FE-PAGE-TEMPLATES-010' as const;
export const RT_FE_INFORMATION_ARCHITECTURE_011_SPEC_ID = 'RT-FE-INFORMATION-ARCHITECTURE-011' as const;

export const RT_FE_STAGE10_PAGE_TEMPLATES_10 = [
  { id: 'TPL-01', nameEn: 'HomePageTemplate', titleFa: 'الگوی صفحه اصلی و درگاه تصمیم‌گیری رادار', routePattern: '/' },
  { id: 'TPL-02', nameEn: 'GlobalSearchTemplate', titleFa: 'الگوی صفحه جست‌وجوی چندبعدی و Faceted', routePattern: '/search' },
  { id: 'TPL-03', nameEn: 'PropertyListingTemplate', titleFa: 'الگوی فهرست املاک و آگهی‌های بازار', routePattern: '/properties' },
  { id: 'TPL-04', nameEn: 'PropertyProfileTemplate', titleFa: 'الگوی شناسنامه ۱۰بخشی ملک (IA-008)', routePattern: '/properties/:propertySlug' },
  { id: 'TPL-05', nameEn: 'NeighborhoodProfileTemplate', titleFa: 'الگوی شناسنامه ۱۵بخشی محله (IA-010)', routePattern: '/neighborhoods/:neighborhoodSlug' },
  { id: 'TPL-06', nameEn: 'InteractiveMapTemplate', titleFa: 'الگوی صفحه کاوش نقشه و لایه‌های مکانی', routePattern: '/map' },
  { id: 'TPL-07', nameEn: 'AnalyticalDashboardTemplate', titleFa: 'الگوی داشبوردهای تحلیلی و شاخص‌های بازار', routePattern: '/analytics' },
  { id: 'TPL-08', nameEn: 'ResearchReportTemplate', titleFa: 'الگوی گزارش‌های تخصصی و یافته‌های پژوهشی (IA-019)', routePattern: '/reports/:reportId' },
  { id: 'TPL-09', nameEn: 'UserWorkspaceTemplate', titleFa: 'الگوی صفحات حساب کاربری و محیط کار حرفه‌ای', routePattern: '/workspace' },
  { id: 'TPL-10', nameEn: 'AdminGovernanceTemplate', titleFa: 'الگوی محیط مدیریت، ممیزی داده و رجیستری', routePattern: '/admin' },
] as const;

export const RT_FE_IA011_16_CLASSIFICATIONS = [
  { index: 1, code: '01. GEOGRAPHIC INFORMATION', titleFa: 'اطلاعات جغرافیایی (کشور تا محله، پهنه‌ها و عوارض)' },
  { index: 2, code: '02. PROPERTY INFORMATION', titleFa: 'اطلاعات ملکی (مسکونی، تجاری، اداری، زمین، ویژگی‌های فیزیکی)' },
  { index: 3, code: '03. BUILDING INFORMATION', titleFa: 'اطلاعات ساختمانی (سال ساخت، طبقات، سازه، نما، سوابق)' },
  { index: 4, code: '04. LAND & PARCEL INFORMATION', titleFa: 'اطلاعات قطعه زمین و تفکیک عرصه' },
  { index: 5, code: '05. REAL ESTATE MARKET INFORMATION', titleFa: 'اطلاعات بازار مسکن (قیمت پیشنهادی، معامله، ارزش تخمینی، نقدشوندگی)' },
  { index: 6, code: '06. TRANSACTION INFORMATION', titleFa: 'اطلاعات معاملات ثبت‌شده و اجاره‌نامه‌ها' },
  { index: 7, code: '07. URBAN & INFRASTRUCTURE INFORMATION', titleFa: 'اطلاعات شهری و زیرساخت (کاربری، تراکم، معابر، حمل‌ونقل)' },
  { index: 8, code: '08. DEMOGRAPHIC & SOCIAL INFORMATION', titleFa: 'اطلاعات جمعیتی و ساختار اجتماعی محله‌ها' },
  { index: 9, code: '09. ENVIRONMENTAL INFORMATION', titleFa: 'اطلاعات محیط‌زیستی (کیفیت هوا، فضای سبز، صوت، اقلیم)' },
  { index: 10, code: '10. ECONOMIC INFORMATION', titleFa: 'اطلاعات اقتصادی و فعالیت‌های کسب‌وکار شهری' },
  { index: 11, code: '11. SERVICE & BUSINESS INFORMATION', titleFa: 'اطلاعات خدمات تخصصی و ارائه‌دهندگان معتبر' },
  { index: 12, code: '12. USER-GENERATED INFORMATION', titleFa: 'اطلاعات مشارکت کاربران (پیشنهاد اصلاح، گزارش خطا، ارزیابی)' },
  { index: 13, code: '13. RESEARCH & ANALYTICAL INFORMATION', titleFa: 'اطلاعات پژوهشی، مدل‌های تحلیلی و یافته‌ها' },
  { index: 14, code: '14. REPORT & DOCUMENT INFORMATION', titleFa: 'اطلاعات گزارش‌های رسمی و اسناد مرجع' },
  { index: 15, code: '15. DATA GOVERNANCE INFORMATION', titleFa: 'اطلاعات حاکمیت داده (منشأ، نسخه، کیفیت، مجوز انتشار)' },
  { index: 16, code: '16. SYSTEM & OPERATIONAL INFORMATION', titleFa: 'اطلاعات سیستمی و عملیاتی پلتفرم' },
] as const;

export interface Ia011TaxonomyEntitySpec {
  id: string;
  group: 'GEO' | 'RE' | 'BLD' | 'MKT' | 'SRV' | 'RSC';
  nameEn: string;
  titleFa: string;
}

export const RT_FE_IA011_57_ENTITIES: readonly Ia011TaxonomyEntitySpec[] = [
  { id: 'GEO-001', group: 'GEO', nameEn: 'Country', titleFa: 'کشور' },
  { id: 'GEO-002', group: 'GEO', nameEn: 'Province', titleFa: 'استان' },
  { id: 'GEO-003', group: 'GEO', nameEn: 'County', titleFa: 'شهرستان' },
  { id: 'GEO-004', group: 'GEO', nameEn: 'City', titleFa: 'شهر' },
  { id: 'GEO-005', group: 'GEO', nameEn: 'Urban District', titleFa: 'منطقه شهری' },
  { id: 'GEO-006', group: 'GEO', nameEn: 'Urban Zone', titleFa: 'ناحیه' },
  { id: 'GEO-007', group: 'GEO', nameEn: 'Neighborhood', titleFa: 'محله' },
  { id: 'GEO-008', group: 'GEO', nameEn: 'Statistical Area', titleFa: 'محدوده آماری' },
  { id: 'GEO-009', group: 'GEO', nameEn: 'Urban Boundary', titleFa: 'مرز شهری' },
  { id: 'GEO-010', group: 'GEO', nameEn: 'Land Use Zone', titleFa: 'پهنه کاربری' },
  { id: 'GEO-011', group: 'GEO', nameEn: 'Road', titleFa: 'معبر' },
  { id: 'GEO-012', group: 'GEO', nameEn: 'Place', titleFa: 'مکان' },
  { id: 'GEO-013', group: 'GEO', nameEn: 'Point of Interest', titleFa: 'نقطه موردعلاقه' },
  { id: 'GEO-014', group: 'GEO', nameEn: 'Service Area', titleFa: 'محدوده خدماتی' },
  { id: 'RE-001', group: 'RE', nameEn: 'Property', titleFa: 'ملک' },
  { id: 'RE-002', group: 'RE', nameEn: 'Property Unit', titleFa: 'واحد ملکی' },
  { id: 'RE-003', group: 'RE', nameEn: 'Land Parcel', titleFa: 'قطعه زمین' },
  { id: 'RE-004', group: 'RE', nameEn: 'Property Listing', titleFa: 'آگهی ملک' },
  { id: 'RE-005', group: 'RE', nameEn: 'Property Valuation', titleFa: 'ارزش‌گذاری' },
  { id: 'RE-006', group: 'RE', nameEn: 'Property Feature', titleFa: 'ویژگی ملک' },
  { id: 'RE-007', group: 'RE', nameEn: 'Property Media', titleFa: 'رسانه ملک' },
  { id: 'RE-008', group: 'RE', nameEn: 'Property History', titleFa: 'تاریخچه ملک' },
  { id: 'RE-009', group: 'RE', nameEn: 'Property Ownership Record', titleFa: 'رکورد مالکیت مجاز' },
  { id: 'RE-010', group: 'RE', nameEn: 'Property Comparable', titleFa: 'ملک قابل مقایسه' },
  { id: 'BLD-001', group: 'BLD', nameEn: 'Building', titleFa: 'ساختمان' },
  { id: 'BLD-002', group: 'BLD', nameEn: 'Building Unit', titleFa: 'واحد ساختمان' },
  { id: 'BLD-003', group: 'BLD', nameEn: 'Building Structure', titleFa: 'ساختار سازه' },
  { id: 'BLD-004', group: 'BLD', nameEn: 'Building Facility', titleFa: 'امکانات' },
  { id: 'BLD-005', group: 'BLD', nameEn: 'Building Permit', titleFa: 'مجوز ساخت' },
  { id: 'BLD-006', group: 'BLD', nameEn: 'Construction Project', titleFa: 'پروژه ساختمانی' },
  { id: 'BLD-007', group: 'BLD', nameEn: 'Construction Event', titleFa: 'رویداد ساخت‌وساز' },
  { id: 'BLD-008', group: 'BLD', nameEn: 'Building Condition', titleFa: 'وضعیت کالبدی' },
  { id: 'MKT-001', group: 'MKT', nameEn: 'Market Snapshot', titleFa: 'تصویر مقطعی بازار' },
  { id: 'MKT-002', group: 'MKT', nameEn: 'Price Observation', titleFa: 'مشاهده قیمت' },
  { id: 'MKT-003', group: 'MKT', nameEn: 'Rental Observation', titleFa: 'مشاهده اجاره' },
  { id: 'MKT-004', group: 'MKT', nameEn: 'Transaction', titleFa: 'معامله' },
  { id: 'MKT-005', group: 'MKT', nameEn: 'Supply Record', titleFa: 'رکورد عرضه' },
  { id: 'MKT-006', group: 'MKT', nameEn: 'Demand Record', titleFa: 'رکورد تقاضا' },
  { id: 'MKT-007', group: 'MKT', nameEn: 'Market Indicator', titleFa: 'شاخص بازار' },
  { id: 'MKT-008', group: 'MKT', nameEn: 'Market Segment', titleFa: 'بخش بازار' },
  { id: 'MKT-009', group: 'MKT', nameEn: 'Market Trend', titleFa: 'روند بازار' },
  { id: 'MKT-010', group: 'MKT', nameEn: 'Comparable Set', titleFa: 'مجموعه املاک قابل مقایسه' },
  { id: 'SRV-001', group: 'SRV', nameEn: 'Service Provider', titleFa: 'ارائه‌دهنده خدمت' },
  { id: 'SRV-002', group: 'SRV', nameEn: 'Service', titleFa: 'خدمت' },
  { id: 'SRV-003', group: 'SRV', nameEn: 'Business', titleFa: 'کسب‌وکار' },
  { id: 'SRV-004', group: 'SRV', nameEn: 'Service Category', titleFa: 'دسته خدمت' },
  { id: 'SRV-005', group: 'SRV', nameEn: 'Professional Credential', titleFa: 'مدرک یا صلاحیت حرفه‌ای' },
  { id: 'SRV-006', group: 'SRV', nameEn: 'Service Review', titleFa: 'ارزیابی کاربران' },
  { id: 'SRV-007', group: 'SRV', nameEn: 'Service Coverage', titleFa: 'محدوده ارائه خدمت' },
  { id: 'RSC-001', group: 'RSC', nameEn: 'Research Project', titleFa: 'پروژه پژوهشی' },
  { id: 'RSC-002', group: 'RSC', nameEn: 'Research Question', titleFa: 'پرسش پژوهش' },
  { id: 'RSC-003', group: 'RSC', nameEn: 'Research Dataset', titleFa: 'مجموعه داده' },
  { id: 'RSC-004', group: 'RSC', nameEn: 'Research Finding', titleFa: 'یافته پژوهشی' },
  { id: 'RSC-005', group: 'RSC', nameEn: 'Methodology', titleFa: 'روش‌شناسی' },
  { id: 'RSC-006', group: 'RSC', nameEn: 'Research Report', titleFa: 'گزارش پژوهشی' },
  { id: 'RSC-007', group: 'RSC', nameEn: 'Analytical Model', titleFa: 'مدل تحلیلی' },
  { id: 'RSC-008', group: 'RSC', nameEn: 'Model Version', titleFa: 'نسخه مدل' },
] as const;

export const RT_FE_IA011_MISSING_DATA_STATES_8 = [
  'AVAILABLE',
  'NOT_COLLECTED',
  'NOT_PROVIDED',
  'NOT_APPLICABLE',
  'UNVERIFIED',
  'EXPIRED',
  'RESTRICTED',
  'UNDER_REVIEW',
] as const;

export const RT_FE_IA011_CENTRAL_REGISTRIES_10 = [
  'ENTITY REGISTRY',
  'ATTRIBUTE REGISTRY',
  'RELATION REGISTRY',
  'TAXONOMY REGISTRY',
  'VOCABULARY REGISTRY',
  'INDICATOR REGISTRY',
  'SOURCE REGISTRY',
  'CONTENT TYPE REGISTRY',
  'PAGE CONTENT REGISTRY',
  'GEO INFORMATION REGISTRY',
] as const;

export const RT_FE_IA011_VISIBILITY_5 = [
  'PUBLIC',
  'AUTHENTICATED',
  'PROFESSIONAL',
  'ADMINISTRATIVE',
  'RESTRICTED',
] as const;

export const RT_FE_IA011_DELIVERABLES_35 = Array.from({ length: 35 }, (_, idx) => {
  const num = String(idx + 1).padStart(3, '0');
  const titles = [
    'منشور معماری اطلاعات', 'طبقه‌بندی کلان ۱۶گانه اطلاعات', 'Entity Taxonomy (۵۷ موجودیت)', 'Entity Identity Standard',
    'Entity Relationship Model', 'Attribute Registry', 'Attribute Definition Standard', 'Property Content Model (۱۰ بخش)',
    'Building Content Model (۱۱ بخش)', 'Neighborhood Content Model (۱۵ بخش)', 'Taxonomy Registry', 'Controlled Vocabulary',
    'Geographic Information Architecture', 'Geographic Boundary Model', 'Temporal Information Model (۱۰ نوع زمان)', 'Data Provenance Model',
    'Data Quality Model (۶ محور مستقل)', 'Content Navigation Architecture', 'Searchable Content Architecture', 'Faceted Search Model',
    'Analytical Indicator Registry', 'Research & Report Content Model', 'User-Generated Content Model', 'Source & Document Registry',
    'Content URL Architecture', 'Localization & Persian Content Standard', 'Information Priority Model (P1..P4)', 'Missing & Conflicting Information Model',
    'Design System Integration Contract', 'Information Registry Architecture (۱۰ رجیستری)', 'Frontend Registry Consumption Contract', 'Information Versioning Policy',
    'Content Visibility & Privacy Model', 'Information Architecture Documentation', 'Information Architecture Test Specification',
  ];
  return { id: `IA-OUT-${num}`, titleFa: titles[idx] ?? `خروجی ${num}` };
});

/**
 * Normalizes Persian search queries (ی/ي, ک/ك, Persian/Arabic digits, ZWNJ) without mutating raw source text (IA-016 §19.3).
 */
export function normalizePersianSearchQuery(rawQuery: string): {
  rawPreserved: string;
  normalizedQuery: string;
  detectedIntent: 'entity_id' | 'geographic_or_term';
} {
  const rawPreserved = rawQuery;
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  let normalized = rawQuery
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c+/g, ' ')
    .replace(/[۰-۹]/g, (d) => String(persianDigits.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim();

  const detectedIntent = /^(PR|BLD|GEO|RE|MKT|LST)-\d+/i.test(normalized) ? 'entity_id' : 'geographic_or_term';
  return { rawPreserved, normalizedQuery: normalized, detectedIntent };
}

export interface AttributeObservationSample {
  sourceId: string;
  sourceTrustRank: number;
  observedAtIso: string;
  value: number;
  verified: boolean;
}

/**
 * Preserves all conflicting observations and resolves reference value only when policy criteria are met (IA-025 §28.3).
 */
export function resolveConflictingAttributeObservations(observations: readonly AttributeObservationSample[]): {
  hasConflict: boolean;
  preservedCount: number;
  referenceValue: number | null;
  resolutionStatus: 'SINGLE_TRUTH' | 'RESOLVED_BY_VERIFIED_SOURCE' | 'UNRESOLVED_CONFLICT';
} {
  const uniqueVals = new Set(observations.map((o) => o.value));
  const hasConflict = uniqueVals.size > 1;
  if (!hasConflict) {
    return {
      hasConflict: false,
      preservedCount: observations.length,
      referenceValue: observations[0]?.value ?? null,
      resolutionStatus: 'SINGLE_TRUTH',
    };
  }
  const verifiedSorted = [...observations].filter((o) => o.verified).sort((a, b) => b.sourceTrustRank - a.sourceTrustRank);
  if (verifiedSorted.length > 0) {
    return {
      hasConflict: true,
      preservedCount: observations.length,
      referenceValue: verifiedSorted[0].value,
      resolutionStatus: 'RESOLVED_BY_VERIFIED_SOURCE',
    };
  }
  return {
    hasConflict: true,
    preservedCount: observations.length,
    referenceValue: null,
    resolutionStatus: 'UNRESOLVED_CONFLICT',
  };
}
