/**
 * @file server/modules/dispute-resolution/disputeNegotiationEngine.ts
 * @description Negotiation proposals, dual-party acceptance, electronic settlement agreement,
 * and mediation session management for Dispute Resolution.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { DisputeRepository } from './disputeStore';
import type {
  DisputeDomainEvent,
  MediationSession,
  NegotiationProposal,
  ResolutionOutcomeType,
  SettlementAgreement,
} from './disputeTypes';
import { sanitizeTextFa } from './disputeValidator';

export interface CreateProposalParams {
  readonly proposalTermsFa: string;
  readonly proposedFinancialRemedyRials?: number;
  readonly validUntilIso: string;
}

export class DisputeNegotiationEngine {
  constructor(
    private readonly store: DisputeRepository,
    private readonly emitEvent: (event: DisputeDomainEvent) => void,
    private readonly transitionStatus: (
      actorUid: string,
      caseId: string,
      targetStatus: any,
      reasonFa: string,
      isStaffOrMediator?: boolean,
    ) => Promise<any>,
  ) {}

  public async createNegotiationProposal(
    actorUid: string,
    caseId: string,
    params: CreateProposalParams,
  ): Promise<NegotiationProposal> {
    const c = await this.store.getCaseById(caseId);
    if (!c) throw new Error('CASE_NOT_FOUND: پرونده یافت نشد.');

    const isParty = c.claimantUid === actorUid || c.respondentUid === actorUid;
    if (!isParty) {
      throw new Error('FORBIDDEN_PROPOSAL: فقط طرفین پرونده می‌توانند پیشنهاد مصالحه ارائه دهند.');
    }

    if (['RESOLVED', 'CLOSED', 'WITHDRAWN'].includes(c.status)) {
      throw new Error('CASE_NOT_ACTIVE: پرونده در وضعیت فعال برای مصالحه نیست.');
    }

    const nowIso = new Date().toISOString();
    const proposal: NegotiationProposal = {
      proposalId: `prop-${randomUUID().slice(0, 10)}`,
      caseId,
      proposedByUid: actorUid,
      proposalTermsFa: sanitizeTextFa(params.proposalTermsFa, 2000),
      proposedFinancialRemedyRials:
        params.proposedFinancialRemedyRials !== undefined
          ? Math.floor(Math.max(0, params.proposedFinancialRemedyRials))
          : undefined,
      validUntilIso: params.validUntilIso,
      status: 'PROPOSED',
      acceptedByUids: [actorUid],
      rejectedByUids: [],
      createdAtIso: nowIso,
    };

    await this.store.saveProposal(proposal);

    if (['NEGOTIATION', 'UNDER_REVIEW', 'MEDIATION'].includes(c.status)) {
      await this.transitionStatus(actorUid, caseId, 'SETTLEMENT_PROPOSED', 'پیشنهاد مصالحه ارسال گردید.');
    }

    await this.store.appendTimelineEvent({
      eventId: `evt-${randomUUID().slice(0, 10)}`,
      caseId,
      eventType: 'PROPOSAL_MADE',
      actorUid,
      actorRole: actorUid === c.claimantUid ? 'CLAIMANT' : 'RESPONDENT',
      descriptionFa: 'پیشنهاد مصالحه جدید ثبت و به طرف مقابل اعلام شد.',
      timestampIso: nowIso,
    });

    this.emitEvent({
      eventId: `dom-${randomUUID().slice(0, 10)}`,
      eventType: 'dispute.proposal_made',
      caseId,
      timestampIso: nowIso,
      summaryFa: 'پیشنهاد مصالحه در پرونده اختلاف ارائه شد.',
    });

    return proposal;
  }

  public async acceptProposal(
    actorUid: string,
    proposalId: string,
  ): Promise<{ proposal: NegotiationProposal; settlementAgreement?: SettlementAgreement }> {
    const proposal = await this.store.getProposalById(proposalId);
    if (!proposal) throw new Error('PROPOSAL_NOT_FOUND: پیشنهاد مصالحه یافت نشد.');

    const c = await this.store.getCaseById(proposal.caseId);
    if (!c) throw new Error('CASE_NOT_FOUND: پرونده یافت نشد.');

    const isParty = c.claimantUid === actorUid || c.respondentUid === actorUid;
    if (!isParty) {
      throw new Error('FORBIDDEN_PROPOSAL_ACTION: فقط طرفین پرونده می‌توانند پیشنهاد را بپذیرند.');
    }

    if (proposal.status !== 'PROPOSED' && proposal.status !== 'COUNTER_PROPOSED') {
      throw new Error(`PROPOSAL_INACTIVE: وضعیت پیشنهاد برای پذیرش نامعتبر است (${proposal.status}).`);
    }

    if (new Date(proposal.validUntilIso).getTime() < Date.now()) {
      throw new Error('PROPOSAL_EXPIRED: مهلت پذیرش این پیشنهاد منقضی شده است.');
    }

    const nowIso = new Date().toISOString();
    const updatedAccepted = Array.from(new Set([...proposal.acceptedByUids, actorUid]));
    const isBothAccepted = updatedAccepted.includes(c.claimantUid) && updatedAccepted.includes(c.respondentUid);

    const updatedProposal: NegotiationProposal = {
      ...proposal,
      status: isBothAccepted ? 'ACCEPTED' : proposal.status,
      acceptedByUids: updatedAccepted,
      respondedAtIso: nowIso,
    };

    await this.store.saveProposal(updatedProposal);

    let settlementAgreement: SettlementAgreement | undefined;

    if (isBothAccepted) {
      const claimantSig = createHash('sha256').update(`${c.claimantUid}:${proposal.proposalId}:${nowIso}:agree`).digest('hex');
      const respondentSig = createHash('sha256').update(`${c.respondentUid}:${proposal.proposalId}:${nowIso}:agree`).digest('hex');

      settlementAgreement = {
        agreementId: `agree-${randomUUID().slice(0, 10)}`,
        caseId: c.id,
        proposalId: proposal.proposalId,
        agreedTermsFa: proposal.proposalTermsFa,
        financialSettlementRials: proposal.proposedFinancialRemedyRials,
        partyAcceptances: [
          { partyUid: c.claimantUid, acceptedAtIso: nowIso, signatureHash: claimantSig },
          { partyUid: c.respondentUid, acceptedAtIso: nowIso, signatureHash: respondentSig },
        ],
        status: 'SIGNED',
        signedAtIso: nowIso,
      };

      await this.store.saveSettlement(settlementAgreement);

      await this.transitionStatus(actorUid, c.id, 'SETTLEMENT_ACCEPTED', 'توافق مصالحه به امضای الکترونیک طرفین رسید.');

      await this.store.appendTimelineEvent({
        eventId: `evt-${randomUUID().slice(0, 10)}`,
        caseId: c.id,
        eventType: 'SETTLEMENT_ACCEPTED',
        actorUid,
        actorRole: 'PARTIES',
        descriptionFa: 'طرفین با پیشنهاد مصالحه موافقت کردند و توافق‌نامه منعقد شد.',
        timestampIso: nowIso,
      });

      this.emitEvent({
        eventId: `dom-${randomUUID().slice(0, 10)}`,
        eventType: 'dispute.settlement_signed',
        caseId: c.id,
        timestampIso: nowIso,
        summaryFa: 'توافق‌نامه حل اختلاف با توافق دوجانبه امضا شد.',
      });
    }

    return { proposal: updatedProposal, settlementAgreement };
  }

  public async scheduleMediationSession(
    actorUid: string,
    caseId: string,
    params: { scheduledAtIso: string; agendaFa: string; mediatorPrivateNotesFa?: string },
  ): Promise<MediationSession> {
    const c = await this.store.getCaseById(caseId);
    if (!c) throw new Error('CASE_NOT_FOUND: پرونده یافت نشد.');

    const nowIso = new Date().toISOString();
    const session: MediationSession = {
      sessionId: `med-${randomUUID().slice(0, 10)}`,
      caseId,
      mediatorUid: actorUid,
      scheduledAtIso: params.scheduledAtIso,
      agendaFa: sanitizeTextFa(params.agendaFa, 1000),
      sessionStatus: 'SCHEDULED',
      mediatorPrivateNotesFa: params.mediatorPrivateNotesFa ? sanitizeTextFa(params.mediatorPrivateNotesFa, 2000) : undefined,
      createdAtIso: nowIso,
    };

    await this.store.saveMediationSession(session);

    if (c.status !== 'MEDIATION') {
      await this.transitionStatus(actorUid, caseId, 'MEDIATION', 'جلسه میانجی‌گری تعیین شد.', true);
    }

    await this.store.appendTimelineEvent({
      eventId: `evt-${randomUUID().slice(0, 10)}`,
      caseId,
      eventType: 'SESSION_HELD',
      actorUid,
      actorRole: 'MEDIATOR',
      descriptionFa: `جلسه میانجی‌گری برای تاریخ ${session.scheduledAtIso} زمان‌بندی شد.`,
      timestampIso: nowIso,
    });

    return session;
  }
}
