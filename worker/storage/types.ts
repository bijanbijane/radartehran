/**
 * @file worker/storage/types.ts
 * @description Formal TypeScript contracts for Cloudflare R2 object storage,
 * provider-independent storage abstractions, multipart upload sessions,
 * metadata ownership models, reconciliation reports, and storage security.
 *
 * Implements strict runtime and type boundaries without depending on Node.js
 * or server-only dependencies.
 */

export type StorageProviderId =
  | 'cloudflare_r2'
  | 's3_compatible'
  | 'arvancloud'
  | 'liara'
  | 'minio'
  | 'local_bucket';

export type StorageDurabilityTier =
  | 'PRODUCTION_OBJECT_STORAGE'
  | 'EPHEMERAL_DEV_FILESYSTEM'
  | 'UNCONFIGURED_DISABLED';

export type ObjectMediaCategory = 'image' | 'video';

export type AllowedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type AllowedVideoMime = 'video/mp4' | 'video/webm' | 'video/quicktime';
export type AllowedMediaMime = AllowedImageMime | AllowedVideoMime;

export type UploadLifecycleState =
  | 'CREATED'
  | 'AUTHORIZED'
  | 'UPLOADING'
  | 'UPLOADED'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'PUBLISHED'
  | 'FAILED'
  | 'ABORT_REQUESTED'
  | 'ABORTED'
  | 'EXPIRED';

export type DeletionLifecycleState =
  | 'ACTIVE'
  | 'SOFT_DELETED'
  | 'PENDING_PHYSICAL_DELETE'
  | 'PHYSICALLY_DELETED'
  | 'RETENTION_LOCKED'
  | 'LEGAL_HOLD_PROTECTED'
  | 'FAILED_RETRYABLE';

export type StorageOrphanClassification =
  | 'REFERENCED_ACTIVE'
  | 'UNATTACHED_WITHIN_GRACE_WINDOW'
  | 'ORPHAN_UNATTACHED_EXPIRED'
  | 'ORPHAN_STALE_TARGET_DELETED'
  | 'DANGLING_STORAGE_BYTES_WITHOUT_METADATA'
  | 'MISSING_STORAGE_BYTES_FOR_ACTIVE_METADATA'
  | 'PENDING_DELETE_INTERRUPTED';

export interface StorageHttpMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

export interface StorageCustomMetadata {
  [key: string]: string;
}

/**
 * Standard R2 range specification.
 */
export type StorageRange =
  | { offset: number; length?: number }
  | { suffix: number };

/**
 * Conditional constraints for atomic/conditional operations.
 */
export interface StorageConditionalConstraints {
  etagMatches?: string;
  etagDoesNotMatch?: string;
  uploadedBefore?: Date;
  uploadedAfter?: Date;
}

export interface StoragePutOptions {
  httpMetadata?: StorageHttpMetadata;
  customMetadata?: StorageCustomMetadata;
  md5?: ArrayBuffer | string;
  sha1?: ArrayBuffer | string;
  sha256?: ArrayBuffer | string;
  onlyIf?: StorageConditionalConstraints;
}

export interface StorageGetOptions {
  onlyIf?: StorageConditionalConstraints;
  range?: StorageRange;
}

export interface StorageListOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
  delimiter?: string;
  include?: ('httpMetadata' | 'customMetadata')[];
}

export interface StorageObjectSummary {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  httpMetadata?: StorageHttpMetadata;
  customMetadata?: StorageCustomMetadata;
}

export interface StorageObjectsList {
  objects: StorageObjectSummary[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes: string[];
}

export interface StorageObjectDescriptor extends StorageObjectSummary {
  writeHttpMetadata(headers: Headers): void;
}

export interface StorageObjectWithBody extends StorageObjectDescriptor {
  readonly body: ReadableStream<Uint8Array>;
  readonly bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  blob(): Promise<Blob>;
}

export interface StorageUploadedPart {
  partNumber: number;
  etag: string;
}

export interface StorageMultipartUpload {
  readonly key: string;
  readonly uploadId: string;
  uploadPart(partNumber: number, value: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string): Promise<StorageUploadedPart>;
  abort(): Promise<void>;
  complete(uploadedParts: StorageUploadedPart[]): Promise<StorageObjectDescriptor>;
}

/**
 * Official Cloudflare Worker R2Bucket binding contract.
 * Directly mirrors the Cloudflare Workers runtime R2 API.
 */
export interface R2BucketBinding {
  get(key: string, options?: StorageGetOptions): Promise<StorageObjectWithBody | null>;
  head(key: string): Promise<StorageObjectDescriptor | null>;
  put(
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | string | null | Blob,
    options?: StoragePutOptions
  ): Promise<StorageObjectDescriptor | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: StorageListOptions): Promise<StorageObjectsList>;
  createMultipartUpload(key: string, options?: StoragePutOptions): Promise<StorageMultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): Promise<StorageMultipartUpload>;
}

export interface StorageProviderCapabilities {
  readonly providerId: StorageProviderId;
  readonly supportsNativeR2Binding: boolean;
  readonly supportsStreamingReads: boolean;
  readonly supportsRangeRequests: boolean;
  readonly supportsConditionalWrites: boolean;
  readonly supportsMultipartUploads: boolean;
  readonly supportsCustomMetadata: boolean;
  readonly supportsPagination: boolean;
  readonly supportsDirectPresignedUrls: boolean;
  readonly notes: string;
}

/**
 * Abstract provider interface implemented by R2 and simulated adapters.
 */
export interface ObjectStorageProvider {
  getCapabilities(): StorageProviderCapabilities;
  putObject(
    key: string,
    data: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
    options?: StoragePutOptions
  ): Promise<StorageObjectDescriptor>;
  getObject(key: string, options?: StorageGetOptions): Promise<StorageObjectWithBody | null>;
  headObject(key: string): Promise<StorageObjectDescriptor | null>;
  deleteObject(key: string): Promise<{ deleted: boolean; wasAlreadyMissing: boolean }>;
  deleteObjects(keys: string[]): Promise<{ deletedKeys: string[]; failedKeys: string[] }>;
  listObjects(options?: StorageListOptions): Promise<StorageObjectsList>;
  createMultipartUpload(key: string, options?: StoragePutOptions): Promise<StorageMultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): Promise<StorageMultipartUpload>;
}

/**
 * Canonical Metadata Model separated from raw object bytes.
 * R2 is the bit store; this record is the authoritative business record.
 */
export interface CanonicalObjectMetadata {
  readonly objectId: string;
  readonly storageKey: string;
  readonly providerId: StorageProviderId;
  readonly environment: 'development' | 'preview' | 'staging' | 'production';
  readonly ownerUid: string;
  readonly associatedEntity?: {
    readonly entityType: 'BARGAIN' | 'SPONSOR' | 'UNATTACHED';
    readonly entityId: string | null;
  };
  readonly mediaCategory: ObjectMediaCategory;
  readonly mimeType: AllowedMediaMime | string;
  readonly declaredSizeBytes: number;
  readonly actualSizeBytes: number;
  readonly sha256Checksum: string;
  readonly lifecycleState: UploadLifecycleState;
  readonly deletionState: DeletionLifecycleState;
  readonly visibility: 'PRIVATE' | 'PUBLIC_WHEN_ATTACHED' | 'RESTRICTED_ADMIN';
  readonly legalHold: boolean;
  readonly retentionUntilIso?: string;
  readonly uploadGrantId: string;
  readonly idempotencyKey: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly verifiedAtIso?: string;
  readonly deletedAtIso?: string;
  readonly deletionAttempts: number;
  readonly lastError?: string;
  readonly revision: number;
}

/**
 * Durable Multipart / Chunked Upload Session.
 */
export interface DurableUploadSession {
  readonly sessionId: string;
  readonly uploadId?: string;
  readonly storageKey: string;
  readonly ownerUid: string;
  readonly totalParts: number;
  readonly maxAllowedBytes: number;
  readonly mimeType: string;
  readonly mediaCategory: ObjectMediaCategory;
  readonly originalFileName: string;
  readonly partsReceived: StorageUploadedPart[];
  readonly totalBytesReceived: number;
  readonly status: 'ACTIVE' | 'COMPLETED' | 'ABORTED' | 'EXPIRED';
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}
