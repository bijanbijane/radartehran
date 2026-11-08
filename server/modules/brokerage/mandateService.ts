/**
 * @file server/modules/brokerage/mandateService.ts
 * @description Formal Representation Mandates, Authority Verification, and Listing-Agent Assignments.
 */

import type {
  RepresentationMandateRecord,
  ListingRepresentationRelationship,
  RepresentationType,
  ScopeOfAuthority,
  MandateStatus,
} from './types';
import type { BrokerageStore } from './store';
import type {
  ListingValidationAdapter,
  BrokerageNotificationEventSink,
} from './adapters';
import { authorizeAgencyAction } from './authorization';
import {
  validateSafeId,
  validateRepresentationType,
  validateDateRange,
  sanitizeText,
  BrokerageValidationError,
} from './validation';

export interface CreateMandateInput {
  agencyId: string;
  agentUid?: string | null;
  propertyReference: string;
  clientReference: string;
  representationType: RepresentationType;
  scopeOfAuthority: ScopeOfAuthority;
  startDateIso: string;
  expirationDateIso: string;
  evidenceReferences: string[];
  issuingParty: string;
}

export interface AssignListingInput {
  listingReference: string;
  agencyId: string;
  branchId?: string | null;
  agentUid: string;
  mandateId?: string | null;
  notes?: string;
}

export class MandateService {
  constructor(
    private readonly store: BrokerageStore,
    private readonly listingAdapter: ListingValidationAdapter,
    private readonly notificationSink: BrokerageNotificationEventSink,
  ) {}

  // --- Mandate Lifecycle ---
  async createMandate(
    actorUid: string,
    input: CreateMandateInput,
    isPlatformAdmin = false,
  ): Promise<RepresentationMandateRecord> {
    validateSafeId(input.agencyId, 'agencyId');
    validateSafeId(input.propertyReference, 'propertyReference');
    validateSafeId(input.clientReference, 'clientReference');
    const repType = validateRepresentationType(input.representationType);
    const dates = validateDateRange(input.startDateIso, input.expirationDateIso);

    const agency = await this.store.getAgencyById(input.agencyId);
    if (!agency) throw new BrokerageValidationError('NOT_FOUND', `Agency ${input.agencyId} not found.`);
    if (agency.operatingStatus === 'suspended' || agency.operatingStatus === 'closed') {
      throw new BrokerageValidationError('AGENCY_SUSPENDED', `Agency is ${agency.operatingStatus}. Cannot create representation mandates.`);
    }

    const membership = await this.store.findMembershipByAgencyAndUser(input.agencyId, actorUid);
    const authDecision = authorizeAgencyAction('agency.manage_mandates', {
      principalUid: actorUid,
      isPlatformAdmin,
      agency,
      membership,
    });
    if (!authDecision.allowed) {
      throw new BrokerageValidationError('FORBIDDEN', authDecision.reason || 'Unauthorized to manage mandates.');
    }

    const mandateId = `mandate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();

    const mandate: RepresentationMandateRecord = {
      id: mandateId,
      agencyId: input.agencyId,
      agentUid: input.agentUid || null,
      propertyReference: input.propertyReference,
      clientReference: input.clientReference,
      representationType: repType,
      scopeOfAuthority: {
        canAdvertise: Boolean(input.scopeOfAuthority?.canAdvertise),
        canConductViewings: Boolean(input.scopeOfAuthority?.canConductViewings),
        canNegotiateTerms: Boolean(input.scopeOfAuthority?.canNegotiateTerms),
        canCollectDeposit: Boolean(input.scopeOfAuthority?.canCollectDeposit),
        canSignContractOnBehalf: Boolean(input.scopeOfAuthority?.canSignContractOnBehalf),
      },
      startDateIso: dates.start,
      expirationDateIso: dates.end,
      evidenceReferences: (input.evidenceReferences || []).map((e) => sanitizeText(e, 100)),
      issuingParty: sanitizeText(input.issuingParty, 120) || 'Principal Owner',
      confirmationStatus: 'pending',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      version: 1,
    };

    const saved = await this.store.saveMandate(mandate);

    await this.notificationSink.emitEvent({
      eventType: 'brokerage.mandate_submitted',
      recipientUid: input.clientReference,
      agencyId: input.agencyId,
      actorUid,
      data: { mandateId, repType, propertyReference: input.propertyReference },
      timestampIso: nowIso,
    });

    return saved;
  }

  async updateMandateStatus(
    mandateId: string,
    newStatus: MandateStatus,
    actorUid: string,
    reason?: string,
  ): Promise<RepresentationMandateRecord> {
    const mandate = await this.store.getMandateById(mandateId);
    if (!mandate) throw new BrokerageValidationError('NOT_FOUND', 'Mandate not found.');

    mandate.confirmationStatus = newStatus;
    mandate.updatedAtIso = new Date().toISOString();
    if (newStatus === 'revoked') {
      mandate.revocationReason = sanitizeText(reason, 200) || 'Revoked by authorized party.';
      mandate.revokedAtIso = new Date().toISOString();
      mandate.revokedByUid = actorUid;
    }

    const saved = await this.store.saveMandate(mandate);

    await this.notificationSink.emitEvent({
      eventType: 'brokerage.mandate_status_changed',
      recipientUid: mandate.clientReference,
      agencyId: mandate.agencyId,
      actorUid,
      data: { mandateId, newStatus, reason },
      timestampIso: new Date().toISOString(),
    });

    return saved;
  }

  /**
   * Authority Verification Contract for Bargains & Property Transactions:
   * Checks whether the agent or agency holds an active, non-expired, non-revoked mandate
   * with the specific required scope of authority.
   */
  async validateRepresentationAuthority(
    propertyReference: string,
    agencyId: string,
    requiredScope: keyof ScopeOfAuthority,
    agentUid?: string,
  ): Promise<{ authorized: boolean; reason?: string; mandateId?: string }> {
    const agency = await this.store.getAgencyById(agencyId);
    if (!agency || agency.operatingStatus !== 'active') {
      return { authorized: false, reason: 'Agency is not in active operating status.' };
    }

    const mandate = await this.store.findActiveMandateForListing(propertyReference);
    if (!mandate) {
      return { authorized: false, reason: 'No active representation mandate found for this property.' };
    }

    if (mandate.agencyId !== agencyId) {
      return { authorized: false, reason: 'Active mandate belongs to another agency.' };
    }

    if (Date.parse(mandate.expirationDateIso) <= Date.now()) {
      return { authorized: false, reason: 'Representation mandate has expired.' };
    }

    if (!mandate.scopeOfAuthority[requiredScope]) {
      return { authorized: false, reason: `Mandate does not grant '${requiredScope}' permission.` };
    }

    if (agentUid && mandate.agentUid && mandate.agentUid !== agentUid) {
      // If mandate was restricted to a specific agent, check match
      return { authorized: false, reason: 'Mandate is exclusively assigned to another agent.' };
    }

    return { authorized: true, mandateId: mandate.id };
  }

  // --- Listing Assignments ---
  async assignListingToAgent(
    actorUid: string,
    input: AssignListingInput,
    isPlatformAdmin = false,
  ): Promise<ListingRepresentationRelationship> {
    validateSafeId(input.listingReference, 'listingReference');
    validateSafeId(input.agencyId, 'agencyId');
    validateSafeId(input.agentUid, 'agentUid');

    // Cross-module verification: check listing exists in Bargains
    const listingCheck = await this.listingAdapter.checkListingExists(input.listingReference);
    if (!listingCheck.exists) {
      throw new BrokerageValidationError('LISTING_NOT_FOUND', `Listing '${input.listingReference}' not found.`);
    }

    const agency = await this.store.getAgencyById(input.agencyId);
    if (!agency || agency.operatingStatus !== 'active') {
      throw new BrokerageValidationError('AGENCY_INACTIVE', 'Cannot assign listings under inactive agency.');
    }

    const actorMembership = await this.store.findMembershipByAgencyAndUser(input.agencyId, actorUid);
    const authDecision = authorizeAgencyAction('agency.assign_listings', {
      principalUid: actorUid,
      isPlatformAdmin,
      agency,
      membership: actorMembership,
      targetBranchId: input.branchId,
    });
    if (!authDecision.allowed) {
      throw new BrokerageValidationError('FORBIDDEN', authDecision.reason || 'Unauthorized to assign listings.');
    }

    // Verify assigned agent has active membership
    const targetAgentMembership = await this.store.findMembershipByAgencyAndUser(input.agencyId, input.agentUid);
    if (!targetAgentMembership || targetAgentMembership.status !== 'active') {
      throw new BrokerageValidationError('AGENT_NOT_ACTIVE', 'Assigned agent is not an active member of this agency.');
    }

    // Deactivate previous active assignment if exists
    const existingActive = await this.store.findActiveListingAssignment(input.listingReference);
    if (existingActive) {
      existingActive.status = 'reassigned';
      existingActive.reassignedAtIso = new Date().toISOString();
      await this.store.saveListingAssignment(existingActive);
    }

    const relId = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const rel: ListingRepresentationRelationship = {
      id: relId,
      listingReference: input.listingReference,
      agencyId: input.agencyId,
      branchId: input.branchId || null,
      assignedAgentUid: input.agentUid,
      assignedByUid: actorUid,
      mandateId: input.mandateId || null,
      status: 'active',
      assignedAtIso: new Date().toISOString(),
      notes: input.notes ? sanitizeText(input.notes, 200) : undefined,
    };

    return this.store.saveListingAssignment(rel);
  }

  async getListingAssignment(listingReference: string): Promise<ListingRepresentationRelationship | null> {
    return this.store.findActiveListingAssignment(listingReference);
  }
}
