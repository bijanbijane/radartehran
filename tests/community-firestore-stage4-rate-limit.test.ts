/**
 * @file tests/community-firestore-stage4-rate-limit.test.ts
 * @description RT-SOCIAL-IMPL-002 — Shared Transactional Firestore Rate Limiting Suite (RL-01 .. RL-15).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommunityDatabaseUnavailableError,
  CommunityHttpError,
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
} from '../server/modules/community/communityFirestoreAdapter';
import {
  COMMUNITY_RATE_LIMITS,
  CommunityRateLimiter,
  hashRateLimitDocId,
  hashRateLimitSubject,
  type SocialRateLimitRecord,
} from '../server/modules/community/communityRateLimiter';
import { CommunityUnifiedRepository } from '../server/modules/community/communityUnifiedRepository';

test('RL-01: First request in window creates counter document with count = 1', async () => {
  const store = new MockFirestoreCommunityStore();
  const limiter = new CommunityRateLimiter(process.env, store);
  const res = await limiter.checkAndConsume('create_post', 'user_rl_01', 1_000_000);
  assert.equal(res.allowed, true);
  assert.equal(res.remaining, COMMUNITY_RATE_LIMITS.create_post.max - 1);
  assert.equal(res.retryAfterSec, 0);

  const docId = hashRateLimitDocId('create_post', 'user_rl_01');
  const doc = await store.getDoc<SocialRateLimitRecord>(SOCIAL_COLLECTIONS.rateLimits, docId);
  assert.ok(doc);
  assert.equal(doc.count, 1);
  assert.equal(doc.bucket, 'create_post');
  assert.equal(doc.windowMs, 60_000);
  assert.equal(doc.resetAtMs, 1_060_000);
});

test('RL-02: Requests within bucket limit increment counter and remain allowed', async () => {
  const store = new MockFirestoreCommunityStore();
  const limiter = new CommunityRateLimiter(process.env, store);
  for (let i = 1; i <= 5; i++) {
    const res = await limiter.checkAndConsume('appeal', 'user_rl_02', 2_000_000 + i * 100);
    assert.equal(res.allowed, true);
    assert.equal(res.remaining, 5 - i);
  }
  const docId = hashRateLimitDocId('appeal', 'user_rl_02');
  const doc = await store.getDoc<SocialRateLimitRecord>(SOCIAL_COLLECTIONS.rateLimits, docId);
  assert.equal(doc?.count, 5);
});

test('RL-03: Crossing bucket limit returns allowed=false (429 RATE_LIMITED in repository)', async () => {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(store);
  for (let i = 0; i < 5; i++) {
    await repo.enforceRateLimit('appeal', 'user_rl_03', 3_000_000);
  }
  await assert.rejects(
    async () => {
      await repo.enforceRateLimit('appeal', 'user_rl_03', 3_000_500);
    },
    (err: unknown) => {
      assert.ok(err instanceof CommunityHttpError);
      assert.equal(err.statusCode, 429);
      assert.equal(err.code, 'RATE_LIMITED');
      assert.ok(Number(err.details?.retryAfterSec) > 0);
      return true;
    },
  );
});

test('RL-04: Expired window resets counter to count = 1 on next request', async () => {
  const store = new MockFirestoreCommunityStore();
  const limiter = new CommunityRateLimiter(process.env, store);
  for (let i = 0; i < 5; i++) {
    await limiter.checkAndConsume('appeal', 'user_rl_04', 4_000_000);
  }
  const denied = await limiter.checkAndConsume('appeal', 'user_rl_04', 4_059_999);
  assert.equal(denied.allowed, false);

  const resetRes = await limiter.checkAndConsume('appeal', 'user_rl_04', 4_060_000);
  assert.equal(resetRes.allowed, true);
  assert.equal(resetRes.remaining, 4);

  const docId = hashRateLimitDocId('appeal', 'user_rl_04');
  const doc = await store.getDoc<SocialRateLimitRecord>(SOCIAL_COLLECTIONS.rateLimits, docId);
  assert.equal(doc?.count, 1);
  assert.equal(doc?.resetAtMs, 4_120_000);
});

test('RL-05: Two independent repository instances sharing one Firestore store enforce a single quota', async () => {
  const sharedStore = new MockFirestoreCommunityStore();
  const repoA = new CommunityUnifiedRepository(sharedStore);
  const repoB = new CommunityUnifiedRepository(sharedStore);

  for (let i = 0; i < 5; i++) {
    await repoA.enforceRateLimit('create_post', 'user_rl_05', 5_000_000);
    await repoB.enforceRateLimit('create_post', 'user_rl_05', 5_000_100);
  }

  await assert.rejects(
    async () => {
      await repoA.enforceRateLimit('create_post', 'user_rl_05', 5_000_200);
    },
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 429 && err.code === 'RATE_LIMITED',
  );
  await assert.rejects(
    async () => {
      await repoB.enforceRateLimit('create_post', 'user_rl_05', 5_000_300);
    },
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 429 && err.code === 'RATE_LIMITED',
  );
});

test('RL-06: Concurrent requests across two instances respect exact limit (10 allowed, 11th rejected)', async () => {
  const sharedStore = new MockFirestoreCommunityStore();
  const repoA = new CommunityUnifiedRepository(sharedStore);
  const repoB = new CommunityUnifiedRepository(sharedStore);

  const concurrentTen = await Promise.all([
    ...Array.from({ length: 5 }, (_, i) =>
      repoA.createDiscussion(
        { uid: 'user_rl_06', emailVerified: true, displayNameFa: 'کاربر هم‌زمان' },
        { titleFa: `پست الف ${i + 1} در محله زعفرانیه`, bodyFa: 'بررسی هم‌زمانی محدودیت نرخ در دو نمونه سرور مستقل رادار تهران.', neighborhoodId: 1 },
      ),
    ),
    ...Array.from({ length: 5 }, (_, i) =>
      repoB.createDiscussion(
        { uid: 'user_rl_06', emailVerified: true, displayNameFa: 'کاربر هم‌زمان' },
        { titleFa: `پست ب ${i + 1} در محله زعفرانیه`, bodyFa: 'بررسی هم‌زمانی محدودیت نرخ در دو نمونه سرور مستقل رادار تهران.', neighborhoodId: 1 },
      ),
    ),
  ]);
  assert.equal(concurrentTen.length, 10);

  await assert.rejects(
    async () => {
      await repoB.createDiscussion(
        { uid: 'user_rl_06', emailVerified: true, displayNameFa: 'کاربر هم‌زمان' },
        { titleFa: 'پست یازدهم که باید رد شود', bodyFa: 'این درخواست باید با کد ۴۲۹ و RATE_LIMITED متوقف شود.', neighborhoodId: 1 },
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof CommunityHttpError);
      assert.equal(err.statusCode, 429);
      assert.equal(err.code, 'RATE_LIMITED');
      return true;
    },
  );
});

test('RL-07: Unavailable Firestore fails closed with 503 COMMUNITY_DATABASE_UNAVAILABLE', async () => {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(store);
  store.setSimulatedUnavailable(true);

  await assert.rejects(
    async () => {
      await repo.enforceRateLimit('create_post', 'user_rl_07');
    },
    (err: unknown) => err instanceof CommunityDatabaseUnavailableError && err.statusCode === 503,
  );
});

test('RL-08: Raw user UID is never stored in socialRateLimits documents (SHA-256 subjectHash only)', async () => {
  const store = new MockFirestoreCommunityStore();
  const limiter = new CommunityRateLimiter(process.env, store);
  const rawUid = 'sensitive_firebase_uid_987654321';
  await limiter.checkAndConsume('report', rawUid, 8_000_000);

  const page = await store.queryDocs<SocialRateLimitRecord>(SOCIAL_COLLECTIONS.rateLimits, { limit: 10 });
  assert.equal(page.items.length, 1);
  const record = page.items[0];
  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes(rawUid), false);
  assert.equal(record.subjectHash, hashRateLimitSubject(rawUid));
  assert.equal(record.id, hashRateLimitDocId('report', rawUid));
});

test('RL-09: Different buckets for the same user are isolated', async () => {
  const store = new MockFirestoreCommunityStore();
  const limiter = new CommunityRateLimiter(process.env, store);
  for (let i = 0; i < 5; i++) {
    await limiter.checkAndConsume('appeal', 'user_rl_09', 9_000_000);
  }
  const appealBlocked = await limiter.checkAndConsume('appeal', 'user_rl_09', 9_000_100);
  assert.equal(appealBlocked.allowed, false);

  const reactionAllowed = await limiter.checkAndConsume('reaction', 'user_rl_09', 9_000_100);
  assert.equal(reactionAllowed.allowed, true);
  assert.equal(reactionAllowed.remaining, COMMUNITY_RATE_LIMITS.reaction.max - 1);
});

test('RL-10: create_post limit (max 10 per minute)', async () => {
  const store = new MockFirestoreCommunityStore();
  const limiter = new CommunityRateLimiter(process.env, store);
  for (let i = 0; i < 10; i++) {
    const r = await limiter.checkAndConsume('create_post', 'user_rl_10', 10_000_000);
    assert.equal(r.allowed, true);
  }
  const r11 = await limiter.checkAndConsume('create_post', 'user_rl_10', 10_000_100);
  assert.equal(r11.allowed, false);
});

test('RL-11: create_comment limit (max 25 per minute)', async () => {
  const store = new MockFirestoreCommunityStore();
  const limiter = new CommunityRateLimiter(process.env, store);
  for (let i = 0; i < 25; i++) {
    const r = await limiter.checkAndConsume('create_comment', 'user_rl_11', 11_000_000);
    assert.equal(r.allowed, true);
  }
  const r26 = await limiter.checkAndConsume('create_comment', 'user_rl_11', 11_000_100);
  assert.equal(r26.allowed, false);
});

test('RL-12: reaction limit (max 60 per minute)', async () => {
  const store = new MockFirestoreCommunityStore();
  const limiter = new CommunityRateLimiter(process.env, store);
  for (let i = 0; i < 60; i++) {
    const r = await limiter.checkAndConsume('reaction', 'user_rl_12', 12_000_000);
    assert.equal(r.allowed, true);
  }
  const r61 = await limiter.checkAndConsume('reaction', 'user_rl_12', 12_000_100);
  assert.equal(r61.allowed, false);
});

test('RL-13: follow limit (max 40 per minute)', async () => {
  const store = new MockFirestoreCommunityStore();
  const limiter = new CommunityRateLimiter(process.env, store);
  for (let i = 0; i < 40; i++) {
    const r = await limiter.checkAndConsume('follow', 'user_rl_13', 13_000_000);
    assert.equal(r.allowed, true);
  }
  const r41 = await limiter.checkAndConsume('follow', 'user_rl_13', 13_000_100);
  assert.equal(r41.allowed, false);
});

test('RL-14: report limit (max 10 per minute)', async () => {
  const store = new MockFirestoreCommunityStore();
  const limiter = new CommunityRateLimiter(process.env, store);
  for (let i = 0; i < 10; i++) {
    const r = await limiter.checkAndConsume('report', 'user_rl_14', 14_000_000);
    assert.equal(r.allowed, true);
  }
  const r11 = await limiter.checkAndConsume('report', 'user_rl_14', 14_000_100);
  assert.equal(r11.allowed, false);
});

test('RL-15: appeal limit (max 5 per minute)', async () => {
  const store = new MockFirestoreCommunityStore();
  const limiter = new CommunityRateLimiter(process.env, store);
  for (let i = 0; i < 5; i++) {
    const r = await limiter.checkAndConsume('appeal', 'user_rl_15', 15_000_000);
    assert.equal(r.allowed, true);
  }
  const r6 = await limiter.checkAndConsume('appeal', 'user_rl_15', 15_000_100);
  assert.equal(r6.allowed, false);
  assert.ok(r6.retryAfterSec >= 1 && r6.retryAfterSec <= 60);
});
