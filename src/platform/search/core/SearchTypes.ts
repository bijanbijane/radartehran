/**
 * @file src/platform/search/core/SearchTypes.ts
 * @description Canonical Search, Filter, Area & Money contracts for Stage 5 (RT-FE-REBUILD-SEARCH-DISCOVERY-005).
 */

export type SearchScope =
  | 'all'
  | 'properties'
  | 'listings'
  | 'buildings'
  | 'neighborhoods'
  | 'services'
  | 'market-analytics';

export type SearchFilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'contains'
  | 'exists';

export type SearchFilterValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'range'
  | 'enum'
  | 'geo'
  | 'currency'
  | 'area';

export type SearchFilterValue =
  | string
  | number
  | boolean
  | [number, number]
  | string[]
  | { lat: number; lng: number; radiusMeters?: number };

export interface SearchFilter {
  id: string;
  field: string;
  operator: SearchFilterOperator;
  value: SearchFilterValue;
  rawValue?: unknown;
  unit?: string;
  source: 'user' | 'query' | 'map' | 'route' | 'preset';
  cityScoped?: string;
}

export interface SearchGeoBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface SearchSort {
  field:
    | 'relevance'
    | 'totalPrice'
    | 'pricePerSqm'
    | 'areaSqm'
    | 'buildingAge'
    | 'publishedAt'
    | 'updatedAt'
    | 'distance';
  direction: 'asc' | 'desc';
}

export interface SearchPagination {
  page: number;
  pageSize: number;
  cursor?: string | null;
}

export interface SearchRequest {
  rawQuery: string;
  normalizedQuery: string;
  scope: SearchScope;
  cityId?: string;
  neighborhoodIds?: string[];
  bounds?: SearchGeoBounds;
  filters: SearchFilter[];
  sort: SearchSort;
  pagination: SearchPagination;
  workspaceId?: string;
  userId?: string | null;
  permissionVersion?: number;
}

export type AreaUnit = 'sqm' | 'sqft';

export interface AreaValue {
  value: number;
  unit: AreaUnit;
}

export const EXACT_SQM_TO_SQFT = 10.7639104167;

export interface MoneyValue {
  amount: number;
  currency: 'IRR' | 'USD';
  displayUnit: 'rial' | 'toman' | 'million' | 'billion';
}

export type SearchUiDisplayState =
  | 'Initial'
  | 'Typing'
  | 'SuggestionsLoading'
  | 'ResultsLoading'
  | 'Success'
  | 'Empty'
  | 'Error'
  | 'PartialResults';

export type EntityRecognitionConfidence = 'CONFIRMED' | 'SUGGESTED' | 'UNKNOWN';

export interface RecognizedSearchEntity {
  id: string;
  type: 'city' | 'district' | 'neighborhood' | 'property_type' | 'transaction_mode' | 'service' | 'analytic_metric';
  matchedText: string;
  canonicalNameFa: string;
  cityId?: string;
  confidence: EntityRecognitionConfidence;
  score: number;
}
