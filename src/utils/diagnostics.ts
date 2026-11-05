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

const MAX_DIAGNOSTIC_EVENTS = 50;
const diagnosticEventRingBuffer: DiagnosticEventEntry[] = [];
const SENSITIVE_DIAG_KEY_RE = /password|secret|token|apikey|api_key|authorization|cookie|privatekey|phone|mobile|nationalid/i;

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
    diagnosticEventRingBuffer.unshift({
      id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestampMs: Date.now(),
      scope: redactDiagnosticText(scope || 'Core').slice(0, 40),
      action: redactDiagnosticText(action || 'op').slice(0, 140),
      durationMs: typeof durationMs === 'number' && Number.isFinite(durationMs) ? Math.round(durationMs * 100) / 100 : undefined,
      outcome,
      displayAreaUnitLabel: formatAreaUnitLabel(getStoredAreaUnit()),
      referenceValuationIntlText: formatMillionTomanAsIntlCurrency(10000, getStoredIntlCurrency()),
    });
  } catch {
    // Never throw from diagnostic ring buffer
  } finally {
    if (diagnosticEventRingBuffer.length > MAX_DIAGNOSTIC_EVENTS) {
      diagnosticEventRingBuffer.length = MAX_DIAGNOSTIC_EVENTS;
    }
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

