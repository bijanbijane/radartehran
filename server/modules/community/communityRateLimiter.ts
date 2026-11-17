/** @file server/modules/community/communityRateLimiter.ts — Configurable Centralized Community Rate Limiting (Stage 3) */
import crypto from 'node:crypto';

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

interface CounterSlot {
  count: number;
  resetAtMs: number;
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

export class CommunityRateLimiter {
  private readonly slots = new Map<string, CounterSlot>();
  private policy: CommunityRateLimitPolicy;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.policy = resolveCommunityRateLimitPolicy(env);
  }

  public reconfigure(env: Record<string, string | undefined>): void {
    this.policy = resolveCommunityRateLimitPolicy(env);
  }

  public getPolicy(): CommunityRateLimitPolicy {
    return { windowMs: this.policy.windowMs, limits: { ...this.policy.limits } };
  }

  public checkAndConsume(
    bucket: CommunityActionBucket,
    subjectKey: string,
    nowMs = Date.now(),
    overrideLimit?: number,
  ): { allowed: boolean; remaining: number; retryAfterSec: number; limit: number } {
    const cleanSubject = subjectKey.trim().slice(0, 128) || 'anonymous';
    const limit = typeof overrideLimit === 'number' && overrideLimit >= 1 ? Math.floor(overrideLimit) : this.policy.limits[bucket];
    const key = `${bucket}:${cleanSubject}`;

    if (this.slots.size > 10_000) {
      for (const [k, slot] of this.slots) {
        if (nowMs >= slot.resetAtMs) this.slots.delete(k);
      }
    }

    const current = this.slots.get(key);
    if (!current || nowMs >= current.resetAtMs) {
      this.slots.set(key, { count: 1, resetAtMs: nowMs + this.policy.windowMs });
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSec: 0, limit };
    }

    if (current.count >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAtMs - nowMs) / 1000));
      return { allowed: false, remaining: 0, retryAfterSec, limit };
    }

    current.count += 1;
    return { allowed: true, remaining: Math.max(0, limit - current.count), retryAfterSec: 0, limit };
  }

  public resetForTests(): void {
    this.slots.clear();
  }
}

export function hashCommunityIdempotencyKey(uid: string, scope: string, rawKey: string): string {
  const digest = crypto.createHash('sha256').update(`${uid}::${scope}::${rawKey}`).digest('hex').slice(0, 32);
  return `idem_${scope}_${digest}`;
}

export function hashCommunityPayload(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex').slice(0, 32);
}
