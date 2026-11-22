export * from './types';
export * from './store';
export * from './firestoreStore';
export * from './canonicalDisputeService';
export * from './canonicalDisputeRoutes';
export * from './intakePartyClaimAndEvidenceService';
export * from './mediationSettlementResolutionAndHistoryService';
export { DisputeResolutionEngine } from './disputeEngine';
export { MemoryDisputeStore, type DisputeRepository } from './disputeStore';
export { createDisputeRouter } from './disputeRoutes';
export {
  sanitizeTextFa,
  validateDisputeCaseInput,
  validateDisputeTransition,
} from './disputeValidator';
export {
  DisputeNegotiationEngine,
  type CreateProposalParams,
} from './disputeNegotiationEngine';

import { IntakePartyClaimAndEvidenceService } from './intakePartyClaimAndEvidenceService';
import { MediationSettlementResolutionAndHistoryService } from './mediationSettlementResolutionAndHistoryService';
import {
  createDefaultDisputeResolutionAdapters,
  type DisputeResolutionCrossModuleAdapters,
  TransactionalDisputeResolutionStore,
} from './store';
import {
  type CanonicalDisputeCrossModuleAdapters,
  type FirestoreDisputeResolutionStore,
} from './firestoreStore';
import {
  CanonicalDisputeError,
  CanonicalDisputeResolutionService,
} from './canonicalDisputeService';

export interface DisputeResolutionModuleFacade {
  store: TransactionalDisputeResolutionStore;
  adapters: DisputeResolutionCrossModuleAdapters;
  intakePartyClaimAndEvidenceService: IntakePartyClaimAndEvidenceService;
  mediationSettlementResolutionAndHistoryService: MediationSettlementResolutionAndHistoryService;
}

export interface ProductionDisputeResolutionDependencies extends CanonicalDisputeCrossModuleAdapters {
  store: FirestoreDisputeResolutionStore;
}

/**
 * Test-only in-memory factory (explicitly forbidden in production composition root).
 */
export function createInMemoryDisputeResolutionModuleForTests(options?: {
  store?: TransactionalDisputeResolutionStore;
  adapters?: Partial<DisputeResolutionCrossModuleAdapters>;
}): DisputeResolutionModuleFacade {
  if (process.env.NODE_ENV === 'production') {
    throw new CanonicalDisputeError(
      'DISPUTE_RESOLUTION_DEPENDENCY_UNAVAILABLE',
      'In-memory Dispute Resolution module is strictly forbidden in production.',
      503,
    );
  }
  const store = options?.store ?? new TransactionalDisputeResolutionStore();
  const defaults = createDefaultDisputeResolutionAdapters();
  const adapters: DisputeResolutionCrossModuleAdapters = {
    propertyRegistry: options?.adapters?.propertyRegistry ?? defaults.propertyRegistry,
    transactions: options?.adapters?.transactions ?? defaults.transactions,
    media: options?.adapters?.media ?? defaults.media,
    notifications: options?.adapters?.notifications ?? defaults.notifications,
    payments: options?.adapters?.payments ?? defaults.payments,
  };

  return {
    store,
    adapters,
    intakePartyClaimAndEvidenceService: new IntakePartyClaimAndEvidenceService(store, adapters),
    mediationSettlementResolutionAndHistoryService: new MediationSettlementResolutionAndHistoryService(
      store,
      adapters,
    ),
  };
}

/**
 * Production factory requiring FirestoreDisputeResolutionStore and all 4 canonical adapters.
 * Zero mock defaults — fails closed with 503 DISPUTE_RESOLUTION_DEPENDENCY_UNAVAILABLE.
 */
export function createProductionDisputeResolutionModule(
  deps: Partial<ProductionDisputeResolutionDependencies> | null | undefined,
): {
  store: FirestoreDisputeResolutionStore;
  adapters: CanonicalDisputeCrossModuleAdapters;
  service: CanonicalDisputeResolutionService;
} {
  const missing: string[] = [];
  if (!deps?.store || deps.store.backendKind !== 'firestore_durable') missing.push('FirestoreDisputeResolutionStore');
  if (!deps?.propertyRegistry) missing.push('PropertyRegistryAdapter');
  if (!deps?.transactions) missing.push('RealEstateTransactionsAdapter');
  if (!deps?.media) missing.push('MediaAdapter');
  if (!deps?.payments) missing.push('PaymentsAdapter');

  if (missing.length > 0) {
    throw new CanonicalDisputeError(
      'DISPUTE_RESOLUTION_DEPENDENCY_UNAVAILABLE',
      `Missing mandatory production dependencies for Dispute Resolution: ${missing.join(', ')}`,
      503,
    );
  }

  const adapters: CanonicalDisputeCrossModuleAdapters = {
    propertyRegistry: deps!.propertyRegistry!,
    transactions: deps!.transactions!,
    media: deps!.media!,
    payments: deps!.payments!,
  };

  return {
    store: deps!.store!,
    adapters,
    service: new CanonicalDisputeResolutionService(deps!.store!, adapters),
  };
}

/**
 * @deprecated Use createInMemoryDisputeResolutionModuleForTests() in tests
 * or createProductionDisputeResolutionModule() in production.
 */
export function createDisputeResolutionModuleFacade(options?: {
  store?: TransactionalDisputeResolutionStore;
  adapters?: Partial<DisputeResolutionCrossModuleAdapters>;
}): DisputeResolutionModuleFacade {
  return createInMemoryDisputeResolutionModuleForTests(options);
}
