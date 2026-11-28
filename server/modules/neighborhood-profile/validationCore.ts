import {
  NIPS_DOMAIN_IDS,
  type NipsDomainId,
  type NipsDomainState,
  type NipsMetric,
  type NipsNeighborhoodProfile,
  type NipsProfileQuality,
} from './types';

export type NipsProfileValidationCode =
  | 'INVALID_PROFILE_ID'
  | 'INVALID_PROFILE_VERSION'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_DOMAIN_SET'
  | 'INVALID_DOMAIN_STATE'
  | 'INVALID_READINESS_COUNT'
  | 'INVALID_METRIC_ID'
  | 'INVALID_METRIC_STATE_VALUE'
  | 'INVALID_METRIC_NULL_SEMANTICS'
  | 'INVALID_METRIC_PERIOD'
  | 'INVALID_METRIC_GEO_REFERENCE'
  | 'INVALID_METRIC_PROVENANCE'
  | 'INVALID_METRIC_QUALITY'
  | 'INVALID_QUALITY_SUMMARY'
  | 'INVALID_JSON_VALUE'
  | 'PUBLICATION_POLICY_VIOLATION';

export interface NipsProfileValidationIssue {
  readonly code: NipsProfileValidationCode;
  readonly path: string;
  readonly message: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const HASH = /^[a-f0-9]{64}$/i;
const NON_VALUE_STATES = ['MISSING', 'UNAVAILABLE', 'SUPPRESSED', 'NOT_APPLICABLE'] as const;
const PUBLISHABLE_STATES = ['OBSERVED', 'ESTIMATED', 'ALLOCATED'] as const;
const BLOCKED_STATES = ['SUPPRESSED', 'UNDER_REVIEW'] as const;
export const REQUIRED_PUBLICATION_DOMAINS = ['identity', 'geography', 'evidence'] as const;
export const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const finiteRatio = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

export interface NipsPublicationPolicy {
  readonly productKey: string;
  readonly audience: 'PUBLIC' | 'INTERNAL' | 'RESTRICTED';
  readonly version: string;
  readonly requiredDomains: readonly NipsDomainId[];
  readonly allowedStatesByDomain: Partial<Readonly<Record<NipsDomainId, readonly NipsDomainState[]>>>;
  readonly maxBlockedMetrics: number;
  readonly minimumPublishableMetricsByRequiredDomain?: Partial<Readonly<Record<NipsDomainId, number>>>;
}

export const NIPS_DEFAULT_PUBLICATION_POLICY: NipsPublicationPolicy = {
  productKey: 'neighborhood-profile',
  audience: 'PUBLIC',
  version: '1.0.0',
  requiredDomains: ['identity', 'geography', 'evidence'],
  allowedStatesByDomain: {
    identity: ['READY'],
    geography: ['READY'],
    evidence: ['READY'],
    demographics: ['READY', 'PARTIAL', 'UNAVAILABLE', 'NOT_APPLICABLE'],
    socioeconomic: ['READY', 'PARTIAL', 'UNAVAILABLE', 'NOT_APPLICABLE'],
    real_estate: ['READY', 'PARTIAL', 'UNAVAILABLE', 'NOT_APPLICABLE'],
    building_stock: ['READY', 'PARTIAL', 'UNAVAILABLE', 'NOT_APPLICABLE'],
    land_use: ['READY', 'PARTIAL', 'UNAVAILABLE', 'NOT_APPLICABLE'],
    infrastructure: ['READY', 'PARTIAL', 'UNAVAILABLE', 'NOT_APPLICABLE'],
    mobility: ['READY', 'PARTIAL', 'UNAVAILABLE', 'NOT_APPLICABLE'],
    environment: ['READY', 'PARTIAL', 'UNAVAILABLE', 'NOT_APPLICABLE'],
    safety: ['READY', 'PARTIAL', 'UNAVAILABLE', 'NOT_APPLICABLE'],
    history: ['READY', 'PARTIAL', 'UNAVAILABLE', 'NOT_APPLICABLE'],
    intelligence: ['READY', 'PARTIAL', 'UNAVAILABLE', 'NOT_APPLICABLE'],
  },
  maxBlockedMetrics: 0,
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Strict JSON subset validator. It rejects getters, sparse arrays, symbols,
 * non-index array properties, Date/class instances and cyclic structures.
 */
function isJsonValue(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;

  const objectValue = value as object;
  if (ancestors.has(objectValue)) return false;
  ancestors.add(objectValue);

  try {
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      for (const key of keys) {
        if (key === 'length') continue;
        if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) return false;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) return false;
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !('value' in descriptor) || !isJsonValue(descriptor.value, ancestors)) return false;
      }
      return true;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      if (typeof key !== 'string') return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) return false;
      if (!isJsonValue(descriptor.value, ancestors)) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    ancestors.delete(objectValue);
  }
}

export const isIsoTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));

export function pushIssue(
  issues: NipsProfileValidationIssue[],
  code: NipsProfileValidationCode,
  path: string,
  message: string
): void {
  issues.push({ code, path, message });
}

export function countMetricsByState(metrics: readonly NipsMetric[]): {
  publishable: number;
  blocked: number;
  stale: number;
  unavailable: number;
} {
  return {
    publishable: metrics.filter((metric) => (PUBLISHABLE_STATES as readonly string[]).includes(metric.state)).length,
    blocked: metrics.filter((metric) => (BLOCKED_STATES as readonly string[]).includes(metric.state)).length,
    stale: metrics.filter((metric) => metric.state === 'STALE').length,
    unavailable: metrics.filter((metric) => (NON_VALUE_STATES as readonly string[]).includes(metric.state)).length,
  };
}

export function validateMetric(metric: unknown, path: string, issues: NipsProfileValidationIssue[]): void {
  if (!isRecord(metric)) {
    pushIssue(issues, 'INVALID_JSON_VALUE', path, 'Metric must be an object.');
    return;
  }

  if (typeof metric.metricId !== 'string' || !metric.metricId.trim()) {
    pushIssue(issues, 'INVALID_METRIC_ID', path + '.metricId', 'شناسه شاخص خالی است.');
  }
  if (!isJsonValue(metric.value)) {
    pushIssue(issues, 'INVALID_JSON_VALUE', path + '.value', 'مقدار شاخص باید JSON معتبر و بدون عدد غیرمتناهی، تابع، تاریخ یا مرجع دوری باشد.');
  }

  const state = metric.state;
  if (state === 'OBSERVED' && metric.value === null) {
    pushIssue(issues, 'INVALID_METRIC_STATE_VALUE', path + '.value', 'شاخص مشاهده‌شده نمی‌تواند null باشد.');
  }
  if ((NON_VALUE_STATES as readonly unknown[]).includes(state) && metric.value !== null) {
    pushIssue(issues, 'INVALID_METRIC_NULL_SEMANTICS', path + '.value', 'برای این وضعیت مقدار باید null باشد؛ صفر فقط مقدار مشاهده‌شده است.');
  }

  if (!isRecord(metric.period)) {
    pushIssue(issues, 'INVALID_METRIC_PERIOD', path + '.period', 'قرارداد زمانی شاخص معتبر نیست.');
  } else {
    if (!isIsoTimestamp(metric.period.observedAt)) {
      pushIssue(issues, 'INVALID_METRIC_PERIOD', path + '.period.observedAt', 'زمان مشاهده باید ISO-8601 معتبر باشد.');
    }
    for (const date of [metric.period.periodStart, metric.period.periodEnd, metric.period.asOf]) {
      if (date !== null && !isIsoTimestamp(date)) {
        pushIssue(issues, 'INVALID_METRIC_PERIOD', path + '.period', 'تاریخ‌های دوره باید ISO-8601 معتبر باشند.');
      }
    }
    if (
      isIsoTimestamp(metric.period.periodStart) &&
      isIsoTimestamp(metric.period.periodEnd) &&
      Date.parse(metric.period.periodStart) > Date.parse(metric.period.periodEnd)
    ) {
      pushIssue(issues, 'INVALID_METRIC_PERIOD', path + '.period', 'شروع دوره بعد از پایان دوره است.');
    }
  }

  if (!isRecord(metric.geography)) {
    pushIssue(issues, 'INVALID_METRIC_GEO_REFERENCE', path + '.geography', 'قرارداد جغرافیایی شاخص معتبر نیست.');
  } else if (metric.geography.level === 'NEIGHBORHOOD' &&
      (typeof metric.geography.canonicalEntityId !== 'string' || !metric.geography.canonicalEntityId.trim())) {
    pushIssue(issues, 'INVALID_METRIC_GEO_REFERENCE', path + '.geography', 'شاخص سطح محله باید شناسه کانونیک داشته باشد.');
  }

  if (typeof metric.methodologyId !== 'string' || !metric.methodologyId.trim() ||
      typeof metric.methodologyVersion !== 'string' || !metric.methodologyVersion.trim()) {
    pushIssue(issues, 'INVALID_METRIC_PROVENANCE', path + '.methodologyId', 'روش محاسبه و نسخه آن الزامی است.');
  }

  if (!isRecord(metric.provenance) || !Array.isArray(metric.provenance.evidence)) {
    pushIssue(issues, 'INVALID_METRIC_PROVENANCE', path + '.provenance', 'منشأ شاخص باید ساختار معتبر داشته باشد.');
  } else {
    const evidenceRequired = !(NON_VALUE_STATES as readonly unknown[]).includes(state);
    if (evidenceRequired && metric.provenance.evidence.length === 0) {
      pushIssue(issues, 'INVALID_METRIC_PROVENANCE', path + '.provenance.evidence', 'شاخص دارای مقدار باید مرجع شاهد داشته باشد.');
    }
    metric.provenance.evidence.forEach((evidence: unknown, index: number) => {
      if (!isRecord(evidence) ||
          typeof evidence.evidenceId !== 'string' || !evidence.evidenceId.trim() ||
          typeof evidence.evidenceHash !== 'string' || !HASH.test(evidence.evidenceHash)) {
        pushIssue(issues, 'INVALID_METRIC_PROVENANCE', path + '.provenance.evidence[' + index + ']', 'شناسه یا هش شاهد معتبر نیست.');
      }
    });
  }

  if (!isRecord(metric.quality)) {
    pushIssue(issues, 'INVALID_METRIC_QUALITY', path + '.quality', 'قرارداد کیفیت شاخص معتبر نیست.');
  } else {
    const quality = metric.quality;
    if (
      (quality.confidence !== null && !finiteRatio(quality.confidence)) ||
      (quality.coverageRatio !== null && !finiteRatio(quality.coverageRatio)) ||
      (quality.sampleSize !== null && !count(quality.sampleSize))
    ) {
      pushIssue(issues, 'INVALID_METRIC_QUALITY', path + '.quality', 'مقادیر کیفیت باید متناهی و در دامنه معتبر باشند.');
    }
  }
}

export function validateQualitySummary(
  profile: Record<string, unknown>,
  envelopes: readonly Record<string, unknown>[],
  issues: NipsProfileValidationIssue[]
): void {
  if (!isRecord(profile.quality)) {
    pushIssue(issues, 'INVALID_QUALITY_SUMMARY', 'quality', 'خلاصه کیفیت پروفایل معتبر نیست.');
    return;
  }

  const quality = profile.quality as unknown as NipsProfileQuality;
  const numericFields = [
    quality.domainCount, quality.readyDomainCount, quality.partialDomainCount,
    quality.blockedDomainCount, quality.staleDomainCount, quality.publishableMetricCount,
    quality.blockedMetricCount, quality.unavailableMetricCount,
  ];
  if (!numericFields.every(count) || quality.domainCount !== NIPS_DOMAIN_IDS.length) {
    pushIssue(issues, 'INVALID_QUALITY_SUMMARY', 'quality', 'خلاصه کیفیت با تعداد دامنه‌ها یا شمارنده‌های معتبر سازگار نیست.');
    return;
  }

  const actualDomainCounts = {
    ready: envelopes.filter((domain) => domain.state === 'READY').length,
    partial: envelopes.filter((domain) => domain.state === 'PARTIAL').length,
    blocked: envelopes.filter((domain) => domain.state === 'BLOCKED').length,
    stale: envelopes.filter((domain) => domain.state === 'STALE').length,
  };
  const actualMetricCounts = envelopes.reduce<{
    publishable: number;
    blocked: number;
    stale: number;
    unavailable: number;
  }>((total, domain) => {
    const metrics = Array.isArray(domain.metrics) ? domain.metrics as NipsMetric[] : [];
    const counts = countMetricsByState(metrics);
    return {
      publishable: total.publishable + counts.publishable,
      blocked: total.blocked + counts.blocked,
      stale: total.stale + counts.stale,
      unavailable: total.unavailable + counts.unavailable,
    };
  }, { publishable: 0, blocked: 0, stale: 0, unavailable: 0 });

  if (
    quality.readyDomainCount !== actualDomainCounts.ready ||
    quality.partialDomainCount !== actualDomainCounts.partial ||
    quality.blockedDomainCount !== actualDomainCounts.blocked ||
    quality.staleDomainCount !== actualDomainCounts.stale ||
    quality.publishableMetricCount !== actualMetricCounts.publishable ||
    quality.blockedMetricCount !== actualMetricCounts.blocked ||
    quality.unavailableMetricCount !== actualMetricCounts.unavailable
  ) {
    pushIssue(issues, 'INVALID_QUALITY_SUMMARY', 'quality', 'شمارنده‌های کلی باید دقیقاً از دامنه‌ها و شاخص‌های موجود محاسبه شوند.');
  }
}

