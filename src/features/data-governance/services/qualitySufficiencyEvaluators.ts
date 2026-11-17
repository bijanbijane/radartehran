/** @file src/features/data-governance/services/qualitySufficiencyEvaluators.ts — Truthful Freshness & Multi-Dimensional Quality Evaluator */
import {
  DataFreshnessStatus,
  DataQualityStatus,
  MultiDimensionalQualityAssessment,
  SampleSufficiencyStatus,
} from '../models/dataGovernance.types';

/**
 * Data Freshness & Anti-Artificial-Renewal Evaluator:
 * Re-copying or re-syncing an old record updates `recordedAt`, while `observedAt` determines freshness.
 */
export function evaluateDataFreshness(params: {
  observedAt: string;
  recordedAt: string;
  referenceNowIso?: string;
  maxFreshDays?: number;
  maxAgingDays?: number;
}): { freshnessStatus: DataFreshnessStatus; ageInDays: number; isFutureTimestamp?: boolean; warningFa?: string } {
  const nowIso = params.referenceNowIso || new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const observedMs = new Date(params.observedAt).getTime();

  if (!Number.isFinite(nowMs) || !Number.isFinite(observedMs)) {
    return { freshnessStatus: 'UNKNOWN', ageInDays: -1, warningFa: 'زمان مشاهده (observedAt) نامعتبر یا نامشخص است.' };
  }
  if (observedMs > nowMs + 60_000) {
    return {
      freshnessStatus: 'UNKNOWN',
      ageInDays: -1,
      isFutureTimestamp: true,
      warningFa: 'زمان مشاهده (observedAt) در آینده ثبت شده و فاقد اعتبار است.',
    };
  }

  const ageInDays = Math.max(0, Math.floor((nowMs - observedMs) / (1000 * 60 * 60 * 24)));
  const freshLimit = params.maxFreshDays ?? 30;
  const agingLimit = params.maxAgingDays ?? 90;

  if (ageInDays <= freshLimit) return { freshnessStatus: 'CURRENT', ageInDays };
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
      warningFa: `داده قدیمی است (${ageInDays} روز از زمان مشاهده گذشته؛ ثبت مجدد در ${params.recordedAt.slice(0, 10) || '—'} تازگی ایجاد نمی‌کند).`,
    };
  }
  return {
    freshnessStatus: 'EXPIRED',
    ageInDays,
    warningFa: `داده منقضی شده است (${ageInDays} روز از زمان مشاهده واقعی گذشته است).`,
  };
}

export function evaluateMarketSampleSufficiency(params: {
  targetId: string;
  sampleCount: number;
  uniqueEntityCount: number;
  hasSourceId: boolean;
  hasMethodologyVersion: boolean;
  methodologyVersion?: string;
  observedAt: string;
  recordedAt: string;
  referenceNowIso?: string;
  verifiedEvidenceCount?: number;
  hasCompletenessGaps?: boolean;
  hasUnitMismatch?: boolean;
  hasDuplicateIds?: boolean;
  runId?: string;
}): MultiDimensionalQualityAssessment {
  const nowIso = params.referenceNowIso || new Date().toISOString();
  const freshness = evaluateDataFreshness({
    observedAt: params.observedAt,
    recordedAt: params.recordedAt,
    referenceNowIso: nowIso,
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

  if (!params.hasSourceId) limitationsFa.push('منبع داده ثبت نشده است؛ تایید بدون منشأ مجاز نیست.');
  if (!params.hasMethodologyVersion) limitationsFa.push('نسخه روش محاسبه (Methodology Version) مشخص نشده است.');
  if (freshness.warningFa) limitationsFa.push(freshness.warningFa);

  const verifiedCount = params.verifiedEvidenceCount ?? 0;
  const completeness: MultiDimensionalQualityAssessment['completeness'] =
    params.hasCompletenessGaps || params.sampleCount < 5 ? 'FAIL' : params.sampleCount < 15 ? 'WARN' : 'PASS';
  const accuracyEvidence: MultiDimensionalQualityAssessment['accuracyEvidence'] = !params.hasSourceId
    ? 'UNVERIFIED'
    : verifiedCount > 0 && params.uniqueEntityCount >= 25
      ? 'VERIFIED'
      : 'SUPPORTED';

  let overallStatus: DataQualityStatus = 'VERIFIED';
  if (params.hasUnitMismatch || freshness.isFutureTimestamp) overallStatus = 'REJECTED';
  else if (!params.hasSourceId || !params.hasMethodologyVersion || freshness.freshnessStatus === 'UNKNOWN') overallStatus = 'UNVERIFIED';
  else if (coverage === 'INSUFFICIENT') overallStatus = 'INCOMPLETE';
  else if (freshness.freshnessStatus === 'STALE' || freshness.freshnessStatus === 'EXPIRED') overallStatus = 'STALE';
  else if (coverage === 'LIMITED' || verifiedCount === 0) overallStatus = 'ESTIMATED';

  const runSuffix = params.runId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id: `qa-${params.targetId}-${runSuffix}`,
    targetType: 'DATASET',
    targetId: params.targetId,
    completeness,
    validity: params.hasUnitMismatch || freshness.isFutureTimestamp ? 'FAIL' : 'PASS',
    accuracyEvidence,
    consistency: params.hasUnitMismatch ? 'FAIL' : 'PASS',
    timeliness: freshness.freshnessStatus,
    uniqueness: params.hasDuplicateIds ? 'DUPLICATE_DETECTED' : 'UNIQUE',
    coverage,
    traceability: params.hasSourceId ? 'FULL_LINEAGE' : 'MISSING_SOURCE',
    overallStatus,
    sampleCount: params.sampleCount,
    uniqueEntityCount: params.uniqueEntityCount,
    methodologyVersion: params.methodologyVersion || 'NONE',
    assessedAt: nowIso,
    assessedBy: 'quality-engine-v28',
    limitationsFa,
  };
}
