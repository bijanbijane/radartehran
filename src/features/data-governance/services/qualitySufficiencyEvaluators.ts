import {
  DataFreshnessStatus,
  DataQualityStatus,
  MultiDimensionalQualityAssessment,
  SampleSufficiencyStatus,
} from '../models/dataGovernance.types';

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
  const freshness = evaluateDataFreshness({ observedAt: params.observedAt, recordedAt: params.recordedAt });
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

  let overallStatus: DataQualityStatus = 'VERIFIED';
  if (params.hasUnitMismatch) overallStatus = 'REJECTED';
  else if (!params.hasSourceId || !params.hasMethodologyVersion) overallStatus = 'UNVERIFIED';
  else if (coverage === 'INSUFFICIENT') overallStatus = 'INCOMPLETE';
  else if (freshness.freshnessStatus === 'STALE' || freshness.freshnessStatus === 'EXPIRED') overallStatus = 'STALE';
  else if (coverage === 'LIMITED') overallStatus = 'ESTIMATED';

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
