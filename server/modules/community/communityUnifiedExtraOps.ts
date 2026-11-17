/** @file server/modules/community/communityUnifiedExtraOps.ts — Secondary Transactional Operations (Q&A Answers, Withdrawals, Moderation Actions) */
import type {
  CommunityDiscussionPost,
  CommunityQuestionItem,
  DataCorrectionProposal,
  ModerationActionRecord,
  ModerationAppeal,
  ResearchTopicProposal,
} from '../../../src/features/community/types/community.types';
import { validateCommunityTextSafety } from '../../../src/features/community/services/communityTrustService';
import { sanitizeInput } from '../../../src/utils/security';
import { appendServerAdminAuditLog } from '../account-admin/accountAdminRepository';
import {
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
} from './communityFirestoreAdapter';
import type { CommunityUnifiedRepository, VerifiedActorIdentity } from './communityUnifiedRepository';
import type { UnifiedSocialPostDoc } from './communityUnifiedQueries';

export async function addQuestionAnswerOp(
  repo: CommunityUnifiedRepository,
  actor: VerifiedActorIdentity,
  questionId: string,
  input: { bodyFa: string; sourceReferenceFa?: string },
) {
  repo.enforceRateLimit('create_comment', actor.uid);
  const bodyFa = sanitizeInput(input.bodyFa || '', 600);
  const safety = validateCommunityTextSafety(bodyFa);
  if (!safety.ok) throw new CommunityHttpError(422, 'INVALID_ANSWER', safety.errorFa || 'متن پاسخ معتبر نیست.');
  const profile = await repo.getOrCreateProfile(actor);
  const sourceReferenceFa = input.sourceReferenceFa ? sanitizeInput(input.sourceReferenceFa, 140) : undefined;

  return repo.getStore().runTransaction(async (tx) => {
    const q = await tx.get<CommunityQuestionItem & UnifiedSocialPostDoc>(SOCIAL_COLLECTIONS.posts, questionId);
    if (!q || q.isDeleted || q.recordKind !== 'question') {
      throw new CommunityHttpError(404, 'QUESTION_NOT_FOUND', 'پرسش یافت نشد.');
    }
    if (q.status === 'closed' || q.status === 'archived') {
      throw new CommunityHttpError(409, 'QUESTION_CLOSED', 'این پرسش بسته شده است.');
    }

    const answerId = `ans_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const author = {
      userId: actor.uid, username: profile.username, displayNameFa: profile.displayNameFa,
      isAuthenticated: true, isEmailVerified: true, isPhoneVerified: Boolean(actor.phoneVerified),
      identityStatus: profile.identityStatus, participationScore: 0, participationTierFa: 'مشارکت‌کننده جدید' as const,
      verifiedCredentialFa: profile.verifiedCredentialFa, reputation: profile.reputation,
    };
    const answer = {
      id: answerId, questionId: q.id, ownerUserId: actor.uid, authorProfile: author, bodyFa, sourceReferenceFa,
      markers: {
        isAskerSelected: false,
        hasCredibleSource: Boolean(sourceReferenceFa),
        isExpertReviewed: Boolean(author.verifiedCredentialFa),
        isOfficiallyVerified: false,
      },
      reactionCounts: { helpful: 0, agree: 0, needs_source: 0, disagree: 0 },
      reactionsByUser: {}, createdAtFa: 'امروز', status: 'visible' as const,
    };
    tx.set(SOCIAL_COLLECTIONS.comments, answerId, { ...answer, postId: q.id, recordKind: 'answer', isDeleted: false, createdAtIso: nowIso });
    const nextAnswers = [...(q.answers ?? []), answer];
    const nextStatus = q.status === 'open' ? 'answered' : q.status;
    tx.update(SOCIAL_COLLECTIONS.posts, questionId, { answers: nextAnswers, status: nextStatus, updatedAtIso: nowIso });
    tx.incrementNumeric(SOCIAL_COLLECTIONS.posts, questionId, { replyCount: 1 });
    return { item: answer, question: { ...q, answers: nextAnswers, status: nextStatus } };
  });
}

export async function selectBestQuestionAnswerOp(repo: CommunityUnifiedRepository, uid: string, questionId: string, answerId: string) {
  return repo.getStore().runTransaction(async (tx) => {
    const q = await tx.get<CommunityQuestionItem & UnifiedSocialPostDoc>(SOCIAL_COLLECTIONS.posts, questionId);
    if (!q || q.recordKind !== 'question') throw new CommunityHttpError(404, 'QUESTION_NOT_FOUND', 'پرسش یافت نشد.');
    if (q.ownerUserId !== uid) throw new CommunityHttpError(403, 'ONLY_ASKER_CAN_SELECT', 'فقط پرسش‌کننده مجاز به انتخاب پاسخ برتر است.');
    const target = (q.answers ?? []).find((a) => a.id === answerId);
    if (!target) throw new CommunityHttpError(404, 'ANSWER_NOT_FOUND', 'پاسخ یافت نشد.');
    const nextSelected = !target.markers.isAskerSelected;
    const answers = q.answers.map((a) => ({ ...a, markers: { ...a.markers, isAskerSelected: a.id === answerId ? nextSelected : false } }));
    const status = nextSelected ? 'resolved' : answers.length > 0 ? 'answered' : 'open';
    tx.update(SOCIAL_COLLECTIONS.posts, questionId, { answers, status, updatedAtIso: new Date().toISOString() });
    return { ...q, answers, status };
  });
}

export async function withdrawCorrectionOp(repo: CommunityUnifiedRepository, uid: string, correctionId: string) {
  return repo.getStore().runTransaction(async (tx) => {
    const item = await tx.get<DataCorrectionProposal & UnifiedSocialPostDoc>(SOCIAL_COLLECTIONS.posts, correctionId);
    if (!item || item.recordKind !== 'correction') throw new CommunityHttpError(404, 'NOT_FOUND', 'پیشنهاد یافت نشد.');
    if (item.ownerUserId !== uid) throw new CommunityHttpError(403, 'OWNER_MISMATCH', 'شما مالک این پیشنهاد نیستید.');
    if (item.status === 'applied' || item.status === 'approved' || item.status === 'verified') {
      throw new CommunityHttpError(409, 'ALREADY_APPLIED', 'پیشنهاد تایید یا اعمال‌شده قابل انصراف نیست.');
    }
    tx.update(SOCIAL_COLLECTIONS.posts, correctionId, { status: 'withdrawn', updatedAtIso: new Date().toISOString() });
    return { ...item, status: 'withdrawn' as const };
  });
}

export async function voteResearchProposalOp(repo: CommunityUnifiedRepository, uid: string, proposalId: string) {
  repo.enforceRateLimit('reaction', uid);
  return repo.getStore().runTransaction(async (tx) => {
    const prop = await tx.get<ResearchTopicProposal & UnifiedSocialPostDoc>(SOCIAL_COLLECTIONS.posts, proposalId);
    if (!prop || prop.recordKind !== 'research_proposal') throw new CommunityHttpError(404, 'PROPOSAL_NOT_FOUND', 'پیشنهاد یافت نشد.');
    const voterIds = [...(prop.voterIds ?? [])];
    const idx = voterIds.indexOf(uid);
    if (idx === -1) voterIds.push(uid);
    else voterIds.splice(idx, 1);
    tx.update(SOCIAL_COLLECTIONS.posts, proposalId, { voterIds, votesCount: voterIds.length, updatedAtIso: new Date().toISOString() });
    return { ...prop, voterIds, votesCount: voterIds.length };
  });
}

export async function executeAdminCommunityModerationOp(
  repo: CommunityUnifiedRepository,
  adminActor: { uid?: string; email?: string },
  input: { targetId: string; targetType?: string; actionType: string; reasonFa: string },
) {
  const targetId = sanitizeInput(input.targetId || '', 60);
  const reasonFa = sanitizeInput(input.reasonFa || '', 200);
  if (!targetId || reasonFa.trim().length < 6) {
    throw new CommunityHttpError(400, 'REASON_REQUIRED', 'ثبت دلیل تصمیم مدیریتی (حداقل ۶ کاراکتر) الزامی است.');
  }
  const store = repo.getStore();
  const nowIso = new Date().toISOString();

  await store.runTransaction(async (tx) => {
    if (['approve_data', 'apply_data_version', 'reject_data'].includes(input.actionType)) {
      const target = await tx.get<DataCorrectionProposal & UnifiedSocialPostDoc>(SOCIAL_COLLECTIONS.posts, targetId);
      if (!target) throw new CommunityHttpError(404, 'CORRECTION_NOT_FOUND', 'پیشنهاد یافت نشد.');
      if (target.status === 'withdrawn' || target.status === 'applied') {
        throw new CommunityHttpError(409, 'INVALID_CORRECTION_TRANSITION', 'پیشنهاد پس‌گرفته‌شده یا اعمال‌شده قابل تغییر نیست.');
      }
      if (input.actionType === 'apply_data_version' && target.status !== 'approved' && target.status !== 'verified') {
        throw new CommunityHttpError(409, 'APPROVAL_REQUIRED_BEFORE_APPLY', 'پیش از اعمال به داده مرجع، باید تایید شده باشد.');
      }
      const nextStatus = input.actionType === 'approve_data' ? 'approved' : input.actionType === 'apply_data_version' ? 'applied' : 'rejected';
      tx.update(SOCIAL_COLLECTIONS.posts, targetId, {
        status: nextStatus,
        moderatorNoteFa: reasonFa,
        appliedDataVersionId: input.actionType === 'apply_data_version' ? `canon-ver-${nowIso.slice(0, 10)}` : target.appliedDataVersionId,
        updatedAtIso: nowIso,
      });
    } else if (input.actionType === 'resolve_report' || input.actionType === 'dismiss_report') {
      const rep = await tx.get(SOCIAL_COLLECTIONS.reports, targetId);
      if (rep) tx.update(SOCIAL_COLLECTIONS.reports, targetId, { status: input.actionType === 'resolve_report' ? 'decision_made' : 'dismissed', updatedAtIso: nowIso });
    } else if (['hide', 'lock', 'restore'].includes(input.actionType)) {
      const post = await tx.get<CommunityDiscussionPost & UnifiedSocialPostDoc>(SOCIAL_COLLECTIONS.posts, targetId);
      if (post) {
        tx.update(SOCIAL_COLLECTIONS.posts, targetId, {
          status: input.actionType === 'hide' ? 'hidden' : input.actionType === 'lock' ? 'locked' : 'published',
          moderationStatus: input.actionType === 'hide' ? 'hidden' : 'approved',
          updatedAtIso: nowIso,
        });
      }
    }
  });

  const action = await repo.recordModerationAction({
    targetType: (input.targetType || 'data_correction') as ModerationActionRecord['targetType'],
    targetId,
    actionType: input.actionType as ModerationActionRecord['actionType'],
    reasonFa,
    actorRole: adminActor.email || adminActor.uid || 'admin',
    actorUid: adminActor.uid,
  });

  appendServerAdminAuditLog({
    actorRole: 'content_moderator',
    actorLabelFa: adminActor.email || 'ادمین نظارت انجمن',
    actionCode: `COMMUNITY_${input.actionType.toUpperCase()}`,
    targetType: 'listing',
    targetId,
    reasonFa,
    severity: 'info',
  });
  return action;
}

export async function resolveCommunityAppealOp(
  repo: CommunityUnifiedRepository,
  adminActor: { uid?: string; email?: string },
  appealId: string,
  input: { reviewerNoteFa: string; decision?: string },
) {
  const reviewerNoteFa = sanitizeInput(input.reviewerNoteFa || '', 200);
  if (reviewerNoteFa.trim().length < 6) {
    throw new CommunityHttpError(400, 'REASON_REQUIRED', 'ثبت توضیح بررسی اعتراض (حداقل ۶ کاراکتر) الزامی است.');
  }
  const appeal = await repo.getStore().runTransaction(async (tx) => {
    const row = await tx.get<ModerationAppeal & Record<string, unknown>>(SOCIAL_COLLECTIONS.reports, appealId);
    if (!row || row.recordKind !== 'appeal') throw new CommunityHttpError(404, 'APPEAL_NOT_FOUND', 'اعتراض یافت نشد.');
    if (row.status === 'overturned' || row.status === 'upheld') {
      throw new CommunityHttpError(409, 'APPEAL_ALREADY_RESOLVED', 'این اعتراض قبلاً رسیدگی شده است.');
    }
    const nextStatus = input.decision === 'overturned' ? 'overturned' : 'upheld';
    tx.update(SOCIAL_COLLECTIONS.reports, appealId, { status: nextStatus, reviewerNoteFa, reviewerUid: adminActor.uid, updatedAtIso: new Date().toISOString() });
    return { ...row, status: nextStatus, reviewerNoteFa } as ModerationAppeal;
  });

  appendServerAdminAuditLog({
    actorRole: 'content_moderator',
    actorLabelFa: adminActor.email || 'ادمین نظارت',
    actionCode: `APPEAL_${appeal.status.toUpperCase()}`,
    targetType: 'listing',
    targetId: appeal.id,
    reasonFa: reviewerNoteFa,
    severity: 'info',
  });
  return appeal;
}
