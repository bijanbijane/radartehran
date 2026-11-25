import express from 'express';
import crypto from 'crypto';
import {
  PlatformFoundationStore,
  CoreApiError,
  getRequestTraceContext,
  sendCanonicalSuccess,
  sendCanonicalError,
  verifiedAdminContextMiddleware,
  requireAdminPermission,
  clampPageSize,
  paginateArray,
} from '../platform-foundation/index.ts';

export type AnalyticalWarehouseLayer =
  | 'RAW_INGESTION'
  | 'VALIDATED_STAGING'
  | 'CURATED_ANALYTICAL'
  | 'PUBLISHED_DATASET';

export type DatasetLifecycleStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'DEPRECATED'
  | 'QUARANTINED'
  | 'RETIRED';

export interface AnalyticalDatasetRecord {
  datasetCode: string;
  title: string;
  layer: AnalyticalWarehouseLayer;
  ownerModule: string;
  sourceModule: string;
  schemaVersion: number;
  requiredFields: string[];
  tenantScoped: boolean;
  privacyClassification: 'PUBLIC_AGGREGATED' | 'TENANT_SCOPED_ANALYTICS' | 'K_ANONYMIZED_RESEARCH';
  minKAnonymityCohortSize: number;
  qualityScore: number; // 0..100
  completenessRatio: number; // 0..1
  freshnessLagMinutes: number;
  status: DatasetLifecycleStatus;
  updatedAt: string;
}

export interface DataLineageEdgeRecord {
  lineageId: string;
  sourceSystemModule: string;
  sourceEntityId: string;
  ingestionBatchId: string;
  transformationRuleId: string;
  transformationVersion: number;
  qualityScore: number;
  targetDatasetCode: string;
  publishedMetricCodes: string[];
  recordedAt: string;
}

export interface AnalyticalIngestionBatchResult {
  batchId: string;
  datasetCode: string;
  mode: 'FULL' | 'INCREMENTAL' | 'SNAPSHOT' | 'REPROCESSING';
  acceptedCount: number;
  duplicateRejectedCount: number;
  quarantinedCount: number;
  lateArrivingCount: number;
  qualityScore: number;
  lineageId: string;
  processedAt: string;
}

export interface GovernedMetricDefinition {
  metricCode: string;
  title: string;
  ownerModule: string;
  sourceDatasetCode: string;
  formulaDescription: string;
  unit: 'MILLION_TOMAN_PER_SQM' | 'PERCENTAGE' | 'COUNT' | 'DAYS' | 'INDEX_SCORE';
  hedonicModelVersionRef?: string;
  version: number;
}

export interface ControlledAnalyticalExportRecord {
  exportId: string;
  datasetCode: string;
  format: 'CSV' | 'JSON' | 'PARQUET';
  tenantId: string;
  requestedBy: string;
  storageObjectRef: string; // Employee 63 document storage reference
  rowCount: number;
  kAnonymityVerified: boolean;
  expiresAt: string;
  createdAt: string;
}

const FORBIDDEN_TELEMETRY_ATTRIBUTES = [
  'password',
  'secret',
  'cardNumber',
  'cvv',
  'privateMessageBody',
  'rawKeystrokes',
  'exactGpsHistory',
  'nationalId',
];

export class AnalyticalDataPlatformService {
  private datasets = new Map<string, AnalyticalDatasetRecord>();
  private lineage: DataLineageEdgeRecord[] = [];
  private metrics = new Map<string, GovernedMetricDefinition>();
  private seenRecordHashes = new Map<string, Set<string>>();
  private curatedRows = new Map<string, Array<Record<string, unknown>>>();
  private quarantinedRows = new Map<string, Array<{ record: Record<string, unknown>; reason: string }>>();
  private exports = new Map<string, ControlledAnalyticalExportRecord>();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    const now = new Date().toISOString();
    const defaultDatasets: AnalyticalDatasetRecord[] = [
      {
        datasetCode: 'DS_TEHRAN_DISTRICT_PRICE_MOVEMENT_CURATED',
        title: 'Tehran 22 Districts Price per Sqm & Liquidity Analytical Fact Table',
        layer: 'CURATED_ANALYTICAL',
        ownerModule: 'EMP_79_DATA_WAREHOUSE_ANALYTICS',
        sourceModule: 'EMP_60_MARKET_INTELLIGENCE_INDEX',
        schemaVersion: 1,
        requiredFields: ['city', 'districtId', 'neighborhoodName', 'pricePerSqmMillionToman', 'sampleSize'],
        tenantScoped: false,
        privacyClassification: 'PUBLIC_AGGREGATED',
        minKAnonymityCohortSize: 5,
        qualityScore: 98.5,
        completenessRatio: 1.0,
        freshnessLagMinutes: 12,
        status: 'ACTIVE',
        updatedAt: now,
      },
      {
        datasetCode: 'DS_HEDONIC_VALUATION_PERFORMANCE_PUBLISHED',
        title: 'Hedonic Valuation Confidence & Comparable Accuracy Published Dataset',
        layer: 'PUBLISHED_DATASET',
        ownerModule: 'EMP_79_DATA_WAREHOUSE_ANALYTICS',
        sourceModule: 'EMP_59_HEDONIC_VALUATION_ENGINE',
        schemaVersion: 1,
        requiredFields: ['tenantId', 'districtId', 'hedonicModelVersion', 'estimatedPriceMillionToman', 'cohortSize'],
        tenantScoped: true,
        privacyClassification: 'TENANT_SCOPED_ANALYTICS',
        minKAnonymityCohortSize: 5,
        qualityScore: 97.0,
        completenessRatio: 0.99,
        freshnessLagMinutes: 15,
        status: 'ACTIVE',
        updatedAt: now,
      },
      {
        datasetCode: 'DS_DEMAND_COHORT_RESEARCH_PUBLISHED',
        title: 'Privacy-Safe Buyer & Renter Demand Cohort Research Dataset',
        layer: 'PUBLISHED_DATASET',
        ownerModule: 'EMP_79_DATA_WAREHOUSE_ANALYTICS',
        sourceModule: 'EMP_69_SEARCH_DISCOVERY_RECOMMENDATION',
        schemaVersion: 1,
        requiredFields: ['city', 'districtId', 'budgetBand', 'cohortSize'],
        tenantScoped: false,
        privacyClassification: 'K_ANONYMIZED_RESEARCH',
        minKAnonymityCohortSize: 5,
        qualityScore: 96.0,
        completenessRatio: 0.98,
        freshnessLagMinutes: 20,
        status: 'ACTIVE',
        updatedAt: now,
      },
    ];

    for (const ds of defaultDatasets) {
      this.datasets.set(ds.datasetCode, ds);
      this.seenRecordHashes.set(ds.datasetCode, new Set());
      this.curatedRows.set(ds.datasetCode, []);
      this.quarantinedRows.set(ds.datasetCode, []);
    }

    const defaultMetrics: GovernedMetricDefinition[] = [
      {
        metricCode: 'METRIC_WEIGHTED_PRICE_PER_SQM',
        title: 'Sample-Weighted Neighborhood Price per Square Meter',
        ownerModule: 'EMP_60_MARKET_INTELLIGENCE_INDEX',
        sourceDatasetCode: 'DS_TEHRAN_DISTRICT_PRICE_MOVEMENT_CURATED',
        formulaDescription: 'SUM(pricePerSqmMillionToman * sampleSize) / SUM(sampleSize)',
        unit: 'MILLION_TOMAN_PER_SQM',
        hedonicModelVersionRef: 'hedonic-pricing-engine-v2.4',
        version: 1,
      },
      {
        metricCode: 'METRIC_FAST_SALE_LIQUIDITY_SPREAD',
        title: 'Authoritative Hedonic Fast-Sale Liquidity Discount Spread',
        ownerModule: 'EMP_59_HEDONIC_VALUATION_ENGINE',
        sourceDatasetCode: 'DS_HEDONIC_VALUATION_PERFORMANCE_PUBLISHED',
        formulaDescription: '1 - FAST_SALE_FACTOR (referenced from src/data/hedonicPricingEngine.ts)',
        unit: 'PERCENTAGE',
        hedonicModelVersionRef: 'hedonic-pricing-engine-v2.4',
        version: 1,
      },
    ];

    for (const m of defaultMetrics) {
      this.metrics.set(m.metricCode, m);
    }

    this.lineage.push({
      lineageId: 'lin_bootstrap_tehran_districts',
      sourceSystemModule: 'EMP_70_EXTERNAL_DATA_INGESTION',
      sourceEntityId: 'tehran_market_pulse_feed',
      ingestionBatchId: 'batch_init_001',
      transformationRuleId: 'tr_normalize_district_sqm_v1',
      transformationVersion: 1,
      qualityScore: 98.5,
      targetDatasetCode: 'DS_TEHRAN_DISTRICT_PRICE_MOVEMENT_CURATED',
      publishedMetricCodes: ['METRIC_WEIGHTED_PRICE_PER_SQM'],
      recordedAt: now,
    });
  }

  validateSchemaEvolution(
    datasetCode: string,
    proposedRequiredFields: string[],
    proposedSchemaVersion: number
  ): { compatible: boolean; isAdditive: boolean; missingExistingFields: string[] } {
    const ds = this.datasets.get(datasetCode);
    if (!ds) {
      throw new CoreApiError('NOT_FOUND', `Dataset ${datasetCode} not found`, 404);
    }
    const missingExistingFields = ds.requiredFields.filter((f) => !proposedRequiredFields.includes(f));
    const isAdditive = missingExistingFields.length === 0;
    if (!isAdditive && proposedSchemaVersion <= ds.schemaVersion) {
      throw new CoreApiError(
        'CONFLICT',
        `Breaking analytical schema change on ${datasetCode} requires incremented schemaVersion (> ${ds.schemaVersion})`,
        409,
        { missingExistingFields }
      );
    }
    return { compatible: true, isAdditive, missingExistingFields };
  }

  ingestAnalyticalBatch(input: {
    datasetCode: string;
    mode: 'FULL' | 'INCREMENTAL' | 'SNAPSHOT' | 'REPROCESSING';
    sourceEntityId: string;
    records: Array<Record<string, unknown>>;
  }): AnalyticalIngestionBatchResult {
    const ds = this.datasets.get(input.datasetCode);
    if (!ds) {
      throw new CoreApiError('NOT_FOUND', `Dataset ${input.datasetCode} not found`, 404);
    }

    const seenSet = this.seenRecordHashes.get(input.datasetCode)!;
    if (input.mode === 'FULL' || input.mode === 'REPROCESSING') {
      seenSet.clear();
      this.curatedRows.set(input.datasetCode, []);
    }

    const curated = this.curatedRows.get(input.datasetCode)!;
    const quarantined = this.quarantinedRows.get(input.datasetCode)!;

    let acceptedCount = 0;
    let duplicateRejectedCount = 0;
    let quarantinedCount = 0;
    let lateArrivingCount = 0;

    for (const record of input.records) {
      // Check forbidden PII/credential attributes
      const forbiddenKey = Object.keys(record).find((k) => FORBIDDEN_TELEMETRY_ATTRIBUTES.includes(k));
      if (forbiddenKey) {
        quarantinedCount += 1;
        quarantined.push({ record: { redacted: true }, reason: `Forbidden attribute ${forbiddenKey} blocked` });
        continue;
      }

      // Check required fields (never fabricate missing values)
      const missingField = ds.requiredFields.find(
        (f) => record[f] === undefined || record[f] === null || record[f] === ''
      );
      if (missingField) {
        quarantinedCount += 1;
        quarantined.push({ record, reason: `Missing required schema field: ${missingField}` });
        continue;
      }

      const recordHash = crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
      if (seenSet.has(recordHash)) {
        duplicateRejectedCount += 1;
        continue;
      }

      if (record.isLateArriving === true) {
        lateArrivingCount += 1;
      }

      seenSet.add(recordHash);
      curated.push({ ...record, _ingestedAt: new Date().toISOString() });
      acceptedCount += 1;
    }

    const totalEvaluated = Math.max(1, input.records.length);
    const qualityScore = Number(((acceptedCount / totalEvaluated) * 100).toFixed(2));
    ds.qualityScore = qualityScore;
    ds.completenessRatio = Number((acceptedCount / totalEvaluated).toFixed(4));
    ds.updatedAt = new Date().toISOString();

    const batchId = `batch_${crypto.randomUUID().slice(0, 8)}`;
    const lineageId = `lin_${crypto.randomUUID().slice(0, 8)}`;
    this.lineage.unshift({
      lineageId,
      sourceSystemModule: ds.sourceModule,
      sourceEntityId: input.sourceEntityId,
      ingestionBatchId: batchId,
      transformationRuleId: `tr_${ds.datasetCode.toLowerCase()}_v${ds.schemaVersion}`,
      transformationVersion: ds.schemaVersion,
      qualityScore,
      targetDatasetCode: ds.datasetCode,
      publishedMetricCodes: Array.from(this.metrics.values())
        .filter((m) => m.sourceDatasetCode === ds.datasetCode)
        .map((m) => m.metricCode),
      recordedAt: ds.updatedAt,
    });

    return {
      batchId,
      datasetCode: ds.datasetCode,
      mode: input.mode,
      acceptedCount,
      duplicateRejectedCount,
      quarantinedCount,
      lateArrivingCount,
      qualityScore,
      lineageId,
      processedAt: ds.updatedAt,
    };
  }

  queryDatasetWithPrivacyAndTenantControls(input: {
    datasetCode: string;
    tenantId?: string;
    isCrossTenantAuthorizedAdmin?: boolean;
  }): {
    datasetCode: string;
    rows: Array<Record<string, unknown>>;
    suppressedSmallCohortCount: number;
    qualityScore: number;
    freshnessLagMinutes: number;
  } {
    const ds = this.datasets.get(input.datasetCode);
    if (!ds) {
      throw new CoreApiError('NOT_FOUND', `Dataset ${input.datasetCode} not found`, 404);
    }

    if (ds.tenantScoped && !input.tenantId && !input.isCrossTenantAuthorizedAdmin) {
      throw new CoreApiError(
        'TENANT_ISOLATION_VIOLATION',
        `Dataset ${input.datasetCode} is tenant-scoped; tenantId is required`,
        403
      );
    }

    const rawRows = this.curatedRows.get(input.datasetCode) || [];
    let filtered = rawRows;
    if (ds.tenantScoped && input.tenantId) {
      filtered = rawRows.filter((r) => r.tenantId === input.tenantId);
    }

    // Apply k-anonymity cohort threshold suppression
    let suppressedSmallCohortCount = 0;
    const kSafeRows = filtered.filter((r) => {
      const cohort = Number(r.cohortSize ?? r.sampleSize ?? ds.minKAnonymityCohortSize);
      if (cohort < ds.minKAnonymityCohortSize) {
        suppressedSmallCohortCount += 1;
        return false;
      }
      return true;
    });

    return {
      datasetCode: ds.datasetCode,
      rows: kSafeRows,
      suppressedSmallCohortCount,
      qualityScore: ds.qualityScore,
      freshnessLagMinutes: ds.freshnessLagMinutes,
    };
  }

  createControlledExport(input: {
    datasetCode: string;
    format: 'CSV' | 'JSON' | 'PARQUET';
    tenantId: string;
    requestedBy: string;
  }): ControlledAnalyticalExportRecord {
    const queryResult = this.queryDatasetWithPrivacyAndTenantControls({
      datasetCode: input.datasetCode,
      tenantId: input.tenantId,
    });

    const exportId = `exp_${crypto.randomUUID().slice(0, 8)}`;
    const nowMs = Date.now();
    const record: ControlledAnalyticalExportRecord = {
      exportId,
      datasetCode: input.datasetCode,
      format: input.format,
      tenantId: input.tenantId,
      requestedBy: input.requestedBy,
      storageObjectRef: `r2://radar-analytical-exports/${input.tenantId}/${exportId}.${input.format.toLowerCase()}`,
      rowCount: queryResult.rows.length,
      kAnonymityVerified: true,
      expiresAt: new Date(nowMs + 24 * 3_600_000).toISOString(),
      createdAt: new Date(nowMs).toISOString(),
    };
    this.exports.set(exportId, record);
    return record;
  }

  listDatasets(): AnalyticalDatasetRecord[] {
    return Array.from(this.datasets.values());
  }

  listLineage(): DataLineageEdgeRecord[] {
    return [...this.lineage];
  }

  listMetrics(): GovernedMetricDefinition[] {
    return Array.from(this.metrics.values());
  }

  listExports(): ControlledAnalyticalExportRecord[] {
    return Array.from(this.exports.values());
  }
}

export const analyticalDataPlatformService = new AnalyticalDataPlatformService();

export function createAnalyticalDataPlatformRouter(): express.Router {
  const router = express.Router();
  router.use(verifiedAdminContextMiddleware);

  router.get('/api/admin/analytics/datasets', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.modules.read');
      const items = analyticalDataPlatformService.listDatasets();
      const pageSize = clampPageSize(req.query.pageSize);
      const page = paginateArray(items, pageSize, req.query.cursor as string | undefined, 'datasetCode', 'asc');
      sendCanonicalSuccess(res, trace, { items: page.items }, 200, page.pageInfo);
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.get('/api/admin/analytics/lineage', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.modules.read');
      sendCanonicalSuccess(res, trace, { items: analyticalDataPlatformService.listLineage() });
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.get('/api/admin/analytics/metrics', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.modules.read');
      sendCanonicalSuccess(res, trace, { items: analyticalDataPlatformService.listMetrics() });
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.post('/api/admin/analytics/query', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      const actor = requireAdminPermission(req, 'platform.modules.read');
      const tenantId = req.body?.tenantId ? String(req.body.tenantId) : undefined;
      if (tenantId && actor.actorRole !== 'primary_admin') {
        throw new CoreApiError('TENANT_ISOLATION_VIOLATION', 'Tenant-scoped analytics require primary administrator authorization.', 403);
      }
      const result = analyticalDataPlatformService.queryDatasetWithPrivacyAndTenantControls({
        datasetCode: String(req.body?.datasetCode || ''),
        tenantId,
        isCrossTenantAuthorizedAdmin: actor.actorRole === 'primary_admin',
      });
      sendCanonicalSuccess(res, trace, result);
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.post('/api/admin/analytics/exports', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      const actor = requireAdminPermission(req, 'platform.modules.manage');
      const exp = analyticalDataPlatformService.createControlledExport({
        datasetCode: String(req.body?.datasetCode || 'DS_TEHRAN_DISTRICT_PRICE_MOVEMENT_CURATED'),
        format: (req.body?.format as 'CSV' | 'JSON' | 'PARQUET') || 'JSON',
        tenantId: String(req.body?.tenantId || 'tenant_default'),
        requestedBy: actor.actorId,
      });
      PlatformFoundationStore.appendAuditLog({
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        action: 'ANALYTICAL_EXPORT_CREATE',
        targetModuleCode: 'EMP_79_DATA_WAREHOUSE_ANALYTICS',
        targetEntityType: 'ANALYTICAL_EXPORT',
        targetEntityId: exp.exportId,
        CorrelationId: trace.correlationId,
        reason: req.body?.reason || 'Controlled analytical export',
        beforeState: null,
        afterState: { datasetCode: exp.datasetCode, format: exp.format, rowCount: exp.rowCount },
      });
      sendCanonicalSuccess(res, trace, exp, 201);
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  return router;
}
