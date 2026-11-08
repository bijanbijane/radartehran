/**
 * Property Environmental Risk & Resilience Intelligence Module Public API
 * (`server/modules/property-risk/index.ts`)
 * Exclusive ownership: `server/modules/property-risk/`
 */

import {
  GeographySpatialAdapter,
  PropertyDueDiligenceRiskAdapter,
  PropertyRegistryRiskAdapter,
  PropertyRiskEventOutboxPublisher,
  UrbanIntelligenceEnvironmentalAdapter
} from './contracts.js';
import { InMemoryPropertyRiskRepository, PropertyRiskRepository } from './repository.js';
import { PropertyRiskService } from './service.js';

export * from './types.js';
export * from './contracts.js';
export * from './spatialAndHazardEngine.js';
export * from './vulnerabilityAndRiskEngine.js';
export * from './resilienceAndScenarioEngine.js';
export * from './repository.js';
export * from './service.js';

export interface PropertyRiskModuleOptions {
  repository?: PropertyRiskRepository;
  outboxPublisher?: PropertyRiskEventOutboxPublisher;
  propertyAdapter?: PropertyRegistryRiskAdapter;
  geographyAdapter?: GeographySpatialAdapter;
  dueDiligenceAdapter?: PropertyDueDiligenceRiskAdapter;
  urbanAdapter?: UrbanIntelligenceEnvironmentalAdapter;
}

export function createPropertyRiskService(
  options: PropertyRiskModuleOptions = {}
): PropertyRiskService {
  const repository = options.repository ?? new InMemoryPropertyRiskRepository();
  return new PropertyRiskService(
    repository,
    options.outboxPublisher,
    options.propertyAdapter,
    options.geographyAdapter,
    options.dueDiligenceAdapter,
    options.urbanAdapter
  );
}
