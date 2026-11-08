import { MULTI_CITY_CONFIGS } from '../../../src/data/multiCityData';
import {
  ApplicantRelationshipType,
  DeadlineUrgencyStatus,
  PermitCategoryCode,
} from './types';

export interface PermitsGeographyAdapter {
  validateJurisdiction(params: {
    citySlug: string;
    districtCode?: string;
    neighborhoodIdOrSlug?: string;
  }): Promise<{ valid: boolean; reason?: string }>;
}

export interface PermitsPropertyAndOwnershipAdapter {
  verifyApplicantStanding(params: {
    propertyId: string;
    applicantPartyId: string;
    applicantRelationship: ApplicantRelationshipType;
    representativePartyId?: string;
  }): Promise<{
    propertyExists: boolean;
    hasVerifiedOrDocumentedStanding: boolean;
    standingSummary: string;
  }>;
}

export interface PermitsLegalRegulatoryAdapter {
  getApplicablePermitRules(params: {
    citySlug: string;
    permitCategory: PermitCategoryCode;
  }): Promise<{
    ruleIds: string[];
    summary: string;
  }>;
}

export interface PermitsPaymentReferenceAdapter {
  verifyOfficialReceiptReference(params: {
    issuingAuthorityId: string;
    externalPaymentReferenceNumber: string;
    amountRials: number;
  }): Promise<{
    verifiedByAuthoritativeSource: boolean;
    verificationNotes: string;
  }>;
}

export interface PermitsNotificationsAdapter {
  emitPermitDeadlineReminder(params: {
    deadlineId: string;
    targetType: string;
    targetId: string;
    recipientPartyId: string;
    urgencyStatus: DeadlineUrgencyStatus;
    dueDateIso: string;
    summary: string;
  }): Promise<void>;
}

export interface PropertyPermitsExternalAdapters {
  geography: PermitsGeographyAdapter;
  propertyAndOwnership: PermitsPropertyAndOwnershipAdapter;
  legalRegulatory: PermitsLegalRegulatoryAdapter;
  paymentReference: PermitsPaymentReferenceAdapter;
  notifications: PermitsNotificationsAdapter;
}

export class CanonicalPermitsGeographyAdapter implements PermitsGeographyAdapter {
  async validateJurisdiction(params: {
    citySlug: string;
    districtCode?: string;
    neighborhoodIdOrSlug?: string;
  }): Promise<{ valid: boolean; reason?: string }> {
    const slug = params.citySlug.trim().toLowerCase();
    const city = MULTI_CITY_CONFIGS[slug];
    if (!city) {
      return { valid: false, reason: `Unknown canonical citySlug '${params.citySlug}'.` };
    }
    if (params.neighborhoodIdOrSlug) {
      const target = params.neighborhoodIdOrSlug.trim().toLowerCase();
      const found = city.neighborhoods.some(
        (n) =>
          String(n.id) === target ||
          n.name.trim().toLowerCase() === target
      );
      if (!found) {
        return {
          valid: false,
          reason: `Neighborhood '${params.neighborhoodIdOrSlug}' not found in city '${slug}'.`,
        };
      }
    }
    return { valid: true };
  }
}

export function createDefaultPropertyPermitsAdapters(
  overrides: Partial<PropertyPermitsExternalAdapters> = {}
): PropertyPermitsExternalAdapters {
  return {
    geography: overrides.geography ?? new CanonicalPermitsGeographyAdapter(),
    propertyAndOwnership: overrides.propertyAndOwnership ?? {
      async verifyApplicantStanding() {
        return {
          propertyExists: true,
          hasVerifiedOrDocumentedStanding: true,
          standingSummary: 'Default adapter standing check passed.',
        };
      },
    },
    legalRegulatory: overrides.legalRegulatory ?? {
      async getApplicablePermitRules() {
        return { ruleIds: [], summary: 'No external legal-regulatory rules linked.' };
      },
    },
    paymentReference: overrides.paymentReference ?? {
      async verifyOfficialReceiptReference() {
        return {
          verifiedByAuthoritativeSource: false,
          verificationNotes: 'Default payment adapter requires explicit receipt verification.',
        };
      },
    },
    notifications: overrides.notifications ?? {
      async emitPermitDeadlineReminder() {
        // Default no-op reminder emitter
      },
    },
  };
}
