/**
 * @file src/platform/entity-detail/adapters/PropertyDetailAdapter.ts
 * @description Adapts raw Property payloads to EntityDetailModel (Stage 7 Section 5) with propertySubType-aware fields and privacy controls.
 */

import type { AccessContext } from '../../authorization';
import {
  buildCanonicalEntityDetailPath,
  createEntityDetailField,
  resolveEntityDetailCapabilities,
} from '../core/EntityDetailContract';
import { normalizeEntityFinancialFields } from '../core/EntityDetailNormalizer';
import type { DataConfidence, EntityDetailMediaItem, EntityDetailModel, EntityGeoPoint } from '../core/EntityDetailTypes';
import { validateEntityGeoPoint } from '../core/EntityDetailValidation';

export interface RawPropertyDetailInput {
  id: string;
  ownerUserId?: string;
  workspaceId?: string;
  title?: string;
  propertySubType?: 'apartment' | 'villa' | 'land' | 'office' | 'commercial' | string;
  propertyStatus?: 'active' | 'archived' | 'deleted' | 'restricted';
  cityId?: string;
  cityNameFa?: string;
  districtZone?: string | null;
  neighborhoodId?: string;
  neighborhoodNameFa?: string;
  publicAddressSummaryFa?: string | null;
  privateExactAddressFa?: string | null;
  builtAreaSqm?: number | null;
  landAreaSqm?: number | null;
  buildYearJalali?: number | null;
  floorNumber?: number | null;
  totalUnitsInBuilding?: number | null;
  bedroomsCount?: number | null;
  bathroomsCount?: number | null;
  hasParking?: boolean | null;
  hasStorage?: boolean | null;
  hasElevator?: boolean | null;
  coolingSystem?: string | null;
  heatingSystem?: string | null;
  transactionType?: 'sale' | 'rent' | 'rahn_full' | string | null;
  askingSalePriceMillionToman?: number | null;
  registeredDealPriceMillionToman?: number | null;
  registeredDealSourceId?: string;
  estimatedValuationMillionToman?: number | null;
  rahnDepositMillionToman?: number | null;
  monthlyRentMillionToman?: number | null;
  geoPoint?: Partial<EntityGeoPoint> | null;
  media?: EntityDetailMediaItem[];
  buildingId?: string | null;
  linkedListings?: Array<{ id: string; title: string; matchStatus: 'EXACT_VERIFIED' | 'PROBABLE_MATCH' | 'UNLINKED' }>;
  sourceId?: string;
  createdAt?: string;
  updatedAt?: string;
  lastVerifiedAt?: string;
  observedAt?: string;
  defaultConfidence?: DataConfidence;
}

export function adaptPropertyDetail(
  raw: RawPropertyDetailInput,
  accessContext?: AccessContext
): EntityDetailModel {
  const id = String(raw.id || '').trim();
  const capabilities = resolveEntityDetailCapabilities('property', accessContext, {
    resourceId: id,
    ownerUserId: raw.ownerUserId,
    workspaceId: raw.workspaceId,
    cityId: raw.cityId,
  });

  const canSeePrivate = Boolean(capabilities.canViewPrivateData);
  const geoPoint = validateEntityGeoPoint(raw.geoPoint, canSeePrivate);
  const subType = raw.propertySubType || 'apartment';
  const isLand = subType === 'land';
  const conf: DataConfidence = raw.defaultConfidence ?? 'verified';

  const financialFields = normalizeEntityFinancialFields({
    transactionType: raw.transactionType,
    askingSalePriceMillionToman: raw.askingSalePriceMillionToman,
    registeredDealPriceMillionToman: raw.registeredDealPriceMillionToman,
    registeredDealSourceId: raw.registeredDealSourceId,
    estimatedValuationMillionToman: raw.estimatedValuationMillionToman,
    rahnDepositMillionToman: raw.rahnDepositMillionToman,
    monthlyRentMillionToman: raw.monthlyRentMillionToman,
    builtAreaSqm: raw.builtAreaSqm,
    observedAt: raw.observedAt,
    updatedAt: raw.updatedAt,
  });

  const relatedEntities: EntityDetailModel['relatedEntities'] = [];
  if (raw.buildingId) {
    relatedEntities.push({
      id: raw.buildingId,
      entityType: 'building',
      title: `ساختمان مرتبط (${raw.buildingId})`,
      canonicalPath: buildCanonicalEntityDetailPath('building', raw.buildingId),
      matchStatus: 'EXACT_VERIFIED',
    });
  }
  for (const lst of raw.linkedListings || []) {
    relatedEntities.push({
      id: lst.id,
      entityType: 'listing',
      title: lst.title,
      canonicalPath: buildCanonicalEntityDetailPath('listing', lst.id),
      matchStatus: lst.matchStatus,
    });
  }

  return {
    id,
    entityType: 'property',
    title: raw.title || `ملک شماره ${id}`,
    canonicalPath: buildCanonicalEntityDetailPath('property', id),
    cityId: raw.cityId,
    cityNameFa: raw.cityNameFa,
    neighborhoodId: raw.neighborhoodId,
    neighborhoodNameFa: raw.neighborhoodNameFa,
    pageStatus:
      raw.propertyStatus === 'deleted'
        ? 'Deleted'
        : raw.propertyStatus === 'archived'
          ? 'Archived'
          : raw.propertyStatus === 'restricted'
            ? 'Restricted'
            : 'Success',
    geoPoint,
    fields: {
      propertySubType: createEntityDetailField(subType, { confidence: conf, sourceId: raw.sourceId }),
      cityNameFa: createEntityDetailField(raw.cityNameFa ?? null, { confidence: conf }),
      districtZone: createEntityDetailField(raw.districtZone ?? null, { confidence: conf }),
      neighborhoodNameFa: createEntityDetailField(raw.neighborhoodNameFa ?? null, { confidence: conf }),
      addressSummary: createEntityDetailField(
        canSeePrivate && raw.privateExactAddressFa ? raw.privateExactAddressFa : raw.publicAddressSummaryFa ?? null,
        { confidence: conf }
      ),
      builtAreaSqm: createEntityDetailField(
        typeof raw.builtAreaSqm === 'number' && raw.builtAreaSqm > 0 ? raw.builtAreaSqm : null,
        { unit: 'مترمربع', confidence: conf, sourceId: raw.sourceId, observedAt: raw.observedAt, updatedAt: raw.updatedAt }
      ),
      landAreaSqm: createEntityDetailField(
        typeof raw.landAreaSqm === 'number' && raw.landAreaSqm > 0 ? raw.landAreaSqm : null,
        { unit: 'مترمربع', confidence: conf, sourceId: raw.sourceId }
      ),
      buildYearJalali: createEntityDetailField(
        !isLand && typeof raw.buildYearJalali === 'number' && raw.buildYearJalali > 1300
          ? raw.buildYearJalali
          : null,
        { unit: 'شمسی', confidence: conf }
      ),
      floorNumber: createEntityDetailField(
        !isLand && typeof raw.floorNumber === 'number' ? raw.floorNumber : null,
        { unit: 'طبقه', confidence: conf }
      ),
      totalUnitsInBuilding: createEntityDetailField(
        !isLand && typeof raw.totalUnitsInBuilding === 'number' && raw.totalUnitsInBuilding > 0
          ? raw.totalUnitsInBuilding
          : null,
        { unit: 'واحد', confidence: conf }
      ),
      bedroomsCount: createEntityDetailField(
        // Rule 5.1: Land must not receive bedroomsCount as a required/defaulted field
        !isLand && typeof raw.bedroomsCount === 'number' && raw.bedroomsCount >= 0 ? raw.bedroomsCount : null,
        { unit: 'اتاق', confidence: conf }
      ),
      bathroomsCount: createEntityDetailField(
        !isLand && typeof raw.bathroomsCount === 'number' && raw.bathroomsCount >= 0 ? raw.bathroomsCount : null,
        { unit: 'سرویس', confidence: conf }
      ),
      hasParking: createEntityDetailField(raw.hasParking ?? null, { confidence: conf }),
      hasStorage: createEntityDetailField(raw.hasStorage ?? null, { confidence: conf }),
      hasElevator: createEntityDetailField(raw.hasElevator ?? null, { confidence: conf }),
      coolingSystem: createEntityDetailField(raw.coolingSystem ?? null, { confidence: conf }),
      heatingSystem: createEntityDetailField(raw.heatingSystem ?? null, { confidence: conf }),
      ...financialFields,
    },
    media: (raw.media || []).filter((m) => canSeePrivate || !m.isPrivate),
    relatedEntities,
    capabilities,
    timestamps: {
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      lastVerifiedAt: raw.lastVerifiedAt,
      lastObservedAt: raw.observedAt,
    },
  };
}
