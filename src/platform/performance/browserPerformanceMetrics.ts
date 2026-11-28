/** Stage 30 — Browser RUM sanitization, percentile and budget functions. */

import type {
  BrowserPerformanceSnapshot,
  PercentileDistribution,
  PerformanceMeasurementSource,
  RumBudgetVerdict,
  RumPercentileBudgetEvaluation,
} from './browserPerformanceTypes';

export function sanitizeRumRoutePath(rawUrlOrPath?: string | null): string {
  if (!rawUrlOrPath || typeof rawUrlOrPath !== 'string') return '/';
  const withoutHash = rawUrlOrPath.split('#')[0] ?? '/';
  const withoutQuery = withoutHash.split('?')[0] ?? '/';
  let path = withoutQuery.trim() || '/';
  if (/^https?:\/\//i.test(path)) {
    try { path = new URL(path).pathname || '/'; } catch { path = '/'; }
  }
  if (!path.startsWith('/')) path = `/${path}`;
  return path
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, ':redacted-email')
    .replace(/\b09\d{9}\b/g, ':redacted-phone')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ':id')
    .replace(/\/\d{5,}/g, '/:id');
}

export function computeSamplePercentile(values: readonly number[], percentile0To100: number): number | null {
  const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  if (valid.length === 1) return Number(valid[0].toFixed(3));
  const idx = (percentile0To100 / 100) * (valid.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return Number(valid[lower].toFixed(3));
  const weight = idx - lower;
  return Number((valid[lower] * (1 - weight) + valid[upper] * weight).toFixed(3));
}

export function buildPercentileDistribution(values: readonly number[]): PercentileDistribution {
  const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  return {
    sampleCount: valid.length,
    p50: computeSamplePercentile(valid, 50),
    p75: computeSamplePercentile(valid, 75),
    p95: computeSamplePercentile(valid, 95),
    p99: computeSamplePercentile(valid, 99),
  };
}

export function evaluateRumPercentileBudget(params: {
  measurementSource: PerformanceMeasurementSource;
  lcpSamplesMs: readonly number[];
  inpSamplesMs: readonly number[];
  clsSamples: readonly number[];
  longTaskCounts?: readonly number[];
}): RumPercentileBudgetEvaluation {
  const lcpDist = buildPercentileDistribution(params.lcpSamplesMs);
  const inpDist = buildPercentileDistribution(params.inpSamplesMs);
  const clsDist = buildPercentileDistribution(params.clsSamples);
  const ltDist = buildPercentileDistribution(params.longTaskCounts ?? []);

  // A GOOD verdict requires observations for all three Core Web Vitals.
  // The minimum count is a conservative lower bound for a complete metric set;
  // missing INP or CLS must never be silently interpreted as passing.
  const completeCoreVitalsSampleCount = Math.min(lcpDist.sampleCount, inpDist.sampleCount, clsDist.sampleCount);
  if (completeCoreVitalsSampleCount === 0) {
    return {
      measurementSource: params.measurementSource,
      sampleCount: 0,
      withinBudget: null,
      verdict: 'INSUFFICIENT_SAMPLE',
      failingMetrics: [],
      distributions: { lcpMs: lcpDist, inpMs: inpDist, cls: clsDist, longTaskCount: ltDist },
    };
  }

  const failingMetrics: string[] = [];
  if (lcpDist.p75 !== null && lcpDist.p75 > 2500) failingMetrics.push('LCP_P75');
  if (inpDist.p75 !== null && inpDist.p75 > 200) failingMetrics.push('INP_P75');
  if (clsDist.p75 !== null && clsDist.p75 > 0.1) failingMetrics.push('CLS_P75');
  if (ltDist.p75 !== null && ltDist.p75 > 3) failingMetrics.push('LONG_TASKS_P75');

  const verdict: RumBudgetVerdict =
    failingMetrics.length === 0 ? 'GOOD' : failingMetrics.length === 1 ? 'NEEDS_IMPROVEMENT' : 'BUDGET_VIOLATION';

  return {
    measurementSource: params.measurementSource,
    sampleCount: completeCoreVitalsSampleCount,
    withinBudget: failingMetrics.length === 0,
    verdict,
    failingMetrics,
    distributions: { lcpMs: lcpDist, inpMs: inpDist, cls: clsDist, longTaskCount: ltDist },
  };
}

export function canTransmitRumPayload(params: {
  snapshot: BrowserPerformanceSnapshot;
  performanceTelemetryConsentGranted: boolean;
}): { allowed: boolean; reason: string } {
  if (!params.performanceTelemetryConsentGranted) return { allowed: false, reason: 'CONSENT_DENIED_STAGE26' };
  if (params.snapshot.measurementSource !== 'FIELD_RUM') return { allowed: false, reason: 'NON_FIELD_SOURCE_REJECTED' };
  const hasAnyRealMetric =
    params.snapshot.lcpMs !== null || params.snapshot.inpMs !== null ||
    params.snapshot.cls !== null || params.snapshot.fcpMs !== null || params.snapshot.ttfbMs !== null;
  if (!hasAnyRealMetric) return { allowed: false, reason: 'EMPTY_RUM_SAMPLE' };
  return { allowed: true, reason: 'ALLOWED_FIELD_RUM' };
}
