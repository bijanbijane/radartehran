/**
 * @file src/platform/entity-detail/adapters/BuildingDetailAdapter.ts
 * @description Adapts raw Building payloads to EntityDetailModel (Stage 7 Section 7) separating knownUnitsCount from totalUnitsCount.
 */

import type { AccessContext } from '../../authorization';
import {
  buildCanonicalEntityDetailPath,
  createEntityDetailField,
  resolveEntityDetailCapabilities,
} from '../core/EntityDetailContract';
import type { EntityDetailMediaItem, EntityDetailModel, EntityGeoPoint } from '../core/EntityDetailTypes';
import { validateEntityGeoPoint } from '../core/EntityDetailValidation';

export interface RawBuildingDetailInput {
  id: string;
  title?: string;
  cityId?: string;
  cityNameFa?: string;
  neighborhoodId?: string;
  neighborhoodNameFa?: string;
  geoPoint?: Partial<EntityGeoPoint> | null;
  totalFloors?: number | null;
  lotCoveragePct?: number | null;
  landAreaSqm?: number | null;
  structureType?: string | null;
  buildYearJalali?: number | null;
  structuralConditionFa?: string | null;
  totalUnitsCount?: number | null;
  knownUnitsCount?: number | null;
  hasElevator?: boolean | null;
  hasParking?: boolean | null;
  usageType?: 'residential' | 'commercial' | 'office' | 'mixed' | string | null;
  units?: Array<{ id: string; title: string }>;
  media?: EntityDetailMediaItem[];
  updatedAtIso?: string | null;
  lastVerifiedAtIso?: string | null;
}

export function adaptBuildingDetail(
  raw: RawBuildingDetailInput,
  accessContext?: AccessContext
): EntityDetailModel {
  const id = String(raw.id || '').trim();
  const capabilities = resolveEntityDetailCapabilities('building', accessContext, {
    resourceId: id,
    cityId: raw.cityId,
  });

  const canSeePrivate = Boolean(capabilities.canViewPrivateData);
  const geoPoint = validateEntityGeoPoint(raw.geoPoint, canSeePrivate);

  // Rule 7: Never present knownUnitsCount as definitive totalUnitsCount!
  const totalUnits =
    typeof raw.totalUnitsCount === 'number' && raw.totalUnitsCount > 0 ? raw.totalUnitsCount : null;
  const knownUnits =
    typeof raw.knownUnitsCount === 'number' && raw.knownUnitsCount >= 0
      ? raw.knownUnitsCount
      : Array.isArray(raw.units)
        ? raw.units.length
        : null;

  return {
    id,
    entityType: 'building',
    title: raw.title || `ساختمان شماره ${id}`,
    canonicalPath: buildCanonicalEntityDetailPath('building', id),
    cityId: raw.cityId,
    cityNameFa: raw.cityNameFa,
    neighborhoodId: raw.neighborhoodId,
    neighborhoodNameFa: raw.neighborhoodNameFa,
    pageStatus: 'Success',
    geoPoint,
    fields: {
      totalFloors: createEntityDetailField(
        typeof raw.totalFloors === 'number' && raw.totalFloors > 0 ? raw.totalFloors : null,
        { unit: 'طبقه', confidence: 'verified', updatedAt: raw.updatedAtIso ?? undefined }
      ),
      lotCoveragePct: createEntityDetailField(
        typeof raw.lotCoveragePct === 'number' && raw.lotCoveragePct > 0 && raw.lotCoveragePct <= 100
          ? raw.lotCoveragePct
          : null,
        { unit: 'درصد', confidence: 'verified' }
      ),
      landAreaSqm: createEntityDetailField(
        typeof raw.landAreaSqm === 'number' && raw.landAreaSqm > 0 ? raw.landAreaSqm : null,
        { unit: 'مترمربع', confidence: 'verified' }
      ),
      structureType: createEntityDetailField(raw.structureType ?? null, { confidence: 'verified' }),
      buildYearJalali: createEntityDetailField(
        typeof raw.buildYearJalali === 'number' && raw.buildYearJalali > 1300 ? raw.buildYearJalali : null,
        { unit: 'شمسی', confidence: 'verified' }
      ),
      structuralConditionFa: createEntityDetailField(raw.structuralConditionFa ?? null, { confidence: 'verified' }),
      totalUnitsCount: createEntityDetailField(totalUnits, {
        unit: 'واحد کل',
        confidence: totalUnits !== null ? 'verified' : 'unknown',
      }),
      knownUnitsCount: createEntityDetailField(knownUnits, {
        unit: 'واحد شناخته‌شده در رادار',
        confidence: knownUnits !== null ? 'verified' : 'unknown',
      }),
      hasElevator: createEntityDetailField(raw.hasElevator ?? null, { confidence: 'verified' }),
      hasParking: createEntityDetailField(raw.hasParking ?? null, { confidence: 'verified' }),
      usageType: createEntityDetailField(raw.usageType ?? null, { confidence: 'verified' }),
    },
    media: (raw.media || []).filter((m) => canSeePrivate || !m.isPrivate),
    relatedEntities: (raw.units || []).map((u) => ({
      id: u.id,
      entityType: 'property' as const,
      title: u.title,
      canonicalPath: buildCanonicalEntityDetailPath('property', u.id),
      matchStatus: 'EXACT_VERIFIED' as const,
    })),
    capabilities,
    timestamps: {
      updatedAt: raw.updatedAtIso ?? undefined,
      lastVerifiedAt: raw.lastVerifiedAtIso ?? undefined,
    },
  };
}
