/**
 * Building Energy Efficiency & Sustainability Intelligence Module Public API
 * (`server/modules/building-sustainability/index.ts`)
 * Exclusive ownership: `server/modules/building-sustainability/`
 */

import {
  GeographyClimateContextAdapter,
  PropertyDueDiligenceSustainabilityAdapter,
  PropertyRegistryReferenceAdapter,
  SustainabilityEventOutboxPublisher
} from './contracts.js';
import {
  BuildingSustainabilityRepository,
  InMemoryBuildingSustainabilityRepository
} from './repository.js';
import { BuildingSustainabilityService } from './service.js';

export * from './types.js';
export * from './contracts.js';
export * from './unitConversionAndEui.js';
export * from './carbonAndSolarEngine.js';
export * from './retrofitAndBenchmarkEngine.js';
export * from './repository.js';
export * from './service.js';

export interface BuildingSustainabilityModuleOptions {
  repository?: BuildingSustainabilityRepository;
  outboxPublisher?: SustainabilityEventOutboxPublisher;
  propertyAdapter?: PropertyRegistryReferenceAdapter;
  dueDiligenceAdapter?: PropertyDueDiligenceSustainabilityAdapter;
  climateAdapter?: GeographyClimateContextAdapter;
}

export function createBuildingSustainabilityService(
  options: BuildingSustainabilityModuleOptions = {}
): BuildingSustainabilityService {
  const repository = options.repository ?? new InMemoryBuildingSustainabilityRepository();
  return new BuildingSustainabilityService(
    repository,
    options.outboxPublisher,
    options.propertyAdapter,
    options.dueDiligenceAdapter,
    options.climateAdapter
  );
}
