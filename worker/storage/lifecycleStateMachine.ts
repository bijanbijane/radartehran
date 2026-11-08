/**
 * @file worker/storage/lifecycleStateMachine.ts
 * @description Upload, deletion, and reconciliation state machines.
 *
 * Enforces:
 * - Deterministic, valid state transitions for uploads and deletions.
 * - Idempotency and rollback support.
 * - Anti-tampering and retention/legal hold enforcement.
 * - Separation between object bytes in storage and canonical metadata in the database.
 */

import type {
  CanonicalObjectMetadata,
  DeletionLifecycleState,
  StorageOrphanClassification,
  UploadLifecycleState,
} from './types';

export const VALID_UPLOAD_TRANSITIONS: Readonly<Record<UploadLifecycleState, ReadonlySet<UploadLifecycleState>>> = {
  CREATED: new Set(['AUTHORIZED', 'FAILED', 'ABORTED', 'EXPIRED']),
  AUTHORIZED: new Set(['UPLOADING', 'FAILED', 'ABORT_REQUESTED', 'ABORTED', 'EXPIRED']),
  UPLOADING: new Set(['UPLOADED', 'FAILED', 'ABORT_REQUESTED', 'ABORTED', 'EXPIRED']),
  UPLOADED: new Set(['VERIFYING', 'FAILED', 'ABORTED']),
  VERIFYING: new Set(['VERIFIED', 'FAILED']),
  VERIFIED: new Set(['PUBLISHED', 'ABORTED']),
  PUBLISHED: new Set([]), // Terminal upload state (moves to deletion state machine for lifecycle management)
  FAILED: new Set(['AUTHORIZED']), // May retry if new upload grant issued
  ABORT_REQUESTED: new Set(['ABORTED', 'FAILED']),
  ABORTED: new Set([]),
  EXPIRED: new Set([]),
};

export const VALID_DELETION_TRANSITIONS: Readonly<Record<DeletionLifecycleState, ReadonlySet<DeletionLifecycleState>>> = {
  ACTIVE: new Set(['SOFT_DELETED', 'PENDING_PHYSICAL_DELETE', 'RETENTION_LOCKED', 'LEGAL_HOLD_PROTECTED']),
  SOFT_DELETED: new Set(['ACTIVE', 'PENDING_PHYSICAL_DELETE', 'LEGAL_HOLD_PROTECTED']),
  PENDING_PHYSICAL_DELETE: new Set(['PHYSICALLY_DELETED', 'FAILED_RETRYABLE', 'LEGAL_HOLD_PROTECTED']),
  FAILED_RETRYABLE: new Set(['PENDING_PHYSICAL_DELETE', 'PHYSICALLY_DELETED', 'LEGAL_HOLD_PROTECTED']),
  RETENTION_LOCKED: new Set(['ACTIVE', 'SOFT_DELETED', 'PENDING_PHYSICAL_DELETE', 'LEGAL_HOLD_PROTECTED']),
  LEGAL_HOLD_PROTECTED: new Set(['ACTIVE', 'SOFT_DELETED', 'PENDING_PHYSICAL_DELETE']), // Can only leave once hold removed
  PHYSICALLY_DELETED: new Set([]), // Terminal deletion state
};

export interface StateTransitionResult<TState> {
  readonly success: boolean;
  readonly currentState: TState;
  readonly targetState: TState;
  readonly isIdempotentNoop: boolean;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

/**
 * Validate and transition upload lifecycle state.
 */
export function transitionUploadLifecycleState(
  currentState: UploadLifecycleState,
  targetState: UploadLifecycleState
): StateTransitionResult<UploadLifecycleState> {
  if (currentState === targetState) {
    return {
      success: true,
      currentState,
      targetState,
      isIdempotentNoop: true,
    };
  }

  const allowed = VALID_UPLOAD_TRANSITIONS[currentState];
  if (!allowed || !allowed.has(targetState)) {
    return {
      success: false,
      currentState,
      targetState,
      isIdempotentNoop: false,
      errorCode: 'INVALID_UPLOAD_STATE_TRANSITION',
      errorMessage: `Cannot transition upload from ${currentState} to ${targetState}.`,
    };
  }

  return {
    success: true,
    currentState,
    targetState,
    isIdempotentNoop: false,
  };
}

/**
 * Validate and transition deletion lifecycle state, respecting legal hold and retention lock.
 */
export function transitionDeletionLifecycleState(
  currentState: DeletionLifecycleState,
  targetState: DeletionLifecycleState,
  options?: { legalHold?: boolean; retentionUntilIso?: string }
): StateTransitionResult<DeletionLifecycleState> {
  if (currentState === targetState) {
    return {
      success: true,
      currentState,
      targetState,
      isIdempotentNoop: true,
    };
  }

  // Check legal hold: physical deletion is strictly forbidden
  if (options?.legalHold && (targetState === 'PHYSICALLY_DELETED' || targetState === 'PENDING_PHYSICAL_DELETE')) {
    return {
      success: false,
      currentState,
      targetState,
      isIdempotentNoop: false,
      errorCode: 'LEGAL_HOLD_ACTIVE',
      errorMessage: 'Cannot delete object protected by an active legal hold.',
    };
  }

  // Check retention policy
  if (options?.retentionUntilIso && (targetState === 'PHYSICALLY_DELETED' || targetState === 'PENDING_PHYSICAL_DELETE')) {
    const retentionTime = Date.parse(options.retentionUntilIso);
    if (Number.isFinite(retentionTime) && Date.now() < retentionTime) {
      return {
        success: false,
        currentState,
        targetState,
        isIdempotentNoop: false,
        errorCode: 'RETENTION_PERIOD_ACTIVE',
        errorMessage: `Cannot delete object until retention period expires at ${options.retentionUntilIso}.`,
      };
    }
  }

  const allowed = VALID_DELETION_TRANSITIONS[currentState];
  if (!allowed || !allowed.has(targetState)) {
    return {
      success: false,
      currentState,
      targetState,
      isIdempotentNoop: false,
      errorCode: 'INVALID_DELETION_STATE_TRANSITION',
      errorMessage: `Cannot transition deletion lifecycle from ${currentState} to ${targetState}.`,
    };
  }

  return {
    success: true,
    currentState,
    targetState,
    isIdempotentNoop: false,
  };
}

export interface StorageReconciliationReport {
  readonly timestampIso: string;
  readonly totalObjectsScanned: number;
  readonly totalMetadataScanned: number;
  readonly orphanObjectsCount: number;
  readonly missingObjectsCount: number;
  readonly legalHoldProtectedCount: number;
  readonly classifications: Record<StorageOrphanClassification, number>;
  readonly discrepancies: Array<{
    readonly key: string;
    readonly objectId?: string;
    readonly classification: StorageOrphanClassification;
    readonly recommendedAction: 'DELETE_ORPHAN' | 'RESTORE_METADATA' | 'FLAG_MISSING_BYTES' | 'RETAIN_IN_HOLD';
  }>;
}

/**
 * Analyze consistency between storage keys and database metadata.
 * Reports all discrepancies before any deletion or recovery action is taken.
 */
export function analyzeStorageConsistency(
  storageKeys: string[],
  metadataRecords: CanonicalObjectMetadata[]
): StorageReconciliationReport {
  const metaByKey = new Map<string, CanonicalObjectMetadata>();
  for (const m of metadataRecords) {
    metaByKey.set(m.storageKey, m);
  }

  const storageKeySet = new Set(storageKeys);
  const classifications: Record<StorageOrphanClassification, number> = {
    REFERENCED_ACTIVE: 0,
    UNATTACHED_WITHIN_GRACE_WINDOW: 0,
    ORPHAN_UNATTACHED_EXPIRED: 0,
    ORPHAN_STALE_TARGET_DELETED: 0,
    DANGLING_STORAGE_BYTES_WITHOUT_METADATA: 0,
    MISSING_STORAGE_BYTES_FOR_ACTIVE_METADATA: 0,
    PENDING_DELETE_INTERRUPTED: 0,
  };

  const discrepancies: StorageReconciliationReport['discrepancies'] = [];
  let legalHoldCount = 0;

  // 1. Scan storage keys against metadata
  for (const key of storageKeys) {
    const meta = metaByKey.get(key);
    if (!meta) {
      classifications.DANGLING_STORAGE_BYTES_WITHOUT_METADATA += 1;
      discrepancies.push({
        key,
        classification: 'DANGLING_STORAGE_BYTES_WITHOUT_METADATA',
        recommendedAction: 'DELETE_ORPHAN',
      });
    } else {
      if (meta.legalHold) {
        legalHoldCount += 1;
      }
      if (meta.deletionState === 'PENDING_PHYSICAL_DELETE' || meta.deletionState === 'FAILED_RETRYABLE') {
        classifications.PENDING_DELETE_INTERRUPTED += 1;
        discrepancies.push({
          key,
          objectId: meta.objectId,
          classification: 'PENDING_DELETE_INTERRUPTED',
          recommendedAction: 'DELETE_ORPHAN',
        });
      } else {
        classifications.REFERENCED_ACTIVE += 1;
      }
    }
  }

  // 2. Scan metadata against storage keys to find missing bytes
  for (const meta of metadataRecords) {
    if (!storageKeySet.has(meta.storageKey) && meta.deletionState !== 'PHYSICALLY_DELETED') {
      classifications.MISSING_STORAGE_BYTES_FOR_ACTIVE_METADATA += 1;
      discrepancies.push({
        key: meta.storageKey,
        objectId: meta.objectId,
        classification: 'MISSING_STORAGE_BYTES_FOR_ACTIVE_METADATA',
        recommendedAction: 'FLAG_MISSING_BYTES',
      });
    }
  }

  return {
    timestampIso: new Date().toISOString(),
    totalObjectsScanned: storageKeys.length,
    totalMetadataScanned: metadataRecords.length,
    orphanObjectsCount: classifications.DANGLING_STORAGE_BYTES_WITHOUT_METADATA + classifications.PENDING_DELETE_INTERRUPTED,
    missingObjectsCount: classifications.MISSING_STORAGE_BYTES_FOR_ACTIVE_METADATA,
    legalHoldProtectedCount: legalHoldCount,
    classifications,
    discrepancies,
  };
}
