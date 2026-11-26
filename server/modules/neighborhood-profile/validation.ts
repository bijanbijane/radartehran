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
const REQUIRED_PUBLICATION_DOMAINS = ['identity', 'geography', 'evidence'] as const;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
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

function isRecord(value: unknown): value is Record<string, unknown> {
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

const isIsoTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));

function pushIssue(
  issues: NipsProfileValidationIssue[],
  code: NipsProfileValidationCode,
  path: string,
  message: string
): void {
  issues.push({ code, path, message });
}

function countMetricsByState(metrics: readonly NipsMetric[]): {
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

function validateMetric(metric: unknown, path: string, issues: NipsProfileValidationIssue[]): void {
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

function validateQualitySummary(
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
  const actualMetricCounts = envelopes.reduce((total, domain) => {
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

export function validateNipsPublicationPolicy(
  profile: NipsNeighborhoodProfile,
  policy: NipsPublicationPolicy = NIPS_DEFAULT_PUBLICATION_POLICY
): readonly NipsProfileValidationIssue[] {
  const issues: NipsProfileValidationIssue[] = [];
  if (!isRecord(policy as unknown)) {
    return [{
      code: 'PUBLICATION_POLICY_VIOLATION',
      path: 'publicationPolicy',
      message: 'سیاست انتشار باید یک شیء معتبر باشد.',
    }];
  }

  const requiredDomains = Array.isArray(policy.requiredDomains) ? policy.requiredDomains : [];
  const uniqueRequiredDomains = new Set(requiredDomains);
  const policyIsInvalid =
    typeof policy.version !== 'string' || !policy.version.trim() ||
    typeof policy.productKey !== 'string' || !policy.productKey.trim() ||
    !['PUBLIC', 'INTERNAL', 'RESTRICTED'].includes(policy.audience) ||
    !Number.isSafeInteger(policy.maxBlockedMetrics) || policy.maxBlockedMetrics < 0 ||
    uniqueRequiredDomains.size !== requiredDomains.length ||
    requiredDomains.some((id) => !NIPS_DOMAIN_IDS.includes(id));
  if (policyIsInvalid) {
    pushIssue(issues, 'PUBLICATION_POLICY_VIOLATION', 'publicationPolicy', 'نسخه، محصول، مخاطب، دامنه‌های الزامی یا سقف شاخص‌های مسدود در سیاست انتشار معتبر نیست.');
  }

  for (const mandatoryDomain of REQUIRED_PUBLICATION_DOMAINS) {
    if (!requiredDomains.includes(mandatoryDomain)) {
      pushIssue(issues, 'PUBLICATION_POLICY_VIOLATION', 'publicationPolicy.requiredDomains', 'هویت، جغرافیا و شواهد دامنه‌های غیرقابل‌حذف انتشار هستند: ' + mandatoryDomain);
    }
  }

  for (const [domainId, states] of Object.entries(policy.allowedStatesByDomain ?? {})) {
    if (
      !NIPS_DOMAIN_IDS.includes(domainId as NipsDomainId) ||
      !Array.isArray(states) ||
      states.some((state) => !['READY', 'PARTIAL', 'STALE', 'BLOCKED', 'UNAVAILABLE', 'NOT_APPLICABLE'].includes(state))
    ) {
      pushIssue(issues, 'PUBLICATION_POLICY_VIOLATION', 'publicationPolicy.allowedStatesByDomain.' + domainId, 'فهرست وضعیت‌های مجاز در سیاست انتشار معتبر نیست.');
    }
  }

  for (const [domainId, minimum] of Object.entries(policy.minimumPublishableMetricsByRequiredDomain ?? {})) {
    if (!NIPS_DOMAIN_IDS.includes(domainId as NipsDomainId) || !count(minimum)) {
      pushIssue(issues, 'PUBLICATION_POLICY_VIOLATION', 'publicationPolicy.minimumPublishableMetricsByRequiredDomain.' + domainId, 'حداقل تعداد شاخص‌های قابل انتشار معتبر نیست.');
    }
  }

  if (!isRecord(profile as unknown) || !isRecord((profile as unknown as Record<string, unknown>).domains)) return issues;
  const profileRecord = profile as unknown as Record<string, unknown>;
  const domainsRecord = profileRecord.domains as Record<string, unknown>;
  const envelopes: Record<string, unknown> = { identity: profileRecord.identity, ...domainsRecord };

  for (const domainId of NIPS_DOMAIN_IDS) {
    const envelope = envelopes[domainId];
    if (!isRecord(envelope) || !isRecord(envelope.readiness)) {
      pushIssue(issues, 'PUBLICATION_POLICY_VIOLATION', 'domains.' + domainId, 'دامنه الزامی یا وضعیت آمادگی آن موجود نیست.');
      continue;
    }
    const allowed = policy.allowedStatesByDomain?.[domainId] ??
      (requiredDomains.includes(domainId) ? ['READY'] : ['READY', 'PARTIAL', 'UNAVAILABLE', 'NOT_APPLICABLE']);
    if (!allowed.includes(envelope.state as NipsDomainState)) {
      pushIssue(issues, 'PUBLICATION_POLICY_VIOLATION', 'domains.' + domainId + '.state', 'وضعیت دامنه با سیاست انتشار این محصول سازگار نیست.');
    }
    if (REQUIRED_PUBLICATION_DOMAINS.includes(domainId as typeof REQUIRED_PUBLICATION_DOMAINS[number]) &&
        envelope.state !== 'READY') {
      pushIssue(issues, 'PUBLICATION_POLICY_VIOLATION', 'domains.' + domainId + '.state', 'دامنه هویت، جغرافیا و شواهد باید همواره READY باشد.');
    }
    if (typeof envelope.readiness.blockedMetricCount !== 'number' ||
        envelope.readiness.blockedMetricCount > policy.maxBlockedMetrics) {
      pushIssue(issues, 'PUBLICATION_POLICY_VIOLATION', 'domains.' + domainId + '.readiness.blockedMetricCount', 'تعداد شاخص‌های مسدود از سقف مجاز سیاست انتشار بیشتر است.');
    }
    if (requiredDomains.includes(domainId as NipsDomainId)) {
      const minimum = policy.minimumPublishableMetricsByRequiredDomain?.[domainId as NipsDomainId] ?? 0;
      if (typeof envelope.readiness.publishableMetricCount !== 'number' ||
          envelope.readiness.publishableMetricCount < minimum) {
        pushIssue(issues, 'PUBLICATION_POLICY_VIOLATION', 'domains.' + domainId + '.readiness.publishableMetricCount', 'تعداد شاخص‌های قابل انتشار در دامنه الزامی کمتر از حد سیاست است.');
      }
    }
  }

  const identity = isRecord(profileRecord.identity) && isRecord(profileRecord.identity.data)
    ? profileRecord.identity.data
    : null;
  if (!identity || identity.identityStatus !== 'CONFIRMED_CANONICAL' ||
      typeof identity.canonicalEntityId !== 'string' || !identity.canonicalEntityId.trim() ||
      !Number.isSafeInteger(identity.registryRevision) || Number(identity.registryRevision) < 1) {
    pushIssue(issues, 'PUBLICATION_POLICY_VIOLATION', 'identity.data', 'انتشار فقط با هویت کانونیک تأییدشده و revision معتبر مجاز است.');
  }

  return issues;
}

export function validateNipsNeighborhoodProfile(
  profile: NipsNeighborhoodProfile,
  policy: NipsPublicationPolicy = NIPS_DEFAULT_PUBLICATION_POLICY
): readonly NipsProfileValidationIssue[] {
  const issues: NipsProfileValidationIssue[] = [];
  if (!isRecord(profile as unknown)) {
    return [{
      code: 'INVALID_DOMAIN_SET',
      path: '$',
      message: 'پروفایل باید یک شیء JSON معتبر باشد.',
    }];
  }

  const record = profile as unknown as Record<string, unknown>;
  const metadata = record.metadata;
  if (!isRecord(metadata)) {
    pushIssue(issues, 'INVALID_PROFILE_ID', 'metadata', 'فراداده پروفایل موجود یا معتبر نیست.');
    return issues;
  }

  if (typeof metadata.profileId !== 'string' || !metadata.profileId.trim()) {
    pushIssue(issues, 'INVALID_PROFILE_ID', 'metadata.profileId', 'شناسه پروفایل الزامی است.');
  }
  if (!Number.isSafeInteger(metadata.profileVersion) || Number(metadata.profileVersion) < 1) {
    pushIssue(issues, 'INVALID_PROFILE_VERSION', 'metadata.profileVersion', 'نسخه پروفایل باید عدد صحیح مثبت باشد.');
  }
  for (const timestamp of [metadata.createdAt, metadata.assembledAt]) {
    if (!isIsoTimestamp(timestamp)) pushIssue(issues, 'INVALID_TIMESTAMP', 'metadata', 'زمان‌های پروفایل باید ISO-8601 معتبر باشند.');
  }
  if (metadata.publishedAt !== null && !isIsoTimestamp(metadata.publishedAt)) {
    pushIssue(issues, 'INVALID_TIMESTAMP', 'metadata.publishedAt', 'زمان انتشار معتبر نیست.');
  }

  if (!isRecord(record.domains) || !isRecord(record.identity)) {
    pushIssue(issues, 'INVALID_DOMAIN_SET', 'domains', 'دامنه‌های پروفایل یا دامنه identity موجود نیستند.');
    return issues;
  }

  const domains = record.domains as Record<string, unknown>;
  const actual = Object.keys(domains);
  const expected = NIPS_DOMAIN_IDS.filter((id) => id !== 'identity');
  if (actual.length !== expected.length || expected.some((id) => !actual.includes(id))) {
    pushIssue(issues, 'INVALID_DOMAIN_SET', 'domains', 'مجموعه دامنه‌ها باید دقیقاً با کاتالوگ نسخه جاری منطبق باشد.');
  }

  const rawEnvelopes = [record.identity, ...Object.values(domains)];
  const validEnvelopes: Record<string, unknown>[] = [];
  if (isRecord(record.identity) && record.identity.domainId !== 'identity') {
    pushIssue(issues, 'INVALID_DOMAIN_SET', 'identity.domainId', 'بخش هویت باید domainId برابر identity داشته باشد.');
  }
  for (const [key, rawEnvelope] of Object.entries(domains)) {
    if (!isRecord(rawEnvelope)) {
      pushIssue(issues, 'INVALID_DOMAIN_SET', 'domains.' + key, 'هر دامنه باید یک envelope معتبر باشد.');
      continue;
    }
    if (rawEnvelope.domainId !== key) {
      pushIssue(issues, 'INVALID_DOMAIN_SET', 'domains.' + key + '.domainId', 'شناسه دامنه با کلید آن در پروفایل یکسان نیست.');
    }
  }

  rawEnvelopes.forEach((rawEnvelope, envelopeIndex) => {
    const path = envelopeIndex === 0 ? 'identity' : 'domains';
    if (!isRecord(rawEnvelope)) {
      pushIssue(issues, 'INVALID_DOMAIN_SET', path, 'Envelope دامنه باید یک شیء معتبر باشد.');
      return;
    }
    validEnvelopes.push(rawEnvelope);
    if (!['READY', 'PARTIAL', 'STALE', 'BLOCKED', 'UNAVAILABLE', 'NOT_APPLICABLE'].includes(String(rawEnvelope.state))) {
      pushIssue(issues, 'INVALID_DOMAIN_STATE', path + '.state', 'وضعیت دامنه معتبر نیست.');
    }
    if (rawEnvelope.updatedAt !== null && !isIsoTimestamp(rawEnvelope.updatedAt)) {
      pushIssue(issues, 'INVALID_TIMESTAMP', path + '.updatedAt', 'زمان به‌روزرسانی دامنه معتبر نیست.');
    }
    if (!isRecord(rawEnvelope.readiness)) {
      pushIssue(issues, 'INVALID_READINESS_COUNT', path + '.readiness', 'اطلاعات آمادگی دامنه موجود نیست.');
      return;
    }

    const readiness = rawEnvelope.readiness;
    const readinessCounts = [
      readiness.publishableMetricCount, readiness.blockedMetricCount,
      readiness.staleMetricCount, readiness.unavailableMetricCount,
    ];
    if (!readinessCounts.every(count) || !Array.isArray(readiness.reasons)) {
      pushIssue(issues, 'INVALID_READINESS_COUNT', path + '.readiness', 'شمارنده‌ها باید اعداد صحیح نامنفی و reasons آرایه باشد.');
    }

    if (!Array.isArray(rawEnvelope.metrics)) {
      pushIssue(issues, 'INVALID_READINESS_COUNT', path + '.metrics', 'فهرست شاخص‌های دامنه باید آرایه باشد.');
      return;
    }
    rawEnvelope.metrics.forEach((metric, index) => validateMetric(metric, path + '.metrics[' + index + ']', issues));

    const actualCounts = countMetricsByState(rawEnvelope.metrics as NipsMetric[]);
    if (
      readiness.publishableMetricCount !== actualCounts.publishable ||
      readiness.blockedMetricCount !== actualCounts.blocked ||
      readiness.staleMetricCount !== actualCounts.stale ||
      readiness.unavailableMetricCount !== actualCounts.unavailable
    ) {
      pushIssue(issues, 'INVALID_READINESS_COUNT', path + '.readiness', 'شمارنده‌های آمادگی باید دقیقاً از وضعیت شاخص‌های دامنه محاسبه شوند.');
    }
  });

  validateQualitySummary(record, validEnvelopes, issues);

  if (metadata.publicationState === 'PUBLISHED') {
    if (metadata.publishedAt === null) {
      pushIssue(issues, 'INVALID_QUALITY_SUMMARY', 'metadata.publishedAt', 'پروفایل منتشرشده باید زمان انتشار داشته باشد.');
    }
    issues.push(...validateNipsPublicationPolicy(profile, policy));
  }

  return issues;
}
