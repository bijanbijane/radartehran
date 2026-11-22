/**
 * @file server/modules/trust-safety/moderationLifecycleHelpers.ts
 * @description Pure helpers for deterministic hash IDs, strict Case State Machine,
 * authoritative moderation actor roles, Read-before-Write snapshot/mutation planners,
 * and legacy moderation case migration (RT-TS-CRITICAL-026..029).
 */
import crypto from 'node:crypto';
import {
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
  type CommunityDatabaseStore,
  type CommunityTransaction,
  type SocialCollectionName,
} from '../community/communityFirestoreAdapter';
import { resolveAuthoritativeAdminPrincipal } from '../account-admin/accountAdminRepository';
import { appendSocialOutboxEvent } from '../notifications/socialOutboxWorker';
import {
  markSocialFeedProjectionHiddenInTx,
  upsertSocialFeedProjectionInTx,
} from '../search/socialFeedProjection';
import {
  buildTargetModerationMutation,
  resolveModerationTargetInTx,
  type ModerationTargetDescriptor,
  type ModerationTargetType,
  type SocialModerationDecision,
  type TargetMutationPlan,
} from './moderationTargetResolver';

export type { ModerationTargetType, SocialModerationDecision };

export type ModerationCaseStatus =
  | 'OPEN'
  | 'CLAIMED'
  | 'DECIDED'
  | 'ESCALATED'
  | 'APPEALED'
  | 'CLOSED';

export type ModerationActorRole =
  | 'PRIMARY_ADMIN'
  | 'DELEGATED_ADMIN'
  | 'CONTENT_MODERATOR'
  | 'TRUST_SAFETY_REVIEWER';

export interface SocialModerationCaseRecord extends Record<string, unknown> {
  id: string;
  targetType: ModerationTargetType;
  targetId: string;
  status: ModerationCaseStatus;
  reportCount: number;
  activeReportCount: number;
  firstReportedAtIso: string;
  lastReportedAtIso: string;
  revision: number;
  claimedByUid: string | null;
  claimLeaseExpiresAtIso: string | null;
  lastDecision: SocialModerationDecision | null;
  lastDecisionId: string | null;
  lastDecidedByUid: string | null;
  lastDecisionReasonFa: string | null;
  activeAppealId: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SocialModerationAppealRecord extends Record<string, unknown> {
  id: string;
  appealId: string;
  caseId: string;
  appellantUid: string;
  originalDecisionId: string;
  reasonFa: string;
  evidenceRefs: string[];
  status: 'SUBMITTED' | 'UPHELD' | 'OVERTURNED';
  submittedAtIso: string;
  reviewedAtIso: string | null;
  reviewerUid: string | null;
  reviewerRole: ModerationActorRole | null;
  reviewerDecision: 'upheld' | 'overturned' | null;
  reviewerNoteFa: string | null;
  revision: number;
}

export interface SocialModerationEventRecord extends Record<string, unknown> {
  id: string;
  caseId: string;
  targetId: string;
  eventType: 'REPORT_LINKED' | 'CASE_CLAIMED' | 'CASE_DECIDED' | 'APPEAL_SUBMITTED' | 'APPEAL_RESOLVED';
  actorUid: string;
  actorRole: string;
  decision?: SocialModerationDecision | 'upheld' | 'overturned';
  decisionId?: string;
  appealId?: string;
  reasonFa: string;
  createdAtIso: string;
}

export interface ModerationPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const ALLOWED_CASE_STATUS_TRANSITIONS: Record<ModerationCaseStatus, readonly ModerationCaseStatus[]> = {
  OPEN: ['CLAIMED'],
  CLAIMED: ['CLAIMED', 'DECIDED', 'ESCALATED'],
  ESCALATED: ['CLAIMED', 'DECIDED'],
  DECIDED: ['APPEALED'],
  APPEALED: ['CLOSED'],
  CLOSED: [],
};

const DECISION_ALLOWED_ROLES = new Set<ModerationActorRole>([
  'PRIMARY_ADMIN',
  'DELEGATED_ADMIN',
  'CONTENT_MODERATOR',
  'TRUST_SAFETY_REVIEWER',
]);

const APPEAL_REVIEW_ALLOWED_ROLES = new Set<ModerationActorRole>([
  'PRIMARY_ADMIN',
  'DELEGATED_ADMIN',
  'TRUST_SAFETY_REVIEWER',
]);

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

export function buildCanonicalCaseId(targetType: ModerationTargetType, targetId: string): string {
  return `case_${sha256Hex(`${targetType}\0${targetId}`).slice(0, 40)}`;
}

export function buildLegacyCaseId(targetType: string, targetId: string): string {
  return `case_${targetType}_${targetId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

export function buildActiveReportLockId(
  reporterUid: string,
  targetType: ModerationTargetType,
  targetId: string,
): string {
  return `arl_${sha256Hex(`${reporterUid}\0${targetType}\0${targetId}`).slice(0, 40)}`;
}

export function buildReportIdempotencyDocId(reporterUid: string, idempotencyKey: string): string {
  return `tsrep_${sha256Hex(`${reporterUid}\0${idempotencyKey}`).slice(0, 40)}`;
}

export function computeReportPayloadHash(params: {
  targetType: ModerationTargetType;
  targetId: string;
  reason: string;
  detailsFa: string;
}): string {
  return sha256Hex(JSON.stringify([params.targetType, params.targetId, params.reason, params.detailsFa]));
}

export function validateCaseStatusTransition(
  current: ModerationCaseStatus,
  next: ModerationCaseStatus,
): void {
  const allowed = ALLOWED_CASE_STATUS_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new CommunityHttpError(
      409,
      'INVALID_CASE_STATUS_TRANSITION',
      `انتقال وضعیت پرونده نظارتی از «${current}» به «${next}» مجاز نیست.`,
      { currentStatus: current, targetStatus: next },
    );
  }
}

export function normalizeAndValidateActorRole(
  rawRole: string,
  scope: 'decision' | 'appeal_review',
): ModerationActorRole {
  const upper = String(rawRole || '').trim().toUpperCase();
  const aliasMap: Record<string, ModerationActorRole> = {
    PRIMARY_ADMIN: 'PRIMARY_ADMIN',
    SUPER_ADMIN: 'PRIMARY_ADMIN',
    DELEGATED_ADMIN: 'DELEGATED_ADMIN',
    ADMIN: 'DELEGATED_ADMIN',
    CONTENT_MODERATOR: 'CONTENT_MODERATOR',
    TRUST_SAFETY_REVIEWER: 'TRUST_SAFETY_REVIEWER',
  };
  const resolved = aliasMap[upper];
  const allowed = scope === 'appeal_review' ? APPEAL_REVIEW_ALLOWED_ROLES : DECISION_ALLOWED_ROLES;
  if (!resolved || !allowed.has(resolved)) {
    throw new CommunityHttpError(
      403,
      'FORBIDDEN_MODERATION_ROLE',
      `نقش «${rawRole || 'unknown'}» مجوز اجرای این عملیات نظارتی را ندارد.`,
    );
  }
  return resolved;
}

export function resolveAuthoritativeModerationRole(auth: {
  uid?: string;
  email?: string;
  reason?: string;
  role?: string;
}): ModerationActorRole {
  if (auth.role) {
    return normalizeAndValidateActorRole(auth.role, 'decision');
  }
  if (auth.reason === 'AUTHORIZED_BOOTSTRAP_ADMIN' || auth.reason === 'AUTHORIZED_SERVER_SECRET') {
    return 'PRIMARY_ADMIN';
  }
  const principal = resolveAuthoritativeAdminPrincipal({
    uid: auth.uid,
    email: auth.email,
    authReason: auth.reason || 'AUTHORIZED_DELEGATED_ADMIN',
  });
  if (principal.isPrimaryBootstrapAdmin || principal.role === 'super_admin') return 'PRIMARY_ADMIN';
  if (principal.role === 'content_moderator') return 'CONTENT_MODERATOR';
  if (principal.role === 'security_auditor' || principal.role === 'service_verifier') return 'TRUST_SAFETY_REVIEWER';
  return 'DELEGATED_ADMIN';
}

export interface ModerationDecisionSnapshot {
  modCase: SocialModerationCaseRecord;
  target: ModerationTargetDescriptor;
  activeReports: Array<Record<string, unknown> & { id: string }>;
  activeReportLockIds: string[];
  existingAppeals: Array<SocialModerationAppealRecord & { id: string }>;
}

export interface ModerationDecisionMutations {
  updatedCase: SocialModerationCaseRecord;
  targetMutation: TargetMutationPlan | null;
  reportUpdates: Array<{ id: string; status: 'dismissed' | 'resolved' }>;
  lockIdsToRelease: string[];
  eventDoc: SocialModerationEventRecord;
  outboxEvent: {
    eventId: string;
    eventType: 'social.moderation.decided.v1';
    targetId: string;
    actorUid: string;
    recipientUids: string[];
    payloadSummaryFa: string;
  } | null;
}

/**
 * Pure READ-PHASE snapshot loader for applyDecision().
 * Executes zero writes so Native Firestore Admin Transaction ordering is guaranteed.
 */
export async function readModerationSnapshot(
  tx: CommunityTransaction,
  params: { caseId: string },
): Promise<ModerationDecisionSnapshot> {
  const modCase = await tx.get<SocialModerationCaseRecord>(SOCIAL_COLLECTIONS.moderationCases, params.caseId);
  if (!modCase) {
    throw new CommunityHttpError(404, 'MODERATION_CASE_NOT_FOUND', 'پرونده نظارتی یافت نشد.');
  }

  const target = await resolveModerationTargetInTx(tx, modCase.targetType, modCase.targetId);

  const allCaseReports = tx.query
    ? await tx.query<Record<string, unknown>>(SOCIAL_COLLECTIONS.reports, {
        filters: [{ field: 'caseId', op: '==', value: params.caseId }],
      })
    : [];

  const activeReports = allCaseReports.filter(
    (r) => !['dismissed', 'resolved'].includes(String(r.status || '')),
  );

  // Read existing active report lock docs in READ_PHASE so we only update/release existing locks
  const activeReportLockIds: string[] = [];
  for (const rep of activeReports) {
    const reporterUid = typeof rep.reporterUserId === 'string' ? rep.reporterUserId : '';
    if (!reporterUid) continue;
    const lockId = buildActiveReportLockId(reporterUid, modCase.targetType, modCase.targetId);
    const lockDoc = await tx.get<Record<string, unknown>>(SOCIAL_COLLECTIONS.activeReportLocks, lockId);
    if (lockDoc) activeReportLockIds.push(lockId);
  }

  const existingAppeals = tx.query
    ? await tx.query<SocialModerationAppealRecord>(SOCIAL_COLLECTIONS.moderationAppeals, {
        filters: [{ field: 'caseId', op: '==', value: params.caseId }],
      })
    : [];

  return { modCase, target, activeReports, activeReportLockIds, existingAppeals };
}

export function validateModerationSnapshot(
  snapshot: ModerationDecisionSnapshot,
  params: {
    adminUid: string;
    actorRole: string;
    decision: SocialModerationDecision;
    expectedRevision?: number;
  },
  nowMs: number,
): ModerationActorRole {
  const resolvedRole = normalizeAndValidateActorRole(params.actorRole, 'decision');
  const { modCase, target } = snapshot;

  const nextStatus: ModerationCaseStatus = params.decision === 'escalate' ? 'ESCALATED' : 'DECIDED';
  validateCaseStatusTransition(modCase.status, nextStatus);

  if (typeof params.expectedRevision === 'number') {
    const currentRev = typeof modCase.revision === 'number' ? modCase.revision : 1;
    if (currentRev !== params.expectedRevision) {
      throw new CommunityHttpError(
        409,
        'CASE_REVISION_CONFLICT',
        'نسخه پرونده تغییر کرده است (CAS conflict). لطفاً پرونده را مجدداً بارگذاری کنید.',
        { expectedRevision: params.expectedRevision, actualRevision: currentRev },
      );
    }
  }

  const leaseActive = modCase.claimLeaseExpiresAtIso
    ? Date.parse(modCase.claimLeaseExpiresAtIso) > nowMs
    : false;
  if (modCase.claimedByUid && modCase.claimedByUid !== params.adminUid && leaseActive) {
    throw new CommunityHttpError(409, 'CASE_CLAIM_CONFLICT', 'پرونده توسط ناظر دیگری قفل شده است.');
  }

  if (!target.supportedActions.includes(params.decision)) {
    throw new CommunityHttpError(
      409,
      'UNSUPPORTED_ACTION_FOR_TARGET_TYPE',
      `تصمیم «${params.decision}» برای هدف «${target.targetType}» مجاز نیست.`,
    );
  }

  return resolvedRole;
}

export function buildModerationMutations(
  snapshot: ModerationDecisionSnapshot,
  params: {
    caseId: string;
    adminUid: string;
    resolvedRole: ModerationActorRole;
    decision: SocialModerationDecision;
    reasonFa: string;
  },
  nowIso: string,
): ModerationDecisionMutations {
  const { modCase, target, activeReports, activeReportLockIds } = snapshot;
  const targetMutation = buildTargetModerationMutation(target, params.decision, nowIso);
  const nextStatus: ModerationCaseStatus = params.decision === 'escalate' ? 'ESCALATED' : 'DECIDED';
  const decisionId = `dec_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const nextRevision = (typeof modCase.revision === 'number' ? modCase.revision : 1) + 1;

  const reportResolutionStatus: 'dismissed' | 'resolved' =
    params.decision === 'dismiss' ? 'dismissed' : 'resolved';
  const shouldCloseReports = params.decision !== 'escalate';

  const updatedCase: SocialModerationCaseRecord = {
    ...modCase,
    status: nextStatus,
    activeReportCount: shouldCloseReports ? 0 : modCase.activeReportCount,
    revision: nextRevision,
    claimedByUid: params.adminUid,
    claimLeaseExpiresAtIso: null,
    lastDecision: params.decision,
    lastDecisionId: decisionId,
    lastDecidedByUid: params.adminUid,
    lastDecisionReasonFa: params.reasonFa,
    updatedAtIso: nowIso,
  };
  // Ensure legacy reportIds array is never written back
  delete (updatedCase as Record<string, unknown>).reportIds;

  const evId = `mev_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const eventDoc: SocialModerationEventRecord = {
    id: evId,
    caseId: params.caseId,
    targetId: modCase.targetId,
    eventType: 'CASE_DECIDED',
    actorUid: params.adminUid,
    actorRole: params.resolvedRole,
    decision: params.decision,
    decisionId,
    reasonFa: params.reasonFa,
    createdAtIso: nowIso,
  };

  const outboxEvent = target.targetOwnerUid
    ? {
        eventId: `${params.caseId}_${decisionId}`,
        eventType: 'social.moderation.decided.v1' as const,
        targetId: modCase.targetId,
        actorUid: params.adminUid,
        recipientUids: [target.targetOwnerUid],
        payloadSummaryFa: 'تصمیم نظارتی روی محتوای انجمن ثبت شد',
      }
    : null;

  return {
    updatedCase,
    targetMutation,
    reportUpdates: shouldCloseReports
      ? activeReports.map((r) => ({ id: r.id, status: reportResolutionStatus }))
      : [],
    lockIdsToRelease: shouldCloseReports ? activeReportLockIds : [],
    eventDoc,
    outboxEvent,
  };
}

/**
 * Pure WRITE-PHASE applier: performs zero reads.
 */
export function applyModerationMutations(
  tx: CommunityTransaction,
  mutations: ModerationDecisionMutations,
  nowIso: string,
): void {
  if (mutations.targetMutation) {
    tx.update(
      mutations.targetMutation.collection as SocialCollectionName,
      mutations.targetMutation.docId,
      mutations.targetMutation.patch,
    );
    if (mutations.targetMutation.feedProjectionAction === 'HIDE' && mutations.targetMutation.projectedDoc) {
      markSocialFeedProjectionHiddenInTx(tx, mutations.targetMutation.docId, mutations.targetMutation.projectedDoc, nowIso);
    } else if (mutations.targetMutation.feedProjectionAction === 'UPSERT' && mutations.targetMutation.projectedDoc) {
      upsertSocialFeedProjectionInTx(tx, mutations.targetMutation.projectedDoc, nowIso);
    }
  }

  for (const rep of mutations.reportUpdates) {
    tx.update(SOCIAL_COLLECTIONS.reports, rep.id, {
      status: rep.status,
      updatedAtIso: nowIso,
    });
  }

  for (const lockId of mutations.lockIdsToRelease) {
    tx.delete(SOCIAL_COLLECTIONS.activeReportLocks, lockId);
  }

  tx.set(SOCIAL_COLLECTIONS.moderationCases, mutations.updatedCase.id, mutations.updatedCase);
  tx.set(SOCIAL_COLLECTIONS.moderationEvents, mutations.eventDoc.id, mutations.eventDoc);

  if (mutations.outboxEvent) {
    appendSocialOutboxEvent(tx, mutations.outboxEvent);
  }
}

export { migrateLegacyModerationCases } from './moderationLegacyMigration';

