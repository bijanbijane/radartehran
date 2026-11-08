/**
 * @file worker/cache/kvCacheManager.ts
 * @description Cloudflare Workers KV Cache Manager with stampede protection,
 * negative caching, and fail-safe fallback to authoritative sources.
 *
 * Enforces:
 * - Stale-while-revalidate / stampede suppression (`inFlightRevalidations`).
 * - Rejection of unauthorized private or transactional caching in KV.
 * - Negative caching with strict TTL bounds.
 * - Fail-open behavior: KV failure never breaks the underlying API read.
 */

import { buildCacheKey, CACHE_POLICIES, type CacheKeyBuildParams } from './cachePolicies';
import type {
  CacheDataClassification,
  CachedEnvelope,
  KVNamespaceBinding,
} from './types';

export class CloudflareKVCacheManager {
  private readonly kv: KVNamespaceBinding;
  private readonly inFlightRevalidations = new Map<string, Promise<any>>();

  constructor(kvBinding: KVNamespaceBinding) {
    if (!kvBinding || typeof kvBinding.get !== 'function') {
      throw new Error('CloudflareKVCacheManager requires a valid KVNamespaceBinding.');
    }
    this.kv = kvBinding;
  }

  /**
   * Fetches cached item or executes fallback computation with stampede protection.
   */
  public async getOrCompute<T>(
    keyParams: CacheKeyBuildParams,
    classification: CacheDataClassification,
    computeFallback: () => Promise<T | null>
  ): Promise<{ value: T | null; cached: boolean; stale: boolean }> {
    const policy = CACHE_POLICIES[classification];

    // Safety check: ensure policy permits KV
    if (!policy.allowedInKv) {
      // Direct compute without caching in KV
      const fresh = await computeFallback();
      return { value: fresh, cached: false, stale: false };
    }

    const cacheKey = buildCacheKey(keyParams);

    // 1. Try reading from KV
    try {
      const raw = await this.kv.get(cacheKey, { type: 'json' });
      if (raw && typeof raw === 'object' && 'value' in raw && 'expiresAtIso' in raw) {
        const envelope = raw as CachedEnvelope<T>;
        const expiresAt = Date.parse(envelope.expiresAtIso);
        const now = Date.now();

        if (Number.isFinite(expiresAt) && now < expiresAt) {
          // Fresh hit
          return { value: envelope.value, cached: true, stale: false };
        }

        // Stale hit within maxStaleness window: return stale and revalidate in background
        const maxStalenessMs = policy.maxStalenessSeconds * 1000;
        if (Number.isFinite(expiresAt) && now < expiresAt + maxStalenessMs) {
          this.triggerBackgroundRevalidate(cacheKey, keyParams, classification, computeFallback);
          return { value: envelope.value, cached: true, stale: true };
        }
      }
    } catch {
      // KV failure falls back to compute safely
    }

    // 2. Stampede suppression: coalesce identical concurrent revalidations
    let inFlight = this.inFlightRevalidations.get(cacheKey);
    if (!inFlight) {
      inFlight = (async () => {
        try {
          const fresh = await computeFallback();
          if (fresh !== null) {
            await this.put(cacheKey, fresh, classification);
          } else if (policy.allowsNegativeCaching) {
            // Negative caching: cache null representation with short TTL
            await this.putNegative(cacheKey, classification);
          }
          return fresh;
        } finally {
          this.inFlightRevalidations.delete(cacheKey);
        }
      })();
      this.inFlightRevalidations.set(cacheKey, inFlight);
    }

    const freshValue = await inFlight;
    return { value: freshValue, cached: false, stale: false };
  }

  public async put<T>(
    cacheKey: string,
    value: T,
    classification: CacheDataClassification
  ): Promise<void> {
    const policy = CACHE_POLICIES[classification];
    if (!policy.allowedInKv) return;

    const now = Date.now();
    const ttlSeconds = policy.defaultTtlSeconds;
    const envelope: CachedEnvelope<T> = {
      schemaVersion: 1,
      key: cacheKey,
      classification,
      cachedAtIso: new Date(now).toISOString(),
      expiresAtIso: new Date(now + ttlSeconds * 1000).toISOString(),
      value,
    };

    try {
      await this.kv.put(cacheKey, JSON.stringify(envelope), {
        expirationTtl: Math.max(60, ttlSeconds + policy.maxStalenessSeconds),
      });
    } catch {
      // Non-fatal cache write failure
    }
  }

  public async putNegative(
    cacheKey: string,
    classification: CacheDataClassification
  ): Promise<void> {
    const policy = CACHE_POLICIES[classification];
    if (!policy.allowsNegativeCaching || policy.negativeCacheTtlSeconds <= 0) return;

    const now = Date.now();
    const ttl = policy.negativeCacheTtlSeconds;
    const envelope: CachedEnvelope<null> = {
      schemaVersion: 1,
      key: cacheKey,
      classification,
      cachedAtIso: new Date(now).toISOString(),
      expiresAtIso: new Date(now + ttl * 1000).toISOString(),
      value: null,
    };

    try {
      await this.kv.put(cacheKey, JSON.stringify(envelope), { expirationTtl: Math.max(60, ttl) });
    } catch {
      // Non-fatal
    }
  }

  public async invalidate(cacheKey: string): Promise<void> {
    try {
      await this.kv.delete(cacheKey);
    } catch {
      // Non-fatal
    }
  }

  private triggerBackgroundRevalidate<T>(
    cacheKey: string,
    _keyParams: CacheKeyBuildParams,
    classification: CacheDataClassification,
    computeFallback: () => Promise<T | null>
  ): void {
    if (this.inFlightRevalidations.has(cacheKey)) return;

    const task = (async () => {
      try {
        const fresh = await computeFallback();
        if (fresh !== null) {
          await this.put(cacheKey, fresh, classification);
        }
      } catch {
        // Stale entry preserved if recomputation fails
      } finally {
        this.inFlightRevalidations.delete(cacheKey);
      }
    })();

    this.inFlightRevalidations.set(cacheKey, task);
  }
}
