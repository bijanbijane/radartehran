/**
 * @file src/platform/entity-engagement/sync/ConflictResolver.ts
 * @description Resolves multi-tab or server-vs-optimistic state conflicts using authoritative timestamps (Stage 8).
 */

export interface TimestampedEngagementRecord {
  id: string;
  updatedAt?: string;
  createdAt?: string;
}

export function resolveEngagementRecordConflict<T extends TimestampedEngagementRecord>(
  localRecord: T,
  remoteRecord: T
): { winner: T; source: 'remote' | 'local' } {
  const localTime = Date.parse(localRecord.updatedAt || localRecord.createdAt || '');
  const remoteTime = Date.parse(remoteRecord.updatedAt || remoteRecord.createdAt || '');

  if (Number.isNaN(localTime)) {
    return { winner: remoteRecord, source: 'remote' };
  }
  if (Number.isNaN(remoteTime)) {
    return { winner: localRecord, source: 'local' };
  }

  if (remoteTime >= localTime) {
    return { winner: remoteRecord, source: 'remote' };
  }
  return { winner: localRecord, source: 'local' };
}
