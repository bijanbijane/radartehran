import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  aggregateNeighborhoodMarketMetrics,
  buildNeighborhoodListingSamples,
  normalizePersianText,
} from '../../../data/realMarketPriceAggregator';
import {
  DATA_KIND_LABELS_FA,
  INDICATOR_REGISTRY,
  INDICATOR_STATUS_LABELS_FA,
  evaluateSampleSufficiency,
  resolveRentEquivalent,
} from '../indicators/IndicatorRegistry';
import { computeDistributionStats } from './marketStatsHelpers';
import type {
  AppliedMarketFilters,
  GeoComparisonItem,
  GeoPriceSourceKind,
  MarketIndicatorStatus,
  MarketPeriodId,
  MarketReportItem,
  PropertySubType,
} from '../types/market.types';
import type { MarketIndicatorId, MarketIndicatorValue, PriceDistributionStats } from '../types/indicator.types';

export function extractRoomsCountFromText(rawText: string): number | null {
  const norm = normalizePersianText(rawText);
  if (!norm) return null;
  if (/(?:بدون\s*خواب|سوئیت|سوییت)/.test(norm)) return 0;
  if (/(?:تک\s*خواب|یک\s*خواب|1\s*خواب)/.test(norm)) return 1;
  if (/(?:دو\s*خواب|2\s*خواب)/.test(norm)) return 2;
  if (/(?:سه\s*خواب|3\s*خواب)/.test(norm)) return 3;
  if (/(?:چهار\s*خواب|4\s*خواب)/.test(norm)) return 4;
  const numMatch = norm.match(/(?<!\d)(\d)\s*خواب/);
  if (numMatch) return Number(numMatch[1]);
  return null;
}

export function inferPropertySubTypeFromText(rawText: string): PropertySubType {
  const norm = normalizePersianText(rawText);
  if (/پنت\s*هاوس/.test(norm)) return 'penthouse';
  if (/ویلایی|ویلا|دربست/.test(norm)) return 'villa';
  if (/مغازه|تجاری/.test(norm)) return 'shop';
  if (/اداری|دفتر\s*کار/.test(norm)) return 'office_unit';
  if (/زمین|کلنگی/.test(norm)) return 'land_plot';
  return 'apartment';
}

export function isWithinPeriodWindow(createdAtIso: string | null | undefined, period: MarketPeriodId): boolean {
  if (!createdAtIso) return true;
  const ts = Date.parse(createdAtIso);
  if (Number.isNaN(ts)) return true;
  const days = period === '30d' ? 30 : period === '90d' ? 90 : period === '180d' ? 180 : 365;
  const cutoff = Date.now() - days * 86_400_000;
  return ts >= cutoff;
}

export function makeMarketIndicatorValue(
  id: MarketIndicatorId,
  value: number | null,
  formattedValueFa: string,
  geoScopeFa: string,
  periodLabelFa: string,
  sampleCount: number,
  status: MarketIndicatorStatus,
  secondaryNoteFa: string,
  intlText?: string,
): MarketIndicatorValue {
  const def = INDICATOR_REGISTRY[id];
  return {
    id,
    titleFa: def.titleFa,
    titleEn: def.titleEn,
    dataKind: def.dataKind,
    dataKindLabelFa: DATA_KIND_LABELS_FA[def.dataKind],
    value,
    formattedValueFa,
    unitFa: def.unitFa,
    intlText,
    geoScopeFa,
    periodLabelFa,
    sampleCount,
    status,
    statusLabelFa: INDICATOR_STATUS_LABELS_FA[status],
    methodologyId: def.methodologyId,
    sourceSummaryFa: def.sourceIds.join(', '),
    secondaryNoteFa,
  };
}

export function buildGeoComparisonRows(
  allHoods: readonly EvaluatedNeighborhood[],
  selectedHood: EvaluatedNeighborhood | undefined,
  compareHoodIds: readonly number[],
  filters: AppliedMarketFilters,
): GeoComparisonItem[] {
  if (!selectedHood) return [];
  const compareIds = Array.from(new Set([selectedHood.id, ...compareHoodIds])).slice(0, 4);
  const candidates = compareIds
    .map((id) => allHoods.find((h) => h.id === id))
    .filter((h): h is EvaluatedNeighborhood => Boolean(h));

  const evaluateHoodRow = (h: EvaluatedNeighborhood) => {
    const samples = buildNeighborhoodListingSamples(h, 'sale').filter((s) => {
      if (filters.areaRange === 'under75' && s.sqm >= 75) return false;
      if (filters.areaRange === '75to120' && (s.sqm < 75 || s.sqm > 120)) return false;
      if (filters.areaRange === 'over120' && s.sqm <= 120) return false;
      if (filters.rooms !== 'all') {
        const r = extractRoomsCountFromText(s.description);
        if (r === null) return false;
        if (filters.rooms === '1' && r !== 1) return false;
        if (filters.rooms === '2' && r !== 2) return false;
        if (filters.rooms === '3plus' && r < 3) return false;
      }
      if (!isWithinPeriodWindow(s.createdAtIso, filters.period)) return false;
      return true;
    });
    const agg = aggregateNeighborhoodMarketMetrics(h.id, h.name, h.buyPerSqm, samples);
    const stats = computeDistributionStats(
      samples.map((s) => s.perSqmMillion ?? Math.round((s.askingTotalMillion / Math.max(20, s.sqm)) * 10) / 10),
    );
    const hasObserved = samples.length > 0 && stats.median !== null;
    const priceSourceKind: GeoPriceSourceKind =
      filters.marketType !== 'residential'
        ? 'unavailable'
        : hasObserved
          ? 'observed_listing'
          : filters.onlyObserved
            ? 'unavailable'
            : 'internal_reference';

    const askingPerSqmMillion: number | null =
      priceSourceKind === 'observed_listing'
        ? stats.median
        : priceSourceKind === 'internal_reference'
          ? h.buyPerSqm
          : null;

    const estimatedDealPerSqmMillion: number | null =
      askingPerSqmMillion === null
        ? null
        : hasObserved
          ? agg.estimatedDealPricePerSqm
          : h.buyPerSqm;

    return {
      hood: h,
      askingPerSqmMillion,
      estimatedDealPerSqmMillion,
      observedCount: samples.length,
      priceSourceKind,
    };
  };

  const evaluated = candidates.map(evaluateHoodRow);
  const baseRow = evaluated.find((r) => r.hood.id === selectedHood.id) ?? evaluated[0];

  return evaluated.map((row) => {
    const canCompare =
      baseRow &&
      row.askingPerSqmMillion !== null &&
      baseRow.askingPerSqmMillion !== null &&
      baseRow.askingPerSqmMillion > 0 &&
      row.priceSourceKind === baseRow.priceSourceKind;

    const gapFromBasePct = canCompare
      ? Math.round(((row.askingPerSqmMillion! - baseRow.askingPerSqmMillion!) / baseRow.askingPerSqmMillion!) * 100)
      : null;

    return {
      hoodId: row.hood.id,
      hoodName: row.hood.name,
      zone: row.hood.zone,
      askingPerSqmMillion: row.askingPerSqmMillion,
      estimatedDealPerSqmMillion: row.estimatedDealPerSqmMillion,
      rahn80mMillion: row.hood.rahn80m,
      monthlyRentEquivMillion: resolveRentEquivalent(row.hood.rahn80m),
      observedCount: row.observedCount,
      status: evaluateSampleSufficiency(
        filters.marketType,
        'neighborhood',
        row.observedCount,
        'asking_price_median_sqm',
      ),
      priceSourceKind: row.priceSourceKind,
      gapFromBasePct,
      overallScore: row.hood.overallScore,
    };
  });
}

export function buildMarketReportsList(params: {
  selectedHood: EvaluatedNeighborhood | undefined;
  geoScopeFa: string;
  periodLabelFa: string;
  unitAsk: number | null;
  unitDeal: number | null;
  avgRahn80: number;
  convertedMonthly: number;
  grossYieldPct: number | null;
  askingStatus: MarketIndicatorStatus;
  rentStatus: MarketIndicatorStatus;
  distribution: PriceDistributionStats;
  observedSaleCount: number;
  observedRentCount: number;
  dataAsOfIso: string | null;
  dataAsOfDisplayFa?: string | null;
}): MarketReportItem[] {
  const {
    selectedHood,
    geoScopeFa,
    periodLabelFa,
    unitAsk,
    unitDeal,
    avgRahn80,
    convertedMonthly,
    grossYieldPct,
    askingStatus,
    rentStatus,
    distribution,
    observedSaleCount,
    observedRentCount,
    dataAsOfIso: rawDataAsOfIso,
    dataAsOfDisplayFa,
  } = params;
  const hoodId = selectedHood?.id ?? 0;
  const generatedAtIso = new Date().toISOString();
  // Stage 27 invariant: dataAsOfIso must NEVER contain a Jalali string; validate ISO-8601 strictly
  const isValidIso =
    typeof rawDataAsOfIso === 'string' &&
    /^\d{4}-\d{2}-\d{2}/.test(rawDataAsOfIso.trim()) &&
    !/^(13\d{2}|14\d{2}|۱۳\d{2}|۱۴\d{2})/.test(rawDataAsOfIso.trim()) &&
    !Number.isNaN(Date.parse(rawDataAsOfIso.trim()));
  const dataAsOfIso: string | null = isValidIso ? rawDataAsOfIso!.trim() : null;
  const publishedJalali = dataAsOfDisplayFa?.trim()
    ? dataAsOfDisplayFa.trim()
    : dataAsOfIso
      ? dataAsOfIso.slice(0, 10)
      : 'ثبت نشده';
  const freshnessStatus: 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN' = dataAsOfIso
    ? Date.now() - Date.parse(dataAsOfIso) <= 3 * 86_400_000
      ? 'FRESH'
      : Date.now() - Date.parse(dataAsOfIso) <= 14 * 86_400_000
        ? 'AGING'
        : 'STALE'
    : 'UNKNOWN';

  const askingSources = observedSaleCount > 0
    ? ['src-live-listings', 'src-radar-baseline']
    : ['src-radar-baseline'];
  const rentSources = observedRentCount > 0
    ? ['src-live-listings', 'src-radar-baseline', 'src-hedonic-v64']
    : ['src-radar-baseline', 'src-hedonic-v64'];

  return [
    {
      id: `rep-asking-${hoodId}`,
      titleFa: `گزارش وضعیت قیمت پیشنهادی و شکاف مذاکره در ${geoScopeFa}`,
      scopeLabelFa: geoScopeFa,
      periodLabelFa,
      publishedJalali,
      generatedAtIso,
      dataAsOfIso,
      dataAsOfDisplayFa: dataAsOfDisplayFa ?? (dataAsOfIso ? dataAsOfIso.slice(0, 10) : null),
      freshnessStatus,
      status: askingStatus,
      summaryFa:
        unitAsk !== null && unitDeal !== null
          ? `نرخ پیشنهادی هر متر در ${geoScopeFa} برابر ${toPersianNum(unitAsk)} میلیون تومان است در حالی که سناریوی توافق مدل v6.4 عدد ${toPersianNum(unitDeal)} میلیون تومان را برآورد می‌کند.`
          : `برای ${geoScopeFa} در بازه ${periodLabelFa}، نمونه مشاهده‌شده کافی جهت اعلام نرخ پیشنهادی ثبت نشده است.`,
      keyTakeawaysFa: [
        'تمامی ارقام پیشنهادی آگهی بوده و نماینده معامله قطعی ثبت‌شده (۰ مورد) نیستند.',
        `دامنه میان‌چارکی (IQR): ${distribution.iqr !== null ? `${toPersianNum(distribution.iqr)} میلیون تومان` : 'نیازمند نمونه زنده بیشتر'}.`,
      ],
      methodologyId: 'meth-asking-median',
      sourceIds: askingSources,
      sampleCount: observedSaleCount,
    },
    {
      id: `rep-rent-${hoodId}`,
      titleFa: `تحلیل تفکیکی ودیعه و اجاره در ${geoScopeFa}`,
      scopeLabelFa: geoScopeFa,
      periodLabelFa,
      publishedJalali,
      generatedAtIso,
      dataAsOfIso,
      dataAsOfDisplayFa: dataAsOfDisplayFa ?? (dataAsOfIso ? dataAsOfIso.slice(0, 10) : null),
      freshnessStatus,
      status: rentStatus,
      summaryFa: `شاخص رهن کامل واحد ۸۰ متری معادل ${toPersianNum(avgRahn80)} میلیون تومان و معادل اجاره ماهانه (با نرخ تبدیل ۳۶٪ سالانه) برابر ${toPersianNum(convertedMonthly)} میلیون تومان است.`,
      keyTakeawaysFa: [
        grossYieldPct !== null
          ? `بازده ناخالص اجاره سالانه حدود ${toPersianNum(grossYieldPct)}٪ برآورد می‌شود.`
          : 'اطلاعات کافی برای محاسبه بازده ناخالص اجاره در دسترس نیست.',
        'ودیعه و اجاره به صورت مجزا رصد شده و فقط در ستون معادل‌سازی با نرخ مصوب ترکیب می‌شوند.',
      ],
      methodologyId: 'meth-rent-conversion',
      sourceIds: rentSources,
      sampleCount: observedRentCount,
    },
  ];
}
