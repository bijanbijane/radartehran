/**
 * @file src/platform/entity-engagement/core/EngagementContract.ts
 * @description Permission checks, workspace isolation keys, and canonical path helpers for Stage 8 Entity Engagement.
 */

import { evaluateAccessPolicy, type AccessContext } from '../../authorization';
import type { EngagementEntityRef, EngagementVisibilityScope, EntityType } from './EngagementTypes';

export const MAX_NOTE_LENGTH = 2000;
export const MAX_COLLECTION_NAME_LENGTH = 80;
export const MAX_TAG_NAME_LENGTH = 40;
export const DEFAULT_WATCH_COOLDOWN_MINUTES = 60;
export const MIN_PRICE_CHANGE_THRESHOLD_PERCENT = 1;

export function buildEngagementIsolationKey(
  userId: string,
  workspaceId: string,
  permissionVersion = 1
): string {
  const safeUser = String(userId || '').trim();
  const safeWs = String(workspaceId || '').trim();
  if (!safeUser || !safeWs) {
    throw new Error('ENGAGEMENT_ISOLATION_VIOLATION: userId and workspaceId are mandatory.');
  }
  return `engagement:${safeUser}:${safeWs}:v${permissionVersion}`;
}

export function buildEngagementEntityCompositeKey(entityType: EntityType, entityId: string): string {
  return `${entityType}:${String(entityId || '').trim()}`;
}

export function buildCanonicalEngagementPath(entityType: EntityType, entityId: string): string {
  const safeId = encodeURIComponent(String(entityId || '').trim());
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

export function ensureValidEngagementEntityRef(ref: Partial<EngagementEntityRef>): EngagementEntityRef {
  const id = String(ref.id || '').trim();
  const entityType = ref.entityType;
  if (!id || !entityType || !['property', 'listing', 'building', 'neighborhood'].includes(entityType)) {
    throw new Error('INVALID_ENGAGEMENT_ENTITY_REF');
  }
  return {
    id,
    entityType,
    title: String(ref.title || id).trim(),
    canonicalPath: ref.canonicalPath || buildCanonicalEngagementPath(entityType, id),
    cityId: ref.cityId,
    neighborhoodId: ref.neighborhoodId,
    lifecycleStatus: ref.lifecycleStatus ?? 'active',
  };
}

export function canPerformEngagementAction(
  action: 'favorite' | 'follow' | 'collection_manage' | 'note_write' | 'watch_rule_manage',
  visibility: EngagementVisibilityScope,
  accessContext?: AccessContext
): { allowed: boolean; reasonFa?: string } {
  if (!accessContext || !accessContext.isAuthenticated || !accessContext.userId) {
    return {
      allowed: false,
      reasonFa: 'برای ذخیره، دنبال‌کردن یا ثبت یادداشت ابتدا وارد حساب کاربری خود شوید.',
    };
  }

  if (visibility === 'workspace') {
    const decision = evaluateAccessPolicy({
      permission: 'workspace:update:workspace',
      context: accessContext,
    });
    if (!decision.allowed && String(accessContext.activeRole) === 'viewer') {
      return {
        allowed: false,
        reasonFa: 'نقش مشاهده‌گر (Viewer) مجاز به ایجاد یا تغییر مجموعه‌ها و یادداشت‌های مشترک فضای کاری نیست.',
      };
    }
  }

  return { allowed: true };
}
