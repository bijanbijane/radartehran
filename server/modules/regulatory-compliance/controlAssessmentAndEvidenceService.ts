import {
  ComplianceActorContext,
  ComplianceAssessment,
  ComplianceControl,
  ComplianceDeterminationState,
  ComplianceEvidenceReference,
  ComplianceException,
  ComplianceFinding,
  ControlExecution,
  ControlImplementationStatus,
  ControlType,
  ControlVersion,
  ObligationControlMapping,
} from './types';
import { ComplianceDomainError, RegulatoryComplianceStore, requireCompliancePermission } from './store';

export class ControlAssessmentAndEvidenceService {
  constructor(private readonly store: RegulatoryComplianceStore) {}

  public registerControl(
    actor: ComplianceActorContext,
    input: {
      code: string;
      title: string;
      description: string;
      controlType: ControlType;
      ownerRole: string;
      targetModule: string;
      targetServiceFunctionality: string;
      executionFrequencyDays: number;
      expectedEvidenceTypes: string[];
      passFailReviewCriteria: string;
      failureEscalationPolicy: string;
      implementationStatus: ControlImplementationStatus;
      functionalBindingVerified: boolean;
    },
  ): ComplianceControl {
    requireCompliancePermission(actor, 'compliance.control.manage', this.store);
    if (input.implementationStatus === 'IMPLEMENTED_AND_VERIFIED' && !input.functionalBindingVerified) {
      throw new ComplianceDomainError(
        'UNVERIFIED_CONTROL_IMPLEMENTATION',
        'A control cannot be marked IMPLEMENTED_AND_VERIFIED merely because a configuration record exists without verified functional binding.',
      );
    }
    const now = this.store.nowIso();
    const control: ComplianceControl = {
      id: this.store.createId('ctrl'),
      code: input.code.trim().toUpperCase(),
      title: input.title.trim(),
      description: input.description.trim(),
      controlType: input.controlType,
      ownerRole: input.ownerRole,
      targetModule: input.targetModule,
      targetServiceFunctionality: input.targetServiceFunctionality,
      executionFrequencyDays: input.executionFrequencyDays,
      expectedEvidenceTypes: input.expectedEvidenceTypes,
      passFailReviewCriteria: input.passFailReviewCriteria,
      failureEscalationPolicy: input.failureEscalationPolicy,
      implementationStatus: input.implementationStatus,
      functionalBindingVerified: input.functionalBindingVerified,
      currentVersionNumber: 1,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.store.controls.set(control.id, control);
    const version: ControlVersion = {
      id: this.store.createId('ctrlv'),
      controlId: control.id,
      versionNumber: 1,
      title: control.title,
      description: control.description,
      controlType: control.controlType,
      targetModule: control.targetModule,
      targetServiceFunctionality: control.targetServiceFunctionality,
      passFailReviewCriteria: control.passFailReviewCriteria,
      implementationStatus: control.implementationStatus,
      recordedByActorId: actor.actorId,
      recordedAt: now,
    };
    this.store.controlVersions.set(control.id, [version]);
    this.store.recordAudit(actor, 'CONTROL_REGISTERED', 'ComplianceControl', control.id, {
      code: control.code,
      implementationStatus: control.implementationStatus,
    });
    this.store.publishEvent(
      'compliance.control.updated',
      `ctrl_create_${control.id}_v1`,
      actor.correlationId || control.id,
      { controlId: control.id, implementationStatus: control.implementationStatus },
    );
    return control;
  }

  public mapObligationToControl(
    actor: ComplianceActorContext,
    obligationId: string,
    controlId: string,
    mappingWeight: 'PRIMARY' | 'SUPPORTING' = 'PRIMARY',
  ): ObligationControlMapping {
    requireCompliancePermission(actor, 'compliance.control.manage', this.store);
    const obligation = this.store.obligations.get(obligationId);
    const control = this.store.controls.get(controlId);
    if (!obligation || !control) {
      throw new ComplianceDomainError('MAPPING_TARGET_NOT_FOUND', 'Obligation or control not found.', 404);
    }
    const mapping: ObligationControlMapping = {
      id: this.store.createId('ocmap'),
      obligationId,
      obligationVersionNumber: obligation.currentVersionNumber,
      controlId,
      controlVersionNumber: control.currentVersionNumber,
      mappingWeight,
      createdByActorId: actor.actorId,
      createdAt: this.store.nowIso(),
    };
    this.store.mappings.set(mapping.id, mapping);
    this.store.recordAudit(actor, 'OBLIGATION_CONTROL_MAPPED', 'ObligationControlMapping', mapping.id, {
      obligationId,
      controlId,
    });
    return mapping;
  }

  public submitEvidenceReference(
    actor: ComplianceActorContext,
    input: {
      evidenceType: string;
      sourceModule: string;
      sourceRecordId: string;
      documentReferenceId?: string | null;
      obligationIds: string[];
      controlIds: string[];
      validFrom: string;
      validUntil: string;
      freshnessWindowDays: number;
      immutableDigest: string;
      restrictedAccess?: boolean;
      summary: string;
    },
  ): ComplianceEvidenceReference {
    requireCompliancePermission(actor, 'compliance.evidence.submit', this.store);
    const now = this.store.nowIso();
    const isAlreadyExpired = new Date(input.validUntil).getTime() <= Date.now();
    const evidence: ComplianceEvidenceReference = {
      id: this.store.createId('cevd'),
      tenantId: actor.tenantId,
      organizationId: actor.organizationId,
      evidenceType: input.evidenceType,
      sourceModule: input.sourceModule,
      sourceRecordId: input.sourceRecordId,
      documentReferenceId: input.documentReferenceId ?? null,
      obligationIds: input.obligationIds,
      controlIds: input.controlIds,
      collectedAt: now,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      freshnessWindowDays: input.freshnessWindowDays,
      verificationStatus: isAlreadyExpired ? 'EXPIRED' : 'UNVERIFIED',
      verifiedByActorId: null,
      verifiedAt: null,
      immutableDigest: input.immutableDigest,
      restrictedAccess: Boolean(input.restrictedAccess),
      summary: input.summary,
    };
    this.store.evidenceReferences.set(evidence.id, evidence);
    this.store.recordAudit(actor, 'EVIDENCE_SUBMITTED', 'ComplianceEvidenceReference', evidence.id, {
      sourceModule: evidence.sourceModule,
      sourceRecordId: evidence.sourceRecordId,
    });
    return evidence;
  }

  public verifyEvidenceReference(
    actor: ComplianceActorContext,
    evidenceId: string,
    decision: 'VERIFIED' | 'REJECTED',
  ): ComplianceEvidenceReference {
    requireCompliancePermission(actor, 'compliance.evidence.verify', this.store);
    const evidence = this.store.evidenceReferences.get(evidenceId);
    if (!evidence) {
      throw new ComplianceDomainError('EVIDENCE_NOT_FOUND', 'Compliance evidence reference not found.', 404);
    }
    if (new Date(evidence.validUntil).getTime() <= Date.now()) {
      evidence.verificationStatus = 'EXPIRED';
      throw new ComplianceDomainError('EVIDENCE_EXPIRED', 'Cannot verify expired evidence reference.');
    }
    evidence.verificationStatus = decision;
    evidence.verifiedByActorId = actor.actorId;
    evidence.verifiedAt = this.store.nowIso();
    this.store.recordAudit(actor, 'EVIDENCE_VERIFIED', 'ComplianceEvidenceReference', evidence.id, { decision });
    return evidence;
  }

  public recordControlExecution(
    actor: ComplianceActorContext,
    input: {
      controlId: string;
      targetEntityType: string;
      targetEntityId: string;
      executionMode: 'AUTOMATED' | 'MANUAL' | 'HYBRID';
      outcome: 'PASSED' | 'FAILED' | 'NEEDS_REVIEW' | 'ERROR';
      evidenceReferenceIds: string[];
      findingsSummary: string;
    },
  ): ControlExecution {
    requireCompliancePermission(actor, 'compliance.control.execute', this.store);
    const control = this.store.controls.get(input.controlId);
    if (!control) {
      throw new ComplianceDomainError('CONTROL_NOT_FOUND', 'Compliance control not found.', 404);
    }
    const execution: ControlExecution = {
      id: this.store.createId('cexec'),
      controlId: control.id,
      controlVersionNumber: control.currentVersionNumber,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      executedByActorId: actor.actorId,
      executionMode: input.executionMode,
      outcome: input.outcome,
      evidenceReferenceIds: input.evidenceReferenceIds,
      findingsSummary: input.findingsSummary,
      executedAt: this.store.nowIso(),
    };
    this.store.controlExecutions.set(execution.id, execution);
    this.store.recordAudit(actor, 'CONTROL_EXECUTION_RECORDED', 'ControlExecution', execution.id, {
      controlId: control.id,
      outcome: execution.outcome,
    });
    return execution;
  }

  public requestException(
    actor: ComplianceActorContext,
    input: {
      affectedObligationId: string;
      affectedControlId?: string | null;
      scopeEntityType: string;
      scopeEntityId: string;
      businessJustification: string;
      riskAssessment: string;
      compensatingControls: string[];
      effectiveStartDate: string;
      expirationDate: string;
    },
  ): ComplianceException {
    requireCompliancePermission(actor, 'compliance.exception.request', this.store);
    if (!this.store.obligations.has(input.affectedObligationId)) {
      throw new ComplianceDomainError('OBLIGATION_NOT_FOUND', 'Affected obligation not found.', 404);
    }
    const now = this.store.nowIso();
    const exception: ComplianceException = {
      id: this.store.createId('cexc'),
      tenantId: actor.tenantId,
      organizationId: actor.organizationId,
      affectedObligationId: input.affectedObligationId,
      affectedControlId: input.affectedControlId ?? null,
      scopeEntityType: input.scopeEntityType,
      scopeEntityId: input.scopeEntityId,
      businessJustification: input.businessJustification,
      riskAssessment: input.riskAssessment,
      compensatingControls: input.compensatingControls,
      requestedByActorId: actor.actorId,
      reviewedByActorId: null,
      approvedByActorId: null,
      effectiveStartDate: input.effectiveStartDate,
      expirationDate: input.expirationDate,
      status: 'REQUESTED',
      reviewNotes: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.exceptions.set(exception.id, exception);
    this.store.recordAudit(actor, 'EXCEPTION_REQUESTED', 'ComplianceException', exception.id, {
      affectedObligationId: exception.affectedObligationId,
    });
    return exception;
  }

  public decideException(
    actor: ComplianceActorContext,
    exceptionId: string,
    decision: 'APPROVED' | 'REJECTED',
    reviewNotes: string,
  ): ComplianceException {
    requireCompliancePermission(actor, 'compliance.exception.approve', this.store);
    const exception = this.store.exceptions.get(exceptionId);
    if (!exception) {
      throw new ComplianceDomainError('EXCEPTION_NOT_FOUND', 'Compliance exception not found.', 404);
    }
    if (exception.requestedByActorId === actor.actorId) {
      throw new ComplianceDomainError(
        'SEPARATION_OF_DUTIES_VIOLATION',
        'Requester cannot self-approve their own compliance exception.',
        403,
      );
    }
    exception.status = decision;
    exception.reviewedByActorId = actor.actorId;
    exception.approvedByActorId = decision === 'APPROVED' ? actor.actorId : null;
    exception.reviewNotes = reviewNotes;
    exception.updatedAt = this.store.nowIso();
    this.store.recordAudit(actor, `EXCEPTION_${decision}`, 'ComplianceException', exception.id, { reviewNotes });
    if (decision === 'APPROVED') {
      this.store.publishEvent(
        'compliance.exception.approved',
        `exc_approve_${exception.id}`,
        actor.correlationId || exception.id,
        { exceptionId: exception.id, obligationId: exception.affectedObligationId },
      );
    }
    return exception;
  }

  public runComplianceAssessment(
    actor: ComplianceActorContext,
    input: {
      scopeType: ComplianceAssessment['scopeType'];
      targetEntityId: string;
      obligationId: string;
      evaluationTimestampIso?: string;
    },
  ): ComplianceAssessment {
    requireCompliancePermission(actor, 'compliance.assessment.run', this.store);
    const obligation = this.store.obligations.get(input.obligationId);
    if (!obligation) {
      throw new ComplianceDomainError('OBLIGATION_NOT_FOUND', 'Obligation not found.', 404);
    }
    const evalTimeMs = input.evaluationTimestampIso ? new Date(input.evaluationTimestampIso).getTime() : Date.now();
    const nowIso = input.evaluationTimestampIso ?? this.store.nowIso();

    if (this.store.upstreamUnavailable) {
      return this.persistAssessment(actor, {
        scopeType: input.scopeType,
        targetEntityId: input.targetEntityId,
        obligationId: obligation.id,
        obligationVersionNumber: obligation.currentVersionNumber,
        determinationState: 'UNABLE_TO_DETERMINE',
        evaluatedControlIds: [],
        evaluatedEvidenceIds: [],
        activeExceptionId: null,
        openCorrectiveActionIds: [],
        findings: [],
        explanation: 'Upstream verification data is unavailable; compliance cannot be inferred.',
        assessedAt: nowIso,
      });
    }

    const mappedControlIds = Array.from(this.store.mappings.values())
      .filter((m) => m.obligationId === obligation.id)
      .map((m) => m.controlId);
    const findings: ComplianceFinding[] = [];
    const evaluatedEvidenceIds: string[] = [];

    if (mappedControlIds.length === 0) {
      findings.push({
        id: this.store.createId('cfind'),
        obligationId: obligation.id,
        controlId: null,
        severity: obligation.severity,
        findingType: 'MISSING_CONTROL',
        description: 'No compliance control is mapped to this obligation.',
        detectedAt: nowIso,
      });
    }

    let allControlsImplemented = mappedControlIds.length > 0;
    let allExecutionsPassed = mappedControlIds.length > 0;
    let hasVerifiedFreshEvidence = false;
    let hasExpiredEvidence = false;
    let hasUnverifiedEvidence = false;

    for (const controlId of mappedControlIds) {
      const control = this.store.controls.get(controlId);
      if (!control || control.implementationStatus !== 'IMPLEMENTED_AND_VERIFIED' || !control.functionalBindingVerified) {
        allControlsImplemented = false;
        findings.push({
          id: this.store.createId('cfind'),
          obligationId: obligation.id,
          controlId,
          severity: obligation.severity,
          findingType: 'CONTROL_NOT_IMPLEMENTED',
          description: `Control '${control?.code ?? controlId}' is not implemented and functionally verified.`,
          detectedAt: nowIso,
        });
      }
      const executions = Array.from(this.store.controlExecutions.values()).filter(
        (ex) => ex.controlId === controlId && ex.targetEntityId === input.targetEntityId,
      );
      const latestExec = executions[executions.length - 1];
      if (!latestExec || latestExec.outcome !== 'PASSED') {
        allExecutionsPassed = false;
        findings.push({
          id: this.store.createId('cfind'),
          obligationId: obligation.id,
          controlId,
          severity: obligation.severity,
          findingType: 'CONTROL_EXECUTION_FAILED',
          description: `Control '${control?.code ?? controlId}' has no passing execution for target entity.`,
          detectedAt: nowIso,
        });
      }
    }

    const evidences = Array.from(this.store.evidenceReferences.values()).filter(
      (ev) => ev.obligationIds.includes(obligation.id) && ev.tenantId === actor.tenantId,
    );
    for (const ev of evidences) {
      evaluatedEvidenceIds.push(ev.id);
      const validUntilMs = new Date(ev.validUntil).getTime();
      if (validUntilMs <= evalTimeMs || ev.verificationStatus === 'EXPIRED') {
        ev.verificationStatus = 'EXPIRED';
        hasExpiredEvidence = true;
        findings.push({
          id: this.store.createId('cfind'),
          obligationId: obligation.id,
          controlId: ev.controlIds[0] ?? null,
          severity: obligation.severity,
          findingType: 'EVIDENCE_EXPIRED',
          description: `Evidence '${ev.id}' expired at ${ev.validUntil}.`,
          detectedAt: nowIso,
        });
      } else if (ev.verificationStatus === 'VERIFIED') {
        hasVerifiedFreshEvidence = true;
      } else if (ev.verificationStatus === 'UNVERIFIED') {
        hasUnverifiedEvidence = true;
        findings.push({
          id: this.store.createId('cfind'),
          obligationId: obligation.id,
          controlId: ev.controlIds[0] ?? null,
          severity: 'MEDIUM',
          findingType: 'EVIDENCE_UNVERIFIED',
          description: `Evidence '${ev.id}' is awaiting verification.`,
          detectedAt: nowIso,
        });
      }
    }

    if (evidences.length === 0) {
      findings.push({
        id: this.store.createId('cfind'),
        obligationId: obligation.id,
        controlId: null,
        severity: obligation.severity,
        findingType: 'EVIDENCE_MISSING',
        description: 'Required compliance evidence has not been submitted.',
        detectedAt: nowIso,
      });
    }

    const activeException = Array.from(this.store.exceptions.values()).find((ex) => {
      if (ex.affectedObligationId !== obligation.id || ex.scopeEntityId !== input.targetEntityId) return false;
      if (ex.status === 'APPROVED' && new Date(ex.expirationDate).getTime() <= evalTimeMs) {
        ex.status = 'EXPIRED';
        this.store.publishEvent('compliance.exception.expired', `exc_exp_${ex.id}`, actor.correlationId || ex.id, {
          exceptionId: ex.id,
        });
        return false;
      }
      return ex.status === 'APPROVED';
    });

    let determinationState: ComplianceDeterminationState = 'NON_COMPLIANT';
    let explanation = '';

    if (allControlsImplemented && allExecutionsPassed && hasVerifiedFreshEvidence && !hasExpiredEvidence) {
      determinationState = 'COMPLIANT';
      explanation = 'All mapped controls are implemented, executed with passing outcomes, and backed by fresh verified evidence.';
    } else if (activeException) {
      determinationState = 'EXCEPTION_APPROVED';
      explanation = `Obligation is unfulfilled, but an active approved exception (${activeException.id}) is in effect until ${activeException.expirationDate}. Never reported as COMPLIANT.`;
    } else if (hasExpiredEvidence && !hasVerifiedFreshEvidence) {
      determinationState = 'EXPIRED';
      explanation = 'Previously submitted compliance evidence has expired; obligation requires fresh evidence and reassessment.';
    } else if (allControlsImplemented && allExecutionsPassed && hasUnverifiedEvidence) {
      determinationState = 'PENDING_REVIEW';
      explanation = 'Controls passed, but submitted evidence is awaiting human verification.';
    } else if (allControlsImplemented && allExecutionsPassed && evidences.length === 0) {
      determinationState = 'PENDING_EVIDENCE';
      explanation = 'Controls are implemented and executed, but required supporting evidence has not yet been collected.';
    } else {
      determinationState = 'NON_COMPLIANT';
      explanation = 'Control implementation, control execution, or valid evidence requirements are not satisfied.';
    }

    return this.persistAssessment(actor, {
      scopeType: input.scopeType,
      targetEntityId: input.targetEntityId,
      obligationId: obligation.id,
      obligationVersionNumber: obligation.currentVersionNumber,
      determinationState,
      evaluatedControlIds: mappedControlIds,
      evaluatedEvidenceIds,
      activeExceptionId: activeException?.id ?? null,
      openCorrectiveActionIds: [],
      findings,
      explanation,
      assessedAt: nowIso,
    });
  }

  private persistAssessment(
    actor: ComplianceActorContext,
    data: Omit<ComplianceAssessment, 'id' | 'tenantId' | 'organizationId' | 'assessedByActorId' | 'approvedByActorId' | 'validUntil'>,
  ): ComplianceAssessment {
    const assessment: ComplianceAssessment = {
      id: this.store.createId('cass'),
      tenantId: actor.tenantId,
      organizationId: actor.organizationId,
      ...data,
      assessedByActorId: actor.actorId,
      approvedByActorId: null,
      validUntil: new Date(new Date(data.assessedAt).getTime() + 30 * 86400000).toISOString(),
    };
    this.store.assessments.set(assessment.id, assessment);
    const snapshots = this.store.assessmentSnapshots.get(assessment.obligationId) ?? [];
    snapshots.push({
      id: this.store.createId('csnap'),
      assessmentId: assessment.id,
      obligationId: assessment.obligationId,
      obligationVersionNumber: assessment.obligationVersionNumber,
      determinationState: assessment.determinationState,
      snapshotPayload: { ...assessment },
      capturedAt: data.assessedAt,
    });
    this.store.assessmentSnapshots.set(assessment.obligationId, snapshots);
    this.store.recordAudit(actor, 'ASSESSMENT_COMPLETED', 'ComplianceAssessment', assessment.id, {
      obligationId: assessment.obligationId,
      obligationVersionNumber: assessment.obligationVersionNumber,
      determinationState: assessment.determinationState,
    });
    this.store.publishEvent(
      'compliance.assessment.completed',
      `ass_done_${assessment.id}`,
      actor.correlationId || assessment.id,
      { assessmentId: assessment.id, determinationState: assessment.determinationState },
    );
    return assessment;
  }
}
