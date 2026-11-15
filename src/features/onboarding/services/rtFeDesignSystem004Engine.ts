/**
 * RT-FE-DESIGN-SYSTEM-004: مرحله چهارم — طراحی سیستم طراحی بصری و استانداردهای یکپارچه رابط کاربری
 * (5-Layer Radar Design System, Brand/Neutral/Status/Geo/Market/Chart Color Systems, Vazirmatn Typography T-001..T-010,
 * Persian Financial Number Formatter, Spacing SP-001..SP-012, Sizing SZ-001..SZ-005, Radius RD-001..RD-007,
 * Shadow SH-001..SH-005, Light/Dark/System Theme Tokens, 12-Col Grid, Motion MOT-001..MOT-006, RTL-001..RTL-010, DS-001..DS-020)
 */

export const RT_FE_DESIGN_SYSTEM_004_SPEC_ID = 'RT-FE-DESIGN-SYSTEM-004' as const;

export const RT_FE_DS_5_LAYERS: readonly { layer: number; nameEn: string; responsibilityFa: string; examples: readonly string[] }[] = [
  { layer: 1, nameEn: 'Primitive Tokens', responsibilityFa: 'تعریف مقادیر پایه و خام', examples: ['Color Palette', 'Spacing Scale', 'Typography Scale', 'Radius Scale', 'Shadow Scale', 'Size Scale'] },
  { layer: 2, nameEn: 'Semantic Tokens', responsibilityFa: 'تعیین معنای هر مقدار در رابط', examples: ['Background', 'Surface', 'Text', 'Border', 'Action', 'Status'] },
  { layer: 3, nameEn: 'Component Tokens', responsibilityFa: 'تعیین ظاهر استاندارد اجزای رابط', examples: ['Button', 'Input', 'Card', 'Table', 'Navigation', 'Chart'] },
  { layer: 4, nameEn: 'Layout Tokens', responsibilityFa: 'تعیین ابعاد و ساختار فضایی صفحات', examples: ['Container', 'Grid', 'Header', 'Sidebar', 'Content'] },
  { layer: 5, nameEn: 'Theme System', responsibilityFa: 'تعریف حالت‌های روشن، تاریک و سیستمی بدون چشمک صفحه (Theme Flash)', examples: ['Light Theme', 'Dark Theme', 'System Theme'] },
];

export const RT_FE_DS_PRIMARY_COLORS_10: readonly { id: string; name: string; hex: string; usageFa: string }[] = [
  { id: 'CLR-001', name: 'Primary 50', hex: '#EAF3F4', usageFa: 'پس‌زمینه بسیار ملایم' },
  { id: 'CLR-002', name: 'Primary 100', hex: '#D4E7E8', usageFa: 'سطوح انتخاب‌شده' },
  { id: 'CLR-003', name: 'Primary 200', hex: '#ACD1D3', usageFa: 'اجزای فرعی' },
  { id: 'CLR-004', name: 'Primary 300', hex: '#7DB5B9', usageFa: 'عناصر تصویری' },
  { id: 'CLR-005', name: 'Primary 400', hex: '#4F969C', usageFa: 'عناصر تعاملی فرعی' },
  { id: 'CLR-006', name: 'Primary 500', hex: '#287C83', usageFa: 'رنگ اصلی برند' },
  { id: 'CLR-007', name: 'Primary 600', hex: '#20666D', usageFa: 'حالت Hover' },
  { id: 'CLR-008', name: 'Primary 700', hex: '#1B5158', usageFa: 'حالت Active' },
  { id: 'CLR-009', name: 'Primary 800', hex: '#173E45', usageFa: 'تأکید قوی' },
  { id: 'CLR-010', name: 'Primary 900', hex: '#122E35', usageFa: 'رنگ بسیار تیره' },
];

export const RT_FE_DS_NEUTRAL_TOKENS_10: readonly { id: string; token: string; cssVar: string; lightHex: string; darkHex: string }[] = [
  { id: 'N-001', token: 'Background', cssVar: '--color-background', lightHex: '#F5F7F9', darkHex: '#0F1921' },
  { id: 'N-002', token: 'Surface', cssVar: '--color-surface', lightHex: '#FFFFFF', darkHex: '#172630' },
  { id: 'N-003', token: 'Surface Raised', cssVar: '--color-surface-raised', lightHex: '#FFFFFF', darkHex: '#20333E' },
  { id: 'N-004', token: 'Surface Subtle', cssVar: '--color-surface-subtle', lightHex: '#EDF1F4', darkHex: '#1B2B35' },
  { id: 'N-005', token: 'Text Primary', cssVar: '--color-text-primary', lightHex: '#172B36', darkHex: '#EAF0F3' },
  { id: 'N-006', token: 'Text Secondary', cssVar: '--color-text-secondary', lightHex: '#536773', darkHex: '#B1C0C8' },
  { id: 'N-007', token: 'Text Muted', cssVar: '--color-text-muted', lightHex: '#72828B', darkHex: '#8FA1AB' },
  { id: 'N-008', token: 'Border', cssVar: '--color-border', lightHex: '#DFE6EA', darkHex: '#334650' },
  { id: 'N-009', token: 'Border Strong', cssVar: '--color-border-strong', lightHex: '#C6D2D8', darkHex: '#52636D' },
  { id: 'N-010', token: 'Disabled', cssVar: '--color-disabled', lightHex: '#A8B4BA', darkHex: '#62727B' },
];

export const RT_FE_DS_STATUS_COLORS_5: readonly { status: 'Success' | 'Warning' | 'Danger' | 'Info' | 'Neutral'; primaryHex: string; subtleBgHex: string; usageFa: string }[] = [
  { status: 'Success', primaryHex: '#18865C', subtleBgHex: '#E5F5EC', usageFa: 'موفقیت عملیات' },
  { status: 'Warning', primaryHex: '#B7791F', subtleBgHex: '#FFF4D9', usageFa: 'هشدار و نیازمند بررسی' },
  { status: 'Danger', primaryHex: '#C63D48', subtleBgHex: '#FCE9EB', usageFa: 'خطا و خطر (صرفاً برای زیان/هشدار واقعی، نه هر عدد منفی)' },
  { status: 'Info', primaryHex: '#2775B6', subtleBgHex: '#E8F2FC', usageFa: 'اطلاع‌رسانی' },
  { status: 'Neutral', primaryHex: '#657783', subtleBgHex: '#EDF1F4', usageFa: 'وضعیت خنثی' },
];

export const RT_FE_DS_GEO_COLORS_10: readonly { id: string; categoryFa: string; hex: string }[] = [
  { id: 'GEO-001', categoryFa: 'مسکونی', hex: '#287C83' },
  { id: 'GEO-002', categoryFa: 'تجاری', hex: '#3976B8' },
  { id: 'GEO-003', categoryFa: 'اداری', hex: '#7865AE' },
  { id: 'GEO-004', categoryFa: 'صنعتی', hex: '#667782' },
  { id: 'GEO-005', categoryFa: 'زمین و اراضی', hex: '#B58A39' },
  { id: 'GEO-006', categoryFa: 'فضای سبز', hex: '#428B62' },
  { id: 'GEO-007', categoryFa: 'خدمات شهری', hex: '#C47B3D' },
  { id: 'GEO-008', categoryFa: 'آموزشی', hex: '#4C8BB1' },
  { id: 'GEO-009', categoryFa: 'درمانی', hex: '#B75D74' },
  { id: 'GEO-010', categoryFa: 'حمل‌ونقل', hex: '#6D73A6' },
];

export const RT_FE_DS_TYPOGRAPHY_10: readonly { id: string; name: string; fontSizePx: number; fontWeight: 400 | 500 | 600 | 700; lineHeightPx: number }[] = [
  { id: 'T-001', name: 'Display', fontSizePx: 36, fontWeight: 700, lineHeightPx: 48 },
  { id: 'T-002', name: 'H1', fontSizePx: 28, fontWeight: 700, lineHeightPx: 40 },
  { id: 'T-003', name: 'H2', fontSizePx: 24, fontWeight: 700, lineHeightPx: 36 },
  { id: 'T-004', name: 'H3', fontSizePx: 20, fontWeight: 600, lineHeightPx: 30 },
  { id: 'T-005', name: 'H4', fontSizePx: 18, fontWeight: 600, lineHeightPx: 28 },
  { id: 'T-006', name: 'Body Large', fontSizePx: 16, fontWeight: 400, lineHeightPx: 28 },
  { id: 'T-007', name: 'Body', fontSizePx: 14, fontWeight: 400, lineHeightPx: 24 },
  { id: 'T-008', name: 'Body Small', fontSizePx: 13, fontWeight: 400, lineHeightPx: 21 },
  { id: 'T-009', name: 'Caption', fontSizePx: 12, fontWeight: 400, lineHeightPx: 18 },
  { id: 'T-010', name: 'Overline', fontSizePx: 11, fontWeight: 500, lineHeightPx: 16 },
];

export const RT_FE_DS_SPACING_12: readonly { id: string; token: string; px: number }[] = [
  { id: 'SP-001', token: '1', px: 4 },
  { id: 'SP-002', token: '2', px: 8 },
  { id: 'SP-003', token: '3', px: 12 },
  { id: 'SP-004', token: '4', px: 16 },
  { id: 'SP-005', token: '5', px: 20 },
  { id: 'SP-006', token: '6', px: 24 },
  { id: 'SP-007', token: '8', px: 32 },
  { id: 'SP-008', token: '10', px: 40 },
  { id: 'SP-009', token: '12', px: 48 },
  { id: 'SP-010', token: '16', px: 64 },
  { id: 'SP-011', token: '20', px: 80 },
  { id: 'SP-012', token: '24', px: 96 },
];

export const RT_FE_DS_CONTROL_SIZES_5: readonly { id: string; labelFa: string; heightPx: number }[] = [
  { id: 'SZ-001', labelFa: 'کنترل کوچک', heightPx: 32 },
  { id: 'SZ-002', labelFa: 'کنترل استاندارد', heightPx: 40 },
  { id: 'SZ-003', labelFa: 'کنترل اصلی', heightPx: 44 },
  { id: 'SZ-004', labelFa: 'کنترل بزرگ', heightPx: 48 },
  { id: 'SZ-005', labelFa: 'ورودی چندخطی (حداقل)', heightPx: 96 },
];

export const RT_FE_DS_RADIUS_7: readonly { id: string; token: string; px: number }[] = [
  { id: 'RD-001', token: 'Radius XS', px: 4 },
  { id: 'RD-002', token: 'Radius SM', px: 6 },
  { id: 'RD-003', token: 'Radius MD', px: 10 },
  { id: 'RD-004', token: 'Radius LG', px: 14 },
  { id: 'RD-005', token: 'Radius XL', px: 18 },
  { id: 'RD-006', token: 'Radius 2XL', px: 24 },
  { id: 'RD-007', token: 'Radius Full', px: 9999 },
];

export const RT_FE_DS_SHADOWS_5: readonly { id: string; name: string; usageFa: string }[] = [
  { id: 'SH-001', name: 'None', usageFa: 'صفحات و اجزای تخت' },
  { id: 'SH-002', name: 'Subtle', usageFa: 'کارت‌های معمولی' },
  { id: 'SH-003', name: 'Medium', usageFa: 'پنل شناور' },
  { id: 'SH-004', name: 'Large', usageFa: 'Dialog و پنجره اصلی' },
  { id: 'SH-005', name: 'Floating', usageFa: 'منوها و Popoverها' },
];

export const RT_FE_DS_CHART_SERIES_8: readonly { series: string; hex: string }[] = [
  { series: 'Series 1', hex: '#287C83' },
  { series: 'Series 2', hex: '#3976B8' },
  { series: 'Series 3', hex: '#8A70B8' },
  { series: 'Series 4', hex: '#C18442' },
  { series: 'Series 5', hex: '#4C956C' },
  { series: 'Series 6', hex: '#B75D74' },
  { series: 'Series 7', hex: '#617B9A' },
  { series: 'Series 8', hex: '#9A8B57' },
];

export const RT_FE_DS_MOTION_6: readonly { id: string; typeEn: string; durationMs: number }[] = [
  { id: 'MOT-001', typeEn: 'Hover', durationMs: 120 },
  { id: 'MOT-002', typeEn: 'Focus', durationMs: 120 },
  { id: 'MOT-003', typeEn: 'Menu Transition', durationMs: 160 },
  { id: 'MOT-004', typeEn: 'Drawer', durationMs: 220 },
  { id: 'MOT-005', typeEn: 'Dialog', durationMs: 200 },
  { id: 'MOT-006', typeEn: 'Page Transition', durationMs: 240 },
];

export const RT_FE_DS_RTL_10: readonly { id: string; titleFa: string; criteriaFa: string }[] = [
  { id: 'RTL-001', titleFa: 'جهت پیش‌فرض برنامه', criteriaFa: 'RTL' },
  { id: 'RTL-002', titleFa: 'پشتیبانی از متن لاتین', criteriaFa: 'LTR در عناصر لازم (شناسه‌ها، URLها و کدها)' },
  { id: 'RTL-003', titleFa: 'فاصله‌گذاری منطقی', criteriaFa: 'استفاده از CSS Logical Properties مانند margin-inline-start' },
  { id: 'RTL-004', titleFa: 'موقعیت عناصر', criteriaFa: 'مستقل از جهت نوشتار' },
  { id: 'RTL-005', titleFa: 'آیکون‌ها', criteriaFa: 'اصلاح جهت آیکون‌های حرکتی در RTL' },
  { id: 'RTL-006', titleFa: 'جداول', criteriaFa: 'حفظ ترتیب منطقی ستون‌ها و Tabular Numbers' },
  { id: 'RTL-007', titleFa: 'ورودی‌ها', criteriaFa: 'جهت متناسب با نوع محتوا' },
  { id: 'RTL-008', titleFa: 'نمودارها', criteriaFa: 'کنترل صحیح جهت محور و برچسب‌ها' },
  { id: 'RTL-009', titleFa: 'نقشه', criteriaFa: 'عدم تأثیر جهت متن بر مختصات مکانی' },
  { id: 'RTL-010', titleFa: 'پنل‌ها', criteriaFa: 'نمایش درست Drawer و Sidebar در RTL' },
];

export const RT_FE_DS_REQUIREMENTS_20: readonly { id: string; titleFa: string }[] = [
  { id: 'DS-001', titleFa: 'توکن‌های مرکزی (Design Tokens)' },
  { id: 'DS-002', titleFa: 'استفاده اجزا از Semantic Tokens' },
  { id: 'DS-003', titleFa: 'تعریف Color System (برند، خنثی، وضعیت)' },
  { id: 'DS-004', titleFa: 'استانداردسازی رنگ‌های اطلاعات شهری (GEO-001..010)' },
  { id: 'DS-005', titleFa: 'مقیاس نوشتاری فارسی و لاتین (T-001..T-010)' },
  { id: 'DS-006', titleFa: 'استاندارد نمایش اعداد و اطلاعات مالی فارسی' },
  { id: 'DS-007', titleFa: 'فاصله‌گذاری مرکزی بر پایه مضرب ۴ پیکسل (SP-001..012)' },
  { id: 'DS-008', titleFa: 'ابعاد استاندارد کنترل‌ها و Layoutها (SZ-001..005)' },
  { id: 'DS-009', titleFa: 'مقیاس گوشه‌ها (RD-001..007)' },
  { id: 'DS-010', titleFa: 'سایه‌ها و عمق بصری (SH-001..005)' },
  { id: 'DS-011', titleFa: 'خانواده آیکون یکپارچه (Lucide) و نگاشت معنایی' },
  { id: 'DS-012', titleFa: 'پالت و قرارداد نمودارها (ChartPresentation)' },
  { id: 'DS-013', titleFa: 'رنگ و سبک لایه‌های مکانی نقشه' },
  { id: 'DS-014', titleFa: 'پشتیبانی حالت روشن، تاریک و سیستمی بدون Theme Flash' },
  { id: 'DS-015', titleFa: 'رعایت قواعد طراحی دوجهته (RTL-001..010)' },
  { id: 'DS-016', titleFa: 'توکن‌های واکنش‌گرایی و شبکه‌بندی ۱۲/۸/۴ ستونه' },
  { id: 'DS-017', titleFa: 'زمان‌بندی و قواعد انیمیشن (MOT-001..006)' },
  { id: 'DS-018', titleFa: 'اتصال Tailwind به CSS Variables مرکزی' },
  { id: 'DS-019', titleFa: 'فرایند حاکمیت تغییر و تأیید توکن‌ها' },
  { id: 'DS-020', titleFa: 'اجرای آزمون‌های بصری و کنتراست (DS-T01..T10)' },
];

export const RT_FE_DS_DELIVERABLES_20: readonly { id: string; titleFa: string }[] = [
  { id: 'DS-OUT-01', titleFa: 'سند هویت بصری رادار تهران' },
  { id: 'DS-OUT-02', titleFa: 'پالت کامل رنگ‌ها' },
  { id: 'DS-OUT-03', titleFa: 'فرهنگ‌نامه Design Tokens' },
  { id: 'DS-OUT-04', titleFa: 'استاندارد تایپوگرافی فارسی و انگلیسی' },
  { id: 'DS-OUT-05', titleFa: 'استاندارد نمایش اعداد و اطلاعات مالی' },
  { id: 'DS-OUT-06', titleFa: 'مقیاس فاصله‌گذاری' },
  { id: 'DS-OUT-07', titleFa: 'مقیاس ابعاد و اندازه‌ها' },
  { id: 'DS-OUT-08', titleFa: 'استاندارد Radius، Border و Shadow' },
  { id: 'DS-OUT-09', titleFa: 'نظام آیکون‌ها' },
  { id: 'DS-OUT-10', titleFa: 'نظام رنگی نمودارها' },
  { id: 'DS-OUT-11', titleFa: 'نظام بصری نقشه و لایه‌های جغرافیایی' },
  { id: 'DS-OUT-12', titleFa: 'مشخصات تم روشن و تاریک' },
  { id: 'DS-OUT-13', titleFa: 'استاندارد شبکه‌بندی صفحات' },
  { id: 'DS-OUT-14', titleFa: 'استاندارد Motion' },
  { id: 'DS-OUT-15', titleFa: 'ساختار فایل‌ها و CSS Variables' },
  { id: 'DS-OUT-16', titleFa: 'قرارداد اتصال به Tailwind' },
  { id: 'DS-OUT-17', titleFa: 'استاندارد RTL' },
  { id: 'DS-OUT-18', titleFa: 'مستندات حاکمیت و تغییر توکن‌ها' },
  { id: 'DS-OUT-19', titleFa: 'سناریوهای آزمون بصری (DS-T01..T10)' },
  { id: 'DS-OUT-20', titleFa: 'معیارهای پذیرش سیستم طراحی' },
];

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

/**
 * Formats financial and statistical metrics according to Section 6.4 of RT-FE-DESIGN-SYSTEM-004.
 */
export function formatRadarDesignSystemMetric(options: {
  totalPriceToman: number;
  pricePerSqmToman: number;
  areaSqm: number;
  jalaliDate: string;
  percentChange: number;
  technicalEntityId: string;
}): {
  formattedTotalPriceFa: string;
  formattedPricePerSqmFa: string;
  formattedAreaFa: string;
  formattedJalaliDateFa: string;
  formattedPercentChangeFa: string;
  preservedTechnicalIdLtr: string;
  tabularNumbersCss: 'tabular-nums';
} {
  const formatWithPersianThousands = (val: number) =>
    toPersianDigits(Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));

  const pctStr = toPersianDigits(Math.abs(options.percentChange).toFixed(1).replace('.', '٫'));

  return {
    formattedTotalPriceFa: `${formatWithPersianThousands(options.totalPriceToman)} تومان`,
    formattedPricePerSqmFa: `${formatWithPersianThousands(options.pricePerSqmToman)} تومان`,
    formattedAreaFa: `${formatWithPersianThousands(options.areaSqm)} متر مربع`,
    formattedJalaliDateFa: toPersianDigits(options.jalaliDate),
    formattedPercentChangeFa: `${pctStr}٪`,
    preservedTechnicalIdLtr: options.technicalEntityId,
    tabularNumbersCss: 'tabular-nums',
  };
}

export function validateDesignTokenSpacing(pxValue: number): {
  valid: boolean;
  matchedTokenId: string | null;
  reasonFa: string;
} {
  const match = RT_FE_DS_SPACING_12.find((s) => s.px === pxValue);
  if (match) {
    return {
      valid: true,
      matchedTokenId: match.id,
      reasonFa: `منطبق با مقیاس مرکزی فاصله‌گذاری (${match.id}: ${match.px}px — مضرب ۴ پیکسل).`,
    };
  }
  return {
    valid: false,
    matchedTokenId: null,
    reasonFa: `فاصله غیرمجاز (${pxValue}px): فاصله‌های تصادفی خارج از مقیاس ۴پیکسلی (SP-001..SP-012) ممنوع هستند.`,
  };
}
