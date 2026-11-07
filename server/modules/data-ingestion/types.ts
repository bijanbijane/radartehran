import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  NormalizedTimestamp,
  TransactionRunnerAdapter,
  ValidationIssue,
} from '../core';

/**
 * Potential external dataset categories supported by Radartehran governance.
 * Note: These represent governed categories, not hardcoded external scrapers.
 */
export type IngestionDataCategory =
  | 'geographic_reference'
  | 'market_observations'
  | 'economic_demographic_indicators'
  | 'construction_development'
  | 'public_property_statistics'
  | 'official_city_neighborhood_datasets'
  | 'other_structured_dataset';

export type IngestionImportMethod = 'manual_entry' | 'structured_file';

export type StructuredFileFormat = 'json_array' | 'csv_rows';

export type IngestionSourceStatus = 'active' | 'suspended' | 'deprecated';

export type IngestionJobStatus =
  | 'created'
  | 'ingesting'
  | 'interrupted'
  | 'staged_pending_review'
  | 'approved_for_publication'
  | 'rejected'
  | 'published';

/**
 * 1 & 2. External Data Source Registry & Source Governance Metadata
 * Stored at `/ingestionSources/{sourceId}`
 */
export interface StoredIngestionSource {
  id: string;
  sourceName: string;
  authorityOrPublisher: string;
  dataCategory: IngestionDataCategory;
  supportedSchemaVersion: string;
  licenseOrUsageTerms: string;
  /**
   * Explicit governance assertion that the source has an approved legal and technical basis
   * and does not rely on unauthorized web scraping or bypassing access controls.
   */
  legalAndTechnicalBasisApproved: boolean;
  ownerUid: string;
  ownerEmail: string;
  status: IngestionSourceStatus;
  latestSourceVersion?: string;
  latestJobId?: string;
  revision: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

/**
 * 11. Provenance Tracking Envelope attached to every staged, quarantined, and published record.
 */
export interface RecordProvenanceEnvelope {
  sourceId: string;
  sourceName: string;
  authorityOrPublisher: string;
  dataCategory: IngestionDataCategory;
  sourceVersion: string;
  schemaVersion: string;
  licenseOrUsageTerms: string;
  jobId: string;
  importMethod: IngestionImportMethod;
  retrievalOrSubmissionDateIso: string;
  rowIndex: number;
  rawPayloadHashSha256: string;
  recordFingerprint: string;
  ingestedByUid: string;
  ingestedAtIso: string;
  approvedByUid?: string;
  approvedAtIso?: string;
}

/**
 * 3, 10, 12 & 14. Import Job Definition & Versioning State
 * Stored at `/ingestionJobs/{jobId}`
 */
export interface StoredIngestionJob {
  id: string;
  sourceId: string;
  sourceName: string;
  authorityOrPublisher: string;
  dataCategory: IngestionDataCategory;
  sourceVersion: string;
  previousSourceVersion?: string;
  versionChangeDetected: boolean;
  schemaVersion: string;
  licenseOrUsageTerms: string;
  importMethod: IngestionImportMethod;
  retrievalOrSubmissionDateIso: string;
  submittedByUid: string;
  status: IngestionJobStatus;
  totalExpectedRows: number;
  cursorOffset: number;
  processedCount: number;
  validStagedCount: number;
  duplicateSkippedCount: number;
  quarantinedInvalidCount: number;
  publishedRecordCount: number;
  approvedByUid?: string;
  approvedAt?: NormalizedTimestamp;
  rejectionReason?: string;
  publishedAt?: NormalizedTimestamp;
  failureReason?: string;
  revision: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

/**
 * 6, 7 & 11. Staged Validated Record
 * Stored at `/ingestionStaging/{jobId}_row_{rowIndex}`
 */
export interface StoredStagedRecord {
  id: string;
  jobId: string;
  sourceId: string;
  dataCategory: IngestionDataCategory;
  rowIndex: number;
  naturalKey: string;
  recordFingerprint: string;
  /** Original raw source values preserved verbatim for auditability */
  rawSourceRecord: Record<string, unknown>;
  /** Normalized, schema-validated record ready for domain publication after approval */
  normalizedRecord: Record<string, unknown>;
  provenance: RecordProvenanceEnvelope;
  published: boolean;
  publishedAtIso?: string;
  createdAt: NormalizedTimestamp;
}

/**
 * 9. Invalid or Ambiguous Record Quarantine
 * Stored at `/ingestionQuarantine/{jobId}_row_{rowIndex}`
 */
export interface StoredQuarantinedRecord {
  id: string;
  jobId: string;
  sourceId: string;
  dataCategory: IngestionDataCategory;
  rowIndex: number;
  quarantineReason: 'SCHEMA_VALIDATION_FAILED' | 'AMBIGUOUS_RECORD' | 'MALFORMED_ROW';
  validationIssues: ValidationIssue[];
  /** Original raw source values preserved verbatim for auditability */
  rawSourceRecord: Record<string, unknown>;
  provenance: RecordProvenanceEnvelope;
  createdAt: NormalizedTimestamp;
}

/**
 * 13. Import Reconciliation Report
 * Stored at `/ingestionReconciliationReports/{jobId}`
 */
export interface IngestionReconciliationReport {
  jobId: string;
  sourceId: string;
  sourceName: string;
  authorityOrPublisher: string;
  dataCategory: IngestionDataCategory;
  sourceVersion: string;
  previousSourceVersion?: string;
  versionChangeDetected: boolean;
  schemaVersion: string;
  importMethod: IngestionImportMethod;
  retrievalOrSubmissionDateIso: string;
  jobStatus: IngestionJobStatus;
  totalExpectedRows: number;
  processedCount: number;
  validStagedCount: number;
  duplicateSkippedCount: number;
  quarantinedInvalidCount: number;
  publishedRecordCount: number;
  /** True iff processedCount === validStagedCount + duplicateSkippedCount + quarantinedInvalidCount */
  reconciledBalanced: boolean;
  unprocessedRemainingCount: number;
  generatedAtIso: string;
}

/**
 * Destination-domain handoff adapter.
 * Ensures `data-ingestion` never becomes the canonical owner of destination domains
 * (e.g., Geography, Market Analytics, Neighborhoods) and instead publishes validated,
 * approved staged records through the owning domain's approved interface.
 */
export interface DestinationDomainPublisherAdapter {
  publishApprovedRecords: (params: {
    jobId: string;
    sourceId: string;
    dataCategory: IngestionDataCategory;
    sourceVersion: string;
    schemaVersion: string;
    records: Array<{
      rowIndex: number;
      naturalKey: string;
      normalizedRecord: Record<string, unknown>;
      provenance: RecordProvenanceEnvelope;
    }>;
  }) => Promise<{ acceptedCount: number }>;
}

export interface RegisterIngestionSourceInput {
  sourceId: string;
  sourceName: string;
  authorityOrPublisher: string;
  dataCategory: IngestionDataCategory;
  supportedSchemaVersion: string;
  licenseOrUsageTerms: string;
  legalAndTechnicalBasisApproved: boolean;
}

export interface CreateIngestionJobInput {
  sourceId: string;
  sourceVersion: string;
  schemaVersion: string;
  importMethod: IngestionImportMethod;
  retrievalOrSubmissionDateIso: string;
  totalExpectedRows: number;
}

export interface IngestRecordsBatchInput {
  rows: Array<Record<string, unknown>>;
  startRowIndex?: number;
  simulateInterruptionAfterRowCount?: number;
}

export interface IngestStructuredFileInput {
  format: StructuredFileFormat;
  content: string;
  startRowIndex?: number;
}

export interface ModerateIngestionJobInput {
  decision: 'approve' | 'reject';
  expectedRevision?: number;
  rejectionReason?: string;
}

export interface DataIngestionModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  destinationPublisher?: DestinationDomainPublisherAdapter;
  idempotencyStore?: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  primaryAdminEmails?: string[];
  nowFn?: () => number;
}
