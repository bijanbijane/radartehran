/** @file server/modules/trust-safety/socialModerationLifecycle.ts — Stage 5 Unified Moderation Case, Claim Lock, Soft-Delete Enforcement & SoD Appeal Lifecycle */
import crypto from 'node:crypto';
import { sanitizeInput } from '../../../src/utils/security';
import {
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
  type CommunityDatabaseStore,
} from '../community/communityFirestoreAdapter';
import { communityUnifiedRepository } from '../community/communityUnifiedRepository';
import { appendSocialOutboxEvent } from '../notifications/socialOutboxWorker';
import {
  markSocialFeedProjectionHiddenInTx,
  upsertSocialFeedProjectionInTx,
} from '../search/socialFeedProjection';

export type SocialModerationDecision =
  | 'dismiss'
  | 'hide'
  | 'lock'
  | 'soft_delete'
  | 'warn_author'
  | 'escalate';

export interface SocialModerationCaseRecord extends Record<string, unknown> {
  id: string;
  targetType: 'discussion_post' | 'question' | 'comment' | 'user';
  targetId: string;
  status: 'OPEN' | 'CLAIMED' | 'DECIDED' | 'ESCALATED' | 'APPEALED' | 'CLOSED';
  reportIds: string[];
  reportCount: number;
  claimedByUid: string | null;
  claimLeaseExpiresAtIso: string | null;
  lastDecision: SocialModerationDecision | null;
  lastDecidedByUid: string | null;
  lastDecisionReasonFa: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SocialModerationEventRecord extends Record<string, unknown> {
  id: string;
  caseId: string;
  targetId: string;
  eventType: 'REPORT_LINKED' | 'CASE_CLAIMED' | 'CASE_DECIDED' | 'APPEAL_SUBMITTED' | 'APPEAL_RESOLVED';
  actorUid: string;
  actorRole: string;
  decision?: SocialModerationDecision | 'upheld' | 'overturned';
  reasonFa: string;
  createdAtIso: string;
}

export class SocialModerationLifecycleService {
  constructor(private readonly getStore: () => CommunityDatabaseStore = () => communityUnifiedRepository.getStore()) {}

  async submitReport(params: {
    reporterUid: string;
    targetType: SocialModerationCaseRecord['targetType'];
    targetId: string;
    reason: string;
    detailsFa: string;
  }): Promise<{ report: Record<string, unknown>; moderationCase: SocialModerationCaseRecord }> {
    const store = this.getStore();
    const targetId = sanitizeInput(params.targetId, 80).trim();
    const detailsFa = sanitizeInput(params.detailsFa, 400).trim();
    if (!targetId || detailsFa.length < 5) {
      throw new CommunityHttpError(400, 'INVALID_MODERATION_REPORT', 'شناسه هدف و شرح مستند تخلف (حداقل ۵ کاراکتر) الزامی است.');
    }
    const existingReports = await store.queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.reports, {
      filters: [
        { field: 'recordKind', op: '==', value: 'report' },
        { field: 'targetId', op: '==', value: targetId },
      ],
      limit: 50,
    });
    const dup = existingReports.items.find(
      (r) => r.reporterUserId === params.reporterUid && !['dismissed', 'resolved'].includes(String(r.status || '')),
    );
    if (dup) {
      throw new CommunityHttpError(409, 'DUPLICATE_ACTIVE_REPORT', 'شما قبلاً گزارش فعالی برای این محتوا ثبت کرده‌اید.');
    }

    const nowIso = new Date().toISOString();
    const reportId = `rep_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const caseId = `case_${params.targetType}_${targetId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);

    return store.runTransaction(async (tx) => {
      const reportDoc = {
        id: reportId,
        recordKind: 'report',
        targetType: params.targetType,
        targetId,
        reporterUserId: params.reporterUid,
        reason: sanitizeInput(params.reason || 'other', 40),
        detailsFa,
        caseId,
        status: 'submitted',
        createdAtIso: nowIso,
      };
      tx.set(SOCIAL_COLLECTIONS.reports, reportId, reportDoc);

      const existingCase = await tx.get<SocialModerationCaseRecord>(SOCIAL_COLLECTIONS.moderationCases, caseId);
      const nextCase: SocialModerationCaseRecord = existingCase
        ? {
            ...existingCase,
            reportIds: [...existingCase.reportIds, reportId],
            reportCount: existingCase.reportCount + 1,
            updatedAtIso: nowIso,
          }
        : {
            id: caseId,
            targetType: params.targetType,
            targetId,
            status: 'OPEN',
            reportIds: [reportId],
            reportCount: 1,
            claimedByUid: null,
            claimLeaseExpiresAtIso: null,
            lastDecision: null,
            lastDecidedByUid: null,
            lastDecisionReasonFa: null,
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
          };
      tx.set(SOCIAL_COLLECTIONS.moderationCases, caseId, nextCase);

      const evId = `mev_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      tx.set(SOCIAL_COLLECTIONS.moderationEvents, evId, {
        id: evId,
        caseId,
        targetId,
        eventType: 'REPORT_LINKED',
        actorUid: params.reporterUid,
        actorRole: 'verified_user',
        reasonFa: detailsFa.slice(0, 120),
        createdAtIso: nowIso,
      });

      return { report: reportDoc, moderationCase: nextCase };
    });
  }

  async listCases(statusFilter?: string) {
    const page = await this.getStore().queryDocs<SocialModerationCaseRecord>(SOCIAL_COLLECTIONS.moderationCases, {
      orderByField: 'updatedAtIso',
      orderDirection: 'desc',
      limit: 50,
    });
    return statusFilter ? page.items.filter((c) => c.status === statusFilter) : page.items;
  }

  async claimCase(caseId: string, adminUid: string, leaseMs = 5 * 60_000): Promise<SocialModerationCaseRecord> {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresIso = new Date(nowMs + Math.max(30_000, leaseMs)).toISOString();

    return this.getStore().runTransaction(async (tx) => {
      const modCase = await tx.get<SocialModerationCaseRecord>(SOCIAL_COLLECTIONS.moderationCases, caseId);
      if (!modCase) throw new CommunityHttpError(404, 'MODERATION_CASE_NOT_FOUND', 'پرونده نظارتی یافت نشد.');

      const leaseActive = modCase.claimLeaseExpiresAtIso ? Date.parse(modCase.claimLeaseExpiresAtIso) > nowMs : false;
      if (modCase.claimedByUid && modCase.claimedByUid !== adminUid && leaseActive) {
        throw new CommunityHttpError(409, 'CASE_CLAIM_CONFLICT', 'این پرونده هم‌اکنون در اختیار ناظر دیگری است.');
      }

      const updated: SocialModerationCaseRecord = {
        ...modCase,
        status: modCase.status === 'OPEN' ? 'CLAIMED' : modCase.status,
        claimedByUid: adminUid,
        claimLeaseExpiresAtIso: expiresIso,
        updatedAtIso: nowIso,
      };
      tx.set(SOCIAL_COLLECTIONS.moderationCases, caseId, updated);

      const evId = `mev_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      tx.set(SOCIAL_COLLECTIONS.moderationEvents, evId, {
        id: evId,
        caseId,
        targetId: modCase.targetId,
        eventType: 'CASE_CLAIMED',
        actorUid: adminUid,
        actorRole: 'admin',
        reasonFa: 'تخصیص پرونده به ناظر جهت بررسی',
        createdAtIso: nowIso,
      });
      return updated;
    });
  }

  async applyDecision(params: {
    caseId: string;
    adminUid: string;
    actorRole: string;
    decision: SocialModerationDecision;
    reasonFa: string;
  }): Promise<SocialModerationCaseRecord> {
    const reasonFa = sanitizeInput(params.reasonFa, 300).trim();
    if (reasonFa.length < 5) {
      throw new CommunityHttpError(400, 'INVALID_DECISION_REASON', 'ثبت دلیل تصمیم نظارتی (حداقل ۵ کاراکتر) الزامی است.');
    }
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    return this.getStore().runTransaction(async (tx) => {
      const modCase = await tx.get<SocialModerationCaseRecord>(SOCIAL_COLLECTIONS.moderationCases, params.caseId);
      if (!modCase) throw new CommunityHttpError(404, 'MODERATION_CASE_NOT_FOUND', 'پرونده نظارتی یافت نشد.');
      const leaseActive = modCase.claimLeaseExpiresAtIso ? Date.parse(modCase.claimLeaseExpiresAtIso) > nowMs : false;
      if (modCase.claimedByUid && modCase.claimedByUid !== params.adminUid && leaseActive) {
        throw new CommunityHttpError(409, 'CASE_CLAIM_CONFLICT', 'پرونده توسط ناظر دیگری قفل شده است.');
      }

      let targetOwnerUid: string | null = null;
      if (
        params.decision === 'hide' ||
        params.decision === 'lock' ||
        params.decision === 'soft_delete' ||
        params.decision === 'warn_author'
      ) {
        const post = await tx.get<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, modCase.targetId);
        if (post) {
          if (typeof post.ownerUserId === 'string' && post.ownerUserId.trim()) {
            targetOwnerUid = post.ownerUserId.trim();
          }
          if (params.decision !== 'warn_author') {
            const nextStatus = params.decision === 'lock' ? 'locked' : 'hidden';
            const nextModStatus =
              params.decision === 'soft_delete'
                ? 'removed'
                : params.decision === 'hide'
                  ? 'hidden'
                  : 'locked';
            tx.update(SOCIAL_COLLECTIONS.posts, modCase.targetId, {
              status: nextStatus,
              moderationStatus: nextModStatus,
              ...(params.decision === 'soft_delete' ? { isDeleted: true, deletedAtIso: nowIso } : {}),
              updatedAtIso: nowIso,
            });
            if (params.decision === 'hide' || params.decision === 'soft_delete') {
              markSocialFeedProjectionHiddenInTx(tx, modCase.targetId, post, nowIso);
            } else {
              upsertSocialFeedProjectionInTx(
                tx,
                {
                  ...post,
                  status: nextStatus,
                  moderationStatus: nextModStatus,
                  updatedAtIso: nowIso,
                },
                nowIso,
              );
            }
          }
        }
      }

      for (const repId of modCase.reportIds) {
        const rep = await tx.get<Record<string, unknown>>(SOCIAL_COLLECTIONS.reports, repId);
        if (rep) {
          tx.update(SOCIAL_COLLECTIONS.reports, repId, {
            status: params.decision === 'dismiss' ? 'dismissed' : 'resolved',
            updatedAtIso: nowIso,
          });
        }
      }

      const nextStatus: SocialModerationCaseRecord['status'] =
        params.decision === 'escalate' ? 'ESCALATED' : 'DECIDED';

      const updatedCase: SocialModerationCaseRecord = {
        ...modCase,
        status: nextStatus,
        claimedByUid: params.adminUid,
        claimLeaseExpiresAtIso: null,
        lastDecision: params.decision,
        lastDecidedByUid: params.adminUid,
        lastDecisionReasonFa: reasonFa,
        updatedAtIso: nowIso,
      };
      tx.set(SOCIAL_COLLECTIONS.moderationCases, params.caseId, updatedCase);

      const evId = `mev_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      tx.set(SOCIAL_COLLECTIONS.moderationEvents, evId, {
        id: evId,
        caseId: params.caseId,
        targetId: modCase.targetId,
        eventType: 'CASE_DECIDED',
        actorUid: params.adminUid,
        actorRole: params.actorRole,
        decision: params.decision,
        reasonFa,
        createdAtIso: nowIso,
      });

      if (targetOwnerUid) {
        appendSocialOutboxEvent(tx, {
          eventId: `${params.caseId}_${params.decision}`,
          eventType: 'social.moderation.decided.v1',
          targetId: modCase.targetId,
          actorUid: params.adminUid,
          recipientUids: [targetOwnerUid],
          payloadSummaryFa: 'تصمیم نظارتی روی محتوای انجمن ثبت شد',
        });
      }

      return updatedCase;
    });
  }

  async resolveAppealWithSoD(params: {
    caseId: string;
    reviewerUid: string;
    reviewerRole: string;
    decision: 'upheld' | 'overturned';
    reviewerNoteFa: string;
  }): Promise<SocialModerationCaseRecord> {
    const noteFa = sanitizeInput(params.reviewerNoteFa, 300).trim();
    if (noteFa.length < 5) {
      throw new CommunityHttpError(400, 'INVALID_REVIEW_NOTE', 'یادداشت بازبینی اعتراض حداقل ۵ کاراکتر است.');
    }
    const nowIso = new Date().toISOString();

    return this.getStore().runTransaction(async (tx) => {
      const modCase = await tx.get<SocialModerationCaseRecord>(SOCIAL_COLLECTIONS.moderationCases, params.caseId);
      if (!modCase) throw new CommunityHttpError(404, 'MODERATION_CASE_NOT_FOUND', 'پرونده نظارتی یافت نشد.');
      if (modCase.lastDecidedByUid && modCase.lastDecidedByUid === params.reviewerUid) {
        throw new CommunityHttpError(409, 'SEPARATION_OF_DUTIES_VIOLATION', 'ناظر صادرکننده تصمیم اولیه مجاز به داوری اعتراض نیست (SoD).');
      }

      if (params.decision === 'overturned') {
        const post = await tx.get<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, modCase.targetId);
        if (post) {
          tx.update(SOCIAL_COLLECTIONS.posts, modCase.targetId, {
            status: 'published',
            moderationStatus: 'approved',
            isDeleted: false,
            deletedAtIso: null,
            updatedAtIso: nowIso,
          });
          upsertSocialFeedProjectionInTx(
            tx,
            {
              ...post,
              status: 'published',
              moderationStatus: 'approved',
              isDeleted: false,
              deletedAtIso: null,
              updatedAtIso: nowIso,
            },
            nowIso,
          );
        }
      }

      const updated: SocialModerationCaseRecord = {
        ...modCase,
        status: 'CLOSED',
        claimLeaseExpiresAtIso: null,
        updatedAtIso: nowIso,
      };
      tx.set(SOCIAL_COLLECTIONS.moderationCases, params.caseId, updated);

      const evId = `mev_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      tx.set(SOCIAL_COLLECTIONS.moderationEvents, evId, {
        id: evId,
        caseId: params.caseId,
        targetId: modCase.targetId,
        eventType: 'APPEAL_RESOLVED',
        actorUid: params.reviewerUid,
        actorRole: params.reviewerRole,
        decision: params.decision,
        reasonFa: noteFa,
        createdAtIso: nowIso,
      });

      return updated;
    });
  }

  async listCaseEvents(caseId: string): Promise<SocialModerationEventRecord[]> {
    const page = await this.getStore().queryDocs<SocialModerationEventRecord>(SOCIAL_COLLECTIONS.moderationEvents, {
      filters: [{ field: 'caseId', op: '==', value: caseId }],
      orderByField: 'createdAtIso',
      orderDirection: 'desc',
      limit: 50,
    });
    return page.items;
  }
}

export const defaultSocialModerationLifecycle = new SocialModerationLifecycleService();
