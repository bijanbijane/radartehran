/**
 * RT-UI-DATA-GOV-001 | Multi-Dimensional Quality Evaluator, Independent Witness
 * Confidence Calculator, Historical Snapshot Reconstructor & Public Provenance Builder
 */

import {
  ClaimConfidenceLevel,
  DataFreshnessStatus,
  DataQualityStatus,
  EntityVersionRecord,
  EvidenceRecord,
  MultiDimensionalQualityAssessment,
  PublicProvenanceOutput,
  SampleSufficiencyStatus,
} from '../models/dataGovernance.types';
import { defaultDataGovernanceEngine } from './dataGovernanceEngine';

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
 * §12.1–12.5 Data Freshness & Anti-Artificial-Renewal Evaluator:
 * Re-copying or re-syncing an old record updates `recordedAt`, but `observedAt`
 * determines actual freshness!
 */
export function evaluateDataFreshness(params: {
  observedAt: string;
  recordedAt: string;
  referenceNowIso?: string;
  maxFreshDays?: number;
  maxAgingDays?: number;
}): { freshnessStatus: DataFreshnessStatus; ageInDays: number; warningFa?: string } {
  const nowMs = new Date(params.referenceNowIso || '2026-04-12T12:00:00Z').getTime();
  const observedMs = new Date(params.observedAt).getTime();
  if (!Number.isFinite(observedMs)) {
    return { freshnessStatus: 'UNKNOWN', ageInDays: -1, warningFa: 'زمان مشاهده (observedAt) نامشخص است.' };
  }
  const ageInDays = Math.max(0, Math.floor((nowMs - observedMs) / (1000 * 60 * 60 * 24)));
  const freshLimit = params.maxFreshDays ?? 30;
  const agingLimit = params.maxAgingDays ?? 90;

  if (ageInDays <= freshLimit) {
    return { freshnessStatus: 'CURRENT', ageInDays };
  }
  if (ageInDays <= agingLimit) {
    return {
      freshnessStatus: 'AGING',
      ageInDays,
      warningFa: `داده در آستانه کهنگی است (${ageInDays} روز از زمان مشاهده واقعی گذشته است).`,
    };
  }
  if (ageInDays <= agingLimit * 2) {
    return {
      freshnessStatus: 'STALE',
      ageInDays,
      warningFa: `داده قدیمی است (${ageInDays} روز از زمان مشاهده گذشته؛ صرف همگام‌سازی مجدد در ${params.recordedAt.slice(0, 10)} تازگی واقعی ایجاد نمی‌کند).`,
    };
  }
  return {
    freshnessStatus: 'EXPIRED',
    ageInDays,
    warningFa: `داده منقضی شده است (${ageInDays} روز از زمان مرجع گذشته است).`,
  };
}

/**
 * §11.3–11.5 Sample Sufficiency & Multi-Dimensional Quality Assessment
 */
export function evaluateMarketSampleSufficiency(params: {
  targetId: string;
  sampleCount: number;
  uniqueEntityCount: number;
  hasSourceId: boolean;
  hasMethodologyVersion: boolean;
  methodologyVersion?: string;
  observedAt: string;
  recordedAt: string;
  hasUnitMismatch?: boolean;
  hasDuplicateIds?: boolean;
}): MultiDimensionalQualityAssessment {
  const freshness = evaluateDataFreshness({
    observedAt: params.observedAt,
    recordedAt: params.recordedAt,
  });

  let coverage: SampleSufficiencyStatus = 'STRONG';
  const limitationsFa: string[] = [];

  if (params.uniqueEntityCount < 5 || params.sampleCount < 5) {
    coverage = 'INSUFFICIENT';
    limitationsFa.push('تعداد نمونه یکتا کمتر از حد مجاز (۵ مورد) است؛ انتشار عدد قطعی مجاز نیست.');
  } else if (params.uniqueEntityCount < 25) {
    coverage = 'LIMITED';
    limitationsFa.push(`کفایت نمونه محدود است (${params.uniqueEntityCount} ملک یکتا)؛ همراه با بازه عدم‌قطعیت نمایش داده شود.`);
  } else if (params.uniqueEntityCount < 60) {
    coverage = 'ADEQUATE';
  }

  if (!params.hasSourceId) {
    limitationsFa.push('منبع داده ثبت نشده است؛ تایید بدون منشأ مجاز نیست.');
  }
  if (!params.hasMethodologyVersion) {
    limitationsFa.push('نسخه روش محاسبه (Methodology Version) مشخص نشده است.');
  }
  if (freshness.warningFa) {
    limitationsFa.push(freshness.warningFa);
  }

  let overallStatus: DataQualityStatus = 'VERIFIED';
  if (params.hasUnitMismatch) {
    overallStatus = 'REJECTED';
  } else if (!params.hasSourceId || !params.hasMethodologyVersion) {
    overallStatus = 'UNVERIFIED';
  } else if (coverage === 'INSUFFICIENT') {
    overallStatus = 'INCOMPLETE';
  } else if (freshness.freshnessStatus === 'STALE' || freshness.freshnessStatus === 'EXPIRED') {
    overallStatus = 'STALE';
  } else if (coverage === 'LIMITED') {
    overallStatus = 'ESTIMATED';
  }

  return {
    id: `qa-${params.targetId}`,
    targetType: 'DATASET',
    targetId: params.targetId,
    completeness: params.sampleCount >= 5 ? 'PASS' : 'FAIL',
    validity: params.hasUnitMismatch ? 'FAIL' : 'PASS',
    accuracyEvidence: params.hasSourceId && params.uniqueEntityCount >= 25 ? 'VERIFIED' : 'SUPPORTED',
    consistency: params.hasUnitMismatch ? 'FAIL' : 'PASS',
    timeliness: freshness.freshnessStatus,
    uniqueness: params.hasDuplicateIds ? 'DUPLICATE_DETECTED' : 'UNIQUE',
    coverage,
    traceability: params.hasSourceId ? 'FULL_LINEAGE' : 'MISSING_SOURCE',
    overallStatus,
    sampleCount: params.sampleCount,
    uniqueEntityCount: params.uniqueEntityCount,
    methodologyVersion: params.methodologyVersion || 'NONE',
    assessedAt: new Date().toISOString(),
    assessedBy: 'quality-engine-v28',
    limitationsFa,
  };
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
  entityId: string;
  neighborhoodNameFa: string;
  sampleCount: number;
  uniqueEntityCount: number;
}): PublicProvenanceOutput {
  const sources = defaultDataGovernanceEngine.getSources().filter((s) => s.status === 'ACTIVE' || s.status === 'RESTRICTED');
  const suff = evaluateMarketSampleSufficiency({
    targetId: params.entityId,
    sampleCount: params.sampleCount,
    uniqueEntityCount: params.uniqueEntityCount,
    hasSourceId: true,
    hasMethodologyVersion: true,
    methodologyVersion: '2.1',
    observedAt: '2026-04-12T06:00:00Z',
    recordedAt: '2026-04-12T06:05:00Z',
  });

  return {
    entityId: params.entityId,
    titleFa: `میانه قیمت پیشنهادی هر مترمربع (${params.neighborhoodNameFa})`,
    attribute: 'market_median_asking_price_per_sqm',
    dataType: 'CALCULATED',
    qualityStatus: suff.coverage === 'LIMITED' ? 'ESTIMATED' : 'SUPPORTED',
    confidenceLevel: suff.coverage === 'INSUFFICIENT' ? 'LOW' : suff.coverage === 'LIMITED' ? 'MEDIUM' : 'HIGH',
    sufficiencyStatus: suff.coverage,
    freshnessStatus: suff.timeliness,
    referencePeriod: {
      from: '2026-03-21',
      to: '2026-04-12',
      labelFa: 'فروردین و آبان ۱۴۰۵ (پنجره ۳۰ روزه متحرک)',
    },
    methodology: {
      code: 'MEDIAN_OFFER_PRICE',
      nameFa: 'میانه نمونه‌های واجد شرایط پس از حذف داده‌های پرت (IQR)',
      version: '2.1',
      verificationScopeFa: 'روش محاسبه و پالایش داده‌های پرت بررسی شده است (تایید روش ≠ تایید قیمت قطعی معاملات بیرون).',
    },
    provenance: {
      sourceCount: sources.length,
      independentEvidenceCount: 2,
      sampleCount: params.sampleCount,
      uniqueEntityCount: params.uniqueEntityCount,
      observedAt: '2026-04-12T06:00:00Z',
      lastUpdatedAt: '2026-04-12T06:05:00Z',
      attributionFa: [
        'مرجع هندسه مرز محلات: سامانه GIS شهرداری تهران (نسخه ۱۴۰۵)',
        'فایل‌ها و آگهی‌های پالایش‌شده رادار تهران (پیشنهادی فروشندگان)',
      ],
    },
    limitationsFa: [
      'بر پایه قیمت‌های پیشنهادی آگهی‌ها محاسبه شده و معادل قیمت قطعی معامله ثبتی نیست.',
      'پوشش نمونه محدود به آگهی‌های دارای متراژ و قیمت معتبر پس از حذف تکراری‌هاست.',
      ...suff.limitationsFa,
    ],
  };
}
