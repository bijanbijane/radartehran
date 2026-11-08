import type {
  AdminAuthorizationStoreAdapter,
  AuditLoggerAdapter,
  FirebaseIdTokenVerifier,
  RateLimiterAdapter,
  TelemetryAdapter,
  TransactionRunnerAdapter,
} from '../core';

export type MasterEntityType =
  | 'property'
  | 'building'
  | 'unit'
  | 'owner_representation'
  | 'listing'
  | 'neighborhood'
  | 'geographic_entity'
  | 'broker_agency'
  | 'market_evidence_source'
  | 'property_category'
  | 'construction_classification'
  | 'land_use_classification'
  | 'measurement_unit'
  | 'currency_reference';

export type EntityMatchClassification =
  | 'EXACT_MATCH'
  | 'HIGH_CONFIDENCE_CANDIDATE'
  | 'POSSIBLE_MATCH'
  | 'INSUFFICIENT_EVIDENCE'
  | 'CONFIRMED_DISTINCT';

export type DataQualityRuleCategory =
  | 'REQUIRED_FIELD'
  | 'TYPE_VALIDATION'
  | 'RANGE_VALIDATION'
  | 'REFERENTIAL_INTEGRITY'
  | 'GEOGRAPHIC_CONSISTENCY'
  | 'CATEGORY_COMPATIBILITY'
  | 'CURRENCY_CONSISTENCY'
  | 'MEASUREMENT_UNIT_CONSISTENCY'
  | 'TEMPORAL_CONSISTENCY'
  | 'DUPLICATE_DETECTION'
  | 'CROSS_MODULE_CONSISTENCY'
  | 'SOURCE_VERIFICATION'
  | 'DATA_FRESHNESS'
  | 'BUSINESS_RULE_CONSISTENCY';

export interface SourceProvenanceMetadata {
  sourceId: string;
  sourceCategory: 'OFFICIAL_REGISTRY' | 'VERIFIED_CONTRACT' | 'BROKER_SUBMISSION' | 'USER_ENTRY' | 'AUTOMATED_IMPORT';
  sourceRecordRef: string;
  collectionMethod: string;
  collectedAtIso: string;
  observedAtIso?: string;
  verificationStatus: 'VERIFIED' | 'PENDING' | 'UNVERIFIED' | 'REJECTED';
  verifiedByActorUid?: string;
  importBatchRef?: string;
  reliabilityTier: 'HIGH' | 'MEDIUM' | 'LOW';
  transformationHistory: Array<{
    step: string;
    appliedAtIso: string;
    details: string;
  }>;
}

export interface MasterDataRecord {
  canonicalId: string;
  entityType: MasterEntityType;
  alternateIds: string[];
  sourceSpecificIds: Record<string, string>;
  parentCanonicalId?: string;
  relatedCanonicalIds: Record<string, string>;
  status: 'ACTIVE' | 'MERGED_ALIAS' | 'SUSPENDED' | 'ARCHIVED';
  mergedIntoCanonicalId?: string;
  verificationStatus: 'VERIFIED' | 'PENDING_REVIEW' | 'UNVERIFIED' | 'REJECTED';
  attributes: Record<string, unknown>;
  protectedFields: string[];
  provenance: SourceProvenanceMetadata;
  version: number;
  createdAtIso: string;
  updatedAtIso: string;
  versionHistory: Array<{
    version: number;
    updatedByUid: string;
    updatedAtIso: string;
    reason: string;
    attributesSnapshot: Record<string, unknown>;
  }>;
}

export interface EntityResolutionResult {
  classification: EntityMatchClassification;
  similarityScore: number;
  matchedCanonicalId?: string;
  candidateCanonicalIds: string[];
  requiresAuthorizedReview: boolean;
  autoMergePermitted: boolean;
  factorBreakdown: Record<string, number>;
  explanation: string;
}

export interface DuplicateCandidateGroup {
  groupId: string;
  entityType: MasterEntityType;
  candidateCanonicalIds: string[];
  recommendedPrimaryId: string;
  similarityScore: number;
  assignedReviewerUid?: string;
  status: 'PENDING_REVIEW' | 'MERGED' | 'DISMISSED_DISTINCT' | 'REVERSED';
  detectedAtIso: string;
}

export interface DuplicateMergeRecord {
  mergeId: string;
  groupId?: string;
  entityType: MasterEntityType;
  survivingCanonicalId: string;
  retiredCanonicalIds: string[];
  migratedDependentRefsCount: number;
  preMergeSnapshots: Record<string, MasterDataRecord>;
  approvedByUid: string;
  mergedAtIso: string;
  reason: string;
  reversed: boolean;
  reversedByUid?: string;
  reversedAtIso?: string;
}

export interface DataQualityRule {
  ruleId: string;
  name: string;
  description: string;
  category: DataQualityRuleCategory;
  severity: 'BLOCKING_ERROR' | 'WARNING' | 'INFO';
  applicableEntityTypes: MasterEntityType[];
  version: number;
  active: boolean;
  effectiveAtIso: string;
}

export interface DataQualityScoreReport {
  canonicalId: string;
  entityType: MasterEntityType;
  overallClassification: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'CRITICAL_FAILURE';
  overallScore: number;
  blockingPassed: boolean;
  componentScores: {
    completeness: number;
    validity: number;
    consistency: number;
    uniqueness: number;
    freshness: number;
    sourceReliability: number;
    referentialIntegrity: number;
  };
  failedBlockingRules: Array<{ ruleId: string; category: DataQualityRuleCategory; message: string }>;
  warningRules: Array<{ ruleId: string; category: DataQualityRuleCategory; message: string }>;
  missingFields: string[];
  ruleSetVersion: string;
  evaluatedAtIso: string;
  disclaimer: string;
}

export interface CrossModuleConsistencyReport {
  valid: boolean;
  checkedAtIso: string;
  violations: Array<{
    code:
      | 'DANGLING_PROPERTY_REFERENCE'
      | 'UNIT_BUILDING_MISMATCH'
      | 'TRANSACTION_CATEGORY_INCOMPATIBLE'
      | 'TENANCY_UNIT_INVALID'
      | 'BROKERAGE_REPRESENTATION_INVALID'
      | 'CONTRADICTORY_COMPLETION_STATE'
      | 'UNSUPPORTED_GEOGRAPHIC_ENTITY'
      | 'UNVERIFIED_VALUATION_EVIDENCE_SOURCE';
    sourceEntityId: string;
    targetEntityId?: string;
    message: string;
  }>;
}

export interface DataProfileReport {
  entityType: MasterEntityType;
  cityId?: string;
  totalRecords: number;
  verifiedRecordsCount: number;
  duplicateRecordsCount: number;
  staleRecordsCount: number;
  fieldCompletenessPct: Record<string, number>;
  categoryDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
  generatedAtIso: string;
}

export interface CorrectionProposalRecord {
  proposalId: string;
  canonicalId: string;
  entityType: MasterEntityType;
  proposedChanges: Record<string, unknown>;
  beforeValues: Record<string, unknown>;
  reason: string;
  evidenceRefs: string[];
  proposedByUid: string;
  proposedAtIso: string;
  status: 'PENDING_REVIEW' | 'APPROVED_APPLIED' | 'REJECTED' | 'ROLLED_BACK';
  reviewedByUid?: string;
  reviewedAtIso?: string;
  reviewNotes?: string;
  propagationJobId?: string;
  irreversibleDownstreamEffect?: boolean;
}

export interface PropagationJobRecord {
  jobId: string;
  idempotencyKey: string;
  sourceCanonicalId: string;
  changeType:
    | 'ATTRIBUTE_CORRECTION'
    | 'CATEGORY_CORRECTION'
    | 'GEOGRAPHIC_REASSIGNMENT'
    | 'DUPLICATE_MERGE'
    | 'MEASUREMENT_CURRENCY_NORMALIZATION';
  affectedDependentIds: string[];
  recalculationTriggeredForHoodIds: number[];
  status: 'COMPLETED' | 'ISOLATED_FAILURE';
  createdAtIso: string;
  completedAtIso: string;
}

export interface DataContractSchemaSpec {
  contractId: string;
  entityType: MasterEntityType;
  schemaVersion: string;
  requiredFields: string[];
  optionalFields: string[];
  deprecatedFields: string[];
  compatibleConsumerModules: string[];
  effectiveAtIso: string;
}

export interface DataGovernanceDashboardSummary {
  totalMasterRecords: number;
  overallHealthyRatioPct: number;
  qualityByEntityType: Record<string, { count: number; avgScore: number }>;
  qualityBySource: Record<string, number>;
  activeDuplicateGroupsCount: number;
  pendingCorrectionProposalsCount: number;
  staleRecordsCount: number;
  propagationJobsCompletedCount: number;
  generatedAtIso: string;
}

export interface DataGovernanceObservabilityMetrics {
  validationsExecutedCount: number;
  duplicateDetectionsCount: number;
  entityMergesCount: number;
  correctionApprovalsCount: number;
  propagationFailuresCount: number;
  schemaCompatibilityFailuresCount: number;
}

export interface DataGovernanceDependencies {
  txRunner?: TransactionRunnerAdapter;
  tokenVerifier?: FirebaseIdTokenVerifier;
  adminStore?: AdminAuthorizationStoreAdapter;
  auditLogger?: AuditLoggerAdapter;
  rateLimiter?: RateLimiterAdapter;
  telemetry?: TelemetryAdapter;
  primaryAdminEmails?: string[];
  now?: () => Date;
}
