/**
 * @file src/platform/presentation/registry/ResultRendererRegistry.ts
 * @description Registry of standard Result Renderers (Card Grid, List, Data Table, Compact List, Comparison, Map-linked).
 */

import type { ResultEntityType, ResultPresentationMode, ResultRendererDefinition } from '../core/ResultTypes';

export const STANDARD_RESULT_RENDERERS: readonly ResultRendererDefinition[] = [
  {
    id: 'card-grid',
    titleFa: 'نمای شبکه‌ای کارت‌ها',
    supportedEntities: ['property', 'listing', 'building', 'neighborhood', 'service'],
    capabilities: {
      selection: true,
      sorting: true,
      pagination: true,
      comparison: true,
      responsive: true,
    },
    component: 'ResultCardGrid',
  },
  {
    id: 'list',
    titleFa: 'فهرست استاندارد',
    supportedEntities: ['property', 'listing', 'building', 'neighborhood', 'service'],
    capabilities: {
      selection: true,
      sorting: true,
      pagination: true,
      comparison: true,
      responsive: true,
    },
    component: 'ResultList',
  },
  {
    id: 'data-table',
    titleFa: 'جدول تخصصی داده‌ها',
    supportedEntities: ['property', 'listing', 'building', 'neighborhood', 'service'],
    capabilities: {
      selection: true,
      sorting: true,
      pagination: true,
      comparison: true,
      responsive: true,
    },
    component: 'ResultTable',
  },
  {
    id: 'compact-list',
    titleFa: 'فهرست فشرده موبایلی',
    supportedEntities: ['property', 'listing', 'building', 'neighborhood', 'service'],
    capabilities: {
      selection: true,
      sorting: true,
      pagination: true,
      comparison: false,
      responsive: true,
    },
    component: 'ResultCompactList',
  },
  {
    id: 'comparison',
    titleFa: 'میز کار مقایسه هم‌نوع',
    supportedEntities: ['property', 'listing', 'building', 'neighborhood', 'service'],
    capabilities: {
      selection: false,
      sorting: false,
      pagination: false,
      comparison: true,
      responsive: true,
    },
    component: 'ResultComparisonWorkspace',
  },
  {
    id: 'map-linked',
    titleFa: 'فهرست متصل به نقشه (GIS)',
    supportedEntities: ['property', 'listing', 'building', 'neighborhood'],
    capabilities: {
      selection: true,
      sorting: true,
      pagination: true,
      comparison: true,
      responsive: true,
    },
    component: 'ResultMapLinkedList',
  },
] as const;

export const RESULT_RENDERER_MAP: ReadonlyMap<ResultPresentationMode, ResultRendererDefinition> = new Map(
  STANDARD_RESULT_RENDERERS.map((r) => [r.id, r])
);

export function getSupportedRenderersForEntity(entityType: ResultEntityType): ResultRendererDefinition[] {
  return STANDARD_RESULT_RENDERERS.filter((r) => r.supportedEntities.includes(entityType));
}
