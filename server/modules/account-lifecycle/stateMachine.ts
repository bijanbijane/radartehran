/**
 * Canonical account deletion job state machine (RT-ACCOUNT-LIFECYCLE-WORKERS-001 — Phase A).
 * Validates legal transitions; orchestrator must not skip phases.
 */

import type { AccountDeletionJobState } from './types.ts';
import { AccountLifecycleError } from './types.ts';

/** Operator-facing aliases aligned with RT-ACCOUNT-LIFECYCLE-WORKERS-001 §5 */
export const CANONICAL_JOB_STATE_ALIASES: Readonly<Record<string, AccountDeletionJobState>> = {
  INITIATED: 'INITIATED_WRITE_BLOCKED',
  WRITE_BLOCKED: 'INITIATED_WRITE_BLOCKED',
  PURGING_DEPENDENT_RECORDS: 'PURGING_DEPENDENT_RECORDS',
  CLEANING_MEDIA: 'CLEANING_UP_MEDIA',
  APPLYING_RETENTION_POLICIES: 'APPLYING_RETENTION_POLICIES',
  DELETING_AUTH_IDENTITY: 'DELETING_AUTH_IDENTITY',
  PARTIAL_FAILURE_RETRYABLE: 'PARTIAL_FAILURE_RETRYABLE',
  COMPLETED: 'COMPLETED',
  FAILED_TERMINAL: 'FAILED_TERMINAL',
  BLOCKED_MANUAL_REVIEW: 'BLOCKED_MANUAL_REVIEW',
  CANCELLED: 'CANCELLED',
};

const TERMINAL_STATES: ReadonlySet<AccountDeletionJobState> = new Set([
  'COMPLETED',
  'FAILED_TERMINAL',
  'BLOCKED_MANUAL_REVIEW',
  'CANCELLED',
]);

/**
 * Allowed transitions. Key = current state; value = set of next states.
 * Self-transitions are permitted while staying in the same phase during batch work.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<AccountDeletionJobState, ReadonlySet<AccountDeletionJobState>>> = {
  INITIATED_WRITE_BLOCKED: new Set([
    'INITIATED_WRITE_BLOCKED',
    'PURGING_DEPENDENT_RECORDS',
    'PARTIAL_FAILURE_RETRYABLE',
    'BLOCKED_MANUAL_REVIEW',
    'CANCELLED',
  ]),
  PURGING_DEPENDENT_RECORDS: new Set([
    'PURGING_DEPENDENT_RECORDS',
    'CLEANING_UP_MEDIA',
    'PARTIAL_FAILURE_RETRYABLE',
    'BLOCKED_MANUAL_REVIEW',
    'FAILED_TERMINAL',
  ]),
  CLEANING_UP_MEDIA: new Set([
    'CLEANING_UP_MEDIA',
    'APPLYING_RETENTION_POLICIES',
    'PARTIAL_FAILURE_RETRYABLE',
    'BLOCKED_MANUAL_REVIEW',
    'FAILED_TERMINAL',
  ]),
  APPLYING_RETENTION_POLICIES: new Set([
    'APPLYING_RETENTION_POLICIES',
    'DELETING_AUTH_IDENTITY',
    'PARTIAL_FAILURE_RETRYABLE',
    'BLOCKED_MANUAL_REVIEW',
    'FAILED_TERMINAL',
  ]),
  DELETING_AUTH_IDENTITY: new Set([
    'DELETING_AUTH_IDENTITY',
    'COMPLETED',
    'PARTIAL_FAILURE_RETRYABLE',
    'FAILED_TERMINAL',
    'BLOCKED_MANUAL_REVIEW',
  ]),
  PARTIAL_FAILURE_RETRYABLE: new Set([
    'PURGING_DEPENDENT_RECORDS',
    'CLEANING_UP_MEDIA',
    'APPLYING_RETENTION_POLICIES',
    'DELETING_AUTH_IDENTITY',
    'BLOCKED_MANUAL_REVIEW',
    'FAILED_TERMINAL',
    'CANCELLED',
  ]),
  COMPLETED: new Set(['COMPLETED']),
  FAILED_TERMINAL: new Set(['FAILED_TERMINAL']),
  BLOCKED_MANUAL_REVIEW: new Set(['BLOCKED_MANUAL_REVIEW', 'PARTIAL_FAILURE_RETRYABLE', 'CANCELLED']),
  CANCELLED: new Set(['CANCELLED']),
};

export function normalizeCanonicalJobState(
  state: AccountDeletionJobState | keyof typeof CANONICAL_JOB_STATE_ALIASES,
): AccountDeletionJobState {
  if (state in CANONICAL_JOB_STATE_ALIASES) {
    return CANONICAL_JOB_STATE_ALIASES[state as keyof typeof CANONICAL_JOB_STATE_ALIASES];
  }
  return state as AccountDeletionJobState;
}

export function assertValidAccountDeletionStateTransition(
  from: AccountDeletionJobState,
  to: AccountDeletionJobState,
): void {
  const normalizedFrom = normalizeCanonicalJobState(from);
  const normalizedTo = normalizeCanonicalJobState(to);
  const allowed = ALLOWED_TRANSITIONS[normalizedFrom];
  if (!allowed?.has(normalizedTo)) {
    throw new AccountLifecycleError(
      'INVALID_PAGINATION_OPTIONS',
      `Illegal account deletion state transition: ${normalizedFrom} -> ${normalizedTo}.`,
      409,
    );
  }
}

export function isTerminalAccountDeletionState(state: AccountDeletionJobState): boolean {
  return TERMINAL_STATES.has(normalizeCanonicalJobState(state));
}

export function assertJobStateAllowsAuthDeletion(state: AccountDeletionJobState): void {
  const normalized = normalizeCanonicalJobState(state);
  if (normalized !== 'DELETING_AUTH_IDENTITY' && normalized !== 'PARTIAL_FAILURE_RETRYABLE') {
    throw new AccountLifecycleError(
      'AUTH_DELETION_PRECONDITION_FAILED',
      `Firebase Auth deletion is only allowed in DELETING_AUTH_IDENTITY (current: ${normalized}).`,
      409,
    );
  }
}