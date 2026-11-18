/**
 * @file src/platform/search/filters/FilterValidation.ts
 * @description Validates filter compatibility with active scope and registered operators.
 */

import type { SearchFilter, SearchScope } from '../core/SearchTypes';
import { validateSingleSearchFilter, type SearchValidationIssue } from '../core/SearchValidation';
import { FILTER_BY_FIELD } from './FilterRegistry';

export interface FilterSetValidationResult {
  valid: boolean;
  validFilters: SearchFilter[];
  rejectedFilters: Array<{ filter: SearchFilter; issues: SearchValidationIssue[] }>;
}

export function validateFilterSetForScope(
  filters: readonly SearchFilter[],
  scope: SearchScope = 'all'
): FilterSetValidationResult {
  const validFilters: SearchFilter[] = [];
  const rejectedFilters: Array<{ filter: SearchFilter; issues: SearchValidationIssue[] }> = [];

  for (const filter of filters) {
    const issues = validateSingleSearchFilter(filter);
    const def = FILTER_BY_FIELD.get(filter.field);

    if (def) {
      if (!def.allowedOperators.includes(filter.operator)) {
        issues.push({
          field: filter.field,
          code: 'INVALID_FILTER_RANGE',
          messageFa: `عملگر «${filter.operator}» برای فیلتر «${def.labelFa}» مجاز نیست.`,
        });
      }
      if (scope !== 'all' && !def.supportedScopes.includes(scope)) {
        issues.push({
          field: filter.field,
          code: 'INVALID_FILTER_RANGE',
          messageFa: `فیلتر «${def.labelFa}» در دامنه «${scope}» کاربرد ندارد.`,
        });
      }
    }

    if (issues.length === 0) {
      validFilters.push(filter);
    } else {
      rejectedFilters.push({ filter, issues });
    }
  }

  return {
    valid: rejectedFilters.length === 0,
    validFilters,
    rejectedFilters,
  };
}
