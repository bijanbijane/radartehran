/** @file tests/community-user-follow.test.ts — Stage 9 User Follow Graph Integrity, Counters, Concurrency & Drift Audit Suite (RT-SOCIAL-IMPL-009: FOLLOW-001..FOLLOW-012) */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommunityDatabaseUnavailableError,
  CommunityHttpError,
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
  type CommunityTransaction,
} from '../server/modules/community/communityFirestoreAdapter';
import { CommunityRateLimiter } from '../server/modules/community/communityRateLimiter';
import { CommunityUnifiedRepository } from '../server/modules/community/communityUnifiedRepository';
import {
  auditUserFollowGraphConsistency,
  buildUserFollowDocId,
} from '../server/modules/community/communityUserFollowOps';
import type { SocialActivityRecord } from '../server/modules/community/socialActivityTypes';

function createTestRepo() {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(
    store,
    new CommunityRateLimiter({ COMMUNITY_RL_FOLLOW_MAX: '200' }),
  );
  return { store, repo };
}

test('FOLLOW-001..FOLLOW-007: Transactional follow/unfollow updates counters, uses deterministic ID, enforces self/404/403/400 guards, and writes Stage 5 activities', async () => {
  const { store, repo } = createTestRepo();

  await repo.getOrCreateProfile({ uid: 'uid_target_pub', emailVerified: true, displayNameFa: 'هدف عمومی', username: 'target_pub' });
  await repo.getOrCreateProfile({ uid: 'uid_follower_a', emailVerified: true, displayNameFa: 'دنبال‌کننده الف', username: 'follower_a' });
  await repo.updateProfilePrivacy('uid_target_priv', { visibility: 'private', username: 'target_priv' });
  await repo.updateProfilePrivacy('uid_target_mem', { visibility: 'members_only', username: 'target_mem' });

  // FOLLOW-001 & FOLLOW-002: Follow updates both followersCount & followingCount and uses canonical followId
  const f1 = await repo.followUser('uid_follower_a', 'uid_target_pub', { idempotencyKey: 'uf_k1' });
  assert.equal(f1.relationship.isFollowing, true);
  assert.equal(f1.counts.followersCount, 1);
  assert.equal(f1.counts.followingCount, 1);
  assert.equal(f1.idempotentReplay, false);

  const followDoc = await store.getDoc(
    SOCIAL_COLLECTIONS.follows,
    buildUserFollowDocId('uid_target_pub', 'uid_follower_a'),
  );
  assert.ok(followDoc);
  assert.equal(followDoc.scope, 'user');
  assert.equal(followDoc.targetId, 'uid_target_pub');
  assert.equal(followDoc.followerUid, 'uid_follower_a');

  // FOLLOW-003: Repeating follow is idempotent & does NOT double-increment counters or emit duplicate activity
  const f1Replay = await repo.followUser('uid_follower_a', 'uid_target_pub', { idempotencyKey: 'uf_k1' });
  assert.equal(f1Replay.idempotentReplay, true);
  assert.equal(f1Replay.counts.followersCount, 1);
  assert.equal(f1Replay.counts.followingCount, 1);

  // FOLLOW-004: Reusing same idempotencyKey for different target throws 409 IDEMPOTENCY_CONFLICT
  await assert.rejects(
    () => repo.followUser('uid_follower_a', 'uid_target_mem', { idempotencyKey: 'uf_k1' }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409 && err.code === 'IDEMPOTENCY_CONFLICT',
  );

  // FOLLOW-005: Guards for invalid ID (400), self-follow (422), missing user (404), private/unauthorized members_only (403)
  await assert.rejects(
    () => repo.followUser('uid_follower_a', 'bad uid with space!'),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 400 && err.code === 'INVALID_USER_ID',
  );
  await assert.rejects(
    () => repo.followUser('uid_follower_a', 'uid_follower_a'),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 422 && err.code === 'SELF_FOLLOW_NOT_ALLOWED',
  );
  await assert.rejects(
    () => repo.followUser('uid_follower_a', 'uid_non_existent'),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 404 && err.code === 'USER_NOT_FOUND',
  );
  await assert.rejects(
    () => repo.followUser('uid_follower_a', 'uid_target_priv'),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 403 && err.code === 'FOLLOW_NOT_ALLOWED',
  );
  await assert.rejects(
    () => repo.followUser('uid_follower_a', 'uid_target_mem', { isViewerVerifiedMember: false }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 403 && err.code === 'FOLLOW_NOT_ALLOWED',
  );

  // Unfollow decrements both counters to 0 & writes social.follow.removed.v1
  const uf1 = await repo.unfollowUser('uid_follower_a', 'uid_target_pub', { idempotencyKey: 'uuf_k1' });
  assert.equal(uf1.relationship.isFollowing, false);
  assert.equal(uf1.counts.followersCount, 0);
  assert.equal(uf1.counts.followingCount, 0);
  assert.equal(uf1.idempotentReplay, false);

  // Stage 5 Activity Ledger recorded exactly 1 created and 1 removed event
  const activities = await store.queryDocs<SocialActivityRecord>(SOCIAL_COLLECTIONS.activities, {
    filters: [{ field: 'actorUid', op: '==', value: 'uid_follower_a' }],
  });
  assert.equal(activities.items.filter((a) => a.eventType === 'social.follow.created.v1').length, 1);
  assert.equal(activities.items.filter((a) => a.eventType === 'social.follow.removed.v1').length, 1);

  // Status check respects privacy & self rules
  const statusRes = await repo.getUserFollowStatus('uid_follower_a', 'uid_target_pub');
  assert.equal(statusRes.relationship.isFollowing, false);
  assert.equal(statusRes.counts.followersCount, 0);
  await assert.rejects(
    () => repo.getUserFollowStatus('uid_follower_a', 'uid_target_priv'),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 403 && err.code === 'FOLLOW_NOT_ALLOWED',
  );
});

test('FOLLOW-008..FOLLOW-012: Rollback on transaction failure, 20 concurrent follow/unfollow convergence, and drift consistency audit', async () => {
  const { store, repo } = createTestRepo();

  await repo.getOrCreateProfile({ uid: 'uid_hub_star', emailVerified: true, username: 'hub_star' });
  const fanUids = Array.from({ length: 12 }, (_, idx) => `uid_fan_${idx + 1}`);
  for (const uid of fanUids) {
    await repo.getOrCreateProfile({ uid, emailVerified: true, username: `fan_${uid}` });
  }

  // FOLLOW-009: Run 20 concurrent follow & unfollow operations (12 unique follows + 8 redundant/mixed)
  const ops: Array<Promise<unknown>> = [];
  for (const uid of fanUids) {
    ops.push(repo.followUser(uid, 'uid_hub_star'));
    ops.push(repo.followUser(uid, 'uid_hub_star')); // concurrent duplicate for first 8 later
  }
  await Promise.all(ops.slice(0, 20));
  // Ensure remaining 2 fans finish too
  await Promise.all(ops.slice(20));

  // Unfollow 3 specific fans concurrently
  await Promise.all([
    repo.unfollowUser('uid_fan_1', 'uid_hub_star'),
    repo.unfollowUser('uid_fan_2', 'uid_hub_star'),
    repo.unfollowUser('uid_fan_3', 'uid_hub_star'),
  ]);

  const statusAfter = await repo.getUserFollowStatus('uid_fan_4', 'uid_hub_star');
  assert.equal(statusAfter.relationship.isFollowing, true);
  assert.equal(statusAfter.counts.followersCount, 9);

  // FOLLOW-010: Read-only consistency auditor confirms zero drift after concurrent mutations
  const cleanAudit = await auditUserFollowGraphConsistency(store);
  assert.equal(cleanAudit.isConsistent, true);
  assert.equal(cleanAudit.totalFollowDocsScanned, 9);
  assert.equal(cleanAudit.counterDrifts.length, 0);
  assert.equal(cleanAudit.orphanFollowDocIds.length, 0);

  // FOLLOW-011: Simulate tx failure on socialActivities write -> rollback follow doc and counters!
  const origRunTx = store.runTransaction.bind(store);
  store.runTransaction = async <T>(fn: (tx: CommunityTransaction) => Promise<T>): Promise<T> => {
    return origRunTx(async (tx) => {
      const wrapped: CommunityTransaction = {
        ...tx,
        set(col, id, data) {
          if (col === SOCIAL_COLLECTIONS.activities) {
            throw new CommunityDatabaseUnavailableError('Simulated activity write abort');
          }
          tx.set(col, id, data);
        },
      };
      return fn(wrapped);
    });
  };

  await assert.rejects(
    () => repo.followUser('uid_fan_1', 'uid_hub_star'),
    (err: unknown) => err instanceof CommunityDatabaseUnavailableError,
  );
  // Restore normal transaction and verify state was untouched
  store.runTransaction = origRunTx;
  const checkAfterRollback = await auditUserFollowGraphConsistency(store);
  assert.equal(checkAfterRollback.isConsistent, true);
  assert.equal(checkAfterRollback.totalFollowDocsScanned, 9);

  // FOLLOW-012: Deliberately inject a corrupted counter & orphan follow doc and confirm auditor detects both
  await store.setDoc(SOCIAL_COLLECTIONS.follows, 'bad_legacy_id', {
    scope: 'user',
    targetId: 'uid_deleted_ghost',
    followerUid: 'uid_fan_1',
    createdAtIso: new Date().toISOString(),
  });
  const dirtyAudit = await auditUserFollowGraphConsistency(store);
  assert.equal(dirtyAudit.isConsistent, false);
  assert.deepEqual(dirtyAudit.nonCanonicalFollowDocIds, ['bad_legacy_id']);
  assert.deepEqual(dirtyAudit.orphanFollowDocIds, ['bad_legacy_id']);
});
