/** @file src/features/properties/types/property.types.ts — Physical Real Estate Entity (Distinct from Listing) */

export type PropertyType = 'apartment' | 'villa_house' | 'commercial' | 'office' | 'land';

export type LocationPrecision = 'exact' | 'approximate' | 'neighborhood' | 'unavailable';

export type AmenityValue = 'has' | 'lacks' | 'unknown';

export type DocumentType =
  | 'single_deed'
  | 'cooperative'
  | 'endowment'
  | 'promissory'
  | 'unknown';

export type BuildingOrientation = 'north' | 'south' | 'east' | 'west' | 'dual' | 'unknown';

export type PropertyRenovationGrade =
  | 'luxury_renovated'
  | 'renovated'
  | 'standard'
  | 'needs_renovation'
  | 'unknown';

export interface PropertyMediaItem {
  id: string;
  url: string | null;
  caption: string;
  kind: 'interior' | 'facade' | 'plan' | 'document_preview';
  valid: boolean;
}

export interface PropertyUnitFeatures {
  parking: AmenityValue;
  elevator: AmenityValue;
  storage: AmenityValue;
  balcony: AmenityValue;
}

export interface PropertyBuildingFeatures {
  unitsPerFloor: number | null;
  totalUnits: number | null;
  hasLobby: AmenityValue;
  renovationStatus: PropertyRenovationGrade;
}

export interface PropertyEntity {
  propertyId: string;
  propertyType: PropertyType;
  cityId: string;
  hoodId: number;
  hoodName: string;
  zoneName: string;
  street: string;
  lat: number | null;
  lng: number | null;
  locationPrecision: LocationPrecision;
  privacyRadiusMeters: number;
  areaSqm: number | null;
  landAreaSqm?: number | null;
  buildYearJalali: number | null;
  roomsCount: number | null;
  floorNumber: number | null;
  totalFloors: number | null;
  orientation: BuildingOrientation;
  documentType: DocumentType;
  unitFeatures: PropertyUnitFeatures;
  buildingFeatures: PropertyBuildingFeatures;
  media: PropertyMediaItem[];
}

export const PROPERTY_TYPE_LABELS_FA: Record<PropertyType, string> = {
  apartment: 'آپارتمان مسکونی',
  villa_house: 'خانه / ویلایی',
  commercial: 'مغازه و تجاری',
  office: 'واحد اداری',
  land: 'زمین و کلنگی',
};

export const DOCUMENT_TYPE_LABELS_FA: Record<DocumentType, string> = {
  single_deed: 'سند تک‌برگ شخصی',
  cooperative: 'تعاونی / دفترچه‌ای',
  endowment: 'اوقافی',
  promissory: 'قولنامه‌ای / مبایعه‌نامه',
  unknown: 'نامشخص (نیازمند استعلام)',
};

export const AMENITY_VALUE_LABELS_FA: Record<AmenityValue, string> = {
  has: 'دارد',
  lacks: 'ندارد',
  unknown: 'نامشخص',
};
