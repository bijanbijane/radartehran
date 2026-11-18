/**
 * @file src/platform/entity-detail/core/EntityDetailContract.ts
 * @description Canonical Field Builder, Status Labels, Canonical URL Routing, and Stage 3/25 Permission Resolution (Stage 7).
 */

import { evaluateAccessPolicy, type AccessContext, type ResourceTargetContext } from '../../authorization';
import type { DataConfidence, EntityDetailField, EntityDetailModel, EntityType } from './EntityDetailTypes';

export const DATA_CONFIDENCE_LABELS_FA: Record<DataConfidence, string> = {
  verified: 'تأییدشده',
  estimated: 'برآوردی',
  unverified: 'تأییدنشده',
  conflicting: 'دارای تعارض',
  unknown: 'نامشخص',
};

export function createEntityDetailField<T>(
  value: T | null | undefined,
  options: {
    unit?: string;
    confidence?: DataConfidence;
    sourceId?: string;
    observedAt?: string;
    updatedAt?: string;
    limitationNoteFa?: string;
  } = {}
): EntityDetailField<T> {
  // Rule 3.3 & 3.8: Missing data MUST stay null; never fabricate defaults or coerce null to 0
  const normalizedValue: T | null =
    value === undefined || value === null || (typeof value === 'number' && !Number.isFinite(value))
      ? null
      : value;

  return {
    value: normalizedValue,
    unit: options.unit,
    confidence: normalizedValue === null ? options.confidence ?? 'unknown' : options.confidence ?? 'verified',
    sourceId: options.sourceId,
    observedAt: options.observedAt,
    updatedAt: options.updatedAt,
    limitationNoteFa: options.limitationNoteFa,
  };
}

export function formatDetailFieldValueFa<T>(field?: EntityDetailField<T> | null): string {
  if (!field || field.value === null || field.value === undefined) return 'نامشخص';
  if (typeof field.value === 'boolean') return field.value ? 'دارد' : 'ندارد';
  if (typeof field.value === 'number') {
    if (!Number.isFinite(field.value)) return 'نامشخص';
    const formatted = field.value.toLocaleString('fa-IR');
    return field.unit ? `${formatted} ${field.unit}` : formatted;
  }
  const text = String(field.value).trim();
  if (!text) return 'نامشخص';
  return field.unit ? `${text} ${field.unit}` : text;
}

export function buildCanonicalEntityDetailPath(entityType: EntityType, id: string): string {
  const safeId = encodeURIComponent(String(id || '').trim());
  switch (entityType) {
    case 'property':
      return `/properties/${safeId}`;
    case 'listing':
      return `/listings/${safeId}`;
    case 'building':
      return `/buildings/${safeId}`;
    case 'neighborhood':
      return `/neighborhoods/${safeId}`;
  }
}

export function resolveEntityDetailCapabilities(
  entityType: EntityType,
  accessContext?: AccessContext,
  resourceTarget?: ResourceTargetContext
): EntityDetailModel['capabilities'] {
  if (!accessContext) {
    return {
      canEdit: false,
      canReport: false,
      canFavorite: true,
      canCompare: true,
      canShare: true,
      canViewPrivateData: false,
    };
  }

  const editPerm =
    entityType === 'property' || entityType === 'building'
      ? 'property:update:own'
      : entityType === 'listing'
        ? 'listing:update:own'
        : 'neighborhood:update:city';

  const canEdit = evaluateAccessPolicy({
    permission: editPerm,
    context: accessContext,
    resource: resourceTarget,
  }).allowed;

  const canReport = evaluateAccessPolicy({
    permission: 'community:create:own',
    context: accessContext,
  }).allowed;

  return {
    canEdit,
    canReport,
    canFavorite: true,
    canCompare: true,
    canShare: true,
    canViewPrivateData: canEdit || accessContext.activeRole === 'admin',
  };
}
