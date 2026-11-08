/**
 * Property Transaction & Deal Management Backend Module Entry Point
 * (`server/modules/property-transactions/index.ts`)
 * Exclusive ownership: `server/modules/property-transactions/`
 */

export * from './types';
export * from './contracts';
export * from './validation';
export * from './stateMachine';
export * from './repository';
export * from './service';

import type {
  BargainsListingValidationAdapter,
  GeographyAddressDisclosureAdapter,
  MessagingWorkflowAdapter,
  NotificationsOutboxAdapter,
  PropertyRegistryAdapter,
  TrustAndSafetyAlertAdapter,
} from './contracts';
import {
  InMemoryPropertyTransactionRepository,
  type PropertyTransactionRepository,
} from './repository';
import { PropertyTransactionService } from './service';

export interface CreatePropertyTransactionServiceOptions {
  repository?: PropertyTransactionRepository;
  bargainsAdapter: BargainsListingValidationAdapter;
  propertyRegistryAdapter?: PropertyRegistryAdapter;
  geographyAdapter?: GeographyAddressDisclosureAdapter;
  notificationsAdapter?: NotificationsOutboxAdapter;
  messagingAdapter?: MessagingWorkflowAdapter;
  trustAndSafetyAdapter?: TrustAndSafetyAlertAdapter;
}

export function createPropertyTransactionService(
  options: CreatePropertyTransactionServiceOptions,
): PropertyTransactionService {
  const repository = options.repository ?? new InMemoryPropertyTransactionRepository();
  return new PropertyTransactionService({
    repository,
    bargainsAdapter: options.bargainsAdapter,
    propertyRegistryAdapter: options.propertyRegistryAdapter,
    geographyAdapter: options.geographyAdapter,
    notificationsAdapter: options.notificationsAdapter,
    messagingAdapter: options.messagingAdapter,
    trustAndSafetyAdapter: options.trustAndSafetyAdapter,
  });
}
