import crypto from 'crypto';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface TimeSeriesPoint { timestampIso: string; labelFa: string; value: number | null; status: 'observed' | 'missing_no_observation' | 'explicit_zero' | 'provider_unavailable' | 'interpolated_estimate'; }
export interface DownsampledChartPoint extends TimeSeriesPoint { pointOrigin: 'raw_observed' | 'downsampled_extremum'; sourceIndex: number; } export function downsampleTimeSeriesPreservingExtrema( series: TimeSeriesPoint[], targetMaxPoints: number
): DownsampledChartPoint[] { if (series.length === 0) return []; if (targetMaxPoints >= series.length || targetMaxPoints < 3) { return series.map((pt, idx) => ({ ...pt, pointOrigin: 'raw_observed', sourceIndex: idx })); } const numericIndices = series
    .map((pt, idx) => ({ idx, val: pt.value }))
    .filter((x): x is { idx: number; val: number } => typeof x.val === 'number' && Number.isFinite(x.val)); const minIdx = numericIndices.reduce((best, cur) => (cur.val < best.val ? cur : best), numericIndices[0] || { idx: 0, val: 0 }).idx; const maxIdx = numericIndices.reduce((best, cur) => (cur.val > best.val ? cur : best), numericIndices[0] || { idx: 0, val: 0 }).idx; const mandatoryIndices = new Set<number>([0, series.length - 1, minIdx, maxIdx]); series.forEach((pt, idx) => { if (pt.value === null || pt.status === 'missing_no_observation' || pt.status === 'provider_unavailable') mandatoryIndices.add(idx); }); const step = (series.length - 1) / (targetMaxPoints - 1); for (let i = 1; i < targetMaxPoints - 1; i++) { if (mandatoryIndices.size >= targetMaxPoints) break; mandatoryIndices.add(Math.round(i * step)); }
  return Array.from(mandatoryIndices)
    .sort((a, b) => a - b)
    .map((idx) => ({ ...series[idx], pointOrigin: idx === 0 || idx === series.length - 1 || idx === minIdx || idx === maxIdx ? 'raw_observed' : 'downsampled_extremum', sourceIndex: idx, })); } export function segmentTimeSeriesAcrossGaps( series: TimeSeriesPoint[], maxContinuousMissingPoints = 1
): { segments: TimeSeriesPoint[][]; hasBrokenGaps: boolean } { const segments: TimeSeriesPoint[][] = []; let current: TimeSeriesPoint[] = []; let missingStreak = 0; let hasBrokenGaps = false; for (const pt of series) { const isMissing = pt.value === null && pt.status !== 'explicit_zero'; if (isMissing) { missingStreak += 1; if (missingStreak > maxContinuousMissingPoints && current.length > 0) { segments.push(current); current = []; hasBrokenGaps = true; } } else { missingStreak = 0; current.push(pt); } }
  if (current.length > 0) segments.push(current); return { segments, hasBrokenGaps }; }
export function computeSeasonallyAdjustedSeries( monthlyObservations: Array<{ monthIndex1to12: number; rawValue: number }>, calculationVersion = 'seasonal-v1'
): { eligibleForSeasonalAdjustment: boolean; reason?: string; calculationVersion: string; points: Array<{ monthIndex1to12: number; rawObserved: number; seasonalIndex: number; seasonallyAdjusted: number }>; } { if (monthlyObservations.length < 12) {
    return { eligibleForSeasonalAdjustment: false, reason: 'INSUFFICIENT_TEMPORAL_DEPTH_REQUIRES_12_MONTHS', calculationVersion, points: [], }; }
  const mean = monthlyObservations.reduce((s, p) => s + p.rawValue, 0) / monthlyObservations.length; if (!Number.isFinite(mean) || mean <= 0 || monthlyObservations.some((p) => !Number.isFinite(p.rawValue) || p.rawValue < 0)) { return { eligibleForSeasonalAdjustment: false, reason: 'NON_POSITIVE_SERIES_MEAN', calculationVersion, points: [] }; }
  const IRAN_HOUSING_SEASONAL_FACTORS: Record<number, number> = { 1: 0.94, 2: 1.03, 3: 1.05, 4: 1.07, 5: 1.08, 6: 1.06, 7: 0.98, 8: 0.96, 9: 0.95, 10: 0.94, 11: 0.96, 12: 0.98, };
  const points = monthlyObservations.map((obs) => { const seasonalIndex = IRAN_HOUSING_SEASONAL_FACTORS[obs.monthIndex1to12] || 1.0; return { monthIndex1to12: obs.monthIndex1to12,
      rawObserved: obs.rawValue, seasonalIndex, seasonallyAdjusted: Number((obs.rawValue / seasonalIndex).toFixed(1)), };
  }); return { eligibleForSeasonalAdjustment: true, calculationVersion, points }; }
export interface ExternalDataSourceLicenseEntry {
  sourceId: 'osm_boundaries' | 'carto_basemap' | 'esri_imagery' | 'open_meteo' | 'divar_public_aggregates';
  providerName: string; licenseId: string; requiredAttributionText: string;
  allowPublicDisplay: boolean; allowDerivedAnalytics: boolean; allowRawRedistributionExport: boolean;
}
export const EXTERNAL_DATA_LICENSE_REGISTRY: Record<ExternalDataSourceLicenseEntry['sourceId'], ExternalDataSourceLicenseEntry> = {
  osm_boundaries: {
    sourceId: 'osm_boundaries', providerName: 'OpenStreetMap Contributors', licenseId: 'ODbL-1.0',
    requiredAttributionText: '© OpenStreetMap contributors (ODbL)',
    allowPublicDisplay: true, allowDerivedAnalytics: true, allowRawRedistributionExport: true,
  },
  carto_basemap: {
    sourceId: 'carto_basemap', providerName: 'CARTO', licenseId: 'CC-BY-4.0 / ODbL',
    requiredAttributionText: '© OpenStreetMap contributors © CARTO',
    allowPublicDisplay: true, allowDerivedAnalytics: false, allowRawRedistributionExport: false,
  },
  esri_imagery: {
    sourceId: 'esri_imagery', providerName: 'Esri World Imagery', licenseId: 'Esri Master License',
    requiredAttributionText: 'Tiles © Esri',
    allowPublicDisplay: true, allowDerivedAnalytics: false, allowRawRedistributionExport: false,
  },
  open_meteo: {
    sourceId: 'open_meteo', providerName: 'Open-Meteo Weather & Air Quality API', licenseId: 'CC-BY-4.0',
    requiredAttributionText: 'Weather & AQI data by Open-Meteo.com (CC BY 4.0)',
    allowPublicDisplay: true, allowDerivedAnalytics: true, allowRawRedistributionExport: false,
  },
  divar_public_aggregates: {
    sourceId: 'divar_public_aggregates', providerName: 'Divar Public Listing Benchmarks',
    licenseId: 'Fair-Use Derived Benchmark Only',
    requiredAttributionText: 'برآورد مشتق‌شده از آگهی‌های عمومی بازار',
    allowPublicDisplay: true, allowDerivedAnalytics: true, allowRawRedistributionExport: false,
  },
};
export type ExternalSourceFreshnessState = 'fresh' | 'aging' | 'stale' | 'delayed' | 'unavailable';
export function evaluateExternalSourceFreshness(input: {
  sourceType: 'air_quality' | 'weather' | 'market_benchmarks'; lastObservedAtMs: number | null; lastFetchedAtMs: number | null; nowMs?: number;
}): {
  freshnessState: ExternalSourceFreshnessState; ageMinutes: number | null; canEnterLiveCalculation: boolean; statusLabelFa: string;
} {
  const now = input.nowMs ?? Date.now();
  const refMs = input.lastObservedAtMs ?? input.lastFetchedAtMs;
  if (!refMs || !Number.isFinite(refMs) || refMs <= 0) {
    return { freshnessState: 'unavailable', ageMinutes: null, canEnterLiveCalculation: false, statusLabelFa: 'داده زنده در دسترس نیست (استفاده از کش پایه)' };
  }
  const ageMin = Math.max(0, Math.round((now - refMs) / 60_000));
  const freshLimit = input.sourceType === 'weather' ? 30 : input.sourceType === 'air_quality' ? 60 : 180;
  const agingLimit = freshLimit * 2;
  const staleLimit = freshLimit * 6;
  if (ageMin <= freshLimit) {
    return { freshnessState: 'fresh', ageMinutes: ageMin, canEnterLiveCalculation: true, statusLabelFa: `به‌روز (${ageMin} دقیقه پیش)` };
  }
  if (ageMin <= agingLimit) {
    return { freshnessState: 'aging', ageMinutes: ageMin, canEnterLiveCalculation: true, statusLabelFa: `در آستانه بروزرسانی (${ageMin} دقیقه پیش)` };
  }
  if (ageMin <= staleLimit) {
    return { freshnessState: 'delayed', ageMinutes: ageMin, canEnterLiveCalculation: false, statusLabelFa: `با تأخیر (${ageMin} دقیقه پیش)` };
  }
  return { freshnessState: 'stale', ageMinutes: ageMin, canEnterLiveCalculation: false, statusLabelFa: `داده قدیمی (${ageMin} دقیقه پیش؛ غیرفعال در محاسبه لحظه‌ای)` };
}
export interface MarketObservationCorrectionEvent {
  correctionId: string; observationId: string; hoodId: number;
  action: 'correct_observation' | 'withdraw_invalid' | 'mark_disputed' | 'restore_retracted';
  previousValueMillion: number; correctedValueMillion: number | null; actorId: string; reason: string;
  correctedAtIso: string; invalidatedDownstreamHoodIds: number[]; displayAreaUnitLabel?: string; previousValueIntlText?: string;
}
export function propagateMarketObservationCorrection(
  input: {
    observationId: string; hoodId: number; action: MarketObservationCorrectionEvent['action'];
    previousValueMillion: number; correctedValueMillion: number | null; actorId: string; reason: string; nowIso?: string;
  },
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
): MarketObservationCorrectionEvent {
  return {
    correctionId: `corr:${input.observationId}:${Date.now()}`,
    observationId: input.observationId,
    hoodId: input.hoodId,
    action: input.action,
    previousValueMillion: input.previousValueMillion,
    correctedValueMillion: input.action === 'withdraw_invalid' ? null : input.correctedValueMillion,
    actorId: input.actorId,
    reason: input.reason,
    correctedAtIso: input.nowIso || new Date().toISOString(),
    invalidatedDownstreamHoodIds: [input.hoodId],
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    previousValueIntlText: formatMillionTomanAsIntlCurrency(input.previousValueMillion, intlCurrency),
  };
}
export function evaluateNeighborhoodCoverageQuality(input: {
  hoodId: number; observationCount: number; distinctSourcesCount: number; attributeCompletenessRatio: number; lastUpdatedHoursAgo: number;
}): {
  coverageState: 'strong_coverage' | 'moderate_coverage' | 'limited_coverage' | 'insufficient_coverage' | 'no_available_data';
  dimensions: { volumeAdequate: boolean; multiSourceVerified: boolean; attributesComplete: boolean; recentlyUpdated: boolean };
} {
  if (input.observationCount <= 0) {
    return {
      coverageState: 'no_available_data',
      dimensions: { volumeAdequate: false, multiSourceVerified: false, attributesComplete: false, recentlyUpdated: false },
    };
  }
  const volumeAdequate = input.observationCount >= 10;
  const multiSourceVerified = input.distinctSourcesCount >= 2;
  const attributesComplete = input.attributeCompletenessRatio >= 0.85;
  const recentlyUpdated = input.lastUpdatedHoursAgo <= 24;
  const passedCount = [volumeAdequate, multiSourceVerified, attributesComplete, recentlyUpdated].filter(Boolean).length;
  const coverageState =
    passedCount === 4
      ? 'strong_coverage'
      : passedCount === 3
        ? 'moderate_coverage'
        : input.observationCount >= 3
          ? 'limited_coverage'
          : 'insufficient_coverage';
  return { coverageState, dimensions: { volumeAdequate, multiSourceVerified, attributesComplete, recentlyUpdated } };
}
export class BlobUrlLifecycleRegistry {
  private activeUrls = new Map<string, { objectUrl: string; ownerId: string; refCount: number }>();
  acquireUrl(blobKey: string, ownerId: string, factory: () => string): string {
    const existing = this.activeUrls.get(blobKey);
    if (existing) {
      existing.refCount += 1;
      return existing.objectUrl;
    }
    if (this.activeUrls.size >= 1000) {
      const oldestKey = this.activeUrls.keys().next().value;
      if (oldestKey !== undefined) this.activeUrls.delete(oldestKey);
    }
    const created = factory();
    this.activeUrls.set(blobKey, { objectUrl: created, ownerId, refCount: 1 });
    return created;
  }
  releaseUrl(blobKey: string, revoker: (url: string) => void): boolean {
    const existing = this.activeUrls.get(blobKey);
    if (!existing) return false;
    existing.refCount -= 1;
    if (existing.refCount <= 0) {
      this.activeUrls.delete(blobKey);
      revoker(existing.objectUrl);
      return true;
    }
    return false;
  }
  getActiveCount(): number {
    return this.activeUrls.size;
  }
}
export interface ResumableUploadSession {
  uploadId: string; ownerUid: string; totalBytes: number; confirmedBytesTransferred: number;
  status: 'uploading' | 'paused' | 'completed' | 'failed' | 'expired'; expiresAtMs: number;
}
export function advanceResumableUploadChunk(
  session: ResumableUploadSession,
  actorUid: string,
  chunkOffset: number,
  chunkByteLength: number,
  nowMs = Date.now()
): { ok: boolean; reason?: string; updated?: ResumableUploadSession; progressPercent: number } {
  if (session.ownerUid !== actorUid) {
    return { ok: false, reason: 'UPLOAD_SESSION_OWNER_MISMATCH', progressPercent: 0 };
  }
  if (nowMs > session.expiresAtMs) {
    return { ok: false, reason: 'UPLOAD_SESSION_EXPIRED', progressPercent: 0 };
  }
  if (!Number.isFinite(chunkByteLength) || chunkByteLength < 0) {
    return { ok: false, reason: 'INVALID_CHUNK_BYTE_LENGTH', progressPercent: 0 };
  }
  if (chunkOffset !== session.confirmedBytesTransferred) {
    return {
      ok: false, reason: 'OFFSET_MISMATCH_RESUME_FROM_CONFIRMED', updated: session,
      progressPercent: Math.min(99, Math.floor((session.confirmedBytesTransferred / Math.max(1, session.totalBytes)) * 100)),
    };
  }
  const nextConfirmed = Math.min(session.totalBytes, session.confirmedBytesTransferred + chunkByteLength);
  const isComplete = nextConfirmed === session.totalBytes;
  const updated: ResumableUploadSession = {
    ...session, confirmedBytesTransferred: nextConfirmed, status: isComplete ? 'completed' : 'uploading',
  };
  return {
    ok: true, updated,
    progressPercent: isComplete ? 100 : Math.min(99, Math.floor((nextConfirmed / Math.max(1, session.totalBytes)) * 100)),
  };
}
export function computeScopedContentSha256Identity(
  ownerUid: string,
  scope: 'session' | 'account' | 'listing',
  fileBuffer: Buffer | Uint8Array
): { sha256Hex: string; scopedDedupeKey: string } {
  const sha256Hex = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  return { sha256Hex, scopedDedupeKey: `dedupe:${scope}:${ownerUid}:${sha256Hex}` };
}
export function shouldExecuteKeyboardShortcut(input: {
  key: string; activeElementTagName: string; isContentEditable: boolean; hasOpenModal: boolean; shortcutAllowedInModal: boolean;
}): boolean {
  const tag = (input.activeElementTagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || input.isContentEditable) {
    return input.key === 'Escape';
  }
  if (input.hasOpenModal && !input.shortcutAllowedInModal) return false;
  return true;
}
export interface LocalDbMigrationStep {
  fromVersion: number;
  toVersion: number;
  migrateRecord: (record: Record<string, unknown>) => Record<string, unknown>;
}
export function runVersionedLocalDataMigrations(
  currentVersion: number,
  targetVersion: number,
  records: Array<Record<string, unknown>>,
  steps: LocalDbMigrationStep[]
): { ok: boolean; finalVersion: number; migratedRecords: Array<Record<string, unknown>>; error?: string } {
  if (currentVersion === targetVersion) {
    return { ok: true, finalVersion: currentVersion, migratedRecords: records };
  }
  let workingVersion = currentVersion;
  let workingRecords = records.map((r) => ({ ...r }));
  let iterations = 0;
  while (workingVersion < targetVersion) {
    iterations += 1;
    if (iterations > 50) {
      return { ok: false, finalVersion: currentVersion, migratedRecords: records, error: 'MIGRATION_CYCLE_OR_STEP_LIMIT_EXCEEDED' };
    }
    const step = steps.find((s) => s.fromVersion === workingVersion);
    if (!step || step.toVersion <= workingVersion) {
      return { ok: false, finalVersion: workingVersion, migratedRecords: records, error: `MISSING_MIGRATION_STEP_FROM_V${workingVersion}` };
    }
    try {
      workingRecords = workingRecords.map((r) => step.migrateRecord({ ...r }));
      workingVersion = step.toVersion;
    } catch {
      return { ok: false, finalVersion: currentVersion, migratedRecords: records, error: `MIGRATION_STEP_FAILED_V${workingVersion}` };
    }
  }
  return { ok: true, finalVersion: workingVersion, migratedRecords: workingRecords };
}
export function evaluateTabVisibilityLifecyclePolicy(input: {
  visibilityState: 'visible' | 'hidden' | 'frozen';
  lastMarketSyncMs: number;
  staleThresholdMs: number;
  nowMs?: number;
}): { shouldPauseBackgroundPolling: boolean; shouldRevalidateImmediatelyOnRestore: boolean; remainingCountdownSec: number; } { const now = input.nowMs ?? Date.now(); const elapsedMs = Math.max(0, now - input.lastMarketSyncMs); const remainingCountdownSec = Math.max(0, Math.ceil((input.staleThresholdMs - elapsedMs) / 1000)); if (input.visibilityState !== 'visible') { return { shouldPauseBackgroundPolling: true, shouldRevalidateImmediatelyOnRestore: false, remainingCountdownSec, }; } return { shouldPauseBackgroundPolling: false, shouldRevalidateImmediatelyOnRestore: elapsedMs >= input.staleThresholdMs, remainingCountdownSec, }; }