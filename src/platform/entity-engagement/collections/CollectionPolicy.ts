/**
 * @file src/platform/entity-engagement/collections/CollectionPolicy.ts
 * @description Access, ownership, duplicate prevention, and quota policies for Personal Collections (Stage 8).
 */

import type { AccessContext } from '../../authorization';
import { canPerformEngagementAction } from '../core/EngagementContract';
import { normalizeCollectionName } from '../core/EngagementNormalizer';
import type {
  CollectionMembership,
  EngagementVisibilityScope,
  PersonalCollection,
} from '../core/EngagementTypes';

export const MAX_COLLECTIONS_PER_WORKSPACE = 50;
export const MAX_ITEMS_PER_COLLECTION = 200;

export const COLLECTION_LIMITS = {
  maxCollectionsPerWorkspace: MAX_COLLECTIONS_PER_WORKSPACE,
  maxItemsPerCollection: MAX_ITEMS_PER_COLLECTION,
} as const;

export function validateCollectionCreation(params: {
  rawName: string;
  visibility: EngagementVisibilityScope;
  existingCollections: PersonalCollection[];
  accessContext?: AccessContext;
}): { valid: boolean; normalizedName: string; errorFa?: string } {
  if (params.accessContext) {
    const perm = canPerformEngagementAction('collection_manage', params.visibility, params.accessContext);
    if (!perm.allowed) {
      return { valid: false, normalizedName: '', errorFa: perm.reasonFa };
    }
  }

  const normalizedName = normalizeCollectionName(params.rawName);
  if (!normalizedName) {
    return {
      valid: false,
      normalizedName: '',
      errorFa: 'نام مجموعه شخصی نمی‌تواند خالی باشد.',
    };
  }

  if (params.existingCollections.length >= MAX_COLLECTIONS_PER_WORKSPACE) {
    return {
      valid: false,
      normalizedName,
      errorFa: `حداکثر تعداد مجاز مجموعه‌ها (${MAX_COLLECTIONS_PER_WORKSPACE}) تکمیل شده است.`,
    };
  }

  const duplicateName = params.existingCollections.some(
    (c) => c.name.toLowerCase() === normalizedName.toLowerCase()
  );
  if (duplicateName) {
    return {
      valid: false,
      normalizedName,
      errorFa: 'مجموعه‌ای با همین نام در این فضای کاری وجود دارد.',
    };
  }

  return { valid: true, normalizedName };
}

export function canAddEntityToCollection(params: {
  collection: PersonalCollection;
  existingMemberships: CollectionMembership[];
  entityType: string;
  entityId: string;
}): { allowed: boolean; alreadyMember: boolean; errorFa?: string } {
  const alreadyMember = params.existingMemberships.some(
    (m) =>
      m.collectionId === params.collection.id &&
      m.entity.entityType === params.entityType &&
      m.entity.id === params.entityId
  );

  if (alreadyMember) {
    return {
      allowed: false,
      alreadyMember: true,
      errorFa: 'این موجودیت قبلاً به این مجموعه اضافه شده است.',
    };
  }

  const countInCollection = params.existingMemberships.filter(
    (m) => m.collectionId === params.collection.id
  ).length;

  if (countInCollection >= MAX_ITEMS_PER_COLLECTION) {
    return {
      allowed: false,
      alreadyMember: false,
      errorFa: `حداکثر ظرفیت مجموعه (${MAX_ITEMS_PER_COLLECTION} مورد) تکمیل شده است.`,
    };
  }

  return { allowed: true, alreadyMember: false };
}
