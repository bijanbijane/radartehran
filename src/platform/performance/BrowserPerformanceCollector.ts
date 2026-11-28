/**
 * Stage 30 — Browser Performance & RUM Measurement Truth Engine
 * Spec ID: RT-FE-REBUILD-RUM-MEASUREMENT-TRUTH-030
 */

import { computeSamplePercentile, sanitizeRumRoutePath } from './browserPerformanceMetrics';
import type {
  BrowserPerformanceSnapshot,
  MetricAvailabilityStatus,
  ObserverFactory,
  ObserverLike,
} from './browserPerformanceTypes';

export * from './browserPerformanceTypes';
export * from './browserPerformanceMetrics';

const MAX_TRACKED_INTERACTIONS = 10_000;

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
  // Keep one maximum duration per interaction ID; repeated event entries must not
  // overweight a single interaction in the page-level INP percentile.
  private interactionDurationsById = new Map<number, number>();
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
        if (Number.isSafeInteger(interactionId) && interactionId > 0 && Number.isFinite(duration) && duration >= 0) {
          const previousMax = this.interactionDurationsById.get(interactionId);
          if (previousMax === undefined || duration > previousMax) {
            // Refresh insertion order for active interactions while retaining only
            // a bounded rolling window for unusually long-lived SPA sessions.
            this.interactionDurationsById.delete(interactionId);
            this.interactionDurationsById.set(interactionId, duration);
            if (this.interactionDurationsById.size > MAX_TRACKED_INTERACTIONS) {
              const oldestInteractionId = this.interactionDurationsById.keys().next().value;
              if (oldestInteractionId !== undefined) this.interactionDurationsById.delete(oldestInteractionId);
            }
            const p98 = computeSamplePercentile([...this.interactionDurationsById.values()], 98);
            if (p98 !== null) this.inpMs = Math.round(p98);
          }
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
        longtask: this.resolveStatus('longtask', null, this.longTaskCount > 0),
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
