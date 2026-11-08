/**
 * @file server/modules/dispute-resolution/disputeTypes.ts
 * @description Canonical data models, case lifecycle states, negotiation proposals,
 * settlement agreements, and timeline event structures for Employee 53 Dispute Resolution Backend.
 */

export type DisputeCategory =
  | 'SALE_PURCHASE'
  | 'RENTAL_LEASE'
  | 'DEPOSIT_REFUND'
  | 'PROPERTY_DEFECT'
  | 'MISREPRESENTATION'
  | 'COMMISSION_BROKERAGE'
  | 'VIEWING_ACCESS'
  | 'PROPERTY_MANAGEMENT'
  | 'CONSTRUCTION_DEFECT'
  | 'OWNERSHIP_AUTHORITY'
  | 'CONTRACT_PERFORMANCE'
  | 'COMMERCIAL_DISPUTE';

export type CaseStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'AWAITING_PARTIES'
  | 'AWAITING_RESPONSE'
  | 'INFORMATION_REQUESTED'
  | 'UNDER_REVIEW'
  | 'NEGOTIATION'
  | 'MEDIATION'
  | 'SETTLEMENT_PROPOSED'
  | 'SETTLEMENT_ACCEPTED'
  | 'RESOLUTION_PENDING'
  | 'RESOLVED'
  | 'CLOSED'
  | 'WITHDRAWN'
  | 'SUSPENDED'
  | 'REOPENED';

export type PartyRole =
  | 'CLAIMANT'
  | 'RESPONDENT'
  | 'REPRESENTATIVE'
  | 'INVOLVED_PARTY'
  | 'MEDIATOR';

export type ProposalStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'COUNTER_PROPOSED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'EXPIRED';

export type ResolutionOutcomeType =
  | 'AGREEMENT_REACHED'
  | 'PARTIAL_AGREEMENT'
  | 'CLAIM_WITHDRAWN'
  | 'RESOLVED_WITHOUT_AGREEMENT'
  | 'NO_RESOLUTION'
  | 'ADMINISTRATIVE_CLOSURE'
  | 'EXTERNAL_REFERRAL';

export type EvidenceConfidentiality = 'PARTIES_VISIBLE' | 'MEDIATOR_ONLY' | 'INTERNAL_LEGAL';

/**
 * Dispute Party Record.
 */
export interface DisputeParty {
  readonly partyId: string;
  readonly caseId: string;
  readonly userId: string;
  readonly role: PartyRole;
  readonly displayName: string;
  readonly phoneMasked?: string;
  readonly isAuthorizedRepresentative?: boolean;
  readonly representativeAuthorityDocMediaId?: string;
  readonly participationStatus: 'INVITED' | 'CONFIRMED' | 'DECLINED' | 'WITHDRAWN';
}

/**
 * Dispute Claim Record.
 */
export interface DisputeClaim {
  readonly claimId: string;
  readonly caseId: string;
  readonly claimantUid: string;
  readonly titleFa: string;
  readonly factualAccountFa: string;
  readonly requestedRemedyFa: string;
  readonly claimedAmountRials?: number; // Integer minor units
  readonly currency: 'IRR' | 'IRT';
  readonly status: 'PENDING_RESPONSE' | 'DISPUTED' | 'ADMITTED' | 'SETTLED' | 'WITHDRAWN';
  readonly createdAtIso: string;
}

/**
 * Claim Response Record.
 */
export interface ClaimResponse {
  readonly responseId: string;
  readonly claimId: string;
  readonly respondentUid: string;
  readonly stance: 'ADMITTED' | 'DENIED' | 'PARTIALLY_ADMITTED' | 'COUNTER_CLAIM';
  readonly statementFa: string;
  readonly counterClaimId?: string;
  readonly createdAtIso: string;
}

/**
 * Evidence Reference Record.
 * Metadata only; raw binaries reside in Media module.
 */
export interface DisputeEvidenceReference {
  readonly evidenceId: string;
  readonly caseId: string;
  readonly claimId?: string;
  readonly evidenceType: 'CONTRACT' | 'RECEIPT' | 'INSPECTION_RECORD' | 'PHOTO_VIDEO' | 'MESSAGES' | 'OFFICIAL_DOCUMENT';
  readonly descriptionFa: string;
  readonly sourceMediaId: string;
  readonly submittedByUid: string;
  readonly reviewStatus: 'SUBMITTED' | 'UNDER_REVIEW' | 'REVIEWED' | 'REJECTED';
  readonly confidentiality: EvidenceConfidentiality;
  readonly reviewerUid?: string;
  readonly reviewNotesFa?: string;
  readonly createdAtIso: string;
}

/**
 * Negotiation Proposal Record.
 */
export interface NegotiationProposal {
  readonly proposalId: string;
  readonly caseId: string;
  readonly proposedByUid: string;
  readonly proposalTermsFa: string;
  readonly proposedFinancialRemedyRials?: number;
  readonly validUntilIso: string;
  readonly status: ProposalStatus;
  readonly acceptedByUids: readonly string[];
  readonly rejectedByUids: readonly string[];
  readonly rejectionReasonFa?: string;
  readonly createdAtIso: string;
  readonly respondedAtIso?: string;
}

/**
 * Final Settlement Agreement Record.
 * Invariant: Records mutual agreement; does not claim statutory judicial enforceability.
 */
export interface SettlementAgreement {
  readonly agreementId: string;
  readonly caseId: string;
  readonly proposalId: string;
  readonly agreedTermsFa: string;
  readonly financialSettlementRials?: number;
  readonly obligationsDeadlineIso?: string;
  readonly partyAcceptances: readonly {
    readonly partyUid: string;
    readonly acceptedAtIso: string;
    readonly signatureHash: string;
  }[];
  readonly status: 'DRAFT' | 'SIGNED' | 'COMPLETED' | 'DEFAULTED';
  readonly signedAtIso: string;
  readonly completedAtIso?: string;
}

/**
 * Mediation Session Record.
 */
export interface MediationSession {
  readonly sessionId: string;
  readonly caseId: string;
  readonly mediatorUid: string;
  readonly scheduledAtIso: string;
  readonly agendaFa: string;
  readonly sessionStatus: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  readonly mediatorPrivateNotesFa?: string; // Strictly hidden from parties!
  readonly agreedNextStepsFa?: string;
  readonly createdAtIso: string;
}

/**
 * Case Deadline Record.
 */
export interface CaseDeadline {
  readonly deadlineId: string;
  readonly caseId: string;
  readonly responsiblePartyUid: string;
  readonly deadlineType: 'RESPONSE' | 'EVIDENCE_SUBMISSION' | 'PROPOSAL_RESPONSE' | 'SETTLEMENT_PAYMENT';
  readonly dueAtIso: string;
  readonly status: 'ACTIVE' | 'MET' | 'OVERDUE' | 'CANCELLED';
  readonly reasonFa: string;
  readonly createdAtIso: string;
}

/**
 * Append-Only Case Timeline Event.
 */
export interface CaseTimelineEvent {
  readonly eventId: string;
  readonly caseId: string;
  readonly eventType:
    | 'CASE_CREATED'
    | 'PARTY_JOINED'
    | 'CLAIM_ADDED'
    | 'RESPONSE_SUBMITTED'
    | 'EVIDENCE_ATTACHED'
    | 'STATUS_CHANGED'
    | 'PROPOSAL_MADE'
    | 'SETTLEMENT_ACCEPTED'
    | 'SESSION_HELD'
    | 'DEADLINE_UPDATED'
    | 'CASE_CLOSED'
    | 'CASE_REOPENED';
  readonly actorUid: string;
  readonly actorRole: string;
  readonly descriptionFa: string;
  readonly timestampIso: string;
  readonly transition?: {
    readonly fromStatus: CaseStatus;
    readonly toStatus: CaseStatus;
  };
}

/**
 * Dispute Case Master Record.
 */
export interface DisputeCaseRecord {
  readonly id: string;
  readonly category: DisputeCategory;
  readonly titleFa: string;
  readonly descriptionFa: string;
  readonly propertyReferenceId?: string;
  readonly transactionReferenceId?: string;
  readonly claimantUid: string;
  readonly respondentUid: string;
  readonly status: CaseStatus;
  readonly assignedMediatorUid?: string;
  readonly assignedCaseHandlerUid?: string;
  readonly idempotencyKey: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly closedAtIso?: string;
  readonly closureReasonFa?: string;
  readonly resolutionOutcome?: {
    readonly outcomeType: ResolutionOutcomeType;
    readonly recordedAtIso: string;
    readonly explanationFa: string;
    readonly settlementAgreementId?: string;
  };
}

/**
 * Versioned Dispute Domain Events.
 */
export interface DisputeDomainEvent {
  readonly eventId: string;
  readonly eventType:
    | 'dispute.case_created'
    | 'dispute.claim_added'
    | 'dispute.response_submitted'
    | 'dispute.proposal_made'
    | 'dispute.proposal_accepted'
    | 'dispute.settlement_signed'
    | 'dispute.status_changed'
    | 'dispute.case_resolved';
  readonly caseId: string;
  readonly claimantUid?: string;
  readonly respondentUid?: string;
  readonly status?: CaseStatus;
  readonly timestampIso: string;
  readonly summaryFa: string;
}
