/**
 * @file src/platform/entity-detail/sections/SectionRegistry.ts
 * @description Canonical Section Registry for Property, Listing, Building, and Neighborhood detail pages (Stage 7).
 */

import type { EntityDetailModel, EntityType } from '../core/EntityDetailTypes';

export type DetailSectionId =
  | 'overview'
  | 'pricing-valuation'
  | 'location-gis'
  | 'building-structure'
  | 'market-analytics'
  | 'media-documents'
  | 'history-provenance'
  | 'related-entities'
  | 'private-owner-data';

export interface DetailSectionDescriptor {
  id: DetailSectionId;
  titleFa: string;
  order: number;
  supportedEntityTypes: EntityType[];
  requiredFields: string[];
  requiresPrivateAccess?: boolean;
  emptyBehavior: 'hide' | 'show-empty-state' | 'show-limitation-banner';
  lazyLoad: boolean;
}

export const CANONICAL_DETAIL_SECTIONS: Record<DetailSectionId, DetailSectionDescriptor> = {
  overview: {
    id: 'overview',
    titleFa: 'مشخصات پایه و هویت موجودیت',
    order: 1,
    supportedEntityTypes: ['property', 'listing', 'building', 'neighborhood'],
    requiredFields: [],
    emptyBehavior: 'show-empty-state',
    lazyLoad: false,
  },
  'pricing-valuation': {
    id: 'pricing-valuation',
    titleFa: 'قیمت، ارزش‌گذاری و شرایط مالی',
    order: 2,
    supportedEntityTypes: ['property', 'listing', 'neighborhood'],
    requiredFields: [
      'askingSalePrice',
      'askingPricePerSqm',
      'estimatedValuation',
      'estimatedDealPricePerSqm',
      'rahnDeposit',
      'monthlyRent',
      'priceTotal',
      'pricePerSqm',
      'avgPriceSqm',
    ],
    emptyBehavior: 'show-limitation-banner',
    lazyLoad: false,
  },
  'building-structure': {
    id: 'building-structure',
    titleFa: 'مشخصات کالبدی، سازه و طبقات',
    order: 3,
    supportedEntityTypes: ['property', 'listing', 'building'],
    requiredFields: [
      'builtAreaSqm',
      'landAreaSqm',
      'buildYearJalali',
      'floorNumber',
      'totalUnitsInBuilding',
      'floorsCount',
      'totalUnitsCount',
      'areaSqm',
      'buildYear',
      'unitsCount',
    ],
    emptyBehavior: 'show-empty-state',
    lazyLoad: false,
  },
  'location-gis': {
    id: 'location-gis',
    titleFa: 'موقعیت مکانی، هندسه و دسترسی GIS',
    order: 4,
    supportedEntityTypes: ['property', 'listing', 'building', 'neighborhood'],
    requiredFields: [],
    emptyBehavior: 'show-limitation-banner',
    lazyLoad: true,
  },
  'market-analytics': {
    id: 'market-analytics',
    titleFa: 'شاخص‌های بازار، نقدشوندگی و نمونه آماری',
    order: 5,
    supportedEntityTypes: ['property', 'listing', 'neighborhood'],
    requiredFields: ['sampleCount', 'transitScore', 'airQualityIndex', 'greenSpaceScore', 'liquidityScore', 'investmentScore', 'sampleSize'],
    emptyBehavior: 'show-limitation-banner',
    lazyLoad: true,
  },
  'media-documents': {
    id: 'media-documents',
    titleFa: 'تصاویر، ویدیوها و اسناد پیوست',
    order: 6,
    supportedEntityTypes: ['property', 'listing', 'building', 'neighborhood'],
    requiredFields: [],
    emptyBehavior: 'hide',
    lazyLoad: true,
  },
  'history-provenance': {
    id: 'history-provenance',
    titleFa: 'تاریخچه تغییرات، اصالت داده و منابع',
    order: 7,
    supportedEntityTypes: ['property', 'listing', 'building', 'neighborhood'],
    requiredFields: [],
    emptyBehavior: 'show-empty-state',
    lazyLoad: true,
  },
  'related-entities': {
    id: 'related-entities',
    titleFa: 'موجودیت‌های مرتبط (ملک، آگهی، ساختمان و محله)',
    order: 8,
    supportedEntityTypes: ['property', 'listing', 'building', 'neighborhood'],
    requiredFields: [],
    emptyBehavior: 'hide',
    lazyLoad: true,
  },
  'private-owner-data': {
    id: 'private-owner-data',
    titleFa: 'اطلاعات محرمانه مالک، پلاک ثبتی و اسناد خصوصی',
    order: 9,
    supportedEntityTypes: ['property', 'listing', 'building'],
    requiredFields: ['privateNote', 'ownerPhone', 'postalCodeExact'],
    requiresPrivateAccess: true,
    emptyBehavior: 'hide',
    lazyLoad: true,
  },
};

export function getSectionsForEntityType(entityType: EntityType): DetailSectionDescriptor[] {
  return Object.values(CANONICAL_DETAIL_SECTIONS)
    .filter((sec) => sec.supportedEntityTypes.includes(entityType))
    .sort((a, b) => a.order - b.order);
}

export function hasSectionContent(model: EntityDetailModel, section: DetailSectionDescriptor): boolean {
  if (section.id === 'media-documents') {
    return Array.isArray(model.media) && model.media.length > 0;
  }
  if (section.id === 'related-entities') {
    return Array.isArray(model.relatedEntities) && model.relatedEntities.length > 0;
  }
  if (section.id === 'location-gis') {
    return Boolean(model.geoPoint || model.geometry || model.neighborhoodNameFa);
  }
  if (section.requiredFields.length === 0) {
    return true;
  }
  return section.requiredFields.some((key) => {
    const f = model.fields[key];
    return f !== undefined && f.value !== null && f.value !== '';
  });
}
