/**
 * Employee 17 — External Data Integration & Ingestion Backend Contracts
 * (`server/modules/data-ingestion/ingestionContracts.ts`)
 * Exclusive ownership: `server/modules/data-ingestion/`
 */

import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  NormalizedTimestamp,
  TransactionRunnerAdapter,
  ValidationIssue,
} from '../core';

// ============================================================================
// SECTION 3: DATA SOURCE REGISTRY
// ============================================================================

export type ExternalSourceCategory =
  | 'government_public_sector'
  | 'municipal_urban_data'
  | 'official_geographic'
  | 'official_statistical'
  | 'authorized_market_data_provider'
  | 'licensed_commercial_provider'
  | 'research_institution'
  | 'approved_partner_organization'
  | 'controlled_manual_submission';

export type ExternalSourceType =
  | 'http_rest_api'
  | 'paginated_api'
  | 'file_download'
  | 'authorized_partner_feed'
  | 'manual_upload';

export type SourceAccessMethod =
  | 'rest_get'
  | 'rest_post'
  | 'paginated_cursor'
  | 'paginated_page'
  | 'static_file'
  | 'manual_submission';

export type SourceAuthType =
  | 'none'
  | 'api_key_header'
  | 'oauth2_bearer'
  | 'client_credentials'
  | 'hmac_signed_request'
  | 'mutual_tls';

export type SourceDataFormat = 'json' | 'csv' | 'xml';

export type SourceReliabilityClassification =
  | 'unverified_newly_registered'
  | 'provisionally_verified'
  | 'historically_consistent'
  | 'degraded_intermittent'
  | 'suspended_unreliable';

export type SourceVerificationStatus =
  | 'unverified'
  | 'pending_legal_technical_review'
  | 'verified_authentic'
  | 'revoked';

export type SourceActiveStatus = 'active' | 'inactive' | 'suspended';

export type ScheduleFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'source_defined' | 'on_demand';

export interface SourceAuthRequirements {
  readonly authType: SourceAuthType;
  /** Reference key in SecretManagerCredentialAdapter; NEVER a raw secret value. */
  readonly credentialSecretRef?: string;
  readonly headerName?: string;
  readonly requiredScopes?: readonly string[];
  readonly tokenEndpointUrl?: string;
}

export interface ExternalDataSourceRecord {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceOrganization: string;
  readonly sourceCategory: ExternalSourceCategory;
  readonly sourceType: ExternalSourceType;
  readonly officialWebsiteOrApiRef?: string;
  readonly allowedHosts: readonly string[];
  readonly dataLicenseOrUsageTerms: string;
  readonly legalAndTechnicalBasisApproved: boolean;
  readonly accessMethod: SourceAccessMethod;
  readonly authenticationRequirements: SourceAuthRequirements;
  readonly availableDatasetIds: readonly string[];
  readonly geographicCoverage: readonly string[];
  readonly updateFrequency: ScheduleFrequency;
  readonly expectedDataFormat: SourceDataFormat;
  readonly reliabilityClassification: SourceReliabilityClassification;
  readonly verificationStatus: SourceVerificationStatus;
  /** Explicit documented basis for source identity verification (never assumed from name/URL). */
  readonly verificationBasis: string;
  readonly sourceOwnerUid: string;
  readonly sourceOwnerEmail: string;
  readonly activeStatus: SourceActiveStatus;
  readonly rateLimitMaxRequestsPerMinute: number;
  readonly timeoutMs: number;
  readonly lastSuccessfulSyncIso?: string;
  readonly lastFailedSyncIso?: string;
  readonly historicalImportSuccessCount: number;
  readonly historicalImportFailureCount: number;
  readonly averageDataDelayMs?: number;
  readonly lastDataPublicationTimestampIso?: string;
  readonly lastSchemaChangeIso?: string;
  readonly knownCoverageGaps: readonly string[];
  readonly revision: number;
  readonly createdAt: NormalizedTimestamp;
  readonly updatedAt: NormalizedTimestamp;
}

// ============================================================================
// SECTION 4 & 10: DATASET CATALOG & VERSIONED SCHEMA CONTRACTS
// ============================================================================

export type ExternalDatasetCategory =
  | 'aggregate_market_indicators'
  | 'official_transaction_statistics'
  | 'construction_building_permits'
  | 'urban_development_info'
  | 'geographic_reference_info'
  | 'infrastructure_public_facilities'
  | 'population_demographic_statistics'
  | 'economic_statistical_indicators'
  | 'planning_zoning_info'
  | 'environmental_location_datasets';

export type DatasetImportStrategy =
  | 'full_replace_snapshot'
  | 'incremental_append_or_upsert'
  | 'delta_reconciliation'
  | 'manual_staged_batch';

export type DatasetStatus = 'active' | 'draft' | 'deprecated' | 'suspended';
export type TargetDomainModule = 'geography' | 'crowd_data' | 'valuation' | 'staging_only';

/** Distinct price field semantics — never merged into a single generic price field. */
export type PriceFieldSemanticType =
  | 'asking_price'
  | 'confirmed_transaction_price'
  | 'monthly_rent'
  | 'deposit_rahn'
  | 'price_per_sqm';

export type ExplicitCurrencyCode = 'IRR' | 'TOMAN' | 'MILLION_TOMAN';
export type ExplicitAreaUnit = 'sqm' | 'hectare';

export type SchemaFieldDataType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'iso_date'
  | 'currency_amount'
  | 'area_measure'
  | 'geographic_ref'
  | 'identifier';

export interface DatasetFieldSpec {
  readonly fieldName: string;
  readonly targetNormalizedField?: string;
  readonly dataType: SchemaFieldDataType;
  readonly required: boolean;
  readonly minNumeric?: number;
  readonly maxNumeric?: number;
  readonly expectedCurrency?: ExplicitCurrencyCode;
  readonly priceSemanticType?: PriceFieldSemanticType;
  readonly sourceAreaUnit?: ExplicitAreaUnit;
  readonly normalizeAreaToSqm?: boolean;
  readonly identifierPatternRegex?: string;
  readonly requiresHumanConfirmationMapping?: boolean;
}

export interface DatasetSchemaContract {
  readonly schemaVersion: string;
  readonly transformationVersion: string;
  readonly primaryNaturalKeyFields: readonly string[];
  readonly allowUnexpectedFields: boolean;
  readonly piiLawfulBasisApproved?: boolean;
  readonly timestampField?: string;
  readonly fields: readonly DatasetFieldSpec[];
}

export interface DatasetQualityRuleConfig {
  readonly maxMissingOptionalFieldRatio: number;
  readonly enableIqrOutlierDetection: boolean;
  readonly iqrMultiplier: number;
  readonly numericOutlierField?: string;
  readonly requireGeographicResolution: boolean;
  readonly allowCrossSourceAutoMerge: boolean;
}

export interface ExternalDatasetCatalogEntry {
  readonly datasetId: string;
  readonly sourceId: string;
  readonly datasetName: string;
  readonly datasetCategory: ExternalDatasetCategory;
  readonly description: string;
  readonly schemaVersion: string;
  readonly schemaContract: DatasetSchemaContract;
  readonly dataFormat: SourceDataFormat;
  readonly geographicScope: readonly string[];
  readonly temporalCoverage: string;
  readonly updateFrequency: ScheduleFrequency;
  readonly expectedRecordStructure: string;
  readonly freshnessMaxAgeHours: number;
  readonly licenseAndUsageRestrictions: string;
  readonly qualityRules: DatasetQualityRuleConfig;
  readonly importStrategy: DatasetImportStrategy;
  readonly availableFields: readonly string[];
  readonly datasetStatus: DatasetStatus;
  readonly targetDomain: TargetDomainModule;
  readonly requiresManualApprovalGate: boolean;
  readonly lastSuccessfulImportIso?: string;
  readonly lastValidationSummary?: DatasetValidationSummary;
  readonly revision: number;
  readonly createdAt: NormalizedTimestamp;
  readonly updatedAt: NormalizedTimestamp;
}

// ============================================================================
// SECTION 5, 6, 7, 8 & 9: CONNECTORS, SECRETS, JOBS, SCHEDULING & SNAPSHOTS
// ============================================================================

export interface ResolvedSourceCredential {
  readonly secretRef: string;
  readonly secretValue: string;
  readonly version: string;
  readonly expiresAtEpochMs?: number;
}

export interface SecretManagerCredentialAdapter {
  resolveCredential: (secretRef: string) => Promise<ResolvedSourceCredential | null>;
}

export interface ConnectorFetchRequest {
  readonly source: ExternalDataSourceRecord;
  readonly dataset: ExternalDatasetCatalogEntry;
  readonly endpointUrl?: string;
  readonly rawFileContent?: string;
  readonly manualRecords?: readonly Record<string, unknown>[];
  readonly checkpointCursor?: string;
  readonly pageLimit?: number;
  readonly timeoutMs: number;
}

export interface ConnectorFetchResponse {
  readonly rawPayloadText: string;
  readonly rawByteLength: number;
  readonly contentChecksumSha256: string;
  readonly parsedRecords: readonly Record<string, unknown>[];
  readonly malformedRowErrors: readonly { rowIndex: number; rawText: string; reason: string }[];
  readonly sourceReportedVersion?: string;
  readonly sourcePublishedAtIso?: string;
  readonly nextCheckpointCursor?: string;
  readonly pagesFetched: number;
  readonly retrievedAtIso: string;
}

export interface ExternalDataConnector {
  readonly connectorId: string;
  readonly supportedSourceTypes: readonly ExternalSourceType[];
  acquireData: (request: ConnectorFetchRequest) => Promise<ConnectorFetchResponse>;
}

export type Employee17JobState =
  | 'Created'
  | 'Queued'
  | 'Running'
  | 'Fetching'
  | 'Validating'
  | 'Transforming'
  | 'Awaiting_Approval'
  | 'Completed'
  | 'Partially_Completed'
  | 'Failed'
  | 'Cancelled';

export type Employee17ImportType =
  | 'manual_import'
  | 'scheduled_import'
  | 'incremental_sync'
  | 'full_dataset_import'
  | 'paginated_retrieval'
  | 'retryable_import'
  | 'dry_run_import'
  | 'snapshot_reprocessing';

export type IngestionErrorClassification =
  | 'NONE'
  | 'TRANSIENT_NETWORK_TIMEOUT'
  | 'RATE_LIMITED_429'
  | 'AUTH_MISSING_OR_EXPIRED'
  | 'SSRF_OR_UNSAFE_URL_BLOCKED'
  | 'SCHEMA_INCOMPATIBLE'
  | 'PARSE_FORMAT_ERROR'
  | 'STORAGE_OR_PERSISTENCE_FAILURE'
  | 'DOWNSTREAM_DELIVERY_FAILURE'
  | 'CANCELLED_BY_ADMIN';

export interface JobStateTransitionEntry {
  readonly fromState: Employee17JobState | null;
  readonly toState: Employee17JobState;
  readonly timestampIso: string;
  readonly note?: string;
}

export interface IngestionJobRecord {
  readonly jobId: string;
  readonly sourceId: string;
  readonly datasetId: string;
  readonly importType: Employee17ImportType;
  readonly startTimestampIso: string;
  readonly completionTimestampIso?: string;
  readonly currentState: Employee17JobState;
  readonly stateHistory: readonly JobStateTransitionEntry[];
  readonly recordsRetrieved: number;
  readonly recordsValidated: number;
  readonly recordsRejected: number;
  readonly recordsQuarantined: number;
  readonly recordsDuplicateSkipped: number;
  readonly recordsDelivered: number;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly nextRetryDelayMs?: number;
  readonly retryable: boolean;
  readonly errorClassification: IngestionErrorClassification;
  readonly errorMessage?: string;
  readonly dataVersion: string;
  readonly schemaVersion: string;
  readonly transformationVersion: string;
  readonly checkpointReference?: string;
  readonly rawSnapshotId?: string;
  readonly validationReportId?: string;
  readonly isDryRun: boolean;
  readonly initiatedByUid: string;
  readonly approvedByUid?: string;
  readonly approvedAtIso?: string;
  readonly revision: number;
  readonly createdAt: NormalizedTimestamp;
  readonly updatedAt: NormalizedTimestamp;
}

export interface IngestionScheduleRecord {
  readonly scheduleId: string;
  readonly sourceId: string;
  readonly datasetId: string;
  readonly frequency: ScheduleFrequency;
  readonly intervalMinutes?: number;
  readonly enabled: boolean;
  readonly lastTriggeredJobId?: string;
  readonly lastTriggeredAtIso?: string;
  readonly nextRunAtIso?: string;
  readonly createdAt: NormalizedTimestamp;
  readonly updatedAt: NormalizedTimestamp;
}

export interface DurableIngestionSchedulerAdapter {
  registerOrUpdateSchedule: (schedule: IngestionScheduleRecord) => Promise<void>;
  acquireExclusiveJobLock: (params: { sourceId: string; datasetId: string; jobId: string; nowEpochMs: number }) => Promise<boolean>;
  releaseExclusiveJobLock: (params: { sourceId: string; datasetId: string; jobId: string }) => Promise<void>;
}

export interface RawImportSnapshotMetadata {
  readonly snapshotId: string;
  readonly sourceId: string;
  readonly datasetId: string;
  readonly jobId: string;
  readonly retrievalTimestampIso: string;
  readonly sourceReportedVersion?: string;
  readonly sourcePublishedAtIso?: string;
  readonly originalFormat: SourceDataFormat;
  readonly recordCount: number;
  readonly contentChecksumSha256: string;
  readonly byteLength: number;
  readonly storageReference: string;
  readonly dataLicense: string;
  readonly integrityStatus: 'verified_sha256' | 'checksum_mismatch' | 'unverified_no_payload';
  readonly createdAt: NormalizedTimestamp;
}

export interface RawSnapshotStorageAdapter {
  storeRawSnapshotBytes: (params: {
    snapshotId: string;
    sourceId: string;
    datasetId: string;
    jobId: string;
    format: SourceDataFormat;
    rawPayloadText: string;
    expectedSha256: string;
  }) => Promise<{ storageReference: string; verifiedSha256: string; byteLength: number }>;
  readRawSnapshotBytes: (storageReference: string) => Promise<{ rawPayloadText: string; actualSha256: string } | null>;
}

// ============================================================================
// SECTION 10-22: QUALITY, DEDUP, QUARANTINE, CHECKPOINTS, DELIVERY, LINEAGE, EVENTS
// ============================================================================

export interface SchemaEvolutionReport {
  readonly schemaChanged: boolean;
  readonly missingExpectedFields: readonly string[];
  readonly unexpectedFields: readonly string[];
  readonly changedDataTypes: readonly { field: string; expected: string; actual: string }[];
  readonly incompatibleVersion: boolean;
}

export interface DatasetValidationSummary {
  readonly reportId: string;
  readonly jobId: string;
  readonly sourceId: string;
  readonly datasetId: string;
  readonly schemaVersion: string;
  readonly transformationVersion: string;
  readonly totalRecords: number;
  readonly validRecords: number;
  readonly invalidRecords: number;
  readonly duplicateRecords: number;
  readonly updatedSameSourceRecords: number;
  readonly crossSourceMatchCandidates: number;
  readonly missingFieldsCount: number;
  readonly outlierCandidatesCount: number;
  readonly unrecognizedValuesCount: number;
  readonly geographicResolutionFailures: number;
  readonly staleObservationsCount: number;
  readonly schemaEvolution: SchemaEvolutionReport;
  readonly qualityWarnings: readonly string[];
  readonly humanConfirmationRequiredFields: readonly string[];
  readonly validatedAtIso: string;
}

export type RecordDeduplicationClassification =
  | 'NEW_RECORD'
  | 'EXACT_SAME_SOURCE_DUPLICATE'
  | 'UPDATED_SAME_SOURCE_RECORD'
  | 'POTENTIAL_CROSS_SOURCE_MATCH'
  | 'INDEPENDENT_OBSERVATION';

export type QuarantineReasonCode =
  | 'INVALID_SCHEMA_RECORD'
  | 'UNEXPECTED_SCHEMA_CHANGE'
  | 'CONFLICTING_IDENTIFIER'
  | 'UNCLEAR_GEOGRAPHIC_MAPPING'
  | 'SUSPICIOUS_NUMERIC_OUTLIER'
  | 'INCOMPATIBLE_OR_STALE_DATE'
  | 'UNVERIFIED_SOURCE_DATA'
  | 'POTENTIAL_CROSS_SOURCE_DUPLICATE'
  | 'LICENSE_OR_PII_POLICY_ISSUE'
  | 'MALFORMED_SOURCE_ROW';

export type QuarantineReviewState =
  | 'Pending_Review'
  | 'Approved'
  | 'Rejected'
  | 'Needs_Correction'
  | 'Reprocessed'
  | 'Archived';

export interface QuarantineReviewRecord {
  readonly quarantineId: string;
  readonly jobId: string;
  readonly sourceId: string;
  readonly datasetId: string;
  readonly rawSnapshotId: string;
  readonly rowIndex: number;
  readonly sourceRecordId?: string;
  readonly reasonCode: QuarantineReasonCode;
  readonly validationErrors: readonly ValidationIssue[];
  readonly rawSourceRecord: Record<string, unknown>;
  readonly candidateNormalizedRecord?: Record<string, unknown>;
  readonly reviewStatus: QuarantineReviewState;
  readonly reviewerUid?: string;
  readonly reviewedAtIso?: string;
  readonly resolutionNote?: string;
  readonly reprocessingDecision?: 'reprocess_with_correction' | 'approve_override' | 'permanent_reject';
  readonly createdAt: NormalizedTimestamp;
  readonly updatedAt: NormalizedTimestamp;
}

export interface SyncCheckpointRecord {
  readonly checkpointId: string;
  readonly sourceId: string;
  readonly datasetId: string;
  readonly lastSuccessfulJobId: string;
  readonly lastSourceVersion: string;
  readonly cursorToken?: string;
  readonly lastProcessedTimestampIso: string;
  readonly recordsSyncedCumulative: number;
  readonly updatedAt: NormalizedTimestamp;
}

export interface DataLineageRecord {
  readonly lineageId: string;
  readonly sourceId: string;
  readonly datasetId: string;
  readonly jobId: string;
  readonly sourceRecordId: string;
  readonly naturalKey: string;
  readonly rawSnapshotId: string;
  readonly rawPayloadHashSha256: string;
  readonly normalizedRecordFingerprint: string;
  readonly schemaVersion: string;
  readonly transformationVersion: string;
  readonly validationReportId: string;
  readonly destinationModule: TargetDomainModule;
  readonly deliveryAttemptId?: string;
  readonly deliveryAccepted: boolean;
  readonly contributingSources: readonly string[];
  readonly lineageComplete: boolean;
  readonly createdAtIso: string;
}

export interface DownstreamDeliveryPayloadItem {
  readonly lineageId: string;
  readonly sourceRecordId: string;
  readonly naturalKey: string;
  readonly normalizedRecord: Record<string, unknown>;
  readonly rawPayloadHashSha256: string;
  readonly sourceId: string;
  readonly datasetId: string;
  readonly dataVersion: string;
  readonly schemaVersion: string;
  readonly transformationVersion: string;
  readonly publishedBySourceAtIso?: string;
  readonly retrievedAtIso: string;
  readonly validatedAtIso: string;
}

export interface DownstreamDeliveryReceipt {
  readonly deliveryAttemptId: string;
  readonly jobId: string;
  readonly destinationModule: TargetDomainModule;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly acknowledgedAtIso: string;
  readonly destinationReferenceIds: readonly string[];
}

export interface GeographyDomainDeliveryAdapter {
  deliverValidatedGeographicRecords: (params: {
    jobId: string;
    sourceId: string;
    datasetId: string;
    dataVersion: string;
    records: readonly DownstreamDeliveryPayloadItem[];
  }) => Promise<DownstreamDeliveryReceipt>;
}

export interface CrowdDataDomainDeliveryAdapter {
  deliverExternalMarketObservations: (params: {
    jobId: string;
    sourceId: string;
    datasetId: string;
    dataVersion: string;
    records: readonly DownstreamDeliveryPayloadItem[];
  }) => Promise<DownstreamDeliveryReceipt>;
}

export interface ValuationDomainDeliveryAdapter {
  deliverAggregateMarketIndicators: (params: {
    jobId: string;
    sourceId: string;
    datasetId: string;
    dataVersion: string;
    records: readonly DownstreamDeliveryPayloadItem[];
  }) => Promise<DownstreamDeliveryReceipt>;
}

export type IngestionDomainEventType =
  | 'DataSourceRegistered'
  | 'DatasetRegistered'
  | 'IngestionJobCreated'
  | 'IngestionJobStarted'
  | 'IngestionJobCompleted'
  | 'IngestionJobPartiallyCompleted'
  | 'IngestionJobFailed'
  | 'DatasetSchemaChanged'
  | 'RecordsQuarantined'
  | 'DatasetValidated'
  | 'DatasetDeliveryRequested'
  | 'DatasetDeliveryCompleted'
  | 'DatasetDeliveryFailed'
  | 'SourceCheckpointAdvanced';

export interface IngestionDomainEvent {
  readonly eventId: string;
  readonly eventType: IngestionDomainEventType;
  readonly eventVersion: '1.0';
  readonly timestampIso: string;
  readonly correlationId: string;
  readonly sourceId: string;
  readonly datasetId?: string;
  readonly jobId?: string;
  readonly metadata: Record<string, unknown>;
}

export interface IngestionEventPublisherAdapter {
  publishEvent: (event: IngestionDomainEvent) => Promise<void>;
}

export interface GeographicReferenceValidator {
  isValidCityAndNeighborhood: (cityId: string, hoodId?: number) => boolean;
}

export interface Employee17DataIngestionDependencies {
  readonly tokenVerifier: FirebaseTokenVerifierAdapter;
  readonly adminStore: DelegatedAdminStoreAdapter;
  readonly txRunner: TransactionRunnerAdapter;
  readonly idempotencyStore?: IdempotencyStoreAdapter;
  readonly auditSink?: AuditEventSink;
  readonly secretManager?: SecretManagerCredentialAdapter;
  readonly snapshotStorage?: RawSnapshotStorageAdapter;
  readonly scheduler?: DurableIngestionSchedulerAdapter;
  readonly eventPublisher?: IngestionEventPublisherAdapter;
  readonly geographyValidator?: GeographicReferenceValidator;
  readonly geographyDelivery?: GeographyDomainDeliveryAdapter;
  readonly crowdDataDelivery?: CrowdDataDomainDeliveryAdapter;
  readonly valuationDelivery?: ValuationDomainDeliveryAdapter;
  readonly customConnectors?: readonly ExternalDataConnector[];
  readonly primaryAdminEmails?: string[];
  readonly nowFn?: () => number;
}
