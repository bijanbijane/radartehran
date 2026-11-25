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
  action: 'public_read' | 'map_tile' | 'buyer_lead' | 'media_upload' | 'account_auth' | 'admin_mutation' | 'research_ingest';
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
  const deny = (tierUsed: RateLimitConsistencyTier, retryAfterSeconds: number) => ({
    allowed: false,
    tierUsed,
    remaining: 0,
    retryAfterSeconds: Math.max(1, Math.trunc(retryAfterSeconds) || 1),
  });
  const maxRequests = Number.isSafeInteger(params.maxRequests) && params.maxRequests > 0
    ? Math.min(params.maxRequests, 1_000_000)
    : 0;
  const windowSeconds = Number.isSafeInteger(params.windowSeconds) && params.windowSeconds > 0
    ? Math.min(params.windowSeconds, 604_800)
    : 0;
  if (!maxRequests || !windowSeconds) return deny(params.tier, 60);

  const subject = String(params.subjectKey || 'anon').trim().slice(0, 80) || 'anon';
  const cleanKey = `${params.action}:${subject}`;
  if (params.tier === 'edge_approximate' && params.edgeLimiter) {
    const res = await params.edgeLimiter.limit({ key: cleanKey });
    return {
      allowed: res.success,
      tierUsed: 'edge_approximate',
      remaining: res.success ? 1 : 0,
      retryAfterSeconds: res.success ? 0 : windowSeconds,
    };
  }

  // A durable tier without a durable store must never silently degrade to allow-all.
  if (!params.db) return deny(params.tier, windowSeconds);

  const suppliedNow = params.nowMs ?? Date.now();
  const now = Number.isFinite(suppliedNow) ? Number(suppliedNow) : Date.now();
  const windowMs = windowSeconds * 1000;
  const resetAt = now + windowMs;

  // One atomic UPSERT/RETURNING statement prevents concurrent read-modify-write
  // races from collapsing many requests into a single counter increment.
  const row = await params.db
    .prepare(
      `INSERT INTO strong_rate_limits (bucket_key, counter, window_reset_ms)
       VALUES (?1, 1, ?2)
       ON CONFLICT(bucket_key) DO UPDATE SET
         counter = CASE
           WHEN strong_rate_limits.window_reset_ms <= ?3 THEN 1
           ELSE MIN(strong_rate_limits.counter + 1, ?4)
         END,
         window_reset_ms = CASE
           WHEN strong_rate_limits.window_reset_ms <= ?3 THEN ?2
           ELSE strong_rate_limits.window_reset_ms
         END
       RETURNING counter, window_reset_ms`,
    )
    .bind(cleanKey, resetAt, now, maxRequests + 1)
    .first<{ counter: number; window_reset_ms: number }>();

  if (
    !row ||
    !Number.isSafeInteger(Number(row.counter)) ||
    !Number.isFinite(Number(row.window_reset_ms)) ||
    Number(row.counter) < 1 ||
    Number(row.window_reset_ms) <= now
  ) {
    return deny('strong_durable', windowSeconds);
  }

  const counter = Number(row.counter);
  const windowResetMs = Number(row.window_reset_ms);
  const allowed = counter <= maxRequests;
  return {
    allowed,
    tierUsed: 'strong_durable',
    remaining: allowed ? Math.max(0, maxRequests - counter) : 0,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((windowResetMs - now) / 1000)),
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
