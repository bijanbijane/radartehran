/** @file server/modules/community/communityContentCreationOps.ts — Transactional Question, Correction, Research Proposal, Report & Appeal Creation (Stages 3–7) */
import { validateCommunityTextSafety } from '../../../src/features/community/services/communityTrustService';
import type {
  CommunityAbuseReason,
  CommunityAbuseReport,
  CommunityQuestionItem,
  DataCorrectionCategory,
  DataCorrectionProposal,
  ModerationActionRecord,
  ModerationAppeal,
  ResearchTopicProposal,
  SocialContentContext,
} from '../../../src/features/community/types/community.types';
import { sanitizeInput } from '../../../src/utils/security';
import { upsertSocialFeedProjectionInTx } from '../search/socialFeedProjection';
import { CommunityHttpError, SOCIAL_COLLECTIONS } from './communityFirestoreAdapter';
import {
  hashCommunityIdempotencyKey,
  hashCommunityPayload,
} from './communityRateLimiter';
import type { UnifiedSocialPostDoc } from './communityUnifiedQueries';
import type { CommunityUnifiedRepository, VerifiedActorIdentity } from './communityUnifiedRepository';
import {
  canonicalizeSocialContentContextForHash,
  resolveOrBuildFallbackNeighborhoodContext,
  validateSocialContentContext,
} from './communityValidation';
import { appendSocialActivity } from './socialActivityRepository';

export async function createQuestionOp(
  repo: CommunityUnifiedRepository,
  actor: VerifiedActorIdentity,
  input: {
    titleFa: string;
    bodyFa: string;
    neighborhoodId?: number;
    neighborhoodNameFa?: string;
    topicId?: string;
    socialContext?: SocialContentContext;
    idempotencyKey?: string;
  },
) {
  await repo.enforceRateLimit('create_post', actor.uid);
  const titleFa = sanitizeInput(input.titleFa || '', 140);
  const bodyFa = sanitizeInput(input.bodyFa || '', 500);
  const safety = validateCommunityTextSafety(bodyFa);
  if (titleFa.length < 8 || !safety.ok) {
    throw new CommunityHttpError(
      422,
      'INVALID_QUESTION',
      safety.errorFa || 'عنوان پرسش باید حداقل ۸ کاراکتر باشد.',
    );
  }
  const validatedContext = await resolveOrBuildFallbackNeighborhoodContext(
    input.socialContext,
    input.neighborhoodId ?? 1,
    { store: repo.getStore() },
  );
  const profile = await repo.getOrCreateProfile(actor);
  const preGeneratedId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const rawIdemKey =
    typeof input.idempotencyKey === 'string' ? sanitizeInput(input.idempotencyKey, 80) : '';
  const idemDocId = rawIdemKey
    ? hashCommunityIdempotencyKey(actor.uid, 'create_question', rawIdemKey)
    : null;
  const payloadHash = hashCommunityPayload({
    titleFa,
    bodyFa,
    neighborhoodId: Number(input.neighborhoodId) || 1,
    topicId: input.topicId || 'topic-legal-contracts',
    socialContext: canonicalizeSocialContentContextForHash(validatedContext),
  });

  return repo.getStore().runTransaction(async (tx) => {
    if (idemDocId) {
      const existingIdem = await tx.get<{ targetId: string; payloadHash: string } & Record<string, unknown>>(
        SOCIAL_COLLECTIONS.idempotency,
        idemDocId,
      );
      if (existingIdem) {
        if (existingIdem.payloadHash !== payloadHash) {
          throw new CommunityHttpError(
            409,
            'IDEMPOTENCY_KEY_CONFLICT',
            'کلید یکتای تکراری با پرسش متفاوت ارسال شده است.',
          );
        }
        const existingQ = await tx.get<CommunityQuestionItem & UnifiedSocialPostDoc>(
          SOCIAL_COLLECTIONS.posts,
          existingIdem.targetId,
        );
        if (existingQ) return existingQ;
      }
    }

    const id = preGeneratedId;
    const nowIso = new Date().toISOString();
    const q: CommunityQuestionItem & UnifiedSocialPostDoc = {
      id,
      recordKind: 'question',
      titleFa,
      bodyFa,
      neighborhoodId: Number(input.neighborhoodId) || 1,
      neighborhoodNameFa: sanitizeInput(input.neighborhoodNameFa || 'پونک', 50),
      topicId: sanitizeInput(input.topicId || 'topic-legal-contracts', 50),
      ...(validatedContext ? { socialContext: validatedContext } : {}),
      tags: [],
      ownerUserId: actor.uid,
      authorProfile: {
        userId: actor.uid,
        username: profile.username,
        displayNameFa: profile.displayNameFa,
        isAuthenticated: true,
        isEmailVerified: Boolean(actor.emailVerified || profile.isEmailVerified),
        isPhoneVerified: Boolean(actor.phoneVerified || profile.isPhoneVerified),
        identityStatus: profile.identityStatus,
        participationScore: 0,
        participationTierFa: 'مشارکت‌کننده جدید',
        verifiedCredentialFa: profile.verifiedCredentialFa,
        reputation: profile.reputation,
      },
      status: 'open',
      answers: [],
      followerIds: [actor.uid],
      replyCount: 0,
      followerCount: 1,
      moderationStatus: 'approved',
      isDeleted: false,
      source: 'user',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      createdAtFa: 'امروز',
    };
    tx.set(SOCIAL_COLLECTIONS.posts, id, q as unknown as Record<string, unknown>);
    upsertSocialFeedProjectionInTx(tx, q as unknown as Record<string, unknown>, nowIso);
    appendSocialActivity(tx, {
      eventType: 'content.created',
      actorUid: actor.uid,
      verifiedActorUid: actor.uid,
      objectType: 'question',
      objectId: id,
      socialContext: validatedContext,
      visibility: 'public',
      createdAtIso: nowIso,
    });
    if (idemDocId) {
      tx.set(SOCIAL_COLLECTIONS.idempotency, idemDocId, {
        scope: 'create_question',
        uid: actor.uid,
        targetId: id,
        payloadHash,
        createdAtIso: nowIso,
      });
    }
    return q;
  });
}

export async function submitReportOp(
  repo: CommunityUnifiedRepository,
  actorUid: string,
  input: { targetType: string; targetId: string; reason: CommunityAbuseReason; detailsFa: string },
) {
  await repo.enforceRateLimit('report', actorUid);
  const id = `abr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const report: CommunityAbuseReport & Record<string, unknown> = {
    id,
    recordKind: 'report',
    targetType: (input.targetType || 'discussion_post') as CommunityAbuseReport['targetType'],
    targetId: sanitizeInput(input.targetId || '', 60),
    reason: input.reason || 'spam_promo',
    detailsFa: sanitizeInput(input.detailsFa || '', 240),
    reporterUserId: actorUid,
    status: 'submitted',
    createdAtIso: new Date().toISOString(),
  };
  await repo.getStore().setDoc(SOCIAL_COLLECTIONS.reports, id, report);
  return report;
}

export async function createCorrectionOp(
  repo: CommunityUnifiedRepository,
  actor: VerifiedActorIdentity,
  input: {
    titleFa: string;
    evidenceSummaryFa: string;
    neighborhoodId?: number;
    neighborhoodNameFa?: string;
    category?: DataCorrectionCategory;
    currentValueFa?: string;
    suggestedValueFa?: string;
    observedDateFa?: string;
    socialContext?: SocialContentContext;
    idempotencyKey?: string;
  },
) {
  await repo.enforceRateLimit('create_post', actor.uid);
  const titleFa = sanitizeInput(input.titleFa || '', 120);
  const evidenceSummaryFa = sanitizeInput(input.evidenceSummaryFa || '', 420);
  const safety = validateCommunityTextSafety(evidenceSummaryFa);
  if (titleFa.length < 5 || !safety.ok) {
    throw new CommunityHttpError(
      422,
      'INVALID_CORRECTION',
      safety.errorFa || 'عنوان گزارش باید حداقل ۵ کاراکتر باشد.',
    );
  }
  const validatedContext = await resolveOrBuildFallbackNeighborhoodContext(
    input.socialContext,
    input.neighborhoodId ?? 1,
    { store: repo.getStore() },
  );
  const profile = await repo.getOrCreateProfile(actor);
  const preGeneratedId = `corr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  return repo.getStore().runTransaction(async (tx) => {
    const id = preGeneratedId;
    const nowIso = new Date().toISOString();
    const proposal: DataCorrectionProposal & UnifiedSocialPostDoc = {
      id,
      recordKind: 'correction',
      neighborhoodId: Number(input.neighborhoodId) || 1,
      neighborhoodNameFa: sanitizeInput(input.neighborhoodNameFa || 'پونک', 50),
      category: input.category || 'urban_facility',
      titleFa,
      currentValueFa: sanitizeInput(input.currentValueFa || '', 140) || undefined,
      evidenceSummaryFa,
      suggestedValueFa: sanitizeInput(input.suggestedValueFa || '', 160) || 'نیازمند بررسی',
      observedDateFa: sanitizeInput(input.observedDateFa || 'امروز', 30),
      evidenceAttachments: [],
      ...(validatedContext ? { socialContext: validatedContext } : {}),
      ownerUserId: actor.uid,
      authorProfile: {
        userId: actor.uid,
        username: profile.username,
        displayNameFa: profile.displayNameFa,
        isAuthenticated: true,
        isEmailVerified: true,
        isPhoneVerified: Boolean(actor.phoneVerified),
        identityStatus: profile.identityStatus,
        participationScore: 0,
        participationTierFa: 'مشارکت‌کننده جدید',
        verifiedCredentialFa: profile.verifiedCredentialFa,
        reputation: profile.reputation,
      },
      status: 'submitted',
      appliedDataVersionId: null,
      isDeleted: false,
      source: 'user',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      createdAtFa: 'امروز',
    };
    tx.set(SOCIAL_COLLECTIONS.posts, id, proposal as unknown as Record<string, unknown>);
    upsertSocialFeedProjectionInTx(tx, proposal as unknown as Record<string, unknown>, nowIso);
    appendSocialActivity(tx, {
      eventType: 'content.created',
      actorUid: actor.uid,
      verifiedActorUid: actor.uid,
      objectType: 'correction',
      objectId: id,
      socialContext: validatedContext,
      visibility: 'restricted',
      createdAtIso: nowIso,
    });
    return proposal;
  });
}

export async function recordModerationActionOp(
  repo: CommunityUnifiedRepository,
  action: Omit<ModerationActionRecord, 'id' | 'createdAtIso'>,
) {
  const id = `mact_${Date.now()}`;
  const rec: ModerationActionRecord & Record<string, unknown> = {
    ...action,
    id,
    recordKind: 'moderation_action',
    createdAtIso: new Date().toISOString(),
  };
  await repo.getStore().setDoc(SOCIAL_COLLECTIONS.reports, id, rec);
  return rec;
}

export async function createAppealOp(
  repo: CommunityUnifiedRepository,
  actorUid: string,
  input: { moderationActionId: string; targetId: string; argumentFa: string },
) {
  await repo.enforceRateLimit('appeal', actorUid);
  const argumentFa = sanitizeInput(input.argumentFa || '', 320);
  if (argumentFa.trim().length < 8) {
    throw new CommunityHttpError(422, 'INVALID_APPEAL', 'متن اعتراض باید حداقل ۸ کاراکتر باشد.');
  }
  const id = `apl_${Date.now()}`;
  const appeal: ModerationAppeal & Record<string, unknown> = {
    id,
    recordKind: 'appeal',
    moderationActionId: sanitizeInput(input.moderationActionId || '', 60),
    targetId: sanitizeInput(input.targetId || '', 60),
    appellantUserId: actorUid,
    argumentFa,
    status: 'submitted',
    createdAtIso: new Date().toISOString(),
  };
  await repo.getStore().setDoc(SOCIAL_COLLECTIONS.reports, id, appeal);
  return appeal;
}

export async function createResearchProposalOp(
  repo: CommunityUnifiedRepository,
  actor: VerifiedActorIdentity,
  input: {
    titleFa: string;
    questionFa: string;
    neighborhoodNameFa?: string;
    linkedKnowledgeTab?: string;
    socialContext?: SocialContentContext;
    idempotencyKey?: string;
  },
) {
  await repo.enforceRateLimit('create_post', actor.uid);
  const titleFa = sanitizeInput(input.titleFa || '', 120);
  const questionFa = sanitizeInput(input.questionFa || '', 450);
  const safety = validateCommunityTextSafety(questionFa);
  if (titleFa.length < 5 || !safety.ok) {
    throw new CommunityHttpError(
      422,
      'INVALID_PROPOSAL',
      safety.errorFa || 'عنوان پیشنهاد پژوهش باید حداقل ۵ کاراکتر باشد.',
    );
  }
  const validatedContext = await validateSocialContentContext(input.socialContext, {
    store: repo.getStore(),
  });
  const profile = await repo.getOrCreateProfile(actor);
  const preGeneratedId = `rp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  return repo.getStore().runTransaction(async (tx) => {
    const id = preGeneratedId;
    const nowIso = new Date().toISOString();
    const item: ResearchTopicProposal & UnifiedSocialPostDoc = {
      id,
      recordKind: 'research_proposal',
      titleFa,
      questionFa,
      neighborhoodNameFa: sanitizeInput(input.neighborhoodNameFa || 'تهران', 50),
      ...(validatedContext ? { socialContext: validatedContext } : {}),
      ownerUserId: actor.uid,
      authorProfile: {
        userId: actor.uid,
        username: profile.username,
        displayNameFa: profile.displayNameFa,
        isAuthenticated: true,
        isEmailVerified: true,
        isPhoneVerified: false,
        identityStatus: profile.identityStatus,
        participationScore: 0,
        participationTierFa: 'مشارکت‌کننده جدید',
        verifiedCredentialFa: profile.verifiedCredentialFa,
        reputation: profile.reputation,
      },
      votesCount: 1,
      voterIds: [actor.uid],
      status: 'open',
      linkedKnowledgeTab: input.linkedKnowledgeTab === 'methodology' ? 'methodology' : 'reports',
      isDeleted: false,
      source: 'user',
      createdAtFa: 'امروز',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    tx.set(SOCIAL_COLLECTIONS.posts, id, item as unknown as Record<string, unknown>);
    upsertSocialFeedProjectionInTx(tx, item as unknown as Record<string, unknown>, nowIso);
    appendSocialActivity(tx, {
      eventType: 'content.created',
      actorUid: actor.uid,
      verifiedActorUid: actor.uid,
      objectType: 'research_proposal',
      objectId: id,
      socialContext: validatedContext,
      visibility: 'public',
      createdAtIso: nowIso,
    });
    return item;
  });
}
