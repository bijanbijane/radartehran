/**
 * @fileoverview Storage Provider Abstraction (`server/modules/media/storageProvider.ts`).
 *
 * Enforces:
 * - Local filesystem / ephemeral storage NEVER silently becomes production durable storage.
 * - Configured S3-compatible / ArvanCloud / Liara / R2 object storage is used ONLY when
 *   its availability and credentials are explicitly established (never inventing an active R2/S3 deployment).
 * - Private storage credentials and unrestricted keys are never exposed.
 */

import crypto from 'node:crypto';
import {
  buildValidatedS3TargetUrl,
  deleteFromRemoteS3Compatible,
  downloadFromRemoteS3Compatible,
  type ResolvedObjectStorageConfig,
  resolveObjectStorageRuntimeConfig,
  uploadToRemoteS3Compatible,
} from '../../../src/utils/objectStorageUpload';
import { parseSingleByteRange } from '../../../src/utils/serverObjectStorageHelpers';
import {
  type ByteObjectDeleteResult,
  type ByteObjectGetResult,
  type ByteObjectPutResult,
  type MediaByteStorageProvider,
  MediaDomainError,
  type StorageProviderHealthStatus,
} from './types';

const SCOPED_OBJECT_KEY_PATTERN =
  /^listings\/(tehran|karaj|mashhad|isfahan|shiraz)\/hood-([1-9]\d{0,2})\/(image|video)\/\d{4}-(0[1-9]|1[0-2])\/(obj-\d{10,16}-[a-f0-9]{8})\.(webp|jpg|jpeg|png|mp4|mov|webm)$/i;

export function assertScopedInternalObjectKey(objectKey: string): string {
  const clean = typeof objectKey === 'string' ? objectKey.trim() : '';
  if (!clean || clean.includes('..') || clean.includes('\\') || !SCOPED_OBJECT_KEY_PATTERN.test(clean)) {
    throw new MediaDomainError(
      'INVALID_MEDIA_PAYLOAD',
      'Rejected unrestricted or malformed internal object storage key.',
      400
    );
  }
  return clean;
}

export function computeSha256Hex(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sliceRangeIfRequested(
  fullBuffer: Buffer,
  sha256: string,
  rangeHeader?: string
): ByteObjectGetResult {
  if (!rangeHeader) {
    return {
      bytes: Buffer.from(fullBuffer),
      sizeBytes: fullBuffer.length,
      sha256,
      isPartialContent: false,
    };
  }
  const range = parseSingleByteRange(rangeHeader, fullBuffer.length);
  if (!range) {
    throw new MediaDomainError('INVALID_MEDIA_PAYLOAD', 'Requested HTTP byte range is not satisfiable.', 416);
  }
  const sliced = fullBuffer.subarray(range.start, range.end + 1);
  return {
    bytes: Buffer.from(sliced),
    sizeBytes: sliced.length,
    sha256,
    contentRange: `bytes ${range.start}-${range.end}/${fullBuffer.length}`,
    isPartialContent: true,
  };
}

/**
 * S3-Compatible Durable Object Storage Provider.
 * Only operates when credentials (`OBJECT_STORAGE_ACCESS_KEY`, `OBJECT_STORAGE_SECRET_KEY`)
 * and a validated HTTPS endpoint are explicitly established. Never invents a fake R2/S3 deployment.
 */
export class ConfiguredS3ByteStorageProvider implements MediaByteStorageProvider {
  private readonly env: Record<string, string | undefined>;
  private readonly trackedKeys = new Set<string>();

  constructor(env: Record<string, string | undefined> = process.env) {
    this.env = env;
  }

  private resolveVerifiedConfig(): ResolvedObjectStorageConfig {
    const cfg = resolveObjectStorageRuntimeConfig(this.env);
    const probeKey = 'listings/tehran/hood-1/image/2026-05/obj-1710000000000-abcdef12.webp';
    const validTarget = buildValidatedS3TargetUrl(probeKey, cfg, this.env);
    if (!cfg.s3CredentialsConfigured || !validTarget || cfg.provider === 'local_bucket') {
      throw new MediaDomainError(
        'PRODUCTION_DURABLE_STORAGE_NOT_CONFIGURED',
        'Durable object storage credentials and verified endpoint are not established.',
        503,
        false
      );
    }
    return cfg;
  }

  public getHealthStatus(): StorageProviderHealthStatus {
    const cfg = resolveObjectStorageRuntimeConfig(this.env);
    const probeKey = 'listings/tehran/hood-1/image/2026-05/obj-1710000000000-abcdef12.webp';
    const validTarget = buildValidatedS3TargetUrl(probeKey, cfg, this.env);
    const isConfigured = Boolean(cfg.s3CredentialsConfigured && validTarget && cfg.provider !== 'local_bucket');
    return {
      providerId: cfg.provider,
      durabilityTier: isConfigured ? 'PRODUCTION_OBJECT_STORAGE' : 'UNCONFIGURED_DISABLED',
      isConfigured,
      isProductionSafe: isConfigured,
      reason: isConfigured
        ? `Verified S3-compatible provider (${cfg.provider}) with explicit credentials.`
        : 'Object storage credentials or allowlisted HTTPS endpoint are not configured.',
    };
  }

  public async putObjectBytes(
    internalKey: string,
    bytes: Buffer,
    mimeType: string
  ): Promise<ByteObjectPutResult> {
    const safeKey = assertScopedInternalObjectKey(internalKey);
    const cfg = this.resolveVerifiedConfig();
    const ok = await uploadToRemoteS3Compatible(safeKey, bytes, mimeType, cfg);
    if (!ok) {
      throw new MediaDomainError(
        'STORAGE_PROVIDER_UNAVAILABLE',
        'Remote object storage write failed or endpoint was unreachable.',
        502,
        true
      );
    }
    this.trackedKeys.add(safeKey);
    return {
      storedKey: safeKey,
      sizeBytes: bytes.length,
      sha256: computeSha256Hex(bytes),
      durabilityTier: 'PRODUCTION_OBJECT_STORAGE',
    };
  }

  public async getObjectBytes(
    internalKey: string,
    rangeHeader?: string
  ): Promise<ByteObjectGetResult | null> {
    const safeKey = assertScopedInternalObjectKey(internalKey);
    const cfg = this.resolveVerifiedConfig();
    const buf = await downloadFromRemoteS3Compatible(safeKey, cfg);
    if (!buf) return null;
    return sliceRangeIfRequested(buf, computeSha256Hex(buf), rangeHeader);
  }

  public async headObjectExists(internalKey: string): Promise<boolean> {
    const got = await this.getObjectBytes(internalKey);
    return got !== null;
  }

  public async deleteObjectBytes(internalKey: string): Promise<ByteObjectDeleteResult> {
    const safeKey = assertScopedInternalObjectKey(internalKey);
    const cfg = this.resolveVerifiedConfig();
    const ok = await deleteFromRemoteS3Compatible(safeKey, cfg);
    if (!ok) {
      throw new MediaDomainError(
        'STORAGE_PROVIDER_UNAVAILABLE',
        'Remote object storage deletion failed; retained for retry.',
        502,
        true
      );
    }
    const wasTracked = this.trackedKeys.delete(safeKey);
    return { deleted: true, wasAlreadyMissing: !wasTracked };
  }

  public async listStoredObjectKeys(): Promise<string[]> {
    this.resolveVerifiedConfig();
    return Array.from(this.trackedKeys).sort();
  }
}

/**
 * Explicit Non-Production / Contract-Testable Byte Storage Provider.
 *
 * CRITICAL INVARIANT:
 * If `environmentMode === 'production'` and `durabilityTier === 'EPHEMERAL_DEV_FILESYSTEM'`,
 * all write/delete operations fail closed with `PRODUCTION_DURABLE_STORAGE_NOT_CONFIGURED`
 * so local/ephemeral storage NEVER silently becomes production durable storage.
 */
export class DeterministicByteStorageProvider implements MediaByteStorageProvider {
  private readonly objects = new Map<string, { bytes: Buffer; mimeType: string; sha256: string }>();
  private readonly environmentMode: 'development' | 'test' | 'production';
  private readonly durabilityTier: 'PRODUCTION_OBJECT_STORAGE' | 'EPHEMERAL_DEV_FILESYSTEM';
  private simulatedFailureMode: 'NONE' | 'PUT_FAIL' | 'DELETE_FAIL' | 'GET_FAIL' = 'NONE';

  constructor(options?: {
    environmentMode?: 'development' | 'test' | 'production';
    durabilityTier?: 'PRODUCTION_OBJECT_STORAGE' | 'EPHEMERAL_DEV_FILESYSTEM';
  }) {
    this.environmentMode = options?.environmentMode ?? 'test';
    this.durabilityTier = options?.durabilityTier ?? 'EPHEMERAL_DEV_FILESYSTEM';
  }

  public setSimulatedFailureMode(mode: 'NONE' | 'PUT_FAIL' | 'DELETE_FAIL' | 'GET_FAIL'): void {
    this.simulatedFailureMode = mode;
  }

  private assertAllowedInCurrentEnvironment(): void {
    if (
      this.environmentMode === 'production' &&
      this.durabilityTier === 'EPHEMERAL_DEV_FILESYSTEM'
    ) {
      throw new MediaDomainError(
        'PRODUCTION_DURABLE_STORAGE_NOT_CONFIGURED',
        'Local filesystem / ephemeral storage cannot silently act as production durable storage.',
        503,
        false
      );
    }
  }

  public getHealthStatus(): StorageProviderHealthStatus {
    const isProductionSafe = this.durabilityTier === 'PRODUCTION_OBJECT_STORAGE';
    const blockedInProd = this.environmentMode === 'production' && !isProductionSafe;
    return {
      providerId: isProductionSafe ? 's3_compatible' : 'local_bucket',
      durabilityTier: blockedInProd ? 'UNCONFIGURED_DISABLED' : this.durabilityTier,
      isConfigured: !blockedInProd,
      isProductionSafe,
      reason: blockedInProd
        ? 'Local filesystem storage is blocked in production mode.'
        : `Active ${this.durabilityTier} provider.`,
    };
  }

  public async putObjectBytes(
    internalKey: string,
    bytes: Buffer,
    mimeType: string
  ): Promise<ByteObjectPutResult> {
    this.assertAllowedInCurrentEnvironment();
    const safeKey = assertScopedInternalObjectKey(internalKey);
    if (this.simulatedFailureMode === 'PUT_FAIL') {
      throw new MediaDomainError('STORAGE_PROVIDER_UNAVAILABLE', 'Simulated byte storage write failure.', 502, true);
    }
    const sha256 = computeSha256Hex(bytes);
    this.objects.set(safeKey, { bytes: Buffer.from(bytes), mimeType, sha256 });
    return {
      storedKey: safeKey,
      sizeBytes: bytes.length,
      sha256,
      durabilityTier: this.durabilityTier,
    };
  }

  public async getObjectBytes(
    internalKey: string,
    rangeHeader?: string
  ): Promise<ByteObjectGetResult | null> {
    this.assertAllowedInCurrentEnvironment();
    const safeKey = assertScopedInternalObjectKey(internalKey);
    if (this.simulatedFailureMode === 'GET_FAIL') {
      throw new MediaDomainError('STORAGE_PROVIDER_UNAVAILABLE', 'Simulated byte storage read failure.', 502, true);
    }
    const entry = this.objects.get(safeKey);
    if (!entry) return null;
    return sliceRangeIfRequested(entry.bytes, entry.sha256, rangeHeader);
  }

  public async headObjectExists(internalKey: string): Promise<boolean> {
    this.assertAllowedInCurrentEnvironment();
    const safeKey = assertScopedInternalObjectKey(internalKey);
    return this.objects.has(safeKey);
  }

  public async deleteObjectBytes(internalKey: string): Promise<ByteObjectDeleteResult> {
    this.assertAllowedInCurrentEnvironment();
    const safeKey = assertScopedInternalObjectKey(internalKey);
    if (this.simulatedFailureMode === 'DELETE_FAIL') {
      throw new MediaDomainError('STORAGE_PROVIDER_UNAVAILABLE', 'Simulated byte storage delete failure.', 502, true);
    }
    const existed = this.objects.delete(safeKey);
    return { deleted: true, wasAlreadyMissing: !existed };
  }

  public async listStoredObjectKeys(): Promise<string[]> {
    this.assertAllowedInCurrentEnvironment();
    return Array.from(this.objects.keys()).sort();
  }
}
