import {
  ComplianceActorContext,
  ComplianceCaseReference,
  ComplianceIncident,
  CorrectiveAction,
  CorrectiveActionStatus,
  ObligationSeverity,
  OperationGateStatus,
  ProcessingActivityReference,
  RegulatoryChange,
} from './types';
import { ComplianceDomainError, RegulatoryComplianceStore, requireCompliancePermission } from './store';

export class CaseChangeIncidentAndRemediationService {
  constructor(private readonly store: RegulatoryComplianceStore) {}

  public openComplianceCaseReference(
    actor: ComplianceActorContext,
    input: {
      externalCaseId: string;
      caseCategory: ComplianceCaseReference['caseCategory'];
      linkedObligationIds: string[];
      linkedEntityType: string;
      linkedEntityId: string;
      assignedReviewerRole: string;
      slaDueAt: string;
    },
  ): ComplianceCaseReference {
    requireCompliancePermission(actor, 'compliance.obligation.manage', this.store);
    const now = this.store.nowIso();
    const caseRef: ComplianceCaseReference = {
      id: this.store.createId('ccase'),
      externalCaseId: input.externalCaseId,
      caseCategory: input.caseCategory,
      status: 'OPEN',
      linkedObligationIds: input.linkedObligationIds,
      linkedEntityType: input.linkedEntityType,
      linkedEntityId: input.linkedEntityId,
      assignedReviewerRole: input.assignedReviewerRole,
      slaDueAt: input.slaDueAt,
      createdAt: now,
      updatedAt: now,
    };
    this.store.caseReferences.set(caseRef.id, caseRef);
    this.store.recordAudit(actor, 'COMPLIANCE_CASE_LINKED', 'ComplianceCaseReference', caseRef.id, {
      externalCaseId: caseRef.externalCaseId,
      caseCategory: caseRef.caseCategory,
    });
    return caseRef;
  }

  public registerRegulatoryChange(
    actor: ComplianceActorContext,
    input: {
      regulatorySourceId: string;
      title: string;
      changeSummary: string;
      impactedJurisdictionIds: string[];
      impactedObligationIds: string[];
      impactedModules: string[];
      aiGeneratedCandidate: boolean;
      effectiveDate: string;
    },
  ): RegulatoryChange {
    requireCompliancePermission(actor, 'compliance.source.manage', this.store);
    const now = this.store.nowIso();
    const change: RegulatoryChange = {
      id: this.store.createId('rchg'),
      regulatorySourceId: input.regulatorySourceId,
      title: input.title.trim(),
      changeSummary: input.changeSummary.trim(),
      impactedJurisdictionIds: input.impactedJurisdictionIds,
      impactedObligationIds: input.impactedObligationIds,
      impactedModules: input.impactedModules,
      aiGeneratedCandidate: input.aiGeneratedCandidate,
      candidateVerificationStatus: input.aiGeneratedCandidate ? 'UNVERIFIED_CANDIDATE' : 'HUMAN_VERIFIED',
      status: input.aiGeneratedCandidate ? 'REVIEW_REQUIRED' : 'IMPACT_ANALYSIS',
      reviewedByActorId: null,
      effectiveDate: input.effectiveDate,
      createdAt: now,
      updatedAt: now,
    };
    this.store.regulatoryChanges.set(change.id, change);
    this.store.recordAudit(actor, 'REGULATORY_CHANGE_DETECTED', 'RegulatoryChange', change.id, {
      aiGeneratedCandidate: change.aiGeneratedCandidate,
      candidateVerificationStatus: change.candidateVerificationStatus,
    });
    this.store.publishEvent(
      'compliance.regulatory_change.detected',
      `rchg_${change.id}`,
      actor.correlationId || change.id,
      { regulatoryChangeId: change.id, aiGeneratedCandidate: change.aiGeneratedCandidate },
    );
    return change;
  }

  public approveRegulatoryChange(
    actor: ComplianceActorContext,
    changeId: string,
    humanVerifiedSummary: string,
  ): RegulatoryChange {
    requireCompliancePermission(actor, 'compliance.obligation.approve', this.store);
    const change = this.store.regulatoryChanges.get(changeId);
    if (!change) {
      throw new ComplianceDomainError('REGULATORY_CHANGE_NOT_FOUND', 'Regulatory change not found.', 404);
    }
    if (!humanVerifiedSummary?.trim()) {
      throw new ComplianceDomainError(
        'HUMAN_REVIEW_REQUIRED',
        'Human reviewer confirmation notes are required before approving a regulatory change or AI candidate.',
      );
    }
    change.candidateVerificationStatus = 'HUMAN_VERIFIED';
    change.status = 'APPROVED';
    change.reviewedByActorId = actor.actorId;
    change.changeSummary = humanVerifiedSummary.trim();
    change.updatedAt = this.store.nowIso();
    this.store.recordAudit(actor, 'REGULATORY_CHANGE_APPROVED', 'RegulatoryChange', change.id, {
      reviewedByActorId: actor.actorId,
    });
    return change;
  }

  public reportComplianceIncident(
    actor: ComplianceActorContext,
    input: {
      title: string;
      category: ComplianceIncident['category'];
      severity: ObligationSeverity;
      affectedModules: string[];
      affectedJurisdictionIds: string[];
      linkedObligationIds: string[];
      containmentActions: string[];
      evidenceReferenceIds: string[];
    },
  ): ComplianceIncident {
    requireCompliancePermission(actor, 'compliance.incident.manage', this.store);
    const now = this.store.nowIso();
    const incident: ComplianceIncident = {
      id: this.store.createId('cinc'),
      tenantId: actor.tenantId,
      organizationId: actor.organizationId,
      title: input.title.trim(),
      category: input.category,
      severity: input.severity,
      affectedModules: input.affectedModules,
      affectedJurisdictionIds: input.affectedJurisdictionIds,
      linkedObligationIds: input.linkedObligationIds,
      containmentActions: input.containmentActions,
      evidenceReferenceIds: input.evidenceReferenceIds,
      // Never automatically declare a legally reportable breach or auto-notify external regulators
      legalReportabilityStatus: 'REQUIRES_HUMAN_LEGAL_DETERMINATION',
      externalRegulatorNotificationSent: false,
      status: 'REPORTED',
      reportedByActorId: actor.actorId,
      legalReviewerActorId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.incidents.set(incident.id, incident);
    this.store.recordAudit(actor, 'COMPLIANCE_INCIDENT_OPENED', 'ComplianceIncident', incident.id, {
      category: incident.category,
      severity: incident.severity,
    });
    this.store.publishEvent(
      'compliance.incident.opened',
      `cinc_open_${incident.id}`,
      actor.correlationId || incident.id,
      { incidentId: incident.id, severity: incident.severity },
    );
    return incident;
  }

  public createCorrectiveAction(
    actor: ComplianceActorContext,
    input: {
      title: string;
      rootCauseCategory: string;
      remediationPlan: string;
      linkedAssessmentId?: string | null;
      linkedIncidentId?: string | null;
      linkedObligationId: string;
      ownerActorId: string;
      dueDate: string;
    },
  ): CorrectiveAction {
    requireCompliancePermission(actor, 'compliance.remediation.manage', this.store);
    const now = this.store.nowIso();
    const action: CorrectiveAction = {
      id: this.store.createId('ccapa'),
      tenantId: actor.tenantId,
      organizationId: actor.organizationId,
      title: input.title.trim(),
      rootCauseCategory: input.rootCauseCategory,
      remediationPlan: input.remediationPlan,
      linkedAssessmentId: input.linkedAssessmentId ?? null,
      linkedIncidentId: input.linkedIncidentId ?? null,
      linkedObligationId: input.linkedObligationId,
      ownerActorId: input.ownerActorId,
      dueDate: input.dueDate,
      status: 'OPEN',
      validationEvidenceIds: [],
      verifiedByActorId: null,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.correctiveActions.set(action.id, action);
    this.store.recordAudit(actor, 'CORRECTIVE_ACTION_CREATED', 'CorrectiveAction', action.id, {
      linkedObligationId: action.linkedObligationId,
    });
    return action;
  }

  public transitionCorrectiveAction(
    actor: ComplianceActorContext,
    actionId: string,
    targetStatus: CorrectiveActionStatus,
    validationEvidenceIds: string[] = [],
  ): CorrectiveAction {
    requireCompliancePermission(actor, 'compliance.remediation.manage', this.store);
    const action = this.store.correctiveActions.get(actionId);
    if (!action) {
      throw new ComplianceDomainError('CORRECTIVE_ACTION_NOT_FOUND', 'Corrective action not found.', 404);
    }
    if (targetStatus === 'COMPLETED') {
      const mergedEvidence = [...new Set([...action.validationEvidenceIds, ...validationEvidenceIds])];
      if (mergedEvidence.length === 0) {
        throw new ComplianceDomainError(
          'REMEDIATION_VALIDATION_EVIDENCE_REQUIRED',
          'A corrective action cannot be marked COMPLETED without validation evidence.',
        );
      }
      action.validationEvidenceIds = mergedEvidence;
      action.verifiedByActorId = actor.actorId;
      action.verifiedAt = this.store.nowIso();
      this.store.publishEvent(
        'compliance.remediation.completed',
        `capa_done_${action.id}`,
        actor.correlationId || action.id,
        { correctiveActionId: action.id, obligationId: action.linkedObligationId },
      );
    }
    action.status = targetStatus;
    action.updatedAt = this.store.nowIso();
    this.store.recordAudit(actor, 'CORRECTIVE_ACTION_TRANSITIONED', 'CorrectiveAction', action.id, {
      targetStatus,
      validationEvidenceCount: action.validationEvidenceIds.length,
    });
    return action;
  }

  public registerProcessingActivity(
    actor: ComplianceActorContext,
    input: {
      activityName: string;
      purpose: string;
      dataCategories: string[];
      lawfulBasisOrRequirement: string;
      linkedObligationIds: string[];
      retentionRuleCode: string;
      crossModuleSystems: string[];
    },
  ): ProcessingActivityReference {
    requireCompliancePermission(actor, 'compliance.policy.manage', this.store);
    const activity: ProcessingActivityReference = {
      id: this.store.createId('proc'),
      activityName: input.activityName,
      purpose: input.purpose,
      dataCategories: input.dataCategories,
      lawfulBasisOrRequirement: input.lawfulBasisOrRequirement,
      linkedObligationIds: input.linkedObligationIds,
      retentionRuleCode: input.retentionRuleCode,
      crossModuleSystems: input.crossModuleSystems,
      active: true,
      createdAt: this.store.nowIso(),
    };
    this.store.processingActivities.set(activity.id, activity);
    this.store.recordAudit(actor, 'PROCESSING_ACTIVITY_REGISTERED', 'ProcessingActivityReference', activity.id, {
      activityName: activity.activityName,
    });
    return activity;
  }

  public evaluateOperationalComplianceGate(
    actor: ComplianceActorContext,
    input: {
      operationType: 'LISTING_PUBLICATION' | 'BROKER_REPRESENTATION' | 'TRANSACTION_PROGRESSION' | 'CRAWLER_SOURCE_ENABLEMENT' | 'FINANCIAL_PAYOUT';
      targetEntityId: string;
      requiredObligationIds: string[];
    },
  ): {
    gateStatus: OperationGateStatus;
    blockingObligationIds: string[];
    explanation: string;
  } {
    requireCompliancePermission(actor, 'compliance.read', this.store);
    if (this.store.upstreamUnavailable) {
      return {
        gateStatus: 'SERVICE_UNAVAILABLE',
        blockingObligationIds: input.requiredObligationIds,
        explanation: 'Compliance verification dependency is unavailable; critical operation cannot silently proceed.',
      };
    }
    if (input.requiredObligationIds.length === 0) {
      return {
        gateStatus: 'NOT_APPLICABLE',
        blockingObligationIds: [],
        explanation: 'No mandatory obligations registered for this operation context.',
      };
    }
    const blocking: string[] = [];
    let needsReview = false;
    for (const oblId of input.requiredObligationIds) {
      const assessments = Array.from(this.store.assessments.values()).filter(
        (a) => a.obligationId === oblId && a.targetEntityId === input.targetEntityId,
      );
      const latest = assessments[assessments.length - 1];
      if (!latest) {
        blocking.push(oblId);
      } else if (
        latest.determinationState === 'NON_COMPLIANT' ||
        latest.determinationState === 'EXPIRED' ||
        latest.determinationState === 'PENDING_EVIDENCE'
      ) {
        blocking.push(oblId);
      } else if (
        latest.determinationState === 'PENDING_REVIEW' ||
        latest.determinationState === 'UNABLE_TO_DETERMINE'
      ) {
        needsReview = true;
      }
    }

    if (blocking.length > 0) {
      return {
        gateStatus: 'BLOCKED',
        blockingObligationIds: blocking,
        explanation: `Operation '${input.operationType}' blocked by ${blocking.length} non-compliant or expired obligation(s).`,
      };
    }
    if (needsReview) {
      return {
        gateStatus: 'REVIEW_REQUIRED',
        blockingObligationIds: [],
        explanation: `Operation '${input.operationType}' requires human compliance review before proceeding.`,
      };
    }
    return {
      gateStatus: 'ALLOWED',
      blockingObligationIds: [],
      explanation: `All required compliance obligations satisfied for '${input.operationType}'.`,
    };
  }
}
