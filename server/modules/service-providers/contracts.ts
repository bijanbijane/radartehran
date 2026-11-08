/**
 * Real Estate Professionals & Service Providers External Contracts & Adapters
 * (`server/modules/service-providers/contracts.ts`)
 * Exclusive ownership: `server/modules/service-providers/`
 */

import type { ProviderDomainEvent } from './types';

export interface GeographyValidationAdapter {
  validateServiceArea(cityId: string, districtId?: string, hoodId?: number): Promise<{
    isValid: boolean;
    cityNameFa?: string;
    districtNameFa?: string;
    hoodNameFa?: string;
  }>;
}

export interface MediaStorageReferenceAdapter {
  verifyMediaReference(mediaId: string): Promise<{
    exists: boolean;
    mimeType?: string;
    isPrivateDocument: boolean;
  }>;
}

export interface NotificationsOutboxAdapter {
  dispatchProviderEvent(event: ProviderDomainEvent): Promise<{ queued: boolean; notificationId?: string }>;
}

export interface TrustAndSafetyProviderAdapter {
  reportSuspiciousProviderActivity(report: {
    targetId: string;
    targetType: 'provider' | 'organization' | 'review' | 'credential';
    reportingUserId: string;
    violationType: 'fake_profile' | 'fraudulent_credential' | 'fake_review' | 'harassment' | 'unauthorized_impersonation';
    evidenceSummaryFa: string;
  }): Promise<{ reportId: string; status: 'received' | 'investigating' }>;
}
