/** @file server/modules/community/communityRateLimiter.ts — Shared Transactional Firestore Community Rate Limiting (RT-SOCIAL-IMPL-002) */
import crypto from 'node:crypto';
import {
  CommunityDatabaseUnavailableError,
  SOCIAL_COLLECTIONS,
  createDefaultCommunityDatabaseStore,
  type CommunityDatabaseStore,
} from './communityFirestoreAdapter';

export type CommunityActionBucket =
  | 'read'
  | 'create_post'
  | 'edit_post'
  | 'create_comment'
  | 'reaction'
  | 'follow'
  | 'report'
  | 'appeal'
  | 'admin';

export interface CommunityRateLimitPolicy {
  windowMs: number;
  limits: Record<CommunityActionBucket, number>;
}

export interface SocialRateLimitRecord extends Record<string, unknown> {
  id: string;
  subjectHash: string;
  bucket: CommunityActionBucket;
  count: number;
  windowMs: number;
  resetAtMs: number;
  updatedAtIso: string;
  schemaVersion: 1;
}

export interface CommunityRateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  limit: number;
}

function readIntEnv(env: Record<string, string | undefined>, key: string, fallback: number, min = 1, max = 10_000): number {
  const parsed = Number(env[key]);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.min(max, Math.floor(parsed));
}

export function resolveCommunityRateLimitPolicy(env: Record<string, string | undefined> = process.env): CommunityRateLimitPolicy {
  return {
    windowMs: readIntEnv(env, 'COMMUNITY_RL_WINDOW_MS', 60_000, 1_000, 3_600_000),
    limits: {
      read: readIntEnv(env, 'COMMUNITY_RL_READ_MAX', 120),
      create_post: readIntEnv(env, 'COMMUNITY_RL_POST_MAX', 10),
      edit_post: readIntEnv(env, 'COMMUNITY_RL_EDIT_MAX', 20),
      create_comment: readIntEnv(env, 'COMMUNITY_RL_COMMENT_MAX', 25),
      reaction: readIntEnv(env, 'COMMUNITY_RL_REACTION_MAX', 60),
      follow: readIntEnv(env, 'COMMUNITY_RL_FOLLOW_MAX', 40),
      report: readIntEnv(env, 'COMMUNITY_RL_REPORT_MAX', 10),
      appeal: readIntEnv(env, 'COMMUNITY_RL_APPEAL_MAX', 5),
      admin: readIntEnv(env, 'COMMUNITY_RL_ADMIN_MAX', 60),
    },
  };
}

export const COMMUNITY_RATE_LIMITS: Record<CommunityActionBucket, { max: number; windowMs: number }> = {
  read: { max: 120, windowMs: 60_000 },
  create_post: { max: 10, windowMs: 60_000 },
  edit_post: { max: 20, windowMs: 60_000 },
  create_comment: { max: 25, windowMs: 60_000 },
  reaction: { max: 60, windowMs: 60_000 },
  follow: { max: 40, windowMs: 60_000 },
  report: { max: 10, windowMs: 60_000 },
  appeal: { max: 5, windowMs: 60_000 },
  admin: { max: 60, windowMs: 60_000 },
};

export function normalizeRateLimitSubject(subjectKey: string): string {
  return String(subjectKey || '').trim().slice(0, 128) || 'anonymous';
}

export function hashRateLimitDocId(bucket: CommunityActionBucket, subjectKey: string): string {
  const cleanSubject = normalizeRateLimitSubject(subjectKey);
  return crypto.createHash('sha256').update(`${bucket}:${cleanSubject}`).digest('hex');
}

export function hashRateLimitSubject(subjectKey: string): string {
  const cleanSubject = normalizeRateLimitSubject(subjectKey);
  return crypto.createHash('sha256').update(cleanSubject).digest('hex');
}

export class CommunityRateLimiter {
  private policy: CommunityRateLimitPolicy;
  private store?: CommunityDatabaseStore;

  constructor(
    private readonly env: Record<string, string | undefined> = process.env,
    store?: CommunityDatabaseStore,
  ) {
    this.policy = resolveCommunityRateLimitPolicy(env);
    this.store = store;
  }

  public bindStore(store: CommunityDatabaseStore): void {
    this.store = store;
  }

  public getStore(): CommunityDatabaseStore {
    if (!this.store) {
      this.store = createDefaultCommunityDatabaseStore(this.env);
    }
    return this.store;
  }

  public reconfigure(env: Record<string, string | undefined>): void {
    this.policy = resolveCommunityRateLimitPolicy(env);
  }

  public getPolicy(): CommunityRateLimitPolicy {
    return { windowMs: this.policy.windowMs, limits: { ...this.policy.limits } };
  }

  public resetForTests(): void {
    this.policy = resolveCommunityRateLimitPolicy(this.env);
  }

  public async checkAndConsume(
    bucket: CommunityActionBucket,
    subjectKey: string,
    nowMs = Date.now(),
    overrideLimit?: number,
    explicitStore?: CommunityDatabaseStore,
  ): Promise<CommunityRateLimitDecision> {
    const activeStore = explicitStore ?? this.getStore();
    if (!activeStore || typeof activeStore.runTransaction !== 'function') {
      throw new CommunityDatabaseUnavailableError('ذخیره‌ساز محدودیت نرخ انجمن در دسترس نیست (Fail-Closed).');
    }

    const cleanSubject = normalizeRateLimitSubject(subjectKey);
    const docId = hashRateLimitDocId(bucket, cleanSubject);
    const subjectHash = hashRateLimitSubject(cleanSubject);
    const limit = typeof overrideLimit === 'number' && overrideLimit >= 1 ? Math.floor(overrideLimit) : this.policy.limits[bucket];
    const configuredWindowMs = this.policy.windowMs;
    const nowIso = new Date(nowMs).toISOString();

    try {
      return await activeStore.runTransaction(async (tx) => {
        const existing = await tx.get<SocialRateLimitRecord & Record<string, unknown>>(
          SOCIAL_COLLECTIONS.rateLimits,
          docId,
        );

        if (!existing || typeof existing.resetAtMs !== 'number' || nowMs >= existing.resetAtMs) {
          const resetAtMs = nowMs + configuredWindowMs;
          const nextRecord: SocialRateLimitRecord = {
            id: docId,
            subjectHash,
            bucket,
            count: 1,
            windowMs: configuredWindowMs,
            resetAtMs,
            updatedAtIso: nowIso,
            schemaVersion: 1,
          };
          tx.set(SOCIAL_COLLECTIONS.rateLimits, docId, nextRecord as unknown as Record<string, unknown>);
          return {
            allowed: true,
            remaining: Math.max(0, limit - 1),
            retryAfterSec: 0,
            limit,
          };
        }

        const currentCount = Number(existing.count ?? 0);
        if (currentCount >= limit) {
          const retryAfterSec = Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000));
          return {
            allowed: false,
            remaining: 0,
            retryAfterSec,
            limit,
          };
        }

        const nextCount = currentCount + 1;
        const updatedRecord: SocialRateLimitRecord = {
          id: docId,
          subjectHash,
          bucket,
          count: nextCount,
          windowMs: typeof existing.windowMs === 'number' && existing.windowMs > 0 ? existing.windowMs : configuredWindowMs,
          resetAtMs: existing.resetAtMs,
          updatedAtIso: nowIso,
          schemaVersion: 1,
        };
        tx.set(SOCIAL_COLLECTIONS.rateLimits, docId, updatedRecord as unknown as Record<string, unknown>);
        return {
          allowed: true,
          remaining: Math.max(0, limit - nextCount),
          retryAfterSec: 0,
          limit,
        };
      });
    } catch (err) {
      if (err instanceof CommunityDatabaseUnavailableError) throw err;
      throw new CommunityDatabaseUnavailableError('خطا در بررسی محدودیت نرخ روی Firestore (Fail-Closed).', err);
    }
  }
}

export function hashCommunityIdempotencyKey(uid: string, scope: string, rawKey: string): string {
  const digest = crypto.createHash('sha256').update(`${uid}::${scope}::${rawKey}`).digest('hex').slice(0, 32);
  return `idem_${scope}_${digest}`;
}

export function hashCommunityPayload(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex').slice(0, 32);
}
