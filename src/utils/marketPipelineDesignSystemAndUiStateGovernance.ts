import { CityId } from '../data/multiCityData';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type QuarantineRejectionReason = 'structurally_invalid' | 'semantically_inconsistent' | 'geographically_unresolved' | 'temporally_invalid' | 'duplicate_candidate' | 'suspicious_outlier' | 'missing_provenance';
export interface RawMarketObservationInput { sourceId: string; sourceRecordId: string; observedAtIso: string; cityId?: string; hoodId?: number; transactionType?: 'buy' | 'rent'; buyPerSqmMillion?: number | null; rahn80mMillion?: number | null; sqm?: number | null; rawPayload: Record<string, unknown>; }
export interface QuarantinedMarketRecord { quarantineId: string; rawInput: RawMarketObservationInput; reason: QuarantineRejectionReason; reviewStatus: 'under_investigation' | 'accepted_after_correction' | 'rejected' | 'marked_duplicate'; quarantinedAtIso: string; reviewedBy?: string; }
export interface IngestionBatchResult { batchId: string; stats: { retrieved: number; validated: number; rejected: number; duplicated: number; published: number; }; publishedRecords: Array<{ canonicalId: string; sourceId: string; cityId: CityId; hoodId: number; transactionType: 'buy' | 'rent'; buyPerSqmMillion: number | null; rahn80mMillion: number | null; observedAtIso: string; }>; quarantinedRecords: QuarantinedMarketRecord[]; }
const VALID_CITIES = new Set(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']); export function executeMarketIngestionStagingBatch( batchId: string, inputs: RawMarketObservationInput[], nowIso = new Date().toISOString()
): IngestionBatchResult { const seenKeys = new Set<string>(); const publishedRecords: IngestionBatchResult['publishedRecords'] = []; const quarantinedRecords: QuarantinedMarketRecord[] = []; let duplicated = 0; for (const item of inputs) { if (!item.sourceId || !item.sourceRecordId) { quarantinedRecords.push({
        quarantineId: `q:${batchId}:${quarantinedRecords.length + 1}`, rawInput: item,
        reason: 'missing_provenance', reviewStatus: 'under_investigation', quarantinedAtIso: nowIso, }); continue; }
    const dedupeKey = `${item.sourceId}:${item.sourceRecordId}`;
    if (seenKeys.has(dedupeKey)) { duplicated += 1; quarantinedRecords.push({
        quarantineId: `q:${batchId}:${quarantinedRecords.length + 1}`, rawInput: item,
        reason: 'duplicate_candidate', reviewStatus: 'marked_duplicate', quarantinedAtIso: nowIso, }); continue; }
    seenKeys.add(dedupeKey); if (!item.cityId || !VALID_CITIES.has(item.cityId) || typeof item.hoodId !== 'number' || item.hoodId < 1) { quarantinedRecords.push({
        quarantineId: `q:${batchId}:${quarantinedRecords.length + 1}`, rawInput: item,
        reason: 'geographically_unresolved', reviewStatus: 'under_investigation', quarantinedAtIso: nowIso, }); continue; }
    const obsMs = Date.parse(item.observedAtIso); if (!Number.isFinite(obsMs) || obsMs > Date.now() + 300_000) { quarantinedRecords.push({
        quarantineId: `q:${batchId}:${quarantinedRecords.length + 1}`, rawInput: item,
        reason: 'temporally_invalid', reviewStatus: 'under_investigation', quarantinedAtIso: nowIso, }); continue; }
    const buyVal = item.buyPerSqmMillion ?? null; const rahnVal = item.rahn80mMillion ?? null; if ((buyVal !== null && (buyVal <= 5 || buyVal > 2_000)) || (rahnVal !== null && (rahnVal <= 20 || rahnVal > 50_000)) || (buyVal === null && rahnVal === null)) { quarantinedRecords.push({
        quarantineId: `q:${batchId}:${quarantinedRecords.length + 1}`, rawInput: item,
        reason: 'semantically_inconsistent', reviewStatus: 'under_investigation', quarantinedAtIso: nowIso, }); continue; }
    publishedRecords.push({
      canonicalId: `obs:${dedupeKey}`, sourceId: item.sourceId, cityId: item.cityId as CityId,
      hoodId: item.hoodId, transactionType: item.transactionType === 'rent' ? 'rent' : 'buy', buyPerSqmMillion: buyVal, rahn80mMillion: rahnVal, observedAtIso: item.observedAtIso, }); }
  return {
    batchId,
    stats: {
      retrieved: inputs.length, validated: publishedRecords.length,
      rejected: quarantinedRecords.length, duplicated, published: publishedRecords.length,
    },
    publishedRecords,
    quarantinedRecords,
  };
}
export interface ExternalContractFieldSpec { name: string; expectedType: 'number' | 'string' | 'boolean' | 'object' | 'array'; required: boolean; }
export function detectExternalSchemaDrift(
  providerId: string,
  payload: Record<string, unknown>,
  contractSpecs: ExternalContractFieldSpec[]
): {
  compatible: boolean;
  classification: 'exact_match' | 'backward_compatible_addition' | 'breaking_drift';
  missingRequiredFields: string[];
  typeMismatches: string[];
  unexpectedFields: string[];
} {
  const missingRequiredFields: string[] = [];
  const typeMismatches: string[] = [];
  const knownNames = new Set(contractSpecs.map((s) => s.name));
  for (const spec of contractSpecs) {
    const val = payload[spec.name];
    if (val === undefined || val === null) {
      if (spec.required) missingRequiredFields.push(spec.name);
      continue;
    }
    const actualType = Array.isArray(val) ? 'array' : typeof val;
    if (actualType !== spec.expectedType) {
      typeMismatches.push(`${spec.name}:expected_${spec.expectedType}_got_${actualType}`);
    }
  }
  const unexpectedFields = Object.keys(payload).filter((k) => !knownNames.has(k));
  const hasBreaking = missingRequiredFields.length > 0 || typeMismatches.length > 0;
  return {
    compatible: !hasBreaking,
    classification: hasBreaking
      ? 'breaking_drift'
      : unexpectedFields.length > 0
        ? 'backward_compatible_addition'
        : 'exact_match',
    missingRequiredFields,
    typeMismatches,
    unexpectedFields,
  };
}
export function evaluateComparablePriceAnomalies(
  observations: Array<{ id: string; valueMillion: number }>,
  minSampleSize = 5
): {
  sufficientSample: boolean;
  median: number | null;
  iqr: number | null;
  flaggedAnomalies: Array<{ id: string; valueMillion: number; deviationRatio: number; reasonFa: string }>;
} {
  if (observations.length < minSampleSize) {
    return { sufficientSample: false, median: null, iqr: null, flaggedAnomalies: [] };
  }
  const sorted = [...observations].sort((a, b) => a.valueMillion - b.valueMillion);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1].valueMillion + sorted[mid].valueMillion) / 2 : sorted[mid].valueMillion;
  const q1 = sorted[Math.floor(sorted.length * 0.25)].valueMillion;
  const q3 = sorted[Math.floor(sorted.length * 0.75)].valueMillion;
  const iqr = Math.max(1, q3 - q1);
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const flaggedAnomalies = observations
    .filter((o) => o.valueMillion < lowerFence || o.valueMillion > upperFence)
    .map((o) => ({
      id: o.id,
      valueMillion: o.valueMillion,
      deviationRatio: Number((Math.abs(o.valueMillion - median) / Math.max(1, median)).toFixed(2)),
      reasonFa: `خروج آماری از بازه میان‌چارکی (میانه مرجع: ${Math.round(median)} میلیون؛ نیازمند بازبینی کارشناس، نه حذف خودکار)`,
    }));
  return { sufficientSample: true, median, iqr, flaggedAnomalies };
}
export interface ImmutableMarketDatasetSnapshot {
  readonly snapshotId: string; readonly datasetVersion: string; readonly calculationVersion: string; readonly cityId: CityId;
  readonly periodLabel: string; readonly recordCount: number; readonly averageBuyPerSqm: number; readonly averageRahn80m: number;
  readonly createdAtIso: string; readonly displayAreaUnitLabel?: string; readonly averageBuyPerSqmIntlText?: string;
}
export function createImmutableMarketSnapshot(
  input: { cityId: CityId; periodLabel: string; datasetVersion: string; calculationVersion: string; records: Array<{ buyPerSqm: number; rahn80m: number }>; nowIso?: string },
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
): ImmutableMarketDatasetSnapshot {
  const count = input.records.length;
  const avgBuy = count > 0 ? Math.round(input.records.reduce((s, r) => s + r.buyPerSqm, 0) / count) : 0;
  const avgRahn = count > 0 ? Math.round(input.records.reduce((s, r) => s + r.rahn80m, 0) / count) : 0;
  const snap: ImmutableMarketDatasetSnapshot = {
    snapshotId: `snap:${input.cityId}:${input.periodLabel}:${input.datasetVersion}:${input.calculationVersion}`,
    datasetVersion: input.datasetVersion,
    calculationVersion: input.calculationVersion,
    cityId: input.cityId,
    periodLabel: input.periodLabel,
    recordCount: count,
    averageBuyPerSqm: avgBuy,
    averageRahn80m: avgRahn,
    createdAtIso: input.nowIso || new Date().toISOString(),
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    averageBuyPerSqmIntlText: formatMillionTomanAsIntlCurrency(avgBuy, intlCurrency),
  };
  return Object.freeze(snap);
}
export function reconcileDerivedMarketAggregate(
  sourceBuyPrices: number[],
  publishedAverageBuy: number
): {
  reconciled: boolean;
  recomputedAverageBuy: number | null;
  discrepancyClassification: 'consistent' | 'empty_source' | 'rounding_divergence' | 'stale_or_corrupted_aggregate';
} {
  if (sourceBuyPrices.length === 0) {
    return { reconciled: false, recomputedAverageBuy: null, discrepancyClassification: 'empty_source' };
  }
  const exactAvg = sourceBuyPrices.reduce((s, v) => s + v, 0) / sourceBuyPrices.length;
  const recomputed = Math.round(exactAvg);
  const diff = Math.abs(recomputed - publishedAverageBuy);
  if (diff === 0) return { reconciled: true, recomputedAverageBuy: recomputed, discrepancyClassification: 'consistent' };
  if (diff <= 1) return { reconciled: true, recomputedAverageBuy: recomputed, discrepancyClassification: 'rounding_divergence' };
  return { reconciled: false, recomputedAverageBuy: recomputed, discrepancyClassification: 'stale_or_corrupted_aggregate' };
}
export type SamplePublicationGateState =
  | 'sufficient_sample'
  | 'limited_sample'
  | 'insufficient_sample'
  | 'no_observations';
export function evaluateMetricSamplePublicationGate(
  sampleSize: number,
  metricType: 'median_price' | 'growth_rate' | 'distribution_percentile'
): {
  gateState: SamplePublicationGateState;
  canPublishAsRepresentativeBenchmark: boolean;
  disclosureLabelFa: string;
} {
  if (sampleSize <= 0) {
    return { gateState: 'no_observations', canPublishAsRepresentativeBenchmark: false, disclosureLabelFa: 'مشاهده ثبت‌شده‌ای در این بازه وجود ندارد' };
  }
  const minSufficient = metricType === 'distribution_percentile' ? 15 : metricType === 'growth_rate' ? 8 : 5;
  const minLimited = Math.max(2, Math.floor(minSufficient / 2));
  if (sampleSize >= minSufficient) {
    return { gateState: 'sufficient_sample', canPublishAsRepresentativeBenchmark: true, disclosureLabelFa: `نمونه آماری کافی (${sampleSize} مورد)` };
  }
  if (sampleSize >= minLimited) {
    return { gateState: 'limited_sample', canPublishAsRepresentativeBenchmark: false, disclosureLabelFa: `نمونه محدود (${sampleSize} مورد؛ صرفاً جهت اطلاع اولیه)` };
  }
  return { gateState: 'insufficient_sample', canPublishAsRepresentativeBenchmark: false, disclosureLabelFa: `نمونه ناکافی (${sampleSize} مورد؛ غیرقابل استناد به‌عنوان شاخص محله)` };
}
export function computeSearchFacetCounts<T extends { status: 'green' | 'yellow' | 'red'; hasBargains: boolean; highMetro: boolean }>(
  eligibleItems: T[]
): {
  totalMatching: number;
  byStatus: Record<'green' | 'yellow' | 'red', number>;
  withBargainsCount: number;
  highMetroCount: number;
} {
  const byStatus = { green: 0, yellow: 0, red: 0 };
  let withBargainsCount = 0;
  let highMetroCount = 0;
  for (const item of eligibleItems) {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    if (item.hasBargains) withBargainsCount += 1;
    if (item.highMetro) highMetroCount += 1;
  }
  return { totalMatching: eligibleItems.length, byStatus, withBargainsCount, highMetroCount };
}
export function rankSearchCandidatesWithExplainability<
  T extends { id: number; name: string; buyPerSqm: number; overallScore: number; budgetMatchRatio: number }
>(
  candidates: T[],
  explicitSortBy: 'relevance' | 'price_asc' | 'price_desc' | 'score_desc'
): Array<{ item: T; relevanceScore: number; explanationFa: string }> {
  const scored = candidates.map((item) => {
    const budgetPts = Math.min(50, Math.round(item.budgetMatchRatio * 40));
    const qualityPts = Math.round(item.overallScore * 5);
    const relevanceScore = budgetPts + qualityPts;
    return {
      item,
      relevanceScore,
      explanationFa: `تطابق بودجه (${budgetPts} امتیاز) + کیفیت زیرساخت محله (${qualityPts} امتیاز)`,
    };
  });
  scored.sort((a, b) => {
    if (explicitSortBy === 'price_asc') return a.item.buyPerSqm - b.item.buyPerSqm || a.item.id - b.item.id;
    if (explicitSortBy === 'price_desc') return b.item.buyPerSqm - a.item.buyPerSqm || a.item.id - b.item.id;
    if (explicitSortBy === 'score_desc') return b.item.overallScore - a.item.overallScore || a.item.id - b.item.id;
    return b.relevanceScore - a.relevanceScore || a.item.id - b.item.id;
  });
  return scored;
}
export interface UserPropertyCollection {
  collectionId: string;
  ownerUid: string;
  title: string;
  listingIds: string[];
  updatedAtIso: string;
}
export function addListingToUserCollection(
  collection: UserPropertyCollection,
  actorUid: string,
  listingId: string,
  nowIso = new Date().toISOString()
): { ok: boolean; reason?: string; updated?: UserPropertyCollection } {
  if (collection.ownerUid !== actorUid) return { ok: false, reason: 'COLLECTION_OWNERSHIP_MISMATCH' };
  if (collection.listingIds.includes(listingId)) return { ok: true, updated: collection };
  return {
    ok: true,
    updated: { ...collection, listingIds: [...collection.listingIds, listingId], updatedAtIso: nowIso },
  };
}
export interface TransientToastItem {
  id: string;
  dedupeKey: string;
  severity: 'success' | 'error' | 'warning' | 'info';
  messageFa: string;
  ariaLive: 'polite' | 'assertive';
  durationMs: number;
}
export function enqueueTransientToast(
  currentQueue: TransientToastItem[],
  incoming: Omit<TransientToastItem, 'ariaLive' | 'durationMs'>,
  maxQueueSize = 3
): TransientToastItem[] {
  const filtered = currentQueue.filter((t) => t.dedupeKey !== incoming.dedupeKey);
  const fullToast: TransientToastItem = {
    ...incoming,
    ariaLive: incoming.severity === 'error' ? 'assertive' : 'polite',
    durationMs: incoming.severity === 'error' ? 6000 : 4000,
  };
  return [fullToast, ...filtered].slice(0, maxQueueSize);
}
export type FormPersistenceState =
  | 'unchanged'
  | 'modified_unsaved'
  | 'save_in_progress'
  | 'saved'
  | 'save_failed'
  | 'autosave_pending';
export function evaluateUnsavedNavigationGuard(
  state: FormPersistenceState,
  currentEditRevision: number,
  lastSavedRevision: number
): { shouldBlockNavigation: boolean; promptMessageFa: string; canOfferSaveBeforeLeave: boolean } { const hasUnpersistedEdits =
    currentEditRevision > lastSavedRevision &&
    (state === 'modified_unsaved' || state === 'save_failed' || state === 'autosave_pending' || state === 'save_in_progress'); return { shouldBlockNavigation: hasUnpersistedEdits, promptMessageFa: hasUnpersistedEdits ? 'تغییرات شما هنوز ذخیره نشده است. آیا پیش از خروج مایل به ذخیره هستید؟' : '', canOfferSaveBeforeLeave: hasUnpersistedEdits && state !== 'save_in_progress', }; } export function resolveAccessibleMotionConfig(prefersReducedMotion: boolean): { mapFlyDurationSec: number; drawerTransitionMs: number; skeletonShimmerEnabled: boolean; } { return prefersReducedMotion
    ? { mapFlyDurationSec: 0, drawerTransitionMs: 0, skeletonShimmerEnabled: false } : { mapFlyDurationSec: 0.7, drawerTransitionMs: 220, skeletonShimmerEnabled: true }; }