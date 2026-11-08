import {
  CanonicalNeighborhood,
  defaultGeographicService,
  getCityByIdOrName,
  getNeighborhoodByCityAndId,
  getNeighborhoodByCompositeId,
  getProvinceById,
  listNeighborhoodsByCity,
} from '../geography';
import { ProvinceId, SupportedCityId } from '../geography/types';
import {
  ConstructionStageType,
  GeographicJurisdictionScope,
  LandUseCategoryType,
  PropertyCategoryType,
} from './types';
import { LegalRegulatoryError } from './validationAndAuthz';

export interface ResolvedGeographyMatch {
  valid: boolean;
  countryCode: 'IR';
  provinceId?: ProvinceId;
  cityId?: SupportedCityId;
  districtNumber?: number;
  neighborhoodId?: string;
  neighborhoodNameFa?: string;
  warnings: string[];
}

export interface GeographyLookupAdapter {
  validateJurisdictionScope(scope: GeographicJurisdictionScope): ResolvedGeographyMatch;
  resolvePropertyGeography(input: {
    provinceId?: ProvinceId;
    cityId?: SupportedCityId;
    districtNumber?: number;
    neighborhoodId?: string;
  }): ResolvedGeographyMatch;
}

export interface ExternalPropertyCharacteristicsSnapshot {
  propertyId: string;
  cityId?: SupportedCityId;
  provinceId?: ProvinceId;
  districtNumber?: number;
  neighborhoodId?: string;
  propertyCategory?: PropertyCategoryType;
  landUseCategory?: LandUseCategoryType;
  constructionStage?: ConstructionStageType;
  floorsCount?: number;
  plotAreaSqm?: number;
  buildingAgeYears?: number;
  isWornOutTextureBaftFarsoodeh?: boolean;
  isNearActiveFaultLine?: boolean;
}

/**
 * Read-only adapter for referencing property characteristics owned by the Property Registry
 * or Property Search modules. This adapter intentionally exposes ZERO write methods so the
 * Legal & Regulatory Intelligence module can never mutate external property records.
 */
export interface PropertyContextReferenceAdapter {
  getPropertyCharacteristicsById(propertyId: string): Promise<ExternalPropertyCharacteristicsSnapshot | null>;
}

function findNeighborhoodInCity(
  cityId: SupportedCityId,
  neighborhoodIdentifier: string,
): CanonicalNeighborhood | null {
  const trimmed = neighborhoodIdentifier.trim();
  if (!trimmed) return null;

  const numericId = Number(trimmed);
  if (Number.isSafeInteger(numericId) && numericId > 0) {
    const byNum = getNeighborhoodByCityAndId(cityId, numericId);
    if (byNum) return byNum;
  }

  if (trimmed.includes(':')) {
    const byComp = getNeighborhoodByCompositeId(trimmed);
    if (byComp && byComp.cityId === cityId) return byComp;
  }

  const resolved = defaultGeographicService.resolveAmbiguousName(trimmed, cityId);
  if (resolved.candidates.length > 0) {
    return resolved.candidates[0].neighborhood;
  }

  const allInCity = listNeighborhoodsByCity(cityId);
  const lower = trimmed.toLowerCase();
  return (
    allInCity.find(
      (h) =>
        h.nameFa === trimmed ||
        h.slug.toLowerCase() === lower ||
        h.compositeId.toLowerCase() === lower,
    ) ?? null
  );
}

export class CanonicalGeographyLookupAdapter implements GeographyLookupAdapter {
  validateJurisdictionScope(scope: GeographicJurisdictionScope): ResolvedGeographyMatch {
    const warnings: string[] = [];
    if (scope.countryCode !== 'IR') {
      return {
        valid: false,
        countryCode: 'IR',
        warnings: [`Unsupported countryCode '${String(scope.countryCode)}'. Expected 'IR'.`],
      };
    }

    let resolvedProvinceId = scope.provinceId;
    if (scope.provinceId) {
      const province = getProvinceById(scope.provinceId);
      if (!province) {
        return {
          valid: false,
          countryCode: 'IR',
          warnings: [`Province '${scope.provinceId}' is not registered in the canonical geography hierarchy.`],
        };
      }
    }

    if (scope.cityId) {
      const city = getCityByIdOrName(scope.cityId);
      if (!city) {
        return {
          valid: false,
          countryCode: 'IR',
          provinceId: resolvedProvinceId,
          warnings: [`City '${scope.cityId}' is not registered in the canonical geography hierarchy.`],
        };
      }
      if (resolvedProvinceId && city.provinceId !== resolvedProvinceId) {
        return {
          valid: false,
          countryCode: 'IR',
          provinceId: resolvedProvinceId,
          cityId: city.id,
          warnings: [
            `City '${city.id}' belongs to province '${city.provinceId}', which conflicts with specified province '${resolvedProvinceId}'.`,
          ],
        };
      }
      resolvedProvinceId = city.provinceId;
    }

    let neighborhoodNameFa: string | undefined;
    let resolvedDistrict = scope.districtNumber;
    if (scope.neighborhoodId) {
      if (!scope.cityId) {
        return {
          valid: false,
          countryCode: 'IR',
          provinceId: resolvedProvinceId,
          warnings: ['neighborhoodId cannot be validated without a canonical cityId.'],
        };
      }
      const hood = findNeighborhoodInCity(scope.cityId, scope.neighborhoodId);
      if (!hood) {
        return {
          valid: false,
          countryCode: 'IR',
          provinceId: resolvedProvinceId,
          cityId: scope.cityId,
          warnings: [
            `Neighborhood '${scope.neighborhoodId}' was not found inside canonical city '${scope.cityId}'.`,
          ],
        };
      }
      neighborhoodNameFa = hood.nameFa;
      if (
        scope.districtNumber !== undefined &&
        hood.districtNumber !== null &&
        hood.districtNumber !== scope.districtNumber
      ) {
        warnings.push(
          `Neighborhood '${hood.nameFa}' is in district ${hood.districtNumber}, overriding provided district ${scope.districtNumber}.`,
        );
      }
      resolvedDistrict = hood.districtNumber ?? scope.districtNumber;
    }

    return {
      valid: true,
      countryCode: 'IR',
      provinceId: resolvedProvinceId,
      cityId: scope.cityId,
      districtNumber: resolvedDistrict,
      neighborhoodId: scope.neighborhoodId,
      neighborhoodNameFa,
      warnings,
    };
  }

  resolvePropertyGeography(input: {
    provinceId?: ProvinceId;
    cityId?: SupportedCityId;
    districtNumber?: number;
    neighborhoodId?: string;
  }): ResolvedGeographyMatch {
    const inferredLevel = input.neighborhoodId
      ? 'NEIGHBORHOOD'
      : input.districtNumber !== undefined
        ? 'DISTRICT'
        : input.cityId
          ? 'CITY'
          : input.provinceId
            ? 'PROVINCIAL'
            : 'NATIONAL';

    return this.validateJurisdictionScope({
      level: inferredLevel,
      countryCode: 'IR',
      provinceId: input.provinceId,
      cityId: input.cityId,
      districtNumber: input.districtNumber,
      neighborhoodId: input.neighborhoodId,
    });
  }
}

export class ReadOnlyInMemoryPropertyContextAdapter implements PropertyContextReferenceAdapter {
  private readonly records = new Map<string, ExternalPropertyCharacteristicsSnapshot>();

  constructor(initialSnapshots: ExternalPropertyCharacteristicsSnapshot[] = []) {
    for (const snap of initialSnapshots) {
      this.records.set(snap.propertyId, { ...snap });
    }
  }

  async getPropertyCharacteristicsById(
    propertyId: string,
  ): Promise<ExternalPropertyCharacteristicsSnapshot | null> {
    const found = this.records.get(propertyId);
    return found ? { ...found } : null;
  }

  attemptProhibitedExternalWrite(_propertyId: string): never {
    throw new LegalRegulatoryError(
      'CROSS_MODULE_WRITE_PROHIBITED',
      'Legal & Regulatory Intelligence module is strictly prohibited from mutating Property Registry or external module records.',
      403,
    );
  }
}
