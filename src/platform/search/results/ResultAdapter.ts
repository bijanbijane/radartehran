/**
 * @file src/platform/search/results/ResultAdapter.ts
 * @description Adapts raw neighborhood, listing, property, building, service, and analytic payloads to SearchResultHit.
 */

import { createMoneyFromMillionToman } from '../core/SearchNormalizer';
import type { SearchHitDomainType, SearchResultHit } from '../core/SearchResult';

export interface RawDomainSearchRecord {
  id: string;
  domainType?: SearchHitDomainType;
  titleFa?: string;
  name?: string;
  subtitleFa?: string;
  cityId?: string;
  cityNameFa?: string;
  neighborhoodId?: string;
  neighborhoodNameFa?: string;
  latitude?: number;
  longitude?: number;
  areaSqm?: number | null;
  totalBuyPriceMillionToman?: number | null;
  pricePerSqmMillionToman?: number | null;
  estimatedDealPricePerSqmMillionToman?: number | null;
  rahnMillionToman?: number | null;
  monthlyRentMillionToman?: number | null;
  transactionMode?: 'buy' | 'rent' | 'rahn_full';
  confidence?: 'verified' | 'estimated' | 'unknown';
  sampleCount?: number | null;
  updatedAtIso?: string | null;
  status?: 'active' | 'expired' | 'verified' | 'draft';
  thumbnailUrl?: string | null;
  score?: number;
}

export function buildCanonicalEntityUrl(domainType: SearchHitDomainType, id: string, cityId = 'tehran'): string {
  const safeId = encodeURIComponent(id);
  switch (domainType) {
    case 'property':
      return `/properties/${safeId}`;
    case 'listing':
      return `/listings/${safeId}`;
    case 'building':
      return `/buildings/${safeId}`;
    case 'neighborhood':
      return `/neighborhoods/${safeId}?city=${encodeURIComponent(cityId)}`;
    case 'service':
      return `/services?serviceId=${safeId}`;
    case 'market-analytics':
      return `/intelligence?entityId=${safeId}&city=${encodeURIComponent(cityId)}`;
  }
}

export function adaptRawRecordToSearchHit(raw: RawDomainSearchRecord): SearchResultHit {
  const domainType: SearchHitDomainType = raw.domainType ?? 'neighborhood';
  const cityId = raw.cityId || 'tehran';
  const cityNameFa =
    raw.cityNameFa ||
    (cityId === 'tehran'
      ? 'تهران'
      : cityId === 'karaj'
        ? 'کرج'
        : cityId === 'mashhad'
          ? 'مشهد'
          : cityId === 'isfahan'
            ? 'اصفهان'
            : cityId === 'shiraz'
              ? 'شیراز'
              : cityId);

  const hasValidCoords =
    typeof raw.latitude === 'number' &&
    typeof raw.longitude === 'number' &&
    Number.isFinite(raw.latitude) &&
    Number.isFinite(raw.longitude) &&
    raw.latitude >= -90 &&
    raw.latitude <= 90 &&
    raw.longitude >= -180 &&
    raw.longitude <= 180 &&
    !(raw.latitude === 0 && raw.longitude === 0);

  return {
    id: String(raw.id),
    domainType,
    titleFa: raw.titleFa || raw.name || String(raw.id),
    subtitleFa: raw.subtitleFa,
    cityId,
    cityNameFa,
    neighborhoodId: raw.neighborhoodId ?? (domainType === 'neighborhood' ? String(raw.id) : undefined),
    neighborhoodNameFa: raw.neighborhoodNameFa ?? (domainType === 'neighborhood' ? raw.titleFa || raw.name : undefined),
    canonicalUrl: buildCanonicalEntityUrl(domainType, String(raw.id), cityId),
    coordinates: hasValidCoords
      ? {
          latitude: raw.latitude!,
          longitude: raw.longitude!,
          precision: domainType === 'neighborhood' ? 'neighborhood' : 'building',
        }
      : undefined,
    area:
      typeof raw.areaSqm === 'number' && Number.isFinite(raw.areaSqm) && raw.areaSqm > 0
        ? { value: raw.areaSqm, unit: 'sqm' }
        : null,
    pricing:
      raw.totalBuyPriceMillionToman != null ||
      raw.pricePerSqmMillionToman != null ||
      raw.rahnMillionToman != null ||
      raw.monthlyRentMillionToman != null
        ? {
            transactionMode: raw.transactionMode ?? 'buy',
            totalBuyPrice: createMoneyFromMillionToman(raw.totalBuyPriceMillionToman),
            pricePerSqm: createMoneyFromMillionToman(raw.pricePerSqmMillionToman),
            estimatedDealPricePerSqm: createMoneyFromMillionToman(raw.estimatedDealPricePerSqmMillionToman),
            rahnDeposit: createMoneyFromMillionToman(raw.rahnMillionToman),
            monthlyRent: createMoneyFromMillionToman(raw.monthlyRentMillionToman),
            confidence: raw.confidence ?? 'verified',
          }
        : null,
    sampleCount:
      typeof raw.sampleCount === 'number' && Number.isFinite(raw.sampleCount) && raw.sampleCount >= 0
        ? raw.sampleCount
        : null,
    updatedAtIso: raw.updatedAtIso ?? null,
    status: raw.status ?? 'active',
    thumbnailUrl: raw.thumbnailUrl ?? null,
    score: typeof raw.score === 'number' && Number.isFinite(raw.score) ? raw.score : 1,
  };
}
