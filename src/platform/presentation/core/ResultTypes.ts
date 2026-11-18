/**
 * @file src/platform/presentation/core/ResultTypes.ts
 * @description Canonical ResultEntityType, ResultItem, Metric, and Renderer contracts for Stage 6 (RT-FE-REBUILD-RESULTS-PRESENTATION-006).
 */

export type ResultEntityType =
  | 'property'
  | 'listing'
  | 'building'
  | 'neighborhood'
  | 'service';

export type ResultMetricStatus = 'verified' | 'estimated' | 'unknown' | 'outdated';

export interface ResultMetricEntry {
  value: string | number | null;
  unit?: string;
  status?: ResultMetricStatus;
}

export interface ResultItem {
  id: string;
  entityType: ResultEntityType;

  title: string;
  subtitle?: string;

  canonicalUrl: string;

  location?: {
    cityId?: string;
    neighborhoodId?: string;
    latitude?: number;
    longitude?: number;
  };

  metrics: Record<string, ResultMetricEntry>;

  media?: {
    thumbnailUrl?: string;
    mediaCount?: number;
  };

  status?: string;

  permissions: {
    canOpen: boolean;
    canCompare: boolean;
    canSelect: boolean;
  };
}

export type ResultPresentationMode =
  | 'card-grid'
  | 'list'
  | 'data-table'
  | 'compact-list'
  | 'comparison'
  | 'map-linked';

export type ResultDataStatusState =
  | 'Initial'
  | 'Loading'
  | 'Success'
  | 'Empty'
  | 'Partial'
  | 'Error'
  | 'Stale'
  | 'Restricted'
  | 'Invalid';

export interface ResultRendererDefinition {
  id: ResultPresentationMode;
  titleFa: string;
  supportedEntities: ResultEntityType[];
  capabilities: {
    selection: boolean;
    sorting: boolean;
    pagination: boolean;
    comparison: boolean;
    responsive: boolean;
  };
  component: unknown;
}
