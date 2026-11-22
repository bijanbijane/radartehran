export type RealEstateTransactionType =
  | 'PROPERTY_SALE'
  | 'PROPERTY_PURCHASE'
  | 'RESIDENTIAL_RENTAL'
  | 'COMMERCIAL_RENTAL'
  | 'LEASE_RENEWAL'
  | 'LEASE_ASSIGNMENT'
  | 'PROPERTY_EXCHANGE'
  | 'OTHER_SUPPORTED_TRANSACTION';

export type RealEstateTransactionStatus =
  | 'DRAFT'
  | 'INITIATED'
  | 'PARTICIPANTS_PENDING'
  | 'OFFER_PENDING'
  | 'NEGOTIATION'
  | 'OFFER_ACCEPTED'
  | 'TERMS_PENDING'
  | 'DUE_DILIGENCE'
  | 'CONTRACT_PENDING'
  | 'CONTRACT_EXECUTION_PENDING'
  | 'CONDITIONS_PENDING'
  | 'CLOSING_PENDING'
  | 'HANDOVER_PENDING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'TERMINATED'
  | 'EXPIRED'
  | 'DISPUTED'
  | 'UNKNOWN';

export type TransactionOriginClassification =
  | 'PLATFORM_CREATED_TRANSACTION'
  | 'EXTERNALLY_REPORTED_TRANSACTION'
  | 'IMPORTED_HISTORICAL_TRANSACTION'
  | 'VERIFIED_COMPLETED_TRANSACTION'
  | 'UNVERIFIED_TRANSACTION';

export type TransactionParticipantRole =
  | 'BUYER'
  | 'SELLER'
  | 'LANDLORD'
  | 'TENANT'
  | 'CO_BUYER'
  | 'CO_SELLER'
  | 'PROPERTY_OWNER'
  | 'AUTHORIZED_REPRESENTATIVE'
  | 'BROKERAGE_ORGANIZATION'
  | 'LISTING_AGENT'
  | 'BUYER_AGENT'
  | 'SELLER_AGENT'
  | 'WITNESS'
  | 'OTHER_SUPPORTED_ROLE';

export type TransactionOfferType =
  | 'PURCHASE_OFFER'
  | 'RENTAL_OFFER'
  | 'LEASE_RENEWAL_OFFER'
  | 'COUNTEROFFER'
  | 'REVISED_COMMERCIAL_OFFER';

export type TransactionOfferStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'RECEIVED'
  | 'UNDER_REVIEW'
  | 'COUNTERED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'EXPIRED'
  | 'SUPERSEDED'
  | 'UNKNOWN';

export type NegotiationVisibilityScope =
  | 'SHARED_PARTICIPANTS'
  | 'PRIVATE_PARTICIPANT_NOTE'
  | 'INTERNAL_BROKERAGE_NOTE';

export type DealTermEpistemicStage =
  | 'PROPOSED_TERM'
  | 'NEGOTIATED_TERM'
  | 'ACCEPTED_TERM'
  | 'CONTRACTUAL_TERM'
  | 'VERIFIED_COMPLETED_TERM';

export type TransactionConditionCategory =
  | 'PROPERTY_DUE_DILIGENCE'
  | 'OWNERSHIP_VERIFICATION'
  | 'PERMIT_VERIFICATION'
  | 'FINANCING_APPROVAL'
  | 'INSURANCE_VERIFICATION'
  | 'TAX_CLEARANCE'
  | 'REQUIRED_DOCUMENT_SUBMISSION'
  | 'INSPECTION_COMPLETION'
  | 'DEPOSIT_CONFIRMATION'
  | 'CONTRACT_EXECUTION'
  | 'HANDOVER_REQUIREMENTS';

export type TransactionConditionStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'SATISFIED'
  | 'WAIVED'
  | 'FAILED'
  | 'DISPUTED'
  | 'EXPIRED'
  | 'UNKNOWN';

export type MilestoneEpistemicStatus =
  | 'PLANNED_MILESTONE'
  | 'REPORTED_MILESTONE'
  | 'CONFIRMED_MILESTONE'
  | 'OVERDUE_MILESTONE'
  | 'CANCELLED_MILESTONE';

export type ContractExecutionStatus =
  | 'DRAFT'
  | 'PREPARED'
  | 'SENT_FOR_SIGNATURE'
  | 'PARTIALLY_SIGNED'
  | 'FULLY_SIGNED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type ContractProvenanceStage =
  | 'DRAFT_CONTRACT'
  | 'UPLOADED_CONTRACT_UNVERIFIED'
  | 'USER_REPORTED_SIGNED_DOCUMENT'
  | 'SIGNATURE_PROVIDER_CONFIRMED_EXECUTION'
  | 'OFFICIALLY_REGISTERED_CONTRACT';

export type ClosingWorkflowStatus =
  | 'NOT_STARTED'
  | 'PREPARING'
  | 'CONDITIONS_PENDING'
  | 'READY_FOR_CLOSING'
  | 'CLOSING_IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'DISPUTED'
  | 'UNKNOWN';

export type HandoverWorkflowStatus =
  | 'SCHEDULED'
  | 'PREPARING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'DISPUTED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type TerminationDistinctionType =
  | 'CANCELLED_BEFORE_AGREEMENT'
  | 'OFFER_WITHDRAWN'
  | 'CONTRACT_TERMINATED'
  | 'TRANSACTION_EXPIRED'
  | 'TRANSACTION_FAILED'
  | 'TRANSACTION_DISPUTED'
  | 'COMPLETED_TRANSACTION_CHALLENGED';

export type PriceDistinctionClassification =
  | 'ASKING_PRICE'
  | 'INITIAL_OFFER_AMOUNT'
  | 'ACCEPTED_OFFER_AMOUNT'
  | 'CONTRACTUAL_AMOUNT'
  | 'REPORTED_FINAL_AMOUNT'
  | 'VERIFIED_COMPLETED_TRANSACTION_AMOUNT';

export interface RealEstateTransactionRecord {
  id: string;
  transactionType: RealEstateTransactionType;
  propertyId: string;
  listingReferenceId?: string;
  listingAskingPriceRials?: number;
  jurisdictionCitySlug: string;
  initiatorPartyId: string;
  participantIds: string[];
  acceptedOfferId?: string;
  activeContractId?: string;
  status: RealEstateTransactionStatus;
  originClassification: TransactionOriginClassification;
  sourceProvenance: string;
  workflowCompletionEqualsLegalCompletion: false;
  isSyntheticTestFixture: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionParticipantRecord {
  id: string;
  transactionId: string;
  propertyId: string;
  partyId: string;
  role: TransactionParticipantRole;
  effectiveStartIso: string;
  effectiveEndIso?: string;
  authorizationScope: string;
  authorityVerifiedByRegistryOrMandate: boolean;
  supportingEvidenceReference?: string;
  infersAuthorityFromTransactionCreationAlone: false;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionOfferRecord {
  id: string;
  transactionId: string;
  propertyId: string;
  creatorPartyId: string;
  recipientPartyIds: string[];
  offerType: TransactionOfferType;
  proposedAmountRials: number;
  monthlyRentRials?: number;
  securityDepositRials?: number;
  currency: 'IRR';
  paymentStructureReference?: string;
  proposedEffectiveDateIso: string;
  expirationDateIso: string;
  conditions: string[];
  supportingDocumentIds: string[];
  status: TransactionOfferStatus;
  parentOfferId?: string;
  supersededByOfferId?: string;
  acceptedByPartyId?: string;
  acceptedAtIso?: string;
  isLegallyExecutedContractByAcceptanceAlone: false;
  isCompletedSalePrice: false;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface NegotiationEntryRecord {
  id: string;
  transactionId: string;
  relatedOfferId?: string;
  relatedOfferVersion?: number;
  authorPartyId: string;
  authorBrokerageId?: string;
  visibilityScope: NegotiationVisibilityScope;
  negotiationCategory:
    | 'PRICE_NEGOTIATION'
    | 'DEPOSIT_NEGOTIATION'
    | 'PAYMENT_TERMS'
    | 'CLOSING_DATE'
    | 'RENTAL_DURATION'
    | 'MAINTENANCE_RESPONSIBILITIES'
    | 'INCLUDED_FIXTURES'
    | 'OTHER_COMMERCIAL_TERMS';
  structuredProposalSummary: string;
  supportingDocumentId?: string;
  recordedAtIso: string;
}

export interface DealTermRecord {
  id: string;
  transactionId: string;
  termCategory: string;
  termValue: string | number;
  unitOrCurrency: string;
  version: number;
  supersedesTermId?: string;
  effectivePeriodSummary: string;
  epistemicStage: DealTermEpistemicStage;
  supportingEvidenceReference?: string;
  sourceProvenance: string;
  isLegallyBindingWithoutContractEvidence: false;
  createdAt: string;
}

export interface TransactionConditionRecord {
  id: string;
  transactionId: string;
  conditionCategory: TransactionConditionCategory;
  description: string;
  responsiblePartyId: string;
  requiredCompletionDateIso: string;
  status: TransactionConditionStatus;
  evidenceReference?: string;
  verificationSourceModule?: string;
  completedAtIso?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionMilestoneRecord {
  id: string;
  transactionId: string;
  milestoneType:
    | 'OFFER_SUBMITTED'
    | 'OFFER_ACCEPTED'
    | 'DUE_DILIGENCE_COMPLETED'
    | 'FINANCING_APPROVED'
    | 'CONTRACT_EXECUTED'
    | 'DEPOSIT_CONFIRMED'
    | 'OWNERSHIP_TRANSFER_CONFIRMED'
    | 'FINAL_PAYMENT_CONFIRMED'
    | 'PROPERTY_HANDOVER_COMPLETED'
    | 'TRANSACTION_CLOSED';
  expectedDateIso: string;
  actualDateIso?: string;
  epistemicStatus: MilestoneEpistemicStatus;
  responsiblePartyId: string;
  evidenceReferences: string[];
  sourceProvenance: string;
  plannedEqualsCompleted: false;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionContractReferenceRecord {
  id: string;
  transactionId: string;
  contractType: string;
  contractVersion: number;
  contractingPartyIds: string[];
  contractDateIso: string;
  effectiveDateIso: string;
  expirationDateIso?: string;
  executionStatus: ContractExecutionStatus;
  provenanceStage: ContractProvenanceStage;
  signatureProviderReference?: string;
  officialRegistrationReference?: string;
  mediaDocumentId: string;
  provesLegalValidityFromPdfImageAlone: false;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionClosingRecord {
  id: string;
  transactionId: string;
  expectedClosingDateIso: string;
  actualClosingDateIso?: string;
  requiredConditionIds: string[];
  finalContractReferenceId?: string;
  finalPaymentConfirmationRef?: string;
  ownershipTransferConfirmationRef?: string;
  status: ClosingWorkflowStatus;
  responsiblePartyIds: string[];
  directlyProcessesPayments: false;
  directlyTransfersOwnership: false;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyHandoverRecord {
  id: string;
  transactionId: string;
  propertyId: string;
  handoverDateIso: string;
  participantPartyIds: string[];
  conditionReportReferenceId?: string;
  keyHandoverReference?: string;
  meterReadingReferences: string[];
  outstandingMaintenanceItems: string[];
  status: HandoverWorkflowStatus;
  provesLegalPossessionTransferAlone: false;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionTerminationRecord {
  id: string;
  transactionId: string;
  distinctionType: TerminationDistinctionType;
  reasonCategory: string;
  explanation: string;
  initiatingPartyId: string;
  effectiveDateIso: string;
  relatedOfferOrContractId?: string;
  supportingEvidenceIds: string[];
  autoCalculatesLegalPenalties: false;
  autoRefundsDeposits: false;
  assumesAllObligationsReleased: false;
  recordedAtIso: string;
}

export interface CompletedTransactionRecord {
  id: string;
  transactionId: string;
  propertyId: string;
  transactionType: RealEstateTransactionType;
  completionDateIso: string;
  finalAgreedAmountRials: number;
  priceClassification: PriceDistinctionClassification;
  listingAskingPriceRials?: number;
  rentalTermsBreakdown?: {
    monthlyRentRials: number;
    annualRentRials?: number;
    securityDepositRials: number;
    advanceRentRials?: number;
  };
  currency: 'IRR';
  finalContractReferenceId: string;
  participantPartyIds: string[];
  completionEvidenceRefs: string[];
  verificationStatus: 'VERIFIED_COMPLETED' | 'REPORTED_UNVERIFIED';
  publiclyPublishableWithoutConsent: false;
  version: number;
  recordedAtIso: string;
}

export interface TransactionHistoryEntryRecord {
  id: string;
  transactionId: string;
  propertyId: string;
  entityType: string;
  actionSummary: string;
  actorUserId: string;
  provenanceReference: string;
  recordedAtIso: string;
}

export interface TransactionActorContext {
  userId: string;
  partyId: string;
  brokerageId?: string;
  role: 'PARTICIPANT' | 'BROKER_AGENT' | 'PLATFORM_VERIFIER_OR_ADMIN' | 'UNRELATED_USER';
}

export type RealEstateTransactionErrorCode =
  | 'VALIDATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'INVALID_PROPERTY_REFERENCE'
  | 'INCOMPATIBLE_PARTICIPANT_ROLE'
  | 'UNVERIFIED_SELLER_OR_LANDLORD_AUTHORITY'
  | 'UNAUTHORIZED_TRANSACTION_ACCESS'
  | 'PRIVATE_NEGOTIATION_NOTE_ACCESS_DENIED'
  | 'EXPIRED_OR_SUPERSEDED_OFFER_CANNOT_BE_ACCEPTED'
  | 'UNAUTHORIZED_OFFER_ACCEPTANCE'
  | 'CONCURRENT_OFFER_ACCEPTANCE_CONFLICT'
  | 'CONDITION_SATISFACTION_REQUIRES_EVIDENCE'
  | 'PLANNED_MILESTONE_NOT_COMPLETED_WITHOUT_EVIDENCE'
  | 'UPLOADED_PDF_NOT_EXECUTED_CONTRACT'
  | 'CLOSING_REQUIRES_PAYMENT_AND_OWNERSHIP_CONFIRMATION'
  | 'COMPLETED_TRANSACTION_IMMUTABLE'
  | 'ASKING_PRICE_OR_OFFER_NOT_VERIFIED_COMPLETED_PRICE'
  | 'PERSISTENCE_FAILURE'
  | 'CROSS_MODULE_WRITE_FORBIDDEN'
  | 'INVALID_INPUT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'OFFER_ALREADY_ACCEPTED'
  | 'DUPLICATE_ACTIVE_OFFER'
  | 'INVALID_OFFER_TRANSITION'
  | 'SELF_ACCEPTANCE_FORBIDDEN'
  | 'CONCURRENT_MODIFICATION_CONFLICT'
  | 'COMPLETION_PREREQUISITES_UNMET'
  | 'UNVERIFIED_BROKER_MANDATE'
  | 'UNVERIFIED_PAYMENT_REFERENCE'
  | 'INVALID_MEDIA_REFERENCE'
  | 'INVALID_TRANSITION'
  | 'REAL_ESTATE_TRANSACTION_DEPENDENCY_UNAVAILABLE';

export class RealEstateTransactionError extends Error {
  constructor(
    public readonly code: RealEstateTransactionErrorCode,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'RealEstateTransactionError';
  }
}
