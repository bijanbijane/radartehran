/**
 * @file src/platform/presentation/adapters/ServiceResultAdapter.ts
 * @description Adapts raw Service records to canonical ResultItem (Stage 6).
 */

import { buildCanonicalResultPath, createSafeMetricEntry } from '../core/ResultContract';
import { normalizeResultItem } from '../core/ResultNormalizer';
import type { ResultItem, ResultMetricStatus } from '../core/ResultTypes';

export interface RawServiceResultInput {
  id: string;
  titleFa: string;
  categoryFa?: string;
  providerNameFa?: string;
  cityId?: string;
  baseFeeMillionToman?: number | null;
  turnaroundHours?: number | null;
  dataStatus?: ResultMetricStatus;
  canOpen?: boolean;
  canCompare?: boolean;
  canSelect?: boolean;
}

export function adaptServiceToResultItem(raw: RawServiceResultInput): ResultItem {
  const status: ResultMetricStatus = raw.dataStatus ?? 'verified';
  return normalizeResultItem({
    id: raw.id,
    entityType: 'service',
    title: raw.titleFa || raw.id,
    subtitle: [raw.categoryFa, raw.providerNameFa].filter(Boolean).join(' · ') || undefined,
    canonicalUrl: buildCanonicalResultPath('service', raw.id, raw.cityId),
    location: raw.cityId ? { cityId: raw.cityId } : undefined,
    metrics: {
      totalPrice: createSafeMetricEntry(
        typeof raw.baseFeeMillionToman === 'number' && raw.baseFeeMillionToman >= 0
          ? raw.baseFeeMillionToman
          : null,
        'میلیون تومان',
        status
      ),
      turnaroundHours: createSafeMetricEntry(
        typeof raw.turnaroundHours === 'number' && raw.turnaroundHours > 0 ? raw.turnaroundHours : null,
        'ساعت',
        status
      ),
    },
    status,
    permissions: {
      canOpen: raw.canOpen ?? true,
      canCompare: raw.canCompare ?? true,
      canSelect: raw.canSelect ?? true,
    },
  });
}
