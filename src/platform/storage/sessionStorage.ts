/** @file src/platform/storage/sessionStorage.ts — Non-Token Session Metadata Store */
import { getActiveStorageBackend, readVersionedStorage, writeVersionedStorage } from './storageAdapter';

const SESSION_SCHEMA_VERSION = 1;

export interface StoredSessionMetadata {
  readonly userId: string;
  readonly activeWorkspaceId: string;
  readonly activeWorkspaceType: 'personal' | 'agency' | 'service';
  readonly activeRole: string;
  readonly permissionVersion: string;
  readonly lastVerifiedAtMs: number;
}

export function saveSessionMetadata(meta: StoredSessionMetadata): void {
  writeVersionedStorage({
    key: `rt:session:meta:${meta.userId}`,
    namespace: 'session',
    schemaVersion: SESSION_SCHEMA_VERSION,
    value: meta,
    scopeKey: meta.userId,
  });
}

export function loadSessionMetadata(userId: string): StoredSessionMetadata | null {
  if (!userId) return null;
  return readVersionedStorage<StoredSessionMetadata | null>({
    key: `rt:session:meta:${userId}`,
    expectedSchemaVersion: SESSION_SCHEMA_VERSION,
    expectedScopeKey: userId,
    fallback: null,
  });
}

export function clearSessionMetadata(userId?: string): void {
  const backend = getActiveStorageBackend();
  if (userId) {
    backend.removeItem(`rt:session:meta:${userId}`);
    return;
  }
  const toDelete: string[] = [];
  for (let i = 0; i < backend.length; i++) {
    const k = backend.key(i);
    if (k && k.startsWith('rt:session:')) toDelete.push(k);
  }
  toDelete.forEach((k) => backend.removeItem(k));
}
