import type { NormalizedTimestamp } from '../../core';
import type {
  PaymentReferenceLifecycleState,
  TransactionCurrencyCode,
} from '../contracts/externalAdapters';

export type RealEstateTransactionType =
  | 'PROPERTY_PURCHASE'
  | 'PROPERTY_SALE'
  | 'RESIDENTIAL_RENTAL'
  | 'COMMERCIAL_RENTAL'
  | 'LEASE_RENEWAL';

export type RealEstateTransactionCaseStatus =
  | 'DRAFT_INITIATED'
  | 'NEGOTIATION_ACTIVE'
  | 'TERMS_ACCEPTED_PENDING_CLOSING'
  | 'CLOSING_IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'TERMINATED'
  | 'FAILED'
  | 'DISPUTED';

export type TransactionParticipantRole =
  | 'BUYER'
  | 'SELLER'
  | 'TENANT'
  | 'LANDLORD'
  | 'AUTHORIZED_REPRESENTATIVE'
  | 'BROKER_OR_AGENT'
  | 'TRANSACTION_COORDINATOR'
  | 'AUTHORIZED_REVIEWER';

export type ParticipantInvitationStatus =
  | 'INVITED_PENDING'
  | 'ACCEPTED_ACTIVE'
  | 'DECLINED'
  | 'REMOVED';

export type ParticipantPermissionScope =
  | 'PROPOSE_AND_ACCEPT_TERMS'
  | 'NEGOTIATE_ON_BEHALF_WITH_AUTHORITY'
  | 'COORDINATE_AND_RECORD_MILESTONES'
  | 'REVIEW_ONLY';

export interface TransactionParticipantRecord {
  participantId: string;
  userOrOrganizationUid: string;
  role: TransactionParticipantRole;
  participationStatus: ParticipantInvitationStatus;
  authorityEvidenceRefId: string | null;
  permissionScope: ParticipantPermissionScope;
  invitedByUid: string;
  invitedAt: NormalizedTimestamp;
  respondedAt: NormalizedTimestamp | null;
}

/**
 * Section 3E: Explicit Distinction for Purchase vs Rental Financial Terms
 * Rent and Security Deposit are NEVER combined into one amount.
 */
export interface PurchaseFinancialTerms {
  termMode: 'PURCHASE_OR_SALE';
  currency: TransactionCurrencyCode;
  listingAskingPriceReference: number | null;
  proposedPurchasePrice: number;
  agreedPurchasePrice: number | null;
  earnestDepositAmount: number;
  advancePaymentAmount: number;
  remainingBalanceAmount: number;
  paymentScheduleRefIds: string[];
}

export interface RentalFinancialTerms {
  termMode: 'RENTAL_OR_LEASE';
  currency: TransactionCurrencyCode;
  listingAskingRentReference: number | null;
  listingAskingDepositReference: number | null;
  monthlyOrPeriodicRentAmount: number;
  securityDepositAmount: number;
  advanceRentAmount: number;
  paymentFrequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  leaseDurationMonths: number;
  renewalTermsSummary: string;
}

export type TransactionFinancialTermsUnion = PurchaseFinancialTerms | RentalFinancialTerms;

export interface FinancialTermsVersionEntry {
  revisionNumber: number;
  sourceOfferId: string | null;
  recordedByUid: string;
  classification: 'INITIAL_PROPOSAL' | 'COUNTEROFFER_REVISION' | 'ACCEPTED_AGREED_TERMS';
  terms: TransactionFinancialTermsUnion;
  recordedAt: NormalizedTimestamp;
}

export type NegotiationOfferLifecycleState =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'COUNTEROFFERED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'EXPIRED';

export interface TransactionOfferRecord {
  offerId: string;
  transactionId: string;
  canonicalPropertyId: string;
  offerVersion: number;
  previousOfferId: string | null;
  proposingParticipantUid: string;
  proposingRole: TransactionParticipantRole;
  recipientParticipantUid: string;
  financialTerms: TransactionFinancialTermsUnion;
  proposedConditions: string[];
  validUntilIso: string;
  status: NegotiationOfferLifecycleState;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type ContractWorkflowLifecycleState =
  | 'NOT_PREPARED'
  | 'DRAFT_PREPARATION'
  | 'DRAFT_REVIEW'
  | 'PARTICIPANT_APPROVAL_PENDING'
  | 'SIGNED_BY_PARTIES'
  | 'EFFECTIVE_ACTIVE'
  | 'AMENDED'
  | 'TERMINATED'
  | 'COMPLETED';

export interface TransactionContractMetadataRecord {
  contractRefId: string;
  contractVersion: number;
  mediaDocumentRefId: string;
  mediaSha256Checksum: string;
  workflowState: ContractWorkflowLifecycleState;
  approvedByParticipantUids: string[];
  signedByParticipantUids: string[];
  effectiveDateIso: string | null;
  expirationDateIso: string | null;
  amendmentRefIds: string[];
  terminationRefId: string | null;
  nonLegalValidityDisclaimer: string;
  updatedAt: NormalizedTimestamp;
}

export type TransactionMilestoneType =
  | 'OFFER_SUBMITTED'
  | 'OFFER_ACCEPTED'
  | 'DUE_DILIGENCE_REQUESTED'
  | 'DUE_DILIGENCE_COMPLETED'
  | 'CONTRACT_PREPARED'
  | 'CONTRACT_SIGNED'
  | 'DEPOSIT_RECORDED'
  | 'PAYMENT_MILESTONE_RECORDED'
  | 'HANDOVER_SCHEDULED'
  | 'HANDOVER_COMPLETED'
  | 'TRANSACTION_COMPLETED';

export type MilestoneVerificationStage =
  | 'SCHEDULED'
  | 'REPORTED_UNVERIFIED'
  | 'VERIFIED'
  | 'COMPLETED';

export interface TransactionMilestoneRecord {
  milestoneId: string;
  transactionId: string;
  milestoneType: TransactionMilestoneType;
  stage: MilestoneVerificationStage;
  responsibleParticipantUid: string;
  dueDateIso: string | null;
  completedAt: NormalizedTimestamp | null;
  evidenceRefIds: string[];
  notes: string;
  recordedByUid: string;
  updatedAt: NormalizedTimestamp;
}

export interface TransactionPaymentReferenceRecord {
  paymentRefRecordId: string;
  transactionId: string;
  externalPaymentReferenceId: string;
  purpose: 'EARNEST_DEPOSIT' | 'ADVANCE_PAYMENT' | 'CLOSING_BALANCE' | 'SECURITY_DEPOSIT' | 'FIRST_RENT';
  state: PaymentReferenceLifecycleState;
  verifiedByAuthoritativeSource: boolean;
  amount: number | null;
  currency: TransactionCurrencyCode;
  providerReferenceCode: string | null;
  recordedByUid: string;
  recordedAt: NormalizedTimestamp;
}

export interface TransactionCancellationOrDisputeRecord {
  recordId: string;
  transactionId: string;
  recordKind: 'CANCELLATION' | 'TERMINATION' | 'DISPUTE_REFERENCE';
  initiatingParticipantUid: string;
  reasonCategory:
    | 'MUTUAL_WITHDRAWAL'
    | 'FINANCING_CONTINGENCY_FAILED'
    | 'DUE_DILIGENCE_BLOCKED'
    | 'COUNTERPARTY_DEFAULT_ALLEGED'
    | 'DEPOSIT_OR_TERMS_DISPUTE'
    | 'OTHER';
  explanation: string;
  supportingEvidenceRefIds: string[];
  reviewStatus: 'OPEN_RECORDED' | 'UNDER_COORDINATOR_REVIEW' | 'RESOLVED_EXTERNAL_REFERENCE';
  externalResolutionReferenceId: string | null;
  nonAdjudicationDisclaimer: string;
  effectiveAt: NormalizedTimestamp;
}

export interface TransactionHistoryEntryRecord {
  historyId: string;
  transactionId: string;
  canonicalPropertyId: string;
  actorUid: string;
  eventCategory:
    | 'TRANSACTION_CREATED'
    | 'PARTICIPANT_CHANGE'
    | 'OFFER_LIFECYCLE'
    | 'FINANCIAL_TERMS_REVISION'
    | 'CONTRACT_METADATA_UPDATE'
    | 'MILESTONE_UPDATE'
    | 'PAYMENT_REFERENCE_UPDATE'
    | 'COMPLETION_RECORDED'
    | 'CANCELLATION_OR_DISPUTE';
  summary: string;
  revisionNumber: number;
  occurredAt: NormalizedTimestamp;
}

export interface RealEstateTransactionRecord {
  transactionId: string;
  canonicalPropertyId: string;
  listingOriginRefId: string | null;
  dueDiligenceCaseRefId: string | null;
  transactionType: RealEstateTransactionType;
  initiatingPartyUid: string;
  status: RealEstateTransactionCaseStatus;
  currency: TransactionCurrencyCode;
  participants: TransactionParticipantRecord[];
  currentFinancialTerms: TransactionFinancialTermsUnion;
  financialTermsHistory: FinancialTermsVersionEntry[];
  activeOfferId: string | null;
  acceptedOfferId: string | null;
  offerIds: string[];
  contractMetadata: TransactionContractMetadataRecord | null;
  milestoneIds: string[];
  paymentReferenceIds: string[];
  cancellationOrDisputeIds: string[];
  completionMetadata: {
    completedAt: NormalizedTimestamp;
    completedByUid: string;
    acceptedOfferId: string;
    contractRefId: string;
    verifiedPaymentRecordIds: string[];
    dueDiligenceAssessmentVersion: number | null;
  } | null;
  /** Optimistic concurrency control version (Section 6) */
  revisionNumber: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}
