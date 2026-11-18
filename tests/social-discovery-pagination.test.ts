/** @file tests/social-discovery-pagination.test.ts — Stage 7 Scalable Social Discovery & Cursor Pagination Suite (RT-SOCIAL-IMPL-007: FEED-001..FEED-010) */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommunityHttpError,
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
} from '../server/modules/community/communityFirestoreAdapter';
import { SocialDiscoveryAndFeedService } from '../server/modules/search/socialDiscoveryAndFeed';
import { upsertSocialFeedProjectionInTx } from '../server/modules/search/socialFeedProjection';

async function seedPostsWithIndex(store: MockFirestoreCommunityStore, count: number) {
  for (let i = 1; i <= count; i++) {
    const id = `post_scale_${String(i).padStart(4, '0')}`;
    const createdAtIso = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
    const postDoc = {
      id,
      recordKind: 'discussion' as const,
      ownerUserId: `user_${(i % 5) + 1}`,
      authorId: `user_${(i % 5) + 1}`,
      neighborhoodId: (i % 3) + 1,
      topicId: i % 2 === 0 ? 'rent_and_budget' : 'transit_and_access',
      titleFa: `تحلیل بازار مسکن و اجاره شماره ${i}`,
      bodyFa: `این متن تحلیلی شماره ${i} درباره روند قیمت آپارتمان و دسترسی مترو در محله است.`,
      status: 'active',
      moderationStatus: 'active',
      helpfulCount: i % 15,
      replyCount: i % 7,
      isDeleted: false,
      source: 'user',
      isSeed: false,
      createdAtIso,
      updatedAtIso: createdAtIso,
    };
    await store.runTransaction(async (tx) => {
      tx.set(SOCIAL_COLLECTIONS.posts, id, postDoc);
      upsertSocialFeedProjectionInTx(tx, postDoc);
    });
  }
}

test('FEED-001..FEED-006: Paginates 320 posts beyond old 200-post memory cap without duplicates or gaps across discover feed and search', async () => {
  const store = new MockFirestoreCommunityStore();
  const service = new SocialDiscoveryAndFeedService(() => store);

  // Seed 320 posts (well above the legacy 200-post cap)
  await seedPostsWithIndex(store, 320);

  for (const mode of ['discover', 'search'] as const) {
    const seenIds = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;

    do {
      const page =
        mode === 'discover'
          ? await service.getDiscoverFeed({ limit: 40, cursor })
          : await service.searchSocial({ q: 'مسکن', limit: 40, cursor });
      pages++;
      for (const item of page.items) {
        assert.equal(seenIds.has(item.id), false, `Duplicate item ${item.id} on mode=${mode}`);
        seenIds.add(item.id);
      }
      cursor = page.nextCursor;
      assert.ok(pages <= 15, 'Pagination loop guard');
    } while (cursor);

    assert.equal(seenIds.size, 320, `All 320 posts must be reachable via cursor pagination for mode=${mode}`);
  }
});

test('FEED-007..FEED-010: Cursor validation rejects tampered cursor (400), mismatched queryFingerprint (409 FEED_CURSOR_MISMATCH), and stale formulaVersion (409 FEED_CURSOR_STALE)', async () => {
  const store = new MockFirestoreCommunityStore();
  const service = new SocialDiscoveryAndFeedService(() => store);
  await seedPostsWithIndex(store, 25);

  const page1 = await service.getNeighborhoodFeed(1, { limit: 5 });
  assert.ok(page1.nextCursor);

  // FEED-007: Tampered/malformed cursor -> 400 INVALID_FEED_CURSOR
  await assert.rejects(
    () => service.getNeighborhoodFeed(1, { cursor: 'not_a_valid_cursor_@@@' }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 400 && err.code === 'INVALID_FEED_CURSOR',
  );

  // FEED-008: Reusing cursor with different neighborhoodId or feed scope -> 409 FEED_CURSOR_MISMATCH
  await assert.rejects(
    () => service.getNeighborhoodFeed(2, { cursor: page1.nextCursor }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409 && err.code === 'FEED_CURSOR_MISMATCH',
  );

  await assert.rejects(
    () => service.getDiscoverFeed({ cursor: page1.nextCursor }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409 && err.code === 'FEED_CURSOR_MISMATCH',
  );

  // FEED-009: Stale formulaVersion in cursor -> 409 FEED_CURSOR_STALE
  const decoded = JSON.parse(Buffer.from(page1.nextCursor!, 'base64url').toString('utf8'));
  const staleCursor = Buffer.from(JSON.stringify({ ...decoded, formulaVersion: 'v0-legacy-formula' }), 'utf8').toString('base64url');
  await assert.rejects(
    () => service.getNeighborhoodFeed(1, { cursor: staleCursor }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409 && err.code === 'FEED_CURSOR_STALE',
  );
});
