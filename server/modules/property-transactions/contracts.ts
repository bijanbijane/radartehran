/**
 * Property Transaction & Deal Management External Integration Contracts & Adapters
 * (`server/modules/property-transactions/contracts.ts`)
 * Exclusive ownership: `server/modules/property-transactions/`
 */

import type { DealDomainEvent, TransactionCategory, TransactionType } from './types';

export interface AuthoritativeListingSnapshot {
  listingId: string;
  isAvailable: boolean;
  isApproved: boolean;
  isExpired: boolean;
  ownerUserId: string;
  transactionType: TransactionType;
  propertyCategory: TransactionCategory;
  cityId: string;
  hoodId: number;
  hoodNameFa: string;
  streetText: string;
  askingPriceMillionToman?: number;
  depositMillionToman?: number;
  monthlyRentMillionToman?: number;
}

export interface BargainsListingValidationAdapter {
  getAuthoritativeListing(listingId: string): Promise<AuthoritativeListingSnapshot | null>;
  validateListingForTransaction(listingId: string): Promise<{
    valid: boolean;
    reason?: string;
    snapshot?: AuthoritativeListingSnapshot;
  }>;
}

export interface CanonicalPropertyReference {
  canonicalPropertyId: string;
  cadastralCode?: string;
  municipalityDistrict: number;
  verifiedOwnerNationalIdHash?: string;
  buildingPermitNumber?: string;
}

export interface PropertyRegistryAdapter {
  resolveCanonicalAsset(propertyId: string): Promise<CanonicalPropertyReference | null>;
  verifyOwnerRepresentation(params: {
    ownerUserId: string;
    representativeUserId: string;
    canonicalPropertyId?: string;
  }): Promise<{ isAuthorized: boolean; authorizationDocId?: string }>;
}

export interface GeographyAddressDisclosureAdapter {
  resolvePublicSafeCentroid(cityId: string, hoodId: number): Promise<{ lat: number; lng: number } | null>;
  getMaskedAddress(streetText: string, level: 'neighborhood' | 'street' | 'exact'): string;
}

export interface NotificationsOutboxAdapter {
  dispatchDealNotification(event: DealDomainEvent): Promise<{ queued: boolean; notificationId?: string }>;
}

export interface MessagingWorkflowAdapter {
  ensureDirectNegotiationThread(params: {
    dealId: string;
    participantUserIds: string[];
    initiatorUserId: string;
  }): Promise<{ threadId: string; channelRef: string }>;
}

export interface TrustAndSafetyAlertAdapter {
  reportSuspiciousDealActivity(report: {
    dealId?: string;
    inquiryId?: string;
    offendingUserId: string;
    reportingUserId: string;
    category:
      | 'suspected_impersonation'
      | 'unauthorized_representation'
      | 'fraudulent_offer'
      | 'harassment'
      | 'rate_limit_abuse';
    evidenceSummary: string;
  }): Promise<{ reportId: string; status: 'received' | 'investigating' }>;
}

export interface FutureFinancialEscrowAdapter {
  verifyPaymentReference(referenceId: string): Promise<{
    settled: boolean;
    verifiedAmountMillionToman?: number;
    settledAtIso?: string;
  }>;
}
