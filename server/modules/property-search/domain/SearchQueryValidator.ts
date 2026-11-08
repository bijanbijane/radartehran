/**
 * Domain Service: SearchQueryValidator
 * (`server/modules/property-search/domain/SearchQueryValidator.ts`)
 * Exclusive ownership: `server/modules/property-search/`
 */

import type {
  PropertyCategory,
  PropertySearchQueryFilters,
  PropertySearchRequest,
  PropertySubtype,
  SaveSearchInput,
  SearchDealType,
  SearchSortMode,
  SearchSuggestionsRequest,
  UpdateSavedSearchInput,
} from '../types';

export class PropertySearchValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
    public readonly code = 'INVALID_SEARCH_FILTER',
  ) {
    super(`Search Validation Error (${field}): ${message}`);
    this.name = 'PropertySearchValidationError';
  }
}

const VALID_CATEGORIES: ReadonlySet<PropertyCategory> = new Set(['residential', 'commercial', 'office', 'land']);

const VALID_SUBTYPES: Readonly<Record<PropertyCategory, ReadonlySet<PropertySubtype>>> = {
  residential: new Set(['apartment', 'villa', 'penthouse', 'residential_complex']),
  commercial: new Set(['shop', 'commercial_unit', 'mall_booth', 'showroom']),
  office: new Set(['administrative_office', 'medical_office', 'commercial_office']),
  land: new Set(['residential_plot', 'commercial_plot', 'agricultural_land', 'industrial_land']),
};

const VALID_SORT_MODES: ReadonlySet<SearchSortMode> = new Set([
  'newest', 'oldest', 'price_asc', 'price_desc', 'area_asc', 'area_desc', 'relevance', 'geo_proximity',
]);

export class SearchQueryValidator {
  public static normalizePersianText(input: unknown): string {
    if (typeof input !== 'string') return '';
    return input.trim()
      .replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/[ة]/g, 'ه')
      .replace(/\u200C+/g, '\u200C')
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/\s+/g, ' ');
  }

  public normalizeText(input: unknown): string {
    return SearchQueryValidator.normalizePersianText(input);
  }

  private static parseNum(val: unknown, field: string, minLimit?: number, maxLimit?: number): number | undefined {
    if (val === undefined || val === null || val === '') return undefined;
    const num = Number(val);
    if (!Number.isFinite(num) || Number.isNaN(num)) throw new PropertySearchValidationError(field, 'Must be a finite numeric value.');
    if (minLimit !== undefined && num < minLimit) throw new PropertySearchValidationError(field, `Must be >= ${minLimit}.`);
    if (maxLimit !== undefined && num > maxLimit) throw new PropertySearchValidationError(field, `Must be <= ${maxLimit}.`);
    return num;
  }

  private static parseBool(val: unknown): boolean | undefined {
    if (val === true || val === 'true' || val === 1 || val === '1') return true;
    if (val === false || val === 'false' || val === 0 || val === '0') return false;
    return undefined;
  }

  private static checkRange(minVal: number | undefined, maxVal: number | undefined, field: string, labelFa: string): void {
    if (minVal !== undefined && maxVal !== undefined && minVal > maxVal) {
      throw new PropertySearchValidationError(field, `حداقل ${labelFa} (${minVal}) نمی‌تواند از حداکثر (${maxVal}) بیشتر باشد.`, 'CONTRADICTORY_RANGE');
    }
  }

  private static parseDealType(val: unknown): SearchDealType | undefined {
    if (typeof val !== 'string') return undefined;
    const s = val.trim().toLowerCase();
    if (s === 'sale' || s === 'خرید' || s === 'فروش') return 'sale';
    if (s === 'rent' || s === 'اجاره' || s === 'رهن') return 'rent';
    return undefined;
  }

  public validateFilters(raw: Record<string, unknown>): PropertySearchQueryFilters {
    const filters: PropertySearchQueryFilters = {};

    if (typeof raw.keyword === 'string') {
      const kw = SearchQueryValidator.normalizePersianText(raw.keyword);
      if (kw.length > 0) {
        if (kw.length > 120) throw new PropertySearchValidationError('keyword', 'Keyword cannot exceed 120 characters.');
        filters.keyword = kw;
      }
    }

    if (raw.category) {
      const cat = String(raw.category).toLowerCase().trim() as PropertyCategory;
      if (!VALID_CATEGORIES.has(cat)) throw new PropertySearchValidationError('category', `Invalid category "${cat}".`);
      filters.category = cat;
      if (raw.subtype) {
        const sub = String(raw.subtype).toLowerCase().trim() as PropertySubtype;
        if (!VALID_SUBTYPES[cat]?.has(sub)) throw new PropertySearchValidationError('subtype', `Subtype "${sub}" is invalid for "${cat}".`);
        filters.subtype = sub;
      }
    }

    if (raw.dealType || raw.type) {
      const dt = SearchQueryValidator.parseDealType(raw.dealType ?? raw.type);
      if (!dt) throw new PropertySearchValidationError('dealType', 'Invalid dealType. Must be "sale" (خرید) or "rent" (اجاره).');
      filters.dealType = dt;
    }

    if (typeof raw.cityId === 'string' && raw.cityId.trim()) filters.cityId = raw.cityId.trim().toLowerCase();
    if (typeof raw.districtId === 'string' && raw.districtId.trim()) filters.districtId = raw.districtId.trim();

    if (Array.isArray(raw.neighborhoodIds)) {
      const parsedIds = raw.neighborhoodIds.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 9999);
      if (parsedIds.length > 0) filters.neighborhoodIds = Array.from(new Set(parsedIds));
    } else if (raw.hoodId !== undefined && raw.hoodId !== null) {
      const singleId = Number(raw.hoodId);
      if (Number.isInteger(singleId) && singleId > 0) filters.neighborhoodIds = [singleId];
    }

    if (raw.boundingBox && typeof raw.boundingBox === 'object') {
      const b = raw.boundingBox as Record<string, unknown>;
      const minLat = SearchQueryValidator.parseNum(b.minLat, 'boundingBox.minLat', -90, 90)!;
      const maxLat = SearchQueryValidator.parseNum(b.maxLat, 'boundingBox.maxLat', -90, 90)!;
      const minLng = SearchQueryValidator.parseNum(b.minLng, 'boundingBox.minLng', -180, 180)!;
      const maxLng = SearchQueryValidator.parseNum(b.maxLng, 'boundingBox.maxLng', -180, 180)!;
      if (minLat > maxLat || minLng > maxLng) throw new PropertySearchValidationError('boundingBox', 'Invalid boundingBox coordinates.');
      filters.boundingBox = { minLat, maxLat, minLng, maxLng };
    }

    if (raw.nearLocation && typeof raw.nearLocation === 'object') {
      const n = raw.nearLocation as Record<string, unknown>;
      const lat = SearchQueryValidator.parseNum(n.lat, 'nearLocation.lat', -90, 90)!;
      const lng = SearchQueryValidator.parseNum(n.lng, 'nearLocation.lng', -180, 180)!;
      const radiusMeters = SearchQueryValidator.parseNum(n.radiusMeters, 'nearLocation.radiusMeters', 50, 50_000)!;
      filters.nearLocation = { lat, lng, radiusMeters };
    }

    // Price filters (million Toman)
    filters.minAskingPriceMillion = SearchQueryValidator.parseNum(raw.minAskingPriceMillion ?? raw.minPriceMillion, 'minAskingPriceMillion', 0);
    filters.maxAskingPriceMillion = SearchQueryValidator.parseNum(raw.maxAskingPriceMillion ?? raw.maxPriceMillion, 'maxAskingPriceMillion', 0);
    SearchQueryValidator.checkRange(filters.minAskingPriceMillion, filters.maxAskingPriceMillion, 'minAskingPriceMillion', 'قیمت خرید');

    filters.minMonthlyRentMillion = SearchQueryValidator.parseNum(raw.minMonthlyRentMillion ?? raw.minRentMillion, 'minMonthlyRentMillion', 0);
    filters.maxMonthlyRentMillion = SearchQueryValidator.parseNum(raw.maxMonthlyRentMillion ?? raw.maxRentMillion, 'maxMonthlyRentMillion', 0);
    SearchQueryValidator.checkRange(filters.minMonthlyRentMillion, filters.maxMonthlyRentMillion, 'minMonthlyRentMillion', 'اجاره ماهیانه');

    filters.minDepositMillion = SearchQueryValidator.parseNum(raw.minDepositMillion ?? raw.minRahnMillion, 'minDepositMillion', 0);
    filters.maxDepositMillion = SearchQueryValidator.parseNum(raw.maxDepositMillion ?? raw.maxRahnMillion, 'maxDepositMillion', 0);
    SearchQueryValidator.checkRange(filters.minDepositMillion, filters.maxDepositMillion, 'minDepositMillion', 'رهن/ودیعه');

    filters.minPricePerSqmMillion = SearchQueryValidator.parseNum(raw.minPricePerSqmMillion, 'minPricePerSqmMillion', 0);
    filters.maxPricePerSqmMillion = SearchQueryValidator.parseNum(raw.maxPricePerSqmMillion, 'maxPricePerSqmMillion', 0);
    SearchQueryValidator.checkRange(filters.minPricePerSqmMillion, filters.maxPricePerSqmMillion, 'minPricePerSqmMillion', 'قیمت هر متر');

    filters.maxPriceToValuationRatio = SearchQueryValidator.parseNum(raw.maxPriceToValuationRatio, 'maxPriceToValuationRatio', 0.1, 5.0);

    // Area filters (sqm)
    filters.minAreaSqm = SearchQueryValidator.parseNum(raw.minAreaSqm ?? raw.minSqm, 'minAreaSqm', 5);
    filters.maxAreaSqm = SearchQueryValidator.parseNum(raw.maxAreaSqm ?? raw.maxSqm, 'maxAreaSqm', 5);
    SearchQueryValidator.checkRange(filters.minAreaSqm, filters.maxAreaSqm, 'minAreaSqm', 'متراژ');

    // Structural filters
    filters.minRooms = SearchQueryValidator.parseNum(raw.minRooms, 'minRooms', 0, 20);
    filters.maxRooms = SearchQueryValidator.parseNum(raw.maxRooms, 'maxRooms', 0, 20);
    SearchQueryValidator.checkRange(filters.minRooms, filters.maxRooms, 'minRooms', 'تعداد اتاق');

    filters.minBuildingAgeYears = SearchQueryValidator.parseNum(raw.minBuildingAgeYears, 'minBuildingAgeYears', 0, 100);
    filters.maxBuildingAgeYears = SearchQueryValidator.parseNum(raw.maxBuildingAgeYears, 'maxBuildingAgeYears', 0, 100);
    SearchQueryValidator.checkRange(filters.minBuildingAgeYears, filters.maxBuildingAgeYears, 'minBuildingAgeYears', 'سن بنا');

    filters.minFloor = SearchQueryValidator.parseNum(raw.minFloor, 'minFloor', -5, 100);
    filters.maxFloor = SearchQueryValidator.parseNum(raw.maxFloor, 'maxFloor', -5, 100);
    SearchQueryValidator.checkRange(filters.minFloor, filters.maxFloor, 'minFloor', 'طبقه');

    filters.hasParking = SearchQueryValidator.parseBool(raw.hasParking);
    filters.hasElevator = SearchQueryValidator.parseBool(raw.hasElevator);
    filters.hasStorage = SearchQueryValidator.parseBool(raw.hasStorage);
    filters.hasBalcony = SearchQueryValidator.parseBool(raw.hasBalcony);

    if (typeof raw.renovationCondition === 'string') {
      const rc = raw.renovationCondition.trim().toLowerCase();
      if (['luxury_renovated', 'renovated', 'standard', 'needs_renovation'].includes(rc)) {
        filters.renovationCondition = rc as PropertySearchQueryFilters['renovationCondition'];
      }
    }
    if (typeof raw.constructionStatus === 'string') {
      const cs = raw.constructionStatus.trim().toLowerCase();
      if (['completed', 'under_construction', 'presale'].includes(cs)) {
        filters.constructionStatus = cs as PropertySearchQueryFilters['constructionStatus'];
      }
    }

    filters.minShopFrontageMeters = SearchQueryValidator.parseNum(raw.minShopFrontageMeters, 'minShopFrontageMeters', 0, 100);
    filters.hasCommercialLicense = SearchQueryValidator.parseBool(raw.hasCommercialLicense);
    filters.suitableForMedical = SearchQueryValidator.parseBool(raw.suitableForMedical);

    if (typeof raw.publishedAfterIso === 'string' && !isNaN(Date.parse(raw.publishedAfterIso))) {
      filters.publishedAfterIso = new Date(raw.publishedAfterIso).toISOString();
    }
    if (typeof raw.publishedBeforeIso === 'string' && !isNaN(Date.parse(raw.publishedBeforeIso))) {
      filters.publishedBeforeIso = new Date(raw.publishedBeforeIso).toISOString();
    }
    if (filters.publishedAfterIso && filters.publishedBeforeIso && filters.publishedAfterIso > filters.publishedBeforeIso) {
      throw new PropertySearchValidationError('publishedAfterIso', 'publishedAfterIso cannot be later than publishedBeforeIso.');
    }

    filters.onlyVerified = SearchQueryValidator.parseBool(raw.onlyVerified);

    return filters;
  }

  public validateSearchRequest(rawBody: unknown): PropertySearchRequest {
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new PropertySearchValidationError('request', 'Search request must be a valid JSON object.');
    }
    const body = rawBody as Record<string, unknown>;
    const rawFilters = (body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters))
      ? (body.filters as Record<string, unknown>)
      : body;

    const filters = this.validateFilters(rawFilters);

    let sort: SearchSortMode = 'newest';
    if (body.sort) {
      const sm = String(body.sort).toLowerCase().trim() as SearchSortMode;
      if (!VALID_SORT_MODES.has(sm)) {
        throw new PropertySearchValidationError('sort', `Invalid sort mode "${sm}". Valid: ${[...VALID_SORT_MODES].join(', ')}`);
      }
      sort = sm;
    }

    const rawLimit = body.limit !== undefined ? Number(body.limit) : 20;
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
      throw new PropertySearchValidationError('limit', 'Limit must be an integer between 1 and 100.');
    }

    const cursor = typeof body.cursor === 'string' && body.cursor.trim().length > 0 ? body.cursor.trim() : undefined;

    return {
      filters,
      sort,
      limit: rawLimit,
      cursor,
      requestCaller: (body.requestCaller && typeof body.requestCaller === 'object')
        ? (body.requestCaller as PropertySearchRequest['requestCaller'])
        : undefined,
    };
  }

  public static validate(rawBody: unknown): PropertySearchRequest {
    return new SearchQueryValidator().validateSearchRequest(rawBody);
  }

  public validateSaveSearch(rawBody: unknown): SaveSearchInput {
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new PropertySearchValidationError('body', 'SaveSearch input must be an object.');
    }
    const b = rawBody as Record<string, unknown>;
    const titleFa = SearchQueryValidator.normalizePersianText(b.titleFa);
    if (!titleFa || titleFa.length < 2 || titleFa.length > 100) {
      throw new PropertySearchValidationError('titleFa', 'Title is required (2 to 100 characters).');
    }

    const rawFilters = (b.filters && typeof b.filters === 'object' && !Array.isArray(b.filters))
      ? (b.filters as Record<string, unknown>)
      : {};
    const filters = this.validateFilters(rawFilters);

    let sortMode: SearchSortMode | undefined;
    if (b.sortMode) {
      const sm = String(b.sortMode).toLowerCase().trim() as SearchSortMode;
      if (VALID_SORT_MODES.has(sm)) sortMode = sm;
    }

    return {
      titleFa,
      filters,
      sortMode,
      notifyOnNewMatches: SearchQueryValidator.parseBool(b.notifyOnNewMatches) ?? false,
    };
  }

  public validateUpdateSavedSearch(rawBody: unknown): UpdateSavedSearchInput {
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new PropertySearchValidationError('body', 'UpdateSavedSearch input must be an object.');
    }
    const b = rawBody as Record<string, unknown>;
    const result: UpdateSavedSearchInput = {};

    if (b.titleFa !== undefined) {
      const titleFa = SearchQueryValidator.normalizePersianText(b.titleFa);
      if (!titleFa || titleFa.length < 2 || titleFa.length > 100) {
        throw new PropertySearchValidationError('titleFa', 'Title must be 2 to 100 characters.');
      }
      result.titleFa = titleFa;
    }

    if (b.filters && typeof b.filters === 'object' && !Array.isArray(b.filters)) {
      result.filters = this.validateFilters(b.filters as Record<string, unknown>);
    }

    if (b.sortMode !== undefined) {
      const sm = String(b.sortMode).toLowerCase().trim() as SearchSortMode;
      if (!VALID_SORT_MODES.has(sm)) throw new PropertySearchValidationError('sortMode', 'Invalid sortMode.');
      result.sortMode = sm;
    }

    if (b.notifyOnNewMatches !== undefined) {
      result.notifyOnNewMatches = SearchQueryValidator.parseBool(b.notifyOnNewMatches);
    }

    return result;
  }

  public validateSuggestionsRequest(rawParams: Record<string, unknown>): SearchSuggestionsRequest {
    const prefix = SearchQueryValidator.normalizePersianText(rawParams.prefix ?? rawParams.q);
    const cityId = typeof rawParams.cityId === 'string' ? rawParams.cityId.trim().toLowerCase() : undefined;
    const rawLimit = rawParams.limit !== undefined ? Number(rawParams.limit) : 8;
    const limit = Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 20 ? rawLimit : 8;
    const userUid = typeof rawParams.userUid === 'string' ? rawParams.userUid.trim() : undefined;
    const includeRecent = SearchQueryValidator.parseBool(rawParams.includeRecent) ?? false;

    return {
      prefix,
      cityId,
      limit,
      userUid,
      includeRecent,
    };
  }
}
