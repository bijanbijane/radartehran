/**
 * Stage 17 — Spec Constants & Registries for RT-FE-FORM-WORKFLOW-017
 * Frontend Forms, Data Entry, Validation & User Workflow Architecture
 */

export const RT_FE_FORM_WORKFLOW_017_SPEC_ID = 'RT-FE-FORM-WORKFLOW-017' as const;
export const RT_FE_STAGE18_BRIDGE_SPEC_ID = 'RT-FE-SEARCH-FILTER-018' as const;

export const RT_FORM_LAYERS_8 = [
  { layer: 1, nameEn: 'Form Definition', roleFa: 'تعریف ساختار فرم، بخش‌ها، مراحل و وابستگی‌های شرطی فیلدها' },
  { layer: 2, nameEn: 'Schema & Rules', roleFa: 'ساختار داده، نسخه‌بندی Schema و تفکیک قوانین ساختاری از تجاری' },
  { layer: 3, nameEn: 'Field Registry & Renderer', roleFa: 'ثبت فیلدهای استاندارد و تبدیل تعریف به رابط کاربری دسترس‌پذیر' },
  { layer: 4, nameEn: 'Validation Engine', roleFa: 'اعتبارسنجی ۴سطحی (فیلد، بین‌فیلدی، دامنه، سرور) با تفکیک Error/Warning' },
  { layer: 5, nameEn: 'Draft & Submission Adapter', roleFa: 'ذخیره موقت، Autosave با Debounce و Idempotency و کنترل نسخه' },
  { layer: 6, nameEn: 'Workflow Interface', roleFa: 'رابط بررسی، تأیید، بازگشت برای اصلاح و انتشار داده معتبر' },
  { layer: 7, nameEn: 'Backend API', roleFa: 'مرجع نهایی مجوز، اعتبارسنجی کسب‌وکار و گذار وضعیت گردش‌کار' },
  { layer: 8, nameEn: 'Persistent Storage', roleFa: 'ذخیره پایدار داده، Draft، Audit Trail و تاریخچه تغییرات (بدون دسترسی مستقیم مرورگر به D1/KV/Queues)' },
] as const;

export const RT_FORM_REGISTRY_SAMPLE_7 = [
  { id: 'property.create', featureId: 'FEAT-PROP-001', titleFa: 'ثبت مشخصات پایه و کالبدی ملک', schemaVersion: 3, category: 'property' as const, status: 'active' as const },
  { id: 'property.update', featureId: 'FEAT-PROP-001', titleFa: 'اصلاح پرونده ملک موجود', schemaVersion: 3, category: 'property' as const, status: 'active' as const },
  { id: 'listing.create', featureId: 'FEAT-PROP-004', titleFa: 'ثبت آگهی عرضه (فروش / اجاره)', schemaVersion: 2, category: 'listing' as const, status: 'active' as const },
  { id: 'listing.update', featureId: 'FEAT-PROP-004', titleFa: 'ویرایش آگهی فعال', schemaVersion: 2, category: 'listing' as const, status: 'active' as const },
  { id: 'neighborhood.indicator.create', featureId: 'FEAT-GEO-003', titleFa: 'ثبت شاخص آماری/کالبدی محله با منبع و دوره', schemaVersion: 2, category: 'neighborhood' as const, status: 'active' as const },
  { id: 'research.dataset.create', featureId: 'FEAT-ANA-006', titleFa: 'ثبت مجموعه داده و روش‌شناسی پژوهش', schemaVersion: 1, category: 'research' as const, status: 'experimental' as const },
  { id: 'admin.configuration.update', featureId: 'FEAT-ADM-001', titleFa: 'تغییر تنظیمات حساس سامانه (M3/M4)', schemaVersion: 4, category: 'admin' as const, status: 'active' as const },
] as const;

export const RT_FORM_SEMANTIC_FIELDS_11 = [
  'MoneyAmount', 'AreaSquareMeter', 'PersianDate', 'PostalCode', 'IranPhoneNumber',
  'NeighborhoodReference', 'PropertyType', 'GeographicPoint', 'GeographicPolygon',
  'SourceReference', 'ConfidenceLevel',
] as const;

export const RT_FORM_WORKFLOW_STATES_9 = [
  'draft', 'submitted', 'validating', 'review', 'approved',
  'published', 'rejected', 'returned_for_correction', 'archived',
] as const;

export const RT_FORM_UPLOAD_STATES_9 = [
  'Selected', 'Validating', 'Uploading', 'Uploaded', 'Processing',
  'Quarantined', 'Rejected', 'Failed', 'Attached',
] as const;

export const RT_FORM_ADMIN_RISK_5 = [
  { level: 'M0', labelFa: 'تغییر کم‌خطر — ثبت عادی' },
  { level: 'M1', labelFa: 'تغییر قابل بازگشت — ثبت تاریخچه' },
  { level: 'M2', labelFa: 'تغییر اثرگذار — تأیید صریح' },
  { level: 'M3', labelFa: 'تغییر حساس — مجوز ویژه و ثبت دلیل' },
  { level: 'M4', labelFa: 'عملیات بحرانی — تأیید دومرحله‌ای Backend + Audit' },
] as const;

export const RT_FORM_EXECUTION_PHASES_12 = [
  { phase: 1, outputId: 'RT-FE-FORM-OUT-001', titleFa: 'شناسایی و طبقه‌بندی فرم‌های موجود' },
  { phase: 2, outputId: 'RT-FE-FORM-OUT-002', titleFa: 'طراحی قراردادهای Form, Field, Schema و Submission' },
  { phase: 3, outputId: 'RT-FE-FORM-OUT-003', titleFa: 'ایجاد Field Registry و Renderer' },
  { phase: 4, outputId: 'RT-FE-FORM-OUT-004', titleFa: 'پیاده‌سازی Validation Engine چهارسطحی' },
  { phase: 5, outputId: 'RT-FE-FORM-OUT-005', titleFa: 'تکمیل زیرساخت ارقام فارسی/عربی، تاریخ شمسی و واحدها' },
  { phase: 6, outputId: 'RT-FE-FORM-OUT-006', titleFa: 'ایجاد Draft، Autosave و تشخیص تعارض نسخه' },
  { phase: 7, outputId: 'RT-FE-FORM-OUT-007', titleFa: 'پیاده‌سازی Wizard، فیلدهای شرطی و Repeatable Groups' },
  { phase: 8, outputId: 'RT-FE-FORM-OUT-008', titleFa: 'ایجاد Upload امن و Import گروهی CSV/XLSX' },
  { phase: 9, outputId: 'RT-FE-FORM-OUT-009', titleFa: 'مهاجرت فرم‌های ملک، آگهی، محله، پژوهش و مدیریت' },
  { phase: 10, outputId: 'RT-FE-FORM-OUT-010', titleFa: 'پیاده‌سازی گردش‌کار Review, Approval و Publication' },
  { phase: 11, outputId: 'RT-FE-FORM-OUT-011', titleFa: 'آزمون‌های جامع، امنیت، A11y و RTL' },
  { phase: 12, outputId: 'RT-FE-FORM-OUT-012', titleFa: 'مهاجرت نهایی و حذف مسیرهای تکراری' },
] as const;

export const RT_FORM_DELIVERABLES_30 = [
  { id: 'OUT-001', titleFa: 'فهرست و طبقه‌بندی فرم‌های موجود' },
  { id: 'OUT-002', titleFa: 'قراردادهای معماری Form و Field' },
  { id: 'OUT-003', titleFa: 'Form Registry و Field Registry' },
  { id: 'OUT-004', titleFa: 'Schema Architecture' },
  { id: 'OUT-005', titleFa: 'Validation Engine' },
  { id: 'OUT-006', titleFa: 'Persian Input Normalization' },
  { id: 'OUT-007', titleFa: 'Currency, Unit & Date Standards' },
  { id: 'OUT-008', titleFa: 'Draft & Autosave Architecture' },
  { id: 'OUT-009', titleFa: 'Multi-step Form Architecture' },
  { id: 'OUT-010', titleFa: 'Conditional & Repeatable Field System' },
  { id: 'OUT-011', titleFa: 'Secure Upload Workflow' },
  { id: 'OUT-012', titleFa: 'Bulk Import Workflow' },
  { id: 'OUT-013', titleFa: 'Property Form Architecture' },
  { id: 'OUT-014', titleFa: 'Listing Form Architecture' },
  { id: 'OUT-015', titleFa: 'Neighborhood Data Form Architecture' },
  { id: 'OUT-016', titleFa: 'Research Form Architecture' },
  { id: 'OUT-017', titleFa: 'Administrative Form Architecture' },
  { id: 'OUT-018', titleFa: 'Review & Approval Workflow' },
  { id: 'OUT-019', titleFa: 'Version Conflict Resolution' },
  { id: 'OUT-020', titleFa: 'Field-level Permission Model' },
  { id: 'OUT-021', titleFa: 'Accessibility & RTL Standards' },
  { id: 'OUT-022', titleFa: 'Form Security Specification' },
  { id: 'OUT-023', titleFa: 'Form Performance Specification' },
  { id: 'OUT-024', titleFa: 'TypeScript Contracts' },
  { id: 'OUT-025', titleFa: 'Folder Structure & Ownership Rules' },
  { id: 'OUT-026', titleFa: 'Testing Strategy' },
  { id: 'OUT-027', titleFa: 'Form Telemetry Specification' },
  { id: 'OUT-028', titleFa: 'Cloudflare Integration Contract' },
  { id: 'OUT-029', titleFa: 'Migration Plan' },
  { id: 'OUT-030', titleFa: 'Acceptance Test Suite' },
] as const;
