/** @file src/design-system/colorSystem.ts — RT-UI-COLOR-001 4-Layer Color System Architecture (Pure TS, zero React) */

export const BRAND_PALETTE = {
  brand950: '#072220',
  brand900: '#0B302D',
  brand800: '#0F3F3B',
  brand700: '#14534E',
  brand600: '#176B63', // Primary Brand Identity (Deep Petroleum Green)
  brand500: '#279487',
  brand400: '#70B9AA',
  brand200: '#B8DED4',
  brand100: '#DCEFEA',
  brand50: '#F1F8F6',
  brandSoft: '#EAF3F0',
  brandFgLight: '#176B63',
  brandFgDark: '#6FE0D0',
} as const;

export const NEUTRAL_PALETTE = {
  canvas: '#F6F8F6',
  surface: '#FFFFFF',
  surfaceSubtle: '#F1F4F2',
  surfaceSunken: '#E9EFEC',
  surfaceSelected: '#EAF3F0',
  surfaceDisabled: '#E8ECE9',
  textPrimary: '#182522',
  textSecondary: '#34433E',
  textMuted: '#4A5B56',
  textSubdued: '#5E6E69',
  borderSubtle: '#DCE3DF',
  borderStrong: '#C5D0CA',
  borderControl: '#7F8F86',
  borderControlMuted: '#87958D',
} as const;

export const SEMANTIC_PALETTE = {
  success: { fg: '#176B4C', bg: '#EAF5EE', border: '#B9DEC8' },
  warning: { fg: '#875000', bg: '#FFF4E5', border: '#F2D19B' },
  danger: { fg: '#A61B1B', bg: '#FDECEC', border: '#F2B8B8' },
  info: { fg: '#155E9A', bg: '#EAF3FB', border: '#B9D8F0' },
  neutral: { fg: '#48534F', bg: '#F0F2F1', border: '#D8DEDA' },
  focusRing: '#2864DC',
} as const;

export const CARTOGRAPHIC_PALETTE = {
  basemap: {
    backdrop: '#F2F4F1',
    land: '#F7F8F5',
    roadMinor: '#E5E9E5',
    roadMajor: '#CCD5D0',
    water: '#DCE9EC',
    park: '#DFEAE0',
    geoLabel: '#53615A',
    boundary: '#8A9891',
    selectedBoundary: '#176B63',
  },
  // Sequential 5-step purple scale keeps GIS price heatmap distinct from brand green
  priceIntensitySequential: ['#F1EDF7', '#D9CBE8', '#B69BD1', '#8B68B3', '#5D3C80'] as const,
  // Sequential 5-step steel-blue scale for listing density (distinct from price intensity & demand)
  listingDensitySequential: ['#EEF4F8', '#CFE0EE', '#9BC0DC', '#5D92BD', '#2B6290'] as const,
  // Diverging market change scale (decreases <-> flat <-> increases)
  marketChangeDiverging: ['#A84F43', '#D49A92', '#E9EFEC', '#6FA99B', '#1B7F74'] as const,
  landUseCategorical: {
    residential: '#547C9D',
    commercial: '#D59A45',
    office: '#8873AB',
    industrial: '#707C82',
    greenOpen: '#6B9C77',
    mixed: '#B97883',
    transport: '#3F9C9A',
  },
  markers: {
    normal: '#176B63',
    selected: '#103B38',
    cluster: '#245D56',
    userLocation: '#2864DC',
    selectedArea: '#176B63',
    activeDrawArea: '#1B7F74',
  },
} as const;

export const DATA_VIZ_SERIES_PALETTE = [
  '#176B63', // Series 1
  '#3B6F91', // Series 2
  '#8065A8', // Series 3
  '#B7791F', // Series 4
  '#A84F43', // Series 5
  '#64716B', // Series 6 (reference)
] as const;

export const PUBLIC_PAGE_COLOR_BALANCE_RATIO = {
  neutralPct: 80,
  brandAndAccentPct: 10,
  semanticAndDataPct: 10,
} as const;

export function parseHexChannel(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return [r, g, b];
}

export function computeRelativeLuminance(hex: string): number {
  const [r, g, b] = parseHexChannel(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function computeHexContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = computeRelativeLuminance(fgHex);
  const l2 = computeRelativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export const COLOR_CONTRAST_CHECKS = [
  { id: 'primary-text-on-surface', fg: NEUTRAL_PALETTE.textPrimary, bg: NEUTRAL_PALETTE.surface, minRatio: 4.5 },
  { id: 'primary-text-on-canvas', fg: NEUTRAL_PALETTE.textPrimary, bg: NEUTRAL_PALETTE.canvas, minRatio: 4.5 },
  { id: 'white-on-brand-800', fg: '#FFFFFF', bg: BRAND_PALETTE.brand800, minRatio: 4.5 },
  { id: 'white-on-brand-900', fg: '#FFFFFF', bg: BRAND_PALETTE.brand900, minRatio: 4.5 },
  { id: 'muted-text-on-surface', fg: NEUTRAL_PALETTE.textMuted, bg: NEUTRAL_PALETTE.surface, minRatio: 4.5 },
  { id: 'success-fg-on-bg', fg: SEMANTIC_PALETTE.success.fg, bg: SEMANTIC_PALETTE.success.bg, minRatio: 4.5 },
  { id: 'warning-fg-on-bg', fg: SEMANTIC_PALETTE.warning.fg, bg: SEMANTIC_PALETTE.warning.bg, minRatio: 4.5 },
  { id: 'danger-fg-on-bg', fg: SEMANTIC_PALETTE.danger.fg, bg: SEMANTIC_PALETTE.danger.bg, minRatio: 4.5 },
  { id: 'info-fg-on-bg', fg: SEMANTIC_PALETTE.info.fg, bg: SEMANTIC_PALETTE.info.bg, minRatio: 4.5 },
] as const;

export const COLOR_SYSTEM_ACCEPTANCE_CRITERIA: readonly { id: string; titleFa: string }[] = [
  { id: 'COL-01', titleFa: 'رنگ اصلی برند (سبز نفتی #176B63) تعیین شده است' },
  { id: 'COL-02', titleFa: 'طیف کامل رنگ برند (50 تا 950) تعریف شده است' },
  { id: 'COL-03', titleFa: 'رنگ‌های خنثی و سطوح مستقل (#F6F8F6 و #FFFFFF) تعریف شده‌اند' },
  { id: 'COL-04', titleFa: 'رنگ‌های متن دارای سلسله‌مراتب ۴سطحی هستند' },
  { id: 'COL-05', titleFa: 'رنگ‌های معنایی (Success/Warning/Danger/Info/Neutral) مستقل تعریف شده‌اند' },
  { id: 'COL-06', titleFa: 'رنگ نقشه پایه کم‌تنش و روشن مشخص شده است' },
  { id: 'COL-07', titleFa: 'پالت قیمت مسکن (طیف بنفش ۵مرحله‌ای) جداگانه تعریف شده است' },
  { id: 'COL-08', titleFa: 'پالت تراکم آگهی‌ها از تقاضای واقعی تفکیک و تعریف شده است' },
  { id: 'COL-09', titleFa: 'پالت واگرای تغییرات مثبت و منفی بازار مشخص شده است' },
  { id: 'COL-10', titleFa: 'پالت دسته‌بندی کاربری اراضی ۷گانه تعریف شده است' },
  { id: 'COL-11', titleFa: 'رنگ سری‌های نمودار (Series 1..6) از رنگ وضعیت‌ها تفکیک شده است' },
  { id: 'COL-12', titleFa: 'رنگ اجزای تعاملی و دکمه‌های اصلی/ثانویه مشخص شده است' },
  { id: 'COL-13', titleFa: 'رنگ حالت‌های Hover و Pressed برای دکمه‌ها و کارت‌ها تعریف شده است' },
  { id: 'COL-14', titleFa: 'رنگ Focus اختصاصی (#2864DC) با کنتراست بالا تعریف شده است' },
  { id: 'COL-15', titleFa: 'کنتراست WCAG 2.2 AA برای جفت‌رنگ‌های اصلی بررسی و تایید شده است' },
  { id: 'COL-16', titleFa: 'استقلال از رنگ به‌عنوان تنها ابزار معنا و آمادگی تست کوررنگی لحاظ شده است' },
  { id: 'COL-17', titleFa: 'نسبت مصرف رنگی ۸۰٪ خنثی / ۱۰٪ برند / ۱۰٪ داده در صفحات عمومی رعایت شده است' },
  { id: 'COL-18', titleFa: 'قواعد مصرف رنگ در Design Tokens CSS و ماژول colorSystem ثبت شده‌اند' },
  { id: 'COL-19', titleFa: 'تفاوت رنگ لایه‌های کارتوگرافیک نقشه و رابط عمومی مشخص شده است' },
  { id: 'COL-20', titleFa: 'تم روشن پیش‌فرض و توکن‌های مستقل تم تاریک در معماری پیش‌بینی شده است' },
] as const;

export const RADAR_BRAND_COLOR_TOKENS = {
  ...BRAND_PALETTE,
  'brand-500': BRAND_PALETTE.brand500,
  'brand-600': BRAND_PALETTE.brand600,
  'brand-700': BRAND_PALETTE.brand700,
  emerald600: BRAND_PALETTE.brand600,
} as const;

export const RADAR_LIGHT_SURFACE_TEXT_TOKENS = {
  ...NEUTRAL_PALETTE,
  'bg-canvas': NEUTRAL_PALETTE.canvas,
  'bg-surface': NEUTRAL_PALETTE.surface,
  'bg-elevated': '#FFFFFF',
  'bg-muted': NEUTRAL_PALETTE.surfaceSubtle,
  'text-primary': NEUTRAL_PALETTE.textPrimary,
  'text-secondary': NEUTRAL_PALETTE.textSecondary,
  'text-muted': NEUTRAL_PALETTE.textMuted,
  'border-subtle': NEUTRAL_PALETTE.borderSubtle,
  'border-strong': NEUTRAL_PALETTE.borderStrong,
  focus: SEMANTIC_PALETTE.focusRing,
} as const;

export const RADAR_DARK_SURFACE_TEXT_TOKENS = {
  canvas: '#0A110F',
  surface: '#111C19',
  surfaceSubtle: '#172521',
  surfaceSunken: '#0D1614',
  surfaceSelected: '#16302B',
  surfaceDisabled: '#1E2A27',
  textPrimary: '#F1F5F3',
  textSecondary: '#C5D0CA',
  textMuted: '#8A9891',
  textSubdued: '#64716B',
  borderSubtle: '#22312C',
  borderStrong: '#2E423B',
  borderControl: '#485E56',
  borderControlMuted: '#394B45',
  'bg-canvas': '#0A110F',
  'bg-surface': '#111C19',
  'bg-elevated': '#172521',
  'bg-muted': '#0D1614',
  'text-primary': '#F1F5F3',
  'text-secondary': '#C5D0CA',
  'text-muted': '#8A9891',
  'border-subtle': '#22312C',
  'border-strong': '#2E423B',
  focus: '#6B9BFF',
} as const;

export const RADAR_SEMANTIC_STATUS_PALETTE = SEMANTIC_PALETTE;
export const RADAR_MAP_GEO_TOKENS = CARTOGRAPHIC_PALETTE;
export const RADAR_CHART_8_SERIES_PALETTE = DATA_VIZ_SERIES_PALETTE;

