/**
 * @file src/platform/presentation/adapters/ListingResultAdapter.ts
 * @description Adapts raw Listing records to canonical ResultItem (Stage 6).
 */

import { buildCanonicalResultPath, createSafeMetricEntry } from '../core/ResultContract';
import { normalizeResultItem } from '../core/ResultNormalizer';
import type { ResultItem, ResultMetricStatus } from '../core/ResultTypes';

export interface RawListingResultInput {
  id: string;
  title?: string;
  sourceName?: string;
  transactionMode?: 'buy' | 'rent' | 'rahn_full' | string;
  cityId?: string;
  neighborhoodId?: string;
  neighborhoodNameFa?: string;
  latitude?: number;
  longitude?: number;
  areaSqm?: number | null;
  askingPriceMillionToman?: number | null;
  rahnMillionToman?: number | null;
  monthlyRentMillionToman?: number | null;
  publishedAtIso?: string | null;
  listingStatus?: 'active' | 'expired' | 'unavailable';
  propertyMatchStatus?: 'matched' | 'probable' | 'unlinked';
  dataConfidence?: ResultMetricStatus;
  thumbnailUrl?: string | null;
  canOpen?: boolean;
  canCompare?: boolean;
  canSelect?: boolean;
}

export function adaptListingToResultItem(raw: RawListingResultInput): ResultItem {
  const confidence: ResultMetricStatus = raw.dataConfidence ?? 'verified';
  const areaVal = typeof raw.areaSqm === 'number' && Number.isFinite(raw.areaSqm) && raw.areaSqm > 0 ? raw.areaSqm : null;
  const askingVal =
    typeof raw.askingPriceMillionToman === 'number' &&
    Number.isFinite(raw.askingPriceMillionToman) &&
    raw.askingPriceMillionToman > 0
      ? raw.askingPriceMillionToman
      : null;

  const perSqmVal =
    askingVal !== null && areaVal !== null && raw.transactionMode !== 'rent'
      ? Number((askingVal / areaVal).toFixed(2))
      : null;

  return normalizeResultItem({
    id: raw.id,
    entityType: 'listing',
    title: raw.title || `آگهی ملکی (${raw.id})`,
    subtitle: [raw.sourceName, raw.neighborhoodNameFa, raw.transactionMode].filter(Boolean).join(' · ') || undefined,
    canonicalUrl: buildCanonicalResultPath('listing', raw.id, raw.cityId),
    location: {
      cityId: raw.cityId,
      neighborhoodId: raw.neighborhoodId,
      latitude: raw.latitude,
      longitude: raw.longitude,
    },
    metrics: {
      sourceName: createSafeMetricEntry(raw.sourceName ?? null, undefined, confidence),
      transactionMode: createSafeMetricEntry(raw.transactionMode ?? null, undefined, confidence),
      areaSqm: createSafeMetricEntry(areaVal, 'مترمربع', confidence),
      totalPrice: createSafeMetricEntry(askingVal, 'میلیون تومان', confidence),
      pricePerSqm: createSafeMetricEntry(perSqmVal, 'میلیون تومان/مترمربع', confidence),
      rahnDeposit: createSafeMetricEntry(
        typeof raw.rahnMillionToman === 'number' && raw.rahnMillionToman >= 0 ? raw.rahnMillionToman : null,
        'میلیون تومان',
        confidence
      ),
      monthlyRent: createSafeMetricEntry(
        typeof raw.monthlyRentMillionToman === 'number' && raw.monthlyRentMillionToman >= 0
          ? raw.monthlyRentMillionToman
          : null,
        'میلیون تومان',
        confidence
      ),
      publishedAt: createSafeMetricEntry(raw.publishedAtIso ?? null, undefined, confidence),
      propertyMatchStatus: createSafeMetricEntry(raw.propertyMatchStatus ?? null, undefined, confidence),
    },
    media: raw.thumbnailUrl ? { thumbnailUrl: raw.thumbnailUrl } : undefined,
    status: raw.listingStatus ?? 'active',
    permissions: {
      canOpen: raw.canOpen ?? true,
      canCompare: raw.canCompare ?? true,
      canSelect: raw.canSelect ?? true,
    },
  });
}
