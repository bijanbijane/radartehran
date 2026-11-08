export * from './types';
export * from './store';
export * from './providerApplicationAndFinancingService';
export * from './repaymentCollateralLtvAndComparisonService';
export * from './refinancingPayoffRiskAndHistoryService';

import { ProviderApplicationAndFinancingService } from './providerApplicationAndFinancingService';
import { RefinancingPayoffRiskAndHistoryService } from './refinancingPayoffRiskAndHistoryService';
import { RepaymentCollateralLtvAndComparisonService } from './repaymentCollateralLtvAndComparisonService';
import {
  createDefaultPropertyFinancingAdapters,
  PropertyFinancingCrossModuleAdapters,
  TransactionalPropertyFinancingStore,
} from './store';

export interface PropertyFinancingModuleFacade {
  store: TransactionalPropertyFinancingStore;
  adapters: PropertyFinancingCrossModuleAdapters;
  providerApplicationAndFinancingService: ProviderApplicationAndFinancingService;
  repaymentCollateralLtvAndComparisonService: RepaymentCollateralLtvAndComparisonService;
  refinancingPayoffRiskAndHistoryService: RefinancingPayoffRiskAndHistoryService;
}

export function createPropertyFinancingModuleFacade(options?: {
  store?: TransactionalPropertyFinancingStore;
  adapters?: Partial<PropertyFinancingCrossModuleAdapters>;
}): PropertyFinancingModuleFacade {
  const store = options?.store ?? new TransactionalPropertyFinancingStore();
  const defaults = createDefaultPropertyFinancingAdapters();
  const adapters: PropertyFinancingCrossModuleAdapters = {
    propertyRegistry: options?.adapters?.propertyRegistry ?? defaults.propertyRegistry,
    propertyOwnership: options?.adapters?.propertyOwnership ?? defaults.propertyOwnership,
    propertyValuation: options?.adapters?.propertyValuation ?? defaults.propertyValuation,
    legalRegulatory: options?.adapters?.legalRegulatory ?? defaults.legalRegulatory,
    payments: options?.adapters?.payments ?? defaults.payments,
    media: options?.adapters?.media ?? defaults.media,
    notifications: options?.adapters?.notifications ?? defaults.notifications,
  };

  return {
    store,
    adapters,
    providerApplicationAndFinancingService: new ProviderApplicationAndFinancingService(store, adapters),
    repaymentCollateralLtvAndComparisonService: new RepaymentCollateralLtvAndComparisonService(store, adapters),
    refinancingPayoffRiskAndHistoryService: new RefinancingPayoffRiskAndHistoryService(store, adapters),
  };
}
