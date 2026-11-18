/**
 * @file src/platform/presentation/index.ts
 * @description Barrel export for Stage 6 Results Presentation Platform (RT-FE-REBUILD-RESULTS-PRESENTATION-006).
 */

export * from './core/ResultTypes';
export * from './core/ResultContract';
export * from './core/ResultNormalizer';
export * from './core/ResultMetadata';
export * from './core/ResultValidation';

export * from './adapters/PropertyResultAdapter';
export * from './adapters/ListingResultAdapter';
export * from './adapters/BuildingResultAdapter';
export * from './adapters/NeighborhoodResultAdapter';
export * from './adapters/ServiceResultAdapter';

export * from './registry/ResultRendererRegistry';
export * from './registry/ColumnRegistry';
export * from './registry/ActionRegistry';

export * from './sorting/SortNormalizer';
export * from './sorting/SortController';

export * from './pagination/PaginationState';
export * from './pagination/PaginationController';

export * from './selection/SelectionController';
export * from './selection/BulkActionPolicy';

export * from './comparison/ComparisonSchema';
export * from './comparison/ComparisonNormalizer';
export * from './comparison/ComparisonController';
