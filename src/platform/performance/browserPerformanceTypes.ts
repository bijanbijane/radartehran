/** Stage 30 — Browser RUM measurement types and public contracts. */

export const RT_FE_RUM_MEASUREMENT_TRUTH_SPEC_ID = 'RT-FE-REBUILD-RUM-MEASUREMENT-TRUTH-030' as const;
export const RT_FE_RUM_MEASUREMENT_TRUTH_READY = 'RT_FE_STAGE30_RUM_MEASUREMENT_TRUTH_READY' as const;

const MAX_TRACKED_INTERACTIONS = 10_000;

export type PerformanceMeasurementSource = 'FIELD_RUM' | 'LAB' | 'SYNTHETIC_LOCAL';
export type MetricAvailabilityStatus = 'MEASURED' | 'NO_DATA_YET' | 'UNSUPPORTED_API';
export type RumBudgetVerdict = 'GOOD' | 'NEEDS_IMPROVEMENT' | 'BUDGET_VIOLATION' | 'INSUFFICIENT_SAMPLE';

export interface BrowserPerformanceSnapshot {
  measurementSource: PerformanceMeasurementSource;
  routeKey: string;
  collectedAtIso: string;
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
  fcpMs: number | null;
  ttfbMs: number | null;
  longTaskCount: number;
  totalBlockingTimeMs: number;
  slowResourceCount: number;
  availability: {
    lcp: MetricAvailabilityStatus;
    inp: MetricAvailabilityStatus;
    cls: MetricAvailabilityStatus;
    longtask: MetricAvailabilityStatus;
  };
}

export interface PercentileDistribution {
  sampleCount: number;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  /** Tail diagnostic only; unstable for small cohorts and never a Core Web Vital budget gate. */
  p99: number | null;
}

export interface RumPercentileBudgetEvaluation {
  measurementSource: PerformanceMeasurementSource;
  sampleCount: number;
  withinBudget: boolean | null;
  verdict: RumBudgetVerdict;
  failingMetrics: string[];
  distributions: {
    lcpMs: PercentileDistribution;
    inpMs: PercentileDistribution;
    cls: PercentileDistribution;
    longTaskCount: PercentileDistribution;
  };
}

export interface ObserverLike {
  observe: (options: Record<string, unknown>) => void;
  disconnect: () => void;
}

export type ObserverFactory = (callback: (entries: Array<Record<string, unknown>>) => void) => ObserverLike | null;
