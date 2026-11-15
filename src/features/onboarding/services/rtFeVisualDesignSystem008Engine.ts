/**
 * RT-FE-VISUAL-DESIGN-SYSTEM-008: مرحله هشتم — طراحی و معماری سیستم طراحی بصری (Visual Design System)
 * (19 Visual Design Units VDS-001..VDS-019, Brand Palette #173B57 / #246B8F / #3C8D91 / #D5A64A,
 * 4-Token Semantic Status System, Elevation E0..E5 & Central Z-Index, 3 Visual Density Modes,
 * 9 Chart Types, 10 Map Visual Layers & 6-Level Hierarchy, Media Aspect Ratios, VDS-OUT-001..028)
 */

export const RT_FE_VISUAL_DESIGN_SYSTEM_008_SPEC_ID = 'RT-FE-VISUAL-DESIGN-SYSTEM-008' as const;

export const RT_FE_VDS_BRAND_PALETTE_4: readonly { nameEn: string; nameFa: string; hex: string; roleFa: string }[] = [
  { nameEn: 'Deep Navy', nameFa: 'سرمه‌ای عمیق رادار', hex: '#173B57', roleFa: 'رنگ پایه هویت تحلیلی، هدر و سطوح با اقتدار بالا' },
  { nameEn: 'Radar Blue', nameFa: 'آبی رادار', hex: '#246B8F', roleFa: 'رنگ اصلی عملیات، لینک‌های مرجع و تمرکز برند (--blue-700)' },
  { nameEn: 'Teal', nameFa: 'سبزآبی شهری', hex: '#3C8D91', roleFa: 'رنگ مکمل داده‌های مکانی، محله‌ها و شاخص‌های شهری' },
  { nameEn: 'Amber', nameFa: 'کهربایی تأکیدی', hex: '#D5A64A', roleFa: 'نقطه کانونی، نشانه‌های ویژه و تمایز داده‌های کلیدی' },
];

export interface SemanticStatusFourTokens {
  status: 'Success' | 'Warning' | 'Danger' | 'Information' | 'Neutral';
  meaningFa: string;
  backgroundToken: string;
  borderToken: string;
  textToken: string;
  iconToken: string;
}

export const RT_FE_VDS_SEMANTIC_STATUS_5: readonly SemanticStatusFourTokens[] = [
  { status: 'Success', meaningFa: 'موفقیت، تأیید یا اعتبار', backgroundToken: '--status-success-bg', borderToken: '--status-success-border', textToken: '--status-success-text', iconToken: '--status-success-icon' },
  { status: 'Warning', meaningFa: 'هشدار و نیاز به توجه', backgroundToken: '--status-warning-bg', borderToken: '--status-warning-border', textToken: '--status-warning-text', iconToken: '--status-warning-icon' },
  { status: 'Danger', meaningFa: 'خطا، خطر یا وضعیت منفی', backgroundToken: '--status-danger-bg', borderToken: '--status-danger-border', textToken: '--status-danger-text', iconToken: '--status-danger-icon' },
  { status: 'Information', meaningFa: 'اطلاع‌رسانی', backgroundToken: '--status-info-bg', borderToken: '--status-info-border', textToken: '--status-info-text', iconToken: '--status-info-icon' },
  { status: 'Neutral', meaningFa: 'وضعیت بدون قضاوت', backgroundToken: '--status-neutral-bg', borderToken: '--status-neutral-border', textToken: '--status-neutral-text', iconToken: '--status-neutral-icon' },
];

export const RT_FE_VDS_ELEVATION_6: readonly { level: 'E0' | 'E1' | 'E2' | 'E3' | 'E4' | 'E5'; usageFa: string; zIndexLayer: string }[] = [
  { level: 'E0', usageFa: 'محتوای عادی و پایه صفحه', zIndexLayer: 'Base Content (z-0)' },
  { level: 'E1', usageFa: 'کارت‌های ساده و پنل‌های هم‌سطح', zIndexLayer: 'Sticky Elements (z-10)' },
  { level: 'E2', usageFa: 'عناصر شناور و نوارهای ابزار چسبان', zIndexLayer: 'Dropdowns (z-30)' },
  { level: 'E3', usageFa: 'منوها و Popoverها', zIndexLayer: 'Popovers (z-40)' },
  { level: 'E4', usageFa: 'پنجره‌های Modal و Drawer', zIndexLayer: 'Drawers & Modals (z-50..60)' },
  { level: 'E5', usageFa: 'پنل‌های فوقانی مهم و اعلان‌های بحرانی', zIndexLayer: 'Critical Notifications (z-70)' },
];

export type VisualDensityMode = 'Comfortable' | 'Standard' | 'Compact';

export interface VisualDensitySpec {
  mode: VisualDensityMode;
  titleFa: string;
  targetAudienceFa: string;
  useCasesFa: readonly string[];
  rowHeightPx: number;
  cardPaddingPx: number;
  minTouchTargetPreservedPx: 44;
}

export const RT_FE_VDS_DENSITY_3: readonly VisualDensitySpec[] = [
  {
    mode: 'Comfortable',
    titleFa: 'نمایش خلوت و عمومی',
    targetAudienceFa: 'کاربران عمومی',
    useCasesFa: ['صفحه اصلی', 'شناسنامه ملک', 'صفحات معرفی محله', 'صفحات آموزشی'],
    rowHeightPx: 52,
    cardPaddingPx: 24,
    minTouchTargetPreservedPx: 44,
  },
  {
    mode: 'Standard',
    titleFa: 'تراکم معمول و متوازن',
    targetAudienceFa: 'کاربران عمومی و نیمه‌حرفه‌ای',
    useCasesFa: ['فهرست املاک', 'داشبوردهای عمومی', 'صفحات تحلیل عادی', 'پنل‌های کاربری'],
    rowHeightPx: 44,
    cardPaddingPx: 16,
    minTouchTargetPreservedPx: 44,
  },
  {
    mode: 'Compact',
    titleFa: 'نمایش فشرده و داده‌محور',
    targetAudienceFa: 'کاربران حرفه‌ای، پژوهشگران و مدیران',
    useCasesFa: ['جداول تخصصی', 'پنل مدیریت', 'داشبوردهای حرفه‌ای', 'ابزارهای پژوهشی و مقایسه'],
    rowHeightPx: 36,
    cardPaddingPx: 12,
    minTouchTargetPreservedPx: 44,
  },
];

export const RT_FE_VDS_CHART_TYPES_9: readonly { typeEn: string; usageFa: string }[] = [
  { typeEn: 'Line', usageFa: 'روند زمانی قیمت و شاخص‌ها' },
  { typeEn: 'Bar', usageFa: 'مقایسه مقادیر بین مناطق و محله‌ها' },
  { typeEn: 'Area', usageFa: 'تغییرات تجمعی یا حجمی عرضه و معاملات' },
  { typeEn: 'Scatter', usageFa: 'رابطه متغیرها (مثلاً سن ساختمان و قیمت هر متر)' },
  { typeEn: 'Histogram', usageFa: 'توزیع فراوانی متراژ یا قیمت' },
  { typeEn: 'Box Plot', usageFa: 'پراکندگی، میانه و چارک‌های آماری قیمت محله' },
  { typeEn: 'Heatmap', usageFa: 'شدت و تراکم تقاضا یا تغییرات' },
  { typeEn: 'Pie', usageFa: 'سهم دسته‌ها در موارد محدود (حداکثر ۴ تا ۵ دسته)' },
  { typeEn: 'Map Chart', usageFa: 'الگوی جغرافیایی شاخص‌ها روی نقشه' },
];

export const RT_FE_VDS_MAP_HIERARCHY_6: readonly { priorityRank: number; layerNameEn: string; labelFa: string }[] = [
  { priorityRank: 1, layerNameEn: 'Selected Object', labelFa: 'عنصر انتخاب‌شده (بالاترین اولویت بصری)' },
  { priorityRank: 2, layerNameEn: 'Active Data Layer', labelFa: 'لایه داده فعال (نشانگر املاک، نقشه حرارتی قیمت یا ساختمان‌ها)' },
  { priorityRank: 3, layerNameEn: 'Primary Geographic Boundaries', labelFa: 'مرزهای جغرافیایی اصلی (منطقه و محله انتخاب‌شده)' },
  { priorityRank: 4, layerNameEn: 'Secondary Boundaries', labelFa: 'مرزهای فرعی و مجاور' },
  { priorityRank: 5, layerNameEn: 'Contextual Markers', labelFa: 'نشانگرهای زمینه‌ای (ایستگاه مترو، خدمات شهری)' },
  { priorityRank: 6, layerNameEn: 'Base Map Details', labelFa: 'جزئیات نقشه پایه (معابر و پس‌زمینه هماهنگ با تم)' },
];

export const RT_FE_VDS_MEDIA_RATIOS_6: readonly { useCaseFa: string; aspectRatio: string }[] = [
  { useCaseFa: 'تصویر ملک', aspectRatio: '4:3' },
  { useCaseFa: 'تصویر شاخص صفحه (Hero)', aspectRatio: '16:9' },
  { useCaseFa: 'تصویر پروفایل و آواتار', aspectRatio: '1:1' },
  { useCaseFa: 'تصویر کارت خدمات', aspectRatio: '4:3' },
  { useCaseFa: 'تصویر نقشه', aspectRatio: 'Container-Proportional' },
  { useCaseFa: 'نمودار تحلیلی', aspectRatio: 'Content-Adaptive' },
];

export const RT_FE_VDS_19_UNITS: readonly { id: string; titleEn: string; titleFa: string }[] = [
  { id: 'VDS-001', titleEn: 'Brand Identity', titleFa: 'معماری هویت بصری برند و قواعد لوگو' },
  { id: 'VDS-002', titleEn: 'Color System', titleFa: 'سیستم رنگ ۶لایه (Brand, Neutral, Semantic, Data, Geo, Surface)' },
  { id: 'VDS-003', titleEn: 'Light & Dark Themes', titleFa: 'معماری حالت روشن (عمومی) و تاریک (تحلیلی حرفه‌ای)' },
  { id: 'VDS-004', titleEn: 'Persian & Latin Typography', titleFa: 'تایپوگرافی Vazirmatn / Inter و مقیاس Display..Micro' },
  { id: 'VDS-005', titleEn: 'Spacing System', titleFa: 'نظام فاصله‌گذاری مضرب ۴ پیکسل (space-0 تا space-20)' },
  { id: 'VDS-006', titleEn: 'Sizing System', titleFa: 'نظام اندازه‌ها (کنترل‌ها 32..52px، آیکون‌ها XS..XL، عرض 640..1200+)' },
  { id: 'VDS-007', titleEn: 'Grid System', titleFa: 'شبکه ۱۲ ستون دسکتاپ (24px)، ۸ ستون تبلت (16px) و ۴ ستون موبایل (12px)' },
  { id: 'VDS-008', titleEn: 'Border & Radius', titleFa: 'شعاع گوشه‌ها (radius-none..radius-full) و ضخامت حاشیه (0/1/2px)' },
  { id: 'VDS-009', titleEn: 'Shadow, Elevation & Z-Index', titleFa: 'سطوح ارتفاع E0..E5 و مقیاس مرکزی Z-index' },
  { id: 'VDS-010', titleEn: 'Iconography', titleFa: 'نظام آیکون‌نگاری ۱۰دسته‌ای (منع استفاده از Emoji به‌جای آیکون)' },
  { id: 'VDS-011', titleEn: 'Visual Density', titleFa: 'سه سطح تراکم بصری (Comfortable / Standard / Compact)' },
  { id: 'VDS-012', titleEn: 'Chart Visual Language', titleFa: 'زبان بصری ۹ نوع نمودار و تفکیک داده مفقود از مقدار صفر' },
  { id: 'VDS-013', titleEn: 'Map Visual Language', titleFa: 'زبان بصری ۱۰ لایه نقشه و سلسله‌مراتب ۶سطحی اولویت بصری' },
  { id: 'VDS-014', titleEn: 'Image & Media Guidelines', titleFa: 'استاندارد نسبت ابعاد تصاویر (4:3، 16:9، 1:1) بدون پرش Layout' },
  { id: 'VDS-015', titleEn: 'Component Visual States', titleFa: '۱۰ وضعیت بصری استاندارد کامپوننت‌ها بدون پرش اندازه' },
  { id: 'VDS-016', titleEn: 'Visual Accessibility', titleFa: 'دسترس‌پذیری بصری WCAG 2.2 AA (کنتراست 4.5:1 و جایگزین جدولی نقشه/نمودار)' },
  { id: 'VDS-017', titleEn: 'Design Tokens Architecture', titleFa: 'معماری سه‌لایه Primitive، Semantic و Component Tokens' },
  { id: 'VDS-018', titleEn: 'Tailwind Integration', titleFa: 'اتصال CSS Variables به Tailwind Theme' },
  { id: 'VDS-019', titleEn: 'Cloudflare Asset Delivery', titleFa: 'تحویل فونت، آیکون و رسانه روی CDN/R2 بدون وابستگی رندر اولیه به API' },
];

export const RT_FE_VDS_DELIVERABLES_28: readonly { id: string; titleFa: string }[] = [
  { id: 'VDS-OUT-001', titleFa: 'منشور هویت بصری' },
  { id: 'VDS-OUT-002', titleFa: 'استاندارد لوگو' },
  { id: 'VDS-OUT-003', titleFa: 'پالت رنگ برند (#173B57, #246B8F, #3C8D91, #D5A64A)' },
  { id: 'VDS-OUT-004', titleFa: 'پالت رنگ خنثی (50..900)' },
  { id: 'VDS-OUT-005', titleFa: 'سیستم رنگ معنایی ۴توکنی (Background, Border, Text, Icon)' },
  { id: 'VDS-OUT-006', titleFa: 'سیستم رنگ داده' },
  { id: 'VDS-OUT-007', titleFa: 'سیستم رنگ نقشه' },
  { id: 'VDS-OUT-008', titleFa: 'Light Theme' },
  { id: 'VDS-OUT-009', titleFa: 'Dark Theme' },
  { id: 'VDS-OUT-010', titleFa: 'استاندارد فونت فارسی (Vazirmatn / Estedad / IRANSansX)' },
  { id: 'VDS-OUT-011', titleFa: 'استاندارد فونت لاتین (Inter)' },
  { id: 'VDS-OUT-012', titleFa: 'مقیاس تایپوگرافی (Display 36px تا Micro 11px)' },
  { id: 'VDS-OUT-013', titleFa: 'قرارداد نمایش اعداد و واحدها' },
  { id: 'VDS-OUT-014', titleFa: 'Spacing System (space-0 تا space-20)' },
  { id: 'VDS-OUT-015', titleFa: 'Sizing System (Small 32px تا Touch Large 52px)' },
  { id: 'VDS-OUT-016', titleFa: 'Grid System (12 / 8 / 4 ستون)' },
  { id: 'VDS-OUT-017', titleFa: 'Border و Radius' },
  { id: 'VDS-OUT-018', titleFa: 'Shadow و Elevation (E0..E5)' },
  { id: 'VDS-OUT-019', titleFa: 'Iconography System' },
  { id: 'VDS-OUT-020', titleFa: 'Visual Density System (Comfortable / Standard / Compact)' },
  { id: 'VDS-OUT-021', titleFa: 'Chart Visual Language (۹ نوع نمودار)' },
  { id: 'VDS-OUT-022', titleFa: 'Map Visual Language (۶ سطح اولویت بصری)' },
  { id: 'VDS-OUT-023', titleFa: 'Image و Media Guidelines' },
  { id: 'VDS-OUT-024', titleFa: 'Component Visual States' },
  { id: 'VDS-OUT-025', titleFa: 'Accessibility Visual Standard (WCAG 2.2 AA)' },
  { id: 'VDS-OUT-026', titleFa: 'Design Token Architecture' },
  { id: 'VDS-OUT-027', titleFa: 'Tailwind Integration' },
  { id: 'VDS-OUT-028', titleFa: 'Design System Documentation' },
];
