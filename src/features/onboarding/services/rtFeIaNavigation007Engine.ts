/**
 * RT-FE-IA-NAVIGATION-007 & RT-FE-INFORMATION-ARCHITECTURE-007: مرحله هفتم — معماری اطلاعات،
 * فهرست ۲۰ موجودیت اصلی (ENT-001..ENT-020)، نقشه سایت، ناوبری چندسطحی، مسیرهای دسترسی و صفحات مرجع (Canonical Pages)
 */

export const RT_FE_IA_NAVIGATION_007_SPEC_ID = 'RT-FE-IA-NAVIGATION-007' as const;
export const RT_FE_INFORMATION_ARCHITECTURE_007_SPEC_ID = 'RT-FE-INFORMATION-ARCHITECTURE-007' as const;

export type RadarRouteDomain =
  | 'home'
  | 'geography'
  | 'property'
  | 'valuation'
  | 'neighborhood'
  | 'building'
  | 'mobility'
  | 'market'
  | 'services'
  | 'community'
  | 'account'
  | 'admin';

export type RadarRouteLayoutTemplate =
  | 'dashboard'
  | 'listing'
  | 'detail'
  | 'analytics'
  | 'map'
  | 'form'
  | 'workspace'
  | 'admin';

export interface RadarRouteMeta {
  id: string;
  path: string;
  title: string;
  domain: RadarRouteDomain;
  layout: RadarRouteLayoutTemplate;
  requiresAuth?: boolean;
  allowedRoles?: readonly string[];
  showInMainNav?: boolean;
}

export interface EntityReference {
  entityCode: string;
  entityType: string;
  entityId: string;
  displayName: string;
  canonicalPath: string;
}

export interface RelatedEntityLink {
  entityType: string;
  entityId: string;
  title: string;
  relationshipType: string;
  href: string;
}

export interface DomainModuleDefinition {
  id: string;
  title: string;
  description?: string;
  entities: readonly string[];
  routes: readonly string[];
  navigationGroup?: string;
  relatedDomains?: readonly string[];
  visibility: 'public' | 'authenticated' | 'admin';
}

export const RT_FE_IA_20_ENTITIES: readonly EntityReference[] = [
  { entityCode: 'ENT-001', entityType: 'country', entityId: 'IR', displayName: 'کشور (ایران)', canonicalPath: '/cities' },
  { entityCode: 'ENT-002', entityType: 'province', entityId: 'THR', displayName: 'استان (تهران)', canonicalPath: '/cities/tehran' },
  { entityCode: 'ENT-003', entityType: 'city', entityId: 'tehran', displayName: 'شهر (تهران)', canonicalPath: '/cities/tehran' },
  { entityCode: 'ENT-004', entityType: 'region', entityId: 'region-2', displayName: 'منطقه (منطقه ۲)', canonicalPath: '/geography/regions/2' },
  { entityCode: 'ENT-005', entityType: 'subdistrict', entityId: 'zone-2-1', displayName: 'ناحیه شهری', canonicalPath: '/geography/boundaries' },
  { entityCode: 'ENT-006', entityType: 'neighborhood', entityId: 'saadat-abad', displayName: 'محله (سعادت‌آباد)', canonicalPath: '/neighborhoods/saadat-abad' },
  { entityCode: 'ENT-007', entityType: 'geo_boundary', entityId: 'stat-block-204', displayName: 'محدوده جغرافیایی / آماری', canonicalPath: '/geography/boundaries' },
  { entityCode: 'ENT-008', entityType: 'property', entityId: 'PR-1024', displayName: 'ملک (واحد مسکونی)', canonicalPath: '/properties/PR-1024' },
  { entityCode: 'ENT-009', entityType: 'building', entityId: 'BLD-408', displayName: 'ساختمان چندواحدی', canonicalPath: '/buildings/BLD-408' },
  { entityCode: 'ENT-010', entityType: 'building_unit', entityId: 'UNIT-408-3', displayName: 'واحد ساختمانی شماره‌دار', canonicalPath: '/properties/PR-1024' },
  { entityCode: 'ENT-011', entityType: 'land_parcel', entityId: 'LND-770', displayName: 'زمین / قطعه زمین', canonicalPath: '/properties/land' },
  { entityCode: 'ENT-012', entityType: 'listing', entityId: 'LST-9901', displayName: 'آگهی فروش / اجاره', canonicalPath: '/listings/LST-9901' },
  { entityCode: 'ENT-013', entityType: 'transaction', entityId: 'TRX-8821', displayName: 'معامله ثبت‌شده', canonicalPath: '/market/transactions' },
  { entityCode: 'ENT-014', entityType: 'user', entityId: 'USR-101', displayName: 'کاربر (حساب کاربری)', canonicalPath: '/account/profile' },
  { entityCode: 'ENT-015', entityType: 'expert', entityId: 'EXP-302', displayName: 'متخصص / کارشناس', canonicalPath: '/services/providers' },
  { entityCode: 'ENT-016', entityType: 'service', entityId: 'SRV-501', displayName: 'خدمت ساختمانی / ملکی', canonicalPath: '/services/SRV-501' },
  { entityCode: 'ENT-017', entityType: 'business', entityId: 'BIZ-604', displayName: 'کسب‌وکار / مرکز خدماتی', canonicalPath: '/services/providers' },
  { entityCode: 'ENT-018', entityType: 'data_source', entityId: 'SRC-official', displayName: 'منبع داده اطلاعاتی', canonicalPath: '/data/sources' },
  { entityCode: 'ENT-019', entityType: 'indicator', entityId: 'IND-price-sqm', displayName: 'شاخص قیمت / شهری', canonicalPath: '/data/indicators' },
  { entityCode: 'ENT-020', entityType: 'report', entityId: 'RPT-2026-q3', displayName: 'گزارش تحلیلی', canonicalPath: '/analytics/housing' },
];

export const RT_FE_IA_NAV_USER_QUESTIONS_9: readonly { questionFa: string; domainFa: string; primaryPath: string }[] = [
  { questionFa: 'چه ملکی وجود دارد؟', domainFa: 'بازار املاک', primaryPath: '/properties' },
  { questionFa: 'این ملک چقدر می‌ارزد؟', domainFa: 'ارزش‌گذاری', primaryPath: '/valuation' },
  { questionFa: 'این محله چگونه است؟', domainFa: 'شناخت محله', primaryPath: '/neighborhoods/saadat-abad' },
  { questionFa: 'این ساختمان چه وضعیتی دارد؟', domainFa: 'اطلاعات ساختمان', primaryPath: '/buildings' },
  { questionFa: 'دسترسی این نقطه چگونه است؟', domainFa: 'حمل‌ونقل', primaryPath: '/mobility' },
  { questionFa: 'بازار در چه وضعیتی است؟', domainFa: 'تحلیل بازار', primaryPath: '/market' },
  { questionFa: 'چه خدماتی در دسترس است؟', domainFa: 'خدمات', primaryPath: '/services' },
  { questionFa: 'داده‌ها از کجا آمده‌اند؟', domainFa: 'شفافیت و منابع', primaryPath: '/data/methodology' },
  { questionFa: 'من چه چیزهایی ذخیره یا ثبت کرده‌ام؟', domainFa: 'حساب کاربری', primaryPath: '/account' },
];

export const RT_FE_IA_NAV_12_DOMAINS: readonly {
  index: number;
  domainKey: RadarRouteDomain;
  titleFa: string;
  subItemsFa: readonly string[];
}[] = [
  { index: 1, domainKey: 'home', titleFa: 'خانه و کشف اطلاعات', subItemsFa: ['جست‌وجوی سراسری', 'شاخص‌های لحظه‌ای بازار', 'ورودی سریع نقشه و محله‌ها'] },
  { index: 2, domainKey: 'property', titleFa: 'املاک و معاملات', subItemsFa: ['خرید ملک', 'اجاره ملک', 'فهرست املاک', 'معاملات ثبت‌شده', 'شناسنامه ملک'] },
  { index: 3, domainKey: 'geography', titleFa: 'شهرها و جغرافیا', subItemsFa: ['کشور/استان/شهر/منطقه/ناحیه/محله', 'نقشه پایه و لایه‌ها', 'محدوده‌های اداری/آماری/تحلیلی'] },
  { index: 4, domainKey: 'neighborhood', titleFa: 'محله‌ها و محیط شهری', subItemsFa: ['شناسنامه محله', 'اقتصاد محله', 'خدمات محله', 'محیط زیست', 'حمل‌ونقل و مقایسه'] },
  { index: 5, domainKey: 'building', titleFa: 'ساختمان‌ها و زیرساخت کالبدی', subItemsFa: ['شناسنامه ساختمان', 'مشخصات کالبدی', 'کاربری', 'وضعیت ساخت‌وساز و نوسازی'] },
  { index: 6, domainKey: 'market', titleFa: 'بازار و اقتصاد مسکن', subItemsFa: ['قیمت (مشاهده‌شده / برآورد آماری / خروجی مدل)', 'عرضه', 'تقاضا', 'معاملات و نقدشوندگی'] },
  { index: 7, domainKey: 'valuation', titleFa: 'تحلیل‌ها و پژوهش‌ها', subItemsFa: ['تحلیل مسکن (/analytics/housing)', 'تحلیل شهری (/analytics/urban)', 'مقایسه تطبیقی'] },
  { index: 8, domainKey: 'services', titleFa: 'خدمات و متخصصان', subItemsFa: ['دسته‌بندی خدمات', 'ارائه‌دهندگان خدمات', 'درخواست خدمت'] },
  { index: 9, domainKey: 'mobility', titleFa: 'داده‌ها، منابع و تحرک شهری', subItemsFa: ['منابع داده (/data/sources)', 'روش‌شناسی (/data/methodology)', 'شاخص‌ها (/data/indicators)'] },
  { index: 10, domainKey: 'community', titleFa: 'مشارکت و جامعه کاربران', subItemsFa: ['ثبت تجربه محله', 'گزارش خطای داده', 'پیشنهاد تکمیل اطلاعات'] },
  { index: 11, domainKey: 'account', titleFa: 'حساب کاربری', subItemsFa: ['پروفایل', 'ذخیره‌ها', 'تاریخچه و آگهی‌های من'] },
  { index: 12, domainKey: 'admin', titleFa: 'مدیریت و عملیات', subItemsFa: ['داشبورد', 'کاربران', 'آگهی‌ها', 'مدیریت داده و عملیات'] },
];

export const RT_FE_IA_NAV_5_LEVELS: readonly { code: string; level: number; nameEn: string; titleFa: string; examplesFa: readonly string[] }[] = [
  { code: 'NAV-001', level: 1, nameEn: 'Primary / Global Navigation', titleFa: 'ناوبری اصلی (ورودی‌های کلان کنترل‌شده)', examplesFa: ['خانه', 'املاک', 'نقشه و جغرافیا', 'محله‌ها', 'ساختمان‌ها', 'بازار', 'تحلیل‌ها', 'خدمات'] },
  { code: 'NAV-002', level: 2, nameEn: 'Secondary / Domain Navigation', titleFa: 'ناوبری ثانویه (دسته‌بندی‌های داخلی هر حوزه)', examplesFa: ['قیمت', 'عرضه', 'تقاضا', 'معاملات', 'نقدشوندگی'] },
  { code: 'NAV-003', level: 3, nameEn: 'Entity Navigation', titleFa: 'ناوبری موجودیت (تب‌های صفحه مرجع محله یا ملک)', examplesFa: ['اطلاعات عمومی', 'بازار مسکن', 'ساختمان‌ها', 'خدمات', 'جمعیت', 'حمل‌ونقل'] },
  { code: 'NAV-004', level: 4, nameEn: 'Contextual Cross-Entity Links', titleFa: 'پیوندهای زمینه‌ای و دسترسی متقاطع (IA-010)', examplesFa: ['ملک واقع در محله ← ساختمان شامل واحد ← آگهی مربوط به ملک ← شاخص مرتبط با شهر'] },
  { code: 'NAV-005', level: 5, nameEn: 'Utility & Discovery Navigation', titleFa: 'ناوبری ابزاری و کشف اطلاعات (IA-015)', examplesFa: ['جست‌وجوی سراسری ۸دسته‌ای', 'محله‌های مشابه', 'شاخص‌های پرکاربرد', 'مقایسه پیشنهادی'] },
];

export const RT_FE_IA_NAV_JOURNEYS_6: readonly { id: string; titleFa: string; stepsFa: readonly string[] }[] = [
  { id: 'JOURNEY-001', titleFa: 'کاربر متقاضی خرید یا اجاره ملک', stepsFa: ['HOME', 'PROPERTY SEARCH', 'FILTERS', 'PROPERTY RESULTS', 'PROPERTY PROFILE (Building / Neighborhood / Price History / Map)'] },
  { id: 'JOURNEY-002', titleFa: 'کاربر علاقه‌مند به شناخت محله', stepsFa: ['HOME', 'CITY', 'NEIGHBORHOOD DISCOVERY', 'NEIGHBORHOOD PROFILE (Demographics / Buildings / Services / Mobility / Market)'] },
  { id: 'JOURNEY-003', titleFa: 'ارزش‌گذاری و تحلیل قیمت ملک', stepsFa: ['VALUATION ENTRY', 'PROPERTY SPECS', 'ESTIMATED RANGE (Observed vs Statistical vs Model Output)'] },
  { id: 'JOURNEY-004', titleFa: 'کاربر پژوهشگر بازار', stepsFa: ['HOME', 'MARKET ANALYTICS', 'SELECT CITY & NEIGHBORHOOD', 'SELECT TIME RANGE', 'ANALYSIS (Price / Supply / Demand / Transactions)'] },
  { id: 'JOURNEY-005', titleFa: 'کاربر مشارکت‌کننده داده', stepsFa: ['ENTITY PROFILE', 'REPORT DATA ISSUE', 'SELECT ISSUE TYPE', 'SUBMIT EVIDENCE', 'REVIEW & STATUS TRACKING'] },
  { id: 'JOURNEY-006', titleFa: 'مدیر داده و سامانه', stepsFa: ['ADMIN DASHBOARD', 'DATA MANAGEMENT', 'SELECT SOURCE & DATASET', 'QUALITY / STATUS REVIEW', 'APPROVAL / REJECTION'] },
];

export const RT_FE_IA_NAV_VOCABULARY_12: readonly { technicalTerm: string; canonicalPersianLabel: string; distinctionNoteFa: string }[] = [
  { technicalTerm: 'Property', canonicalPersianLabel: 'ملک', distinctionNoteFa: 'موجودیت پایدار واحد ملکی (حذف آگهی باعث حذف شناسنامه ملک نمی‌شود)' },
  { technicalTerm: 'Listing', canonicalPersianLabel: 'آگهی', distinctionNoteFa: 'پیشنهاد عرضه موقت متصل به یک ملک (یک ملک می‌تواند چند آگهی در طول زمان داشته باشد)' },
  { technicalTerm: 'Building', canonicalPersianLabel: 'ساختمان', distinctionNoteFa: 'سازه دربرگیرنده واحدهای ملکی (PROPERTY UNIT 01..N)' },
  { technicalTerm: 'Neighborhood', canonicalPersianLabel: 'محله', distinctionNoteFa: 'موجودیت مکانی دارای یک صفحه مرجع یکتا (Canonical Page)' },
  { technicalTerm: 'District', canonicalPersianLabel: 'منطقه', distinctionNoteFa: 'تقسیمات کلان شهری شامل نواحی و محله‌ها' },
  { technicalTerm: 'Valuation', canonicalPersianLabel: 'برآورد قیمت', distinctionNoteFa: 'خروجی مدل ارزش‌گذاری با اعلام صریح سطح اطمینان' },
  { technicalTerm: 'Market Analysis', canonicalPersianLabel: 'تحلیل بازار', distinctionNoteFa: 'تفکیک داده مشاهده‌شده، برآورد آماری و خروجی مدل' },
  { technicalTerm: 'Supply & Demand', canonicalPersianLabel: 'عرضه و تقاضا', distinctionNoteFa: 'حجم و تنوع عرضه در برابر تقاضای خرید/اجاره' },
  { technicalTerm: 'Mobility', canonicalPersianLabel: 'حمل‌ونقل و دسترسی', distinctionNoteFa: 'شبکه دسترسی و ایستگاه‌های پیرامون محله و ملک' },
  { technicalTerm: 'Services', canonicalPersianLabel: 'خدمات', distinctionNoteFa: 'خدمات تخصصی و ارائه‌دهندگان معتبر' },
  { technicalTerm: 'Data Source', canonicalPersianLabel: 'منبع داده', distinctionNoteFa: 'اتصال هر داده به منشأ، تاریخ گردآوری و وضعیت اعتبار' },
  { technicalTerm: 'Verification', canonicalPersianLabel: 'وضعیت تأیید', distinctionNoteFa: 'وضعیت بررسی و صحت‌سنجی موجودیت' },
];

export const RT_FE_IA_NAV_ROUTE_META_SAMPLES: readonly RadarRouteMeta[] = [
  { id: 'rm-home', path: '/', title: 'خانه', domain: 'home', layout: 'dashboard', showInMainNav: true },
  { id: 'rm-map', path: '/geography/map', title: 'نقشه و جغرافیا', domain: 'geography', layout: 'map', showInMainNav: true },
  { id: 'rm-hood-canonical', path: '/neighborhoods/:neighborhoodId', title: 'صفحه مرجع محله', domain: 'neighborhood', layout: 'detail', showInMainNav: true },
  { id: 'rm-properties', path: '/properties', title: 'املاک', domain: 'property', layout: 'listing', showInMainNav: true },
  { id: 'rm-buildings', path: '/buildings/:buildingId', title: 'شناسنامه ساختمان', domain: 'building', layout: 'detail', showInMainNav: true },
  { id: 'rm-market-prices', path: '/market/prices', title: 'قیمت و بازار مسکن', domain: 'market', layout: 'analytics', showInMainNav: true },
  { id: 'rm-analytics-housing', path: '/analytics/housing', title: 'تحلیل‌های تخصصی مسکن', domain: 'valuation', layout: 'analytics', showInMainNav: true },
  { id: 'rm-services', path: '/services', title: 'خدمات', domain: 'services', layout: 'listing', showInMainNav: true },
  { id: 'rm-data-methodology', path: '/data/methodology', title: 'منابع و روش‌شناسی داده', domain: 'mobility', layout: 'detail', showInMainNav: false },
];

export interface EntityGraphContext {
  citySlug: string;
  districtSlug?: string | null;
  neighborhoodSlug?: string | null;
  buildingId?: string | null;
  propertyId?: string | null;
  listingId?: string | null;
}

export function buildEntityContextualLinks(ctx: EntityGraphContext): {
  activeLinks: { labelFa: string; href: string }[];
  missingRelationsNoticeFa: string[];
} {
  const activeLinks: { labelFa: string; href: string }[] = [
    { labelFa: 'صفحه مرجع شهر', href: `/cities/${ctx.citySlug}` },
  ];
  const missingRelationsNoticeFa: string[] = [];

  if (ctx.districtSlug) {
    activeLinks.push({ labelFa: 'مشاهده منطقه', href: `/cities/${ctx.citySlug}/districts/${ctx.districtSlug}` });
  } else {
    missingRelationsNoticeFa.push('داده منطقه برای این رکورد ثبت نشده است (بدون ایجاد لینک شکسته).');
  }
  if (ctx.neighborhoodSlug) {
    activeLinks.push(
      { labelFa: 'صفحه مرجع محله (Canonical)', href: `/neighborhoods/${ctx.neighborhoodSlug}` },
      { labelFa: 'بازار مسکن محله', href: `/neighborhoods/${ctx.neighborhoodSlug}/market` },
      { labelFa: 'دسترسی حمل‌ونقل محله', href: `/neighborhoods/${ctx.neighborhoodSlug}/mobility` },
    );
  } else {
    missingRelationsNoticeFa.push('محله دقیق هنوز به این موجودیت متصل نشده است.');
  }
  if (ctx.buildingId) {
    activeLinks.push({ labelFa: 'شناسنامه ساختمان', href: `/buildings/${ctx.buildingId}` });
  } else {
    missingRelationsNoticeFa.push('شناسنامه ساختمان برای این واحد هنوز تکمیل نشده است.');
  }
  if (ctx.propertyId) {
    activeLinks.push({ labelFa: 'شناسنامه پایدار ملک', href: `/properties/${ctx.propertyId}` });
  }
  if (ctx.listingId) {
    activeLinks.push({ labelFa: 'آگهی مرتبط ملک', href: `/listings/${ctx.listingId}` });
  }
  return { activeLinks, missingRelationsNoticeFa };
}

export function applyFilterChangeToRouteQuery(
  currentParams: { city: string; district?: string; neighborhood?: string; type: 'sale' | 'rent'; page: number },
  patch: Partial<{ city: string; district: string; neighborhood: string; type: 'sale' | 'rent' }>,
): { nextQueryString: string; pageResetToOne: true } {
  const cityChanged = Boolean(patch.city && patch.city !== currentParams.city);
  const nextCity = patch.city ?? currentParams.city;
  const nextDistrict = cityChanged ? patch.district : (patch.district ?? currentParams.district);
  const nextNeighborhood = cityChanged ? patch.neighborhood : (patch.neighborhood ?? currentParams.neighborhood);
  const nextType = patch.type ?? currentParams.type;

  const qs = new URLSearchParams();
  qs.set('city', nextCity);
  if (nextDistrict) qs.set('district', nextDistrict);
  if (nextNeighborhood) qs.set('neighborhood', nextNeighborhood);
  qs.set('type', nextType);
  qs.set('page', '1');

  return { nextQueryString: qs.toString(), pageResetToOne: true };
}

export const RT_FE_IA_NAV_DELIVERABLES_23: readonly { id: string; titleFa: string }[] = [
  { id: 'IA-OUT-001', titleFa: 'سند معماری کلان اطلاعات (۶ لایه اطلاعاتی)' },
  { id: 'IA-OUT-002', titleFa: 'طبقه‌بندی ۱۲ حوزه اصلی محصول (IA-001)' },
  { id: 'IA-OUT-003', titleFa: 'سلسله‌مراتب اطلاعات هر حوزه (IA-002)' },
  { id: 'IA-OUT-004', titleFa: 'فهرست ۲۰ موجودیت اصلی رادار (ENT-001..ENT-020 — IA-003)' },
  { id: 'IA-OUT-005', titleFa: 'قرارداد شناسه پایدار موجودیت (EntityReference)' },
  { id: 'IA-OUT-006', titleFa: 'نمودار ارتباط موجودیت‌ها (تفکیک ملک، ساختمان و آگهی — IA-004)' },
  { id: 'IA-OUT-007', titleFa: 'Sitemap کلان محصول (IA-005)' },
  { id: 'IA-OUT-008', titleFa: 'معماری Primary Navigation (IA-006)' },
  { id: 'IA-OUT-009', titleFa: 'معماری Secondary Navigation' },
  { id: 'IA-OUT-010', titleFa: 'معماری Contextual Navigation' },
  { id: 'IA-OUT-011', titleFa: 'قرارداد معنایی Breadcrumb (IA-007)' },
  { id: 'IA-OUT-012', titleFa: 'معماری جست‌وجوی سراسری ۸دسته‌ای (IA-008)' },
  { id: 'IA-OUT-013', titleFa: 'نقشه ۶ مسیر اصلی کاربران (User Journeys — IA-009)' },
  { id: 'IA-OUT-014', titleFa: 'نظام دسترسی متقاطع (RelatedEntityLink — IA-010)' },
  { id: 'IA-OUT-015', titleFa: 'قرارداد صفحات مرجع یکتا (Canonical Pages — IA-011)' },
  { id: 'IA-OUT-016', titleFa: 'استاندارد URL ({domain}/{entity}/{id}/{view} — IA-012)' },
  { id: 'IA-OUT-017', titleFa: 'Navigation Registry مرکزی (IA-013)' },
  { id: 'IA-OUT-018', titleFa: 'معماری کشف اطلاعات و ۷ گروه کاری (IA-014, IA-015)' },
  { id: 'IA-OUT-019', titleFa: 'الگوی ۸ وضعیت صفحات و مسیرهای بازیابی (IA-016)' },
  { id: 'IA-OUT-020', titleFa: 'استاندارد توسعه‌پذیری اطلاعات (DomainModuleDefinition — IA-018)' },
  { id: 'IA-OUT-021', titleFa: 'قرارداد اتصال به API و زیرساخت Cloudflare (IA-019)' },
  { id: 'IA-OUT-022', titleFa: 'استاندارد دسترس‌پذیری ناوبری (aria-current — IA-017)' },
  { id: 'IA-OUT-023', titleFa: 'مجموعه آزمون معماری اطلاعات و ناوبری' },
];
