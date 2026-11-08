/**
 * External Integration Adapters & Contracts for Appointments Module
 * (`server/modules/appointments/contracts.ts`)
 * Exclusive ownership: `server/modules/appointments/`
 */

import { AppointmentDomainEvent } from './types.js';

export interface GeographyValidationAdapter {
  verifyNeighborhoodExists(cityId: string, hoodId: number): Promise<boolean>;
  getNeighborhoodNameFa(cityId: string, hoodId: number): Promise<string | null>;
}

export interface PropertyRegistryReferenceAdapter {
  verifyPropertyExists(propertyId: string): Promise<boolean>;
  getPropertyOwnerUserId(propertyId: string): Promise<string | null>;
  isPropertyAvailableForViewing(propertyId: string): Promise<boolean>;
}

export interface PropertySearchListingAdapter {
  verifyListingExists(listingId: string): Promise<boolean>;
  getListingPropertyId(listingId: string): Promise<string | null>;
  getListingAgentUserId(listingId: string): Promise<string | null>;
}

export interface ServiceProvidersAvailabilityAdapter {
  verifyProviderExists(providerId: string): Promise<boolean>;
  isProviderAvailableAt(providerId: string, startIso: string, endIso: string): Promise<boolean>;
}

export interface CrmLeadAppointmentAdapter {
  verifyLeadExists(leadId: string): Promise<boolean>;
  getLeadAssignedAgentUserId(leadId: string): Promise<string | null>;
}

export interface EventOutboxPublisher {
  publish(event: AppointmentDomainEvent): Promise<void>;
}

export interface ExternalCalendarSyncAdapter {
  exportIcsFormat(appointmentId: string): Promise<string>;
}
