/**
 * Stage 18 — Spec Constants & Catalogs for RT-FE-SEARCH-FILTER-018
 * Frontend Search, Filtering, Query Builder & Data Discovery Architecture
 */

export const RT_FE_SEARCH_FILTER_018_SPEC_ID = 'RT-FE-SEARCH-FILTER-018' as const;
export const RT_FE_STAGE19_BRIDGE_SPEC_ID = 'RT-FE-RESULTS-PRESENTATION-019' as const;

export const RT_SEARCH_SUBSYSTEMS_10 = [
  { step: 1, nameEn: 'Search Interface', roleFa: 'ورودی عبارت، Autocomplete، فیلترهای سریع و پیشرفته' },
  { step: 2, nameEn: 'Search Context Manager', roleFa: 'مدیریت حوزه، شهر، محله و Access Scope جست‌وجو' },
  { step: 3, nameEn: 'Query Builder', roleFa: 'ساخت درخت ساختاریافته شرط‌ها با گروه‌بندی AND / OR' },
  { step: 4, nameEn: 'Query Validation & Normalization', roleFa: 'نرمال‌سازی فارسی/عربی، مهار پیچیدگی و Allowlist فیلدها' },
  { step: 5, nameEn: 'Search Adapter Layer', roleFa: 'اتصال هر Feature بدون وابستگی UI به جزئیات API' },
  { step: 6, nameEn: 'Search API', roleFa: 'دریافت، بررسی مجوز و کنترل زمان اجرا در Backend (بدون اتصال مستقیم به D1/KV)' },
  { step: 7, nameEn: 'Search Execution', roleFa: 'اجرای پرس‌وجو، فیلتر و رتبه‌بندی سمت سرور' },
  { step: 8, nameEn: 'Result Processing', roleFa: 'Cursor/Offset Pagination، محاسبه Facet و وضعیت ناقص/کامل' },
  { step: 9, nameEn: 'Result Presentation', roleFa: 'تغذیه هم‌زمان فهرست، نقشه و نمودار از یک Query مشترک' },
  { step: 10, nameEn: 'Search Persistence', roleFa: 'ذخیره تعریف Query (Saved Search)، بازسازی از URL و تاریخچه قابل حذف' },
] as const;

export const RT_SEARCH_REGISTRY_6 = [
  { id: 'property.search', featureId: 'FEAT-PROP-001', entityType: 'Property', searchableFields: ['title', 'neighborhood', 'code'], filterableFields: ['propertyType', 'area', 'buildingAge', 'neighborhoodId', 'location'], sortableFields: ['createdAt', 'area'], pagination: 'cursor' as const },
  { id: 'listing.search', featureId: 'FEAT-PROP-004', entityType: 'Listing', searchableFields: ['title', 'description'], filterableFields: ['dealType', 'pricePerSqm', 'area', 'neighborhoodId', 'createdAt'], sortableFields: ['createdAt', 'pricePerSqm'], pagination: 'cursor' as const },
  { id: 'neighborhood.search', featureId: 'FEAT-GEO-003', entityType: 'Neighborhood', searchableFields: ['nameFa', 'district'], filterableFields: ['district', 'density', 'transitScore', 'location'], sortableFields: ['nameFa', 'transitScore'], pagination: 'offset' as const },
  { id: 'indicator.search', featureId: 'FEAT-GEO-005', entityType: 'Indicator', searchableFields: ['title', 'code'], filterableFields: ['unit', 'period', 'neighborhoodId'], sortableFields: ['period', 'updatedAt'], pagination: 'offset' as const },
  { id: 'research.search', featureId: 'FEAT-ANA-006', entityType: 'ResearchReport', searchableFields: ['title', 'summary'], filterableFields: ['year', 'sourceType', 'neighborhoodId'], sortableFields: ['year'], pagination: 'offset' as const },
  { id: 'service.search', featureId: 'FEAT-SRV-001', entityType: 'ServiceProvider', searchableFields: ['name', 'specialty'], filterableFields: ['category', 'neighborhoodId', 'location'], sortableFields: ['rating'], pagination: 'cursor' as const },
] as const;

export const RT_SEARCH_OPERATORS_17 = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'notIn',
  'contains', 'startsWith', 'endsWith', 'exists', 'isNull', 'within', 'intersects', 'near',
] as const;

export const RT_SEARCH_RESULT_STATES_10 = [
  'Idle', 'Loading', 'Success', 'Empty', 'Partial',
  'Stale', 'Error', 'Forbidden', 'Invalid Query', 'Offline',
] as const;

export const RT_SEARCH_EXECUTION_PHASES_12 = [
  { phase: 1, outputId: 'RT-FE-SEARCH-OUT-001', titleFa: 'شناسایی جست‌وجوها، فیلترها و APIهای فعلی' },
  { phase: 2, outputId: 'RT-FE-SEARCH-OUT-002', titleFa: 'طراحی Search Registry و SearchContext' },
  { phase: 3, outputId: 'RT-FE-SEARCH-OUT-003', titleFa: 'طراحی Query Model درختی AND/OR و عملگرها' },
  { phase: 4, outputId: 'RT-FE-SEARCH-OUT-004', titleFa: 'Query Validation و نرمال‌سازی فارسی/عددی' },
  { phase: 5, outputId: 'RT-FE-SEARCH-OUT-005', titleFa: 'قرارداد Search API و Search Adapterها' },
  { phase: 6, outputId: 'RT-FE-SEARCH-OUT-006', titleFa: 'جست‌وجوی سراسری تفکیک‌شده و Autocomplete با Cancel' },
  { phase: 7, outputId: 'RT-FE-SEARCH-OUT-007', titleFa: 'Filter Registry مشترک Quick و Advanced' },
  { phase: 8, outputId: 'RT-FE-SEARCH-OUT-008', titleFa: 'Faceted Search و Query Builder' },
  { phase: 9, outputId: 'RT-FE-SEARCH-OUT-009', titleFa: 'فیلترهای مکانی (Viewport Debounce، Polygon، Radius)' },
  { phase: 10, outputId: 'RT-FE-SEARCH-OUT-010', titleFa: 'Saved Search (تعریف Query) و History با حریم خصوصی' },
  { phase: 11, outputId: 'RT-FE-SEARCH-OUT-011', titleFa: 'جداسازی Cache عمومی/خصوصی، امنیت و A11y' },
  { phase: 12, outputId: 'RT-FE-SEARCH-OUT-012', titleFa: 'مهاجرت نهایی و حذف مدل‌های تکراری' },
] as const;

export const RT_SEARCH_DELIVERABLES_27 = [
  { id: 'OUT-001', titleFa: 'Inventory جست‌وجوهای فعلی' },
  { id: 'OUT-002', titleFa: 'Search Registry و Context Architecture' },
  { id: 'OUT-003', titleFa: 'Query Model و Query Builder Contract' },
  { id: 'OUT-004', titleFa: 'Query Validation & Normalization' },
  { id: 'OUT-005', titleFa: 'Search API و Adapter Architecture' },
  { id: 'OUT-006', titleFa: 'Global Search و Autocomplete' },
  { id: 'OUT-007', titleFa: 'Filter Registry' },
  { id: 'OUT-008', titleFa: 'Advanced Filters و Faceted Search' },
  { id: 'OUT-009', titleFa: 'Geographic Search Architecture' },
  { id: 'OUT-010', titleFa: 'Sort & Ranking Architecture' },
  { id: 'OUT-011', titleFa: 'Pagination Architecture' },
  { id: 'OUT-012', titleFa: 'Query State & URL Integration' },
  { id: 'OUT-013', titleFa: 'Saved Search Architecture' },
  { id: 'OUT-014', titleFa: 'Search History Architecture' },
  { id: 'OUT-015', titleFa: 'Natural Language Search Adapter' },
  { id: 'OUT-016', titleFa: 'Map/List/Chart Query Synchronization' },
  { id: 'OUT-017', titleFa: 'Search Cache & Concurrency Rules' },
  { id: 'OUT-018', titleFa: 'Search Security Specification' },
  { id: 'OUT-019', titleFa: 'Responsive Search UX' },
  { id: 'OUT-020', titleFa: 'TypeScript Contracts' },
  { id: 'OUT-021', titleFa: 'Folder Structure & Feature Ownership' },
  { id: 'OUT-022', titleFa: 'Testing Strategy' },
  { id: 'OUT-023', titleFa: 'Search Telemetry Specification' },
  { id: 'OUT-024', titleFa: 'Performance Specification' },
  { id: 'OUT-025', titleFa: 'Cloudflare Integration Contract' },
  { id: 'OUT-026', titleFa: 'Migration Plan' },
  { id: 'OUT-027', titleFa: 'Search Acceptance Test Suite' },
] as const;
