/**
 * @file src/platform/presentation/core/ResultNormalizer.ts
 * @description Normalizes heterogeneous ResultItem payloads without fabricating missing prices, areas, or sample counts.
 */

import { buildCanonicalResultPath, createSafeMetricEntry, SUPPORTED_RESULT_ENTITY_TYPES } from './ResultContract';
import type { ResultEntityType, ResultItem, ResultMetricEntry } from './ResultTypes';

export function normalizeResultItem(raw: Partial<ResultItem> & { id: string; entityType: ResultEntityType }): ResultItem {
  const id = String(raw.id || '').trim();
  const entityType: ResultEntityType = SUPPORTED_RESULT_ENTITY_TYPES.includes(raw.entityType)
    ? raw.entityType
    : 'property';

  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : id;
  const subtitle = typeof raw.subtitle === 'string' && raw.subtitle.trim() ? raw.subtitle.trim() : undefined;

  const cityId = raw.location?.cityId?.trim() || undefined;
  const neighborhoodId = raw.location?.neighborhoodId?.trim() || undefined;
  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;
  const hasValidGeo =
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0);

  const normalizedMetrics: Record<string, ResultMetricEntry> = {};
  if (raw.metrics && typeof raw.metrics === 'object') {
    for (const [key, entry] of Object.entries(raw.metrics)) {
      if (!entry) {
        normalizedMetrics[key] = { value: null, status: 'unknown' };
        continue;
      }
      normalizedMetrics[key] = createSafeMetricEntry(entry.value, entry.unit, entry.status ?? 'unknown');
    }
  }

  // Compute pricePerSqm ONLY if both totalPrice and areaSqm are genuinely present and > 0 (never fabricate!)
  if (
    !normalizedMetrics.pricePerSqm &&
    normalizedMetrics.totalPrice &&
    typeof normalizedMetrics.totalPrice.value === 'number' &&
    normalizedMetrics.totalPrice.value > 0 &&
    normalizedMetrics.areaSqm &&
    typeof normalizedMetrics.areaSqm.value === 'number' &&
    normalizedMetrics.areaSqm.value > 0
  ) {
    const perSqm = Number((normalizedMetrics.totalPrice.value / normalizedMetrics.areaSqm.value).toFixed(2));
    normalizedMetrics.pricePerSqm = {
      value: perSqm,
      unit: normalizedMetrics.totalPrice.unit ? `${normalizedMetrics.totalPrice.unit}/مترمربع` : 'میلیون تومان/مترمربع',
      status: normalizedMetrics.totalPrice.status ?? 'verified',
    };
  }

  return {
    id,
    entityType,
    title,
    subtitle,
    canonicalUrl:
      typeof raw.canonicalUrl === 'string' && raw.canonicalUrl.startsWith('/')
        ? raw.canonicalUrl
        : buildCanonicalResultPath(entityType, id, cityId),
    location:
      cityId || neighborhoodId || hasValidGeo
        ? {
            cityId,
            neighborhoodId,
            latitude: hasValidGeo ? lat : undefined,
            longitude: hasValidGeo ? lng : undefined,
          }
        : undefined,
    metrics: normalizedMetrics,
    media: raw.media
      ? {
          thumbnailUrl: raw.media.thumbnailUrl || undefined,
          mediaCount:
            typeof raw.media.mediaCount === 'number' && raw.media.mediaCount >= 0
              ? raw.media.mediaCount
              : undefined,
        }
      : undefined,
    status: raw.status || 'active',
    permissions: {
      canOpen: raw.permissions?.canOpen ?? true,
      canCompare: raw.permissions?.canCompare ?? entityType !== 'service',
      canSelect: raw.permissions?.canSelect ?? true,
    },
  };
}
