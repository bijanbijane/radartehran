/**
 * @file src/platform/entity-detail/adapters/NeighborhoodDetailAdapter.ts
 * @description Adapts raw Neighborhood payloads to EntityDetailModel (Stage 7 Section 8) with zero sampleCount inflation and geodesic polygon area.
 */

import type { AccessContext } from '../../authorization';
import {
  buildCanonicalEntityDetailPath,
  createEntityDetailField,
  resolveEntityDetailCapabilities,
} from '../core/EntityDetailContract';
import type { EntityDetailModel, EntityGeoPoint, NeighborhoodGeometry } from '../core/EntityDetailTypes';
import {
  computeGeodesicPolygonAreaSqKm,
  validateEntityGeoPoint,
  validateNeighborhoodGeometry,
} from '../core/EntityDetailValidation';

export interface RawNeighborhoodDetailInput {
  id: string;
  nameFa: string;
  cityId: string;
  cityNameFa: string;
  districtRegion?: string | null;
  geoPoint?: Partial<EntityGeoPoint> | null;
  geometry?: NeighborhoodGeometry | null;
  officialAreaSqKm?: number | null;
  askingPricePerSqmMillionToman?: number | null;
  estimatedDealPricePerSqmMillionToman?: number | null;
  realObservedSampleCount?: number | null;
  officialPopulation?: number | null;
  populationSourceId?: string;
  transitScore?: number | null;
  airQualityIndex?: number | null;
  greenSpaceScore?: number | null;
  updatedAtIso?: string | null;
  lastVerifiedAtIso?: string | null;
}

export function adaptNeighborhoodDetail(
  raw: RawNeighborhoodDetailInput,
  accessContext?: AccessContext
): EntityDetailModel {
  // Rule 8.2: Never substitute saadat-abad for other neighborhoods; always use real neighborhoodId and cityId
  const id = String(raw.id || '').trim();
  const cityId = String(raw.cityId || '').trim() || 'tehran';
  const capabilities = resolveEntityDetailCapabilities('neighborhood', accessContext, {
    resourceId: id,
    cityId,
  });

  const geoPoint = validateEntityGeoPoint(raw.geoPoint, true);
  const geomCheck = validateNeighborhoodGeometry(raw.geometry);
  const validGeometry = geomCheck.valid ? raw.geometry! : null;

  // Rule 8.2 & 8.3: Area comes from valid geodesic geometry or official source only
  const geodesicAreaSqKm = validGeometry ? computeGeodesicPolygonAreaSqKm(validGeometry) : null;
  const resolvedAreaSqKm =
    typeof raw.officialAreaSqKm === 'number' && raw.officialAreaSqKm > 0
      ? raw.officialAreaSqKm
      : geodesicAreaSqKm;

  // Rule 8.2: sampleCount is strictly the real observed count (never multiplied by *8 or *14!)
  const realSampleCount =
    typeof raw.realObservedSampleCount === 'number' && raw.realObservedSampleCount >= 0
      ? Math.floor(raw.realObservedSampleCount)
      : null;

  const hasSufficientMarketData =
    realSampleCount !== null && realSampleCount > 0 && raw.askingPricePerSqmMillionToman != null;

  const officialPop =
    typeof raw.officialPopulation === 'number' && raw.officialPopulation > 0 && raw.populationSourceId
      ? raw.officialPopulation
      : null;

  return {
    id,
    entityType: 'neighborhood',
    title: raw.nameFa || id,
    canonicalPath: buildCanonicalEntityDetailPath('neighborhood', id),
    cityId,
    cityNameFa: raw.cityNameFa || cityId,
    neighborhoodId: id,
    neighborhoodNameFa: raw.nameFa || id,
    pageStatus: hasSufficientMarketData ? 'Success' : 'Partial',
    geoPoint,
    geometry: validGeometry,
    fields: {
      cityNameFa: createEntityDetailField(raw.cityNameFa || null, { confidence: 'verified' }),
      districtRegion: createEntityDetailField(raw.districtRegion ?? null, { confidence: 'verified' }),
      areaSqKm: createEntityDetailField(resolvedAreaSqKm, {
        unit: 'کیلومترمربع',
        confidence: resolvedAreaSqKm !== null ? 'verified' : 'unknown',
        sourceId: raw.officialAreaSqKm ? 'official_municipality' : validGeometry ? 'geodesic_epsg4326' : undefined,
      }),
      askingPricePerSqm: createEntityDetailField(
        typeof raw.askingPricePerSqmMillionToman === 'number' && raw.askingPricePerSqmMillionToman > 0
          ? raw.askingPricePerSqmMillionToman
          : null,
        {
          unit: 'میلیون تومان/مترمربع',
          confidence: hasSufficientMarketData ? 'verified' : 'unverified',
          updatedAt: raw.updatedAtIso ?? undefined,
          limitationNoteFa: hasSufficientMarketData
            ? undefined
            : 'کمبود نمونه مشاهده‌شده برای برآورد قطعی شاخص بازار این محله.',
        }
      ),
      estimatedDealPricePerSqm: createEntityDetailField(
        typeof raw.estimatedDealPricePerSqmMillionToman === 'number' && raw.estimatedDealPricePerSqmMillionToman > 0
          ? raw.estimatedDealPricePerSqmMillionToman
          : null,
        {
          unit: 'میلیون تومان/مترمربع',
          confidence: 'estimated',
          updatedAt: raw.updatedAtIso ?? undefined,
        }
      ),
      sampleCount: createEntityDetailField(realSampleCount, {
        unit: 'نمونه واقعی',
        confidence: realSampleCount !== null && realSampleCount > 0 ? 'verified' : 'unknown',
        updatedAt: raw.updatedAtIso ?? undefined,
      }),
      population: createEntityDetailField(officialPop, {
        unit: 'نفر',
        confidence: officialPop !== null ? 'verified' : 'unknown',
        sourceId: raw.populationSourceId,
      }),
      transitScore: createEntityDetailField(
        typeof raw.transitScore === 'number' ? raw.transitScore : null,
        { unit: 'از ۱۰۰', confidence: 'verified' }
      ),
      airQualityIndex: createEntityDetailField(
        typeof raw.airQualityIndex === 'number' ? raw.airQualityIndex : null,
        { unit: 'AQI', confidence: 'verified' }
      ),
      greenSpaceScore: createEntityDetailField(
        typeof raw.greenSpaceScore === 'number' ? raw.greenSpaceScore : null,
        { unit: 'از ۱۰۰', confidence: 'verified' }
      ),
    },
    capabilities,
    timestamps: {
      updatedAt: raw.updatedAtIso ?? undefined,
      lastVerifiedAt: raw.lastVerifiedAtIso ?? undefined,
    },
  };
}
