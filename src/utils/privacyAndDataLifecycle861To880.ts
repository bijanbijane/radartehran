import crypto from 'node:crypto'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export type DataSensitivityTier = 'public_market_data' | 'internal_operational' | 'personal_identifiable' | 'sensitive_personal_contact' | 'auth_and_authorization' | 'commercial_sponsor' | 'security_credential'; export interface DataClassificationEntry { collectionOrStore: string; field: string; tier: DataSensitivityTier; storageLocation: 'firestore' | 'server_memory_only' | 'object_storage' | 'env_secret'; allowedReaderRoles: ReadonlyArray<'public' | 'owner' | 'admin'>; exposedInPublicApi: boolean; includedInLogsOrDiskCache: false | 'masked_only' | 'public_safe'; retentionPolicy: 'indefinite_public_catalog' | 'until_owner_or_admin_delete' | 'ttl_bounded_90d_policy_pending' | 'ephemeral_in_memory'; } export const REPOSITORY_PERSONAL_DATA_INVENTORY: ReadonlyArray<DataClassificationEntry> = [ { collectionOrStore: 'bargains', field: 'title,hoodId,buyPrice,area,floor,buildingAge', tier: 'public_market_data', storageLocation: 'firestore', allowedReaderRoles: ['public', 'owner', 'admin'], exposedInPublicApi: true, includedInLogsOrDiskCache: 'public_safe',
    retentionPolicy: 'until_owner_or_admin_delete', }, { collectionOrStore: 'bargains', field: 'address,sellerPhone', tier: 'sensitive_personal_contact', storageLocation: 'firestore', allowedReaderRoles: ['owner', 'admin'], exposedInPublicApi: false, includedInLogsOrDiskCache: false, retentionPolicy: 'until_owner_or_admin_delete', }, { collectionOrStore: 'bargainOwners', field: 'userId,userEmail', tier: 'auth_and_authorization', storageLocation: 'firestore', allowedReaderRoles: ['owner', 'admin'], exposedInPublicApi: false, includedInLogsOrDiskCache: false, retentionPolicy: 'until_owner_or_admin_delete', }, { collectionOrStore: 'buyerAlerts', field: 'fullName,phone,userEmail,userId,maxBudgetText,privacyConsent,consentTimestampIso,consentVersion', tier: 'sensitive_personal_contact',
    storageLocation: 'firestore', allowedReaderRoles: ['owner', 'admin'], exposedInPublicApi: false, includedInLogsOrDiskCache: false, retentionPolicy: 'ttl_bounded_90d_policy_pending', }, { collectionOrStore: 'sponsors', field: 'agencyName,phone,userId,userEmail,hoodId,expiresAtIso',
    tier: 'commercial_sponsor', storageLocation: 'firestore', allowedReaderRoles: ['owner', 'admin'], exposedInPublicApi: false, includedInLogsOrDiskCache: false, retentionPolicy: 'until_owner_or_admin_delete', }, { collectionOrStore: 'neighborhoodOverrides',
    field: 'agencyName,phone,hoodId,expiresAtIso,status', tier: 'public_market_data', storageLocation: 'firestore', allowedReaderRoles: ['public', 'owner', 'admin'], exposedInPublicApi: true, includedInLogsOrDiskCache: 'public_safe', retentionPolicy: 'until_owner_or_admin_delete', },
  { collectionOrStore: 'admins', field: 'email,role,delegatedBy', tier: 'auth_and_authorization',
    storageLocation: 'firestore', allowedReaderRoles: ['admin'], exposedInPublicApi: false, includedInLogsOrDiskCache: false,
    retentionPolicy: 'until_owner_or_admin_delete', }, ]; export function evaluateRecordRetentionEligibility(params: {
  category: 'buyerAlerts' | 'tempExport' | 'orphanStagingUpload' | 'auditCheckpoint' | 'activeBargain'; serverCreatedAtMs: number;
  nowMs: number;
  legalHoldPreserved?: boolean;
}): { eligibleForCleanup: boolean; reason: string } {
  if (params.legalHoldPreserved) {
    return { eligibleForCleanup: false, reason: 'PROTECTED_BY_EXPLICIT_PRESERVATION_HOLD' };
  }
  if (params.category === 'auditCheckpoint' || params.category === 'activeBargain') {
    return { eligibleForCleanup: false, reason: 'ACTIVE_OR_AUDIT_RECORD_NOT_AUTO_EXPIRED' };
  }
  const ageMs = Math.max(0, params.nowMs - params.serverCreatedAtMs);
  if (params.category === 'tempExport' && ageMs > 15 * 60 * 1000) {
    return { eligibleForCleanup: true, reason: 'TEMP_EXPORT_TTL_EXCEEDED' };
  }
  if (params.category === 'orphanStagingUpload' && ageMs > 60 * 60 * 1000) {
    return { eligibleForCleanup: true, reason: 'ORPHAN_STAGING_UPLOAD_TTL_EXCEEDED' };
  }
  if (params.category === 'buyerAlerts' && ageMs > 90 * 24 * 60 * 60 * 1000) {
    return { eligibleForCleanup: true, reason: 'BUYER_ALERT_90D_RETENTION_EXCEEDED' };
  }
  return { eligibleForCleanup: false, reason: 'WITHIN_ACTIVE_RETENTION_WINDOW' };
}
export function orchestrateAuthorizedUserDataDeletion(params: {
  requestingActorUid: string;
  requestingActorIsAdmin: boolean;
  targetUserUid: string;
  targetUserEmail: string;
  primaryBootstrapAdminEmail: string;
  freshAuthVerified: boolean;
  ownedBargainIds: readonly string[];
  ownedBuyerAlertDocIds: readonly string[];
  ownedSponsorHoodIds: readonly number[];
  ownedMediaObjectIds: readonly string[];
}): {
  allowed: boolean;
  reason?: string;
  purgedFirestorePaths: string[];
  purgedDerivedProjectionPaths: string[];
  markedPendingDeleteMediaIds: string[];
} {
  if (!params.freshAuthVerified) {
    return { allowed: false, reason: 'FRESH_AUTHENTICATION_REQUIRED_FOR_DELETION', purgedFirestorePaths: [], purgedDerivedProjectionPaths: [], markedPendingDeleteMediaIds: [] };
  }
  if (params.targetUserEmail.trim().toLowerCase() === params.primaryBootstrapAdminEmail.trim().toLowerCase()) {
    return { allowed: false, reason: 'PRIMARY_BOOTSTRAP_ADMIN_CANNOT_BE_DELETED', purgedFirestorePaths: [], purgedDerivedProjectionPaths: [], markedPendingDeleteMediaIds: [] };
  }
  if (!params.requestingActorIsAdmin && params.requestingActorUid !== params.targetUserUid) {
    return { allowed: false, reason: 'CROSS_USER_ACCOUNT_DELETION_FORBIDDEN', purgedFirestorePaths: [], purgedDerivedProjectionPaths: [], markedPendingDeleteMediaIds: [] };
  }
  const purgedFirestorePaths: string[] = [];
  const purgedDerivedProjectionPaths: string[] = [];
  for (const bId of params.ownedBargainIds.slice(0, 50)) {
    purgedFirestorePaths.push(`/bargains/${bId}`, `/bargainOwners/${bId}`);
  }
  for (const aId of params.ownedBuyerAlertDocIds.slice(0, 50)) {
    purgedFirestorePaths.push(`/buyerAlerts/${aId}`);
  }
  for (const hId of params.ownedSponsorHoodIds.slice(0, 50)) {
    purgedFirestorePaths.push(`/sponsors/${hId}`);
    purgedDerivedProjectionPaths.push(`/neighborhoodOverrides/${hId}`);
  }
  return {
    allowed: true,
    purgedFirestorePaths,
    purgedDerivedProjectionPaths,
    markedPendingDeleteMediaIds: params.ownedMediaObjectIds.slice(0, 100),
  };
}
export function buildPrivacySafeAggregateNeighborhoodStats(params: {
  hoodId: number;
  samplePrices: readonly number[];
  minGroupThreshold?: number;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}): { kAnonymitySatisfied: boolean; count: number; medianPrice: number | null; coarsenedCountBand: string; displayAreaUnitLabel: string; medianPriceIntlText: string } {
  const displayAreaUnitLabel = formatAreaUnitLabel(params.areaUnit ?? 'sqm');
  const threshold = Math.max(3, params.minGroupThreshold ?? 3);
  const validPrices = params.samplePrices.filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const count = validPrices.length;
  if (count < threshold) {
    return { kAnonymitySatisfied: false, count: 0, medianPrice: null, coarsenedCountBand: `<${threshold}`, displayAreaUnitLabel, medianPriceIntlText: formatMillionTomanAsIntlCurrency(0, params.intlCurrency ?? 'IRT') };
  }
  const sorted = [...validPrices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianPrice = sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  const coarsenedCountBand = count < 10 ? '3-9' : count < 50 ? '10-49' : '50+';
  return {
    kAnonymitySatisfied: true,
    count,
    medianPrice,
    coarsenedCountBand,
    displayAreaUnitLabel,
    medianPriceIntlText: formatMillionTomanAsIntlCurrency(medianPrice, params.intlCurrency ?? 'IRT'),
  };
}
export function derivePseudonymousAnalyticsActorId(uid: string, serverHmacSecret: string): string {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid || !serverHmacSecret || serverHmacSecret.length < 16) {
    throw new Error('INVALID_PSEUDONYMOUS_DERIVATION_INPUT');
  }
  return `pseudo_${crypto.createHmac('sha256', serverHmacSecret).update(`analytics:${cleanUid}`).digest('hex').slice(0, 24)}`;
}
export function sanitizeGeoJsonFeatureForPublicMap(featureProps: Record<string, unknown>): Record<string, unknown> {
  const forbiddenGeoKeys = new Set([
    'address', 'exactAddress', 'sellerPhone', 'phone', 'userEmail', 'userId', 'ownerUid', 'fullName', 'internalNotes',
  ]);
  const safeProps = Object.create(null) as Record<string, unknown>;
  for (const [k, v] of Object.entries(featureProps || {})) {
    if (!forbiddenGeoKeys.has(k)) {
      safeProps[k] = v;
    }
  }
  return safeProps;
}
export interface ImmutableConsentRecord {
  userId: string;
  consentCategory: 'buyer_alert_contact' | 'sponsor_inquiry';
  consentGranted: boolean;
  consentVersion: string;
  serverRecordedAtIso: string;
  previousEventHash: string;
  eventHash: string;
}
export function createImmutableUserConsentRecord(params: {
  authenticatedActorUid: string;
  consentCategory: 'buyer_alert_contact' | 'sponsor_inquiry';
  consentGranted: boolean;
  consentVersion: string;
  serverNowIso: string;
  previousEventHash?: string;
}): ImmutableConsentRecord {
  const prev = params.previousEventHash || 'CONSENT_GENESIS';
  const payload = `${params.authenticatedActorUid}|${params.consentCategory}|${params.consentGranted}|${params.consentVersion}|${params.serverNowIso}|${prev}`;
  const eventHash = crypto.createHash('sha256').update(payload).digest('hex');
  return {
    userId: params.authenticatedActorUid,
    consentCategory: params.consentCategory,
    consentGranted: params.consentGranted,
    consentVersion: params.consentVersion,
    serverRecordedAtIso: params.serverNowIso,
    previousEventHash: prev,
    eventHash,
  };
}
export function sanitizeImportedRecordProvenance(params: {
  rawImportPayload: Record<string, unknown>;
  externalSource: 'divar_public_feed' | 'sheypoor_public_feed' | 'admin_csv_import';
  importingActorUid: string;
  serverTimestampIso: string;
}): {
  cleanBusinessFields: Record<string, unknown>;
  provenance: {
    externalSource: string;
    importingActorUid: string;
    importedAtServerIso: string;
    verificationState: 'unverified_external_import';
    ownerUidAssigned: null;
  };
} {
  const protectedKeys = new Set([
    'userId', 'ownerUid', 'userEmail', 'isAdmin', 'role', 'approved', 'verifiedByAdmin', 'createdAtIso',
  ]);
  const cleanBusinessFields = Object.create(null) as Record<string, unknown>;
  for (const [k, v] of Object.entries(params.rawImportPayload || {})) {
    if (!protectedKeys.has(k)) cleanBusinessFields[k] = v;
  }
  return {
    cleanBusinessFields,
    provenance: {
      externalSource: params.externalSource,
      importingActorUid: params.importingActorUid,
      importedAtServerIso: params.serverTimestampIso,
      verificationState: 'unverified_external_import',
      ownerUidAssigned: null,
    },
  };
}
export function validateImageDimensionsAndAnimationLimits(params: {
  width: number;
  height: number;
  pagesOrFrames?: number;
  sizeBytes: number;
}): { valid: boolean; reason?: string; estimatedDecodedBytes: number } {
  const frames = params.pagesOrFrames ?? 1;
  if (!Number.isInteger(params.width) || !Number.isInteger(params.height) || params.width < 16 || params.height < 16) {
    return { valid: false, reason: 'IMAGE_DIMENSIONS_TOO_SMALL_OR_INVALID', estimatedDecodedBytes: 0 };
  }
  if (params.width > 8192 || params.height > 8192) {
    return { valid: false, reason: 'IMAGE_DIMENSION_LIMIT_EXCEEDED', estimatedDecodedBytes: 0 };
  }
  const singleFramePixels = params.width * params.height;
  if (singleFramePixels > 40_000_000) {
    return { valid: false, reason: 'IMAGE_PIXEL_COUNT_EXCEEDED', estimatedDecodedBytes: singleFramePixels * 4 };
  }
  if (!Number.isInteger(frames) || frames < 1 || frames > 60) {
    return { valid: false, reason: 'ANIMATED_IMAGE_FRAME_COUNT_EXCEEDED', estimatedDecodedBytes: 0 };
  }
  const cumulativePixels = singleFramePixels * frames;
  const estimatedDecodedBytes = cumulativePixels * 4;
  if (cumulativePixels > 80_000_000 || estimatedDecodedBytes > 320 * 1024 * 1024) {
    return { valid: false, reason: 'CUMULATIVE_ANIMATION_MEMORY_EXCEEDED', estimatedDecodedBytes };
  }
  if (params.sizeBytes > 10 * 1024 * 1024) {
    return { valid: false, reason: 'IMAGE_FILE_SIZE_EXCEEDED', estimatedDecodedBytes };
  }
  return { valid: true, estimatedDecodedBytes };
}
export function detectPolyglotOrTrailingPayloadInMedia(buf: Buffer): {
  safe: boolean;
  reason?: string;
} {
  if (!Buffer.isBuffer(buf) || buf.length < 12) {
    return { safe: false, reason: 'MEDIA_BUFFER_TOO_SHORT' };
  }
  const head = buf.subarray(0, Math.min(buf.length, 8192)).toString('latin1');
  const tail = buf.length > 8192 ? buf.subarray(buf.length - 8192).toString('latin1') : '';
  const textScan = `${head}\n${tail}`.toLowerCase();
  if (
    textScan.includes('<script') ||
    textScan.includes('<?php') ||
    textScan.includes('<!doctype html') ||
    textScan.includes('<svg') ||
    textScan.includes('javascript:') ||
    textScan.includes('onload=') ||
    textScan.includes('onerror=')
  ) {
    return { safe: false, reason: 'EMBEDDED_ACTIVE_SCRIPT_OR_POLYGLOT_DETECTED' };
  }
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return { safe: false, reason: 'ARCHIVE_POLYGLOT_SIGNATURE_DETECTED' };
  }
  return { safe: true };
}
export type MediaQuarantineLifecycleState =
  | 'pending'
  | 'validating'
  | 'processing'
  | 'approved'
  | 'quarantined'
  | 'rejected'
  | 'failed';
const ALLOWED_MEDIA_STATE_TRANSITIONS: Record<MediaQuarantineLifecycleState, ReadonlySet<MediaQuarantineLifecycleState>> = {
  pending: new Set(['validating', 'quarantined', 'rejected']),
  validating: new Set(['processing', 'quarantined', 'rejected', 'failed']),
  processing: new Set(['approved', 'quarantined', 'rejected', 'failed']),
  quarantined: new Set(['rejected']),
  approved: new Set(['quarantined', 'rejected']),
  rejected: new Set([]),
  failed: new Set(['rejected']),
};
export function evaluateMediaQuarantineStateTransition(params: {
  currentState: MediaQuarantineLifecycleState;
  nextState: MediaQuarantineLifecycleState;
  isClientRequest: boolean;
  validatedContentSha256: string;
  currentFileContentSha256: string;
}): { allowed: boolean; publicServePermitted: boolean; versionedCacheKey: string; reason?: string } {
  if (params.isClientRequest && (params.nextState === 'approved' || params.nextState === 'processing')) {
    return { allowed: false, publicServePermitted: false, versionedCacheKey: '', reason: 'CLIENT_CANNOT_ASSIGN_APPROVED_MEDIA_STATE' };
  }
  if (!ALLOWED_MEDIA_STATE_TRANSITIONS[params.currentState]?.has(params.nextState)) {
    return { allowed: false, publicServePermitted: false, versionedCacheKey: '', reason: 'INVALID_MEDIA_LIFECYCLE_TRANSITION' };
  }
  if (!/^[a-f0-9]{16,64}$/i.test(params.validatedContentSha256) || !/^[a-f0-9]{16,64}$/i.test(params.currentFileContentSha256)) {
    return { allowed: false, publicServePermitted: false, versionedCacheKey: '', reason: 'MEDIA_CONTENT_HASH_CHANGED_SINCE_VALIDATION' };
  }
  if (params.nextState === 'approved' && params.validatedContentSha256.toLowerCase() !== params.currentFileContentSha256.toLowerCase()) {
    return { allowed: false, publicServePermitted: false, versionedCacheKey: '', reason: 'MEDIA_CONTENT_HASH_CHANGED_SINCE_VALIDATION' };
  }
  const versionedCacheKey = `media_${params.currentFileContentSha256.slice(0, 16)}`;
  return {
    allowed: true,
    publicServePermitted: params.nextState === 'approved',
    versionedCacheKey,
  };
}
export function validateMediaCrossOriginAndDeliveryPolicy(params: {
  mimeType: string; visibility: 'public_approved' | 'private_owner_only' | 'quarantined'; requestOrigin?: string; approvedOrigins: ReadonlySet<string>; }): { deliverable: boolean; contentDisposition: 'inline' | 'attachment'; cacheControl: string; corsAllowOrigin: string | null; } { if (params.visibility === 'quarantined') { return { deliverable: false, contentDisposition: 'attachment', cacheControl: 'no-store', corsAllowOrigin: null }; } const inlineMimes = new Set(['image/webp', 'image/jpeg', 'image/png', 'video/mp4', 'video/webm', 'video/quicktime']); const contentDisposition = inlineMimes.has(params.mimeType.toLowerCase()) ? 'inline' : 'attachment'; const cacheControl =
    params.visibility === 'public_approved'
      ? 'public, max-age=31536000, immutable'
      : 'private, no-store, no-cache, must-revalidate'; const corsAllowOrigin =
    params.requestOrigin && params.approvedOrigins.has(params.requestOrigin) ? params.requestOrigin : null; return { deliverable: true, contentDisposition, cacheControl, corsAllowOrigin }; }