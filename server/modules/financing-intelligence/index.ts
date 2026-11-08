/**
 * Mortgage & Real Estate Financing Intelligence Module Public API
 * (`server/modules/financing-intelligence/index.ts`)
 * Exclusive ownership: `server/modules/financing-intelligence/`
 */

import {
  FinancingEventOutboxPublisher,
  GeographyJurisdictionAdapter,
  PropertyRegistryReferenceAdapter,
  PropertyValuationAdapter
} from './contracts.js';
import { FinancingRepository, InMemoryFinancingRepository } from './repository.js';
import { FinancingIntelligenceService } from './service.js';

export * from './types.js';
export * from './contracts.js';
export * from './formulas.js';
export * from './eligibilityEngine.js';
export * from './comparisonEngine.js';
export * from './repository.js';
export * from './service.js';

export interface FinancingModuleOptions {
  repository?: FinancingRepository;
  outboxPublisher?: FinancingEventOutboxPublisher;
  valuationAdapter?: PropertyValuationAdapter;
  propertyAdapter?: PropertyRegistryReferenceAdapter;
  geographyAdapter?: GeographyJurisdictionAdapter;
}

export function createFinancingIntelligenceService(
  options: FinancingModuleOptions = {}
): FinancingIntelligenceService {
  const repository = options.repository ?? new InMemoryFinancingRepository();
  return new FinancingIntelligenceService(
    repository,
    options.outboxPublisher,
    options.valuationAdapter,
    options.propertyAdapter,
    options.geographyAdapter
  );
}
