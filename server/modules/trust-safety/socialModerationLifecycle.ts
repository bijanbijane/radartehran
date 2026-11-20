/**
 * @file server/modules/trust-safety/socialModerationLifecycle.ts
 * @description RT-TS-CRITICAL-026..029 — Native-Firestore-Compliant Moderation Case Lifecycle:
 *  - Strict READ_PHASE -> WRITE_PHASE ordering in every transaction (submitReport, claimCase, applyDecision, submitAppeal, resolveAppeal)
 *  - Transactional Request Idempotency (409 on payload mismatch) + Active Report Uniqueness
 *  - Collision-free deterministic Case IDs (`case_${sha256(targetType + '\0' + targetId).slice(0, 40)}`)
 *  - Bounded case document (no unbounded `reportIds[]`; atomic `reportCount` / `activeReportCount`)
 *  - Cursor-paginated `listCases()`, `listCaseEvents()`, `listCaseReports()`
 *  - Authoritative Target Resolver, explicit Case Status State Machine with Revision CAS, and Appeal + SoD Lifecycle
 */
import crypto from 'node:crypto';
import { sanitizeInput } from '../../../src/utils/security';
import {
  clampCommunityLimit,
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
  type CommunityDatabaseStore,
  type CommunityQueryFilter,
} from '../community/communityFirestoreAdapter';
import { communityUnifiedRepository } from '../community/communityUnifiedRepository';
import {
  assertValidModerationTargetType,
  resolveModerationTargetInTx,
  validateModerationTargetId,
  type ModerationTargetType,
  type SocialModerationDecision,
} from './moderationTargetResolver';
import {
  resolveModerationAppealByIdInStore,
  resolveModerationAppealWithSoDInStore,
  submitModerationAppealInStore,
} from './moderationAppealLifecycle';
import {
  applyModerationMutations,
  buildActiveReportLockId,
  buildCanonicalCaseId,
  buildModerationMutations,
  buildReportIdempotencyDocId,
  computeReportPayloadHash,
  migrateLegacyModerationCases,
  normalizeAndValidateActorRole,
  readModerationSnapshot,
  validateCaseStatusTransition,
  validateModerationSnapshot,
  type ModerationActorRole,
  type ModerationCaseStatus,
  type ModerationPage,
  type SocialModerationAppealRecord,
  type SocialModerationCaseRecord,
  type SocialModerationEventRecord,
} from './moderationLifecycleHelpers';

export {
  buildActiveReportLockId,
  buildCanonicalCaseId,
  migrateLegacyModerationCases,
  readModerationSnapshot,
  validateModerationSnapshot,
  buildModerationMutations,
  applyModerationMutations,
  type ModerationActorRole,
  type ModerationCaseStatus,
  type ModerationPage,
  type SocialModerationAppealRecord,
  type SocialModerationCaseRecord,
  type SocialModerationEventRecord,
  type SocialModerationDecision,
  type ModerationTargetType,
};

export interface SubmitReportResult {
  report: Record<string, unknown>;
  moderationCase: SocialModerationCaseRecord;
  replayed?: boolean;
}

export class SocialModerationLifecycleService {
  constructor(private readonly getStore: () => CommunityDatabaseStore = () => communityUnifiedRepository.getStore()) {}

  async submitReport(params: {
    reporterUid: string;
    targetType: ModerationTargetType | string;
    targetId: string;
    reason: string;
    detailsFa: string;
    idempotencyKey?: string;
  }): Promise<SubmitReportResult> {
    const store = this.getStore();
    const targetType = assertValidModerationTargetType(params.targetType);
    const targetId = validateModerationTargetId(params.targetId);
    const reason = sanitizeInput(params.reason || 'other', 40).trim() || 'other';
    const detailsFa = sanitizeInput(params.detailsFa, 400).trim();
    if (detailsFa.length < 5) {
      throw new CommunityHttpError(
        400,
        'INVALID_MODERATION_REPORT',
        'شرح مستند تخلف (حداقل ۵ کاراکتر) الزامی است.',
      );
    }

    const cleanIdemKey = typeof params.idempotencyKey === 'string' ? params.idempotencyKey.trim() : '';
    const caseId = buildCanonicalCaseId(targetType, targetId);
    const activeLockId = buildActiveReportLockId(params.reporterUid, targetType, targetId);
    const idemDocId = cleanIdemKey ? buildReportIdempotencyDocId(params.reporterUid, cleanIdemKey) : null;
    const payloadHash = computeReportPayloadHash({ targetType, targetId, reason, detailsFa });
    const nowIso = new Date().toISOString();

    return store.runTransaction(async (tx) => {
      // === STRICT READ PHASE (Zero writes before all reads finish) ===
      const existingCase = await tx.get<SocialModerationCaseRecord>(SOCIAL_COLLECTIONS.moderationCases, caseId);
      const activeLock = await tx.get<Record<string, unknown>>(SOCIAL_COLLECTIONS.activeReportLocks, activeLockId);
      const existingIdem = idemDocId
        ? await tx.get<Record<string, unknown>>(SOCIAL_COLLECTIONS.idempotency, idemDocId)
        : null;
      const targetDescriptor = await resolveModerationTargetInTx(tx, targetType, targetId);

      // === VALIDATION PHASE ===
      if (existingIdem) {
        if (existingIdem.payloadHash !== payloadHash) {
          throw new CommunityHttpError(
            409,
            'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
            'کلید یکتای درخواست (Idempotency-Key) قبلاً با محتوای متفاوت استفاده شده است.',
          );
        }
        return {
          report: (existingIdem.report as Record<string, unknown>) ?? {},
          moderationCase: (existingIdem.moderationCase as SocialModerationCaseRecord) ?? (existingCase as SocialModerationCaseRecord),
          replayed: true,
        };
      }

      if (activeLock && activeLock.status === 'ACTIVE') {
        throw new CommunityHttpError(
          409,
          'DUPLICATE_ACTIVE_REPORT',
          'شما قبلاً گزارش فعالی برای این محتوا ثبت کرده‌اید.',
        );
      }

      // === STRICT WRITE PHASE ===
      const reportId = `rep_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const reportDoc: Record<string, unknown> = {
        id: reportId,
        recordKind: 'report',
        targetType,
        targetId,
        targetCollection: targetDescriptor.targetCollection,
        reporterUserId: params.reporterUid,
        reason,
        detailsFa,
        caseId,
        status: 'submitted',
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };

      const nextCase: SocialModerationCaseRecord = existingCase
        ? {
            ...existingCase,
            status: existingCase.status === 'CLOSED' ? 'OPEN' : existingCase.status,
            reportCount: Number(existingCase.reportCount ?? 0) + 1,
            activeReportCount: Number(existingCase.activeReportCount ?? 0) + 1,
            firstReportedAtIso: existingCase.firstReportedAtIso || existingCase.createdAtIso || nowIso,
            lastReportedAtIso: nowIso,
            revision: (typeof existingCase.revision === 'number' ? existingCase.revision : 1) + 1,
            updatedAtIso: nowIso,
          }
        : {
            id: caseId,
            targetType,
            targetId,
            status: 'OPEN',
            reportCount: 1,
            activeReportCount: 1,
            firstReportedAtIso: nowIso,
            lastReportedAtIso: nowIso,
            revision: 1,
            claimedByUid: null,
            claimLeaseExpiresAtIso: null,
            lastDecision: null,
            lastDecisionId: null,
            lastDecidedByUid: null,
            lastDecisionReasonFa: null,
            activeAppealId: null,
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
          };
      delete (nextCase as Record<string, unknown>).reportIds;

      const evId = `mev_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const eventDoc: SocialModerationEventRecord = {
        id: evId,
        caseId,
        targetId,
        eventType: 'REPORT_LINKED',
        actorUid: params.reporterUid,
        actorRole: 'verified_user',
        reasonFa: detailsFa.slice(0, 120),
        createdAtIso: nowIso,
      };

      tx.set(SOCIAL_COLLECTIONS.reports, reportId, reportDoc);
      tx.set(SOCIAL_COLLECTIONS.activeReportLocks, activeLockId, {
        id: activeLockId,
        status: 'ACTIVE',
        reportId,
        caseId,
        targetType,
        createdAtIso: nowIso,
      });
      tx.set(SOCIAL_COLLECTIONS.moderationCases, caseId, nextCase);
      tx.set(SOCIAL_COLLECTIONS.moderationEvents, evId, eventDoc);

      if (idemDocId) {
        tx.set(SOCIAL_COLLECTIONS.idempotency, idemDocId, {
          id: idemDocId,
          scope: 'trust_safety_report',
          payloadHash,
          report: reportDoc,
          moderationCase: nextCase,
          createdAtIso: nowIso,
        });
      }

      return { report: reportDoc, moderationCase: nextCase, replayed: false };
    });
  }

  async listCases(options?: {
    status?: ModerationCaseStatus | string;
    limit?: number;
    cursor?: string | null;
    sortDirection?: 'asc' | 'desc';
  }): Promise<ModerationPage<SocialModerationCaseRecord>> {
    const filters: CommunityQueryFilter[] = [];
    if (options?.status && typeof options.status === 'string' && options.status.trim()) {
      filters.push({ field: 'status', op: '==', value: options.status.trim().toUpperCase() });
    }
    const page = await this.getStore().queryDocs<SocialModerationCaseRecord>(SOCIAL_COLLECTIONS.moderationCases, {
      filters,
      orderByField: 'updatedAtIso',
      orderDirection: options?.sortDirection === 'asc' ? 'asc' : 'desc',
      limit: clampCommunityLimit(options?.limit ?? 20),
      cursorDocId: options?.cursor ?? null,
    });
    return {
      items: page.items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async listCaseReports(
    caseId: string,
    options?: { limit?: number; cursor?: string | null; sortDirection?: 'asc' | 'desc' },
  ): Promise<ModerationPage<Record<string, unknown>>> {
    const page = await this.getStore().queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.reports, {
      filters: [{ field: 'caseId', op: '==', value: caseId }],
      orderByField: 'createdAtIso',
      orderDirection: options?.sortDirection === 'asc' ? 'asc' : 'desc',
      limit: clampCommunityLimit(options?.limit ?? 20),
      cursorDocId: options?.cursor ?? null,
    });
    return { items: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore };
  }

  async claimCase(
    caseId: string,
    adminUid: string,
    leaseMs = 5 * 60_000,
    actorRole: ModerationActorRole | string = 'DELEGATED_ADMIN',
  ): Promise<SocialModerationCaseRecord> {
    const resolvedRole = normalizeAndValidateActorRole(actorRole, 'decision');
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresIso = new Date(nowMs + Math.max(30_000, leaseMs)).toISOString();

    return this.getStore().runTransaction(async (tx) => {
      const modCase = await tx.get<SocialModerationCaseRecord>(SOCIAL_COLLECTIONS.moderationCases, caseId);
      if (!modCase) throw new CommunityHttpError(404, 'MODERATION_CASE_NOT_FOUND', 'پرونده نظارتی یافت نشد.');

      validateCaseStatusTransition(modCase.status, 'CLAIMED');

      const leaseActive = modCase.claimLeaseExpiresAtIso ? Date.parse(modCase.claimLeaseExpiresAtIso) > nowMs : false;
      if (modCase.claimedByUid && modCase.claimedByUid !== adminUid && leaseActive) {
        throw new CommunityHttpError(409, 'CASE_CLAIM_CONFLICT', 'این پرونده هم‌اکنون در اختیار ناظر دیگری است.');
      }

      const updated: SocialModerationCaseRecord = {
        ...modCase,
        status: 'CLAIMED',
        revision: (typeof modCase.revision === 'number' ? modCase.revision : 1) + 1,
        claimedByUid: adminUid,
        claimLeaseExpiresAtIso: expiresIso,
        updatedAtIso: nowIso,
      };
      delete (updated as Record<string, unknown>).reportIds;
      tx.set(SOCIAL_COLLECTIONS.moderationCases, caseId, updated);

      const evId = `mev_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      tx.set(SOCIAL_COLLECTIONS.moderationEvents, evId, {
        id: evId,
        caseId,
        targetId: modCase.targetId,
        eventType: 'CASE_CLAIMED',
        actorUid: adminUid,
        actorRole: resolvedRole,
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
    expectedRevision?: number;
  }): Promise<SocialModerationCaseRecord> {
    const reasonFa = sanitizeInput(params.reasonFa, 300).trim();
    if (reasonFa.length < 5) {
      throw new CommunityHttpError(
        400,
        'INVALID_DECISION_REASON',
        'ثبت دلیل تصمیم نظارتی (حداقل ۵ کاراکتر) الزامی است.',
      );
    }
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    return this.getStore().runTransaction(async (tx) => {
      // 1. READ PHASE (all reads strictly completed before any write)
      const snapshot = await readModerationSnapshot(tx, { caseId: params.caseId });
      // 2. VALIDATE PHASE
      const resolvedRole = validateModerationSnapshot(snapshot, params, nowMs);
      // 3. BUILD PURE MUTATION PLAN
      const mutations = buildModerationMutations(
        snapshot,
        {
          caseId: params.caseId,
          adminUid: params.adminUid,
          resolvedRole,
          decision: params.decision,
          reasonFa,
        },
        nowIso,
      );
      // 4. WRITE PHASE (zero reads)
      applyModerationMutations(tx, mutations, nowIso);
      return mutations.updatedCase;
    });
  }

  async submitAppeal(params: {
    caseId: string;
    appellantUid: string;
    reasonFa: string;
    evidenceRefs?: string[];
    isPolicyAuthorized?: boolean;
  }): Promise<{ appeal: SocialModerationAppealRecord; moderationCase: SocialModerationCaseRecord }> {
    return submitModerationAppealInStore(this.getStore(), params);
  }

  async resolveAppealById(params: {
    appealId: string;
    reviewerUid: string;
    reviewerRole: string;
    decision: 'upheld' | 'overturned';
    reviewerNoteFa: string;
    expectedCaseRevision?: number;
  }): Promise<{ appeal: SocialModerationAppealRecord; moderationCase: SocialModerationCaseRecord }> {
    return resolveModerationAppealByIdInStore(this.getStore(), params);
  }

  async resolveAppealWithSoD(params: {
    caseId: string;
    appealId?: string;
    reviewerUid: string;
    reviewerRole: string;
    decision: 'upheld' | 'overturned';
    reviewerNoteFa: string;
    expectedCaseRevision?: number;
  }): Promise<SocialModerationCaseRecord> {
    return resolveModerationAppealWithSoDInStore(this.getStore(), params);
  }


  async listCaseEvents(
    caseId: string,
    options?: { limit?: number; cursor?: string | null; sortDirection?: 'asc' | 'desc' },
  ): Promise<ModerationPage<SocialModerationEventRecord>> {
    const page = await this.getStore().queryDocs<SocialModerationEventRecord>(SOCIAL_COLLECTIONS.moderationEvents, {
      filters: [{ field: 'caseId', op: '==', value: caseId }],
      orderByField: 'createdAtIso',
      orderDirection: options?.sortDirection === 'asc' ? 'asc' : 'desc',
      limit: clampCommunityLimit(options?.limit ?? 20),
      cursorDocId: options?.cursor ?? null,
    });
    return {
      items: page.items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }
}

export const defaultSocialModerationLifecycle = new SocialModerationLifecycleService();
