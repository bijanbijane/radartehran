/** @file tests/social-following-feed-scale.test.ts — Stage 7 Scalable Following Feed Across >100 Follows & Multi-Scope Acceptance Suite (RT-SOCIAL-IMPL-007: FEED-029..FEED-035) */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommunityHttpError,
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
} from '../server/modules/community/communityFirestoreAdapter';
import { CommunityUnifiedRepository } from '../server/modules/community/communityUnifiedRepository';
import { SocialDiscoveryAndFeedService } from '../server/modules/search/socialDiscoveryAndFeed';

test('FEED-029..FEED-035: getFollowingFeed paginates >100 follows without truncation, matches user/topic/post scopes, and detects followSetVersion cursor invalidation', async () => {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(store);
  const service = new SocialDiscoveryAndFeedService(() => store);
  const viewerUid = 'user_following_viewer';

  // Seed 115 followed topics/users so viewer has >100 follows (exceeding old limit: 100)
  for (let i = 1; i <= 110; i++) {
    const targetId = `topic_custom_${String(i).padStart(3, '0')}`;
    await store.setDoc(SOCIAL_COLLECTIONS.follows, `topic_${targetId}__${viewerUid}`, {
      id: `topic_${targetId}__${viewerUid}`,
      scope: 'topic',
      targetId,
      followerUid: viewerUid,
      createdAtIso: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
    });
  }

  // Add follow for author 'user_followed_author' (scope='user'), topic 'topic-rent-deposit' (scope='topic'), and specific post (scope='post')
  const postByFollowedAuthor = await repo.createDiscussion(
    { uid: 'user_followed_author', emailVerified: true },
    {
      titleFa: 'پست نویسنده دنبال‌شده درباره بازار مسکن',
      bodyFa: 'این پست باید به دلیل دنبال‌کردن نویسنده در فید دنبال‌شده‌ها ظاهر شود.',
      neighborhoodId: 1,
      topicId: 'general',
    },
  );
  const postInFollowedTopic = await repo.createDiscussion(
    { uid: 'user_other_author_1', emailVerified: true },
    {
      titleFa: 'پست در موضوع دنبال‌شده اجاره و بودجه',
      bodyFa: 'این پست باید به دلیل دنبال‌کردن موضوع اجاره در فید دنبال‌شده‌ها قرار گیرد.',
      neighborhoodId: 1,
      topicId: 'topic-rent-deposit',
    },
  );
  const postDirectlyFollowed = await repo.createDiscussion(
    { uid: 'user_other_author_2', emailVerified: true },
    {
      titleFa: 'پست مستقیماً دنبال‌شده توسط کاربر',
      bodyFa: 'این پست به صورت مستقیم دنبال شده و باید در فید دنبال‌شده‌ها دیده شود.',
      neighborhoodId: 1,
      topicId: 'general',
    },
  );
  const postUnfollowed = await repo.createDiscussion(
    { uid: 'user_unfollowed_author', emailVerified: true },
    {
      titleFa: 'پست نامرتبط که نباید در فید دنبال‌شده‌ها باشد',
      bodyFa: 'نویسنده و موضوع این پست توسط کاربر دنبال نشده‌اند.',
      neighborhoodId: 1,
      topicId: 'general',
    },
  );

  // Follow user, topic, and post (these are follows #111, #112, #113 — beyond the first 100!)
  await store.setDoc(SOCIAL_COLLECTIONS.follows, `user_user_followed_author__${viewerUid}`, {
    id: `user_user_followed_author__${viewerUid}`,
    scope: 'user',
    targetId: 'user_followed_author',
    followerUid: viewerUid,
    createdAtIso: '2026-02-01T00:00:01.000Z',
  });
  await store.setDoc(SOCIAL_COLLECTIONS.follows, `topic_topic-rent-deposit__${viewerUid}`, {
    id: `topic_topic-rent-deposit__${viewerUid}`,
    scope: 'topic',
    targetId: 'topic-rent-deposit',
    followerUid: viewerUid,
    createdAtIso: '2026-02-01T00:00:02.000Z',
  });
  await store.setDoc(SOCIAL_COLLECTIONS.follows, `post_${postDirectlyFollowed.item.id}__${viewerUid}`, {
    id: `post_${postDirectlyFollowed.item.id}__${viewerUid}`,
    scope: 'post',
    targetId: postDirectlyFollowed.item.id,
    followerUid: viewerUid,
    createdAtIso: '2026-02-01T00:00:03.000Z',
  });

  // Query following feed
  const feedPage1 = await service.getFollowingFeed(viewerUid, {
    limit: 2,
  });
  assert.equal(feedPage1.items.length, 2);
  assert.ok(feedPage1.nextCursor);

  const feedPage2 = await service.getFollowingFeed(viewerUid, {
    limit: 2,
    cursor: feedPage1.nextCursor,
  });
  const combinedIds = [...feedPage1.items, ...feedPage2.items].map((i) => i.id);
  assert.ok(combinedIds.includes(postByFollowedAuthor.item.id));
  assert.ok(combinedIds.includes(postInFollowedTopic.item.id));
  assert.ok(combinedIds.includes(postDirectlyFollowed.item.id));
  assert.equal(combinedIds.includes(postUnfollowed.item.id), false);

  // FEED-034: Changing user's follow set invalidates old following-feed cursor with 409 FEED_CURSOR_STALE
  await store.setDoc(SOCIAL_COLLECTIONS.follows, `topic_new_change__${viewerUid}`, {
    id: `topic_new_change__${viewerUid}`,
    scope: 'topic',
    targetId: 'new_change',
    followerUid: viewerUid,
    createdAtIso: '2026-02-02T00:00:00.000Z',
  });

  await assert.rejects(
    () =>
      service.getFollowingFeed(viewerUid, {
        limit: 2,
        cursor: feedPage1.nextCursor,
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409 && err.code === 'FEED_CURSOR_STALE',
  );
});
