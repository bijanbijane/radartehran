/**
 * Stage 16 — Spec Constants & Catalogs for RT-FE-INTERACTION-PATTERNS-016
 * Frontend Interaction Patterns, Control Behaviors & Micro-interactions
 */

export const RT_FE_INTERACTION_PATTERNS_016_SPEC_ID = 'RT-FE-INTERACTION-PATTERNS-016' as const;
export const RT_FE_STAGE17_BRIDGE_SPEC_ID = 'RT-FE-FORM-WORKFLOW-017' as const;

export const RT_INT_MODEL_STEPS_5 = [
  { step: 1, nameEn: 'Trigger', roleFa: 'محرک تعامل (کلیک، لمس، صفحه‌کلید، Drag، رویداد نقشه/نمودار یا پاسخ سرور)' },
  { step: 2, nameEn: 'Interaction Handler', roleFa: 'تشخیص نوع تعامل در مرز کنترل بدون اجرای مستقیم منطق تجاری' },
  { step: 3, nameEn: 'State Transition', roleFa: 'گذار صریح وضعیت پیش و پس (مثلاً Closed → Opening → Open)' },
  { step: 4, nameEn: 'User Feedback', roleFa: 'بازخورد متناسب (Toast / Inline / Progress / Focus / Live Region)' },
  { step: 5, nameEn: 'Completion / Recovery', roleFa: 'پایان شفاف (موفق، شکست، لغو، Timeout، یا مسیر بازیابی بدون اتلاف داده)' },
] as const;

export const RT_INT_CATEGORIES_16 = [
  { code: 'INT-001', nameEn: 'Direct Interaction', sampleFa: 'کلیک و لمس (هدف لمسی ≥ 24×24 CSS px)' },
  { code: 'INT-002', nameEn: 'Selection', sampleFa: 'انتخاب تکی، چندتایی، بازه‌ای، سلسله‌مراتبی و مکانی' },
  { code: 'INT-003', nameEn: 'Navigation Interaction', sampleFa: 'بازکردن یا تغییر بخش هم‌راستا با مرحله ۱۴' },
  { code: 'INT-004', nameEn: 'Action Execution', sampleFa: 'عملیات اصلی، ثانویه، تخریبی، گروهی و طولانی' },
  { code: 'INT-005', nameEn: 'Confirmation', sampleFa: 'ماتریس C0 تا C4 و تأیید متنی متناسب با ریسک' },
  { code: 'INT-006', nameEn: 'Feedback', sampleFa: '۹ الگوی Inline، Toast، Banner، Progress و Status' },
  { code: 'INT-007', nameEn: 'Form Interaction', sampleFa: 'چرخه ورود، Dirty State، Autosave و حفظ ورودی در خطا' },
  { code: 'INT-008', nameEn: 'Data Interaction', sampleFa: 'مرتب‌سازی، فیلتر، تغییر عرض ستون جدول با صفحه‌کلید' },
  { code: 'INT-009', nameEn: 'Spatial Interaction', sampleFa: 'انتخاب Marker، ترسیم Polygon و اولویت Gesture در Leaflet' },
  { code: 'INT-010', nameEn: 'Analytical Interaction', sampleFa: 'Tooltip دقیق با واحد، انتخاب بازه لمسی و Drill-down نمودار' },
  { code: 'INT-011', nameEn: 'Drag & Drop', sampleFa: 'جابه‌جایی با هدف مقصد روشن و دکمه جایگزین صفحه‌کلیدی' },
  { code: 'INT-012', nameEn: 'Contextual Interaction', sampleFa: 'عملیات وابسته به موجودیت معتبر و پاک‌سازی در Context Loss' },
  { code: 'INT-013', nameEn: 'Progressive Disclosure', sampleFa: '۴ سطح نمایش (ضروری، تکمیلی، تخصصی، پیشرفته)' },
  { code: 'INT-014', nameEn: 'Recovery Interaction', sampleFa: 'بازیابی کنترل‌شده ۸ نوع خطا بدون پاک‌شدن داده کاربر' },
  { code: 'INT-015', nameEn: 'Keyboard Interaction', sampleFa: 'ناوبری کامل با Tab/Arrows/Escape و Shortcut Registry بدون تعارض' },
  { code: 'INT-016', nameEn: 'Motion Interaction', sampleFa: 'ریزتعامل‌های ۸۰ تا ۳۰۰ms سازگار با prefers-reduced-motion' },
] as const;

export const RT_INT_STATES_13 = [
  'Idle', 'Hovered', 'Focused', 'Pressed', 'Active', 'Selected',
  'Disabled', 'Loading', 'Success', 'Error', 'Warning', 'Pending', 'Cancelled',
] as const;

export const RT_INT_CONFIRMATION_LEVELS_5 = [
  { level: 'C0' as const, typeFa: 'عملیات بی‌خطر (مشاهده/فیلتر)', requiresConfirm: false, ruleFa: 'بدون نیاز به Dialog تأیید' },
  { level: 'C1' as const, typeFa: 'تغییر قابل بازگشت (مرتب‌سازی/بوکمارک)', requiresConfirm: false, ruleFa: 'اجرای مستقیم همراه با امکان Undo در Toast' },
  { level: 'C2' as const, typeFa: 'تغییر مهم (تغییر وضعیت آگهی)', requiresConfirm: true, ruleFa: 'تأیید Context-aware بسته به پیامد' },
  { level: 'C3' as const, typeFa: 'حذف یا تغییر حساس', requiresConfirm: true, ruleFa: 'ذکر دقیق موضوع، تعداد موارد و امکان بازیابی' },
  { level: 'C4' as const, typeFa: 'غیرقابل بازگشت یا پرخطر (حذف گروهی تأییدشده)', requiresConfirm: true, ruleFa: 'تأیید صریح دومرحله‌ای + کنترل Backend' },
] as const;

export const RT_INT_RECOVERY_STRATEGIES_8 = [
  { failureType: 'Network', behaviorFa: 'حفظ ورودی کاربر و ارائه Retry بدون اعلام موفقیت کاذب Offline' },
  { failureType: 'Validation', behaviorFa: 'نمایش خطای موضعی کنار فیلد و هدایت منطقی Focus' },
  { failureType: 'Permission', behaviorFa: 'تفکیک عدم دسترسی (403) از غیرفعال موقت و توضیح روشن' },
  { failureType: 'Conflict', behaviorFa: 'حفظ تغییرات محلی و نمایش گزینه‌های حل تعارض نسخه' },
  { failureType: 'Timeout', behaviorFa: 'بررسی وضعیت عملیات پیش از تکرار برای جلوگیری از اجرای مضاعف' },
  { failureType: 'Server Failure', behaviorFa: 'پیام روشن + شناسه پیگیری بدون نمایش Stack Trace' },
  { failureType: 'Cancelled', behaviorFa: 'لغو تمیز و بازگشت به وضعیت پایدار قبلی' },
  { failureType: 'Invalid Context', behaviorFa: 'غیرفعال‌سازی عملیات وابسته و هدایت به Context معتبر' },
] as const;

export const RT_INT_MOTION_TOKENS_5 = [
  { category: 'control' as const, labelFa: 'واکنش کوتاه کنترل (Button/Checkbox)', minMs: 80, maxMs: 140, defaultMs: 110 },
  { category: 'state' as const, labelFa: 'تغییر وضعیت (Toggle/Selection)', minMs: 120, maxMs: 200, defaultMs: 160 },
  { category: 'panel' as const, labelFa: 'باز/بسته شدن پنل جانبی', minMs: 180, maxMs: 260, defaultMs: 220 },
  { category: 'drawer' as const, labelFa: 'حرکت Drawer / Bottom Sheet', minMs: 200, maxMs: 300, defaultMs: 240 },
  { category: 'modal' as const, labelFa: 'نمایش Modal / Dialog', minMs: 150, maxMs: 220, defaultMs: 180 },
] as const;

export const RT_INT_EXECUTION_PHASES_10 = [
  { phase: 1, outputId: 'RT-FE-INT-INV-001', titleFa: 'شناسایی کنترل‌ها و تعاملات موجود' },
  { phase: 2, outputId: 'RT-FE-INT-CONTRACT-001', titleFa: 'تعریف Interaction، Action، Feedback و Selection Contracts' },
  { phase: 3, outputId: 'RT-FE-INT-BASE-001', titleFa: 'الگوهای پایه (Hover/Focus/Pressed/Loading/Pending)' },
  { phase: 4, outputId: 'RT-FE-INT-ACTION-001', titleFa: 'Action Execution، C0-C4 Confirmation، Toast، Undo و Retry' },
  { phase: 5, outputId: 'RT-FE-INT-SELECTION-001', titleFa: 'استانداردسازی Single، Multi، Range، Hierarchical Selection' },
  { phase: 6, outputId: 'RT-FE-INT-SPECIALIZED-001', titleFa: 'استانداردسازی Form، Table، Map، Chart و Drag & Drop' },
  { phase: 7, outputId: 'RT-FE-INT-MOTION-001', titleFa: 'Motion Tokens، Micro-interactions و Reduced Motion' },
  { phase: 8, outputId: 'RT-FE-INT-A11Y-001', titleFa: 'Keyboard Patterns، Shortcut Registry و Touch Target' },
  { phase: 9, outputId: 'RT-FE-INT-MIGRATION-001', titleFa: 'مهاجرت ۵ صفحه اصلی محصول به الگوهای تعاملی مشترک' },
  { phase: 10, outputId: 'RT-FE-INT-VALIDATION-001', titleFa: 'آزمون‌های Unit، Integration، E2E، A11y و رگرسیون تعاملی' },
] as const;

export const RT_INT_DELIVERABLES_30 = [
  { id: 'RT-FE-INT-OUT-001', titleFa: 'سند معماری Interaction Patterns' },
  { id: 'RT-FE-INT-OUT-002', titleFa: 'فهرست تعاملات موجود' },
  { id: 'RT-FE-INT-OUT-003', titleFa: 'مدل عمومی Interaction State' },
  { id: 'RT-FE-INT-OUT-004', titleFa: 'قرارداد Trigger و Handler' },
  { id: 'RT-FE-INT-OUT-005', titleFa: 'قرارداد Action' },
  { id: 'RT-FE-INT-OUT-006', titleFa: 'قرارداد Feedback' },
  { id: 'RT-FE-INT-OUT-007', titleFa: 'معماری Selection' },
  { id: 'RT-FE-INT-OUT-008', titleFa: 'معماری Confirmation' },
  { id: 'RT-FE-INT-OUT-009', titleFa: 'معماری Loading و Progress' },
  { id: 'RT-FE-INT-OUT-010', titleFa: 'معماری Form Interaction' },
  { id: 'RT-FE-INT-OUT-011', titleFa: 'معماری Table Interaction' },
  { id: 'RT-FE-INT-OUT-012', titleFa: 'معماری Map Interaction' },
  { id: 'RT-FE-INT-OUT-013', titleFa: 'معماری Chart Interaction' },
  { id: 'RT-FE-INT-OUT-014', titleFa: 'معماری Drag & Drop' },
  { id: 'RT-FE-INT-OUT-015', titleFa: 'معماری Progressive Disclosure' },
  { id: 'RT-FE-INT-OUT-016', titleFa: 'معماری Undo و Redo' },
  { id: 'RT-FE-INT-OUT-017', titleFa: 'معماری Contextual Interaction' },
  { id: 'RT-FE-INT-OUT-018', titleFa: 'معماری Micro-interactions' },
  { id: 'RT-FE-INT-OUT-019', titleFa: 'معماری Motion Design' },
  { id: 'RT-FE-INT-OUT-020', titleFa: 'استاندارد Keyboard Interaction' },
  { id: 'RT-FE-INT-OUT-021', titleFa: 'استاندارد Interaction Accessibility' },
  { id: 'RT-FE-INT-OUT-022', titleFa: 'معماری Offline و Retry Interaction' },
  { id: 'RT-FE-INT-OUT-023', titleFa: 'معماری Interaction Error Recovery' },
  { id: 'RT-FE-INT-OUT-024', titleFa: 'Interaction Registry' },
  { id: 'RT-FE-INT-OUT-025', titleFa: 'قراردادهای TypeScript' },
  { id: 'RT-FE-INT-OUT-026', titleFa: 'ساختار پوشه و مالکیت' },
  { id: 'RT-FE-INT-OUT-027', titleFa: 'مجموعه آزمون‌های تعاملی' },
  { id: 'RT-FE-INT-OUT-028', titleFa: 'استاندارد Telemetry' },
  { id: 'RT-FE-INT-OUT-029', titleFa: 'برنامه مهاجرت' },
  { id: 'RT-FE-INT-OUT-030', titleFa: 'گزارش معیارهای پذیرش' },
] as const;
