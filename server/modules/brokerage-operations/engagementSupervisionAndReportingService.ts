import crypto from 'crypto';
import {
  AgentAssignmentRecord,
  BrokerageActorContext,
  BrokerageOpsError,
  ClientEngagementRecord,
  OrganizationAgentAffiliationRecord,
  OrganizationOperationalReport,
  RepresentationMandateRecord,
  SupervisionReviewRecord,
} from './types';
import {
  assertSameOrganizationAccess,
  requireNonEmpty,
} from './validationAndAuthz';
import { BrokerageOperationsExternalAdapters } from './adapters';
import { BrokerageOperationsStore } from './store';

export class EngagementSupervisionAndReportingService {
  constructor(
    private readonly store: BrokerageOperationsStore,
    private readonly adapters: BrokerageOperationsExternalAdapters
  ) {}

  async createClientEngagement(
    actor: BrokerageActorContext,
    input: {
      id?: string;
      clientPartyId: string;
      organizationId: string;
      assignedProfessionalProfileId: string;
      engagementCategory: ClientEngagementRecord['engagementCategory'];
      propertyId?: string;
      mandateId?: string;
      originChannel: string;
      priority?: ClientEngagementRecord['priority'];
      nextActionSummary?: string;
      communicationConsent: ClientEngagementRecord['communicationConsent'];
    }
  ): Promise<ClientEngagementRecord> {
    assertSameOrganizationAccess(actor, input.organizationId, false);
    const now = new Date().toISOString();
    const engagement: ClientEngagementRecord = {
      id: input.id || `beng_${crypto.randomBytes(6).toString('hex')}`,
      clientPartyId: requireNonEmpty(input.clientPartyId, 'clientPartyId', 150),
      organizationId: input.organizationId,
      assignedProfessionalProfileId: input.assignedProfessionalProfileId,
      engagementCategory: input.engagementCategory,
      propertyId: input.propertyId,
      mandateId: input.mandateId,
      originChannel: requireNonEmpty(input.originChannel, 'originChannel', 100),
      status: 'OPEN',
      priority: input.priority ?? 'NORMAL',
      nextActionSummary: input.nextActionSummary,
      lastInteractionAtIso: now,
      communicationConsent: input.communicationConsent,
      interactionNotes: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.store.saveEngagement(engagement);
    return engagement;
  }

  async retrieveClientEngagement(
    actor: BrokerageActorContext,
    engagementId: string
  ): Promise<ClientEngagementRecord> {
    const eng = await this.store.getEngagementById(engagementId);
    if (!eng) {
      throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Engagement '${engagementId}' not found.`, 404);
    }
    assertSameOrganizationAccess(actor, eng.organizationId, false);
    if (
      actor.role === 'PROFESSIONAL_AGENT' &&
      actor.professionalProfileId !== eng.assignedProfessionalProfileId
    ) {
      throw new BrokerageOpsError(
        'INSUFFICIENT_PRIVILEGE',
        `Agent '${actor.professionalProfileId}' is not assigned to client engagement '${eng.id}'.`,
        403
      );
    }
    return eng;
  }

  async recordConsentAwareContactAttempt(
    actor: BrokerageActorContext,
    input: {
      engagementId: string;
      channel: 'PHONE' | 'SMS' | 'IN_APP_NOTIFICATION' | 'EMAIL';
      summary: string;
    }
  ): Promise<ClientEngagementRecord> {
    const eng = await this.retrieveClientEngagement(actor, input.engagementId);
    if (
      !eng.communicationConsent.consentGranted ||
      !eng.communicationConsent.allowedChannels.includes(input.channel)
    ) {
      throw new BrokerageOpsError(
        'COMMUNICATION_CONSENT_REQUIRED',
        `Client '${eng.clientPartyId}' has not granted communication consent for channel '${input.channel}'.`,
        403
      );
    }

    await this.adapters.notifications.sendConsentAwareEngagementNotification({
      engagementId: eng.id,
      clientPartyId: eng.clientPartyId,
      channel: input.channel,
      summary: input.summary,
    });

    const now = new Date().toISOString();
    const updated: ClientEngagementRecord = {
      ...eng,
      status: 'IN_PROGRESS',
      lastInteractionAtIso: now,
      interactionNotes: [
        ...eng.interactionNotes,
        { recordedAt: now, recordedByUserId: actor.userId, summary: `[${input.channel}] ${input.summary}` },
      ],
      updatedAt: now,
    };
    await this.store.saveEngagement(updated);
    return updated;
  }

  async transferOrCloseEngagement(
    actor: BrokerageActorContext,
    input: {
      engagementId: string;
      action: 'TRANSFER' | 'CLOSE';
      newProfessionalProfileId?: string;
      reason: string;
    }
  ): Promise<ClientEngagementRecord> {
    const eng = await this.store.getEngagementById(input.engagementId);
    if (!eng) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Engagement '${input.engagementId}' not found.`, 404);
    assertSameOrganizationAccess(actor, eng.organizationId, true);

    const now = new Date().toISOString();
    const updated: ClientEngagementRecord = {
      ...eng,
      assignedProfessionalProfileId:
        input.action === 'TRANSFER' && input.newProfessionalProfileId
          ? input.newProfessionalProfileId
          : eng.assignedProfessionalProfileId,
      status: input.action === 'CLOSE' ? 'CLOSED' : 'TRANSFERRED',
      lastInteractionAtIso: now,
      interactionNotes: [
        ...eng.interactionNotes,
        { recordedAt: now, recordedByUserId: actor.userId, summary: `${input.action}: ${input.reason}` },
      ],
      updatedAt: now,
    };
    await this.store.saveEngagement(updated);
    return updated;
  }

  async recordSupervisionReview(
    actor: BrokerageActorContext,
    input: {
      id?: string;
      organizationId: string;
      targetType: SupervisionReviewRecord['targetType'];
      targetId: string;
      reviewScopeSummary: string;
      findingsSummary: string;
      evidenceIds?: string[];
      reviewStatus: SupervisionReviewRecord['reviewStatus'];
      requiredCorrectiveActions?: string[];
      escalateToTrustAndSafety?: boolean;
      legalRegulatoryRuleRefs?: string[];
    }
  ): Promise<SupervisionReviewRecord> {
    assertSameOrganizationAccess(actor, input.organizationId, false);
    if (actor.role !== 'SUPERVISOR' && actor.role !== 'ORG_ADMIN' && actor.role !== 'COMPLIANCE_VERIFIER') {
      throw new BrokerageOpsError(
        'INSUFFICIENT_PRIVILEGE',
        `Role '${actor.role}' is not authorized to perform agency supervision reviews.`,
        403
      );
    }

    const now = new Date().toISOString();
    const reviewId = input.id || `bsup_${crypto.randomBytes(6).toString('hex')}`;
    let escalatedCaseRef: string | undefined;
    if (input.escalateToTrustAndSafety || input.reviewStatus === 'ESCALATED_TO_TRUST_AND_SAFETY') {
      const esc = await this.adapters.trustAndSafety.reportSupervisionEscalation({
        reviewId,
        organizationId: input.organizationId,
        targetId: input.targetId,
        findingsSummary: input.findingsSummary,
      });
      escalatedCaseRef = esc.trustAndSafetyCaseRef;
    }

    const review: SupervisionReviewRecord = {
      id: reviewId,
      organizationId: input.organizationId,
      targetType: input.targetType,
      targetId: input.targetId,
      supervisorProfileId: actor.professionalProfileId || actor.userId,
      reviewScopeSummary: requireNonEmpty(input.reviewScopeSummary, 'reviewScopeSummary', 500),
      findingsSummary: requireNonEmpty(input.findingsSummary, 'findingsSummary', 1000),
      evidenceIds: input.evidenceIds ?? [],
      reviewStatus: escalatedCaseRef ? 'ESCALATED_TO_TRUST_AND_SAFETY' : input.reviewStatus,
      requiredCorrectiveActions: input.requiredCorrectiveActions ?? [],
      escalatedTrustAndSafetyCaseRef: escalatedCaseRef,
      legalRegulatoryRuleRefs: input.legalRegulatoryRuleRefs ?? [],
      createdAt: now,
      updatedAt: now,
    };

    await this.store.saveSupervisionReview(review);
    return review;
  }

  async retrieveOrganizationOperationalSummary(
    actor: BrokerageActorContext,
    organizationId: string,
    period: { fromIso: string; toIso: string }
  ): Promise<OrganizationOperationalReport> {
    assertSameOrganizationAccess(actor, organizationId, false);
    const [branches, affiliations, mandates, assignments, commissions] = await Promise.all([
      this.store.listBranchesByOrganization(organizationId),
      this.store.listAffiliationsByOrganization(organizationId),
      this.store.listMandatesByOrganization(organizationId),
      this.store.listAssignmentsByOrganization(organizationId),
      this.store.listCommissionAgreementsByOrganization(organizationId),
    ]);

    const now = new Date().toISOString();
    const activeAgentCount = affiliations.filter((a) => a.affiliationStatus === 'ACTIVE').length;
    const activeBranchCount = branches.filter((b) => b.operationalStatus === 'ACTIVE').length;
    const activeMandatesCount = mandates.filter(
      (m) => m.status === 'ACCEPTED_BY_CLIENT' || m.status === 'VERIFIED_AGAINST_EVIDENCE'
    ).length;
    const completedAssignments = assignments.filter((a) => a.workloadStatus === 'COMPLETED').length;
    const completionRate =
      assignments.length > 0 ? Number(((completedAssignments / assignments.length) * 100).toFixed(2)) : 0;
    const confirmedCommissionTotalRials = commissions.reduce(
      (sum, c) => sum + (c.financialSeparation.authoritativelyConfirmedPaymentAmountRials ?? 0),
      0
    );

    const buildMetric = (
      metricKey: string,
      metricDefinition: string,
      value: number,
      includedRecordsCriteria: string,
      excludedRecordsCriteria: string
    ) => ({
      metricKey,
      metricDefinition,
      value,
      measurementPeriod: period,
      includedRecordsCriteria,
      excludedRecordsCriteria,
      sourceModule: 'server/modules/brokerage-operations' as const,
      calculatedAtIso: now,
      dataCompletenessLimitations:
        'Reflects only platform-recorded brokerage operations; off-platform or self-reported activity is excluded.',
    });

    return {
      organizationId,
      generatedAtIso: now,
      metrics: {
        activeAgentCount: buildMetric(
          'activeAgentCount',
          'Count of affiliations in ACTIVE status for this organization.',
          activeAgentCount,
          'affiliationStatus === ACTIVE',
          'SUSPENDED and TERMINATED affiliations'
        ),
        activeBranchCount: buildMetric(
          'activeBranchCount',
          'Count of branches in ACTIVE operational status.',
          activeBranchCount,
          'operationalStatus === ACTIVE',
          'SUSPENDED and CLOSED branches'
        ),
        activeMandatesCount: buildMetric(
          'activeMandatesCount',
          'Count of client-accepted or evidence-verified mandates.',
          activeMandatesCount,
          'status in [ACCEPTED_BY_CLIENT, VERIFIED_AGAINST_EVIDENCE]',
          'CLIENT_INQUIRY, PROPOSED_REPRESENTATION, MANDATE_DRAFT, EXPIRED, TERMINATED'
        ),
        assignmentCompletionRatePercent: buildMetric(
          'assignmentCompletionRatePercent',
          'Percentage of organization assignments in COMPLETED status.',
          completionRate,
          'All recorded assignments for the organization',
          'Unassigned inquiries'
        ),
        confirmedCommissionTotalRials: buildMetric(
          'confirmedCommissionTotalRials',
          'Total Rials of authoritatively confirmed commission payments.',
          confirmedCommissionTotalRials,
          'authoritativelyConfirmedPaymentAmountRials where lifecycleState === PAYMENT_CONFIRMED',
          'Proposed, calculated, invoiced, or unverified self-reported payments'
        ),
      },
    };
  }

  async retrieveProfessionalActivityHistory(
    actor: BrokerageActorContext,
    professionalProfileId: string
  ): Promise<{
    affiliations: OrganizationAgentAffiliationRecord[];
    assignments: AgentAssignmentRecord[];
  }> {
    const [affiliations, assignments] = await Promise.all([
      this.store.listAffiliationsByProfile(professionalProfileId),
      this.store.listAssignmentsByProfile(professionalProfileId),
    ]);
    if (
      actor.role !== 'COMPLIANCE_VERIFIER' &&
      actor.role !== 'AUDITOR_READ_ONLY' &&
      actor.professionalProfileId !== professionalProfileId
    ) {
      const sameOrg = affiliations.some((a) => a.organizationId === actor.organizationId);
      if (!sameOrg) {
        throw new BrokerageOpsError(
          'CROSS_ORGANIZATION_ACCESS_DENIED',
          'Cannot view activity history of a professional outside your organization.',
          403
        );
      }
    }
    return { affiliations, assignments };
  }

  async retrieveMandateAndAffiliationHistory(
    actor: BrokerageActorContext,
    organizationId: string
  ): Promise<{
    mandates: RepresentationMandateRecord[];
    affiliations: OrganizationAgentAffiliationRecord[];
  }> {
    assertSameOrganizationAccess(actor, organizationId, false);
    const [mandates, affiliations] = await Promise.all([
      this.store.listMandatesByOrganization(organizationId),
      this.store.listAffiliationsByOrganization(organizationId),
    ]);
    return { mandates, affiliations };
  }
}
