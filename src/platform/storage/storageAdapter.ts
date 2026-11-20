/** @file src/platform/storage/storageAdapter.ts — Safe Versioned Browser Storage Adapter with Quota Recovery */
export type StorageNamespaceKind = 'session' | 'preferences' | 'cache' | 'temporary' | 'prefs' | 'temp';

export interface VersionedStorageEnvelope<T> {
  readonly schemaVersion: number;
  readonly namespace: StorageNamespaceKind;
  readonly updatedAtMs: number;
  readonly expiresAtMs?: number;
  readonly scopeKey?: string;
  readonly value: T;
}

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

const memoryFallbackMap = new Map<string, string>();

const memoryBackend: StorageBackend = {
  getItem: (k) => memoryFallbackMap.get(k) ?? null,
  setItem: (k, v) => {
    memoryFallbackMap.set(k, v);
  },
  removeItem: (k) => {
    memoryFallbackMap.delete(k);
  },
  key: (idx) => Array.from(memoryFallbackMap.keys())[idx] ?? null,
  get length() {
    return memoryFallbackMap.size;
  },
};

let customBackendOverride: StorageBackend | null = null;

export function setStorageBackendForTests(backend: StorageBackend | null): void {
  customBackendOverride = backend;
}

export function clearMemoryStorageForTests(): void {
  memoryFallbackMap.clear();
}

export function getActiveStorageBackend(): StorageBackend {
  if (customBackendOverride) return customBackendOverride;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return memoryBackend;
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /QuotaExceededError|NS_ERROR_DOM_QUOTA_REACHED|quota/i.test(msg);
}

export function evictTemporaryAndCacheEntries(backend: StorageBackend = getActiveStorageBackend()): number {
  const keysToRemove: string[] = [];
  for (let i = 0; i < backend.length; i++) {
    const k = backend.key(i);
    if (!k) continue;
    if (k.startsWith('rt:cache:') || k.startsWith('rt:temp:') || k.startsWith('rt:v1:cache:') || k.startsWith('rt:v1:temp:')) {
      keysToRemove.push(k);
    }
  }
  for (const k of keysToRemove) {
    try {
      backend.removeItem(k);
    } catch {
      // ignore
    }
  }
  return keysToRemove.length;
}

export function writeVersionedStorage<T>(params: {
  readonly key: string;
  readonly namespace: StorageNamespaceKind;
  readonly schemaVersion: number;
  readonly value: T;
  readonly ttlMs?: number;
  readonly scopeKey?: string;
}): { readonly ok: boolean; readonly recoveredFromQuota: boolean } {
  const backend = getActiveStorageBackend();
  const now = Date.now();
  const envelope: VersionedStorageEnvelope<T> = {
    schemaVersion: params.schemaVersion,
    namespace: params.namespace,
    updatedAtMs: now,
    ...(params.ttlMs !== undefined ? { expiresAtMs: now + params.ttlMs } : {}),
    ...(params.scopeKey ? { scopeKey: params.scopeKey } : {}),
    value: params.value,
  };
  const serialized = JSON.stringify(envelope);

  try {
    backend.setItem(params.key, serialized);
    return { ok: true, recoveredFromQuota: false };
  } catch (err) {
    if (isQuotaExceededError(err)) {
      evictTemporaryAndCacheEntries(backend);
      try {
        backend.setItem(params.key, serialized);
        return { ok: true, recoveredFromQuota: true };
      } catch {
        memoryBackend.setItem(params.key, serialized);
        return { ok: true, recoveredFromQuota: true };
      }
    }
    return { ok: false, recoveredFromQuota: false };
  }
}

export function readVersionedStorage<T>(params: {
  readonly key: string;
  readonly expectedSchemaVersion: number;
  readonly fallback: T;
  readonly expectedScopeKey?: string;
  readonly migrate?: (oldVersion: number, oldValue: unknown) => T | null;
}): T {
  const backend = getActiveStorageBackend();
  try {
    const raw = backend.getItem(params.key) ?? memoryBackend.getItem(params.key);
    if (!raw) return params.fallback;
    const parsed = JSON.parse(raw) as Partial<VersionedStorageEnvelope<T>>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.schemaVersion !== 'number') {
      backend.removeItem(params.key);
      return params.fallback;
    }
    if (typeof parsed.expiresAtMs === 'number' && Date.now() > parsed.expiresAtMs) {
      backend.removeItem(params.key);
      return params.fallback;
    }
    if (params.expectedScopeKey && parsed.scopeKey && parsed.scopeKey !== params.expectedScopeKey) {
      return params.fallback;
    }
    if (parsed.schemaVersion !== params.expectedSchemaVersion) {
      if (params.migrate) {
        const migrated = params.migrate(parsed.schemaVersion, parsed.value);
        if (migrated !== null) {
          writeVersionedStorage({
            key: params.key,
            namespace: parsed.namespace || 'preferences',
            schemaVersion: params.expectedSchemaVersion,
            value: migrated,
            scopeKey: params.expectedScopeKey,
          });
          return migrated;
        }
      }
      backend.removeItem(params.key);
      return params.fallback;
    }
    return (parsed.value as T) ?? params.fallback;
  } catch {
    try {
      backend.removeItem(params.key);
    } catch {
      // ignore
    }
    return params.fallback;
  }
}

export class SafeStorageAdapter {
  private namespace: StorageNamespaceKind;

  constructor(namespace: StorageNamespaceKind) {
    this.namespace = namespace;
  }

  private buildKey(key: string): string {
    return `rt:v1:${this.namespace}:${key}`;
  }

  set<T>(key: string, value: T, ttlMs?: number): boolean {
    return writeVersionedStorage({
      key: this.buildKey(key),
      namespace: this.namespace,
      schemaVersion: 1,
      value,
      ttlMs,
    }).ok;
  }

  get<T>(key: string, fallback: T): T {
    return readVersionedStorage({
      key: this.buildKey(key),
      expectedSchemaVersion: 1,
      fallback,
    });
  }

  remove(key: string): void {
    const fullKey = this.buildKey(key);
    memoryFallbackMap.delete(fullKey);
    try {
      getActiveStorageBackend().removeItem(fullKey);
    } catch {
      // ignore storage errors
    }
  }

  clearAll(): void {
    const backend = getActiveStorageBackend();
    const prefix = `rt:v1:${this.namespace}:`;
    const toRemove: string[] = [];
    try {
      for (let i = 0; i < backend.length; i++) {
        const k = backend.key(i);
        if (k && k.startsWith(prefix)) toRemove.push(k);
      }
    } catch {
      // ignore storage enumeration errors
    }
    for (const k of toRemove) {
      try {
        backend.removeItem(k);
      } catch {
        // isolate per-key removal errors
      }
    }
    for (const memKey of Array.from(memoryFallbackMap.keys())) {
      if (memKey.startsWith(prefix)) {
        memoryFallbackMap.delete(memKey);
      }
    }
  }

  evictExpired(): number {
    return evictTemporaryAndCacheEntries();
  }
}

const sessionAdapter = new SafeStorageAdapter('session');
const prefsAdapter = new SafeStorageAdapter('prefs');
const cacheAdapter = new SafeStorageAdapter('cache');
const tempAdapter = new SafeStorageAdapter('temp');

export function getSessionStorage(): SafeStorageAdapter {
  return sessionAdapter;
}
export function getPreferencesStorage(): SafeStorageAdapter {
  return prefsAdapter;
}
export function getCacheStorage(): SafeStorageAdapter {
  return cacheAdapter;
}
export function getTemporaryStorage(): SafeStorageAdapter {
  return tempAdapter;
}
