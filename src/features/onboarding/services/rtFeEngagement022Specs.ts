/**
 * Stage 22 — Spec Constants & Catalogs for RT-FE-ENTITY-ENGAGEMENT-022
 * Frontend Favorites, Entity Following, Personal Collections & Change Monitoring Architecture
 */

export const RT_FE_ENGAGEMENT_022_SPEC_ID = 'RT-FE-ENTITY-ENGAGEMENT-022' as const;
export const RT_FE_STAGE23_BRIDGE_SPEC_ID = 'RT-FE-NOTIFICATION-COMMUNICATION-023' as const;

export const RT_ENG_CONCEPTS_10 = [
  { concept: 'Favorite', roleFa: 'ذخیره یک موجودیت برای دسترسی سریع' },
  { concept: 'Follow', roleFa: 'دنبال‌کردن یک موجودیت یا تغییرات مشخص آن' },
  { concept: 'Collection', roleFa: 'مجموعه‌ای برای سازمان‌دهی موجودیت‌ها' },
  { concept: 'Watch Rule', roleFa: 'قاعده مشخص برای تشخیص یک تغییر معتبر' },
  { concept: 'Alert', roleFa: 'رویداد قابل توجه حاصل از ارزیابی قاعده' },
  { concept: 'Notification', roleFa: 'پیام قابل مشاهده برای اطلاع‌رسانی رویداد' },
  { concept: 'Delivery', roleFa: 'انتقال پیام از یک کانال ارتباطی مجزا' },
  { concept: 'Note', roleFa: 'یادداشت خصوصی (پیش‌فرض) یا اشتراکی دارای نسخه' },
  { concept: 'Tag', roleFa: 'برچسب شخصی نرمال‌سازی‌شده برای دسته‌بندی' },
  { concept: 'Activity', roleFa: 'رویداد ثبت‌شده در مرکز فعالیت شخصی کاربر' },
] as const;

export const RT_ENG_LAYERS_9 = [
  { layer: 1, nameEn: 'Engagement UI', roleFa: 'نمایش و دریافت تعامل کاربر در جزئیات، نتایج و نقشه' },
  { layer: 2, nameEn: 'View Model', roleFa: 'آماده‌سازی وضعیت علاقه‌مندی، مجموعه و اعلان بدون منطق سرور' },
  { layer: 3, nameEn: 'Feature Adapter', roleFa: 'اتصال به قراردادهای رسمی هر موجودیت بدون وابستگی داخلی' },
  { layer: 4, nameEn: 'Engagement API', roleFa: 'ارتباط کنترل‌شده با Backend همراه با Idempotency' },
  { layer: 5, nameEn: 'Backend Services', roleFa: 'کنترل مالکیت از نشست معتبر، محدودیت سقف و Tenant Isolation' },
  { layer: 6, nameEn: 'Change Monitoring', roleFa: 'تشخیص تغییر واقعی با حذف نویز قالب، ارقام و حروف' },
  { layer: 7, nameEn: 'Alert Processing', roleFa: 'ارزیابی Watch Rule و جلوگیری از تولید هشدار تکراری' },
  { layer: 8, nameEn: 'Notification Pipeline', roleFa: 'تجمیع هوشمند، Quiet Hours و تحویل مستقل از درخواست' },
  { layer: 9, nameEn: 'Persistent Storage', roleFa: 'ذخیره پایدار نسخه‌دار بدون دسترسی مستقیم مرورگر به D1/KV' },
] as const;

export const RT_ENG_FOLLOW_SCOPES_6 = [
  'all', 'price', 'status', 'fields', 'analytics', 'relationships',
] as const;

export const RT_ENG_WATCH_RULE_TYPES_8 = [
  'Price Threshold', 'Price Change', 'Listing Status', 'Field Change',
  'New Relationship', 'Source Update', 'Analytics Threshold', 'Availability Change',
] as const;

export const RT_ENG_DELIVERABLES_35 = [
  { id: 'RT-FE-ENGAGEMENT-OUT-001', titleFa: 'Engagement Architecture Specification' },
  { id: 'RT-FE-ENGAGEMENT-OUT-002', titleFa: 'Entity Reference Contract' },
  { id: 'RT-FE-ENGAGEMENT-OUT-003', titleFa: 'Favorite Architecture' },
  { id: 'RT-FE-ENGAGEMENT-OUT-004', titleFa: 'Follow Subscription Architecture' },
  { id: 'RT-FE-ENGAGEMENT-OUT-005', titleFa: 'Follow Scope Registry' },
  { id: 'RT-FE-ENGAGEMENT-OUT-006', titleFa: 'Personal Collection Architecture' },
  { id: 'RT-FE-ENGAGEMENT-OUT-007', titleFa: 'Collection Item Management' },
  { id: 'RT-FE-ENGAGEMENT-OUT-008', titleFa: 'Smart Collection Specification' },
  { id: 'RT-FE-ENGAGEMENT-OUT-009', titleFa: 'Collection Sharing & Access Control' },
  { id: 'RT-FE-ENGAGEMENT-OUT-010', titleFa: 'Tag Management Architecture' },
  { id: 'RT-FE-ENGAGEMENT-OUT-011', titleFa: 'Personal Notes Architecture' },
  { id: 'RT-FE-ENGAGEMENT-OUT-012', titleFa: 'Note Versioning & Conflict Resolution' },
  { id: 'RT-FE-ENGAGEMENT-OUT-013', titleFa: 'Watch Rule Contract' },
  { id: 'RT-FE-ENGAGEMENT-OUT-014', titleFa: 'Watch Rule Builder UI' },
  { id: 'RT-FE-ENGAGEMENT-OUT-015', titleFa: 'Change Event Contract' },
  { id: 'RT-FE-ENGAGEMENT-OUT-016', titleFa: 'Change Monitoring Architecture' },
  { id: 'RT-FE-ENGAGEMENT-OUT-017', titleFa: 'Change Noise Filtering Specification' },
  { id: 'RT-FE-ENGAGEMENT-OUT-018', titleFa: 'Alert Processing Architecture' },
  { id: 'RT-FE-ENGAGEMENT-OUT-019', titleFa: 'Notification Integration Contract' },
  { id: 'RT-FE-ENGAGEMENT-OUT-020', titleFa: 'Activity Center Architecture' },
  { id: 'RT-FE-ENGAGEMENT-OUT-021', titleFa: 'Personal Dashboard Specification' },
  { id: 'RT-FE-ENGAGEMENT-OUT-022', titleFa: 'Cross-Device Synchronization' },
  { id: 'RT-FE-ENGAGEMENT-OUT-023', titleFa: 'Offline & Conflict Handling' },
  { id: 'RT-FE-ENGAGEMENT-OUT-024', titleFa: 'Engagement Cache & State Strategy' },
  { id: 'RT-FE-ENGAGEMENT-OUT-025', titleFa: 'Engagement API Contract' },
  { id: 'RT-FE-ENGAGEMENT-OUT-026', titleFa: 'Cloudflare Integration Specification' },
  { id: 'RT-FE-ENGAGEMENT-OUT-027', titleFa: 'Security & Tenant Isolation' },
  { id: 'RT-FE-ENGAGEMENT-OUT-028', titleFa: 'Privacy & Data Retention Policy' },
  { id: 'RT-FE-ENGAGEMENT-OUT-029', titleFa: 'Responsive UI Specification' },
  { id: 'RT-FE-ENGAGEMENT-OUT-030', titleFa: 'Accessibility & RTL Specification' },
  { id: 'RT-FE-ENGAGEMENT-OUT-031', titleFa: 'Telemetry Specification' },
  { id: 'RT-FE-ENGAGEMENT-OUT-032', titleFa: 'Testing Strategy' },
  { id: 'RT-FE-ENGAGEMENT-OUT-033', titleFa: 'Performance Specification' },
  { id: 'RT-FE-ENGAGEMENT-OUT-034', titleFa: 'Migration & Rollout Plan' },
  { id: 'RT-FE-ENGAGEMENT-OUT-035', titleFa: 'Final Acceptance Test Suite' },
] as const;
