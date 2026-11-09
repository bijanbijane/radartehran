import {
  requireEnumValue,
  requireFiniteNumberInRange,
  requireNonEmptyString,
  requireSafeFirestoreId,
  validateObjectSchema,
  type ValidationIssue,
  type ValidationResult,
} from '../core';
import type {
  BuildingCompletionStatus,
  BuildingCondition,
  BuildingStructuralType,
  LandUseClassification,
  PropertyAssetCategory,
  PublicPropertyAssetView,
  RenovationStatus,
  StoredPropertyAsset,
  UnitUsageType,
} from './types';

export const VALID_ASSET_CATEGORIES: readonly PropertyAssetCategory[] = [
  'residential_apartment',
  'residential_house',
  'villa',
  'land',
  'commercial_property',
  'office_property',
  'retail_unit',
  'industrial_property',
  'warehouse',
  'mixed_use',
  'under_construction',
];

export const VALID_STRUCTURAL_TYPES: readonly BuildingStructuralType[] = [
  'concrete_frame',
  'steel_frame',
  'masonry',
  'prefabricated',
];

export const VALID_COMPLETION_STATUSES: readonly BuildingCompletionStatus[] = [
  'completed',
  'under_construction',
  'renovation_in_progress',
];

export const VALID_UNIT_USAGE_TYPES: readonly UnitUsageType[] = [
  'residential',
  'commercial',
  'office',
  'storage',
  'parking',
];

export const VALID_BUILDING_CONDITIONS: readonly BuildingCondition[] = [
  'excellent',
  'good',
  'fair',
  'needs_renovation',
  'demolition_grade',
];

export const VALID_RENOVATION_STATUSES: readonly RenovationStatus[] = [
  'luxury_renovated',
  'renovated',
  'standard',
  'unrenovated',
];

export const VALID_LAND_USE_TYPES: readonly LandUseClassification[] = [
  'residential',
  'commercial',
  'mixed',
  'agricultural',
  'industrial',
];

export interface CreatePropertyAssetInput {
  category: PropertyAssetCategory;
  subtype?: string;
  cityId: string;
  hoodId: number;
  districtId?: number;
  streetText?: string;
  buildingId?: string;
  unitId?: string;
  parcelId?: string;
  areaSqm: number;
  landAreaSqm?: number;
  constructionYear?: number;
  floorNumber?: number;
  totalFloors?: number;
  roomCount?: number;
  buildingCondition?: BuildingCondition;
  renovationStatus?: RenovationStatus;
  hasParking?: boolean;
  hasElevator?: boolean;
  hasStorage?: boolean;
  hasBalcony?: boolean;
  commercialPermitNumber?: string;
  frontageMeters?: number;
  ceilingHeightMeters?: number;
  latitude?: number;
  longitude?: number;
  postalCode?: string;
  exactUnitAddress?: string;
  [key: string]: unknown;
}

export function validateCreatePropertyAssetInput(raw: unknown): ValidationResult<CreatePropertyAssetInput> {
  const baseRes = validateObjectSchema<CreatePropertyAssetInput>(
    raw,
    {
      category: requireEnumValue(VALID_ASSET_CATEGORIES),
      cityId: requireNonEmptyString({ minLength: 2, maxLength: 32 }),
      hoodId: requireFiniteNumberInRange({ min: 1, max: 999, integerOnly: true }),
      areaSqm: requireFiniteNumberInRange({ min: 10, max: 200_000 }),
    },
    {
      allowUnknownFields: true,
      rejectUntrustedIdentityFields: true,
    },
  );

  if (!baseRes.ok || !baseRes.value) return baseRes;
  const rawRecord = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? (raw as Record<string, unknown>) : {};
  const input: CreatePropertyAssetInput = {
    ...rawRecord,
    ...baseRes.value,
  } as CreatePropertyAssetInput;
  const issues: ValidationIssue[] = [];

  // Category specific validation
  if (input.category === 'residential_apartment' && input.floorNumber !== undefined && input.totalFloors !== undefined) {
    if (input.floorNumber > input.totalFloors) {
      issues.push({
        field: 'floorNumber',
        code: 'NUMBER_OUT_OF_RANGE',
        message: 'Floor number cannot exceed total building floors.',
      });
    }
  }

  if (input.category === 'land' && (input.floorNumber !== undefined || input.hasElevator !== undefined)) {
    issues.push({
      field: 'category',
      code: 'INVALID_TYPE',
      message: 'Land parcels cannot have apartment floor or elevator attributes.',
    });
  }

  if (input.constructionYear !== undefined) {
    const yr = Number(input.constructionYear);
    if (!Number.isInteger(yr) || yr < 1320 || yr > 1410) {
      issues.push({
        field: 'constructionYear',
        code: 'NUMBER_OUT_OF_RANGE',
        message: 'constructionYear must be a Jalali year between 1320 and 1410.',
      });
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: input, issues: [] };
}

export interface CreateBuildingInput {
  buildingType: 'residential' | 'commercial' | 'office' | 'mixed';
  cityId: string;
  hoodId: number;
  districtId?: number;
  streetText?: string;
  nameOrTitle?: string;
  totalFloors: number;
  unitsCount?: number;
  constructionYear?: number;
  structuralType?: BuildingStructuralType;
  commonFacilities?: string[];
  completionStatus?: BuildingCompletionStatus;
  [key: string]: unknown;
}

export function validateCreateBuildingInput(raw: unknown): ValidationResult<CreateBuildingInput> {
  const baseRes = validateObjectSchema<CreateBuildingInput>(
    raw,
    {
      buildingType: requireEnumValue(['residential', 'commercial', 'office', 'mixed'] as const),
      cityId: requireNonEmptyString({ minLength: 2, maxLength: 32 }),
      hoodId: requireFiniteNumberInRange({ min: 1, max: 999, integerOnly: true }),
      totalFloors: requireFiniteNumberInRange({ min: 1, max: 100, integerOnly: true }),
    },
    {
      allowUnknownFields: true,
      rejectUntrustedIdentityFields: true,
    },
  );
  if (!baseRes.ok || !baseRes.value) return baseRes;
  const rawRecord = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? (raw as Record<string, unknown>) : {};
  return { ok: true, value: { ...rawRecord, ...baseRes.value } as CreateBuildingInput, issues: [] };
}

export interface RegisterUnitInput {
  parentBuildingId: string;
  unitNumberOrRef: string;
  floor: number;
  areaSqm: number;
  usageType: UnitUsageType;
  roomCount?: number;
  [key: string]: unknown;
}

export function validateRegisterUnitInput(raw: unknown): ValidationResult<RegisterUnitInput> {
  const baseRes = validateObjectSchema<RegisterUnitInput>(
    raw,
    {
      parentBuildingId: requireSafeFirestoreId(),
      unitNumberOrRef: requireNonEmptyString({ minLength: 1, maxLength: 32 }),
      floor: requireFiniteNumberInRange({ min: -5, max: 80, integerOnly: true }),
      areaSqm: requireFiniteNumberInRange({ min: 10, max: 10_000 }),
      usageType: requireEnumValue(VALID_UNIT_USAGE_TYPES),
    },
    {
      allowUnknownFields: true,
      rejectUntrustedIdentityFields: true,
    },
  );
  if (!baseRes.ok || !baseRes.value) return baseRes;
  const rawRecord = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? (raw as Record<string, unknown>) : {};
  return { ok: true, value: { ...rawRecord, ...baseRes.value } as RegisterUnitInput, issues: [] };
}

export interface RegisterLandParcelInput {
  cityId: string;
  hoodId: number;
  districtId?: number;
  areaSqm: number;
  landUseClassification: LandUseClassification;
  zoningCode?: string;
  developmentStatus?: 'vacant' | 'developed' | 'brownfield' | 'agricultural';
  frontageMeters?: number;
  [key: string]: unknown;
}

export function validateRegisterLandParcelInput(raw: unknown): ValidationResult<RegisterLandParcelInput> {
  const baseRes = validateObjectSchema<RegisterLandParcelInput>(
    raw,
    {
      cityId: requireNonEmptyString({ minLength: 2, maxLength: 32 }),
      hoodId: requireFiniteNumberInRange({ min: 1, max: 999, integerOnly: true }),
      areaSqm: requireFiniteNumberInRange({ min: 20, max: 500_000 }),
      landUseClassification: requireEnumValue(VALID_LAND_USE_TYPES),
    },
    {
      allowUnknownFields: true,
      rejectUntrustedIdentityFields: true,
    },
  );
  if (!baseRes.ok || !baseRes.value) return baseRes;
  const rawRecord = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? (raw as Record<string, unknown>) : {};
  return { ok: true, value: { ...rawRecord, ...baseRes.value } as RegisterLandParcelInput, issues: [] };
}

export function sanitizeAssetForPublicView(asset: StoredPropertyAsset): PublicPropertyAssetView {
  return {
    id: asset.id,
    category: asset.category,
    subtype: asset.subtype,
    geographicRef: {
      cityId: asset.geographicRef.cityId,
      hoodId: asset.geographicRef.hoodId,
      districtId: asset.geographicRef.districtId,
    },
    areaSqm: asset.areaSqm,
    landAreaSqm: asset.landAreaSqm,
    constructionYear: asset.constructionYear,
    floorNumber: asset.floorNumber,
    totalFloors: asset.totalFloors,
    roomCount: asset.roomCount,
    amenities: asset.amenities,
    status: asset.status,
    verificationStatus: asset.provenance.verificationStatus,
  };
}
