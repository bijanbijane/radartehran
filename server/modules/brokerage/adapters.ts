/**
 * @file server/modules/brokerage/adapters.ts
 * @description Integration Adapter Interfaces and Safe Stubs for Core, Bargains, Geography, Notifications, Trust & Safety, and Account Lifecycle.
 */

import type {
  AuthenticatedPrincipal,
  AuditEventSink,
} from '../core/types';

/**
 * Contract for validating listing existence from Bargains module.
 */
export interface ListingValidationAdapter {
  checkListingExists(listingId: string): Promise<{
    exists: boolean;
    ownerUid?: string;
    cityId?: string;
    status?: string;
  }>;
}

/**
 * Contract for validating deal and transaction status from Property Transactions module.
 */
export interface TransactionReferenceAdapter {
  verifyDealStatus(dealReference: string): Promise<{
    exists: boolean;
    isConfirmed: boolean;
    confirmedValueToman?: number;
    propertyReference?: string;
    buyerUid?: string;
    sellerUid?: string;
  }>;
}

/**
 * Contract for validating geographic entities from Geography module.
 */
export interface GeographyReferenceAdapter {
  validateGeographicArea(cityId: string, neighborhoodId?: number): Promise<{
    isValidCity: boolean;
    isValidNeighborhood: boolean;
    cityNameFa?: string;
    neighborhoodNameFa?: string;
  }>;
}

/**
 * Event payload for Brokerage domain notifications.
 */
export interface BrokerageNotificationEvent {
  eventType:
    | 'brokerage.invitation_created'
    | 'brokerage.invitation_accepted'
    | 'brokerage.membership_role_changed'
    | 'brokerage.agent_assigned_to_branch'
    | 'brokerage.agent_removed'
    | 'brokerage.mandate_submitted'
    | 'brokerage.mandate_status_changed'
    | 'brokerage.commission_agreement_created'
    | 'brokerage.commission_agreement_amended'
    | 'brokerage.agency_status_changed';
  recipientUid: string;
  agencyId: string;
  actorUid: string;
  data: Record<string, unknown>;
  timestampIso: string;
}

/**
 * Contract for dispatching events to the Notifications module.
 */
export interface BrokerageNotificationEventSink {
  emitEvent(event: BrokerageNotificationEvent): Promise<void>;
}

/**
 * Contract for Trust & Safety administrative enforcement commands.
 */
export interface TrustAndSafetyEnforcementAdapter {
  reportComplianceIncident(incident: {
    agencyId: string;
    agentUid?: string;
    reason: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    reportedByUid: string;
  }): Promise<{ incidentId: string }>;
}

/**
 * Contract for Account Lifecycle module integration (export & deletion).
 */
export interface BrokerageAccountLifecycleAdapter {
  exportUserData(userUid: string): Promise<{
    profile: unknown;
    memberships: unknown[];
    mandates: unknown[];
    commissionAgreements: unknown[];
  }>;
  purgeOrAnonymizeUserData(userUid: string, reason: string): Promise<{
    purgedProfileCount: number;
    terminatedMembershipsCount: number;
    anonymizedMandatesCount: number;
  }>;
}

/**
 * Default safe in-memory/no-op adapter implementations for tests and standalone mode.
 */
export class DefaultListingValidationAdapter implements ListingValidationAdapter {
  async checkListingExists(listingId: string) {
    return { exists: Boolean(listingId && listingId.length > 2), status: 'active' };
  }
}

export class DefaultTransactionReferenceAdapter implements TransactionReferenceAdapter {
  async verifyDealStatus(dealReference: string) {
    const isMockConfirmed = dealReference.includes('confirmed') || dealReference.includes('deal-');
    return {
      exists: Boolean(dealReference),
      isConfirmed: isMockConfirmed,
      confirmedValueToman: isMockConfirmed ? 5_000_000_000 : undefined,
    };
  }
}

export class DefaultGeographyReferenceAdapter implements GeographyReferenceAdapter {
  async validateGeographicArea(cityId: string, neighborhoodId?: number) {
    const validCities = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'];
    return {
      isValidCity: validCities.includes(cityId.toLowerCase()),
      isValidNeighborhood: typeof neighborhoodId === 'number' ? neighborhoodId > 0 : true,
    };
  }
}

export class InactiveNotificationEventSink implements BrokerageNotificationEventSink {
  public emittedEvents: BrokerageNotificationEvent[] = [];
  async emitEvent(event: BrokerageNotificationEvent) {
    this.emittedEvents.push(event);
  }
}
