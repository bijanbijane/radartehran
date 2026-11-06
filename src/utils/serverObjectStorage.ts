import crypto from 'crypto'; import express, { Express, Request, Response } from 'express'; import { FieldPath } from 'firebase-admin/firestore'; import fs from 'fs'; import path from 'path'; import { ObjectStorageStatusPayload, buildListingObjectKey, getStorageProviderLabelFa } from './objectStorage'; import { deleteFromRemoteS3Compatible, processImageToWebpMax800, resolveObjectStorageRuntimeConfig, uploadToRemoteS3Compatible, validateObjectStoragePayload } from './objectStorageUpload'; import { sanitizeInput, validateCityParam } from './security'; import { getFirebaseAdminFirestoreForServer, verifyAdminApiAuthorization, verifyFirebaseUserAuthorization } from './serverAdminAndTelegramSecurity'; import { BUCKET_DIR, INDEX_FILE, MAX_STORED_OBJECTS, MAX_TOTAL_STORAGE_BYTES, MAX_OBJECTS_PER_OWNER, MAX_BYTES_PER_OWNER, SAFE_OBJECT_ID, StoredObjectRecord, ParsedByteRange, DetectedMediaSignature, MagicByteValidationResult, ReleaseUploadReservation, MediaAuditReferences, MediaAuditClassification, MediaAuditObject, classifyStoredObjectReference, cleanupStaleTemporaryFiles, detectMediaFormatByMagicBytes, ensureBucketLoaded, isSafeStoredObjectRecord, objectStoreIndex, parseSingleByteRange, persistObjectStoreIndexNow, reserveUploadCapacity, resetObjectStorageIndexForTests, scheduleAsyncIndexPersist, validateMediaMagicBytesAndExtension, verifyMediaMagicBytes, writeFileAtomically } from './serverObjectStorageHelpers'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
import { ORPHAN_AUDIT_JOB_SCHEMA_INVALID, ORPHAN_AUDIT_MAX_JOBS, ORPHAN_AUDIT_MAX_PAGES_PER_STEP, ORPHAN_AUDIT_MAX_TOTAL_PAGES, ORPHAN_AUDIT_PAGE_SIZE, StoredObjectDeleteResult, buildOrphanAuditReport, cleanupExpiredOrphanAuditJobs, collectMatchingString, collectMatchingStringArray, countOrphanAuditJobs, createOrphanAuditJob, deleteStoredObjectSafely, getTrackedAuditTargetSets, loadOrphanAuditJob, orphanAuditJobsInProgress, parseBoundedQueryInteger, persistOrphanAuditJob } from './serverObjectStorageOrphanAudit'; import { cleanupBargainObjects, decidePendingDeleteRecovery, deleteStoredObjectWithRetry, describeRecoveryEvent, type PendingDeleteFirestoreState, type StoredObjectCleanupFailure } from './serverObjectStorageCleanup'; import { syncDeletionJournalReconciliationMetrics } from './deletionJournal'; import { getClientIp, recordAbuseSignal } from './serverDeliveryAndAbuseGuard'; const bargainCleanupInProgress = new Set<string>(); const MAX_PENDING_DELETE_RECOVERY_PER_REQUEST = 25; function getRecoveryLimit(raw: unknown): number { const value = typeof raw === 'string' ? Number(raw) : Array.isArray(raw) && typeof raw[0] === 'string' ? Number(raw[0]) : NaN; return !Number.isSafeInteger(value) || value < 1 ? MAX_PENDING_DELETE_RECOVERY_PER_REQUEST : Math.min(value, MAX_PENDING_DELETE_RECOVERY_PER_REQUEST); }
function createLocalDeleteCallback() { return async (record: Readonly<StoredObjectRecord>): Promise<void> => { const root = path.resolve(BUCKET_DIR); const localPath = path.resolve(root, record.localFileName);
    if (path.basename(record.localFileName) !== record.localFileName || !record.localFileName.startsWith(`${record.id}.`) || path.dirname(localPath) !== root) throw new Error('INVALID_LOCAL_OBJECT_PATH');
    try { await fs.promises.unlink(localPath); } catch (error) { if ((error && typeof error === 'object' && 'code' in error ? error.code : undefined) !== 'ENOENT') throw error; } }; } export { BUCKET_DIR, INDEX_FILE, MAX_STORED_OBJECTS, MAX_TOTAL_STORAGE_BYTES, MAX_OBJECTS_PER_OWNER, MAX_BYTES_PER_OWNER, SAFE_OBJECT_ID, ORPHAN_AUDIT_JOB_SCHEMA_INVALID, classifyStoredObjectReference, cleanupBargainObjects, cleanupStaleTemporaryFiles, decidePendingDeleteRecovery, deleteFromRemoteS3Compatible, deleteStoredObjectSafely, deleteStoredObjectWithRetry, describeRecoveryEvent, detectMediaFormatByMagicBytes, ensureBucketLoaded, isSafeStoredObjectRecord, parseSingleByteRange, persistObjectStoreIndexNow, reserveUploadCapacity, resetObjectStorageIndexForTests, scheduleAsyncIndexPersist, validateMediaMagicBytesAndExtension, verifyMediaMagicBytes, writeFileAtomically, type DetectedMediaSignature, type MagicByteValidationResult, type MediaAuditClassification, type MediaAuditObject, type MediaAuditReferences, type ParsedByteRange, type PendingDeleteFirestoreState, type ReleaseUploadReservation, type StoredObjectDeleteResult, type StoredObjectRecord }; const registeredObjectStorageApps = new WeakSet<Express>(); const safeStorageAsync = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response) => { void fn(req, res).catch(() => { if (!res.headersSent) res.status(500).json({ status: 'error', code: 'INTERNAL_STORAGE_ERROR' }); }); }; export function registerObjectStorageRoutes(app: Express, pushAuditLog: (level: 'INFO' | 'WARN' | 'SYNC', event: string) => void): void { if (registeredObjectStorageApps.has(app)) return; registeredObjectStorageApps.add(app); const uploadJsonParser = express.json({ limit: '70mb', strict: true }); const smallJsonParser = express.json({ limit: '16kb', strict: true }); const requireVerifiedFirebaseUser: import('express').RequestHandler = async (req, res, next) => { try { const authResult = await verifyFirebaseUserAuthorization(req.headers as Record<string, string | string[] | undefined>); if (!authResult.authorized || !authResult.uid) {
        res.setHeader('Cache-Control', 'no-store'); res.status(authResult.statusCode).json({ status: 'error', code: authResult.reason, message: authResult.statusCode === 503 ? 'سرویس احراز هویت موقتاً در دسترس نیست.' : 'برای آپلود رسانه باید وارد حساب کاربری تأییدشده شوید.' }); return; }
      res.locals.firebaseUid = authResult.uid; next(); } catch { res.status(503).json({ status: 'error', code: 'UPLOAD_AUTHENTICATION_UNAVAILABLE', message: 'احراز هویت آپلود در دسترس نیست.' }); } }; app.get('/api/object-storage/status', (_req: Request, res: Response) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Pragma', 'no-cache'); res.setHeader('X-Content-Type-Options', 'nosniff'); const cfg = resolveObjectStorageRuntimeConfig(); res.status(200).json({ status: 'ok', providerLabelFa: getStorageProviderLabelFa(cfg.provider), maxImageMb: cfg.maxImageMb, maxVideoMb: cfg.maxVideoMb } satisfies ObjectStorageStatusPayload); }); app.get('/api/object-storage/admin/status', safeStorageAsync(async (req: Request, res: Response) => { const authCheck = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>); if (!authCheck.authorized) { if (authCheck.statusCode === 401 || authCheck.statusCode === 403) recordAbuseSignal(getClientIp(req), 'auth_failure'); res.status(authCheck.statusCode).json({ status: 'error', code: authCheck.reason, message: 'مشاهده وضعیت کامل آبجکت استوریج نیازمند احراز هویت ادمین است.' }); return; }
    await ensureBucketLoaded(); const cfg = resolveObjectStorageRuntimeConfig(); const totalStoredBytes = objectStoreIndex.reduce((acc, item) => acc + (item.sizeBytes || 0), 0); const areaUnit: AreaUnit = req.query.areaUnit === 'sqft' ? 'sqft' : 'sqm'; const intlCurrency: IntlCurrencyCode = req.query.intlCurrency === 'EUR' || req.query.intlCurrency === 'AED' || req.query.intlCurrency === 'IRT' ? req.query.intlCurrency : 'USD'; res.setHeader('Cache-Control', 'no-store'); res.status(200).json({ status: 'ok', provider: cfg.provider, providerLabelFa: getStorageProviderLabelFa(cfg.provider), bucket: cfg.bucket, region: cfg.region, endpointHost: cfg.endpointHost, publicBaseUrl: cfg.publicBaseUrl, s3CredentialsConfigured: cfg.s3CredentialsConfigured, maxImageMb: cfg.maxImageMb, maxVideoMb: cfg.maxVideoMb, totalObjectsCount: objectStoreIndex.length, totalStoredBytes, displayAreaUnitLabel: formatAreaUnitLabel(areaUnit), referenceValuationIntlText: formatMillionTomanAsIntlCurrency(120, intlCurrency, 'en'), recentObjects: objectStoreIndex.slice(0, 12).map(({ localFileName: _lf, ownerUid: _ou, ...pub }) => pub) }); })); app.post('/api/object-storage/upload', requireVerifiedFirebaseUser, uploadJsonParser, safeStorageAsync(async (req: Request, res: Response) => { let releaseCapacityReservation: ReleaseUploadReservation | null = null; try { await ensureBucketLoaded(); const ownerUid = res.locals.firebaseUid as string | undefined; if (!ownerUid) { res.status(401).json({ status: 'error', code: 'MISSING_VERIFIED_OWNER', message: 'شناسهٔ کاربر تأییدشده برای ثبت مالکیت فایل موجود نیست.' }); return; } const cfg = resolveObjectStorageRuntimeConfig(); const rawMediaType = req.body?.mediaType; if (rawMediaType !== 'image' && rawMediaType !== 'video') { res.status(400).json({ status: 'error', code: 'INVALID_MEDIA_TYPE', message: 'نوع رسانه باید تصویر یا ویدیو باشد.' }); return; } const mediaType: 'image' | 'video' = rawMediaType; const inputMimeType = sanitizeInput(req.body?.mimeType || '', 60).toLowerCase(); const rawHoodId = Number(req.body?.hoodId); if (!Number.isSafeInteger(rawHoodId) || rawHoodId < 1 || rawHoodId > 999) { res.status(400).json({ status: 'error', code: 'INVALID_NEIGHBORHOOD_ID', message: 'شناسهٔ محله معتبر نیست.' }); return; }
      const hoodId = rawHoodId; const city = validateCityParam(req.body?.city, 'tehran'); const rawBase64 = typeof req.body?.dataBase64 === 'string' ? req.body.dataBase64.trim() : ''; if (!rawBase64) { res.status(400).json({ status: 'error', code: 'EMPTY_FILE', message: 'محتوای فایل خالی است.' }); return; }
      const maxAllowedBytes = (mediaType === 'video' ? cfg.maxVideoMb : cfg.maxImageMb) * 1024 * 1024; if (rawBase64.length > Math.ceil(maxAllowedBytes / 3) * 4) { res.status(413).json({ status: 'error', code: 'BASE64_PAYLOAD_TOO_LARGE', message: 'حجم فایل از سقف مجاز بیشتر است.' }); return; }
      if (rawBase64.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(rawBase64)) { res.status(400).json({ status: 'error', code: 'INVALID_BASE64', message: 'کدگذاری Base64 فایل معتبر نیست.' }); return; }
      const rawBuffer = Buffer.from(rawBase64, 'base64'); if (rawBuffer.length === 0 || rawBuffer.length > maxAllowedBytes || rawBuffer.toString('base64') !== rawBase64) { res.status(400).json({ status: 'error', code: 'INVALID_DECODED_FILE', message: 'فایل ارسال‌شده معتبر نیست.' }); return; }
      const validation = validateObjectStoragePayload({ buffer: rawBuffer, mediaType, mimeType: inputMimeType, cfg }); if (!validation.ok) { res.status(validation.statusCode).json({ status: 'error', message: validation.errorMessage }); return; }
      const clientFileName = typeof req.body?.fileName === 'string' ? sanitizeInput(req.body.fileName, 120) : ''; const clientExt = clientFileName ? path.extname(clientFileName).toLowerCase() : undefined; const inputMagicCheck = validateMediaMagicBytesAndExtension({ buffer: rawBuffer, mimeType: inputMimeType, mediaType, extension: clientExt });
      if (!inputMagicCheck.valid) { res.status(400).json({ status: 'error', code: inputMagicCheck.reason || 'INVALID_MAGIC_BYTES', message: 'امضای باینری فایل (Magic Bytes) یا پسوند فایل با نوع عکس/ویدیوی مجاز مطابقت ندارد.' }); return; }
      let finalBuffer: Buffer = rawBuffer; let finalMimeType = inputMimeType; if (mediaType === 'image') { try { const processed = await processImageToWebpMax800(rawBuffer, 800); finalBuffer = Buffer.from(processed.buffer); finalMimeType = processed.mimeType; }
        catch { res.status(400).json({ status: 'error', code: 'INVALID_IMAGE', message: 'تصویر خراب است یا امکان پردازش آن وجود ندارد. لطفاً فایل دیگری انتخاب کنید.' }); return; } }
      const objectId = `obj-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const objectKey = buildListingObjectKey({ city, hoodId, mediaType, mimeType: finalMimeType, objectId }); const ext = path.extname(objectKey) || (mediaType === 'video' ? '.mp4' : '.webp'); const finalMagicCheck = validateMediaMagicBytesAndExtension({ buffer: finalBuffer, mimeType: finalMimeType, mediaType, extension: ext });
      if (!finalMagicCheck.valid) { res.status(400).json({ status: 'error', code: finalMagicCheck.reason || 'FINAL_MAGIC_EXTENSION_MISMATCH', message: 'محتوای نهایی فایل با پسوند ذخیره‌سازی تطابق ندارد.' }); return; }
      releaseCapacityReservation = reserveUploadCapacity(ownerUid, finalBuffer.length); if (!releaseCapacityReservation) { res.setHeader('Cache-Control', 'no-store'); res.status(507).json({ status: 'error', code: 'STORAGE_QUOTA_EXCEEDED', message: 'سهمیهٔ فضای رسانهٔ حساب شما یا ظرفیت کلی مخزن تکمیل شده است.' }); return; }
      const localFileName = `${objectId}${ext}`; const localFilePath = path.join(BUCKET_DIR, localFileName);
      try { await writeFileAtomically(localFilePath, finalBuffer, 0o600); } catch (error) { releaseCapacityReservation?.(); releaseCapacityReservation = null; console.error('[OBJECT_STORAGE_LOCAL_WRITE_FAILED]', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
        res.status(500).json({ status: 'error', code: 'LOCAL_FILE_WRITE_FAILED', message: 'ذخیرهٔ پایدار فایل روی سرور انجام نشد؛ آپلود تأیید نشد.' }); return; }
      const record: StoredObjectRecord = { id: objectId, objectKey, bucket: cfg.bucket, provider: cfg.provider, mediaType, mimeType: finalMimeType, sizeBytes: finalBuffer.length, url: `/api/object-storage/file/${objectId}`, remoteS3Synced: false, createdAtIso: new Date().toISOString(), localFileName, ownerUid };
      objectStoreIndex.unshift(record); releaseCapacityReservation?.(); releaseCapacityReservation = null; try { await persistObjectStoreIndexNow(); } catch (error) { const recordIndex = objectStoreIndex.findIndex((item) => item.id === objectId);
        if (recordIndex >= 0) objectStoreIndex.splice(recordIndex, 1); await fs.promises.unlink(localFilePath).catch(() => {}); console.error('[OBJECT_STORAGE_UPLOAD_ROLLBACK]', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
        res.status(500).json({ status: 'error', code: 'OBJECT_INDEX_PERSIST_FAILED', message: 'ذخیرهٔ پایدار اطلاعات فایل ناموفق بود؛ آپلود تأیید نشد.' }); return; }
      record.remoteS3Synced = await uploadToRemoteS3Compatible(objectKey, finalBuffer, finalMimeType, cfg); try { await persistObjectStoreIndexNow(); } catch (error) { record.remoteS3Synced = false; console.error('[OBJECT_STORAGE_REMOTE_STATUS_PERSIST_FAILED]', error instanceof Error ? error.message : 'UNKNOWN_ERROR'); }
      pushAuditLog('INFO', `ذخیره ${mediaType === 'video' ? 'ویدیو' : 'تصویر بهینه‌شده WebP (<=800px)'} در آبجکت استوریج (${cfg.bucket}/${objectKey})`);
      const { localFileName: _hiddenLocalFile, ownerUid: _hiddenOwner, ...publicObject } = record; res.setHeader('Cache-Control', 'no-store'); res.status(200).json({ status: 'ok', mediaObject: publicObject }); } catch (error) { releaseCapacityReservation?.();
      console.error('[OBJECT_STORAGE_UPLOAD_ERROR]', error instanceof Error ? error.message : 'UNKNOWN_ERROR'); res.status(500).json({ status: 'error', code: 'OBJECT_STORAGE_UPLOAD_FAILED', message: 'خطای داخلی در ذخیره‌سازی فایل روی فضای رسانه رخ داد.' }); } }));
  app.post('/api/object-storage/attach-to-bargain', requireVerifiedFirebaseUser, smallJsonParser, safeStorageAsync(async (req: Request, res: Response) => { res.setHeader('Cache-Control', 'no-store'); try { await ensureBucketLoaded();
      const ownerUid = res.locals.firebaseUid as string | undefined; if (!ownerUid) { res.status(401).json({ status: 'error', code: 'MISSING_VERIFIED_OWNER' }); return; }
      const bargainId = typeof req.body?.bargainId === 'string' ? req.body.bargainId.trim() : ''; const suppliedIds: unknown = req.body?.objectIds;
      if (!/^[A-Za-z0-9_-]{10,128}$/.test(bargainId) || !Array.isArray(suppliedIds) || suppliedIds.length < 1 || suppliedIds.length > 6 || suppliedIds.some((id) => typeof id !== 'string' || !SAFE_OBJECT_ID.test(id)) || new Set(suppliedIds).size !== suppliedIds.length) {
        res.status(400).json({ status: 'error', code: 'INVALID_MEDIA_ASSOCIATION', message: 'شناسهٔ آگهی یا فهرست رسانه‌ها معتبر نیست.' }); return; }
      const adminDb = getFirebaseAdminFirestoreForServer(); const [bargainSnap, ownerSnap] = await Promise.all([adminDb.collection('bargains').doc(bargainId).get(), adminDb.collection('bargainOwners').doc(bargainId).get()]);
      const ownerData = ownerSnap.data(); const bargainData = bargainSnap.data(); if (!bargainSnap.exists || !ownerSnap.exists || ownerData?.userId !== ownerUid) { res.status(404).json({ status: 'error', code: 'OWNED_BARGAIN_NOT_FOUND', message: 'آگهی پیدا نشد یا متعلق به این حساب نیست.' }); return; }
      const declaredIds = bargainData?.objectStorageObjectIds; if (!Array.isArray(declaredIds) || declaredIds.length !== suppliedIds.length || declaredIds.some((id: unknown) => typeof id !== 'string' || !suppliedIds.includes(id))) {
        res.status(409).json({ status: 'error', code: 'MEDIA_LIST_MISMATCH', message: 'فهرست رسانه‌های ارسال‌شده با اطلاعات ثبت‌شده در آگهی یکسان نیست.' }); return; }
      const records: StoredObjectRecord[] = []; for (const id of suppliedIds as string[]) { const record = objectStoreIndex.find((item) => item.id === id);
        if (!record || record.ownerUid !== ownerUid || record.deletionState === 'pending_delete') { res.status(404).json({ status: 'error', code: 'MEDIA_OBJECT_NOT_FOUND', message: 'یکی از فایل‌های رسانه پیدا نشد یا در دسترس نیست.' }); return; }
        if (record.bargainId && record.bargainId !== bargainId) { res.status(409).json({ status: 'error', code: 'MEDIA_ALREADY_ATTACHED', message: 'یکی از رسانه‌ها قبلاً به آگهی دیگری متصل شده است.' }); return; }
        records.push(record); }
      const previousAssociations = records.map((record) => record.bargainId); for (const record of records) record.bargainId = bargainId; try { await persistObjectStoreIndexNow(); } catch {
        records.forEach((record, index) => { record.bargainId = previousAssociations[index]; }); await persistObjectStoreIndexNow().catch(() => {});
        res.status(500).json({ status: 'error', code: 'MEDIA_ASSOCIATION_PERSIST_FAILED', message: 'ثبت ارتباط رسانه با آگهی پایدار نشد.' }); return; }
      res.status(200).json({ status: 'ok', bargainId, attachedCount: records.length });
    } catch { res.status(503).json({ status: 'error', code: 'MEDIA_ASSOCIATION_UNAVAILABLE', message: 'سرویس ثبت ارتباط رسانه موقتاً در دسترس نیست.' }); }
  }));
  app.post('/api/object-storage/cleanup-bargain/:bargainId', safeStorageAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const bargainId = req.params.bargainId || '';
    if (!/^[A-Za-z0-9_-]{10,128}$/.test(bargainId)) { res.status(400).json({ status: 'error', code: 'INVALID_BARGAIN_ID' }); return; }
    const authCheck = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!authCheck.authorized) { if (authCheck.statusCode === 401 || authCheck.statusCode === 403) recordAbuseSignal(getClientIp(req), 'auth_failure'); res.status(authCheck.statusCode).json({ status: 'error', code: authCheck.reason, message: 'پاکسازی رسانهٔ آگهی فقط برای مدیر مجاز است.' }); return; }
    if (bargainCleanupInProgress.has(bargainId)) { res.status(409).json({ status: 'error', code: 'CLEANUP_ALREADY_RUNNING' }); return; }
    bargainCleanupInProgress.add(bargainId);
    try {
      await ensureBucketLoaded();
      const adminDb = getFirebaseAdminFirestoreForServer();
      const [bargainSnap, ownerSnap] = await Promise.all([adminDb.collection('bargains').doc(bargainId).get(), adminDb.collection('bargainOwners').doc(bargainId).get()]);
      if (bargainSnap.exists || ownerSnap.exists) { res.status(409).json({ status: 'error', code: 'BARGAIN_STILL_EXISTS', message: 'تا زمانی که سند آگهی و سند مالکیت آن هر دو حذف نشده‌اند، رسانه‌ها پاک نمی‌شوند.' }); return; }
      const cfg = resolveObjectStorageRuntimeConfig();
      const result = await cleanupBargainObjects(bargainId, { records: objectStoreIndex, persistIndex: persistObjectStoreIndexNow,
        deleteRemote: async (record) => deleteFromRemoteS3Compatible(record.objectKey, cfg), deleteLocal: createLocalDeleteCallback(),
      });
      if (result.status === 'partial') {
        const cleanupPendingIds = result.failures.map((f) => f.objectId);
        pushAuditLog('WARN', `پاکسازی ناقص رسانه‌های آگهی ${bargainId}: ${result.deletedCount} حذف شد؛ ${result.failedCount} مورد نیازمند بررسی است.`);
        res.status(207).json({ status: 'partial', bargainId, candidateCount: result.candidateCount, deletedCount: result.deletedCount, failedCount: result.failedCount, deletedIds: result.deletedIds, failures: result.failures, cleanupPendingIds, retryable: result.failures.some((failure) => failure.retryable) });
        return;
      }
      if (result.status === 'no_associated_objects') {
        pushAuditLog('WARN', `هیچ رکورد رسانه‌ای با ارتباط تأییدشده برای آگهی ${bargainId} پیدا نشد.`);
        res.status(200).json({ status: 'ok', bargainId, candidateCount: 0, deletedCount: 0, failedCount: 0, cleanupPendingIds: [], mediaAssociationFound: false, auditRequired: true, message: 'رسانه‌ای با ارتباط ثبت‌شده پیدا نشد؛ این پاسخ به معنی اثبات نبود رسانهٔ یتیم نیست.' });
        return;
      }
      pushAuditLog('INFO', `پاکسازی رسانه‌های آگهی ${bargainId} با موفقیت انجام شد.`);
      res.status(200).json({ status: 'ok', bargainId, candidateCount: result.candidateCount, deletedCount: result.deletedCount, failedCount: 0, deletedIds: result.deletedIds, cleanupPendingIds: [], auditRequired: false });
    } catch (error) {
      console.error('[BARGAIN_MEDIA_CLEANUP_FAILED]', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
      res.status(503).json({ status: 'error', code: 'BARGAIN_MEDIA_CLEANUP_UNAVAILABLE', message: 'پاکسازی رسانه‌ها کامل نشد. وضعیت باید بررسی و در صورت امکان دوباره اجرا شود.' });
    } finally { bargainCleanupInProgress.delete(bargainId); }
  }));
  app.get('/api/object-storage/file/:objectId', safeStorageAsync(async (req: Request, res: Response) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    await ensureBucketLoaded();
    const objectId = req.params.objectId || '';
    if (!/^obj-\d{10,16}-[a-f0-9]{8}$/i.test(objectId)) { res.status(404).json({ status: 'error', code: 'OBJECT_NOT_FOUND', message: 'فایل موردنظر پیدا نشد.' }); return; }
    const record = objectStoreIndex.find((item) => item.id === objectId);
    if (!record || (record.deletionState !== undefined && record.deletionState !== 'active')) { res.status(404).json({ status: 'error', code: 'OBJECT_NOT_FOUND', message: record?.deletionState ? 'این رسانه دیگر در دسترس نیست.' : 'فایل موردنظر پیدا نشد.' }); return; }
    const allowedExtensions = new Set(['.webp', '.jpg', '.jpeg', '.png', '.mp4', '.mov', '.webm']);
    const filename = record.localFileName; const extension = path.extname(filename).toLowerCase();
    if (path.basename(filename) !== filename || !filename.startsWith(`${record.id}.`) || !allowedExtensions.has(extension) || !isSafeStoredObjectRecord(record)) {
      pushAuditLog('WARN', `رکورد رسانهٔ نامعتبر هنگام دریافت فایل شناسایی شد (${objectId}).`);
      res.status(500).json({ status: 'error', code: 'INVALID_OBJECT_RECORD', message: 'رکورد داخلی رسانه معتبر نیست.' }); return;
    }
    const bucketRoot = path.resolve(BUCKET_DIR); const filePath = path.resolve(bucketRoot, filename);
    if (path.dirname(filePath) !== bucketRoot) { res.status(500).json({ status: 'error', code: 'INVALID_OBJECT_PATH', message: 'مسیر داخلی رسانه معتبر نیست.' }); return; }
    try {
      const stat = await fs.promises.lstat(filePath);
      if (stat.isSymbolicLink() || !stat.isFile()) { res.status(404).end(); return; }
      res.setHeader('Content-Type', record.mimeType); res.setHeader('Content-Disposition', `inline; filename="${filename}"`); res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; sandbox"); res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate'); res.setHeader('Accept-Ranges', 'bytes');
      const rangeHeader = req.headers.range;
      if (typeof rangeHeader === 'string' && record.mediaType === 'video') {
        const range = !rangeHeader.includes(',') ? parseSingleByteRange(rangeHeader, stat.size) : null;
        if (!range) { res.status(416); res.setHeader('Content-Range', `bytes */${stat.size}`); res.setHeader('Content-Length', '0'); res.end(); return; }
        const chunkSize = range.end - range.start + 1;
        res.status(206); res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`); res.setHeader('Content-Length', String(chunkSize));
        const stream = fs.createReadStream(filePath, { start: range.start, end: range.end });
        stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
        stream.pipe(res); return;
      }
      res.setHeader('Content-Length', String(stat.size));
      const stream = fs.createReadStream(filePath);
      stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
      stream.pipe(res);
    } catch { res.status(404).end(); }
  }));
  app.delete('/api/object-storage/file/:objectId', safeStorageAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    await ensureBucketLoaded();
    const safeId = sanitizeInput(req.params.objectId || '', 64).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!SAFE_OBJECT_ID.test(safeId)) { res.status(400).json({ status: 'error', code: 'INVALID_OBJECT_ID', message: 'شناسهٔ فایل معتبر نیست.' }); return; }
    const headers = req.headers as Record<string, string | string[] | undefined>;
    const [adminAuth, userAuth] = await Promise.all([verifyAdminApiAuthorization(headers), verifyFirebaseUserAuthorization(headers)]);
    const isAdmin = adminAuth.authorized; const isVerifiedUser = userAuth.authorized && Boolean(userAuth.uid);
    if (!isAdmin && !isVerifiedUser) {
      const statusCode = userAuth.statusCode === 503 || adminAuth.statusCode === 503 ? 503 : 401;
      res.status(statusCode).json({ status: 'error', code: userAuth.reason || adminAuth.reason, message: 'حذف فایل نیازمند ورود به حساب کاربری مالک فایل یا احراز هویت مدیر است.' }); return;
    }
    const idx = objectStoreIndex.findIndex((item) => item.id === safeId);
    if (idx === -1) { res.status(404).json({ status: 'error', code: 'OBJECT_NOT_FOUND', message: 'فایل مورد نظر در فضای ذخیره‌سازی یافت نشد.' }); return; }
    const removed = objectStoreIndex[idx];
    const isOwner = Boolean(userAuth.uid && removed.ownerUid && removed.ownerUid === userAuth.uid);
    if (!isAdmin && !isOwner) { res.status(404).json({ status: 'error', code: 'OBJECT_NOT_FOUND', message: 'فایل مورد نظر یافت نشد یا متعلق به حساب شما نیست.' }); return; }
    if (removed.bargainId) { res.status(409).json({ status: 'error', code: 'MEDIA_ATTACHED_TO_BARGAIN', message: 'این رسانه به یک آگهی متصل است و باید از مسیر پاکسازی آگهی حذف شود.' }); return; }
    const cfg = resolveObjectStorageRuntimeConfig();
    const deletionResult = await deleteStoredObjectWithRetry(removed.id, { kind: 'unattached_only' }, {
      records: objectStoreIndex, persistIndex: persistObjectStoreIndexNow,
      deleteRemote: async (record) => deleteFromRemoteS3Compatible(record.objectKey, cfg), deleteLocal: createLocalDeleteCallback(),
    });
    if (deletionResult.status === 'failed') {
      const responseByReason: Record<StoredObjectCleanupFailure, { statusCode: number; code: string; message: string }> = {
        object_not_found: { statusCode: 404, code: 'OBJECT_NOT_FOUND', message: 'رسانه پیدا نشد.' },
        association_mismatch: { statusCode: 409, code: 'MEDIA_ASSOCIATION_MISMATCH', message: 'وضعیت اتصال رسانه به آگهی تغییر کرده است.' },
        invalid_record: { statusCode: 500, code: 'INVALID_OBJECT_RECORD', message: 'رکورد رسانه معتبر نیست.' },
        already_in_progress: { statusCode: 409, code: 'OBJECT_DELETE_IN_PROGRESS', message: 'حذف این رسانه هم‌اکنون در حال انجام است.' },
        index_persist_failed: { statusCode: 500, code: 'OBJECT_DELETE_INDEX_PERSIST_FAILED', message: 'وضعیت حذف پایدار نشد؛ عملیات برای تلاش مجدد حفظ شده است.' },
        remote_delete_failed: { statusCode: 502, code: 'REMOTE_DELETE_FAILED', message: 'حذف نسخهٔ ابری تأیید نشد؛ نسخهٔ محلی حذف نشد.' },
        local_delete_failed: { statusCode: 500, code: 'LOCAL_DELETE_FAILED', message: 'حذف فایل محلی کامل نشد؛ رکورد برای تلاش مجدد حفظ شده است.' },
      };
      const failure = responseByReason[deletionResult.reason];
      res.status(failure.statusCode).json({ status: 'error', code: failure.code, message: failure.message, retryable: deletionResult.retryable }); return;
    }
    pushAuditLog('WARN', `حذف رسانه (${removed.id}) توسط ${isAdmin ? 'مدیر' : 'مالک فایل'}`);
    res.status(200).json({ status: 'ok', deletedId: removed.id, localCleanupPending: false });
  }));
  app.post('/api/object-storage/admin/reconcile-pending-deletes', safeStorageAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const authCheck = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!authCheck.authorized) { if (authCheck.statusCode === 401 || authCheck.statusCode === 403) recordAbuseSignal(getClientIp(req), 'auth_failure'); res.status(authCheck.statusCode).json({ status: 'error', code: authCheck.reason, message: 'بازیابی حذف‌های نیمه‌تمام فقط برای مدیر مجاز است.' }); return; }
    try {
      await ensureBucketLoaded();
      const limit = getRecoveryLimit(req.query.limit);
      const allPending = objectStoreIndex.filter((item) => item.deletionState === 'pending_delete');
      const pendingSnapshots = allPending.slice(0, limit).map((item) => ({ ...item }));
      if (pendingSnapshots.length === 0) { res.status(200).json({ status: 'ok', limit, scannedPendingCount: 0, deletedCount: 0, skippedCount: 0, failedCount: 0, blockedCount: 0, journalSyncedCount: 0, morePendingRecords: false, deletedIds: [], failures: [], blocked: [] }); return; }
      const bargainIds = Array.from(new Set(pendingSnapshots.map((item) => item.bargainId).filter((value): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{10,128}$/.test(value))));
      const firestoreStates = new Map<string, PendingDeleteFirestoreState>();
      if (bargainIds.length > 0) {
        const adminDb = getFirebaseAdminFirestoreForServer();
        for (const bargainId of bargainIds) {
          const [bargainSnap, ownerSnap] = await Promise.all([adminDb.collection('bargains').doc(bargainId).get(), adminDb.collection('bargainOwners').doc(bargainId).get()]);
          firestoreStates.set(bargainId, { bargainExists: bargainSnap.exists, ownerExists: ownerSnap.exists });
        }
      }
      const cfg = resolveObjectStorageRuntimeConfig();
      const deletedIds: string[] = [];
      const failures: Array<{ objectId: string; reason: StoredObjectCleanupFailure; retryable: boolean }> = [];
      const blocked: Array<{ objectId: string; reason: string }> = [];
      let skippedNonBlockedCount = 0;
      for (const snapshot of pendingSnapshots) {
        const current = objectStoreIndex.find((item) => item.id === snapshot.id);
        if (!current) { skippedNonBlockedCount += 1; continue; }
        const decision = decidePendingDeleteRecovery(current, current.bargainId ? firestoreStates.get(current.bargainId) : undefined);
        if (decision.action === 'skip_not_pending') { skippedNonBlockedCount += 1; continue; }
        if (decision.action === 'blocked') {
          blocked.push({ objectId: decision.objectId, reason: decision.reason });
          pushAuditLog('WARN', describeRecoveryEvent({ objectId: decision.objectId, outcome: 'blocked', reason: decision.reason })); continue;
        }
        const result = await deleteStoredObjectWithRetry(decision.objectId, decision.policy, {
          records: objectStoreIndex, persistIndex: persistObjectStoreIndexNow,
          deleteRemote: async (record) => deleteFromRemoteS3Compatible(record.objectKey, cfg), deleteLocal: createLocalDeleteCallback(),
        });
        if (result.status === 'deleted') {
          deletedIds.push(result.objectId);
          pushAuditLog('INFO', describeRecoveryEvent({ objectId: result.objectId, outcome: 'deleted' })); continue;
        }
        failures.push({ objectId: result.objectId, reason: result.reason, retryable: result.retryable });
        pushAuditLog('WARN', describeRecoveryEvent({ objectId: result.objectId, outcome: 'failed', reason: result.reason, retryable: result.retryable }));
      }
      const metrics = await syncDeletionJournalReconciliationMetrics({ deletedIds, blocked, failures, skippedNonBlockedCount });
      const morePendingRecords = allPending.length > pendingSnapshots.length;
      const hasIncompleteWork = failures.length > 0 || blocked.length > 0;
      res.status(hasIncompleteWork ? 207 : 200).json({ status: hasIncompleteWork ? 'partial' : 'ok', limit, scannedPendingCount: pendingSnapshots.length, deletedCount: metrics.deletedCount, skippedCount: metrics.skippedCount, failedCount: metrics.failedCount, journalSyncedCount: metrics.journalSyncedCount, blockedCount: blocked.length, morePendingRecords, deletedIds, failures, blocked });
    } catch (error) {
      console.error('[OBJECT_STORAGE_PENDING_DELETE_RECOVERY_FAILED]', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
      res.status(503).json({ status: 'error', code: 'PENDING_DELETE_RECOVERY_UNAVAILABLE', message: 'بازیابی حذف‌های نیمه‌تمام کامل نشد. وضعیت رکوردها برای تلاش بعدی حفظ شده است.' });
    }
  }));
  app.post('/api/object-storage/admin/orphan-audit/jobs', safeStorageAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const authCheck = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!authCheck.authorized) { if (authCheck.statusCode === 401 || authCheck.statusCode === 403) recordAbuseSignal(getClientIp(req), 'auth_failure'); res.status(authCheck.statusCode).json({ status: 'error', code: authCheck.reason, message: 'شروع گزارش رسانه‌های یتیم نیازمند احراز هویت مدیر است.' }); return; }
    try {
      await ensureBucketLoaded(); await cleanupExpiredOrphanAuditJobs();
      if ((await countOrphanAuditJobs()) >= ORPHAN_AUDIT_MAX_JOBS) { res.status(429).json({ status: 'error', code: 'ORPHAN_AUDIT_JOB_LIMIT_REACHED', message: 'تعداد گزارش‌های ذخیره‌شده زیاد است. گزارش‌های قدیمی را پاکسازی کنید.' }); return; }
      const job = createOrphanAuditJob(crypto.randomBytes(16).toString('hex'), authCheck.actorUid ?? null, authCheck.actorEmail ?? null);
      await persistOrphanAuditJob(job);
      res.status(201).json({ status: 'ok', auditId: job.id, mode: 'dry-run', deletionPerformed: false, scanStatus: job.status, storageObjectsSnapshotCount: job.storageObjects.length, pageSize: job.pageSize, maxPages: job.maxPages, nextAction: 'POST /api/object-storage/admin/orphan-audit/jobs/:auditId/step' });
    } catch (error) {
      console.error('[OBJECT_STORAGE_ORPHAN_AUDIT_CREATE_FAILED]', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
      res.status(503).json({ status: 'error', code: 'ORPHAN_AUDIT_CREATE_FAILED', message: 'ایجاد گزارش ممیزی ممکن نشد. هیچ رسانه‌ای حذف نشده است.' });
    }
  }));
  app.post('/api/object-storage/admin/orphan-audit/jobs/:auditId/step', safeStorageAsync(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const authCheck = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!authCheck.authorized) { if (authCheck.statusCode === 401 || authCheck.statusCode === 403) recordAbuseSignal(getClientIp(req), 'auth_failure'); res.status(authCheck.statusCode).json({ status: 'error', code: authCheck.reason, message: 'ادامهٔ گزارش ممیزی نیازمند احراز هویت مدیر است.' }); return; }
    const auditId = req.params.auditId || '';
    if (!/^[a-f0-9]{32}$/.test(auditId)) { res.status(400).json({ status: 'error', code: 'INVALID_ORPHAN_AUDIT_ID' }); return; }
    if (orphanAuditJobsInProgress.has(auditId)) { res.status(409).json({ status: 'error', code: 'ORPHAN_AUDIT_STEP_ALREADY_RUNNING' }); return; }
    orphanAuditJobsInProgress.add(auditId);
    try {
      const job = await loadOrphanAuditJob(auditId);
      if (!job) { res.status(404).json({ status: 'error', code: 'ORPHAN_AUDIT_JOB_NOT_FOUND' }); return; }
      if (job.status !== 'scanning') {
        res.status(200).json({ status: 'ok', auditId, scanStatus: job.status, scannedBargains: job.scannedBargains, scannedPages: job.scannedPages, lastDocumentId: job.lastDocumentId, resultReady: job.status === 'completed', deletionPerformed: false }); return;
      }
      const requestedPages = parseBoundedQueryInteger(req.query.pages, 5, 1, ORPHAN_AUDIT_MAX_PAGES_PER_STEP);
      const adminDb = getFirebaseAdminFirestoreForServer();
      const targetSets = getTrackedAuditTargetSets(job);
      const matchedObjectIds = new Set(job.references.objectIds), matchedObjectKeys = new Set(job.references.objectKeys);
      const matchedUrls = new Set(job.references.urls), matchedBargainIds = new Set(job.references.bargainIds);
      let processedPages = 0;
      for (let step = 0; step < requestedPages; step++) {
        if (job.scannedPages >= ORPHAN_AUDIT_MAX_TOTAL_PAGES) {
          job.status = 'incomplete'; job.completedAtIso = new Date().toISOString(); job.lastErrorCode = 'MAX_SCAN_PAGE_LIMIT_REACHED';
          await persistOrphanAuditJob(job); break;
        }
        const baseQuery = adminDb.collection('bargains').select('objectStorageObjectIds', 'objectStorageKeys', 'imageUrl', 'imageUrls', 'videoUrl').orderBy(FieldPath.documentId()).limit(ORPHAN_AUDIT_PAGE_SIZE);
        const page = job.lastDocumentId ? await baseQuery.startAfter(job.lastDocumentId).get() : await baseQuery.get();
        if (page.empty) { job.status = 'completed'; job.completedAtIso = new Date().toISOString(); job.lastErrorCode = undefined; await persistOrphanAuditJob(job); break; }
        for (const document of page.docs) {
          const data = document.data();
          collectMatchingStringArray(data.objectStorageObjectIds, targetSets.objectIds, matchedObjectIds);
          collectMatchingStringArray(data.objectStorageKeys, targetSets.objectKeys, matchedObjectKeys);
          collectMatchingString(data.imageUrl, targetSets.urls, matchedUrls);
          collectMatchingStringArray(data.imageUrls, targetSets.urls, matchedUrls);
          collectMatchingString(data.videoUrl, targetSets.urls, matchedUrls);
          collectMatchingString(document.id, targetSets.bargainIds, matchedBargainIds);
        }
        job.references.objectIds = Array.from(matchedObjectIds); job.references.objectKeys = Array.from(matchedObjectKeys);
        job.references.urls = Array.from(matchedUrls); job.references.bargainIds = Array.from(matchedBargainIds);
        job.lastDocumentId = page.docs[page.docs.length - 1].id; job.scannedBargains += page.size; job.scannedPages++; processedPages++; job.lastErrorCode = undefined;
        if (page.size < ORPHAN_AUDIT_PAGE_SIZE) { job.status = 'completed'; job.completedAtIso = new Date().toISOString(); }
        else if (job.scannedPages >= ORPHAN_AUDIT_MAX_TOTAL_PAGES) { job.status = 'incomplete'; job.completedAtIso = new Date().toISOString(); job.lastErrorCode = 'MAX_SCAN_PAGE_LIMIT_REACHED'; }
        await persistOrphanAuditJob(job);
        if (job.status !== 'scanning') break;
      }
      res.status(200).json({ status: 'ok', auditId, scanStatus: job.status, processedPages, scannedPages: job.scannedPages, scannedBargains: job.scannedBargains, lastDocumentId: job.lastDocumentId, lastErrorCode: job.lastErrorCode ?? null, resultReady: job.status === 'completed', canContinue: job.status === 'scanning', deletionPerformed: false });
    } catch (error) {
      console.error('[OBJECT_STORAGE_ORPHAN_AUDIT_STEP_FAILED]', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
      res.status(503).json({ status: 'error', code: 'ORPHAN_AUDIT_STEP_FAILED', message: 'اسکن این مرحله کامل نشد. وضعیت ذخیره‌شده را بررسی کنید و در صورت امکان دوباره ادامه دهید.', deletionPerformed: false });
    } finally { orphanAuditJobsInProgress.delete(auditId); }
  }));
  app.get('/api/object-storage/admin/orphan-audit/jobs/:auditId', safeStorageAsync(async (req: Request, res: Response) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); const authCheck = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>); if (!authCheck.authorized) { if (authCheck.statusCode === 401 || authCheck.statusCode === 403) recordAbuseSignal(getClientIp(req), 'auth_failure'); res.status(authCheck.statusCode).json({ status: 'error', code: authCheck.reason, message: 'مشاهدهٔ نتیجهٔ گزارش نیازمند احراز هویت مدیر است.' }); return; } const auditId = req.params.auditId || ''; if (!/^[a-f0-9]{32}$/.test(auditId)) { res.status(400).json({ status: 'error', code: 'INVALID_ORPHAN_AUDIT_ID' }); return; } try { const job = await loadOrphanAuditJob(auditId); if (!job) { res.status(404).json({ status: 'error', code: 'ORPHAN_AUDIT_JOB_NOT_FOUND' }); return; } const limit = parseBoundedQueryInteger(req.query.limit, 50, 1, 100); const offset = parseBoundedQueryInteger(req.query.offset, 0, 0, MAX_STORED_OBJECTS); const baseResponse = { status: 'ok', auditId, mode: 'dry-run', deletionPerformed: false, scanStatus: job.status, resultReady: job.status === 'completed', createdAtIso: job.createdAtIso, updatedAtIso: job.updatedAtIso, completedAtIso: job.completedAtIso ?? null, scannedPages: job.scannedPages, scannedBargains: job.scannedBargains, storageObjectsSnapshotCount: job.storageObjects.length, lastDocumentId: job.lastDocumentId, lastErrorCode: job.lastErrorCode ?? null, consistency: 'best-effort-non-transactional', warning: 'این گزارش فقط برای تشخیص است. نتیجهٔ آن به‌تنهایی مجوز حذف فایل نیست.' }; if (job.status !== 'completed') { res.status(200).json({ ...baseResponse, summary: null, totalRows: null, items: [], nextOffset: null }); return; } const report = buildOrphanAuditReport(job); const items = report.items.slice(offset, offset + limit); const nextOffset = offset + items.length < report.items.length ? offset + items.length : null; res.status(200).json({ ...baseResponse, summary: report.counts, totalRows: report.items.length, offset, limit, items, nextOffset }); } catch (error) { console.error('[OBJECT_STORAGE_ORPHAN_AUDIT_READ_FAILED]', error instanceof Error ? error.message : 'UNKNOWN_ERROR'); res.status(503).json({ status: 'error', code: 'ORPHAN_AUDIT_READ_FAILED', message: 'خواندن نتیجهٔ ممیزی ممکن نشد. هیچ رسانه‌ای حذف نشده است.' }); } })); }