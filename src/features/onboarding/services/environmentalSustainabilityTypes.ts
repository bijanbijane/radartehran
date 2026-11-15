/** @file src/features/onboarding/services/environmentalSustainabilityTypes.ts — Stage 66 Environmental Quality, Ecosystems & Spatial Sustainability Types */

export type Stage66DataProvenanceTag =
  | 'اندازه‌گیری مستقیم'
  | 'داده رسمی'
  | 'داده ماهواره‌ای پردازش‌شده'
  | 'داده مدل‌سازی‌شده'
  | 'داده برآوردی'
  | 'داده مشارکتی'
  | 'داده تاریخی'
  | 'داده تأییدنشده';

export type Stage66QualityBadge =
  | 'کامل'
  | 'قابل استفاده با محدودیت'
  | 'ناقص'
  | 'قدیمی'
  | 'تأییدنشده';

export type Stage66ComparisonPeriod = '۱۳۹۵' | '۱۴۰۰' | '۱۴۰۵';
export type Stage66AccessRadiusMeters = 300 | 500 | 800 | 1000;

export interface Stage66EnvironmentProfile {
  zoneId: string;
  zoneNameFa: string;
  regionLabelFa: string;
  lastUpdatedFa: string;
  provenanceTag: Stage66DataProvenanceTag;
  qualityBadge: Stage66QualityBadge;
  pm25UgM3: number | null;
  pm10UgM3: number | null;
  no2Ppb: number | null;
  airStationNameFa: string;
  airStationIsActive: boolean;
  airDataIsSpatiallyModeled: boolean;
  vegetationPercentByYear: Record<Stage66ComparisonPeriod, number>;
  ndviMean: number;
  imagerySeasonalMatched: boolean;
  recordedTreeCount: number;
  treeDensityPerHectare: number;
  treeSurveyCoveragePercent: number;
  greenSqmPerCapita: number;
  euclideanNearestParkMeters: number;
  networkWalkNearestParkMeters: number;
  walkMinutesNearestPark: number;
  populationWithoutGreenAccessPercent: number;
  shadeCoveredPopulationPercent: number;
  hasEcologicalCorridorHabitatProof: boolean;
  isolatedGreenPatchesCount: number;
  hasWaterLabMonitoringData: boolean;
  imperviousSurfacePercent: number;
  landSurfaceTempCelsius: number;
  urbanHeatDeltaCelsius: number;
  hasSoilChemicalLabData: boolean;
  builtUpExpansion5YrPercent: number;
  vegetationLoss5YrPercent: number;
  missingCompositeComponentNameFa: string | null;
}

export const STAGE66_MODULES_17: ReadonlyArray<{ id: string; titleFa: string }> = [
  { id: '01', titleFa: 'نمای کلی محیط‌زیست و پایداری' },
  { id: '02', titleFa: 'تحلیل کیفیت هوا (PM2.5/PM10/NO2/SO2/O3/CO)' },
  { id: '03', titleFa: 'پوشش گیاهی، NDVI و مقایسه تاریخی' },
  { id: '04', titleFa: 'درختان شهری و زیرساخت سبز' },
  { id: '05', titleFa: 'فضاهای سبز شهری و دسترسی پیاده شبکه‌ای' },
  { id: '06', titleFa: 'پیوستگی اکولوژیک و کریدورهای طبیعی' },
  { id: '07', titleFa: 'منابع آب و محیط آبی شهری' },
  { id: '08', titleFa: 'نفوذپذیری زمین و سطوح غیرقابل نفوذ' },
  { id: '09', titleFa: 'جزیره حرارتی شهری (LST ≠ دمای هوا)' },
  { id: '10', titleFa: 'خاک، زمین‌شناسی و محدوده تخریب طبیعی' },
  { id: '11', titleFa: 'توزیع عادلانه خدمات اکوسیستمی' },
  { id: '12', titleFa: 'فشار محیطی توسعه شهری و کالبدی' },
  { id: '13', titleFa: 'تغییرات پوشش زمین (اسلایدر و جدول مساحت)' },
  { id: '14', titleFa: 'پروفایل پایداری و مقایسه حداکثر ۴ محله' },
  { id: '15', titleFa: 'سناریوسازی توسعه سبز و احیای اکولوژیک' },
  { id: '16', titleFa: 'مرکز گزارش‌های محیط‌زیستی (۱۱ قالب)' },
  { id: '17', titleFa: 'پنل کیفیت، منشأ، عدم‌قطعیت و حالت‌های خطا' },
];

export const STAGE66_MAP_LAYERS_10: ReadonlyArray<string> = [
  'کیفیت هوا',
  'پوشش گیاهی',
  'تراکم درختان',
  'فضاهای سبز',
  'جزیره حرارتی',
  'نفوذپذیری زمین',
  'منابع آب',
  'مناطق حساس اکولوژیک',
  'تغییرات پوشش زمین',
  'فشار محیطی توسعه',
];

export const STAGE66_LAYER_GROUPS_8: ReadonlyArray<string> = [
  'هوا',
  'پوشش سبز',
  'آب',
  'خاک و زمین',
  'گرما',
  'اکوسیستم',
  'توسعه شهری',
  'عدالت محیطی',
];

export const STAGE66_KEY_INDICATORS_8: ReadonlyArray<string> = [
  'کیفیت هوا',
  'پوشش گیاهی',
  'دسترسی به فضای سبز',
  'شدت جزیره حرارتی',
  'نفوذپذیری زمین',
  'سلامت اکوسیستم',
  'تغییرات پوشش زمین',
  'فشار محیطی توسعه شهری',
];

export const STAGE66_COMPOSITE_INDICES_9: ReadonlyArray<{
  titleFa: string;
  scaleFa: string;
  methodFa: string;
}> = [
  { titleFa: 'شاخص کیفیت محیطی', scaleFa: '۰ تا ۱۰۰', methodFa: 'میانگین وزنی شفاف بدون حذف بی‌اعلام مؤلفه' },
  { titleFa: 'شاخص دسترسی به طبیعت', scaleFa: '۰ تا ۱۰۰', methodFa: 'دسترسی شبکه‌ای پیاده ۳۰۰ تا ۱۰۰۰ متر + ظرفیت' },
  { titleFa: 'شاخص پوشش سبز', scaleFa: 'درصد + NDVI', methodFa: 'تلفیق پوشش گیاهی هم‌فصل و تاج درختی' },
  { titleFa: 'شاخص فشار حرارتی', scaleFa: '°C ΔLST', methodFa: 'اختلاف دمای سطح ساخته با محیط طبیعی (غیرایمنی حرارتی)' },
  { titleFa: 'شاخص نفوذپذیری زمین', scaleFa: 'درصد نفوذپذیر', methodFa: 'تفکیک خاک طبیعی، پوشش سبز و سطوح نفوذناپذیر' },
  { titleFa: 'شاخص پیوستگی اکولوژیک', scaleFa: '۰ تا ۱', methodFa: 'گسستگی لکه‌های طبیعی و موانع کالبدی' },
  { titleFa: 'شاخص عدالت محیطی', scaleFa: 'توازن عرضه/جمعیت', methodFa: 'مقایسه خدمات اکوسیستمی موجود با جمعیت برخوردار' },
  { titleFa: 'شاخص فشار توسعه شهری', scaleFa: 'نرخ تغییر ۵ساله', methodFa: 'هم‌زمانی رشد ساخت‌وساز با کاهش سبز و افزایش نفوذناپذیری' },
  { titleFa: 'شاخص ظرفیت بهبود محیطی', scaleFa: 'اولویت مداخله', methodFa: 'ترکیب کمبود دسترسی، فشار حرارتی و زمین‌های قابل احیا' },
];

export const STAGE66_REPORT_TYPES_11: ReadonlyArray<string> = [
  'گزارش وضعیت محیط‌زیستی شهر',
  'گزارش کیفیت هوا',
  'گزارش پوشش گیاهی',
  'گزارش دسترسی به فضای سبز',
  'گزارش جزیره حرارتی',
  'گزارش نفوذپذیری زمین',
  'گزارش تغییرات پوشش زمین',
  'گزارش عدالت محیطی',
  'گزارش مقایسه محله‌ها',
  'گزارش فشار محیطی توسعه شهری',
  'گزارش اولویت‌های احیای اکولوژیک',
];

export const STAGE66_DATA_PROVENANCE_TAGS_8: ReadonlyArray<Stage66DataProvenanceTag> = [
  'اندازه‌گیری مستقیم',
  'داده رسمی',
  'داده ماهواره‌ای پردازش‌شده',
  'داده مدل‌سازی‌شده',
  'داده برآوردی',
  'داده مشارکتی',
  'داده تاریخی',
  'داده تأییدنشده',
];

export const STAGE66_QUALITY_BADGES_5: ReadonlyArray<Stage66QualityBadge> = [
  'کامل',
  'قابل استفاده با محدودیت',
  'ناقص',
  'قدیمی',
  'تأییدنشده',
];

export const STAGE66_UX_METRICS_10: ReadonlyArray<string> = [
  'زمان رسیدن به شاخص موردنظر',
  'زمان پیدا کردن محدوده محیطی',
  'نرخ موفقیت در مقایسه دو محله',
  'نرخ موفقیت در تغییر لایه نقشه',
  'درصد کاربران قادر به تشخیص داده تخمینی از اندازه‌گیری‌شده',
  'درصد کاربران قادر به تشخیص تاریخ داده',
  'میزان استفاده از فیلترهای زمانی',
  'نرخ خطا در انتخاب محدوده',
  'نرخ خروج از صفحات تحلیلی',
  'میزان استفاده از گزارش‌ها',
];

const UI_ENV66_LABELS: ReadonlyArray<string> = [
  'نمایش مسیر ناوبری تخصصی تحلیل شهری ← محیط‌زیست و پایداری ← کیفیت محیط‌زیست شهری',
  'مرزبندی صریح رادار به عنوان تحلیل‌گر داده نه جایگزین سامانه‌های رسمی پایش محیط‌زیست',
  'همگام‌سازی کامل انتخاب محدوده روی نقشه با تمام کارت‌های شاخص و نمودارها',
  'نمایش ۸ شاخص کلیدی با واحد، محدوده مکانی، تاریخ آخرین داده، تغییر دوره قبل و سطح اطمینان',
  'برچسب‌گذاری صریح «تخمینی» روی داده‌های مدل‌سازی‌شده کیفیت هوا متمایز از داده مستقیم ایستگاه',
  'نمایش صریح آلاینده‌های مفقود یا ایستگاه غیرفعال به‌جای مقدار جعلی صفر',
  'هشدار اختلاف فصلی یا کیفیت تصویربرداری هنگام مقایسه پوشش گیاهی بین دو تاریخ (۱۳۹۵/۱۴۰۰/۱۴۰۵)',
  'تفکیک تعداد درختان ثبت‌شده و پوشش برداشت میدانی از تعداد واقعی درختان محدوده',
  'تمایز شعاع هندسی (۳۰۰/۵۰۰/۸۰۰/۱۰۰۰ متر) از فاصله شبکه‌ای پیاده و زمان پیاده‌روی',
  'جداسازی وضعیت عرضه محیط‌زیستی (سرانه سبز/سایه) از دسترسی واقعی جمعیت در صفحه عدالت محیطی',
  'نمایش «پهنه دارای ظرفیت اتصال اکولوژیک» به‌جای کریدور تأییدشده در نبود داده زیستگاه و گونه',
  'ممانعت از استنتاج کیفیت یا سلامت آب صرفاً از روی نمایش خط رودخانه روی نقشه',
  'تفکیک نفوذپذیری زمین از احتمال قطعی سیلاب در نبود داده شیب، بارش و شبکه زهکشی',
  'هشدار علمی تفاوت دمای سطح زمین (LST) با دمای هوا و منع تبدیل مستقیم به آسایش حرارتی',
  'ممانعت از ادعای تشخیص شیمیایی/آلودگی خاک صرفاً با داده ماهواره‌ای عمومی',
  'گزارش هم‌زمانی تغییرات ساختمانی و محیطی در فشار توسعه بدون استنتاج علت‌ومعلول قطعی',
  'پشتیبانی از مقایسه چندلایه هم‌زمان (پوشش گیاهی/دمای سطح، تراکم/نفوذپذیری، سبز/جمعیت)',
  'محدودسازی مقایسه هم‌زمان محله‌ها به حداکثر ۴ محله با نمایش نقاط ضعف، قوت و داده ناقص',
  'جلوگیری از ساخت رتبه‌بندی کلی گمراه‌کننده «بهترین محله محیط‌زیستی» بدون روش و وزن شفاف',
  'حفظ برچسب «سناریوی فرضی» و مفروضات/عدم‌قطعیت مدل در تمام خروجی‌های سناریوهای سبز',
  'منع حذف بی‌اعلام مؤلفه مفقود در شاخص‌های ترکیبی محیط‌زیستی با حفظ عنوان و مقیاس قبلی',
  'نمایش شناسنامه ۱۲فیلدی کیفیت، منشأ (۸ برچسب) و وضعیت اعتبار (۵ نشانگر) در کنار لایه‌ها',
  'کنترل دسترسی و عدم انتشار موقعیت‌های حساس یا داده خام بدون مجوز در خروجی‌های عمومی',
  'طراحی چیدمان واکنش‌گرا در دسکتاپ، تبلت و موبایل بدون انباشت هم‌زمان نمودار روی نقشه',
];

export const STAGE66_ACCEPTANCE_TESTS_24: ReadonlyArray<{ id: string; checkFa: string }> = UI_ENV66_LABELS.map(
  (checkFa, idx) => ({
    id: `UI-ENV66-${String(idx + 1).padStart(3, '0')}`,
    checkFa,
  }),
);

export const STAGE67_DEMOGRAPHIC_PREVIEW_AXES_11: ReadonlyArray<string> = [
  '۱. تراکم و توزیع فضایی جمعیت',
  '۲. ساختار سنی و ترکیب خانوار',
  '۳. تغییرات جمعیتی محله‌ها در بازه‌های زمانی',
  '۴. مهاجرت و الگوهای جابه‌جایی جمعیت',
  '۵. تفکیک جمعیت روز و شب',
  '۶. جمعیت شناور و فعالیتی محدوده‌ها',
  '۷. توزیع فضایی گروه‌های جمعیتی',
  '۸. دسترسی جمعیت به خدمات شهری',
  '۹. نابرابری فضایی و اجتماعی',
  '۱۰. ارتباط تغییرات جمعیت و بازار مسکن',
  '۱۱. سناریوهای رشد و تحول جمعیتی (اصل کلیدی: تفکیک جمعیت ساکن، روزانه و شناور)',
];
