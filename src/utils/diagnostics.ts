/**
 * Enterprise Diagnostic Telemetry & Performance Instrumentation
 * Extracted from src/utils/security.ts to keep utility modules focused and under 450 lines.
 */

import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './areaUnit';

export interface DiagnosticEventEntry {
  /** Unique event ID. */
  id: string;
  /** High-resolution timestamp in milliseconds. */
  timestampMs: number;
  /** Subsystem or module name (e.g., 'Storage', 'API', 'Map', 'Validation'). */
  scope: string;
  /** Action or event description. */
  action: string;
  /** Optional duration in milliseconds if measured by `createExecutionTimer`. */
  durationMs?: number;
  /** Whether the operation succeeded or triggered a fallback. */
  outcome: 'success' | 'fallback' | 'blocked';
  displayAreaUnitLabel?: string;
  referenceValuationIntlText?: string;
}

const MAX_DIAGNOSTIC_EVENTS = 100;
const diagnosticEventRingBuffer: DiagnosticEventEntry[] = [];
const SENSITIVE_DIAG_KEY_RE = /password|secret|token|apikey|api_key|authorization|cookie|privatekey|phone|mobile|nationalid/i;
type DiagnosticSubscriber = (entry: DiagnosticEventEntry, snapshots: readonly DiagnosticEventEntry[]) => void;
const diagnosticSubscribers = new Set<DiagnosticSubscriber>();

export function subscribeDiagnostics(subscriber: DiagnosticSubscriber): () => void {
  diagnosticSubscribers.add(subscriber);
  return () => {
    diagnosticSubscribers.delete(subscriber);
  };
}

export function clearDiagnosticEvents(): void {
  diagnosticEventRingBuffer.length = 0;
  try {
    for (const sub of diagnosticSubscribers) {
      sub({ id: 'cleared', timestampMs: Date.now(), scope: 'Diagnostics', action: 'bufferCleared', outcome: 'success' }, []);
    }
  } catch {
    /* never throw */
  }
}

export interface PerformanceMetricSummary {
  count: number;
  latestDurationMs: number | null;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  p95DurationMs: number;
  actions: Record<string, { count: number; avgMs: number; latestMs: number }>;
}

export function getDiagnosticPerformanceMetrics(targetScope?: string): PerformanceMetricSummary {
  const all = getDiagnosticSnapshots();
  const filtered = targetScope
    ? all.filter((e) => e.scope.toLowerCase() === targetScope.toLowerCase() && typeof e.durationMs === 'number')
    : all.filter((e) => typeof e.durationMs === 'number');

  if (filtered.length === 0) {
    return {
      count: 0,
      latestDurationMs: null,
      avgDurationMs: 0,
      minDurationMs: 0,
      maxDurationMs: 0,
      p95DurationMs: 0,
      actions: {},
    };
  }

  const durations = filtered.map((e) => e.durationMs as number);
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = durations.reduce((acc, d) => acc + d, 0);
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));

  const actions: Record<string, { count: number; avgMs: number; latestMs: number; sumMs: number }> = {};
  for (const item of filtered) {
    const act = item.action;
    const dur = item.durationMs as number;
    if (!actions[act]) {
      actions[act] = { count: 1, sumMs: dur, latestMs: dur, avgMs: dur };
    } else {
      actions[act].count += 1;
      actions[act].sumMs += dur;
      actions[act].avgMs = Math.round((actions[act].sumMs / actions[act].count) * 100) / 100;
    }
  }

  const cleanActions: Record<string, { count: number; avgMs: number; latestMs: number }> = {};
  for (const [k, v] of Object.entries(actions)) {
    cleanActions[k] = { count: v.count, avgMs: v.avgMs, latestMs: v.latestMs };
  }

  return {
    count: filtered.length,
    latestDurationMs: filtered[0].durationMs ?? null,
    avgDurationMs: Math.round((sum / durations.length) * 100) / 100,
    minDurationMs: Math.round(sorted[0] * 100) / 100,
    maxDurationMs: Math.round(sorted[sorted.length - 1] * 100) / 100,
    p95DurationMs: Math.round(sorted[p95Index] * 100) / 100,
    actions: cleanActions,
  };
}

export function redactDiagnosticText(raw: string): string {
  return String(raw || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]')
    .replace(/\b(?:\+98|0098|0)?9\d{9}\b/g, '[REDACTED_PHONE]')
    .trim();
}

function sanitizeDiagnosticMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (SENSITIVE_DIAG_KEY_RE.test(k)) {
      clean[k] = '[REDACTED]';
    } else if (typeof v === 'string') {
      clean[k] = redactDiagnosticText(v).slice(0, 80);
    } else if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * Records a lightweight diagnostic event into the in-memory ring buffer without console noise.
 */
export function recordDiagnosticEvent(
  scope: string,
  action: string,
  outcome: 'success' | 'fallback' | 'blocked' = 'success',
  durationMs?: number
): void {
  try {
    const entry: DiagnosticEventEntry = {
      id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestampMs: Date.now(),
      scope: redactDiagnosticText(scope || 'Core').slice(0, 40),
      action: redactDiagnosticText(action || 'op').slice(0, 140),
      durationMs: typeof durationMs === 'number' && Number.isFinite(durationMs) ? Math.round(durationMs * 100) / 100 : undefined,
      outcome,
      displayAreaUnitLabel: formatAreaUnitLabel(getStoredAreaUnit()),
      referenceValuationIntlText: formatMillionTomanAsIntlCurrency(10000, getStoredIntlCurrency()),
    };
    diagnosticEventRingBuffer.unshift(entry);
    if (diagnosticEventRingBuffer.length > MAX_DIAGNOSTIC_EVENTS) {
      diagnosticEventRingBuffer.length = MAX_DIAGNOSTIC_EVENTS;
    }
    const currentSnapshots = [...diagnosticEventRingBuffer];
    const notifySubscribers = () => {
      for (const sub of diagnosticSubscribers) {
        try {
          sub(entry, currentSnapshots);
        } catch {
          /* ignore subscriber failure */
        }
      }
    };
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(notifySubscribers);
    } else {
      setTimeout(notifySubscribers, 0);
    }
  } catch {
    // Never throw from diagnostic ring buffer
  }
}

/**
 * Returns a read-only snapshot of recent diagnostic telemetry events.
 */
export function getDiagnosticSnapshots(): readonly DiagnosticEventEntry[] {
  try {
    return [...diagnosticEventRingBuffer];
  } catch {
    return [];
  }
}

/**
 * Creates a high-resolution execution timer for profiling synchronous or asynchronous operations.
 */
export function createExecutionTimer(
  scope: string,
  action: string
): (outcome?: 'success' | 'fallback' | 'blocked') => number {
  const startMs =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  return (outcome: 'success' | 'fallback' | 'blocked' = 'success'): number => {
    let elapsed = 0;
    try {
      const endMs =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      elapsed = Math.max(0, endMs - startMs);
      recordDiagnosticEvent(scope, action, outcome, elapsed);
    } catch {
      elapsed = 0;
    }
    return elapsed;
  };
}

/**
 * Structured diagnostic logger compatible with FeatureErrorBoundary and runtime telemetry.
 */
export function logDiag(
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string,
  meta?: Record<string, unknown>
): void {
  const outcome: 'success' | 'fallback' | 'blocked' =
    level === 'ERROR' ? 'blocked' : level === 'WARN' ? 'fallback' : 'success';
  const safeMeta = sanitizeDiagnosticMeta(meta);
  const detail = safeMeta ? `${message} ${JSON.stringify(safeMeta).slice(0, 80)}` : message;
  recordDiagnosticEvent(level, detail, outcome);
}

