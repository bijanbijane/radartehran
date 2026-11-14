/** @file src/design-system/typographySystem.ts — RT-UI-TYPE-001 Typography System Architecture (Pure TS, zero React) */

export type TypographyRoleId = 'editorial' | 'functional' | 'numerical';

export const TYPOGRAPHY_ROLES: readonly { id: TypographyRoleId; titleEn: string; titleFa: string; scopeFa: string }[] = [
  { id: 'editorial', titleEn: 'Editorial Typography', titleFa: 'تایپوگرافی تحلیلی و محتوایی', scopeFa: 'عنوان‌ها، معرفی محله‌ها، گزارش‌ها، پژوهش‌ها و متن‌های تحلیلی' },
  { id: 'functional', titleEn: 'Functional Typography', titleFa: 'تایپوگرافی کاربردی و کنترلی', scopeFa: 'منوها، دکمه‌ها، فرم‌ها، برچسب‌ها، جدول‌ها و کنترل‌های نقشه' },
  { id: 'numerical', titleEn: 'Numerical Typography', titleFa: 'تایپوگرافی اعداد و داده‌ها', scopeFa: 'قیمت‌ها، درصدها، شناسه‌ها، شاخص‌ها، محورها و مقادیر آماری' },
];

export const FONT_FAMILY_CANDIDATES = {
  baseline: {
    id: 'vazirmatn-ui',
    name: 'Vazirmatn UI',
    cssFontFamily: '"Vazirmatn", -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, sans-serif',
    license: 'SIL Open Font License 1.1',
    weightsCount: 9,
    hasVariableWoff2: true,
    hasUiVariant: true,
    hasFarsiDigitsVariant: true,
    latinPair: 'Roboto',
  },
  comparison: {
    id: 'estedad',
    name: 'Estedad',
    cssFontFamily: '"Estedad", "Vazirmatn", Tahoma, sans-serif',
    license: 'SIL Open Font License 1.1',
    weightsCount: 9,
    hasVariableWoff2: true,
    hasUiVariant: false,
    hasFarsiDigitsVariant: false,
    latinPair: 'Integrated Latin',
  },
  singlePrimaryFamilyPolicy: true,
} as const;

export const FONT_WEIGHT_SYSTEM = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  discouragedThinWeights: [100, 200, 300] as const,
  discouragedHeavyWeights: [800, 900] as const,
} as const;

export const TYPE_SCALE_HEADINGS = {
  display: { desktopPx: 40, mobilePx: 30, weight: 700, lineHeight: 1.45, remDesktop: '2.5rem', remMobile: '1.875rem' },
  h1: { desktopPx: 30, mobilePx: 24, weight: 700, lineHeight: 1.5, remDesktop: '1.875rem', remMobile: '1.5rem' },
  h2: { desktopPx: 24, mobilePx: 21, weight: 600, lineHeight: 1.5, remDesktop: '1.5rem', remMobile: '1.3125rem' },
  h3: { desktopPx: 20, mobilePx: 18, weight: 600, lineHeight: 1.55, remDesktop: '1.25rem', remMobile: '1.125rem' },
  h4: { desktopPx: 18, mobilePx: 16, weight: 600, lineHeight: 1.55, remDesktop: '1.125rem', remMobile: '1rem' },
  h5: { desktopPx: 16, mobilePx: 15, weight: 600, lineHeight: 1.55, remDesktop: '1rem', remMobile: '0.9375rem' },
  h6: { desktopPx: 14, mobilePx: 14, weight: 600, lineHeight: 1.55, remDesktop: '0.875rem', remMobile: '0.875rem' },
} as const;

export const BODY_TYPE_SCALE_PX = {
  bodyXl: 18,
  bodyL: 17,
  bodyM: 16,
  bodyS: 14,
  bodyXs: 13,
  micro: 12,
  criticalInfoMinimumPx: 13,
} as const;

export const LINE_HEIGHT_TOKENS = {
  display: 1.45,
  h1: 1.5,
  h2: 1.5,
  h3h4: 1.55,
  body: 1.8,
  helper: 1.75,
  table: 1.6,
  label: 1.5,
  button: 1.4,
  caption: 1.6,
} as const;

export const EDITORIAL_READING_MEASURE = {
  minPx: 650,
  maxPx: 760,
  recommendedPx: 740,
  maxCharsPerLine: 80,
} as const;

export const MAP_TYPOGRAPHY_LEVELS_PX = {
  districtName: { min: 13, max: 14 },
  neighborhoodName: { min: 12, max: 13 },
  primaryStreet: { min: 11, max: 12 },
  minorStreet: { min: 10, max: 11 },
  pointMarker: { min: 11, max: 13 },
  tooltip: { min: 12, max: 14 },
  panelTitle: { min: 15, max: 16 },
  panelBody: { min: 13, max: 14 },
  legend: { min: 12, max: 13 },
} as const;

export const MODULE_TYPOGRAPHY_MATRIX = {
  home: { headingPx: [30, 40], bodyPx: [16, 16], metricPx: [16, 24] },
  map: { headingPx: [15, 16], bodyPx: [13, 14], metricPx: [12, 14] },
  area: { headingPx: [24, 30], bodyPx: [15, 16], metricPx: [16, 24] },
  market: { headingPx: [24, 30], bodyPx: [14, 16], metricPx: [20, 32] },
  properties: { headingPx: [21, 28], bodyPx: [14, 16], metricPx: [18, 28] },
  valuation: { headingPx: [24, 30], bodyPx: [15, 16], metricPx: [24, 32] },
  services: { headingPx: [22, 28], bodyPx: [14, 16], metricPx: [14, 18] },
  knowledge: { headingPx: [26, 32], bodyPx: [16, 17], metricPx: [14, 18] },
  admin: { headingPx: [20, 24], bodyPx: [13, 14], metricPx: [14, 20] },
} as const;

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

export function toStandardPersianDigits(input: number | string): string {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

export function formatUnifiedPriceTomanFa(amountToman: number, kind: 'total' | 'per_sqm'): string {
  const safe = Number.isFinite(amountToman) ? Math.max(0, Math.round(amountToman)) : 0;
  const formatted = toStandardPersianDigits(safe.toLocaleString('en-US').replace(/,/g, '٬'));
  return kind === 'per_sqm' ? `${formatted}\u00A0تومان به ازای هر مترمربع` : `${formatted}\u00A0تومان`;
}

export function formatUnifiedAreaFa(sqm: number): string {
  const safe = Number.isFinite(sqm) ? Math.max(0, Math.round(sqm)) : 0;
  return `${toStandardPersianDigits(safe)}\u00A0مترمربع`;
}

export function formatUnifiedPercentFa(value: number, decimals = 1): string {
  const safe = Number.isFinite(value) ? value : 0;
  const fixed = safe.toFixed(decimals).replace('.', '٫');
  return `${toStandardPersianDigits(fixed)}٪`;
}

export function formatTechnicalBidiToken(token: string): { text: string; dir: 'ltr'; isolate: true } {
  return { text: String(token).trim(), dir: 'ltr', isolate: true };
}

export const TYPOGRAPHY_ACCEPTANCE_CRITERIA: readonly { id: string; titleFa: string }[] = [
  { id: 'TYP-01', titleFa: 'خانواده فونت فارسی اصلی (Vazirmatn UI) انتخاب و مجوز OFL 1.1 ثبت شده است' },
  { id: 'TYP-02', titleFa: 'دو نامزد اصلی (Vazirmatn UI و Estedad) با نمونه محتوای واقعی تعریف و مقایسه شده‌اند' },
  { id: 'TYP-03', titleFa: 'چهار وزن اصلی فونت (400، 500، 600، 700) تثبیت شده و وزن‌های زائد حذف شده‌اند' },
  { id: 'TYP-04', titleFa: 'سلسله‌مراتب Display و H1 تا H6 با اندازه و وزن مشخص تعریف شده است' },
  { id: 'TYP-05', titleFa: 'اندازه متن بدنه (16px) و مقیاس XL تا Micro مشخص است' },
  { id: 'TYP-06', titleFa: 'فاصله خطوط (Line Height 1.8 برای متن اصلی فارسی) تعریف شده است' },
  { id: 'TYP-07', titleFa: 'عرض خوانایی گزارش‌های تحلیلی (650 تا 760px) مشخص شده است' },
  { id: 'TYP-08', titleFa: 'سیستم ارقام فارسی پیش‌فرض و ارقام لاتین برای کدها و مختصات تعریف شده است' },
  { id: 'TYP-09', titleFa: 'نمایش قیمت کل، قیمت هر مترمربع و دامنه برآورد با واحد پیوسته استاندارد شده است' },
  { id: 'TYP-10', titleFa: 'نمایش متراژ (مترمربع) و درصد با جداکننده فارسی (٫) استاندارد شده است' },
  { id: 'TYP-11', titleFa: 'قواعد RTL و جداسازی <bdi dir="ltr"> برای شناسه‌ها و مختصات مستند و پیاده شده است' },
  { id: 'TYP-12', titleFa: 'تایپوگرافی اختصاصی لایه‌های نقشه (۱۲ تا ۱۶px) تعریف شده است' },
  { id: 'TYP-13', titleFa: 'تایپوگرافی نمودارها (12-18px) و جداول (14px) تعریف شده است' },
  { id: 'TYP-14', titleFa: 'اندازه نوشته‌های فرم، برچسب، خطا و دکمه‌ها (13 تا 16px) مشخص است' },
  { id: 'TYP-15', titleFa: 'قواعد تایپوگرافی واکنش‌گرا در موبایل (<768px) بدون افت خوانایی بدنه تعریف شده است' },
  { id: 'TYP-16', titleFa: 'بارگذاری بهینه فونت با font-display: swap و حذف وزن‌های اضافه بررسی شده است' },
  { id: 'TYP-17', titleFa: 'مشخصات مجوز و نسخه فونت در سیستم طراحی پروژه ثبت شده است' },
  { id: 'TYP-18', titleFa: 'نمایش متن فارسی و ترکیبی در مرورگر واقعی بررسی و تایید شده است' },
  { id: 'TYP-19', titleFa: 'اعداد در جدول‌ها و کارت‌ها با tabular-nums تراز یکنواخت دارند' },
  { id: 'TYP-20', titleFa: 'هیچ اطلاعات حیاتی (خطا، قیمت، شاخص) با اندازه زیر ۱۳px نمایش داده نمی‌شود' },
] as const;
