export type DisputeCategory =
  | 'SALE_AND_PURCHASE_DISPUTE'
  | 'RENTAL_AND_LEASE_DISPUTE'
  | 'DEPOSIT_AND_REFUND_DISPUTE'
  | 'PROPERTY_CONDITION_AND_DEFECT_DISPUTE'
  | 'MISREPRESENTATION_AND_DISCLOSURE_DISPUTE'
  | 'BROKERAGE_AND_COMMISSION_DISPUTE'
  | 'VIEWING_AND_ACCESS_DISPUTE'
  | 'PROPERTY_MANAGEMENT_DISPUTE'
  | 'CONSTRUCTION_AND_DEVELOPMENT_DISPUTE'
  | 'OWNERSHIP_OR_AUTHORITY_DISPUTE'
  | 'CONTRACT_PERFORMANCE_DISPUTE'
  | 'OTHER_COMMERCIAL_PROPERTY_DISPUTE';

export type DisputeCaseStatus =
  | 'DRAFT'
  | 'INTAKE_SUBMITTED'
  | 'PARTY_NOTIFICATION_PENDING'
  | 'AWAITING_RESPONSE'
  | 'EVIDENCE_COLLECTION'
  | 'NEGOTIATION'
  | 'MEDIATION_IN_PROGRESS'
  | 'SETTLEMENT_PROPOSED'
  | 'SETTLEMENT_AGREED'
  | 'EXTERNAL_ESCALATION_REFERENCED'
  | 'RESOLVED'
  | 'CLOSED'
  | 'WITHDRAWN'
  | 'REJECTED_INCOMPLETE';

export type DisputePartyRole =
  | 'CLAIMANT'
  | 'RESPONDENT'
  | 'ADDITIONAL_INVOLVED_PARTY'
  | 'AUTHORIZED_REPRESENTATIVE'
  | 'MEDIATOR_OR_CASE_COORDINATOR'
  | 'ORGANIZATION_PARTICIPANT';

export type DisputePartyParticipationStatus =
  | 'INVITED'
  | 'ACKNOWLEDGED'
  | 'ACTIVE'
  | 'DECLINED_TO_PARTICIPATE'
  | 'REMOVED';

export type DisputeClaimEpistemicState =
  | 'UNVERIFIED_ALLEGATION'
  | 'DOCUMENT_SUPPORTED_CLAIM'
  | 'MUTUALLY_ACKNOWLEDGED_FACT'
  | 'DISPUTED_BY_RESPONDENT'
  | 'WITHDRAWN_CLAIM';

export type DisputeResponseStance =
  | 'DENIED'
  | 'PARTIALLY_ACKNOWLEDGED'
  | 'ACKNOWLEDGED'
  | 'COUNTER_EXPLANATION_SUBMITTED';

export type DisputeEvidenceReviewState =
  | 'SUBMITTED_UNVERIFIED'
  | 'REVIEWED_FOR_COMPLETENESS'
  | 'CHALLENGED_BY_COUNTERPARTY'
  | 'INDEPENDENTLY_CORROBORATED';

export type DisputeCommunicationVisibility =
  | 'SHARED_CASE_COMMUNICATION'
  | 'CAUCUS_PRIVATE_MEDIATION_NOTE'
  | 'INTERNAL_COORDINATOR_NOTE';

export type DisputeDeadlineType =
  | 'RESPONSE_DEADLINE'
  | 'EVIDENCE_SUBMISSION_DEADLINE'
  | 'SETTLEMENT_OFFER_EXPIRY'
  | 'MEDIATION_SESSION_DATE'
  | 'COMPLIANCE_FOLLOW_UP_DEADLINE';

export type SettlementProposalStatus =
  | 'PROPOSED'
  | 'PARTIALLY_ACCEPTED'
  | 'MUTUALLY_ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'EXPIRED'
  | 'SUPERSEDED';

export type ResolutionOutcomeType =
  | 'MUTUAL_SETTLEMENT_AGREEMENT'
  | 'WITHDRAWN_BY_CLAIMANT'
  | 'UNRESOLVED_CLOSED_NO_AGREEMENT'
  | 'REFERRED_TO_EXTERNAL_COURT_OR_ARBITRATION';

export interface DisputeRelatedModuleReferences {
  listingRef?: string;
  bargainRef?: string;
  transactionRef?: string;
  rentalOrLeaseRef?: string;
  brokerageRef?: string;
  viewingRef?: string;
  propertyManagementRef?: string;
}

export interface DisputeChronologyEvent {
  occurredAtIso: string;
  summary: string;
  reportedByPartyId: string;
}

export interface DisputeCaseRecord {
  id: string;
  category: DisputeCategory;
  subtype: string;
  taxonomyVersion: '2026.1';
  propertyId: string;
  relatedReferences: DisputeRelatedModuleReferences;
  claimantPartyIds: string[];
  respondentPartyIds: string[];
  allParticipantPartyIds: string[];
  assignedMediatorPartyId?: string;
  allegedIssueDescription: string;
  requestedResolutionSummary: string;
  chronology: DisputeChronologyEvent[];
  submissionChannel: 'WEB_PORTAL' | 'BROKER_DESK' | 'SUPPORT_INTAKE' | 'API_SUBMISSION';
  supportingEvidenceIds: string[];
  status: DisputeCaseStatus;
  allegationEstablishedAsTrueByFilingAlone: false;
  isJudicialOrArbitralRuling: false;
  isSyntheticTestFixture: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DisputePartyRecord {
  id: string;
  caseId: string;
  partyId: string;
  role: DisputePartyRole;
  representingPartyId?: string;
  representationAuthorityEvidenceRef?: string;
  representationVerified: boolean;
  participationStatus: DisputePartyParticipationStatus;
  contactNotificationRef?: string;
  assumesAuthorityFromNameOrEmailAlone: false;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeClaimRecord {
  id: string;
  caseId: string;
  submittedByPartyId: string;
  claimClassification:
    | 'ALLEGED_BREACH'
    | 'FINANCIAL_CLAIM'
    | 'DEPOSIT_RETENTION_OR_RETURN'
    | 'DEFECT_ALLEGATION'
    | 'MISREPRESENTATION_ALLEGATION'
    | 'COMMISSION_CLAIM'
    | 'OTHER_CLAIM';
  statementOfClaim: string;
  claimedAmountRials?: number;
  currency: 'IRR';
  requestedRemedy: string;
  supportingEvidenceIds: string[];
  epistemicState: DisputeClaimEpistemicState;
  supersedesClaimId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeResponseRecord {
  id: string;
  caseId: string;
  claimId: string;
  respondingPartyId: string;
  stance: DisputeResponseStance;
  responseSummary: string;
  counterclaimSummary?: string;
  supportingEvidenceIds: string[];
  createdAt: string;
}

export interface DisputeEvidenceReferenceRecord {
  id: string;
  caseId: string;
  submittedByPartyId: string;
  evidenceCategory: string;
  mediaReferenceId: string;
  description: string;
  sourceProvenance: string;
  confidentialityTier: 'CASE_PARTICIPANTS' | 'MEDIATOR_RESTRICTED' | 'CONFIDENTIAL_LEGAL_FINANCIAL';
  reviewState: DisputeEvidenceReviewState;
  challengedReason?: string;
  isAuthenticByUploadAlone: false;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeCommunicationRecord {
  id: string;
  caseId: string;
  authorPartyId: string;
  visibility: DisputeCommunicationVisibility;
  caucusTargetPartyId?: string;
  subject: string;
  messageBody: string;
  relatedEvidenceIds: string[];
  recordedAtIso: string;
}

export interface DisputeDeadlineRecord {
  id: string;
  caseId: string;
  deadlineType: DisputeDeadlineType;
  targetPartyId: string;
  dueDateIso: string;
  reminderConfirmedByNotificationsModule: boolean;
  status: 'UPCOMING' | 'OVERDUE' | 'SATISFIED' | 'EXTENDED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

export interface DisputeMediationSessionRecord {
  id: string;
  caseId: string;
  mediatorPartyId: string;
  conflictOfInterestDeclaredNone: boolean;
  scheduledAtIso: string;
  participatingPartyIds: string[];
  facilitationSummary?: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  isBindingArbitrationAward: false;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeSettlementProposalRecord {
  id: string;
  caseId: string;
  proposerPartyId: string;
  proposedTermsSummary: string;
  proposedSettlementAmountRials?: number;
  currency: 'IRR';
  conditions: string[];
  expirationDateIso: string;
  acceptedByPartyIds: string[];
  requiredAcceptingPartyIds: string[];
  status: SettlementProposalStatus;
  supersedesProposalId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeResolutionOutcomeRecord {
  id: string;
  caseId: string;
  outcomeType: ResolutionOutcomeType;
  linkedSettlementProposalId?: string;
  externalForumReference?: string;
  resolutionSummary: string;
  agreedSettlementAmountRials?: number;
  externalPaymentReferenceId?: string;
  recordedByPartyId: string;
  isCourtOrArbitrationJudgment: false;
  executesPaymentDirectly: false;
  recordedAtIso: string;
}

export interface DisputeCaseHistoryEntryRecord {
  id: string;
  caseId: string;
  propertyId: string;
  eventType: string;
  actionSummary: string;
  actorUserId: string;
  actorPartyId: string;
  recordedAtIso: string;
}

export interface DisputeActorContext {
  userId: string;
  partyId: string;
  role: 'CASE_PARTY' | 'AUTHORIZED_REPRESENTATIVE' | 'MEDIATOR_OR_COORDINATOR' | 'UNRELATED_USER';
}

export type DisputeResolutionErrorCode =
  | 'VALIDATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'INVALID_PROPERTY_REFERENCE'
  | 'UNAUTHORIZED_CASE_ACCESS'
  | 'PRIVATE_CAUCUS_NOTE_ACCESS_DENIED'
  | 'RESTRICTED_EVIDENCE_ACCESS_DENIED'
  | 'REPRESENTATION_AUTHORITY_EVIDENCE_REQUIRED'
  | 'MEDIATOR_CONFLICT_OF_INTEREST'
  | 'INVALID_CASE_TRANSITION'
  | 'EXPIRED_OR_SUPERSEDED_SETTLEMENT_PROPOSAL'
  | 'SETTLEMENT_REQUIRES_MUTUAL_PARTY_ACCEPTANCE'
  | 'CONCURRENCY_CONFLICT'
  | 'PERSISTENCE_FAILURE'
  | 'CROSS_MODULE_WRITE_FORBIDDEN';

export class DisputeResolutionError extends Error {
  constructor(
    public readonly code: DisputeResolutionErrorCode,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'DisputeResolutionError';
  }
}
