export type CanonicalHoldType =
  | 'LITIGATION'
  | 'REGULATORY'
  | 'INVESTIGATION'
  | 'CONTRACTUAL'
  | 'AUTHORITY_REQUEST'
  | 'OTHER';

export type CanonicalHoldStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'UNDER_REVIEW'
  | 'RELEASE_PENDING'
  | 'RELEASED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'REJECTED';

export type CanonicalHoldPriority = 'NORMAL' | 'HIGH' | 'URGENT';

export type CanonicalScopeType =
  | 'EXPLICIT_RECORDS'
  | 'ENTITY'
  | 'ENTITY_RELATIONSHIP'
  | 'DATA_CATEGORY'
  | 'SOURCE_MODULE'
  | 'BOUNDED_QUERY';

export type CanonicalTargetOrigin = 'DIRECT' | 'PROPAGATED' | 'FUTURE_MATCH';

export type CanonicalTargetPreservationStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'FAILED'
  | 'RELEASE_PENDING'
  | 'RELEASED';

export type CanonicalApprovalDecision = 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

export type CanonicalReviewDecision =
  | 'CONTINUE'
  | 'MODIFY_SCOPE'
  | 'RELEASE_RECOMMENDED'
  | 'ESCALATE';

export type CanonicalReleaseType = 'FULL' | 'PARTIAL' | 'REVOCATION' | 'EXPIRATION';

export type CanonicalRetentionPolicyType =
  | 'STATUTORY'
  | 'REGULATORY'
  | 'CONTRACTUAL'
  | 'INTERNAL';

export type CanonicalRetentionTrigger =
  | 'CREATED_AT'
  | 'TRANSACTION_COMPLETED'
  | 'CONTRACT_TERMINATED'
  | 'TENANCY_TERMINATED'
  | 'ACCOUNT_CLOSED'
  | 'CASE_RESOLVED'
  | 'PAYMENT_SETTLED'
  | 'CUSTOM_EVENT';

export type CanonicalDispositionMethod =
  | 'DELETE'
  | 'ANONYMIZE'
  | 'ARCHIVE'
  | 'MANUAL_REVIEW';

export type CanonicalRetentionPolicyStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'SUPERSEDED'
  | 'RETIRED';

export type CanonicalRetentionObligationType =
  | 'LEGAL_HOLD'
  | 'STATUTORY'
  | 'REGULATORY'
  | 'CONTRACTUAL'
  | 'INTERNAL';

export type CanonicalRetentionObligationStatus =
  | 'ACTIVE'
  | 'SATISFIED'
  | 'SUPERSEDED'
  | 'RELEASED'
  | 'EXPIRED'
  | 'UNDER_REVIEW';

export type CanonicalEvaluationRequestType =
  | 'DELETE'
  | 'ANONYMIZE'
  | 'ARCHIVE'
  | 'RETENTION_CHECK'
  | 'HOLD_RELEASE_REASSESSMENT';

export type CanonicalEvaluationDecision =
  | 'PRESERVE_LEGAL_HOLD'
  | 'PRESERVE_MANDATORY_RETENTION'
  | 'PRESERVE_CONTRACTUAL_OBLIGATION'
  | 'PRESERVE_INTERNAL_POLICY'
  | 'ELIGIBLE_FOR_DISPOSITION'
  | 'ANONYMIZATION_REVIEW_REQUIRED'
  | 'LEGAL_REVIEW_REQUIRED'
  | 'RETENTION_CONFIGURATION_MISSING'
  | 'SOURCE_MODULE_UNAVAILABLE';

export type CanonicalDispositionAction = 'DELETE' | 'ANONYMIZE' | 'ARCHIVE';

export type CanonicalDispositionRequestSource =
  | 'USER_PRIVACY_REQUEST'
  | 'RETENTION_EXPIRY'
  | 'ADMINISTRATIVE'
  | 'SYSTEM_POLICY';

export type CanonicalDispositionStatus =
  | 'REQUESTED'
  | 'EVALUATING'
  | 'BLOCKED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type CanonicalHoldPermission =
  | 'legal_hold.read'
  | 'legal_hold.create'
  | 'legal_hold.approve'
  | 'legal_hold.activate'
  | 'legal_hold.scope.manage'
  | 'legal_hold.review'
  | 'legal_hold.release.request'
  | 'legal_hold.release.approve'
  | 'retention.policy.read'
  | 'retention.policy.manage'
  | 'retention.policy.approve'
  | 'retention.evaluate'
  | 'disposition.request'
  | 'disposition.approve'
  | 'disposition.execute'
  | 'retention.conflict.read'
  | 'retention.audit.read';

export type CanonicalErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'INVALID_STATE_TRANSITION'
  | 'ACTIVE_LEGAL_HOLD'
  | 'RETENTION_OBLIGATION_ACTIVE'
  | 'DISPOSITION_NOT_APPROVED'
  | 'EVALUATION_STALE'
  | 'CONFLICTING_PRESERVATION_INSTRUCTIONS'
  | 'LEGAL_BASIS_UNVERIFIED'
  | 'SCOPE_INVALID'
  | 'RETENTION_SERVICE_UNAVAILABLE'
  | 'SOURCE_MODULE_UNAVAILABLE';

export interface CanonicalLegalBasis {
  basisType:
    | 'APPROVED_CASE_REFERENCE'
    | 'JUDICIAL_ORDER'
    | 'REGULATORY_DIRECTIVE'
    | 'STATUTORY_REQUIREMENT'
    | 'CONTRACTUAL_COVENANT';
  referenceId: string;
  description: string;
  verified?: boolean;
}

export interface CanonicalRelationshipPropagationRule {
  ruleId: string;
  parentEntityType: string;
  childEntityType: string;
  childSourceModule: string;
  childDataCategories: string[];
  maxDepth: number;
}

export interface AllowlistedBoundedQueryDefinition {
  jurisdictionId?: string;
  sourceModule?: string;
  entityType?: string;
  dataCategory?: string;
  createdAfterIso?: string;
  createdBeforeIso?: string;
}

// 1.1 LegalHold
export interface CanonicalLegalHold {
  id: string;
  tenantId: string | null;
  holdNumber: string;
  title: string;
  description: string | null;
  holdType: CanonicalHoldType;
  legalBasis: CanonicalLegalBasis;
  jurisdictionIds: string[];
  authorityReference: string | null;
  caseReferences: string[];
  obligationReferences: string[];
  scopeDefinitionId: string;
  currentScopeVersion: number;
  status: CanonicalHoldStatus;
  priority: CanonicalHoldPriority;
  effectiveAt: string;
  approvedAt: string | null;
  activatedAt: string | null;
  reviewIntervalDays: number;
  nextReviewAt: string | null;
  requestedReleaseAt: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
  createdBy: string;
  approvedBy: string | null;
  releasedBy: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  correlationId: string;
}

// 1.2 LegalHoldScope
export interface CanonicalLegalHoldScope {
  id: string;
  legalHoldId: string;
  scopeVersion: number;
  scopeType: CanonicalScopeType;
  entityTypes: string[];
  entityIds: string[];
  dataCategories: string[];
  sourceModuleIds: string[];
  relationshipRules: CanonicalRelationshipPropagationRule[];
  boundedQuery?: AllowlistedBoundedQueryDefinition | null;
  jurisdictionIds: string[];
  effectiveFrom: string;
  effectiveUntil: string | null;
  includeFutureMatchingRecords: boolean;
  maximumExpansionCount: number;
  maximumRelationshipDepth: number;
  scopeFingerprint: string;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  version: number;
}

// 1.3 LegalHoldTarget
export interface CanonicalLegalHoldTarget {
  id: string;
  legalHoldId: string;
  scopeVersion: number;
  sourceModule: string;
  entityType: string;
  entityId: string;
  recordVersion: number | null;
  targetOrigin: CanonicalTargetOrigin;
  parentTargetId: string | null;
  propagationRuleId: string | null;
  preservationStatus: CanonicalTargetPreservationStatus;
  firstCoveredAt: string;
  lastVerifiedAt: string;
  releasedAt: string | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
}

// 1.4 LegalHoldApproval
export interface CanonicalLegalHoldApproval {
  id: string;
  legalHoldId: string;
  holdVersion: number;
  decision: CanonicalApprovalDecision;
  reviewerId: string;
  reviewerRole: string;
  reason: string;
  evidenceReferences: string[];
  approvedScopeFingerprint: string;
  createdAt: string;
  correlationId: string;
}

// 1.5 LegalHoldReview
export interface CanonicalLegalHoldReview {
  id: string;
  legalHoldId: string;
  holdVersion: number;
  scheduledAt: string;
  completedAt: string;
  reviewerId: string;
  decision: CanonicalReviewDecision;
  reason: string;
  evidenceReferences: string[];
  nextReviewAt: string;
  createdAt: string;
}

// 1.6 LegalHoldRelease
export interface CanonicalLegalHoldRelease {
  id: string;
  legalHoldId: string;
  holdVersion: number;
  releaseType: CanonicalReleaseType;
  reason: string;
  authorityReference: string;
  requestedBy: string;
  approvedBy: string | null;
  requestedAt: string;
  approvedAt: string | null;
  effectiveAt: string | null;
  scopeFingerprint: string;
  releaseDecisionReference: string | null;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

// 1.7 RetentionPolicy
export interface CanonicalRetentionPolicy {
  id: string;
  tenantId: string;
  policyCode: string;
  name: string;
  description: string;
  dataCategories: string[];
  entityTypes: string[];
  sourceModules: string[];
  jurisdictionIds: string[];
  policyType: CanonicalRetentionPolicyType;
  authorityReference: string | null;
  retentionTrigger: CanonicalRetentionTrigger;
  customTriggerEvent: string | null;
  retentionDurationDays: number | null;
  minimumRetentionUntil: string | null;
  dispositionMethod: CanonicalDispositionMethod;
  status: CanonicalRetentionPolicyStatus;
  effectiveFrom: string;
  effectiveUntil: string | null;
  ownerId: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// 1.8 RetentionPolicyVersion
export interface CanonicalRetentionPolicyVersion {
  id: string;
  retentionPolicyId: string;
  version: number;
  snapshot: Readonly<CanonicalRetentionPolicy>;
  changeReason: string;
  changedBy: string;
  approvedBy: string | null;
  effectiveFrom: string;
  createdAt: string;
}

// 1.9 RetentionObligation
export interface CanonicalRetentionObligation {
  id: string;
  tenantId: string;
  targetEntityType: string;
  targetEntityId: string;
  sourceModule: string;
  obligationType: CanonicalRetentionObligationType;
  sourceReferenceType: 'LEGAL_HOLD' | 'RETENTION_POLICY' | 'COMPLIANCE_OBLIGATION';
  sourceReferenceId: string;
  sourceVersion: number;
  retentionStartAt: string;
  retainUntil: string | null;
  reviewAt: string | null;
  status: CanonicalRetentionObligationStatus;
  priorityClass: 1 | 2 | 3 | 4 | 5;
  reasonCode: string;
  createdAt: string;
  updatedAt: string;
}

// 1.10 RetentionEvaluation
export interface CanonicalRetentionEvaluation {
  id: string;
  tenantId: string;
  targetEntityType: string;
  targetEntityId: string;
  sourceModule: string;
  requestType: CanonicalEvaluationRequestType;
  decision: CanonicalEvaluationDecision;
  decisionReasonCode: string;
  decisionExplanation: string;
  applicableHoldIds: string[];
  applicableRetentionObligationIds: string[];
  applicablePolicyVersions: Array<{ policyId: string; policyCode: string; version: number }>;
  conflictingInstructionReferences: string[];
  missingConfiguration: boolean;
  sourceAvailability: 'AVAILABLE' | 'UNAVAILABLE';
  evaluatedAt: string;
  evaluatedBy: string;
  engineVersion: string;
  correlationId: string;
  expiresAt: string;
}

// 1.11 DispositionRequest
export interface CanonicalDispositionRequest {
  id: string;
  tenantId: string;
  requestNumber: string;
  targetEntityType: string;
  targetEntityId: string;
  sourceModule: string;
  requestedAction: CanonicalDispositionAction;
  requestReason: string;
  requestSource: CanonicalDispositionRequestSource;
  privacyRequestReference: string | null;
  retentionEvaluationId: string;
  status: CanonicalDispositionStatus;
  requestedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  executedAt: string | null;
  executionReference: string | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// 1.12 DispositionApproval
export interface CanonicalDispositionApproval {
  id: string;
  dispositionRequestId: string;
  evaluationId: string;
  decision: 'APPROVED' | 'REJECTED';
  reviewerId: string;
  reason: string;
  createdAt: string;
}

// 1.13 RetentionAuditRecord
export interface CanonicalRetentionAuditRecord {
  id: string;
  tenantId: string;
  operation: string;
  actorId: string;
  actorRole: string;
  targetType: string;
  targetId: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  reason: string;
  sourceModule: string;
  authorizationContext: string[];
  correlationId: string;
  createdAt: string;
  integrityReference: string;
}

export interface CanonicalConflictRecord {
  id: string;
  tenantId: string;
  sourceModule: string;
  entityType: string;
  entityId: string;
  jurisdictionId: string;
  conflictType: 'CONTRADICTORY_PRESERVATION_AND_DELETION' | 'JURISDICTIONAL_RETENTION_CONFLICT';
  status: 'OPEN' | 'RESOLVED';
  priority: CanonicalHoldPriority;
  conflictingReferences: string[];
  createdAt: string;
}

export interface CanonicalHoldActor {
  actorId: string;
  actorRole: string;
  tenantId: string;
  permissions: CanonicalHoldPermission[];
  correlationId?: string;
  allowSelfApprovalByPolicy?: boolean;
}

export interface CanonicalApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    correlationId: string;
    timestamp: string;
  };
}

export interface CanonicalApiErrorEnvelope {
  success: false;
  error: {
    code: CanonicalErrorCode;
    message: string;
    details: Array<Record<string, unknown>>;
    retryable: boolean;
  };
  meta: {
    requestId: string;
    correlationId: string;
    timestamp: string;
  };
}

export interface SourceModuleDispositionProvider {
  isModuleAvailable(sourceModule: string): boolean;
  executeDisposition(input: {
    sourceModule: string;
    entityType: string;
    entityId: string;
    action: CanonicalDispositionAction;
    dispositionRequestId: string;
  }): Promise<{ ok: boolean; executionReference?: string; failureCode?: string }>;
}
