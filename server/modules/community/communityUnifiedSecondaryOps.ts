/** @file server/modules/community/communityUnifiedSecondaryOps.ts — Reactions, Follows, Questions, Corrections, Reports & Proposals (Stage 3) */
import type {
  CommunityAbuseReason,
  CommunityAbuseReport,
  CommunityDiscussionPost,
  CommunityQuestionItem,
  DataCorrectionCategory,
  DataCorrectionProposal,
  ModerationActionRecord,
  ModerationAppeal,
  ReactionType,
  ResearchTopicProposal,
} from '../../../src/features/community/types/community.types';
import { validateCommunityTextSafety } from '../../../src/features/community/services/communityTrustService';
import { sanitizeInput } from '../../../src/utils/security';
import { CommunityHttpError, SOCIAL_COLLECTIONS } from './communityFirestoreAdapter';
import type { CommunityUnifiedRepository, VerifiedActorIdentity } from './communityUnifiedRepository';
import type { UnifiedSocialPostDoc } from './communityUnifiedQueries';

export async function toggleReactionOp(repo: CommunityUnifiedRepository, uid: string, targetId: string, reaction: ReactionType) {
  repo.enforceRateLimit('reaction', uid);
  return repo.getStore().runTransaction(async (tx) => {
    const post = await tx.get<CommunityDiscussionPost & UnifiedSocialPostDoc>(SOCIAL_COLLECTIONS.posts, targetId);
    if (!post || post.isDeleted) throw new CommunityHttpError(404, 'TARGET_NOT_FOUND', 'محتوای هدف یافت نشد.');

    const reactionDocId = `${targetId}__${uid}`;
    const existingReaction = await tx.get<{ reactionType?: ReactionType } & Record<string, unknown>>(SOCIAL_COLLECTIONS.reactions, reactionDocId);
    const prev = existingReaction?.reactionType ?? post.reactionsByUser?.[uid] ?? null;

    const counts = {
      helpful: Number(post.reactionCounts?.helpful ?? post.helpfulCount ?? 0),
      agree: Number(post.reactionCounts?.agree ?? 0),
      needs_source: Number(post.reactionCounts?.needs_source ?? 0),
      disagree: Number(post.reactionCounts?.disagree ?? 0),
    };
    const byUser = { ...(post.reactionsByUser ?? {}) };
    const nowIso = new Date().toISOString();
    let activeReaction: ReactionType | null = reaction;

    if (prev === reaction) {
      counts[reaction] = Math.max(0, counts[reaction] - 1);
      delete byUser[uid];
      activeReaction = null;
      tx.delete(SOCIAL_COLLECTIONS.reactions, reactionDocId);
    } else {
      if (prev) counts[prev] = Math.max(0, counts[prev] - 1);
      counts[reaction] += 1;
      byUser[uid] = reaction;
      tx.set(SOCIAL_COLLECTIONS.reactions, reactionDocId, { targetId, uid, reactionType: reaction, updatedAtIso: nowIso });
    }

    tx.update(SOCIAL_COLLECTIONS.posts, targetId, { reactionCounts: counts, reactionsByUser: byUser, helpfulCount: counts.helpful, updatedAtIso: nowIso });
    return { reactionCounts: counts, activeReaction };
  });
}

export async function toggleFollowOp(repo: CommunityUnifiedRepository, uid: string, scope: 'topic' | 'post' | 'user', targetId: string) {
  repo.enforceRateLimit('follow', uid);
  const followDocId = `${scope}_${targetId}__${uid}`;
  return repo.getStore().runTransaction(async (tx) => {
    const existing = await tx.get(SOCIAL_COLLECTIONS.follows, followDocId);
    if (scope === 'post') {
      const post = await tx.get<CommunityDiscussionPost & UnifiedSocialPostDoc>(SOCIAL_COLLECTIONS.posts, targetId);
      if (!post || post.isDeleted) throw new CommunityHttpError(404, 'DISCUSSION_NOT_FOUND', 'مطلب یافت نشد.');
      const currentIds = Array.isArray(post.followerIds) ? [...post.followerIds] : [];
      const idx = currentIds.indexOf(uid);
      if (existing || idx >= 0) {
        tx.delete(SOCIAL_COLLECTIONS.follows, followDocId);
        const nextIds = currentIds.filter((id) => id !== uid);
        tx.update(SOCIAL_COLLECTIONS.posts, targetId, { followerIds: nextIds, followerCount: nextIds.length });
        return { isFollowed: false, followerCount: nextIds.length };
      }
      currentIds.push(uid);
      tx.set(SOCIAL_COLLECTIONS.follows, followDocId, { scope, targetId, followerUid: uid, createdAtIso: new Date().toISOString() });
      tx.update(SOCIAL_COLLECTIONS.posts, targetId, { followerIds: currentIds, followerCount: currentIds.length });
      return { isFollowed: true, followerCount: currentIds.length };
    }
    if (existing) {
      tx.delete(SOCIAL_COLLECTIONS.follows, followDocId);
      return { isFollowed: false, followerCount: 0 };
    }
    tx.set(SOCIAL_COLLECTIONS.follows, followDocId, { scope, targetId, followerUid: uid, createdAtIso: new Date().toISOString() });
    return { isFollowed: true, followerCount: 1 };
  });
}

export async function createQuestionOp(repo: CommunityUnifiedRepository, actor: VerifiedActorIdentity, input: { titleFa: string; bodyFa: string; neighborhoodId?: number; neighborhoodNameFa?: string; topicId?: string }) {
  repo.enforceRateLimit('create_post', actor.uid);
  const titleFa = sanitizeInput(input.titleFa || '', 140);
  const bodyFa = sanitizeInput(input.bodyFa || '', 500);
  const safety = validateCommunityTextSafety(bodyFa);
  if (titleFa.length < 8 || !safety.ok) throw new CommunityHttpError(422, 'INVALID_QUESTION', safety.errorFa || 'عنوان پرسش باید حداقل ۸ کاراکتر باشد.');
  const profile = await repo.getOrCreateProfile(actor);
  const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const q: CommunityQuestionItem & UnifiedSocialPostDoc = {
    id, recordKind: 'question', titleFa, bodyFa,
    neighborhoodId: Number(input.neighborhoodId) || 1,
    neighborhoodNameFa: sanitizeInput(input.neighborhoodNameFa || 'پونک', 50),
    topicId: sanitizeInput(input.topicId || 'topic-legal-contracts', 50),
    tags: [], ownerUserId: actor.uid,
    authorProfile: {
      userId: actor.uid, username: profile.username, displayNameFa: profile.displayNameFa,
      isAuthenticated: true, isEmailVerified: Boolean(actor.emailVerified || profile.isEmailVerified), isPhoneVerified: Boolean(actor.phoneVerified || profile.isPhoneVerified),
      identityStatus: profile.identityStatus, participationScore: 0, participationTierFa: 'مشارکت‌کننده جدید', verifiedCredentialFa: profile.verifiedCredentialFa, reputation: profile.reputation,
    },
    status: 'open', answers: [], followerIds: [actor.uid], replyCount: 0, followerCount: 1,
    moderationStatus: 'approved', isDeleted: false, source: 'user', createdAtIso: new Date().toISOString(), createdAtFa: 'امروز',
  };
  await repo.getStore().setDoc(SOCIAL_COLLECTIONS.posts, id, q as unknown as Record<string, unknown>);
  return q;
}

export async function submitReportOp(repo: CommunityUnifiedRepository, actorUid: string, input: { targetType: string; targetId: string; reason: CommunityAbuseReason; detailsFa: string }) {
  repo.enforceRateLimit('report', actorUid);
  const id = `abr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const report: CommunityAbuseReport & Record<string, unknown> = {
    id, recordKind: 'report', targetType: (input.targetType || 'discussion_post') as CommunityAbuseReport['targetType'],
    targetId: sanitizeInput(input.targetId || '', 60), reason: input.reason || 'spam_promo',
    detailsFa: sanitizeInput(input.detailsFa || '', 240), reporterUserId: actorUid, status: 'submitted', createdAtIso: new Date().toISOString(),
  };
  await repo.getStore().setDoc(SOCIAL_COLLECTIONS.reports, id, report);
  return report;
}

export async function createCorrectionOp(repo: CommunityUnifiedRepository, actor: VerifiedActorIdentity, input: { titleFa: string; evidenceSummaryFa: string; neighborhoodId?: number; neighborhoodNameFa?: string; category?: DataCorrectionCategory; currentValueFa?: string; suggestedValueFa?: string; observedDateFa?: string }) {
  repo.enforceRateLimit('create_post', actor.uid);
  const titleFa = sanitizeInput(input.titleFa || '', 120);
  const evidenceSummaryFa = sanitizeInput(input.evidenceSummaryFa || '', 420);
  const safety = validateCommunityTextSafety(evidenceSummaryFa);
  if (titleFa.length < 5 || !safety.ok) throw new CommunityHttpError(422, 'INVALID_CORRECTION', safety.errorFa || 'عنوان گزارش باید حداقل ۵ کاراکتر باشد.');
  const profile = await repo.getOrCreateProfile(actor);
  const id = `corr_${Date.now()}`;
  const proposal: DataCorrectionProposal & UnifiedSocialPostDoc = {
    id, recordKind: 'correction', neighborhoodId: Number(input.neighborhoodId) || 1,
    neighborhoodNameFa: sanitizeInput(input.neighborhoodNameFa || 'پونک', 50), category: input.category || 'urban_facility', titleFa,
    currentValueFa: sanitizeInput(input.currentValueFa || '', 140) || undefined, evidenceSummaryFa,
    suggestedValueFa: sanitizeInput(input.suggestedValueFa || '', 160) || 'نیازمند بررسی', observedDateFa: sanitizeInput(input.observedDateFa || 'امروز', 30),
    evidenceAttachments: [], ownerUserId: actor.uid,
    authorProfile: {
      userId: actor.uid, username: profile.username, displayNameFa: profile.displayNameFa,
      isAuthenticated: true, isEmailVerified: true, isPhoneVerified: Boolean(actor.phoneVerified),
      identityStatus: profile.identityStatus, participationScore: 0, participationTierFa: 'مشارکت‌کننده جدید', verifiedCredentialFa: profile.verifiedCredentialFa, reputation: profile.reputation,
    },
    status: 'submitted', appliedDataVersionId: null, isDeleted: false, source: 'user', createdAtIso: new Date().toISOString(), createdAtFa: 'امروز',
  };
  await repo.getStore().setDoc(SOCIAL_COLLECTIONS.posts, id, proposal as unknown as Record<string, unknown>);
  return proposal;
}

export async function recordModerationActionOp(repo: CommunityUnifiedRepository, action: Omit<ModerationActionRecord, 'id' | 'createdAtIso'>) {
  const id = `mact_${Date.now()}`;
  const rec: ModerationActionRecord & Record<string, unknown> = { ...action, id, recordKind: 'moderation_action', createdAtIso: new Date().toISOString() };
  await repo.getStore().setDoc(SOCIAL_COLLECTIONS.reports, id, rec);
  return rec;
}

export async function createAppealOp(repo: CommunityUnifiedRepository, actorUid: string, input: { moderationActionId: string; targetId: string; argumentFa: string }) {
  repo.enforceRateLimit('appeal', actorUid);
  const argumentFa = sanitizeInput(input.argumentFa || '', 320);
  if (argumentFa.trim().length < 8) throw new CommunityHttpError(422, 'INVALID_APPEAL', 'متن اعتراض باید حداقل ۸ کاراکتر باشد.');
  const id = `apl_${Date.now()}`;
  const appeal: ModerationAppeal & Record<string, unknown> = {
    id, recordKind: 'appeal', moderationActionId: sanitizeInput(input.moderationActionId || '', 60),
    targetId: sanitizeInput(input.targetId || '', 60), appellantUserId: actorUid, argumentFa, status: 'submitted', createdAtIso: new Date().toISOString(),
  };
  await repo.getStore().setDoc(SOCIAL_COLLECTIONS.reports, id, appeal);
  return appeal;
}

export async function createResearchProposalOp(repo: CommunityUnifiedRepository, actor: VerifiedActorIdentity, input: { titleFa: string; questionFa: string; neighborhoodNameFa?: string; linkedKnowledgeTab?: string }) {
  repo.enforceRateLimit('create_post', actor.uid);
  const titleFa = sanitizeInput(input.titleFa || '', 120);
  const questionFa = sanitizeInput(input.questionFa || '', 450);
  const safety = validateCommunityTextSafety(questionFa);
  if (titleFa.length < 5 || !safety.ok) throw new CommunityHttpError(422, 'INVALID_PROPOSAL', safety.errorFa || 'عنوان پیشنهاد پژوهش باید حداقل ۵ کاراکتر باشد.');
  const profile = await repo.getOrCreateProfile(actor);
  const id = `rp_${Date.now()}`;
  const item: ResearchTopicProposal & UnifiedSocialPostDoc = {
    id, recordKind: 'research_proposal', titleFa, questionFa, neighborhoodNameFa: sanitizeInput(input.neighborhoodNameFa || 'تهران', 50),
    ownerUserId: actor.uid,
    authorProfile: {
      userId: actor.uid, username: profile.username, displayNameFa: profile.displayNameFa,
      isAuthenticated: true, isEmailVerified: true, isPhoneVerified: false,
      identityStatus: profile.identityStatus, participationScore: 0, participationTierFa: 'مشارکت‌کننده جدید', verifiedCredentialFa: profile.verifiedCredentialFa, reputation: profile.reputation,
    },
    votesCount: 1, voterIds: [actor.uid], status: 'open', linkedKnowledgeTab: input.linkedKnowledgeTab === 'methodology' ? 'methodology' : 'reports',
    isDeleted: false, source: 'user', createdAtFa: 'امروز', createdAtIso: new Date().toISOString(),
  };
  await repo.getStore().setDoc(SOCIAL_COLLECTIONS.posts, id, item as unknown as Record<string, unknown>);
  return item;
}
