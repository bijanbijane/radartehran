/**
 * Stage 21 — Spec Constants & Catalogs for RT-FE-ENTITY-DETAIL-021
 * Frontend Entity Detail Pages, Property/Building/Neighborhood/Listing Detail Architecture
 */

export const RT_FE_ENTITY_DETAIL_021_SPEC_ID = 'RT-FE-ENTITY-DETAIL-021' as const;
export const RT_FE_STAGE22_BRIDGE_SPEC_ID = 'RT-FE-ENTITY-ENGAGEMENT-022' as const;

export type CoreEntityType = 'property' | 'building' | 'neighborhood' | 'listing' | 'service';

export const RT_ENTITY_DOMAINS_10 = [
  { categoryFa: 'املاک', entity: 'Property', sampleFa: 'یک واحد مسکونی یا تجاری' },
  { categoryFa: 'ساختمان', entity: 'Building', sampleFa: 'یک ساختمان چندواحدی' },
  { categoryFa: 'جغرافیا', entity: 'Neighborhood', sampleFa: 'یک محله شهری' },
  { categoryFa: 'جغرافیا', entity: 'Urban District', sampleFa: 'یک منطقه شهری' },
  { categoryFa: 'آگهی', entity: 'Listing', sampleFa: 'آگهی فروش یا اجاره' },
  { categoryFa: 'خدمات', entity: 'Service Provider', sampleFa: 'ارائه‌دهنده خدمات ساختمانی' },
  { categoryFa: 'خدمات', entity: 'Service', sampleFa: 'یک خدمت مشخص' },
  { categoryFa: 'بازار', entity: 'Market Entity', sampleFa: 'مجموعه آماری یا بازار تعریف‌شده' },
  { categoryFa: 'داده', entity: 'Data Source', sampleFa: 'منبع اطلاعات' },
  { categoryFa: 'پژوهش', entity: 'Research Entity', sampleFa: 'مطالعه یا گزارش پژوهشی' },
] as const;

export const RT_ENTITY_LAYERS_10 = [
  { layer: 1, nameEn: 'Entity Identity Layer', roleFa: 'شناسه پایدار، نوع، وضعیت و URL مرجع' },
  { layer: 2, nameEn: 'Entity Data Contract', roleFa: 'قرارداد داده اختصاصی دریافتی از Backend/API' },
  { layer: 3, nameEn: 'Entity View Model', roleFa: 'تفکیک موجودیت از نماهای Profile / Summary / Compare / Map' },
  { layer: 4, nameEn: 'Entity Detail Shell', roleFa: 'پوسته مشترک ۱۰بخشی با حفظ تفاوت ماهیت موجودیت‌ها' },
  { layer: 5, nameEn: 'Entity Section Registry', roleFa: 'ثبت بخش‌ها، مجوز و بارگذاری تنبل با ایزوله‌سازی خطا' },
  { layer: 6, nameEn: 'Entity Presentation', roleFa: 'رندر مشخصات، ارزش‌گذاری، تصاویر، نقشه و تمایز Missing از صفر' },
  { layer: 7, nameEn: 'Entity Relationship Layer', roleFa: 'روابط ۱۰گانه قطعی و احتمالی قابل پیمایش با منشأ' },
  { layer: 8, nameEn: 'History & Provenance', roleFa: 'منشأ در سطح فیلد، تعارض منابع و Timeline تاریخچه غیرقابل دست‌کاری' },
  { layer: 9, nameEn: 'Entity Actions', roleFa: 'عملیات مجاز از Registry با کنترل سرور و جلوگیری از تکرار' },
  { layer: 10, nameEn: 'Navigation & Context', roleFa: 'حفظ زمینه بازگشت (Search/Map/Table/Compare) بدون داده حساس در URL' },
] as const;

export const RT_ENTITY_SECTION_REGISTRY_10: ReadonlyArray<{
  id: string;
  entityTypes: CoreEntityType[];
  titleFa: string;
  order: number;
  required: boolean;
  permission?: string;
  lazyLoad?: boolean;
}> = [
  { id: 'overview', entityTypes: ['property', 'building', 'neighborhood', 'listing', 'service'], titleFa: 'نمای کلی', order: 1, required: true },
  { id: 'specifications', entityTypes: ['property', 'building', 'listing', 'service'], titleFa: 'مشخصات فنی', order: 2, required: false },
  { id: 'location', entityTypes: ['property', 'building', 'neighborhood', 'listing'], titleFa: 'موقعیت جغرافیایی', order: 3, required: true },
  { id: 'media', entityTypes: ['property', 'building', 'neighborhood', 'listing'], titleFa: 'تصاویر و فایل‌ها', order: 4, required: false, lazyLoad: true },
  { id: 'analytics', entityTypes: ['property', 'neighborhood'], titleFa: 'شاخص‌ها و ارزش‌گذاری', order: 5, required: false, lazyLoad: true },
  { id: 'relationships', entityTypes: ['property', 'building', 'neighborhood', 'listing'], titleFa: 'موجودیت‌های مرتبط', order: 6, required: false, lazyLoad: true },
  { id: 'history', entityTypes: ['property', 'building', 'neighborhood', 'listing'], titleFa: 'تاریخچه تغییرات', order: 7, required: false, lazyLoad: true },
  { id: 'sources', entityTypes: ['property', 'building', 'neighborhood', 'listing', 'service'], titleFa: 'منابع و اعتبار داده', order: 8, required: true },
  { id: 'activity', entityTypes: ['property', 'listing'], titleFa: 'فعالیت‌ها', order: 9, required: false, permission: 'entity.activity.read', lazyLoad: true },
  { id: 'documents', entityTypes: ['property', 'building'], titleFa: 'اسناد تخصصی', order: 10, required: false, permission: 'entity.documents.read', lazyLoad: true },
];

export const RT_ENTITY_HEADER_STATES_8 = [
  'Active', 'Pending', 'Verified', 'Unverified', 'Archived', 'Deleted', 'Restricted', 'Merged',
] as const;

export const RT_ENTITY_PROVENANCE_STATUSES_7 = [
  'verified', 'estimated', 'unverified', 'conflicting', 'outdated', 'unknown', 'withheld',
] as const;

export const RT_ENTITY_RELATIONSHIP_TYPES_10 = [
  'Located In', 'Belongs To', 'Advertised By', 'Near', 'Adjacent To',
  'Derived From', 'Similar To', 'Part Of', 'Managed By', 'Related To',
] as const;

export const RT_ENTITY_DELIVERABLES_31 = [
  { id: 'RT-FE-ENTITY-OUT-001', titleFa: 'Entity Inventory' },
  { id: 'RT-FE-ENTITY-OUT-002', titleFa: 'Entity Identity Architecture' },
  { id: 'RT-FE-ENTITY-OUT-003', titleFa: 'Canonical Entity URL Specification' },
  { id: 'RT-FE-ENTITY-OUT-004', titleFa: 'Entity Detail Shell' },
  { id: 'RT-FE-ENTITY-OUT-005', titleFa: 'Entity Header Specification' },
  { id: 'RT-FE-ENTITY-OUT-006', titleFa: 'Entity Section Registry' },
  { id: 'RT-FE-ENTITY-OUT-007', titleFa: 'Entity View Model' },
  { id: 'RT-FE-ENTITY-OUT-008', titleFa: 'Property Profile Architecture' },
  { id: 'RT-FE-ENTITY-OUT-009', titleFa: 'Building Profile Architecture' },
  { id: 'RT-FE-ENTITY-OUT-010', titleFa: 'Neighborhood Profile Architecture' },
  { id: 'RT-FE-ENTITY-OUT-011', titleFa: 'Listing Detail Architecture' },
  { id: 'RT-FE-ENTITY-OUT-012', titleFa: 'Field-Level Provenance' },
  { id: 'RT-FE-ENTITY-OUT-013', titleFa: 'Entity History Architecture' },
  { id: 'RT-FE-ENTITY-OUT-014', titleFa: 'Entity Versioning Specification' },
  { id: 'RT-FE-ENTITY-OUT-015', titleFa: 'Relationship Explorer' },
  { id: 'RT-FE-ENTITY-OUT-016', titleFa: 'Media Gallery Architecture' },
  { id: 'RT-FE-ENTITY-OUT-017', titleFa: 'Document Viewer Specification' },
  { id: 'RT-FE-ENTITY-OUT-018', titleFa: 'Context Preservation' },
  { id: 'RT-FE-ENTITY-OUT-019', titleFa: 'Entity Action Registry' },
  { id: 'RT-FE-ENTITY-OUT-020', titleFa: 'Data Completeness Model' },
  { id: 'RT-FE-ENTITY-OUT-021', titleFa: 'Responsive Detail Architecture' },
  { id: 'RT-FE-ENTITY-OUT-022', titleFa: 'SEO & Public Profile Specification' },
  { id: 'RT-FE-ENTITY-OUT-023', titleFa: 'Error Handling Architecture' },
  { id: 'RT-FE-ENTITY-OUT-024', titleFa: 'Entity Data Loading Strategy' },
  { id: 'RT-FE-ENTITY-OUT-025', titleFa: 'Cloudflare Integration Specification' },
  { id: 'RT-FE-ENTITY-OUT-026', titleFa: 'Testing Strategy' },
  { id: 'RT-FE-ENTITY-OUT-027', titleFa: 'Performance Specification' },
  { id: 'RT-FE-ENTITY-OUT-028', titleFa: 'Privacy & Security Specification' },
  { id: 'RT-FE-ENTITY-OUT-029', titleFa: 'Telemetry Specification' },
  { id: 'RT-FE-ENTITY-OUT-030', titleFa: 'Migration Plan' },
  { id: 'RT-FE-ENTITY-OUT-031', titleFa: 'Final Acceptance Test Suite' },
] as const;
