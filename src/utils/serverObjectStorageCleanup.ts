/**
 * @file src/utils/serverObjectStorageCleanup.ts
 *
 * Retryable Object Storage deletion state machine and pending-delete recovery.
 *
 * This module: * - never authenticates HTTP requests; * - never decides whether a user is an admin; * - never deletes an arbitrary object ID supplied by the client; * - only acts on a validated record already present in the server index; * - requires an explicit association policy; * - persists pending deletion before destructive I/O;
 * - retains retryable records after a failure.
 */
import type { StoredObjectRecord } from './serverObjectStorageHelpers'; import { isSafeStoredObjectRecord } from './serverObjectStorageHelpers'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; const inFlightObjectDeletes = new Set<string>(); export type StoredObjectCleanupFailure = | 'object_not_found' | 'association_mismatch' | 'invalid_record'
  | 'already_in_progress' | 'index_persist_failed' | 'remote_delete_failed' | 'local_delete_failed'; export type StoredObjectCleanupResult = | { status: 'deleted'; objectId: string } | { status: 'failed'; objectId: string; reason: StoredObjectCleanupFailure; retryable: boolean }; export type BargainCleanupStatus = 'completed' | 'partial' | 'no_associated_objects'; export interface BargainCleanupSummary { status: BargainCleanupStatus; bargainId: string; candidateCount: number; deletedCount: number; failedCount: number; deletedIds: string[];
  failures: Array<{ objectId: string; reason: StoredObjectCleanupFailure; retryable: boolean }>; displayAreaUnitLabel?: string; referenceValuationIntlText?: string; }
export interface ObjectStorageCleanupDependencies { records: StoredObjectRecord[]; persistIndex: () => Promise<void>; deleteRemote: (record: Readonly<StoredObjectRecord>) => Promise<boolean>; deleteLocal: (record: Readonly<StoredObjectRecord>) => Promise<void>; isSafeRecord?: (value: unknown) => value is StoredObjectRecord; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; }
export type AssociationPolicy = | { kind: 'bargain'; bargainId: string }
  | { kind: 'unattached_only' }; function failure(objectId: string, reason: StoredObjectCleanupFailure): StoredObjectCleanupResult { return { status: 'failed', objectId, reason, retryable: reason !== 'association_mismatch' && reason !== 'invalid_record', };
}
function associationMatches(record: StoredObjectRecord, policy: AssociationPolicy): boolean { return policy.kind === 'bargain' ? record.bargainId === policy.bargainId : !record.bargainId; }
async function deleteStoredObjectWithRetryUnlocked( objectId: string, policy: AssociationPolicy, deps: ObjectStorageCleanupDependencies,
): Promise<StoredObjectCleanupResult> { const safeObjectId = typeof objectId === 'string' && /^obj-\d{10,16}-[a-f0-9]{8}$/i.test(objectId); if (!safeObjectId) return failure(objectId, 'invalid_record');
  const isSafeRecord = deps.isSafeRecord ?? isSafeStoredObjectRecord;
  const record = deps.records.find((item) => item.id === objectId);
  if (!record) return failure(objectId, 'object_not_found');
  if (!isSafeRecord(record)) return failure(objectId, 'invalid_record');
  if (!associationMatches(record, policy)) return failure(objectId, 'association_mismatch');
  const originalId = record.id;
  if (!originalId || originalId !== objectId) return failure(objectId, 'invalid_record');
  /* Phase 1: durably record deletion intent before destructive I/O. */
  const previousDeletionState = record.deletionState;
  record.deletionState = 'pending_delete';
  try {
    await deps.persistIndex();
  } catch {
    record.deletionState = previousDeletionState;
    return failure(objectId, 'index_persist_failed');
  }
  /* Phase 2: delete the remote copy if the index records one. */
  if (record.remoteS3Synced) {
    let remoteDeleted = false;
    try { remoteDeleted = await deps.deleteRemote(record); } catch { remoteDeleted = false; }
    if (!remoteDeleted) return failure(objectId, 'remote_delete_failed');
    const previousRemoteState = record.remoteS3Synced;
    record.remoteS3Synced = false;
    try {
      await deps.persistIndex();
    } catch {
      record.remoteS3Synced = previousRemoteState;
      return failure(objectId, 'index_persist_failed');
    }
  }
  /* Phase 3: delete the local copy (ENOENT is treated as success). */
  try {
    await deps.deleteLocal(record);
  } catch {
    return failure(objectId, 'local_delete_failed');
  }
  /* Phase 4: remove the record from the in-memory index, then persist. */
  const finalIndex = deps.records.findIndex((item) => item.id === objectId);
  if (finalIndex < 0) return { status: 'deleted', objectId };
  const currentRecord = deps.records[finalIndex];
  if (!associationMatches(currentRecord, policy)) return failure(objectId, 'association_mismatch');
  const removed = deps.records.splice(finalIndex, 1)[0];
  try {
    await deps.persistIndex();
  } catch {
    deps.records.splice(Math.min(finalIndex, deps.records.length), 0, removed);
    return failure(objectId, 'index_persist_failed');
  }
  return { status: 'deleted', objectId };
}
export async function deleteStoredObjectWithRetry(
  objectId: string,
  policy: AssociationPolicy,
  deps: ObjectStorageCleanupDependencies,
): Promise<StoredObjectCleanupResult> {
  const safeObjectId = typeof objectId === 'string' && /^obj-\d{10,16}-[a-f0-9]{8}$/i.test(objectId);
  if (!safeObjectId) return failure(objectId, 'invalid_record');
  if (inFlightObjectDeletes.has(objectId)) return failure(objectId, 'already_in_progress');
  inFlightObjectDeletes.add(objectId);
  try {
    return await deleteStoredObjectWithRetryUnlocked(objectId, policy, deps);
  } finally {
    inFlightObjectDeletes.delete(objectId);
  }
}
export async function cleanupBargainObjects(
  bargainId: string,
  deps: ObjectStorageCleanupDependencies,
): Promise<BargainCleanupSummary> {
  const displayAreaUnitLabel = formatAreaUnitLabel(deps.areaUnit ?? 'sqm');
  const referenceValuationIntlText = formatMillionTomanAsIntlCurrency(120, deps.intlCurrency ?? 'USD', 'en');
  if (typeof bargainId !== 'string' || !/^[A-Za-z0-9_-]{10,128}$/.test(bargainId)) {
    return {
      status: 'partial',
      bargainId,
      candidateCount: 0,
      deletedCount: 0,
      failedCount: 1,
      deletedIds: [],
      failures: [{ objectId: '', reason: 'invalid_record', retryable: false }],
      displayAreaUnitLabel,
      referenceValuationIntlText,
    };
  }
  const candidateIds = Array.from(new Set(deps.records.filter((record) => record.bargainId === bargainId).map((record) => record.id)));
  if (candidateIds.length === 0) {
    return {
      status: 'no_associated_objects',
      bargainId,
      candidateCount: 0,
      deletedCount: 0,
      failedCount: 0,
      deletedIds: [],
      failures: [],
      displayAreaUnitLabel,
      referenceValuationIntlText,
    };
  }
  const deletedIds: string[] = [];
  const failures: BargainCleanupSummary['failures'] = [];
  for (const objectId of candidateIds) {
    const result = await deleteStoredObjectWithRetry(objectId, { kind: 'bargain', bargainId }, deps);
    if (result.status === 'deleted') {
      deletedIds.push(result.objectId);
      continue;
    }
    failures.push({ objectId: result.objectId, reason: result.reason, retryable: result.retryable });
  }
  const deletedCount = deletedIds.length;
  const failedCount = failures.length;
  return {
    status: failedCount === 0 ? 'completed' : 'partial',
    bargainId,
    candidateCount: candidateIds.length,
    deletedCount,
    failedCount,
    deletedIds,
    failures,
    displayAreaUnitLabel,
    referenceValuationIntlText,
  };
}
export interface PendingDeleteFirestoreState {
  bargainExists: boolean;
  ownerExists: boolean;
}
export type PendingDeleteRecoveryDecision =
  | { action: 'skip_not_pending'; objectId: string }
  | { action: 'retry_delete'; objectId: string; policy: AssociationPolicy }
  | {
      action: 'blocked';
      objectId: string;
      reason: 'invalid_record' | 'missing_firestore_state' | 'bargain_still_exists' | 'owner_still_exists';
    };
export function decidePendingDeleteRecovery(
  record: unknown,
  firestoreState?: PendingDeleteFirestoreState,
  isSafeRecord: (value: unknown) => value is StoredObjectRecord = isSafeStoredObjectRecord,
): PendingDeleteRecoveryDecision {
  const fallbackObjectId =
    record !== null && typeof record === 'object' && 'id' in record && typeof (record as { id?: unknown }).id === 'string'
      ? (record as { id: string }).id
      : '';
  if (!isSafeRecord(record)) return { action: 'blocked', objectId: fallbackObjectId, reason: 'invalid_record' };
  if (record.deletionState !== 'pending_delete') return { action: 'skip_not_pending', objectId: record.id };
  if (!record.bargainId) return { action: 'retry_delete', objectId: record.id, policy: { kind: 'unattached_only' } };
  if (!firestoreState) return { action: 'blocked', objectId: record.id, reason: 'missing_firestore_state' };
  if (firestoreState.bargainExists) return { action: 'blocked', objectId: record.id, reason: 'bargain_still_exists' };
  if (firestoreState.ownerExists) return { action: 'blocked', objectId: record.id, reason: 'owner_still_exists' };
  return { action: 'retry_delete', objectId: record.id, policy: { kind: 'bargain', bargainId: record.bargainId } };
}
export interface ObjectStorageRecoveryEvent {
  objectId: string;
  outcome: 'deleted' | 'failed' | 'blocked';
  reason?: string;
  retryable?: boolean; } export function describeRecoveryEvent(
  event: ObjectStorageRecoveryEvent, ): string { const id = event.objectId || 'unknown-object'; if (event.outcome === 'deleted') {
    return `تکمیل حذف معوق رسانه (${id}).`;
  } if (event.outcome === 'blocked') {
    return `حذف معوق رسانه (${id}) متوقف ماند: ${event.reason ?? 'unknown'}.`;
  } return (
    `تلاش مجدد حذف رسانه (${id}) کامل نشد: ` +
    `${event.reason ?? 'unknown'} ` +
    `(قابل تلاش مجدد: ${event.retryable ? 'بله' : 'خیر'}).`
  ); }