/**
 * @file src/platform/search/filters/FilterRegistry.ts
 * @description Canonical Filter Registry with stable IDs, supported operators, value types, and scopes.
 */

import type { SearchFilterOperator, SearchFilterValueType, SearchScope } from '../core/SearchTypes';

export interface FilterDefinition {
  id: string;
  field: string;
  labelFa: string;
  valueType: SearchFilterValueType;
  allowedOperators: SearchFilterOperator[];
  defaultOperator: SearchFilterOperator;
  supportedScopes: SearchScope[];
  defaultUnit?: string;
  citySpecific?: boolean;
}

export const FILTER_DEFINITION_REGISTRY: readonly FilterDefinition[] = [
  {
    id: 'flt:transactionMode',
    field: 'transactionMode',
    labelFa: 'نوع معامله',
    valueType: 'enum',
    allowedOperators: ['eq', 'in'],
    defaultOperator: 'eq',
    supportedScopes: ['all', 'properties', 'listings', 'neighborhoods'],
  },
  {
    id: 'flt:propertyType',
    field: 'propertyType',
    labelFa: 'نوع ملک',
    valueType: 'enum',
    allowedOperators: ['eq', 'in'],
    defaultOperator: 'eq',
    supportedScopes: ['all', 'properties', 'listings', 'buildings'],
  },
  {
    id: 'flt:totalPrice',
    field: 'totalPrice',
    labelFa: 'قیمت کل خرید',
    valueType: 'currency',
    allowedOperators: ['lte', 'gte', 'between', 'eq'],
    defaultOperator: 'between',
    supportedScopes: ['all', 'properties', 'listings', 'neighborhoods'],
    defaultUnit: 'million',
  },
  {
    id: 'flt:pricePerSqm',
    field: 'pricePerSqm',
    labelFa: 'قیمت هر مترمربع',
    valueType: 'currency',
    allowedOperators: ['lte', 'gte', 'between'],
    defaultOperator: 'between',
    supportedScopes: ['all', 'properties', 'listings', 'neighborhoods'],
    defaultUnit: 'million',
  },
  {
    id: 'flt:rahnDeposit',
    field: 'rahnDeposit',
    labelFa: 'مبلغ ودیعه (رهن)',
    valueType: 'currency',
    allowedOperators: ['lte', 'gte', 'between'],
    defaultOperator: 'between',
    supportedScopes: ['all', 'listings', 'neighborhoods'],
    defaultUnit: 'million',
  },
  {
    id: 'flt:monthlyRent',
    field: 'monthlyRent',
    labelFa: 'اجاره ماهانه',
    valueType: 'currency',
    allowedOperators: ['lte', 'gte', 'between'],
    defaultOperator: 'between',
    supportedScopes: ['all', 'listings', 'neighborhoods'],
    defaultUnit: 'million',
  },
  {
    id: 'flt:area',
    field: 'area',
    labelFa: 'متراژ زیربنا',
    valueType: 'area',
    allowedOperators: ['lte', 'gte', 'between', 'eq'],
    defaultOperator: 'between',
    supportedScopes: ['all', 'properties', 'listings', 'buildings'],
    defaultUnit: 'sqm',
  },
  {
    id: 'flt:bedrooms',
    field: 'bedrooms',
    labelFa: 'تعداد اتاق خواب',
    valueType: 'number',
    allowedOperators: ['eq', 'gte', 'between'],
    defaultOperator: 'eq',
    supportedScopes: ['all', 'properties', 'listings'],
  },
  {
    id: 'flt:buildingAge',
    field: 'buildingAge',
    labelFa: 'سن بنا (سال)',
    valueType: 'number',
    allowedOperators: ['lte', 'between', 'eq'],
    defaultOperator: 'lte',
    supportedScopes: ['all', 'properties', 'listings', 'buildings'],
  },
  {
    id: 'flt:hasParking',
    field: 'hasParking',
    labelFa: 'دارای پارکینگ',
    valueType: 'boolean',
    allowedOperators: ['eq'],
    defaultOperator: 'eq',
    supportedScopes: ['all', 'properties', 'listings', 'buildings'],
  },
  {
    id: 'flt:hasElevator',
    field: 'hasElevator',
    labelFa: 'دارای آسانسور',
    valueType: 'boolean',
    allowedOperators: ['eq'],
    defaultOperator: 'eq',
    supportedScopes: ['all', 'properties', 'listings', 'buildings'],
  },
  {
    id: 'flt:hasStorage',
    field: 'hasStorage',
    labelFa: 'دارای انباری',
    valueType: 'boolean',
    allowedOperators: ['eq'],
    defaultOperator: 'eq',
    supportedScopes: ['all', 'properties', 'listings'],
  },
  {
    id: 'flt:neighborhoodId',
    field: 'neighborhoodId',
    labelFa: 'محله',
    valueType: 'string',
    allowedOperators: ['eq', 'in'],
    defaultOperator: 'eq',
    supportedScopes: ['all', 'properties', 'listings', 'buildings', 'neighborhoods', 'services'],
    citySpecific: true,
  },
  {
    id: 'flt:districtNumber',
    field: 'districtNumber',
    labelFa: 'منطقه شهری',
    valueType: 'number',
    allowedOperators: ['eq', 'in'],
    defaultOperator: 'eq',
    supportedScopes: ['all', 'properties', 'listings', 'neighborhoods', 'market-analytics'],
    citySpecific: true,
  },
  {
    id: 'flt:serviceCategory',
    field: 'serviceCategory',
    labelFa: 'دسته خدمات',
    valueType: 'enum',
    allowedOperators: ['eq', 'in'],
    defaultOperator: 'eq',
    supportedScopes: ['all', 'services'],
  },
] as const;

export const FILTER_REGISTRY = FILTER_DEFINITION_REGISTRY;

export const FILTER_BY_FIELD: ReadonlyMap<string, FilterDefinition> = new Map(
  FILTER_DEFINITION_REGISTRY.map((f) => [f.field, f])
);
