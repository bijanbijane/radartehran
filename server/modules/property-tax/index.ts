export * from './types';
export * from './store';
export * from './authorityTaxRecordAndAssessmentService';
export * from './obligationBillPaymentAndDeadlineService';
export * from './exemptionDisputeAndReportingService';

import { AuthorityTaxRecordAndAssessmentService } from './authorityTaxRecordAndAssessmentService';
import { ExemptionDisputeAndReportingService } from './exemptionDisputeAndReportingService';
import { ObligationBillPaymentAndDeadlineService } from './obligationBillPaymentAndDeadlineService';
import {
  createDefaultPropertyTaxAdapters,
  PropertyTaxCrossModuleAdapters,
  TransactionalPropertyTaxStore,
} from './store';

export interface PropertyTaxModuleFacade {
  store: TransactionalPropertyTaxStore;
  adapters: PropertyTaxCrossModuleAdapters;
  authorityAndAssessmentService: AuthorityTaxRecordAndAssessmentService;
  obligationBillPaymentService: ObligationBillPaymentAndDeadlineService;
  exemptionDisputeReportingService: ExemptionDisputeAndReportingService;
}

export function createPropertyTaxModuleFacade(options?: {
  store?: TransactionalPropertyTaxStore;
  adapters?: Partial<PropertyTaxCrossModuleAdapters>;
}): PropertyTaxModuleFacade {
  const store = options?.store ?? new TransactionalPropertyTaxStore();
  const defaults = createDefaultPropertyTaxAdapters();
  const adapters: PropertyTaxCrossModuleAdapters = {
    propertyRegistry: options?.adapters?.propertyRegistry ?? defaults.propertyRegistry,
    legalRegulatory: options?.adapters?.legalRegulatory ?? defaults.legalRegulatory,
    payments: options?.adapters?.payments ?? defaults.payments,
    media: options?.adapters?.media ?? defaults.media,
    notifications: options?.adapters?.notifications ?? defaults.notifications,
  };

  return {
    store,
    adapters,
    authorityAndAssessmentService: new AuthorityTaxRecordAndAssessmentService(store, adapters),
    obligationBillPaymentService: new ObligationBillPaymentAndDeadlineService(store, adapters),
    exemptionDisputeReportingService: new ExemptionDisputeAndReportingService(store),
  };
}
