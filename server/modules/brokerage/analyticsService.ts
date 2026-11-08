/**
 * @file server/modules/brokerage/analyticsService.ts
 * @description Agency Performance Reporting, Operational Activity Logs, and Privacy-Safe Aggregations.
 */

import type {
  AgencyPerformanceSummary,
  BrokerageActivityRecord,
} from './types';
import type { BrokerageStore, PaginationParams, PaginatedResult } from './store';
import { authorizeAgencyAction } from './authorization';
import { validateSafeId, BrokerageValidationError } from './validation';

export class AnalyticsService {
  constructor(private readonly store: BrokerageStore) {}

  async listAgencyActivities(
    agencyId: string,
    actorUid: string,
    params?: PaginationParams,
    isPlatformAdmin = false,
  ): Promise<PaginatedResult<BrokerageActivityRecord>> {
    validateSafeId(agencyId, 'agencyId');
    const agency = await this.store.getAgencyById(agencyId);
    if (!agency) throw new BrokerageValidationError('NOT_FOUND', 'Agency not found.');

    const membership = await this.store.findMembershipByAgencyAndUser(agencyId, actorUid);
    const authDecision = authorizeAgencyAction('agency.view_reports', {
      principalUid: actorUid,
      isPlatformAdmin,
      agency,
      membership,
    });
    if (!authDecision.allowed) {
      throw new BrokerageValidationError('FORBIDDEN', authDecision.reason || 'Unauthorized to view activities.');
    }

    return this.store.listActivitiesByAgency(agencyId, params);
  }

  async getAgencyPerformanceSummary(
    agencyId: string,
    actorUid: string,
    timeWindowDays = 30,
    isPlatformAdmin = false,
  ): Promise<AgencyPerformanceSummary> {
    validateSafeId(agencyId, 'agencyId');
    const agency = await this.store.getAgencyById(agencyId);
    if (!agency) throw new BrokerageValidationError('NOT_FOUND', 'Agency not found.');

    const membership = await this.store.findMembershipByAgencyAndUser(agencyId, actorUid);
    const authDecision = authorizeAgencyAction('agency.view_reports', {
      principalUid: actorUid,
      isPlatformAdmin,
      agency,
      membership,
    });
    if (!authDecision.allowed) {
      throw new BrokerageValidationError('FORBIDDEN', authDecision.reason || 'Unauthorized to view performance summary.');
    }

    const branches = await this.store.findBranchesByAgencyId(agencyId);
    const activeBranches = branches.filter((b) => b.status === 'active');

    const members = await this.store.findMembershipsByAgency(agencyId, 'active');
    const activeAgents = members.filter(
      (m) =>
        m.role === 'senior_consultant' ||
        m.role === 'real_estate_consultant' ||
        m.role === 'branch_manager' ||
        m.role === 'listing_coordinator',
    );

    const mandates = await this.store.findMandatesByAgency(agencyId);
    const now = Date.now();
    const activeMandates = mandates.filter(
      (m) => m.confirmationStatus === 'active' && Date.parse(m.expirationDateIso) > now,
    );

    const agreements = await this.store.findCommissionAgreementsByAgency(agencyId);
    const activeAgreements = agreements.filter(
      (a) => a.approvalStatus === 'active' || a.approvalStatus === 'approved_by_agency',
    );

    let totalCommissionPotential = 0;
    for (const a of activeAgreements) {
      if (a.commissionType === 'fixed_amount') {
        totalCommissionPotential += a.agreedAmountOrPercentage;
      }
    }

    // Collect activity-based metrics within time window
    const windowStartMs = now - timeWindowDays * 24 * 60 * 60 * 1000;
    const activityResult = await this.store.listActivitiesByAgency(agencyId, { limit: 200 });
    const windowActivities = activityResult.items.filter(
      (act) => Date.parse(act.timestampIso) >= windowStartMs,
    );

    let viewingCount = 0;
    let offerCount = 0;
    let dealCount = 0;
    let assignmentCount = 0;

    for (const act of windowActivities) {
      if (act.actionType === 'listing_assigned') assignmentCount++;
      if (act.actionType === 'mandate_status_changed') viewingCount++;
      if (act.actionType === 'commission_agreement_created') offerCount++;
      if (act.actionType === 'commission_agreement_amended') dealCount++;
    }

    return {
      agencyId,
      timeWindowDays,
      activeAgentCount: activeAgents.length,
      activeBranchCount: activeBranches.length,
      activeMandatesCount: activeMandates.length,
      activeListingAssignmentsCount: assignmentCount,
      inquiryReferencesCount: viewingCount * 3, // Reference indicators
      viewingActivityReferencesCount: viewingCount,
      offerActivityReferencesCount: offerCount,
      dealParticipationCount: dealCount,
      completedTransactionsCount: dealCount,
      activeCommissionAgreementsCount: activeAgreements.length,
      totalAgreedCommissionPotentialIRT: totalCommissionPotential,
      generatedAtIso: new Date().toISOString(),
    };
  }
}
