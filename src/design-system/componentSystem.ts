/** @file src/design-system/componentSystem.ts — RT-UI-COMP-001 Component Design System Architecture & Contracts (Pure TS, zero React) */

export type ComponentArchitectureLayer = 'primitive' | 'composite' | 'domain' | 'page_pattern';

export const COMPONENT_ARCHITECTURE_LAYERS: readonly {
  level: 1 | 2 | 3 | 4;
  id: ComponentArchitectureLayer;
  titleEn: string;
  examplesFa: string;
}[] = [
  { level: 1, id: 'primitive', titleEn: 'Primitive Components', examplesFa: 'دکمه، متن، آیکون، فیلد، انتخابگر، Checkbox، Badge و جداکننده' },
  { level: 2, id: 'composite', titleEn: 'Composite Components', examplesFa: 'Search Box، Filter Bar، Data Row، Navigation Item و Form Field' },
  { level: 3, id: 'domain', titleEn: 'Domain Components', examplesFa: 'Property Preview، Neighborhood Summary، Price Indicator و Layer Selector' },
  { level: 4, id: 'page_pattern', titleEn: 'Page Patterns', examplesFa: 'Map Explorer، Property Search، Neighborhood Profile و Valuation Workspace' },
] as const;

export const MANDATORY_COMPONENT_SPEC_FIELDS = [
  'id_and_name', 'purpose', 'anatomy', 'dimensions', 'color_and_typography',
  'interactive_states', 'desktop_behavior', 'mobile_behavior', 'accessibility',
  'allowed_usage', 'forbidden_usage', 'props_contract', 'qa_acceptance',
] as const;

export const COMPONENT_CATALOG: readonly { id: string; group: string; scopeFa: string; priority: 'P0' | 'P1' | 'P2' }[] = [
  { id: 'C01', group: 'Buttons', scopeFa: 'دکمههای عملیاتی (Primary, Secondary, Tertiary, Outline, Destructive, Icon)', priority: 'P0' },
  { id: 'C02', group: 'Inputs', scopeFa: 'ورودیها، ورودی عددی و جستوجوی سراسری', priority: 'P0' },
  { id: 'C03', group: 'Navigation', scopeFa: 'منوی اصلی، تب، Breadcrumb، Sidebar و Pagination', priority: 'P0' },
  { id: 'C04', group: 'Controls', scopeFa: 'Select، Multi Select، Checkbox، Radio، Switch و Range Slider', priority: 'P0' },
  { id: 'C05', group: 'Cards', scopeFa: 'هفت خانواده کارت (Info, Metric, Neighborhood, Property, Report, Service, Action)', priority: 'P1' },
  { id: 'C06', group: 'Map Components', scopeFa: 'بوم نقشه، Toolbar، Layer Selector، Legend، Context Panel و کنترلها', priority: 'P1' },
  { id: 'C07', group: 'Panels', scopeFa: 'Context/Filter/Detail/Settings Panel، Side Drawer و Bottom Sheet', priority: 'P1' },
  { id: 'C08', group: 'Overlays', scopeFa: 'Dialog، Modal، Popover، Tooltip و Toast', priority: 'P1' },
  { id: 'C09', group: 'Data Display', scopeFa: 'Metric، Badge اعتبار داده، Data Table و Charts', priority: 'P1' },
  { id: 'C10', group: 'Feedback', scopeFa: 'اعلان، خطا، وضعیت خالی و Skeleton/Loading', priority: 'P2' },
  { id: 'C11', group: 'Domain Components', scopeFa: 'اجزای اختصاصی بازار املاک و شهر (RTD01..RTD10)', priority: 'P2' },
] as const;

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'outline' | 'destructive' | 'icon';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type ButtonState = 'default' | 'hover' | 'focus' | 'pressed' | 'disabled' | 'loading';

export const BUTTON_VARIANTS: readonly { id: ButtonVariant; priorityFa: string; usageFa: string }[] = [
  { id: 'primary', priorityFa: 'بالا', usageFa: 'عملیات اصلی هر محدوده (فقط یک Primary غالب در هر ناحیه)' },
  { id: 'secondary', priorityFa: 'متوسط', usageFa: 'عملیات مکمل مانند مشاهده جزئیات یا افزودن به مقایسه' },
  { id: 'tertiary', priorityFa: 'پایین', usageFa: 'عملیات کم‌تأکید مانند بازگشت، انصراف یا مشاهده بیشتر' },
  { id: 'outline', priorityFa: 'متوسط', usageFa: 'عملیات مستقل با مرزبندی مشخص روی پنل سفید' },
  { id: 'destructive', priorityFa: 'هشدار', usageFa: 'عملیات حذف و برگشت‌ناپذیر نیازمند تأیید' },
  { id: 'icon', priorityFa: 'وابسته به زمینه', usageFa: 'عملیات کوتاه با نام دسترس‌پذیر اجباری (aria-label)' },
] as const;

export const BUTTON_SIZE_SPECS: Record<ButtonSize, { heightPx: number; fontPx: number; paddingXPx: number }> = {
  xs: { heightPx: 32, fontPx: 12, paddingXPx: 10 },
  sm: { heightPx: 36, fontPx: 13, paddingXPx: 12 },
  md: { heightPx: 40, fontPx: 14, paddingXPx: 16 },
  lg: { heightPx: 48, fontPx: 15, paddingXPx: 20 },
};

export const BUTTON_INTERACTIVE_STATES: readonly ButtonState[] = ['default', 'hover', 'focus', 'pressed', 'disabled', 'loading'];

export const PAGE_BUTTON_ALLOCATION = {
  home: { primary: 'ورود به نقشه', secondary: 'شناخت محله‌ها', tertiary: 'مشاهده بیشتر' },
  map: { primary: 'اجرای جست‌وجو در محدوده', secondary: 'اعمال فیلتر', tertiary: 'پاک کردن فیلتر' },
  area: { primary: 'مقایسه محله', secondary: 'مشاهده روی نقشه', tertiary: 'منابع' },
  market: { primary: 'اعمال فیلتر', secondary: 'ذخیره نما', tertiary: 'روش‌شناسی' },
  properties: { primary: 'تماس یا اقدام اصلی مجاز', secondary: 'مقایسه', tertiary: 'ذخیره' },
  valuation: { primary: 'محاسبه', secondary: 'بازگشت', tertiary: 'راهنما' },
  admin: { primary: 'ثبت تغییر', secondary: 'مشاهده گزارش', tertiary: 'انصراف' },
} as const;

export const INPUT_TYPES = [
  'IN01_Text', 'IN02_Numeric', 'IN03_Search', 'IN04_Select', 'IN05_MultiSelect',
  'IN06_DatePicker', 'IN07_Range', 'IN08_Textarea', 'IN09_Location', 'IN10_Autocomplete',
] as const;

export const INPUT_STATES = ['default', 'hover', 'focus', 'filled', 'error', 'disabled', 'readonly', 'loading'] as const;

export const GLOBAL_SEARCH_BOX_SPEC = {
  desktopWidthRangePx: [240, 320] as const,
  heightPx: 44,
  shortcutKey: 'Ctrl+K',
  supportsPersianNormalization: true,
  entityGroups: ['neighborhoods', 'properties', 'knowledge'] as const,
} as const;

export const CARD_FAMILIES: readonly { id: string; nameEn: string; roleFa: string }[] = [
  { id: 'CD01', nameEn: 'Information Card', roleFa: 'گروه‌بندی اطلاعات عمومی محدوده' },
  { id: 'CD02', nameEn: 'Metric Card', roleFa: 'نمایش یک شاخص اصلی به همراه واحد، بازه و منبع' },
  { id: 'CD03', nameEn: 'Neighborhood Card', roleFa: 'معرفی محله و لینک شناسنامه کامل' },
  { id: 'CD04', nameEn: 'Property Card', roleFa: 'معرفی ملک با قیمت، متراژ، اتاق، سن و ذخیره مستقل' },
  { id: 'CD05', nameEn: 'Report Card', roleFa: 'معرفی گزارش و پژوهش تحلیلی' },
  { id: 'CD06', nameEn: 'Service Card', roleFa: 'معرفی متخصص و خدمات ملکی با وضعیت اعتبارسنجی' },
  { id: 'CD07', nameEn: 'Action Card', roleFa: 'ورود به ابزارهای ارزش‌گذاری و مقایسه' },
] as const;

export const MAP_COMPONENT_INVENTORY = [
  'MP01_MapCanvas', 'MP02_MapToolbar', 'MP03_LayerSelector', 'MP04_LayerLegend', 'MP05_MapSearch',
  'MP06_MapFilterPanel', 'MP07_MapControlGroup', 'MP08_MapSelection', 'MP09_MapCluster', 'MP10_MapTooltip',
  'MP11_MapContextPanel', 'MP12_MapMeasurement', 'MP13_MapDrawTool', 'MP14_MapCompare', 'MP15_MapStatus',
] as const;

export type DataCredibilityStatus = 'verified' | 'estimated' | 'incomplete' | 'stale';

export const DATA_CREDIBILITY_SPECS: Record<DataCredibilityStatus, { labelFa: string; labelEn: string; tone: 'success' | 'info' | 'warning' | 'neutral' }> = {
  verified: { labelFa: 'داده تأییدشده', labelEn: 'Verified', tone: 'success' },
  estimated: { labelFa: 'داده برآوردی (مدل)', labelEn: 'Estimated', tone: 'info' },
  incomplete: { labelFa: 'داده ناقص', labelEn: 'Incomplete', tone: 'warning' },
  stale: { labelFa: 'داده قدیمی', labelEn: 'Stale', tone: 'neutral' },
};

export const DOMAIN_COMPONENTS_RTD = [
  { id: 'RTD01', nameEn: 'Property Preview', roleFa: 'پیش‌نمایش ملک' },
  { id: 'RTD02', nameEn: 'Property Attributes', roleFa: 'مشخصات استاندارد ملک' },
  { id: 'RTD03', nameEn: 'Neighborhood Summary', roleFa: 'خلاصه محله برای نقشه و دایرکتوری' },
  { id: 'RTD04', nameEn: 'Neighborhood Map', roleFa: 'نقشه محدوده محله' },
  { id: 'RTD05', nameEn: 'Market Metric', roleFa: 'شاخص بازار با واحد و بازه زمانی' },
  { id: 'RTD06', nameEn: 'Price Distribution', roleFa: 'توزیع و دامنه قیمت' },
  { id: 'RTD07', nameEn: 'Valuation Result', roleFa: 'خروجی ارزش‌گذاری هدونیک' },
  { id: 'RTD08', nameEn: 'Comparable Property', roleFa: 'نمونه مقایسه‌ای هم‌تراز' },
  { id: 'RTD09', nameEn: 'Service Provider Profile', roleFa: 'پروفایل متخصص و اعتبار' },
  { id: 'RTD10', nameEn: 'Data Provenance', roleFa: 'منبع، زمان بروزرسانی، روش تولید و محدودیت داده' },
] as const;

export const COMPONENT_ACCEPTANCE_CRITERIA: readonly { id: string; titleFa: string }[] = [
  { id: 'CMP-01', titleFa: 'تمام Primitive Components دارای مشخصات فنی و رفتاری هستند' },
  { id: 'CMP-02', titleFa: 'شش نوع دکمه (Primary تا Icon) تعریف و مستند شده‌اند' },
  { id: 'CMP-03', titleFa: 'تمام حالت‌های تعاملی دکمه‌ها (Default تا Loading) مشخص شده‌اند' },
  { id: 'CMP-04', titleFa: 'Inputها و فیلدهای عددی همراه با اعتبارسنجی و واحد استاندارد شده‌اند' },
  { id: 'CMP-05', titleFa: 'جست‌وجوی سراسری قرارداد مستقل و میانبر Ctrl+K / دارد' },
  { id: 'CMP-06', titleFa: 'Select، Multi Select و کنترل‌های انتخاب طراحی شده‌اند' },
  { id: 'CMP-07', titleFa: 'Navigation Components مطابق معماری ناوبری استاندارد شده‌اند' },
  { id: 'CMP-08', titleFa: 'هفت خانواده کارت (CD01 تا CD07) تعریف شده‌اند' },
  { id: 'CMP-09', titleFa: 'کارت ملک و کارت محله قرارداد ساختارمند دارند' },
  { id: 'CMP-10', titleFa: 'Map Components (MP01 تا MP15) به صورت مستقل تعریف شده‌اند' },
  { id: 'CMP-11', titleFa: 'Legend و Layer Selector بر اساس نوع داده استاندارد شده‌اند' },
  { id: 'CMP-12', titleFa: 'پنل زمینه‌ای و Bottom Sheet موبایل مشخصات رفتاری دارند' },
  { id: 'CMP-13', titleFa: 'Modal و Dialog قواعد بستن، Focus و عدم انباشت دارند' },
  { id: 'CMP-14', titleFa: 'Data Table و Chart قرارداد مشترک منبع و واحد دارند' },
  { id: 'CMP-15', titleFa: 'وضعیت اعتبار داده (Verified/Estimated/Incomplete/Stale) پشتیبانی می‌شود' },
  { id: 'CMP-16', titleFa: 'کامپوننت‌های تجاری از اجزای پایه Design System تفکیک شده‌اند' },
  { id: 'CMP-17', titleFa: 'API و Props اجزا با TypeScript مستند شده‌اند' },
  { id: 'CMP-18', titleFa: 'محیط آزمایش تعاملی Radar UI Lab در محصول پیاده‌سازی شده است' },
  { id: 'CMP-19', titleFa: 'تست بصری و رفتاری برای اجزای اصلی وجود دارد' },
  { id: 'CMP-20', titleFa: 'نسخه موبایل اجزای مهم با هدف لمسی ۴۴-۴۸px طراحی شده است' },
  { id: 'CMP-21', titleFa: 'هیچ کامپوننت عمومی منطق تجاری ماژول‌ها را در خود ندارد' },
  { id: 'CMP-22', titleFa: 'تست رگرسیون برای تغییر توکن‌ها و قراردادهای کامپوننت فعال است' },
] as const;

export function normalizeNumericFieldDigits(raw: string): string {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return String(raw)
    .replace(/[۰-۹]/g, (ch) => String(persian.indexOf(ch)))
    .replace(/[٠-٩]/g, (ch) => String(arabic.indexOf(ch)))
    .replace(/[٬,\s]/g, '')
    .trim();
}

export type ComponentGovernanceStatus = 'Experimental' | 'Stable' | 'Deprecated' | 'Removed';

export const DESIGN_SYSTEM_FIVE_LAYERS = [
  { layer: 'Layer 01', nameEn: 'Design Tokens', examplesFa: 'Color, Typography, Spacing, Radius, Shadow, Motion' },
  { layer: 'Layer 02', nameEn: 'Primitives', examplesFa: 'Button, Input, Badge, Checkbox, Tooltip, Dialog' },
  { layer: 'Layer 03', nameEn: 'Composite Components', examplesFa: 'Search Bar, Filter Panel, Metric Card, Data Table' },
  { layer: 'Layer 04', nameEn: 'Domain Components', examplesFa: 'Price Metric, Property Preview, Map Legend, Valuation Result' },
  { layer: 'Layer 05', nameEn: 'Page Patterns', examplesFa: 'Home, Market, Neighborhood, Property, Admin' },
] as const;

export const STAGE_12_DS_PHASES = [
  'DS-01', 'DS-02', 'DS-03', 'DS-04', 'DS-05', 'DS-06', 'DS-07', 'DS-08', 'DS-09',
] as const;

