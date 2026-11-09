/**
 * @file server/modules/property-insurance/contracts/externalAdapters.ts
 * @description Explicit cross-module read-only and notification/payment integration interfaces
 * for the Property Insurance & Claims Management Backend (`server/modules/property-insurance/`).
 *
 * Ownership rules:
 * - Property Registry owns canonical property identity (`PARCEL`, `BUILDING`, `UNIT`, `OTHER_ASSET`).
 * - Property Ownership & Rights owns legal ownership/rights records.
 * - Property Risk owns environmental and physical hazard assessments.
 * - Media owns uploaded binary document/photo storage.
 * - Payments owns authoritative payment truth.
 * - Notifications owns outbound notification delivery.
 * - This module owns insurance policies, coverage/exclusion structures, claims, loss assessments,
 *   settlement records, renewals, and insurance history.
 */

export interface CanonicalInsuredAssetSummary {
  canonicalPropertyId: string;
  entityKind: 'PARCEL' | 'BUILDING' | 'UNIT' | 'OTHER_ASSET';
  exists: boolean;
  cityId: string;
  neighborhoodCompositeId: string | null;
  registrationStatus: string;
}

export interface InsurancePropertyRegistryReadAdapter {
  getCanonicalPropertySummary(
    canonicalPropertyId: string,
  ): Promise<CanonicalInsuredAssetSummary | null>;
}

export interface PropertyOwnershipVerificationSummary {
  canonicalPropertyId: string;
  partyId: string;
  isVerifiedLegalOwner: boolean;
  ownershipVerificationBasis: string | null;
}

export interface InsurancePropertyOwnershipReadAdapter {
  checkPartyOwnershipRelation(
    canonicalPropertyId: string,
    partyId: string,
  ): Promise<PropertyOwnershipVerificationSummary>;
}

export interface PropertyHazardContextSummary {
  canonicalPropertyId: string;
  riskAssessmentId: string;
  earthquakeExposureLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'UNKNOWN';
  floodExposureLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'UNKNOWN';
  assessedAtIso: string;
}

export interface InsurancePropertyRiskReadAdapter {
  getPropertyHazardContext(
    canonicalPropertyId: string,
  ): Promise<PropertyHazardContextSummary | null>;
}

export interface InsuranceMediaDocumentMetadata {
  mediaId: string;
  uploaderUid: string;
  mimeType: string;
  byteSize: number;
  sha256Checksum: string;
  uploadedAtIso: string;
  isPrivateRestricted: boolean;
}

export interface InsuranceMediaReadAdapter {
  getMediaDocumentMetadata(mediaId: string): Promise<InsuranceMediaDocumentMetadata | null>;
}

export interface AuthoritativePaymentVerificationResult {
  paymentRefId: string;
  verifiedByPaymentGateway: boolean;
  paymentStatus: 'CONFIRMED' | 'PENDING' | 'FAILED' | 'REFUNDED' | 'DISPUTED';
  confirmedAmount: number;
  currency: 'IRR' | 'TOMAN';
  confirmedAtIso: string | null;
  payerReference: string | null;
}

export interface InsurancePaymentVerificationReadAdapter {
  verifyAuthoritativePaymentReference(
    paymentRefId: string,
  ): Promise<AuthoritativePaymentVerificationResult | null>;
}

export type InsuranceOperationalEventType =
  | 'POLICY_CREATED'
  | 'POLICY_AWAITING_VERIFICATION'
  | 'POLICY_ACTIVATED'
  | 'POLICY_APPROACHING_EXPIRATION'
  | 'POLICY_EXPIRED'
  | 'CLAIM_SUBMITTED'
  | 'CLAIM_ADDITIONAL_EVIDENCE_REQUIRED'
  | 'CLAIM_STATUS_CHANGED'
  | 'CLAIM_DECISION_RECORDED'
  | 'SETTLEMENT_CONFIRMED';

export interface InsuranceNotificationDispatchReceipt {
  eventId: string;
  eventType: InsuranceOperationalEventType;
  queuedForDelivery: boolean;
  deliveryConfirmed: false;
  queuedAtIso: string;
}

export interface InsuranceNotificationDispatchAdapter {
  enqueueOperationalEventNotification(input: {
    eventType: InsuranceOperationalEventType;
    recipientUids: string[];
    policyId: string;
    claimId?: string | null;
    summaryMessage: string;
  }): Promise<InsuranceNotificationDispatchReceipt>;
}
