export * from './types';
export * from './store';
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
  DisputeResolutionCrossModuleAdapters,
  TransactionalDisputeResolutionStore,
} from './store';

export interface DisputeResolutionModuleFacade {
  store: TransactionalDisputeResolutionStore;
  adapters: DisputeResolutionCrossModuleAdapters;
  intakePartyClaimAndEvidenceService: IntakePartyClaimAndEvidenceService;
  mediationSettlementResolutionAndHistoryService: MediationSettlementResolutionAndHistoryService;
}

export function createDisputeResolutionModuleFacade(options?: {
  store?: TransactionalDisputeResolutionStore;
  adapters?: Partial<DisputeResolutionCrossModuleAdapters>;
}): DisputeResolutionModuleFacade {
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
      adapters
    ),
  };
}
