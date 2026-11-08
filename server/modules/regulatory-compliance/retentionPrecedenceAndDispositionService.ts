import { ComplianceActorContext } from './types';
import {
  DispositionExecutionRecord,
  DispositionMethod,
  HoldCoveredEntityType,
  LegalHold,
  PlatformRecordDescriptor,
  PrivacyDeletionEvaluationResult,
  PrivacyDeletionRequestItemResult,
  RetentionBasisTier,
  RetentionConflictRecord,
  RetentionPolicy,
  RetentionPrecedenceDecision,
  RetentionPrecedenceDecisionOutcome,
  RetentionTriggerType,
} from './legalHoldTypes';
import { ComplianceDomainError, RegulatoryComplianceStore, requireCompliancePermission } from './store';

const DECISION_ENGINE_VERSION = 'RPE-2.1.0';

export class RetentionPrecedenceAndDispositionService {
  constructor(private readonly store: RegulatoryComplianceStore) {}

  public createOrUpdateRetentionPolicy(
    actor: ComplianceActorContext,
    input: {
      policyCode: string;
      basisTier: RetentionBasisTier;
      dataCategory: string;
      recordType: HoldCoveredEntityType;
      applicableJurisdictionId: string;
      retentionTrigger: RetentionTriggerType;
      retentionDurationDays: number;
      retentionConditionDescription: string;
      retentionEndCalculationMethod?: RetentionPolicy['retentionEndCalculationMethod'];
      sourceObligationId?: string | null;
      approvedPolicyDocumentRef?: string | null;
      responsibleOwnerRole: string;
      effectiveDate: string;
      reviewDate: string;
      dispositionMethod: DispositionMethod;
      exceptions?: string[];
      legalHoldInteractionRules?: string;
      approveImmediately?: boolean;
    },
  ): RetentionPolicy {
    requireCompliancePermission(actor, 'compliance.retention.manage', this.store);

    // Do not invent default statutory retention periods. A retention period must be traceable to an approved policy or verified obligation.
    if (!input.sourceObligationId && !input.approvedPolicyDocumentRef) {
      throw new ComplianceDomainError(
        'UNTRACEABLE_RETENTION_PERIOD',
        'Retention policy must reference a verified compliance obligation or an approved policy document reference. Default statutory periods cannot be invented.',
      );
    }
    if (input.sourceObligationId) {
      const obl = this.store.obligations.get(input.sourceObligationId);
      if (!obl || (obl.status !== 'APPROVED' && obl.status !== 'ACTIVE')) {
        throw new ComplianceDomainError(
          'UNVERIFIED_RETENTION_OBLIGATION',
          'Referenced source obligation must exist and be in APPROVED or ACTIVE state.',
        );
      }
    }
    if (input.retentionDurationDays <= 0) {
      throw new ComplianceDomainError('INVALID_RETENTION_DURATION', 'Retention duration days must be positive.');
    }

    const code = input.policyCode.trim().toUpperCase();
    const history = this.store.retentionPolicyVersions.get(code) ?? [];
    for (const prev of history) {
      if (prev.approvalStatus === 'APPROVED') {
        prev.approvalStatus = 'SUPERSEDED';
      }
    }

    const nextVersion = history.length + 1;
    const now = this.store.nowIso();
    const policy: RetentionPolicy = {
      id: this.store.createId('rpol'),
      policyCode: code,
      version: nextVersion,
      basisTier: input.basisTier,
      dataCategory: input.dataCategory,
      recordType: input.recordType,
      applicableJurisdictionId: input.applicableJurisdictionId,
      retentionTrigger: input.retentionTrigger,
      retentionDurationDays: input.retentionDurationDays,
      retentionConditionDescription: input.retentionConditionDescription,
      retentionEndCalculationMethod: input.retentionEndCalculationMethod ?? 'EXACT_DAYS_FROM_TRIGGER',
      sourceObligationId: input.sourceObligationId ?? null,
      approvedPolicyDocumentRef: input.approvedPolicyDocumentRef ?? null,
      approvalStatus: input.approveImmediately ? 'APPROVED' : 'PENDING_APPROVAL',
      responsibleOwnerRole: input.responsibleOwnerRole,
      effectiveDate: input.effectiveDate,
      reviewDate: input.reviewDate,
      dispositionMethod: input.dispositionMethod,
      exceptions: input.exceptions ?? [],
      legalHoldInteractionRules:
        input.legalHoldInteractionRules ?? 'Active legal holds always suspend disposition until formally released.',
      approvedByActorId: input.approveImmediately ? actor.actorId : null,
      createdAt: now,
      updatedAt: now,
    };

    this.store.retentionPolicies.set(policy.id, policy);
    history.push(policy);
    this.store.retentionPolicyVersions.set(code, history);

    this.store.recordAudit(
      actor,
      nextVersion === 1 ? 'RETENTION_POLICY_CREATED' : 'RETENTION_POLICY_VERSION_UPDATED',
      'RetentionPolicy',
      policy.id,
      { policyCode: policy.policyCode, version: policy.version, basisTier: policy.basisTier },
      { previousState: nextVersion > 1 ? { version: nextVersion - 1 } : null, newState: { version: policy.version, approvalStatus: policy.approvalStatus } },
    );

    const eventType = nextVersion === 1 ? 'retention.policy_activated' : 'retention.policy_updated';
    this.store.publishEvent(
      eventType,
      `rpol_${policy.policyCode}_v${policy.version}`,
      actor.correlationId || policy.id,
      { policyId: policy.id, policyCode: policy.policyCode, version: policy.version },
    );
    return policy;
  }

  public evaluateRetentionPrecedence(
    actor: ComplianceActorContext,
    input: {
      recordId: string;
      evaluationTimestampIso?: string;
      userInitiatedDeletionRequested?: boolean;
    },
  ): RetentionPrecedenceDecision {
    requireCompliancePermission(actor, 'compliance.read', this.store);
    const evalIso = input.evaluationTimestampIso ?? this.store.nowIso();
    const evalMs = new Date(evalIso).getTime();

    const record = this.store.platformRecords.get(input.recordId);

    // Section 11 Fail-Safe: Hold registry, retention evaluator, or scope resolution unavailable/incomplete
    if (
      this.store.holdRegistryUnavailable ||
      this.store.retentionEvaluatorUnavailable ||
      this.store.scopeResolutionIncomplete
    ) {
      return this.persistDecision(actor, {
        targetRecordId: input.recordId,
        targetSourceModule: record?.sourceModule ?? 'UNKNOWN',
        targetEntityType: record?.entityType ?? 'INDIVIDUAL_RECORD',
        evaluationTimestamp: evalIso,
        outcome: 'LEGAL_REVIEW_REQUIRED',
        applicableHoldIds: [],
        applicablePropagatedInstructionIds: [],
        applicableRetentionPolicyIds: [],
        applicableObligationIds: [],
        precedenceHierarchyRank: null,
        precedenceReason: 'FAIL_SAFE_DEPENDENCY_UNAVAILABLE_OR_INCOMPLETE',
        decisionExplanation:
          'Legal-hold registry, retention evaluator, or scope resolution is unavailable/incomplete. Destructive disposition is blocked.',
        authorityApprovers: [],
        mandatoryPreservationUntil: null,
        nextReviewDate: evalIso,
      });
    }

    if (!record) {
      return this.persistDecision(actor, {
        targetRecordId: input.recordId,
        targetSourceModule: 'UNKNOWN',
        targetEntityType: 'INDIVIDUAL_RECORD',
        evaluationTimestamp: evalIso,
        outcome: 'RETENTION_CONFIGURATION_MISSING',
        applicableHoldIds: [],
        applicablePropagatedInstructionIds: [],
        applicableRetentionPolicyIds: [],
        applicableObligationIds: [],
        precedenceHierarchyRank: null,
        precedenceReason: 'RECORD_DESCRIPTOR_MISSING',
        decisionExplanation:
          'Platform record descriptor is not registered; missing metadata cannot be interpreted as permission to delete.',
        authorityApprovers: [],
        mandatoryPreservationUntil: null,
        nextReviewDate: evalIso,
      });
    }

    if (!record.sourceModuleSupportsDisposition) {
      return this.persistDecision(actor, {
        targetRecordId: record.recordId,
        targetSourceModule: record.sourceModule,
        targetEntityType: record.entityType,
        evaluationTimestamp: evalIso,
        outcome: 'SOURCE_MODULE_UNAVAILABLE',
        applicableHoldIds: [],
        applicablePropagatedInstructionIds: [],
        applicableRetentionPolicyIds: [],
        applicableObligationIds: [],
        precedenceHierarchyRank: null,
        precedenceReason: 'SOURCE_MODULE_DISPOSITION_UNSUPPORTED_OR_UNAVAILABLE',
        decisionExplanation: `Source module '${record.sourceModule}' does not currently report valid disposition capability.`,
        authorityApprovers: [],
        mandatoryPreservationUntil: null,
        nextReviewDate: evalIso,
      });
    }

    // 1. Resolve direct & propagated active legal holds
    const directHolds = Array.from(this.store.legalHolds.values()).filter((h) => {
      if (h.status !== 'ACTIVE' || h.tenantId !== record.tenantId) return false;
      const entityCovered = h.scope.coveredEntityIds.includes(record.recordId);
      const userWideCovered =
        record.subjectUserOrOrgId &&
        h.scope.coveredEntityIds.includes(record.subjectUserOrOrgId) &&
        h.scope.propagationRules.some(
          (r) => r.parentEntityType === 'USER_OR_ORGANIZATION' && r.explicitUserWideHoldAuthorized,
        );
      return Boolean(entityCovered || userWideCovered);
    });

    const propagatedInstructions = Array.from(this.store.propagatedHoldInstructions.values()).filter(
      (inst) => inst.targetRecordId === record.recordId && inst.status === 'ACTIVE',
    );
    const propagatedHolds = propagatedInstructions
      .map((inst) => this.store.legalHolds.get(inst.holdId))
      .filter((h): h is LegalHold => Boolean(h && h.status === 'ACTIVE'));

    const allApplicableHolds = Array.from(
      new Map([...directHolds, ...propagatedHolds].map((h) => [h.id, h])).values(),
    );

    // 2. Resolve applicable approved retention policies
    const applicablePolicies = Array.from(this.store.retentionPolicies.values()).filter(
      (p) =>
        p.approvalStatus === 'APPROVED' &&
        p.dataCategory === record.dataCategory &&
        p.recordType === record.entityType &&
        p.applicableJurisdictionId === record.jurisdictionId,
    );

    // Check for conflicting legal instructions (e.g., hold active + conflicting mandatory legal deletion order)
    if (record.conflictingLegalDeletionInstructionId && allApplicableHolds.length > 0) {
      this.registerConflict(actor, record, allApplicableHolds.map((h) => h.id), applicablePolicies.map((p) => p.id), [
        record.conflictingLegalDeletionInstructionId,
      ]);
      return this.persistDecision(actor, {
        targetRecordId: record.recordId,
        targetSourceModule: record.sourceModule,
        targetEntityType: record.entityType,
        evaluationTimestamp: evalIso,
        outcome: 'LEGAL_REVIEW_REQUIRED',
        applicableHoldIds: allApplicableHolds.map((h) => h.id),
        applicablePropagatedInstructionIds: propagatedInstructions.map((i) => i.id),
        applicableRetentionPolicyIds: applicablePolicies.map((p) => p.id),
        applicableObligationIds: [],
        precedenceHierarchyRank: 1,
        precedenceReason: 'CONTRADICTORY_LEGAL_HOLD_AND_DELETION_ORDER',
        decisionExplanation:
          'Active legal hold conflicts with a separate legal deletion instruction. Contradictory legal instructions are never resolved by timestamp ordering; routed to mandatory legal review.',
        authorityApprovers: allApplicableHolds.map((h) => h.authorizedIssuerId || 'LEGAL_AUTHORITY'),
        mandatoryPreservationUntil: null,
        nextReviewDate: evalIso,
      });
    }

    // Precedence Rank 1: Active, valid, authorized legal holds
    if (allApplicableHolds.length > 0) {
      const nextReviewDates = allApplicableHolds.map((h) => new Date(h.nextReviewDate).getTime());
      const earliestReviewIso = new Date(Math.min(...nextReviewDates)).toISOString();
      const approvers = Array.from(
        new Set(allApplicableHolds.map((h) => h.authorizedIssuerId || h.createdByActorId)),
      );
      return this.persistDecision(actor, {
        targetRecordId: record.recordId,
        targetSourceModule: record.sourceModule,
        targetEntityType: record.entityType,
        evaluationTimestamp: evalIso,
        outcome: 'PRESERVE_LEGAL_HOLD',
        applicableHoldIds: allApplicableHolds.map((h) => h.id),
        applicablePropagatedInstructionIds: propagatedInstructions.map((i) => i.id),
        applicableRetentionPolicyIds: applicablePolicies.map((p) => p.id),
        applicableObligationIds: allApplicableHolds.flatMap((h) => h.relatedObligationIds),
        precedenceHierarchyRank: 1,
        precedenceReason: 'ACTIVE_AUTHORIZED_LEGAL_HOLD_TAKES_HIGHEST_PRECEDENCE',
        decisionExplanation: `Record is preserved under ${allApplicableHolds.length} active legal hold(s) (${allApplicableHolds.map((h) => h.id).join(', ')}).`,
        authorityApprovers: approvers,
        mandatoryPreservationUntil: null,
        nextReviewDate: earliestReviewIso,
      });
    }

    // If no retention policies exist for this record's dataCategory/recordType/jurisdiction -> fail-safe block
    if (applicablePolicies.length === 0) {
      return this.persistDecision(actor, {
        targetRecordId: record.recordId,
        targetSourceModule: record.sourceModule,
        targetEntityType: record.entityType,
        evaluationTimestamp: evalIso,
        outcome: 'RETENTION_CONFIGURATION_MISSING',
        applicableHoldIds: [],
        applicablePropagatedInstructionIds: [],
        applicableRetentionPolicyIds: [],
        applicableObligationIds: [],
        precedenceHierarchyRank: null,
        precedenceReason: 'NO_APPROVED_RETENTION_POLICY_CONFIGURED',
        decisionExplanation: `No approved retention policy covers dataCategory='${record.dataCategory}', recordType='${record.entityType}', jurisdiction='${record.jurisdictionId}'. Missing policy blocks deletion.`,
        authorityApprovers: [],
        mandatoryPreservationUntil: null,
        nextReviewDate: evalIso,
      });
    }

    // Evaluate active retention windows across all applicable policies (union / longest applicable period)
    const activeTierEvaluations: Array<{
      policy: RetentionPolicy;
      endMs: number;
      endIso: string;
      rank: 2 | 3 | 4 | 5;
      outcome: RetentionPrecedenceDecisionOutcome;
    }> = [];

    for (const pol of applicablePolicies) {
      const triggerIso = record.retentionTriggerEvents[pol.retentionTrigger] ?? record.createdAt;
      const triggerMs = new Date(triggerIso).getTime();
      const endMs = triggerMs + pol.retentionDurationDays * 86400000;
      if (endMs > evalMs) {
        const rankMap: Record<RetentionBasisTier, { rank: 2 | 3 | 4 | 5; outcome: RetentionPrecedenceDecisionOutcome }> = {
          MANDATORY_STATUTORY_OR_REGULATORY: { rank: 2, outcome: 'PRESERVE_MANDATORY_RETENTION' },
          APPROVED_CONTRACTUAL_PRESERVATION: { rank: 3, outcome: 'PRESERVE_CONTRACTUAL_OBLIGATION' },
          APPROVED_INTERNAL_RETENTION_POLICY: { rank: 4, outcome: 'PRESERVE_INTERNAL_POLICY' },
          ORDINARY_DATA_LIFECYCLE_POLICY: { rank: 5, outcome: 'PRESERVE_INTERNAL_POLICY' },
        };
        const mapped = rankMap[pol.basisTier];
        activeTierEvaluations.push({
          policy: pol,
          endMs,
          endIso: new Date(endMs).toISOString(),
          rank: mapped.rank,
          outcome: mapped.outcome,
        });
      }
    }

    if (activeTierEvaluations.length > 0) {
      // Sort by highest authority rank (lowest number), then by longest preservation period (max endMs)
      activeTierEvaluations.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : b.endMs - a.endMs));
      const winningPrecedence = activeTierEvaluations[0];
      const longestEndMs = Math.max(...activeTierEvaluations.map((e) => e.endMs));
      const longestEndIso = new Date(longestEndMs).toISOString();

      return this.persistDecision(actor, {
        targetRecordId: record.recordId,
        targetSourceModule: record.sourceModule,
        targetEntityType: record.entityType,
        evaluationTimestamp: evalIso,
        outcome: winningPrecedence.outcome,
        applicableHoldIds: [],
        applicablePropagatedInstructionIds: [],
        applicableRetentionPolicyIds: activeTierEvaluations.map((e) => e.policy.id),
        applicableObligationIds: activeTierEvaluations
          .map((e) => e.policy.sourceObligationId)
          .filter((id): id is string => Boolean(id)),
        precedenceHierarchyRank: winningPrecedence.rank,
        precedenceReason: `ACTIVE_${winningPrecedence.policy.basisTier}_UNTIL_${longestEndIso}`,
        decisionExplanation: `Record must be preserved under ${winningPrecedence.policy.policyCode} (rank ${winningPrecedence.rank}) until longest mandatory preservation date ${longestEndIso}.`,
        authorityApprovers: activeTierEvaluations.map((e) => e.policy.approvedByActorId || e.policy.responsibleOwnerRole),
        mandatoryPreservationUntil: longestEndIso,
        nextReviewDate: winningPrecedence.policy.reviewDate,
      });
    }

    // All retention periods have expired and no legal hold is active
    const requiresAnonymizationReview = applicablePolicies.some((p) => p.dispositionMethod === 'ANONYMIZE');
    const finalOutcome: RetentionPrecedenceDecisionOutcome = requiresAnonymizationReview
      ? 'ANONYMIZATION_REVIEW_REQUIRED'
      : 'ELIGIBLE_FOR_DISPOSITION';

    return this.persistDecision(actor, {
      targetRecordId: record.recordId,
      targetSourceModule: record.sourceModule,
      targetEntityType: record.entityType,
      evaluationTimestamp: evalIso,
      outcome: finalOutcome,
      applicableHoldIds: [],
      applicablePropagatedInstructionIds: [],
      applicableRetentionPolicyIds: applicablePolicies.map((p) => p.id),
      applicableObligationIds: applicablePolicies
        .map((p) => p.sourceObligationId)
        .filter((id): id is string => Boolean(id)),
      precedenceHierarchyRank: input.userInitiatedDeletionRequested ? 6 : 5,
      precedenceReason:
        finalOutcome === 'ANONYMIZATION_REVIEW_REQUIRED'
          ? 'RETENTION_EXPIRED_POLICY_REQUIRES_ANONYMIZATION'
          : 'ALL_HOLDS_AND_RETENTION_OBLIGATIONS_EXPIRED',
      decisionExplanation:
        finalOutcome === 'ANONYMIZATION_REVIEW_REQUIRED'
          ? 'All preservation periods have elapsed; governing policy requires controlled anonymization rather than raw deletion.'
          : 'No active legal hold or unexpired retention obligation applies; record is eligible for authorized disposition.',
      authorityApprovers: applicablePolicies.map((p) => p.approvedByActorId || p.responsibleOwnerRole),
      mandatoryPreservationUntil: null,
      nextReviewDate: null,
    });
  }

  public evaluatePrivacyDeletionRequest(
    actor: ComplianceActorContext,
    input: {
      privacyRequestId: string;
      subjectUserOrOrgId: string;
      requestedRecordIds: string[];
      evaluationTimestampIso?: string;
    },
  ): PrivacyDeletionEvaluationResult {
    requireCompliancePermission(actor, 'compliance.read', this.store);
    const eligibleRecordIds: string[] = [];
    const preservedRecordIds: string[] = [];
    const reviewRequiredRecordIds: string[] = [];
    const itemResults: PrivacyDeletionRequestItemResult[] = [];

    for (const recordId of input.requestedRecordIds) {
      const record = this.store.platformRecords.get(recordId);
      const decision = this.evaluateRetentionPrecedence(actor, {
        recordId,
        evaluationTimestampIso: input.evaluationTimestampIso,
        userInitiatedDeletionRequested: true,
      });

      let dispositionPermitted = false;
      let recommendedAction: PrivacyDeletionRequestItemResult['recommendedAction'] = 'PRESERVE';
      let controlledPrivacyExplanation = '';

      if (decision.outcome === 'ELIGIBLE_FOR_DISPOSITION') {
        dispositionPermitted = true;
        recommendedAction = 'DELETE';
        eligibleRecordIds.push(recordId);
        controlledPrivacyExplanation =
          'Record has no active preservation requirement and is approved for deletion fulfillment.';
      } else if (decision.outcome === 'ANONYMIZATION_REVIEW_REQUIRED') {
        dispositionPermitted = true;
        recommendedAction = 'ANONYMIZE';
        eligibleRecordIds.push(recordId);
        controlledPrivacyExplanation =
          'Record is eligible for personal data anonymization in accordance with the governing lifecycle policy.';
      } else if (
        decision.outcome === 'PRESERVE_LEGAL_HOLD' ||
        decision.outcome === 'PRESERVE_MANDATORY_RETENTION' ||
        decision.outcome === 'PRESERVE_CONTRACTUAL_OBLIGATION' ||
        decision.outcome === 'PRESERVE_INTERNAL_POLICY'
      ) {
        dispositionPermitted = false;
        recommendedAction = 'PRESERVE';
        preservedRecordIds.push(recordId);
        // Never leak confidential investigation or fraud case details in privacy response explanations
        controlledPrivacyExplanation =
          decision.outcome === 'PRESERVE_LEGAL_HOLD'
            ? 'Record is temporarily retained pursuant to a mandatory legal preservation obligation.'
            : `Record is retained pursuant to applicable regulatory or contractual recordkeeping requirements until ${decision.mandatoryPreservationUntil ?? 'the statutory expiration date'}.`;
      } else {
        dispositionPermitted = false;
        recommendedAction = 'ROUTE_TO_LEGAL_REVIEW';
        reviewRequiredRecordIds.push(recordId);
        controlledPrivacyExplanation =
          'Record requires compliance officer verification before disposition can be executed.';
      }

      itemResults.push({
        recordId,
        dataCategory: record?.dataCategory ?? 'UNKNOWN',
        sourceModule: record?.sourceModule ?? 'UNKNOWN',
        dispositionPermitted,
        recommendedAction,
        decisionOutcome: decision.outcome,
        decisionId: decision.decisionId,
        controlledPrivacyExplanation,
      });
    }

    let overallStatus: PrivacyDeletionEvaluationResult['overallStatus'] = 'PRESERVATION_REQUIRED';
    if (reviewRequiredRecordIds.length > 0) {
      overallStatus = 'REVIEW_REQUIRED';
    } else if (eligibleRecordIds.length === input.requestedRecordIds.length && eligibleRecordIds.length > 0) {
      overallStatus = 'FULL_FULFILLMENT_PERMITTED';
    } else if (eligibleRecordIds.length > 0 && preservedRecordIds.length > 0) {
      overallStatus = 'PARTIAL_FULFILLMENT_PERMITTED';
    }

    const evaluation: PrivacyDeletionEvaluationResult = {
      evaluationId: this.store.createId('pdel'),
      privacyRequestId: input.privacyRequestId,
      subjectUserOrOrgId: input.subjectUserOrOrgId,
      overallStatus,
      eligibleRecordIds,
      preservedRecordIds,
      reviewRequiredRecordIds,
      itemResults,
      evaluatedAt: input.evaluationTimestampIso ?? this.store.nowIso(),
    };

    this.store.deletionEvaluations.set(evaluation.evaluationId, evaluation);
    this.store.recordAudit(
      actor,
      'DELETION_REQUEST_EVALUATED',
      'PrivacyDeletionEvaluationResult',
      evaluation.evaluationId,
      {
        privacyRequestId: input.privacyRequestId,
        overallStatus,
        eligibleCount: eligibleRecordIds.length,
        preservedCount: preservedRecordIds.length,
      },
    );
    return evaluation;
  }

  public requestAndExecuteDisposition(
    actor: ComplianceActorContext,
    input: {
      targetRecordId: string;
      requestedAction: 'DELETE' | 'ANONYMIZE' | 'ARCHIVE';
      evaluationTimestampIso?: string;
    },
  ): DispositionExecutionRecord {
    requireCompliancePermission(actor, 'compliance.disposition.approve', this.store);

    const decision = this.evaluateRetentionPrecedence(actor, {
      recordId: input.targetRecordId,
      evaluationTimestampIso: input.evaluationTimestampIso,
    });

    const now = this.store.nowIso();
    const allowedOutcomes: RetentionPrecedenceDecisionOutcome[] =
      input.requestedAction === 'ANONYMIZE'
        ? ['ELIGIBLE_FOR_DISPOSITION', 'ANONYMIZATION_REVIEW_REQUIRED']
        : ['ELIGIBLE_FOR_DISPOSITION'];

    if (!allowedOutcomes.includes(decision.outcome)) {
      const blockedRecord: DispositionExecutionRecord = {
        id: this.store.createId('disp'),
        targetRecordId: input.targetRecordId,
        sourceModule: decision.targetSourceModule,
        requestedAction: input.requestedAction,
        status: 'BLOCKED',
        latestPrecedenceDecisionId: decision.decisionId,
        requestedByActorId: actor.actorId,
        approvedByActorId: null,
        sourceModuleExecutionRef: null,
        failureReason: `Disposition blocked by retention precedence outcome '${decision.outcome}' (${decision.precedenceReason}).`,
        reversalReason: null,
        createdAt: now,
        updatedAt: now,
      };
      this.store.dispositionExecutions.set(blockedRecord.id, blockedRecord);
      this.store.recordAudit(
        actor,
        'DISPOSITION_BLOCKED',
        'DispositionExecutionRecord',
        blockedRecord.id,
        { outcome: decision.outcome, targetRecordId: input.targetRecordId },
        { previousState: { status: 'EVALUATING' }, newState: { status: 'BLOCKED' }, reason: blockedRecord.failureReason || undefined },
      );
      this.store.publishEvent(
        'retention.disposition_blocked',
        `disp_blk_${blockedRecord.id}`,
        actor.correlationId || blockedRecord.id,
        { dispositionId: blockedRecord.id, targetRecordId: input.targetRecordId, outcome: decision.outcome },
      );
      return blockedRecord;
    }

    // Approved -> execute via source module adapter
    this.store.publishEvent(
      'retention.disposition_approved',
      `disp_app_${input.targetRecordId}_${decision.decisionId}`,
      actor.correlationId || decision.decisionId,
      { targetRecordId: input.targetRecordId, decisionId: decision.decisionId },
    );

    if (this.store.simulatedSourceDispositionFailure) {
      const failedRecord: DispositionExecutionRecord = {
        id: this.store.createId('disp'),
        targetRecordId: input.targetRecordId,
        sourceModule: decision.targetSourceModule,
        requestedAction: input.requestedAction,
        status: 'FAILED',
        latestPrecedenceDecisionId: decision.decisionId,
        requestedByActorId: actor.actorId,
        approvedByActorId: actor.actorId,
        sourceModuleExecutionRef: null,
        failureReason: 'Source module reported disposition execution error; never represented as COMPLETED.',
        reversalReason: null,
        createdAt: now,
        updatedAt: now,
      };
      this.store.dispositionExecutions.set(failedRecord.id, failedRecord);
      this.store.recordAudit(
        actor,
        'DISPOSITION_EXECUTION_FAILED',
        'DispositionExecutionRecord',
        failedRecord.id,
        { targetRecordId: input.targetRecordId },
        { previousState: { status: 'EXECUTING' }, newState: { status: 'FAILED' }, reason: failedRecord.failureReason || undefined },
      );
      return failedRecord;
    }

    const completedRecord: DispositionExecutionRecord = {
      id: this.store.createId('disp'),
      targetRecordId: input.targetRecordId,
      sourceModule: decision.targetSourceModule,
      requestedAction: input.requestedAction,
      status: 'COMPLETED',
      latestPrecedenceDecisionId: decision.decisionId,
      requestedByActorId: actor.actorId,
      approvedByActorId: actor.actorId,
      sourceModuleExecutionRef: `src_disp_${decision.targetSourceModule}_${input.targetRecordId}`,
      failureReason: null,
      reversalReason: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.dispositionExecutions.set(completedRecord.id, completedRecord);
    this.store.recordAudit(
      actor,
      'DISPOSITION_EXECUTION_COMPLETED',
      'DispositionExecutionRecord',
      completedRecord.id,
      { targetRecordId: input.targetRecordId, sourceModuleExecutionRef: completedRecord.sourceModuleExecutionRef },
      { previousState: { status: 'APPROVED' }, newState: { status: 'COMPLETED' }, reason: 'Authorized disposition completed' },
    );
    this.store.publishEvent(
      'retention.disposition_completed',
      `disp_done_${completedRecord.id}`,
      actor.correlationId || completedRecord.id,
      { dispositionId: completedRecord.id, targetRecordId: input.targetRecordId },
    );
    return completedRecord;
  }

  private registerConflict(
    actor: ComplianceActorContext,
    record: PlatformRecordDescriptor,
    holdIds: string[],
    policyIds: string[],
    instructionRefs: string[],
  ): RetentionConflictRecord {
    const now = this.store.nowIso();
    const caseId = this.store.createId('ccase');
    this.store.caseReferences.set(caseId, {
      id: caseId,
      externalCaseId: `EMP66-CONFLICT-${record.recordId}`,
      caseCategory: 'LEGAL_HOLD_CONFLICT',
      status: 'OPEN',
      linkedObligationIds: [],
      linkedEntityType: record.entityType,
      linkedEntityId: record.recordId,
      assignedReviewerRole: 'LEGAL_COUNSEL',
      slaDueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      createdAt: now,
      updatedAt: now,
    });

    const conflict: RetentionConflictRecord = {
      id: this.store.createId('rconf'),
      targetRecordId: record.recordId,
      conflictType: 'HOLD_VS_MANDATORY_DELETION_ORDER',
      conflictingHoldIds: holdIds,
      conflictingPolicyIds: policyIds,
      conflictingInstructionRefs: instructionRefs,
      linkedComplianceCaseId: caseId,
      status: 'OPEN_LEGAL_REVIEW_REQUIRED',
      resolutionNotes: null,
      resolvedByActorId: null,
      detectedAt: now,
      resolvedAt: null,
    };
    this.store.retentionConflicts.set(conflict.id, conflict);
    this.store.recordAudit(actor, 'RETENTION_CONFLICT_DETECTED', 'RetentionConflictRecord', conflict.id, {
      targetRecordId: record.recordId,
      conflictingHoldIds: holdIds,
      conflictingInstructionRefs: instructionRefs,
    });
    this.store.publishEvent(
      'retention.conflict_detected',
      `rconf_${conflict.id}`,
      actor.correlationId || conflict.id,
      { conflictId: conflict.id, targetRecordId: record.recordId, linkedComplianceCaseId: caseId },
    );
    return conflict;
  }

  private persistDecision(
    actor: ComplianceActorContext,
    data: Omit<RetentionPrecedenceDecision, 'decisionId' | 'decisionEngineVersion'>,
  ): RetentionPrecedenceDecision {
    const decision: RetentionPrecedenceDecision = {
      decisionId: this.store.createId('rdec'),
      ...data,
      decisionEngineVersion: DECISION_ENGINE_VERSION,
    };
    this.store.precedenceDecisions.set(decision.decisionId, decision);
    this.store.recordAudit(
      actor,
      'RETENTION_PRECEDENCE_EVALUATED',
      'RetentionPrecedenceDecision',
      decision.decisionId,
      {
        targetRecordId: decision.targetRecordId,
        outcome: decision.outcome,
        precedenceHierarchyRank: decision.precedenceHierarchyRank,
      },
      { previousState: null, newState: { outcome: decision.outcome }, reason: decision.precedenceReason },
    );
    this.store.publishEvent(
      'retention.evaluation_completed',
      `reval_${decision.decisionId}`,
      actor.correlationId || decision.decisionId,
      {
        decisionId: decision.decisionId,
        targetRecordId: decision.targetRecordId,
        outcome: decision.outcome,
      },
    );
    return decision;
  }
}
