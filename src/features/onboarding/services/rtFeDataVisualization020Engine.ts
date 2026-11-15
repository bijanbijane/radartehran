/**
 * Stage 20 — Executable Chart Selection Guard, Time-Series Gap/Base Policy,
 * Cross-Filter Cycle Prevention, Accessible Summary & Small-Cell Governance Engine
 * Spec ID: RT-FE-DATA-VISUALIZATION-020
 */

import { RT_VIS_CHART_REGISTRY_18, RT_VIS_CHOROPLETH_METHODS_5 } from './rtFeDataVisualization020Specs';

export * from './rtFeDataVisualization020Specs';

/** Enforces chart suitability, non-truncated bars & dual-axis safety (§20.8.2 & §20.9). */
export function validateChartSelectionAndSchema(input: {
  chartType: string;
  categoryCount: number;
  isTemporalOrdered: boolean;
  hasUnitLabel: boolean;
  isBarAxisTruncatedAboveZero?: boolean;
  isDualAxis?: boolean;
  hasDualAxisLabelsAndDisclaimer?: boolean;
}): { valid: boolean; reasonFa: string } {
  const registered = RT_VIS_CHART_REGISTRY_18.find((c) => c.type === input.chartType);
  if (!registered) {
    return { valid: false, reasonFa: `نوع نمودار «${input.chartType}» در Chart Registry ثبت نشده است.` };
  }
  if (!input.hasUnitLabel) {
    return { valid: false, reasonFa: 'نمودار یا شاخص KPI بدون واحد اندازه‌گیری و محور معتبر مجاز نیست (§۲۰.۹.۱).' };
  }
  if ((input.chartType === 'pie' || input.chartType === 'donut') && input.categoryCount > 7) {
    return { valid: false, reasonFa: `نمودار دایره‌ای/حلقه‌ای برای ${input.categoryCount} دسته خوانا نیست؛ حداکثر ۷ دسته مجاز است (§۲۰.۸.۲).` };
  }
  if (input.chartType === 'line' && !input.isTemporalOrdered) {
    return { valid: false, reasonFa: 'نمودار خطی برای داده‌های بدون ترتیب زمانی مجاز نیست (§۲۰.۸.۲).' };
  }
  if ((input.chartType === 'bar' || input.chartType === 'grouped_bar') && input.isBarAxisTruncatedAboveZero) {
    return { valid: false, reasonFa: 'نمودار میله‌ای با محور عمودی بریده‌شده اختلاف‌ها را گمراه‌کننده بزرگ نشان می‌دهد (§۲۰.۸.۲).' };
  }
  if (input.isDualAxis && !input.hasDualAxisLabelsAndDisclaimer) {
    return { valid: false, reasonFa: 'محور دوگانه نیازمند برچسب مستقل هر دو واحد و سلب ادعای رابطه آماری خودکار است (§۲۰.۹.۲).' };
  }
  return { valid: true, reasonFa: `الگوی «${registered.labelFa}» با قوانین مقیاس، محور و نوع داده سازگار است.` };
}

export interface TimeSeriesPointInput {
  period: string;
  value: number | null;
  isEstimated?: boolean;
}

/** Validates time-series resolution, null-gap policy & zero-denominator safe % change (§20.10 & §20.19). */
export function evaluateTimeSeriesAndGapPolicy(input: {
  sourceGranularity: 'monthly' | 'quarterly' | 'yearly';
  requestedGranularity: 'daily' | 'monthly' | 'quarterly' | 'yearly';
  gapPolicy: 'break_line' | 'dashed_estimate';
  points: TimeSeriesPointInput[];
}): {
  valid: boolean;
  missingCount: number;
  estimatedCount: number;
  percentChange: number | null;
  reasonFa: string;
} {
  if (input.sourceGranularity !== 'monthly' && input.requestedGranularity === 'daily') {
    return {
      valid: false,
      missingCount: 0,
      estimatedCount: 0,
      percentChange: null,
      reasonFa: 'تبدیل پنهان تناوب کلان به بازه روزانه با درون‌یابی مصنوعی ممنوع است (§۲۰.۱۰.۲).',
    };
  }
  if (input.sourceGranularity === 'monthly' && input.requestedGranularity === 'daily') {
    return {
      valid: false,
      missingCount: 0,
      estimatedCount: 0,
      percentChange: null,
      reasonFa: 'داده ماهانه را نباید با تکرار یا درون‌یابی به نمایش روزانه تبدیل کرد (§۲۰.۱۰.۲).',
    };
  }
  const missingCount = input.points.filter((p) => p.value === null).length;
  const estimatedCount = input.points.filter((p) => p.isEstimated).length;
  const validValues = input.points.filter((p): p is { period: string; value: number; isEstimated?: boolean } => p.value !== null);
  let percentChange: number | null = null;
  if (validValues.length >= 2) {
    const first = validValues[0].value;
    const last = validValues[validValues.length - 1].value;
    if (first !== 0) {
      percentChange = Number((((last - first) / Math.abs(first)) * 100).toFixed(1));
    }
  }
  return {
    valid: true,
    missingCount,
    estimatedCount,
    percentChange,
    reasonFa:
      missingCount > 0
        ? `${missingCount} دوره فاقد مقدار هرگز صفر فرض نمی‌شود و طبق سیاست «${input.gapPolicy}» نمایش می‌یابد (§۲۰.۱۰.۴).`
        : 'سری زمانی با ترتیب معتبر، واحد مشخص و تغییر درصدی ایمن آماده نمایش است.',
  };
}

/** Detects circular Cross-filtering propagation loops across dashboard widgets (§20.17.2). */
export function evaluateCrossFilterGraph(edges: { fromWidgetId: string; toWidgetId: string }[]): {
  acyclic: boolean;
  cycleWidgets: string[];
  noteFa: string;
} {
  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    const arr = adj.get(e.fromWidgetId) ?? [];
    arr.push(e.toWidgetId);
    adj.set(e.fromWidgetId, arr);
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleWidgets: string[] = [];

  const dfs = (node: string): boolean => {
    visiting.add(node);
    for (const next of adj.get(node) ?? []) {
      if (visiting.has(next)) {
        cycleWidgets.push(next, node);
        return true;
      }
      if (!visited.has(next) && dfs(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const node of adj.keys()) {
    if (!visited.has(node) && dfs(node)) {
      return {
        acyclic: false,
        cycleWidgets: Array.from(new Set(cycleWidgets)),
        noteFa: 'حلقه به‌روزرسانی بی‌پایان در Cross-filtering شناسایی و مسدود شد (§۲۰.۱۷.۲).',
      };
    }
  }
  return {
    acyclic: true,
    cycleWidgets: [],
    noteFa: 'جریان Cross-filtering بدون چرخه بوده و تغییر فیلتر به Query Layer منتقل می‌شود.',
  };
}

/** Validates Choropleth spatial classification method & missing-value color separation (§20.13.1 & §20.13.5). */
export function evaluateSpatialChoroplethSpec(input: {
  method: string;
  separatesMissingValueStyle: boolean;
  usesExistingLeafletAdapter: boolean;
}): { valid: boolean; reasonFa: string } {
  if (!(RT_VIS_CHOROPLETH_METHODS_5 as readonly string[]).includes(input.method)) {
    return { valid: false, reasonFa: 'روش طبقه‌بندی Choropleth باید صریح و ثبت‌شده باشد.' };
  }
  if (!input.separatesMissingValueStyle) {
    return { valid: false, reasonFa: 'داده فاقد مقدار باید از پایین‌ترین طبقه رنگی نقشه تفکیک شود (§۲۰.۱۳.۱).' };
  }
  if (!input.usesExistingLeafletAdapter) {
    return { valid: false, reasonFa: 'لایه بصری مکانی باید از Leaflet Adapter مشترک پروژه استفاده کند (§۲۰.۱۳.۵).' };
  }
  return { valid: true, reasonFa: `نقشه Choropleth با روش «${input.method}» روی Leaflet Adapter معتبر است.` };
}

/** Builds an evidence-grounded WCAG 2.2 AA textual summary for Screen Readers without unverified claims (§20.28.1). */
export function buildAccessibleChartSummary(input: {
  metricTitleFa: string;
  unitFa: string;
  points: TimeSeriesPointInput[];
}): string {
  const valid = input.points.filter((p): p is { period: string; value: number } => p.value !== null);
  const missingCount = input.points.length - valid.length;
  if (valid.length === 0) {
    return `نمودار «${input.metricTitleFa}» (${input.unitFa}) در حال حاضر مقدار معتبری برای گزارش متنی ندارد.`;
  }
  const first = valid[0];
  const last = valid[valid.length - 1];
  const trendWord = last.value > first.value ? 'افزایش' : last.value < first.value ? 'کاهش' : 'ثبات';
  const missingClause = missingCount > 0 ? `؛ تعداد ${missingCount} دوره فاقد مقدار معتبر هستند.` : '.';
  return `این نمودار روند «${input.metricTitleFa}» (${input.unitFa}) را از ${first.period} تا ${last.period} نشان می‌دهد و مقدار پایانی نسبت به آغاز دوره ${trendWord} داشته است${missingClause}`;
}

/** Enforces small-cell privacy threshold & strips PII from visualization exports/telemetry (§20.29 & §20.30). */
export function sanitizeVisualizationExportAndTelemetry(input: {
  sampleSize: number;
  minSampleThreshold?: number;
  hasExportPermission: boolean;
  extraTelemetryFields?: Record<string, unknown>;
}): { exportAllowed: boolean; strippedTelemetryFields: string[]; blockReasonFa?: string } {
  const threshold = input.minSampleThreshold ?? 5;
  const forbidden = ['privateRecordContent', 'userId', 'exactAddress', 'rawSmallCellIds'];
  const strippedTelemetryFields = Object.keys(input.extraTelemetryFields ?? {}).filter((k) => forbidden.includes(k));
  if (!input.hasExportPermission) {
    return { exportAllowed: false, strippedTelemetryFields, blockReasonFa: 'خروجی نمودار فاقد مجوز دسترسی در Backend است (§۲۰.۳۰.۱).' };
  }
  if (input.sampleSize < threshold) {
    return {
      exportAllowed: false,
      strippedTelemetryFields,
      blockReasonFa: `تعداد نمونه (${input.sampleSize}) کمتر از حداقل مجاز (${threshold}) است؛ جلوگیری از استنتاج ناخواسته (§۲۰.۲۹.۱).`,
    };
  }
  return { exportAllowed: true, strippedTelemetryFields };
}
