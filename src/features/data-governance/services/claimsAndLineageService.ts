/**
 * RT-UI-DATA-GOV-001 | Multi-Dimensional Quality Evaluator, Independent Witness
 * Confidence Calculator, Historical Snapshot Reconstructor & Public Provenance Builder
 */

import {
  ClaimConfidenceLevel,
  EntityVersionRecord,
  EvidenceRecord,
  PublicProvenanceOutput,
} from '../models/dataGovernance.types';
import { DataGovernanceEngine, defaultDataGovernanceEngine } from './dataGovernanceEngine';
import { evaluateDataFreshness, evaluateMarketSampleSufficiency } from './qualitySufficiencyEvaluators';

export { evaluateDataFreshness, evaluateMarketSampleSufficiency };

export function computeIndependentClaimConfidence(
  evidences: Array<Pick<EvidenceRecord, 'id' | 'sourceId' | 'derivedFromSourceId' | 'verificationStatus'>>,
  options?: {
    hasActiveConflicts?: boolean;
    staleCount?: number;
    reliabilityBySource?: Record<string, 'HIGH' | 'MEDIUM' | 'LOW'>;
  },
): {
  independentWitnessCount: number;
  pendingWitnessCount: number;
  rejectedCount: number;
  resolvedRootSourceIds: string[];
  hasCycleInDerivation: boolean;
  confidenceLevel: ClaimConfidenceLevel;
} {
  const verifiedEvidences = evidences.filter((e) => e.verificationStatus === 'VERIFIED');
  const pendingWitnessCount = evidences.filter((e) => e.verificationStatus === 'PENDING').length;
  const rejectedCount = evidences.filter((e) => e.verificationStatus === 'REJECTED' || e.verificationStatus === 'QUARANTINED').length;

  if (verifiedEvidences.length === 0) {
    return {
      independentWitnessCount: 0,
      pendingWitnessCount,
      rejectedCount,
      resolvedRootSourceIds: [],
      hasCycleInDerivation: false,
      confidenceLevel: 'UNKNOWN',
    };
  }

  const parentMap = new Map<string, string>();
  for (const ev of evidences) {
    if (ev.derivedFromSourceId && ev.sourceId !== ev.derivedFromSourceId) {
      parentMap.set(ev.sourceId, ev.derivedFromSourceId);
    }
  }

  let hasCycleInDerivation = false;
  const resolveRoot = (startSource: string, directDerived?: string): string => {
    let curr = directDerived || startSource;
    const visited = new Set<string>([startSource]);
    if (directDerived) {
      if (visited.has(directDerived)) return directDerived;
      visited.add(directDerived);
    }
    let hops = 0;
    while (parentMap.has(curr) && hops < 16) {
      const next = parentMap.get(curr)!;
      if (visited.has(next)) {
        hasCycleInDerivation = true;
        break;
      }
      visited.add(next);
      curr = next;
      hops += 1;
    }
    return curr;
  };

  const uniqueRootSources = new Set<string>();
  for (const ev of verifiedEvidences) {
    uniqueRootSources.add(resolveRoot(ev.sourceId, ev.derivedFromSourceId));
  }

  const resolvedRootSourceIds = Array.from(uniqueRootSources);
  const count = resolvedRootSourceIds.length;
  let level: ClaimConfidenceLevel = 'LOW';
  if (count >= 3) level = 'VERY_HIGH';
  else if (count === 2) level = 'HIGH';
  else if (count === 1) level = 'MEDIUM';

  if (options?.hasActiveConflicts || (options?.staleCount ?? 0) > 0) {
    if (level === 'VERY_HIGH') level = 'MEDIUM';
    else if (level === 'HIGH' || level === 'MEDIUM') level = 'LOW';
  }
  if (options?.reliabilityBySource) {
    const allLow = resolvedRootSourceIds.every((id) => options.reliabilityBySource?.[id] === 'LOW');
    if (allLow && (level === 'VERY_HIGH' || level === 'HIGH')) level = 'MEDIUM';
  }

  return {
    independentWitnessCount: count,
    pendingWitnessCount,
    rejectedCount,
    resolvedRootSourceIds,
    hasCycleInDerivation,
    confidenceLevel: level,
  };
}

export function validateVersionTimeRanges(versions: EntityVersionRecord[]): { valid: boolean; overlaps: Array<[string, string]> } {
  const sorted = [...versions].sort((a, b) => new Date(a.validFrom).getTime() - new Date(b.validFrom).getTime());
  const overlaps: Array<[string, string]> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const aEnd = sorted[i].validTo ? new Date(sorted[i].validTo!).getTime() : Number.POSITIVE_INFINITY;
    const bStart = new Date(sorted[i + 1].validFrom).getTime();
    if (Number.isFinite(aEnd) && Number.isFinite(bStart) && aEnd > bStart) {
      overlaps.push([sorted[i].id, sorted[i + 1].id]);
    }
  }
  return { valid: overlaps.length === 0, overlaps };
}

export function reconstructEntityAtValidTime(
  versions: EntityVersionRecord[],
  targetValidDateIso: string,
): EntityVersionRecord | null {
  const targetMs = new Date(targetValidDateIso).getTime();
  if (!Number.isFinite(targetMs) || versions.length === 0) return null;
  const candidates = versions
    .filter((v) => {
      const startMs = new Date(v.validFrom).getTime();
      const endMs = v.validTo ? new Date(v.validTo).getTime() : Number.POSITIVE_INFINITY;
      return Number.isFinite(startMs) && targetMs >= startMs && targetMs <= endMs;
    })
    .sort((a, b) => a.versionNumber - b.versionNumber);
  if (candidates.length === 0) return null;
  return candidates[candidates.length - 1];
}

export function compareEntityVersionsDiff(older: EntityVersionRecord, newer: EntityVersionRecord) {
  const valueChanged = older.value !== newer.value;
  const methodologyChanged = older.methodologyVersion !== newer.methodologyVersion;
  const dataVersionChanged = older.dataVersion !== newer.dataVersion;
  const changeClassification: 'DATA_ONLY' | 'METHODOLOGY_ONLY' | 'DATA_AND_METHODOLOGY' | 'NO_CHANGE' =
    methodologyChanged && (dataVersionChanged || valueChanged)
      ? 'DATA_AND_METHODOLOGY'
      : methodologyChanged
        ? 'METHODOLOGY_ONLY'
        : dataVersionChanged || valueChanged
          ? 'DATA_ONLY'
          : 'NO_CHANGE';

  return {
    entityId: newer.entityId,
    attribute: newer.attribute,
    valueChanged,
    methodologyChanged,
    dataVersionChanged,
    changeClassification,
    previousValue: older.value,
    newValue: newer.value,
    previousDataVersion: older.dataVersion,
    newDataVersion: newer.dataVersion,
    previousMethodologyVersion: older.methodologyVersion,
    newMethodologyVersion: newer.methodologyVersion,
    previousQualityStatus: older.qualityStatus,
    newQualityStatus: newer.qualityStatus,
    changeReasonFa: newer.changeReasonFa,
  };
}

export function buildPublicProvenanceContract(params: {
  entityId: string | null;
  neighborhoodNameFa: string;
  sampleCount?: number | null;
  uniqueEntityCount?: number | null;
  observedSampleCount?: number;
  syntheticSampleCount?: number;
  governanceEngine?: DataGovernanceEngine;
}): PublicProvenanceOutput {
  const engine = params.governanceEngine || defaultDataGovernanceEngine;
  const safeNameFa = params.neighborhoodNameFa.trim() || 'محله انتخاب‌شده';
  const versions = params.entityId ? engine.getEntityVersions(params.entityId) : [];
  const lineageEdges = params.entityId ? engine.getLineageForEntity(params.entityId) : [];
  const allSources = engine.getSources();
  const activeSourceMap = new Map(allSources.filter((s) => s.status === 'ACTIVE' || s.status === 'RESTRICTED').map((s) => [s.id, s]));

  const hasRegisteredProvenance = Boolean(params.entityId && (versions.length > 0 || lineageEdges.length > 0));
  const safeSampleCount = typeof params.sampleCount === 'number' && Number.isFinite(params.sampleCount) ? Math.max(0, Math.round(params.sampleCount)) : 0;
  const safeUniqueCount = typeof params.uniqueEntityCount === 'number' && Number.isFinite(params.uniqueEntityCount) ? Math.max(0, Math.round(params.uniqueEntityCount)) : null;

  if (!hasRegisteredProvenance || !params.entityId) {
    const limitationsFa = ['برای این محله هنوز زنجیره منشأ داده (Lineage) و تاریخچه نسخه معتبر در سامانه ثبت نشده است.'];
    if ((params.syntheticSampleCount ?? 0) > 0) limitationsFa.push(`تعداد ${params.syntheticSampleCount} مورد نمونه‌ی نمایشی پایه در محاسبه آمار بازار لحاظ نشده‌اند.`);
    if (safeSampleCount === 0) limitationsFa.push('در حال حاضر آگهی زنده و تاییدشده‌ای برای استخراج توزیع قیمت این محله در مخزن ثبت نشده است.');
    return {
      entityId: params.entityId, provenanceStatus: 'UNREGISTERED', titleFa: `میانه قیمت پیشنهادی هر مترمربع (${safeNameFa})`,
      attribute: 'market_median_asking_price_per_sqm', dataType: 'CALCULATED', qualityStatus: 'UNVERIFIED',
      confidenceLevel: 'UNKNOWN', sufficiencyStatus: 'NOT_ASSESSED', freshnessStatus: 'UNKNOWN',
      referencePeriod: { from: '', to: '', labelFa: 'ثبت نشده' },
      methodology: { code: 'MEDIAN_OFFER_PRICE', nameFa: 'میانه نمونه‌های واجد شرایط پس از حذف داده‌های پرت (IQR)', version: '2.1', verificationScopeFa: 'زنجیره منشأ و دوره مرجع اختصاصی برای این محله ثبت نشده است.' },
      provenance: { sourceCount: 0, independentEvidenceCount: 0, sampleCount: safeSampleCount, uniqueEntityCount: safeUniqueCount, observedAt: '', lastUpdatedAt: '', attributionFa: [] },
      limitationsFa,
    };
  }

  const latestVersion = versions[versions.length - 1];
  const entityClaims = engine.getClaims().filter((c) => c.entityId === params.entityId);
  const entityClaimIds = new Set(entityClaims.map((c) => c.id));
  const publicEvidences = engine.getEvidences().filter(
    (ev) => ev.accessPolicy === 'PUBLIC' && (ev.storageRef.includes(params.entityId!) || ev.relatedClaimIds.some((cid) => entityClaimIds.has(cid))),
  );
  const sourceIds = new Set<string>();
  versions.forEach((v) => { if (activeSourceMap.has(v.sourceId)) sourceIds.add(v.sourceId); });
  entityClaims.forEach((c) => { if (activeSourceMap.has(c.sourceId)) sourceIds.add(c.sourceId); });
  publicEvidences.forEach((ev) => { if (activeSourceMap.has(ev.sourceId)) sourceIds.add(ev.sourceId); });

  const hasActiveConflicts = engine.getReconciliationCases().some((r) => r.entityId === params.entityId && r.status !== 'RESOLVED' && r.status !== 'CLOSED');
  const witnessRes = computeIndependentClaimConfidence(publicEvidences, { hasActiveConflicts });
  const latestEvidence = publicEvidences[publicEvidences.length - 1];
  const observedAt = latestEvidence?.capturedAt || latestVersion?.validFrom || '';
  const lastUpdatedAt = latestVersion?.recordedAt || latestEvidence?.receivedAt || '';
  const suff = evaluateMarketSampleSufficiency({
    targetId: params.entityId, sampleCount: safeSampleCount, uniqueEntityCount: safeUniqueCount ?? safeSampleCount,
    hasSourceId: sourceIds.size > 0, hasMethodologyVersion: Boolean(latestVersion?.methodologyVersion),
    methodologyVersion: latestVersion?.methodologyVersion || '2.1', observedAt, recordedAt: lastUpdatedAt,
    verifiedEvidenceCount: witnessRes.independentWitnessCount,
  });

  const formatJalali = (iso: string) => {
    try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso)); } catch { return iso.slice(0, 10); }
  };
  const attributionFa = Array.from(sourceIds).map((sid) => activeSourceMap.get(sid)).filter((src): src is NonNullable<typeof src> => Boolean(src)).map((src) => src.usagePolicy.attributionTextFa || src.nameFa);
  const limitationsFa = [
    'بر پایه قیمت‌های پیشنهادی آگهی‌ها محاسبه شده و معادل قیمت قطعی معامله ثبتی نیست.',
    ...(safeUniqueCount === null ? ['تعداد املاک یکتا به صورت تفکیک‌شده برای نمونه در دسترس نیست.'] : []),
    ...suff.limitationsFa,
  ];
  return {
    entityId: params.entityId, provenanceStatus: 'REGISTERED', titleFa: `میانه قیمت پیشنهادی هر مترمربع (${safeNameFa})`,
    attribute: 'market_median_asking_price_per_sqm', dataType: 'CALCULATED', qualityStatus: suff.overallStatus,
    confidenceLevel: suff.coverage === 'INSUFFICIENT' ? 'LOW' : suff.coverage === 'LIMITED' ? 'MEDIUM' : witnessRes.confidenceLevel,
    sufficiencyStatus: suff.coverage, freshnessStatus: suff.timeliness,
    referencePeriod: { from: latestVersion?.validFrom ? latestVersion.validFrom.slice(0, 10) : '', to: observedAt ? observedAt.slice(0, 10) : '', labelFa: latestVersion?.validFrom && observedAt ? `${formatJalali(latestVersion.validFrom)} تا ${formatJalali(observedAt)}` : 'ثبت نشده' },
    methodology: { code: 'MEDIAN_OFFER_PRICE', nameFa: 'میانه نمونه‌های واجد شرایط پس از حذف داده‌های پرت (IQR)', version: latestVersion?.methodologyVersion || '2.1', verificationScopeFa: 'روش محاسبه و پالایش داده‌های پرت بررسی شده است (تایید روش ≠ تایید قیمت قطعی معاملات بیرون).' },
    provenance: { sourceCount: sourceIds.size, independentEvidenceCount: witnessRes.independentWitnessCount, sampleCount: safeSampleCount, uniqueEntityCount: safeUniqueCount, observedAt, lastUpdatedAt, attributionFa },
    limitationsFa,
  };
}
