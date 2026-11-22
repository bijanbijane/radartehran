/**
 * @file server/modules/dispute-resolution/canonicalDisputeService.ts
 * @description RT-DISPUTE-CRITICAL-031 — Unified Canonical Dispute Resolution Service.
 * Enforces verified Transaction/Property Registry participant linkage, MEDIATOR_ONLY
 * evidence confidentiality, bilateral settlement acceptance, Revision CAS, strict legal
 * boundaries, append-only immutable history, and transactional notification outbox.
 */
import crypto from 'node:crypto';
import type {
  CaseStatus,
  DisputeCategory,
  EvidenceConfidentiality,
  ResolutionOutcomeType,
} from './disputeTypes';
import { sanitizeTextFa, validateDisputeCaseInput } from './disputeValidator';
import {
  CANONICAL_DISPUTE_LEGAL_BOUNDARY,
  DISPUTE_RESOLUTION_COLLECTIONS,
  type CanonicalDisputeActorRole,
  type CanonicalDisputeCaseRecord,
  type CanonicalDisputeCrossModuleAdapters,
  type CanonicalDisputeEvidenceRecord,
  type CanonicalDisputeHistoryRecord,
  type CanonicalResolutionOutcomeRecord,
  type CanonicalSettlementProposalRecord,
  type CanonicalSettlementRecord,
  type FirestoreDisputeResolutionStore,
} from './firestoreStore';
import type { FirestoreTransactionHandle } from '../real-estate-transactions/productionCrossModuleAdapters';
import {
  acceptCanonicalSettlementProposal,
  createCanonicalSettlementProposal,
  getCanonicalCaseSummary,
  recordCanonicalResolutionOutcome,
  transitionCanonicalCaseStatus,
} from './canonicalDisputeResolutionActions';

export class CanonicalDisputeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'CanonicalDisputeError';
  }
}

export interface CanonicalDisputeActor {
  uid: string;
  serverRole?: 'MEDIATOR' | 'CASE_HANDLER' | 'AUTHORIZED_REVIEWER' | null;
}

export function sha256DisputeHex(v: string): string {
  return crypto.createHash('sha256').update(v, 'utf8').digest('hex');
}

export function makeDisputeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
}

export function assertDisputeRevision(actual: number, expected?: number): void {
  if (typeof expected === 'number' && actual !== expected) {
    throw new CanonicalDisputeError('CASE_REVISION_CONFLICT', `Revision mismatch: expected ${expected}, actual ${actual}`, 409);
  }
}

export function resolveDisputeActorRole(
  c: CanonicalDisputeCaseRecord,
  actor: CanonicalDisputeActor,
): CanonicalDisputeActorRole | null {
  if (actor.serverRole === 'AUTHORIZED_REVIEWER') return 'AUTHORIZED_REVIEWER';
  if (c.assignedMediatorUid === actor.uid || actor.serverRole === 'MEDIATOR') return 'MEDIATOR';
  if (c.assignedCaseHandlerUid === actor.uid || actor.serverRole === 'CASE_HANDLER') return 'CASE_HANDLER';
  if (c.claimantUid === actor.uid) return 'CLAIMANT';
  if (c.respondentUid === actor.uid) return 'RESPONDENT';
  if (c.authorizedRepresentativeUids.includes(actor.uid)) return 'AUTHORIZED_REPRESENTATIVE';
  return null;
}

export function isNeutralDisputeOfficer(role: CanonicalDisputeActorRole | null): boolean {
  return role === 'MEDIATOR' || role === 'CASE_HANDLER' || role === 'AUTHORIZED_REVIEWER';
}

export function appendDisputeHistoryAndOutbox(
  tx: FirestoreTransactionHandle,
  params: {
    caseId: string;
    eventType: string;
    actorUid: string;
    actorRole: CanonicalDisputeActorRole;
    descriptionFa: string;
    fromStatus?: CaseStatus;
    toStatus?: CaseStatus;
    caseRevision: number;
    recipients: string[];
    nowIso: string;
  },
): void {
  const histId = makeDisputeId('dhist');
  const hist: CanonicalDisputeHistoryRecord = {
    id: histId,
    caseId: params.caseId,
    eventType: params.eventType,
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    descriptionFa: params.descriptionFa,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    caseRevision: params.caseRevision,
    recordedAtIso: params.nowIso,
    immutable: true,
  };
  tx.set(DISPUTE_RESOLUTION_COLLECTIONS.caseHistory, histId, hist);
  if (params.recipients.length > 0) {
    const outId = makeDisputeId('dout');
    tx.set(DISPUTE_RESOLUTION_COLLECTIONS.outbox, outId, {
      id: outId,
      caseId: params.caseId,
      eventType: params.eventType,
      recipientUids: [...new Set(params.recipients)],
      status: 'PENDING_DISPATCH',
      createdAtIso: params.nowIso,
    });
  }
}

export class CanonicalDisputeResolutionService {
  constructor(
    public readonly store: FirestoreDisputeResolutionStore,
    public readonly adapters: CanonicalDisputeCrossModuleAdapters,
  ) {}

  public async createDisputeCase(
    actor: CanonicalDisputeActor,
    input: {
      category: DisputeCategory;
      titleFa: string;
      descriptionFa: string;
      respondentUid: string;
      propertyReferenceId?: string;
      transactionReferenceId?: string;
      assignedMediatorUid?: string;
      idempotencyKey: string;
    },
  ): Promise<{ caseRecord: CanonicalDisputeCaseRecord; replayed: boolean }> {
    if (!input.idempotencyKey || input.idempotencyKey.trim().length < 6) {
      throw new CanonicalDisputeError('IDEMPOTENCY_KEY_REQUIRED', 'کلید یکتای Idempotency-Key الزامی است.', 400);
    }
    const validation = validateDisputeCaseInput({
      category: input.category,
      titleFa: input.titleFa,
      descriptionFa: input.descriptionFa,
      claimantUid: actor.uid,
      respondentUid: input.respondentUid,
      propertyReferenceId: input.propertyReferenceId,
    });
    if (!validation.valid) {
      throw new CanonicalDisputeError('VALIDATION_FAILED', validation.errors?.join('; ') || 'ورودی نامعتبر است.', 400);
    }
    if (!input.transactionReferenceId && !input.propertyReferenceId) {
      throw new CanonicalDisputeError(
        'REFERENCE_LINKAGE_REQUIRED',
        'ثبت پرونده اختلاف نیازمند مرجع معتبر معامله یا ملک است (پذیرش respondentUid بدون مرجع واقعی ممنوع است).',
        400,
      );
    }

    let resolvedPropertyId = input.propertyReferenceId;
    if (input.transactionReferenceId) {
      const txCheck = await this.adapters.transactions.verifyTransactionPartyLinkage(
        input.transactionReferenceId,
        actor.uid,
        input.respondentUid,
      );
      if (!txCheck.valid) {
        throw new CanonicalDisputeError(
          'UNVERIFIED_DISPUTE_PARTY_LINKAGE',
          `ارتباط واقعی طرفین با معامله تایید نشد (${txCheck.reason || 'LINKAGE_FAILED'}).`,
          403,
        );
      }
      resolvedPropertyId = resolvedPropertyId || txCheck.propertyId;
    } else if (input.propertyReferenceId) {
      const propCheck = await this.adapters.propertyRegistry.verifyPropertyAndPartyLinkage(
        input.propertyReferenceId,
        actor.uid,
        input.respondentUid,
      );
      if (!propCheck.valid) {
        throw new CanonicalDisputeError(
          'UNVERIFIED_DISPUTE_PARTY_LINKAGE',
          `ارتباط واقعی طرفین با ملک در Property Registry تایید نشد (${propCheck.reason || 'LINKAGE_FAILED'}).`,
          403,
        );
      }
    }

    const idemId = `didem_${sha256DisputeHex(`create_case\0${actor.uid}\0${input.idempotencyKey.trim()}`).slice(0, 40)}`;
    const payloadHash = sha256DisputeHex(
      JSON.stringify([input.category, input.respondentUid, input.transactionReferenceId ?? '', resolvedPropertyId ?? '', input.titleFa]),
    );
    const nowIso = new Date().toISOString();

    return this.store.runTransaction(async (tx) => {
      const existingIdem = await tx.get<Record<string, unknown>>(DISPUTE_RESOLUTION_COLLECTIONS.idempotency, idemId);
      if (existingIdem) {
        if (existingIdem.payloadHash !== payloadHash) {
          throw new CanonicalDisputeError('IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD', 409);
        }
        const existingCase = await tx.get<CanonicalDisputeCaseRecord>(
          DISPUTE_RESOLUTION_COLLECTIONS.cases,
          String(existingIdem.entityId),
        );
        if (existingCase) return { caseRecord: existingCase, replayed: true };
      }

      const caseId = makeDisputeId('dcase');
      const record: CanonicalDisputeCaseRecord = {
        id: caseId,
        category: input.category,
        titleFa: sanitizeTextFa(input.titleFa, 120),
        descriptionFa: sanitizeTextFa(input.descriptionFa, 2000),
        propertyReferenceId: resolvedPropertyId,
        transactionReferenceId: input.transactionReferenceId,
        claimantUid: actor.uid,
        respondentUid: input.respondentUid,
        authorizedRepresentativeUids: [],
        assignedMediatorUid: input.assignedMediatorUid,
        status: 'SUBMITTED',
        revision: 1,
        idempotencyKey: input.idempotencyKey.trim(),
        legalBoundary: CANONICAL_DISPUTE_LEGAL_BOUNDARY,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      tx.set(DISPUTE_RESOLUTION_COLLECTIONS.cases, caseId, record);
      tx.set(DISPUTE_RESOLUTION_COLLECTIONS.parties, makeDisputeId('dpart'), {
        caseId,
        userId: actor.uid,
        role: 'CLAIMANT',
        verifiedViaSource: input.transactionReferenceId ? 'real_estate_transactions' : 'pr_canonical_properties',
        createdAtIso: nowIso,
      });
      tx.set(DISPUTE_RESOLUTION_COLLECTIONS.parties, makeDisputeId('dpart'), {
        caseId,
        userId: input.respondentUid,
        role: 'RESPONDENT',
        verifiedViaSource: input.transactionReferenceId ? 'real_estate_transactions' : 'pr_canonical_properties',
        createdAtIso: nowIso,
      });
      tx.set(DISPUTE_RESOLUTION_COLLECTIONS.idempotency, idemId, {
        id: idemId,
        scope: 'create_case',
        payloadHash,
        entityId: caseId,
        createdAtIso: nowIso,
      });
      appendDisputeHistoryAndOutbox(tx, {
        caseId,
        eventType: 'CASE_CREATED',
        actorUid: actor.uid,
        actorRole: 'CLAIMANT',
        descriptionFa: `پرونده اختلاف «${record.titleFa}» ایجاد شد.`,
        toStatus: 'SUBMITTED',
        caseRevision: 1,
        recipients: [input.respondentUid],
        nowIso,
      });
      return { caseRecord: record, replayed: false };
    });
  }

  public async addClaim(
    actor: CanonicalDisputeActor,
    caseId: string,
    input: { titleFa: string; factualAccountFa: string; requestedRemedyFa: string; claimedAmountRials?: number; expectedRevision?: number },
  ): Promise<Record<string, unknown> & { id: string }> {
    const nowIso = new Date().toISOString();
    return this.store.runTransaction(async (tx) => {
      const c = await tx.get<CanonicalDisputeCaseRecord>(DISPUTE_RESOLUTION_COLLECTIONS.cases, caseId);
      if (!c) throw new CanonicalDisputeError('CASE_NOT_FOUND', 'پرونده یافت نشد.', 404);
      const role = resolveDisputeActorRole(c, actor);
      if (role !== 'CLAIMANT') throw new CanonicalDisputeError('FORBIDDEN_CLAIM_CREATION', 'فقط شاکی مجاز به ثبت ادعا است.', 403);
      if (['RESOLVED', 'CLOSED', 'WITHDRAWN'].includes(c.status)) {
        throw new CanonicalDisputeError('CASE_NOT_ACTIVE', 'پرونده بسته یا مختومه است.', 409);
      }
      assertDisputeRevision(c.revision, input.expectedRevision);
      const claimId = makeDisputeId('dclm');
      const nextRev = c.revision + 1;
      const claim = {
        id: claimId,
        caseId,
        claimantUid: actor.uid,
        titleFa: sanitizeTextFa(input.titleFa, 120),
        factualAccountFa: sanitizeTextFa(input.factualAccountFa, 2000),
        requestedRemedyFa: sanitizeTextFa(input.requestedRemedyFa, 1000),
        claimedAmountRials: typeof input.claimedAmountRials === 'number' ? Math.max(0, Math.floor(input.claimedAmountRials)) : undefined,
        status: 'PENDING_RESPONSE',
        createdAtIso: nowIso,
      };
      tx.set(DISPUTE_RESOLUTION_COLLECTIONS.claims, claimId, claim);
      tx.set(DISPUTE_RESOLUTION_COLLECTIONS.cases, caseId, { ...c, revision: nextRev, updatedAtIso: nowIso });
      appendDisputeHistoryAndOutbox(tx, {
        caseId,
        eventType: 'CLAIM_ADDED',
        actorUid: actor.uid,
        actorRole: 'CLAIMANT',
        descriptionFa: `ادعا «${claim.titleFa}» ثبت شد.`,
        caseRevision: nextRev,
        recipients: [c.respondentUid],
        nowIso,
      });
      return claim;
    });
  }

  public async submitClaimResponse(
    actor: CanonicalDisputeActor,
    claimId: string,
    input: { stance: 'ADMITTED' | 'DENIED' | 'PARTIALLY_ADMITTED' | 'COUNTER_CLAIM'; statementFa: string },
  ): Promise<Record<string, unknown> & { id: string }> {
    const nowIso = new Date().toISOString();
    return this.store.runTransaction(async (tx) => {
      const claim = await tx.get<Record<string, unknown>>(DISPUTE_RESOLUTION_COLLECTIONS.claims, claimId);
      if (!claim) throw new CanonicalDisputeError('CLAIM_NOT_FOUND', 'ادعا یافت نشد.', 404);
      const caseId = String(claim.caseId);
      const c = await tx.get<CanonicalDisputeCaseRecord>(DISPUTE_RESOLUTION_COLLECTIONS.cases, caseId);
      if (!c) throw new CanonicalDisputeError('CASE_NOT_FOUND', 'پرونده یافت نشد.', 404);
      const role = resolveDisputeActorRole(c, actor);
      if (role !== 'RESPONDENT') throw new CanonicalDisputeError('FORBIDDEN_RESPONSE', 'فقط طرف مقابل مجاز به ثبت پاسخ است.', 403);
      const respId = makeDisputeId('dresp');
      const nextRev = c.revision + 1;
      const resp = {
        id: respId,
        caseId,
        claimId,
        respondentUid: actor.uid,
        stance: input.stance,
        statementFa: sanitizeTextFa(input.statementFa, 2000),
        createdAtIso: nowIso,
      };
      tx.set(DISPUTE_RESOLUTION_COLLECTIONS.responses, respId, resp);
      tx.set(DISPUTE_RESOLUTION_COLLECTIONS.cases, caseId, { ...c, revision: nextRev, updatedAtIso: nowIso });
      appendDisputeHistoryAndOutbox(tx, {
        caseId,
        eventType: 'RESPONSE_SUBMITTED',
        actorUid: actor.uid,
        actorRole: 'RESPONDENT',
        descriptionFa: `پاسخ با موضع ${input.stance} ثبت شد.`,
        caseRevision: nextRev,
        recipients: [c.claimantUid],
        nowIso,
      });
      return resp;
    });
  }

  public async attachEvidence(
    actor: CanonicalDisputeActor,
    caseId: string,
    input: {
      evidenceType: CanonicalDisputeEvidenceRecord['evidenceType'];
      descriptionFa: string;
      sourceMediaId: string;
      confidentiality?: EvidenceConfidentiality;
      claimId?: string;
    },
  ): Promise<CanonicalDisputeEvidenceRecord> {
    const mediaOk = await this.adapters.media.verifyMediaExists(input.sourceMediaId);
    if (!mediaOk) {
      throw new CanonicalDisputeError('INVALID_MEDIA_REFERENCE', 'سند رسانه‌ای در Media Metadata Store یافت نشد یا فعال نیست.', 400);
    }
    const nowIso = new Date().toISOString();
    return this.store.runTransaction(async (tx) => {
      const c = await tx.get<CanonicalDisputeCaseRecord>(DISPUTE_RESOLUTION_COLLECTIONS.cases, caseId);
      if (!c) throw new CanonicalDisputeError('CASE_NOT_FOUND', 'پرونده یافت نشد.', 404);
      const role = resolveDisputeActorRole(c, actor);
      if (!role) throw new CanonicalDisputeError('FORBIDDEN_ATTACHMENT', 'دسترسی پیوست مدارک وجود ندارد.', 403);
      const confidentiality = input.confidentiality ?? 'PARTIES_VISIBLE';
      const evId = makeDisputeId('devi');
      const nextRev = c.revision + 1;
      const evidence: CanonicalDisputeEvidenceRecord = {
        id: evId,
        caseId,
        claimId: input.claimId,
        evidenceType: input.evidenceType,
        descriptionFa: sanitizeTextFa(input.descriptionFa, 1000),
        sourceMediaId: input.sourceMediaId,
        submittedByUid: actor.uid,
        confidentiality,
        reviewStatus: 'SUBMITTED',
        createdAtIso: nowIso,
      };
      tx.set(DISPUTE_RESOLUTION_COLLECTIONS.evidence, evId, evidence);
      tx.set(DISPUTE_RESOLUTION_COLLECTIONS.cases, caseId, { ...c, revision: nextRev, updatedAtIso: nowIso });
      appendDisputeHistoryAndOutbox(tx, {
        caseId,
        eventType: 'EVIDENCE_ATTACHED',
        actorUid: actor.uid,
        actorRole: role,
        descriptionFa: `مدرک از نوع ${input.evidenceType} (${confidentiality}) ثبت شد.`,
        caseRevision: nextRev,
        recipients: confidentiality === 'PARTIES_VISIBLE' ? [c.claimantUid, c.respondentUid].filter((u) => u !== actor.uid) : [],
        nowIso,
      });
      return evidence;
    });
  }

  public createSettlementProposal(
    actor: CanonicalDisputeActor,
    caseId: string,
    input: { proposalTermsFa: string; proposedFinancialRemedyRials?: number; validUntilIso: string },
  ): Promise<CanonicalSettlementProposalRecord> {
    return createCanonicalSettlementProposal(this.store, actor, caseId, input);
  }

  public acceptSettlementProposal(
    actor: CanonicalDisputeActor,
    proposalId: string,
    options?: { expectedCaseRevision?: number },
  ): Promise<{ proposal: CanonicalSettlementProposalRecord; settlement: CanonicalSettlementRecord | null }> {
    return acceptCanonicalSettlementProposal(this.store, actor, proposalId, options);
  }

  public transitionCaseStatus(
    actor: CanonicalDisputeActor,
    caseId: string,
    input: { targetStatus: CaseStatus; reasonFa: string; expectedRevision?: number },
  ): Promise<CanonicalDisputeCaseRecord> {
    return transitionCanonicalCaseStatus(this.store, actor, caseId, input);
  }

  public recordResolutionOutcome(
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
    return recordCanonicalResolutionOutcome(this.store, this.adapters, actor, caseId, input);
  }

  public getCaseSummary(
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
    return getCanonicalCaseSummary(this.store, actor, caseId);
  }
}
