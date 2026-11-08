import { assertDisputeCaseAccess } from './intakePartyClaimAndEvidenceService';
import {
  DisputeResolutionCrossModuleAdapters,
  PaginatedDisputeResult,
  paginateDisputeItems,
  TransactionalDisputeResolutionStore,
} from './store';
import {
  DisputeActorContext,
  DisputeCaseHistoryEntryRecord,
  DisputeCaseRecord,
  DisputeCommunicationRecord,
  DisputeCommunicationVisibility,
  DisputeDeadlineRecord,
  DisputeDeadlineType,
  DisputeMediationSessionRecord,
  DisputeResolutionError,
  DisputeResolutionOutcomeRecord,
  DisputeSettlementProposalRecord,
  ResolutionOutcomeType,
} from './types';

function makeDispId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class MediationSettlementResolutionAndHistoryService {
  constructor(
    private readonly store: TransactionalDisputeResolutionStore,
    private readonly adapters: DisputeResolutionCrossModuleAdapters
  ) {}

  public async recordCaseCommunication(
    actor: DisputeActorContext,
    input: {
      caseId: string;
      visibility: DisputeCommunicationVisibility;
      caucusTargetPartyId?: string;
      subject: string;
      messageBody: string;
      relatedEvidenceIds?: string[];
    }
  ): Promise<DisputeCommunicationRecord> {
    assertDisputeCaseAccess(this.store, actor, input.caseId);
    return this.store.runTransaction((tx) => {
      const comm: DisputeCommunicationRecord = {
        id: makeDispId('disp_comm'),
        caseId: input.caseId,
        authorPartyId: actor.partyId,
        visibility: input.visibility,
        caucusTargetPartyId: input.caucusTargetPartyId,
        subject: input.subject,
        messageBody: input.messageBody,
        relatedEvidenceIds: input.relatedEvidenceIds ?? [],
        recordedAtIso: new Date().toISOString(),
      };
      tx.appendCommunication(comm);
      return comm;
    });
  }

  public retrieveCaseCommunications(
    actor: DisputeActorContext,
    caseId: string
  ): DisputeCommunicationRecord[] {
    assertDisputeCaseAccess(this.store, actor, caseId);
    return this.store.listCommunicationsByCase(caseId).filter((comm) => {
      if (comm.visibility === 'SHARED_CASE_COMMUNICATION') return true;
      if (actor.role === 'MEDIATOR_OR_COORDINATOR') return true;
      if (comm.visibility === 'CAUCUS_PRIVATE_MEDIATION_NOTE') {
        return comm.authorPartyId === actor.partyId || comm.caucusTargetPartyId === actor.partyId;
      }
      return false;
    });
  }

  public async scheduleDisputeDeadline(
    actor: DisputeActorContext,
    input: {
      caseId: string;
      deadlineType: DisputeDeadlineType;
      targetPartyId: string;
      dueDateIso: string;
      dispatchNotification?: boolean;
    }
  ): Promise<DisputeDeadlineRecord> {
    const c = assertDisputeCaseAccess(this.store, actor, input.caseId);
    let delivered = false;
    if (input.dispatchNotification) {
      const res = await this.adapters.notifications.dispatchCaseNotification(
        c.id,
        [input.targetPartyId],
        `Deadline ${input.deadlineType} due on ${input.dueDateIso}`
      );
      delivered = res.delivered;
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const deadline: DisputeDeadlineRecord = {
        id: makeDispId('disp_dl'),
        caseId: c.id,
        deadlineType: input.deadlineType,
        targetPartyId: input.targetPartyId,
        dueDateIso: input.dueDateIso,
        reminderConfirmedByNotificationsModule: delivered,
        status: new Date(input.dueDateIso).getTime() < Date.now() ? 'OVERDUE' : 'UPCOMING',
        createdAt: now,
        updatedAt: now,
      };
      tx.saveDeadline(deadline);
      return deadline;
    });
  }

  public async scheduleMediationSession(
    actor: DisputeActorContext,
    input: {
      caseId: string;
      mediatorPartyId: string;
      conflictOfInterestDeclaredNone: boolean;
      scheduledAtIso: string;
      participatingPartyIds: string[];
      facilitationSummary?: string;
    }
  ): Promise<DisputeMediationSessionRecord> {
    const c = assertDisputeCaseAccess(this.store, actor, input.caseId);
    if (
      !input.conflictOfInterestDeclaredNone ||
      c.claimantPartyIds.includes(input.mediatorPartyId) ||
      c.respondentPartyIds.includes(input.mediatorPartyId)
    ) {
      throw new DisputeResolutionError(
        'MEDIATOR_CONFLICT_OF_INTEREST',
        `Mediator "${input.mediatorPartyId}" has a conflict of interest or lacks a non-conflict declaration.`
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const session: DisputeMediationSessionRecord = {
        id: makeDispId('disp_med'),
        caseId: c.id,
        mediatorPartyId: input.mediatorPartyId,
        conflictOfInterestDeclaredNone: true,
        scheduledAtIso: input.scheduledAtIso,
        participatingPartyIds: input.participatingPartyIds,
        facilitationSummary: input.facilitationSummary,
        status: 'SCHEDULED',
        isBindingArbitrationAward: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveMediationSession(session);
      tx.saveCase({
        ...c,
        assignedMediatorPartyId: input.mediatorPartyId,
        status: 'MEDIATION_IN_PROGRESS',
        version: c.version + 1,
        updatedAt: now,
      });
      tx.appendHistory({
        id: makeDispId('dhist'),
        caseId: c.id,
        propertyId: c.propertyId,
        eventType: 'MEDIATION_SCHEDULED',
        actionSummary: `Scheduled non-binding mediation session with mediator ${input.mediatorPartyId}.`,
        actorUserId: actor.userId,
        actorPartyId: actor.partyId,
        recordedAtIso: now,
      });
      return session;
    });
  }

  public async submitSettlementProposal(
    actor: DisputeActorContext,
    input: {
      caseId: string;
      proposedTermsSummary: string;
      proposedSettlementAmountRials?: number;
      conditions?: string[];
      expirationDateIso: string;
      supersedesProposalId?: string;
    }
  ): Promise<DisputeSettlementProposalRecord> {
    const c = assertDisputeCaseAccess(this.store, actor, input.caseId);

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      let version = 1;
      if (input.supersedesProposalId) {
        const prior = tx.getSettlementProposal(input.supersedesProposalId);
        if (prior && prior.caseId === c.id) {
          tx.saveSettlementProposal({ ...prior, status: 'SUPERSEDED', updatedAt: now });
          version = prior.version + 1;
        }
      }
      const requiredAccepting = Array.from(new Set([...c.claimantPartyIds, ...c.respondentPartyIds]));
      const initialAccepted = requiredAccepting.includes(actor.partyId) ? [actor.partyId] : [];
      const proposal: DisputeSettlementProposalRecord = {
        id: makeDispId('disp_prop'),
        caseId: c.id,
        proposerPartyId: actor.partyId,
        proposedTermsSummary: input.proposedTermsSummary,
        proposedSettlementAmountRials: input.proposedSettlementAmountRials,
        currency: 'IRR',
        conditions: input.conditions ?? [],
        expirationDateIso: input.expirationDateIso,
        acceptedByPartyIds: initialAccepted,
        requiredAcceptingPartyIds: requiredAccepting,
        status: initialAccepted.length > 0 ? 'PARTIALLY_ACCEPTED' : 'PROPOSED',
        supersedesProposalId: input.supersedesProposalId,
        version,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveSettlementProposal(proposal);
      tx.saveCase({
        ...c,
        status: 'SETTLEMENT_PROPOSED',
        version: c.version + 1,
        updatedAt: now,
      });
      return proposal;
    });
  }

  public async acceptSettlementProposal(
    actor: DisputeActorContext,
    input: { proposalId: string; asOfIso?: string }
  ): Promise<DisputeSettlementProposalRecord> {
    const proposal = this.store.getSettlementProposal(input.proposalId);
    if (!proposal) {
      throw new DisputeResolutionError('RESOURCE_NOT_FOUND', `Proposal "${input.proposalId}" not found.`, 404);
    }
    const c = assertDisputeCaseAccess(this.store, actor, proposal.caseId);
    const nowIso = input.asOfIso ?? new Date().toISOString();

    if (
      proposal.status === 'SUPERSEDED' ||
      proposal.status === 'EXPIRED' ||
      new Date(proposal.expirationDateIso).getTime() < new Date(nowIso).getTime()
    ) {
      throw new DisputeResolutionError(
        'EXPIRED_OR_SUPERSEDED_SETTLEMENT_PROPOSAL',
        `Settlement proposal "${proposal.id}" is ${proposal.status} or expired and cannot be accepted.`
      );
    }

    return this.store.runTransaction((tx) => {
      const acceptedBy = Array.from(new Set([...proposal.acceptedByPartyIds, actor.partyId]));
      const allAccepted = proposal.requiredAcceptingPartyIds.every((reqId) => acceptedBy.includes(reqId));
      const updated: DisputeSettlementProposalRecord = {
        ...proposal,
        acceptedByPartyIds: acceptedBy,
        status: allAccepted ? 'MUTUALLY_ACCEPTED' : 'PARTIALLY_ACCEPTED',
        updatedAt: nowIso,
      };
      tx.saveSettlementProposal(updated);
      if (allAccepted) {
        tx.saveCase({
          ...c,
          status: 'SETTLEMENT_AGREED',
          version: c.version + 1,
          updatedAt: nowIso,
        });
      }
      return updated;
    });
  }

  public async recordResolutionOutcome(
    actor: DisputeActorContext,
    input: {
      caseId: string;
      outcomeType: ResolutionOutcomeType;
      linkedSettlementProposalId?: string;
      externalForumReference?: string;
      resolutionSummary: string;
      agreedSettlementAmountRials?: number;
      externalPaymentReferenceId?: string;
    }
  ): Promise<{ outcome: DisputeResolutionOutcomeRecord; updatedCase: DisputeCaseRecord }> {
    const c = assertDisputeCaseAccess(this.store, actor, input.caseId);

    if (input.outcomeType === 'MUTUAL_SETTLEMENT_AGREEMENT') {
      if (!input.linkedSettlementProposalId) {
        throw new DisputeResolutionError(
          'SETTLEMENT_REQUIRES_MUTUAL_PARTY_ACCEPTANCE',
          'MUTUAL_SETTLEMENT_AGREEMENT requires a linkedSettlementProposalId accepted by all required parties.'
        );
      }
      const prop = this.store.getSettlementProposal(input.linkedSettlementProposalId);
      if (!prop || prop.status !== 'MUTUALLY_ACCEPTED') {
        throw new DisputeResolutionError(
          'SETTLEMENT_REQUIRES_MUTUAL_PARTY_ACCEPTANCE',
          `Settlement proposal "${input.linkedSettlementProposalId}" has not been mutually accepted by all parties.`
        );
      }
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const outcome: DisputeResolutionOutcomeRecord = {
        id: makeDispId('disp_out'),
        caseId: c.id,
        outcomeType: input.outcomeType,
        linkedSettlementProposalId: input.linkedSettlementProposalId,
        externalForumReference: input.externalForumReference,
        resolutionSummary: input.resolutionSummary,
        agreedSettlementAmountRials: input.agreedSettlementAmountRials,
        externalPaymentReferenceId: input.externalPaymentReferenceId,
        recordedByPartyId: actor.partyId,
        isCourtOrArbitrationJudgment: false,
        executesPaymentDirectly: false,
        recordedAtIso: now,
      };
      const updatedCase: DisputeCaseRecord = {
        ...c,
        status:
          input.outcomeType === 'REFERRED_TO_EXTERNAL_COURT_OR_ARBITRATION'
            ? 'EXTERNAL_ESCALATION_REFERENCED'
            : input.outcomeType === 'WITHDRAWN_BY_CLAIMANT'
              ? 'WITHDRAWN'
              : 'RESOLVED',
        version: c.version + 1,
        updatedAt: now,
      };
      tx.saveResolutionOutcome(outcome);
      tx.saveCase(updatedCase);
      tx.appendHistory({
        id: makeDispId('dhist'),
        caseId: c.id,
        propertyId: c.propertyId,
        eventType: 'RESOLUTION_RECORDED',
        actionSummary: `Recorded case outcome ${outcome.outcomeType}: ${outcome.resolutionSummary}`,
        actorUserId: actor.userId,
        actorPartyId: actor.partyId,
        recordedAtIso: now,
      });
      return { outcome, updatedCase };
    });
  }

  public retrieveImmutableCaseHistory(
    actor: DisputeActorContext,
    caseId: string,
    limit?: number,
    offset?: number
  ): PaginatedDisputeResult<DisputeCaseHistoryEntryRecord> {
    assertDisputeCaseAccess(this.store, actor, caseId);
    return paginateDisputeItems(this.store.listHistoryByCase(caseId), limit, offset);
  }
}
