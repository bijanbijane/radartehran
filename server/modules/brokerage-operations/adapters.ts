import { MULTI_CITY_CONFIGS } from '../../../src/data/multiCityData';
import { BrokerageJurisdictionRef, BrokerageOpsError } from './types';

export interface BrokerageGeographyAdapter {
  validateJurisdiction(jurisdiction: BrokerageJurisdictionRef): Promise<{ valid: boolean; reason?: string }>;
}

export interface BrokeragePaymentVerificationAdapter {
  verifyCommissionPaymentReceipt(params: {
    commissionAgreementId: string;
    authoritativePaymentReceiptRef: string;
    amountRials: number;
  }): Promise<{ verifiedByPaymentSystem: boolean; notes: string }>;
}

export interface BrokerageNotificationsAdapter {
  sendConsentAwareEngagementNotification(params: {
    engagementId: string;
    clientPartyId: string;
    channel: 'PHONE' | 'SMS' | 'IN_APP_NOTIFICATION' | 'EMAIL';
    summary: string;
  }): Promise<{ acceptedForDelivery: boolean }>;
}

export interface BrokerageTrustAndSafetyAdapter {
  reportSupervisionEscalation(params: {
    reviewId: string;
    organizationId: string;
    targetId: string;
    findingsSummary: string;
  }): Promise<{ trustAndSafetyCaseRef: string }>;
}

export interface BrokerageLegalRegulatoryAdapter {
  getJurisdictionCommissionAndLicensingRules(params: {
    citySlug: string;
  }): Promise<{ ruleReferenceIds: string[]; summary: string }>;
}

export interface BrokerageExternalModuleWriteGuardAdapter {
  attemptDirectExternalModuleWrite(targetModule: string): Promise<never>;
}

export interface BrokerageOperationsExternalAdapters {
  geography: BrokerageGeographyAdapter;
  paymentVerification: BrokeragePaymentVerificationAdapter;
  notifications: BrokerageNotificationsAdapter;
  trustAndSafety: BrokerageTrustAndSafetyAdapter;
  legalRegulatory: BrokerageLegalRegulatoryAdapter;
  externalWriteGuard: BrokerageExternalModuleWriteGuardAdapter;
}

export class CanonicalBrokerageGeographyAdapter implements BrokerageGeographyAdapter {
  async validateJurisdiction(
    jurisdiction: BrokerageJurisdictionRef
  ): Promise<{ valid: boolean; reason?: string }> {
    const slug = jurisdiction.citySlug.trim().toLowerCase();
    const city = MULTI_CITY_CONFIGS[slug];
    if (!city) {
      return { valid: false, reason: `Unknown canonical citySlug '${jurisdiction.citySlug}'.` };
    }
    if (jurisdiction.neighborhoodIdOrSlug) {
      const target = jurisdiction.neighborhoodIdOrSlug.trim().toLowerCase();
      const found = city.neighborhoods.some(
        (n) => String(n.id) === target || n.name.trim().toLowerCase() === target
      );
      if (!found) {
        return {
          valid: false,
          reason: `Neighborhood '${jurisdiction.neighborhoodIdOrSlug}' does not belong to city '${slug}'.`,
        };
      }
    }
    return { valid: true };
  }
}

export function createDefaultBrokerageOperationsAdapters(
  overrides: Partial<BrokerageOperationsExternalAdapters> = {}
): BrokerageOperationsExternalAdapters {
  return {
    geography: overrides.geography ?? new CanonicalBrokerageGeographyAdapter(),
    paymentVerification: overrides.paymentVerification ?? {
      async verifyCommissionPaymentReceipt(params) {
        return {
          verifiedByPaymentSystem: params.authoritativePaymentReceiptRef.startsWith('PAY-VERIFIED-'),
          notes: 'Checked authoritative payment receipt prefix.',
        };
      },
    },
    notifications: overrides.notifications ?? {
      async sendConsentAwareEngagementNotification() {
        return { acceptedForDelivery: true };
      },
    },
    trustAndSafety: overrides.trustAndSafety ?? {
      async reportSupervisionEscalation(params) {
        return { trustAndSafetyCaseRef: `ts_case_${params.reviewId}` };
      },
    },
    legalRegulatory: overrides.legalRegulatory ?? {
      async getJurisdictionCommissionAndLicensingRules(params) {
        return {
          ruleReferenceIds: [`rule_brokerage_${params.citySlug.toLowerCase()}`],
          summary: 'Referenced via Legal & Regulatory Intelligence adapter.',
        };
      },
    },
    externalWriteGuard: overrides.externalWriteGuard ?? {
      async attemptDirectExternalModuleWrite(targetModule: string): Promise<never> {
        throw new BrokerageOpsError(
          'INSUFFICIENT_PRIVILEGE',
          `Direct cross-module write into '${targetModule}' is strictly prohibited by Brokerage Operations ownership boundaries.`,
          403
        );
      },
    },
  };
}
