import type { EvaluatedNeighborhood, Neighborhood } from '../../../data/neighborhoods';
import { MULTI_CITY_CONFIGS, type CityId } from '../../../data/multiCityData';
import type { DataQuality } from '../../home/types/home.types';
import { convertPricePerSqmToUnitRaw, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../../../utils/areaUnit';

export type BoundaryStatus = 'official' | 'operational' | 'custom' | 'under-review';
export type ProfileMaturityLevel = 'Basic' | 'Developing' | 'Detailed' | 'Research-ready';
export type NeighborhoodInternalSectionId = 'overview' | 'market' | 'physical' | 'amenities' | 'environment' | 'history' | 'compare' | 'sources';
export type NeighborhoodMarketTabId = 'sale' | 'rent' | 'supply' | 'price-distribution' | 'historical-changes';
export type AccessibilityDistanceMode = 'direct_distance' | 'walking_network' | 'driving_network';
export type ContributionModerationStatus = 'Submitted' | 'UnderReview' | 'NeedsEvidence' | 'Approved' | 'Rejected' | 'Published';

export interface NeighborhoodIdentity {
  id: string; slug: string; canonicalPath: string; name: string;
  alternativeNames: string[]; cityId: string; zone: string; subdistrict?: string;
}
export interface NeighborhoodBoundary {
  boundaryId: string; neighborhoodId: string; version: string; status: BoundaryStatus;
  statusLabelFa: string; areaKm2: number; centroid: [number, number]; source: string; effectiveFrom: string;
}
export interface NeighborhoodMetric {
  id: string; title: string; value: number | null; formattedValue: string; unit: string;
  period: string; comparisonLabel?: string; sampleSize?: number; dataQuality: DataQuality; zeroVsNullNote?: string;
}
export interface NeighborhoodContent {
  summary: string; strengths: string[]; challenges: string[]; urbanNotes: string[];
  editorialStatus: 'draft' | 'reviewed' | 'published'; updatedAt: string;
}
export interface RelatedNeighborhoodRef {
  id: number; name: string; zone: string;
  relationType: 'adjacent_shared_boundary' | 'nearby_geodesic_radius';
  relationBadgeFa: string; distanceKm: number; avgPriceDiffPct: number;
}
export interface LandUseShareItem { id: string; labelFa: string; sharePercent: number; layerId: string; }
export interface ServiceAmenityGroup {
  categoryId: string; categoryTitleFa: string; countInBoundary: number | null;
  nearestDirectMeters: number | null; walkingNetworkMeters: number | null; drivingNetworkMeters: number | null; coverageStatusFa: string;
}
export interface HistoricalTimelineEntry {
  year: string; titleFa: string; changeNature: 'real_urban_change' | 'methodology_or_source_change';
  changeNatureLabelFa: string; descriptionFa: string;
}
export interface CommunityContributionEntry {
  id: string; streamType: 'verified_editorial' | 'pending_contribution' | 'user_comment';
  streamLabelFa: string; categoryFa: string; textFa: string; moderationStatus: ContributionModerationStatus; submittedAt: string;
}
export interface NeighborhoodIntelligenceProfile {
  identity: NeighborhoodIdentity; boundary: NeighborhoodBoundary; maturityLevel: ProfileMaturityLevel; maturityLabelFa: string;
  content: NeighborhoodContent; quickMetrics: NeighborhoodMetric[]; marketSampleAdequate: boolean; marketSampleWarningFa: string | null;
  landUseDenominatorLabelFa: string; landUseShares: LandUseShareItem[]; amenities: ServiceAmenityGroup[];
  adjacentNeighborhoods: RelatedNeighborhoodRef[]; nearbyNeighborhoods: RelatedNeighborhoodRef[];
  historicalTimeline: HistoricalTimelineEntry[]; contributions: CommunityContributionEntry[];
}
export type AnyNeighborhoodInput = Neighborhood & Partial<Pick<EvaluatedNeighborhood, 'overallScore'>>;

export const NEIGHBORHOOD_SECTION_NAV_8: ReadonlyArray<{ id: NeighborhoodInternalSectionId; labelFa: string }> = [
  { id: 'overview', labelFa: 'معرفی' }, { id: 'market', labelFa: 'بازار' }, { id: 'physical', labelFa: 'کالبد' },
  { id: 'amenities', labelFa: 'امکانات' }, { id: 'environment', labelFa: 'محیط' }, { id: 'history', labelFa: 'تاریخچه' },
  { id: 'compare', labelFa: 'مقایسه' }, { id: 'sources', labelFa: 'منابع' },
];

export function formatNullSafeMetricValue(value: number | null | undefined, formatter?: (val: number) => string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return formatter ? formatter(value) : value.toLocaleString('fa-IR');
}

export function evaluateNeighborhoodMaturity(
  hood: AnyNeighborhoodInput,
  marketSampleCount = 0,
): { level: ProfileMaturityLevel; labelFa: string } {
  const hasRichNarrative = Boolean(hood.pros?.trim() && hood.cons?.trim());
  const safeCount = Math.max(0, Math.round(marketSampleCount));
  if (hasRichNarrative && safeCount >= 30) return { level: 'Research-ready', labelFa: 'آماده پژوهش (Research-ready)' };
  if (hasRichNarrative && safeCount >= 12) return { level: 'Detailed', labelFa: 'تکمیل‌شده (Detailed)' };
  if (hasRichNarrative) return { level: 'Developing', labelFa: 'در حال تکمیل (Developing)' };
  return { level: 'Basic', labelFa: 'پایه (Basic)' };
}

export function evaluateMarketSampleAdequacy(sampleSize: number): { adequate: boolean; quality: DataQuality; warningFa: string | null } {
  if (sampleSize < 12) return { adequate: false, quality: 'incomplete', warningFa: 'تعداد نمونه برای تحلیل دقیق کافی نیست؛ شاخص‌ها با احتیاط تفسیر شوند.' };
  if (sampleSize < 30) return { adequate: true, quality: 'estimated', warningFa: 'حجم نمونه متوسط است؛ میانه استنباطی با بازه اطمینان نمایش داده می‌شود.' };
  return { adequate: true, quality: 'verified', warningFa: null };
}

function haversineDistanceKm(a: [number, number], b: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return Number((6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))).toFixed(2));
}

export function buildNeighborhoodIntelligenceProfile(
  hood: AnyNeighborhoodInput,
  allNeighborhoods: readonly AnyNeighborhoodInput[],
  cityId = 'tehran',
  dealPricePerSqm?: number,
  options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; locale?: 'fa' | 'en' },
): NeighborhoodIntelligenceProfile {
  const areaUnit = options?.areaUnit ?? 'sqm';
  const intlCurrency = options?.intlCurrency ?? 'IRT';
  const locale = options?.locale ?? 'fa';
  const cityNameFa = MULTI_CITY_CONFIGS[cityId as CityId]?.nameFa || 'تهران';
  const slug = `hood-${hood.id}`, canonicalPath = `/areas/${cityId}/neighborhoods/${slug}`;
  const liveCount = (hood.bargains || []).filter((b) => typeof b.id === 'string' && b.id.startsWith('live-divar-')).length;
  const sampleEval = evaluateMarketSampleAdequacy(liveCount);
  const maturity = evaluateNeighborhoodMaturity(hood, liveCount);
  const hasExplicitDealPrice = typeof dealPricePerSqm === 'number' && Number.isFinite(dealPricePerSqm) && dealPricePerSqm > 0;

  const othersWithDist = allNeighborhoods
    .filter((item) => item.id !== hood.id)
    .map((item) => ({
      item,
      distKm: haversineDistanceKm([hood.lat, hood.lng], [item.lat, item.lng]),
      priceDiffPct: hood.buyPerSqm > 0 ? Math.round(((item.buyPerSqm - hood.buyPerSqm) / hood.buyPerSqm) * 100) : 0,
    }))
    .sort((a, b) => a.distKm - b.distKm);

  const adjacentNeighborhoods: RelatedNeighborhoodRef[] = [];
  const nearbyNeighborhoods: RelatedNeighborhoodRef[] = othersWithDist
    .slice(0, 6)
    .map((e) => ({ id: e.item.id, name: e.item.name, zone: e.item.zone, relationType: 'nearby_geodesic_radius', relationBadgeFa: 'محله نزدیک (شعاع مکانی)', distanceKm: e.distKm, avgPriceDiffPct: e.priceDiffPct }));

  const unitAsk = Math.round(convertPricePerSqmToUnitRaw(hood.buyPerSqm, areaUnit) * 10) / 10;
  const unitDeal = hasExplicitDealPrice ? Math.round(convertPricePerSqmToUnitRaw(dealPricePerSqm!, areaUnit) * 10) / 10 : null;
  const fxTag = (m: number) => (intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(m, intlCurrency, locale)})` : '');
  const quickMetrics: NeighborhoodMetric[] = [
    {
      id: 'asking-median',
      title: sampleEval.adequate ? 'میانه قیمت پیشنهادی فروش' : 'قیمت مرجع داخلی هر مترمربع',
      value: unitAsk,
      formattedValue: `${formatNullSafeMetricValue(unitAsk, (v) => formatMillionTomanAsIntlCurrency(v, 'IRT', locale))}${fxTag(unitAsk)}`,
      unit: areaUnit === 'sqft' ? 'تومان / فوت مربع' : 'تومان / مترمربع',
      period: cityId === 'tehran' ? 'مرجع داخلی' : 'بدون تاریخ به‌روزرسانی',
      comparisonLabel: unitDeal !== null
        ? `سناریو v6.4 (غیرثبتی): ${formatMillionTomanAsIntlCurrency(unitDeal, 'IRT', locale)}${fxTag(unitDeal)}`
        : undefined,
      sampleSize: liveCount, dataQuality: sampleEval.quality,
    },
    {
      id: 'active-supply', title: 'تعداد آگهی‌های زنده محلی', value: liveCount,
      formattedValue: formatNullSafeMetricValue(liveCount), unit: 'آگهی زنده', period: 'حافظه محلی',
      comparisonLabel: `امتیاز دسترسی مترو: ${hood.metro}/۱۰`, sampleSize: liveCount, dataQuality: sampleEval.quality,
    },
    {
      id: 'official-census-household', title: 'تعداد دقیق خانوار ثبتی (سرشماری جدید)', value: null,
      formattedValue: formatNullSafeMetricValue(null), unit: 'خانوار', period: 'منتشر نشده', dataQuality: 'unavailable',
      zeroVsNullNote: 'داده رسمی به تفکیک این مرز عملیاتی منتشر نشده است (مقدار ناموجود ≠ صفر).',
    },
  ];

  const prosList = hood.pros ? hood.pros.split('،').map((s) => s.trim()).filter(Boolean) : [];
  const consList = hood.cons ? hood.cons.split('،').map((s) => s.trim()).filter(Boolean) : [];
  const updatedAt = '—';

  return {
    identity: { id: `NBH-${cityId.toUpperCase()}-${hood.id}`, slug, canonicalPath, name: hood.name, alternativeNames: [`محدوده ${hood.name}`, `پهنه مطالعاتی ${hood.zone}`], cityId, zone: hood.zone },
    boundary: {
      boundaryId: `BND-${cityId.toUpperCase()}-${hood.id}-V2`, neighborhoodId: `NBH-${cityId.toUpperCase()}-${hood.id}`, version: 'v2.4-2026',
      status: 'operational',
      statusLabelFa: 'مرز عملیاتی تحلیل بازار (برآورد هندسی تقریبی)',
      areaKm2: Number(((Math.PI * (hood.radius / 1000) ** 2) * 0.78).toFixed(2)),
      centroid: [hood.lat, hood.lng], source: `شعاع داخلی محدوده (برآورد هندسی تقریبی) · رادار ${cityNameFa}`, effectiveFrom: '—',
    },
    maturityLevel: maturity.level, maturityLabelFa: maturity.labelFa,
    content: {
      summary: `محله ${hood.name} در ${cityNameFa} (${hood.zone}) با شاخص کیفیت هوا ${hood.air}/۱۰ و دسترسی حمل‌ونقل ${hood.metro}/۱۰ به عنوان محدوده عملیاتی ارزیابی شده است.`,
      strengths: prosList, challenges: consList,
      urbanNotes: ['تفکیک شاخص مرجع محله از ارزش‌گذاری ملک منفرد (Hedonic) الزامی است.'],
      editorialStatus: updatedAt === '—' ? 'draft' : 'published', updatedAt,
    },
    quickMetrics, marketSampleAdequate: sampleEval.adequate, marketSampleWarningFa: sampleEval.warningFa,
    landUseDenominatorLabelFa: 'لایه پهنه‌بندی تفصیلی کاربری اراضی بارگذاری نشده است (مخرج محاسبه ناموجود).',
    landUseShares: [],
    amenities: [
      {
        categoryId: 'transit', categoryTitleFa: 'حمل‌ونقل عمومی (مترو و BRT)', countInBoundary: null,
        nearestDirectMeters: null, walkingNetworkMeters: null, drivingNetworkMeters: null,
        coverageStatusFa: 'فاصله دقیق ایستگاه نیازمند لایه مکانی فعال است.',
      },
      {
        categoryId: 'parks', categoryTitleFa: 'بوستان و فضای سبز شهری', countInBoundary: null,
        nearestDirectMeters: null, walkingNetworkMeters: null, drivingNetworkMeters: null,
        coverageStatusFa: 'فاصله دقیق بوستان نیازمند لایه مکانی فعال است.',
      },
    ],
    adjacentNeighborhoods, nearbyNeighborhoods,
    historicalTimeline: [],
    contributions: [],
  };
}

export const STAGE_17_ACCEPTANCE_CHECKLIST_30: readonly string[] = [
  'NBH-AC-01: تفکیک هویت پایدار محله از هندسه مرز نسخه‌بندی‌شده', 'NBH-AC-02: نمایش وضعیت مرز (Official / Operational / Custom / Under-Review)',
  'NBH-AC-03: تشخیص و نمایش سطح بلوغ اطلاعاتی محله (۴ سطح)', 'NBH-AC-04: ناوبری چسبان ۸ بخشی داخل پرونده محله',
  'NBH-AC-05: مینی‌مپ تعاملی متصل به نقشه اصلی با لایه مرز فعال', 'NBH-AC-06: تفکیک صریح محله مجاور (مرز مشترک) از محله نزدیک (شعاع مکانی)',
  'NBH-AC-07: رعایت قانون Zero !== No Data (نمایش — برای داده ناموجود)', 'NBH-AC-08: نمایش صریح مخرج محاسبه در ترکیب کاربری زمین',
  'NBH-AC-09: اتصال مستقیم هر ردیف کاربری زمین به لایه متناظر در نقشه', 'NBH-AC-10: تحلیل بازار ۵ زبانه (فروش، اجاره، عرضه، توزیع قیمت، تغییرات تاریخی)',
  'NBH-AC-11: بررسی کفایت نمونه آماری پیش از نمایش روند قطعی بازار', 'NBH-AC-12: تفکیک میانگین قیمت محله از ارزش‌گذاری ملک منفرد (Hedonic)',
  'NBH-AC-13: تفکیک قیمت پیشنهادی از سناریوی مذاکره v6.4 غیرثبتی', 'NBH-AC-14: نمایش دسترسی خدمات با تفکیک فاصله مستقیم و مسیر پیاده/خودرویی',
  'NBH-AC-15: غیرفعال‌سازی شفاف حالت مسیر شبکه در صورت نبود داده گراف معابر', 'NBH-AC-16: پرهیز از ادعای قطعی سرانه بدون مخرج جمعیتی معتبر',
  'NBH-AC-17: نمایش الگوی غالب کالبدی همراه با استثناهای مهم بافت', 'NBH-AC-18: برچسب‌گذاری داده‌های محیطی بر اساس ایستگاه سنجش یا مدل مکانی',
  'NBH-AC-19: پرهیز از ادعای داده‌های غیرعمومی یا حساس جمعیتی', 'NBH-AC-20: تفکیک تغییر واقعی شهری از تغییر روش گردآوری در تاریخچه محله',
  'NBH-AC-21: اتصال مستقیم محله به ماتریس مقایسه چندمحله‌ای', 'NBH-AC-22: تفکیک ۳گانه محتوای رسمی، پیشنهادهای در انتظار بررسی و دیدگاه کاربران',
  'NBH-AC-23: پیاده‌سازی چرخه ۶ حالته بررسی مشارکت محلی (Submitted..Published)', 'NBH-AC-24: نمایش شناسنامه منابع، روش محاسبه و محدودیت‌های هر بخش',
  'NBH-AC-25: پشتیبانی از آدرس استاندارد /areas/{city}/neighborhoods/{slug}', 'NBH-AC-26: حفظ وضعیت بازگشت به نقشه یا مقایسه بدون از دست رفتن زمینه',
  'NBH-AC-27: چیدمان واکنش‌گرا در دسکتاپ، تبلت و موبایل (بدون جدول افقی شکسته)', 'NBH-AC-28: پشتیبانی کامل صفحه‌کلید و برچسب‌های دسترس‌پذیری در زبانه‌ها',
  'NBH-AC-29: تلمتری ایمن بدون ذخیره متن آزاد گزارش‌ها در رویدادهای تحلیلی', 'NBH-AC-30: پوشش کامل ۲۴ سناریوی آزمون NBR-01 تا NBR-24 و ۲۰ بسته NBH-01 تا NBH-20',
];

export const STAGE_18_MARKET_INTELLIGENCE_SPEC_20: ReadonlyArray<{ code: string; titleFa: string }> = [
  { code: 'MKT-01', titleFa: 'داشبورد کلان بازار مسکن تهران و شهرهای اقماری' }, { code: 'MKT-02', titleFa: 'معماری تفکیک بازار فروش و بازار رهن و اجاره' },
  { code: 'MKT-03', titleFa: 'شاخص‌های قیمت متری، کل و تعدیل‌شده تورمی' }, { code: 'MKT-04', titleFa: 'تحلیل توزیع قیمت، دهک‌ها و دامنه میان‌چارکی (IQR)' },
  { code: 'MKT-05', titleFa: 'پایش حجم عرضه، ورودی آگهی جدید و نرخ جذب بازار' }, { code: 'MKT-06', titleFa: 'شاخص نقدشوندگی و زمان ماندگاری در بازار (Time-on-Market)' },
  { code: 'MKT-07', titleFa: 'تحلیل شکاف قیمت پیشنهادی و سناریوی توافق (Spread Analytics)' }, { code: 'MKT-08', titleFa: 'رتبه‌بندی و مقایسه مناطق ۲۲گانه و محله‌ها' },
  { code: 'MKT-09', titleFa: 'ماتریس همبستگی قیمت با متراژ، سن بنا و طبقه' }, { code: 'MKT-10', titleFa: 'روندهای زمانی کوتاه‌مدت، میان‌مدت و بلندمدت' },
  { code: 'MKT-11', titleFa: 'شناسایی ناهنجاری‌های قیمتی و حباب‌های موضعی' }, { code: 'MKT-12', titleFa: 'تحلیل قدرت خرید و نسبت قیمت به درآمد/اجاره (P/R Ratio)' },
  { code: 'MKT-13', titleFa: 'فیلترهای تحلیلی بازار بر اساس تیپ ملک و بازه بودجه' }, { code: 'MKT-14', titleFa: 'استاندارد کفایت نمونه و فواصل اطمینان در گزارش‌های بازار' },
  { code: 'MKT-15', titleFa: 'اتصال دوطرفه نمودارهای بازار به لایه‌های حرارتی نقشه' }, { code: 'MKT-16', titleFa: 'ابزار مقایسه هم‌زمان روند قیمت چند منطقه یا محله' },
  { code: 'MKT-17', titleFa: 'گزارش‌های تحلیلی دوره‌ای و خلاصه مدیریتی بازار' }, { code: 'MKT-18', titleFa: 'قرارداد داده، منابع و شفافیت روش‌شناسی شاخص‌های بازار' },
  { code: 'MKT-19', titleFa: 'عملکرد، کشینگ و مدیریت حالت‌های عدم قطعیت داده بازار' }, { code: 'MKT-20', titleFa: 'معیارهای پذیرش و سناریوهای آزمون هوش بازار (RT-UI-MARKET-001)' },
];
