/** @file src/features/onboarding/services/dataVisualizationEngine.ts — Stage 36 (RT-UI-DATA-VIS-001) Data Visualization, Metric/Chart Registry & Analytical Engine */
import { toPersianNum } from '../../../data/neighborhoods';

export type EpistemicLayerType = 'data' | 'analysis' | 'visualization';
export type PriceDataOrigin = 'asking_price' | 'transaction_price' | 'estimated_value';
export type DataSufficiencyStatus = 'Sufficient' | 'Limited' | 'Insufficient' | 'Unavailable';
export type UncertaintyRangeKind =
  | 'confidence_interval'
  | 'prediction_interval'
  | 'quantile_range_p10_p90'
  | 'interquartile_range_p25_p75'
  | 'observed_min_max'
  | 'model_scenario';

export type AnalyticalQuestionKind =
  | 'temporal_trend'
  | 'category_comparison'
  | 'single_distribution'
  | 'multi_group_distribution'
  | 'two_variable_correlation'
  | 'estimate_with_range'
  | 'composition_share'
  | 'spatial_area_rate'
  | 'spatial_volume_count'
  | 'spatial_point_density';

export type RadarChartType =
  | 'kpi_card'
  | 'line_chart'
  | 'horizontal_bar_chart'
  | 'histogram'
  | 'box_plot'
  | 'scatter_plot'
  | 'dot_plot_with_range'
  | 'stacked_bar_chart'
  | 'choropleth_map'
  | 'graduated_symbol_map'
  | 'heatmap_density'
  | 'data_table';

export interface MetricDefinition {
  id: string;
  titleFa: string;
  technicalName: string;
  definitionFa: string;
  unitFa: string;
  valueType: 'currency_million_toman' | 'count' | 'percentage' | 'index_score';
  dataOrigin: PriceDataOrigin | 'supply_inventory';
  temporalStockOrFlow: 'stock' | 'flow' | 'period_aggregate';
  aggregationMethod: 'median' | 'mean' | 'trimmed_iqr_mean' | 'unique_count';
  geographyLevel: 'city' | 'district' | 'neighborhood';
  methodologyVersion: string;
  minSufficientSampleCount: number;
  sourceTitleFa: string;
}

export interface MetricResult {
  metricId: string;
  value: number | null;
  unitFa: string;
  geographyId: string;
  geographyLabelFa: string;
  periodStartFa: string;
  periodEndFa: string;
  dataCapturedAtFa: string;
  reportPublishedAtFa: string;
  sampleCount: number;
  qualityStatus: DataSufficiencyStatus;
  dataOrigin: PriceDataOrigin | 'supply_inventory';
  methodologyVersion: string;
  absoluteChange?: number | null;
  relativeChangePct?: number | null;
  comparisonBasePeriodFa?: string;
}

export interface DistributionPercentiles {
  sampleCount: number;
  mean: number | null;
  p10: number | null;
  p25: number | null;
  p50Median: number | null;
  p75: number | null;
  p90: number | null;
  iqrP75MinusP25: number | null;
  boxPlotGuideFa: string;
}

export const BOX_PLOT_PLAIN_GUIDE_FA =
  'خط داخل جعبه میانه است و جعبه ۵۰ درصد میانی نمونه‌ها را نشان می‌دهد.';

export const RADAR_METRIC_REGISTRY: readonly MetricDefinition[] = [
  {
    id: 'METRIC-ASKING-SQM-MEDIAN',
    titleFa: 'میانه قیمت پیشنهادی هر مترمربع آگهی‌های مسکونی',
    technicalName: 'median_asking_price_per_sqm',
    definitionFa: 'نقطه میانی (P50) قیمت پیشنهادی هر مترمربع در آگهی‌های یکتای مسکونی پس از حذف موارد تکراری.',
    unitFa: 'میلیون تومان',
    valueType: 'currency_million_toman',
    dataOrigin: 'asking_price',
    temporalStockOrFlow: 'period_aggregate',
    aggregationMethod: 'median',
    geographyLevel: 'neighborhood',
    methodologyVersion: 'v4.2',
    minSufficientSampleCount: 30,
    sourceTitleFa: 'پایگاه آگهی‌های یکتای پالایش‌شده رادار تهران',
  },
  {
    id: 'METRIC-HEDONIC-ESTIMATED-SQM',
    titleFa: 'برآورد ارزش تخمینی هر مترمربع (مدل هدونیک)',
    technicalName: 'hedonic_estimated_value_per_sqm',
    definitionFa: 'خروجی مدل آماری هدونیک با لحاظ سن بنا، طبقه، امکانات و موقعیت محله همراه با دامنه پیش‌بینی.',
    unitFa: 'میلیون تومان',
    valueType: 'currency_million_toman',
    dataOrigin: 'estimated_value',
    temporalStockOrFlow: 'period_aggregate',
    aggregationMethod: 'trimmed_iqr_mean',
    geographyLevel: 'neighborhood',
    methodologyVersion: 'v6.4',
    minSufficientSampleCount: 20,
    sourceTitleFa: 'موتور ارزش‌گذاری هدونیک رادار تهران',
  },
  {
    id: 'METRIC-ACTIVE-UNIQUE-LISTINGS',
    titleFa: 'تعداد آگهی‌های یکتای فعال مسکونی',
    technicalName: 'active_unique_listings_stock',
    definitionFa: 'موجودی آگهی‌های یکتای فعال در پایان دوره زمانی انتخاب‌شده (Stock).',
    unitFa: 'آگهی یکتا',
    valueType: 'count',
    dataOrigin: 'supply_inventory',
    temporalStockOrFlow: 'stock',
    aggregationMethod: 'unique_count',
    geographyLevel: 'neighborhood',
    methodologyVersion: 'v3.1',
    minSufficientSampleCount: 10,
    sourceTitleFa: 'سرویس پایش عرضه و حذف تکراری رادار',
  },
] as const;

/** Section 8: Compute Mean, Median (P50), Percentiles (P10, P25, P75, P90) & IQR without converting empty to 0 */
export function calculateDistributionPercentiles(rawValues: readonly number[]): DistributionPercentiles {
  const valid = rawValues.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (valid.length === 0) {
    return {
      sampleCount: 0,
      mean: null,
      p10: null,
      p25: null,
      p50Median: null,
      p75: null,
      p90: null,
      iqrP75MinusP25: null,
      boxPlotGuideFa: BOX_PLOT_PLAIN_GUIDE_FA,
    };
  }
  const pickPercentile = (p: number): number => {
    const idx = (p / 100) * (valid.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const weight = idx - lo;
    return Number((valid[lo] * (1 - weight) + valid[hi] * weight).toFixed(1));
  };
  const sum = valid.reduce((acc, v) => acc + v, 0);
  const p25 = pickPercentile(25);
  const p75 = pickPercentile(75);
  return {
    sampleCount: valid.length,
    mean: Number((sum / valid.length).toFixed(1)),
    p10: pickPercentile(10),
    p25,
    p50Median: pickPercentile(50),
    p75,
    p90: pickPercentile(90),
    iqrP75MinusP25: Number((p75 - p25).toFixed(1)),
    boxPlotGuideFa: BOX_PLOT_PLAIN_GUIDE_FA,
  };
}

/** Section 9, 11 & 17: Select appropriate chart by analytical question (prefers Horizontal Bar over Pie chart) */
export function selectChartForAnalyticalQuestion(question: AnalyticalQuestionKind): {
  recommendedChart: RadarChartType;
  yAxisMustStartAtZero: boolean;
  preserveGapOnMissingData: boolean;
  requiresAccessibleTableAndSummary: true;
  rationaleFa: string;
} {
  const map: Record<AnalyticalQuestionKind, { chart: RadarChartType; zeroBase: boolean; rationaleFa: string }> = {
    temporal_trend: { chart: 'line_chart', zeroBase: false, rationaleFa: 'نمایش روند زمانی با حفظ گسست در ماه‌های فاقد داده (بدون اتصال ساختگی).' },
    category_comparison: { chart: 'horizontal_bar_chart', zeroBase: true, rationaleFa: 'مقایسه دقیق محله‌ها با برچسب فارسی خوانا و شروع محور مقدار از صفر.' },
    single_distribution: { chart: 'histogram', zeroBase: true, rationaleFa: 'نمایش شکل توزیع و پراکندگی قیمت املاک فراتر از یک عدد میانگین.' },
    multi_group_distribution: { chart: 'box_plot', zeroBase: false, rationaleFa: 'مقایسه میانه، چارک‌ها (IQR) و دامنه قیمت میان چند محله.' },
    two_variable_correlation: { chart: 'scatter_plot', zeroBase: false, rationaleFa: 'بررسی رابطه دو متغیر عددی (مانند متراژ و قیمت کل) بدون ادعای علیت.' },
    estimate_with_range: { chart: 'dot_plot_with_range', zeroBase: false, rationaleFa: 'نمایش برآورد مرکزی در کنار دامنه عدم‌قطعیت با تعریف صریح نوع بازه.' },
    composition_share: { chart: 'stacked_bar_chart', zeroBase: true, rationaleFa: 'نمایش سهم اجزا از کل با خوانایی بالاتر نسبت به نمودار دایره‌ای.' },
    spatial_area_rate: { chart: 'choropleth_map', zeroBase: false, rationaleFa: 'نمایش شاخص نرمال‌شده یا نرخ هر واحد جغرافیایی با تفکیک داده ناموجود از صفر.' },
    spatial_volume_count: { chart: 'graduated_symbol_map', zeroBase: true, rationaleFa: 'نمایش تعداد مطلق با مساحت دایره متناسب با مقدار داده.' },
    spatial_point_density: { chart: 'heatmap_density', zeroBase: false, rationaleFa: 'نمایش شدت تمرکز مکانی نقاط (مجزا از نقشه قیمت).' },
  };
  const entry = map[question];
  return {
    recommendedChart: entry.chart,
    yAxisMustStartAtZero: entry.zeroBase,
    preserveGapOnMissingData: true,
    requiresAccessibleTableAndSummary: true,
    rationaleFa: entry.rationaleFa,
  };
}

/** Section 19 & 39.2: Evaluate Data Sufficiency & Ensure Missing Data is NEVER coerced to 0 */
export function evaluateMetricSufficiency(
  sampleCount: number,
  minRequired: number,
  rawValue: number | null,
): { status: DataSufficiencyStatus; safeValue: number | null; warningFa: string | null } {
  if (rawValue === null || sampleCount <= 0) {
    return { status: 'Unavailable', safeValue: null, warningFa: 'داده‌ای برای این محدوده و دوره زمانی موجود نیست (عدم تبدیل به صفر).' };
  }
  if (sampleCount < Math.ceil(minRequired * 0.5)) {
    return { status: 'Insufficient', safeValue: rawValue, warningFa: `تعداد نمونه (${toPersianNum(sampleCount)} مورد) کمتر از حد مجاز است؛ نتیجه‌گیری آماری متوقف شد.` };
  }
  if (sampleCount < minRequired) {
    return { status: 'Limited', safeValue: rawValue, warningFa: `پوشش داده محدود (${toPersianNum(sampleCount)} آگهی یکتا)؛ با احتیاط تفسیر شود.` };
  }
  return { status: 'Sufficient', safeValue: rawValue, warningFa: null };
}

/** Section 24: Area-proportional symbol radius (prevents radius distortion) */
export function calculateAreaProportionalSymbolRadiusPx(value: number, maxRefValue: number, maxRadiusPx = 28): number {
  if (value <= 0 || maxRefValue <= 0) return 0;
  return Number((Math.sqrt(value / maxRefValue) * maxRadiusPx).toFixed(2));
}

/** Section 28.3 & 30.3: Linked Views Anti-Loop Sync + Homogeneous Comparison Guard + Cache Key */
export function validateNeighborhoodComparisonHomogeneity(
  seriesA: { dataOrigin: PriceDataOrigin; unitFa: string; periodFa: string },
  seriesB: { dataOrigin: PriceDataOrigin; unitFa: string; periodFa: string },
): { comparable: boolean; reasonFa: string } {
  if (seriesA.dataOrigin !== seriesB.dataOrigin) {
    return { comparable: false, reasonFa: 'مقایسه مستقیم مجاز نیست: اختلاط قیمت پیشنهادی آگهی با قیمت معامله یا برآورد مدل ممنوع است.' };
  }
  if (seriesA.unitFa !== seriesB.unitFa) {
    return { comparable: false, reasonFa: 'واحد اندازه‌گیری دو سری یکسان نیست.' };
  }
  return { comparable: true, reasonFa: `مقایسه هم‌جنس و معتبر (${seriesA.unitFa} · ${seriesA.periodFa}).` };
}

export function buildAnalyticsCacheKey(params: {
  metricId: string;
  geographyId: string;
  periodKey: string;
  propertyType: string;
  dataOrigin: PriceDataOrigin;
  methodologyVersion: string;
}): string {
  return `${params.metricId}|${params.geographyId}|${params.periodKey}|${params.propertyType}|${params.dataOrigin}|${params.methodologyVersion}`;
}
