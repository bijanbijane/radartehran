import { NIPS_DOMAIN_IDS, type NipsDomainId, type NipsDomainState, type NipsNeighborhoodProfile } from './types';
import { NIPS_DEFAULT_PUBLICATION_POLICY, type NipsPublicationPolicy, type NipsProfileValidationIssue, count, isRecord, pushIssue } from './validationCore';

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

