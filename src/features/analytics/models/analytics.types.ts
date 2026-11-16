/**
 * RT-UI-ANALYTICS-001 | Data Platform, Analytics & Research Intelligence Architecture
 * Canonical Contracts for Medallion Storage Layers, Ingestion Pipeline, Star Schema
 * Facts/Dimensions (SCD Type 2), Metric Registry, Semantic Layer, Research Workspace & Model Registry
 */

import { DataQualityStatus, SampleSufficiencyStatus } from '../../data-governance/models/dataGovernance.types';

export type AnalyticalStorageLayer = 'LANDING' | 'BRONZE' | 'SILVER' | 'GOLD' | 'SEMANTIC_SERVING';

export type PipelineExecutionStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'PARTIALLY_SUCCEEDED'
  | 'FAILED'
  | 'RETRY_SCHEDULED'
  | 'CANCELLED'
  | 'DEAD_LETTER';

export type FinancialMetricConcept =
  | 'ASKING_PRICE'
  | 'TRANSACTION_PRICE'
  | 'VALUATION_ESTIMATE'
  | 'EXPERT_APPRAISAL'
  | 'RENT_DEPOSIT'
  | 'MONTHLY_RENT'
  | 'SUPPLY_VOLUME';

export type FactGrainDefinition =
  | 'SINGLE_LISTING_DAILY_SNAPSHOT'
  | 'SINGLE_PRICE_OBSERVATION_EVENT'
  | 'PLACE_X_MONTH_X_PROPERTY_TYPE'
  | 'PLACE_X_BOUNDARY_VERSION'
  | 'VALUATION_RUN_EVENT';

export type AnalyticsAudienceShell = 'PUBLIC_ANALYTICS' | 'PROFESSIONAL_WORKSPACE' | 'RESEARCH_WORKSPACE' | 'ADMIN_ANALYTICS';

export type AnalyticsDomainCategory =
  | 'MARKET_ANALYTICS'
  | 'NEIGHBORHOOD_ANALYTICS'
  | 'GEOSPATIAL_ANALYTICS'
  | 'PROPERTY_ANALYTICS'
  | 'VALUATION_ANALYTICS'
  | 'SERVICE_ANALYTICS'
  | 'COMMUNITY_ANALYTICS'
  | 'DATA_QUALITY_ANALYTICS'
  | 'PRODUCT_ANALYTICS'
  | 'RESEARCH_ANALYTICS';

export interface AnalyticalIngestionPayload {
  ingestionId: string;
  sourceSystem: string;
  sourceEntity: string;
  sourceVersion: number;
  eventId: string;
  occurredAt: string;
  receivedAt: string;
  schemaVersion: string;
  payloadReference: string;
  idempotencyKey: string;
  numericValue?: number;
  placeId?: string;
}

export interface DimPlaceScd2Record {
  placeKey: string;
  canonicalPlaceId: string;
  placeNameFa: string;
  districtNumber: number;
  boundaryVersion: string;
  areaSqKm: number;
  validFrom: string;
  validTo?: string;
  isCurrent: boolean;
  version: number;
}

export interface OfficialMetricDefinition {
  id: string;
  metricCode: string;
  displayNameFa: string;
  definitionFa: string;
  domain: AnalyticsDomainCategory;
  financialConcept: FinancialMetricConcept;
  formulaFa: string;
  grain: FactGrainDefinition;
  unit: 'MILLION_TOMAN' | 'MILLION_TOMAN_PER_SQM' | 'LISTING_COUNT' | 'PERCENT' | 'DAYS' | 'SCORE_100';
  currency?: 'TOMAN' | 'IRR';
  numeratorFa?: string;
  denominatorFa?: string;
  filtersFa: string[];
  sourcePolicyFa: string;
  minSampleThreshold: number;
  methodologyVersion: string;
  updateFrequencyFa: string;
  limitationsFa: string[];
  owner: string;
  status: 'ACTIVE' | 'DEPRECATED' | 'DRAFT';
}

export interface DistributionSummaryStats {
  count: number;
  uniqueEntityCount: number;
  mean: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  iqr: number;
  trimmedOutlierCount: number;
  sufficiencyStatus: SampleSufficiencyStatus;
}

export interface PeriodComparisonResult {
  currentPeriodLabelFa: string;
  previousPeriodLabelFa: string;
  currentValue: number;
  previousValue: number;
  changePercent: number | null;
  computable: boolean;
  nonComputableReasonFa?: string;
  currentSampleCount: number;
  previousSampleCount: number;
  boundaryVersionConsistent: boolean;
  compositionShiftWarningFa?: string;
}

export interface MetricSnapshotResponse {
  metricCode: string;
  displayNameFa: string;
  financialConcept: FinancialMetricConcept;
  value: number | null;
  distribution?: DistributionSummaryStats;
  unit: OfficialMetricDefinition['unit'];
  period: { from: string; to: string; labelFa: string };
  geography: { placeId: string; placeNameFa: string; boundaryVersion: string };
  methodologyVersion: string;
  dataSnapshotId: string;
  qualityStatus: DataQualityStatus;
  sufficiencyStatus: SampleSufficiencyStatus;
  lastUpdatedAt: string;
  dataOrigin?: 'OBSERVED' | 'SIMULATED' | 'UNAVAILABLE';
  limitationsFa: string[];
}

export interface DataPipelineRecord {
  id: string;
  pipelineCode: string;
  titleFa: string;
  sourceSystem: string;
  targetLayer: AnalyticalStorageLayer;
  targetDataset: string;
  scheduleFa: string;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'EXPERIMENTAL';
  status: PipelineExecutionStatus;
  recordsProcessed: number;
  failedRecords: number;
  computeDurationMs: number;
  estimatedCostUnits: number;
  actualCostUnits: number;
  lastRunAt: string;
}

export interface ReproducibleAnalysisDefinition {
  analysisId: string;
  titleFa: string;
  researchQuestionFa: string;
  ownerId: string;
  datasetVersions: string[];
  metricCodes: string[];
  methodologyVersions: string[];
  geographicScope: { placeIds: string[]; boundaryVersion: string };
  timeRange: { from: string; to: string; labelFa: string };
  createdAt: string;
  outputSummaryFa: string;
  reproducibleHash: string;
}

export interface PredictiveModelRegistryEntry {
  modelId: string;
  modelNameFa: string;
  analysisType: 'DESCRIPTIVE' | 'DIAGNOSTIC' | 'PREDICTIVE' | 'PRESCRIPTIVE';
  version: string;
  trainingDatasetVersion: string;
  mapePercent: number;
  uncertaintyBandPercent: number;
  dataDriftStatus: 'STABLE' | 'MODERATE_DRIFT' | 'HIGH_DRIFT_ALERT';
  conceptDriftStatus: 'STABLE' | 'RECALIBRATION_NEEDED';
  knownLimitationsFa: string[];
  approvedUseCasesFa: string[];
  requiresHumanReview: boolean;
  status: 'ACTIVE' | 'SHADOW_MODE' | 'ROLLED_BACK';
  deployedAt: string;
}
