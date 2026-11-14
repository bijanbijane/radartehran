/** @file src/design-system/spacingGeometrySystem.ts — RT-UI-SPACING-001 Spacing, Dimensions & Geometry System (Pure TS, zero React) */

export const BASE_SPACING_UNIT_PX = 4 as const;

export const SPACING_SCALE = {
  space1: 4,
  space2: 8,
  space3: 12,
  space4: 16,
  space5: 20,
  space6: 24,
  space8: 32,
  space10: 40,
  space12: 48,
  space16: 64,
  space20: 80,
} as const;

export const SPACING_USAGE_RULES_PX = {
  iconToText: 8,
  titleToSubtitle: 8,
  labelToInputRange: [6, 8] as const,
  relatedFieldsRange: [12, 16] as const,
  cardInnerRange: [12, 16] as const,
  cardsInSameGroup: 16,
  independentGroupsRange: [24, 32] as const,
  mainPageSectionsRange: [40, 64] as const,
  paragraphsRange: [12, 16] as const,
} as const;

export const BORDER_RADIUS_SCALE_PX = {
  none: 0,
  radius1Xs: 4,
  radius2Sm: 6,
  radius3Md: 8,
  radius4Lg: 12,
  radius5Xl: 16,
  radius6Xxl: 20,
  radius7Xxxl: 24,
  pill: 999,
} as const;

export const SEMANTIC_RADIUS_DEFAULTS_PX = {
  card: 12,
  panel: 12,
  input: 8,
  button: 8,
  dialog: 16,
  bottomSheetTop: 20,
  tooltip: 6,
  compactTag: 4,
} as const;

export const BORDER_SYSTEM_PX = {
  border0None: 0,
  border1Subtle: 1,
  border2SelectedOrFocus: 2,
  border3StrongFocus: 3,
} as const;

export const ELEVATION_LEVELS = [
  { level: 0, nameEn: 'Elevation 0', usageFa: 'سطح عادی بدون سایه' },
  { level: 1, nameEn: 'Elevation 1', usageFa: 'سایه بسیار ملایم برای کارت‌های قابل تعامل و منتخب' },
  { level: 2, nameEn: 'Elevation 2', usageFa: 'سایه متوسط برای منوها، Tooltip، Bottom Sheet و پنل شناور نقشه' },
  { level: 3, nameEn: 'Elevation 3', usageFa: 'سایه برجسته برای Dialog و Modalهای مهم' },
] as const;

export const BUTTON_DIMENSIONS_PX = {
  xs: 32,
  sm: 36,
  md: 40,
  lg: 48,
  compactControlMin: 28,
  touchTargetMin: 44,
  touchTargetPreferred: 48,
  wcagMinimumTarget: 24,
} as const;

export const INPUT_DIMENSIONS_PX = {
  compact: 36,
  standard: 44,
  comfortable: 48,
  touch: 52,
} as const;

export const ICON_DIMENSIONS_PX = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const BAR_HEIGHTS_PX = {
  headerPublic: 68,
  headerCompact: 56,
  secondaryNav: 48,
  mapControlBar: 48,
  statusBar: 32,
  mobileBottomNav: 64,
  mobileBottomNavRange: [60, 68] as const,
} as const;

export const CARD_PADDING_PX = {
  compact: 12,
  standard: 16,
  largeInfo: 20,
  metric: 24,
} as const;

export const MAP_EXPLORER_GEOMETRY = {
  toolbarWidthPx: 48,
  toolbarButtonDesktopPx: 40,
  toolbarButtonMobilePx: 48,
  toolbarVerticalGapDesktopPx: 8,
  toolbarVerticalGapMobilePx: 12,
  panelWidthStandardPx: 352,
  panelWidthCompactPx: 312,
  panelWidthSpecializedMaxPx: 420,
  panelWidthMinPx: 280,
  panelMapGapDesktopRangePx: [8, 12] as const,
  panelMapGapMobilePx: 8,
  mapControlDesktopRangePx: [40, 44] as const,
  mapControlMobileTargetPx: 48,
  layerPickerWidthRangePx: [280, 340] as const,
  layerPickerRowHeightRangePx: [44, 48] as const,
  bottomSheet: {
    topRadiusPx: 20,
    bottomRadiusAttachedPx: 0,
    collapsedMinHeightPx: 72,
    halfOpenPctRange: [40, 55] as const,
    openPctRange: [85, 92] as const,
    innerPaddingPx: 16,
    dragHandleMinWidthPx: 40,
  },
} as const;

export const TABLE_AND_OVERLAY_GEOMETRY = {
  tableRowHeightPx: { compact: [36, 40], standard: [44, 48], comfortable: [52, 56], adminDense: [40, 44] } as const,
  tableCellPaddingPx: { compact: { x: 8, y: 8 }, standard: { x: 12, y: 12 }, comfortable: { x: 16, y: 14 } } as const,
  dialogWidthsPx: { small: [360, 440], medium: [520, 640], large: [720, 880] } as const,
  tooltip: { paddingXRange: [8, 12], paddingYRange: [6, 8], radiusPx: 6, maxWidthPx: 280, offsetPx: 8 } as const,
} as const;

export const RESPONSIVE_GEOMETRY_MATRIX = {
  desktop: {
    pagePaddingXPx: 32,
    sectionGapPx: 48,
    cardPaddingPx: 20,
    headerHeightPx: 68,
    buttonHeightPx: 40,
    inputHeightPx: 44,
    formFieldGapPx: 16,
    cardRadiusPx: 12,
  },
  mobile: {
    pagePaddingXPx: 16,
    sectionGapRangePx: [24, 32] as const,
    cardPaddingPx: 16,
    headerHeightPx: 56,
    buttonHeightRangePx: [44, 48] as const,
    inputHeightRangePx: [48, 52] as const,
    formFieldGapPx: 16,
    cardRadiusPx: 12,
  },
} as const;

export const CONSOLIDATED_GEOMETRY_DECISIONS = {
  headerPublicPx: 68,
  headerCompactPx: 56,
  secondaryNavPx: 48,
  cardRadiusPx: 12,
  inputRadiusPx: 8,
  buttonRadiusPx: 8,
  buttonStandardHeightPx: 40,
  inputStandardHeightPx: 44,
  touchControlMinPx: 44,
  mapPanelWidthPx: 352,
  mapPanelCompactWidthPx: 312,
  mapToolbarWidthPx: 48,
  mobilePagePaddingPx: 16,
} as const;

export const GEOMETRY_PROHIBITIONS: readonly { id: string; ruleFa: string }[] = [
  { id: 'GEO-001', ruleFa: 'تعریف فاصله‌های تصادفی خارج از مقیاس ۴px' },
  { id: 'GEO-002', ruleFa: 'استفاده از Radiusهای متعدد و نامنسجم در اجزای هم‌نوع' },
  { id: 'GEO-003', ruleFa: 'استفاده از سایه سنگین برای تمام کارت‌ها' },
  { id: 'GEO-004', ruleFa: 'ترکیب همزمان Border ضخیم و Shadow سنگین روی کارت معمولی' },
  { id: 'GEO-005', ruleFa: 'کوچک کردن غیرضروری ناحیه لمس زیر ۴۴×۴۴px' },
  { id: 'GEO-006', ruleFa: 'ارتفاع متفاوت کنترل‌های هم‌نوع' },
  { id: 'GEO-007', ruleFa: 'تغییر بی‌دلیل Padding صفحات مشابه' },
  { id: 'GEO-008', ruleFa: 'ساخت دکمه‌هایی با اندازه غیرمتعارف' },
  { id: 'GEO-009', ruleFa: 'فاصله نامناسب میان آیکون و متن (خارج از ۸px)' },
  { id: 'GEO-010', ruleFa: 'پنل‌های شناور بسیار بزرگ روی بوم نقشه' },
  { id: 'GEO-011', ruleFa: 'پنل نقشه بدون امکان جمع شدن یا تغییر وضعیت' },
  { id: 'GEO-012', ruleFa: 'جدول‌های بیش‌ازحد فشرده بدون حفظ ارتفاع خوانا' },
  { id: 'GEO-013', ruleFa: 'کارت‌های بیش‌ازحد مرتفع با فضای خالی مصنوعی' },
  { id: 'GEO-014', ruleFa: 'استفاده از Radius قرصی (999px) برای همه دکمه‌ها و اجزا' },
  { id: 'GEO-015', ruleFa: 'انباشته شدن چندین سایه روی پنل‌های نقشه' },
  { id: 'GEO-016', ruleFa: 'کوچک کردن کنترل‌ها برای جا دادن محتوای اضافی' },
  { id: 'GEO-017', ruleFa: 'عدم رعایت Safe Area موبایل در نوار پایین و Bottom Sheet' },
  { id: 'GEO-018', ruleFa: 'استفاده از عرض ثابت یکسان برای تمام صفحات محصول' },
  { id: 'GEO-019', ruleFa: 'وابسته کردن ابعاد به یک نمایشگر خاص' },
  { id: 'GEO-020', ruleFa: 'استفاده از مقادیر هندسی بدون ثبت در Design Tokens' },
] as const;

export const SPACING_GEOMETRY_ACCEPTANCE_CRITERIA: readonly { id: string; titleFa: string }[] = [
  { id: 'SPC-01', titleFa: 'واحد پایه ۴ پیکسل در سیستم ثبت شده است' },
  { id: 'SPC-02', titleFa: 'مقیاس فاصله‌گذاری (4px تا 80px) مشخص است' },
  { id: 'SPC-03', titleFa: 'Radiusهای استاندارد (4px تا 24px + pill) تعریف شده‌اند' },
  { id: 'SPC-04', titleFa: 'قواعد Border و ضخامت آن (0 تا 3px) مشخص است' },
  { id: 'SPC-05', titleFa: 'سیستم Elevation و سایه ۴ سطحی (0 تا 3) تعریف شده است' },
  { id: 'SPC-06', titleFa: 'ارتفاع دکمه‌ها (XS=32 تا LG=48px) مشخص است' },
  { id: 'SPC-07', titleFa: 'ارتفاع ورودی‌ها (36 تا 52px، استاندارد 44px) مشخص است' },
  { id: 'SPC-08', titleFa: 'ناحیه‌های لمس موبایل (حداقل 44px و ترجیحاً 48px) استاندارد شده‌اند' },
  { id: 'SPC-09', titleFa: 'ابعاد آیکون‌ها (14px تا 40px) تعریف شده‌اند' },
  { id: 'SPC-10', titleFa: 'ارتفاع هدرها (68px عمومی / 56px فشرده) و نوارهای ناوبری مشخص است' },
  { id: 'SPC-11', titleFa: 'Padding کارت‌ها (12، 16، 20، 24px) استاندارد شده است' },
  { id: 'SPC-12', titleFa: 'عرض پنل‌های عمومی تعریف شده است' },
  { id: 'SPC-13', titleFa: 'عرض پنل نقشه (352px عادی / 312px فشرده) مشخص شده است' },
  { id: 'SPC-14', titleFa: 'ابعاد Toolbar نقشه (48px) تعریف شده است' },
  { id: 'SPC-15', titleFa: 'هندسه Bottom Sheet (گوشه بالا 20px، جمع‌شده 72px، باز 85-92٪) مشخص است' },
  { id: 'SPC-16', titleFa: 'ارتفاع ردیف‌های جدول (36-56px) استاندارد شده است' },
  { id: 'SPC-17', titleFa: 'ابعاد Dialog و Modal (Small/Medium/Large) تعریف شده است' },
  { id: 'SPC-18', titleFa: 'فاصله پنل‌ها و عناصر شناور (8-12px) مشخص است' },
  { id: 'SPC-19', titleFa: 'قواعد واکنش‌گرایی ابعاد بین دسکتاپ و موبایل تعریف شده است' },
  { id: 'SPC-20', titleFa: 'توکن‌های هندسی به قرارداد CSS (:root tokens) تبدیل شده‌اند' },
  { id: 'SPC-21', titleFa: 'قواعد Safe Area موبایل بررسی و لحاظ شده‌اند' },
  { id: 'SPC-22', titleFa: 'همه اجزای مشابه از توکن‌های مشترک استفاده می‌کنند' },
  { id: 'SPC-23', titleFa: 'ابعاد در نمونه واقعی رابط آزمایش و بررسی شده‌اند' },
] as const;

export function isSpacingValueOnGrid(px: number): boolean {
  return (Object.values(SPACING_SCALE) as number[]).includes(px);
}
