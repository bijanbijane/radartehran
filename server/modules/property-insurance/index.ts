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

export * from './types.js';
export * from './contracts.js';
export * from './formulas.js';
export * from './eligibilityAndRiskEngine.js';
export * from './comparisonEngine.js';
export * from './policyAndClaimsService.js';
export * from './repository.js';
export * from './service.js';

export interface PropertyInsuranceModuleOptions {
  repository?: PropertyInsuranceRepository;
  outboxPublisher?: InsuranceEventOutboxPublisher;
  valuationAdapter?: PropertyValuationInsuranceAdapter;
  dueDiligenceAdapter?: PropertyDueDiligenceInspectionAdapter;
  geographyAdapter?: GeographyHazardZoneAdapter;
}

export function createPropertyInsuranceService(
  options: PropertyInsuranceModuleOptions = {}
): PropertyInsuranceService {
  const repository = options.repository ?? new InMemoryPropertyInsuranceRepository();
  return new PropertyInsuranceService(
    repository,
    options.outboxPublisher,
    options.valuationAdapter,
    options.dueDiligenceAdapter,
    options.geographyAdapter
  );
}
