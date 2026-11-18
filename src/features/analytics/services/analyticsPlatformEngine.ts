/**
 * RT-UI-ANALYTICS-001 | Data Platform, Analytics & Research Intelligence Engine
 * Official Metric Registry, Semantic Layer, IQR Distribution & Percentile Engine,
 * SCD Type 2 Place Dimension, Canonical Analysis Hash & K-Anonymity Guard
 */
import {
  AnalyticalIngestionPayload,
  DataPipelineRecord,
  DistributionSummaryStats,
  MetricSnapshotResponse,
  OfficialMetricDefinition,
  PeriodComparisonResult,
  PredictiveModelRegistryEntry,
  ReproducibleAnalysisDefinition,
} from '../models/analytics.types';
import { SampleSufficiencyStatus } from '../../data-governance/models/dataGovernance.types';
import { OFFICIAL_METRIC_REGISTRY, SCD2_PLACE_DIMENSIONS } from './analyticsRegistrySeeds';
import { evaluateTemporalFreshness, sanitizeIso8601OrNull } from '../../../platform/temporal';

export { OFFICIAL_METRIC_REGISTRY, SCD2_PLACE_DIMENSIONS };

export interface SnapshotTemporalMetaInput {
  observedAt?: string | null;
  receivedAt?: string | null;
  publishedAt?: string | null;
  referenceNowIso?: string;
}

function sortJsonKeysDeep(val: unknown): unknown {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(sortJsonKeysDeep);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(val as Record<string, unknown>).sort()) {
    sorted[key] = sortJsonKeysDeep((val as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function computeCanonicalAnalysisHash(
  definition: Omit<ReproducibleAnalysisDefinition, 'analysisId' | 'createdAt' | 'outputSummaryFa' | 'reproducibleHash'>,
): string {
  const canonicalPayload = JSON.stringify(
    sortJsonKeysDeep({
      titleFa: definition.titleFa,
      researchQuestionFa: definition.researchQuestionFa,
      ownerId: definition.ownerId,
      datasetVersions: [...definition.datasetVersions].sort(),
      metricCodes: [...definition.metricCodes].sort(),
      methodologyVersions: [...definition.methodologyVersions].sort(),
      geographicScope: {
        placeIds: [...definition.geographicScope.placeIds].sort(),
        boundaryVersion: definition.geographicScope.boundaryVersion,
      },
      timeRange: definition.timeRange,
    }),
  );
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < canonicalPayload.length; i++) {
    const ch = canonicalPayload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ ch ^ i, 0x85ebca6b);
  }
  return `canon:${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export function enforceMetricNumeratorDenominatorParity(
  metric: Pick<OfficialMetricDefinition, 'metricCode' | 'numeratorFa' | 'denominatorFa'>,
  numeratorValue: number | null,
  denominatorValue: number | null,
): { valid: boolean; value: number | null; reasonFa?: string } {
  if (numeratorValue === null || denominatorValue === null || !Number.isFinite(numeratorValue) || !Number.isFinite(denominatorValue)) {
    return { valid: false, value: null, reasonFa: `مقادیر صورت یا مخرج برای شاخص ${metric.metricCode} کامل نیست.` };
  }
  if (denominatorValue <= 0) {
    return { valid: false, value: null, reasonFa: 'مخرج شاخص صفر است و محاسبه نسبت ممکن نیست.' };
  }
  return { valid: true, value: Number(((numeratorValue / denominatorValue) * 100).toFixed(2)) };
}

export function computePercentile(sortedValues: number[], percentile0To100: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = (percentile0To100 / 100) * (sortedValues.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return Number(sortedValues[lower].toFixed(2));
  const weight = idx - lower;
  return Number((sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight).toFixed(2));
}

export function computeDistributionStats(
  rawValues: number[],
  uniqueEntityCount = rawValues.length,
  trimOutliers = true,
): DistributionSummaryStats {
  const valid = rawValues.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (valid.length === 0) {
    return { count: 0, uniqueEntityCount: 0, mean: 0, median: 0, p10: 0, p25: 0, p75: 0, p90: 0, iqr: 0, trimmedOutlierCount: 0, sufficiencyStatus: 'INSUFFICIENT' };
  }
  const rawQ1 = computePercentile(valid, 25);
  const rawQ3 = computePercentile(valid, 75);
  const rawIqr = rawQ3 - rawQ1;
  let working = valid;
  let trimmedOutlierCount = 0;
  if (trimOutliers && valid.length >= 6 && rawIqr > 0) {
    const filtered = valid.filter((v) => v >= rawQ1 - 1.5 * rawIqr && v <= rawQ3 + 1.5 * rawIqr);
    if (filtered.length >= 3) {
      trimmedOutlierCount = valid.length - filtered.length;
      working = filtered;
    }
  }
  const mean = Number((working.reduce((acc, v) => acc + v, 0) / working.length).toFixed(2));
  const median = computePercentile(working, 50);
  const p10 = computePercentile(working, 10);
  const p25 = computePercentile(working, 25);
  const p75 = computePercentile(working, 75);
  const p90 = computePercentile(working, 90);
  const iqr = Number((p75 - p25).toFixed(2));
  let sufficiencyStatus: SampleSufficiencyStatus = 'STRONG';
  if (uniqueEntityCount < 5) sufficiencyStatus = 'INSUFFICIENT';
  else if (uniqueEntityCount < 25) sufficiencyStatus = 'LIMITED';
  else if (uniqueEntityCount < 60) sufficiencyStatus = 'ADEQUATE';
  return { count: working.length, uniqueEntityCount, mean, median, p10, p25, p75, p90, iqr, trimmedOutlierCount, sufficiencyStatus };
}

export function computeSafePeriodComparison(params: {
  currentPeriodLabelFa: string; previousPeriodLabelFa: string; currentValue: number; previousValue: number;
  currentSampleCount: number; previousSampleCount: number; currentBoundaryVersion: string; previousBoundaryVersion: string;
  compositionChangedSignificantly?: boolean;
}): PeriodComparisonResult {
  const boundaryVersionConsistent = params.currentBoundaryVersion === params.previousBoundaryVersion;
  if (!Number.isFinite(params.previousValue) || params.previousValue <= 0 || params.previousSampleCount <= 0) {
    return {
      currentPeriodLabelFa: params.currentPeriodLabelFa, previousPeriodLabelFa: params.previousPeriodLabelFa,
      currentValue: params.currentValue, previousValue: params.previousValue, changePercent: null, computable: false,
      nonComputableReasonFa: 'داده تاریخی واقعی برای دوره قبل موجود یا دارای حجم نمونه کافی نیست.',
      currentSampleCount: params.currentSampleCount, previousSampleCount: params.previousSampleCount, boundaryVersionConsistent,
    };
  }
  const changePercent = Number((((params.currentValue - params.previousValue) / params.previousValue) * 100).toFixed(2));
  const warnings: string[] = [];
  if (!boundaryVersionConsistent) warnings.push(`نسخه مرز محله بین دو دوره تغییر کرده است (${params.previousBoundaryVersion} ← ${params.currentBoundaryVersion}).`);
  if (params.compositionChangedSignificantly) warnings.push('ترکیب سن بنا و متراژ نمونه‌ها بین دو دوره تغییر محسوسی داشته است.');
  return {
    currentPeriodLabelFa: params.currentPeriodLabelFa, previousPeriodLabelFa: params.previousPeriodLabelFa,
    currentValue: params.currentValue, previousValue: params.previousValue, changePercent, computable: true,
    currentSampleCount: params.currentSampleCount, previousSampleCount: params.previousSampleCount,
    boundaryVersionConsistent, compositionShiftWarningFa: warnings.length > 0 ? warnings.join(' ') : undefined,
  };
}

export class AnalyticsPlatformEngine {
  private processedIdempotencyKeys: Set<string>;
  private quarantinedPayloads: Array<{ payload: Partial<AnalyticalIngestionPayload>; reasonFa: string }> = [];
  private pipelines: DataPipelineRecord[];
  private savedAnalyses: ReproducibleAnalysisDefinition[];
  private modelRegistry: PredictiveModelRegistryEntry[];

  constructor(options: { seedDemo?: boolean } = { seedDemo: false }) {
    const seed = options.seedDemo === true;
    this.processedIdempotencyKeys = new Set(seed ? ['idem-boot-1'] : []);
    this.pipelines = seed ? [{
      id: 'pipe-mkt-gold-1', pipelineCode: 'PIPELINE.MARKET.SNAPSHOT_DAILY',
      titleFa: 'ساخت Snapshot روزانه قیمت پیشنهادی و عرضه (Silver → Gold)',
      sourceSystem: 'ListingOperationalOutbox', targetLayer: 'GOLD', targetDataset: 'FactMarketMetric',
      scheduleFa: 'روزانه ۰۲:۰۰ بامداد', priority: 'HIGH', status: 'SUCCEEDED',
      recordsProcessed: 4820, failedRecords: 14, computeDurationMs: 1420, estimatedCostUnits: 12, actualCostUnits: 11.4,
      lastRunAt: '2026-04-12T02:00:00Z',
    }] : [];
    this.savedAnalyses = seed ? [{
      analysisId: 'ana-rep-1405-01',
      titleFa: 'بررسی شکاف قیمت پیشنهادی و معامله سناریویی در مناطق ۲ و ۵ تهران',
      researchQuestionFa: 'آیا شکاف قیمت پیشنهادی و معامله در آپارتمان‌های ۲خوابه سعادت‌آباد و پونک از الگوی یکسانی پیروی می‌کند؟',
      ownerId: 'researcher-urban-1', datasetVersions: ['mkt-snapshot-2026-04-12'],
      metricCodes: ['MARKET.MEDIAN.ASKING_PRICE_PER_SQM', 'VALUATION.HEDONIC_ESTIMATE_PER_SQM'],
      methodologyVersions: ['2.1', '1405.1'], geographicScope: { placeIds: ['saadat-abad', 'punak'], boundaryVersion: 'v2.0-1405' },
      timeRange: { from: '2026-03-01', to: '2026-04-12', labelFa: 'بهار ۱۴۰۵' },
      createdAt: '2026-04-12T08:00:00Z',
      outputSummaryFa: 'تحلیل مقایسه‌ای ثبت‌شده در فضای پژوهش.', reproducibleHash: 'canon:8841demo',
    }] : [];
    this.modelRegistry = seed ? [{
      modelId: 'mdl-hedonic-v1405', modelNameFa: 'موتور هدونیک برآورد بازه ارزش مسکن تهران',
      analysisType: 'DIAGNOSTIC', version: '1405.1', trainingDatasetVersion: 'gold-hedonic-ref-1405-q1',
      mapePercent: 6.4, uncertaintyBandPercent: 8.5, dataDriftStatus: 'STABLE', conceptDriftStatus: 'STABLE',
      knownLimitationsFa: ['در املاک لوکس بالای ۳۵۰ مترمربع یا کلنگی، بازه عدم‌قطعیت افزایش می‌یابد.'],
      approvedUseCasesFa: ['برآورد بازه اولیه تصمیم‌گیری کنار نمونه‌های مقایسه‌ای'],
      requiresHumanReview: true, status: 'ACTIVE', deployedAt: '2026-03-21T00:00:00Z',
    }] : [];
  }

  public ingestAnalyticalEvent(payload: Partial<AnalyticalIngestionPayload>): {
    status: 'ACCEPTED' | 'DUPLICATE_SKIPPED' | 'QUARANTINED'; reasonFa: string;
  } {
    if (!payload.idempotencyKey || !payload.sourceSystem || !payload.schemaVersion || !payload.occurredAt) {
      this.quarantinedPayloads.push({ payload, reasonFa: 'نقص فیلدهای اجباری قرارداد Ingestion یا عدم تطابق Schema' });
      return { status: 'QUARANTINED', reasonFa: 'ورودی به دلیل نقص Schema به مسیر قرنطینه منتقل شد.' };
    }
    if (this.processedIdempotencyKeys.has(payload.idempotencyKey)) {
      return { status: 'DUPLICATE_SKIPPED', reasonFa: 'رویداد با کلید یکتای قبلی پردازش شده است (جلوگیری از شمارش مضاعف).' };
    }
    this.processedIdempotencyKeys.add(payload.idempotencyKey);
    return { status: 'ACCEPTED', reasonFa: 'رویداد در لایه Landing/Bronze ثبت شد.' };
  }

  public getMetricSnapshotForPlace(
    placeId: string | null, _baseBuyPerSqm = 142, observedValues?: number[], temporalMeta?: SnapshotTemporalMetaInput,
  ): MetricSnapshotResponse {
    const placeDim = placeId ? SCD2_PLACE_DIMENSIONS.find((d) => d.canonicalPlaceId === placeId && d.isCurrent) : undefined;
    const validObserved = Array.isArray(observedValues) ? observedValues.filter((v) => Number.isFinite(v) && v > 0) : [];
    const computedAt = new Date().toISOString();
    const observedAt = sanitizeIso8601OrNull(temporalMeta?.observedAt);
    const receivedAt = sanitizeIso8601OrNull(temporalMeta?.receivedAt);
    const publishedAt = sanitizeIso8601OrNull(temporalMeta?.publishedAt);
    const freshness = evaluateTemporalFreshness({
      observedAt: observedAt ?? undefined,
      receivedAt: receivedAt ?? undefined,
      domain: 'market_snapshot',
      nowMs: temporalMeta?.referenceNowIso ? Date.parse(temporalMeta.referenceNowIso) : undefined,
    });
    if (!placeDim || validObserved.length === 0) {
      return {
        metricCode: 'MARKET.MEDIAN.ASKING_PRICE_PER_SQM', displayNameFa: 'میانه قیمت پیشنهادی هر مترمربع', financialConcept: 'ASKING_PRICE',
        value: null, distribution: undefined, unit: 'MILLION_TOMAN_PER_SQM', period: { from: '', to: '', labelFa: 'ثبت نشده' },
        geography: placeDim
          ? { placeId: placeDim.canonicalPlaceId, placeNameFa: placeDim.placeNameFa, boundaryVersion: placeDim.boundaryVersion }
          : { placeId: placeId || '', placeNameFa: 'ثبت نشده', boundaryVersion: 'ثبت نشده' },
        methodologyVersion: placeDim ? '2.1' : 'NONE', dataSnapshotId: 'UNAVAILABLE',
        qualityStatus: 'UNVERIFIED', sufficiencyStatus: 'NOT_ASSESSED', lastUpdatedAt: '',
        observedAt: null, receivedAt: null, computedAt, publishedAt: null, freshnessStatus: 'UNKNOWN',
        temporal: { observedAt: null, receivedAt: null, computedAt, publishedAt: null, freshnessStatus: 'UNKNOWN' },
        dataOrigin: 'UNAVAILABLE',
        limitationsFa: [placeDim ? 'داده تحلیلی معتبر (آگهی زنده تاییدشده) برای محاسبه توزیع این محله هنوز ثبت نشده است.' : 'برای این محله هنوز اسنپ‌شات آماری در سکوی داده ثبت نشده است.'],
      };
    }
    const dist = computeDistributionStats(validObserved, validObserved.length, true);
    return {
      metricCode: 'MARKET.MEDIAN.ASKING_PRICE_PER_SQM', displayNameFa: 'میانه قیمت پیشنهادی هر مترمربع', financialConcept: 'ASKING_PRICE',
      value: dist.median, distribution: dist, unit: 'MILLION_TOMAN_PER_SQM', period: { from: '', to: '', labelFa: 'نمونه‌های زنده تاییدشده' },
      geography: { placeId: placeDim.canonicalPlaceId, placeNameFa: placeDim.placeNameFa, boundaryVersion: placeDim.boundaryVersion },
      methodologyVersion: '2.1', dataSnapshotId: `live-${placeDim.canonicalPlaceId}`,
      qualityStatus: dist.sufficiencyStatus === 'INSUFFICIENT' ? 'INCOMPLETE' : 'SUPPORTED',
      sufficiencyStatus: dist.sufficiencyStatus, lastUpdatedAt: observedAt ?? receivedAt ?? '',
      observedAt, receivedAt, computedAt, publishedAt, freshnessStatus: freshness.status,
      temporal: { observedAt, receivedAt, computedAt, publishedAt, freshnessStatus: freshness.status },
      dataOrigin: 'OBSERVED',
      limitationsFa: ['محاسبه بر پایه قیمت‌های پیشنهادی آگهی‌های زنده محلی است و معادل قیمت قطعی معامله نیست.', `${dist.trimmedOutlierCount} داده پرت خارج از بازه 1.5×IQR پالایش شده است.`],
    };
  }

  public getPipelines(): DataPipelineRecord[] { return [...this.pipelines]; }
  public getRegisteredModels(): PredictiveModelRegistryEntry[] { return [...this.modelRegistry]; }
  public getSavedAnalyses(): ReproducibleAnalysisDefinition[] { return [...this.savedAnalyses]; }

  public createDemoSimulatedSnapshot(placeId: string, baseBuyPerSqm = 142): MetricSnapshotResponse {
    const placeDim = SCD2_PLACE_DIMENSIONS.find((d) => d.canonicalPlaceId === placeId && d.isCurrent);
    if (!placeDim) return this.getMetricSnapshotForPlace(null);
    const values = [0.88, 0.92, 0.96, 0.99, 1, 1.02, 1.05, 1.09, 1.14].map((f) => baseBuyPerSqm * f);
    const dist = computeDistributionStats(values, values.length, true);
    const computedAt = new Date().toISOString();
    return {
      metricCode: 'MARKET.MEDIAN.ASKING_PRICE_PER_SQM', displayNameFa: 'میانه قیمت پیشنهادی هر مترمربع (نمونه شبیه‌سازی)',
      financialConcept: 'ASKING_PRICE', value: dist.median, distribution: dist, unit: 'MILLION_TOMAN_PER_SQM',
      period: { from: '', to: '', labelFa: 'شبیه‌سازی آزمایشی (فاقد مشاهده واقعی)' },
      geography: { placeId: placeDim.canonicalPlaceId, placeNameFa: placeDim.placeNameFa, boundaryVersion: placeDim.boundaryVersion },
      methodologyVersion: '2.1', dataSnapshotId: `sim-${placeDim.canonicalPlaceId}-demo`, qualityStatus: 'ESTIMATED',
      sufficiencyStatus: dist.sufficiencyStatus, lastUpdatedAt: '', observedAt: null, receivedAt: null,
      computedAt, publishedAt: null, freshnessStatus: 'UNKNOWN',
      temporal: { observedAt: null, receivedAt: null, computedAt, publishedAt: null, freshnessStatus: 'UNKNOWN' },
      dataOrigin: 'SIMULATED',
      limitationsFa: ['توزیع شبیه‌سازی آزمایشی پیرامون مرجع داخلی است و بیانگر داده واقعی بازار نیست.'],
    };
  }

  public canExportDatasetSlice(params: {
    sampleCount: number; uniqueEntityCount?: number; distinctContributorsCount?: number;
    datasetClassification: 'PUBLIC' | 'INTERNAL' | 'RESTRICTED'; callerRole: 'PUBLIC_USER' | 'RESEARCHER' | 'ADMIN';
  }): { allowed: boolean; reasonFa: string } {
    if (params.sampleCount < 5 || (params.uniqueEntityCount !== undefined && params.uniqueEntityCount < 5)) {
      return { allowed: false, reasonFa: 'به دلیل حفاظت از حریم خصوصی و خطر شناسایی فردی (K-Anonymity < 5)، خروجی گرفتن مجاز نیست.' };
    }
    if (params.distinctContributorsCount !== undefined && params.distinctContributorsCount < 2) {
      return { allowed: false, reasonFa: 'خروجی با تعداد منبع/عرضه‌کننده کمتر از ۲ مورد مشمول محدودیت حریم خصوصی است.' };
    }
    if (params.datasetClassification === 'RESTRICTED' && params.callerRole !== 'ADMIN') {
      return { allowed: false, reasonFa: 'دسترسی و Export مجموعه‌داده محدود فقط برای نقش مجاز امکان‌پذیر است.' };
    }
    if (params.datasetClassification === 'INTERNAL' && params.callerRole === 'PUBLIC_USER') {
      return { allowed: false, reasonFa: 'مجموعه‌داده داخلی برای کاربر عمومی قابل دانلود نیست.' };
    }
    return { allowed: true, reasonFa: 'مجاز برای دریافت خروجی تجمیعی' };
  }

  public getOverviewBundle(
    placeId: string | null = null, baseBuyPerSqm = 142, observedValues?: number[], temporalMeta?: SnapshotTemporalMetaInput,
  ) {
    const filteredAnalyses = placeId ? this.savedAnalyses.filter((ana) => ana.geographicScope.placeIds.includes(placeId)) : [];
    return {
      metricsRegistry: OFFICIAL_METRIC_REGISTRY, placeDimensionsScd2: SCD2_PLACE_DIMENSIONS,
      activeSnapshot: this.getMetricSnapshotForPlace(placeId, baseBuyPerSqm, observedValues, temporalMeta),
      pipelines: this.pipelines, savedAnalyses: filteredAnalyses, modelRegistry: this.modelRegistry,
      quarantinedCount: this.quarantinedPayloads.length,
    };
  }
}

export function createDemoAnalyticsPlatformEngine(): AnalyticsPlatformEngine {
  return new AnalyticsPlatformEngine({ seedDemo: true });
}

export const defaultAnalyticsPlatformEngine = new AnalyticsPlatformEngine({ seedDemo: false });
