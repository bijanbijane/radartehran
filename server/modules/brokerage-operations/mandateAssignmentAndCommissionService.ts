import crypto from 'crypto';
import {
  AgentAssignmentRecord, BrokerageActorContext,
  BrokerageOpsError, CommissionAgreementRecord,
  CommissionLifecycleState, CompensationModelType,
  InternalCommissionAllocationRecord, MandateAuthorityScopeRecord,
  MandateCategory, MandateLifecycleStatus,
  NON_INFERRABLE_RESTRICTED_ACTIONS, PermittedMandateAction,
  RepresentationMandateRecord, } from './types';
import {
  assertActiveAffiliationForAssignment, assertExpectedVersion,
  assertMandateActionPermitted, assertOrgActiveForMandate,
  assertSameOrganizationAccess, requireNonEmpty,
  validateCommissionAllocations, } from './validationAndAuthz';
import { BrokerageOperationsExternalAdapters } from './adapters';
import { BrokerageOperationsStore } from './store';
export class MandateAssignmentAndCommissionService {
  constructor(
    private readonly store: BrokerageOperationsStore,
    private readonly adapters: BrokerageOperationsExternalAdapters
  ) {}
  async createRepresentationMandate(
    actor: BrokerageActorContext, input: {
      id?: string;
      clientPartyId: string;
      organizationId: string;
      assignedProfessionalProfileId?: string;
      propertyId?: string;
      mandateCategory: MandateCategory;
      serviceScopeSummary: string;
      exclusivity: 'NON_EXCLUSIVE' | 'EXCLUSIVE_AGENCY' | 'EXCLUSIVE_RIGHT_TO_REPRESENT';
      geographicOrAssetScope: string;
      effectiveStartIso: string;
      expirationDateIso: string;
      authorityLimitations?: string[];
      supportingContractEvidenceIds?: string[];
      initialStatus?: Extract<MandateLifecycleStatus, 'CLIENT_INQUIRY' | 'PROPOSED_REPRESENTATION' | 'MANDATE_DRAFT'>;
      isSyntheticTestFixture?: boolean;
    }
  ): Promise<RepresentationMandateRecord> {
    assertSameOrganizationAccess(actor, input.organizationId, false);
    const org = await this.store.getOrganizationById(input.organizationId);
    if (!org) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Organization '${input.organizationId}' not found.`, 404);
    assertOrgActiveForMandate(org);
    const now = new Date().toISOString();
    const status = input.initialStatus ?? 'MANDATE_DRAFT';
    const mandate: RepresentationMandateRecord = {
      id: input.id || `bmand_${crypto.randomBytes(6).toString('hex')}`,
      clientPartyId: requireNonEmpty(input.clientPartyId, 'clientPartyId', 150), organizationId: org.id,
      assignedProfessionalProfileId: input.assignedProfessionalProfileId, propertyId: input.propertyId,
      mandateCategory: input.mandateCategory,
      serviceScopeSummary: requireNonEmpty(input.serviceScopeSummary, 'serviceScopeSummary', 1000),
      exclusivity: input.exclusivity,
      geographicOrAssetScope: requireNonEmpty(input.geographicOrAssetScope, 'geographicOrAssetScope', 500),
      effectiveStartIso: input.effectiveStartIso, expirationDateIso: input.expirationDateIso,
      authorityLimitations: input.authorityLimitations ?? [], authorityScopes: [],
      supportingContractEvidenceIds: input.supportingContractEvidenceIds ?? [], status,
      grantsTransactionExecutionAuthority: false, version: 1,
      versionHistory: [
        {
          version: 1, changedAt: now,
          changedByUserId: actor.userId, status,
          scopeSummary: input.serviceScopeSummary, },
      ], isSyntheticTestFixture: input.isSyntheticTestFixture ?? false,
      createdAt: now, updatedAt: now,
    };
    await this.store.saveMandate(mandate);
    return mandate;
  }
  async acceptOrTerminateMandate(
    actor: BrokerageActorContext, input: {
      mandateId: string;
      targetStatus: 'ACCEPTED_BY_CLIENT' | 'VERIFIED_AGAINST_EVIDENCE' | 'TERMINATED';
      supportingContractEvidenceIds?: string[];
      expectedVersion?: number;
    }
  ): Promise<RepresentationMandateRecord> {
    const mandate = await this.store.getMandateById(input.mandateId);
    if (!mandate) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Mandate '${input.mandateId}' not found.`, 404);
    assertExpectedVersion(mandate.version, input.expectedVersion, mandate.id);
    if (input.targetStatus === 'ACCEPTED_BY_CLIENT') {
      if (actor.role !== 'CLIENT' || actor.userId !== mandate.clientPartyId) {
        throw new BrokerageOpsError(
          'CLIENT_ACCEPTANCE_REQUIRED',
          `Only the client ('${mandate.clientPartyId}') can accept mandate '${mandate.id}'.`, 403
        );
      }
    } else if (input.targetStatus === 'VERIFIED_AGAINST_EVIDENCE') {
      assertSameOrganizationAccess(actor, mandate.organizationId, true);
      if (!mandate.clientAcceptedAtIso) {
        throw new BrokerageOpsError(
          'CLIENT_ACCEPTANCE_REQUIRED', 'Cannot mark mandate VERIFIED_AGAINST_EVIDENCE before client acceptance.',
          400
        );
      }
      const mergedEv = [...mandate.supportingContractEvidenceIds, ...(input.supportingContractEvidenceIds ?? [])];
      if (mergedEv.length === 0) {
        throw new BrokerageOpsError('VALIDATION_FAILED', 'Supporting contract evidence is required.', 400);
      }
    }
    const now = new Date().toISOString();
    const nextVersion = mandate.version + 1;
    const updated: RepresentationMandateRecord = {
      ...mandate, status: input.targetStatus,
      clientAcceptedAtIso: input.targetStatus === 'ACCEPTED_BY_CLIENT' ? now : mandate.clientAcceptedAtIso,
      clientAcceptedByUserId: input.targetStatus === 'ACCEPTED_BY_CLIENT' ? actor.userId : mandate.clientAcceptedByUserId,
      supportingContractEvidenceIds: input.supportingContractEvidenceIds
        ? Array.from(new Set([...mandate.supportingContractEvidenceIds, ...input.supportingContractEvidenceIds]))
        : mandate.supportingContractEvidenceIds, version: nextVersion,
      versionHistory: [
        ...mandate.versionHistory, {
          version: nextVersion, changedAt: now,
          changedByUserId: actor.userId, status: input.targetStatus,
          scopeSummary: mandate.serviceScopeSummary, },
      ], updatedAt: now,
    };
    await this.store.saveMandate(updated);
    return updated;
  }
  async updatePermittedMandateScope(
    actor: BrokerageActorContext,
    input: { mandateId: string; serviceScopeSummary: string; expectedVersion?: number }
  ): Promise<RepresentationMandateRecord> {
    const mandate = await this.store.getMandateById(input.mandateId);
    if (!mandate) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Mandate '${input.mandateId}' not found.`, 404);
    assertSameOrganizationAccess(actor, mandate.organizationId, true);
    assertExpectedVersion(mandate.version, input.expectedVersion, mandate.id);
    const now = new Date().toISOString();
    const nextVersion = mandate.version + 1;
    const scope = requireNonEmpty(input.serviceScopeSummary, 'serviceScopeSummary', 1000);
    const updated: RepresentationMandateRecord = {
      ...mandate, serviceScopeSummary: scope,
      version: nextVersion, versionHistory: [
        ...mandate.versionHistory,
        { version: nextVersion, changedAt: now, changedByUserId: actor.userId, status: mandate.status, scopeSummary: scope },
      ], updatedAt: now,
    };
    await this.store.saveMandate(updated);
    return updated;
  }
  async recordAuthorityScope(
    actor: BrokerageActorContext, input: {
      mandateId: string;
      authorizedAction: PermittedMandateAction;
      effectiveStartIso: string;
      effectiveEndIso?: string;
      conditions?: string;
      restrictions?: string;
      supportingEvidenceIds?: string[];
      verificationStatus?: 'UNVERIFIED' | 'EXPLICITLY_VERIFIED';
    }
  ): Promise<RepresentationMandateRecord> {
    const mandate = await this.store.getMandateById(input.mandateId);
    if (!mandate) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Mandate '${input.mandateId}' not found.`, 404);
    if (NON_INFERRABLE_RESTRICTED_ACTIONS.has(input.authorizedAction)) {
      if (
        input.verificationStatus !== 'EXPLICITLY_VERIFIED' ||
        !input.supportingEvidenceIds ||
        input.supportingEvidenceIds.length === 0
      ) {
        throw new BrokerageOpsError(
          'RESTRICTED_AUTHORITY_NOT_INFERRED',
          `Restricted action '${input.authorizedAction}' cannot be added without EXPLICITLY_VERIFIED status and supporting power-of-attorney/contract evidence.`,
          403
        );
      }
    }
    const scopeRecord: MandateAuthorityScopeRecord = {
      id: `bscope_${crypto.randomBytes(6).toString('hex')}`, mandateId: mandate.id,
      authorizedAction: input.authorizedAction, grantingPartyId: mandate.clientPartyId,
      effectiveStartIso: input.effectiveStartIso, effectiveEndIso: input.effectiveEndIso,
      conditions: input.conditions, restrictions: input.restrictions,
      supportingEvidenceIds: input.supportingEvidenceIds ?? [],
      verificationStatus: input.verificationStatus ?? 'UNVERIFIED', };
    const updated: RepresentationMandateRecord = {
      ...mandate, authorityScopes: [...mandate.authorityScopes, scopeRecord],
      version: mandate.version + 1, updatedAt: new Date().toISOString(),
    };
    await this.store.saveMandate(updated);
    return updated;
  }
  async verifyMandateActionPermission(
    mandateId: string, action: PermittedMandateAction,
    asOfDateIso = new Date().toISOString()
  ): Promise<{ permitted: true }> {
    const mandate = await this.store.getMandateById(mandateId);
    if (!mandate) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Mandate '${mandateId}' not found.`, 404);
    assertMandateActionPermitted(mandate, action, asOfDateIso);
    return { permitted: true };
  }
  async createAgentAssignment(
    actor: BrokerageActorContext, input: {
      id?: string;
      organizationId: string;
      branchId?: string;
      professionalProfileId: string;
      mandateId?: string;
      transactionRef?: string;
      assignmentType: AgentAssignmentRecord['assignmentType'];
      responsibilitiesSummary: string;
      priority?: AgentAssignmentRecord['priority'];
      startDateIso: string;
      endDateIso?: string;
      supervisorProfileId?: string;
    }
  ): Promise<AgentAssignmentRecord> {
    assertSameOrganizationAccess(actor, input.organizationId, true);
    const affiliations = await this.store.listAffiliationsByProfile(input.professionalProfileId);
    const activeAff = affiliations.find(
      (a) => a.organizationId === input.organizationId && a.affiliationStatus === 'ACTIVE'
    ) ?? null;
    assertActiveAffiliationForAssignment(activeAff, input.organizationId, input.branchId);
    if (input.mandateId) {
      const mandate = await this.store.getMandateById(input.mandateId);
      if (!mandate || mandate.organizationId !== input.organizationId) {
        throw new BrokerageOpsError('OUTSIDE_MANDATE_AUTHORITY_SCOPE', 'Mandate does not belong to organization.', 403);
      }
    }
    const now = new Date().toISOString();
    const assignment: AgentAssignmentRecord = {
      id: input.id || `basg_${crypto.randomBytes(6).toString('hex')}`, organizationId: input.organizationId,
      branchId: input.branchId, professionalProfileId: input.professionalProfileId,
      mandateId: input.mandateId, transactionRef: input.transactionRef,
      assignmentType: input.assignmentType,
      responsibilitiesSummary: requireNonEmpty(input.responsibilitiesSummary, 'responsibilitiesSummary', 500),
      priority: input.priority ?? 'NORMAL', startDateIso: input.startDateIso,
      endDateIso: input.endDateIso, workloadStatus: 'ASSIGNED_PENDING',
      supervisorProfileId: input.supervisorProfileId, reassignmentHistory: [],
      version: 1, createdAt: now,
      updatedAt: now, };
    await this.store.saveAssignment(assignment);
    return assignment;
  }
  async acceptOrRejectAssignment(
    actor: BrokerageActorContext,
    input: { assignmentId: string; decision: 'ACCEPTED' | 'REJECTED' | 'COMPLETED' }
  ): Promise<AgentAssignmentRecord> {
    const asg = await this.store.getAssignmentById(input.assignmentId);
    if (!asg) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Assignment '${input.assignmentId}' not found.`, 404);
    assertSameOrganizationAccess(actor, asg.organizationId, false);
    const updated: AgentAssignmentRecord = {
      ...asg, workloadStatus: input.decision,
      version: asg.version + 1, updatedAt: new Date().toISOString(),
    };
    await this.store.saveAssignment(updated);
    return updated;
  }
  async reassignProfessional(
    actor: BrokerageActorContext,
    input: { assignmentId: string; newProfessionalProfileId: string; reason: string }
  ): Promise<AgentAssignmentRecord> {
    const asg = await this.store.getAssignmentById(input.assignmentId);
    if (!asg) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Assignment '${input.assignmentId}' not found.`, 404);
    assertSameOrganizationAccess(actor, asg.organizationId, true);
    const affiliations = await this.store.listAffiliationsByProfile(input.newProfessionalProfileId);
    const activeAff = affiliations.find(
      (a) => a.organizationId === asg.organizationId && a.affiliationStatus === 'ACTIVE'
    ) ?? null;
    assertActiveAffiliationForAssignment(activeAff, asg.organizationId, asg.branchId);
    const now = new Date().toISOString();
    const updated: AgentAssignmentRecord = {
      ...asg, professionalProfileId: input.newProfessionalProfileId,
      workloadStatus: 'ASSIGNED_PENDING', reassignmentHistory: [
        ...asg.reassignmentHistory, {
          reassignedAt: now, fromProfessionalProfileId: asg.professionalProfileId,
          toProfessionalProfileId: input.newProfessionalProfileId, reassignedByUserId: actor.userId,
          reason: requireNonEmpty(input.reason, 'reason', 500), },
      ], version: asg.version + 1,
      updatedAt: now, };
    await this.store.saveAssignment(updated);
    return updated;
  }
  async createCommissionAgreement(
    actor: BrokerageActorContext, input: {
      id?: string;
      mandateId: string;
      organizationId: string;
      professionalProfileId?: string;
      payerPartyId: string;
      beneficiaryIds: string[];
      compensationModel: CompensationModelType;
      ratePercentage?: number;
      fixedAmountRials?: number;
      applicableTransactionType: CommissionAgreementRecord['applicableTransactionType'];
      calculationBasisDescription: string;
      earningConditions: string;
      paymentDueConditions: string;
      effectiveStartIso: string;
      effectiveEndIso?: string;
      sourceAgreementEvidenceIds?: string[];
      isSyntheticTestFixture?: boolean;
    }
  ): Promise<CommissionAgreementRecord> {
    assertSameOrganizationAccess(actor, input.organizationId, true);
    const now = new Date().toISOString();
    // Always begins in PROPOSED_TERMS unless explicitly accepted
    const agreement: CommissionAgreementRecord = {
      id: input.id || `bcomm_${crypto.randomBytes(6).toString('hex')}`, mandateId: input.mandateId,
      organizationId: input.organizationId, professionalProfileId: input.professionalProfileId,
      payerPartyId: input.payerPartyId, beneficiaryIds: input.beneficiaryIds,
      compensationModel: input.compensationModel, ratePercentage: input.ratePercentage,
      fixedAmountRials: input.fixedAmountRials, currency: 'IRR',
      applicableTransactionType: input.applicableTransactionType,
      calculationBasisDescription: requireNonEmpty(input.calculationBasisDescription, 'calculationBasisDescription', 500),
      earningConditions: requireNonEmpty(input.earningConditions, 'earningConditions', 500),
      paymentDueConditions: requireNonEmpty(input.paymentDueConditions, 'paymentDueConditions', 500),
      effectiveStartIso: input.effectiveStartIso, effectiveEndIso: input.effectiveEndIso,
      sourceAgreementEvidenceIds: input.sourceAgreementEvidenceIds ?? [], lifecycleState: 'PROPOSED_TERMS',
      financialSeparation: {
        agreedAmountRials: input.fixedAmountRials, },
      allocations: [], version: 1,
      versionHistory: [
        {
          version: 1, amendedAt: now,
          amendedByUserId: actor.userId, lifecycleState: 'PROPOSED_TERMS',
          ratePercentage: input.ratePercentage, fixedAmountRials: input.fixedAmountRials,
          reason: 'Initial commission agreement proposed.', },
      ], processedByPlatform: false,
      isSyntheticTestFixture: input.isSyntheticTestFixture ?? false, createdAt: now,
      updatedAt: now, };
    await this.store.saveCommissionAgreement(agreement);
    return agreement;
  }
  async amendCommissionAgreement(
    actor: BrokerageActorContext, input: {
      commissionAgreementId: string;
      newLifecycleState?: Extract<CommissionLifecycleState, 'PROPOSED_TERMS' | 'ACCEPTED_AGREEMENT' | 'EARNED_PER_AGREEMENT' | 'INVOICED_OR_REQUESTED' | 'DISPUTED_OR_REVERSED'>;
      ratePercentage?: number;
      fixedAmountRials?: number;
      reason: string;
      expectedVersion?: number;
    }
  ): Promise<CommissionAgreementRecord> {
    const comm = await this.store.getCommissionAgreementById(input.commissionAgreementId);
    if (!comm) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Commission agreement '${input.commissionAgreementId}' not found.`, 404);
    assertSameOrganizationAccess(actor, comm.organizationId, true);
    assertExpectedVersion(comm.version, input.expectedVersion, comm.id);
    const now = new Date().toISOString();
    const nextVersion = comm.version + 1;
    const nextState = input.newLifecycleState ?? comm.lifecycleState;
    const nextRate = input.ratePercentage ?? comm.ratePercentage;
    const nextFixed = input.fixedAmountRials ?? comm.fixedAmountRials;
    // Preserves historical versions in versionHistory
    const updated: CommissionAgreementRecord = {
      ...comm, lifecycleState: nextState,
      ratePercentage: nextRate, fixedAmountRials: nextFixed,
      financialSeparation: {
        ...comm.financialSeparation, agreedAmountRials: nextFixed ?? comm.financialSeparation.agreedAmountRials,
      }, version: nextVersion,
      versionHistory: [
        ...comm.versionHistory, {
          version: nextVersion, amendedAt: now,
          amendedByUserId: actor.userId, lifecycleState: nextState,
          ratePercentage: nextRate, fixedAmountRials: nextFixed,
          reason: requireNonEmpty(input.reason, 'reason', 500), },
      ], updatedAt: now,
    };
    await this.store.saveCommissionAgreement(updated);
    return updated;
  }
  async calculateCommissionReference(
    actor: BrokerageActorContext,
    input: { commissionAgreementId: string; baseTransactionAmountRials: number }
  ): Promise<CommissionAgreementRecord> {
    const comm = await this.store.getCommissionAgreementById(input.commissionAgreementId);
    if (!comm) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Commission agreement '${input.commissionAgreementId}' not found.`, 404);
    assertSameOrganizationAccess(actor, comm.organizationId, false);
    if (comm.lifecycleState === 'PROPOSED_TERMS') {
      throw new BrokerageOpsError(
        'VALIDATION_FAILED',
        'Cannot calculate earned commission while agreement is still in PROPOSED_TERMS (not accepted).', 400
      );
    }
    let calculated = 0;
    if (comm.compensationModel === 'FIXED_FEE' || comm.compensationModel === 'CONSULTATION_FEE') {
      calculated = comm.fixedAmountRials ?? 0;
    } else if (comm.compensationModel === 'PERCENTAGE_COMMISSION') {
      calculated = Math.round((input.baseTransactionAmountRials * (comm.ratePercentage ?? 0)) / 100);
    } else {
      calculated = comm.fixedAmountRials ?? Math.round((input.baseTransactionAmountRials * (comm.ratePercentage ?? 0)) / 100);
    }
    const updated: CommissionAgreementRecord = {
      ...comm, lifecycleState: 'CALCULATED',
      financialSeparation: {
        ...comm.financialSeparation, calculatedAmountRials: calculated,
      }, version: comm.version + 1,
      updatedAt: new Date().toISOString(), };
    await this.store.saveCommissionAgreement(updated);
    return updated;
  }
  async recordInternalCommissionAllocation(
    actor: BrokerageActorContext, input: {
      commissionAgreementId: string;
      allocations: Omit<InternalCommissionAllocationRecord, 'id' | 'commissionAgreementId'>[];
    }
  ): Promise<CommissionAgreementRecord> {
    const comm = await this.store.getCommissionAgreementById(input.commissionAgreementId);
    if (!comm) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Commission agreement '${input.commissionAgreementId}' not found.`, 404);
    assertSameOrganizationAccess(actor, comm.organizationId, true);
    validateCommissionAllocations(input.allocations, comm.financialSeparation.calculatedAmountRials);
    const builtAllocations: InternalCommissionAllocationRecord[] = input.allocations.map((a) => ({
      ...a, id: `balloc_${crypto.randomBytes(6).toString('hex')}`,
      commissionAgreementId: comm.id, }));
    const updated: CommissionAgreementRecord = {
      ...comm, allocations: builtAllocations,
      version: comm.version + 1, updatedAt: new Date().toISOString(),
    };
    await this.store.saveCommissionAgreement(updated);
    return updated;
  }
  async recordCommissionPaymentStatus(
    actor: BrokerageActorContext, input: {
      commissionAgreementId: string;
      claimType: 'REPORTED_BY_PARTICIPANT' | 'AUTHORITATIVELY_CONFIRMED';
      amountRials: number;
      paymentReceiptRef: string;
    }
  ): Promise<CommissionAgreementRecord> {
    const comm = await this.store.getCommissionAgreementById(input.commissionAgreementId);
    if (!comm) throw new BrokerageOpsError('RESOURCE_NOT_FOUND', `Commission agreement '${input.commissionAgreementId}' not found.`, 404);
    assertSameOrganizationAccess(actor, comm.organizationId, true);
    if (input.claimType === 'AUTHORITATIVELY_CONFIRMED') {
      const check = await this.adapters.paymentVerification.verifyCommissionPaymentReceipt({
        commissionAgreementId: comm.id, authoritativePaymentReceiptRef: input.paymentReceiptRef,
        amountRials: input.amountRials, });
      if (!check.verifiedByPaymentSystem) {
        throw new BrokerageOpsError(
          'UNVERIFIED_PAYMENT_CONFIRMATION_REJECTED',
          'Cannot mark commission PAYMENT_CONFIRMED based solely on an unverified statement or receipt reference.',
          400
        );
      }
    }
    const updated: CommissionAgreementRecord = {
      ...comm,
      lifecycleState: input.claimType === 'AUTHORITATIVELY_CONFIRMED' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_INITIATED',
      financialSeparation: {
        ...comm.financialSeparation, reportedPaymentAmountRials:
          input.claimType === 'REPORTED_BY_PARTICIPANT'
            ? input.amountRials
            : comm.financialSeparation.reportedPaymentAmountRials, authoritativelyConfirmedPaymentAmountRials:
          input.claimType === 'AUTHORITATIVELY_CONFIRMED'
            ? input.amountRials
            : comm.financialSeparation.authoritativelyConfirmedPaymentAmountRials, authoritativePaymentReceiptRef:
          input.claimType === 'AUTHORITATIVELY_CONFIRMED'
            ? input.paymentReceiptRef
            : comm.financialSeparation.authoritativePaymentReceiptRef, },
      version: comm.version + 1, updatedAt: new Date().toISOString(),
    };
    await this.store.saveCommissionAgreement(updated);
    return updated;
  }
}
