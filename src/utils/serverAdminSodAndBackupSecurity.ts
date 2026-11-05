import crypto from 'node:crypto'; import path from 'node:path'; import { computeCanonicalPayloadFingerprint } from './serverIdempotencyAndConcurrency'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export type AdminRole = 'SUPER_ADMIN' | 'SECURITY_ADMIN' | 'OPERATIONS_ADMIN' | 'MODERATOR' | 'READ_ONLY_AUDITOR'; export type HighRiskActionType = 'BACKUP_RESTORE' | 'BULK_LISTING_DELETE' | 'MASS_MEDIA_PURGE' | 'ADMIN_ROLE_GRANT' | 'RUNTIME_SECRET_ROTATION'; export interface HighRiskApprovalRequest { requestId: string; actionType: HighRiskActionType; requesterId: string; requesterRole: AdminRole; payloadDigest: string; reason: string; createdAtMs: number; expiresAtMs: number; status: 'PENDING_SECOND_APPROVAL' | 'APPROVED' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED'; approverId?: string; approverRole?: AdminRole; approvedAtMs?: number; executedAtMs?: number; }
export class AdminSeparationOfDutiesController { private readonly requests = new Map<string, HighRiskApprovalRequest>(); private readonly auditChain: Array<{ seq: number; prevHash: string; entryHash: string; summary: string }> = []; private readonly approvalTtlMs: number; constructor(approvalTtlMs = 15 * 60_000) { this.approvalTtlMs = approvalTtlMs; }
  private recordAudit(summary: string): void { const seq = this.auditChain.length + 1; const prevHash = seq > 1 ? this.auditChain[seq - 2].entryHash : 'SOD_GENESIS'; const entryHash = crypto.createHash('sha256').update(`${seq}|${prevHash}|${summary}`).digest('hex');
    this.auditChain.push({ seq, prevHash, entryHash, summary }); } requestHighRiskOperation(params: { actionType: HighRiskActionType; requesterId: string; requesterRole: AdminRole; payload: unknown; reason: string; nowMs?: number; }): HighRiskApprovalRequest { if (params.requesterRole === 'READ_ONLY_AUDITOR' || params.requesterRole === 'MODERATOR') { throw new Error('SOD_INSUFFICIENT_ROLE: Role cannot initiate high-risk administrative operation'); } const nowMs = params.nowMs ?? Date.now(); const payloadDigest = computeCanonicalPayloadFingerprint(params.payload);
    if (this.requests.size >= 500) { for (const [id, r] of this.requests.entries()) { if (nowMs > r.expiresAtMs || r.status === 'EXECUTED' || r.status === 'CANCELLED') this.requests.delete(id); } }
    const requestId = `SOD-${nowMs}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const req: HighRiskApprovalRequest = { requestId, actionType: params.actionType, requesterId: params.requesterId, requesterRole: params.requesterRole, payloadDigest, reason: params.reason, createdAtMs: nowMs, expiresAtMs: nowMs + this.approvalTtlMs, status: 'PENDING_SECOND_APPROVAL', }; this.requests.set(requestId, req);
    this.recordAudit(`REQUEST:${requestId}:${params.actionType}:${params.requesterId}:${payloadDigest}`);
    return { ...req }; } approveHighRiskOperation(params: { requestId: string; approverId: string; approverRole: AdminRole; expectedPayloadDigest: string; nowMs?: number; }): HighRiskApprovalRequest { const nowMs = params.nowMs ?? Date.now(); const req = this.requests.get(params.requestId); if (!req) throw new Error('SOD_REQUEST_NOT_FOUND'); if (nowMs > req.expiresAtMs) { req.status = 'EXPIRED'; throw new Error('SOD_REQUEST_EXPIRED'); }
    if (req.status !== 'PENDING_SECOND_APPROVAL') throw new Error(`SOD_INVALID_STATE: Cannot approve request in state ${req.status}`);
    if (params.approverId === req.requesterId) throw new Error('SOD_SELF_APPROVAL_FORBIDDEN: Initiating admin cannot self-approve high-risk action'); if (params.approverRole !== 'SUPER_ADMIN' && params.approverRole !== 'SECURITY_ADMIN') throw new Error('SOD_APPROVER_ROLE_INSUFFICIENT'); if (params.expectedPayloadDigest !== req.payloadDigest) throw new Error('SOD_PAYLOAD_DIGEST_MISMATCH'); req.status = 'APPROVED'; req.approverId = params.approverId; req.approverRole = params.approverRole; req.approvedAtMs = nowMs;
    this.recordAudit(`APPROVE:${req.requestId}:${params.approverId}:${req.payloadDigest}`);
    return { ...req }; } executeHighRiskOperation(params: { requestId: string; executorId: string; payload: unknown; nowMs?: number }): HighRiskApprovalRequest { const nowMs = params.nowMs ?? Date.now(); const req = this.requests.get(params.requestId); if (!req) throw new Error('SOD_REQUEST_NOT_FOUND'); if (nowMs > req.expiresAtMs) { req.status = 'EXPIRED'; throw new Error('SOD_APPROVAL_EXPIRED'); }
    if (req.status !== 'APPROVED') throw new Error(`SOD_EXECUTION_DENIED: Request state is ${req.status}`);
    const actualDigest = computeCanonicalPayloadFingerprint(params.payload); if (actualDigest !== req.payloadDigest) throw new Error('SOD_PAYLOAD_TAMPERED_AFTER_APPROVAL'); req.status = 'EXECUTED'; req.executedAtMs = nowMs;
    this.recordAudit(`EXECUTE:${req.requestId}:${params.executorId}:${actualDigest}`);
    return { ...req }; }
  verifyApprovalAuditChain(): boolean { let expectedPrev = 'SOD_GENESIS'; for (const item of this.auditChain) { if (item.prevHash !== expectedPrev) return false;
      const expectedHash = crypto.createHash('sha256').update(`${item.seq}|${item.prevHash}|${item.summary}`).digest('hex');
      if (expectedHash !== item.entryHash) return false; expectedPrev = item.entryHash; }
    return true; } }
export interface EncryptedBackupEnvelope { format: 'TEHRAN_RADAR_ENC_BACKUP_V1'; cipherAlgorithm: 'aes-256-gcm'; kdf: 'scrypt'; keyId: string; appVersion: string; schemaVersion: string; createdAtIso: string; saltHex: string; ivHex: string; authTagHex: string; ciphertextBase64: string; manifestHmacHex: string;
  manifest: { version: string; algorithm: string; createdAtIso: string; createdByEmail: string; manifestHmacSha256: string; recordCounts: { neighborhoods: number; bargains: number; sponsorRequests: number }; }; }
const FORBIDDEN_BACKUP_SECRET_KEYS = ['GEMINI_API_KEY', 'TELEGRAM_BOT_TOKEN', 'OBJECT_STORAGE_SECRET_ACCESS_KEY', 'PRIVATE_KEY'];
export function scrubSecretsFromBackupObject(input: Record<string, unknown>, depth = 0): Record<string, unknown> { const clean: Record<string, unknown> = {}; if (!input || typeof input !== 'object' || depth > 8) return clean;
  for (const [k, v] of Object.entries(input)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype' || FORBIDDEN_BACKUP_SECRET_KEYS.includes(k) || /SECRET|PRIVATE[_-]?KEY|PASSWORD|API[_-]?KEY|BOT[_-]?TOKEN|ACCESS[_-]?KEY/i.test(k)) continue;
    clean[k] = Array.isArray(v) ? v.map((item) => (item && typeof item === 'object' && !Array.isArray(item) ? scrubSecretsFromBackupObject(item as Record<string, unknown>, depth + 1) : item)) : v && typeof v === 'object' ? scrubSecretsFromBackupObject(v as Record<string, unknown>, depth + 1) : v;
  }
  return clean; }
export function resolveBackupEncryptionKeysFromEnv(env: Record<string, string | undefined> = process.env): { primaryKey: string; activeKey: string; previousKey: string | null; keyId: string; } { const primaryKey = typeof env.BACKUP_ENCRYPTION_KEY === 'string' ? env.BACKUP_ENCRYPTION_KEY.trim() : '';
  if (!primaryKey || primaryKey.length < 32) { throw new Error('BACKUP_ENCRYPTION_KEY_MISSING_OR_WEAK: BACKUP_ENCRYPTION_KEY must be configured with at least 32 characters (no weak fallback allowed).'); }
  const previousRaw = typeof env.BACKUP_ENCRYPTION_KEY_PREVIOUS === 'string' ? env.BACKUP_ENCRYPTION_KEY_PREVIOUS.trim() : ''; const previousKey = previousRaw.length >= 32 ? previousRaw : null; const keyId = typeof env.BACKUP_ENCRYPTION_KEY_ID === 'string' && env.BACKUP_ENCRYPTION_KEY_ID.trim()
    ? env.BACKUP_ENCRYPTION_KEY_ID.trim()
    : `k-${crypto.createHash('sha256').update(primaryKey).digest('hex').slice(0, 8)}`;
  return { primaryKey, activeKey: primaryKey, previousKey, keyId }; }
export function createAuthenticatedEncryptedBackup(
  paramsOrPayload:
    | { payload: Record<string, unknown>;
        encryptionKeyMaterial: string; keyId?: string;
        appVersion?: string;
        schemaVersion?: string;
        createdAtIso?: string;
        createdByEmail?: string;
      }
    | Record<string, unknown>,
  keyMaterialArg?: string,
  createdByEmailArg?: string,
): EncryptedBackupEnvelope {
  const isParamsObj =
    typeof paramsOrPayload === 'object' &&
    paramsOrPayload !== null &&
    'encryptionKeyMaterial' in paramsOrPayload &&
    typeof (paramsOrPayload as { encryptionKeyMaterial?: unknown }).encryptionKeyMaterial === 'string';
  const payload = isParamsObj
    ? (paramsOrPayload as { payload: Record<string, unknown> }).payload
    : (paramsOrPayload as Record<string, unknown>);
  const encryptionKeyMaterial = isParamsObj
    ? (paramsOrPayload as { encryptionKeyMaterial: string }).encryptionKeyMaterial
    : (keyMaterialArg || '');
  const keyId = isParamsObj && typeof (paramsOrPayload as { keyId?: string }).keyId === 'string'
    ? (paramsOrPayload as { keyId: string }).keyId
    : `k-${crypto.createHash('sha256').update(encryptionKeyMaterial || 'k').digest('hex').slice(0, 8)}`;
  const appVersion = isParamsObj && typeof (paramsOrPayload as { appVersion?: string }).appVersion === 'string'
    ? (paramsOrPayload as { appVersion: string }).appVersion
    : '3.2.0';
  const schemaVersion = isParamsObj && typeof (paramsOrPayload as { schemaVersion?: string }).schemaVersion === 'string'
    ? (paramsOrPayload as { schemaVersion: string }).schemaVersion
    : 'v2';
  const createdAtIso = isParamsObj && typeof (paramsOrPayload as { createdAtIso?: string }).createdAtIso === 'string'
    ? (paramsOrPayload as { createdAtIso: string }).createdAtIso
    : new Date().toISOString();
  const createdByEmail = isParamsObj && typeof (paramsOrPayload as { createdByEmail?: string }).createdByEmail === 'string'
    ? (paramsOrPayload as { createdByEmail: string }).createdByEmail
    : (createdByEmailArg || 'primary-admin');
  if (!encryptionKeyMaterial || encryptionKeyMaterial.length < 16) {
    throw new Error('BACKUP_KEY_TOO_WEAK: Encryption key material must be at least 16 characters');
  }
  const scrubbedPayload = scrubSecretsFromBackupObject(payload || {});
  const plaintext = Buffer.from(JSON.stringify(scrubbedPayload), 'utf8');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const derivedKey = crypto.scryptSync(encryptionKeyMaterial, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  const aad = Buffer.from(`${keyId}|${appVersion}|${schemaVersion}|${createdAtIso}`, 'utf8');
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const ciphertextBase64 = encrypted.toString('base64');
  const manifestHmacHex = crypto
    .createHmac('sha256', derivedKey)
    .update(`${aad.toString('utf8')}|${iv.toString('hex')}|${authTag.toString('hex')}|${ciphertextBase64}`)
    .digest('hex');
  return {
    format: 'TEHRAN_RADAR_ENC_BACKUP_V1',
    cipherAlgorithm: 'aes-256-gcm',
    kdf: 'scrypt',
    keyId,
    appVersion,
    schemaVersion,
    createdAtIso,
    saltHex: salt.toString('hex'),
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    ciphertextBase64,
    manifestHmacHex,
    manifest: {
      version: schemaVersion,
      algorithm: 'AES-256-GCM+SCRYPT',
      createdAtIso,
      createdByEmail,
      manifestHmacSha256: manifestHmacHex,
      recordCounts: {
        neighborhoods: Object.keys((scrubbedPayload.neighborhoodOverrides as object) || {}).length,
        bargains: Array.isArray(scrubbedPayload.bargains) ? scrubbedPayload.bargains.length : 0,
        sponsorRequests: Array.isArray(scrubbedPayload.sponsorRequests) ? scrubbedPayload.sponsorRequests.length : 0,
      },
    },
  };
}
export function decryptAndVerifyEncryptedBackup(
  envelope: EncryptedBackupEnvelope,
  encryptionKeyMaterial: string,
): { verified: true; payload: Record<string, unknown> } {
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    envelope.format !== 'TEHRAN_RADAR_ENC_BACKUP_V1' ||
    envelope.cipherAlgorithm !== 'aes-256-gcm'
  ) {
    throw new Error('BACKUP_UNSUPPORTED_FORMAT');
  }
  if (!encryptionKeyMaterial || encryptionKeyMaterial.length < 16) {
    throw new Error('BACKUP_KEY_TOO_WEAK');
  }
  if (
    !/^[0-9a-fA-F]{32}$/.test(envelope.saltHex || '') ||
    !/^[0-9a-fA-F]{24}$/.test(envelope.ivHex || '') ||
    !/^[0-9a-fA-F]{32}$/.test(envelope.authTagHex || '') ||
    !/^[0-9a-fA-F]{64}$/.test(envelope.manifestHmacHex || '') ||
    typeof envelope.ciphertextBase64 !== 'string' ||
    envelope.ciphertextBase64.length === 0 ||
    envelope.ciphertextBase64.length > 20 * 1024 * 1024
  ) {
    throw new Error('BACKUP_ENVELOPE_MALFORMED_PARAMETERS');
  }
  const salt = Buffer.from(envelope.saltHex, 'hex');
  const iv = Buffer.from(envelope.ivHex, 'hex');
  const authTag = Buffer.from(envelope.authTagHex, 'hex');
  const derivedKey = crypto.scryptSync(encryptionKeyMaterial, salt, 32);
  const aad = Buffer.from(`${envelope.keyId}|${envelope.appVersion}|${envelope.schemaVersion}|${envelope.createdAtIso}`, 'utf8');
  const expectedHmacBuf = crypto.createHmac('sha256', derivedKey).update(`${aad.toString('utf8')}|${envelope.ivHex}|${envelope.authTagHex}|${envelope.ciphertextBase64}`).digest();
  const providedHmacBuf = Buffer.from(envelope.manifestHmacHex, 'hex');
  if (expectedHmacBuf.length !== providedHmacBuf.length || !crypto.timingSafeEqual(expectedHmacBuf, providedHmacBuf)) {
    throw new Error('BACKUP_MANIFEST_SIGNATURE_INVALID');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);
  const ciphertext = Buffer.from(envelope.ciphertextBase64, 'base64');
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const parsed = JSON.parse(decrypted.toString('utf8'), (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v)) as Record<string, unknown>;
  return { verified: true, payload: parsed };
}
export function decryptAndVerifyEncryptedBackupWithRotation(
  envelope: EncryptedBackupEnvelope,
  primaryKeyMaterial: string,
  previousKeyMaterial?: string | null,
): {
  verified: true;
  payload: Record<string, unknown>;
  usedKeySlot: 'primary' | 'previous';
  usedKeyGeneration: 'primary' | 'previous';
} {
  try {
    const res = decryptAndVerifyEncryptedBackup(envelope, primaryKeyMaterial);
    return { ...res, usedKeySlot: 'primary', usedKeyGeneration: 'primary' };
  } catch (primaryErr) {
    if (previousKeyMaterial && previousKeyMaterial.length >= 16) {
      const resPrev = decryptAndVerifyEncryptedBackup(envelope, previousKeyMaterial);
      return { ...resPrev, usedKeySlot: 'previous', usedKeyGeneration: 'previous' };
    }
    throw primaryErr;
  }
}
export type ExternalIntegrationId = 'OPEN_METEO_WEATHER' | 'OPEN_METEO_AIR_QUALITY' | 'TELEGRAM_BOT_API';
export function validateExternalApiResponseSchema(
  integration: ExternalIntegrationId,
  payload: unknown,
): { valid: boolean; reason?: string } {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'EXTERNAL_PAYLOAD_NOT_OBJECT' };
  }
  const obj = payload as Record<string, unknown>;
  if (integration === 'OPEN_METEO_WEATHER') {
    const cw = obj.current_weather as Record<string, unknown> | undefined;
    if (!cw || typeof cw.temperature !== 'number' || !Number.isFinite(cw.temperature) || cw.temperature < -90 || cw.temperature > 70) {
      return { valid: false, reason: 'INVALID_WEATHER_TEMPERATURE_SCHEMA' };
    }
    return { valid: true };
  }
  if (integration === 'OPEN_METEO_AIR_QUALITY') {
    const cur = obj.current as Record<string, unknown> | undefined;
    if (!cur || typeof cur.us_aqi !== 'number' || !Number.isFinite(cur.us_aqi) || cur.us_aqi < 0 || cur.us_aqi > 1000) {
      return { valid: false, reason: 'INVALID_AQI_SCHEMA' };
    }
    return { valid: true };
  }
  if (integration === 'TELEGRAM_BOT_API') {
    if (typeof obj.ok !== 'boolean') {
      return { valid: false, reason: 'INVALID_TELEGRAM_RESPONSE' };
    }
    return { valid: true };
  }
  return { valid: false, reason: 'UNKNOWN_INTEGRATION' };
}
export interface ArchiveEntryDescriptor { entryName: string; compressedBytes: number; uncompressedBytes: number; isSymbolicLink?: boolean; }
export interface ArchiveSafetyInspectionResult {
  safe: boolean;
  totalUncompressedBytes: number;
  displayAreaUnitLabel?: string;
  referenceValuationIntlText?: string;
  violations: Array<{
    entryName: string;
    code: 'PATH_TRAVERSAL' | 'ABSOLUTE_PATH_FORBIDDEN' | 'SYMLINK_FORBIDDEN' | 'COMPRESSION_RATIO_BOMB' | 'ENTRY_SIZE_EXCEEDED' | 'TOTAL_ARCHIVE_SIZE_EXCEEDED' | 'ENTRY_COUNT_EXCEEDED' | 'DUPLICATE_NORMALIZED_ENTRY';
    message: string;
  }>;
}
export function inspectArchiveExtractionSafety(
  entries: ArchiveEntryDescriptor[],
  limits?: { maxEntries?: number; maxSingleEntryBytes?: number; maxTotalUncompressedBytes?: number; maxCompressionRatio?: number },
  areaUnit: AreaUnit = 'sqm',
  intlCurrency: IntlCurrencyCode = 'USD',
  referenceValuationMillionToman = 10000,
): ArchiveSafetyInspectionResult {
  const maxEntries = limits?.maxEntries ?? 250;
  const maxSingleEntryBytes = limits?.maxSingleEntryBytes ?? 25 * 1024 * 1024;
  const maxTotalUncompressedBytes = limits?.maxTotalUncompressedBytes ?? 100 * 1024 * 1024;
  const maxCompressionRatio = limits?.maxCompressionRatio ?? 80;
  const violations: ArchiveSafetyInspectionResult['violations'] = [];
  const seenNormalized = new Set<string>();
  let totalUncompressedBytes = 0;
  if (entries.length > maxEntries) {
    violations.push({ entryName: '$archive', code: 'ENTRY_COUNT_EXCEEDED', message: `Archive entry count (${entries.length}) exceeds maximum (${maxEntries})` });
  }
  for (const entry of entries) {
    const rawName = entry.entryName.replace(/\\/g, '/');
    if (rawName.startsWith('/') || /^[A-Za-z]:\//.test(rawName)) {
      violations.push({ entryName: entry.entryName, code: 'ABSOLUTE_PATH_FORBIDDEN', message: 'Absolute paths are forbidden' });
    }
    const normalized = path.posix.normalize(rawName);
    if (normalized.startsWith('..') || normalized.includes('/../') || rawName.includes('..')) {
      violations.push({ entryName: entry.entryName, code: 'PATH_TRAVERSAL', message: 'Zip Slip path traversal detected' });
    }
    if (entry.isSymbolicLink) {
      violations.push({ entryName: entry.entryName, code: 'SYMLINK_FORBIDDEN', message: 'Symbolic links are forbidden in archives' });
    }
    const canonicalLower = normalized.toLowerCase();
    if (seenNormalized.has(canonicalLower)) {
      violations.push({ entryName: entry.entryName, code: 'DUPLICATE_NORMALIZED_ENTRY', message: 'Duplicate entry collision detected' });
    }
    seenNormalized.add(canonicalLower);
    if (entry.uncompressedBytes > maxSingleEntryBytes) {
      violations.push({ entryName: entry.entryName, code: 'ENTRY_SIZE_EXCEEDED', message: 'Single entry exceeds maximum size' });
    }
    const ratio = entry.uncompressedBytes / Math.max(1, entry.compressedBytes);
    if (entry.uncompressedBytes > 64 * 1024 && ratio > maxCompressionRatio) {
      violations.push({ entryName: entry.entryName, code: 'COMPRESSION_RATIO_BOMB', message: `Suspicious compression ratio ${Math.round(ratio)}:1` });
    }
    totalUncompressedBytes += Math.max(0, entry.uncompressedBytes);
  }
  if (totalUncompressedBytes > maxTotalUncompressedBytes) {
    violations.push({ entryName: '$archive', code: 'TOTAL_ARCHIVE_SIZE_EXCEEDED', message: `Total uncompressed size (${totalUncompressedBytes}) exceeds ceiling (${maxTotalUncompressedBytes})` });
  }
  return {
    safe: violations.length === 0,
    totalUncompressedBytes,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(referenceValuationMillionToman, intlCurrency, 'en'),
    violations,
  };
}