/**
 * @file src/platform/entity-detail/index.ts
 * @description Public barrel export for Stage 7 Entity Detail Platform Engine (RT-FE-REBUILD-ENTITY-DETAIL-007).
 */

export * from './core/EntityDetailTypes';
export * from './core/EntityDetailContract';
export * from './core/EntityDetailNormalizer';
export * from './core/EntityDetailValidation';
export * from './core/EntityDetailRegistry';

export * from './adapters/PropertyDetailAdapter';
export * from './adapters/ListingDetailAdapter';
export * from './adapters/BuildingDetailAdapter';
export * from './adapters/NeighborhoodDetailAdapter';

export * from './sections/SectionRegistry';
export * from './sections/SectionVisibilityPolicy';
export * from './sections/SectionErrorBoundary';

export * from './navigation/EntityDetailRoutes';
export * from './navigation/EntityContextResolver';

export * from './state/EntityDetailState';
export * from './state/EntityDetailRequestManager';
