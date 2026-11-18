/**
 * Stage 30 — Browser Performance & RUM Measurement Truth Engine
 * Spec ID: RT-FE-REBUILD-RUM-MEASUREMENT-TRUTH-030
 */

export const RT_FE_RUM_MEASUREMENT_TRUTH_SPEC_ID = 'RT-FE-REBUILD-RUM-MEASUREMENT-TRUTH-030' as const;
export const RT_FE_RUM_MEASUREMENT_TRUTH_READY = 'RT_FE_STAGE30_RUM_MEASUREMENT_TRUTH_READY' as const;

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

  const totalSamples = Math.max(lcpDist.sampleCount, inpDist.sampleCount, clsDist.sampleCount);
  if (totalSamples === 0) {
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
    sampleCount: totalSamples,
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

export class BrowserRumCollector {
  private observers: ObserverLike[] = [];
  private lcpMs: number | null = null;
  private inpMs: number | null = null;
  private clsValue: number | null = null;
  private fcpMs: number | null = null;
  private ttfbMs: number | null = null;
  private longTaskCount = 0;
  private totalBlockingTimeMs = 0;
  private slowResourceCount = 0;
  private interactionDurations: number[] = [];
  private supportedTypes: Set<string>;
  private readonly observerFactory?: ObserverFactory;
  private routeKey: string;

  constructor(options?: { routePath?: string; supportedEntryTypes?: readonly string[]; observerFactory?: ObserverFactory }) {
    this.routeKey = sanitizeRumRoutePath(options?.routePath ?? (typeof window !== 'undefined' ? window.location.pathname : '/'));
    const browserSupported =
      options?.supportedEntryTypes ??
      (typeof PerformanceObserver !== 'undefined' && Array.isArray(PerformanceObserver.supportedEntryTypes)
        ? PerformanceObserver.supportedEntryTypes : []);
    this.supportedTypes = new Set(browserSupported);
    this.observerFactory = options?.observerFactory;
  }

  public start(): void {
    this.disconnect();
    this.observeType('largest-contentful-paint', (entries) => {
      for (const entry of entries) {
        const startTime = Number(entry.startTime);
        if (Number.isFinite(startTime) && startTime >= 0) this.lcpMs = Math.round(startTime);
      }
    });
    this.observeType('layout-shift', (entries) => {
      for (const entry of entries) {
        if (entry.hadRecentInput === true) continue;
        const val = Number(entry.value);
        if (Number.isFinite(val) && val >= 0) this.clsValue = Number(((this.clsValue ?? 0) + val).toFixed(4));
      }
    });
    this.observeType('event', (entries) => {
      for (const entry of entries) {
        const interactionId = Number(entry.interactionId ?? 0);
        const duration = Number(entry.duration);
        if (interactionId > 0 && Number.isFinite(duration) && duration >= 0) {
          this.interactionDurations.push(duration);
          const p98 = computeSamplePercentile(this.interactionDurations, 98);
          this.inpMs = p98 !== null ? Math.round(p98) : Math.round(duration);
        }
      }
    });
    this.observeType('longtask', (entries) => {
      for (const entry of entries) {
        const duration = Number(entry.duration);
        if (Number.isFinite(duration) && duration > 50) {
          this.longTaskCount += 1;
          this.totalBlockingTimeMs += Math.round(duration - 50);
        }
      }
    });
    this.observeType('paint', (entries) => {
      for (const entry of entries) {
        if (entry.name === 'first-contentful-paint' && Number.isFinite(Number(entry.startTime))) {
          this.fcpMs = Math.round(Number(entry.startTime));
        }
      }
    });
    this.observeType('resource', (entries) => {
      for (const entry of entries) {
        if (Number(entry.duration) > 1000) this.slowResourceCount += 1;
      }
    });
  }

  private observeType(type: string, handler: (entries: Array<Record<string, unknown>>) => void): void {
    if (!this.supportedTypes.has(type)) return;
    if (this.observerFactory) {
      const obs = this.observerFactory(handler);
      if (obs) { obs.observe({ type, buffered: true }); this.observers.push(obs); }
      return;
    }
    if (typeof PerformanceObserver === 'undefined') return;
    try {
      const obs = new PerformanceObserver((list) => handler(list.getEntries() as unknown as Array<Record<string, unknown>>));
      obs.observe({ type, buffered: true } as PerformanceObserverInit);
      this.observers.push(obs as unknown as ObserverLike);
    } catch { /* ignore */ }
  }

  public recordNavigationTiming(responseStart: number, requestStart: number): void {
    if (Number.isFinite(responseStart) && Number.isFinite(requestStart) && responseStart >= requestStart) {
      this.ttfbMs = Math.round(responseStart - requestStart);
    }
  }

  public disconnect(): void {
    for (const obs of this.observers) { try { obs.disconnect(); } catch { /* ignore */ } }
    this.observers = [];
  }

  public getActiveObserverCount(): number { return this.observers.length; }

  private resolveStatus(type: string, currentVal: number | null, hasCount = false): MetricAvailabilityStatus {
    if (!this.supportedTypes.has(type)) return 'UNSUPPORTED_API';
    if (hasCount || currentVal !== null) return 'MEASURED';
    return 'NO_DATA_YET';
  }

  public getSnapshot(): BrowserPerformanceSnapshot {
    return {
      measurementSource: 'FIELD_RUM',
      routeKey: this.routeKey,
      collectedAtIso: new Date().toISOString(),
      lcpMs: this.lcpMs,
      inpMs: this.inpMs,
      cls: this.clsValue,
      fcpMs: this.fcpMs,
      ttfbMs: this.ttfbMs,
      longTaskCount: this.longTaskCount,
      totalBlockingTimeMs: this.totalBlockingTimeMs,
      slowResourceCount: this.slowResourceCount,
      availability: {
        lcp: this.resolveStatus('largest-contentful-paint', this.lcpMs),
        inp: this.resolveStatus('event', this.inpMs),
        cls: this.resolveStatus('layout-shift', this.clsValue),
        longtask: this.resolveStatus('longtask', null, this.observers.length > 0),
      },
    };
  }
}

export function collectCurrentBrowserPerformanceSnapshot(routePath?: string): BrowserPerformanceSnapshot {
  const collector = new BrowserRumCollector({ routePath });
  if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
    try {
      const navEntries = performance.getEntriesByType('navigation') as unknown as Array<{ responseStart?: number; requestStart?: number }>;
      if (navEntries.length > 0 && navEntries[0]) {
        collector.recordNavigationTiming(Number(navEntries[0].responseStart ?? 0), Number(navEntries[0].requestStart ?? 0));
      }
    } catch { /* ignore */ }
  }
  return collector.getSnapshot();
}
