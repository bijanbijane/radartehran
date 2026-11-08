import type { D1Database, KVNamespace, RateLimitBinding, WorkerEnvironmentName } from '../types';

export const FORBIDDEN_KV_AUTHORITATIVE_NAMESPACES = new Set([
  'auth_tokens',
  'user_roles',
  'bargain_ownership',
  'legal_holds',
  'payment_tariffs',
  'strong_rate_limit',
  'account_deletion_journal',
]);

export type AllowedKvCacheNamespace =
  | 'market_pulse'
  | 'neighborhood_summary'
  | 'seo_sitemap'
  | 'map_tile_meta'
  | 'feature_flags_snapshot';

export interface KvCacheEnvelope<T> {
  schemaVersion: '1.0';
  env: WorkerEnvironmentName;
  namespace: AllowedKvCacheNamespace;
  storedAtMs: number;
  freshUntilMs: number;
  staleUntilMs: number;
  negativeCache: boolean;
  payload: T | null;
}

const singleFlightPromises = new Map<string, Promise<unknown>>();

export function buildVersionedKvKey(
  env: WorkerEnvironmentName,
  namespace: string,
  rawKey: string,
): string {
  const cleanNamespace = String(namespace || '').trim().toLowerCase();
  if (FORBIDDEN_KV_AUTHORITATIVE_NAMESPACES.has(cleanNamespace)) {
    throw new Error(`KV_AUTHORITATIVE_STATE_FORBIDDEN:${cleanNamespace}`);
  }
  const safeKey = String(rawKey || '')
    .trim()
    .replace(/[^a-zA-Z0-9:._-]/g, '_')
    .slice(0, 128);
  return `v1:${env}:${cleanNamespace}:${safeKey}`;
}

export async function getOrPopulateKvSwrCache<T>(params: {
  kv: KVNamespace | undefined;
  env: WorkerEnvironmentName;
  namespace: AllowedKvCacheNamespace;
  key: string;
  freshTtlSeconds: number;
  staleTtlSeconds: number;
  negativeTtlSeconds?: number;
  loader: () => Promise<T | null>;
  onBackgroundRevalidate?: (promise: Promise<void>) => void;
  nowMs?: number;
}): Promise<{
  value: T | null;
  cacheStatus: 'HIT_FRESH' | 'HIT_STALE_SWR' | 'HIT_NEGATIVE' | 'MISS' | 'BYPASS';
}> {
  const fullKey = buildVersionedKvKey(params.env, params.namespace, params.key);
  if (!params.kv) {
    const loaded = await params.loader();
    return { value: loaded, cacheStatus: 'BYPASS' };
  }

  const now = params.nowMs ?? Date.now();
  try {
    const raw = await params.kv.get(fullKey);
    if (raw) {
      const parsed = JSON.parse(raw) as KvCacheEnvelope<T>;
      if (parsed && parsed.schemaVersion === '1.0') {
        if (parsed.negativeCache && now <= parsed.freshUntilMs) {
          return { value: null, cacheStatus: 'HIT_NEGATIVE' };
        }
        if (now <= parsed.freshUntilMs) {
          return { value: parsed.payload, cacheStatus: 'HIT_FRESH' };
        }
        if (now <= parsed.staleUntilMs) {
          const revalidatePromise = (async () => {
            try {
              const refreshed = await params.loader();
              await writeKvEnvelope(params.kv!, fullKey, params, refreshed, Date.now());
            } catch {
              /* preserve stale value on background failure */
            }
          })();
          if (params.onBackgroundRevalidate) {
            params.onBackgroundRevalidate(revalidatePromise);
          }
          return { value: parsed.payload, cacheStatus: 'HIT_STALE_SWR' };
        }
      }
    }
  } catch {
    /* treat corrupt KV entry as cache miss */
  }

  let inFlight = singleFlightPromises.get(fullKey) as Promise<T | null> | undefined;
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const loaded = await params.loader();
        await writeKvEnvelope(params.kv!, fullKey, params, loaded, now);
        return loaded;
      } finally {
        singleFlightPromises.delete(fullKey);
      }
    })();
    singleFlightPromises.set(fullKey, inFlight);
  }
  const value = await inFlight;
  return { value, cacheStatus: 'MISS' };
}

async function writeKvEnvelope<T>(
  kv: KVNamespace,
  fullKey: string,
  params: {
    env: WorkerEnvironmentName;
    namespace: AllowedKvCacheNamespace;
    freshTtlSeconds: number;
    staleTtlSeconds: number;
    negativeTtlSeconds?: number;
  },
  payload: T | null,
  nowMs: number,
): Promise<void> {
  const isNull = payload === null;
  const freshSec = isNull ? (params.negativeTtlSeconds ?? 30) : Math.max(5, params.freshTtlSeconds);
  const staleSec = isNull ? freshSec : Math.max(freshSec, params.staleTtlSeconds);
  const envelope: KvCacheEnvelope<T> = {
    schemaVersion: '1.0',
    env: params.env,
    namespace: params.namespace,
    storedAtMs: nowMs,
    freshUntilMs: nowMs + freshSec * 1000,
    staleUntilMs: nowMs + staleSec * 1000,
    negativeCache: isNull,
    payload,
  };
  await kv.put(fullKey, JSON.stringify(envelope), { expirationTtl: Math.max(60, staleSec) });
}

export type RateLimitConsistencyTier = 'edge_approximate' | 'strong_durable';

export async function evaluateTieredWorkerRateLimit(params: {
  tier: RateLimitConsistencyTier;
  action: 'public_read' | 'map_tile' | 'buyer_lead' | 'media_upload' | 'account_auth' | 'admin_mutation';
  subjectKey: string;
  maxRequests: number;
  windowSeconds: number;
  edgeLimiter?: RateLimitBinding;
  db?: D1Database;
  nowMs?: number;
}): Promise<{
  allowed: boolean;
  tierUsed: RateLimitConsistencyTier;
  remaining: number;
  retryAfterSeconds: number;
}> {
  const cleanKey = `${params.action}:${String(params.subjectKey || 'anon').slice(0, 80)}`;
  if (params.tier === 'edge_approximate' && params.edgeLimiter) {
    const res = await params.edgeLimiter.limit({ key: cleanKey });
    return {
      allowed: res.success,
      tierUsed: 'edge_approximate',
      remaining: res.success ? 1 : 0,
      retryAfterSeconds: res.success ? 0 : params.windowSeconds,
    };
  }

  const now = params.nowMs ?? Date.now();
  const windowMs = Math.max(1000, params.windowSeconds * 1000);
  if (params.db) {
    const existing = await params.db
      .prepare('SELECT counter, window_reset_ms FROM strong_rate_limits WHERE bucket_key = ?1')
      .bind(cleanKey)
      .first<{ counter: number; window_reset_ms: number }>();

    if (!existing || now >= Number(existing.window_reset_ms)) {
      const resetAt = now + windowMs;
      await params.db
        .prepare('INSERT OR REPLACE INTO strong_rate_limits (bucket_key, counter, window_reset_ms) VALUES (?1, ?2, ?3)')
        .bind(cleanKey, 1, resetAt)
        .run();
      return {
        allowed: true,
        tierUsed: 'strong_durable',
        remaining: Math.max(0, params.maxRequests - 1),
        retryAfterSeconds: 0,
      };
    }

    const nextCount = Number(existing.counter) + 1;
    if (nextCount > params.maxRequests) {
      return {
        allowed: false,
        tierUsed: 'strong_durable',
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((Number(existing.window_reset_ms) - now) / 1000)),
      };
    }

    await params.db
      .prepare('INSERT OR REPLACE INTO strong_rate_limits (bucket_key, counter, window_reset_ms) VALUES (?1, ?2, ?3)')
      .bind(cleanKey, nextCount, Number(existing.window_reset_ms))
      .run();
    return {
      allowed: true,
      tierUsed: 'strong_durable',
      remaining: Math.max(0, params.maxRequests - nextCount),
      retryAfterSeconds: 0,
    };
  }

  return {
    allowed: true,
    tierUsed: params.tier,
    remaining: params.maxRequests,
    retryAfterSeconds: 0,
  };
}

export function createLocalKvNamespaceSimulator(): KVNamespace {
  const map = new Map<string, { value: string; expiresAtMs: number | null }>();
  return {
    async get(key: string): Promise<string | null> {
      const entry = map.get(key);
      if (!entry) return null;
      if (entry.expiresAtMs !== null && Date.now() > entry.expiresAtMs) {
        map.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
      const expiresAtMs = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : null;
      map.set(key, { value, expiresAtMs });
    },
    async delete(key: string): Promise<void> {
      map.delete(key);
    },
  };
}
