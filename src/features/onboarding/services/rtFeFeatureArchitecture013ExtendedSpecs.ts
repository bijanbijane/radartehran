/**
 * Stage 13 (Modularization Track) — Canonical Entity Ownership, External Adapters,
 * Naming Standard, 7-Group Feature IDs (FEAT-PROP-001..FEAT-ADM-006), 12 Docs & 27 Deliverables
 * for RT-FE-FEATURE-ARCHITECTURE-013 (§13.4, §13.7, §13.17, §13.24, §13.29–§13.31).
 */

export const RT_FEA_7_GROUPS_42_FEATURES = [
  { group: 'گروه ۱: هسته املاک', prefix: 'FEAT-PROP', items: ['FEAT-PROP-001 Properties', 'FEAT-PROP-002 Buildings', 'FEAT-PROP-003 Units', 'FEAT-PROP-004 Listings', 'FEAT-PROP-005 Transactions', 'FEAT-PROP-006 Ownership'] },
  { group: 'گروه ۲: جغرافیا و شهر', prefix: 'FEAT-GEO', items: ['FEAT-GEO-001 Geographic Core', 'FEAT-GEO-002 Map Explorer', 'FEAT-GEO-003 Neighborhoods', 'FEAT-GEO-004 Urban Boundaries', 'FEAT-GEO-005 Urban Layers', 'FEAT-GEO-006 Location Intelligence'] },
  { group: 'گروه ۳: بازار و ارزش‌گذاری', prefix: 'FEAT-MKT', items: ['FEAT-MKT-001 Market Intelligence', 'FEAT-MKT-002 Price Analytics', 'FEAT-MKT-003 Valuation', 'FEAT-MKT-004 Supply & Demand', 'FEAT-MKT-005 Market Trends', 'FEAT-MKT-006 Comparable Properties'] },
  { group: 'گروه ۴: تحلیل شهری و پژوهش', prefix: 'FEAT-ANA', items: ['FEAT-ANA-001 Urban Analytics', 'FEAT-ANA-002 Demographics', 'FEAT-ANA-003 Mobility', 'FEAT-ANA-004 Environment', 'FEAT-ANA-005 Infrastructure', 'FEAT-ANA-006 Research Reports'] },
  { group: 'گروه ۵: خدمات و تعاملات', prefix: 'FEAT-SRV', items: ['FEAT-SRV-001 Services Marketplace', 'FEAT-SRV-002 Professionals', 'FEAT-SRV-003 Service Requests', 'FEAT-SRV-004 Reviews', 'FEAT-SRV-005 Messaging', 'FEAT-SRV-006 Bookmarks'] },
  { group: 'گروه ۶: هویت و مشارکت', prefix: 'FEAT-ID', items: ['FEAT-ID-001 User Profile', 'FEAT-ID-002 Authentication', 'FEAT-ID-003 User Contributions', 'FEAT-ID-004 Verification', 'FEAT-ID-005 Notifications', 'FEAT-ID-006 User Preferences'] },
  { group: 'گروه ۷: مدیریت و عملیات', prefix: 'FEAT-ADM', items: ['FEAT-ADM-001 Admin Workspace', 'FEAT-ADM-002 Content Moderation', 'FEAT-ADM-003 Data Governance', 'FEAT-ADM-004 System Monitoring', 'FEAT-ADM-005 Access Management', 'FEAT-ADM-006 Audit Viewer'] },
] as const;

export const RT_FEA_ENTITY_OWNERSHIP_11 = [
  { entity: 'Property', owner: 'Properties', consumers: ['Listings', 'Valuation', 'Map', 'Analytics'] },
  { entity: 'Building', owner: 'Buildings', consumers: ['Properties', 'Neighborhoods', 'Analytics'] },
  { entity: 'Unit', owner: 'Units', consumers: ['Properties', 'Listings', 'Valuation'] },
  { entity: 'Listing', owner: 'Listings', consumers: ['Search', 'Map', 'Market'] },
  { entity: 'Transaction', owner: 'Transactions', consumers: ['Market', 'Analytics', 'Valuation'] },
  { entity: 'Neighborhood', owner: 'Neighborhoods', consumers: ['Map', 'Analytics', 'Market'] },
  { entity: 'Geographic Boundary', owner: 'Geographic Core', consumers: ['Map', 'Neighborhoods', 'Analytics'] },
  { entity: 'User Profile', owner: 'User Profile', consumers: ['Services', 'Contributions', 'Admin'] },
  { entity: 'Professional', owner: 'Professionals', consumers: ['Services', 'Reviews'] },
  { entity: 'Indicator', owner: 'Analytics', consumers: ['Neighborhoods', 'Reports', 'Market'] },
  { entity: 'Report', owner: 'Research Reports', consumers: ['Neighborhoods', 'Admin', 'Public Pages'] },
] as const;

export const RT_FEA_EXTERNAL_ADAPTERS_7 = [
  { technology: 'Leaflet', adapterFa: 'Map Adapter (Map Explorer)' },
  { technology: 'TanStack Query', adapterFa: 'Data Infrastructure' },
  { technology: 'Zod', adapterFa: 'Validation Layer' },
  { technology: 'Firebase Auth', adapterFa: 'Authentication Adapter' },
  { technology: 'Chart Library', adapterFa: 'Analytics Presentation Adapter' },
  { technology: 'Date Library', adapterFa: 'Shared Date Utilities' },
  { technology: 'HTTP Client', adapterFa: 'API Communication Layer' },
] as const;

export const RT_FEA_ERROR_BOUNDARIES_4 = [
  { level: 'Application Boundary', scopeFa: 'خطاهای بحرانی سطح کل برنامه + صفحه جایگزین امن بدون نشت جزئیات' },
  { level: 'Feature Boundary', scopeFa: 'توقف رندر همان Feature + حفظ بخش‌های سالم + دکمه تلاش مجدد' },
  { level: 'Widget Boundary', scopeFa: 'خطای یک نمودار، نقشه کوچک یا کارت بدون اختلال در کل صفحه' },
  { level: 'Data Operation Boundary', scopeFa: 'مدیریت خطای عملیات دریافت/ثبت داده همسو با مرحله دوازدهم' },
] as const;

export const RT_FEA_DOCS_12 = [
  { id: 'RT-FEA-DOC-001', titleEn: 'Feature Catalog' },
  { id: 'RT-FEA-DOC-002', titleEn: 'Feature Ownership Registry' },
  { id: 'RT-FEA-DOC-003', titleEn: 'Dependency Matrix' },
  { id: 'RT-FEA-DOC-004', titleEn: 'Public API Contracts' },
  { id: 'RT-FEA-DOC-005', titleEn: 'Feature Registry' },
  { id: 'RT-FEA-DOC-006', titleEn: 'Event Contract Catalog' },
  { id: 'RT-FEA-DOC-007', titleEn: 'Route Ownership Registry' },
  { id: 'RT-FEA-DOC-008', titleEn: 'Feature Lifecycle Policy' },
  { id: 'RT-FEA-DOC-009', titleEn: 'Modularization Rules' },
  { id: 'RT-FEA-DOC-010', titleEn: 'Migration Plan' },
  { id: 'RT-FEA-DOC-011', titleEn: 'Architecture Testing Policy' },
  { id: 'RT-FEA-DOC-012', titleEn: 'AI Agent Development Boundaries' },
] as const;

export const RT_FEA_EXECUTION_STEPS_24 = [
  'استخراج Featureهای واقعی پروژه بدون ساخت قابلیت فرضی',
  'دسته‌بندی قابلیت‌ها در گروه‌های املاک، جغرافیا، بازار، تحلیل، خدمات، کاربران و مدیریت',
  'شناسایی مرزهای منطقی و چرخه تغییر هر قابلیت',
  'اختصاص Feature ID پایدار (FEAT-GROUP-NNN)',
  'تعیین مالکیت اصلی موجودیت‌ها (Property، Building، Listing، Neighborhood...)',
  'ثبت Scope و Out of Scope برای هر Feature',
  'طراحی ساختار داخلی متناسب با پیچیدگی ماژول',
  'تعریف Public API به‌عنوان تنها نقطه ورود رسمی',
  'طراحی Shared Contracts با حداقل وابستگی',
  'تعریف Event Contracts نسخه‌بندی‌شده',
  'طراحی Dependency Matrix و کنترل دسترسی',
  'شناسایی و حذف Circular Dependencies در CI',
  'ایجاد Feature Registry مرکزی',
  'طراحی سیاست Feature Flags جدا از مجوز امنیتی',
  'تعیین مالکیت Routeها',
  'جداسازی منطق تجاری از کامپوننت‌های نمایشی',
  'تعریف چرخه عمر ۸مرحله‌ای Feature',
  'طراحی Error Boundaryهای ۴سطحی',
  'تعریف Adapter برای کتابخانه‌های خارجی (Leaflet/Zod/Auth/Charts)',
  'تعیین مالکیت فایل و قرارداد توسعه موازی تیم‌ها و عامل‌ها',
  'ایجاد آزمون‌های ۶سطحی ماژولار و مرزی',
  'مهاجرت آزمایشی یک Feature کم‌ریسک (Pilot)',
  'مهاجرت تدریجی Featureهای اصلی بر اساس وابستگی',
  'تثبیت معماری، حذف ساختار قدیمی و تکمیل مستندات RT-FEA-DOC-001..012',
] as const;

export const RT_FEA_DELIVERABLES_27 = [
  { id: 'RT-FEA-OUT-001', titleFa: 'سند معماری کلان Featureها' },
  { id: 'RT-FEA-OUT-002', titleFa: 'فهرست رسمی Featureهای پروژه' },
  { id: 'RT-FEA-OUT-003', titleFa: 'استاندارد شناسه‌گذاری Feature' },
  { id: 'RT-FEA-OUT-004', titleFa: 'سند مالکیت قابلیت‌ها' },
  { id: 'RT-FEA-OUT-005', titleFa: 'ماتریس Scope و Out of Scope' },
  { id: 'RT-FEA-OUT-006', titleFa: 'رجیستری مالکیت موجودیت‌ها' },
  { id: 'RT-FEA-OUT-007', titleFa: 'استاندارد ساختار داخلی Feature' },
  { id: 'RT-FEA-OUT-008', titleFa: 'قرارداد Public API' },
  { id: 'RT-FEA-OUT-009', titleFa: 'استاندارد Shared Contracts' },
  { id: 'RT-FEA-OUT-010', titleFa: 'کاتالوگ Event Contracts' },
  { id: 'RT-FEA-OUT-011', titleFa: 'Dependency Matrix' },
  { id: 'RT-FEA-OUT-012', titleFa: 'سیاست جلوگیری از Circular Dependencies' },
  { id: 'RT-FEA-OUT-013', titleFa: 'Feature Registry' },
  { id: 'RT-FEA-OUT-014', titleFa: 'Feature Flag Policy' },
  { id: 'RT-FEA-OUT-015', titleFa: 'Route Ownership Registry' },
  { id: 'RT-FEA-OUT-016', titleFa: 'استاندارد Domain/Application/Presentation' },
  { id: 'RT-FEA-OUT-017', titleFa: 'سیاست چرخه عمر Feature' },
  { id: 'RT-FEA-OUT-018', titleFa: 'معماری Error Isolation' },
  { id: 'RT-FEA-OUT-019', titleFa: 'استاندارد External Adapters' },
  { id: 'RT-FEA-OUT-020', titleFa: 'سیاست مالکیت فایل و توسعه موازی' },
  { id: 'RT-FEA-OUT-021', titleFa: 'استاندارد نسخه‌بندی قراردادها' },
  { id: 'RT-FEA-OUT-022', titleFa: 'راهبرد آزمون ماژولار' },
  { id: 'RT-FEA-OUT-023', titleFa: 'ابزارها و قواعد کنترل معماری در CI' },
  { id: 'RT-FEA-OUT-024', titleFa: 'ساختار نهایی پوشه‌ها' },
  { id: 'RT-FEA-OUT-025', titleFa: 'برنامه مهاجرت تدریجی' },
  { id: 'RT-FEA-OUT-026', titleFa: 'مستندات توسعه توسط عامل‌های هوش مصنوعی' },
  { id: 'RT-FEA-OUT-027', titleFa: 'گزارش تطبیق معماری پیشنهادی با کد واقعی' },
] as const;

export const RT_FE_STAGE14_BRIDGE_SPEC_ID = 'RT-FE-NAVIGATION-WORKSPACE-014' as const;
