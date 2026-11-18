/** @file server/modules/community/communityUnifiedSecondaryOps.ts — Reactions, Follows & Re-exported Content Ops (Stages 3–9) */
import { COMMUNITY_TOPICS_REGISTRY } from '../../../src/features/community/data/communityTopicsAndSeeds';
import type {
  CommunityDiscussionPost,
  ReactionType,
} from '../../../src/features/community/types/community.types';
import { sanitizeInput } from '../../../src/utils/security';
import { upsertSocialFeedProjectionInTx } from '../search/socialFeedProjection';
import { CommunityHttpError, SOCIAL_COLLECTIONS } from './communityFirestoreAdapter';
import {
  hashCommunityIdempotencyKey,
  hashCommunityPayload,
} from './communityRateLimiter';
import type { UnifiedSocialPostDoc } from './communityUnifiedQueries';
import type { CommunityUnifiedRepository } from './communityUnifiedRepository';
import { appendSocialActivity } from './socialActivityRepository';

export {
  createAppealOp,
  createCorrectionOp,
  createQuestionOp,
  createResearchProposalOp,
  recordModerationActionOp,
  submitReportOp,
} from './communityContentCreationOps';
export {
  auditUserFollowGraphConsistency,
  buildUserFollowDocId,
  followUserOp,
  getUserFollowStatus,
  unfollowUserOp,
  validateFollowUserId,
  type UserFollowConsistencyAuditReport,
  type UserFollowMutationResult,
  type UserFollowStatusResult,
} from './communityUserFollowOps';

export async function toggleReactionOp(
  repo: CommunityUnifiedRepository,
  uid: string,
  targetId: string,
  reaction: ReactionType,
  options?: { idempotencyKey?: string; mode?: 'toggle' | 'set' | 'remove'; operation?: 'toggle' | 'set' | 'remove' },
) {
  await repo.enforceRateLimit('reaction', uid);
  const mode = options?.mode ?? options?.operation ?? 'toggle';
  const rawIdemKey =
    typeof options?.idempotencyKey === 'string' && options.idempotencyKey.trim()
      ? sanitizeInput(options.idempotencyKey.trim(), 80)
      : '';
  const idemDocId = rawIdemKey
    ? hashCommunityIdempotencyKey(uid, 'reaction', rawIdemKey)
    : null;
  const operationId =
    idemDocId || `op_rx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const payloadHash = hashCommunityPayload({ uid, targetId, reaction, mode });

  return repo.getStore().runTransaction(async (tx) => {
    if (idemDocId) {
      const existingIdem = await tx.get<
        {
          payloadHash: string;
          result: { reactionCounts: Record<ReactionType, number>; activeReaction: ReactionType | null };
        } & Record<string, unknown>
      >(SOCIAL_COLLECTIONS.idempotency, idemDocId);
      if (existingIdem) {
        if (existingIdem.payloadHash !== payloadHash) {
          throw new CommunityHttpError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'کلید یکتای واکنش با پارامترهای متفاوت ارسال شده است.',
          );
        }
        return { ...existingIdem.result, idempotentReplay: true };
      }
    }

    const post = await tx.get<CommunityDiscussionPost & UnifiedSocialPostDoc>(
      SOCIAL_COLLECTIONS.posts,
      targetId,
    );
    if (
      !post ||
      post.isDeleted ||
      post.status === 'hidden' ||
      post.moderationStatus === 'hidden' ||
      post.moderationStatus === 'removed'
    ) {
      throw new CommunityHttpError(404, 'TARGET_NOT_FOUND', 'محتوای هدف یافت نشد.');
    }

    const reactionDocId = `${targetId}__${uid}`;
    const existingReaction = await tx.get<{ reactionType?: ReactionType } & Record<string, unknown>>(
      SOCIAL_COLLECTIONS.reactions,
      reactionDocId,
    );
    const prev: ReactionType | null =
      existingReaction?.reactionType ?? post.reactionsByUser?.[uid] ?? null;

    let nextReaction: ReactionType | null;
    if (mode === 'remove') nextReaction = null;
    else if (mode === 'set') nextReaction = reaction;
    else nextReaction = prev === reaction ? null : reaction;

    const counts = {
      helpful: Number(post.reactionCounts?.helpful ?? post.helpfulCount ?? 0),
      agree: Number(post.reactionCounts?.agree ?? 0),
      needs_source: Number(post.reactionCounts?.needs_source ?? 0),
      disagree: Number(post.reactionCounts?.disagree ?? 0),
    };
    const byUser = { ...(post.reactionsByUser ?? {}) };
    const nowIso = new Date().toISOString();

    if (prev !== nextReaction) {
      if (prev && nextReaction === null) {
        counts[prev] = Math.max(0, counts[prev] - 1);
        delete byUser[uid];
        tx.delete(SOCIAL_COLLECTIONS.reactions, reactionDocId);
        appendSocialActivity(tx, {
          eventType: 'social.reaction.removed.v1',
          actorUid: uid,
          verifiedActorUid: uid,
          objectType: 'reaction',
          objectId: reactionDocId,
          parentObjectId: targetId,
          reactionType: prev,
          operationId,
          socialContext: post.socialContext,
          visibility: 'public',
          createdAtIso: nowIso,
        });
      } else if (prev === null && nextReaction) {
        counts[nextReaction] += 1;
        byUser[uid] = nextReaction;
        tx.set(SOCIAL_COLLECTIONS.reactions, reactionDocId, {
          targetId,
          uid,
          reactionType: nextReaction,
          updatedAtIso: nowIso,
        });
        appendSocialActivity(tx, {
          eventType: 'social.reaction.created.v1',
          actorUid: uid,
          verifiedActorUid: uid,
          objectType: 'reaction',
          objectId: reactionDocId,
          parentObjectId: targetId,
          reactionType: nextReaction,
          operationId,
          socialContext: post.socialContext,
          visibility: 'public',
          createdAtIso: nowIso,
        });
      } else if (prev && nextReaction && prev !== nextReaction) {
        counts[prev] = Math.max(0, counts[prev] - 1);
        counts[nextReaction] += 1;
        byUser[uid] = nextReaction;
        tx.set(SOCIAL_COLLECTIONS.reactions, reactionDocId, {
          targetId,
          uid,
          reactionType: nextReaction,
          updatedAtIso: nowIso,
        });
        appendSocialActivity(tx, {
          eventType: 'social.reaction.removed.v1',
          actorUid: uid,
          verifiedActorUid: uid,
          objectType: 'reaction',
          objectId: reactionDocId,
          parentObjectId: targetId,
          reactionType: prev,
          operationId,
          metadata: { previousReactionType: prev, newReactionType: nextReaction },
          socialContext: post.socialContext,
          visibility: 'public',
          createdAtIso: nowIso,
        });
        appendSocialActivity(tx, {
          eventType: 'social.reaction.created.v1',
          actorUid: uid,
          verifiedActorUid: uid,
          objectType: 'reaction',
          objectId: reactionDocId,
          parentObjectId: targetId,
          reactionType: nextReaction,
          operationId,
          metadata: { previousReactionType: prev, newReactionType: nextReaction },
          socialContext: post.socialContext,
          visibility: 'public',
          createdAtIso: nowIso,
        });
      }

      tx.update(SOCIAL_COLLECTIONS.posts, targetId, {
        reactionCounts: counts,
        reactionsByUser: byUser,
        helpfulCount: counts.helpful,
        updatedAtIso: nowIso,
      });
      upsertSocialFeedProjectionInTx(
        tx,
        {
          ...(post as unknown as Record<string, unknown>),
          reactionCounts: counts,
          reactionsByUser: byUser,
          helpfulCount: counts.helpful,
          updatedAtIso: nowIso,
        },
        nowIso,
      );
    }

    const result = { reactionCounts: counts, activeReaction: nextReaction };
    if (idemDocId) {
      tx.set(SOCIAL_COLLECTIONS.idempotency, idemDocId, {
        scope: 'reaction',
        uid,
        targetId,
        payloadHash,
        result,
        createdAtIso: nowIso,
      });
    }
    return result;
  });
}

export async function toggleFollowOp(
  repo: CommunityUnifiedRepository,
  uid: string,
  scope: 'topic' | 'post' | 'user',
  targetId: string,
  options?: { idempotencyKey?: string; mode?: 'toggle' | 'follow' | 'unfollow'; operation?: 'toggle' | 'follow' | 'unfollow' },
) {
  if (scope !== 'topic' && scope !== 'post' && scope !== 'user') {
    throw new CommunityHttpError(400, 'INVALID_FOLLOW_SCOPE', 'دامنه دنبال‌کردن نامعتبر است.');
  }
  const cleanTargetId = sanitizeInput(targetId || '', 64).trim();
  if (!cleanTargetId) {
    throw new CommunityHttpError(400, 'INVALID_FOLLOW_TARGET', 'شناسه هدف دنبال‌کردن الزامی است.');
  }
  if (scope === 'user' && cleanTargetId === uid) {
    throw new CommunityHttpError(
      422,
      'SELF_FOLLOW_NOT_ALLOWED',
      'کاربر نمی‌تواند حساب کاربری خودش را دنبال کند.',
    );
  }

  await repo.enforceRateLimit('follow', uid);
  const mode = options?.mode ?? options?.operation ?? 'toggle';
  const rawIdemKey =
    typeof options?.idempotencyKey === 'string' && options.idempotencyKey.trim()
      ? sanitizeInput(options.idempotencyKey.trim(), 80)
      : '';
  const idemDocId = rawIdemKey
    ? hashCommunityIdempotencyKey(uid, 'follow', rawIdemKey)
    : null;
  const operationId =
    idemDocId || `op_flw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const payloadHash = hashCommunityPayload({ uid, scope, targetId: cleanTargetId, mode });
  const followDocId = `${scope}_${cleanTargetId}__${uid}`;

  return repo.getStore().runTransaction(async (tx) => {
    if (idemDocId) {
      const existingIdem = await tx.get<
        {
          payloadHash: string;
          result: { isFollowed: boolean; followerCount: number };
        } & Record<string, unknown>
      >(SOCIAL_COLLECTIONS.idempotency, idemDocId);
      if (existingIdem) {
        if (existingIdem.payloadHash !== payloadHash) {
          throw new CommunityHttpError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'کلید یکتای دنبال‌کردن با پارامترهای متفاوت ارسال شده است.',
          );
        }
        return { ...existingIdem.result, idempotentReplay: true };
      }
    }

    if (scope === 'topic') {
      const topicExists = COMMUNITY_TOPICS_REGISTRY.some((t) => t.id === cleanTargetId);
      if (!topicExists) {
        throw new CommunityHttpError(404, 'TOPIC_NOT_FOUND', 'موضوع موردنظر یافت نشد.');
      }
    }

    const existing = await tx.get(SOCIAL_COLLECTIONS.follows, followDocId);
    const nowIso = new Date().toISOString();
    let result: { isFollowed: boolean; followerCount: number };

    if (scope === 'post') {
      const post = await tx.get<CommunityDiscussionPost & UnifiedSocialPostDoc>(
        SOCIAL_COLLECTIONS.posts,
        cleanTargetId,
      );
      if (
        !post ||
        post.isDeleted ||
        post.status === 'hidden' ||
        post.moderationStatus === 'hidden' ||
        post.moderationStatus === 'removed'
      ) {
        throw new CommunityHttpError(404, 'DISCUSSION_NOT_FOUND', 'مطلب یافت نشد.');
      }
      const currentIds = Array.isArray(post.followerIds) ? [...post.followerIds] : [];
      const wasFollowed = Boolean(existing || currentIds.includes(uid));
      const shouldFollow =
        mode === 'follow' ? true : mode === 'unfollow' ? false : !wasFollowed;

      if (wasFollowed && !shouldFollow) {
        tx.delete(SOCIAL_COLLECTIONS.follows, followDocId);
        const nextIds = currentIds.filter((id) => id !== uid);
        tx.update(SOCIAL_COLLECTIONS.posts, cleanTargetId, {
          followerIds: nextIds,
          followerCount: nextIds.length,
        });
        appendSocialActivity(tx, {
          eventType: 'social.follow.removed.v1',
          actorUid: uid,
          verifiedActorUid: uid,
          objectType: 'follow',
          objectId: followDocId,
          parentObjectId: cleanTargetId,
          followScope: 'post',
          followTargetId: cleanTargetId,
          operationId,
          socialContext: post.socialContext,
          visibility: 'public',
          createdAtIso: nowIso,
        });
        result = { isFollowed: false, followerCount: nextIds.length };
      } else if (!wasFollowed && shouldFollow) {
        const nextIds = currentIds.includes(uid) ? currentIds : [...currentIds, uid];
        tx.set(SOCIAL_COLLECTIONS.follows, followDocId, {
          scope,
          targetId: cleanTargetId,
          followerUid: uid,
          createdAtIso: nowIso,
        });
        tx.update(SOCIAL_COLLECTIONS.posts, cleanTargetId, {
          followerIds: nextIds,
          followerCount: nextIds.length,
        });
        appendSocialActivity(tx, {
          eventType: 'social.follow.created.v1',
          actorUid: uid,
          verifiedActorUid: uid,
          objectType: 'follow',
          objectId: followDocId,
          parentObjectId: cleanTargetId,
          followScope: 'post',
          followTargetId: cleanTargetId,
          operationId,
          socialContext: post.socialContext,
          visibility: 'public',
          createdAtIso: nowIso,
        });
        result = { isFollowed: true, followerCount: nextIds.length };
      } else {
        result = { isFollowed: wasFollowed, followerCount: currentIds.length };
      }
    } else {
      const targetUserProfile =
        scope === 'user'
          ? await tx.get<Record<string, unknown>>(SOCIAL_COLLECTIONS.profiles, cleanTargetId)
          : null;
      const followerUserProfile =
        scope === 'user'
          ? await tx.get<Record<string, unknown>>(SOCIAL_COLLECTIONS.profiles, uid)
          : null;

      if (scope === 'user' && targetUserProfile && targetUserProfile.visibility === 'private') {
        throw new CommunityHttpError(
          403,
          'FOLLOW_NOT_ALLOWED',
          'امکان دنبال‌کردن پروفایل خصوصی وجود ندارد.',
        );
      }

      const wasFollowed = Boolean(existing);
      const shouldFollow =
        mode === 'follow' ? true : mode === 'unfollow' ? false : !wasFollowed;

      if (wasFollowed && !shouldFollow) {
        tx.delete(SOCIAL_COLLECTIONS.follows, followDocId);
        if (scope === 'user') {
          if (targetUserProfile) {
            tx.incrementNumeric(SOCIAL_COLLECTIONS.profiles, cleanTargetId, { followersCount: -1 });
          }
          if (followerUserProfile) {
            tx.incrementNumeric(SOCIAL_COLLECTIONS.profiles, uid, { followingCount: -1 });
          }
        }
        appendSocialActivity(tx, {
          eventType: 'social.follow.removed.v1',
          actorUid: uid,
          verifiedActorUid: uid,
          objectType: 'follow',
          objectId: followDocId,
          parentObjectId: cleanTargetId,
          followScope: scope,
          followTargetId: cleanTargetId,
          operationId,
          visibility: 'public',
          createdAtIso: nowIso,
        });
        const nextCount =
          scope === 'user' && targetUserProfile
            ? Math.max(0, Number(targetUserProfile.followersCount ?? 1) - 1)
            : 0;
        result = { isFollowed: false, followerCount: nextCount };
      } else if (!wasFollowed && shouldFollow) {
        tx.set(SOCIAL_COLLECTIONS.follows, followDocId, {
          scope,
          targetId: cleanTargetId,
          followerUid: uid,
          createdAtIso: nowIso,
        });
        if (scope === 'user') {
          if (targetUserProfile) {
            tx.incrementNumeric(SOCIAL_COLLECTIONS.profiles, cleanTargetId, { followersCount: 1 });
          }
          if (followerUserProfile) {
            tx.incrementNumeric(SOCIAL_COLLECTIONS.profiles, uid, { followingCount: 1 });
          }
        }
        appendSocialActivity(tx, {
          eventType: 'social.follow.created.v1',
          actorUid: uid,
          verifiedActorUid: uid,
          objectType: 'follow',
          objectId: followDocId,
          parentObjectId: cleanTargetId,
          followScope: scope,
          followTargetId: cleanTargetId,
          operationId,
          visibility: 'public',
          createdAtIso: nowIso,
        });
        const nextCount =
          scope === 'user' && targetUserProfile
            ? Math.max(0, Number(targetUserProfile.followersCount ?? 0)) + 1
            : 1;
        result = { isFollowed: true, followerCount: nextCount };
      } else {
        const noOpCount =
          scope === 'user' && targetUserProfile
            ? Math.max(0, Number(targetUserProfile.followersCount ?? 0))
            : wasFollowed
              ? 1
              : 0;
        result = { isFollowed: wasFollowed, followerCount: noOpCount };
      }
    }

    if (idemDocId) {
      tx.set(SOCIAL_COLLECTIONS.idempotency, idemDocId, {
        scope: 'follow',
        uid,
        targetId: cleanTargetId,
        payloadHash,
        result,
        createdAtIso: nowIso,
      });
    }
    return result;
  });
}
