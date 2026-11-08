import crypto from 'crypto';
import {
  ComplianceActorContext,
  ComplianceApproval,
  ComplianceAssessment,
  ComplianceAssessmentSnapshot,
  ComplianceAuditReference,
  ComplianceCaseReference,
  ComplianceControl,
  ComplianceEventEnvelope,
  ComplianceEvidenceReference,
  ComplianceException,
  ComplianceIncident,
  ComplianceJurisdiction,
  ComplianceObligation,
  ControlExecution,
  ControlVersion,
  CorrectiveAction,
  ObligationControlMapping,
  ObligationVersion,
  ProcessingActivityReference,
  RegulatoryAuthority,
  RegulatoryChange,
  RegulatorySource,
  RegulatorySourceVersion,
} from './types';
import {
  DispositionExecutionRecord,
  LegalHold,
  PlatformRecordDescriptor,
  PrivacyDeletionEvaluationResult,
  PropagatedHoldInstruction,
  RetentionConflictRecord,
  RetentionPolicy,
  RetentionPrecedenceDecision,
} from './legalHoldTypes';

export class ComplianceDomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'ComplianceDomainError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class RegulatoryComplianceStore {
  public jurisdictions = new Map<string, ComplianceJurisdiction>();
  public authorities = new Map<string, RegulatoryAuthority>();
  public sources = new Map<string, RegulatorySource>();
  public sourceVersions = new Map<string, RegulatorySourceVersion[]>();
  public obligations = new Map<string, ComplianceObligation>();
  public obligationVersions = new Map<string, ObligationVersion[]>();
  public controls = new Map<string, ComplianceControl>();
  public controlVersions = new Map<string, ControlVersion[]>();
  public mappings = new Map<string, ObligationControlMapping>();
  public evidenceReferences = new Map<string, ComplianceEvidenceReference>();
  public controlExecutions = new Map<string, ControlExecution>();
  public assessments = new Map<string, ComplianceAssessment>();
  public assessmentSnapshots = new Map<string, ComplianceAssessmentSnapshot[]>();
  public exceptions = new Map<string, ComplianceException>();
  public caseReferences = new Map<string, ComplianceCaseReference>();
  public regulatoryChanges = new Map<string, RegulatoryChange>();
  public incidents = new Map<string, ComplianceIncident>();
  public correctiveActions = new Map<string, CorrectiveAction>();
  public processingActivities = new Map<string, ProcessingActivityReference>();
  public approvals = new Map<string, ComplianceApproval>();
  public auditTrail: ComplianceAuditReference[] = [];
  public publishedEvents: ComplianceEventEnvelope[] = [];
  public processedIdempotencyKeys = new Map<string, unknown>();

  // Legal Hold & Retention Precedence state
  public legalHolds = new Map<string, LegalHold>();
  public propagatedHoldInstructions = new Map<string, PropagatedHoldInstruction>();
  public platformRecords = new Map<string, PlatformRecordDescriptor>();
  public retentionPolicies = new Map<string, RetentionPolicy>();
  public retentionPolicyVersions = new Map<string, RetentionPolicy[]>();
  public precedenceDecisions = new Map<string, RetentionPrecedenceDecision>();
  public deletionEvaluations = new Map<string, PrivacyDeletionEvaluationResult>();
  public dispositionExecutions = new Map<string, DispositionExecutionRecord>();
  public retentionConflicts = new Map<string, RetentionConflictRecord>();

  // Fail-safe simulation flags
  public upstreamUnavailable = false;
  public holdRegistryUnavailable = false;
  public retentionEvaluatorUnavailable = false;
  public scopeResolutionIncomplete = false;
  public authorizationUnavailable = false;
  public simulatedSourceDispositionFailure = false;

  public createId(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
  }

  public nowIso(): string {
    return new Date().toISOString();
  }

  public recordAudit(
    actor: ComplianceActorContext,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown> = {},
    options?: {
      previousState?: Record<string, unknown> | null;
      newState?: Record<string, unknown> | null;
      reason?: string;
    },
  ): ComplianceAuditReference {
    const entry: ComplianceAuditReference = {
      id: this.createId('caud'),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      tenantId: actor.tenantId,
      organizationId: actor.organizationId,
      action,
      targetType,
      targetId,
      previousState: options?.previousState ?? null,
      newState: options?.newState ?? null,
      reason: options?.reason ?? (typeof metadata.reason === 'string' ? metadata.reason : undefined),
      authorizationContext: [...actor.permissions],
      correlationId: actor.correlationId || this.createId('corr'),
      metadata,
      recordedAt: this.nowIso(),
    };
    this.auditTrail.push(Object.freeze(entry));
    return entry;
  }

  public publishEvent(
    eventType: ComplianceEventEnvelope['eventType'],
    idempotencyKey: string,
    correlationId: string,
    payload: Record<string, unknown>,
  ): ComplianceEventEnvelope {
    const existing = this.publishedEvents.find(
      (e) => e.idempotencyKey === idempotencyKey && e.eventType === eventType,
    );
    if (existing) {
      return existing;
    }
    const event: ComplianceEventEnvelope = {
      eventId: this.createId('cevt'),
      eventType,
      eventVersion: '1.0',
      idempotencyKey,
      correlationId: correlationId || this.createId('corr'),
      occurredAt: this.nowIso(),
      deliveryAttempts: 1,
      payload,
    };
    this.publishedEvents.push(event);
    return event;
  }
}

export function requireCompliancePermission(
  actor: ComplianceActorContext,
  permission: ComplianceActorContext['permissions'][number],
  store?: RegulatoryComplianceStore,
): void {
  if (store?.authorizationUnavailable) {
    throw new ComplianceDomainError(
      'AUTHORIZATION_SERVICE_UNAVAILABLE',
      'Authorization service is currently unavailable; destructive or privileged operation blocked.',
      503,
    );
  }
  if (!actor || !actor.actorId || !Array.isArray(actor.permissions)) {
    throw new ComplianceDomainError('UNAUTHENTICATED_COMPLIANCE_ACTOR', 'Actor authentication is required.', 401);
  }
  if (!actor.permissions.includes(permission)) {
    throw new ComplianceDomainError(
      'UNAUTHORIZED_COMPLIANCE_OPERATION',
      `Actor '${actor.actorId}' lacks required permission '${permission}'.`,
      403,
    );
  }
}
