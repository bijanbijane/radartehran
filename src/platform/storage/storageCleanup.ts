/** @file src/platform/storage/storageCleanup.ts — Cross-Tab Logout & Private Cache Cleanup */
import { getActiveStorageBackend, evictTemporaryAndCacheEntries } from './storageAdapter';
import { clearSessionMetadata } from './sessionStorage';
import { purgeScopedCacheForWorkspace } from './cacheStorage';

export const AUTH_STORAGE_SYNC_EVENT_KEY = 'rt:auth:sync_signal';

export interface CrossTabStorageSignal {
  readonly type: 'LOGOUT' | 'WORKSPACE_SWITCH' | 'PERMISSION_VERSION_BUMP';
  readonly userId: string;
  readonly workspaceId?: string;
  readonly permissionVersion?: string;
  readonly timestampMs: number;
}

export function cleanupExpiredStorage(): number {
  return evictTemporaryAndCacheEntries();
}

export function purgeAllPrivateAccountStorage(userId: string): {
  readonly removedCount: number;
  readonly preservedPublicCount: number;
} {
  const backend = getActiveStorageBackend();
  clearSessionMetadata(userId);
  const removedCache = purgeScopedCacheForWorkspace(userId);
  const keysToDelete: string[] = [];
  let preservedPublicCount = 0;

  for (let i = 0; i < backend.length; i++) {
    const k = backend.key(i);
    if (!k) continue;
    if (
      k.startsWith(`rt:temp:draft:${userId}:`) ||
      k.startsWith(`rt:session:`) ||
      k.endsWith(`::${userId}`)
    ) {
      keysToDelete.push(k);
    } else if (k.startsWith('rt:prefs:') || k.startsWith('tehran_radar_')) {
      preservedPublicCount += 1;
    }
  }

  for (const k of keysToDelete) {
    backend.removeItem(k);
  }

  return {
    removedCount: removedCache + keysToDelete.length,
    preservedPublicCount,
  };
}

export function broadcastCrossTabStorageSignal(signal: CrossTabStorageSignal): void {
  const backend = getActiveStorageBackend();
  try {
    backend.setItem(AUTH_STORAGE_SYNC_EVENT_KEY, JSON.stringify(signal));
  } catch {
    // ignore
  }
}
