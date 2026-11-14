import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  aggregateNeighborhoodMarketMetrics,
  buildNeighborhoodListingSamples,
} from '../../../data/realMarketPriceAggregator';
import {
  DATA_KIND_LABELS_FA,
  INDICATOR_REGISTRY,
  INDICATOR_STATUS_LABELS_FA,
  evaluateSampleSufficiency,
  resolveRentEquivalent,
} from '../indicators/IndicatorRegistry';
import type {
  AppliedMarketFilters,
  GeoComparisonItem,
  MarketIndicatorStatus,
  MarketReportItem,
} from '../types/market.types';
import type { MarketIndicatorId, MarketIndicatorValue, PriceDistributionStats } from '../types/indicator.types';

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
  selectedHood: EvaluatedNeighborhood,
  compareHoodIds: readonly number[],
  filters: AppliedMarketFilters,
): GeoComparisonItem[] {
  const compareIds = Array.from(new Set([selectedHood.id, ...compareHoodIds])).slice(0, 4);
  return compareIds
    .map((id) => allHoods.find((h) => h.id === id))
    .filter((h): h is EvaluatedNeighborhood => Boolean(h))
    .map((h) => {
      const agg = aggregateNeighborhoodMarketMetrics(
        h.id,
        h.name,
        h.buyPerSqm,
        buildNeighborhoodListingSamples(h),
      );
      const gapFromBasePct =
        selectedHood.buyPerSqm > 0
          ? Math.round(((h.buyPerSqm - selectedHood.buyPerSqm) / selectedHood.buyPerSqm) * 100)
          : 0;
      return {
        hoodId: h.id,
        hoodName: h.name,
        zone: h.zone,
        askingPerSqmMillion: h.buyPerSqm,
        estimatedDealPerSqmMillion: agg.estimatedDealPricePerSqm,
        rahn80mMillion: h.rahn80m,
        monthlyRentEquivMillion: resolveRentEquivalent(h.rahn80m),
        observedCount: agg.observedSampleCount,
        status: evaluateSampleSufficiency(
          filters.marketType,
          'neighborhood',
          agg.observedSampleCount,
          'asking_price_median_sqm',
        ),
        gapFromBasePct,
        overallScore: h.overallScore,
      };
    });
}

export function buildMarketReportsList(params: {
  selectedHood: EvaluatedNeighborhood;
  geoScopeFa: string;
  periodLabelFa: string;
  unitAsk: number;
  unitDeal: number;
  avgRahn80: number;
  convertedMonthly: number;
  grossYieldPct: number;
  askingStatus: MarketIndicatorStatus;
  rentStatus: MarketIndicatorStatus;
  distribution: PriceDistributionStats;
  validCount: number;
  scopeCount: number;
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
    validCount,
    scopeCount,
  } = params;
  return [
    {
      id: `rep-asking-${selectedHood.id}`,
      titleFa: `گزارش وضعیت قیمت پیشنهادی و شکاف مذاکره در ${geoScopeFa}`,
      scopeLabelFa: geoScopeFa,
      periodLabelFa,
      publishedJalali: '۱۴۰۵/۰۸',
      status: askingStatus,
      summaryFa: `نرخ پیشنهادی هر متر در ${geoScopeFa} برابر ${toPersianNum(unitAsk)} میلیون تومان است در حالی که سناریوی توافق مدل v6.4 عدد ${toPersianNum(unitDeal)} میلیون تومان را برآورد می‌کند.`,
      keyTakeawaysFa: [
        'تمامی ارقام پیشنهادی آگهی بوده و نماینده معامله قطعی ثبت‌شده (۰ مورد) نیستند.',
        `دامنه میان‌چارکی (IQR): ${distribution.iqr !== null ? `${toPersianNum(distribution.iqr)} میلیون تومان` : 'نیازمند نمونه زنده بیشتر'}.`,
      ],
      methodologyId: 'meth-asking-median',
      sourceIds: ['src-live-listings', 'src-radar-baseline'],
      sampleCount: validCount,
    },
    {
      id: `rep-rent-${selectedHood.id}`,
      titleFa: `تحلیل تفکیکی ودیعه و اجاره در ${geoScopeFa}`,
      scopeLabelFa: geoScopeFa,
      periodLabelFa,
      publishedJalali: '۱۴۰۵/۰۸',
      status: rentStatus,
      summaryFa: `شاخص رهن کامل واحد ۸۰ متری معادل ${toPersianNum(avgRahn80)} میلیون تومان و معادل اجاره ماهانه (با نرخ تبدیل ۳۶٪ سالانه) برابر ${toPersianNum(convertedMonthly)} میلیون تومان است.`,
      keyTakeawaysFa: [
        `بازده ناخالص اجاره سالانه حدود ${toPersianNum(grossYieldPct)}٪ برآورد می‌شود.`,
        'ودیعه و اجاره به صورت مجزا رصد شده و فقط در ستون معادل‌سازی با نرخ مصوب ترکیب می‌شوند.',
      ],
      methodologyId: 'meth-rent-conversion',
      sourceIds: ['src-radar-baseline', 'src-hedonic-v64'],
      sampleCount: scopeCount,
    },
  ];
}
