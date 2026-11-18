/**
 * @file src/platform/entity-detail/core/EntityDetailRegistry.ts
 * @description Registry of the 4 core Entity Detail families (property, listing, building, neighborhood) and extensible future slots.
 */

import type { EntityType } from './EntityDetailTypes';

export interface EntityFamilyDescriptor {
  entityType: EntityType;
  titleFa: string;
  routePrefix: string;
  supportsGisContext: boolean;
  supportsFinancialSection: boolean;
  supportsProvenanceHistory: boolean;
}

export const ENTITY_DETAIL_FAMILY_REGISTRY: Record<EntityType, EntityFamilyDescriptor> = {
  property: {
    entityType: 'property',
    titleFa: 'پرونده تخصصی ملک',
    routePrefix: '/properties',
    supportsGisContext: true,
    supportsFinancialSection: true,
    supportsProvenanceHistory: true,
  },
  listing: {
    entityType: 'listing',
    titleFa: 'جزئیات آگهی ملکی',
    routePrefix: '/listings',
    supportsGisContext: true,
    supportsFinancialSection: true,
    supportsProvenanceHistory: true,
  },
  building: {
    entityType: 'building',
    titleFa: 'پرونده فنی ساختمان',
    routePrefix: '/buildings',
    supportsGisContext: true,
    supportsFinancialSection: false,
    supportsProvenanceHistory: true,
  },
  neighborhood: {
    entityType: 'neighborhood',
    titleFa: 'مرجع مکانی و اجتماعی محله',
    routePrefix: '/neighborhoods',
    supportsGisContext: true,
    supportsFinancialSection: true,
    supportsProvenanceHistory: true,
  },
};
