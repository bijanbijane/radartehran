/**
 * Real Estate Professionals & Service Providers Backend Module Entry Point
 * (`server/modules/service-providers/index.ts`)
 * Exclusive ownership: `server/modules/service-providers/`
 */

export * from './types';
export * from './contracts';
export * from './validation';
export * from './repository';
export * from './organizationsAndMembersService';
export * from './credentialsAndVerificationService';
export * from './requestsAndQuotationsService';
export * from './service';

import type {
  GeographyValidationAdapter,
  MediaStorageReferenceAdapter,
  NotificationsOutboxAdapter,
  TrustAndSafetyProviderAdapter,
} from './contracts';
import {
  InMemoryServiceProviderRepository,
  type ServiceProviderRepository,
} from './repository';
import { ServiceProviderService } from './service';

export interface CreateServiceProviderServiceOptions {
  repository?: ServiceProviderRepository;
  geographyAdapter?: GeographyValidationAdapter;
  mediaAdapter?: MediaStorageReferenceAdapter;
  notificationsAdapter?: NotificationsOutboxAdapter;
  trustAndSafetyAdapter?: TrustAndSafetyProviderAdapter;
}

export function createServiceProviderService(
  options: CreateServiceProviderServiceOptions = {},
): ServiceProviderService {
  const repository = options.repository ?? new InMemoryServiceProviderRepository();
  return new ServiceProviderService({
    repository,
    geographyAdapter: options.geographyAdapter,
    mediaAdapter: options.mediaAdapter,
    notificationsAdapter: options.notificationsAdapter,
    trustAndSafetyAdapter: options.trustAndSafetyAdapter,
  });
}
