/**
 * @fileoverview Employee 6 — Media and Object Storage Public Barrel (`server/modules/media/index.ts`).
 *
 * Exposes:
 * - `MediaDomainService` (upload authorization, registration, ownership & target association, retrieval, retryable deletion)
 * - `MediaOrphanAndCleanupEngine` (orphan detection, durable checkpointed cleanup jobs)
 * - `MediaByteStorageProvider` (`ConfiguredS3ByteStorageProvider`, `DeterministicByteStorageProvider`)
 * - `MediaMetadataPersistenceStore` (`createDurableMediaMetadataStore`)
 * - Explicit `MediaTargetEntityVerifier` interfaces for Bargains and Sponsors integration
 */

export * from './types';
export {
  assertScopedInternalObjectKey,
  computeSha256Hex,
  ConfiguredS3ByteStorageProvider,
  DeterministicByteStorageProvider,
} from './storageProvider';
export {
  MEDIA_METADATA_COLLECTION,
  MEDIA_UPLOAD_GRANTS_COLLECTION,
  MEDIA_CLEANUP_JOBS_COLLECTION,
  assertMetadataContainsNoRawBytes,
  assertAuthenticatedMediaActor,
  assertMediaAdminActor,
  toPublicMediaDescriptor,
  type MediaMetadataPersistenceStore,
  createDurableMediaMetadataStore,
} from './metadataStore';
export { MediaDomainService } from './mediaDomainService';
export {
  DEFAULT_UNATTACHED_GRACE_WINDOW_MS,
  MediaOrphanAndCleanupEngine,
} from './orphanAndCleanupEngine';

import {
  createDurableMediaMetadataStore,
  type MediaMetadataPersistenceStore,
} from './metadataStore';
import { MediaDomainService } from './mediaDomainService';
import { MediaOrphanAndCleanupEngine } from './orphanAndCleanupEngine';
import {
  ConfiguredS3ByteStorageProvider,
  DeterministicByteStorageProvider,
} from './storageProvider';
import type { MediaByteStorageProvider } from './types';

export interface MediaModuleFacade {
  readonly metadataStore: MediaMetadataPersistenceStore;
  readonly byteStorage: MediaByteStorageProvider;
  readonly mediaService: MediaDomainService;
  readonly orphanAndCleanup: MediaOrphanAndCleanupEngine;
}

/**
 * Factory creating a complete Media and Object Storage module facade.
 * Uses `ConfiguredS3ByteStorageProvider` by default in production unless a custom provider is injected.
 */
export function createMediaModuleFacade(options?: {
  metadataStore?: MediaMetadataPersistenceStore;
  byteStorage?: MediaByteStorageProvider;
  durableSnapshotPath?: string;
}): MediaModuleFacade {
  const metadataStore =
    options?.metadataStore ??
    createDurableMediaMetadataStore({ durableSnapshotPath: options?.durableSnapshotPath });
  const byteStorage =
    options?.byteStorage ??
    (process.env.NODE_ENV === 'production'
      ? new ConfiguredS3ByteStorageProvider(process.env)
      : new DeterministicByteStorageProvider({
          environmentMode: 'development',
          durabilityTier: 'EPHEMERAL_DEV_FILESYSTEM',
        }));

  return {
    metadataStore,
    byteStorage,
    mediaService: new MediaDomainService(metadataStore, byteStorage),
    orphanAndCleanup: new MediaOrphanAndCleanupEngine(metadataStore, byteStorage),
  };
}
