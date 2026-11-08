/**
 * @file worker/storage/r2Adapter.ts
 * @description Cloudflare R2 Native Object Storage Adapter.
 *
 * Implements the standard `ObjectStorageProvider` interface using official
 * Cloudflare Worker `R2Bucket` bindings.
 *
 * Enforces:
 * - Direct Worker binding usage (zero S3 credential requirements in Worker).
 * - Exact Cloudflare R2 API semantics for get, head, put, delete, list, and multipart.
 * - HTTP metadata and custom metadata attachment.
 * - ETag and conditional matching (`onlyIf`).
 * - Streaming reads and byte-range support.
 * - Fail-closed error handling and capability disclosure.
 */

import type {
  ObjectStorageProvider,
  R2BucketBinding,
  StorageGetOptions,
  StorageListOptions,
  StorageMultipartUpload,
  StorageObjectDescriptor,
  StorageObjectsList,
  StorageObjectWithBody,
  StorageProviderCapabilities,
  StoragePutOptions,
} from './types';

export class CloudflareR2StorageAdapter implements ObjectStorageProvider {
  private readonly bucket: R2BucketBinding;
  private readonly bucketName: string;

  constructor(bucketBinding: R2BucketBinding, bucketName = 'radartehran-media') {
    if (!bucketBinding || typeof bucketBinding.put !== 'function') {
      throw new Error('CloudflareR2StorageAdapter requires a valid R2Bucket binding');
    }
    this.bucket = bucketBinding;
    this.bucketName = bucketName;
  }

  public getCapabilities(): StorageProviderCapabilities {
    return {
      providerId: 'cloudflare_r2',
      supportsNativeR2Binding: true,
      supportsStreamingReads: true,
      supportsRangeRequests: true,
      supportsConditionalWrites: true,
      supportsMultipartUploads: true,
      supportsCustomMetadata: true,
      supportsPagination: true,
      supportsDirectPresignedUrls: false, // In Worker runtime, presigning S3 URLs requires S3 credentials or Worker API endpoints
      notes: `Cloudflare R2 native binding for bucket '${this.bucketName}'. Consistent metadata, zero egress fees, global edge distribution.`,
    };
  }

  public async putObject(
    key: string,
    data: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
    options?: StoragePutOptions
  ): Promise<StorageObjectDescriptor> {
    const cleanKey = key.trim();
    if (!cleanKey) {
      throw new Error('EMPTY_STORAGE_KEY');
    }

    const res = await this.bucket.put(cleanKey, data, options);
    if (!res) {
      throw new Error('R2_PUT_PRECONDITION_FAILED: Conditional constraint (onlyIf) did not match.');
    }
    return res;
  }

  public async getObject(key: string, options?: StorageGetOptions): Promise<StorageObjectWithBody | null> {
    const cleanKey = key.trim();
    if (!cleanKey) return null;
    return await this.bucket.get(cleanKey, options);
  }

  public async headObject(key: string): Promise<StorageObjectDescriptor | null> {
    const cleanKey = key.trim();
    if (!cleanKey) return null;
    return await this.bucket.head(cleanKey);
  }

  public async deleteObject(key: string): Promise<{ deleted: boolean; wasAlreadyMissing: boolean }> {
    const cleanKey = key.trim();
    if (!cleanKey) {
      return { deleted: true, wasAlreadyMissing: true };
    }

    // Check existence first to return deterministic status
    const existing = await this.bucket.head(cleanKey);
    await this.bucket.delete(cleanKey);
    return {
      deleted: true,
      wasAlreadyMissing: existing === null,
    };
  }

  public async deleteObjects(keys: string[]): Promise<{ deletedKeys: string[]; failedKeys: string[] }> {
    const validKeys = keys.map((k) => k.trim()).filter(Boolean);
    if (validKeys.length === 0) {
      return { deletedKeys: [], failedKeys: [] };
    }

    try {
      await this.bucket.delete(validKeys);
      return { deletedKeys: validKeys, failedKeys: [] };
    } catch {
      // In case of error, report as failed
      return { deletedKeys: [], failedKeys: validKeys };
    }
  }

  public async listObjects(options?: StorageListOptions): Promise<StorageObjectsList> {
    return await this.bucket.list(options);
  }

  public async createMultipartUpload(key: string, options?: StoragePutOptions): Promise<StorageMultipartUpload> {
    const cleanKey = key.trim();
    if (!cleanKey) throw new Error('EMPTY_STORAGE_KEY');
    return await this.bucket.createMultipartUpload(cleanKey, options);
  }

  public async resumeMultipartUpload(key: string, uploadId: string): Promise<StorageMultipartUpload> {
    const cleanKey = key.trim();
    if (!cleanKey || !uploadId) throw new Error('INVALID_RESUME_MULTIPART_PARAMS');
    return await this.bucket.resumeMultipartUpload(cleanKey, uploadId);
  }
}
