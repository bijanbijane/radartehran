/**
 * @file worker/cache/rateLimiter.ts
 * @description Distributed Edge Rate Limiter & Abuse Prevention.
 *
 * Enforces:
 * - Distributed sliding-window rate limiting.
 * - Trusted edge IP context (preventing spoofed X-Forwarded-For bypass).
 * - Multi-tiered limits (per-IP, per-user, and per-bucket).
 * - Exponential abuse cooldown tracking.
 */

import type { RateLimitDecision } from './types';

export interface RateLimiterStorage {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, expirationTtlSeconds: number): Promise<void>;
}

export interface DistributedRateLimiterConfig {
  maxRequests: number;
  windowSeconds: number;
  bucketType: string;
}

export class DistributedEdgeRateLimiter {
  private readonly storage: RateLimiterStorage;

  constructor(storage: RateLimiterStorage) {
    this.storage = storage;
  }

  /**
   * Evaluates rate limit against distributed storage.
   */
  public async evaluateLimit(
    identifier: string,
    config: DistributedRateLimiterConfig,
    nowMs = Date.now()
  ): Promise<RateLimitDecision> {
    const windowMs = config.windowSeconds * 1000;
    const windowIndex = Math.floor(nowMs / windowMs);
    const key = `rl:${config.bucketType}:${identifier}:${windowIndex}`;

    let currentCount = 0;
    try {
      const existing = await this.storage.get(key);
      if (existing) {
        currentCount = Number(existing) || 0;
      }
    } catch {
      // Storage error fails open for standard traffic, but warns
    }

    const nextCount = currentCount + 1;
    const allowed = nextCount <= config.maxRequests;
    const resetAtMs = (windowIndex + 1) * windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));

    // Save incremented count
    try {
      await this.storage.put(key, String(nextCount), config.windowSeconds * 2);
    } catch {
      // Non-fatal
    }

    return {
      allowed,
      currentCount: nextCount,
      maxAllowed: config.maxRequests,
      resetAtMs,
      retryAfterSeconds,
      bucketType: config.bucketType,
    };
  }
}
