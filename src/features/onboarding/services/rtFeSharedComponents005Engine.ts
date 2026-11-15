/**
 * RT-FE-SHARED-COMPONENTS-005: مرحله پنجم — طراحی و معماری کتابخانه کامپوننت‌های مشترک (Shared Component Library)
 * (60 Components COMP-001..COMP-060 across 8 Groups, 3-Tier Classification Primitive/Composite/Domain,
 * 14 Behavioral States & Priority Precedence, Cascading LocationSelector, Cloudflare/Backend Isolation & SC-OUT-001..025)
 */

export const RT_FE_SHARED_COMPONENTS_005_SPEC_ID = 'RT-FE-SHARED-COMPONENTS-005' as const;

export type SharedComponentTier = 'Primitive' | 'Composite' | 'Domain';

export type SharedComponentGroup =
  | 'primitives'
  | 'forms'
  | 'data-display'
  | 'navigation'
  | 'feedback'
  | 'overlays'
  | 'composites'
  | 'domain';

export interface SharedComponentSpec {
  code: string;
  name: string;
  tier: SharedComponentTier;
  group: SharedComponentGroup;
  folderPath: string;
  responsibilityFa: string;
}

export const RT_FE_SC_60_COMPONENTS: readonly SharedComponentSpec[] = [
  // Group 1: Primitives (COMP-001..006)
  { code: 'COMP-001', name: 'Button', tier: 'Primitive', group: 'primitives', folderPath: 'shared/ui/primitives/button', responsibilityFa: 'اجرای عملیات کاربر با ۶ تنوع ظاهری و قفل اجرای تکراری در حالت Loading' },
  { code: 'COMP-002', name: 'Icon', tier: 'Primitive', group: 'primitives', folderPath: 'shared/ui/primitives/icon', responsibilityFa: 'نمایش آیکون‌های استاندارد مرکزی با پشتیبانی جهت RTL' },
  { code: 'COMP-003', name: 'Badge', tier: 'Primitive', group: 'primitives', folderPath: 'shared/ui/primitives/badge', responsibilityFa: 'نمایش وضعیت، دسته‌بندی یا برچسب کوتاه در ۶ حالت معنایی' },
  { code: 'COMP-004', name: 'Text & Heading', tier: 'Primitive', group: 'primitives', folderPath: 'shared/ui/primitives/text', responsibilityFa: 'یکپارچه‌سازی نمایش متن‌ها و عنوان‌ها بر اساس مقیاس تایپوگرافی' },
  { code: 'COMP-005', name: 'Divider', tier: 'Primitive', group: 'primitives', folderPath: 'shared/ui/primitives/divider', responsibilityFa: 'تفکیک بصری افقی و عمودی بخش‌ها بدون جایگزینی فاصله‌گذاری' },
  { code: 'COMP-006', name: 'Spinner', tier: 'Primitive', group: 'primitives', folderPath: 'shared/ui/primitives/spinner', responsibilityFa: 'نمایش بارگذاری عملیات کوتاه بدون جابه‌جایی Layout' },
  // Group 2: Forms (COMP-007..015)
  { code: 'COMP-007', name: 'Input', tier: 'Primitive', group: 'forms', folderPath: 'shared/ui/forms/input', responsibilityFa: 'دریافت داده تک‌خطی با تفکیک مقدار خام و نمایشی و حفظ واحد پول' },
  { code: 'COMP-008', name: 'Textarea', tier: 'Primitive', group: 'forms', folderPath: 'shared/ui/forms/textarea', responsibilityFa: 'دریافت متن چندخطی با شمارنده کاراکتر و کنترل ارتفاع' },
  { code: 'COMP-009', name: 'Select', tier: 'Primitive', group: 'forms', folderPath: 'shared/ui/forms/select', responsibilityFa: 'انتخاب گزینه از مجموعه محدود (Single, Searchable, Grouped, Clearable)' },
  { code: 'COMP-010', name: 'Checkbox', tier: 'Primitive', group: 'forms', folderPath: 'shared/ui/forms/checkbox', responsibilityFa: 'انتخاب چندگانه با پشتیبانی از وضعیت Indeterminate' },
  { code: 'COMP-011', name: 'Radio', tier: 'Primitive', group: 'forms', folderPath: 'shared/ui/forms/radio', responsibilityFa: 'انتخاب یک گزینه از چند گزینه محدود' },
  { code: 'COMP-012', name: 'Switch', tier: 'Primitive', group: 'forms', folderPath: 'shared/ui/forms/switch', responsibilityFa: 'فعال یا غیرفعال‌سازی فوری و برگشت‌پذیر یک قابلیت' },
  { code: 'COMP-013', name: 'Slider', tier: 'Primitive', group: 'forms', folderPath: 'shared/ui/forms/slider', responsibilityFa: 'انتخاب بازه عددی همراه با ورودی عددی مکمل برای مبالغ بزرگ' },
  { code: 'COMP-014', name: 'DatePicker', tier: 'Composite', group: 'forms', folderPath: 'shared/ui/forms/date-picker', responsibilityFa: 'انتخاب تاریخ و بازه زمانی شمسی با تفکیک مقدار نمایشی و استاندارد تبادل' },
  { code: 'COMP-015', name: 'FileUpload', tier: 'Composite', group: 'forms', folderPath: 'shared/ui/forms/file-upload', responsibilityFa: 'رابط انتخاب و پیشرفت بارگذاری فایل بدون وابستگی مستقیم به کلیدهای R2' },
  // Group 3: Data Display (COMP-016..021)
  { code: 'COMP-016', name: 'Card', tier: 'Primitive', group: 'data-display', folderPath: 'shared/ui/data-display/card', responsibilityFa: 'ظرف بصری استاندارد شامل Header، Content و Footer' },
  { code: 'COMP-017', name: 'Stat / Metric', tier: 'Primitive', group: 'data-display', folderPath: 'shared/ui/data-display/stat', responsibilityFa: 'نمایش شاخص عددی، واحد و تغییرات دوره بدون فرض خودکار خوب/بد بودن جهت' },
  { code: 'COMP-018', name: 'Table', tier: 'Composite', group: 'data-display', folderPath: 'shared/ui/data-display/table', responsibilityFa: 'جدول داده عمومی با مرتب‌سازی، انتخاب، صفحه‌بندی و پشتیبانی RTL' },
  { code: 'COMP-019', name: 'List', tier: 'Primitive', group: 'data-display', folderPath: 'shared/ui/data-display/list', responsibilityFa: 'نمایش مجموعه‌های غیرجدولی (Simple, Interactive, Media, Description)' },
  { code: 'COMP-020', name: 'Avatar', tier: 'Primitive', group: 'data-display', folderPath: 'shared/ui/data-display/avatar', responsibilityFa: 'نمایش هویت بصری کاربران و ارائه‌دهندگان خدمات (مستقل از تیک تأیید)' },
  { code: 'COMP-021', name: 'EmptyState', tier: 'Primitive', group: 'data-display', folderPath: 'shared/ui/data-display/empty-state', responsibilityFa: 'نمایش وضعیت نبود داده همراه با اقدام پیشنهادی (مجزا از خطای شبکه)' },
  // Group 4: Navigation (COMP-022..026)
  { code: 'COMP-022', name: 'Tabs', tier: 'Primitive', group: 'navigation', folderPath: 'shared/ui/navigation/tabs', responsibilityFa: 'جابه‌جایی میان بخش‌های هم‌سطح یک صفحه با پشتیبانی صفحه‌کلید' },
  { code: 'COMP-023', name: 'Breadcrumb', tier: 'Primitive', group: 'navigation', folderPath: 'shared/ui/navigation/breadcrumb', responsibilityFa: 'نمایش مسیر سلسله‌مراتبی واقعی صفحه' },
  { code: 'COMP-024', name: 'Pagination', tier: 'Primitive', group: 'navigation', folderPath: 'shared/ui/navigation/pagination', responsibilityFa: 'جابه‌جایی میان صفحات داده بدون دستکاری داده‌های صفحه‌بندی‌شده سرور' },
  { code: 'COMP-025', name: 'DropdownMenu', tier: 'Primitive', group: 'navigation', folderPath: 'shared/ui/navigation/dropdown-menu', responsibilityFa: 'منوی بازشونده عملیات با مدیریت Focus و بستن با کلید Escape' },
  { code: 'COMP-026', name: 'Menu & NavigationItem', tier: 'Primitive', group: 'navigation', folderPath: 'shared/ui/navigation/menu', responsibilityFa: 'آیتم‌های منوی عمومی و مدیریتی هماهنگ با پوسته برنامه' },
  // Group 5: Feedback (COMP-027..031)
  { code: 'COMP-027', name: 'Alert', tier: 'Primitive', group: 'feedback', folderPath: 'shared/ui/feedback/alert', responsibilityFa: 'نمایش پیام‌های مهم درون‌صفحه‌ای (Info, Success, Warning, Error)' },
  { code: 'COMP-028', name: 'Toast', tier: 'Primitive', group: 'feedback', folderPath: 'shared/ui/feedback/toast', responsibilityFa: 'نمایش اعلان‌های کوتاه موقت با مدیریت صف و امکان بستن دستی' },
  { code: 'COMP-029', name: 'Tooltip', tier: 'Primitive', group: 'feedback', folderPath: 'shared/ui/feedback/tooltip', responsibilityFa: 'توضیح کوتاه تکمیلی بدون پنهان‌کردن اطلاعات ضروری' },
  { code: 'COMP-030', name: 'Progress', tier: 'Primitive', group: 'feedback', folderPath: 'shared/ui/feedback/progress', responsibilityFa: 'نمایش پیشرفت واقعی عملیات (Determinate / Indeterminate) بدون درصد ساختگی' },
  { code: 'COMP-031', name: 'Skeleton', tier: 'Primitive', group: 'feedback', folderPath: 'shared/ui/feedback/skeleton', responsibilityFa: 'نمایش ساختار تقریبی محتوا برای جلوگیری از پرش Layout' },
  // Group 6: Overlays (COMP-032..035)
  { code: 'COMP-032', name: 'Modal', tier: 'Primitive', group: 'overlays', folderPath: 'shared/ui/overlays/modal', responsibilityFa: 'پنجره مستقل با انتقال و بازگشت Focus و قفل اسکرول پس‌زمینه' },
  { code: 'COMP-033', name: 'Drawer', tier: 'Primitive', group: 'overlays', folderPath: 'shared/ui/overlays/drawer', responsibilityFa: 'پنل کشویی جانبی یا پایینی متناسب با جهت رابط RTL' },
  { code: 'COMP-034', name: 'Popover', tier: 'Primitive', group: 'overlays', folderPath: 'shared/ui/overlays/popover', responsibilityFa: 'نمایش محتوای شناور در ارتباط مستقیم با یک عنصر' },
  { code: 'COMP-035', name: 'ConfirmationDialog', tier: 'Composite', group: 'overlays', folderPath: 'shared/ui/overlays/confirmation-dialog', responsibilityFa: 'تأیید مستقل عملیات حساس با توضیح صریح پیامد واقعی عملیات' },
  // Group 7: Composites & Core Domain (COMP-036..045)
  { code: 'COMP-036', name: 'SearchBox', tier: 'Composite', group: 'composites', folderPath: 'shared/ui/composites/search-box', responsibilityFa: 'رابط جست‌وجو و نمایش پیشنهادها بدون مالکیت منطق رتبه‌بندی یا NLP' },
  { code: 'COMP-037', name: 'FilterBar', tier: 'Composite', group: 'composites', folderPath: 'shared/ui/composites/filter-bar', responsibilityFa: 'مدیریت فیلترهای فعال، پاک‌کردن تکی/کلی و همگام‌سازی با URL' },
  { code: 'COMP-038', name: 'MetricCard', tier: 'Composite', group: 'composites', folderPath: 'shared/ui/composites/metric-card', responsibilityFa: 'ترکیب Stat و Card برای نمایش شاخص‌های تحلیلی داشبوردها' },
  { code: 'COMP-039', name: 'DataToolbar', tier: 'Composite', group: 'composites', folderPath: 'shared/ui/composites/data-toolbar', responsibilityFa: 'نوار ابزار قابل پیکربندی برای جست‌وجو، فیلتر، مرتب‌سازی و خروجی جداول' },
  { code: 'COMP-040', name: 'LocationSelector', tier: 'Composite', group: 'composites', folderPath: 'shared/ui/composites/location-selector', responsibilityFa: 'انتخاب سلسله‌مراتبی مکان (کشور/استان/شهر/منطقه/محله) با پاک‌سازی خودکار سطوح پایین‌تر' },
  { code: 'COMP-041', name: 'PropertySummary', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/property-summary', responsibilityFa: 'نمایش خلاصه مشخصات ملک بر اساس PropertySummaryModel' },
  { code: 'COMP-042', name: 'SourceIndicator', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/source-indicator', responsibilityFa: 'نمایش منشأ داده (Official, User Submitted, Estimated, Observed, Aggregated)' },
  { code: 'COMP-043', name: 'VerificationBadge', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/verification-badge', responsibilityFa: 'نمایش وضعیت تأیید ملک، آگهی، کارشناس یا منبع داده' },
  { code: 'COMP-044', name: 'DataFreshnessIndicator', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/data-freshness-indicator', responsibilityFa: 'نمایش تازگی داده (تازه، به‌روزرسانی‌شده، قدیمی، منقضی، نامشخص)' },
  { code: 'COMP-045', name: 'PriceDisplay', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/price-display', responsibilityFa: 'قالب‌بندی و نمایش قیمت کل و هر متر با اعداد فارسی بدون محاسبه تجاری' },
  // Group 8: Specialized Domain Shared (COMP-046..060)
  { code: 'COMP-046', name: 'PropertyTypeLabel', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/property-type-label', responsibilityFa: 'نمایش نوع ملک' },
  { code: 'COMP-047', name: 'TransactionTypeBadge', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/transaction-type-badge', responsibilityFa: 'نمایش نوع معامله (فروش، اجاره، رهن)' },
  { code: 'COMP-048', name: 'BuildingAgeDisplay', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/building-age-display', responsibilityFa: 'نمایش سن ساختمان' },
  { code: 'COMP-049', name: 'AreaDisplay', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/area-display', responsibilityFa: 'نمایش متراژ و واحد' },
  { code: 'COMP-050', name: 'NeighborhoodLink', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/neighborhood-link', responsibilityFa: 'پیوند استاندارد به شناسنامه محله' },
  { code: 'COMP-051', name: 'AddressDisplay', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/address-display', responsibilityFa: 'نمایش آدرس و موقعیت مکانی' },
  { code: 'COMP-052', name: 'ConfidenceIndicator', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/confidence-indicator', responsibilityFa: 'نمایش سطح اطمینان داده' },
  { code: 'COMP-053', name: 'DataStatusBadge', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/data-status-badge', responsibilityFa: 'نمایش وضعیت داده' },
  { code: 'COMP-054', name: 'PriceChangeIndicator', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/price-change-indicator', responsibilityFa: 'نمایش تغییر قیمت نسبت به دوره قبل' },
  { code: 'COMP-055', name: 'MapLegendItem', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/map-legend-item', responsibilityFa: 'نمایش راهنمای لایه نقشه' },
  { code: 'COMP-056', name: 'TimeRangeLabel', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/time-range-label', responsibilityFa: 'نمایش بازه زمانی تحلیل یا گزارش' },
  { code: 'COMP-057', name: 'SourceDateDisplay', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/source-date-display', responsibilityFa: 'نمایش تاریخ منبع داده' },
  { code: 'COMP-058', name: 'UserVerificationStatus', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/user-verification-status', responsibilityFa: 'نمایش وضعیت تأیید کاربر' },
  { code: 'COMP-059', name: 'ListingStatus', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/listing-status', responsibilityFa: 'نمایش وضعیت آگهی' },
  { code: 'COMP-060', name: 'UnitDisplay', tier: 'Domain', group: 'domain', folderPath: 'shared/ui/domain/unit-display', responsibilityFa: 'نمایش واحد اندازه‌گیری' },
];

export const RT_FE_SC_BEHAVIORAL_STATES_14: readonly string[] = [
  'Default',
  'Hover',
  'Focus',
  'Active',
  'Selected',
  'Disabled',
  'Loading',
  'Success',
  'Warning',
  'Error',
  'Empty',
  'ReadOnly',
  'Expanded',
  'Collapsed',
];

export function resolveComponentStatePrecedence(flags: {
  disabled?: boolean;
  loading?: boolean;
  invalid?: boolean;
  focused?: boolean;
  readOnly?: boolean;
}): {
  effectiveVisualState: 'Disabled' | 'Loading_Locked' | 'Focus_With_Error_Ring' | 'Error' | 'ReadOnly' | 'Focused' | 'Default';
  interactionBlocked: boolean;
  explanationFa: string;
} {
  if (flags.disabled) {
    return {
      effectiveVisualState: 'Disabled',
      interactionBlocked: true,
      explanationFa: 'اولویت Disabled بالاتر از Loading و سایر وضعیت‌هاست؛ تعامل کاملاً غیرفعال می‌شود.',
    };
  }
  if (flags.loading) {
    return {
      effectiveVisualState: 'Loading_Locked',
      interactionBlocked: true,
      explanationFa: 'در وضعیت Loading، نمایشگر بارگذاری فعال شده و از اجرای تکراری عملیات جلوگیری می‌شود.',
    };
  }
  if (flags.invalid && flags.focused) {
    return {
      effectiveVisualState: 'Focus_With_Error_Ring',
      interactionBlocked: false,
      explanationFa: 'ترکیب Invalid + Focus منجر به نمایش هم‌زمان حلقه تمرکز (Focus Ring) و نشانگر خطا می‌شود.',
    };
  }
  if (flags.invalid) {
    return {
      effectiveVisualState: 'Error',
      interactionBlocked: false,
      explanationFa: 'نمایش وضعیت خطا همراه با پیام متنی صریح.',
    };
  }
  if (flags.readOnly) {
    return {
      effectiveVisualState: 'ReadOnly',
      interactionBlocked: false,
      explanationFa: 'فقط خواندنی با ظاهر متمایز از Disabled و حفظ قابلیت کپی و تمرکز.',
    };
  }
  if (flags.focused) {
    return {
      effectiveVisualState: 'Focused',
      interactionBlocked: false,
      explanationFa: 'نمایش حلقه تمرکز استاندارد ۲پیکسلی.',
    };
  }
  return {
    effectiveVisualState: 'Default',
    interactionBlocked: false,
    explanationFa: 'وضعیت عادی کامپوننت.',
  };
}

export interface LocationSelectionState {
  countryId: string;
  provinceId: string;
  cityId: string;
  districtId: string | null;
  neighborhoodId: string | null;
}

export function resolveCascadingLocationSelection(
  current: LocationSelectionState,
  change: { level: 'city' | 'district' | 'neighborhood'; newId: string },
): LocationSelectionState {
  if (change.level === 'city') {
    return {
      ...current,
      cityId: change.newId,
      districtId: null,
      neighborhoodId: null,
    };
  }
  if (change.level === 'district') {
    return {
      ...current,
      districtId: change.newId,
      neighborhoodId: null,
    };
  }
  return {
    ...current,
    neighborhoodId: change.newId,
  };
}

export function normalizeErrorForSharedFeedback(rawBackendError: string): {
  userFacingMessageFa: string;
  leakedTechnicalInternals: false;
  retryable: boolean;
} {
  const isRateLimit = /429|rate.?limit|too many/i.test(rawBackendError);
  const isNetwork = /network|timeout|fetch|502|503|504/i.test(rawBackendError);

  return {
    userFacingMessageFa: isRateLimit
      ? 'تعداد درخواست‌ها بیش از حد مجاز است؛ لطفاً چند لحظه صبر کنید و دوباره تلاش نمایید.'
      : isNetwork
        ? 'ارتباط با سرور موقتاً برقرار نشد؛ لطفاً اتصال شبکه را بررسی کرده و دوباره تلاش کنید.'
        : 'در پردازش درخواست مشکلی رخ داد؛ لطفاً ورودی‌ها را بررسی کرده یا مجدداً تلاش کنید.',
    leakedTechnicalInternals: false,
    retryable: isRateLimit || isNetwork,
  };
}

export const RT_FE_SC_DELIVERABLES_25: readonly { id: string; titleFa: string }[] = [
  { id: 'SC-OUT-001', titleFa: 'سند معماری Shared Component Library' },
  { id: 'SC-OUT-002', titleFa: 'طبقه‌بندی سه‌سطحی کامپوننت‌ها (Primitive / Composite / Domain)' },
  { id: 'SC-OUT-003', titleFa: 'ساختار پوشه‌ها و مالکیت فایل‌ها' },
  { id: 'SC-OUT-004', titleFa: 'قرارداد پایه TypeScript (BaseComponentProps)' },
  { id: 'SC-OUT-005', titleFa: 'استاندارد نام‌گذاری Props و Events' },
  { id: 'SC-OUT-006', titleFa: 'کتابخانه Primitive Components (COMP-001..006)' },
  { id: 'SC-OUT-007', titleFa: 'کتابخانه Form Components (COMP-007..015)' },
  { id: 'SC-OUT-008', titleFa: 'کتابخانه Data Display (COMP-016..021)' },
  { id: 'SC-OUT-009', titleFa: 'کتابخانه Navigation (COMP-022..026)' },
  { id: 'SC-OUT-010', titleFa: 'کتابخانه Feedback (COMP-027..031)' },
  { id: 'SC-OUT-011', titleFa: 'کتابخانه Overlays (COMP-032..035)' },
  { id: 'SC-OUT-012', titleFa: 'کتابخانه Composite Components (COMP-036..040)' },
  { id: 'SC-OUT-013', titleFa: 'کتابخانه Domain Components (COMP-041..060)' },
  { id: 'SC-OUT-014', titleFa: 'ماتریس ۱۴ وضعیت رفتاری و اولویت ترکیب وضعیت‌ها' },
  { id: 'SC-OUT-015', titleFa: 'استاندارد دسترس‌پذیری (WCAG 2.2 AA)' },
  { id: 'SC-OUT-016', titleFa: 'قرارداد عملکرد و بهینه‌سازی کامپوننت‌ها' },
  { id: 'SC-OUT-017', titleFa: 'قرارداد اتصال به Feature Layer' },
  { id: 'SC-OUT-018', titleFa: 'قرارداد ارتباط ایزوله با API و Cloudflare (بدون دسترسی مستقیم به D1/R2)' },
  { id: 'SC-OUT-019', titleFa: 'استاندارد نرمال‌سازی و مدیریت خطا' },
  { id: 'SC-OUT-020', titleFa: 'کاتالوگ مستندات کامپوننت‌ها' },
  { id: 'SC-OUT-021', titleFa: 'مجموعه آزمون‌های Unit (UT-001..UT-008)' },
  { id: 'SC-OUT-022', titleFa: 'مجموعه آزمون‌های Integration' },
  { id: 'SC-OUT-023', titleFa: 'مجموعه آزمون‌های Visual Regression (Light/Dark/RTL/Mobile)' },
  { id: 'SC-OUT-024', titleFa: 'استاندارد نسخه‌بندی Semantic Versioning (MAJOR.MINOR.PATCH)' },
  { id: 'SC-OUT-025', titleFa: 'نسخه اولیه قابل استفاده کتابخانه کامپوننت‌های مشترک' },
];
