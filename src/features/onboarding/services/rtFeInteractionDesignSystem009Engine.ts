/**
 * Stage 9 — Tehran Radar Comprehensive Frontend Roadmap
 * Spec ID: RT-FE-INTERACTION-DESIGN-SYSTEM-009
 * Interaction Design System (IDS-001..023, Lifecycle, Async Race Guard, Shortcuts, Error Recovery & IDS-OUT-001..025)
 */

export const RT_FE_INTERACTION_DESIGN_SYSTEM_009_SPEC_ID = 'RT-FE-INTERACTION-DESIGN-SYSTEM-009' as const;

export interface IdsProtectionLevelSpec {
  levelId: 'normal' | 'reversible' | 'important' | 'destructive' | 'irreversible';
  titleFa: string;
  behaviorFa: string;
  requiresConfirmation: boolean;
  supportsUndo: boolean;
}

export const RT_FE_IDS_PROTECTION_LEVELS_5: readonly IdsProtectionLevelSpec[] = [
  { levelId: 'normal', titleFa: 'عادی', behaviorFa: 'اجرای مستقیم بدون وقفه اضافه', requiresConfirmation: false, supportsUndo: false },
  { levelId: 'reversible', titleFa: 'قابل بازگشت', behaviorFa: 'اجرا با امکان Undo موقت و بازگردانی وضعیت قبلی', requiresConfirmation: false, supportsUndo: true },
  { levelId: 'important', titleFa: 'مهم', behaviorFa: 'نمایش نتیجه صریح و تأیید وضعیت پس از اجرا', requiresConfirmation: false, supportsUndo: false },
  { levelId: 'destructive', titleFa: 'مخرب', behaviorFa: 'تأیید پیش از اجرا در دیالوگ محافظت‌شده', requiresConfirmation: true, supportsUndo: false },
  { levelId: 'irreversible', titleFa: 'غیرقابل بازگشت', behaviorFa: 'تأیید صریح چندمرحله‌ای و نمایش پیامد دقیق عملیات', requiresConfirmation: true, supportsUndo: false },
] as const;

export const RT_FE_IDS_LIFECYCLE_8_STEPS = [
  { step: 1, key: 'User Action', roleFa: 'اقدام کاربر (کلیک، لمس، صفحه‌کلید)' },
  { step: 2, key: 'Input Event', roleFa: 'دریافت و نرمال‌سازی رویداد ورودی' },
  { step: 3, key: 'Interaction Handler', roleFa: 'اجرای منطق کنترل‌کننده تعامل' },
  { step: 4, key: 'State Validation', roleFa: 'بررسی مجازبودن تغییر وضعیت در رابط' },
  { step: 5, key: 'State Transition', roleFa: 'انتقال وضعیت (Idle -> Running -> ...)' },
  { step: 6, key: 'UI Update', roleFa: 'به‌روزرسانی اتمی نمای رابط کاربری' },
  { step: 7, key: 'User Feedback', roleFa: 'اطلاع‌رسانی نتیجه (Inline / Toast / Alert)' },
  { step: 8, key: 'Completion / Recovery', roleFa: 'تکمیل نهایی یا فراهم‌سازی مسیر اصلاح و تلاش مجدد' },
] as const;

export const RT_FE_IDS_ASYNC_STATES_8 = [
  'Idle',
  'Pending',
  'Running',
  'Success',
  'Partial Success',
  'Failed',
  'Cancelled',
  'Timed Out',
] as const;

export type IdsAsyncOperationState = (typeof RT_FE_IDS_ASYNC_STATES_8)[number];

export interface IdsKeyboardShortcutSpec {
  shortcut: string;
  actionFa: string;
  ignoredInTextInputs: boolean;
}

export const RT_FE_IDS_KEYBOARD_SHORTCUTS_8: readonly IdsKeyboardShortcutSpec[] = [
  { shortcut: '/', actionFa: 'تمرکز مستقیم روی فیلد جست‌وجو', ignoredInTextInputs: true },
  { shortcut: 'Esc', actionFa: 'بستن Overlay فعال یا لغو عملیات جاری', ignoredInTextInputs: false },
  { shortcut: 'Ctrl/Cmd + K', actionFa: 'بازکردن جست‌وجوی سراسری و فرمان‌ها (Command Palette)', ignoredInTextInputs: false },
  { shortcut: 'Ctrl/Cmd + S', actionFa: 'ذخیره در فرم‌ها و بخش‌های پشتیبانی‌شده', ignoredInTextInputs: false },
  { shortcut: 'Ctrl/Cmd + Z', actionFa: 'بازگردانی (Undo) در محیط‌های مجاز و قابل بازگشت', ignoredInTextInputs: true },
  { shortcut: 'Tab', actionFa: 'حرکت ترتیبی میان عناصر فوکوس‌پذیر', ignoredInTextInputs: false },
  { shortcut: 'Shift + Tab', actionFa: 'حرکت معکوس میان عناصر فوکوس‌پذیر', ignoredInTextInputs: false },
  { shortcut: 'Arrow Keys', actionFa: 'حرکت در کنترل‌های مناسب (Tabs، جدول، لیست پیشنهادها، نقشه)', ignoredInTextInputs: true },
] as const;

export interface IdsErrorRecoverySpec {
  errorClass: string;
  titleFa: string;
  recoveryBehaviorFa: string;
  preservesUserInput: boolean;
}

export const RT_FE_IDS_ERROR_RECOVERY_10: readonly IdsErrorRecoverySpec[] = [
  { errorClass: 'Input Error', titleFa: 'خطای ورودی', recoveryBehaviorFa: 'نمایش پیام کنار فیلد و اصلاح فوری بدون پاک‌شدن فرم', preservesUserInput: true },
  { errorClass: 'Validation Error', titleFa: 'خطای اعتبارسنجی', recoveryBehaviorFa: 'هدایت Focus به اولین فیلد نامعتبر و توضیح دقیق علت', preservesUserInput: true },
  { errorClass: 'Network Error', titleFa: 'قطع شبکه', recoveryBehaviorFa: 'حفظ داده محلی و دکمه تلاش مجدد (Retry)', preservesUserInput: true },
  { errorClass: 'Timeout', titleFa: 'اتمام مهلت پاسخ (Timeout)', recoveryBehaviorFa: 'بررسی وضعیت با کلید Idempotency و تلاش مجدد کنترل‌شده', preservesUserInput: true },
  { errorClass: 'Permission Error', titleFa: 'عدم دسترسی (403)', recoveryBehaviorFa: 'نمایش پیام شفاف محدودیت سطح دسترسی بدون افشای ساختار داخلی', preservesUserInput: true },
  { errorClass: 'Conflict Error', titleFa: 'تعارض نسخه داده (409)', recoveryBehaviorFa: 'دریافت نسخه جدید، نمایش تفاوت و حل تعارض بدون حذف داده کاربر', preservesUserInput: true },
  { errorClass: 'Resource Not Found', titleFa: 'منبع حذف‌شده یا ناموجود (404)', recoveryBehaviorFa: 'بازگشت ایمن به فهرست یا مسیر معتبر بالاتر', preservesUserInput: false },
  { errorClass: 'Rate Limit', titleFa: 'محدودیت نرخ درخواست (429)', recoveryBehaviorFa: 'نمایش زمان انتظار باقی‌مانده و جلوگیری از ارسال رگباری', preservesUserInput: true },
  { errorClass: 'Server Error', titleFa: 'خطای سرور (5xx)', recoveryBehaviorFa: 'حفظ پیش‌نویس محلی و ارائه شناسه پیگیری فنی (Trace ID)', preservesUserInput: true },
  { errorClass: 'Unexpected Error', titleFa: 'خطای پیش‌بینی‌نشده', recoveryBehaviorFa: 'مهار در Error Boundary محلی و امکان بازنشانی بخش آسیب‌دیده', preservesUserInput: true },
] as const;

export const RT_FE_IDS_STATE_OWNERSHIP_5 = [
  { tier: 'Component State', owner: 'Component', examplesFa: 'بازبودن Dropdown، مقدار موقت Input، وضعیت Hover/Focus' },
  { tier: 'Page State', owner: 'Page Controller', examplesFa: 'Tab محلی فعال، ترتیب جدول، پنل بازشده در صفحه' },
  { tier: 'Feature State', owner: 'Feature Controller', examplesFa: 'ملک یا محله انتخاب‌شده، لایه‌های فعال نقشه، نتایج جست‌وجو' },
  { tier: 'Application State', owner: 'Application Provider', examplesFa: 'هویت کاربر، تم، زبان، تراکم نمایشی، وضعیت اعلان‌ها' },
  { tier: 'URL State', owner: 'URL Router', examplesFa: 'شناسه ملک، شهر/محله، فیلترهای جست‌وجو، بازه زمانی، صفحه نتایج' },
] as const;

export const RT_FE_IDS_RESPONSIVE_MATRIX_9 = [
  { interaction: 'Hover', desktop: 'بله', tablet: 'محدود', mobile: 'خیر (جایگزین Tap)' },
  { interaction: 'Click / Tap', desktop: 'بله', tablet: 'بله', mobile: 'بله (حداقل هدف لمسی استاندارد)' },
  { interaction: 'Keyboard', desktop: 'کامل + میان‌برها', tablet: 'پشتیبانی در صورت اتصال', mobile: 'محدود به صفحه‌کلید مجازی' },
  { interaction: 'Sidebar', desktop: 'ثابت / جمع‌شونده', tablet: 'جمع‌شونده', mobile: 'Drawer کشویی' },
  { interaction: 'Table', desktop: 'کامل با کنترل ستون‌ها', tablet: 'قابل تنظیم و اسکرول افقی', mobile: 'کارت خلاصه یا جدول محدود' },
  { interaction: 'Map', desktop: 'Mouse + Keyboard', tablet: 'Touch چندانگشتی', mobile: 'Touch + Bottom Sheet' },
  { interaction: 'Filter', desktop: 'پنل کناری یا نوار بالا', tablet: 'پنل بازشو', mobile: 'Drawer مرحله‌ای تمام‌صفحه' },
  { interaction: 'Tooltip', desktop: 'Hover + Focus', tablet: 'Focus + Touch', mobile: 'Popover کوتاه یا توضیح درون‌خطی' },
  { interaction: 'Drag & Drop', desktop: 'در موارد مجاز + صفحه‌کلید', tablet: 'محدود', mobile: 'محدود با جایگزین دکمه‌ای مرتب‌سازی' },
] as const;

export const RT_FE_IDS_23_UNITS = [
  { id: 'IDS-001', titleFa: 'اصول بنیادین طراحی تعامل (پیش‌بینی‌پذیری، بازخورد فوری، حفاظت عملیات)' },
  { id: 'IDS-002', titleFa: 'معماری مدل چرخه تعامل ۸مرحله‌ای و قرارداد ۹فیلدی کامپوننت' },
  { id: 'IDS-003', titleFa: 'معماری رویدادهای ورودی (Mouse, Touch, Keyboard, Assistive Tech)' },
  { id: 'IDS-004', titleFa: 'معماری Click و Touch و ۸ وضعیت عملیاتی دکمه‌ها و Toggle' },
  { id: 'IDS-005', titleFa: 'معماری مدیریت فوکوس (Modal Focus Trap، Drawer و صفحات جدید)' },
  { id: 'IDS-006', titleFa: 'معماری سیستم انتخاب ۸گانه (Single, Multiple, Range, Hierarchical, Geo)' },
  { id: 'IDS-007', titleFa: 'معماری تعاملات ناوبری (Navigation vs Local Tabs، Pagination، حفظ وضعیت)' },
  { id: 'IDS-008', titleFa: 'معماری تعامل فرم‌ها، اعتبارسنجی ۵سطحی و فرم‌های چندمرحله‌ای ۵گامی' },
  { id: 'IDS-009', titleFa: 'معماری تعامل لایه‌های شناور (Modal, Drawer, Popover, Tooltip & Overlay Manager)' },
  { id: 'IDS-010', titleFa: 'معماری بازخورد تعاملی ۸گانه و پیام‌های عملیاتی شفاف' },
  { id: 'IDS-011', titleFa: 'معماری بارگذاری غیرهم‌زمان ۸حالته، Partial Success و مهار Race Condition' },
  { id: 'IDS-012', titleFa: 'معماری تعامل با جداول حرفه‌ای (۱۲ رفتار استاندارد و شخصی‌سازی ستون‌ها)' },
  { id: 'IDS-013', titleFa: 'معماری تعامل با نمودارها (Tooltip، Legend، ۶ بازه زمانی و Zoom)' },
  { id: 'IDS-014', titleFa: 'معماری تعامل با نقشه (۱۳ رفتار، Cluster، رسم محدوده و همگام‌سازی پنل)' },
  { id: 'IDS-015', titleFa: 'معماری تعامل جست‌وجو، Autocomplete و فیلترهای وابسته مکانی' },
  { id: 'IDS-016', titleFa: 'معماری Drag & Drop و جایگزین‌های دسترس‌پذیر صفحه‌کلید و موبایل' },
  { id: 'IDS-017', titleFa: 'معماری Undo و Redo برای عملیات واقعاً قابل بازگشت' },
  { id: 'IDS-018', titleFa: 'معماری میان‌برهای صفحه‌کلید (۸ میان‌بر استاندارد کاربران حرفه‌ای)' },
  { id: 'IDS-019', titleFa: 'معماری مدیریت ۱۰ طبقه خطا، بازیابی و حفاظت از اطلاعات واردشده' },
  { id: 'IDS-020', titleFa: 'معماری وضعیت تعاملی ۵لایه و قانون تک‌مالکی وضعیت (Single Owner)' },
  { id: 'IDS-021', titleFa: 'معماری تعامل در دسکتاپ، تبلت و موبایل (ماتریس ۹ردیفه تطبیق رفتار)' },
  { id: 'IDS-022', titleFa: 'معماری اتصال تعاملات به Backend و Cloudflare (D1, R2, KV, Queues)' },
  { id: 'IDS-023', titleFa: 'معماری مستندسازی تعاملات ۱۷فیلدی (IDS-MAP-001..IDS-OVERLAY-001)' },
] as const;

export const RT_FE_IDS_DELIVERABLES_25 = [
  { id: 'IDS-OUT-001', titleFa: 'منشور اصول تعامل (Interaction Principles)' },
  { id: 'IDS-OUT-002', titleFa: 'مدل چرخه تعامل (Interaction Lifecycle)' },
  { id: 'IDS-OUT-003', titleFa: 'قرارداد تعامل کامپوننت‌ها (Interaction Contract)' },
  { id: 'IDS-OUT-004', titleFa: 'استاندارد رویدادهای ورودی (Input Event Standard)' },
  { id: 'IDS-OUT-005', titleFa: 'استاندارد کلیک و لمس (Click & Touch Standard)' },
  { id: 'IDS-OUT-006', titleFa: 'استاندارد مدیریت فوکوس (Focus Management Standard)' },
  { id: 'IDS-OUT-007', titleFa: 'معماری سیستم انتخاب (Selection Architecture)' },
  { id: 'IDS-OUT-008', titleFa: 'قرارداد تعاملات ناوبری (Navigation Interaction)' },
  { id: 'IDS-OUT-009', titleFa: 'قرارداد تعامل فرم‌ها (Form Interaction)' },
  { id: 'IDS-OUT-010', titleFa: 'الگوی فرم‌های چندمرحله‌ای (Multi-step Form Interaction)' },
  { id: 'IDS-OUT-011', titleFa: 'قرارداد تعامل لایه‌های شناور (Overlay Interaction)' },
  { id: 'IDS-OUT-012', titleFa: 'سیستم بازخورد عملیات (Feedback System)' },
  { id: 'IDS-OUT-013', titleFa: 'مدل عملیات غیرهم‌زمان (Async Interaction Model)' },
  { id: 'IDS-OUT-014', titleFa: 'مدل تعامل جداول (Table Interaction Model)' },
  { id: 'IDS-OUT-015', titleFa: 'مدل تعامل نمودارها (Chart Interaction Model)' },
  { id: 'IDS-OUT-016', titleFa: 'مدل تعامل نقشه (Map Interaction Model)' },
  { id: 'IDS-OUT-017', titleFa: 'الگوی تعامل جست‌وجو و فیلتر (Search & Filter Interaction)' },
  { id: 'IDS-OUT-018', titleFa: 'استاندارد Drag & Drop و جایگزین‌های دسترس‌پذیر' },
  { id: 'IDS-OUT-019', titleFa: 'استاندارد Undo / Redo برای عملیات قابل بازگشت' },
  { id: 'IDS-OUT-020', titleFa: 'دفتر ثبت میان‌برهای صفحه‌کلید (Keyboard Shortcut Registry)' },
  { id: 'IDS-OUT-021', titleFa: 'مدل مدیریت خطا و بازیابی (Error Recovery Model)' },
  { id: 'IDS-OUT-022', titleFa: 'معماری وضعیت‌های تعاملی (Interaction State Architecture)' },
  { id: 'IDS-OUT-023', titleFa: 'ماتریس تطبیق تعامل واکنش‌گرا (Responsive Interaction Matrix)' },
  { id: 'IDS-OUT-024', titleFa: 'قرارداد اتصال تعاملات به بک‌اند و Cloudflare (Backend Interaction Contract)' },
  { id: 'IDS-OUT-025', titleFa: 'مستندات الگوهای تعاملی (Interaction Documentation)' },
] as const;

export interface AsyncRaceEvaluationResult {
  accepted: boolean;
  activeRequestSeq: number;
  ignoredStaleResponse: boolean;
  reasonFa: string;
}

/**
 * Prevents stale out-of-order async filter/map responses from overwriting newer UI state (IDS-011 §13.4).
 */
export function evaluateAsyncRequestOrdering(
  latestIssuedSeq: number,
  incomingResponseSeq: number,
  wasCancelledByUser: boolean = false,
): AsyncRaceEvaluationResult {
  if (wasCancelledByUser) {
    return {
      accepted: false,
      activeRequestSeq: latestIssuedSeq,
      ignoredStaleResponse: true,
      reasonFa: 'درخواست توسط کاربر لغو شده است (Cancelled) و به‌عنوان خطا گزارش نمی‌شود.',
    };
  }
  if (incomingResponseSeq < latestIssuedSeq) {
    return {
      accepted: false,
      activeRequestSeq: latestIssuedSeq,
      ignoredStaleResponse: true,
      reasonFa: `پاسخ قدیمی (#${incomingResponseSeq}) نادیده گرفته شد تا وضعیت درخواست جدیدتر (#${latestIssuedSeq}) بازنویسی نشود.`,
    };
  }
  return {
    accepted: true,
    activeRequestSeq: incomingResponseSeq,
    ignoredStaleResponse: false,
    reasonFa: `پاسخ درخواست فعال (#${incomingResponseSeq}) معتبر است و رابط کاربری به‌روزرسانی شد.`,
  };
}
