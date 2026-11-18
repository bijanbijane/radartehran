/**
 * @file src/platform/entity-engagement/collections/CollectionService.ts
 * @description Service managing Personal Collections, Multi-Collection Entity Memberships, Tags, and Personal Notes (Stage 8).
 */

import type { AccessContext } from '../../authorization';
import {
  canPerformEngagementAction,
  ensureValidEngagementEntityRef,
} from '../core/EngagementContract';
import {
  normalizeCollectionName,
  normalizeTagName,
   sanitizePlainUserText,
  validateAndSanitizePersonalNote,
} from '../core/EngagementNormalizer';
import type {
  CollectionMembership,
  EngagementEntityRef,
  EngagementVisibilityScope,
  EntityPersonalNote,
  EntityTag,
  EntityType,
  PersonalCollection,
} from '../core/EngagementTypes';
import {
  canAddEntityToCollection,
  validateCollectionCreation,
} from './CollectionPolicy';
import { CollectionStateStore } from './CollectionState';

export class CollectionService {
  constructor(private readonly stateStore: CollectionStateStore = new CollectionStateStore()) {}

  public getStateStore(): CollectionStateStore {
    return this.stateStore;
  }

  public createCollection(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    name: string;
    description?: string;
    visibility?: EngagementVisibilityScope;
    accessContext?: AccessContext;
  }): { ok: boolean; collection?: PersonalCollection; errorFa?: string } {
    this.stateStore.setContext(params.userId, params.workspaceId, params.permissionVersion ?? 1);
    const bucket = this.stateStore.getBucket();
    const visibility = params.visibility ?? 'private';

    const validation = validateCollectionCreation({
      rawName: params.name,
      visibility,
      existingCollections: Array.from(bucket.collections.values()),
      accessContext: params.accessContext,
    });

    if (!validation.valid) {
      return { ok: false, errorFa: validation.errorFa };
    }

    const now = new Date().toISOString();
    const id = `col:${params.userId}:${params.workspaceId}:${Date.now()}:${bucket.collections.size + 1}`;
    const collection: PersonalCollection = {
      id,
      userId: params.userId,
      workspaceId: params.workspaceId,
      name: validation.normalizedName,
      description: params.description ? sanitizePlainUserText(params.description, 300) : undefined,
      visibility,
      itemCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    bucket.collections.set(id, collection);
    return { ok: true, collection };
  }

  public renameCollection(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    collectionId: string;
    newName: string;
  }): { ok: boolean; collection?: PersonalCollection; errorFa?: string } {
    this.stateStore.setContext(params.userId, params.workspaceId, params.permissionVersion ?? 1);
    const bucket = this.stateStore.getBucket();
    const existing = bucket.collections.get(params.collectionId);
    if (!existing) {
      return { ok: false, errorFa: 'مجموعه مورد نظر یافت نشد.' };
    }
    const cleanName = normalizeCollectionName(params.newName);
    if (!cleanName) {
      return { ok: false, errorFa: 'نام مجموعه نمی‌تواند خالی باشد.' };
    }
    const updated: PersonalCollection = {
      ...existing,
      name: cleanName,
      updatedAt: new Date().toISOString(),
    };
    bucket.collections.set(existing.id, updated);
    return { ok: true, collection: updated };
  }

  public deleteCollection(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    collectionId: string;
  }): boolean {
    this.stateStore.setContext(params.userId, params.workspaceId, params.permissionVersion ?? 1);
    const bucket = this.stateStore.getBucket();
    const existed = bucket.collections.delete(params.collectionId);
    if (existed) {
      // Deleting a collection removes its memberships without deleting the underlying entities or favorites
      for (const [key, m] of bucket.memberships.entries()) {
        if (m.collectionId === params.collectionId) {
          bucket.memberships.delete(key);
        }
      }
    }
    return existed;
  }

  public addEntityToCollection(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    collectionId: string;
    entity: Partial<EngagementEntityRef>;
  }): { ok: boolean; membership?: CollectionMembership; errorFa?: string } {
    this.stateStore.setContext(params.userId, params.workspaceId, params.permissionVersion ?? 1);
    const bucket = this.stateStore.getBucket();
    const collection = bucket.collections.get(params.collectionId);
    if (!collection) {
      return { ok: false, errorFa: 'مجموعه انتخاب‌شده یافت نشد.' };
    }

    const validEntity = ensureValidEngagementEntityRef(params.entity);
    const check = canAddEntityToCollection({
      collection,
      existingMemberships: Array.from(bucket.memberships.values()),
      entityType: validEntity.entityType,
      entityId: validEntity.id,
    });

    if (!check.allowed) {
      return { ok: false, errorFa: check.errorFa };
    }

    const now = new Date().toISOString();
    const membershipId = `mem:${collection.id}:${validEntity.entityType}:${validEntity.id}`;
    const membership: CollectionMembership = {
      id: membershipId,
      collectionId: collection.id,
      entity: validEntity,
      addedByUserId: params.userId,
      addedAt: now,
      sortOrder: collection.itemCount + 1,
    };

    bucket.memberships.set(membershipId, membership);
    bucket.collections.set(collection.id, {
      ...collection,
      itemCount: collection.itemCount + 1,
      updatedAt: now,
    });

    return { ok: true, membership };
  }

  public removeEntityFromCollection(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    collectionId: string;
    entityType: EntityType;
    entityId: string;
  }): boolean {
    this.stateStore.setContext(params.userId, params.workspaceId, params.permissionVersion ?? 1);
    const bucket = this.stateStore.getBucket();
    const membershipId = `mem:${params.collectionId}:${params.entityType}:${params.entityId}`;
    const existed = bucket.memberships.delete(membershipId);
    if (existed) {
      const col = bucket.collections.get(params.collectionId);
      if (col) {
        bucket.collections.set(col.id, {
          ...col,
          itemCount: Math.max(0, col.itemCount - 1),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return existed;
  }

  public assignTagToEntity(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    entityType: EntityType;
    entityId: string;
    rawTagName: string;
    colorToken?: string;
  }): { ok: boolean; tag?: EntityTag; errorFa?: string } {
    this.stateStore.setContext(params.userId, params.workspaceId, params.permissionVersion ?? 1);
    const bucket = this.stateStore.getBucket();
    const { displayName, normalizedName } = normalizeTagName(params.rawTagName);
    if (!normalizedName) {
      return { ok: false, errorFa: 'نام برچسب نمی‌تواند خالی باشد.' };
    }

    let tag = Array.from(bucket.tags.values()).find((t) => t.normalizedName === normalizedName);
    if (!tag) {
      tag = {
        id: `tag:${params.userId}:${params.workspaceId}:${normalizedName}`,
        userId: params.userId,
        workspaceId: params.workspaceId,
        name: displayName,
        normalizedName,
        colorToken: params.colorToken,
      };
      bucket.tags.set(tag.id, tag);
    }

    const assignId = `tag-assign:${tag.id}:${params.entityType}:${params.entityId}`;
    bucket.tagAssignments.set(assignId, {
      id: assignId,
      tagId: tag.id,
      userId: params.userId,
      workspaceId: params.workspaceId,
      entityType: params.entityType,
      entityId: params.entityId,
      assignedAt: new Date().toISOString(),
    });

    return { ok: true, tag };
  }

  public listTagsForEntity(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    entityType: EntityType;
    entityId: string;
  }): EntityTag[] {
    this.stateStore.setContext(params.userId, params.workspaceId, params.permissionVersion ?? 1);
    const bucket = this.stateStore.getBucket();
    const tagIds = Array.from(bucket.tagAssignments.values())
      .filter((a) => a.entityType === params.entityType && a.entityId === params.entityId)
      .map((a) => a.tagId);
    return tagIds.map((id) => bucket.tags.get(id)).filter((t): t is EntityTag => Boolean(t));
  }

  public upsertPersonalNote(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    entityType: EntityType;
    entityId: string;
    rawContent: string;
    visibility?: EngagementVisibilityScope;
    accessContext?: AccessContext;
  }): { ok: boolean; note?: EntityPersonalNote; errorFa?: string } {
    this.stateStore.setContext(params.userId, params.workspaceId, params.permissionVersion ?? 1);
    const visibility = params.visibility ?? 'private';

    if (params.accessContext) {
      const perm = canPerformEngagementAction('note_write', visibility, params.accessContext);
      if (!perm.allowed) {
        return { ok: false, errorFa: perm.reasonFa };
      }
    }

    const check = validateAndSanitizePersonalNote(params.rawContent);
    if (!check.valid) {
      return { ok: false, errorFa: check.errorFa };
    }

    const bucket = this.stateStore.getBucket();
    const noteKey = `note:${params.userId}:${params.workspaceId}:${params.entityType}:${params.entityId}`;
    const existing = bucket.notes.get(noteKey);
    const now = new Date().toISOString();

    const note: EntityPersonalNote = {
      id: existing?.id || noteKey,
      userId: params.userId,
      workspaceId: params.workspaceId,
      entityType: params.entityType,
      entityId: params.entityId,
      content: check.sanitized,
      visibility,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    bucket.notes.set(noteKey, note);
    return { ok: true, note };
  }

  public deletePersonalNote(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    entityType: EntityType;
    entityId: string;
  }): boolean {
    this.stateStore.setContext(params.userId, params.workspaceId, params.permissionVersion ?? 1);
    const noteKey = `note:${params.userId}:${params.workspaceId}:${params.entityType}:${params.entityId}`;
    return this.stateStore.getBucket().notes.delete(noteKey);
  }

  public getPersonalNote(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    entityType: EntityType;
    entityId: string;
  }): EntityPersonalNote | null {
    this.stateStore.setContext(params.userId, params.workspaceId, params.permissionVersion ?? 1);
    const noteKey = `note:${params.userId}:${params.workspaceId}:${params.entityType}:${params.entityId}`;
    return this.stateStore.getBucket().notes.get(noteKey) ?? null;
  }
}
