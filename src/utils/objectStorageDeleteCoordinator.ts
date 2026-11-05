import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type DeletePhase = "active" | "pending_delete" | "remote_deleted" | "local_cleanup_pending" | "deleted" | "delete_failed";
export interface DeleteRecord { id: string; objectKey: string; localFileName: string; ownerUid?: string; bargainId?: string; deletionState?: DeletePhase; remoteS3Synced: boolean; }
export interface DeleteOperationResult { ok: boolean; objectId: string; state: DeletePhase; retryable: boolean; errorCode?: string; displayAreaUnitLabel?: string; referenceValuationIntlText?: string; }
export interface DeleteDependencies { readRecord(id: string): Promise<DeleteRecord | null>; persistRecord(record: DeleteRecord): Promise<void>; deleteRemote(record: DeleteRecord): Promise<void>; deleteLocal(record: DeleteRecord): Promise<void>; isBargainEligibleForDeletion(bargainId: string): Promise<boolean>; }
export interface DeleteOptions { expectedBargainId?: string; allowUnattached?: boolean; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; referenceValuationMillionToman?: number; }
const VALID_DELETE_PHASES: ReadonlySet<DeletePhase> = new Set<DeletePhase>(["active", "pending_delete", "remote_deleted", "local_cleanup_pending", "deleted", "delete_failed"]);
export function isValidDeletePhase(value: unknown): value is DeletePhase { return typeof value === "string" && VALID_DELETE_PHASES.has(value as DeletePhase); }
export function normalizeLegacyDeletionState(value: unknown): DeletePhase { if (value === undefined || value === null) return "active"; return isValidDeletePhase(value) ? value : "active"; }
const activeObjectDeleteLocks = new Map<string, Promise<unknown>>();
export async function withObjectDeleteLock<T>(objectId: string, operation: () => Promise<T>): Promise<T> {
  const previous = activeObjectDeleteLocks.get(objectId) ?? Promise.resolve();
  let releaseLock!: () => void;
  const currentGate = new Promise<void>((resolve) => { releaseLock = resolve; });
  const chained = previous.then(() => currentGate, () => currentGate);
  activeObjectDeleteLocks.set(objectId, chained);
  await previous.catch(() => undefined);
  try { return await operation(); } finally {
    releaseLock();
    if (activeObjectDeleteLocks.get(objectId) === chained) activeObjectDeleteLocks.delete(objectId);
  }
}
function makeResult(objectId: string, state: DeletePhase, retryable: boolean, errorCode?: string, options?: DeleteOptions): DeleteOperationResult {
  return {
    ok: state === "deleted",
    objectId,
    state,
    retryable,
    ...(errorCode ? { errorCode } : {}),
    displayAreaUnitLabel: formatAreaUnitLabel(options?.areaUnit ?? 'sqm'),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(options?.referenceValuationMillionToman ?? 0, options?.intlCurrency ?? 'USD', 'en'),
  };
}
function isValidObjectId(id: string): boolean {
  return typeof id === "string" && id.length >= 1 && id.length <= 200 && /^[a-zA-Z0-9_-]+$/.test(id);
}
function hasExpectedAssociation(record: DeleteRecord, options: DeleteOptions): boolean {
  if (options.expectedBargainId !== undefined) return record.bargainId === options.expectedBargainId;
  if (record.bargainId) return false;
  return options.allowUnattached === true;
}
function isRetryableInfrastructureError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { retryable?: unknown; code?: unknown; status?: unknown; statusCode?: unknown };
  if (candidate.retryable === true || candidate.status === 429 || candidate.status === 503 || candidate.statusCode === 429 || candidate.statusCode === 503) return true;
  const retryableCodes = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "SERVICE_UNAVAILABLE", "THROTTLED", "RATE_LIMITED", "INTERNAL"]);
  return typeof candidate.code === "string" && retryableCodes.has(candidate.code.trim().toUpperCase());
}
async function safelyPersistFailure(dependencies: DeleteDependencies, record: DeleteRecord, state: DeletePhase): Promise<void> {
  try { await dependencies.persistRecord({ ...record, deletionState: state }); } catch {}
}
export async function deleteStoredObjectSafely(
  objectId: string,
  dependencies: DeleteDependencies,
  options: DeleteOptions = {}
): Promise<DeleteOperationResult> {
  if (!isValidObjectId(objectId)) {
    return makeResult(objectId, "delete_failed", false, "INVALID_OBJECT_ID", options);
  }
  return withObjectDeleteLock(objectId, async () => {
    let record: DeleteRecord | null;
    try {
      record = await dependencies.readRecord(objectId);
    } catch {
      return makeResult(objectId, "delete_failed", true, "RECORD_READ_FAILED", options);
    }
    if (!record) {
      return makeResult(objectId, "delete_failed", false, "RECORD_NOT_FOUND", options);
    }
    if (record.id !== objectId) {
      return makeResult(objectId, "delete_failed", false, "RECORD_ID_MISMATCH", options);
    }
    if (record.deletionState !== undefined && !isValidDeletePhase(record.deletionState)) {
      return makeResult(objectId, "delete_failed", false, "INVALID_DELETION_STATE", options);
    }
    const normalizedState = normalizeLegacyDeletionState(record.deletionState);
    if (!hasExpectedAssociation(record, options)) {
      return makeResult(objectId, "delete_failed", false, "ASSOCIATION_MISMATCH", options);
    }
    if (record.bargainId) {
      let eligible = false;
      try {
        eligible = await dependencies.isBargainEligibleForDeletion(record.bargainId);
      } catch {
        return makeResult(objectId, "delete_failed", true, "ELIGIBILITY_CHECK_FAILED", options);
      }
      if (!eligible) {
        return makeResult(objectId, "delete_failed", false, "BARGAIN_NOT_ELIGIBLE", options);
      }
    }
    if (normalizedState === "deleted") {
      return makeResult(objectId, "deleted", false, undefined, options);
    }
    if (
      normalizedState !== "remote_deleted" &&
      normalizedState !== "local_cleanup_pending"
    ) {
      const pending: DeleteRecord = {
        ...record,
        deletionState: "pending_delete",
      };
      try {
        await dependencies.persistRecord(pending);
      } catch {
        return makeResult(objectId, "delete_failed", true, "PENDING_STATE_PERSIST_FAILED", options);
      }
      if (record.remoteS3Synced) {
        try {
          await dependencies.deleteRemote(pending);
        } catch (error) {
          await safelyPersistFailure(dependencies, pending, "pending_delete");
          return makeResult(objectId, "pending_delete", isRetryableInfrastructureError(error), "REMOTE_DELETE_FAILED", options);
        }
      }
      const remoteDeleted: DeleteRecord = {
        ...pending,
        remoteS3Synced: false,
        deletionState: "remote_deleted",
      };
      try {
        await dependencies.persistRecord(remoteDeleted);
      } catch {
        return makeResult(objectId, "pending_delete", true, "REMOTE_STATE_PERSIST_FAILED", options);
      }
    }
    let latest: DeleteRecord | null;
    try {
      latest = await dependencies.readRecord(objectId);
    } catch {
      return makeResult(objectId, "remote_deleted", true, "FINAL_ASSOCIATION_READ_FAILED", options);
    }
    if (!latest || latest.id !== objectId) {
      return makeResult(objectId, "remote_deleted", true, "RECORD_CHANGED_DURING_DELETE", options);
    }
    if (
      latest.bargainId !== record.bargainId ||
      !hasExpectedAssociation(latest, options)
    ) {
      return makeResult(objectId, "remote_deleted", false, "ASSOCIATION_CHANGED_DURING_DELETE", options);
    }
    try {
      await dependencies.deleteLocal(latest);
    } catch (error) {
      const localCleanupPending: DeleteRecord = {
        ...latest,
        deletionState: "local_cleanup_pending",
      };
      await safelyPersistFailure(dependencies, localCleanupPending, "local_cleanup_pending");
      return makeResult(objectId, "local_cleanup_pending", isRetryableInfrastructureError(error), "LOCAL_DELETE_FAILED", options);
    }
    const completed: DeleteRecord = {
      ...latest,
      remoteS3Synced: false,
      deletionState: "deleted",
    };
    try {
      await dependencies.persistRecord(completed);
    } catch {
      return makeResult(objectId, "local_cleanup_pending", true, "FINAL_STATE_PERSIST_FAILED", options);
    }
    return makeResult(objectId, "deleted", false, undefined, options);
  });
}