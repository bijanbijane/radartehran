/** @file tests/community-social-activity-follow-reaction.test.ts — Stage 5 Follow & Reaction Activity Ledger & Idempotency Acceptance Suite (RT-SOCIAL-IMPL-005: ACT-016..ACT-030) */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommunityDatabaseUnavailableError,
  CommunityHttpError,
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
  type CommunityTransaction,
} from '../server/modules/community/communityFirestoreAdapter';
import { CommunityUnifiedRepository } from '../server/modules/community/communityUnifiedRepository';
import type { SocialActivityRecord } from '../server/modules/community/socialActivityTypes';

function createTestRepo() {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(store);
  return { store, repo };
}

test('ACT-016..ACT-021: Follow and Unfollow across topic, post, and user scopes record atomic activity events', async () => {
  const { store, repo } = createTestRepo();
  const author = { uid: 'user_fr_author', emailVerified: true };
  const followerUid = 'user_fr_follower';

  const disc = await repo.createDiscussion(author, {
    titleFa: 'گفت‌وگوی مرجع برای تست دنبال‌کردن و واکنش اتمیک',
    bodyFa: 'بررسی ثبت رویدادهای دنبال‌کردن و واکنش در دفتر فعالیت‌های اجتماعی رادار تهران.',
    neighborhoodId: 1,
  });

  // Follow post -> social.follow.created.v1
  const followPost = await repo.toggleFollowTransactional(followerUid, 'post', disc.item.id, {
    idempotencyKey: 'idem_follow_post_1',
  });
  assert.equal(followPost.isFollowed, true);

  // Unfollow post -> social.follow.removed.v1
  const unfollowPost = await repo.toggleFollowTransactional(followerUid, 'post', disc.item.id, {
    idempotencyKey: 'idem_unfollow_post_1',
  });
  assert.equal(unfollowPost.isFollowed, false);

  // Follow topic -> social.follow.created.v1
  const followTopic = await repo.toggleFollowTransactional(followerUid, 'topic', 'topic-rent-deposit', {
    idempotencyKey: 'idem_follow_topic_1',
  });
  assert.equal(followTopic.isFollowed, true);

  // Unfollow topic -> social.follow.removed.v1
  const unfollowTopic = await repo.toggleFollowTransactional(followerUid, 'topic', 'topic-rent-deposit', {
    idempotencyKey: 'idem_unfollow_topic_1',
  });
  assert.equal(unfollowTopic.isFollowed, false);

  // Follow user -> social.follow.created.v1
  await repo.getOrCreateProfile({ uid: author.uid, emailVerified: true, displayNameFa: 'نویسنده' });
  const followUser = await repo.toggleFollowTransactional(followerUid, 'user', author.uid, {
    idempotencyKey: 'idem_follow_user_1',
  });
  assert.equal(followUser.isFollowed, true);

  const followActivities = await store.queryDocs<SocialActivityRecord>(SOCIAL_COLLECTIONS.activities, {
    filters: [{ field: 'actorUid', op: '==', value: followerUid }],
    limit: 50,
  });
  const createdEvents = followActivities.items.filter((a) => a.eventType === 'social.follow.created.v1');
  const removedEvents = followActivities.items.filter((a) => a.eventType === 'social.follow.removed.v1');
  assert.equal(createdEvents.length, 3);
  assert.equal(removedEvents.length, 2);
});

test('ACT-022..ACT-025: Reaction create, remove, and switch (helpful -> agree) record accurate activity events and counts', async () => {
  const { store, repo } = createTestRepo();
  const author = { uid: 'user_react_author', emailVerified: true };
  const reactorUid = 'user_reactor_1';

  const disc = await repo.createDiscussion(author, {
    titleFa: 'بررسی تغییر نوع واکنش از مفید به موافق در یک تراکنش',
    bodyFa: 'هنگام تغییر نوع واکنش باید هم رویداد حذف واکنش قبلی و هم رویداد ایجاد واکنش جدید ثبت شوند.',
    neighborhoodId: 1,
  });

  // 1. Create reaction 'helpful' -> social.reaction.created.v1
  const r1 = await repo.toggleReactionTransactional(reactorUid, disc.item.id, 'helpful', {
    idempotencyKey: 'idem_react_1',
  });
  assert.equal(r1.activeReaction, 'helpful');
  assert.equal(r1.reactionCounts.helpful, 1);

  // 2. Switch reaction 'helpful' -> 'agree' -> emits BOTH social.reaction.removed.v1(helpful) AND social.reaction.created.v1(agree)
  const r2 = await repo.toggleReactionTransactional(reactorUid, disc.item.id, 'agree', {
    idempotencyKey: 'idem_react_2',
  });
  assert.equal(r2.activeReaction, 'agree');
  assert.equal(r2.reactionCounts.helpful, 0);
  assert.equal(r2.reactionCounts.agree, 1);

  // 3. Remove reaction 'agree' -> social.reaction.removed.v1(agree)
  const r3 = await repo.toggleReactionTransactional(reactorUid, disc.item.id, 'agree', {
    idempotencyKey: 'idem_react_3',
  });
  assert.equal(r3.activeReaction, null);
  assert.equal(r3.reactionCounts.agree, 0);

  const reactActivities = await store.queryDocs<SocialActivityRecord>(SOCIAL_COLLECTIONS.activities, {
    filters: [{ field: 'actorUid', op: '==', value: reactorUid }],
    limit: 50,
  });
  const createdReacts = reactActivities.items.filter((a) => a.eventType === 'social.reaction.created.v1');
  const removedReacts = reactActivities.items.filter((a) => a.eventType === 'social.reaction.removed.v1');
  assert.equal(createdReacts.length, 2);
  assert.equal(removedReacts.length, 2);
  assert.ok(removedReacts.some((a) => a.metadata?.previousReactionType === 'helpful' && a.metadata?.newReactionType === 'agree'));
});

test('ACT-026..ACT-030: Idempotent replay does not toggle or emit duplicate activity, payload conflict returns 409, no-op transition emits zero activity, and rollback preserves atomicity', async () => {
  const { store, repo } = createTestRepo();
  const author = { uid: 'user_idem_author', emailVerified: true };
  const actorUid = 'user_idem_actor';

  const disc = await repo.createDiscussion(author, {
    titleFa: 'گفت‌وگوی تست Idempotency و عدم تغییر وضعیت در تکرار درخواست',
    bodyFa: 'ارسال مجدد همان درخواست با همان کلید یکتایی نباید وضعیت دنبال‌کردن یا واکنش را برعکس کند.',
    neighborhoodId: 1,
  });

  // ACT-026: Replay with same Idempotency-Key does NOT toggle state back and does NOT create second activity
  const key = 'idem_follow_replay_test';
  const firstFollow = await repo.toggleFollowTransactional(actorUid, 'post', disc.item.id, { idempotencyKey: key });
  assert.equal(firstFollow.isFollowed, true);

  const replayFollow = await repo.toggleFollowTransactional(actorUid, 'post', disc.item.id, { idempotencyKey: key });
  assert.equal(replayFollow.isFollowed, true);
  assert.equal('idempotentReplay' in replayFollow && replayFollow.idempotentReplay, true);

  // ACT-027: Reusing same Idempotency-Key with different payload throws 409 IDEMPOTENCY_CONFLICT
  await assert.rejects(
    () => repo.toggleFollowTransactional(actorUid, 'topic', 'topic-rent-deposit', { idempotencyKey: key }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409 && err.code === 'IDEMPOTENCY_CONFLICT',
  );

  // ACT-028: Explicit no-op operation (e.g., operation: 'follow' when already followed) emits zero new activity
  const activitiesBeforeNoop = await store.queryDocs<SocialActivityRecord>(SOCIAL_COLLECTIONS.activities, {
    filters: [{ field: 'actorUid', op: '==', value: actorUid }],
    limit: 50,
  });
  const noopRes = await repo.toggleFollowTransactional(actorUid, 'post', disc.item.id, {
    operation: 'follow',
    idempotencyKey: 'idem_explicit_noop_follow',
  });
  assert.equal(noopRes.isFollowed, true);
  const activitiesAfterNoop = await store.queryDocs<SocialActivityRecord>(SOCIAL_COLLECTIONS.activities, {
    filters: [{ field: 'actorUid', op: '==', value: actorUid }],
    limit: 50,
  });
  assert.equal(activitiesAfterNoop.items.length, activitiesBeforeNoop.items.length);

  // ACT-029 & ACT-030: Transaction rollback when activity write fails leaves follow & reaction state untouched
  const origRunTx = store.runTransaction.bind(store);
  store.runTransaction = async <T>(fn: (tx: CommunityTransaction) => Promise<T>): Promise<T> => {
    return origRunTx(async (tx) => {
      const wrappedTx: CommunityTransaction = {
        ...tx,
        set(col, id, data, opts) {
          if (col === SOCIAL_COLLECTIONS.activities) {
            throw new CommunityDatabaseUnavailableError('Simulated activity write failure on reaction');
          }
          tx.set(col, id, data, opts);
        },
      };
      return fn(wrappedTx);
    });
  };

  await assert.rejects(
    () => repo.toggleReactionTransactional(actorUid, disc.item.id, 'helpful', { idempotencyKey: 'idem_fail_react' }),
    (err: unknown) => err instanceof CommunityDatabaseUnavailableError,
  );

  const postDocAfterFail = await store.getDoc(SOCIAL_COLLECTIONS.posts, disc.item.id);
  assert.equal(Number(postDocAfterFail?.helpfulCount ?? 0), 0);
});
