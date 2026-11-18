/**
 * @file src/platform/presentation/registry/ActionRegistry.ts
 * @description Permission-aware Row & Bulk Action Registry for Stage 6 Results Presentation.
 */

import type { ResultEntityType, ResultItem } from '../core/ResultTypes';

export type ResultActionId =
  | 'open-detail'
  | 'add-to-compare'
  | 'show-on-map'
  | 'export-selected'
  | 'archive-selected'
  | 'delete-selected';

export interface ResultActionDefinition {
  id: ResultActionId;
  labelFa: string;
  supportedEntities: ResultEntityType[];
  bulkSupported: boolean;
  destructive: boolean;
  requiresExplicitConfirmation: boolean;
  requiredPermissionCode: string;
}

export const RESULT_ACTION_REGISTRY: readonly ResultActionDefinition[] = [
  {
    id: 'open-detail',
    labelFa: 'مشاهده جزئیات',
    supportedEntities: ['property', 'listing', 'building', 'neighborhood', 'service'],
    bulkSupported: false,
    destructive: false,
    requiresExplicitConfirmation: false,
    requiredPermissionCode: 'property:read:global',
  },
  {
    id: 'add-to-compare',
    labelFa: 'افزودن به مقایسه',
    supportedEntities: ['property', 'listing', 'building', 'neighborhood', 'service'],
    bulkSupported: true,
    destructive: false,
    requiresExplicitConfirmation: false,
    requiredPermissionCode: 'property:read:global',
  },
  {
    id: 'show-on-map',
    labelFa: 'نمایش روی نقشه',
    supportedEntities: ['property', 'listing', 'building', 'neighborhood'],
    bulkSupported: false,
    destructive: false,
    requiresExplicitConfirmation: false,
    requiredPermissionCode: 'neighborhood:read:global',
  },
  {
    id: 'export-selected',
    labelFa: 'دریافت خروجی موارد انتخاب‌شده',
    supportedEntities: ['property', 'listing', 'building', 'neighborhood'],
    bulkSupported: true,
    destructive: false,
    requiresExplicitConfirmation: false,
    requiredPermissionCode: 'neighborhood:export:global',
  },
  {
    id: 'archive-selected',
    labelFa: 'بایگانی موارد انتخاب‌شده',
    supportedEntities: ['listing'],
    bulkSupported: true,
    destructive: false,
    requiresExplicitConfirmation: true,
    requiredPermissionCode: 'listing:archive:own',
  },
  {
    id: 'delete-selected',
    labelFa: 'حذف موارد انتخاب‌شده',
    supportedEntities: ['property', 'listing'],
    bulkSupported: true,
    destructive: true,
    requiresExplicitConfirmation: true,
    requiredPermissionCode: 'listing:delete:agency',
  },
] as const;

export function getAllowedItemActions(item: ResultItem): ResultActionId[] {
  const actions: ResultActionId[] = [];
  if (item.permissions.canOpen) actions.push('open-detail');
  if (item.permissions.canCompare) actions.push('add-to-compare');
  if (
    item.location &&
    typeof item.location.latitude === 'number' &&
    typeof item.location.longitude === 'number'
  ) {
    actions.push('show-on-map');
  }
  return actions;
}
