/**
 * External Integration Adapters & Contracts for Property Insurance
 * (`server/modules/property-insurance/contracts.ts`)
 * Exclusive ownership: `server/modules/property-insurance/`
 */

import { InsuranceDomainEvent } from './types.js';

export interface PropertyValuationInsuranceAdapter {
  getBuildingReplacementCostEstimate(propertyId: string): Promise<{
    estimatedReplacementCost: number;
    currency: string;
    assessmentDateIso: string;
    methodology: string;
  } | null>;
}

export interface PropertyDueDiligenceInspectionAdapter {
  verifyStructuralInspectionPassed(propertyId: string): Promise<boolean>;
  getTechnicalSafetyChecklist(propertyId: string): Promise<{
    hasFunctionalFireExtinguisher: boolean;
    electricalSafetyCompliant: boolean;
    gasInstallationCertified: boolean;
  } | null>;
}

export interface GeographyHazardZoneAdapter {
  getSeismicHazardZone(cityId: string, hoodId?: number): Promise<{
    zoneLevel: 'very_high' | 'high' | 'medium' | 'low';
    multiplierFactor: number;
    officialSource: string;
  } | null>;
}

export interface InsuranceEventOutboxPublisher {
  publish(event: InsuranceDomainEvent): Promise<void>;
}
