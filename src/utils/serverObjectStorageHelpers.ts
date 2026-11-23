import crypto from 'crypto'; import fs from 'fs'; import path from 'path'; import { ListingMediaObject, ObjectStorageProviderId, } from './objectStorage'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export const BUCKET_DIR = path.join(process.cwd(), '.object-storage-bucket'); export const INDEX_FILE = path.join(BUCKET_DIR, 'index.json'); export const MAX_STORED_OBJECTS = 300; export const MAX_TOTAL_STORAGE_BYTES = 2 * 1024 * 1024 * 1024; export const MAX_OBJECTS_PER_OWNER = 30; export const MAX_BYTES_PER_OWNER = 500 * 1024 * 1024; export interface StoredObjectRecord extends ListingMediaObject { localFileName: string; ownerUid?: string; bargainId?: string;
  deletionState?: 'active' | 'pending_delete'; } export interface PendingUploadReservation { ownerUid: string; sizeBytes: number; createdAtMs: number; } export const pendingUploadReservations = new Map<string, PendingUploadReservation>(); export type ReleaseUploadReservation = (() => void) & { release: () => void };
export function reserveUploadCapacityForIndex( objectStoreIndex: StoredObjectRecord[], ownerUid: string, incomingBytes: number
): ReleaseUploadReservation | null { if ( typeof ownerUid !== 'string' ||
    !ownerUid.trim() || !Number.isSafeInteger(incomingBytes) ||
    incomingBytes <= 0
  ) { return null; }
  const now = Date.now(); const staleAfterMs = 15 * 60 * 1000; for (const [id, item] of pendingUploadReservations.entries()) { if (now - item.createdAtMs > staleAfterMs) { pendingUploadReservations.delete(id); } }
  const pending = Array.from(pendingUploadReservations.values()); const storedBytes = objectStoreIndex.reduce((total, item) => total + Math.max(0, item.sizeBytes || 0), 0);
  const pendingBytes = pending.reduce((total, item) => total + Math.max(0, item.sizeBytes || 0), 0); const ownerRecords = objectStoreIndex.filter((item) => item.ownerUid === ownerUid);
  const ownerPending = pending.filter((item) => item.ownerUid === ownerUid); const ownerStoredBytes = ownerRecords.reduce((total, item) => total + Math.max(0, item.sizeBytes || 0), 0); const ownerPendingBytes = ownerPending.reduce((total, item) => total + Math.max(0, item.sizeBytes || 0), 0); if (
    objectStoreIndex.length + pending.length >= MAX_STORED_OBJECTS || storedBytes + pendingBytes + incomingBytes > MAX_TOTAL_STORAGE_BYTES
  ) { return null; }
  if ( ownerRecords.length + ownerPending.length >= MAX_OBJECTS_PER_OWNER ||
    ownerStoredBytes + ownerPendingBytes + incomingBytes > MAX_BYTES_PER_OWNER
  ) { return null; }
  const reservationId = crypto.randomBytes(16).toString('hex'); pendingUploadReservations.set(reservationId, { ownerUid,
    sizeBytes: incomingBytes, createdAtMs: now,
  }); let released = false;
  const releaseFn = (() => { if (released) return;
    released = true; pendingUploadReservations.delete(reservationId);
  }) as ReleaseUploadReservation;
  releaseFn.release = releaseFn;
  return releaseFn;
}
export const objectStoreIndex: StoredObjectRecord[] = [];
let indexLoaded = false;
let testIsolatedResetActive = false;
let pendingIndexWriteTimer: ReturnType<typeof setTimeout> | null = null;
let bucketLoadPromise: Promise<void> | null = null;
let indexWriteChain: Promise<void> = Promise.resolve();
export function reserveUploadCapacity(ownerUid: string, incomingBytes: number): ReleaseUploadReservation | null {
  return reserveUploadCapacityForIndex(objectStoreIndex, ownerUid, incomingBytes);
}
export function resetObjectStorageIndexForTests(): void {
  if (pendingIndexWriteTimer) { clearTimeout(pendingIndexWriteTimer); pendingIndexWriteTimer = null; }
  pendingUploadReservations.clear();
  objectStoreIndex.splice(0, objectStoreIndex.length);
  indexLoaded = false;
  testIsolatedResetActive = true;
  bucketLoadPromise = null;
}
export async function syncMediaObjectToFirestore(record: StoredObjectRecord, remove = false): Promise<void> {
  const registry = await import('./serverObjectStorageMetadataRegistry');
  if (registry.isDurableObjectMetadataProductionMode()) {
    if (remove) await registry.deleteStoredObjectMetadata(record.id);
    else await registry.upsertStoredObjectMetadata(record);
    return;
  }
  if (testIsolatedResetActive || process.env.PREVENT_PROD_FIREBASE_IN_TEST === 'true') return;
}
export async function recoverObjectStoreIndexFromFirestore(): Promise<StoredObjectRecord[]> {
  const registry = await import('./serverObjectStorageMetadataRegistry');
  if (registry.isDurableObjectMetadataProductionMode()) {
    return registry.loadStoredObjectRecordsFromDurableRegistry();
  }
  return [];
}
export async function ensureBucketLoaded(): Promise<void> {
  if (indexLoaded) return;
  if (!bucketLoadPromise) {
    bucketLoadPromise = (async () => {
      const registry = await import('./serverObjectStorageMetadataRegistry');
      await fs.promises.mkdir(BUCKET_DIR, { recursive: true, mode: 0o700 });
      await cleanupStaleTemporaryFiles();
      if (registry.isDurableObjectMetadataProductionMode()) {
        const durableRecords = await registry.loadStoredObjectRecordsFromDurableRegistry();
        objectStoreIndex.splice(0, objectStoreIndex.length, ...durableRecords.slice(0, MAX_STORED_OBJECTS));
        indexLoaded = true;
        return;
      }
      let raw = '[]';
      let indexMissing = false;
      try {
        const idxStat = await fs.promises.lstat(INDEX_FILE);
        if (!idxStat.isFile() || idxStat.isSymbolicLink() || idxStat.size > 10 * 1024 * 1024) {
          throw new Error('INDEX_FILE_UNSAFE_OR_OVERSIZED');
        }
        raw = await fs.promises.readFile(INDEX_FILE, 'utf-8');
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        if (code === 'ENOENT') indexMissing = true;
        else console.error('[OBJECT_STORAGE_INDEX_READ_ERROR]', code || 'UNKNOWN_ERROR');
      }
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch {
        console.error('[OBJECT_STORAGE_INDEX_INVALID_JSON]');
        await fs.promises.rename(INDEX_FILE, `${INDEX_FILE}.corrupt-${Date.now()}`).catch(() => {});
        parsed = []; indexMissing = true;
      }
      const validRecords: StoredObjectRecord[] = [];
      const seenIds = new Set<string>();
      const seenFilenames = new Set<string>();
      if (Array.isArray(parsed)) {
        for (const candidate of parsed.slice(0, MAX_STORED_OBJECTS * 2)) {
          if (!isSafeStoredObjectRecord(candidate)) continue;
          const id = candidate.id.toLowerCase(); const filename = candidate.localFileName.toLowerCase();
          if (seenIds.has(id) || seenFilenames.has(filename)) continue;
          seenIds.add(id); seenFilenames.add(filename); validRecords.push(candidate);
        }
      }
      if (validRecords.length === 0 && indexMissing && !testIsolatedResetActive && process.env.PREVENT_PROD_FIREBASE_IN_TEST !== 'true') {
        const recovered = await recoverObjectStoreIndexFromFirestore();
        for (const rec of recovered) {
          if (!seenIds.has(rec.id.toLowerCase()) && !seenFilenames.has(rec.localFileName.toLowerCase())) {
            seenIds.add(rec.id.toLowerCase()); seenFilenames.add(rec.localFileName.toLowerCase()); validRecords.push(rec);
          }
        }
      }
      objectStoreIndex.splice(0, objectStoreIndex.length, ...validRecords.slice(0, MAX_STORED_OBJECTS));
      indexLoaded = true;
    })();
  }
  const activeLoad = bucketLoadPromise;
  try { await activeLoad; } catch (error) {
    console.error('[OBJECT_STORAGE_INDEX_LOAD_ERROR]', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
    objectStoreIndex.splice(0, objectStoreIndex.length); indexLoaded = true;
  } finally {
    if (bucketLoadPromise === activeLoad) bucketLoadPromise = null;
  }
}
export async function persistObjectStoreIndexNow(): Promise<void> {
  const registry = await import('./serverObjectStorageMetadataRegistry');
  const writeTask = indexWriteChain.catch(() => {}).then(async () => {
    if (registry.isDurableObjectMetadataProductionMode()) {
      await registry.persistAllStoredObjectMetadataToRegistry(objectStoreIndex);
      return;
    }
    const { withFileLock } = await import('./serverJournalAdapters');
    await fs.promises.mkdir(BUCKET_DIR, { recursive: true, mode: 0o700 });
    await withFileLock(`${INDEX_FILE}.lock`, async () => {
      const snapshot = JSON.stringify(objectStoreIndex, null, 2);
      const tmpPath = `${INDEX_FILE}.tmp.${process.pid}.${crypto.randomBytes(8).toString('hex')}`;
      let fileHandle: import('node:fs/promises').FileHandle | undefined;
      try {
        fileHandle = await fs.promises.open(tmpPath, 'wx', 0o600);
        await fileHandle.writeFile(snapshot, 'utf-8');
        await fileHandle.sync(); await fileHandle.close(); fileHandle = undefined;
        await fs.promises.rename(tmpPath, INDEX_FILE); await fs.promises.chmod(INDEX_FILE, 0o600);
      } finally {
        if (fileHandle) await fileHandle.close().catch(() => {});
        await fs.promises.unlink(tmpPath).catch(() => {});
      }
    });
  });
  indexWriteChain = writeTask;
  await writeTask;
}
export function scheduleAsyncIndexPersist(): void {
  if (pendingIndexWriteTimer) clearTimeout(pendingIndexWriteTimer);
  pendingIndexWriteTimer = setTimeout(() => {
    pendingIndexWriteTimer = null;
    void persistObjectStoreIndexNow().catch((error) => {
      console.error('[OBJECT_STORAGE_INDEX_PERSISTENCE_ERROR]', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
    });
  }, 200);
}
const VALID_STORAGE_PROVIDERS = new Set<ObjectStorageProviderId>([
  'arvancloud', 'liara', 'minio', 's3_compatible', 'r2', 'firebase_storage', 'local_bucket',
]);
export const SAFE_OBJECT_ID = /^obj-\d{10,16}-[a-f0-9]{8}$/i;
const SAFE_LOCAL_FILENAME = /^obj-\d{10,16}-[a-f0-9]{8}\.(?:webp|jpg|jpeg|png|mp4|mov|webm)$/i;
const SAFE_OBJECT_KEY =
  /^listings\/(tehran|karaj|mashhad|isfahan|shiraz)\/hood-([1-9]\d{0,2})\/(image|video)\/\d{4}-(0[1-9]|1[0-2])\/(obj-\d{10,16}-[a-f0-9]{8})\.(webp|jpg|jpeg|png|mp4|mov|webm)$/i;
const SAFE_MIME_BY_EXTENSION: Record<string, string> = {
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
};
export async function writeFileAtomically(destinationPath: string, data: Buffer, mode = 0o600): Promise<void> {
  if (!Buffer.isBuffer(data) || data.length === 0) throw new Error('INVALID_FILE_BUFFER');
  const destinationDirectory = path.dirname(destinationPath);
  await fs.promises.mkdir(destinationDirectory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${destinationPath}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  let handle: import('node:fs/promises').FileHandle | undefined;
  try {
    handle = await fs.promises.open(temporaryPath, 'wx', mode);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.promises.rename(temporaryPath, destinationPath);
    await fs.promises.chmod(destinationPath, mode);
    let directoryHandle: import('node:fs/promises').FileHandle | undefined;
    try {
      directoryHandle = await fs.promises.open(destinationDirectory, 'r');
      await directoryHandle.sync();
    } catch { /* directory fsync unsupported on some filesystems */ } finally {
      if (directoryHandle) await directoryHandle.close().catch(() => {});
    }
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.promises.unlink(temporaryPath).catch(() => {});
  }
}
export async function cleanupStaleTemporaryFiles(): Promise<number> {
  const now = Date.now();
  const staleAfterMs = 24 * 60 * 60 * 1000;
  let removedCount = 0;
  let entries: import('node:fs').Dirent[];
  try { entries = await fs.promises.readdir(BUCKET_DIR, { withFileTypes: true }); } catch { return 0; }
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || (!entry.name.includes('.tmp-') && !entry.name.includes('.tmp.'))) continue;
    const fullPath = path.join(BUCKET_DIR, entry.name);
    try {
      const stat = await fs.promises.lstat(fullPath);
      if (!stat.isFile() || stat.isSymbolicLink() || now - stat.mtimeMs < staleAfterMs) continue;
      await fs.promises.unlink(fullPath);
      removedCount++;
    } catch { /* continue cleaning other files */ }
  }
  return removedCount;
}
export function isSafeStoredObjectRecord(value: unknown): value is StoredObjectRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' || !SAFE_OBJECT_ID.test(record.id) ||
    typeof record.localFileName !== 'string' || !SAFE_LOCAL_FILENAME.test(record.localFileName) ||
    path.basename(record.localFileName) !== record.localFileName ||
    typeof record.objectKey !== 'string' || typeof record.bucket !== 'string' ||
    record.bucket.length === 0 || record.bucket.length > 255 ||
    typeof record.provider !== 'string' || !VALID_STORAGE_PROVIDERS.has(record.provider as ObjectStorageProviderId) ||
    typeof record.mediaType !== 'string' || !['image', 'video'].includes(record.mediaType) ||
    typeof record.mimeType !== 'string' || typeof record.sizeBytes !== 'number' ||
    !Number.isSafeInteger(record.sizeBytes) || record.sizeBytes <= 0 || record.sizeBytes > 250 * 1024 * 1024 ||
    typeof record.url !== 'string' || typeof record.createdAtIso !== 'string' ||
    !Number.isFinite(Date.parse(record.createdAtIso)) ||
    (record.remoteS3Synced !== undefined && typeof record.remoteS3Synced !== 'boolean') ||
    (record.ownerUid !== undefined && (typeof record.ownerUid !== 'string' || !record.ownerUid.trim() || record.ownerUid.length > 128)) ||
    (record.bargainId !== undefined && (typeof record.bargainId !== 'string' || !/^[A-Za-z0-9_-]{10,128}$/.test(record.bargainId))) ||
    (record.deletionState !== undefined && !['active', 'pending_delete'].includes(String(record.deletionState)))
  ) { return false; }
  const keyMatch = record.objectKey.match(SAFE_OBJECT_KEY);
  if (!keyMatch) return false;
  const [, city, hoodIdText, mediaType, , objectId] = keyMatch;
  const extension = path.extname(record.localFileName).toLowerCase();
  if (
    objectId.toLowerCase() !== record.id.toLowerCase() ||
    record.localFileName.toLowerCase() !== `${record.id}${extension}`.toLowerCase() ||
    path.basename(record.objectKey).toLowerCase() !== record.localFileName.toLowerCase() ||
    !Number.isInteger(Number(hoodIdText)) || Number(hoodIdText) < 1 || Number(hoodIdText) > 999 ||
    !['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'].includes(city.toLowerCase()) ||
    mediaType.toLowerCase() !== record.mediaType || SAFE_MIME_BY_EXTENSION[extension] !== record.mimeType
  ) { return false; }
  return record.url === `/api/object-storage/file/${record.id}`;
}
export {
  detectMediaFormatByMagicBytes, validateMediaMagicBytesAndExtension, verifyMediaMagicBytes,
  type DetectedMediaSignature, type MagicByteValidationResult,
} from './fileSignature';
export interface ParsedByteRange { start: number; end: number; }
export function parseSingleByteRange(rangeHeader: string, totalSize: number): ParsedByteRange | null {
  if (!Number.isSafeInteger(totalSize) || totalSize <= 0 || typeof rangeHeader !== 'string') return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;
  const [, startText, endText] = match;
  if (!startText && !endText) return null;
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, totalSize - suffixLength), end: totalSize - 1 };
  }
  const start = Number(startText);
  if (!Number.isSafeInteger(start) || start < 0 || start >= totalSize) return null;
  const requestedEnd = endText ? Number(endText) : totalSize - 1;
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return null;
  return { start, end: Math.min(requestedEnd, totalSize - 1) };
}
export interface MediaAuditReferences {
  objectIds: ReadonlySet<string>; objectKeys: ReadonlySet<string>;
  urls: ReadonlySet<string>; bargainIds: ReadonlySet<string>;
}
export type MediaAuditClassification =
  | 'pending_deletion' | 'referenced' | 'associated_bargain_reference_missing'
  | 'stale_bargain_association' | 'likely_orphan';
export interface MediaAuditObject {
  id: string; objectKey: string; url: string;
  bargainId?: string; deletionState?: 'active' | 'pending_delete';
}
export function classifyStoredObjectReference(record: MediaAuditObject, references: MediaAuditReferences): MediaAuditClassification { if (record.deletionState === 'pending_delete') return 'pending_deletion'; if (references.objectIds.has(record.id) || references.objectKeys.has(record.objectKey) || references.urls.has(record.url)) { return 'referenced'; } if (record.bargainId) { return references.bargainIds.has(record.bargainId) ? 'associated_bargain_reference_missing' : 'stale_bargain_association'; } return 'likely_orphan'; }
export function formatStorageQuotaIntlTelemetry(areaUnit: AreaUnit = 'sqm', intlCurrency: IntlCurrencyCode = 'USD', referenceValuationMillionToman = 12000) {
  return { maxStoredObjects: MAX_STORED_OBJECTS, maxTotalStorageBytes: MAX_TOTAL_STORAGE_BYTES, displayAreaUnitLabel: formatAreaUnitLabel(areaUnit), referenceValuationIntlText: formatMillionTomanAsIntlCurrency(referenceValuationMillionToman, intlCurrency) };
}