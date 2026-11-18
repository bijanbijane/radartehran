/**
 * @file src/platform/search/core/SearchValidation.ts
 * @description Pre-request validation for SearchRequest, SearchFilter, geo bounds, and pagination.
 */

import type { SearchFilter, SearchGeoBounds, SearchRequest } from './SearchTypes';

export interface SearchValidationIssue {
  field: string;
  code:
    | 'INVALID_QUERY_LENGTH'
    | 'INVALID_PAGE'
    | 'INVALID_PAGE_SIZE'
    | 'INVALID_GEO_BOUNDS'
    | 'INVALID_FILTER_RANGE'
    | 'INVALID_NEGATIVE_VALUE'
    | 'EMPTY_FILTER_VALUE';
  messageFa: string;
}

export interface SearchValidationResult {
  valid: boolean;
  issues: SearchValidationIssue[];
}

export function validateGeoBounds(bounds?: SearchGeoBounds): SearchValidationIssue[] {
  if (!bounds) return [];
  const issues: SearchValidationIssue[] = [];
  const { north, south, east, west } = bounds;
  if (
    !Number.isFinite(north) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(west) ||
    north < -90 ||
    north > 90 ||
    south < -90 ||
    south > 90 ||
    east < -180 ||
    east > 180 ||
    west < -180 ||
    west > 180 ||
    north < south ||
    east < west
  ) {
    issues.push({
      field: 'bounds',
      code: 'INVALID_GEO_BOUNDS',
      messageFa: 'محدوده جغرافیایی انتخاب‌شده نامعتبر است.',
    });
  }
  return issues;
}

export function validateSingleSearchFilter(filter: SearchFilter): SearchValidationIssue[] {
  const issues: SearchValidationIssue[] = [];
  if (filter.value === undefined || filter.value === null || filter.value === '') {
    issues.push({
      field: filter.field,
      code: 'EMPTY_FILTER_VALUE',
      messageFa: `مقدار فیلتر «${filter.field}» خالی است.`,
    });
    return issues;
  }

  if (typeof filter.value === 'number') {
    if (!Number.isFinite(filter.value) || filter.value < 0) {
      issues.push({
        field: filter.field,
        code: 'INVALID_NEGATIVE_VALUE',
        messageFa: `مقدار عددی فیلتر «${filter.field}» نمی‌تواند منفی باشد.`,
      });
    }
  } else if (
    Array.isArray(filter.value) &&
    filter.operator === 'between' &&
    filter.value.length === 2 &&
    typeof filter.value[0] === 'number' &&
    typeof filter.value[1] === 'number'
  ) {
    const [min, max] = filter.value;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0) {
      issues.push({
        field: filter.field,
        code: 'INVALID_NEGATIVE_VALUE',
        messageFa: `بازه فیلتر «${filter.field}» شامل مقدار منفی یا نامعتبر است.`,
      });
    } else if (min > max) {
      issues.push({
        field: filter.field,
        code: 'INVALID_FILTER_RANGE',
        messageFa: `حداقل مقدار فیلتر «${filter.field}» از حداکثر آن بزرگ‌تر است.`,
      });
    }
  }

  return issues;
}

export function validateSearchRequest(request: SearchRequest): SearchValidationResult {
  const issues: SearchValidationIssue[] = [];

  if (request.rawQuery && request.rawQuery.length > 300) {
    issues.push({
      field: 'rawQuery',
      code: 'INVALID_QUERY_LENGTH',
      messageFa: 'طول عبارت جست‌وجو بیش از حد مجاز (۳۰۰ کاراکتر) است.',
    });
  }

  if (!Number.isInteger(request.pagination.page) || request.pagination.page < 1) {
    issues.push({
      field: 'pagination.page',
      code: 'INVALID_PAGE',
      messageFa: 'شماره صفحه باید عددی صحیح و بزرگ‌تر یا مساوی ۱ باشد.',
    });
  }

  if (!Number.isInteger(request.pagination.pageSize) || request.pagination.pageSize < 1 || request.pagination.pageSize > 100) {
    issues.push({
      field: 'pagination.pageSize',
      code: 'INVALID_PAGE_SIZE',
      messageFa: 'تعداد نتایج در هر صفحه باید بین ۱ تا ۱۰۰ باشد.',
    });
  }

  issues.push(...validateGeoBounds(request.bounds));

  for (const f of request.filters) {
    issues.push(...validateSingleSearchFilter(f));
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
