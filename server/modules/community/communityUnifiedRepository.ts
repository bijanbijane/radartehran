/** @file server/modules/community/communityUnifiedRepository.ts — Single Transactional Firestore Source of Truth for Community (Stage 3–9) */
import type {
  CommunityAbuseReason,
  CommunityDiscussionPost,
  CommunityProfile,
  DataCorrectionCategory,
  DataCorrectionProposal,
  ModerationActionRecord,
  ProfileContributionPage,
  ReactionType,
  SocialContentContext,
} from '../../../src/features/community/types/community.types';
import { sanitizeInput } from '../../../src/utils/security';
import {
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
  createDefaultCommunityDatabaseStore,
  type CommunityDatabaseStore,
} from './communityFirestoreAdapter';
import {
  assertCommunityUsernameUnique,
  lookupRawCommunityProfileByUsername,
  normalizeCommunityUsername,
  queryProfileContributionsPaginated,
} from './communityProfileQueries';
import {
  CommunityRateLimiter,
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
  username?: string;
}

export class CommunityUnifiedRepository {
  private seededOnBoot = false;

  constructor(
    private store: CommunityDatabaseStore = createDefaultCommunityDatabaseStore(),
    public readonly rateLimiter: CommunityRateLimiter = new CommunityRateLimiter(process.env, store),
  ) {
    this.rateLimiter.bindStore(this.store);
  }

  public getStore(): CommunityDatabaseStore { return this.store; }

  public setStore(nextStore: CommunityDatabaseStore): void {
    this.store = nextStore;
    this.rateLimiter.bindStore(nextStore);
    this.seededOnBoot = false;
  }

  public async ensureSeedsBootstrappedIfEmpty(): Promise<void> {
    if (this.seededOnBoot) return;
    if (this.store.backendKind === 'mock_firestore') {
      const first = await this.store.queryDocs(SOCIAL_COLLECTIONS.posts, { limit: 1 });
      if (first.items.length === 0) {
        await runNonDestructiveCommunityImport(this.store, { dryRun: false });
      }
    }
    this.seededOnBoot = true;
  }

  public async enforceRateLimit(bucket: CommunityActionBucket, actorKey: string, nowMs = Date.now()): Promise<void> {
    const res = await this.rateLimiter.checkAndConsume(bucket, actorKey, nowMs, undefined, this.store);
    if (!res.allowed) {
      throw new CommunityHttpError(429, 'RATE_LIMITED', 'تعداد درخواست‌های شما از حد مجاز فراتر رفته است.', {
        retryAfterSec: res.retryAfterSec,
        limit: res.limit,
        bucket,
      });
    }
  }

  public async getOrCreateProfile(actor: VerifiedActorIdentity): Promise<CommunityProfile> {
    const existing = await this.store.getDoc<CommunityProfile & Record<string, unknown>>(SOCIAL_COLLECTIONS.profiles, actor.uid);
    if (existing) {
      let dirty = false;
      const patch: Partial<CommunityProfile> = {};
      if (actor.username) {
        const cleanUser = await assertCommunityUsernameUnique(this.store, actor.username, actor.uid);
        if (existing.username !== cleanUser) { patch.username = cleanUser; dirty = true; }
      } else if (existing.username && existing.username !== existing.username.toLowerCase()) {
        patch.username = existing.username.toLowerCase();
        dirty = true;
      }
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
    const defaultUsername = `u_${safeUid.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 24) || 'member'}`;
    const username = await assertCommunityUsernameUnique(this.store, actor.username || defaultUsername, safeUid);

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
      followersCount: 0,
      followingCount: 0,
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
    privacy: Partial<Pick<CommunityProfile, 'visibility' | 'showBadges' | 'showContributions' | 'showFollowedTopics' | 'bioFa' | 'displayNameFa' | 'username'>>,
  ): Promise<CommunityProfile> {
    const profile = await this.getOrCreateProfile({ uid, emailVerified: true });
    if (privacy.username !== undefined) {
      profile.username = await assertCommunityUsernameUnique(this.store, privacy.username, uid);
    }
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

  public async getPublicProfileByUsername(
    username: string,
    isViewerMember: boolean,
    viewerUid?: string,
  ): Promise<CommunityProfile | null> {
    const clean = normalizeCommunityUsername(username);
    const matched = await lookupRawCommunityProfileByUsername(this.store, clean);
    if (!matched) return null;
    return stripSensitiveMemberProfileServerSide(matched, isViewerMember, viewerUid === matched.userId);
  }

  public async getProfileContributions(
    username: string,
    params: { limit?: unknown; cursor?: string | null; kind?: unknown; isViewerMember: boolean; viewerUid?: string },
  ): Promise<ProfileContributionPage> {
    return queryProfileContributionsPaginated(this.store, username, params);
  }

  public async createDiscussion(
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
    const { createDiscussionOp } = await import('./communityDiscussionOps');
    return createDiscussionOp(this, actor, input);
  }

  public async updateDiscussion(
    uid: string,
    postId: string,
    input: { titleFa: string; bodyFa: string; reasonFa?: string },
  ): Promise<CommunityDiscussionPost> {
    const { updateDiscussionOp } = await import('./communityDiscussionOps');
    return updateDiscussionOp(this, uid, postId, input);
  }

  public async softDeleteDiscussion(uid: string, postId: string, isAdmin = false): Promise<{ deleted: true; id: string }> {
    const { softDeleteDiscussionOp } = await import('./communityDiscussionOps');
    return softDeleteDiscussionOp(this, uid, postId, isAdmin);
  }

  public async addDiscussionComment(
    actor: VerifiedActorIdentity,
    postId: string,
    input: { bodyFa: string; parentReplyId?: string | null; idempotencyKey?: string },
  ): Promise<CommunityDiscussionPost> {
    const { addDiscussionCommentOp } = await import('./communityDiscussionOps');
    return addDiscussionCommentOp(this, actor, postId, input);
  }

  public async toggleReactionTransactional(
    uid: string,
    targetId: string,
    reaction: ReactionType,
    options?: { idempotencyKey?: string; mode?: 'toggle' | 'set' | 'remove'; operation?: 'toggle' | 'set' | 'remove' },
  ) {
    const { toggleReactionOp } = await import('./communityUnifiedSecondaryOps');
    return toggleReactionOp(this, uid, targetId, reaction, options);
  }

  public async toggleFollowTransactional(
    uid: string,
    scope: 'topic' | 'post' | 'user',
    targetId: string,
    options?: { idempotencyKey?: string; mode?: 'toggle' | 'follow' | 'unfollow'; operation?: 'toggle' | 'follow' | 'unfollow' },
  ) {
    const { toggleFollowOp } = await import('./communityUnifiedSecondaryOps');
    return toggleFollowOp(this, uid, scope, targetId, options);
  }

  public async followUser(followerUid: string, targetUid: string, options?: { idempotencyKey?: string; isViewerVerifiedMember?: boolean }) {
    const { followUserOp } = await import('./communityUserFollowOps');
    return followUserOp(this, followerUid, targetUid, options);
  }

  public async unfollowUser(followerUid: string, targetUid: string, options?: { idempotencyKey?: string }) {
    const { unfollowUserOp } = await import('./communityUserFollowOps');
    return unfollowUserOp(this, followerUid, targetUid, options);
  }

  public async getUserFollowStatus(viewerUid: string | null | undefined, targetUid: string, options?: { isViewerVerifiedMember?: boolean }) {
    const { getUserFollowStatus } = await import('./communityUserFollowOps');
    return getUserFollowStatus(this, viewerUid, targetUid, options);
  }

  public async auditUserFollowGraphConsistency() {
    const { auditUserFollowGraphConsistency } = await import('./communityUserFollowOps');
    return auditUserFollowGraphConsistency(this.store);
  }

  public async createQuestion(actor: VerifiedActorIdentity, input: { titleFa: string; bodyFa: string; neighborhoodId?: number; neighborhoodNameFa?: string; topicId?: string; socialContext?: SocialContentContext; idempotencyKey?: string }) {
    const { createQuestionOp } = await import('./communityContentCreationOps');
    return createQuestionOp(this, actor, input);
  }

  public async submitReport(actorUid: string, input: { targetType: string; targetId: string; reason: CommunityAbuseReason; detailsFa: string }) {
    const { submitReportOp } = await import('./communityContentCreationOps');
    return submitReportOp(this, actorUid, input);
  }

  public async createCorrection(actor: VerifiedActorIdentity, input: { titleFa: string; evidenceSummaryFa: string; neighborhoodId?: number; neighborhoodNameFa?: string; category?: DataCorrectionCategory; currentValueFa?: string; suggestedValueFa?: string; observedDateFa?: string; socialContext?: SocialContentContext; idempotencyKey?: string }) {
    const { createCorrectionOp } = await import('./communityContentCreationOps');
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
    const { recordModerationActionOp } = await import('./communityContentCreationOps');
    return recordModerationActionOp(this, action);
  }

  public async createAppeal(actorUid: string, input: { moderationActionId: string; targetId: string; argumentFa: string }) {
    const { createAppealOp } = await import('./communityContentCreationOps');
    return createAppealOp(this, actorUid, input);
  }

  public async createResearchProposal(actor: VerifiedActorIdentity, input: { titleFa: string; questionFa: string; neighborhoodNameFa?: string; linkedKnowledgeTab?: string; socialContext?: SocialContentContext; idempotencyKey?: string }) {
    const { createResearchProposalOp } = await import('./communityContentCreationOps');
    return createResearchProposalOp(this, actor, input);
  }
}

export const communityUnifiedRepository = new CommunityUnifiedRepository();
