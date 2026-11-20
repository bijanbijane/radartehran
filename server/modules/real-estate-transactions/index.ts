export * from './types';
export * from './store';
export * from './firestoreStore';
export * from './productionCrossModuleAdapters';
export * from './routes';
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
import { RealEstateTransactionError } from './types';
import {
  DurableRealEstateTransactionService,
  FirestoreRealEstateTransactionStore,
} from './firestoreStore';
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

export interface ProductionRealEstateTransactionsDependencies extends RealEstateTransactionCrossModuleAdapters {
  store: FirestoreRealEstateTransactionStore;
}

/**
 * Test-only in-memory factory (explicitly forbidden in production composition root).
 */
export function createInMemoryRealEstateTransactionsModuleForTests(
  customAdapters?: Partial<RealEstateTransactionCrossModuleAdapters>,
) {
  if (process.env.NODE_ENV === 'production') {
    throw new RealEstateTransactionError(
      'REAL_ESTATE_TRANSACTION_DEPENDENCY_UNAVAILABLE',
      'In-memory Real Estate Transactions module is strictly forbidden in production.',
      503,
    );
  }
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

/**
 * Production factory requiring all 7 canonical dependencies with ZERO mock fallbacks.
 * Fails closed with 503 REAL_ESTATE_TRANSACTION_DEPENDENCY_UNAVAILABLE if any dependency is missing.
 */
export function createProductionRealEstateTransactionsModule(
  deps: Partial<ProductionRealEstateTransactionsDependencies> | null | undefined,
): {
  store: FirestoreRealEstateTransactionStore;
  adapters: RealEstateTransactionCrossModuleAdapters;
  service: DurableRealEstateTransactionService;
} {
  const missing: string[] = [];
  if (!deps?.store || deps.store.backendKind !== 'firestore_durable') missing.push('RealEstateTransactionStore');
  if (!deps?.propertyRegistry) missing.push('PropertyRegistryAdapter');
  if (!deps?.propertyOwnership) missing.push('PropertyOwnershipAdapter');
  if (!deps?.brokerageOperations) missing.push('BrokerageOperationsAdapter');
  if (!deps?.payments) missing.push('PaymentsAdapter');
  if (!deps?.media) missing.push('MediaAdapter');
  if (!deps?.notifications) missing.push('NotificationsAdapter');

  if (missing.length > 0) {
    throw new RealEstateTransactionError(
      'REAL_ESTATE_TRANSACTION_DEPENDENCY_UNAVAILABLE',
      `Missing mandatory production dependencies for Real Estate Transactions: ${missing.join(', ')}`,
      503,
    );
  }

  const adapters: RealEstateTransactionCrossModuleAdapters = {
    propertyRegistry: deps!.propertyRegistry!,
    propertyOwnership: deps!.propertyOwnership!,
    brokerageOperations: deps!.brokerageOperations!,
    payments: deps!.payments!,
    media: deps!.media!,
    notifications: deps!.notifications!,
  };

  return {
    store: deps!.store!,
    adapters,
    service: new DurableRealEstateTransactionService(deps!.store!, adapters),
  };
}

/**
 * @deprecated Use createInMemoryRealEstateTransactionsModuleForTests() in tests
 * or createProductionRealEstateTransactionsModule() in production.
 */
export function createRealEstateTransactionsModuleFacade(
  customAdapters?: Partial<RealEstateTransactionCrossModuleAdapters>,
) {
  return createInMemoryRealEstateTransactionsModuleForTests(customAdapters);
}

export const createRealEstateTransactionsModule = createRealEstateTransactionsModuleFacade;
