/**
 * Property Viewings & Appointments Module Public API
 * (`server/modules/appointments/index.ts`)
 * Exclusive ownership: `server/modules/appointments/`
 */

import {
  EventOutboxPublisher,
  GeographyValidationAdapter,
  PropertyRegistryReferenceAdapter
} from './contracts.js';
import { AppointmentRepository, InMemoryAppointmentRepository } from './repository.js';
import { AppointmentService, CreateAppointmentInput } from './service.js';

export * from './types.js';
export * from './contracts.js';
export * from './validation.js';
export * from './repository.js';
export * from './schedulingAndConflictsService.js';
export * from './invitationsAndViewingService.js';
export * from './service.js';

export interface AppointmentModuleOptions {
  repository?: AppointmentRepository;
  outboxPublisher?: EventOutboxPublisher;
  geographyAdapter?: GeographyValidationAdapter;
  propertyAdapter?: PropertyRegistryReferenceAdapter;
}

export function createAppointmentService(options: AppointmentModuleOptions = {}): AppointmentService {
  const repository = options.repository ?? new InMemoryAppointmentRepository();
  return new AppointmentService(
    repository,
    options.outboxPublisher,
    options.geographyAdapter,
    options.propertyAdapter
  );
}
