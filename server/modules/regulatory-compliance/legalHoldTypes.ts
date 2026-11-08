export type LegalHoldStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'UNDER_REVIEW'
  | 'RELEASE_PENDING'
  | 'RELEASED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'REJECTED';

export type HoldCoveredEntityType =
  | 'INDIVIDUAL_RECORD'
  | 'USER_OR_ORGANIZATION'
  | 'PROPERTY'
  | 'LISTING'
  | 'TRANSACTION'
  | 'RENTAL_OR_TENANCY'
  | 'DOCUMENT'
  | 'FINANCIAL_RECORD'
  | 'COMPLIANCE_CASE'
  | 'FRAUD_INVESTIGATION'
  | 'DATA_CATEGORY'
  | 'SOURCE_MODULE'
  | 'APPROVED_BOUNDED_ENTITY_SELECTION';

export interface HoldPropagationRule {
  ruleId: string;
  ruleVersion: number;
  parentEntityType: HoldCoveredEntityType;
  childEntityTypes: HoldCoveredEntityType[];
  allowedChildSourceModules: string[];
  allowedChildDataCategories: string[];
  includeNewlyCreatedRelatedRecords: boolean;
  maxPropagationDepth: number;
  explicitUserWideHoldAuthorized: boolean;
}

export interface LegalHoldScopeDefinition {
  coveredEntityTypes: HoldCoveredEntityType[];
  coveredEntityIds: string[];
  controlledSelectionCriteria?: Record<string, string | string[]>;
  coveredDocumentCategories: string[];
  coveredDataCategories: string[];
  coveredSystemsAndSourceModules: string[];
  propagationRules: HoldPropagationRule[];
}

export interface LegalHoldApprovalEntry {
  approvalId: string;
  action: 'APPROVED_ACTIVATION' | 'APPROVED_MODIFICATION' | 'REJECTED' | 'REVIEWED';
  actorId: string;
  actorRole: string;
  authority: string;
  rationale: string;
  timestamp: string;
}

export interface LegalHoldReleaseEntry {
  releaseId: string;
  holdId: string;
  releaseReason: string;
  releasingAuthority: string;
  authorizedReviewerId: string;
  approvalTimestamp: string;
  releaseScope: 'FULL' | 'PARTIAL';
  releasedEntityIds: string[];
  relatedCaseOrObligationReferences: string[];
  evidenceOrSupportingDecisionReferences: string[];
}

export interface LegalHold {
  id: string;
  tenantId: string;
  organizationId: string;
  title: string;
  description: string;
  legalOrPreservationBasis: string;
  jurisdictionId: string;
  issuingOrRequestingAuthority: string | null;
  relatedCaseOrInvestigationId: string | null;
  relatedObligationIds: string[];
  scope: LegalHoldScopeDefinition;
  effectiveTimestamp: string;
  authorizationTimestamp: string | null;
  authorizedIssuerId: string | null;
  responsibleLegalOrComplianceOwnerId: string;
  reviewFrequencyDays: number;
  nextReviewDate: string;
  expirationConditions: string | null;
  expirationTimestamp: string | null;
  releaseConditions: string;
  status: LegalHoldStatus;
  version: number;
  approvalHistory: LegalHoldApprovalEntry[];
  releaseHistory: LegalHoldReleaseEntry[];
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PropagatedHoldInstruction {
  id: string;
  holdId: string;
  holdVersion: number;
  parentEntityType: HoldCoveredEntityType;
  parentEntityId: string;
  targetRecordId: string;
  targetEntityType: HoldCoveredEntityType;
  targetSourceModule: string;
  targetDataCategory: string;
  propagationRuleId: string;
  propagationRuleVersion: number;
  status: 'ACTIVE' | 'RELEASED' | 'REVOKED';
  propagatedAt: string;
  releasedAt: string | null;
}

export interface PlatformRecordDescriptor {
  recordId: string;
  tenantId: string;
  organizationId: string;
  entityType: HoldCoveredEntityType;
  sourceModule: string;
  dataCategory: string;
  documentCategory?: string;
  jurisdictionId: string;
  parentEntityType?: HoldCoveredEntityType;
  parentEntityId?: string;
  subjectUserOrOrgId?: string;
  createdAt: string;
  retentionTriggerEvents: Partial<Record<RetentionTriggerType, string>>;
  sourceModuleSupportsDisposition: boolean;
  sourceModuleSupportsAnonymization: boolean;
  conflictingLegalDeletionInstructionId?: string;
}

export type RetentionTriggerType =
  | 'RECORD_CREATION'
  | 'CONTRACT_EXECUTION'
  | 'TRANSACTION_COMPLETION'
  | 'TENANCY_TERMINATION'
  | 'ACCOUNT_CLOSURE'
  | 'CASE_RESOLUTION'
  | 'PAYMENT_SETTLEMENT'
  | 'REGULATORY_REPORTING_COMPLETION'
  | 'CUSTOM_CONFIGURED_EVENT';

export type RetentionBasisTier =
  | 'MANDATORY_STATUTORY_OR_REGULATORY'
  | 'APPROVED_CONTRACTUAL_PRESERVATION'
  | 'APPROVED_INTERNAL_RETENTION_POLICY'
  | 'ORDINARY_DATA_LIFECYCLE_POLICY';

export type DispositionMethod =
  | 'HARD_DELETE'
  | 'ANONYMIZE'
  | 'ARCHIVE_THEN_DELETE'
  | 'MANUAL_LEGAL_DISPOSITION';

export interface RetentionPolicy {
  id: string;
  policyCode: string;
  version: number;
  basisTier: RetentionBasisTier;
  dataCategory: string;
  recordType: HoldCoveredEntityType;
  applicableJurisdictionId: string;
  retentionTrigger: RetentionTriggerType;
  retentionDurationDays: number;
  retentionConditionDescription: string;
  retentionEndCalculationMethod: 'EXACT_DAYS_FROM_TRIGGER' | 'END_OF_CALENDAR_YEAR_PLUS_DAYS' | 'CONDITION_BASED';
  sourceObligationId: string | null;
  approvedPolicyDocumentRef: string | null;
  approvalStatus: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SUPERSEDED' | 'RETIRED';
  responsibleOwnerRole: string;
  effectiveDate: string;
  reviewDate: string;
  dispositionMethod: DispositionMethod;
  exceptions: string[];
  legalHoldInteractionRules: string;
  approvedByActorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RetentionPrecedenceDecisionOutcome =
  | 'PRESERVE_LEGAL_HOLD'
  | 'PRESERVE_MANDATORY_RETENTION'
  | 'PRESERVE_CONTRACTUAL_OBLIGATION'
  | 'PRESERVE_INTERNAL_POLICY'
  | 'ELIGIBLE_FOR_DISPOSITION'
  | 'ANONYMIZATION_REVIEW_REQUIRED'
  | 'LEGAL_REVIEW_REQUIRED'
  | 'RETENTION_CONFIGURATION_MISSING'
  | 'SOURCE_MODULE_UNAVAILABLE';

export interface RetentionPrecedenceDecision {
  decisionId: string;
  targetRecordId: string;
  targetSourceModule: string;
  targetEntityType: HoldCoveredEntityType;
  evaluationTimestamp: string;
  outcome: RetentionPrecedenceDecisionOutcome;
  applicableHoldIds: string[];
  applicablePropagatedInstructionIds: string[];
  applicableRetentionPolicyIds: string[];
  applicableObligationIds: string[];
  precedenceHierarchyRank: 1 | 2 | 3 | 4 | 5 | 6 | null;
  precedenceReason: string;
  decisionExplanation: string;
  authorityApprovers: string[];
  mandatoryPreservationUntil: string | null;
  nextReviewDate: string | null;
  decisionEngineVersion: string;
}

export interface PrivacyDeletionRequestItemResult {
  recordId: string;
  dataCategory: string;
  sourceModule: string;
  dispositionPermitted: boolean;
  recommendedAction: 'DELETE' | 'ANONYMIZE' | 'PRESERVE' | 'ROUTE_TO_LEGAL_REVIEW';
  decisionOutcome: RetentionPrecedenceDecisionOutcome;
  decisionId: string;
  controlledPrivacyExplanation: string;
}

export interface PrivacyDeletionEvaluationResult {
  evaluationId: string;
  privacyRequestId: string;
  subjectUserOrOrgId: string;
  overallStatus: 'FULL_FULFILLMENT_PERMITTED' | 'PARTIAL_FULFILLMENT_PERMITTED' | 'PRESERVATION_REQUIRED' | 'REVIEW_REQUIRED';
  eligibleRecordIds: string[];
  preservedRecordIds: string[];
  reviewRequiredRecordIds: string[];
  itemResults: PrivacyDeletionRequestItemResult[];
  evaluatedAt: string;
}

export type DispositionExecutionStatus =
  | 'REQUESTED'
  | 'EVALUATING'
  | 'BLOCKED'
  | 'APPROVED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REVERSED';

export interface DispositionExecutionRecord {
  id: string;
  targetRecordId: string;
  sourceModule: string;
  requestedAction: 'DELETE' | 'ANONYMIZE' | 'ARCHIVE';
  status: DispositionExecutionStatus;
  latestPrecedenceDecisionId: string;
  requestedByActorId: string;
  approvedByActorId: string | null;
  sourceModuleExecutionRef: string | null;
  failureReason: string | null;
  reversalReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RetentionConflictRecord {
  id: string;
  targetRecordId: string;
  conflictType: 'CONTRADICTORY_LEGAL_INSTRUCTIONS' | 'HOLD_VS_MANDATORY_DELETION_ORDER' | 'JURISDICTIONAL_RETENTION_CONFLICT';
  conflictingHoldIds: string[];
  conflictingPolicyIds: string[];
  conflictingInstructionRefs: string[];
  linkedComplianceCaseId: string;
  status: 'OPEN_LEGAL_REVIEW_REQUIRED' | 'RESOLVED';
  resolutionNotes: string | null;
  resolvedByActorId: string | null;
  detectedAt: string;
  resolvedAt: string | null;
}
