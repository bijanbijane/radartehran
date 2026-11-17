/** @file server/modules/community/communityUnifiedRepository.ts — Single Transactional Firestore Source of Truth for Community (Stage 3) */
import type {
  CommunityAbuseReason,
  CommunityDiscussionPost,
  CommunityProfile,
  CommunityQuestionItem,
  DataCorrectionCategory,
  DataCorrectionProposal,
  ModerationActionRecord,
  ModerationAppeal,
  ReactionType,
  ResearchTopicProposal,
} from '../../../src/features/community/types/community.types';
import {
  resolveReplyDepth,
  validateCommunityTextSafety,
} from '../../../src/features/community/services/communityTrustService';
import { sanitizeInput } from '../../../src/utils/security';
import {
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
  createDefaultCommunityDatabaseStore,
  type CommunityDatabaseStore,
} from './communityFirestoreAdapter';
import {
  CommunityRateLimiter,
  hashCommunityIdempotencyKey,
  hashCommunityPayload,
  type CommunityActionBucket,
} from './communityRateLimiter';
import { runNonDestructiveCommunityImport } from './communitySeedImporter';
import { stripSensitiveMemberProfileServerSide } from './communityValidation';
import type { UnifiedSocialPostDoc } from './communityUnifiedQueries';

export interface VerifiedActorIdentity {
  uid: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  displayNameFa?: string;
}

export class CommunityUnifiedRepository {
  private seededOnBoot = false;

  constructor(
    private store: CommunityDatabaseStore = createDefaultCommunityDatabaseStore(),
    public readonly rateLimiter: CommunityRateLimiter = new CommunityRateLimiter(),
  ) {}

  public getStore(): CommunityDatabaseStore {
    return this.store;
  }

  public setStore(nextStore: CommunityDatabaseStore): void {
    this.store = nextStore;
    this.seededOnBoot = false;
  }

  public async ensureSeedsBootstrappedIfEmpty(): Promise<void> {
    if (this.seededOnBoot) return;
    if (this.store.backendKind === 'mock_firestore') {
      const first = await this.store.queryDocs(SOCIAL_COLLECTIONS.posts, { limit: 1 });
      if (first.items.length === 0) {
        await runNonDestructiveCommunityImport(this.store, { dryRun: false });
      }
      this.seededOnBoot = true;
    } else {
      this.seededOnBoot = true;
    }
  }

  public enforceRateLimit(bucket: CommunityActionBucket, actorKey: string): void {
    const res = this.rateLimiter.checkAndConsume(bucket, actorKey);
    if (!res.allowed) {
      throw new CommunityHttpError(429, 'RATE_LIMIT_EXCEEDED', 'تعداد درخواست‌های شما از حد مجاز فراتر رفته است.', {
        retryAfterSec: res.retryAfterSec,
        limit: res.limit,
      });
    }
  }

  public async getOrCreateProfile(actor: VerifiedActorIdentity): Promise<CommunityProfile> {
    const existing = await this.store.getDoc<CommunityProfile & Record<string, unknown>>(SOCIAL_COLLECTIONS.profiles, actor.uid);
    if (existing) {
      let dirty = false;
      const patch: Partial<CommunityProfile> = {};
      if (actor.displayNameFa && (!existing.displayNameFa || existing.displayNameFa === 'کاربر عضو رادار')) {
        patch.displayNameFa = sanitizeInput(actor.displayNameFa, 50) || existing.displayNameFa;
        dirty = true;
      }
      if (actor.emailVerified && !existing.isEmailVerified) { patch.isEmailVerified = true; dirty = true; }
      if (actor.phoneVerified && !existing.isPhoneVerified) { patch.isPhoneVerified = true; dirty = true; }
      if (dirty) await this.store.setDoc(SOCIAL_COLLECTIONS.profiles, actor.uid, { ...existing, ...patch }, true);
      return { ...existing, ...patch };
    }

    const safeUid = sanitizeInput(actor.uid, 64);
    const username = `u_${safeUid.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 12) || 'member'}`;
    const created: CommunityProfile = {
      userId: safeUid,
      username,
      displayNameFa: sanitizeInput(actor.displayNameFa || 'کاربر عضو رادار', 50) || 'کاربر عضو رادار',
      bioFa: '',
      visibility: 'public',
      showBadges: true,
      showContributions: true,
      showFollowedTopics: true,
      identityStatus: actor.phoneVerified ? 'verified_phone' : actor.emailVerified ? 'verified_email' : 'authenticated',
      isAuthenticated: true,
      isEmailVerified: Boolean(actor.emailVerified),
      isPhoneVerified: Boolean(actor.phoneVerified),
      reputation: { data: 0, community: 0, research: 0, sources: 0, professional: 0 },
      badges: [],
      followedTopicIds: [],
      memberSinceFa: 'امروز',
      recentPublicSummaryFa: [],
      verifiedCredentialFa: null,
      isSeed: false,
    };
    await this.store.setDoc(SOCIAL_COLLECTIONS.profiles, safeUid, created as unknown as Record<string, unknown>);
    return created;
  }

  public async updateProfilePrivacy(
    uid: string,
    privacy: Partial<Pick<CommunityProfile, 'visibility' | 'showBadges' | 'showContributions' | 'showFollowedTopics' | 'bioFa' | 'displayNameFa'>>,
  ): Promise<CommunityProfile> {
    const profile = await this.getOrCreateProfile({ uid, emailVerified: true });
    if (privacy.visibility === 'public' || privacy.visibility === 'members_only' || privacy.visibility === 'private') {
      profile.visibility = privacy.visibility;
    }
    if (typeof privacy.showBadges === 'boolean') profile.showBadges = privacy.showBadges;
    if (typeof privacy.showContributions === 'boolean') profile.showContributions = privacy.showContributions;
    if (typeof privacy.showFollowedTopics === 'boolean') profile.showFollowedTopics = privacy.showFollowedTopics;
    if (typeof privacy.bioFa === 'string') profile.bioFa = sanitizeInput(privacy.bioFa, 240);
    if (typeof privacy.displayNameFa === 'string' && privacy.displayNameFa.trim().length >= 2) {
      profile.displayNameFa = sanitizeInput(privacy.displayNameFa, 60);
    }
    await this.store.setDoc(SOCIAL_COLLECTIONS.profiles, uid, profile as unknown as Record<string, unknown>, true);
    return profile;
  }

  public async getPublicProfileByUsername(username: string, isViewerMember: boolean, viewerUid?: string): Promise<CommunityProfile | null> {
    const clean = sanitizeInput(username, 40).toLowerCase();
    const page = await this.store.queryDocs<CommunityProfile & Record<string, unknown>>(SOCIAL_COLLECTIONS.profiles, { limit: 50 });
    const matched = page.items.find((p) => String(p.username || '').toLowerCase() === clean);
    if (!matched) return null;
    return stripSensitiveMemberProfileServerSide(matched, isViewerMember, viewerUid === matched.userId);
  }

  public async createDiscussion(
    actor: VerifiedActorIdentity,
    input: { titleFa: string; bodyFa: string; neighborhoodId?: number; neighborhoodNameFa?: string; topicId?: string; track?: string; idempotencyKey?: string },
  ): Promise<{ item: CommunityDiscussionPost; idempotentReplay: boolean }> {
    this.enforceRateLimit('create_post', actor.uid);
    const titleFa = sanitizeInput(input.titleFa || '', 120);
    const bodyFa = sanitizeInput(input.bodyFa || '', 500);
    const safety = validateCommunityTextSafety(bodyFa);
    if (titleFa.length < 5 || !safety.ok) {
      throw new CommunityHttpError(422, 'INVALID_DISCUSSION_BODY', safety.errorFa || 'عنوان باید حداقل ۵ کاراکتر باشد.');
    }

    const profile = await this.getOrCreateProfile(actor);
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

    const payloadHash = hashCommunityPayload({ titleFa, bodyFa, neighborhoodId: input.neighborhoodId || 1, topicId: input.topicId || 'topic-neighborhoods' });
    const rawIdemKey = typeof input.idempotencyKey === 'string' ? sanitizeInput(input.idempotencyKey, 80) : '';
    const idemDocId = rawIdemKey ? hashCommunityIdempotencyKey(actor.uid, 'create_post', rawIdemKey) : null;

    return this.store.runTransaction(async (tx) => {
      if (idemDocId) {
        const existingIdem = await tx.get<{ targetId: string; payloadHash: string } & Record<string, unknown>>(SOCIAL_COLLECTIONS.idempotency, idemDocId);
        if (existingIdem) {
          if (existingIdem.payloadHash !== payloadHash) {
            throw new CommunityHttpError(409, 'IDEMPOTENCY_KEY_CONFLICT', 'کلید یکتای تکراری با محتوای متفاوت ارسال شده است.');
          }
          const existingPost = await tx.get<CommunityDiscussionPost & UnifiedSocialPostDoc>(SOCIAL_COLLECTIONS.posts, existingIdem.targetId);
          if (existingPost) return { item: existingPost, idempotentReplay: true };
        }
      }

      const id = `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const nowIso = new Date().toISOString();
      const post: CommunityDiscussionPost & UnifiedSocialPostDoc = {
        id,
        recordKind: 'discussion',
        track: input.track === 'expert_qa' ? 'expert_qa' : 'social_discussion',
        neighborhoodId: Number(input.neighborhoodId) || 1,
        neighborhoodNameFa: sanitizeInput(input.neighborhoodNameFa || 'پونک', 50),
        topicId: sanitizeInput(input.topicId || 'topic-neighborhoods', 50),
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

  public async updateDiscussion(
    uid: string,
    postId: string,
    input: { titleFa: string; bodyFa: string; reasonFa?: string },
  ): Promise<CommunityDiscussionPost> {
    this.enforceRateLimit('edit_post', uid);
    const titleFa = sanitizeInput(input.titleFa || '', 120);
    const bodyFa = sanitizeInput(input.bodyFa || '', 500);
    const safety = validateCommunityTextSafety(bodyFa);
    if (titleFa.length < 5 || !safety.ok) {
      throw new CommunityHttpError(422, 'INVALID_DISCUSSION_BODY', safety.errorFa || 'عنوان باید حداقل ۵ کاراکتر باشد.');
    }

    return this.store.runTransaction(async (tx) => {
      const post = await tx.get<CommunityDiscussionPost & UnifiedSocialPostDoc>(SOCIAL_COLLECTIONS.posts, postId);
      if (!post || post.isDeleted) throw new CommunityHttpError(404, 'DISCUSSION_NOT_FOUND', 'مطلب موردنظر یافت نشد.');
      if (post.ownerUserId !== uid) throw new CommunityHttpError(403, 'OWNER_MISMATCH', 'شما مجاز به ویرایش این مطلب نیستید.');
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
      const updated: CommunityDiscussionPost & UnifiedSocialPostDoc = {
        ...post,
        titleFa,
        bodyFa,
        revisionHistory: history,
        version: Number(post.version ?? 1) + 1,
        updatedAtIso: new Date().toISOString(),
      };
      tx.set(SOCIAL_COLLECTIONS.posts, postId, updated as unknown as Record<string, unknown>);
      return updated;
    });
  }

  public async softDeleteDiscussion(uid: string, postId: string, isAdmin = false): Promise<{ deleted: true; id: string }> {
    return this.store.runTransaction(async (tx) => {
      const post = await tx.get<UnifiedSocialPostDoc>(SOCIAL_COLLECTIONS.posts, postId);
      if (!post || post.isDeleted) throw new CommunityHttpError(404, 'DISCUSSION_NOT_FOUND', 'مطلب موردنظر یافت نشد.');
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
      return { deleted: true, id: postId };
    });
  }

  public async addDiscussionComment(
    actor: VerifiedActorIdentity,
    postId: string,
    input: { bodyFa: string; parentReplyId?: string | null; idempotencyKey?: string },
  ): Promise<CommunityDiscussionPost> {
    this.enforceRateLimit('create_comment', actor.uid);
    const safety = validateCommunityTextSafety(input.bodyFa || '');
    if (!safety.ok) throw new CommunityHttpError(422, 'INVALID_TEXT', safety.errorFa || 'متن دیدگاه معتبر نیست.');
    const profile = await this.getOrCreateProfile(actor);

    const payloadHash = hashCommunityPayload({ postId, bodyFa: input.bodyFa, parentReplyId: input.parentReplyId || null });
    const rawIdemKey = typeof input.idempotencyKey === 'string' ? sanitizeInput(input.idempotencyKey, 80) : '';
    const idemDocId = rawIdemKey ? hashCommunityIdempotencyKey(actor.uid, 'create_comment', rawIdemKey) : null;

    return this.store.runTransaction(async (tx) => {
      const post = await tx.get<CommunityDiscussionPost & UnifiedSocialPostDoc>(SOCIAL_COLLECTIONS.posts, postId);
      if (!post || post.isDeleted) throw new CommunityHttpError(404, 'DISCUSSION_NOT_FOUND', 'مطلب یافت نشد.');
      if (post.status === 'locked' || post.status === 'archived') {
        throw new CommunityHttpError(409, 'DISCUSSION_LOCKED', 'امکان ثبت نظر روی گفتگوی قفل‌شده وجود ندارد.');
      }

      if (idemDocId) {
        const existingIdem = await tx.get<{ targetId: string; payloadHash: string } & Record<string, unknown>>(SOCIAL_COLLECTIONS.idempotency, idemDocId);
        if (existingIdem) {
          if (existingIdem.payloadHash !== payloadHash) {
            throw new CommunityHttpError(409, 'IDEMPOTENCY_KEY_CONFLICT', 'کلید یکتای دیدگاه با متن متفاوت تکرار شده است.');
          }
          return post;
        }
      }

      const depth = resolveReplyDepth(post.replies ?? [], input.parentReplyId ?? null);
      if (!depth.ok) throw new CommunityHttpError(422, 'MAX_REPLY_DEPTH_EXCEEDED', depth.errorFa || 'حداکثر عمق پاسخ رعایت نشده است.');

      const commentId = `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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
      tx.update(SOCIAL_COLLECTIONS.posts, postId, {
        replies: nextReplies,
        updatedAtIso: nowIso,
      });
      tx.incrementNumeric(SOCIAL_COLLECTIONS.posts, postId, { replyCount: 1 });

      if (idemDocId) {
        tx.set(SOCIAL_COLLECTIONS.idempotency, idemDocId, {
          scope: 'create_comment',
          uid: actor.uid,
          targetId: commentId,
          payloadHash,
          createdAtIso: nowIso,
        });
      }
      return { ...post, replies: nextReplies, replyCount: Number(post.replyCount ?? post.replies?.length ?? 0) + 1 };
    });
  }

  public async toggleReactionTransactional(uid: string, targetId: string, reaction: ReactionType) {
    const { toggleReactionOp } = await import('./communityUnifiedSecondaryOps');
    return toggleReactionOp(this, uid, targetId, reaction);
  }

  public async toggleFollowTransactional(uid: string, scope: 'topic' | 'post' | 'user', targetId: string) {
    const { toggleFollowOp } = await import('./communityUnifiedSecondaryOps');
    return toggleFollowOp(this, uid, scope, targetId);
  }

  public async createQuestion(actor: VerifiedActorIdentity, input: { titleFa: string; bodyFa: string; neighborhoodId?: number; neighborhoodNameFa?: string; topicId?: string }) {
    const { createQuestionOp } = await import('./communityUnifiedSecondaryOps');
    return createQuestionOp(this, actor, input);
  }

  public async submitReport(actorUid: string, input: { targetType: string; targetId: string; reason: CommunityAbuseReason; detailsFa: string }) {
    const { submitReportOp } = await import('./communityUnifiedSecondaryOps');
    return submitReportOp(this, actorUid, input);
  }

  public async createCorrection(actor: VerifiedActorIdentity, input: { titleFa: string; evidenceSummaryFa: string; neighborhoodId?: number; neighborhoodNameFa?: string; category?: DataCorrectionCategory; currentValueFa?: string; suggestedValueFa?: string; observedDateFa?: string }) {
    const { createCorrectionOp } = await import('./communityUnifiedSecondaryOps');
    return createCorrectionOp(this, actor, input);
  }

  public async countPendingCorrections(): Promise<number> {
    const page = await this.store.queryDocs<DataCorrectionProposal & UnifiedSocialPostDoc>(SOCIAL_COLLECTIONS.posts, {
      filters: [{ field: 'recordKind', op: '==', value: 'correction' }],
      limit: 50,
    });
    return page.items.filter((c) => c.status === 'submitted').length;
  }

  public async recordModerationAction(action: Omit<ModerationActionRecord, 'id' | 'createdAtIso'>) {
    const { recordModerationActionOp } = await import('./communityUnifiedSecondaryOps');
    return recordModerationActionOp(this, action);
  }

  public async createAppeal(actorUid: string, input: { moderationActionId: string; targetId: string; argumentFa: string }) {
    const { createAppealOp } = await import('./communityUnifiedSecondaryOps');
    return createAppealOp(this, actorUid, input);
  }

  public async createResearchProposal(actor: VerifiedActorIdentity, input: { titleFa: string; questionFa: string; neighborhoodNameFa?: string; linkedKnowledgeTab?: string }) {
    const { createResearchProposalOp } = await import('./communityUnifiedSecondaryOps');
    return createResearchProposalOp(this, actor, input);
  }
}

export const communityUnifiedRepository = new CommunityUnifiedRepository();

