import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';

export type PropertyTypeCode = 'apartment' | 'villa' | 'penthouse' | 'office' | 'commercial' | 'land';
export type DealModeCode = 'buy' | 'rent';
export type StructuralConditionCode =
  | 'brand_new'
  | 'renovated'
  | 'standard'
  | 'needs_renovation'
  | 'old_dilapidated';
export type ExtractionMethodCode = 'regex_fast_pass' | 'hybrid_structured_llm' | 'manual_verified';

export interface RawPropertySignalInput {
  signalId?: string;
  cityId: string;
  hoodId: number;
  rawTextFa: string;
  dealMode?: DealModeCode;
  propertyType?: PropertyTypeCode;
  lat?: number;
  lng?: number;
  sourceUrl?: string;
  observedAtIso?: string;
  areaSqmHint?: number;
  buildingAgeYearsHint?: number;
  floorNumberHint?: number;
  totalFloorsHint?: number;
  totalPriceMillionTomanHint?: number;
  pricePerSqmMillionTomanHint?: number;
  streetNameHint?: string;
}

export interface ExtractedPropertyFactRecord {
  factId: string;
  cityId: string;
  hoodId: number;
  propertyType: PropertyTypeCode;
  dealMode: DealModeCode;
  areaSqm: number;
  buildingAgeYears: number;
  floorNumber: number;
  totalFloors: number;
  pricePerSqm: number;
  totalPrice: number;
  totalPriceIntlText: string;
  streetNameNormalized: string;
  structuralCondition: StructuralConditionCode;
  hasElevator: boolean;
  hasParking: boolean;
  hasStorage: boolean;
  lat?: number;
  lng?: number;
  extractionMethod: ExtractionMethodCode;
  confidenceScore: number;
  sourceHashSha256: string;
  canonicalBuildingId: string;
  createdAtIso: string;
}

export interface BuildingEntityFingerprint {
  fingerprintHash: string;
  cityId: string;
  hoodId: number;
  streetNameNormalized: string;
  areaBucket5Sqm: number;
  buildingAgeBucket: number;
  totalFloors: number;
  spatialCell35m: string | null;
  lat?: number;
  lng?: number;
}

export interface CanonicalBuildingRecord {
  canonicalBuildingId: string;
  cityId: string;
  hoodId: number;
  streetNameNormalized: string;
  areaBucket5Sqm: number;
  buildingAgeBucket: number;
  totalFloors: number;
  lat?: number;
  lng?: number;
  status: 'ACTIVE' | 'MERGED_INTO';
  mergedIntoBuildingId: string | null;
  aliasBuildingIds: string[];
  linkedFactIds: string[];
  fingerprintHash: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface EntityResolutionOutcome {
  canonicalBuildingId: string;
  matchedExisting: boolean;
  similarityScore: number;
  within35mRadius: boolean;
  fingerprint: BuildingEntityFingerprint;
  buildingRecord: CanonicalBuildingRecord;
}

export function formatFactValuationIntl(
  totalPriceMillionToman: number,
  currency: IntlCurrencyCode = 'USD',
): string {
  return formatMillionTomanAsIntlCurrency(totalPriceMillionToman, currency);
}
