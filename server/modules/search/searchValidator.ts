import { sanitizeInput, validateCityParam } from '../../../src/utils/security';
import type { SearchQueryParams, SearchQueryValidationResult, SearchSortField, SearchDealMode, SearchPropertyType } from './searchTypes';

const ALLOWED_SORT_FIELDS: ReadonlySet<SearchSortField> = new Set([
  'relevance',
  'price_asc',
  'price_desc',
  'sqm_asc',
  'sqm_desc',
  'discount_desc',
  'newest',
]);

const ALLOWED_DEAL_MODES: ReadonlySet<SearchDealMode> = new Set(['buy', 'rent', 'all']);
const ALLOWED_PROPERTY_TYPES: ReadonlySet<SearchPropertyType> = new Set(['residential', 'commercial', 'office', 'villa', 'all']);

export function normalizePersianSearchQuery(raw: string): string {
  return String(raw || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[آأإ]/g, 'ا')
    .replace(/[\u200c\u200e\u200f\uFEFF]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function validateAndSanitizeSearchQuery(raw: Record<string, unknown>): SearchQueryValidationResult {
  const errors: string[] = [];

  const rawQuery = typeof raw.query === 'string' ? raw.query : '';
  if (rawQuery.length > 120) {
    errors.push('طول عبارت جست‌وجو نباید بیش از ۱۲۰ کاراکتر باشد.');
  }
  const query = sanitizeInput(normalizePersianSearchQuery(rawQuery), 120);

  const cityId = raw.cityId !== undefined ? validateCityParam(raw.cityId, 'tehran') : undefined;

  let hoodId: number | undefined;
  if (raw.hoodId !== undefined && raw.hoodId !== null && raw.hoodId !== '') {
    const parsedHood = Number(raw.hoodId);
    if (!Number.isInteger(parsedHood) || parsedHood < 1 || parsedHood > 9999) {
      errors.push('شناسه محله نامعتبر است.');
    } else {
      hoodId = parsedHood;
    }
  }

  const rawDeal = typeof raw.dealMode === 'string' ? raw.dealMode.toLowerCase() : 'all';
  const dealMode: SearchDealMode = ALLOWED_DEAL_MODES.has(rawDeal as SearchDealMode)
    ? (rawDeal as SearchDealMode)
    : 'all';

  const rawType = typeof raw.propertyType === 'string' ? raw.propertyType.toLowerCase() : 'all';
  const propertyType: SearchPropertyType = ALLOWED_PROPERTY_TYPES.has(rawType as SearchPropertyType)
    ? (rawType as SearchPropertyType)
    : 'all';

  let minPriceMillions: number | undefined;
  if (raw.minPriceMillions !== undefined && raw.minPriceMillions !== null && raw.minPriceMillions !== '') {
    const val = Number(raw.minPriceMillions);
    if (!Number.isFinite(val) || val < 0) {
      errors.push('حداقل قیمت باید یک عدد نامنفی باشد.');
    } else {
      minPriceMillions = val;
    }
  }

  let maxPriceMillions: number | undefined;
  if (raw.maxPriceMillions !== undefined && raw.maxPriceMillions !== null && raw.maxPriceMillions !== '') {
    const val = Number(raw.maxPriceMillions);
    if (!Number.isFinite(val) || val <= 0) {
      errors.push('حداکثر قیمت باید یک عدد مثبت باشد.');
    } else {
      maxPriceMillions = val;
    }
  }

  if (
    minPriceMillions !== undefined &&
    maxPriceMillions !== undefined &&
    minPriceMillions > maxPriceMillions
  ) {
    errors.push('حداقل قیمت نمی‌تواند بزرگتر از حداکثر قیمت باشد.');
  }

  let minSqm: number | undefined;
  if (raw.minSqm !== undefined && raw.minSqm !== null && raw.minSqm !== '') {
    const val = Number(raw.minSqm);
    if (!Number.isFinite(val) || val < 10) {
      errors.push('حداقل متراژ باید حداقل ۱۰ متر باشد.');
    } else {
      minSqm = Math.round(val);
    }
  }

  let maxSqm: number | undefined;
  if (raw.maxSqm !== undefined && raw.maxSqm !== null && raw.maxSqm !== '') {
    const val = Number(raw.maxSqm);
    if (!Number.isFinite(val) || val > 10000) {
      errors.push('حداکثر متراژ خارج از محدوده مجاز است.');
    } else {
      maxSqm = Math.round(val);
    }
  }

  if (minSqm !== undefined && maxSqm !== undefined && minSqm > maxSqm) {
    errors.push('حداقل متراژ نمی‌تواند از حداکثر متراژ بزرگتر باشد.');
  }

  let maxBuildingAgeYears: number | undefined;
  if (raw.maxBuildingAgeYears !== undefined && raw.maxBuildingAgeYears !== null && raw.maxBuildingAgeYears !== '') {
    const val = Number(raw.maxBuildingAgeYears);
    if (!Number.isFinite(val) || val < 0 || val > 80) {
      errors.push('سن بنا باید بین ۰ تا ۸۰ سال باشد.');
    } else {
      maxBuildingAgeYears = Math.round(val);
    }
  }

  const rawSort = typeof raw.sortBy === 'string' ? raw.sortBy.toLowerCase() : 'relevance';
  const sortBy: SearchSortField = ALLOWED_SORT_FIELDS.has(rawSort as SearchSortField)
    ? (rawSort as SearchSortField)
    : 'relevance';

  const rawLimit = Number(raw.limit);
  const limit = Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 50 ? rawLimit : 20;

  const cursor =
    typeof raw.cursor === 'string' && raw.cursor.length <= 128
      ? sanitizeInput(raw.cursor, 128)
      : null;

  const hasParking = raw.hasParking === true || raw.hasParking === 'true' ? true : undefined;
  const hasElevator = raw.hasElevator === true || raw.hasElevator === 'true' ? true : undefined;
  const hasStorage = raw.hasStorage === true || raw.hasStorage === 'true' ? true : undefined;

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    sanitizedParams: {
      query: query || undefined,
      cityId,
      hoodId,
      dealMode,
      propertyType,
      minPriceMillions,
      maxPriceMillions,
      minSqm,
      maxSqm,
      hasParking,
      hasElevator,
      hasStorage,
      maxBuildingAgeYears,
      sortBy,
      limit,
      cursor,
    },
  };
}
