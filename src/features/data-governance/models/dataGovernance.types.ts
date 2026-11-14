/**
 * RT-UI-DATA-GOV-001 | Data Quality, Provenance & Source Governance
 * Canonical Contracts for Source Registry, Usage Rights, Multi-Dimensional Quality,
 * Claim Confidence, Provenance Lineage, Temporal Versioning & Reconciliation
 */

export type DataSourceType =
  | 'OFFICIAL' | 'FIRST_PARTY' | 'OBSERVED' | 'LICENSED' | 'USER_CONTRIBUTED'
  | 'RESEARCH' | 'MODEL_DERIVED' | 'CALCULATED' | 'INFERRED';

export type DataSourceStatus =
  | 'DISCOVERED' | 'UNDER_REVIEW' | 'VERIFIED' | 'ACTIVE' | 'RESTRICTED'
  | 'STALE' | 'SUSPENDED' | 'REVOKED' | 'ARCHIVED';

export type ReliabilityDomain =
  | 'GEOGRAPHIC_BOUNDARIES' | 'POPULATION_STATISTICS' | 'URBAN_INFRASTRUCTURE'
  | 'REAL_ESTATE_TRANSACTIONS' | 'BUILDING_CHARACTERISTICS' | 'MARKET_INDICATORS';

export type DataQualityStatus =
  | 'VERIFIED' | 'SUPPORTED' | 'REPORTED' | 'ESTIMATED' | 'INFERRED'
  | 'CONFLICTED' | 'STALE' | 'INCOMPLETE' | 'UNVERIFIED' | 'REJECTED';

export type ClaimConfidenceLevel = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type SampleSufficiencyStatus = 'INSUFFICIENT' | 'LIMITED' | 'ADEQUATE' | 'STRONG' | 'NOT_ASSESSED';
export type DataFreshnessStatus = 'CURRENT' | 'AGING' | 'STALE' | 'EXPIRED' | 'UNKNOWN';

export type LicensePolicyStatus =
  | 'UNASSESSED' | 'OPEN_USE' | 'ATTRIBUTION_REQUIRED' | 'LIMITED_USE'
  | 'INTERNAL_ANALYSIS_ONLY' | 'DISPLAY_RESTRICTED' | 'EXPIRED' | 'REVOKED';

export type DataSecurityClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export type DataProcessingLayer = 'RAW' | 'STAGING' | 'CANONICAL' | 'SERVING';

export type EntityChangeType =
  | 'SOURCE_UPDATE' | 'CORRECTION' | 'RECLASSIFICATION' | 'METHODOLOGY_CHANGE'
  | 'BOUNDARY_CHANGE' | 'MANUAL_OVERRIDE' | 'DELETION' | 'RESTORATION';

export type ReviewWorkflowState =
  | 'NEW' | 'TRIAGED' | 'ASSIGNED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED'
  | 'NEEDS_EVIDENCE' | 'CONFLICTED' | 'ESCALATED' | 'RESOLVED' | 'PUBLISHED' | 'CLOSED';

export type DataGovernanceRole =
  | 'DATA_GOVERNANCE_ADMIN' | 'DATA_STEWARD' | 'SOURCE_MANAGER' | 'DATA_REVIEWER'
  | 'DOMAIN_EXPERT' | 'GEO_DATA_REVIEWER' | 'METHODOLOGY_REVIEWER' | 'RIGHTS_REVIEWER'
  | 'DATA_ENGINEER' | 'AUDIT_REVIEWER';

export interface DomainReliabilityRecord {
  domain: ReliabilityDomain;
  level: 'HIGH' | 'MEDIUM' | 'LOW' | 'NOT_APPLICABLE';
  rationaleFa: string;
  assessedAt: string;
}

export interface SourceUsagePolicy {
  id: string;
  sourceId: string;
  purpose: string;
  collectAllowed: boolean;
  storeAllowed: boolean;
  transformAllowed: boolean;
  analyzeAllowed: boolean;
  displayAllowed: boolean;
  redistributeAllowed: boolean;
  trainAllowed: boolean;
  attributionRequired: boolean;
  attributionTextFa?: string;
  retentionDays: number;
  licenseReference: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: LicensePolicyStatus;
}

export interface DataSourceRecord {
  id: string;
  nameFa: string;
  sourceType: DataSourceType;
  organizationFa: string;
  domains: ReliabilityDomain[];
  geographicCoverageFa: string;
  temporalCoverageFa: string;
  collectionMethod: 'MANUAL' | 'API' | 'FILE_BATCH' | 'FIELD_SURVEY' | 'USER_CONTRIBUTION' | 'INTERNAL_PIPELINE';
  updateFrequencyFa: string;
  owner: string;
  domainReliability: DomainReliabilityRecord[];
  usagePolicy: SourceUsagePolicy;
  status: DataSourceStatus;
  lastVerifiedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceRecord {
  id: string;
  evidenceType:
    | 'DOCUMENT' | 'OFFICIAL_RECORD' | 'IMAGE' | 'FIELD_OBSERVATION'
    | 'API_RESPONSE' | 'DATASET' | 'USER_STATEMENT' | 'CALCULATION' | 'MODEL_OUTPUT';
  sourceId: string;
  derivedFromSourceId?: string;
  storageRef: string;
  contentHash: string;
  capturedAt: string;
  receivedAt: string;
  createdBy: string;
  relatedClaimIds: string[];
  verificationStatus: 'VERIFIED' | 'PENDING' | 'QUARANTINED' | 'REJECTED';
  accessPolicy: DataSecurityClassification;
  retentionDays: number;
  summaryFa: string;
}

export interface DataClaimRecord {
  id: string;
  entityType: 'PROPERTY' | 'NEIGHBORHOOD' | 'MARKET_INDICATOR' | 'MAP_LAYER' | 'SERVICE_PROVIDER';
  entityId: string;
  attribute: string;
  value: string | number;
  unit?: string;
  sourceId: string;
  sourceType: DataSourceType;
  evidenceRefs: string[];
  observedAt: string;
  validFrom: string;
  validTo?: string;
  recordedAt: string;
  reviewedAt?: string;
  verificationStatus: DataQualityStatus;
  confidenceLevel: ClaimConfidenceLevel;
  supersedesClaimId?: string;
  createdBy: string;
}

export interface MultiDimensionalQualityAssessment {
  id: string;
  targetType: 'FIELD' | 'RECORD' | 'DATASET' | 'MAP_LAYER';
  targetId: string;
  completeness: 'PASS' | 'WARN' | 'FAIL';
  validity: 'PASS' | 'WARN' | 'FAIL';
  accuracyEvidence: 'VERIFIED' | 'SUPPORTED' | 'UNVERIFIED';
  consistency: 'PASS' | 'WARN' | 'FAIL';
  timeliness: DataFreshnessStatus;
  uniqueness: 'UNIQUE' | 'DUPLICATE_DETECTED';
  coverage: SampleSufficiencyStatus;
  traceability: 'FULL_LINEAGE' | 'PARTIAL' | 'MISSING_SOURCE';
  overallStatus: DataQualityStatus;
  sampleCount: number;
  uniqueEntityCount: number;
  methodologyVersion: string;
  assessedAt: string;
  assessedBy: string;
  limitationsFa: string[];
}

export interface ProvenanceEdge {
  id: string;
  parentType: 'RAW_RECORD' | 'STAGING_BATCH' | 'CANONICAL_ENTITY' | 'SNAPSHOT' | 'METHODOLOGY';
  parentId: string;
  childType: 'STAGING_BATCH' | 'CANONICAL_ENTITY' | 'SNAPSHOT' | 'PUBLISHED_INDICATOR';
  childId: string;
  transformationId: string;
  relationshipType: 'DERIVED_FROM' | 'NORMALIZED_BY' | 'AGGREGATED_INTO' | 'PUBLISHED_AS';
  contentHash: string;
  createdAt: string;
}

export interface ReconciliationCase {
  id: string;
  entityType: DataClaimRecord['entityType'];
  entityId: string;
  attribute: string;
  claimIds: string[];
  conflictType: 'VALUE_MISMATCH' | 'BOUNDARY_GEOMETRY' | 'LEGAL_OWNERSHIP' | 'TRANSACTION_DEAL_PRICE' | 'CORE_AREA_DISCREPANCY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresHumanReview: boolean;
  assignedTo?: string;
  conflictedReviewerIds?: string[];
  status: ReviewWorkflowState;
  resolutionValue?: string | number;
  resolutionReasonFa?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface EntityVersionRecord {
  id: string;
  entityType: DataClaimRecord['entityType'];
  entityId: string;
  attribute: string;
  versionNumber: number;
  dataVersion: string;
  methodologyVersion: string;
  value: string | number;
  sourceId: string;
  qualityStatus: DataQualityStatus;
  snapshotRef: string;
  validFrom: string;
  validTo?: string;
  recordedAt: string;
  supersedesVersion?: number;
  changeType: EntityChangeType;
  changeReasonFa: string;
  approvedBy: string;
}

export interface MethodologyRecord {
  id: string;
  code: string;
  nameFa: string;
  domain: ReliabilityDomain;
  version: string;
  descriptionFa: string;
  calculationDefinitionFa: string;
  limitationsFa: string[];
  reviewer: string;
  status: 'ACTIVE' | 'DEPRECATED' | 'DRAFT';
  effectiveFrom: string;
  publishedAt: string;
}

export interface DataCorrectionProposal {
  id: string;
  entityType: DataClaimRecord['entityType'];
  entityId: string;
  attribute: string;
  currentValue: string | number;
  proposedValue: string | number;
  reasonFa: string;
  evidenceId?: string;
  proposerUserId: string;
  proposerVerifiedIdentity: boolean;
  proposerVerifiedCredential: boolean;
  status: ReviewWorkflowState;
  reviewerNoteFa?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface PublicProvenanceOutput {
  entityId: string;
  titleFa: string;
  attribute: string;
  dataType: DataSourceType;
  qualityStatus: DataQualityStatus;
  confidenceLevel: ClaimConfidenceLevel;
  sufficiencyStatus: SampleSufficiencyStatus;
  freshnessStatus: DataFreshnessStatus;
  referencePeriod: { from: string; to: string; labelFa: string };
  methodology: { code: string; nameFa: string; version: string; verificationScopeFa: string };
  provenance: {
    sourceCount: number;
    independentEvidenceCount: number;
    sampleCount: number;
    uniqueEntityCount: number;
    observedAt: string;
    lastUpdatedAt: string;
    attributionFa: string[];
  };
  limitationsFa: string[];
}
