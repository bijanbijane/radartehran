/**
 * @file src/platform/presentation/comparison/ComparisonNormalizer.ts
 * @description Normalizes units (e.g. USD/Rial/Billion -> Million Toman, sqft -> sqm) before comparison while preserving null and confidence status.
 */

import type { ResultItem, ResultMetricStatus } from '../core/ResultTypes';
import { getComparisonFieldsForEntityType, type ComparisonField } from './ComparisonSchema';

export interface NormalizedComparisonCell {
  entityId: string;
  fieldId: string;
  rawValue: string | number | null;
  normalizedNumericValue: number | null;
  displayUnit: string | undefined;
  status: ResultMetricStatus;
  measuredAtIso?: string | null;
}

export interface NormalizedComparisonRow {
  field: ComparisonField;
  cells: NormalizedComparisonCell[];
  minNumericValue: number | null;
  maxNumericValue: number | null;
  deltaSummaryFa: string | null;
}

const SQFT_TO_SQM_DIVISOR = 10.7639104167;

export function normalizeCellMetricForComparison(
  item: ResultItem,
  field: ComparisonField,
  usdToMillionTomanRate = 0.085
): NormalizedComparisonCell {
  const metric = item.metrics[field.id];
  const measuredAt =
    typeof item.metrics.updatedAt?.value === 'string'
      ? item.metrics.updatedAt.value
      : typeof item.metrics.publishedAt?.value === 'string'
        ? item.metrics.publishedAt.value
        : null;

  if (!metric || metric.value === null || metric.value === undefined) {
    return {
      entityId: item.id,
      fieldId: field.id,
      rawValue: null, // Rule 9.4: Never substitute 0 for missing values!
      normalizedNumericValue: null,
      displayUnit: field.unit,
      status: metric?.status ?? 'unknown',
      measuredAtIso: measuredAt,
    };
  }

  if (typeof metric.value === 'number' && Number.isFinite(metric.value)) {
    let normalized = metric.value;
    const u = (metric.unit || '').trim();

    // Unit harmonization before comparison
    if (u.includes('میلیارد')) {
      normalized = metric.value * 1000;
    } else if (u === 'ریال') {
      normalized = metric.value / 10_000_000;
    } else if (u.includes('دلار') || u === 'USD') {
      normalized = metric.value * usdToMillionTomanRate;
    } else if (u.includes('فوت') || u === 'sqft') {
      normalized = metric.value / SQFT_TO_SQM_DIVISOR;
    }

    return {
      entityId: item.id,
      fieldId: field.id,
      rawValue: metric.value,
      normalizedNumericValue: Number(normalized.toFixed(2)),
      displayUnit: field.unit || metric.unit,
      status: metric.status ?? 'verified',
      measuredAtIso: measuredAt,
    };
  }

  return {
    entityId: item.id,
    fieldId: field.id,
    rawValue: metric.value,
    normalizedNumericValue: null,
    displayUnit: field.unit || metric.unit,
    status: metric.status ?? 'verified',
    measuredAtIso: measuredAt,
  };
}

export function buildNormalizedComparisonMatrix(
  items: readonly ResultItem[],
  usdToMillionTomanRate = 0.085
): NormalizedComparisonRow[] {
  if (items.length === 0) return [];
  const fields = getComparisonFieldsForEntityType(items[0].entityType);

  return fields.map((field) => {
    const cells = items.map((item) => normalizeCellMetricForComparison(item, field, usdToMillionTomanRate));
    const validNumbers = cells
      .map((c) => c.normalizedNumericValue)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    const minNumericValue = validNumbers.length > 0 ? Math.min(...validNumbers) : null;
    const maxNumericValue = validNumbers.length > 0 ? Math.max(...validNumbers) : null;

    let deltaSummaryFa: string | null = null;
    if (minNumericValue !== null && maxNumericValue !== null && validNumbers.length >= 2) {
      const diff = Number((maxNumericValue - minNumericValue).toFixed(2));
      deltaSummaryFa =
        diff === 0
          ? 'بدون اختلاف'
          : `اختلاف دامنه: ${diff} ${field.unit || ''}`.trim();
    }

    return {
      field,
      cells,
      minNumericValue,
      maxNumericValue,
      deltaSummaryFa,
    };
  });
}
