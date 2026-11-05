import fs from 'fs'; import path from 'path'; import { deleteFromRemoteS3Compatible, resolveObjectStorageRuntimeConfig } from './objectStorageUpload'; import { BUCKET_DIR, MAX_STORED_OBJECTS, SAFE_OBJECT_ID, StoredObjectRecord, MediaAuditReferences, MediaAuditClassification, classifyStoredObjectReference, isSafeStoredObjectRecord, objectStoreIndex, persistObjectStoreIndexNow, writeFileAtomically, } from './serverObjectStorageHelpers'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export type StoredObjectDeleteResult = | 'deleted'
  | 'not_found' | 'remote_delete_failed' | 'index_persist_failed' | 'local_delete_failed' | 'invalid_path';
const inFlightOrphanDeletes = new Set<string>();
export async function deleteStoredObjectSafely( record: StoredObjectRecord
): Promise<StoredObjectDeleteResult> { if (!record || typeof record.id !== 'string' || !SAFE_OBJECT_ID.test(record.id)) return 'invalid_path'; if (inFlightOrphanDeletes.has(record.id)) return 'not_found'; inFlightOrphanDeletes.add(record.id); try { const initialIndex = objectStoreIndex.findIndex((item) => item.id === record.id); if (initialIndex < 0) return 'not_found'; const current = objectStoreIndex[initialIndex]; if (current.id !== record.id || current.bargainId || !isSafeStoredObjectRecord(current)) return 'invalid_path'; const bucketRoot = path.resolve(BUCKET_DIR); const localPath = path.resolve(bucketRoot, current.localFileName); if ( path.dirname(localPath) !== bucketRoot ||
    path.basename(current.localFileName) !== current.localFileName
  ) { return 'invalid_path'; } const previousState = current.deletionState; current.deletionState = 'pending_delete'; try { await persistObjectStoreIndexNow(); } catch { current.deletionState = previousState; return 'index_persist_failed'; } if (current.remoteS3Synced) { const remoteDeleted = await deleteFromRemoteS3Compatible( current.objectKey, resolveObjectStorageRuntimeConfig()
    ); if (!remoteDeleted) return 'remote_delete_failed'; const previousRemoteState = current.remoteS3Synced; current.remoteS3Synced = false; try { await persistObjectStoreIndexNow(); } catch { current.remoteS3Synced = previousRemoteState; return 'index_persist_failed'; } }
  try { await fs.promises.unlink(localPath); } catch (error) { const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined; if (code !== 'ENOENT') return 'local_delete_failed'; }
  const finalIndex = objectStoreIndex.findIndex((item) => item.id === current.id); if (finalIndex < 0) return 'deleted'; const removed = objectStoreIndex.splice(finalIndex, 1)[0]; try {
    await persistObjectStoreIndexNow(); } catch { objectStoreIndex.splice(Math.min(finalIndex, objectStoreIndex.length), 0, removed); await persistObjectStoreIndexNow().catch(() => {}); return 'index_persist_failed'; }
  return 'deleted'; } finally { inFlightOrphanDeletes.delete(record.id); } }
export const ORPHAN_AUDIT_DIR = path.join(BUCKET_DIR, 'orphan-audit-jobs'); export const ORPHAN_AUDIT_PAGE_SIZE = 200; export const ORPHAN_AUDIT_MAX_PAGES_PER_STEP = 10; export const ORPHAN_AUDIT_MAX_TOTAL_PAGES = 500; export const ORPHAN_AUDIT_MAX_JOBS = 20; export const ORPHAN_AUDIT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ORPHAN_AUDIT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; export const ORPHAN_AUDIT_JOB_SCHEMA_INVALID = 'ORPHAN_AUDIT_JOB_SCHEMA_INVALID'; export type OrphanAuditJobStatus = 'scanning' | 'completed' | 'incomplete';
export interface OrphanAuditObjectSnapshot {
  id: string; objectKey: string; url: string; mediaType: 'image' | 'video';
  sizeBytes: number; createdAtIso: string; ownerKnown: boolean;
  bargainId?: string; deletionState?: 'active' | 'pending_delete';
}
export interface OrphanAuditReferenceMatches {
  objectIds: string[]; objectKeys: string[]; urls: string[]; bargainIds: string[];
}
export interface OrphanAuditJob {
  schemaVersion: 1; id: string; createdAtIso: string; updatedAtIso: string;
  completedAtIso?: string; requestedByUid: string | null; requestedByEmail: string | null;
  status: OrphanAuditJobStatus; lastDocumentId: string | null;
  scannedBargains: number; scannedPages: number; maxPages: number; pageSize: number;
  storageObjects: OrphanAuditObjectSnapshot[]; references: OrphanAuditReferenceMatches;
  lastErrorCode?: string;
}
export const orphanAuditJobsInProgress = new Set<string>();
function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isStringArray(v: unknown, maxItems = MAX_STORED_OBJECTS): v is string[] {
  return Array.isArray(v) && v.length <= maxItems && v.every((item) => typeof item === 'string' && item.length <= 2048);
}
export function getOrphanAuditJobPath(jobId: string): string {
  if (!/^[a-f0-9]{32}$/.test(jobId)) throw new Error('INVALID_AUDIT_JOB_ID');
  const target = path.resolve(ORPHAN_AUDIT_DIR, `orphan-audit-${jobId}.json`);
  const expectedDirectory = path.resolve(ORPHAN_AUDIT_DIR);
  if (path.dirname(target) !== expectedDirectory || path.basename(target) !== `orphan-audit-${jobId}.json`) {
    throw new Error('INVALID_AUDIT_JOB_PATH');
  }
  return target;
}
function isValidAuditObjectSnapshot(v: unknown): v is OrphanAuditObjectSnapshot {
  if (!isPlainRecord(v)) return false;
  return (
    typeof v.id === 'string' && SAFE_OBJECT_ID.test(v.id) &&
    typeof v.objectKey === 'string' && v.objectKey.length > 0 && v.objectKey.length <= 512 &&
    typeof v.url === 'string' && v.url.length > 0 && v.url.length <= 2048 &&
    (v.mediaType === 'image' || v.mediaType === 'video') &&
    typeof v.sizeBytes === 'number' && Number.isSafeInteger(v.sizeBytes) &&
    v.sizeBytes > 0 && v.sizeBytes <= 250 * 1024 * 1024 &&
    typeof v.createdAtIso === 'string' && Number.isFinite(Date.parse(v.createdAtIso)) &&
    typeof v.ownerKnown === 'boolean' &&
    (v.bargainId === undefined || (typeof v.bargainId === 'string' && /^[A-Za-z0-9_-]{10,128}$/.test(v.bargainId))) &&
    (v.deletionState === undefined || v.deletionState === 'active' || v.deletionState === 'pending_delete')
  );
}
export function isValidOrphanAuditJob(v: unknown, expectedId: string): v is OrphanAuditJob {
  if (!isPlainRecord(v)) return false;
  return !(
    v.schemaVersion !== 1 || v.id !== expectedId || !/^[a-f0-9]{32}$/.test(String(v.id)) ||
    typeof v.createdAtIso !== 'string' || typeof v.updatedAtIso !== 'string' ||
    !Number.isFinite(Date.parse(v.createdAtIso)) || !Number.isFinite(Date.parse(v.updatedAtIso)) ||
    !(v.status === 'scanning' || v.status === 'completed' || v.status === 'incomplete') ||
    !(v.lastDocumentId === null || (typeof v.lastDocumentId === 'string' && v.lastDocumentId.length <= 1500)) ||
    !Number.isSafeInteger(v.scannedBargains) || Number(v.scannedBargains) < 0 ||
    !Number.isSafeInteger(v.scannedPages) || Number(v.scannedPages) < 0 ||
    Number(v.scannedPages) > ORPHAN_AUDIT_MAX_TOTAL_PAGES ||
    v.pageSize !== ORPHAN_AUDIT_PAGE_SIZE || v.maxPages !== ORPHAN_AUDIT_MAX_TOTAL_PAGES ||
    !Array.isArray(v.storageObjects) || v.storageObjects.length > MAX_STORED_OBJECTS ||
    !v.storageObjects.every(isValidAuditObjectSnapshot) ||
    !isPlainRecord(v.references) || !isStringArray(v.references.objectIds) ||
    !isStringArray(v.references.objectKeys) || !isStringArray(v.references.urls) ||
    !isStringArray(v.references.bargainIds) ||
    !(v.requestedByUid === null || typeof v.requestedByUid === 'string') ||
    !(v.requestedByEmail === null || typeof v.requestedByEmail === 'string')
  );
}
export async function persistOrphanAuditJob(job: OrphanAuditJob): Promise<void> {
  const { withFileLock } = await import('./serverJournalAdapters');
  job.updatedAtIso = new Date().toISOString();
  const filePath = getOrphanAuditJobPath(job.id);
  const serialized = JSON.stringify(job);
  if (Buffer.byteLength(serialized, 'utf8') > ORPHAN_AUDIT_MAX_FILE_BYTES) {
    throw new Error('ORPHAN_AUDIT_JOB_TOO_LARGE');
  }
  await withFileLock(`${filePath}.lock`, async () => {
    await writeFileAtomically(filePath, Buffer.from(serialized, 'utf8'), 0o600);
  });
}
export async function loadOrphanAuditJob(jobId: string): Promise<OrphanAuditJob | null> {
  const filePath = getOrphanAuditJobPath(jobId);
  let content: string;
  try {
    const stat = await fs.promises.lstat(filePath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > ORPHAN_AUDIT_MAX_FILE_BYTES) {
      throw new Error('ORPHAN_AUDIT_FILE_INVALID_SIZE');
    }
    content = await fs.promises.readFile(filePath, 'utf8');
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code === 'ENOENT') return null;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content, (key, value) => (key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value));
  } catch { throw new Error('ORPHAN_AUDIT_FILE_INVALID_JSON'); }
  if (!isValidOrphanAuditJob(parsed, jobId)) throw new Error(ORPHAN_AUDIT_JOB_SCHEMA_INVALID);
  return parsed;
}
export async function cleanupExpiredOrphanAuditJobs(): Promise<number> {
  await fs.promises.mkdir(ORPHAN_AUDIT_DIR, { recursive: true, mode: 0o700 });
  const now = Date.now();
  let removed = 0;
  const entries = await fs.promises.readdir(ORPHAN_AUDIT_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile() || !/^orphan-audit-[a-f0-9]{32}\.json(\.tmp-.*|\.lock)?$/.test(entry.name)) continue;
    const filePath = path.join(ORPHAN_AUDIT_DIR, entry.name);
    try {
      const stat = await fs.promises.lstat(filePath);
      if (stat.isSymbolicLink() || !stat.isFile() || now - stat.mtimeMs < ORPHAN_AUDIT_RETENTION_MS) continue;
      await fs.promises.unlink(filePath);
      removed++;
    } catch { /* ignore */ }
  }
  return removed;
}
export async function countOrphanAuditJobs(): Promise<number> {
  await fs.promises.mkdir(ORPHAN_AUDIT_DIR, { recursive: true, mode: 0o700 });
  const entries = await fs.promises.readdir(ORPHAN_AUDIT_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && /^orphan-audit-[a-f0-9]{32}\.json$/.test(e.name)).length;
}
export function createOrphanAuditJob(id: string, actorUid: string | null, actorEmail: string | null): OrphanAuditJob {
  const now = new Date().toISOString();
  const storageObjects: OrphanAuditObjectSnapshot[] = objectStoreIndex.map((r) => ({
    id: r.id, objectKey: r.objectKey, url: r.url, mediaType: r.mediaType,
    sizeBytes: r.sizeBytes, createdAtIso: r.createdAtIso, ownerKnown: Boolean(r.ownerUid),
    ...(r.bargainId ? { bargainId: r.bargainId } : {}),
    ...(r.deletionState ? { deletionState: r.deletionState } : {}),
  }));
  return {
    schemaVersion: 1, id, createdAtIso: now, updatedAtIso: now,
    requestedByUid: actorUid, requestedByEmail: actorEmail, status: 'scanning',
    lastDocumentId: null, scannedBargains: 0, scannedPages: 0,
    maxPages: ORPHAN_AUDIT_MAX_TOTAL_PAGES, pageSize: ORPHAN_AUDIT_PAGE_SIZE,
    storageObjects, references: { objectIds: [], objectKeys: [], urls: [], bargainIds: [] },
  };
}
export function collectMatchingString(value: unknown, targets: ReadonlySet<string>, matches: Set<string>): void {
  if (typeof value === 'string' && value.trim() && targets.has(value.trim())) matches.add(value.trim());
}
export function collectMatchingStringArray(value: unknown, targets: ReadonlySet<string>, matches: Set<string>): void {
  if (Array.isArray(value)) for (const entry of value) collectMatchingString(entry, targets, matches);
}
export function getTrackedAuditTargetSets(job: OrphanAuditJob) {
  const objectIds = new Set<string>(); const objectKeys = new Set<string>();
  const urls = new Set<string>(); const bargainIds = new Set<string>();
  for (const r of job.storageObjects) {
    objectIds.add(r.id); objectKeys.add(r.objectKey); urls.add(r.url);
    if (r.bargainId) bargainIds.add(r.bargainId);
  }
  return { objectIds, objectKeys, urls, bargainIds };
}
export function buildOrphanAuditReport(job: OrphanAuditJob, areaUnit: AreaUnit = 'sqm', intlCurrency: IntlCurrencyCode = 'USD', referenceValuationMillionToman = 12000) {
  const references: MediaAuditReferences = {
    objectIds: new Set(job.references.objectIds), objectKeys: new Set(job.references.objectKeys),
    urls: new Set(job.references.urls), bargainIds: new Set(job.references.bargainIds),
  };
  const counts: Record<MediaAuditClassification, number> = {
    pending_deletion: 0, referenced: 0, associated_bargain_reference_missing: 0,
    stale_bargain_association: 0, likely_orphan: 0,
  };
  const items = job.storageObjects.map((r) => {
    const classification = classifyStoredObjectReference(r, references);
    counts[classification]++;
    return {
      id: r.id, objectKey: r.objectKey, mediaType: r.mediaType, sizeBytes: r.sizeBytes,
      createdAtIso: r.createdAtIso, ownerKnown: r.ownerKnown,
      ...(r.bargainId ? { bargainId: r.bargainId } : {}), classification,
    };
  });
  return {
    counts, items,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(referenceValuationMillionToman, intlCurrency),
  };
}
export function parseBoundedQueryInteger(value: unknown, fallback: number, min: number, max: number): number {
  const raw = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}