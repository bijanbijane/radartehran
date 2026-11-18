/**
 * @file src/platform/geo-context/index.ts
 * @description Stage 20 (RT-FE-REBUILD-MULTICITY-CONTEXT-INTEGRITY-020) Canonical Multi-City Context Engine.
 * Enforces zero silent fallback to Tehran, strict (cityId, neighborhoodId) pair consistency across
 * all 5 supported cities (tehran, karaj, mashhad, isfahan, shiraz), deterministic state reset on city switch,
 * and mandatory cityId in all spatial/market cache keys.
 */
import { MULTI_CITY_CONFIGS, type CityId } from '../../data/multiCityData';
import type { Neighborhood } from '../../data/neighborhoods';

export const SUPPORTED_FIVE_CITY_IDS: readonly CityId[] = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'] as const;

export const CITY_PROVINCE_MAP: Record<CityId, string> = {
  tehran: 'tehran_province',
  karaj: 'alborz_province',
  mashhad: 'khorasan_razavi_province',
  isfahan: 'isfahan_province',
  shiraz: 'fars_province',
};

export interface CanonicalCityContext {
  cityId: CityId;
  cityNameFa: string;
  provinceId: string;
  center: [number, number];
  defaultZoom: number;
  contextVersion: number;
  source: 'route' | 'user_selection' | 'default';
}

export interface CityResolutionResult {
  valid: boolean;
  context: CanonicalCityContext | null;
  errorCode?: 'INVALID_CITY_ID' | 'EMPTY_CITY_ID';
  errorMessageFa?: string;
}

export function isSupportedCanonicalCityId(raw: unknown): raw is CityId {
  return typeof raw === 'string' && (SUPPORTED_FIVE_CITY_IDS as readonly string[]).includes(raw);
}

export function resolveCanonicalCityContext(
  rawCityId: unknown,
  options: { source?: 'route' | 'user_selection' | 'default'; contextVersion?: number; allowDefaultWhenMissing?: boolean } = {},
): CityResolutionResult {
  const source = options.source ?? 'user_selection';
  const contextVersion = options.contextVersion ?? 1;
  if (rawCityId === undefined || rawCityId === null || rawCityId === '') {
    if (options.allowDefaultWhenMissing) {
      const cfg = MULTI_CITY_CONFIGS.tehran;
      return {
        valid: true,
        context: {
          cityId: 'tehran',
          cityNameFa: cfg.nameFa,
          provinceId: CITY_PROVINCE_MAP.tehran,
          center: cfg.center,
          defaultZoom: cfg.defaultZoom,
          contextVersion,
          source: 'default',
        },
      };
    }
    return { valid: false, context: null, errorCode: 'EMPTY_CITY_ID', errorMessageFa: 'شناسه شهر مشخص نشده است.' };
  }
  if (!isSupportedCanonicalCityId(rawCityId)) {
    return {
      valid: false,
      context: null,
      errorCode: 'INVALID_CITY_ID',
      errorMessageFa: `شناسه شهر «${String(rawCityId)}» معتبر نیست؛ نمایش داده شهر دیگر (Fallback خاموش) مسدود شد.`,
    };
  }
  const cfg = MULTI_CITY_CONFIGS[rawCityId];
  return {
    valid: true,
    context: {
      cityId: rawCityId,
      cityNameFa: cfg.nameFa,
      provinceId: CITY_PROVINCE_MAP[rawCityId],
      center: cfg.center,
      defaultZoom: cfg.defaultZoom,
      contextVersion,
      source,
    },
  };
}

export interface CityNeighborhoodConsistencyResult {
  valid: boolean;
  cityId: CityId | null;
  neighborhoodId: number;
  actualOwnerCityId: CityId | null;
  neighborhood: Neighborhood | null;
  errorCode?: 'INVALID_CITY_ID' | 'NEIGHBORHOOD_NOT_FOUND' | 'CROSS_CITY_MISMATCH';
  errorMessageFa?: string;
}

export function findNeighborhoodOwnerCity(neighborhoodId: number): { cityId: CityId; neighborhood: Neighborhood } | null {
  for (const cityId of SUPPORTED_FIVE_CITY_IDS) {
    const found = MULTI_CITY_CONFIGS[cityId].neighborhoods.find((n) => n.id === neighborhoodId);
    if (found) return { cityId, neighborhood: found };
  }
  return null;
}

export function validateCityNeighborhoodPair(rawCityId: unknown, neighborhoodId: number): CityNeighborhoodConsistencyResult {
  if (!isSupportedCanonicalCityId(rawCityId)) {
    return {
      valid: false,
      cityId: null,
      neighborhoodId,
      actualOwnerCityId: null,
      neighborhood: null,
      errorCode: 'INVALID_CITY_ID',
      errorMessageFa: `شهر «${String(rawCityId)}» در فهرست ۵ شهر پشتیبانی‌شده وجود ندارد.`,
    };
  }
  const inTargetCity = MULTI_CITY_CONFIGS[rawCityId].neighborhoods.find((n) => n.id === neighborhoodId);
  if (inTargetCity) {
    return { valid: true, cityId: rawCityId, neighborhoodId, actualOwnerCityId: rawCityId, neighborhood: inTargetCity };
  }
  const owner = findNeighborhoodOwnerCity(neighborhoodId);
  if (owner) {
    return {
      valid: false,
      cityId: rawCityId,
      neighborhoodId,
      actualOwnerCityId: owner.cityId,
      neighborhood: null,
      errorCode: 'CROSS_CITY_MISMATCH',
      errorMessageFa: `عدم تطابق جغرافیایی: محله «${owner.neighborhood.name}» (#${neighborhoodId}) متعلق به شهر «${MULTI_CITY_CONFIGS[owner.cityId].nameFa}» است، نه «${MULTI_CITY_CONFIGS[rawCityId].nameFa}».`,
    };
  }
  return {
    valid: false,
    cityId: rawCityId,
    neighborhoodId,
    actualOwnerCityId: null,
    neighborhood: null,
    errorCode: 'NEIGHBORHOOD_NOT_FOUND',
    errorMessageFa: `محله با شناسه #${neighborhoodId} در هیچ‌یک از شهرهای پشتیبانی‌شده یافت نشد.`,
  };
}

export interface MultiCityDependentState {
  cityId: CityId;
  contextVersion: number;
  selectedHoodId: number | null;
  selectedZone: string | null;
  compareHoodIds: number[];
  mapViewport: { center: [number, number]; zoom: number };
  valuationNeighborhoodId: number | null;
}

export function reconcileCityContextSwitch(
  input:
    | MultiCityDependentState
    | {
        previousCityId: CityId;
        nextCityRaw: unknown;
        selectedNeighborhoodId: number | null;
        selectedZone: string | null;
        compareNeighborhoodIds: readonly number[];
      },
  nextRawCityIdArg?: unknown,
): {
  ok: boolean;
  resetPerformed: boolean;
  selectedNeighborhoodId: number | null;
  compareNeighborhoodIds: number[];
  nextState: MultiCityDependentState;
  clearedEntities: string[];
  errorFa?: string;
} {
  const isCompactCall = 'previousCityId' in input;
  const currentState: MultiCityDependentState = isCompactCall
    ? {
        cityId: input.previousCityId,
        contextVersion: 1,
        selectedHoodId: input.selectedNeighborhoodId,
        selectedZone: input.selectedZone,
        compareHoodIds: [...input.compareNeighborhoodIds],
        mapViewport: { center: MULTI_CITY_CONFIGS[input.previousCityId].center, zoom: MULTI_CITY_CONFIGS[input.previousCityId].defaultZoom },
        valuationNeighborhoodId: input.selectedNeighborhoodId,
      }
    : input;
  const targetRaw = isCompactCall ? input.nextCityRaw : nextRawCityIdArg;
  const resolved = resolveCanonicalCityContext(targetRaw, {
    source: 'user_selection',
    contextVersion: currentState.contextVersion + 1,
  });
  if (!resolved.valid || !resolved.context) {
    return {
      ok: false,
      resetPerformed: false,
      selectedNeighborhoodId: currentState.selectedHoodId,
      compareNeighborhoodIds: currentState.compareHoodIds,
      nextState: currentState,
      clearedEntities: [],
      errorFa: resolved.errorMessageFa,
    };
  }
  const nextCityId = resolved.context.cityId;
  const cityHoods = MULTI_CITY_CONFIGS[nextCityId].neighborhoods;
  const validHoodIds = new Set(cityHoods.map((h) => h.id));
  const validZones = new Set(cityHoods.map((h) => h.zone));
  const clearedEntities: string[] = [];

  let nextSelectedHoodId = currentState.selectedHoodId;
  if (nextSelectedHoodId !== null && !validHoodIds.has(nextSelectedHoodId)) {
    nextSelectedHoodId = null;
    clearedEntities.push('selectedHood');
  }
  let nextSelectedZone = currentState.selectedZone;
  if (nextSelectedZone !== null && !validZones.has(nextSelectedZone)) {
    nextSelectedZone = null;
    clearedEntities.push('selectedZone');
  }
  const nextCompareHoodIds = currentState.compareHoodIds.filter((id) => validHoodIds.has(id));
  if (nextCompareHoodIds.length !== currentState.compareHoodIds.length) clearedEntities.push('compareHoodIds');
  let nextValuationHoodId = currentState.valuationNeighborhoodId;
  if (nextValuationHoodId !== null && !validHoodIds.has(nextValuationHoodId)) {
    nextValuationHoodId = null;
    clearedEntities.push('valuationContext');
  }
  const nextState: MultiCityDependentState = {
    cityId: nextCityId,
    contextVersion: resolved.context.contextVersion,
    selectedHoodId: nextSelectedHoodId,
    selectedZone: nextSelectedZone,
    compareHoodIds: nextCompareHoodIds,
    mapViewport: { center: resolved.context.center, zoom: resolved.context.defaultZoom },
    valuationNeighborhoodId: nextValuationHoodId,
  };
  return {
    ok: true,
    resetPerformed: clearedEntities.length > 0 || nextCityId !== currentState.cityId,
    selectedNeighborhoodId: nextSelectedHoodId,
    compareNeighborhoodIds: nextCompareHoodIds,
    nextState,
    clearedEntities,
  };
}

export function buildCityScopedQueryKey(
  cityOrParams:
    | CityId
    | {
        namespace: 'market-snapshot' | 'discovery-feed' | 'map-clusters' | 'valuation-comparables' | 'home-metrics';
        cityId: unknown;
        geoLevel?: string;
        neighborhoodId?: number | null;
        period?: string;
        transactionType?: string;
      },
  domain?: string,
  subKey?: string,
): any {
  if (typeof cityOrParams === 'string') {
    if (!isSupportedCanonicalCityId(cityOrParams)) {
      throw new Error(`INVALID_CITY_QUERY_KEY:${String(cityOrParams)}`);
    }
    return `rt:city:${cityOrParams}:${domain || 'default'}:${subKey || 'root'}`;
  }
  if (!isSupportedCanonicalCityId(cityOrParams.cityId)) {
    return { valid: false, key: null, errorFa: 'کلید Cache فاقد cityId معتبر است و برای جلوگیری از اختلاط داده شهرها رد شد.' };
  }
  if (typeof cityOrParams.neighborhoodId === 'number') {
    const pairCheck = validateCityNeighborhoodPair(cityOrParams.cityId, cityOrParams.neighborhoodId);
    if (!pairCheck.valid) return { valid: false, key: null, errorFa: pairCheck.errorMessageFa };
  }
  return {
    valid: true,
    key: [
      cityOrParams.namespace,
      cityOrParams.cityId,
      cityOrParams.geoLevel || 'city',
      cityOrParams.neighborhoodId ?? 'all',
      cityOrParams.period || 'default',
      cityOrParams.transactionType || 'sale',
    ] as const,
  };
}
