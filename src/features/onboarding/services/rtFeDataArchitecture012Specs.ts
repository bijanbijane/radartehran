/**
 * Stage 12 — Spec Constants & Registries for RT-FE-DATA-ARCHITECTURE-012
 * Sections 12.2, 12.3, 12.16, 12.17, 12.23, 12.28, 12.29
 */

export const RT_DATA_RESPONSIBILITY_LAYERS_6 = [
  { id: 'L1', layerEn: 'UI Layer', roleFa: 'صفحات، کامپوننت‌ها، فرم‌ها، نقشه و نمودارها (بدون ارسال مستقیم HTTP)' },
  { id: 'L2', layerEn: 'Feature Data Layer', roleFa: 'مصرف داده در هر قابلیت و ماژول محصول از طریق Feature Hook' },
  { id: 'L3', layerEn: 'Application Data Layer', roleFa: 'Query، Cache، Repository، Validation و Synchronization مرکزی' },
  { id: 'L4', layerEn: 'API Communication Layer', roleFa: 'HTTP Client، Authentication، Request، Response، Timeout و Error Handling' },
  { id: 'L5', layerEn: 'Backend Services', roleFa: 'Express / Cloudflare Workers / سرویس‌های عملیاتی و مرجع نهایی مجوز و اعتبار' },
  { id: 'L6', layerEn: 'Infrastructure & Data Sources', roleFa: 'Firestore، D1، KV، R2، Queues و منابع داده (مخفی از مرورگر)' },
] as const;

export const RT_DATA_STATE_CLASSIFICATION_5 = [
  { tier: 'Server State', responsibilityFa: 'داده متعلق به Backend', examplesFa: 'اطلاعات ملک، آگهی، شاخص محله، معاملات و خروجی ارزش‌گذاری' },
  { tier: 'Client State', responsibilityFa: 'وضعیت موقت رابط کاربری', examplesFa: 'باز بودن Sidebar، تب فعال، حالت نمایش نقشه/فهرست و Tooltip' },
  { tier: 'URL State', responsibilityFa: 'وضعیت قابل اشتراک و بازگشت مرورگر', examplesFa: 'شناسه محله، فیلترها، صفحه، مرتب‌سازی و محدوده جغرافیایی' },
  { tier: 'Form State', responsibilityFa: 'اطلاعات در حال ورود کاربر تا ثبت نهایی', examplesFa: 'فرم ثبت ملک، ثبت آگهی و ویرایش پروفایل همراه با بازیابی پیش‌نویس ایمن' },
  { tier: 'Derived State', responsibilityFa: 'داده محاسبه‌شده از منابع دیگر', examplesFa: 'میانگین قیمت هر متر، تعداد نتایج فیلترشده و نسبت معامله به آگهی' },
] as const;

export const RT_DATA_FORM_STATES_10 = [
  'Initial', 'Dirty', 'Validating', 'Valid', 'Invalid',
  'Submitting', 'Submitted', 'Failed', 'Conflict', 'Reset',
] as const;

export const RT_DATA_UI_STATUS_MATRIX_11 = [
  { status: 'Initial', meaningFa: 'هنوز درخواست انجام نشده', uiBehaviorFa: 'حالت اولیه کنترل و آماده دریافت تعامل' },
  { status: 'Loading', meaningFa: 'در حال دریافت داده اولیه', uiBehaviorFa: 'نمایش Skeleton بدون برهم زدن Layout' },
  { status: 'Success', meaningFa: 'دریافت موفق و معتبر', uiBehaviorFa: 'رندر کامل داده و ثبت زمان آخرین دریافت' },
  { status: 'Empty', meaningFa: 'پاسخ معتبر بدون نتیجه', uiBehaviorFa: 'نمایش Empty State متمایز از خطا' },
  { status: 'Partial', meaningFa: 'بخشی از داده موجود است', uiBehaviorFa: 'نمایش داده‌های موجود همراه با هشدار صریح' },
  { status: 'Stale', meaningFa: 'داده قدیمی است', uiBehaviorFa: 'نمایش داده همراه با نشان تازگی و نسخه' },
  { status: 'Refetching', meaningFa: 'دریافت مجدد در پس‌زمینه', uiBehaviorFa: 'حفظ داده قبلی بدون حذف محتوای صفحه' },
  { status: 'Error', meaningFa: 'درخواست ناموفق', uiBehaviorFa: 'نمایش پیام انسانی + مسیر اقدام بعدی' },
  { status: 'Offline', meaningFa: 'شبکه در دسترس نیست', uiBehaviorFa: 'نمایش وضعیت آفلاین و داده کش عمومی مجاز' },
  { status: 'Forbidden', meaningFa: 'دسترسی مجاز نیست (403)', uiBehaviorFa: 'نمایش پیام دسترسی بدون Retry خودکار' },
  { status: 'Conflict', meaningFa: 'تعارض نسخه داده (409)', uiBehaviorFa: 'حفظ پیش‌نویس کاربر و نمایش مسیر حل تعارض' },
] as const;

export const RT_DATA_RETRY_POLICIES_6 = [
  { operation: 'GET عمومی', policyFa: 'Retry محدود با Backoff روی خطای شبکه و 5xx' },
  { operation: 'GET حساس به زمان', policyFa: 'Retry محدود و کنترل‌شده با Timeout کوتاه' },
  { operation: 'POST ثبت داده', policyFa: 'بدون Retry خودکار مگر با Idempotency Key معتبر' },
  { operation: 'PUT/PATCH', policyFa: 'وابسته به قرارداد عملیات و کنترل نسخه' },
  { operation: 'DELETE', policyFa: 'بدون Retry کورکورانه؛ نیازمند تأیید یا بررسی وضعیت' },
  { operation: 'Upload', policyFa: 'سیاست اختصاصی قابل بازیابی (Chunked/Resumable)' },
] as const;

export const RT_DATA_CLOUDFLARE_INTEGRATION_5 = [
  { service: 'Workers', responsibilityFa: 'اجرای منطق Backend و پالایش خطا', frontendPathFa: 'فقط از مسیر رسمی API' },
  { service: 'D1', responsibilityFa: 'پایگاه داده رابطه‌ای', frontendPathFa: 'فقط Backend (اتصال مستقیم مرورگر ممنوع)' },
  { service: 'KV', responsibilityFa: 'کش و داده کلیدی سریع', frontendPathFa: 'فقط Backend (دسترسی مستقیم ممنوع)' },
  { service: 'R2', responsibilityFa: 'ذخیره فایل، تصویر و سند', frontendPathFa: 'فقط با مجوز موقت Upload/Download امضاشده' },
  { service: 'Queues', responsibilityFa: 'پردازش غیرهم‌زمان پس‌زمینه', frontendPathFa: 'فقط Backend (مدیریت در کلاینت ممنوع)' },
] as const;

export const RT_DATA_EXECUTION_STEPS_20 = [
  'شناسایی مسیرهای فعلی دریافت داده و حذف درخواست‌های پراکنده',
  'طبقه‌بندی Stateهای موجود (Server / Client / URL / Form / Derived)',
  'تثبیت قراردادهای API (Response / Error / Pagination / Filter / Sort)',
  'پیاده‌سازی API Client مرکزی با Timeout، Auth و AbortSignal',
  'تثبیت TanStack Query برای Server State و Zod برای Runtime Validation',
  'پیاده‌سازی Query Key Registry بدون توکن و با نرمال‌سازی فیلترها',
  'ایجاد ساختار ماژولار Feature Data Layer برای ویژگی‌های کلیدی',
  'پیاده‌سازی Runtime Validation و تبدیل DTO به Domain Model',
  'تنظیم Cache Policy متناسب برای داده‌های عمومی، خصوصی و تحلیلی',
  'پیاده‌سازی Synchronization و DataDependency Registry پس از Mutation',
  'مهار Concurrency، Deduplication و Race Conditions با AbortSignal',
  'استانداردسازی Offset و Cursor Pagination با بازنشانی فیلتر',
  'پیاده‌سازی لایه داده مکانی نقشه مبتنی بر Viewport، Zoom و GeoJSON',
  'پیاده‌سازی لایه داده تحلیلی دارای واحد، زمان محاسبه و نسخه روش',
  'پیاده‌سازی Mutation، Optimistic Rollback، Version Conflict و Idempotency',
  'اتصال به احراز هویت با جداسازی کش خصوصی و پاک‌سازی کامل در Logout',
  'پیاده‌سازی جریان امن فایل (Upload Auth → R2 → Verify → Metadata)',
  'اتصال قراردادها به Cloudflare Workers / D1 / KV / R2 / Queues از Backend',
  'راه‌اندازی Telemetry فنی حریم‌خصوصی‌محور بدون ثبت کلید و فرم خصوصی',
  'آزمون ۵سطحی (Unit / Integration / Contract / E2E / Performance) و مهاجرت تدریجی',
] as const;

export const RT_DATA_DELIVERABLES_25 = [
  { id: 'RT-DATA-OUT-001', titleFa: 'سند معماری کلان مدیریت داده' },
  { id: 'RT-DATA-OUT-002', titleFa: 'طبقه‌بندی ۵گانه انواع State' },
  { id: 'RT-DATA-OUT-003', titleFa: 'قرارداد API Client مرکزی (۱۴ مسئولیت)' },
  { id: 'RT-DATA-OUT-004', titleFa: 'استاندارد ApiResponse و ApiErrorResponse' },
  { id: 'RT-DATA-OUT-005', titleFa: 'استاندارد Offset/Cursor Pagination و Filtering' },
  { id: 'RT-DATA-OUT-006', titleFa: 'معماری Feature Data Layer' },
  { id: 'RT-DATA-OUT-007', titleFa: 'رجیستری Query Key ساختارمند' },
  { id: 'RT-DATA-OUT-008', titleFa: 'سیاست Cache Management (staleTime / gcTime / Invalidation)' },
  { id: 'RT-DATA-OUT-009', titleFa: 'سیاست Data Synchronization و Dependency Registry' },
  { id: 'RT-DATA-OUT-010', titleFa: 'استاندارد Cancellation، Deduplication و Concurrency' },
  { id: 'RT-DATA-OUT-011', titleFa: 'معماری داده‌های جغرافیایی و Viewport نقشه' },
  { id: 'RT-DATA-OUT-012', titleFa: 'معماری داده‌های تحلیلی و AnalyticalIndicator' },
  { id: 'RT-DATA-OUT-013', titleFa: 'قرارداد Runtime Validation (DTO → Domain Model)' },
  { id: 'RT-DATA-OUT-014', titleFa: 'استاندارد ۱۱وضعیتی Error Handling و بازیابی' },
  { id: 'RT-DATA-OUT-015', titleFa: 'سیاست ۶گانه Retry و Timeout' },
  { id: 'RT-DATA-OUT-016', titleFa: 'استاندارد Mutation و Optimistic Update با Rollback' },
  { id: 'RT-DATA-OUT-017', titleFa: 'قرارداد VersionedEntity Conflict و Idempotency' },
  { id: 'RT-DATA-OUT-018', titleFa: 'سیاست جداسازی کش عمومی، کاربری و حساس + پاک‌سازی Logout' },
  { id: 'RT-DATA-OUT-019', titleFa: 'استاندارد Offline و Network Recovery' },
  { id: 'RT-DATA-OUT-020', titleFa: 'معماری جریان فایل و R2 Verification Flow' },
  { id: 'RT-DATA-OUT-021', titleFa: 'قرارداد ارتباط مستقل با Cloudflare (Workers/D1/KV/R2/Queues)' },
  { id: 'RT-DATA-OUT-022', titleFa: 'استاندارد DataTelemetryEvent بدون نشت PII' },
  { id: 'RT-DATA-OUT-023', titleFa: 'ساختار پوشه‌ها (app/data, features/*, shared/data) و TypeScript' },
  { id: 'RT-DATA-OUT-024', titleFa: 'راهبرد آزمون ۵سطحی معماری داده (۲۴ سناریو)' },
  { id: 'RT-DATA-OUT-025', titleFa: 'برنامه اجرای تدریجی ۲۰گامی ماژول‌ها' },
] as const;
