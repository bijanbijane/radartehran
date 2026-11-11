/**
 * Property Insurance & Coverage Intelligence Module Public API
 * (`server/modules/property-insurance/index.ts`)
 * Exclusive ownership: `server/modules/property-insurance/`
 */

import {
  createPropertyInsuranceService as createClaimsAndPolicyService,
  createPropertyInsuranceClaimsOperations,
} from "./services/propertyInsuranceClaimsService";
import { createPropertyInsurancePolicyOperations } from "./services/propertyInsurancePolicyService";
import {
  PROPERTY_INSURANCE_COLLECTIONS,
  type PropertyInsuranceServiceDependencies,
  type PropertyInsuranceStoreTransaction,
  type PropertyInsuranceTransactionRunner,
} from "./services/propertyInsuranceContext";
import { PropertyInsuranceService } from "./service.js";
import { PropertyInsuranceRepository } from "./repository.js";
import {
  InsuranceEventOutboxPublisher,
  PropertyValuationInsuranceAdapter,
  PropertyDueDiligenceInspectionAdapter,
  GeographyHazardZoneAdapter,
} from "./contracts.js";

export * from "./domain/types";
export * from "./contracts/externalAdapters";
export * from "./coverage/policyAndClaimStateMachineEngine";
export { InMemoryPropertyInsuranceRepository } from "./repository.js";
export { PropertyInsuranceService } from "./service.js";
export * from "./types.js";
export * from "./contracts.js";
export * from "./formulas.js";
export * from "./comparisonEngine.js";
export * from "./eligibilityAndRiskEngine.js";
export * from "./policyAndClaimsService.js";

export {
  PROPERTY_INSURANCE_COLLECTIONS,
  createPropertyInsuranceClaimsOperations,
  createPropertyInsurancePolicyOperations,
  type PropertyInsuranceServiceDependencies,
  type PropertyInsuranceStoreTransaction,
  type PropertyInsuranceTransactionRunner,
};
export {
  InsurancePoliciesView,
  buildInsurancePolicyDetailViewModel,
  filterAndSortPropertyInsurancePolicies,
  type InsurancePoliciesViewProps,
  type InsurancePolicyDetailViewModel,
} from "./InsurancePoliciesView";

export function createPropertyInsuranceService(
  deps:
    | PropertyInsuranceServiceDependencies
    | {
        repository: PropertyInsuranceRepository;
        outboxPublisher?: InsuranceEventOutboxPublisher;
        valuationAdapter?: PropertyValuationInsuranceAdapter;
        dueDiligenceAdapter?: PropertyDueDiligenceInspectionAdapter;
        geographyAdapter?: GeographyHazardZoneAdapter;
      },
): any {
  if (deps && 'repository' in deps) {
    return new PropertyInsuranceService(
      deps.repository,
      deps.outboxPublisher,
      deps.valuationAdapter,
      deps.dueDiligenceAdapter,
      deps.geographyAdapter,
    );
  }
  return createClaimsAndPolicyService(deps as PropertyInsuranceServiceDependencies);
}
