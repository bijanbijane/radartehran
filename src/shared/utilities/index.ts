/** @file src/shared/utilities/index.ts — Pure Shared Formatting & Validation Utilities */
export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function formatPersianCount(value: number): string {
  if (!Number.isFinite(value)) return '۰';
  return new Intl.NumberFormat('fa-IR').format(value);
}

export function generateCorrelationId(prefix = 'corr'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export function truncateUtf8Safe(input: string, maxBytes = 2048): string {
  const text = String(input ?? '');
  if (text.length * 4 <= maxBytes) return text;
  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  if (!encoder) return text.slice(0, Math.floor(maxBytes / 2));
  const encoded = encoder.encode(text);
  if (encoded.byteLength <= maxBytes) return text;
  const sliced = encoded.slice(0, maxBytes);
  return new TextDecoder('utf-8', { fatal: false }).decode(sliced);
}
