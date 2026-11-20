/**
 * @file server/modules/trust-safety/moderationAppealLifecycle.ts
 * @description RT-TS-CRITICAL-029 — Independent Appeal Lifecycle (submitAppeal,
 * resolveAppealById, resolveAppealWithSoD) with strict READ_PHASE -> WRITE_PHASE,
 * Separation of Duties (SoD), atomic target restore, Feed Projection sync, and Outbox.
 */
import crypto from 'node:crypto';
import { sanitizeInput } from '../../../src/utils/security';
import {
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
  type CommunityDatabaseStore,
  type SocialCollectionName,
} from '../community/communityFirestoreAdapter';
import { upsertSocialFeedProjectionInTx } from '../search/socialFeedProjection';
import { appendSocialOutboxEvent } from '../notifications/socialOutboxWorker';
import {
  normalizeAndValidateActorRole,
  validateCaseStatusTransition,
  type SocialModerationAppealRecord,
  type SocialModerationCaseRecord,
} from './moderationLifecycleHelpers';
import {
  buildTargetRestoreMutation,
  resolveModerationTargetInTx,
} from './moderationTargetResolver';

export async function submitModerationAppealInStore(
  store: CommunityDatabaseStore,
  params: {
    caseId: string;
    appellantUid: string;
    reasonFa: string;
    evidenceRefs?: string[];
    isPolicyAuthorized?: boolean;
  },
): Promise<{ appeal: SocialModerationAppealRecord; moderationCase: SocialModerationCaseRecord }> {
  const reasonFa = sanitizeInput(params.reasonFa, 500).trim();
  if (reasonFa.length < 5) {
    throw new CommunityHttpError(400, 'INVALID_APPEAL_REASON', 'شرح مستند اعتراض (حداقل ۵ کاراکتر) الزامی است.');
  }
  const evidenceRefs = Array.isArray(params.evidenceRefs)
    ? params.evidenceRefs
        .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
        .map((r) => sanitizeInput(r, 120).trim())
        .slice(0, 10)
    : [];
  const nowIso = new Date().toISOString();

  return store.runTransaction(async (tx) => {
    // READ PHASE
    const modCase = await tx.get<SocialModerationCaseRecord>(SOCIAL_COLLECTIONS.moderationCases, params.caseId);
    if (!modCase) {
      throw new CommunityHttpError(404, 'MODERATION_CASE_NOT_FOUND', 'پرونده نظارتی یافت نشد.');
    }
    const target = await resolveModerationTargetInTx(tx, modCase.targetType, modCase.targetId);
    const existingAppeals = tx.query
      ? await tx.query<SocialModerationAppealRecord>(SOCIAL_COLLECTIONS.moderationAppeals, {
          filters: [{ field: 'caseId', op: '==', value: params.caseId }],
        })
      : [];

    // VALIDATE PHASE
    validateCaseStatusTransition(modCase.status, 'APPEALED');
    if (!modCase.lastDecisionId || !modCase.lastDecidedByUid) {
      throw new CommunityHttpError(409, 'APPEAL_NO_PRIOR_DECISION', 'پرونده فاقد تصمیم اولیه معتبر جهت اعتراض است.');
    }
    if (modCase.lastDecision === 'dismiss') {
      throw new CommunityHttpError(409, 'APPEAL_NOT_APPLICABLE_TO_DISMISSED', 'پرونده ردشده (dismiss) نیازمند ثبت اعتراض نیست.');
    }
    const isOwner = Boolean(target.targetOwnerUid && target.targetOwnerUid === params.appellantUid);
    if (!isOwner && !params.isPolicyAuthorized) {
      throw new CommunityHttpError(
        403,
        'APPELLANT_NOT_AUTHORIZED',
        'فقط مالک محتوای مشمول تصمیم یا فرد مجاز طبق سیاست، حق ثبت اعتراض دارد.',
      );
    }
    if (existingAppeals.some((a) => a.status === 'SUBMITTED')) {
      throw new CommunityHttpError(409, 'ACTIVE_APPEAL_ALREADY_EXISTS', 'برای این پرونده یک اعتراض در جریان ثبت شده است.');
    }

    // WRITE PHASE
    const appealId = `apl_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const appealRecord: SocialModerationAppealRecord = {
      id: appealId,
      appealId,
      caseId: params.caseId,
      appellantUid: params.appellantUid,
      originalDecisionId: modCase.lastDecisionId,
      reasonFa,
      evidenceRefs,
      status: 'SUBMITTED',
      submittedAtIso: nowIso,
      reviewedAtIso: null,
      reviewerUid: null,
      reviewerRole: null,
      reviewerDecision: null,
      reviewerNoteFa: null,
      revision: 1,
    };

    const updatedCase: SocialModerationCaseRecord = {
      ...modCase,
      status: 'APPEALED',
      activeAppealId: appealId,
      revision: (typeof modCase.revision === 'number' ? modCase.revision : 1) + 1,
      updatedAtIso: nowIso,
    };
    delete (updatedCase as Record<string, unknown>).reportIds;

    const evId = `mev_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    tx.set(SOCIAL_COLLECTIONS.moderationAppeals, appealId, appealRecord);
    tx.set(SOCIAL_COLLECTIONS.moderationCases, params.caseId, updatedCase);
    tx.set(SOCIAL_COLLECTIONS.moderationEvents, evId, {
      id: evId,
      caseId: params.caseId,
      targetId: modCase.targetId,
      eventType: 'APPEAL_SUBMITTED',
      actorUid: params.appellantUid,
      actorRole: 'appellant',
      appealId,
      decisionId: modCase.lastDecisionId,
      reasonFa,
      createdAtIso: nowIso,
    });

    return { appeal: appealRecord, moderationCase: updatedCase };
  });
}

export async function resolveModerationAppealByIdInStore(
  store: CommunityDatabaseStore,
  params: {
    appealId: string;
    reviewerUid: string;
    reviewerRole: string;
    decision: 'upheld' | 'overturned';
    reviewerNoteFa: string;
    expectedCaseRevision?: number;
  },
): Promise<{ appeal: SocialModerationAppealRecord; moderationCase: SocialModerationCaseRecord }> {
  const noteFa = sanitizeInput(params.reviewerNoteFa, 300).trim();
  if (noteFa.length < 5) {
    throw new CommunityHttpError(400, 'INVALID_REVIEW_NOTE', 'یادداشت بازبینی اعتراض حداقل ۵ کاراکتر است.');
  }
  const resolvedRole = normalizeAndValidateActorRole(params.reviewerRole, 'appeal_review');
  const nowIso = new Date().toISOString();

  return store.runTransaction(async (tx) => {
    // READ PHASE (All reads before any write)
    const appeal = await tx.get<SocialModerationAppealRecord>(SOCIAL_COLLECTIONS.moderationAppeals, params.appealId);
    if (!appeal) {
      throw new CommunityHttpError(404, 'APPEAL_NOT_FOUND', 'درخواست اعتراض معتبر یافت نشد.');
    }
    const modCase = await tx.get<SocialModerationCaseRecord>(SOCIAL_COLLECTIONS.moderationCases, appeal.caseId);
    if (!modCase) {
      throw new CommunityHttpError(404, 'MODERATION_CASE_NOT_FOUND', 'پرونده نظارتی مرتبط با اعتراض یافت نشد.');
    }
    const target = await resolveModerationTargetInTx(tx, modCase.targetType, modCase.targetId);

    // VALIDATE PHASE
    if (appeal.status !== 'SUBMITTED') {
      throw new CommunityHttpError(409, 'APPEAL_ALREADY_RESOLVED', 'این اعتراض پیش‌تر تعیین‌تکلیف شده است.');
    }
    validateCaseStatusTransition(modCase.status, 'CLOSED');
    if (!modCase.lastDecidedByUid) {
      throw new CommunityHttpError(409, 'MISSING_ORIGINAL_DECISION_ACTOR', 'تصمیم‌گیرنده اولیه پرونده مشخص نیست.');
    }
    if (modCase.lastDecidedByUid === params.reviewerUid) {
      throw new CommunityHttpError(
        409,
        'SEPARATION_OF_DUTIES_VIOLATION',
        'ناظر صادرکننده تصمیم اولیه مجاز به داوری اعتراض نیست (SoD).',
      );
    }
    if (typeof params.expectedCaseRevision === 'number') {
      const currentRev = typeof modCase.revision === 'number' ? modCase.revision : 1;
      if (currentRev !== params.expectedCaseRevision) {
        throw new CommunityHttpError(409, 'CASE_REVISION_CONFLICT', 'نسخه پرونده در حین بازبینی تغییر کرده است.');
      }
    }

    // WRITE PHASE (Zero reads)
    const restorePlan = params.decision === 'overturned' ? buildTargetRestoreMutation(target, nowIso) : null;
    if (restorePlan) {
      tx.update(restorePlan.collection as SocialCollectionName, restorePlan.docId, restorePlan.patch);
      if (restorePlan.feedProjectionAction === 'UPSERT' && restorePlan.projectedDoc) {
        upsertSocialFeedProjectionInTx(tx, restorePlan.projectedDoc, nowIso);
      }
    }

    const updatedAppeal: SocialModerationAppealRecord = {
      ...appeal,
      status: params.decision === 'overturned' ? 'OVERTURNED' : 'UPHELD',
      reviewedAtIso: nowIso,
      reviewerUid: params.reviewerUid,
      reviewerRole: resolvedRole,
      reviewerDecision: params.decision,
      reviewerNoteFa: noteFa,
      revision: (typeof appeal.revision === 'number' ? appeal.revision : 1) + 1,
    };
    const updatedCase: SocialModerationCaseRecord = {
      ...modCase,
      status: 'CLOSED',
      activeAppealId: null,
      claimLeaseExpiresAtIso: null,
      revision: (typeof modCase.revision === 'number' ? modCase.revision : 1) + 1,
      updatedAtIso: nowIso,
    };
    delete (updatedCase as Record<string, unknown>).reportIds;

    const evId = `mev_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    tx.set(SOCIAL_COLLECTIONS.moderationAppeals, appeal.id, updatedAppeal);
    tx.set(SOCIAL_COLLECTIONS.moderationCases, modCase.id, updatedCase);
    tx.set(SOCIAL_COLLECTIONS.moderationEvents, evId, {
      id: evId,
      caseId: modCase.id,
      targetId: modCase.targetId,
      eventType: 'APPEAL_RESOLVED',
      actorUid: params.reviewerUid,
      actorRole: resolvedRole,
      appealId: appeal.id,
      decision: params.decision,
      reasonFa: noteFa,
      createdAtIso: nowIso,
    });

    if (target.targetOwnerUid) {
      appendSocialOutboxEvent(tx, {
        eventId: `${modCase.id}_${appeal.id}_${params.decision}`,
        eventType: 'social.moderation.decided.v1',
        targetId: modCase.targetId,
        actorUid: params.reviewerUid,
        recipientUids: [target.targetOwnerUid],
        payloadSummaryFa:
          params.decision === 'overturned'
            ? 'اعتراض نظارتی شما پذیرفته شد و وضعیت محتوا بازگردانی گردید'
            : 'نتیجه بررسی اعتراض نظارتی ثبت و پرونده بسته شد',
      });
    }

    return { appeal: updatedAppeal, moderationCase: updatedCase };
  });
}

export async function resolveModerationAppealWithSoDInStore(
  store: CommunityDatabaseStore,
  params: {
    caseId: string;
    appealId?: string;
    reviewerUid: string;
    reviewerRole: string;
    decision: 'upheld' | 'overturned';
    reviewerNoteFa: string;
    expectedCaseRevision?: number;
  },
): Promise<SocialModerationCaseRecord> {
  let targetAppealId = params.appealId?.trim();
  if (!targetAppealId) {
    const modCase = await store.getDoc<SocialModerationCaseRecord>(
      SOCIAL_COLLECTIONS.moderationCases,
      params.caseId,
    );
    if (!modCase) {
      throw new CommunityHttpError(404, 'MODERATION_CASE_NOT_FOUND', 'پرونده نظارتی یافت نشد.');
    }
    if (!modCase.activeAppealId) {
      throw new CommunityHttpError(
        404,
        'APPEAL_NOT_FOUND',
        'هیچ درخواست اعتراض فعالی برای این پرونده ثبت نشده است.',
      );
    }
    targetAppealId = modCase.activeAppealId;
  }
  const result = await resolveModerationAppealByIdInStore(store, {
    appealId: targetAppealId,
    reviewerUid: params.reviewerUid,
    reviewerRole: params.reviewerRole,
    decision: params.decision,
    reviewerNoteFa: params.reviewerNoteFa,
    expectedCaseRevision: params.expectedCaseRevision,
  });
  return result.moderationCase;
}
