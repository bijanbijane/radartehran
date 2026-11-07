import type { ValidationIssue, ValidationResult } from '../core';
import type {
  SaveSearchConfigInput,
  SearchCityId,
  SearchDealType,
  SearchFilterQuery,
  SearchSortOption,
} from './types';

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

const ALLOWED_CITIES: readonly SearchCityId[] = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'];
const ALLOWED_TYPES: readonly SearchDealType[] = ['خرید', 'اجاره'];
const ALLOWED_SORTS: readonly SearchSortOption[] = [
  'newest',
  'oldest',
  'price_asc',
  'price_desc',
  'sqm_desc',
  'sqm_asc',
];

export function parseSearchFilterQuery(raw: unknown): ValidationResult<SearchFilterQuery> {
  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ field: '$query', code: 'INVALID_TYPE', message: 'Query must be an object.' }] };
  }

  const issues: ValidationIssue[] = [];
  const query: SearchFilterQuery = {};

  if (raw.keyword !== undefined) {
    if (typeof raw.keyword !== 'string') {
      issues.push({ field: 'keyword', code: 'INVALID_TYPE', message: 'keyword must be a string.' });
    } else {
      const kw = raw.keyword.trim().slice(0, 100);
      if (kw) query.keyword = kw;
    }
  }

  if (raw.cityId !== undefined) {
    const city = String(raw.cityId).trim().toLowerCase() as SearchCityId;
    if (!ALLOWED_CITIES.includes(city)) {
      issues.push({ field: 'cityId', code: 'INVALID_ENUM_VALUE', message: `cityId must be one of ${ALLOWED_CITIES.join(', ')}` });
    } else {
      query.cityId = city;
    }
  }

  if (raw.hoodIds !== undefined) {
    const hoodIds: number[] = [];
    if (Array.isArray(raw.hoodIds)) {
      for (const h of raw.hoodIds) {
        const num = Number(h);
        if (Number.isInteger(num) && num > 0 && num <= 999) {
          hoodIds.push(num);
        }
      }
    } else if (typeof raw.hoodIds === 'string') {
      const parts = raw.hoodIds.split(',').map((p) => Number(p.trim())).filter((n) => Number.isInteger(n) && n > 0 && n <= 999);
      hoodIds.push(...parts);
    }
    if (hoodIds.length > 0) query.hoodIds = hoodIds.slice(0, 50);
  }

  if (raw.type !== undefined) {
    const dealType = String(raw.type).trim() as SearchDealType;
    if (!ALLOWED_TYPES.includes(dealType)) {
      issues.push({ field: 'type', code: 'INVALID_ENUM_VALUE', message: 'type must be "خرید" or "اجاره".' });
    } else {
      query.type = dealType;
    }
  }

  if (raw.minPriceMillion !== undefined) {
    const num = Number(raw.minPriceMillion);
    if (!Number.isFinite(num) || num < 0) {
      issues.push({ field: 'minPriceMillion', code: 'NUMBER_OUT_OF_RANGE', message: 'minPriceMillion must be >= 0.' });
    } else {
      query.minPriceMillion = num;
    }
  }

  if (raw.maxPriceMillion !== undefined) {
    const num = Number(raw.maxPriceMillion);
    if (!Number.isFinite(num) || num <= 0) {
      issues.push({ field: 'maxPriceMillion', code: 'NUMBER_OUT_OF_RANGE', message: 'maxPriceMillion must be > 0.' });
    } else {
      query.maxPriceMillion = num;
    }
  }

  if (query.minPriceMillion !== undefined && query.maxPriceMillion !== undefined && query.minPriceMillion > query.maxPriceMillion) {
    issues.push({ field: 'minPriceMillion', code: 'NUMBER_OUT_OF_RANGE', message: 'minPriceMillion cannot exceed maxPriceMillion.' });
  }

  if (raw.minSqm !== undefined) {
    const num = Number(raw.minSqm);
    if (!Number.isFinite(num) || num <= 0) {
      issues.push({ field: 'minSqm', code: 'NUMBER_OUT_OF_RANGE', message: 'minSqm must be > 0.' });
    } else {
      query.minSqm = num;
    }
  }

  if (raw.maxSqm !== undefined) {
    const num = Number(raw.maxSqm);
    if (!Number.isFinite(num) || num <= 0) {
      issues.push({ field: 'maxSqm', code: 'NUMBER_OUT_OF_RANGE', message: 'maxSqm must be > 0.' });
    } else {
      query.maxSqm = num;
    }
  }

  if (query.minSqm !== undefined && query.maxSqm !== undefined && query.minSqm > query.maxSqm) {
    issues.push({ field: 'minSqm', code: 'NUMBER_OUT_OF_RANGE', message: 'minSqm cannot exceed maxSqm.' });
  }

  if (raw.minDiscountPercent !== undefined) {
    const num = Number(raw.minDiscountPercent);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      issues.push({ field: 'minDiscountPercent', code: 'NUMBER_OUT_OF_RANGE', message: 'minDiscountPercent must be between 0 and 100.' });
    } else {
      query.minDiscountPercent = num;
    }
  }

  if (raw.sort !== undefined) {
    const sortVal = String(raw.sort).trim() as SearchSortOption;
    if (!ALLOWED_SORTS.includes(sortVal)) {
      issues.push({ field: 'sort', code: 'INVALID_ENUM_VALUE', message: `sort must be one of: ${ALLOWED_SORTS.join(', ')}` });
    } else {
      query.sort = sortVal;
    }
  } else {
    query.sort = 'newest';
  }

  const limitNum = raw.limit !== undefined ? Number(raw.limit) : 20;
  query.limit = Math.min(Math.max(Number.isInteger(limitNum) ? limitNum : 20, 1), 50);

  if (typeof raw.cursor === 'string' && raw.cursor.trim()) {
    query.cursor = raw.cursor.trim();
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, issues: [], value: query };
}

export function validateSaveSearchInput(raw: unknown): ValidationResult<SaveSearchConfigInput> {
  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ field: '$body', code: 'INVALID_TYPE', message: 'Body must be an object.' }] };
  }
  const issues: ValidationIssue[] = [];

  const titleFa = typeof raw.titleFa === 'string' ? raw.titleFa.trim() : '';
  if (titleFa.length < 2 || titleFa.length > 80) {
    issues.push({ field: 'titleFa', code: 'STRING_TOO_SHORT', message: 'titleFa must be 2-80 characters.' });
  }

  const filterResult = parseSearchFilterQuery(raw.filterQuery ?? {});
  if (!filterResult.ok || !filterResult.value) {
    issues.push(...filterResult.issues);
  }

  if (issues.length > 0) return { ok: false, issues };

  const { limit, cursor, ...cleanFilter } = filterResult.value!;
  return {
    ok: true,
    issues: [],
    value: {
      titleFa,
      filterQuery: cleanFilter,
    },
  };
}
