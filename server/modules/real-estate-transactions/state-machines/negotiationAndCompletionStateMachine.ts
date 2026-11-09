import { CoreApiError } from '../../core';
import type {
  NegotiationOfferLifecycleState,
  RealEstateTransactionCaseStatus,
  RealEstateTransactionRecord,
  RealEstateTransactionType,
  TransactionFinancialTermsUnion,
  TransactionMilestoneRecord,
  TransactionOfferRecord,
  TransactionParticipantRole,
  TransactionPaymentReferenceRecord,
} from '../domain/types';

export const ALLOWED_PARTICIPANT_ROLES: readonly TransactionParticipantRole[] = [
  'BUYER',
  'SELLER',
  'TENANT',
  'LANDLORD',
  'AUTHORIZED_REPRESENTATIVE',
  'BROKER_OR_AGENT',
  'TRANSACTION_COORDINATOR',
  'AUTHORIZED_REVIEWER',
];

/**
 * Section 3D: Explicit Offer & Negotiation Lifecycle State Machine
 */
export const ALLOWED_OFFER_STATE_TRANSITIONS: Readonly<
  Record<NegotiationOfferLifecycleState, readonly NegotiationOfferLifecycleState[]>
> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN'],
  SUBMITTED: ['UNDER_REVIEW', 'COUNTEROFFERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  UNDER_REVIEW: ['COUNTEROFFERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  COUNTEROFFERED: [], // Terminal for the superseded offer; new counteroffer is a separate record
  ACCEPTED: [],
  REJECTED: [],
  WITHDRAWN: [],
  EXPIRED: [],
};

export function validateFinancialTermsIntegrity(
  transactionType: RealEstateTransactionType,
  terms: TransactionFinancialTermsUnion,
): void {
  const isRentalType =
    transactionType === 'RESIDENTIAL_RENTAL' ||
    transactionType === 'COMMERCIAL_RENTAL' ||
    transactionType === 'LEASE_RENEWAL';

  if (isRentalType && terms.termMode !== 'RENTAL_OR_LEASE') {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Transaction type "${transactionType}" requires RENTAL_OR_LEASE financial terms with separate monthly rent and security deposit.`,
    );
  }
  if (!isRentalType && terms.termMode !== 'PURCHASE_OR_SALE') {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Transaction type "${transactionType}" requires PURCHASE_OR_SALE financial terms.`,
    );
  }

  if (terms.termMode === 'PURCHASE_OR_SALE') {
    if (!Number.isFinite(terms.proposedPurchasePrice) || terms.proposedPurchasePrice <= 0) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'proposedPurchasePrice must be a positive number.',
      );
    }
    if (terms.earnestDepositAmount < 0 || terms.advancePaymentAmount < 0) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'Deposit and advance payment amounts must be non-negative.',
      );
    }
  } else {
    if (
      !Number.isFinite(terms.monthlyOrPeriodicRentAmount) ||
      terms.monthlyOrPeriodicRentAmount < 0 ||
      !Number.isFinite(terms.securityDepositAmount) ||
      terms.securityDepositAmount < 0
    ) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'Rental financial terms require valid non-negative monthlyOrPeriodicRentAmount and securityDepositAmount as separate fields.',
      );
    }
    if (
      terms.monthlyOrPeriodicRentAmount === 0 &&
      terms.securityDepositAmount === 0
    ) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'At least one of monthlyOrPeriodicRentAmount or securityDepositAmount must be positive.',
      );
    }
  }
}

export function assertValidOfferTransition(params: {
  offer: TransactionOfferRecord;
  targetState: NegotiationOfferLifecycleState;
  actorUid: string;
  nowEpochMs: number;
  transactionStatus: RealEstateTransactionCaseStatus;
}): void {
  if (
    params.transactionStatus === 'COMPLETED' ||
    params.transactionStatus === 'CANCELLED' ||
    params.transactionStatus === 'TERMINATED' ||
    params.transactionStatus === 'DISPUTED'
  ) {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Cannot transition offer when transaction is in status "${params.transactionStatus}".`,
    );
  }

  const allowed = ALLOWED_OFFER_STATE_TRANSITIONS[params.offer.status] ?? [];
  if (!allowed.includes(params.targetState)) {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `STALE_OR_INVALID_OFFER_TRANSITION: Cannot transition offer "${params.offer.offerId}" from "${params.offer.status}" to "${params.targetState}".`,
    );
  }

  const expiryMs = Date.parse(params.offer.validUntilIso);
  if (
    (params.targetState === 'ACCEPTED' || params.targetState === 'COUNTEROFFERED') &&
    Number.isFinite(expiryMs) &&
    params.nowEpochMs > expiryMs
  ) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `OFFER_EXPIRED: Offer "${params.offer.offerId}" expired at ${params.offer.validUntilIso} and cannot be ${params.targetState}.`,
    );
  }

  if (params.targetState === 'WITHDRAWN') {
    if (params.offer.proposingParticipantUid !== params.actorUid) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Only the proposing party may withdraw their offer.',
      );
    }
  }

  if (
    params.targetState === 'ACCEPTED' ||
    params.targetState === 'REJECTED' ||
    params.targetState === 'COUNTEROFFERED'
  ) {
    if (params.offer.recipientParticipantUid !== params.actorUid) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        `Only the designated recipient party ("${params.offer.recipientParticipantUid}") may ${params.targetState} offer "${params.offer.offerId}".`,
      );
    }
  }
}

/**
 * Section 3I: Explicit Completion Prerequisites Validator
 * Never infers completion from offer acceptance alone.
 */
export function verifyTransactionCompletionPrerequisites(params: {
  transaction: RealEstateTransactionRecord;
  milestones: TransactionMilestoneRecord[];
  paymentReferences: TransactionPaymentReferenceRecord[];
  dueDiligenceBlocking: boolean;
}): {
  eligibleForCompletion: boolean;
  unmetPrerequisites: string[];
} {
  const unmet: string[] = [];

  if (!params.transaction.acceptedOfferId) {
    unmet.push('MISSING_ACCEPTED_OFFER');
  }
  if (
    params.transaction.status !== 'TERMS_ACCEPTED_PENDING_CLOSING' &&
    params.transaction.status !== 'CLOSING_IN_PROGRESS'
  ) {
    unmet.push(`INVALID_TRANSACTION_STATUS_FOR_COMPLETION:${params.transaction.status}`);
  }

  if (!params.transaction.contractMetadata) {
    unmet.push('MISSING_CONTRACT_WORKFLOW_METADATA');
  } else {
    const allowedContractStates = ['SIGNED_BY_PARTIES', 'EFFECTIVE_ACTIVE', 'COMPLETED'];
    if (!allowedContractStates.includes(params.transaction.contractMetadata.workflowState)) {
      unmet.push(
        `CONTRACT_NOT_SIGNED_OR_EFFECTIVE:${params.transaction.contractMetadata.workflowState}`,
      );
    }
  }

  const confirmedPayments = params.paymentReferences.filter(
    (p) => p.verifiedByAuthoritativeSource && p.state === 'CONFIRMED',
  );
  if (confirmedPayments.length === 0) {
    unmet.push('MISSING_AUTHORITATIVELY_CONFIRMED_PAYMENT_REFERENCE');
  }

  const handoverDone = params.milestones.some(
    (m) =>
      m.milestoneType === 'HANDOVER_COMPLETED' &&
      (m.stage === 'VERIFIED' || m.stage === 'COMPLETED'),
  );
  if (!handoverDone) {
    unmet.push('MISSING_VERIFIED_HANDOVER_COMPLETED_MILESTONE');
  }

  if (params.dueDiligenceBlocking) {
    unmet.push('BLOCKING_DUE_DILIGENCE_FINDINGS_UNRESOLVED');
  }

  return {
    eligibleForCompletion: unmet.length === 0,
    unmetPrerequisites: unmet,
  };
}
