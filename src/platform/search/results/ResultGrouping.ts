/**
 * @file src/platform/search/results/ResultGrouping.ts
 * @description Groups heterogeneous search hits by domain and preserves partial results when one domain fails.
 */

import type { SearchHitDomainType, SearchResultDomainGroup, SearchResultHit } from '../core/SearchResult';

const DOMAIN_TITLES_FA: Record<SearchHitDomainType, string> = {
  neighborhood: 'محله‌ها و پروفایل‌های مکانی',
  property: 'املاک و پرونده‌های ملکی',
  listing: 'آگهی‌های فروش و اجاره',
  building: 'ساختمان‌ها و مجتمع‌ها',
  service: 'خدمات تخصصی ملکی و کارشناسی',
  'market-analytics': 'تحلیل بازار و شاخص‌های کلان',
};

export function groupSearchHitsByDomain(
  items: readonly SearchResultHit[],
  failedDomains: readonly SearchHitDomainType[] = []
): SearchResultDomainGroup[] {
  const byDomain = new Map<SearchHitDomainType, SearchResultHit[]>();
  for (const hit of items) {
    const arr = byDomain.get(hit.domainType) ?? [];
    arr.push(hit);
    byDomain.set(hit.domainType, arr);
  }

  const orderedDomains: SearchHitDomainType[] = [
    'neighborhood',
    'listing',
    'property',
    'building',
    'service',
    'market-analytics',
  ];

  const groups: SearchResultDomainGroup[] = [];
  for (const domain of orderedDomains) {
    const domainItems = byDomain.get(domain) ?? [];
    const isFailed = failedDomains.includes(domain);
    if (domainItems.length === 0 && !isFailed) continue;

    groups.push({
      domainType: domain,
      titleFa: DOMAIN_TITLES_FA[domain],
      items: domainItems,
      totalAvailable: isFailed ? null : domainItems.length,
      status: isFailed ? 'failed' : 'ok',
      errorMessageFa: isFailed
        ? `دریافت نتایج بخش «${DOMAIN_TITLES_FA[domain]}» با خطا مواجه شد؛ سایر نتایج قابل استفاده هستند.`
        : undefined,
    });
  }

  return groups;
}
