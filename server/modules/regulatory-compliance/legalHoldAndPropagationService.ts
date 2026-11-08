import { ComplianceActorContext } from './types';
import {
  HoldCoveredEntityType,
  LegalHold,
  LegalHoldReleaseEntry,
  LegalHoldScopeDefinition,
  LegalHoldStatus,
  PlatformRecordDescriptor,
  PropagatedHoldInstruction,
} from './legalHoldTypes';
import { ComplianceDomainError, RegulatoryComplianceStore, requireCompliancePermission } from './store';

export class LegalHoldAndPropagationService {
  constructor(private readonly store: RegulatoryComplianceStore) {}

  public registerPlatformRecord(
    actor: ComplianceActorContext,
    record: PlatformRecordDescriptor,
  ): PlatformRecordDescriptor {
    requireCompliancePermission(actor, 'compliance.read', this.store);
    this.store.platformRecords.set(record.recordId, record);

    // Evaluate continuing coverage for active holds with includeNewlyCreatedRelatedRecords
    for (const hold of this.store.legalHolds.values()) {
      if (hold.status === 'ACTIVE' && hold.tenantId === record.tenantId) {
        this.propagateHoldForSingleRecord(actor, hold, record);
      }
    }
    return record;
  }

  public createLegalHold(
    actor: ComplianceActorContext,
    input: {
      title: string;
      description: string;
      legalOrPreservationBasis: string;
      jurisdictionId: string;
      issuingOrRequestingAuthority?: string | null;
      relatedCaseOrInvestigationId?: string | null;
      relatedObligationIds?: string[];
      scope: LegalHoldScopeDefinition;
      effectiveTimestamp: string;
      responsibleLegalOrComplianceOwnerId: string;
      reviewFrequencyDays: number;
      expirationConditions?: string | null;
      expirationTimestamp?: string | null;
      releaseConditions: string;
      submitForApproval?: boolean;
    },
  ): LegalHold {
    requireCompliancePermission(actor, 'compliance.legal_hold.manage', this.store);
    if (!input.title?.trim() || !input.legalOrPreservationBasis?.trim()) {
      throw new ComplianceDomainError('INVALID_LEGAL_HOLD_INPUT', 'Hold title and legal basis are required.');
    }
    if (
      input.scope.coveredEntityIds.length === 0 &&
      input.scope.coveredDataCategories.length === 0 &&
      input.scope.coveredDocumentCategories.length === 0
    ) {
      throw new ComplianceDomainError('UNSCOPED_LEGAL_HOLD', 'A legal hold must have an explicit, bounded scope.');
    }
    const now = this.store.nowIso();
    const nextReviewDate = new Date(
      new Date(input.effectiveTimestamp).getTime() + input.reviewFrequencyDays * 86400000,
    ).toISOString();

    const status: LegalHoldStatus = input.submitForApproval ? 'PENDING_APPROVAL' : 'DRAFT';
    const hold: LegalHold = {
      id: this.store.createId('lhold'),
      tenantId: actor.tenantId,
      organizationId: actor.organizationId,
      title: input.title.trim(),
      description: input.description.trim(),
      legalOrPreservationBasis: input.legalOrPreservationBasis.trim(),
      jurisdictionId: input.jurisdictionId,
      issuingOrRequestingAuthority: input.issuingOrRequestingAuthority ?? null,
      relatedCaseOrInvestigationId: input.relatedCaseOrInvestigationId ?? null,
      relatedObligationIds: input.relatedObligationIds ?? [],
      scope: input.scope,
      effectiveTimestamp: input.effectiveTimestamp,
      authorizationTimestamp: null,
      authorizedIssuerId: null,
      responsibleLegalOrComplianceOwnerId: input.responsibleLegalOrComplianceOwnerId,
      reviewFrequencyDays: input.reviewFrequencyDays,
      nextReviewDate,
      expirationConditions: input.expirationConditions ?? null,
      expirationTimestamp: input.expirationTimestamp ?? null,
      releaseConditions: input.releaseConditions,
      status,
      version: 1,
      approvalHistory: [],
      releaseHistory: [],
      createdByActorId: actor.actorId,
      createdAt: now,
      updatedAt: now,
    };

    this.store.legalHolds.set(hold.id, hold);
    this.store.recordAudit(
      actor,
      'LEGAL_HOLD_CREATED',
      'LegalHold',
      hold.id,
      { status: hold.status, jurisdictionId: hold.jurisdictionId },
      { previousState: null, newState: { status: hold.status, version: hold.version }, reason: hold.legalOrPreservationBasis },
    );
    this.store.publishEvent(
      'legal_hold.created',
      `lh_create_${hold.id}_v1`,
      actor.correlationId || hold.id,
      { holdId: hold.id, status: hold.status, version: 1 },
    );
    return hold;
  }

  public approveAndActivateLegalHold(
    actor: ComplianceActorContext,
    holdId: string,
    input: {
      authority: string;
      rationale: string;
    },
  ): { hold: LegalHold; propagatedInstructions: PropagatedHoldInstruction[] } {
    requireCompliancePermission(actor, 'compliance.legal_hold.approve', this.store);
    const hold = this.store.legalHolds.get(holdId);
    if (!hold) {
      throw new ComplianceDomainError('LEGAL_HOLD_NOT_FOUND', 'Legal hold not found.', 404);
    }
    const previousState = { status: hold.status, version: hold.version };
    const now = this.store.nowIso();
    hold.status = 'ACTIVE';
    hold.authorizationTimestamp = now;
    hold.authorizedIssuerId = actor.actorId;
    hold.updatedAt = now;
    hold.approvalHistory.push({
      approvalId: this.store.createId('lhapp'),
      action: 'APPROVED_ACTIVATION',
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      authority: input.authority,
      rationale: input.rationale,
      timestamp: now,
    });

    this.store.recordAudit(
      actor,
      'LEGAL_HOLD_APPROVED_AND_ACTIVATED',
      'LegalHold',
      hold.id,
      { authority: input.authority },
      { previousState, newState: { status: hold.status, version: hold.version }, reason: input.rationale },
    );
    this.store.publishEvent(
      'legal_hold.approved',
      `lh_approved_${hold.id}_v${hold.version}`,
      actor.correlationId || hold.id,
      { holdId: hold.id, approvedBy: actor.actorId },
    );
    this.store.publishEvent(
      'legal_hold.activated',
      `lh_activated_${hold.id}_v${hold.version}`,
      actor.correlationId || hold.id,
      { holdId: hold.id, effectiveTimestamp: hold.effectiveTimestamp },
    );

    const propagatedInstructions = this.propagateHoldScope(actor, hold.id);
    return { hold, propagatedInstructions };
  }

  public updateLegalHoldScope(
    actor: ComplianceActorContext,
    holdId: string,
    input: {
      expectedVersion: number;
      newScope: LegalHoldScopeDefinition;
      reason: string;
    },
  ): { hold: LegalHold; propagatedInstructions: PropagatedHoldInstruction[] } {
    requireCompliancePermission(actor, 'compliance.legal_hold.approve', this.store);
    const hold = this.store.legalHolds.get(holdId);
    if (!hold) {
      throw new ComplianceDomainError('LEGAL_HOLD_NOT_FOUND', 'Legal hold not found.', 404);
    }
    if (hold.version !== input.expectedVersion) {
      throw new ComplianceDomainError(
        'CONCURRENT_HOLD_MODIFICATION_CONFLICT',
        `Legal hold version mismatch: expected ${input.expectedVersion}, actual ${hold.version}.`,
        409,
      );
    }
    const previousState = { scope: hold.scope, version: hold.version };
    hold.scope = input.newScope;
    hold.version += 1;
    hold.updatedAt = this.store.nowIso();
    hold.approvalHistory.push({
      approvalId: this.store.createId('lhapp'),
      action: 'APPROVED_MODIFICATION',
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      authority: actor.actorRole,
      rationale: input.reason,
      timestamp: hold.updatedAt,
    });

    this.store.recordAudit(
      actor,
      'LEGAL_HOLD_SCOPE_UPDATED',
      'LegalHold',
      hold.id,
      { newVersion: hold.version },
      { previousState, newState: { scope: hold.scope, version: hold.version }, reason: input.reason },
    );
    this.store.publishEvent(
      'legal_hold.scope_updated',
      `lh_scope_${hold.id}_v${hold.version}`,
      actor.correlationId || hold.id,
      { holdId: hold.id, version: hold.version },
    );

    const propagatedInstructions = hold.status === 'ACTIVE' ? this.propagateHoldScope(actor, hold.id) : [];
    return { hold, propagatedInstructions };
  }

  public propagateHoldScope(
    actor: ComplianceActorContext,
    holdId: string,
  ): PropagatedHoldInstruction[] {
    const hold = this.store.legalHolds.get(holdId);
    if (!hold) {
      throw new ComplianceDomainError('LEGAL_HOLD_NOT_FOUND', 'Legal hold not found.', 404);
    }
    const createdOrExisting: PropagatedHoldInstruction[] = [];
    for (const record of this.store.platformRecords.values()) {
      if (record.tenantId !== hold.tenantId) continue;
      const instruction = this.propagateHoldForSingleRecord(actor, hold, record);
      if (instruction) {
        createdOrExisting.push(instruction);
      }
    }

    this.store.recordAudit(
      actor,
      'LEGAL_HOLD_SCOPE_PROPAGATED',
      'LegalHold',
      hold.id,
      { propagatedCount: createdOrExisting.length, holdVersion: hold.version },
      { previousState: null, newState: { propagatedCount: createdOrExisting.length }, reason: 'Bounded scope propagation' },
    );
    this.store.publishEvent(
      'legal_hold.propagation_completed',
      `lh_prop_${hold.id}_v${hold.version}_count_${createdOrExisting.length}`,
      actor.correlationId || hold.id,
      { holdId: hold.id, version: hold.version, propagatedCount: createdOrExisting.length },
    );
    return createdOrExisting;
  }

  private propagateHoldForSingleRecord(
    actor: ComplianceActorContext,
    hold: LegalHold,
    record: PlatformRecordDescriptor,
  ): PropagatedHoldInstruction | null {
    // Do not propagate directly covered primary records as child instructions unless matched via a parent propagation rule
    if (hold.scope.coveredEntityIds.includes(record.recordId)) {
      return null;
    }

    for (const rule of hold.scope.propagationRules) {
      // Do not automatically place every record associated with a user or organization on hold unless explicitly authorized
      if (
        rule.parentEntityType === 'USER_OR_ORGANIZATION' &&
        !rule.explicitUserWideHoldAuthorized
      ) {
        continue;
      }

      const parentMatched =
        (record.parentEntityId &&
          record.parentEntityType === rule.parentEntityType &&
          hold.scope.coveredEntityIds.includes(record.parentEntityId)) ||
        (rule.parentEntityType === 'USER_OR_ORGANIZATION' &&
          rule.explicitUserWideHoldAuthorized &&
          record.subjectUserOrOrgId &&
          hold.scope.coveredEntityIds.includes(record.subjectUserOrOrgId));

      if (!parentMatched) continue;
      if (!rule.childEntityTypes.includes(record.entityType)) continue;
      if (
        rule.allowedChildSourceModules.length > 0 &&
        !rule.allowedChildSourceModules.includes(record.sourceModule)
      ) {
        continue;
      }
      if (
        rule.allowedChildDataCategories.length > 0 &&
        !rule.allowedChildDataCategories.includes(record.dataCategory)
      ) {
        continue;
      }

      // Check if record was created after hold effectiveTimestamp and rule disallows continuing coverage
      if (
        new Date(record.createdAt).getTime() > new Date(hold.effectiveTimestamp).getTime() &&
        !rule.includeNewlyCreatedRelatedRecords
      ) {
        continue;
      }

      const deterministicKey = `${hold.id}::${record.recordId}::${rule.ruleId}`;
      const existing = Array.from(this.store.propagatedHoldInstructions.values()).find(
        (inst) =>
          inst.holdId === hold.id &&
          inst.targetRecordId === record.recordId &&
          inst.propagationRuleId === rule.ruleId &&
          inst.status === 'ACTIVE',
      );
      if (existing) {
        return existing;
      }

      const instruction: PropagatedHoldInstruction = {
        id: this.store.createId('lhprop'),
        holdId: hold.id,
        holdVersion: hold.version,
        parentEntityType: rule.parentEntityType,
        parentEntityId: record.parentEntityId || record.subjectUserOrOrgId || 'BOUNDED_PARENT',
        targetRecordId: record.recordId,
        targetEntityType: record.entityType,
        targetSourceModule: record.sourceModule,
        targetDataCategory: record.dataCategory,
        propagationRuleId: rule.ruleId,
        propagationRuleVersion: rule.ruleVersion,
        status: 'ACTIVE',
        propagatedAt: this.store.nowIso(),
        releasedAt: null,
      };
      this.store.propagatedHoldInstructions.set(deterministicKey, instruction);
      return instruction;
    }

    return null;
  }

  public releaseLegalHold(
    actor: ComplianceActorContext,
    holdId: string,
    input: {
      releaseReason: string;
      releasingAuthority: string;
      releaseScope: 'FULL' | 'PARTIAL';
      releasedEntityIds?: string[];
      relatedCaseOrObligationReferences: string[];
      evidenceOrSupportingDecisionReferences: string[];
    },
  ): LegalHold {
    requireCompliancePermission(actor, 'compliance.legal_hold.release', this.store);
    const hold = this.store.legalHolds.get(holdId);
    if (!hold) {
      throw new ComplianceDomainError('LEGAL_HOLD_NOT_FOUND', 'Legal hold not found.', 404);
    }
    if (!input.releaseReason?.trim() || !input.releasingAuthority?.trim()) {
      throw new ComplianceDomainError('INVALID_HOLD_RELEASE', 'Release reason and releasing authority are required.');
    }
    if (input.evidenceOrSupportingDecisionReferences.length === 0) {
      throw new ComplianceDomainError(
        'RELEASE_EVIDENCE_REQUIRED',
        'At least one supporting decision or evidence reference is required to release a legal hold.',
      );
    }

    const previousState = { status: hold.status, coveredEntityIds: [...hold.scope.coveredEntityIds] };
    const now = this.store.nowIso();
    const releaseEntry: LegalHoldReleaseEntry = {
      releaseId: this.store.createId('lhrel'),
      holdId: hold.id,
      releaseReason: input.releaseReason.trim(),
      releasingAuthority: input.releasingAuthority.trim(),
      authorizedReviewerId: actor.actorId,
      approvalTimestamp: now,
      releaseScope: input.releaseScope,
      releasedEntityIds: input.releasedEntityIds ?? [...hold.scope.coveredEntityIds],
      relatedCaseOrObligationReferences: input.relatedCaseOrObligationReferences,
      evidenceOrSupportingDecisionReferences: input.evidenceOrSupportingDecisionReferences,
    };
    hold.releaseHistory.push(releaseEntry);

    if (input.releaseScope === 'FULL') {
      hold.status = 'RELEASED';
      for (const inst of this.store.propagatedHoldInstructions.values()) {
        if (inst.holdId === hold.id && inst.status === 'ACTIVE') {
          inst.status = 'RELEASED';
          inst.releasedAt = now;
        }
      }
    } else {
      const toRemove = new Set(input.releasedEntityIds ?? []);
      hold.scope.coveredEntityIds = hold.scope.coveredEntityIds.filter((id) => !toRemove.has(id));
      for (const inst of this.store.propagatedHoldInstructions.values()) {
        if (
          inst.holdId === hold.id &&
          inst.status === 'ACTIVE' &&
          (toRemove.has(inst.targetRecordId) || toRemove.has(inst.parentEntityId))
        ) {
          inst.status = 'RELEASED';
          inst.releasedAt = now;
        }
      }
      if (hold.scope.coveredEntityIds.length === 0) {
        hold.status = 'RELEASED';
      }
    }
    hold.version += 1;
    hold.updatedAt = now;

    this.store.recordAudit(
      actor,
      'LEGAL_HOLD_RELEASED',
      'LegalHold',
      hold.id,
      { releaseScope: input.releaseScope, releasingAuthority: input.releasingAuthority },
      {
        previousState,
        newState: { status: hold.status, coveredEntityIds: [...hold.scope.coveredEntityIds] },
        reason: input.releaseReason,
      },
    );
    this.store.publishEvent(
      'legal_hold.released',
      `lh_rel_${hold.id}_${releaseEntry.releaseId}`,
      actor.correlationId || hold.id,
      {
        holdId: hold.id,
        releaseScope: input.releaseScope,
        status: hold.status,
      },
    );
    return hold;
  }

  public revokeLegalHold(
    actor: ComplianceActorContext,
    holdId: string,
    reason: string,
  ): LegalHold {
    requireCompliancePermission(actor, 'compliance.legal_hold.release', this.store);
    const hold = this.store.legalHolds.get(holdId);
    if (!hold) {
      throw new ComplianceDomainError('LEGAL_HOLD_NOT_FOUND', 'Legal hold not found.', 404);
    }
    const previousState = { status: hold.status };
    const now = this.store.nowIso();
    hold.status = 'REVOKED';
    hold.version += 1;
    hold.updatedAt = now;
    for (const inst of this.store.propagatedHoldInstructions.values()) {
      if (inst.holdId === hold.id && inst.status === 'ACTIVE') {
        inst.status = 'REVOKED';
        inst.releasedAt = now;
      }
    }
    this.store.recordAudit(
      actor,
      'LEGAL_HOLD_REVOKED',
      'LegalHold',
      hold.id,
      { reason },
      { previousState, newState: { status: 'REVOKED' }, reason },
    );
    this.store.publishEvent(
      'legal_hold.revoked',
      `lh_rev_${hold.id}_v${hold.version}`,
      actor.correlationId || hold.id,
      { holdId: hold.id, reason },
    );
    return hold;
  }
}
