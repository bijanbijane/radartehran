import type { WorkerEnvironmentName } from '../types';

export interface WorkerRequestTelemetrySample {
  schemaVersion: '2.0-cloudflare-edge';
  correlationId: string;
  environment: WorkerEnvironmentName;
  method: string;
  pathname: string;
  statusCode: number;
  wallTimeMs: number;
  /**
   * Cloudflare Workers do not expose deterministic per-request CPU time inside userland JS
   * unless injected by Trace/Tail consumers. Reported truthfully as null when not measured.
   */
  cpuTimeMs: number | null;
  /**
   * V8 isolate heap usage in bytes when available; never fabricates Node.js RSS (e.g. 38 MB).
   */
  isolateHeapUsedBytes: number | null;
  coldStartFirstRequestInIsolate: boolean;
  cacheStatus: string;
  colo: string;
  recordedAtIso: string;
}

export interface RealEstateDomainEdgeMetrics {
  cityId: string;
  hoodId: number;
  askingPerSqmMillion: number;
  dealPerSqmMillion: number;
  askingVsDealDivergencePct: number;
  inquiryCohortCount: number;
  kAnonymitySatisfied: boolean;
}

let isolateInvocationCounter = 0;
const recentTelemetrySamples: WorkerRequestTelemetrySample[] = [];

export function recordTruthfulWorkerRequestTelemetry(input: {
  correlationId: string;
  environment: WorkerEnvironmentName;
  method: string;
  pathname: string;
  statusCode: number;
  startedAtPerfMs: number;
  finishedAtPerfMs?: number;
  measuredCpuTimeMs?: number | null;
  cacheStatus?: string;
  colo?: string;
}): WorkerRequestTelemetrySample {
  isolateInvocationCounter += 1;
  const isFirstInIsolate = isolateInvocationCounter === 1;
  const endPerf = input.finishedAtPerfMs ?? performance.now();
  const wallTimeMs = Math.max(0, Number((endPerf - input.startedAtPerfMs).toFixed(3)));

  const perfWithMemory = performance as unknown as { memory?: { usedJSHeapSize?: number } };
  const isolateHeapUsedBytes =
    typeof perfWithMemory.memory?.usedJSHeapSize === 'number'
      ? perfWithMemory.memory.usedJSHeapSize
      : null;

  const sample: WorkerRequestTelemetrySample = {
    schemaVersion: '2.0-cloudflare-edge',
    correlationId: input.correlationId,
    environment: input.environment,
    method: input.method.toUpperCase(),
    pathname: scrubPiiFromTelemetryText(input.pathname),
    statusCode: input.statusCode,
    wallTimeMs,
    cpuTimeMs:
      typeof input.measuredCpuTimeMs === 'number' && Number.isFinite(input.measuredCpuTimeMs)
        ? Math.max(0, input.measuredCpuTimeMs)
        : null,
    isolateHeapUsedBytes,
    coldStartFirstRequestInIsolate: isFirstInIsolate,
    cacheStatus: input.cacheStatus || 'BYPASS',
    colo: input.colo || 'LOCAL',
    recordedAtIso: new Date().toISOString(),
  };

  recentTelemetrySamples.unshift(sample);
  if (recentTelemetrySamples.length > 200) {
    recentTelemetrySamples.length = 200;
  }
  return sample;
}

export function scrubPiiFromTelemetryText(raw: string): string {
  return String(raw || '')
    .replace(/\b09\d{9}\b/g, '[REDACTED_IR_PHONE]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED_JWT]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]');
}

export function computeRealEstateDomainEdgeMetrics(params: {
  cityId: string;
  hoodId: number;
  askingPerSqmMillion: number;
  dealPerSqmMillion: number;
  inquiryCohortCount: number;
  minimumKAnonymity?: number;
}): RealEstateDomainEdgeMetrics {
  const minK = params.minimumKAnonymity ?? 5;
  const deal = Math.max(1, params.dealPerSqmMillion);
  const asking = Math.max(1, params.askingPerSqmMillion);
  const divergence = Number((((asking - deal) / deal) * 100).toFixed(2));
  return {
    cityId: params.cityId,
    hoodId: params.hoodId,
    askingPerSqmMillion: asking,
    dealPerSqmMillion: deal,
    askingVsDealDivergencePct: divergence,
    inquiryCohortCount: params.inquiryCohortCount >= minK ? params.inquiryCohortCount : 0,
    kAnonymitySatisfied: params.inquiryCohortCount >= minK,
  };
}

export function summarizeWorkerTelemetryWindow(): {
  sampleCount: number;
  errorCount5xx: number;
  p50WallTimeMs: number;
  p95WallTimeMs: number;
  p99WallTimeMs: number;
  cpuTimeMeasurementNote: string;
  memoryMeasurementNote: string;
} {
  if (recentTelemetrySamples.length === 0) {
    return {
      sampleCount: 0,
      errorCount5xx: 0,
      p50WallTimeMs: 0,
      p95WallTimeMs: 0,
      p99WallTimeMs: 0,
      cpuTimeMeasurementNote: 'measured_via_tail_or_null_in_userland',
      memoryMeasurementNote: 'v8_isolate_heap_only_no_fake_node_rss',
    };
  }
  const errorCount5xx = recentTelemetrySamples.filter((s) => s.statusCode >= 500).length;
  const sorted = recentTelemetrySamples.map((s) => s.wallTimeMs).sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  return {
    sampleCount: sorted.length,
    errorCount5xx,
    p50WallTimeMs: pct(0.5),
    p95WallTimeMs: pct(0.95),
    p99WallTimeMs: pct(0.99),
    cpuTimeMeasurementNote: 'measured_via_tail_or_null_in_userland',
    memoryMeasurementNote: 'v8_isolate_heap_only_no_fake_node_rss',
  };
}
