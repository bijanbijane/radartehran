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
import { defaultDataGovernanceEngine } from './dataGovernanceEngine';
import { evaluateDataFreshness, evaluateMarketSampleSufficiency } from './qualitySufficiencyEvaluators';

export { evaluateDataFreshness, evaluateMarketSampleSufficiency };

/**
 * §6.2 & §10.4 Independent Witness Calculator:
 * Two or three websites copying from a single root source do NOT count as independent witnesses.
 */
export function computeIndependentClaimConfidence(
  evidences: Array<Pick<EvidenceRecord, 'id' | 'sourceId' | 'derivedFromSourceId' | 'verificationStatus'>>
): { independentWitnessCount: number; confidenceLevel: ClaimConfidenceLevel } {
  const verifiedEvidences = evidences.filter((e) => e.verificationStatus === 'VERIFIED' || e.verificationStatus === 'PENDING');
  if (verifiedEvidences.length === 0) {
    return { independentWitnessCount: 0, confidenceLevel: 'UNKNOWN' };
  }
  const uniqueRootSources = new Set<string>();
  for (const ev of verifiedEvidences) {
    const rootSource = ev.derivedFromSourceId || ev.sourceId;
    uniqueRootSources.add(rootSource);
  }
  const count = uniqueRootSources.size;
  if (count >= 3) return { independentWitnessCount: count, confidenceLevel: 'VERY_HIGH' };
  if (count === 2) return { independentWitnessCount: count, confidenceLevel: 'HIGH' };
  if (count === 1) return { independentWitnessCount: 1, confidenceLevel: 'MEDIUM' };
  return { independentWitnessCount: 0, confidenceLevel: 'LOW' };
}

/**
 * §13.4 & §18.6 Historical Snapshot Reconstruction & Side-by-Side Version Comparison
 */
export function reconstructEntityAtValidTime(
  versions: EntityVersionRecord[],
  targetValidDateIso: string
): EntityVersionRecord | null {
  const targetMs = new Date(targetValidDateIso).getTime();
  const candidates = versions.filter((v) => {
    const startMs = new Date(v.validFrom).getTime();
    const endMs = v.validTo ? new Date(v.validTo).getTime() : Number.POSITIVE_INFINITY;
    return targetMs >= startMs && targetMs <= endMs;
  });
  if (candidates.length === 0) return versions[versions.length - 1] || null;
  return candidates[candidates.length - 1];
}

export function compareEntityVersionsDiff(older: EntityVersionRecord, newer: EntityVersionRecord) {
  return {
    entityId: newer.entityId,
    attribute: newer.attribute,
    valueChanged: older.value !== newer.value,
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
}): PublicProvenanceOutput {
  const safeNameFa = params.neighborhoodNameFa.trim() || 'محله انتخاب‌شده';
  const versions = params.entityId ? defaultDataGovernanceEngine.getEntityVersions(params.entityId) : [];
  const lineageEdges = params.entityId ? defaultDataGovernanceEngine.getLineageForEntity(params.entityId) : [];
  const allSources = defaultDataGovernanceEngine.getSources();
  const activeSourceMap = new Map(
    allSources.filter((s) => s.status === 'ACTIVE' || s.status === 'RESTRICTED').map((s) => [s.id, s]),
  );

  const hasRegisteredProvenance = Boolean(params.entityId && (versions.length > 0 || lineageEdges.length > 0));
  const safeSampleCount = typeof params.sampleCount === 'number' && Number.isFinite(params.sampleCount)
    ? Math.max(0, Math.round(params.sampleCount))
    : 0;
  const safeUniqueCount = typeof params.uniqueEntityCount === 'number' && Number.isFinite(params.uniqueEntityCount)
    ? Math.max(0, Math.round(params.uniqueEntityCount))
    : null;

  if (!hasRegisteredProvenance || !params.entityId) {
    const limitationsFa = [
      'برای این محله هنوز زنجیره منشأ داده (Lineage) و تاریخچه نسخه معتبر در سامانه ثبت نشده است.',
    ];
    if ((params.syntheticSampleCount ?? 0) > 0) {
      limitationsFa.push(`تعداد ${params.syntheticSampleCount} مورد نمونه‌ی نمایشی پایه در محاسبه آمار بازار لحاظ نشده‌اند.`);
    }
    if (safeSampleCount === 0) {
      limitationsFa.push('در حال حاضر آگهی زنده و تاییدشده‌ای برای استخراج توزیع قیمت این محله در حافظه محلی ثبت نشده است.');
    }
    return {
      entityId: params.entityId,
      provenanceStatus: 'UNREGISTERED',
      titleFa: `میانه قیمت پیشنهادی هر مترمربع (${safeNameFa})`,
      attribute: 'market_median_asking_price_per_sqm',
      dataType: 'CALCULATED',
      qualityStatus: 'UNVERIFIED',
      confidenceLevel: 'UNKNOWN',
      sufficiencyStatus: 'NOT_ASSESSED',
      freshnessStatus: 'UNKNOWN',
      referencePeriod: { from: '', to: '', labelFa: 'ثبت نشده' },
      methodology: {
        code: 'MEDIAN_OFFER_PRICE',
        nameFa: 'میانه نمونه‌های واجد شرایط پس از حذف داده‌های پرت (IQR)',
        version: '2.1',
        verificationScopeFa: 'زنجیره منشأ و دوره مرجع اختصاصی برای این محله ثبت نشده است.',
      },
      provenance: {
        sourceCount: 0,
        independentEvidenceCount: 0,
        sampleCount: safeSampleCount,
        uniqueEntityCount: safeUniqueCount,
        observedAt: '',
        lastUpdatedAt: '',
        attributionFa: [],
      },
      limitationsFa,
    };
  }

  const latestVersion = versions[versions.length - 1];
  const entityClaims = defaultDataGovernanceEngine.getClaims().filter((c) => c.entityId === params.entityId);
  const entityClaimIds = new Set(entityClaims.map((c) => c.id));
  const publicEvidences = defaultDataGovernanceEngine.getEvidences().filter(
    (ev) =>
      ev.accessPolicy === 'PUBLIC' &&
      (ev.storageRef.includes(params.entityId!) || ev.relatedClaimIds.some((cid) => entityClaimIds.has(cid))),
  );

  const sourceIds = new Set<string>();
  versions.forEach((v) => { if (activeSourceMap.has(v.sourceId)) sourceIds.add(v.sourceId); });
  entityClaims.forEach((c) => { if (activeSourceMap.has(c.sourceId)) sourceIds.add(c.sourceId); });
  publicEvidences.forEach((ev) => { if (activeSourceMap.has(ev.sourceId)) sourceIds.add(ev.sourceId); });

  const witnessRes = computeIndependentClaimConfidence(publicEvidences);
  const latestEvidence = publicEvidences[publicEvidences.length - 1];
  const observedAt = latestEvidence?.capturedAt || latestVersion?.validFrom || '';
  const lastUpdatedAt = latestVersion?.recordedAt || latestEvidence?.receivedAt || '';
  const effectiveUniqueForEval = safeUniqueCount ?? safeSampleCount;

  const suff = evaluateMarketSampleSufficiency({
    targetId: params.entityId,
    sampleCount: safeSampleCount,
    uniqueEntityCount: effectiveUniqueForEval,
    hasSourceId: sourceIds.size > 0,
    hasMethodologyVersion: Boolean(latestVersion?.methodologyVersion),
    methodologyVersion: latestVersion?.methodologyVersion || '2.1',
    observedAt,
    recordedAt: lastUpdatedAt,
  });

  const periodFrom = latestVersion?.validFrom ? latestVersion.validFrom.slice(0, 10) : '';
  const periodTo = observedAt ? observedAt.slice(0, 10) : '';
  const formatJalali = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  };
  const attributionFa = Array.from(sourceIds)
    .map((sid) => activeSourceMap.get(sid))
    .filter((src): src is NonNullable<typeof src> => Boolean(src))
    .map((src) => src.usagePolicy.attributionTextFa || src.nameFa);

  const limitationsFa = [
    'بر پایه قیمت‌های پیشنهادی آگهی‌ها محاسبه شده و معادل قیمت قطعی معامله ثبتی نیست.',
    ...(safeUniqueCount === null ? ['تعداد املاک یکتا به صورت تفکیک‌شده برای نمونه محلی در دسترس نیست.'] : []),
    ...suff.limitationsFa,
  ];

  return {
    entityId: params.entityId,
    provenanceStatus: 'REGISTERED',
    titleFa: `میانه قیمت پیشنهادی هر مترمربع (${safeNameFa})`,
    attribute: 'market_median_asking_price_per_sqm',
    dataType: 'CALCULATED',
    qualityStatus: suff.overallStatus,
    confidenceLevel:
      suff.coverage === 'INSUFFICIENT' ? 'LOW' : suff.coverage === 'LIMITED' ? 'MEDIUM' : witnessRes.confidenceLevel === 'UNKNOWN' ? 'MEDIUM' : witnessRes.confidenceLevel,
    sufficiencyStatus: suff.coverage,
    freshnessStatus: suff.timeliness,
    referencePeriod: {
      from: periodFrom,
      to: periodTo,
      labelFa: latestVersion?.validFrom && observedAt ? `${formatJalali(latestVersion.validFrom)} تا ${formatJalali(observedAt)}` : 'ثبت نشده',
    },
    methodology: {
      code: 'MEDIAN_OFFER_PRICE',
      nameFa: 'میانه نمونه‌های واجد شرایط پس از حذف داده‌های پرت (IQR)',
      version: latestVersion?.methodologyVersion || '2.1',
      verificationScopeFa: 'روش محاسبه و پالایش داده‌های پرت بررسی شده است (تایید روش ≠ تایید قیمت قطعی معاملات بیرون).',
    },
    provenance: {
      sourceCount: sourceIds.size,
      independentEvidenceCount: witnessRes.independentWitnessCount,
      sampleCount: safeSampleCount,
      uniqueEntityCount: safeUniqueCount,
      observedAt,
      lastUpdatedAt,
      attributionFa,
    },
    limitationsFa,
  };
}
