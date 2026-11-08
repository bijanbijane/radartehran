/**
 * Real Estate Development & Construction Project Management Backend Module Entry Point
 * (`server/modules/development-projects/index.ts`)
 * Exclusive ownership: `server/modules/development-projects/`
 */

export * from './types';
export * from './contracts';
export * from './validation';
export * from './repository';
export * from './phasesAndTasksService';
export * from './budgetAndProcurementService';
export * from './qualityChangeAndHandoverService';
export * from './service';

import type {
  GeographyReferenceAdapter,
  MediaStorageReferenceAdapter,
  NotificationsEventAdapter,
  PropertyRegistryAssetAdapter,
  PropertyServicesProviderAdapter,
  SafetyIncidentEscalationAdapter,
} from './contracts';
import {
  type DevelopmentProjectRepository,
  InMemoryDevelopmentProjectRepository,
} from './repository';
import { DevelopmentProjectService } from './service';

export interface CreateDevelopmentProjectServiceOptions {
  repository?: DevelopmentProjectRepository;
  propertyRegistryAdapter?: PropertyRegistryAssetAdapter;
  geographyAdapter?: GeographyReferenceAdapter;
  propertyServicesAdapter?: PropertyServicesProviderAdapter;
  mediaAdapter?: MediaStorageReferenceAdapter;
  notificationsAdapter?: NotificationsEventAdapter;
  safetyIncidentAdapter?: SafetyIncidentEscalationAdapter;
}

export function createDevelopmentProjectService(
  options: CreateDevelopmentProjectServiceOptions = {},
): DevelopmentProjectService {
  const repository = options.repository ?? new InMemoryDevelopmentProjectRepository();
  return new DevelopmentProjectService({
    repository,
    propertyRegistryAdapter: options.propertyRegistryAdapter,
    geographyAdapter: options.geographyAdapter,
    propertyServicesAdapter: options.propertyServicesAdapter,
    mediaAdapter: options.mediaAdapter,
    notificationsAdapter: options.notificationsAdapter,
    safetyIncidentAdapter: options.safetyIncidentAdapter,
  });
}
