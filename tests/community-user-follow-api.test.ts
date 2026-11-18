/** @file tests/community-user-follow-api.test.ts — Stage 8 & 9 HTTP Express Route Integration Suite (RT-SOCIAL-IMPL-008/009: FOLLOW-013..FOLLOW-020) */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { MockFirestoreCommunityStore } from '../server/modules/community/communityFirestoreAdapter';
import { CommunityRateLimiter } from '../server/modules/community/communityRateLimiter';
import { registerCommunityRoutes } from '../server/modules/community/communityRoutes';
import { CommunityUnifiedRepository } from '../server/modules/community/communityUnifiedRepository';

async function startTestServer(repo: CommunityUnifiedRepository) {
  const app = express();
  app.use(express.json());
  registerCommunityRoutes(app, {
    repository: repo,
    verifyUserHeader: async (headers) => {
      const auth = String(headers.authorization || '');
      if (auth === 'Bearer token_alice') {
        return { authorized: true, authenticated: true, statusCode: 200, reason: 'VERIFIED_USER', uid: 'uid_alice', email: 'alice@example.com' };
      }
      if (auth === 'Bearer token_bob') {
        return { authorized: true, authenticated: true, statusCode: 200, reason: 'VERIFIED_USER', uid: 'uid_bob', email: 'bob@example.com' };
      }
      return { authorized: false, authenticated: false, statusCode: 401, reason: 'MISSING_BEARER_TOKEN' };
    },
  });
  const srv = http.createServer(app);
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const port = (srv.address() as { port: number }).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => srv.close(() => resolve())),
  };
}

test('FOLLOW-013..FOLLOW-020: Express routes for user follow/unfollow/status, profile contributions, entityType/entityId posts query, 401, 409, and 429', async () => {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(
    store,
    new CommunityRateLimiter({ COMMUNITY_RL_FOLLOW_MAX: '5', COMMUNITY_RL_READ_MAX: '20' }),
  );
  await repo.getOrCreateProfile({ uid: 'uid_alice', emailVerified: true, username: 'alice_tehran', displayNameFa: 'آلیس' });
  await repo.getOrCreateProfile({ uid: 'uid_bob', emailVerified: true, username: 'bob_tehran', displayNameFa: 'بابک' });
  await repo.createDiscussion(
    { uid: 'uid_bob', emailVerified: true },
    {
      titleFa: 'تحلیل بازار ونک و قیمت متری',
      bodyFa: 'معاملات جدید در محله ونک با ثبات نسبی همراه بوده است.',
      neighborhoodId: 1,
      socialContext: {
        primary: { entityType: 'neighborhood', entityId: '1' },
        related: [{ entityType: 'market', entityId: 'asking_price_median_sqm' }],
        schemaVersion: 1,
      },
    },
  );

  const srv = await startTestServer(repo);
  try {
    // FOLLOW-013: Unauthenticated follow/unfollow/status returns 401
    const unauthPost = await fetch(`${srv.baseUrl}/api/v1/community/users/uid_bob/follow`, { method: 'POST' });
    assert.equal(unauthPost.status, 401);

    // FOLLOW-014: POST follow with Idempotency-Key returns 200, Cache-Control: no-store, and counts
    const followRes = await fetch(`${srv.baseUrl}/api/v1/community/users/uid_bob/follow`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_alice',
        'Idempotency-Key': 'api_follow_key_1',
      },
    });
    assert.equal(followRes.status, 200);
    assert.equal(followRes.headers.get('cache-control'), 'no-store');
    const followBody = (await followRes.json()) as { relationship: { isFollowing: boolean }; counts: { followersCount: number; followingCount: number } };
    assert.equal(followBody.relationship.isFollowing, true);
    assert.equal(followBody.counts.followersCount, 1);

    // FOLLOW-015: Conflicting Idempotency-Key target returns 409
    await repo.getOrCreateProfile({ uid: 'uid_charlie', emailVerified: true, username: 'charlie_tehran' });
    const conflictRes = await fetch(`${srv.baseUrl}/api/v1/community/users/uid_charlie/follow`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token_alice',
        'Idempotency-Key': 'api_follow_key_1',
      },
    });
    assert.equal(conflictRes.status, 409);

    // FOLLOW-016: GET follow-status confirms following=true & Cache-Control: no-store
    const statusRes = await fetch(`${srv.baseUrl}/api/v1/community/users/uid_bob/follow-status`, {
      headers: { Authorization: 'Bearer token_alice' },
    });
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.headers.get('cache-control'), 'no-store');
    const statusBody = (await statusRes.json()) as { relationship: { isFollowing: boolean }; counts: { followersCount: number } };
    assert.equal(statusBody.relationship.isFollowing, true);
    assert.equal(statusBody.counts.followersCount, 1);

    // FOLLOW-017: GET /api/v1/community/profiles/:username/contributions returns timeline item
    const contribRes = await fetch(`${srv.baseUrl}/api/v1/community/profiles/bob_tehran/contributions?limit=10`);
    assert.equal(contribRes.status, 200);
    assert.equal(contribRes.headers.get('cache-control'), 'no-store');
    const contribBody = (await contribRes.json()) as { items: Array<{ id: string }>; contributionsVisible: boolean };
    assert.equal(contribBody.contributionsVisible, true);
    assert.equal(contribBody.items.length, 1);

    // FOLLOW-018: GET /api/v1/community/posts?entityType=market&entityId=asking_price_median_sqm filters canonical context
    const ctxRes = await fetch(`${srv.baseUrl}/api/v1/community/posts?entityType=market&entityId=asking_price_median_sqm&includeSeeds=false`);
    assert.equal(ctxRes.status, 200);
    const ctxBody = (await ctxRes.json()) as { items: Array<{ titleFa: string }> };
    assert.equal(ctxBody.items.length, 1);

    // FOLLOW-019: DELETE unfollow returns isFollowing=false & followersCount=0
    const unfollowRes = await fetch(`${srv.baseUrl}/api/v1/community/users/uid_bob/follow`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token_alice', 'Idempotency-Key': 'api_unfollow_1' },
    });
    assert.equal(unfollowRes.status, 200);
    const unfollowBody = (await unfollowRes.json()) as { relationship: { isFollowing: boolean }; counts: { followersCount: number } };
    assert.equal(unfollowBody.relationship.isFollowing, false);
    assert.equal(unfollowBody.counts.followersCount, 0);

    // FOLLOW-020: Hitting follow rate limit (max=5; already used 3) returns 429 RATE_LIMITED
    await fetch(`${srv.baseUrl}/api/v1/community/users/uid_bob/follow`, { method: 'POST', headers: { Authorization: 'Bearer token_alice' } });
    await fetch(`${srv.baseUrl}/api/v1/community/users/uid_bob/follow`, { method: 'DELETE', headers: { Authorization: 'Bearer token_alice' } });
    const rlRes = await fetch(`${srv.baseUrl}/api/v1/community/users/uid_bob/follow`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token_alice' },
    });
    assert.equal(rlRes.status, 429);
    const rlBody = (await rlRes.json()) as { code: string };
    assert.equal(rlBody.code, 'RATE_LIMITED');
  } finally {
    await srv.close();
  }
});
