import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path'; import type { Express, Request, Response } from 'express'; import { sanitizeInput, validateCityParam, isValidFirestoreDocId } from './security'; import { verifyAuthenticatedUserHeader, verifyAdminApiAuthorization } from './serverAdminAndTelegramSecurity'; import { resolveBackupEncryptionKeysFromEnv, createAuthenticatedEncryptedBackup, decryptAndVerifyEncryptedBackupWithRotation, type EncryptedBackupEnvelope } from './serverAdminSodAndBackupSecurity'; import { recordLiveAdminSecurityAudit } from './serverForensicsAndIncidentResponse'; import { getClientIp as resolveClientIp, recordAbuseSignal } from './serverDeliveryAndAbuseGuard'; import { BUCKET_DIR, ensureBucketLoaded, objectStoreIndex, persistObjectStoreIndexNow, reserveUploadCapacity, writeFileAtomically } from './serverObjectStorageHelpers'; import { validateMediaMagicBytesAndExtension, validateVideoContainerSafety } from './fileSignature'; import { buildListingObjectKey, buildObjectStorageKey } from './objectStorage'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export interface BackupVersionMetadata { versionId: string; createdAtIso: string; createdByEmail: string; schemaVersion: string; encryptionFormatVersion: string; manifestHmacSha256: string;
  recordCounts: { neighborhoods: number; bargains: number; sponsorRequests: number }; } const backupVersionHistory: BackupVersionMetadata[] = []; export function getBackupVersionHistoryMetadata(): readonly BackupVersionMetadata[] { return backupVersionHistory; }
export type ExternalIntegrationId = 'gemini_ai' | 'market_scraper' | 'telegram_bot' | 'remote_s3_storage'; export type CircuitBreakerState = 'enabled' | 'temporarily_disabled' | 'degraded' | 'recovery_testing'; const integrationCircuitBreakers: Record<
  ExternalIntegrationId, { state: CircuitBreakerState; updatedAtIso: string; updatedByEmail: string; reason: string } > = { gemini_ai: { state: 'enabled', updatedAtIso: new Date(0).toISOString(), updatedByEmail: 'system', reason: 'initial' }, market_scraper: { state: 'enabled', updatedAtIso: new Date(0).toISOString(), updatedByEmail: 'system', reason: 'initial' }, telegram_bot: { state: 'enabled', updatedAtIso: new Date(0).toISOString(), updatedByEmail: 'system', reason: 'initial' }, remote_s3_storage: { state: 'enabled', updatedAtIso: new Date(0).toISOString(), updatedByEmail: 'system', reason: 'initial' }, }; export function getIntegrationCircuitBreakerState(id: ExternalIntegrationId): { state: CircuitBreakerState; updatedAtIso: string; updatedByEmail: string; reason: string; coreSecurityRemainsActive: true; } { return { ...integrationCircuitBreakers[id], coreSecurityRemainsActive: true }; }
export function setIntegrationCircuitBreakerState( id: ExternalIntegrationId, state: CircuitBreakerState, actorEmail: string, reason: string, ): { integrationId: ExternalIntegrationId; state: CircuitBreakerState; updatedAtIso: string; updatedByEmail: string; reason: string; coreSecurityRemainsActive: true; } { const updatedAtIso = new Date().toISOString(); const safeReason = sanitizeInput(reason || 'manual_circuit_update', 120); integrationCircuitBreakers[id] = { state, updatedAtIso, updatedByEmail: actorEmail || 'primary-admin', reason: safeReason }; recordLiveAdminSecurityAudit({
    action: `CIRCUIT_BREAKER_${id.toUpperCase()}_${state.toUpperCase()}`,
    actorEmail: actorEmail || 'primary-admin', outcome: 'allowed', reason: safeReason, }); return { integrationId: id, ...integrationCircuitBreakers[id], coreSecurityRemainsActive: true }; } export function validateMarketIndicatorAnomaly( indicator: 'usdToman' | 'gold18kToman' | 'buyPerSqm' | 'rahn80m', candidateValue: unknown, previousValidValue: number, areaUnit: AreaUnit = 'sqm', intlCurrency: IntlCurrencyCode = 'USD', ): { accepted: boolean; effectiveValue: number; reason?: string; displayAreaUnitLabel?: string; effectiveValueIntlText?: string } { const num = Number(candidateValue); const ranges: Record<typeof indicator, [number, number]> = { usdToman: [40_000, 350_000], gold18kToman: [2_000_000, 35_000_000], buyPerSqm: [10, 5_000], rahn80m: [50, 100_000], }; const [minVal, maxVal] = ranges[indicator]; const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit); if (!Number.isFinite(num) || num < minVal || num > maxVal) { return { accepted: false, effectiveValue: previousValidValue, reason: 'OUT_OF_PLAUSIBLE_RANGE', displayAreaUnitLabel, effectiveValueIntlText: formatMillionTomanAsIntlCurrency(previousValidValue, intlCurrency, 'en') }; }
  if (Number.isFinite(previousValidValue) && previousValidValue > 0) { const ratio = num / previousValidValue; if (ratio < 0.25 || ratio > 3.5) { return { accepted: false, effectiveValue: previousValidValue, reason: 'EXTREME_SINGLE_STEP_ANOMALY', displayAreaUnitLabel, effectiveValueIntlText: formatMillionTomanAsIntlCurrency(previousValidValue, intlCurrency, 'en') }; } }
  const effectiveValue = Math.round(num); return { accepted: true, effectiveValue, displayAreaUnitLabel, effectiveValueIntlText: formatMillionTomanAsIntlCurrency(effectiveValue, intlCurrency, 'en') }; }
export function buildCascadeDeletionPlan(params: { bargainId: string; ownerUid: string; callerUid: string; callerIsAdmin: boolean; attachedMediaIds: string[]; sharedMediaIds?: ReadonlySet<string>; }): { authorized: boolean; firestorePathsToDelete: string[]; preservedSharedPaths: string[]; mediaIdsMarkedPendingDelete: string[]; mediaIdsPreservedBecauseShared: string[]; } { if (!isValidFirestoreDocId(params.bargainId)) { return { authorized: false, firestorePathsToDelete: [], preservedSharedPaths: [], mediaIdsMarkedPendingDelete: [], mediaIdsPreservedBecauseShared: [],
    }; }
  const isOwner = Boolean(params.callerUid && params.ownerUid && params.callerUid === params.ownerUid); if (!isOwner && !params.callerIsAdmin) { return { authorized: false, firestorePathsToDelete: [], preservedSharedPaths: [], mediaIdsMarkedPendingDelete: [], mediaIdsPreservedBecauseShared: [], }; }
  const shared = params.sharedMediaIds ?? new Set<string>(); const mediaIdsMarkedPendingDelete: string[] = []; const mediaIdsPreservedBecauseShared: string[] = []; for (const mediaId of Array.from(new Set(params.attachedMediaIds))) {
    if (!isValidFirestoreDocId(mediaId)) continue; if (shared.has(mediaId)) mediaIdsPreservedBecauseShared.push(mediaId); else mediaIdsMarkedPendingDelete.push(mediaId); }
  return { authorized: true,
    firestorePathsToDelete: [`/bargains/${params.bargainId}`, `/bargainOwners/${params.bargainId}`],
    preservedSharedPaths: ['/neighborhoodOverrides', '/publicSponsors'], mediaIdsMarkedPendingDelete, mediaIdsPreservedBecauseShared, }; }
interface ChunkedUploadSession { sessionId: string; ownerUid: string; city: 'tehran' | 'karaj' | 'mashhad' | 'isfahan' | 'shiraz';
  hoodId: number; mediaType: 'image' | 'video'; mimeType: string; fileName: string; totalChunks: number; maxBytes: number; chunks: Map<number, Buffer>;
  receivedBytes: number; createdAtMs: number; completed: boolean; }
const activeChunkSessions = new Map<string, ChunkedUploadSession>();
const MAX_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_ACTIVE_CHUNK_SESSIONS_TOTAL = 25;
const MAX_ACTIVE_CHUNK_SESSIONS_PER_USER = 2;
const SESSION_TTL_MS = 15 * 60 * 1000;
export function resetChunkUploadSessionsForTests(): void { activeChunkSessions.clear(); }
function cleanupExpiredChunkSessions(now = Date.now()): void {
  for (const [id, sess] of activeChunkSessions.entries()) {
    if (now - sess.createdAtMs > SESSION_TTL_MS) activeChunkSessions.delete(id);
  }
}
const registeredBackupApps = new WeakSet<Express>();
export function registerBackupAndChunkUploadRoutes(
  app: Express,
  deps?: { checkRateLimit: (ip: string, bucket: import('./serverDeliveryAndAbuseGuard').RateBucketType, max: number, windowMs: number) => boolean; getClientIp: (req: Request) => string },
): void {
  if (registeredBackupApps.has(app)) return;
  registeredBackupApps.add(app);
  const clientIpOf = (req: Request): string => (deps?.getClientIp ?? resolveClientIp)(req);
  const checkUploadRate = (req: Request, max: number): boolean =>
    deps ? deps.checkRateLimit(clientIpOf(req), 'upload', max, 10 * 60 * 1000) : true;
  app.post('/api/admin/circuit-breaker', (req: Request, res: Response) => {
    void (async () => {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      const auth = await verifyAdminApiAuthorization(req.headers, process.env, { requirePrimaryBootstrapAdmin: true, disallowStaticToken: true });
      if (!auth.authorized) { if (auth.statusCode === 401 || auth.statusCode === 403) recordAbuseSignal(clientIpOf(req), 'auth_failure'); res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
      const id = req.body?.integrationId as ExternalIntegrationId;
      const state = req.body?.state as CircuitBreakerState;
      const validIds: ExternalIntegrationId[] = ['gemini_ai', 'market_scraper', 'telegram_bot', 'remote_s3_storage'];
      const validStates: CircuitBreakerState[] = ['enabled', 'temporarily_disabled', 'degraded', 'recovery_testing'];
      if (!validIds.includes(id) || !validStates.includes(state)) { res.status(400).json({ status: 'error', code: 'INVALID_CIRCUIT_BREAKER_TARGET_OR_STATE' }); return; }
      const updated = setIntegrationCircuitBreakerState(id, state, auth.actorEmail || 'primary-admin', req.body?.reason || '');
      res.status(200).json({ status: 'ok', circuitBreaker: updated });
    })();
  });
  app.post('/api/admin/backup/export', (req: Request, res: Response) => {
    void (async () => {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      const auth = await verifyAdminApiAuthorization(req.headers, process.env, { requirePrimaryBootstrapAdmin: true, disallowStaticToken: true });
      if (!auth.authorized) {
        if (auth.statusCode === 401 || auth.statusCode === 403) recordAbuseSignal(clientIpOf(req), 'auth_failure');
        recordLiveAdminSecurityAudit({ action: 'ENCRYPTED_BACKUP_EXPORT', actorUid: auth.actorUid || 'unauthenticated', actorEmail: auth.actorEmail || 'unknown', outcome: 'denied', reason: auth.reason });
        res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return;
      }
      let keys: { activeKey: string; previousKey: string | null };
      try { keys = resolveBackupEncryptionKeysFromEnv(process.env); } catch (err: any) { res.status(503).json({ status: 'error', code: 'BACKUP_ENCRYPTION_KEY_NOT_CONFIGURED', message: err?.message }); return; }
      const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
      const envelope = createAuthenticatedEncryptedBackup(payload, keys.activeKey, auth.actorEmail || 'primary-admin');
      const versionId = `bkp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      backupVersionHistory.unshift({
        versionId, createdAtIso: envelope.manifest.createdAtIso, createdByEmail: auth.actorEmail || 'primary-admin',
        schemaVersion: envelope.manifest.version, encryptionFormatVersion: envelope.manifest.algorithm,
        manifestHmacSha256: envelope.manifest.manifestHmacSha256, recordCounts: envelope.manifest.recordCounts,
      });
      if (backupVersionHistory.length > 25) backupVersionHistory.pop();
      res.setHeader('Content-Disposition', `attachment; filename="radar-backup-${versionId}.enc.json"`);
      recordLiveAdminSecurityAudit({ action: 'ENCRYPTED_BACKUP_EXPORT', actorUid: auth.actorUid || 'admin', actorEmail: auth.actorEmail || 'admin', outcome: 'allowed', reason: versionId });
      res.status(200).json({ status: 'ok', versionId, envelope });
    })();
  });
  app.post('/api/admin/backup/restore', (req: Request, res: Response) => {
    void (async () => {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      const auth = await verifyAdminApiAuthorization(req.headers, process.env, { requirePrimaryBootstrapAdmin: true, disallowStaticToken: true });
      if (!auth.authorized) { if (auth.statusCode === 401 || auth.statusCode === 403) recordAbuseSignal(clientIpOf(req), 'auth_failure'); res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
      let keys: { activeKey: string; previousKey: string | null };
      try { keys = resolveBackupEncryptionKeysFromEnv(process.env); } catch (err: any) { res.status(503).json({ status: 'error', code: 'BACKUP_ENCRYPTION_KEY_NOT_CONFIGURED', message: err?.message }); return; }
      const envelope = req.body?.envelope as EncryptedBackupEnvelope | undefined;
      if (!envelope || typeof envelope !== 'object') { res.status(400).json({ status: 'error', code: 'INVALID_BACKUP_ENVELOPE' }); return; }
      try {
        const decrypted = decryptAndVerifyEncryptedBackupWithRotation(envelope, keys.activeKey, keys.previousKey);
        recordLiveAdminSecurityAudit({ action: 'ENCRYPTED_BACKUP_RESTORE', actorUid: auth.actorUid || 'admin', actorEmail: auth.actorEmail || 'admin', outcome: 'allowed', reason: `KEY_${decrypted.usedKeyGeneration.toUpperCase()}` });
        res.status(200).json({ status: 'ok', usedKeyGeneration: decrypted.usedKeyGeneration, payload: decrypted.payload });
      } catch (err: any) {
        recordLiveAdminSecurityAudit({ action: 'ENCRYPTED_BACKUP_RESTORE', actorUid: auth.actorUid || 'admin', actorEmail: auth.actorEmail || 'admin', outcome: 'denied', reason: err?.message || 'INTEGRITY_FAILURE' });
        res.status(400).json({ status: 'error', code: 'BACKUP_INTEGRITY_VERIFICATION_FAILED', message: err?.message });
      }
    })();
  });
  app.post('/api/object-storage/upload-init', (req: Request, res: Response) => {
    void (async () => {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      if (!checkUploadRate(req, 30)) { res.status(429).json({ status: 'error', code: 'UPLOAD_RATE_LIMIT_EXCEEDED' }); return; }
      cleanupExpiredChunkSessions();
      const userAuth = await verifyAuthenticatedUserHeader(req.headers, process.env);
      if (!userAuth.authenticated || !userAuth.uid) { res.status(userAuth.statusCode).json({ status: 'error', code: userAuth.reason }); return; }
      const userActiveCount = Array.from(activeChunkSessions.values()).filter((s) => s.ownerUid === userAuth.uid && !s.completed).length;
      if (activeChunkSessions.size >= MAX_ACTIVE_CHUNK_SESSIONS_TOTAL || userActiveCount >= MAX_ACTIVE_CHUNK_SESSIONS_PER_USER) {
        res.status(429).json({ status: 'error', code: 'UPLOAD_SESSION_QUOTA_EXCEEDED' }); return;
      }
      const city = validateCityParam(req.body?.city, 'tehran');
      const hoodId = Number(req.body?.hoodId);
      const totalChunks = Number(req.body?.totalChunks);
      const mediaType: 'image' | 'video' = req.body?.mediaType === 'video' ? 'video' : 'image';
      const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType.trim().toLowerCase() : '';
      const allowedInitMimes = mediaType === 'video' ? ['video/mp4', 'video/webm', 'video/quicktime'] : ['image/jpeg', 'image/png', 'image/webp'];
      const fileName = sanitizeInput(req.body?.fileName || 'media.mp4', 80);
      if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999 || !Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 30 || (mimeType !== '' && !allowedInitMimes.includes(mimeType))) {
        res.status(400).json({ status: 'error', code: 'INVALID_UPLOAD_INIT_PARAMS' }); return;
      }
      const sessionId = `upl_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
      activeChunkSessions.set(sessionId, {
        sessionId, ownerUid: userAuth.uid, city, hoodId, mediaType, mimeType, fileName, totalChunks,
        maxBytes: mediaType === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024,
        chunks: new Map(), receivedBytes: 0, createdAtMs: Date.now(), completed: false,
      });
      res.status(200).json({ status: 'ok', sessionId, totalChunks });
    })();
  });
  app.post('/api/object-storage/upload-chunk', (req: Request, res: Response) => {
    void (async () => {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      if (!checkUploadRate(req, 180)) { res.status(429).json({ status: 'error', code: 'UPLOAD_RATE_LIMIT_EXCEEDED' }); return; }
      cleanupExpiredChunkSessions();
      const userAuth = await verifyAuthenticatedUserHeader(req.headers, process.env);
      if (!userAuth.authenticated || !userAuth.uid) { res.status(userAuth.statusCode).json({ status: 'error', code: userAuth.reason }); return; }
      const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
      const chunkIndex = Number(req.body?.chunkIndex);
      const base64Chunk = typeof req.body?.base64Data === 'string' ? req.body.base64Data.trim() : '';
      const sess = activeChunkSessions.get(sessionId);
      if (!sess || sess.completed) { res.status(404).json({ status: 'error', code: 'UPLOAD_SESSION_NOT_FOUND_OR_EXPIRED' }); return; }
      if (sess.ownerUid !== userAuth.uid) { res.status(403).json({ status: 'error', code: 'UPLOAD_SESSION_OWNER_MISMATCH' }); return; }
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= sess.totalChunks) { res.status(400).json({ status: 'error', code: 'CHUNK_INDEX_OUT_OF_RANGE' }); return; }
      if (sess.chunks.has(chunkIndex)) { res.status(409).json({ status: 'error', code: 'DUPLICATE_CHUNK_OVERWRITE_FORBIDDEN' }); return; }
      if (!base64Chunk || base64Chunk.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64Chunk)) {
        res.status(400).json({ status: 'error', code: 'INVALID_BASE64_CHUNK' }); return;
      }
      const buf = Buffer.from(base64Chunk, 'base64');
      if (buf.length === 0 || buf.length > MAX_CHUNK_SIZE_BYTES || sess.receivedBytes + buf.length > sess.maxBytes) {
        activeChunkSessions.delete(sessionId);
        res.status(413).json({ status: 'error', code: 'CHUNK_OR_TOTAL_SIZE_EXCEEDED' }); return;
      }
      sess.chunks.set(chunkIndex, buf);
      sess.receivedBytes += buf.length;
      res.status(200).json({ status: 'ok', chunkIndex, receivedChunks: sess.chunks.size });
    })();
  });
  app.post('/api/object-storage/upload-complete', (req: Request, res: Response) => {
    void (async () => {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      if (!checkUploadRate(req, 30)) { res.status(429).json({ status: 'error', code: 'UPLOAD_RATE_LIMIT_EXCEEDED' }); return; }
      cleanupExpiredChunkSessions();
      const userAuth = await verifyAuthenticatedUserHeader(req.headers, process.env);
      if (!userAuth.authenticated || !userAuth.uid) { res.status(userAuth.statusCode).json({ status: 'error', code: userAuth.reason }); return; }
      const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
      const sess = activeChunkSessions.get(sessionId);
      if (!sess || sess.completed) { res.status(404).json({ status: 'error', code: 'UPLOAD_SESSION_NOT_FOUND_OR_EXPIRED' }); return; }
      if (sess.ownerUid !== userAuth.uid) { res.status(403).json({ status: 'error', code: 'UPLOAD_SESSION_OWNER_MISMATCH' }); return; }
      if (sess.chunks.size !== sess.totalChunks) { res.status(400).json({ status: 'error', code: 'INCOMPLETE_CHUNKS' }); return; }
      sess.completed = true;
      activeChunkSessions.delete(sessionId);
      const orderedBuffers: Buffer[] = [];
      for (let i = 0; i < sess.totalChunks; i++) {
        const part = sess.chunks.get(i);
        if (!part) { res.status(400).json({ status: 'error', code: 'MISSING_ORDERED_CHUNK' }); return; }
        orderedBuffers.push(part);
      }
      const fullBuffer = Buffer.concat(orderedBuffers);
      const ext = path.extname(sess.fileName).toLowerCase() || (sess.mediaType === 'video' ? '.mp4' : '.webp');
      const magicCheck = validateMediaMagicBytesAndExtension(fullBuffer, sess.mediaType, sess.mimeType, ext);
      if (!magicCheck.valid) {
        res.status(415).json({ status: 'error', code: magicCheck.code });
        return;
      }
      if (sess.mediaType === 'video') {
        const videoCheck = validateVideoContainerSafety(fullBuffer, magicCheck.detectedFormat);
        if (!videoCheck.valid) {
          res.status(415).json({ status: 'error', code: videoCheck.code });
          return;
        }
      }
      await ensureBucketLoaded();
      const reservation = reserveUploadCapacity(sess.ownerUid, fullBuffer.length);
      if (!reservation) {
        res.status(507).json({ status: 'error', code: 'STORAGE_CAPACITY_EXCEEDED' });
        return;
      }
      let localFilePath = '';
      let objectId = '';
      try {
        objectId = `obj-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const canonicalMime = magicCheck.canonicalMimeType || sess.mimeType || 'image/webp';
        const objectKey = buildListingObjectKey({ city: sess.city, hoodId: sess.hoodId, mediaType: sess.mediaType, mimeType: canonicalMime, objectId }) || buildObjectStorageKey(sess.city, sess.hoodId, sess.mediaType, `${objectId}${magicCheck.canonicalExtension}`);
        const localFileName = path.basename(objectKey);
        localFilePath = path.join(BUCKET_DIR, localFileName);
        await writeFileAtomically(localFilePath, fullBuffer, 0o600);
        const record = {
          id: objectId, objectKey, bucket: 'tehran-housing-radar-media', provider: 'local_bucket' as const,
          mediaType: sess.mediaType, mimeType: canonicalMime, sizeBytes: fullBuffer.length,
          url: `/api/object-storage/file/${objectId}`, remoteS3Synced: false, createdAtIso: new Date().toISOString(),
          localFileName, ownerUid: sess.ownerUid, deletionState: 'active' as const,
        };
        objectStoreIndex.unshift(record); await persistObjectStoreIndexNow();
        const { localFileName: _lf, ownerUid: _ou, ...publicMediaObject } = record;
        res.status(200).json({ status: 'ok', mediaObject: publicMediaObject });
      } catch {
        const idx = objectStoreIndex.findIndex((item) => item.id === objectId);
        if (idx >= 0) objectStoreIndex.splice(idx, 1);
        if (localFilePath) await fs.promises.unlink(localFilePath).catch(() => {});
        res.status(500).json({ status: 'error', code: 'CHUNK_UPLOAD_PERSIST_FAILED' });
      } finally { reservation.release(); } })(); }); }