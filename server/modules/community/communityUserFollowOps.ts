/** @file server/modules/community/communityUserFollowOps.ts — RT-SOCIAL-IMPL-009 User Follow Graph Integrity, Transactional Counters & Drift Audit */
import type { CommunityProfile } from '../../../src/features/community/types/community.types';
import { sanitizeInput } from '../../../src/utils/security';
import {
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
} from './communityFirestoreAdapter';
import {
  hashCommunityIdempotencyKey,
  hashCommunityPayload,
} from './communityRateLimiter';
import type { CommunityUnifiedRepository } from './communityUnifiedRepository';
import { buildUserFollowDocId } from './communityUserFollowAudit';
import { appendSocialActivity } from './socialActivityRepository';

export {
  auditUserFollowGraphConsistency,
  buildUserFollowDocId,
  type UserFollowConsistencyAuditReport,
} from './communityUserFollowAudit';

const USER_ID_PATTERN = /^[a-zA-Z0-9_.:-]{2,64}$/;

export interface UserFollowMutationResult {
  relationship: {
    isFollowing: boolean;
  };
  counts: {
    followersCount: number;
    followingCount: number;
  };
  isFollowed: boolean;
  followerCount: number;
  idempotentReplay: boolean;
}

export interface UserFollowStatusResult {
  relationship: {
    isFollowing: boolean;
  };
  counts: {
    followersCount: number;
    followingCount: number;
  };
}

export function validateFollowUserId(rawUid: unknown): string {
  if (typeof rawUid !== 'string') {
    throw new CommunityHttpError(400, 'INVALID_USER_ID', 'شناسه کاربر باید رشته معتبر باشد.');
  }
  const trimmed = rawUid.trim();
  if (!trimmed || !USER_ID_PATTERN.test(trimmed)) {
    throw new CommunityHttpError(400, 'INVALID_USER_ID', 'شناسه کاربر واردشده نامعتبر است.');
  }
  return trimmed;
}

export async function followUserOp(
  repo: CommunityUnifiedRepository,
  followerUid: string,
  targetUid: string,
  options?: {
    idempotencyKey?: string;
    isViewerVerifiedMember?: boolean;
  },
): Promise<UserFollowMutationResult> {
  const cleanFollowerUid = validateFollowUserId(followerUid);
  const cleanTargetUid = validateFollowUserId(targetUid);
  if (cleanFollowerUid === cleanTargetUid) {
    throw new CommunityHttpError(
      422,
      'SELF_FOLLOW_NOT_ALLOWED',
      'کاربر نمی‌تواند حساب کاربری خودش را دنبال کند.',
    );
  }

  await repo.enforceRateLimit('follow', cleanFollowerUid);
  await repo.getOrCreateProfile({ uid: cleanFollowerUid, emailVerified: true });

  const isViewerVerifiedMember = options?.isViewerVerifiedMember !== false;
  const rawIdemKey =
    typeof options?.idempotencyKey === 'string' && options.idempotencyKey.trim()
      ? sanitizeInput(options.idempotencyKey.trim(), 80)
      : '';
  const idemDocId = rawIdemKey
    ? hashCommunityIdempotencyKey(cleanFollowerUid, 'follow_user', rawIdemKey)
    : null;
  const payloadHash = hashCommunityPayload({
    action: 'follow_user',
    followerUid: cleanFollowerUid,
    targetUid: cleanTargetUid,
  });
  const followId = buildUserFollowDocId(cleanTargetUid, cleanFollowerUid);
  const operationId =
    idemDocId || `op_uf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return repo.getStore().runTransaction(async (tx) => {
    // All reads must execute before any writes in Firestore transactions
    const [targetProfile, followerProfile, existingFollow, existingIdem] = await Promise.all([
      tx.get<CommunityProfile & Record<string, unknown>>(SOCIAL_COLLECTIONS.profiles, cleanTargetUid),
      tx.get<CommunityProfile & Record<string, unknown>>(SOCIAL_COLLECTIONS.profiles, cleanFollowerUid),
      tx.get<Record<string, unknown>>(SOCIAL_COLLECTIONS.follows, followId),
      idemDocId
        ? tx.get<{ payloadHash: string; targetId?: string } & Record<string, unknown>>(
            SOCIAL_COLLECTIONS.idempotency,
            idemDocId,
          )
        : Promise.resolve(null),
    ]);

    if (existingIdem && existingIdem.payloadHash !== payloadHash) {
      throw new CommunityHttpError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'کلید یکتای دنبال‌کردن با کاربر مقصد متفاوتی ارسال شده است.',
      );
    }

    if (!targetProfile) {
      throw new CommunityHttpError(404, 'USER_NOT_FOUND', 'کاربر مقصد یافت نشد.');
    }

    if (targetProfile.visibility === 'private') {
      throw new CommunityHttpError(
        403,
        'FOLLOW_NOT_ALLOWED',
        'امکان دنبال‌کردن پروفایل خصوصی وجود ندارد.',
      );
    }
    if (targetProfile.visibility === 'members_only' && !isViewerVerifiedMember) {
      throw new CommunityHttpError(
        403,
        'FOLLOW_NOT_ALLOWED',
        'دنبال‌کردن این کاربر فقط برای اعضای احرازشده مجاز است.',
      );
    }

    const currentTargetFollowers = Math.max(0, Number(targetProfile.followersCount ?? 0));
    const currentFollowerFollowing = Math.max(0, Number(followerProfile?.followingCount ?? 0));
    const nowIso = new Date().toISOString();

    if (existingFollow) {
      const replayResult: UserFollowMutationResult = {
        relationship: { isFollowing: true },
        counts: {
          followersCount: currentTargetFollowers,
          followingCount: currentFollowerFollowing,
        },
        isFollowed: true,
        followerCount: currentTargetFollowers,
        idempotentReplay: true,
      };
      if (idemDocId && !existingIdem) {
        tx.set(SOCIAL_COLLECTIONS.idempotency, idemDocId, {
          scope: 'follow_user',
          uid: cleanFollowerUid,
          targetId: cleanTargetUid,
          payloadHash,
          createdAtIso: nowIso,
        });
      }
      return replayResult;
    }

    tx.set(SOCIAL_COLLECTIONS.follows, followId, {
      scope: 'user',
      targetId: cleanTargetUid,
      followerUid: cleanFollowerUid,
      createdAtIso: nowIso,
    });
    tx.incrementNumeric(SOCIAL_COLLECTIONS.profiles, cleanTargetUid, { followersCount: 1 });
    if (followerProfile) {
      tx.incrementNumeric(SOCIAL_COLLECTIONS.profiles, cleanFollowerUid, { followingCount: 1 });
    }

    appendSocialActivity(tx, {
      eventType: 'social.follow.created.v1',
      actorUid: cleanFollowerUid,
      verifiedActorUid: cleanFollowerUid,
      objectType: 'follow',
      objectId: followId,
      parentObjectId: cleanTargetUid,
      followScope: 'user',
      followTargetId: cleanTargetUid,
      operationId,
      visibility: 'public',
      createdAtIso: nowIso,
    });

    const nextTargetFollowers = currentTargetFollowers + 1;
    const nextFollowerFollowing = currentFollowerFollowing + 1;

    if (idemDocId) {
      tx.set(SOCIAL_COLLECTIONS.idempotency, idemDocId, {
        scope: 'follow_user',
        uid: cleanFollowerUid,
        targetId: cleanTargetUid,
        payloadHash,
        createdAtIso: nowIso,
      });
    }

    return {
      relationship: { isFollowing: true },
      counts: {
        followersCount: nextTargetFollowers,
        followingCount: nextFollowerFollowing,
      },
      isFollowed: true,
      followerCount: nextTargetFollowers,
      idempotentReplay: false,
    };
  });
}

export async function unfollowUserOp(
  repo: CommunityUnifiedRepository,
  followerUid: string,
  targetUid: string,
  options?: {
    idempotencyKey?: string;
  },
): Promise<UserFollowMutationResult> {
  const cleanFollowerUid = validateFollowUserId(followerUid);
  const cleanTargetUid = validateFollowUserId(targetUid);
  if (cleanFollowerUid === cleanTargetUid) {
    throw new CommunityHttpError(
      422,
      'SELF_FOLLOW_NOT_ALLOWED',
      'کاربر نمی‌تواند حساب کاربری خودش را لغو دنبال‌کردن کند.',
    );
  }

  await repo.enforceRateLimit('follow', cleanFollowerUid);

  const rawIdemKey =
    typeof options?.idempotencyKey === 'string' && options.idempotencyKey.trim()
      ? sanitizeInput(options.idempotencyKey.trim(), 80)
      : '';
  const idemDocId = rawIdemKey
    ? hashCommunityIdempotencyKey(cleanFollowerUid, 'unfollow_user', rawIdemKey)
    : null;
  const payloadHash = hashCommunityPayload({
    action: 'unfollow_user',
    followerUid: cleanFollowerUid,
    targetUid: cleanTargetUid,
  });
  const followId = buildUserFollowDocId(cleanTargetUid, cleanFollowerUid);
  const operationId =
    idemDocId || `op_uuf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return repo.getStore().runTransaction(async (tx) => {
    const [targetProfile, followerProfile, existingFollow, existingIdem] = await Promise.all([
      tx.get<CommunityProfile & Record<string, unknown>>(SOCIAL_COLLECTIONS.profiles, cleanTargetUid),
      tx.get<CommunityProfile & Record<string, unknown>>(SOCIAL_COLLECTIONS.profiles, cleanFollowerUid),
      tx.get<Record<string, unknown>>(SOCIAL_COLLECTIONS.follows, followId),
      idemDocId
        ? tx.get<{ payloadHash: string } & Record<string, unknown>>(
            SOCIAL_COLLECTIONS.idempotency,
            idemDocId,
          )
        : Promise.resolve(null),
    ]);

    if (existingIdem && existingIdem.payloadHash !== payloadHash) {
      throw new CommunityHttpError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'کلید یکتای لغو دنبال‌کردن با کاربر مقصد متفاوتی ارسال شده است.',
      );
    }

    if (!targetProfile) {
      throw new CommunityHttpError(404, 'USER_NOT_FOUND', 'کاربر مقصد یافت نشد.');
    }

    const currentTargetFollowers = Math.max(0, Number(targetProfile.followersCount ?? 0));
    const currentFollowerFollowing = Math.max(0, Number(followerProfile?.followingCount ?? 0));
    const nowIso = new Date().toISOString();

    if (!existingFollow) {
      if (idemDocId && !existingIdem) {
        tx.set(SOCIAL_COLLECTIONS.idempotency, idemDocId, {
          scope: 'unfollow_user',
          uid: cleanFollowerUid,
          targetId: cleanTargetUid,
          payloadHash,
          createdAtIso: nowIso,
        });
      }
      return {
        relationship: { isFollowing: false },
        counts: {
          followersCount: currentTargetFollowers,
          followingCount: currentFollowerFollowing,
        },
        isFollowed: false,
        followerCount: currentTargetFollowers,
        idempotentReplay: true,
      };
    }

    tx.delete(SOCIAL_COLLECTIONS.follows, followId);
    tx.incrementNumeric(SOCIAL_COLLECTIONS.profiles, cleanTargetUid, { followersCount: -1 });
    if (followerProfile) {
      tx.incrementNumeric(SOCIAL_COLLECTIONS.profiles, cleanFollowerUid, { followingCount: -1 });
    }

    appendSocialActivity(tx, {
      eventType: 'social.follow.removed.v1',
      actorUid: cleanFollowerUid,
      verifiedActorUid: cleanFollowerUid,
      objectType: 'follow',
      objectId: followId,
      parentObjectId: cleanTargetUid,
      followScope: 'user',
      followTargetId: cleanTargetUid,
      operationId,
      visibility: 'public',
      createdAtIso: nowIso,
    });

    if (idemDocId) {
      tx.set(SOCIAL_COLLECTIONS.idempotency, idemDocId, {
        scope: 'unfollow_user',
        uid: cleanFollowerUid,
        targetId: cleanTargetUid,
        payloadHash,
        createdAtIso: nowIso,
      });
    }

    const nextTargetFollowers = Math.max(0, currentTargetFollowers - 1);
    const nextFollowerFollowing = Math.max(0, currentFollowerFollowing - 1);

    return {
      relationship: { isFollowing: false },
      counts: {
        followersCount: nextTargetFollowers,
        followingCount: nextFollowerFollowing,
      },
      isFollowed: false,
      followerCount: nextTargetFollowers,
      idempotentReplay: false,
    };
  });
}

export async function getUserFollowStatus(
  repo: CommunityUnifiedRepository,
  viewerUid: string | null | undefined,
  targetUid: string,
  options?: { isViewerVerifiedMember?: boolean },
): Promise<UserFollowStatusResult> {
  const cleanTargetUid = validateFollowUserId(targetUid);
  const cleanViewerUid =
    viewerUid && typeof viewerUid === 'string' && viewerUid.trim()
      ? validateFollowUserId(viewerUid)
      : null;

  const store = repo.getStore();
  const targetProfile = await store.getDoc<CommunityProfile & Record<string, unknown>>(
    SOCIAL_COLLECTIONS.profiles,
    cleanTargetUid,
  );
  if (!targetProfile) {
    throw new CommunityHttpError(404, 'USER_NOT_FOUND', 'کاربر مقصد یافت نشد.');
  }

  const isSelf = Boolean(cleanViewerUid && cleanViewerUid === cleanTargetUid);
  const isViewerVerifiedMember =
    options?.isViewerVerifiedMember ?? Boolean(cleanViewerUid);

  if (targetProfile.visibility === 'private' && !isSelf) {
    throw new CommunityHttpError(
      403,
      'FOLLOW_NOT_ALLOWED',
      'دسترسی به اطلاعات رابطه این پروفایل خصوصی مجاز نیست.',
    );
  }
  if (targetProfile.visibility === 'members_only' && !isViewerVerifiedMember && !isSelf) {
    throw new CommunityHttpError(
      403,
      'FOLLOW_NOT_ALLOWED',
      'دسترسی به اطلاعات این پروفایل فقط برای اعضای واردشده مجاز است.',
    );
  }

  let isFollowing = false;
  if (cleanViewerUid && !isSelf) {
    const followId = buildUserFollowDocId(cleanTargetUid, cleanViewerUid);
    const followDoc = await store.getDoc(SOCIAL_COLLECTIONS.follows, followId);
    isFollowing = Boolean(followDoc);
  }

  return {
    relationship: { isFollowing },
    counts: {
      followersCount: Math.max(0, Number(targetProfile.followersCount ?? 0)),
      followingCount: Math.max(0, Number(targetProfile.followingCount ?? 0)),
    },
  };
}
