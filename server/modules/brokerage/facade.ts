/**
 * @file server/modules/brokerage/facade.ts
 * @description Unified Brokerage Facade exposing all Sub-Services and Integration Adapters.
 */

import { DurableBrokerageStore, type BrokerageStore } from './store';
import { AgencyService } from './agencyService';
import { MembershipService } from './membershipService';
import { MandateService } from './mandateService';
import { CommissionService } from './commissionService';
import { AnalyticsService } from './analyticsService';
import {
  type ListingValidationAdapter,
  type TransactionReferenceAdapter,
  type GeographyReferenceAdapter,
  type BrokerageNotificationEventSink,
  type BrokerageAccountLifecycleAdapter,
  type TrustAndSafetyEnforcementAdapter,
  DefaultListingValidationAdapter,
  DefaultTransactionReferenceAdapter,
  DefaultGeographyReferenceAdapter,
  InactiveNotificationEventSink,
} from './adapters';

export interface BrokerageModuleOptions {
  store?: BrokerageStore;
  listingAdapter?: ListingValidationAdapter;
  transactionAdapter?: TransactionReferenceAdapter;
  geoAdapter?: GeographyReferenceAdapter;
  notificationSink?: BrokerageNotificationEventSink;
}

export class BrokerageFacade implements BrokerageAccountLifecycleAdapter, TrustAndSafetyEnforcementAdapter {
  public readonly store: BrokerageStore;
  public readonly agencyService: AgencyService;
  public readonly membershipService: MembershipService;
  public readonly mandateService: MandateService;
  public readonly commissionService: CommissionService;
  public readonly analyticsService: AnalyticsService;

  constructor(options?: BrokerageModuleOptions) {
    this.store = options?.store || new DurableBrokerageStore();
    const listingAdapter = options?.listingAdapter || new DefaultListingValidationAdapter();
    const transactionAdapter = options?.transactionAdapter || new DefaultTransactionReferenceAdapter();
    const geoAdapter = options?.geoAdapter || new DefaultGeographyReferenceAdapter();
    const notificationSink = options?.notificationSink || new InactiveNotificationEventSink();

    this.agencyService = new AgencyService(this.store, geoAdapter, notificationSink);
    this.membershipService = new MembershipService(this.store, notificationSink);
    this.mandateService = new MandateService(this.store, listingAdapter, notificationSink);
    this.commissionService = new CommissionService(this.store, transactionAdapter, notificationSink);
    this.analyticsService = new AnalyticsService(this.store);
  }

  // --- Account Lifecycle Adapter Implementation ---
  async exportUserData(userUid: string) {
    const profile = await this.store.getAgentProfileByUserUid(userUid);
    const memberships = await this.store.findMembershipsByUser(userUid);
    const commissionAgreements = await this.store.findCommissionAgreementsByAgent(userUid);
    const listingAssignments = await this.store.findListingAssignmentsByAgent(userUid);

    return {
      profile,
      memberships,
      mandates: [],
      commissionAgreements,
      listingAssignments,
    };
  }

  async purgeOrAnonymizeUserData(userUid: string, reason: string) {
    let purgedProfileCount = 0;
    const profile = await this.store.getAgentProfileByUserUid(userUid);
    if (profile) {
      profile.publicationStatus = 'archived';
      profile.professionalBio = '[REDACTED PURSUANT TO ACCOUNT DELETION]';
      await this.store.saveAgentProfile(profile);
      purgedProfileCount = 1;
    }

    const memberships = await this.store.findMembershipsByUser(userUid);
    let terminatedMembershipsCount = 0;
    for (const m of memberships) {
      if (m.status === 'active' || m.status === 'invited') {
        m.status = 'terminated';
        m.terminationReason = `Account deleted: ${reason}`;
        m.terminatedAtIso = new Date().toISOString();
        await this.store.saveMembership(m);
        terminatedMembershipsCount++;
      }
    }

    return {
      purgedProfileCount,
      terminatedMembershipsCount,
      anonymizedMandatesCount: 0,
    };
  }

  // --- Trust & Safety Enforcement Adapter Implementation ---
  async reportComplianceIncident(incident: {
    agencyId: string;
    agentUid?: string;
    reason: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    reportedByUid: string;
  }) {
    const incidentId = `ts_inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await this.store.saveActivityRecord({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      agencyId: incident.agencyId,
      actorUid: incident.reportedByUid,
      actorRole: 'platform_admin',
      actionType: 'agency_status_changed',
      resourceType: 'agency',
      resourceId: incident.agencyId,
      timestampIso: new Date().toISOString(),
      metadata: { incidentId, severity: incident.severity, reason: incident.reason },
    });
    return { incidentId };
  }

  async applyAdministrativeSuspension(agencyId: string, reason: string, adminUid: string) {
    return this.agencyService.setOperatingStatus(agencyId, 'suspended', adminUid, reason, true);
  }
}

export function createBrokerageModule(options?: BrokerageModuleOptions): BrokerageFacade {
  return new BrokerageFacade(options);
}
