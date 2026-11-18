/**
 * @file src/platform/presentation/registry/ColumnRegistry.ts
 * @description Canonical Column Registry for Data Table Engine with widths, sortability, and required column protection.
 */

import type { ResultEntityType } from '../core/ResultTypes';

export interface ResultColumnDefinition {
  id: string;
  label: string;

  entityTypes: ResultEntityType[];

  dataType: 'text' | 'number' | 'money' | 'area' | 'date' | 'status';

  sortable: boolean;
  hideable: boolean;

  minWidth: number;
  defaultWidth: number;

  required: boolean;
}

export const RESULT_COLUMN_REGISTRY: readonly ResultColumnDefinition[] = [
  {
    id: 'selection',
    label: 'انتخاب',
    entityTypes: ['property', 'listing', 'building', 'neighborhood', 'service'],
    dataType: 'text',
    sortable: false,
    hideable: false,
    minWidth: 48,
    defaultWidth: 48,
    required: true,
  },
  {
    id: 'id',
    label: 'شناسه',
    entityTypes: ['property', 'listing', 'building', 'neighborhood', 'service'],
    dataType: 'text',
    sortable: false,
    hideable: true,
    minWidth: 120,
    defaultWidth: 135,
    required: false,
  },
  {
    id: 'title',
    label: 'عنوان',
    entityTypes: ['property', 'listing', 'building', 'neighborhood', 'service'],
    dataType: 'text',
    sortable: true,
    hideable: false,
    minWidth: 220,
    defaultWidth: 260,
    required: true,
  },
  {
    id: 'neighborhood',
    label: 'محله',
    entityTypes: ['property', 'listing', 'building', 'neighborhood'],
    dataType: 'text',
    sortable: true,
    hideable: false,
    minWidth: 120,
    defaultWidth: 140,
    required: true,
  },
  {
    id: 'propertyType',
    label: 'نوع ملک',
    entityTypes: ['property', 'listing'],
    dataType: 'text',
    sortable: false,
    hideable: true,
    minWidth: 100,
    defaultWidth: 120,
    required: false,
  },
  {
    id: 'areaSqm',
    label: 'متراژ',
    entityTypes: ['property', 'listing', 'building', 'neighborhood'],
    dataType: 'area',
    sortable: true,
    hideable: false,
    minWidth: 90,
    defaultWidth: 105,
    required: true,
  },
  {
    id: 'totalPrice',
    label: 'قیمت کل',
    entityTypes: ['property', 'listing', 'service'],
    dataType: 'money',
    sortable: true,
    hideable: false,
    minWidth: 140,
    defaultWidth: 160,
    required: true,
  },
  {
    id: 'pricePerSqm',
    label: 'قیمت هر متر',
    entityTypes: ['property', 'listing', 'neighborhood'],
    dataType: 'money',
    sortable: true,
    hideable: true,
    minWidth: 140,
    defaultWidth: 165,
    required: false,
  },
  {
    id: 'buildingAge',
    label: 'سن بنا',
    entityTypes: ['property', 'building'],
    dataType: 'number',
    sortable: true,
    hideable: true,
    minWidth: 90,
    defaultWidth: 100,
    required: false,
  },
  {
    id: 'status',
    label: 'وضعیت داده',
    entityTypes: ['property', 'listing', 'building', 'neighborhood', 'service'],
    dataType: 'status',
    sortable: false,
    hideable: true,
    minWidth: 100,
    defaultWidth: 115,
    required: false,
  },
  {
    id: 'updatedAt',
    label: 'آخرین به‌روزرسانی',
    entityTypes: ['property', 'listing', 'building', 'neighborhood'],
    dataType: 'date',
    sortable: true,
    hideable: true,
    minWidth: 130,
    defaultWidth: 145,
    required: false,
  },
  {
    id: 'actions',
    label: 'عملیات',
    entityTypes: ['property', 'listing', 'building', 'neighborhood', 'service'],
    dataType: 'text',
    sortable: false,
    hideable: false,
    minWidth: 96,
    defaultWidth: 110,
    required: true,
  },
] as const;

export function getColumnsForEntity(
  entityType: ResultEntityType,
  hiddenColumnIds: readonly string[] = []
): ResultColumnDefinition[] {
  const hiddenSet = new Set(hiddenColumnIds);
  return RESULT_COLUMN_REGISTRY.filter((col) => {
    if (!col.entityTypes.includes(entityType)) return false;
    if (!col.required && col.hideable && hiddenSet.has(col.id)) return false;
    return true;
  });
}
