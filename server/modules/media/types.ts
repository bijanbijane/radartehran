/**
 * @fileoverview Employee 6 — Media and Object Storage Backend Domain Types (`server/modules/media/types.ts`).
 *
 * Enforces:
 * 1. Strict separation between Firestore metadata (`MediaMetadataRecord`) and object bytes (`Uint8Array`).
 * 2. Explicit distinction between production durable object storage and ephemeral local development storage.
 * 3. Explicit media-reference verification interfaces for Bargains and Sponsors without coupling modules.
 * 4. Zero exposure of private storage credentials or unrestricted internal object keys.
 */

import type { CityId } from '../../../src/types/models';
import type { ObjectStorageProviderId } from '../../../src/utils/objectStorage';

export type MediaErrorCode =
  | 'UNAUTHORIZED_ACTOR'
  | 'FORBIDDEN_NOT_OWNER'
  | 'FORBIDDEN_ADMIN_REQUIRED'
  | 'PRODUCTION_DURABLE_STORAGE_NOT_CONFIGURED'
  | 'STORAGE_PROVIDER_UNAVAILABLE'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'INVALID_MEDIA_PAYLOAD'
  | 'MAGIC_BYTES_MISMATCH'
  | 'CHECKSUM_MISMATCH'
  | 'UPLOAD_GRANT_EXPIRED_OR_INVALID'
  | 'TARGET_OWNERSHIP_VERIFICATION_FAILED'
  | 'MEDIA_ALREADY_ATTACHED'
  | 'MEDIA_ATTACHED_CANNOT_DELETE_DIRECTLY'
  | 'OBJECT_NOT_FOUND'
  | 'STORAGE_BYTES_MISSING'
  | 'CONCURRENT_MODIFICATION_CONFLICT'
  | 'METADATA_RAW_BYTES_VIOLATION';

export class MediaDomainError extends Error {
  public readonly code: MediaErrorCode;
  public readonly statusCode: number;
  public readonly retryable: boolean;

  constructor(code: MediaErrorCode, message: string, statusCode = 400, retryable = false) {
    super(message);
    this.name = 'MediaDomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export interface MediaActorContext {
  readonly uid: string;
  readonly isAdmin: boolean;
}

export type StorageDurabilityTier =
  | 'PRODUCTION_OBJECT_STORAGE'
  | 'EPHEMERAL_DEV_FILESYSTEM'
  | 'UNCONFIGURED_DISABLED';

export type MediaObjectLifecycleState =
  | 'UPLOAD_AUTHORIZED'
  | 'ACTIVE'
  | 'PENDING_DELETE'
  | 'DELETED'
  | 'QUARANTINED_CORRUPT';

export type MediaAssociationTargetType = 'UNATTACHED' | 'BARGAIN' | 'SPONSOR';

export type MediaVisibilityPolicy = 'OWNER_OR_ADMIN' | 'PUBLIC_WHEN_ATTACHED';

export interface MediaEntityAssociation {
  readonly targetType: MediaAssociationTargetType;
  readonly targetId: string | null;
  readonly attachedByUid: string | null;
  readonly attachedAtIso: string | null;
}

export interface MediaUploadAuthorizationRequest {
  readonly idempotencyKey: string;
  readonly cityId: CityId;
  readonly hoodId: number;
  readonly mediaType: 'image' | 'video';
  readonly mimeType: string;
  readonly declaredSizeBytes: number;
  readonly expectedSha256: string;
  readonly originalFileName: string;
  readonly visibilityPolicy?: MediaVisibilityPolicy;
}

export interface MediaUploadGrant {
  readonly grantId: string;
  readonly idempotencyKey: string;
  readonly objectId: string;
  readonly ownerUid: string;
  readonly cityId: CityId;
  readonly hoodId: number;
  readonly mediaType: 'image' | 'video';
  readonly mimeType: string;
  readonly declaredSizeBytes: number;
  readonly expectedSha256: string;
  readonly visibilityPolicy: MediaVisibilityPolicy;
  readonly issuedAtIso: string;
  readonly expiresAtIso: string;
  readonly consumed: boolean;
}

/**
 * Firestore Metadata Document (`media_object_metadata_v2/{objectId}`).
 * Must NEVER contain raw file bytes, base64 payloads, or secret credentials.
 */
export interface MediaMetadataRecord {
  readonly objectId: string;
  readonly ownerUid: string;
  readonly cityId: CityId;
  readonly hoodId: number;
  readonly mediaType: 'image' | 'video';
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly state: MediaObjectLifecycleState;
  readonly visibilityPolicy: MediaVisibilityPolicy;
  readonly providerId: ObjectStorageProviderId;
  readonly durabilityTier: StorageDurabilityTier;
  readonly internalObjectKey: string;
  readonly byteStorageVerified: boolean;
  readonly association: MediaEntityAssociation;
  readonly uploadGrantId: string;
  readonly idempotencyKey: string;
  readonly deletionAttemptCount: number;
  readonly lastDeleteError?: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly deletedAtIso?: string;
  readonly revision: number;
}

/**
 * Sanitized Public Media Descriptor safe to return to clients or embed in Bargain/Sponsor responses.
 * Never exposes `internalObjectKey`, local paths, or storage credentials.
 */
export interface PublicMediaObjectDescriptor {
  readonly objectId: string;
  readonly retrievalUrl: string;
  readonly mediaType: 'image' | 'video';
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly state: MediaObjectLifecycleState;
  readonly durabilityTier: StorageDurabilityTier;
  readonly association: {
    readonly targetType: MediaAssociationTargetType;
    readonly targetId: string | null;
  };
  readonly createdAtIso: string;
}

// ============================================================================
// EXPLICIT MEDIA-REFERENCE INTERFACES FOR BARGAINS & SPONSORS INTEGRATION
// ============================================================================

export interface TargetEntityOwnershipVerification {
  readonly exists: boolean;
  readonly ownerUid: string | null;
  readonly declaredMediaObjectIds?: readonly string[];
}

/**
 * Explicit integration contract implemented by Bargains or Sponsors modules
 * so `server/modules/media/` can verify target entity ownership before attaching
 * or cleaning up media without directly modifying Bargains or Sponsors modules.
 */
export interface MediaTargetEntityVerifier {
  verifyTargetEntity(
    targetType: 'BARGAIN' | 'SPONSOR',
    targetId: string
  ): Promise<TargetEntityOwnershipVerification>;
}

export interface AttachMediaToTargetRequest {
  readonly objectIds: readonly string[];
  readonly targetType: 'BARGAIN' | 'SPONSOR';
  readonly targetId: string;
  readonly idempotencyKey?: string;
}

export interface AttachMediaToTargetResult {
  readonly targetType: 'BARGAIN' | 'SPONSOR';
  readonly targetId: string;
  readonly attachedObjects: readonly PublicMediaObjectDescriptor[];
  readonly idempotentReplay: boolean;
}

// ============================================================================
// STORAGE PROVIDER ABSTRACTION & RETRIEVAL / DELETION CONTRACTS
// ============================================================================

export interface StorageProviderHealthStatus {
  readonly providerId: ObjectStorageProviderId;
  readonly durabilityTier: StorageDurabilityTier;
  readonly isConfigured: boolean;
  readonly isProductionSafe: boolean;
  readonly reason: string;
}

export interface ByteObjectPutResult {
  readonly storedKey: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly durabilityTier: StorageDurabilityTier;
}

export interface ByteObjectGetResult {
  readonly bytes: Buffer;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly contentRange?: string;
  readonly isPartialContent: boolean;
}

export interface ByteObjectDeleteResult {
  readonly deleted: boolean;
  readonly wasAlreadyMissing: boolean;
}

export interface MediaByteStorageProvider {
  getHealthStatus(): StorageProviderHealthStatus;
  putObjectBytes(internalKey: string, bytes: Buffer, mimeType: string): Promise<ByteObjectPutResult>;
  getObjectBytes(
    internalKey: string,
    rangeHeader?: string
  ): Promise<ByteObjectGetResult | null>;
  headObjectExists(internalKey: string): Promise<boolean>;
  deleteObjectBytes(internalKey: string): Promise<ByteObjectDeleteResult>;
  listStoredObjectKeys(): Promise<string[]>;
}

export interface MediaDeleteOperationResult {
  readonly objectId: string;
  readonly status: 'DELETED' | 'PENDING_RETRY';
  readonly idempotentReplay: boolean;
  readonly retryable: boolean;
  readonly deletionAttemptCount: number;
  readonly errorReason?: string;
}

// ============================================================================
// ORPHAN DETECTION & DURABLE CLEANUP JOB CONTRACTS
// ============================================================================

export type OrphanMediaClassification =
  | 'REFERENCED_ACTIVE'
  | 'UNATTACHED_WITHIN_GRACE_WINDOW'
  | 'ORPHAN_UNATTACHED_EXPIRED'
  | 'ORPHAN_STALE_TARGET_DELETED'
  | 'DANGLING_STORAGE_BYTES_WITHOUT_METADATA'
  | 'MISSING_STORAGE_BYTES_FOR_ACTIVE_METADATA'
  | 'PENDING_DELETE_INTERRUPTED';

export interface ActiveEntityReferenceSnapshot {
  readonly activeBargainIds: ReadonlySet<string>;
  readonly activeSponsorIds: ReadonlySet<string>;
  readonly referencedMediaObjectIds: ReadonlySet<string>;
}

export interface OrphanMediaInspectionItem {
  readonly objectId: string | null;
  readonly internalObjectKey: string;
  readonly classification: OrphanMediaClassification;
  readonly state: MediaObjectLifecycleState | 'NO_METADATA';
  readonly eligibleForCleanup: boolean;
}

export interface OrphanDetectionReport {
  readonly evaluatedAtIso: string;
  readonly totalMetadataScanned: number;
  readonly totalStorageKeysScanned: number;
  readonly counts: Readonly<Record<OrphanMediaClassification, number>>;
  readonly items: readonly OrphanMediaInspectionItem[];
}

export type DurableCleanupJobStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL_RETRYABLE';

export interface DurableCleanupJobItemState {
  readonly objectId: string | null;
  readonly internalObjectKey: string;
  readonly classification: OrphanMediaClassification;
  readonly outcome: 'PENDING' | 'DELETED' | 'FAILED_RETRYABLE' | 'SKIPPED_ACTIVE';
  readonly attempts: number;
  readonly lastError?: string;
}

export interface DurableMediaCleanupJob {
  readonly jobId: string;
  readonly createdByUid: string;
  readonly status: DurableCleanupJobStatus;
  readonly cursorIndex: number;
  readonly items: readonly DurableCleanupJobItemState[];
  readonly deletedCount: number;
  readonly failedCount: number;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly completedAtIso?: string;
  readonly revision: number;
}
