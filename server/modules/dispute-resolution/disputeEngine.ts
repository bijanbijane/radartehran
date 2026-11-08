/**
 * @file server/modules/dispute-resolution/disputeEngine.ts
 * @description Core business logic engine for Employee 53 Dispute Resolution & Case Management.
 * Handles case intake, claims, evidence confidentiality, status transitions,
 * resolution outcomes, and delegates negotiation/settlements to DisputeNegotiationEngine.
 */

import { randomUUID } from 'node:crypto';
import { DisputeNegotiationEngine, type CreateProposalParams } from './disputeNegotiationEngine';
import type { DisputeRepository } from './disputeStore';
import type {
  CaseDeadline,
  CaseStatus,
  ClaimResponse,
  DisputeCaseRecord,
  DisputeCategory,
  DisputeClaim,
  DisputeDomainEvent,
  DisputeEvidenceReference,
  EvidenceConfidentiality,
  MediationSession,
  NegotiationProposal,
  ResolutionOutcomeType,
  SettlementAgreement,
} from './disputeTypes';
import {
  sanitizeTextFa,
  validateDisputeCaseInput,
  validateDisputeTransition,
} from './disputeValidator';

export interface CreateCaseParams {
  readonly category: DisputeCategory;
  readonly titleFa: string;
  readonly descriptionFa: string;
  readonly respondentUid: string;
  readonly propertyReferenceId?: string;
  readonly transactionReferenceId?: string;
  readonly idempotencyKey?: string;
}

export interface AddClaimParams {
  readonly titleFa: string;
  readonly factualAccountFa: string;
  readonly requestedRemedyFa: string;
  readonly claimedAmountRials?: number;
  readonly currency?: 'IRR' | 'IRT';
}

export interface SubmitResponseParams {
  readonly stance: 'ADMITTED' | 'DENIED' | 'PARTIALLY_ADMITTED' | 'COUNTER_CLAIM';
  readonly statementFa: string;
  readonly counterClaimId?: string;
}

export interface AttachEvidenceParams {
  readonly evidenceType: 'CONTRACT' | 'RECEIPT' | 'INSPECTION_RECORD' | 'PHOTO_VIDEO' | 'MESSAGES' | 'OFFICIAL_DOCUMENT';
  readonly descriptionFa: string;
  readonly sourceMediaId: string;
  readonly confidentiality?: EvidenceConfidentiality;
  readonly claimId?: string;
}

export class DisputeResolutionEngine {
  private readonly events: DisputeDomainEvent[] = [];
  private readonly negotiationEngine: DisputeNegotiationEngine;

  constructor(private readonly store: DisputeRepository) {
    this.negotiationEngine = new DisputeNegotiationEngine(
      this.store,
      (ev) => this.emitEvent(ev),
      (actorUid, caseId, targetStatus, reasonFa) =>
        this.transitionCaseStatus(actorUid, caseId, targetStatus, reasonFa),
    );
  }

  public getRecordedEvents(): readonly DisputeDomainEvent[] {
    return this.events;
  }

  public clearRecordedEvents(): void {
    this.events.length = 0;
  }

  private emitEvent(event: DisputeDomainEvent): void {
    this.events.push(event);
  }

  public async createDisputeCase(
    claimantUid: string,
    params: CreateCaseParams,
  ): Promise<{ caseRecord: DisputeCaseRecord; isExisting: boolean }> {
    const inputValidation = validateDisputeCaseInput({
      category: params.category,
      titleFa: params.titleFa,
      descriptionFa: params.descriptionFa,
      claimantUid,
      respondentUid: params.respondentUid,
      propertyReferenceId: params.propertyReferenceId,
    });

    if (!inputValidation.valid) {
      throw new Error(`VALIDATION_FAILED: ${inputValidation.errors?.join('; ')}`);
    }

    const idempotencyKey =
      params.idempotencyKey || `dispute-idem-${claimantUid}-${params.respondentUid}-${Date.now()}`;

    const existing = await this.store.getCaseByIdempotencyKey(idempotencyKey);
    if (existing) {
      return { caseRecord: existing, isExisting: true };
    }

    const nowIso = new Date().toISOString();
    const caseRecord: DisputeCaseRecord = {
      id: `case-${randomUUID().slice(0, 12)}`,
      category: params.category,
      titleFa: sanitizeTextFa(params.titleFa, 120),
      descriptionFa: sanitizeTextFa(params.descriptionFa, 2000),
      propertyReferenceId: params.propertyReferenceId,
      transactionReferenceId: params.transactionReferenceId,
      claimantUid,
      respondentUid: params.respondentUid,
      status: 'SUBMITTED',
      idempotencyKey,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    await this.store.saveCase(caseRecord);

    await this.store.appendTimelineEvent({
      eventId: `evt-${randomUUID().slice(0, 10)}`,
      caseId: caseRecord.id,
      eventType: 'CASE_CREATED',
      actorUid: claimantUid,
      actorRole: 'CLAIMANT',
      descriptionFa: `پرونده اختلاف با عنوان «${caseRecord.titleFa}» ثبت گردید.`,
      timestampIso: nowIso,
    });

    this.emitEvent({
      eventId: `dom-${randomUUID().slice(0, 10)}`,
      eventType: 'dispute.case_created',
      caseId: caseRecord.id,
      claimantUid,
      respondentUid: params.respondentUid,
      status: 'SUBMITTED',
      timestampIso: nowIso,
      summaryFa: 'پرونده جدید اختلاف ایجاد شد.',
    });

    return { caseRecord, isExisting: false };
  }

  public async addClaim(actorUid: string, caseId: string, params: AddClaimParams): Promise<DisputeClaim> {
    const c = await this.store.getCaseById(caseId);
    if (!c) throw new Error('CASE_NOT_FOUND: پرونده اختلاف یافت نشد.');
    if (c.claimantUid !== actorUid) {
      throw new Error('FORBIDDEN_CLAIM_CREATION: فقط شاکی پرونده مجاز به ثبت ادعا است.');
    }
    if (['RESOLVED', 'CLOSED', 'WITHDRAWN'].includes(c.status)) {
      throw new Error('CASE_NOT_ACTIVE: پرونده در وضعیت فعال قرار ندارد.');
    }

    const nowIso = new Date().toISOString();
    const claim: DisputeClaim = {
      claimId: `claim-${randomUUID().slice(0, 10)}`,
      caseId,
      claimantUid: actorUid,
      titleFa: sanitizeTextFa(params.titleFa, 120),
      factualAccountFa: sanitizeTextFa(params.factualAccountFa, 2000),
      requestedRemedyFa: sanitizeTextFa(params.requestedRemedyFa, 1000),
      claimedAmountRials:
        params.claimedAmountRials !== undefined ? Math.floor(Math.max(0, params.claimedAmountRials)) : undefined,
      currency: params.currency || 'IRR',
      status: 'PENDING_RESPONSE',
      createdAtIso: nowIso,
    };

    await this.store.saveClaim(claim);

    await this.store.appendTimelineEvent({
      eventId: `evt-${randomUUID().slice(0, 10)}`,
      caseId,
      eventType: 'CLAIM_ADDED',
      actorUid,
      actorRole: 'CLAIMANT',
      descriptionFa: `ادعای جدید تحت عنوان «${claim.titleFa}» افزوده شد.`,
      timestampIso: nowIso,
    });

    this.emitEvent({
      eventId: `dom-${randomUUID().slice(0, 10)}`,
      eventType: 'dispute.claim_added',
      caseId,
      claimantUid: actorUid,
      timestampIso: nowIso,
      summaryFa: 'ادعای جدید در پرونده ثبت شد.',
    });

    return claim;
  }

  public async submitClaimResponse(actorUid: string, claimId: string, params: SubmitResponseParams): Promise<ClaimResponse> {
    const targetClaim = await this.store.getClaimById(claimId);
    if (!targetClaim) {
      throw new Error('CLAIM_NOT_FOUND: ادعای مورد نظر یافت نشد.');
    }

    const parentCase = await this.store.getCaseById(targetClaim.caseId);
    if (!parentCase) throw new Error('CASE_NOT_FOUND: پرونده یافت نشد.');
    if (parentCase.respondentUid !== actorUid) {
      throw new Error('FORBIDDEN_RESPONSE: فقط طرف مقابل پرونده می‌تواند پاسخ ثبت کند.');
    }

    const nowIso = new Date().toISOString();
    const response: ClaimResponse = {
      responseId: `resp-${randomUUID().slice(0, 10)}`,
      claimId,
      respondentUid: actorUid,
      stance: params.stance,
      statementFa: sanitizeTextFa(params.statementFa, 2000),
      counterClaimId: params.counterClaimId,
      createdAtIso: nowIso,
    };

    await this.store.saveResponse(response);

    await this.store.appendTimelineEvent({
      eventId: `evt-${randomUUID().slice(0, 10)}`,
      caseId: targetClaim.caseId,
      eventType: 'RESPONSE_SUBMITTED',
      actorUid,
      actorRole: 'RESPONDENT',
      descriptionFa: `پاسخ طرف مقابل با موضع «${params.stance}» ثبت شد.`,
      timestampIso: nowIso,
    });

    this.emitEvent({
      eventId: `dom-${randomUUID().slice(0, 10)}`,
      eventType: 'dispute.response_submitted',
      caseId: targetClaim.caseId,
      respondentUid: actorUid,
      timestampIso: nowIso,
      summaryFa: 'پاسخ به ادعا در پرونده اختلاف ثبت گردید.',
    });

    return response;
  }

  public async attachEvidence(actorUid: string, caseId: string, params: AttachEvidenceParams): Promise<DisputeEvidenceReference> {
    const c = await this.store.getCaseById(caseId);
    if (!c) throw new Error('CASE_NOT_FOUND: پرونده یافت نشد.');

    const isParty = c.claimantUid === actorUid || c.respondentUid === actorUid;
    const isStaffOrMediator = c.assignedMediatorUid === actorUid || c.assignedCaseHandlerUid === actorUid;

    if (!isParty && !isStaffOrMediator) {
      throw new Error('FORBIDDEN_ATTACHMENT: دسترسی پیوست مدارک وجود ندارد.');
    }

    const nowIso = new Date().toISOString();
    const evidence: DisputeEvidenceReference = {
      evidenceId: `evi-${randomUUID().slice(0, 10)}`,
      caseId,
      claimId: params.claimId,
      evidenceType: params.evidenceType,
      descriptionFa: sanitizeTextFa(params.descriptionFa, 1000),
      sourceMediaId: params.sourceMediaId,
      submittedByUid: actorUid,
      reviewStatus: 'SUBMITTED',
      confidentiality: params.confidentiality || 'PARTIES_VISIBLE',
      createdAtIso: nowIso,
    };

    await this.store.saveEvidence(evidence);

    await this.store.appendTimelineEvent({
      eventId: `evt-${randomUUID().slice(0, 10)}`,
      caseId,
      eventType: 'EVIDENCE_ATTACHED',
      actorUid,
      actorRole: actorUid === c.claimantUid ? 'CLAIMANT' : actorUid === c.respondentUid ? 'RESPONDENT' : 'MEDIATOR',
      descriptionFa: `مدرک ضمیمه از نوع «${evidence.evidenceType}» بارگذاری شد.`,
      timestampIso: nowIso,
    });

    return evidence;
  }

  public async createNegotiationProposal(actorUid: string, caseId: string, params: CreateProposalParams): Promise<NegotiationProposal> {
    return this.negotiationEngine.createNegotiationProposal(actorUid, caseId, params);
  }

  public async acceptProposal(
    actorUid: string,
    proposalId: string,
  ): Promise<{ proposal: NegotiationProposal; settlementAgreement?: SettlementAgreement }> {
    return this.negotiationEngine.acceptProposal(actorUid, proposalId);
  }

  public async scheduleMediationSession(
    actorUid: string,
    caseId: string,
    params: { scheduledAtIso: string; agendaFa: string; mediatorPrivateNotesFa?: string },
  ): Promise<MediationSession> {
    return this.negotiationEngine.scheduleMediationSession(actorUid, caseId, params);
  }

  public async transitionCaseStatus(
    actorUid: string,
    caseId: string,
    targetStatus: CaseStatus,
    reasonFa: string,
  ): Promise<DisputeCaseRecord> {
    const c = await this.store.getCaseById(caseId);
    if (!c) throw new Error('CASE_NOT_FOUND: پرونده یافت نشد.');

    const check = validateDisputeTransition(c.status, targetStatus);
    if (!check.allowed) {
      throw new Error(`TRANSITION_FORBIDDEN: ${check.reasonFa}`);
    }

    const nowIso = new Date().toISOString();
    const updated: DisputeCaseRecord = {
      ...c,
      status: targetStatus,
      updatedAtIso: nowIso,
      closedAtIso: ['CLOSED', 'RESOLVED'].includes(targetStatus) ? nowIso : c.closedAtIso,
      closureReasonFa: ['CLOSED', 'RESOLVED'].includes(targetStatus) ? sanitizeTextFa(reasonFa, 500) : c.closureReasonFa,
    };

    await this.store.saveCase(updated);

    await this.store.appendTimelineEvent({
      eventId: `evt-${randomUUID().slice(0, 10)}`,
      caseId,
      eventType: 'STATUS_CHANGED',
      actorUid,
      actorRole: actorUid === c.claimantUid ? 'CLAIMANT' : actorUid === c.respondentUid ? 'RESPONDENT' : 'OFFICER',
      descriptionFa: sanitizeTextFa(reasonFa, 300) || `تغییر وضعیت به ${targetStatus}`,
      timestampIso: nowIso,
      transition: {
        fromStatus: c.status,
        toStatus: targetStatus,
      },
    });

    this.emitEvent({
      eventId: `dom-${randomUUID().slice(0, 10)}`,
      eventType: 'dispute.status_changed',
      caseId,
      status: targetStatus,
      timestampIso: nowIso,
      summaryFa: `وضعیت پرونده به ${targetStatus} تغییر کرد.`,
    });

    return updated;
  }

  public async recordResolutionOutcome(
    actorUid: string,
    caseId: string,
    params: { outcomeType: ResolutionOutcomeType; explanationFa: string; settlementAgreementId?: string },
  ): Promise<DisputeCaseRecord> {
    const c = await this.store.getCaseById(caseId);
    if (!c) throw new Error('CASE_NOT_FOUND: پرونده یافت نشد.');

    const nowIso = new Date().toISOString();
    const updated: DisputeCaseRecord = {
      ...c,
      status: 'RESOLVED',
      updatedAtIso: nowIso,
      closedAtIso: nowIso,
      closureReasonFa: sanitizeTextFa(params.explanationFa, 500),
      resolutionOutcome: {
        outcomeType: params.outcomeType,
        recordedAtIso: nowIso,
        explanationFa: sanitizeTextFa(params.explanationFa, 1000),
        settlementAgreementId: params.settlementAgreementId,
      },
    };

    await this.store.saveCase(updated);

    await this.store.appendTimelineEvent({
      eventId: `evt-${randomUUID().slice(0, 10)}`,
      caseId,
      eventType: 'CASE_CLOSED',
      actorUid,
      actorRole: 'RESOLVER',
      descriptionFa: `نتیجه نهایی حل اختلاف: ${params.outcomeType}. ${params.explanationFa}`,
      timestampIso: nowIso,
    });

    this.emitEvent({
      eventId: `dom-${randomUUID().slice(0, 10)}`,
      eventType: 'dispute.case_resolved',
      caseId,
      status: 'RESOLVED',
      timestampIso: nowIso,
      summaryFa: 'نتیجه نهایی پرونده حل اختلاف ثبت و پرونده مختومه گردید.',
    });

    return updated;
  }

  public async getCaseSummary(
    actorUid: string,
    caseId: string,
    isStaffOrMediator: boolean = false,
  ): Promise<{
    caseRecord: DisputeCaseRecord;
    claims: readonly DisputeClaim[];
    evidence: readonly DisputeEvidenceReference[];
    proposals: readonly NegotiationProposal[];
    sessions: readonly MediationSession[];
    deadlines: readonly CaseDeadline[];
  }> {
    const c = await this.store.getCaseById(caseId);
    if (!c) throw new Error('CASE_NOT_FOUND: پرونده یافت نشد.');

    const isParty = c.claimantUid === actorUid || c.respondentUid === actorUid;
    if (!isParty && !isStaffOrMediator) {
      throw new Error('FORBIDDEN_CASE_ACCESS: دسترسی مشاهده این پرونده وجود ندارد.');
    }

    const claims = await this.store.listClaimsForCase(caseId);
    const allowedConfidentiality: EvidenceConfidentiality[] = isStaffOrMediator
      ? ['PARTIES_VISIBLE', 'MEDIATOR_ONLY', 'INTERNAL_LEGAL']
      : ['PARTIES_VISIBLE'];
    const evidence = await this.store.listEvidenceForCase(caseId, allowedConfidentiality);
    const proposals = await this.store.listProposalsForCase(caseId);
    const rawSessions = await this.store.listMediationSessionsForCase(caseId);
    const sessions = isStaffOrMediator ? rawSessions : rawSessions.map((s) => ({ ...s, mediatorPrivateNotesFa: undefined }));
    const deadlines = await this.store.listDeadlinesForCase(caseId);

    return { caseRecord: c, claims, evidence, proposals, sessions, deadlines };
  }
}
