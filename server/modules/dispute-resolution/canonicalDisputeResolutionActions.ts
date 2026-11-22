/**
 * @file server/modules/dispute-resolution/canonicalDisputeResolutionActions.ts
 * @description RT-DISPUTE-CRITICAL-031 — Settlement proposals, bilateral acceptance,
 * case transitions, non-court resolution outcomes, and redacted case summary reads.
 */
import type { CaseStatus, ResolutionOutcomeType } from './disputeTypes';
import { sanitizeTextFa, validateDisputeTransition } from './disputeValidator';
import {
  CANONICAL_DISPUTE_LEGAL_BOUNDARY,
  DISPUTE_RESOLUTION_COLLECTIONS,
  type CanonicalDisputeActorRole,
  type CanonicalDisputeCaseRecord,
  type CanonicalDisputeCrossModuleAdapters,
  type CanonicalDisputeEvidenceRecord,
  type CanonicalResolutionOutcomeRecord,
  type CanonicalSettlementProposalRecord,
  type CanonicalSettlementRecord,
  type FirestoreDisputeResolutionStore,
} from './firestoreStore';
import {
  CanonicalDisputeError,
  appendDisputeHistoryAndOutbox,
  assertDisputeRevision,
  isNeutralDisputeOfficer,
  makeDisputeId,
  resolveDisputeActorRole,
  sha256DisputeHex,
  type CanonicalDisputeActor,
} from './canonicalDisputeService';

export async function createCanonicalSettlementProposal(
  store: FirestoreDisputeResolutionStore,
  actor: CanonicalDisputeActor,
  caseId: string,
  input: { proposalTermsFa: string; proposedFinancialRemedyRials?: number; validUntilIso: string },
): Promise<CanonicalSettlementProposalRecord> {
  const nowIso = new Date().toISOString();
  return store.runTransaction(async (tx) => {
    const c = await tx.get<CanonicalDisputeCaseRecord>(DISPUTE_RESOLUTION_COLLECTIONS.cases, caseId);
    if (!c) throw new CanonicalDisputeError('CASE_NOT_FOUND', 'پرونده یافت نشد.', 404);
    const role = resolveDisputeActorRole(c, actor);
    if (!role) throw new CanonicalDisputeError('FORBIDDEN_PROPOSAL', 'دسترسی ثبت پیشنهاد سازش وجود ندارد.', 403);
    if (['RESOLVED', 'CLOSED', 'WITHDRAWN'].includes(c.status)) {
      throw new CanonicalDisputeError('CASE_NOT_ACTIVE', 'پرونده بسته است.', 409);
    }
    const proposalId = makeDisputeId('dprop');
    const nextRev = c.revision + 1;
    const proposal: CanonicalSettlementProposalRecord = {
      id: proposalId,
      caseId,
      proposedByUid: actor.uid,
      proposalTermsFa: sanitizeTextFa(input.proposalTermsFa, 2000),
      proposedFinancialRemedyRials:
        typeof input.proposedFinancialRemedyRials === 'number'
          ? Math.max(0, Math.floor(input.proposedFinancialRemedyRials))
          : undefined,
      validUntilIso: input.validUntilIso,
      status: 'PROPOSED',
      acceptedByUids: [],
      requiredPartyUids: [c.claimantUid, c.respondentUid],
      legalBoundary: CANONICAL_DISPUTE_LEGAL_BOUNDARY,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    tx.set(DISPUTE_RESOLUTION_COLLECTIONS.settlementProposals, proposalId, proposal);
    tx.set(DISPUTE_RESOLUTION_COLLECTIONS.cases, caseId, {
      ...c,
      status:
        c.status === 'SUBMITTED' ||
        c.status === 'UNDER_REVIEW' ||
        c.status === 'NEGOTIATION' ||
        c.status === 'MEDIATION'
          ? 'SETTLEMENT_PROPOSED'
          : c.status,
      revision: nextRev,
      updatedAtIso: nowIso,
    });
    appendDisputeHistoryAndOutbox(tx, {
      caseId,
      eventType: 'SETTLEMENT_PROPOSED',
      actorUid: actor.uid,
      actorRole: role,
      descriptionFa: `پیشنهاد سازش ${proposalId} ثبت شد.`,
      caseRevision: nextRev,
      recipients: [c.claimantUid, c.respondentUid].filter((u) => u !== actor.uid),
      nowIso,
    });
    return proposal;
  });
}

export async function acceptCanonicalSettlementProposal(
  store: FirestoreDisputeResolutionStore,
  actor: CanonicalDisputeActor,
  proposalId: string,
  options?: { expectedCaseRevision?: number },
): Promise<{ proposal: CanonicalSettlementProposalRecord; settlement: CanonicalSettlementRecord | null }> {
  const nowIso = new Date().toISOString();
  return store.runTransaction(async (tx) => {
    const prop = await tx.get<CanonicalSettlementProposalRecord>(
      DISPUTE_RESOLUTION_COLLECTIONS.settlementProposals,
      proposalId,
    );
    if (!prop) throw new CanonicalDisputeError('PROPOSAL_NOT_FOUND', 'پیشنهاد سازش یافت نشد.', 404);
    const c = await tx.get<CanonicalDisputeCaseRecord>(DISPUTE_RESOLUTION_COLLECTIONS.cases, prop.caseId);
    if (!c) throw new CanonicalDisputeError('CASE_NOT_FOUND', 'پرونده یافت نشد.', 404);
    assertDisputeRevision(c.revision, options?.expectedCaseRevision);

    const role = resolveDisputeActorRole(c, actor);
    if (role !== 'CLAIMANT' && role !== 'RESPONDENT') {
      throw new CanonicalDisputeError('FORBIDDEN_SETTLEMENT_ACCEPTANCE', 'فقط شاکی یا طرف مقابل مجاز به پذیرش سازش هستند.', 403);
    }
    if (prop.status !== 'PROPOSED' && prop.status !== 'PARTIALLY_ACCEPTED') {
      throw new CanonicalDisputeError('INVALID_PROPOSAL_STATE', `پیشنهاد در وضعیت ${prop.status} قابل پذیرش نیست.`, 409);
    }
    if (Date.parse(prop.validUntilIso) <= Date.now()) {
      throw new CanonicalDisputeError('PROPOSAL_EXPIRED', 'مهلت اعتبار پیشنهاد سازش به پایان رسیده است.', 409);
    }
    if (prop.acceptedByUids.includes(actor.uid)) {
      throw new CanonicalDisputeError('ALREADY_ACCEPTED_BY_PARTY', 'این طرف قبلاً پیشنهاد را پذیرفته است (تک‌طرفه نهایی نمی‌شود).', 409);
    }

    const nextAccepted = [...prop.acceptedByUids, actor.uid];
    const bilateralComplete = prop.requiredPartyUids.every((u) => nextAccepted.includes(u));
    const nextRev = c.revision + 1;

    const updatedProp: CanonicalSettlementProposalRecord = {
      ...prop,
      acceptedByUids: nextAccepted,
      status: bilateralComplete ? 'MUTUALLY_ACCEPTED' : 'PARTIALLY_ACCEPTED',
      updatedAtIso: nowIso,
    };
    tx.set(DISPUTE_RESOLUTION_COLLECTIONS.settlementProposals, prop.id, updatedProp);

    let settlement: CanonicalSettlementRecord | null = null;
    if (bilateralComplete) {
      const settlementId = makeDisputeId('dset');
      settlement = {
        id: settlementId,
        caseId: c.id,
        proposalId: prop.id,
        agreedTermsFa: prop.proposalTermsFa,
        financialSettlementRials: prop.proposedFinancialRemedyRials,
        partyAcceptances: nextAccepted.map((uid) => ({
          partyUid: uid,
          acceptedAtIso: nowIso,
          internalConsentHash: sha256DisputeHex(`${settlementId}:${uid}:${nowIso}`),
        })),
        status: 'BILATERALLY_ACCEPTED',
        legalBoundary: CANONICAL_DISPUTE_LEGAL_BOUNDARY,
        acceptedAtIso: nowIso,
      };
      tx.set(DISPUTE_RESOLUTION_COLLECTIONS.settlements, settlementId, settlement);
      tx.set(DISPUTE_RESOLUTION_COLLECTIONS.cases, c.id, {
        ...c,
        status: 'SETTLEMENT_ACCEPTED',
        activeSettlementId: settlementId,
        revision: nextRev,
        updatedAtIso: nowIso,
      });
    } else {
      tx.set(DISPUTE_RESOLUTION_COLLECTIONS.cases, c.id, { ...c, revision: nextRev, updatedAtIso: nowIso });
    }

    appendDisputeHistoryAndOutbox(tx, {
      caseId: c.id,
      eventType: bilateralComplete ? 'SETTLEMENT_BILATERALLY_ACCEPTED' : 'SETTLEMENT_PARTIALLY_ACCEPTED',
      actorUid: actor.uid,
      actorRole: role,
      descriptionFa: bilateralComplete
        ? 'توافق داخلی با تایید دوطرفه شاکی و طرف مقابل ثبت شد (غیرحکم قضایی).'
        : 'پذیرش یک‌طرفه ثبت شد؛ در انتظار تایید طرف مقابل.',
      fromStatus: c.status,
      toStatus: bilateralComplete ? 'SETTLEMENT_ACCEPTED' : c.status,
      caseRevision: nextRev,
      recipients: [c.claimantUid, c.respondentUid].filter((u) => u !== actor.uid),
      nowIso,
    });
    return { proposal: updatedProp, settlement };
  });
}

export async function transitionCanonicalCaseStatus(
  store: FirestoreDisputeResolutionStore,
  actor: CanonicalDisputeActor,
  caseId: string,
  input: { targetStatus: CaseStatus; reasonFa: string; expectedRevision?: number },
): Promise<CanonicalDisputeCaseRecord> {
  const nowIso = new Date().toISOString();
  return store.runTransaction(async (tx) => {
    const c = await tx.get<CanonicalDisputeCaseRecord>(DISPUTE_RESOLUTION_COLLECTIONS.cases, caseId);
    if (!c) throw new CanonicalDisputeError('CASE_NOT_FOUND', 'پرونده یافت نشد.', 404);
    const role = resolveDisputeActorRole(c, actor);
    if (!role) throw new CanonicalDisputeError('FORBIDDEN_CASE_TRANSITION', 'دسترسی تغییر وضعیت وجود ندارد.', 403);
    assertDisputeRevision(c.revision, input.expectedRevision);

    const check = validateDisputeTransition(c.status, input.targetStatus);
    if (!check.allowed) {
      throw new CanonicalDisputeError('INVALID_CASE_TRANSITION', check.reasonFa || 'انتقال وضعیت غیرمجاز است.', 409);
    }
    if (input.targetStatus === 'SETTLEMENT_ACCEPTED' && !c.activeSettlementId) {
      throw new CanonicalDisputeError(
        'BILATERAL_SETTLEMENT_REQUIRED',
        'تغییر وضعیت به SETTLEMENT_ACCEPTED بدون تایید دوطرفه پیشنهاد سازش ممنوع است.',
        409,
      );
    }

    const nextRev = c.revision + 1;
    const updated: CanonicalDisputeCaseRecord = {
      ...c,
      status: input.targetStatus,
      revision: nextRev,
      updatedAtIso: nowIso,
      closedAtIso: ['CLOSED', 'RESOLVED'].includes(input.targetStatus) ? nowIso : c.closedAtIso,
      closureReasonFa: ['CLOSED', 'RESOLVED'].includes(input.targetStatus)
        ? sanitizeTextFa(input.reasonFa, 500)
        : c.closureReasonFa,
    };
    tx.set(DISPUTE_RESOLUTION_COLLECTIONS.cases, caseId, updated);
    appendDisputeHistoryAndOutbox(tx, {
      caseId,
      eventType: 'STATUS_CHANGED',
      actorUid: actor.uid,
      actorRole: role,
      descriptionFa: sanitizeTextFa(input.reasonFa, 300) || `تغییر وضعیت به ${input.targetStatus}`,
      fromStatus: c.status,
      toStatus: input.targetStatus,
      caseRevision: nextRev,
      recipients: [c.claimantUid, c.respondentUid].filter((u) => u !== actor.uid),
      nowIso,
    });
    return updated;
  });
}

export async function recordCanonicalResolutionOutcome(
  store: FirestoreDisputeResolutionStore,
  adapters: CanonicalDisputeCrossModuleAdapters,
  actor: CanonicalDisputeActor,
  caseId: string,
  input: {
    outcomeType: ResolutionOutcomeType;
    explanationFa: string;
    settlementId?: string;
    verifiedPaymentRef?: string;
    expectedRevision?: number;
  },
): Promise<{ caseRecord: CanonicalDisputeCaseRecord; outcome: CanonicalResolutionOutcomeRecord }> {
  if (input.verifiedPaymentRef) {
    const paid = await adapters.payments.verifyPaymentIntentConfirmed(input.verifiedPaymentRef);
    if (!paid) {
      throw new CanonicalDisputeError(
        'UNVERIFIED_PAYMENT_REFERENCE',
        'مرجع پرداخت در موتور پرداخت رسمی تایید نشد (جعل پرداخت رد شد).',
        409,
      );
    }
  }
  const nowIso = new Date().toISOString();
  return store.runTransaction(async (tx) => {
    const c = await tx.get<CanonicalDisputeCaseRecord>(DISPUTE_RESOLUTION_COLLECTIONS.cases, caseId);
    if (!c) throw new CanonicalDisputeError('CASE_NOT_FOUND', 'پرونده یافت نشد.', 404);
    const role = resolveDisputeActorRole(c, actor);
    if (!isNeutralDisputeOfficer(role) || !role) {
      throw new CanonicalDisputeError('FORBIDDEN_RESOLUTION', 'فقط میانجی‌گر یا بازرس مجاز حق ثبت نتیجه نهایی را دارد.', 403);
    }
    assertDisputeRevision(c.revision, input.expectedRevision);
    if (input.outcomeType === 'AGREEMENT_REACHED' && !c.activeSettlementId) {
      throw new CanonicalDisputeError(
        'BILATERAL_SETTLEMENT_REQUIRED',
        'ثبت نتیجه AGREEMENT_REACHED بدون توافق دوطرفه معتبر ممنوع است.',
        409,
      );
    }
    const outcomeId = makeDisputeId('doutc');
    const nextRev = c.revision + 1;
    const outcome: CanonicalResolutionOutcomeRecord = {
      id: outcomeId,
      caseId,
      outcomeType: input.outcomeType,
      explanationFa: sanitizeTextFa(input.explanationFa, 1000),
      settlementId: input.settlementId ?? c.activeSettlementId,
      verifiedPaymentRef: input.verifiedPaymentRef,
      recordedByUid: actor.uid,
      recordedByRole: role,
      legalBoundary: CANONICAL_DISPUTE_LEGAL_BOUNDARY,
      recordedAtIso: nowIso,
    };
    const updated: CanonicalDisputeCaseRecord = {
      ...c,
      status: 'RESOLVED',
      resolutionOutcomeId: outcomeId,
      closedAtIso: nowIso,
      closureReasonFa: outcome.explanationFa,
      revision: nextRev,
      updatedAtIso: nowIso,
    };
    tx.set(DISPUTE_RESOLUTION_COLLECTIONS.resolutionOutcomes, outcomeId, outcome);
    tx.set(DISPUTE_RESOLUTION_COLLECTIONS.cases, caseId, updated);
    appendDisputeHistoryAndOutbox(tx, {
      caseId,
      eventType: 'RESOLUTION_RECORDED',
      actorUid: actor.uid,
      actorRole: role,
      descriptionFa: `نتیجه داخلی پرونده ثبت شد: ${input.outcomeType}`,
      fromStatus: c.status,
      toStatus: 'RESOLVED',
      caseRevision: nextRev,
      recipients: [c.claimantUid, c.respondentUid],
      nowIso,
    });
    return { caseRecord: updated, outcome };
  });
}

export async function getCanonicalCaseSummary(
  store: FirestoreDisputeResolutionStore,
  actor: CanonicalDisputeActor,
  caseId: string,
): Promise<{
  caseRecord: CanonicalDisputeCaseRecord;
  actorRole: CanonicalDisputeActorRole;
  claims: Array<Record<string, unknown> & { id: string }>;
  evidence: CanonicalDisputeEvidenceRecord[];
  proposals: CanonicalSettlementProposalRecord[];
  settlements: CanonicalSettlementRecord[];
}> {
  const c = await store.getCaseById(caseId);
  if (!c) throw new CanonicalDisputeError('CASE_NOT_FOUND', 'پرونده یافت نشد.', 404);
  const role = resolveDisputeActorRole(c, actor);
  if (!role) throw new CanonicalDisputeError('FORBIDDEN_CASE_ACCESS', 'دسترسی مشاهده این پرونده وجود ندارد.', 403);

  const [claims, rawEvidence, proposals, settlements] = await Promise.all([
    store.listClaimsForCase(caseId),
    store.listEvidenceForCase(caseId),
    store.listProposalsForCase(caseId),
    store.listSettlementsForCase(caseId),
  ]);
  const canSeeRestricted = isNeutralDisputeOfficer(role);
  const evidence = canSeeRestricted
    ? rawEvidence
    : rawEvidence.filter((e) => e.confidentiality === 'PARTIES_VISIBLE');

  return { caseRecord: c, actorRole: role, claims, evidence, proposals, settlements };
}
