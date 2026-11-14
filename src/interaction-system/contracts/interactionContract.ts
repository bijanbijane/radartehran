/** @file src/interaction-system/contracts/interactionContract.ts — RT-UI-INTERACTION-001 & RT-UI-VALIDATION-001 Pure Contracts */

export type InteractionStatus = 'idle' | 'pending' | 'success' | 'partial' | 'error' | 'cancelled';

export interface InteractionContract {
  id: string;
  source: string;
  action: string;
  preconditions: readonly string[];
  result: { affectedState: readonly string[]; feedback: string };
  persistence: { url: boolean; session: boolean; userPreference: boolean };
  failureHandling: { preservePreviousState: boolean; retryAllowed: boolean; recoveryAction?: string };
  accessibility: { keyboardSupported: boolean; announceResult: boolean };
}

export interface StateDomainOwnership {
  domain: 'navigation' | 'map' | 'query' | 'form' | 'data';
  titleFa: string;
  owner: 'Router' | 'MapState' | 'URL_and_QueryState' | 'FormState' | 'DataService';
  fields: readonly string[];
  persistencePolicy: 'url' | 'session' | 'userPreference' | 'canonicalData';
}

export const STATE_DOMAIN_OWNERSHIP: readonly StateDomainOwnership[] = [
  {
    domain: 'navigation',
    titleFa: 'وضعیت مسیر و ناوبری',
    owner: 'Router',
    fields: ['currentView', 'previousView', 'activeSubTab', 'activePanel', 'menuOpen', 'transientModal'],
    persistencePolicy: 'session',
  },
  {
    domain: 'map',
    titleFa: 'وضعیت مکانی نقشه',
    owner: 'MapState',
    fields: ['activeCity', 'center', 'zoom', 'viewportBounds', 'activeLayers', 'selectedEntity', 'activeTool', 'panelState'],
    persistencePolicy: 'url',
  },
  {
    domain: 'query',
    titleFa: 'وضعیت جست‌وجو و فیلتر',
    owner: 'URL_and_QueryState',
    fields: ['searchQuery', 'boundsFilter', 'dealMode', 'propertyType', 'priceRange', 'sqmRange', 'buildingAge', 'period', 'sortBy'],
    persistencePolicy: 'url',
  },
  {
    domain: 'form',
    titleFa: 'وضعیت فرم‌های تخصصی',
    owner: 'FormState',
    fields: ['values', 'validFields', 'invalidFields', 'draftSaved', 'submitting', 'submissionOutcome', 'requestId'],
    persistencePolicy: 'session',
  },
  {
    domain: 'data',
    titleFa: 'وضعیت داده و اعتبار',
    owner: 'DataService',
    fields: ['payload', 'updatedAt', 'loading', 'error', 'empty', 'partial', 'stale'],
    persistencePolicy: 'canonicalData',
  },
];

export const MOTION_DURATION_TOKENS_MS = {
  fast: 120,
  standard: 180,
  panel: 220,
  sheet: 260,
  searchDebounceDefault: 280,
  searchDebounceRange: [250, 350] as const,
} as const;

export const COMPARISON_LIMITS = {
  maxNeighborhoods: 4,
  maxProperties: 5,
  maxDrawnAreas: 4,
} as const;

export interface InteractionMatrixEntry {
  id: string;
  titleFa: string;
  priority: 'P0' | 'P1' | 'P2';
}

export const INTERACTION_MATRIX_INT: readonly InteractionMatrixEntry[] = [
  { id: 'INT-001', titleFa: 'جست‌وجوی سراسری', priority: 'P0' },
  { id: 'INT-002', titleFa: 'انتخاب محله روی نقشه', priority: 'P0' },
  { id: 'INT-003', titleFa: 'انتخاب ملک روی نقشه', priority: 'P0' },
  { id: 'INT-004', titleFa: 'تغییر لایه نقشه', priority: 'P0' },
  { id: 'INT-005', titleFa: 'فیلتر املاک', priority: 'P0' },
  { id: 'INT-006', titleFa: 'جابه‌جایی محدوده نقشه', priority: 'P0' },
  { id: 'INT-007', titleFa: 'باز و بسته کردن پنل نقشه', priority: 'P0' },
  { id: 'INT-008', titleFa: 'رفتن به شناسنامه محله', priority: 'P0' },
  { id: 'INT-009', titleFa: 'رفتن به جزئیات ملک', priority: 'P0' },
  { id: 'INT-010', titleFa: 'حفظ وضعیت هنگام بازگشت', priority: 'P0' },
  { id: 'INT-011', titleFa: 'ارزش‌گذاری ملک', priority: 'P0' },
  { id: 'INT-012', titleFa: 'انتخاب محدوده ترسیمی', priority: 'P1' },
  { id: 'INT-013', titleFa: 'مقایسه محله‌ها', priority: 'P1' },
  { id: 'INT-014', titleFa: 'مقایسه املاک', priority: 'P1' },
  { id: 'INT-015', titleFa: 'ذخیره نمای نقشه', priority: 'P1' },
  { id: 'INT-016', titleFa: 'ذخیره جست‌وجو', priority: 'P1' },
  { id: 'INT-017', titleFa: 'فیلتر و مرتب‌سازی گزارش‌ها', priority: 'P1' },
  { id: 'INT-018', titleFa: 'ثبت مشارکت اطلاعاتی', priority: 'P1' },
  { id: 'INT-019', titleFa: 'ثبت درخواست خدمات', priority: 'P1' },
  { id: 'INT-020', titleFa: 'مدیریت اطلاعات توسط مدیر', priority: 'P1' },
  { id: 'INT-021', titleFa: 'نمایش داده آفلاین مجاز', priority: 'P2' },
  { id: 'INT-022', titleFa: 'بازیابی عملیات ناقص', priority: 'P2' },
  { id: 'INT-023', titleFa: 'مقایسه پیشرفته محدوده‌ها', priority: 'P2' },
  { id: 'INT-024', titleFa: 'ذخیره و اشتراک‌گذاری گزارش سفارشی', priority: 'P2' },
];

export const INTERACTION_PROHIBITIONS_INTX: readonly { id: string; titleFa: string }[] = [
  { id: 'INTX-001', titleFa: 'کنترل بدون عملکرد واقعی' },
  { id: 'INTX-002', titleFa: 'عملیات بدون بازخورد' },
  { id: 'INTX-003', titleFa: 'از دست رفتن ناخواسته وضعیت' },
  { id: 'INTX-004', titleFa: 'ذخیره نتیجه بدون تأیید سرور' },
  { id: 'INTX-005', titleFa: 'اجرای چندباره عملیات حساس' },
  { id: 'INTX-006', titleFa: 'نمایش پاسخ درخواست منقضی‌شده' },
  { id: 'INTX-007', titleFa: 'ترکیب Draft و Applied Filters' },
  { id: 'INTX-008', titleFa: 'درخواست بی‌وقفه با هر حرکت نقشه' },
  { id: 'INTX-009', titleFa: 'نمایش داده ناقص به‌عنوان داده کامل' },
  { id: 'INTX-010', titleFa: 'وابستگی تمام صفحه به یک سرویس' },
  { id: 'INTX-011', titleFa: 'پنل‌های شناور تودرتوی بی‌ضابطه' },
  { id: 'INTX-012', titleFa: 'تداخل ژست نقشه و Bottom Sheet' },
  { id: 'INTX-013', titleFa: 'عملیات حساس بدون تأیید' },
  { id: 'INTX-014', titleFa: 'خطای بدون مسیر بازیابی' },
  { id: 'INTX-015', titleFa: 'ذخیره اطلاعات خصوصی بدون مجوز' },
  { id: 'INTX-016', titleFa: 'رنگ به‌عنوان تنها بازخورد' },
  { id: 'INTX-017', titleFa: 'Tooltip به‌عنوان محل اطلاعات حیاتی' },
  { id: 'INTX-018', titleFa: 'اجرای عملیات صرفاً با Hover' },
  { id: 'INTX-019', titleFa: 'از دست رفتن فرم پس از خطای شبکه' },
  { id: 'INTX-020', titleFa: 'انتقال نامرتبط فیلتر میان ماژول‌ها' },
  { id: 'INTX-021', titleFa: 'نمایش اطلاعات موجودیت اشتباه پس از تغییر انتخاب' },
  { id: 'INTX-022', titleFa: 'تاریخچه مرورگر بدون منطق' },
  { id: 'INTX-023', titleFa: 'حرکت‌های نمایشی طولانی و غیرضروری' },
  { id: 'INTX-024', titleFa: 'ثبت اطلاعات شخصی غیرضروری در Telemetry' },
  { id: 'INTX-025', titleFa: 'اتکا به پنهان کردن کنترل برای اعمال امنیت' },
];

export const INTERACTION_ACCEPTANCE_CRITERIA: readonly string[] = [
  '۱. معماری وضعیت‌های عمومی و اختصاصی تعریف شده است.',
  '۲. مالک هر نوع وضعیت مشخص شده است.',
  '۳. قواعد URL و حفظ وضعیت مستند شده‌اند.',
  '۴. رفتار انتخاب محله روی نقشه تعریف شده است.',
  '۵. رفتار انتخاب ملک تعریف شده است.',
  '۶. خوشه‌بندی نقاط و تغییر مقیاس تعریف شده است.',
  '۷. معماری Draft و Applied Filters مشخص است.',
  '۸. قواعد جست‌وجو و پاسخ‌های دیررس تعریف شده‌اند.',
  '۹. رفتار تغییر و ترکیب لایه‌های نقشه مستند شده است.',
  '۱۰. رفتار رسم و انتخاب محدوده مشخص است.',
  '۱۱. رفتار مقایسه موجودیت‌ها مشخص است.',
  '۱۲. فرآیند ارزش‌گذاری و مدیریت خطای آن طراحی شده است.',
  '۱۳. انتقال زمینه میان صفحات تعریف شده است.',
  '۱۴. Back و Forward رفتار مشخص دارند.',
  '۱۵. بازخورد موفقیت، خطا، هشدار و بارگذاری استاندارد شده است.',
  '۱۶. خطای یک ماژول باعث از کار افتادن سایر ماژول‌ها نمی‌شود.',
  '۱۷. مدیریت عملیات همزمان و درخواست‌های قدیمی تعریف شده است.',
  '۱۸. تعاملات موبایل و ژست‌های لمسی مشخص شده‌اند.',
  '۱۹. قواعد Keyboard و Screen Reader تعریف شده‌اند.',
  '۲۰. قواعد Reduced Motion تعریف شده‌اند.',
  '۲۱. رفتار اینترنت ضعیف و آفلاین مشخص شده است.',
  '۲۲. قواعد حریم خصوصی تعاملات مستند شده‌اند.',
  '۲۳. رویدادهای Telemetry طبقه‌بندی شده‌اند.',
  '۲۴. چهار سناریوی اصلی کاربری تست پذیرش دارند.',
  '۲۵. تست رگرسیون برای تعاملات مشترک تعریف شده است.',
];

export const STAGE_9_REFERENCE_DOCS = [
  'RT-UI-INTERACTION-001',
  'RT-UI-STATE-001',
  'RT-UI-FLOW-001',
  'RT-UI-INTERACTION-QA-001',
] as const;

export const STAGE_10_QA_SCENARIOS = [
  { id: 'Flow-A', titleFa: 'کشف محله (نقشه ← جست‌وجو ← شناسنامه ← تحلیل بازار ← بازگشت با حفظ زمینه)' },
  { id: 'Flow-B', titleFa: 'جست‌وجوی ملک (ورود به املاک ← فیلتر ← انتخاب روی نقشه ← جزئیات ← بازگشت با حفظ فیلتر)' },
  { id: 'Flow-C', titleFa: 'ارزش‌گذاری (انتخاب موقعیت ← مشخصات ← اعتبارسنجی ← محاسبه یکتا ← حفظ فرم در خطای شبکه)' },
  { id: 'Flow-D', titleFa: 'تغییر لایه نقشه (درخواست لایه ← Legend و تاریخ داده ← ایزوله‌سازی خطای لایه بدون حذف سایر لایه‌ها)' },
] as const;
