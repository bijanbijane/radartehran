import { DimPlaceScd2Record, OfficialMetricDefinition } from '../models/analytics.types';

export const OFFICIAL_METRIC_REGISTRY: OfficialMetricDefinition[] = [
  {
    id: 'met-1', metricCode: 'MARKET.MEDIAN.ASKING_PRICE_PER_SQM',
    displayNameFa: 'میانه قیمت پیشنهادی هر مترمربع',
    definitionFa: 'میانه (صدک ۵۰) قیمت پیشنهادی هر مترمربع در آگهی‌های فعال و غیرتکراری پس از حذف داده‌های پرت IQR.',
    domain: 'MARKET_ANALYTICS', financialConcept: 'ASKING_PRICE', formulaFa: 'Median(TrimmedIQR(AskingPricePerSqm))',
    grain: 'PLACE_X_MONTH_X_PROPERTY_TYPE', unit: 'MILLION_TOMAN_PER_SQM', currency: 'TOMAN',
    filtersFa: ['آگهی فعال', 'حذف تکراری با Hash ملک یکتا', 'حذف پرت خارج از 1.5*IQR'],
    sourcePolicyFa: 'فقط آگهی‌های دارای متراژ و قیمت معتبر در لایه Silver/Gold',
    minSampleThreshold: 15, methodologyVersion: '2.1', updateFrequencyFa: 'روزانه',
    limitationsFa: ['نشان‌دهنده قیمت پیشنهادی فروشنده است و معادل قیمت قطعی معامله ثبتی نیست.'],
    owner: 'Market Metric Owner', status: 'ACTIVE',
  },
  {
    id: 'met-2', metricCode: 'MARKET.ACTIVE_LISTING_COUNT',
    displayNameFa: 'تعداد آگهی فعال و ملک یکتا',
    definitionFa: 'تعداد آگهی‌های دارای وضعیت فعال و مجاز در زمان Snapshot با تفکیک ملک یکتا.',
    domain: 'MARKET_ANALYTICS', financialConcept: 'SUPPLY_VOLUME', formulaFa: 'Count(Distinct ActiveListingId)',
    grain: 'PLACE_X_MONTH_X_PROPERTY_TYPE', unit: 'LISTING_COUNT',
    filtersFa: ['وضعیت فعال', 'غیرتکراری', 'انتشار عمومی مجاز'], sourcePolicyFa: 'Listing Domain Snapshot',
    minSampleThreshold: 5, methodologyVersion: '1.2', updateFrequencyFa: 'روزانه',
    limitationsFa: ['نشان‌دهنده حجم عرضه قابل مشاهده است، نه تقاضای خرید بازار.'],
    owner: 'Market Metric Owner', status: 'ACTIVE',
  },
  {
    id: 'met-3', metricCode: 'MARKET.PRICE_REDUCTION_RATE',
    displayNameFa: 'نرخ آگهی‌های دارای کاهش قیمت معتبر',
    definitionFa: 'نسبت آگهی‌های دارای کاهش قیمت واقعی مالک به کل آگهی‌های واجد تاریخچه قابل مقایسه.',
    domain: 'MARKET_ANALYTICS', financialConcept: 'ASKING_PRICE',
    formulaFa: '(ListingsWithValidPriceReduction / EligibleListingsWithComparableHistory) * 100',
    grain: 'PLACE_X_MONTH_X_PROPERTY_TYPE', unit: 'PERCENT',
    numeratorFa: 'آگهی‌های دارای کاهش قیمت معتبر مالک',
    denominatorFa: 'آگهی‌های واجد تاریخچه قیمت قابل مقایسه در همان دوره',
    filtersFa: ['حذف بازنشرهای ساختگی', 'ثبات واحد پول و متراژ'],
    sourcePolicyFa: 'FactPriceObservation + FactListingSnapshot',
    minSampleThreshold: 15, methodologyVersion: '1.1', updateFrequencyFa: 'هفتگی',
    limitationsFa: ['آگهی‌های فاقد سابقه قیمت در مخرج کسر قرار نمی‌گیرند.'],
    owner: 'Market Metric Owner', status: 'ACTIVE',
  },
  {
    id: 'met-4', metricCode: 'VALUATION.HEDONIC_ESTIMATE_PER_SQM',
    displayNameFa: 'برآورد ارزش هدونیک هر مترمربع (سناریو معامله v6.4)',
    definitionFa: 'خروجی مدل هدونیک رادار بر اساس مشخصات ملک و ضریب تعدیل محله (مستقل از قیمت پیشنهادی آگهی).',
    domain: 'VALUATION_ANALYTICS', financialConcept: 'VALUATION_ESTIMATE',
    formulaFa: 'HedonicValuation(BasePrice, Age, Floor, Amenities)',
    grain: 'VALUATION_RUN_EVENT', unit: 'MILLION_TOMAN_PER_SQM', currency: 'TOMAN',
    filtersFa: ['ورودی کامل مشخصات کالبدی'], sourcePolicyFa: 'Hedonic Pricing Engine v1405.1',
    minSampleThreshold: 10, methodologyVersion: '1405.1', updateFrequencyFa: 'لحظه‌ای / دوره‌ای',
    limitationsFa: ['برآورد آماری است و سند معامله یا کارشناسی رسمی دادگستری محسوب نمی‌شود.'],
    owner: 'Valuation Metric Owner', status: 'ACTIVE',
  },
];

export const SCD2_PLACE_DIMENSIONS: DimPlaceScd2Record[] = [
  {
    placeKey: 'pk-saadat-v1', canonicalPlaceId: 'saadat-abad',
    placeNameFa: 'سعادت‌آباد (مرز قدیم پیش از الحاق پهنه شمالی)', districtNumber: 2,
    boundaryVersion: 'v1.0-1403', areaSqKm: 6.8, validFrom: '2024-03-20T00:00:00Z',
    validTo: '2025-03-20T23:59:59Z', isCurrent: false, version: 1,
  },
  {
    placeKey: 'pk-saadat-v2', canonicalPlaceId: 'saadat-abad', placeNameFa: 'سعادت‌آباد',
    districtNumber: 2, boundaryVersion: 'v2.0-1405', areaSqKm: 7.15,
    validFrom: '2025-03-21T00:00:00Z', isCurrent: true, version: 2,
  },
  {
    placeKey: 'pk-punak-v1', canonicalPlaceId: 'punak', placeNameFa: 'پونک',
    districtNumber: 5, boundaryVersion: 'v2.0-1405', areaSqKm: 5.9,
    validFrom: '2025-03-21T00:00:00Z', isCurrent: true, version: 1,
  },
];
