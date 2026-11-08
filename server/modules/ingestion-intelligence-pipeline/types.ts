/**
 * EMPLOYEE 70 — REAL ESTATE DATA INGESTION, EXTERNAL SOURCES & INTELLIGENCE PIPELINE BACKEND
 * Canonical Domain Types & Interfaces
 */

import type {
  AuditEventSink,
  AuthenticatedPrincipal,
  FirebaseTokenVerifierAdapter,
  TransactionRunnerAdapter,
} from '../core';

export type DataSourceCategory =
  | 'OFFICIAL_PUBLIC_DATASET'
  | 'AUTHORIZED_GOVERNMENT_DATA'
  | 'LICENSED_COMMERCIAL_DATASET'
  | 'AUTHORIZED_LISTING_FEED'
  | 'INTERNAL_PLATFORM_DATA'
  | 'MANUAL_UPLOAD_DATASET'
  | 'APPROVED_API_INTEGRATION'
  | 'PUBLIC_STATISTICAL_DATASET';

export type DataSourceStatus = 'ACTIVE' | 'PAUSED' | 'DEPRECATED' | 'REVOKED';

export type SourceReliabilityClassification =
  | 'AUTHORITATIVE_OFFICIAL'
  | 'VERIFIED_PARTNER'
  | 'MODERATED_COMMERCIAL'
  | 'UNVERIFIED_EXTERNAL'
  | 'MANUAL_CURATED';

export type ProvenanceClassification =
  | 'OFFICIALLY_SOURCED'
  | 'LICENSED'
  | 'USER_SUBMITTED'
  | 'BROKER_SUBMITTED'
  | 'PLATFORM_OBSERVED'
  | 'MODEL_DERIVED'
  | 'MANUALLY_VERIFIED';

export type IngestionPipelineStage =
  | 'SOURCE_ACQUISITION'
  | 'RAW_PAYLOAD_VALIDATION'
  | 'RAW_STAGING_PERSISTENCE'
  | 'SCHEMA_MAPPING'
  | 'FIELD_NORMALIZATION'
  | 'LANGUAGE_TEXT_CLEANING'
  | 'UNIT_CURRENCY_NORMALIZATION'
  | 'GEOSPATIAL_NORMALIZATION'
  | 'ENTITY_RESOLUTION_CANDIDATE_MATCHING'
  | 'DUPLICATE_DETECTION'
  | 'DATA_QUALITY_VALIDATION'
  | 'PROVENANCE_LINEAGE_RECORDING'
  | 'ENRICHMENT_DERIVED_ATTRIBUTES'
  | 'APPROVAL_QUARANTINE_DECISION'
  | 'CANONICAL_DOMAIN_PROPAGATION'
  | 'SEARCH_ANALYTICS_VALUATION_UPDATE';

export type IngestionBatchStatus =
  | 'RECEIVED'
  | 'VALIDATING'
  | 'STAGED'
  | 'PROCESSING'
  | 'QUARANTINED'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'ROLLED_BACK';

export type ConnectorFormat = 'HTTP_JSON_API' | 'PAGINATED_FEED' | 'JSON' | 'CSV' | 'XML' | 'TABULAR_UPLOAD';

export interface DataSourceRegistryRecord {
  sourceId: string;
  name: string;
  category: DataSourceCategory;
  owner: string;
  providerName: string;
  licensingReference: string;
  permissionVerified: boolean;
  allowedDomains: string[];
  connectorFormat: ConnectorFormat;
  ingestionFrequencyMinutes: number;
  reliabilityClassification: SourceReliabilityClassification;
  defaultProvenanceClassification: ProvenanceClassification;
  trustScore: number; // 0 to 100
  status: DataSourceStatus;
  schemaVersion: string;
  secretEnvKeyRef?: string; // Reference to env var name only, NEVER raw credentials
  requiresManualApprovalBeforePublish: boolean;
  maxPayloadBytes: number;
  maxRecordsPerBatch: number;
  lastSuccessfulSyncAt?: string;
  lastFailedSyncAt?: string;
  lastErrorSummary?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
}

export interface RawStagingRecord {
  stagingId: string;
  batchId: string;
  sourceId: string;
  sourceVersion: string;
  externalRecordId: string;
  checksumSha256: string;
  objectStorageRef?: string;
  payloadSizeBytes: number;
  sanitizedSummaryPayload: Record<string, unknown>;
  ingestionTimestamp: string;
}

export interface NormalizedIngestionRecord {
  normalizedRecordId: string;
  stagingId: string;
  batchId: string;
  sourceId: string;
  externalRecordId: string;
  recordDomain: 'PROPERTY_LISTING' | 'TRANSACTION_OBSERVATION' | 'GEO_BOUNDARY' | 'DEMOGRAPHIC_METRIC';
  normalizedTitleFa?: string;
  normalizedAddressFa?: string;
  cityName: string;
  districtCode?: number;
  neighborhoodName?: string;
  propertyCategory?: 'RESIDENTIAL' | 'COMMERCIAL' | 'LAND' | 'OFFICE';
  transactionMode?: 'SALE' | 'RENT' | 'VERIFIED_CLOSED_SALE';
  areaSqm?: number;
  priceRials?: number;
  priceToman?: number;
  rentMonthlyRials?: number;
  depositRials?: number;
  isAskingPrice: boolean;
  isVerifiedTransactionPrice: boolean;
  latitude?: number;
  longitude?: number;
  buildingAgeYears?: number;
  bedrooms?: number;
  floorNumber?: number;
  postalCode?: string;
  nationalPropertyCode?: string;
  extractedTags: string[];
  enrichedAttributes: {
    pricePerSqmRials?: number;
    estimatedDistrictTier?: 'NORTH' | 'CENTRAL' | 'WEST' | 'EAST' | 'SOUTH';
    completenessScore: number;
  };
  normalizedAt: string;
}

export type EntityMatchDecision =
  | 'NEW_ENTITY'
  | 'EXACT_CANONICAL_MATCH'
  | 'AMBIGUOUS_CANDIDATE_REQUIRES_REVIEW'
  | 'DUPLICATE_SKIPPED';

export interface EntityResolutionCandidateRecord {
  resolutionId: string;
  normalizedRecordId: string;
  batchId: string;
  sourceId: string;
  decision: EntityMatchDecision;
  matchedCanonicalPropertyId?: string;
  matchedCanonicalListingId?: string;
  candidatePropertyIds: string[];
  confidenceScore: number; // 0 to 1
  matchReasons: string[];
  reviewStatus: 'AUTO_RESOLVED' | 'PENDING_HUMAN_REVIEW' | 'HUMAN_APPROVED_MERGE' | 'HUMAN_REJECTED_SEPARATE';
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt: string;
}

export type ValidationSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL_QUARANTINE';

export interface QualityIssue {
  ruleCode: string;
  field?: string;
  severity: ValidationSeverity;
  message: string;
}

export interface DataQualityValidationResult {
  validationId: string;
  normalizedRecordId: string;
  batchId: string;
  sourceId: string;
  passed: boolean;
  quarantined: boolean;
  qualityScore: number;
  issues: QualityIssue[];
  validatedAt: string;
}

export interface SourceProvenanceRecord {
  provenanceId: string;
  normalizedRecordId: string;
  batchId: string;
  sourceId: string;
  sourceVersion: string;
  externalRecordId: string;
  ingestionTimestamp: string;
  transformationVersion: string;
  confidenceScore: number;
  provenanceClassification: ProvenanceClassification;
  verificationState: 'UNVERIFIED' | 'AUTOMATED_VALIDATED' | 'MANUALLY_VERIFIED' | 'REJECTED';
  canonicalTargetId?: string;
  canonicalTargetDomain?: 'PROPERTY_REGISTRY' | 'VALUATION_EVIDENCE' | 'MARKET_INTELLIGENCE' | 'GEO_SERVICE' | 'SEARCH_INDEX';
}

export interface ValuationEvidenceObservationRecord {
  observationId: string;
  normalizedRecordId: string;
  sourceId: string;
  cityName: string;
  districtCode?: number;
  neighborhoodName?: string;
  areaSqm: number;
  totalPriceRials: number;
  pricePerSqmRials: number;
  evidenceCategory: 'ASKING_PRICE_OBSERVATION' | 'VERIFIED_TRANSACTION_OBSERVATION';
  provenanceClassification: ProvenanceClassification;
  confidenceScore: number;
  observedAt: string;
}

export interface SynchronizationCheckpointRecord {
  checkpointId: string;
  sourceId: string;
  cursorToken: string;
  lastProcessedExternalTimestamp?: string;
  lastBatchId: string;
  processedRecordCount: number;
  status: 'HEALTHY' | 'FAILED_RECOVERABLE' | 'PAUSED';
  updatedAt: string;
}

export interface IngestionBatchRecord {
  batchId: string;
  sourceId: string;
  idempotencyKey: string;
  status: IngestionBatchStatus;
  completedStages: IngestionPipelineStage[];
  totalReceivedCount: number;
  stagedCount: number;
  normalizedCount: number;
  validCount: number;
  quarantinedCount: number;
  duplicateSkippedCount: number;
  ambiguousReviewCount: number;
  propagatedCanonicalCount: number;
  startedAt: string;
  completedAt?: string;
  triggeredByUserId: string;
  approvalState: 'NOT_REQUIRED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ROLLED_BACK';
  approvedByUserId?: string;
  approvedAt?: string;
  failureReason?: string;
}

export interface RawExternalRecordInput {
  externalRecordId: string;
  recordDomain?: 'PROPERTY_LISTING' | 'TRANSACTION_OBSERVATION' | 'GEO_BOUNDARY' | 'DEMOGRAPHIC_METRIC';
  title?: string;
  address?: string;
  city?: string;
  district?: number | string;
  neighborhood?: string;
  propertyCategory?: string;
  transactionMode?: string;
  area?: number | string;
  areaUnit?: 'SQM' | 'HECTARE' | 'SQFT';
  price?: number | string;
  currency?: 'RIAL' | 'TOMAN';
  rentMonthly?: number | string;
  deposit?: number | string;
  isVerifiedTransaction?: boolean;
  latitude?: number | string;
  longitude?: number | string;
  buildingAge?: number | string;
  bedrooms?: number | string;
  floor?: number | string;
  postalCode?: string;
  nationalPropertyCode?: string;
  rawAttributes?: Record<string, unknown>;
}

export interface ExecuteIngestionBatchInput {
  sourceId: string;
  idempotencyKey: string;
  rawFormat?: ConnectorFormat;
  rawPayloadText?: string;
  records?: RawExternalRecordInput[];
  fetchUrl?: string;
  cursorToken?: string;
  autoPropagateIfApproved?: boolean;
}

export interface KnownCanonicalEntityRef {
  canonicalPropertyId: string;
  canonicalListingId?: string;
  nationalPropertyCode?: string;
  postalCode?: string;
  cityName: string;
  districtCode?: number;
  neighborhoodName?: string;
  normalizedAddressFa: string;
  areaSqm: number;
  latitude?: number;
  longitude?: number;
}

export interface IngestionPipelineDependencies {
  txRunner: TransactionRunnerAdapter;
  auditSink: AuditEventSink;
  tokenVerifier?: FirebaseTokenVerifierAdapter;
  knownCanonicalEntities?: KnownCanonicalEntityRef[];
  onCanonicalPropertyPropagated?: (record: NormalizedIngestionRecord, provenance: SourceProvenanceRecord) => Promise<void> | void;
  onValuationEvidencePropagated?: (observation: ValuationEvidenceObservationRecord) => Promise<void> | void;
  onSearchIndexRefreshRequested?: (record: NormalizedIngestionRecord) => Promise<void> | void;
  onAlertTriggerRequested?: (record: NormalizedIngestionRecord) => Promise<void> | void;
}
