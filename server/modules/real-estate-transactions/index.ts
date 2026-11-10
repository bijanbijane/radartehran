export * from './types';
export * from './store';
export * from './transactionParticipantOfferAndNegotiationService';
export * from './termsConditionsMilestonesAndContractService';
export * from './closingHandoverCompletionAndReportingService';
export * from './contracts/externalAdapters';
export type {
  RealEstateTransactionCaseStatus,
  ParticipantInvitationStatus,
  ParticipantPermissionScope,
  PurchaseFinancialTerms,
  RentalFinancialTerms,
  TransactionFinancialTermsUnion,
  FinancialTermsVersionEntry,
  NegotiationOfferLifecycleState,
  ContractWorkflowLifecycleState,
  TransactionContractMetadataRecord,
  TransactionMilestoneType,
  MilestoneVerificationStage,
  TransactionPaymentReferenceRecord,
  TransactionCancellationOrDisputeRecord,
} from './domain/types';
export * from './state-machines/negotiationAndCompletionStateMachine';
export * from './services/realEstateTransactionsService';

import {
  createDefaultTransactionAdapters,
  type RealEstateTransactionCrossModuleAdapters,
  TransactionalRealEstateTransactionStore,
} from './store';
import { TransactionParticipantOfferAndNegotiationService } from './transactionParticipantOfferAndNegotiationService';
import { TermsConditionsMilestonesAndContractService } from './termsConditionsMilestonesAndContractService';
import { ClosingHandoverCompletionAndReportingService } from './closingHandoverCompletionAndReportingService';

export const REAL_ESTATE_TRANSACTIONS_ROUTE_REGISTRATION_SPEC = [
  { method: 'POST', path: '/api/v1/real-estate-transactions/cases', operation: 'createTransactionCase' },
  { method: 'GET', path: '/api/v1/real-estate-transactions/cases/:transactionId', operation: 'getTransactionCaseById' },
  { method: 'POST', path: '/api/v1/real-estate-transactions/cases/:transactionId/participants', operation: 'inviteParticipant' },
  { method: 'POST', path: '/api/v1/real-estate-transactions/cases/:transactionId/participants/:participantId/respond', operation: 'respondToParticipantInvitation' },
  { method: 'POST', path: '/api/v1/real-estate-transactions/cases/:transactionId/offers', operation: 'submitOfferOrCounteroffer' },
  { method: 'POST', path: '/api/v1/real-estate-transactions/cases/:transactionId/offers/:offerId/decision', operation: 'decideOnOffer' },
  { method: 'POST', path: '/api/v1/real-estate-transactions/cases/:transactionId/contract-metadata', operation: 'upsertContractMetadata' },
  { method: 'POST', path: '/api/v1/real-estate-transactions/cases/:transactionId/contract-metadata/transition', operation: 'transitionContractWorkflowState' },
  { method: 'POST', path: '/api/v1/real-estate-transactions/cases/:transactionId/milestones', operation: 'upsertClosingMilestone' },
  { method: 'POST', path: '/api/v1/real-estate-transactions/cases/:transactionId/payment-references', operation: 'recordVerifiedPaymentReference' },
  { method: 'POST', path: '/api/v1/real-estate-transactions/cases/:transactionId/complete', operation: 'completeTransactionCase' },
  { method: 'POST', path: '/api/v1/real-estate-transactions/cases/:transactionId/cancellation-or-dispute', operation: 'recordCancellationTerminationOrDispute' },
  { method: 'GET', path: '/api/v1/real-estate-transactions/properties/:canonicalPropertyId/history', operation: 'queryPropertyTransactionHistory' },
] as const;

export function createRealEstateTransactionsModuleFacade(
  customAdapters?: Partial<RealEstateTransactionCrossModuleAdapters>,
) {
  const store = new TransactionalRealEstateTransactionStore();
  const adapters: RealEstateTransactionCrossModuleAdapters = {
    ...createDefaultTransactionAdapters(),
    ...customAdapters,
  };
  return {
    store,
    adapters,
    transactionParticipantOfferAndNegotiationService:
      new TransactionParticipantOfferAndNegotiationService(store, adapters),
    termsConditionsMilestonesAndContractService:
      new TermsConditionsMilestonesAndContractService(store, adapters),
    closingHandoverCompletionAndReportingService:
      new ClosingHandoverCompletionAndReportingService(store, adapters),
  };
}

export const createRealEstateTransactionsModule = createRealEstateTransactionsModuleFacade;
