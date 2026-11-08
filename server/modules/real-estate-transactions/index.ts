export * from './types';
export * from './store';
export * from './transactionParticipantOfferAndNegotiationService';
export * from './termsConditionsMilestonesAndContractService';
export * from './closingHandoverCompletionAndReportingService';

import { ClosingHandoverCompletionAndReportingService } from './closingHandoverCompletionAndReportingService';
import {
  createDefaultTransactionAdapters,
  RealEstateTransactionCrossModuleAdapters,
  TransactionalRealEstateTransactionStore,
} from './store';
import { TermsConditionsMilestonesAndContractService } from './termsConditionsMilestonesAndContractService';
import { TransactionParticipantOfferAndNegotiationService } from './transactionParticipantOfferAndNegotiationService';

export interface RealEstateTransactionsModuleFacade {
  store: TransactionalRealEstateTransactionStore;
  adapters: RealEstateTransactionCrossModuleAdapters;
  transactionParticipantOfferAndNegotiationService: TransactionParticipantOfferAndNegotiationService;
  termsConditionsMilestonesAndContractService: TermsConditionsMilestonesAndContractService;
  closingHandoverCompletionAndReportingService: ClosingHandoverCompletionAndReportingService;
}

export function createRealEstateTransactionsModuleFacade(options?: {
  store?: TransactionalRealEstateTransactionStore;
  adapters?: Partial<RealEstateTransactionCrossModuleAdapters>;
}): RealEstateTransactionsModuleFacade {
  const store = options?.store ?? new TransactionalRealEstateTransactionStore();
  const defaults = createDefaultTransactionAdapters();
  const adapters: RealEstateTransactionCrossModuleAdapters = {
    propertyRegistry: options?.adapters?.propertyRegistry ?? defaults.propertyRegistry,
    propertyOwnership: options?.adapters?.propertyOwnership ?? defaults.propertyOwnership,
    brokerageOperations: options?.adapters?.brokerageOperations ?? defaults.brokerageOperations,
    payments: options?.adapters?.payments ?? defaults.payments,
    media: options?.adapters?.media ?? defaults.media,
    notifications: options?.adapters?.notifications ?? defaults.notifications,
  };

  return {
    store,
    adapters,
    transactionParticipantOfferAndNegotiationService: new TransactionParticipantOfferAndNegotiationService(
      store,
      adapters
    ),
    termsConditionsMilestonesAndContractService: new TermsConditionsMilestonesAndContractService(
      store,
      adapters
    ),
    closingHandoverCompletionAndReportingService: new ClosingHandoverCompletionAndReportingService(
      store,
      adapters
    ),
  };
}
