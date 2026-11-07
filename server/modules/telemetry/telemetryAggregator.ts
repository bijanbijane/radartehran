import type { AggregationWindowBucket, TelemetryEventPayload } from './telemetryTypes';

export interface BoundedAggregationOptions {
  readonly minDistinctSessionsForKAnonymity?: number;
  readonly windowDurationMs?: number;
}

/**
 * High-precision bounded accumulator for telemetry streams.
 * Aggregates raw micro-events into neighborhood & city metric buckets while enforcing k-anonymity (>= 15 sessions).
 */
export class BoundedTelemetryAggregationEngine {
  private readonly kAnonymityThreshold: number;
  private readonly windowDurationMs: number;
  private readonly aggregationBuckets = new Map<string, {
    windowStartMs: number;
    windowEndMs: number;
    dateKey: string;
    hoodId: number;
    cityId: string;
    eventType: string;
    eventsCount: number;
    sessions: Set<string>;
    metricsValues: Map<string, number[]>;
  }>();

  constructor(options?: BoundedAggregationOptions) {
    this.kAnonymityThreshold = options?.minDistinctSessionsForKAnonymity ?? 15;
    this.windowDurationMs = options?.windowDurationMs ?? 60 * 60 * 1000; // 1-hour windows
  }

  private buildBucketKey(dateKey: string, hoodId: number, cityId: string, eventType: string, windowStartMs: number): string {
    return `${dateKey}:${cityId}:${hoodId}:${eventType}:${windowStartMs}`;
  }

  public aggregateEvent(event: TelemetryEventPayload): void {
    const hoodId = event.hoodId || 0;
    const cityId = event.cityId || 'national';
    const dateKey = event.provenance.tehranDateKey;
    const windowStartMs = Math.floor(event.provenance.ingestedAtMs / this.windowDurationMs) * this.windowDurationMs;
    const bucketKey = this.buildBucketKey(dateKey, hoodId, cityId, event.eventName, windowStartMs);

    let bucket = this.aggregationBuckets.get(bucketKey);
    if (!bucket) {
      // Memory boundary guard: prevent unbounded aggregation maps (max 2,000 active buckets)
      if (this.aggregationBuckets.size >= 2000) {
        const oldestKey = this.aggregationBuckets.keys().next().value;
        if (oldestKey !== undefined) this.aggregationBuckets.delete(oldestKey);
      }

      bucket = {
        windowStartMs,
        windowEndMs: windowStartMs + this.windowDurationMs,
        dateKey,
        hoodId,
        cityId,
        eventType: event.eventName,
        eventsCount: 0,
        sessions: new Set<string>(),
        metricsValues: new Map<string, number[]>(),
      };
      this.aggregationBuckets.set(bucketKey, bucket);
    }

    bucket.eventsCount += 1;
    if (bucket.sessions.size < 200) {
      bucket.sessions.add(event.sessionHash);
    }

    for (const [metricKey, metricVal] of Object.entries(event.numericMetrics)) {
      let list = bucket.metricsValues.get(metricKey);
      if (!list) {
        list = [];
        bucket.metricsValues.set(metricKey, list);
      }
      if (list.length < 500) {
        list.push(metricVal);
      }
    }
  }

  public aggregateBatch(events: readonly TelemetryEventPayload[]): number {
    let count = 0;
    for (const ev of events) {
      this.aggregateEvent(ev);
      count += 1;
    }
    return count;
  }

  /**
   * Generates public/reporting safe snapshots with k-anonymity guarantees.
   */
  public generateSnapshots(): AggregationWindowBucket[] {
    const snapshots: AggregationWindowBucket[] = [];

    for (const bucket of this.aggregationBuckets.values()) {
      const distinctSessionsCount = bucket.sessions.size;
      const isKAnonymityPreserved = distinctSessionsCount >= this.kAnonymityThreshold;

      const sumMetrics: Record<string, number> = {};
      const avgMetrics: Record<string, number> = {};
      const p50Metrics: Record<string, number> = {};
      const p95Metrics: Record<string, number> = {};

      for (const [k, values] of bucket.metricsValues.entries()) {
        if (!isKAnonymityPreserved) {
          // If k-anonymity threshold not met, redact sensitive aggregates
          sumMetrics[k] = 0;
          avgMetrics[k] = 0;
          continue;
        }

        const sum = values.reduce((acc, v) => acc + v, 0);
        const avg = values.length > 0 ? sum / values.length : 0;
        sumMetrics[k] = Math.round(sum * 100) / 100;
        avgMetrics[k] = Math.round(avg * 100) / 100;

        const sorted = [...values].sort((a, b) => a - b);
        const p50Idx = Math.floor(sorted.length * 0.5);
        const p95Idx = Math.floor(sorted.length * 0.95);
        p50Metrics[k] = sorted[p50Idx] ?? 0;
        p95Metrics[k] = sorted[p95Idx] ?? 0;
      }

      snapshots.push({
        windowStartMs: bucket.windowStartMs,
        windowEndMs: bucket.windowEndMs,
        dateKey: bucket.dateKey,
        hoodId: bucket.hoodId,
        cityId: bucket.cityId,
        eventType: bucket.eventType,
        totalEvents: bucket.eventsCount,
        distinctSessionsCount,
        sumMetrics,
        avgMetrics,
        p50Metrics: isKAnonymityPreserved ? p50Metrics : undefined,
        p95Metrics: isKAnonymityPreserved ? p95Metrics : undefined,
        isKAnonymityPreserved,
      });
    }

    return snapshots;
  }

  public clear(): void {
    this.aggregationBuckets.clear();
  }
}
