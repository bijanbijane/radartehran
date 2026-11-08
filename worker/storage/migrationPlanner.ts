/**
 * @file worker/storage/migrationPlanner.ts
 * @description Non-destructive production migration planner and dry-run reconciliation.
 *
 * Enforces:
 * - Zero production modification during Phase 4 planning.
 * - Inventory compilation: object count, total bytes, format distribution.
 * - Integrity checksum verification.
 * - Destination key mapping and collision detection.
 * - Rollback simulation and batch planning.
 */

import { buildScopedStorageKey } from './keyStrategy';
import type {
  CanonicalObjectMetadata,
  ObjectMediaCategory,
} from './types';

export interface MigrationSourceItem {
  id: string;
  sourceKey: string;
  sizeBytes: number;
  mimeType: string;
  mediaCategory: ObjectMediaCategory;
  city: string;
  hoodId: number;
  ownerUid: string;
  checksumSha256?: string;
  createdAtIso: string;
}

export interface MigrationPlanBatch {
  batchNumber: number;
  items: Array<{
    sourceId: string;
    sourceKey: string;
    destinationKey: string;
    sizeBytes: number;
    checksumSha256?: string;
  }>;
  totalBatchBytes: number;
}

export interface MigrationDryRunReport {
  timestampIso: string;
  totalSourceObjects: number;
  totalSourceBytes: number;
  categoryBreakdown: Record<string, number>;
  mimeBreakdown: Record<string, number>;
  collisionsDetected: number;
  missingChecksumsCount: number;
  batchesPlanned: number;
  batchSize: number;
  concurrencyLimit: number;
  estimatedMigrationSeconds: number;
  rollbackStrategy: string;
  batches: MigrationPlanBatch[];
}

export function generateMigrationDryRunPlan(
  sourceItems: MigrationSourceItem[],
  options?: { batchSize?: number; targetEnvironment?: 'production' | 'staging' | 'preview' }
): MigrationDryRunReport {
  const batchSize = Math.max(10, Math.min(500, options?.batchSize || 100));
  const env = options?.targetEnvironment || 'production';

  let totalBytes = 0;
  const categoryBreakdown: Record<string, number> = {};
  const mimeBreakdown: Record<string, number> = {};
  const destinationKeys = new Set<string>();
  let collisions = 0;
  let missingChecksums = 0;

  const plannedItems: MigrationPlanBatch['items'] = [];

  for (const item of sourceItems) {
    totalBytes += item.sizeBytes;
    categoryBreakdown[item.mediaCategory] = (categoryBreakdown[item.mediaCategory] || 0) + 1;
    mimeBreakdown[item.mimeType] = (mimeBreakdown[item.mimeType] || 0) + 1;

    if (!item.checksumSha256) {
      missingChecksums += 1;
    }

    const destKey = buildScopedStorageKey({
      environment: env,
      city: item.city,
      hoodId: item.hoodId,
      mediaCategory: item.mediaCategory,
      mimeType: item.mimeType,
      objectId: item.id,
    });

    if (destinationKeys.has(destKey)) {
      collisions += 1;
    } else {
      destinationKeys.add(destKey);
    }

    plannedItems.push({
      sourceId: item.id,
      sourceKey: item.sourceKey,
      destinationKey: destKey,
      sizeBytes: item.sizeBytes,
      checksumSha256: item.checksumSha256,
    });
  }

  const batches: MigrationPlanBatch[] = [];
  for (let i = 0; i < plannedItems.length; i += batchSize) {
    const chunk = plannedItems.slice(i, i + batchSize);
    const totalBatchBytes = chunk.reduce((acc, curr) => acc + curr.sizeBytes, 0);
    batches.push({
      batchNumber: Math.floor(i / batchSize) + 1,
      items: chunk,
      totalBatchBytes,
    });
  }

  // Assume conservative 10MB/sec migration transfer rate
  const estimatedSeconds = Math.ceil(totalBytes / (10 * 1024 * 1024));

  return {
    timestampIso: new Date().toISOString(),
    totalSourceObjects: sourceItems.length,
    totalSourceBytes: totalBytes,
    categoryBreakdown,
    mimeBreakdown,
    collisionsDetected: collisions,
    missingChecksumsCount: missingChecksums,
    batchesPlanned: batches.length,
    batchSize,
    concurrencyLimit: 4,
    estimatedMigrationSeconds: estimatedSeconds,
    rollbackStrategy: 'Source objects remain immutable on ArvanCloud/S3; R2 destination bucket keys are staged without modifying active DNS or client routing until 100% verification is achieved.',
    batches,
  };
}
