export type JournalStatus = | "queued"
  | "running"
  | "remote_delete_pending"
  | "remote_deleted"
  | "local_delete_pending"
  | "completed"
  | "retryable_failure"
  | "permanent_failure"
  | "manual_review"; export type DeletionJournalStatus = JournalStatus; export interface DeletionJournalEntry { operationId: string; objectId: string; objectKey: string; expectedBargainId: string | null; expectedOwnerUid: string | null; status: JournalStatus; attemptCount: number; createdAt: string; updatedAt: string; nextAttemptAt: string | null; leaseOwner: string | null; leaseExpiresAt: string | null; lastErrorCode: string | null; revision: number; } export interface JournalStore { get(operationId: string): Promise<DeletionJournalEntry | null>; create(entry: DeletionJournalEntry): Promise<void>; compareAndSwap(operationId: string, expectedRevision: number, next: DeletionJournalEntry): Promise<boolean>; listRecoverable(limit: number): Promise<DeletionJournalEntry[]>; }
export class JournalConflictError extends Error { constructor(message = "Journal revision conflict") { super(message); this.name = "JournalConflictError"; } }
export class JournalNotFoundError extends Error { constructor() { super("Deletion journal entry not found"); this.name = "JournalNotFoundError"; } }
const TERMINAL_STATUSES = new Set<JournalStatus>(["completed"]); const ALLOWED_TRANSITIONS: Record<JournalStatus, ReadonlySet<JournalStatus>> = {
  queued: new Set(["running", "permanent_failure", "manual_review"]), running: new Set(["remote_delete_pending", "local_delete_pending", "retryable_failure", "permanent_failure", "manual_review"]),
  remote_delete_pending: new Set(["remote_deleted", "retryable_failure", "permanent_failure", "manual_review"]), remote_deleted: new Set(["local_delete_pending", "retryable_failure", "manual_review"]),
  local_delete_pending: new Set(["completed", "retryable_failure", "manual_review"]), retryable_failure: new Set(["running", "remote_delete_pending", "local_delete_pending", "permanent_failure", "manual_review"]), completed: new Set(), permanent_failure: new Set(["manual_review"]),
  manual_review: new Set(["queued", "running"]), }; function isValidOperationId(value: string): boolean { return typeof value === "string" && value.length >= 8 && value.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(value); }
function isValidStatus(value: unknown): value is JournalStatus { return typeof value === "string" && Object.hasOwn(ALLOWED_TRANSITIONS, value); }
export function validateJournalEntry(entry: DeletionJournalEntry): void { if (!isValidOperationId(entry.operationId)) throw new Error("INVALID_OPERATION_ID");
  if (typeof entry.objectId !== "string" || entry.objectId.length < 1 || entry.objectId.length > 200) throw new Error("INVALID_OBJECT_ID"); if (typeof entry.objectKey !== "string" || entry.objectKey.length < 1 || entry.objectKey.length > 1024) throw new Error("INVALID_OBJECT_KEY");
  if (!isValidStatus(entry.status)) throw new Error("INVALID_JOURNAL_STATUS"); if (!Number.isSafeInteger(entry.attemptCount) || entry.attemptCount < 0) throw new Error("INVALID_ATTEMPT_COUNT");
  if (!Number.isSafeInteger(entry.revision) || entry.revision < 0) throw new Error("INVALID_REVISION"); for (const timestamp of [entry.createdAt, entry.updatedAt]) {
    if (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp))) throw new Error("INVALID_TIMESTAMP");
  }
  if (entry.nextAttemptAt !== null && !Number.isFinite(Date.parse(entry.nextAttemptAt))) throw new Error("INVALID_NEXT_ATTEMPT");
  if (entry.leaseExpiresAt !== null && !Number.isFinite(Date.parse(entry.leaseExpiresAt))) throw new Error("INVALID_LEASE_EXPIRY");
}
const validateEntry = validateJournalEntry;
export function createDeletionJournalEntry(input: {
  operationId: string;
  objectId: string;
  objectKey: string;
  bargainId?: string | null;
  ownerUid?: string | null;
  now?: Date;
}): DeletionJournalEntry {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const entry: DeletionJournalEntry = {
    operationId: input.operationId,
    objectId: input.objectId,
    objectKey: input.objectKey,
    expectedBargainId: input.bargainId ?? null,
    expectedOwnerUid: input.ownerUid ?? null,
    status: "queued",
    attemptCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    nextAttemptAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastErrorCode: null,
    revision: 0,
  };
  validateEntry(entry);
  return entry;
}
export async function createJournalOperation(store: JournalStore, entry: DeletionJournalEntry): Promise<void> {
  validateEntry(entry);
  if (entry.status !== "queued") throw new Error("NEW_OPERATION_MUST_BE_QUEUED");
  if (entry.revision !== 0) throw new Error("NEW_OPERATION_REVISION_MUST_BE_ZERO");
  await store.create(entry);
}
export async function transitionJournalOperation(
  store: JournalStore,
  operationId: string,
  expectedRevision: number,
  nextStatus: JournalStatus,
  options: {
    now?: Date;
    errorCode?: string | null;
    nextAttemptAt?: string | null;
    leaseOwner?: string | null;
    leaseExpiresAt?: string | null;
    incrementAttempt?: boolean;
  } = {}
): Promise<DeletionJournalEntry> {
  if (!isValidOperationId(operationId)) {
    throw new Error("INVALID_OPERATION_ID");
  }
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    throw new Error("INVALID_EXPECTED_REVISION");
  }
  const current = await store.get(operationId);
  if (!current) {
    throw new JournalNotFoundError();
  }
  validateEntry(current);
  if (current.revision !== expectedRevision) {
    throw new JournalConflictError();
  }
  if (
    (TERMINAL_STATUSES.has(current.status) ||
      (current.status === "permanent_failure" && nextStatus !== "manual_review")) &&
    current.status !== nextStatus
  ) {
    throw new Error("TERMINAL_STATE_TRANSITION");
  }
  if (
    !ALLOWED_TRANSITIONS[current.status].has(nextStatus) &&
    current.status !== nextStatus
  ) {
    throw new Error(
      `INVALID_TRANSITION:${current.status}->${nextStatus}`
    );
  }
  const now = options.now ?? new Date();
  const clearLease = nextStatus === "completed" || nextStatus === "permanent_failure" || nextStatus === "manual_review";
  const next: DeletionJournalEntry = {
    ...current,
    status: nextStatus,
    updatedAt: now.toISOString(),
    revision: current.revision + 1,
    attemptCount:
      current.attemptCount +
      (options.incrementAttempt ? 1 : 0),
    lastErrorCode:
      options.errorCode === undefined
        ? (nextStatus === "completed" ? null : current.lastErrorCode)
        : options.errorCode,
    nextAttemptAt:
      options.nextAttemptAt === undefined
        ? (clearLease ? null : current.nextAttemptAt)
        : options.nextAttemptAt,
    leaseOwner:
      options.leaseOwner === undefined
        ? (clearLease ? null : current.leaseOwner)
        : options.leaseOwner,
    leaseExpiresAt:
      options.leaseExpiresAt === undefined
        ? (clearLease ? null : current.leaseExpiresAt)
        : options.leaseExpiresAt,
  };
  validateEntry(next);
  const saved = await store.compareAndSwap(
    operationId,
    current.revision,
    next
  );
  if (!saved) {
    throw new JournalConflictError();
  }
  return next;
}
export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
}
export function calculateRetryDelayMs(
  attemptCount: number,
  policy: RetryPolicy,
  random: () => number = Math.random
): number {
  if (
    !Number.isSafeInteger(attemptCount) ||
    attemptCount < 1
  ) {
    throw new Error("INVALID_ATTEMPT_COUNT");
  }
  if (
    !Number.isFinite(policy.baseDelayMs) ||
    policy.baseDelayMs < 0 ||
    !Number.isFinite(policy.maxDelayMs) ||
    policy.maxDelayMs < policy.baseDelayMs ||
    !Number.isSafeInteger(policy.maxAttempts) ||
    policy.maxAttempts < 1 ||
    !Number.isFinite(policy.jitterRatio) ||
    policy.jitterRatio < 0 ||
    policy.jitterRatio > 1
  ) {
    throw new Error("INVALID_RETRY_POLICY");
  }
  if (attemptCount > policy.maxAttempts) {
    throw new Error("MAX_RETRY_ATTEMPTS_EXCEEDED");
  }
  const exponent = Math.min(attemptCount - 1, 30);
  const exponentialDelay = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * 2 ** exponent
  );
  const sample = random();
  if (
    !Number.isFinite(sample) ||
    sample < 0 ||
    sample >= 1
  ) {
    throw new Error("INVALID_RANDOM_SAMPLE");
  }
  const spread = exponentialDelay * policy.jitterRatio;
  const randomized =
    exponentialDelay - spread +
    2 * spread * sample;
  return Math.min(
    policy.maxDelayMs,
    Math.max(0, Math.round(randomized))
  );
}
const RECOVERABLE_JOURNAL_STATUSES = new Set<JournalStatus>([
  "queued",
  "running",
  "remote_delete_pending",
  "remote_deleted",
  "local_delete_pending",
  "retryable_failure",
]);
export class InMemoryJournalStore implements JournalStore {
  private readonly entries = new Map<string, DeletionJournalEntry>();
  async get(id: string): Promise<DeletionJournalEntry | null> {
    const entry = this.entries.get(id);
    return entry ? { ...entry } : null;
  }
  async create(entry: DeletionJournalEntry): Promise<void> {
    validateEntry(entry);
    if (this.entries.has(entry.operationId)) throw new Error("DUPLICATE_OPERATION_ID");
    if (this.entries.size >= 1000) {
      for (const [k, v] of this.entries) { if (v.status === "completed") { this.entries.delete(k); break; } }
      if (this.entries.size >= 1000) { const oldest = this.entries.keys().next().value; if (oldest !== undefined) this.entries.delete(oldest); }
    }
    this.entries.set(entry.operationId, { ...entry });
  }
  async compareAndSwap(id: string, expectedRevision: number, next: DeletionJournalEntry): Promise<boolean> {
    validateEntry(next);
    const current = this.entries.get(id);
    if (!current || current.revision !== expectedRevision) return false;
    this.entries.set(id, { ...next });
    return true;
  }
  async listRecoverable(limit: number): Promise<DeletionJournalEntry[]> {
    const boundedLimit = Number.isSafeInteger(limit) && limit >= 1 ? Math.min(500, limit) : 50;
    return [...this.entries.values()]
      .filter((e) => RECOVERABLE_JOURNAL_STATUSES.has(e.status))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, boundedLimit)
      .map((e) => ({ ...e }));
  }
}
export {
  FileJournalStore,
  FirestoreJournalStore,
  withFileLock,
  isProcessAlive,
  isJournalLeaseActive,
  claimRecoverableJournalOperation,
} from "./serverJournalAdapters";
import path from "node:path";
import { FileJournalStore as DurableFileJournalStore } from "./serverJournalAdapters";
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from "./areaUnit";
const defaultReconciliationJournalStore = new DurableFileJournalStore(path.join(process.cwd(), ".object-storage-bucket", "deletion-journal"));
const fallbackMemoryJournalStore = new InMemoryJournalStore();
export async function syncDeletionJournalReconciliationMetrics(input: {
  deletedIds: readonly string[];
  blocked: readonly { objectId: string; reason: string }[];
  failures: readonly { objectId: string; reason: string; retryable: boolean }[];
  skippedNonBlockedCount: number;
  store?: JournalStore;
}): Promise<{ deletedCount: number; skippedCount: number; failedCount: number; journalSyncedCount: number; displayAreaUnitLabel?: string; referenceValuationIntlText?: string }> {
  const store = input.store ?? defaultReconciliationJournalStore;
  let journalSyncedCount = 0;
  const now = new Date();
  const syncWithStore = async (targetStore: JournalStore, objectId: string, finalStatus: JournalStatus, errorCode: string | null = null) => {
    const opId = `reconcile_${objectId}_${now.getTime()}_${journalSyncedCount}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
    const entry = createDeletionJournalEntry({ operationId: opId, objectId, objectKey: `reconcile/${objectId}`, now });
    await createJournalOperation(targetStore, entry);
    const running = await transitionJournalOperation(targetStore, opId, 0, "running", { now, incrementAttempt: true });
    if (finalStatus === "completed") {
      const localPending = await transitionJournalOperation(targetStore, opId, running.revision, "local_delete_pending", { now });
      await transitionJournalOperation(targetStore, opId, localPending.revision, "completed", { now });
    } else {
      await transitionJournalOperation(targetStore, opId, running.revision, finalStatus, { now, errorCode });
    }
    journalSyncedCount += 1;
  };
  const syncItem = async (objectId: string, finalStatus: JournalStatus, errorCode: string | null = null) => {
    try {
      await syncWithStore(store, objectId, finalStatus, errorCode);
    } catch (err) {
      if (input.store) throw err;
      await syncWithStore(fallbackMemoryJournalStore, objectId, finalStatus, errorCode);
    }
  };
  for (const id of input.deletedIds) await syncItem(id, "completed");
  for (const b of input.blocked) await syncItem(b.objectId, "manual_review", b.reason);
  for (const f of input.failures) await syncItem(f.objectId, f.retryable ? "retryable_failure" : "permanent_failure", f.reason);
  return { deletedCount: input.deletedIds.length, skippedCount: input.blocked.length + input.skippedNonBlockedCount, failedCount: input.failures.length, journalSyncedCount, displayAreaUnitLabel: formatAreaUnitLabel(getStoredAreaUnit()), referenceValuationIntlText: formatMillionTomanAsIntlCurrency(10000, getStoredIntlCurrency()) }; }