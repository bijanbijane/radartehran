/** @file server/modules/analytics-research/analyticsRepository.ts — Durable Analytics, Time-Series, Jobs, Exports & Research Workspace */
import crypto from 'node:crypto';
import { AtomicJsonRepository } from '../shared/atomicJsonRepository';
import {
  computeCanonicalAnalysisHash,
  OFFICIAL_METRIC_REGISTRY,
  SCD2_PLACE_DIMENSIONS,
} from '../../../src/features/analytics/services/analyticsPlatformEngine';
import type {
  AnalyticalIngestionPayload,
  AnalyticalStorageLayer,
  DimPlaceScd2Record,
  PredictiveModelRegistryEntry,
  ReproducibleAnalysisDefinition,
} from '../../../src/features/analytics/models/analytics.types';

export interface ObservedPeriodSeriesPoint {
  placeId: string;
  periodFrom: string;
  periodTo: string;
  periodLabelFa: string;
  boundaryVersion: string;
  values: number[];
  uniqueEntityCount: number;
  compositionChangedSignificantly?: boolean;
  recordedAt: string;
  sourceSystem: string;
}

export interface PipelineDefinitionRecord {
  id: string;
  pipelineCode: string;
  titleFa: string;
  sourceSystem: string;
  targetLayer: AnalyticalStorageLayer;
  targetDataset: string;
  scheduleFa: string;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  enabled: boolean;
}

export interface PipelineExecutionRunRecord {
  runId: string;
  pipelineId: string;
  pipelineCode: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  triggeredBy: string;
  recordsProcessed: number;
  failedRecords: number;
  computeDurationMs: number;
  errorFa?: string;
  startedAtIso: string;
  finishedAtIso?: string;
}

export interface AnalyticsExportJobRecord {
  exportId: string;
  placeId: string | null;
  format: 'csv' | 'json';
  requestedByUid: string;
  callerRole: 'PUBLIC_USER' | 'RESEARCHER' | 'ADMIN';
  datasetClassification: 'PUBLIC' | 'INTERNAL' | 'RESTRICTED';
  sampleCount: number;
  status: 'READY' | 'REJECTED';
  rejectionReasonFa?: string;
  fileName: string;
  mimeType: string;
  contentText: string;
  limitationsFa: string[];
  createdAtIso: string;
}

export interface GovernedModelEntry extends PredictiveModelRegistryEntry {
  evaluationStatus: 'NOT_EVALUATED' | 'EVALUATED';
}

export interface ReproducibleAnalysisStored extends ReproducibleAnalysisDefinition {
  visibility: 'PRIVATE' | 'TEAM' | 'PUBLIC';
}

export interface PersistedAnalyticsState {
  schemaVersion: number;
  processedIdempotencyKeys: string[];
  quarantinedPayloads: Array<{ payload: Partial<AnalyticalIngestionPayload>; reasonFa: string; atIso: string }>;
  observedSeriesByPlace: Record<string, ObservedPeriodSeriesPoint[]>;
  pipelineDefinitions: PipelineDefinitionRecord[];
  pipelineRuns: PipelineExecutionRunRecord[];
  savedAnalyses: ReproducibleAnalysisStored[];
  exportJobs: AnalyticsExportJobRecord[];
  modelRegistry: GovernedModelEntry[];
  placeDimensions: DimPlaceScd2Record[];
  updatedAtIso: string;
}

const analyticsRepo = new AtomicJsonRepository<PersistedAnalyticsState>('analytics-research-state.json');

export function createInitialAnalyticsState(): PersistedAnalyticsState {
  return {
    schemaVersion: 2,
    processedIdempotencyKeys: [],
    quarantinedPayloads: [],
    observedSeriesByPlace: {},
    pipelineDefinitions: [
      {
        id: 'pipe-def-market-daily',
        pipelineCode: 'PIPELINE.MARKET.SNAPSHOT_DAILY',
        titleFa: 'پایش و تجمیع روزانه قیمت پیشنهادی و عرضه (Silver → Gold)',
        sourceSystem: 'ListingOperationalOutbox',
        targetLayer: 'GOLD',
        targetDataset: 'FactMarketMetric',
        scheduleFa: 'روزانه ۰۲:۰۰ بامداد (Incremental)',
        priority: 'HIGH',
        enabled: true,
      },
      {
        id: 'pipe-def-geo-profile',
        pipelineCode: 'PIPELINE.GEO.NEIGHBORHOOD_PROFILE',
        titleFa: 'تجمیع مکانی شاخص‌های کالبدی محلات (Bronze → Silver)',
        sourceSystem: 'TehranGISRegistry',
        targetLayer: 'SILVER',
        targetDataset: 'FactNeighborhoodMetric',
        scheduleFa: 'هفتگی',
        priority: 'NORMAL',
        enabled: true,
      },
    ],
    pipelineRuns: [],
    savedAnalyses: [],
    exportJobs: [],
    modelRegistry: [
      {
        modelId: 'mdl-hedonic-v1405',
        modelNameFa: 'موتور هدونیک برآورد بازه ارزش مسکن رادار',
        analysisType: 'DIAGNOSTIC',
        version: '1405.1',
        trainingDatasetVersion: 'hedonic-feature-matrix-v1405',
        mapePercent: 0,
        uncertaintyBandPercent: 0,
        evaluationStatus: 'NOT_EVALUATED',
        dataDriftStatus: 'STABLE',
        conceptDriftStatus: 'STABLE',
        knownLimitationsFa: [
          'در حالت بدون ارزیابی Backtest واقعی، شاخص MAPE واقعی محاسبه و ادعا نمی‌شود (وضعیت: NOT_EVALUATED).',
          'در املاک خاص، لوکس یا کلنگی دارای قدرالسهم ویژه، برآورد مدل جایگزین کارشناسی رسمی نیست.',
        ],
        approvedUseCasesFa: ['برآورد اولیه بازه قیمت در کنار نمونه‌های واقعی محله'],
        requiresHumanReview: true,
        status: 'ACTIVE',
        deployedAt: new Date().toISOString(),
      },
    ],
    placeDimensions: [...SCD2_PLACE_DIMENSIONS],
    updatedAtIso: new Date().toISOString(),
  };
}

export function getAnalyticsState(): PersistedAnalyticsState {
  return analyticsRepo.load(createInitialAnalyticsState);
}

export function saveAnalyticsState(immediate = false): void {
  const state = getAnalyticsState();
  state.updatedAtIso = new Date().toISOString();
  if (immediate) analyticsRepo.writeImmediate(state);
  else analyticsRepo.saveDebounced(state);
}

export function resetAnalyticsRepositoryForTests(): PersistedAnalyticsState {
  analyticsRepo.resetInMemoryCacheForTests();
  return getAnalyticsState();
}

export function recordObservedSeriesPoint(point: ObservedPeriodSeriesPoint): void {
  const state = getAnalyticsState();
  const list = state.observedSeriesByPlace[point.placeId] || [];
  list.push(point);
  list.sort((a, b) => a.periodTo.localeCompare(b.periodTo));
  if (list.length > 24) list.splice(0, list.length - 24);
  state.observedSeriesByPlace[point.placeId] = list;
  saveAnalyticsState();
}

export function createSavedResearchAnalysis(params: {
  titleFa: string;
  researchQuestionFa: string;
  ownerId: string;
  visibility?: 'PRIVATE' | 'TEAM' | 'PUBLIC';
  placeIds: string[];
  metricCodes: string[];
  timeRange: { from: string; to: string; labelFa: string };
  outputSummaryFa: string;
  boundaryVersion: string;
  datasetVersions: string[];
}): ReproducibleAnalysisStored {
  const state = getAnalyticsState();
  const baseDef = {
    titleFa: params.titleFa,
    researchQuestionFa: params.researchQuestionFa,
    ownerId: params.ownerId,
    datasetVersions: params.datasetVersions,
    metricCodes: params.metricCodes,
    methodologyVersions: OFFICIAL_METRIC_REGISTRY.filter((m) => params.metricCodes.includes(m.metricCode)).map((m) => m.methodologyVersion),
    geographicScope: { placeIds: params.placeIds, boundaryVersion: params.boundaryVersion },
    timeRange: params.timeRange,
  };
  const reproducibleHash = computeCanonicalAnalysisHash(baseDef);
  const record: ReproducibleAnalysisStored = {
    analysisId: `ana-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    ...baseDef,
    createdAt: new Date().toISOString(),
    outputSummaryFa: params.outputSummaryFa,
    reproducibleHash,
    visibility: params.visibility || 'PRIVATE',
  };
  state.savedAnalyses.unshift(record);
  if (state.savedAnalyses.length > 200) state.savedAnalyses.length = 200;
  saveAnalyticsState();
  return record;
}
