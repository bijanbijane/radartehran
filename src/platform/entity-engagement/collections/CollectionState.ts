/**
 * @file src/platform/entity-engagement/collections/CollectionState.ts
 * @description Workspace-isolated state store for Personal Collections, Collection Memberships, Entity Tags, and Personal Notes (Stage 8).
 */

import { buildEngagementIsolationKey } from '../core/EngagementContract';
import type {
  CollectionMembership,
  EntityPersonalNote,
  EntityTag,
  EntityTagAssignment,
  EntityType,
  PersonalCollection,
} from '../core/EngagementTypes';

export interface WorkspaceCollectionBucket {
  collections: Map<string, PersonalCollection>;
  memberships: Map<string, CollectionMembership>;
  tags: Map<string, EntityTag>;
  tagAssignments: Map<string, EntityTagAssignment>;
  notes: Map<string, EntityPersonalNote>;
}

export class CollectionStateStore {
  private bucketsByContext = new Map<string, WorkspaceCollectionBucket>();
  private activeContextKey: string | null = null;

  public setContext(userId: string, workspaceId: string, permissionVersion = 1): string {
    const key = buildEngagementIsolationKey(userId, workspaceId, permissionVersion);
    this.activeContextKey = key;
    if (!this.bucketsByContext.has(key)) {
      this.bucketsByContext.set(key, {
        collections: new Map(),
        memberships: new Map(),
        tags: new Map(),
        tagAssignments: new Map(),
        notes: new Map(),
      });
    }
    return key;
  }

  public getBucket(): WorkspaceCollectionBucket {
    if (!this.activeContextKey) {
      throw new Error('COLLECTION_STATE_NO_ACTIVE_CONTEXT');
    }
    let b = this.bucketsByContext.get(this.activeContextKey);
    if (!b) {
      b = {
        collections: new Map(),
        memberships: new Map(),
        tags: new Map(),
        tagAssignments: new Map(),
        notes: new Map(),
      };
      this.bucketsByContext.set(this.activeContextKey, b);
    }
    return b;
  }

  public listCollections(): PersonalCollection[] {
    return Array.from(this.getBucket().collections.values());
  }

  public listMembershipsForCollection(collectionId: string): CollectionMembership[] {
    return Array.from(this.getBucket().memberships.values()).filter(
      (m) => m.collectionId === collectionId
    );
  }

  public listCollectionsContainingEntity(
    entityType: EntityType,
    entityId: string
  ): PersonalCollection[] {
    const b = this.getBucket();
    const matchingCollectionIds = new Set(
      Array.from(b.memberships.values())
        .filter((m) => m.entity.entityType === entityType && m.entity.id === entityId)
        .map((m) => m.collectionId)
    );
    return Array.from(b.collections.values()).filter((c) => matchingCollectionIds.has(c.id));
  }

  public clearAllForSecurityTransition(): void {
    this.bucketsByContext.clear();
    this.activeContextKey = null;
  }
}
