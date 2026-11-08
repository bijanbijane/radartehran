/**
 * External Integration Adapters & Contracts for Property Risk
 * (`server/modules/property-risk/contracts.ts`)
 * Exclusive ownership: `server/modules/property-risk/`
 */

import { PropertyRiskDomainEvent } from './types.js';

export interface GeographySpatialAdapter {
  getNeighborhoodCentroid(cityId: string, hoodId: number): Promise<{ lat: number; lng: number } | null>;
  getDistanceToNearestActiveFaultMeters(lat: number, lng: number): Promise<number | null>;
  isPointInsideHazardPolygon(lat: number, lng: number, hazardZoneId: string): Promise<boolean>;
}

export interface PropertyRegistryRiskAdapter {
  verifyPropertyExists(propertyId: string): Promise<boolean>;
  getPropertyCoordinates(propertyId: string): Promise<{ lat: number; lng: number } | null>;
  getPropertyLocation(propertyId: string): Promise<{ cityId: string; hoodId?: number } | null>;
  getPropertyStructuralAttributes(propertyId: string): Promise<{
    constructionYear?: number;
    numberOfFloors?: number;
    structuralType?: string;
  } | null>;
}

export interface PropertyDueDiligenceRiskAdapter {
  getStructuralInspectionSummary(propertyId: string): Promise<{
    observedStructuralCracks: boolean;
    settlementEvidenceFound: boolean;
    hasSeismicRetrofit: boolean;
  } | null>;
}

export interface UrbanIntelligenceEnvironmentalAdapter {
  getNeighborhoodAirQuality(cityId: string, hoodId?: number): Promise<{
    annualAverageAqi: number;
    pm25MicrogramsPerM3: number;
  } | null>;
}

export interface PropertyRiskEventOutboxPublisher {
  publish(event: PropertyRiskDomainEvent): Promise<void>;
}
