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

export * from "./domain/types";
export * from "./contracts/externalAdapters";
export * from "./coverage/policyAndClaimStateMachineEngine";
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
  deps: PropertyInsuranceServiceDependencies,
): ReturnType<typeof createClaimsAndPolicyService> {
  return createClaimsAndPolicyService(deps);
}
