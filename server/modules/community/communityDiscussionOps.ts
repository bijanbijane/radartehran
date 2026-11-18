/** @file server/modules/community/communityDiscussionOps.ts — Transactional Discussion Creation, Update, Soft-Delete & Comment Ops */
import {
  resolveReplyDepth,
  validateCommunityTextSafety,
} from '../../../src/features/community/services/communityTrustService';
import type {
  CommunityDiscussionPost,
  SocialContentContext,
} from '../../../src/features/community/types/community.types';
import { sanitizeInput } from '../../../src/utils/security';
import { appendSocialOutboxEvent } from '../notifications/socialOutboxWorker';
import {
  markSocialFeedProjectionHiddenInTx,
  upsertSocialFeedProjectionInTx,
} from '../search/socialFeedProjection';
import { CommunityHttpError, SOCIAL_COLLECTIONS } from './communityFirestoreAdapter';
import {
  hashCommunityIdempotencyKey,
  hashCommunityPayload,
} from './communityRateLimiter';
import type { UnifiedSocialPostDoc } from './communityUnifiedQueries';
import type {
  CommunityUnifiedRepository,
  VerifiedActorIdentity,
} from './communityUnifiedRepository';
import {
  canonicalizeSocialContentContextForHash,
  resolveOrBuildFallbackNeighborhoodContext,
} from './communityValidation';
import { appendSocialActivity } from './socialActivityRepository';

export async function createDiscussionOp(
  repo: CommunityUnifiedRepository,
  actor: VerifiedActorIdentity,
  input: {
    titleFa: string;
    bodyFa: string;
    neighborhoodId?: number;
    neighborhoodNameFa?: string;
    topicId?: string;
    track?: string;
    socialContext?: SocialContentContext;
    idempotencyKey?: string;
  },
): Promise<{ item: CommunityDiscussionPost; idempotentReplay: boolean }> {
  await repo.enforceRateLimit('create_post', actor.uid);
  const titleFa = sanitizeInput(input.titleFa || '', 120);
  const bodyFa = sanitizeInput(input.bodyFa || '', 500);
  const safety = validateCommunityTextSafety(bodyFa);
  if (titleFa.length < 5 || !safety.ok) {
    throw new CommunityHttpError(
      422,
      'INVALID_DISCUSSION_BODY',
      safety.errorFa || 'عنوان باید حداقل ۵ کاراکتر باشد.',
    );
  }

  const store = repo.getStore();
  const validatedContext = await resolveOrBuildFallbackNeighborhoodContext(
    input.socialContext,
    input.neighborhoodId ?? 1,
    { store },
  );
  const profile = await repo.getOrCreateProfile(actor);
  const authorProfile = {
    userId: actor.uid,
    username: profile.username,
    displayNameFa: profile.displayNameFa,
    isAuthenticated: true,
    isEmailVerified: Boolean(actor.emailVerified || profile.isEmailVerified),
    isPhoneVerified: Boolean(actor.phoneVerified || profile.isPhoneVerified),
    identityStatus: profile.identityStatus,
    participationScore: profile.reputation.data + profile.reputation.community,
    participationTierFa: 'مشارکت‌کننده جدید' as const,
    verifiedCredentialFa: profile.verifiedCredentialFa,
    reputation: profile.reputation,
  };

  const payloadHash = hashCommunityPayload({
    titleFa,
    bodyFa,
    neighborhoodId: input.neighborhoodId || 1,
    topicId: input.topicId || 'topic-neighborhoods',
    socialContext: canonicalizeSocialContentContextForHash(validatedContext),
  });
  const rawIdemKey =
    typeof input.idempotencyKey === 'string' ? sanitizeInput(input.idempotencyKey, 80) : '';
  const idemDocId = rawIdemKey
    ? hashCommunityIdempotencyKey(actor.uid, 'create_post', rawIdemKey)
    : null;
  const preGeneratedId = `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  return store.runTransaction(async (tx) => {
    if (idemDocId) {
      const existingIdem = await tx.get<
        { targetId: string; payloadHash: string } & Record<string, unknown>
      >(SOCIAL_COLLECTIONS.idempotency, idemDocId);
      if (existingIdem) {
        if (existingIdem.payloadHash !== payloadHash) {
          throw new CommunityHttpError(
            409,
            'IDEMPOTENCY_KEY_CONFLICT',
            'کلید یکتای تکراری با محتوای متفاوت ارسال شده است.',
          );
        }
        const existingPost = await tx.get<CommunityDiscussionPost & UnifiedSocialPostDoc>(
          SOCIAL_COLLECTIONS.posts,
          existingIdem.targetId,
        );
        if (existingPost) return { item: existingPost, idempotentReplay: true };
      }
    }

    const id = preGeneratedId;
    const nowIso = new Date().toISOString();
    const post: CommunityDiscussionPost & UnifiedSocialPostDoc = {
      id,
      recordKind: 'discussion',
      track: input.track === 'expert_qa' ? 'expert_qa' : 'social_discussion',
      neighborhoodId: Number(input.neighborhoodId) || 1,
      neighborhoodNameFa: sanitizeInput(input.neighborhoodNameFa || 'پونک', 50),
      topicId: sanitizeInput(input.topicId || 'topic-neighborhoods', 50),
      ...(validatedContext ? { socialContext: validatedContext } : {}),
      titleFa,
      bodyFa,
      ownerUserId: actor.uid,
      authorProfile,
      helpfulCount: 0,
      helpfulVoterIds: [],
      reactionCounts: { helpful: 0, agree: 0, needs_source: 0, disagree: 0 },
      reactionsByUser: {},
      replies: [],
      replyCount: 0,
      followerIds: [actor.uid],
      followerCount: 1,
      revisionHistory: [],
      status: 'published',
      moderationStatus: 'approved',
      isDeleted: false,
      version: 1,
      source: 'user',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      createdAtFa: 'امروز',
    };
    tx.set(SOCIAL_COLLECTIONS.posts, id, post as unknown as Record<string, unknown>);
    upsertSocialFeedProjectionInTx(tx, post as unknown as Record<string, unknown>, nowIso);
    appendSocialActivity(tx, {
      eventType: 'content.created',
      actorUid: actor.uid,
      verifiedActorUid: actor.uid,
      objectType: 'discussion',
      objectId: id,
      socialContext: validatedContext,
      visibility: 'public',
      createdAtIso: nowIso,
    });
    appendSocialOutboxEvent(tx, {
      eventId: id,
      eventType: 'social.post.created.v1',
      targetId: id,
      actorUid: actor.uid,
      recipientUids: [],
      payloadSummaryFa: `گفتگوی جدید در محله ${post.neighborhoodNameFa}`,
    });
    if (idemDocId) {
      tx.set(SOCIAL_COLLECTIONS.idempotency, idemDocId, {
        scope: 'create_post',
        uid: actor.uid,
        targetId: id,
        payloadHash,
        createdAtIso: nowIso,
      });
    }
    return { item: post, idempotentReplay: false };
  });
}

export async function updateDiscussionOp(
  repo: CommunityUnifiedRepository,
  uid: string,
  postId: string,
  input: { titleFa: string; bodyFa: string; reasonFa?: string },
): Promise<CommunityDiscussionPost> {
  await repo.enforceRateLimit('edit_post', uid);
  const titleFa = sanitizeInput(input.titleFa || '', 120);
  const bodyFa = sanitizeInput(input.bodyFa || '', 500);
  const safety = validateCommunityTextSafety(bodyFa);
  if (titleFa.length < 5 || !safety.ok) {
    throw new CommunityHttpError(
      422,
      'INVALID_DISCUSSION_BODY',
      safety.errorFa || 'عنوان باید حداقل ۵ کاراکتر باشد.',
    );
  }

  return repo.getStore().runTransaction(async (tx) => {
    const post = await tx.get<CommunityDiscussionPost & UnifiedSocialPostDoc>(
      SOCIAL_COLLECTIONS.posts,
      postId,
    );
    if (!post || post.isDeleted) {
      throw new CommunityHttpError(404, 'DISCUSSION_NOT_FOUND', 'مطلب موردنظر یافت نشد.');
    }
    if (post.ownerUserId !== uid) {
      throw new CommunityHttpError(403, 'OWNER_MISMATCH', 'شما مجاز به ویرایش این مطلب نیستید.');
    }
    if (post.status === 'locked' || post.status === 'archived') {
      throw new CommunityHttpError(409, 'DISCUSSION_LOCKED', 'این گفتگو قفل یا بایگانی شده است.');
    }

    const history = [...(post.revisionHistory ?? [])];
    history.push({
      version: history.length + 1,
      titleFa: post.titleFa,
      bodyFa: post.bodyFa,
      editedAtFa: 'امروز',
      reasonFa: sanitizeInput(input.reasonFa || 'ویرایش توسط نویسنده', 80),
    });
    const nowIso = new Date().toISOString();
    const updated: CommunityDiscussionPost & UnifiedSocialPostDoc = {
      ...post,
      titleFa,
      bodyFa,
      revisionHistory: history,
      version: Number(post.version ?? 1) + 1,
      updatedAtIso: nowIso,
    };
    tx.set(SOCIAL_COLLECTIONS.posts, postId, updated as unknown as Record<string, unknown>);
    upsertSocialFeedProjectionInTx(tx, updated as unknown as Record<string, unknown>, nowIso);
    return updated;
  });
}

export async function softDeleteDiscussionOp(
  repo: CommunityUnifiedRepository,
  uid: string,
  postId: string,
  isAdmin = false,
): Promise<{ deleted: true; id: string }> {
  return repo.getStore().runTransaction(async (tx) => {
    const post = await tx.get<UnifiedSocialPostDoc>(SOCIAL_COLLECTIONS.posts, postId);
    if (!post || post.isDeleted) {
      throw new CommunityHttpError(404, 'DISCUSSION_NOT_FOUND', 'مطلب موردنظر یافت نشد.');
    }
    if (post.ownerUserId !== uid && !isAdmin) {
      throw new CommunityHttpError(403, 'OWNER_MISMATCH', 'حذف فقط توسط نویسنده یا مدیر مجاز است.');
    }
    const nowIso = new Date().toISOString();
    tx.update(SOCIAL_COLLECTIONS.posts, postId, {
      isDeleted: true,
      deletedAtIso: nowIso,
      status: 'hidden',
      moderationStatus: 'removed',
      updatedAtIso: nowIso,
    });
    markSocialFeedProjectionHiddenInTx(tx, postId, post, nowIso);
    return { deleted: true, id: postId };
  });
}

export async function addDiscussionCommentOp(
  repo: CommunityUnifiedRepository,
  actor: VerifiedActorIdentity,
  postId: string,
  input: { bodyFa: string; parentReplyId?: string | null; idempotencyKey?: string },
): Promise<CommunityDiscussionPost> {
  await repo.enforceRateLimit('create_comment', actor.uid);
  const safety = validateCommunityTextSafety(input.bodyFa || '');
  if (!safety.ok) {
    throw new CommunityHttpError(422, 'INVALID_TEXT', safety.errorFa || 'متن دیدگاه معتبر نیست.');
  }
  const profile = await repo.getOrCreateProfile(actor);

  const payloadHash = hashCommunityPayload({
    postId,
    bodyFa: input.bodyFa,
    parentReplyId: input.parentReplyId || null,
  });
  const rawIdemKey =
    typeof input.idempotencyKey === 'string' ? sanitizeInput(input.idempotencyKey, 80) : '';
  const idemDocId = rawIdemKey
    ? hashCommunityIdempotencyKey(actor.uid, 'create_comment', rawIdemKey)
    : null;
  const preGeneratedCommentId = `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  return repo.getStore().runTransaction(async (tx) => {
    const post = await tx.get<CommunityDiscussionPost & UnifiedSocialPostDoc>(
      SOCIAL_COLLECTIONS.posts,
      postId,
    );
    if (!post || post.isDeleted) {
      throw new CommunityHttpError(404, 'DISCUSSION_NOT_FOUND', 'مطلب یافت نشد.');
    }
    if (post.status === 'locked' || post.status === 'archived') {
      throw new CommunityHttpError(
        409,
        'DISCUSSION_LOCKED',
        'امکان ثبت نظر روی گفتگوی قفل‌شده وجود ندارد.',
      );
    }

    if (idemDocId) {
      const existingIdem = await tx.get<
        { targetId: string; payloadHash: string } & Record<string, unknown>
      >(SOCIAL_COLLECTIONS.idempotency, idemDocId);
      if (existingIdem) {
        if (existingIdem.payloadHash !== payloadHash) {
          throw new CommunityHttpError(
            409,
            'IDEMPOTENCY_KEY_CONFLICT',
            'کلید یکتای دیدگاه با متن متفاوت تکرار شده است.',
          );
        }
        return post;
      }
    }

    const depth = resolveReplyDepth(post.replies ?? [], input.parentReplyId ?? null);
    if (!depth.ok) {
      throw new CommunityHttpError(
        422,
        'MAX_REPLY_DEPTH_EXCEEDED',
        depth.errorFa || 'حداکثر عمق پاسخ رعایت نشده است.',
      );
    }

    const commentId = preGeneratedCommentId;
    const nowIso = new Date().toISOString();
    const commentObj = {
      id: commentId,
      parentReplyId: input.parentReplyId ?? null,
      depth: depth.depth,
      ownerUserId: actor.uid,
      authorProfile: {
        userId: actor.uid,
        username: profile.username,
        displayNameFa: profile.displayNameFa,
        isAuthenticated: true,
        isEmailVerified: Boolean(actor.emailVerified || profile.isEmailVerified),
        isPhoneVerified: Boolean(actor.phoneVerified || profile.isPhoneVerified),
        identityStatus: profile.identityStatus,
        participationScore: profile.reputation.data + profile.reputation.community,
        participationTierFa: 'مشارکت‌کننده جدید' as const,
        verifiedCredentialFa: profile.verifiedCredentialFa,
        reputation: profile.reputation,
      },
      bodyFa: sanitizeInput(input.bodyFa, 400),
      createdAtFa: 'امروز',
      reactionCounts: { helpful: 0, agree: 0, needs_source: 0, disagree: 0 },
      reactionsByUser: {},
      status: 'visible' as const,
    };

    tx.set(SOCIAL_COLLECTIONS.comments, commentId, {
      ...commentObj,
      postId,
      recordKind: 'reply',
      isDeleted: false,
      createdAtIso: nowIso,
    });

    const nextReplies = [...(post.replies ?? []), commentObj];
    const nextReplyCount = Number(post.replyCount ?? post.replies?.length ?? 0) + 1;
    tx.update(SOCIAL_COLLECTIONS.posts, postId, { replies: nextReplies, updatedAtIso: nowIso });
    tx.incrementNumeric(SOCIAL_COLLECTIONS.posts, postId, { replyCount: 1 });
    upsertSocialFeedProjectionInTx(
      tx,
      {
        ...(post as unknown as Record<string, unknown>),
        replies: nextReplies,
        replyCount: nextReplyCount,
        updatedAtIso: nowIso,
      },
      nowIso,
    );

    appendSocialActivity(tx, {
      eventType: 'comment.created',
      actorUid: actor.uid,
      verifiedActorUid: actor.uid,
      objectType: 'comment',
      objectId: commentId,
      parentObjectId: postId,
      socialContext: post.socialContext,
      visibility: 'public',
      createdAtIso: nowIso,
    });
    appendSocialOutboxEvent(tx, {
      eventId: commentId,
      eventType: 'social.comment.created.v1',
      targetId: postId,
      actorUid: actor.uid,
      recipientUids: post.ownerUserId ? [post.ownerUserId] : [],
      payloadSummaryFa: 'دیدگاه جدید روی گفتگوی شما در انجمن',
    });

    if (idemDocId) {
      tx.set(SOCIAL_COLLECTIONS.idempotency, idemDocId, {
        scope: 'create_comment',
        uid: actor.uid,
        targetId: commentId,
        payloadHash,
        createdAtIso: nowIso,
      });
    }
    return { ...post, replies: nextReplies, replyCount: nextReplyCount };
  });
}
