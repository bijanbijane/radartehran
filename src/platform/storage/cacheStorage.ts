/** @file src/platform/storage/cacheStorage.ts — Isolated Cache Store (Scoped by userId + workspaceId + permissionVersion) */
import { getActiveStorageBackend, readVersionedStorage, writeVersionedStorage } from './storageAdapter';

const CACHE_SCHEMA_VERSION = 1;

export interface CacheScopeContext {
  readonly userId: string;
  readonly workspaceId: string;
  readonly permissionVersion: string;
}

export function buildScopedCacheKey(scope: CacheScopeContext, resourceKey: string): string {
  const safeUser = (scope.userId || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeWs = (scope.workspaceId || 'personal').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safePerm = (scope.permissionVersion || 'v1').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return `rt:cache:${safeUser}:${safeWs}:${safePerm}:${resourceKey}`;
}

export function writeScopedCacheEntry<T>(
  scope: CacheScopeContext,
  resourceKey: string,
  value: T,
  ttlMs = 300_000,
): void {
  const scopeTag = `${scope.userId}|${scope.workspaceId}|${scope.permissionVersion}`;
  writeVersionedStorage({
    key: buildScopedCacheKey(scope, resourceKey),
    namespace: 'cache',
    schemaVersion: CACHE_SCHEMA_VERSION,
    value,
    ttlMs,
    scopeKey: scopeTag,
  });
}

export function readScopedCacheEntry<T>(
  scope: CacheScopeContext,
  resourceKey: string,
  fallback: T,
): T {
  const scopeTag = `${scope.userId}|${scope.workspaceId}|${scope.permissionVersion}`;
  return readVersionedStorage<T>({
    key: buildScopedCacheKey(scope, resourceKey),
    expectedSchemaVersion: CACHE_SCHEMA_VERSION,
    expectedScopeKey: scopeTag,
    fallback,
  });
}

export function purgeScopedCacheForWorkspace(userId: string, workspaceId?: string): number {
  const backend = getActiveStorageBackend();
  const safeUser = (userId || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
  const prefix = workspaceId
    ? `rt:cache:${safeUser}:${workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_')}:`
    : `rt:cache:${safeUser}:`;
  const matching: string[] = [];
  for (let i = 0; i < backend.length; i++) {
    const k = backend.key(i);
    if (k && k.startsWith(prefix)) matching.push(k);
  }
  matching.forEach((k) => backend.removeItem(k));
  return matching.length;
}
