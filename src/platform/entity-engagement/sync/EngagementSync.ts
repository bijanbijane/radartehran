/**
 * @file src/platform/entity-engagement/sync/EngagementSync.ts
 * @description Multi-tab and cross-surface synchronization coordinator for Favorites, Follows, Collections, and WatchRules (Stage 8).
 */

import type { EntityType } from '../core/EngagementTypes';

export type EngagementSyncEventType =
  | 'FAVORITE_CHANGED'
  | 'FOLLOW_CHANGED'
  | 'COLLECTION_CHANGED'
  | 'NOTE_CHANGED'
  | 'WATCH_RULE_CHANGED'
  | 'SECURITY_CONTEXT_CLEARED';

export interface EngagementSyncMessage {
  eventId: string;
  eventType: EngagementSyncEventType;
  userId: string;
  workspaceId: string;
  permissionVersion: number;
  entityType?: EntityType;
  entityId?: string;
  emittedAt: string;
}

export type EngagementSyncListener = (msg: EngagementSyncMessage) => void;

export class EngagementSyncCoordinator {
  private listeners = new Set<EngagementSyncListener>();

  public subscribe(listener: EngagementSyncListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public broadcast(
    msg: Omit<EngagementSyncMessage, 'eventId' | 'emittedAt'>
  ): EngagementSyncMessage {
    const fullMsg: EngagementSyncMessage = {
      ...msg,
      eventId: `sync:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      emittedAt: new Date().toISOString(),
    };
    for (const listener of this.listeners) {
      listener(fullMsg);
    }
    return fullMsg;
  }

  public getSubscriberCount(): number {
    return this.listeners.size;
  }
}
