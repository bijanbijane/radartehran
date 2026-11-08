/**
 * @file worker/cache/types.ts
 * @description Cloudflare Workers KV, Cache API, and Distributed Coordination Types.
 *
 * Enforces:
 * - Deterministic, collision-resistant cache key conventions.
 * - Explicit cache classifications with separate TTL and invalidation policies.
 * - Negative caching controls and cache stampede guards.
 * - Official Cloudflare Workers KV binding contracts.
 */

export type CacheDataClassification =
  | 'PUBLIC_STATIC_REFERENCE'
  | 'PUBLIC_SLOW_CHANGING'
  | 'PUBLIC_FREQUENTLY_CHANGING'
  | 'USER_PRIVATE_SENSITIVE'
  | 'SECURITY_PRIVILEGED_AUTHORIZATION'
  | 'TRANSACTIONAL_SOURCE_OF_TRUTH'
  | 'TEMPORARY_COORDINATION_LEASE'
  | 'ANALYTICAL_AGGREGATION';

export interface CachePolicy {
  readonly classification: CacheDataClassification;
  readonly allowedInKv: boolean;
  readonly allowedInEdgeCache: boolean;
  readonly allowedInBrowser: boolean;
  readonly defaultTtlSeconds: number;
  readonly maxStalenessSeconds: number;
  readonly allowsNegativeCaching: boolean;
  readonly negativeCacheTtlSeconds: number;
  readonly requiresAuthScope: boolean;
  readonly description: string;
}

export interface CachedEnvelope<T = unknown> {
  readonly schemaVersion: number;
  readonly key: string;
  readonly classification: CacheDataClassification;
  readonly cachedAtIso: string;
  readonly expiresAtIso: string;
  readonly tagVersion?: string;
  readonly value: T;
}

/**
 * Official Cloudflare Workers KV namespace binding.
 */
export interface KVNamespaceBinding {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream'; cacheTtl?: number }): Promise<any>;
  getWithMetadata<T = unknown, M = unknown>(
    key: string,
    options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream'; cacheTtl?: number }
  ): Promise<{ value: T | null; metadata: M | null }>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: { expiration?: number; expirationTtl?: number; metadata?: any }
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; expiration?: number; metadata?: unknown }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly currentCount: number;
  readonly maxAllowed: number;
  readonly resetAtMs: number;
  readonly retryAfterSeconds: number;
  readonly bucketType: string;
}

export interface DurableLeaseRecord {
  readonly leaseKey: string;
  readonly holderId: string;
  readonly acquiredAtIso: string;
  readonly expiresAtIso: string;
  readonly renewCount: number;
}
