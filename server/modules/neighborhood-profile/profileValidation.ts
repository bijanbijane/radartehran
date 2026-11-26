import { NIPS_DOMAIN_IDS, type NipsMetric, type NipsNeighborhoodProfile } from './types';
import { NIPS_DEFAULT_PUBLICATION_POLICY, type NipsPublicationPolicy, type NipsProfileValidationIssue, count, isRecord, isIsoTimestamp, pushIssue, validateMetric, validateQualitySummary } from './validationCore';
import { validateNipsPublicationPolicy } from './publicationPolicyValidation';

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
