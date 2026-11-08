/**
 * Real Estate Development Projects External Integration Contracts & Adapters
 * (`server/modules/development-projects/contracts.ts`)
 * Exclusive ownership: `server/modules/development-projects/`
 */

import type { DevelopmentDomainEvent } from './types';

export interface CanonicalAssetReference {
  propertyId: string;
  cadastralCode?: string;
  municipalityDistrict?: number;
  isRegisteredAsset: boolean;
}

export interface PropertyRegistryAssetAdapter {
  verifyAssetReference(propertyId: string): Promise<CanonicalAssetReference | null>;
  linkCompletedAsset(projectId: string, buildingAssetId: string): Promise<{ linked: boolean; registrationRef?: string }>;
}

export interface GeographyReferenceAdapter {
  validateLocationScope(cityId: string, hoodId?: number): Promise<{ isValid: boolean; displayNameFa?: string }>;
}

export interface PropertyServicesProviderAdapter {
  getProviderProfile(providerId: string): Promise<{
    providerId: string;
    trade: string;
    verifiedLicense: boolean;
    companyNameFa?: string;
  } | null>;
}

export interface MediaStorageReferenceAdapter {
  verifyMediaReference(mediaId: string): Promise<{ exists: boolean; mimeType?: string; isConfidential?: boolean }>;
}

export interface NotificationsEventAdapter {
  dispatchProjectEvent(event: DevelopmentDomainEvent): Promise<{ queued: boolean; notificationId?: string }>;
}

export interface SafetyIncidentEscalationAdapter {
  reportSiteSafetyIncident(params: {
    projectId: string;
    reportingUserId: string;
    incidentCategory: 'injury' | 'equipment_failure' | 'structural_collapse_risk' | 'safety_violation';
    descriptionFa: string;
  }): Promise<{ incidentTicketId: string; status: 'received' | 'investigating' }>;
}
