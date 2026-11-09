/**
 * Property Insurance & Coverage Intelligence Module Public API
 * (`server/modules/property-insurance/index.ts`)
 * Exclusive ownership: `server/modules/property-insurance/`
 */

import {
  GeographyHazardZoneAdapter,
  InsuranceEventOutboxPublisher,
  PropertyDueDiligenceInspectionAdapter,
  PropertyValuationInsuranceAdapter
} from './contracts.js';
import { InMemoryPropertyInsuranceRepository, PropertyInsuranceRepository } from './repository.js';
import { PropertyInsuranceService } from './service.js';
import {
  createPropertyInsuranceService as createClaimsAndPolicyService
} from './services/propertyInsuranceClaimsService.js';
import {
  PROPERTY_INSURANCE_COLLECTIONS,
  type PropertyInsuranceServiceDependencies,
  type PropertyInsuranceStoreTransaction,
  type PropertyInsuranceTransactionRunner
} from './services/propertyInsuranceContext.js';

export * from './types.js';
export * from './contracts.js';
export * from './formulas.js';
export * from './eligibilityAndRiskEngine.js';
export * from './comparisonEngine.js';
export * from './policyAndClaimsService.js';
export * from './repository.js';
export * from './service.js';
export * from './domain/types.js';
export * from './contracts/externalAdapters.js';
export * from './coverage/policyAndClaimStateMachineEngine.js';
export {
  PROPERTY_INSURANCE_COLLECTIONS,
  type PropertyInsuranceServiceDependencies,
  type PropertyInsuranceStoreTransaction,
  type PropertyInsuranceTransactionRunner
};
export {
  InsurancePoliciesView,
  buildInsurancePolicyDetailViewModel,
  filterAndSortPropertyInsurancePolicies,
  type InsurancePoliciesViewProps,
  type InsurancePolicyDetailViewModel
} from './InsurancePoliciesView.js';

export interface PropertyInsuranceModuleOptions {
  repository?: PropertyInsuranceRepository;
  outboxPublisher?: InsuranceEventOutboxPublisher;
  valuationAdapter?: PropertyValuationInsuranceAdapter;
  dueDiligenceAdapter?: PropertyDueDiligenceInspectionAdapter;
  geographyAdapter?: GeographyHazardZoneAdapter;
}

export function createPropertyInsuranceService(
  deps: PropertyInsuranceServiceDependencies
): ReturnType<typeof createClaimsAndPolicyService>;
export function createPropertyInsuranceService(
  options?: PropertyInsuranceModuleOptions
): PropertyInsuranceService;
export function createPropertyInsuranceService(
  optionsOrDeps: PropertyInsuranceModuleOptions | PropertyInsuranceServiceDependencies = {}
): PropertyInsuranceService | ReturnType<typeof createClaimsAndPolicyService> {
  if ('txRunner' in optionsOrDeps && 'idempotencyStore' in optionsOrDeps) {
    return createClaimsAndPolicyService(optionsOrDeps);
  }
  const options = optionsOrDeps as PropertyInsuranceModuleOptions;
  const repository = options.repository ?? new InMemoryPropertyInsuranceRepository();
  return new PropertyInsuranceService(
    repository,
    options.outboxPublisher,
    options.valuationAdapter,
    options.dueDiligenceAdapter,
    options.geographyAdapter
  );
}
