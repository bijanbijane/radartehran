/** @file src/platform/error-handling/recovery/index.ts — Recovery Policy & Retry Backoff Calculator */
import type { NormalizedFrontendError } from '../errorTypes';

export interface ErrorRecoveryPlan {
  readonly shouldRetry: boolean;
  readonly delayMs: number;
  readonly requiresReauth: boolean;
  readonly preserveFormDraft: boolean;
  readonly fallbackAction:
    | 'retry'
    | 'reauth'
    | 'show_locked'
    | 'show_disabled'
    | 'show_forbidden'
    | 'show_not_found'
    | 'manual_reset';
}

export function buildErrorRecoveryPlan(err: NormalizedFrontendError, attempt = 0): ErrorRecoveryPlan {
  if (err.category === 'UNAUTHORIZED_401') {
    return {
      shouldRetry: attempt < 1,
      delayMs: 0,
      requiresReauth: attempt >= 1,
      preserveFormDraft: true,
      fallbackAction: 'reauth',
    };
  }
  if (err.category === 'FORBIDDEN_403') {
    return { shouldRetry: false, delayMs: 0, requiresReauth: false, preserveFormDraft: true, fallbackAction: 'show_forbidden' };
  }
  if (err.category === 'RESOURCE_LOCKED_423') {
    return { shouldRetry: false, delayMs: 0, requiresReauth: false, preserveFormDraft: true, fallbackAction: 'show_locked' };
  }
  if (err.category === 'FEATURE_DISABLED') {
    return { shouldRetry: false, delayMs: 0, requiresReauth: false, preserveFormDraft: true, fallbackAction: 'show_disabled' };
  }
  if (err.category === 'NOT_FOUND_404') {
    return { shouldRetry: false, delayMs: 0, requiresReauth: false, preserveFormDraft: false, fallbackAction: 'show_not_found' };
  }
  if (err.category === 'RATE_LIMITED_429') {
    return {
      shouldRetry: attempt < 2,
      delayMs: err.retryAfterMs ?? 2000 * Math.pow(2, attempt),
      requiresReauth: false,
      preserveFormDraft: true,
      fallbackAction: 'retry',
    };
  }
  if (err.retryable && attempt < 2) {
    return {
      shouldRetry: true,
      delayMs: 400 * Math.pow(2, attempt),
      requiresReauth: false,
      preserveFormDraft: true,
      fallbackAction: 'retry',
    };
  }
  return { shouldRetry: false, delayMs: 0, requiresReauth: false, preserveFormDraft: true, fallbackAction: 'manual_reset' };
}

export function classifyRecoveryStrategy(code: string): {
  canRetry: boolean;
  shouldRedirectToLogin: boolean;
  preserveDraft: boolean;
} {
  const upper = String(code || '').toUpperCase();
  if (upper.includes('AUTH') || upper.includes('401') || upper.includes('EXPIRED')) {
    return { canRetry: false, shouldRedirectToLogin: true, preserveDraft: true };
  }
  if (upper.includes('NETWORK') || upper.includes('TIMEOUT') || upper.includes('5XX') || upper.includes('RATE')) {
    return { canRetry: true, shouldRedirectToLogin: false, preserveDraft: true };
  }
  return { canRetry: false, shouldRedirectToLogin: false, preserveDraft: true };
}
