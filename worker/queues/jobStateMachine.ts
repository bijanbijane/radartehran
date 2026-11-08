/**
 * @file worker/queues/jobStateMachine.ts
 * @description Job lifecycle state machine, retry policy, backoff calculation,
 * and dead-letter classification engine.
 *
 * Enforces:
 * - Deterministic, valid state transitions for background jobs.
 * - Exponential backoff with jitter.
 * - Poison message detection and dead-letter routing.
 * - Non-retryable classification for authorization or permanent validation errors.
 */

import type {
  JobEnvelope,
  JobExecutionRecord,
  JobFailureClassification,
  JobLifecycleState,
} from './types';

export const VALID_JOB_TRANSITIONS: Readonly<Record<JobLifecycleState, ReadonlySet<JobLifecycleState>>> = {
  CREATED: new Set(['VALIDATED', 'FAILED', 'CANCELLED']),
  VALIDATED: new Set(['QUEUED', 'FAILED', 'CANCELLED']),
  QUEUED: new Set(['RUNNING', 'CANCEL_REQUESTED', 'CANCELLED', 'EXPIRED']),
  RUNNING: new Set(['COMPLETED', 'RETRY_PENDING', 'FAILED', 'DEAD_LETTERED', 'CANCEL_REQUESTED']),
  RETRY_PENDING: new Set(['RUNNING', 'CANCELLED', 'DEAD_LETTERED', 'EXPIRED']),
  CANCEL_REQUESTED: new Set(['CANCELLED', 'RUNNING', 'FAILED']),
  COMPLETED: new Set([]), // Terminal
  FAILED: new Set(['QUEUED']), // Terminal unless manually retried by admin
  DEAD_LETTERED: new Set(['QUEUED']), // Terminal unless manually replayed by admin
  CANCELLED: new Set([]), // Terminal
  EXPIRED: new Set([]), // Terminal
};

export interface JobTransitionResult {
  readonly success: boolean;
  readonly currentState: JobLifecycleState;
  readonly targetState: JobLifecycleState;
  readonly isIdempotentNoop: boolean;
  readonly error?: string;
}

export function transitionJobState(
  currentState: JobLifecycleState,
  targetState: JobLifecycleState
): JobTransitionResult {
  if (currentState === targetState) {
    return {
      success: true,
      currentState,
      targetState,
      isIdempotentNoop: true,
    };
  }

  const allowed = VALID_JOB_TRANSITIONS[currentState];
  if (!allowed || !allowed.has(targetState)) {
    return {
      success: false,
      currentState,
      targetState,
      isIdempotentNoop: false,
      error: `INVALID_JOB_STATE_TRANSITION: Cannot transition from ${currentState} to ${targetState}.`,
    };
  }

  return {
    success: true,
    currentState,
    targetState,
    isIdempotentNoop: false,
  };
}

export interface RetryEvaluationResult {
  readonly shouldRetry: boolean;
  readonly targetState: 'RETRY_PENDING' | 'DEAD_LETTERED' | 'FAILED';
  readonly delaySeconds: number;
  readonly isPoisonMessage: boolean;
  readonly reason: string;
}

/**
 * Calculates exponential backoff with jitter and determines whether job should retry
 * or route directly to dead-letter queue.
 */
export function evaluateJobRetry(
  job: JobEnvelope,
  currentAttempts: number,
  failureClass: JobFailureClassification,
  errorMessage: string
): RetryEvaluationResult {
  // 1. Permanent failures must NEVER be retried
  if (
    failureClass === 'PERMANENT_VALIDATION' ||
    failureClass === 'PERMANENT_AUTHORIZATION'
  ) {
    return {
      shouldRetry: false,
      targetState: 'DEAD_LETTERED',
      delaySeconds: 0,
      isPoisonMessage: true,
      reason: `Permanent error (${failureClass}): ${errorMessage}`,
    };
  }

  // 2. Check retry bounds
  const nextAttempt = currentAttempts + 1;
  if (nextAttempt > job.maxAttempts) {
    return {
      shouldRetry: false,
      targetState: 'DEAD_LETTERED',
      delaySeconds: 0,
      isPoisonMessage: false,
      reason: `Exceeded max retry attempts (${job.maxAttempts}). Routing to dead-letter.`,
    };
  }

  // 3. Exponential backoff with jitter: 2^(attempt - 1) * 5s + jitter
  const baseSeconds = Math.min(300, Math.pow(2, currentAttempts - 1) * 5);
  const jitterSeconds = Math.floor(Math.random() * 3);
  const delaySeconds = baseSeconds + jitterSeconds;

  return {
    shouldRetry: true,
    targetState: 'RETRY_PENDING',
    delaySeconds,
    isPoisonMessage: false,
    reason: `Retryable failure (${failureClass}). Attempt ${nextAttempt}/${job.maxAttempts} scheduled in ${delaySeconds}s.`,
  };
}
