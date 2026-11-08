/**
 * External Integration Adapters & Contracts for Building Sustainability
 * (`server/modules/building-sustainability/contracts.ts`)
 * Exclusive ownership: `server/modules/building-sustainability/`
 */

import { SustainabilityDomainEvent } from './types.js';

export interface PropertyRegistryReferenceAdapter {
  verifyPropertyExists(propertyId: string): Promise<boolean>;
  getPropertyFloorAreaM2(propertyId: string): Promise<number | null>;
  getPropertyCategory(propertyId: string): Promise<string | null>;
}

export interface PropertyDueDiligenceSustainabilityAdapter {
  getThermalEnvelopeObservations(propertyId: string): Promise<{
    hasDoubleGlazing: boolean;
    insulationCondition: string;
    airTightnessScore?: number;
  } | null>;
}

export interface GeographyClimateContextAdapter {
  getAnnualSolarIrradiance(cityId: string): Promise<number | null>;
  getHeatingDegreeDays(cityId: string): Promise<number | null>;
}

export interface SustainabilityEventOutboxPublisher {
  publish(event: SustainabilityDomainEvent): Promise<void>;
}
