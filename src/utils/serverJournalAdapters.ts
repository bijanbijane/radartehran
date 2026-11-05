import crypto from 'crypto'; import fs from 'fs'; import os from 'os'; import path from 'path'; import type { Firestore } from 'firebase-admin/firestore'; import type { DeletionJournalEntry, JournalStatus, JournalStore } from './deletionJournal'; import { validateJournalEntry } from './deletionJournal'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; const RECOVERABLE_STATUSES: readonly JournalStatus[] = [
  'queued', 'running', 'remote_delete_pending', 'remote_deleted', 'local_delete_pending', 'retryable_failure', ]; const RECOVERABLE_STATUS_SET = new Set<JournalStatus>(RECOVERABLE_STATUSES); export interface LockFileMetadata { pid: number; host: string; createdAtMs: number; leaseMs?: number; token?: string; } export function isProcessAlive(pid: number): boolean { if (!Number.isSafeInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (error) { const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined; return code === 'EPERM'; } } function validateOperationIdForLock(operationId: string): void { if (typeof operationId !== 'string' || operationId.length < 8 || operationId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(operationId)) { throw new Error('INVALID_OPERATION_ID'); }
} async function tryReclaimStaleLockFile(lockPath: string, nowMs: number, corruptGraceMs: number): Promise<boolean> { let raw = ''; let stat: fs.Stats; try { stat = await fs.promises.lstat(lockPath); if (stat.isSymbolicLink() || stat.size > 16_384) { await fs.promises.unlink(lockPath).catch(() => {}); return true; } raw = await fs.promises.readFile(lockPath, 'utf8'); } catch (error) { const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined; return code === 'ENOENT'; } let parsed: unknown; try { parsed = raw.trim() ? JSON.parse(raw) : null; } catch { parsed = null; }
  if ( !parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof (parsed as LockFileMetadata).pid !== 'number' ||
    typeof (parsed as LockFileMetadata).host !== 'string' || typeof (parsed as LockFileMetadata).createdAtMs !== 'number'
  ) { if (nowMs - stat.mtimeMs >= corruptGraceMs) { await fs.promises.unlink(lockPath).catch(() => {}); return true; }
    return false; }
  const meta = parsed as LockFileMetadata; if (meta.host === os.hostname()) { if (isProcessAlive(meta.pid)) return false; await fs.promises.unlink(lockPath).catch(() => {}); return true; }
  const leaseMs = Number.isFinite(meta.leaseMs) && (meta.leaseMs ?? 0) > 0 ? Number(meta.leaseMs) : 30_000; if (nowMs - meta.createdAtMs > leaseMs) { await fs.promises.unlink(lockPath).catch(() => {}); return true; }
  return false; }
export async function withFileLock<T>( lockPath: string, fn: () => Promise<T>, options: { timeoutMs?: number; retryDelayMs?: number; leaseMs?: number; corruptGraceMs?: number } = {}
): Promise<T> { const timeoutMs = options.timeoutMs ?? 5_000; const retryDelayMs = options.retryDelayMs ?? 15; const leaseMs = options.leaseMs ?? 30_000; const corruptGraceMs = options.corruptGraceMs ?? 200; const deadline = Date.now() + timeoutMs;
  const token = crypto.randomBytes(8).toString('hex'); await fs.promises.mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 }); let acquired = false;
  while (!acquired) { try {
      const handle = await fs.promises.open(lockPath, 'wx', 0o600); try {
        const metadata: LockFileMetadata = { pid: process.pid, host: os.hostname(), createdAtMs: Date.now(), leaseMs, token };
        await handle.writeFile(JSON.stringify(metadata), 'utf8');
        await handle.sync();
      } finally {
        await handle.close().catch(() => {});
      }
      acquired = true;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code !== 'EEXIST') throw error;
      const now = Date.now();
      if (await tryReclaimStaleLockFile(lockPath, now, corruptGraceMs)) continue;
      if (now >= deadline) throw new Error('FILE_LOCK_TIMEOUT');
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  try {
    return await fn();
  } finally {
    try {
      const currentMeta = JSON.parse(await fs.promises.readFile(lockPath, 'utf8')) as Partial<LockFileMetadata>;
      if (!currentMeta || !currentMeta.token || currentMeta.token === token) {
        await fs.promises.unlink(lockPath).catch(() => {});
      }
    } catch {
      await fs.promises.unlink(lockPath).catch(() => {});
    }
  }
}
async function writeJournalFileAtomically(targetPath: string, entry: DeletionJournalEntry): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmpPath = `${targetPath}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(tmpPath, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(entry, null, 2), 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.promises.rename(tmpPath, targetPath);
    await fs.promises.chmod(targetPath, 0o600);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.promises.unlink(tmpPath).catch(() => {});
  }
}
export class FileJournalStore implements JournalStore {
  public readonly journalDir: string;
  private readonly lockOptions: { timeoutMs?: number; retryDelayMs?: number; leaseMs?: number; corruptGraceMs?: number };
  constructor(
    journalDir: string = path.join(process.cwd(), '.object-storage-bucket', 'deletion-journal'),
    lockOptions: { timeoutMs?: number; retryDelayMs?: number; leaseMs?: number; corruptGraceMs?: number } = {}
  ) {
    this.journalDir = path.resolve(journalDir);
    this.lockOptions = lockOptions;
  }
  private getEntryPath(operationId: string): string {
    validateOperationIdForLock(operationId);
    const resolved = path.resolve(this.journalDir, `${operationId}.json`);
    if (path.dirname(resolved) !== this.journalDir || path.basename(resolved) !== `${operationId}.json`) {
      throw new Error('INVALID_OPERATION_PATH');
    }
    return resolved;
  }
  private async readUnlocked(operationId: string): Promise<DeletionJournalEntry | null> {
    const filePath = this.getEntryPath(operationId);
    let raw: string;
    try {
      const fStat = await fs.promises.lstat(filePath);
      if (!fStat.isFile() || fStat.isSymbolicLink() || fStat.size > 256 * 1024) throw new Error('CORRUPTED_JOURNAL_RECORD');
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code === 'ENOENT') return null;
      throw error;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error('CORRUPTED_JOURNAL_RECORD'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('CORRUPTED_JOURNAL_RECORD');
    const entry = parsed as DeletionJournalEntry;
    if (entry.operationId !== operationId) throw new Error('CORRUPTED_JOURNAL_RECORD');
    try { validateJournalEntry(entry); } catch { throw new Error('CORRUPTED_JOURNAL_RECORD'); }
    return { ...entry };
  }
  async get(operationId: string): Promise<DeletionJournalEntry | null> {
    validateOperationIdForLock(operationId);
    return this.readUnlocked(operationId);
  }
  async create(entry: DeletionJournalEntry): Promise<void> {
    validateJournalEntry(entry);
    if (entry.status !== 'queued') throw new Error('NEW_OPERATION_MUST_BE_QUEUED');
    if (entry.revision !== 0) throw new Error('NEW_OPERATION_REVISION_MUST_BE_ZERO');
    const filePath = this.getEntryPath(entry.operationId);
    await withFileLock(`${filePath}.lock`, async () => {
      try {
        await fs.promises.access(filePath);
        throw new Error('DUPLICATE_OPERATION_ID');
      } catch (error) {
        if (error instanceof Error && error.message === 'DUPLICATE_OPERATION_ID') throw error;
        const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
        if (code && code !== 'ENOENT') throw error;
      }
      await writeJournalFileAtomically(filePath, { ...entry });
    }, this.lockOptions);
  }
  async compareAndSwap(operationId: string, expectedRevision: number, next: DeletionJournalEntry): Promise<boolean> {
    validateOperationIdForLock(operationId);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('INVALID_EXPECTED_REVISION');
    validateJournalEntry(next);
    if (next.operationId !== operationId) throw new Error('OPERATION_ID_MISMATCH');
    if (next.revision !== expectedRevision + 1) throw new Error('INVALID_NEXT_REVISION');
    const filePath = this.getEntryPath(operationId);
    return withFileLock(`${filePath}.lock`, async () => {
      const current = await this.readUnlocked(operationId);
      if (!current || current.revision !== expectedRevision) return false;
      await writeJournalFileAtomically(filePath, { ...next });
      return true;
    }, this.lockOptions);
  }
  async listRecoverable(limit: number): Promise<DeletionJournalEntry[]> {
    const safeLimit = Number.isSafeInteger(limit) && limit >= 1 ? Math.min(500, limit) : 50;
    let dirEntries: fs.Dirent[];
    try {
      dirEntries = await fs.promises.readdir(this.journalDir, { withFileTypes: true });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code === 'ENOENT') return [];
      throw error;
    }
    const recoverable: DeletionJournalEntry[] = [];
    for (const dirent of dirEntries) {
      if (!dirent.isFile() || !dirent.name.endsWith('.json') || dirent.name.includes('.tmp-')) continue;
      const opId = dirent.name.slice(0, -5);
      if (opId.length < 8 || opId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(opId)) continue;
      try {
        const entry = await this.readUnlocked(opId);
        if (entry && RECOVERABLE_STATUS_SET.has(entry.status)) recoverable.push(entry);
      } catch { /* ignore corrupted individual file */ }
    }
    recoverable.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    return recoverable.slice(0, safeLimit);
  }
}
export class FirestoreJournalStore implements JournalStore {
  private readonly getDb: () => Firestore;
  private readonly collectionName: string;
  constructor(dbOrFactory: Firestore | (() => Firestore), collectionName = 'deletionJournal') {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(collectionName)) throw new Error('INVALID_COLLECTION_NAME');
    this.getDb = typeof dbOrFactory === 'function' ? dbOrFactory : () => dbOrFactory;
    this.collectionName = collectionName;
  }
  private getDocRef(operationId: string) {
    validateOperationIdForLock(operationId);
    return this.getDb().collection(this.collectionName).doc(operationId);
  }
  async get(operationId: string): Promise<DeletionJournalEntry | null> {
    const snap = await this.getDocRef(operationId).get();
    if (!snap.exists) return null;
    const entry = snap.data() as DeletionJournalEntry | undefined;
    if (!entry || typeof entry !== 'object' || entry.operationId !== operationId) throw new Error('CORRUPTED_JOURNAL_RECORD');
    validateJournalEntry(entry);
    return { ...entry };
  }
  async create(entry: DeletionJournalEntry): Promise<void> {
    validateJournalEntry(entry);
    if (entry.status !== 'queued') throw new Error('NEW_OPERATION_MUST_BE_QUEUED');
    if (entry.revision !== 0) throw new Error('NEW_OPERATION_REVISION_MUST_BE_ZERO');
    const docRef = this.getDocRef(entry.operationId);
    await this.getDb().runTransaction(async (tx) => {
      const existing = await tx.get(docRef);
      if (existing.exists) throw new Error('DUPLICATE_OPERATION_ID');
      tx.set(docRef, { ...entry });
    });
  }
  async compareAndSwap(operationId: string, expectedRevision: number, next: DeletionJournalEntry): Promise<boolean> {
    validateOperationIdForLock(operationId);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('INVALID_EXPECTED_REVISION');
    validateJournalEntry(next);
    if (next.operationId !== operationId) throw new Error('OPERATION_ID_MISMATCH');
    if (next.revision !== expectedRevision + 1) throw new Error('INVALID_NEXT_REVISION');
    const docRef = this.getDocRef(operationId);
    return this.getDb().runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return false;
      const current = snap.data() as DeletionJournalEntry | undefined;
      if (!current || typeof current !== 'object') throw new Error('CORRUPTED_JOURNAL_RECORD');
      validateJournalEntry(current);
      if (current.revision !== expectedRevision) return false;
      tx.set(docRef, { ...next });
      return true;
    });
  }
  async listRecoverable(limit: number): Promise<DeletionJournalEntry[]> {
    const safeLimit = Number.isSafeInteger(limit) && limit >= 1 ? Math.min(500, limit) : 50;
    const snap = await this.getDb().collection(this.collectionName).where('status', 'in', [...RECOVERABLE_STATUSES]).limit(safeLimit).get();
    const results: DeletionJournalEntry[] = [];
    for (const doc of snap.docs) {
      const data = doc.data() as DeletionJournalEntry;
      if (!data || data.operationId !== doc.id) continue;
      try {
        validateJournalEntry(data);
        if (RECOVERABLE_STATUS_SET.has(data.status)) results.push({ ...data });
      } catch { /* ignore malformed */ }
    }
    results.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    return results.slice(0, safeLimit);
  }
}
export function isJournalLeaseActive(entry: DeletionJournalEntry, now = new Date()): boolean {
  if (!entry.leaseOwner || !entry.leaseExpiresAt) return false;
  const expiresMs = Date.parse(entry.leaseExpiresAt);
  if (Number.isNaN(expiresMs)) return false;
  return expiresMs > now.getTime();
}
export async function claimRecoverableJournalOperation(
  store: JournalStore,
  operationId: string,
  options: { workerId: string; leaseDurationMs?: number; maxAttempts?: number; now?: Date; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode }
): Promise<{
  claimed: boolean;
  entry: DeletionJournalEntry | null;
  reason: 'CLAIMED' | 'NOT_FOUND' | 'NOT_RECOVERABLE' | 'LEASE_HELD_BY_OTHER' | 'DEAD_LETTERED_MANUAL_REVIEW' | 'CAS_CONFLICT';
  displayAreaUnitLabel?: string;
  referenceValuationIntlText?: string;
}> {
  const now = options.now ?? new Date();
  const workerId = options.workerId.trim();
  if (!workerId) throw new Error('INVALID_WORKER_ID');
  const displayAreaUnitLabel = formatAreaUnitLabel(options.areaUnit ?? 'sqm');
  const referenceValuationIntlText = formatMillionTomanAsIntlCurrency(120, options.intlCurrency ?? 'USD', 'en');
  const leaseDurationMs = Math.max(5_000, options.leaseDurationMs ?? 30_000);
  const maxAttempts = Math.max(1, options.maxAttempts ?? 5);
  const current = await store.get(operationId);
  if (!current) return { claimed: false, entry: null, reason: 'NOT_FOUND', displayAreaUnitLabel, referenceValuationIntlText };
  if (!RECOVERABLE_STATUS_SET.has(current.status)) return { claimed: false, entry: current, reason: 'NOT_RECOVERABLE', displayAreaUnitLabel, referenceValuationIntlText };
  if (isJournalLeaseActive(current, now) && current.leaseOwner !== workerId) return { claimed: false, entry: current, reason: 'LEASE_HELD_BY_OTHER', displayAreaUnitLabel, referenceValuationIntlText };
  const nowIso = now.toISOString();
  if (current.attemptCount >= maxAttempts && current.status !== 'remote_deleted' && current.status !== 'local_delete_pending') {
    const deadLetterEntry: DeletionJournalEntry = {
      ...current,
      status: 'manual_review',
      revision: current.revision + 1,
      updatedAt: nowIso,
      lastErrorCode: current.lastErrorCode ?? 'MAX_RECOVERY_ATTEMPTS_EXCEEDED',
      leaseOwner: null,
      leaseExpiresAt: null,
    };
    const swapped = await store.compareAndSwap(operationId, current.revision, deadLetterEntry);
    return {
      claimed: false,
      entry: swapped ? deadLetterEntry : await store.get(operationId),
      reason: swapped ? 'DEAD_LETTERED_MANUAL_REVIEW' : 'CAS_CONFLICT',
      displayAreaUnitLabel,
      referenceValuationIntlText,
    };
  }
  const targetStatus: JournalStatus = current.status === 'remote_deleted' || current.status === 'local_delete_pending' ? 'local_delete_pending' : 'running';
  const claimedEntry: DeletionJournalEntry = {
    ...current,
    status: targetStatus,
    revision: current.revision + 1,
    attemptCount: current.attemptCount + 1, updatedAt: nowIso, leaseOwner: workerId, leaseExpiresAt: new Date(now.getTime() + leaseDurationMs).toISOString(), }; const swapped = await store.compareAndSwap(operationId, current.revision, claimedEntry); if (!swapped) { return { claimed: false, entry: await store.get(operationId), reason: 'CAS_CONFLICT', displayAreaUnitLabel, referenceValuationIntlText }; } return { claimed: true, entry: claimedEntry, reason: 'CLAIMED', displayAreaUnitLabel, referenceValuationIntlText }; }