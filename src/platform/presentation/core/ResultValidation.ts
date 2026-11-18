/**
 * @file src/platform/presentation/core/ResultValidation.ts
 * @description Validates ResultItem integrity (stable non-row-index ID, valid entityType, canonicalUrl, and unit completeness).
 */

import { SUPPORTED_RESULT_ENTITY_TYPES } from './ResultContract';
import type { ResultItem } from './ResultTypes';

export interface ResultValidationIssue {
  itemId: string;
  field: string;
  code:
    | 'MISSING_OR_ROW_INDEX_ID'
    | 'INVALID_ENTITY_TYPE'
    | 'INVALID_CANONICAL_URL'
    | 'MISSING_NUMERIC_UNIT'
    | 'EMPTY_STRING_SUBSTITUTED_FOR_NULL';
  messageFa: string;
}

export function validateResultItemContract(item: ResultItem): {
  valid: boolean;
  issues: ResultValidationIssue[];
} {
  const issues: ResultValidationIssue[] = [];

  if (!item.id || typeof item.id !== 'string' || !item.id.trim() || /^row[-_]?\d+$/i.test(item.id.trim())) {
    issues.push({
      itemId: String(item.id || 'unknown'),
      field: 'id',
      code: 'MISSING_OR_ROW_INDEX_ID',
      messageFa: 'شناسه نتیجه باید شناسه پایدار موجودیت باشد، نه شماره ردیف جدول.',
    });
  }

  if (!SUPPORTED_RESULT_ENTITY_TYPES.includes(item.entityType)) {
    issues.push({
      itemId: item.id,
      field: 'entityType',
      code: 'INVALID_ENTITY_TYPE',
      messageFa: 'نوع موجودیت نتیجه معتبر نیست.',
    });
  }

  if (!item.canonicalUrl || !item.canonicalUrl.startsWith('/')) {
    issues.push({
      itemId: item.id,
      field: 'canonicalUrl',
      code: 'INVALID_CANONICAL_URL',
      messageFa: 'مسیر استاندارد (canonicalUrl) باید یک مسیر معتبر Router باشد.',
    });
  }

  const numericMetricsRequiringUnit = new Set([
    'totalPrice',
    'pricePerSqm',
    'estimatedDealPricePerSqm',
    'rahnDeposit',
    'monthlyRent',
    'areaSqm',
    'landAreaSqm',
  ]);

  for (const [key, entry] of Object.entries(item.metrics || {})) {
    if (entry.value === '') {
      issues.push({
        itemId: item.id,
        field: `metrics.${key}`,
        code: 'EMPTY_STRING_SUBSTITUTED_FOR_NULL',
        messageFa: `مقدار ناموجود در فیلد «${key}» باید با null مشخص شود، نه رشته خالی.`,
      });
    }
    if (
      typeof entry.value === 'number' &&
      numericMetricsRequiringUnit.has(key) &&
      (!entry.unit || !entry.unit.trim())
    ) {
      issues.push({
        itemId: item.id,
        field: `metrics.${key}`,
        code: 'MISSING_NUMERIC_UNIT',
        messageFa: `واحد اندازه‌گیری برای فیلد عددی «${key}» مشخص نشده است.`,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
