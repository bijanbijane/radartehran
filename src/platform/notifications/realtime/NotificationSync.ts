/**
 * @file src/platform/notifications/realtime/NotificationSync.ts
 * @description Cross-tab synchronization for Notification read/unread/archive states and Header Badge counter (Stage 9).
 */

import type { NotificationStatus } from '../core/NotificationTypes';

export interface NotificationCrossTabEvent {
  eventId: string;
  type: 'STATUS_UPDATED' | 'MARK_ALL_READ' | 'SECURITY_RESET';
  userId: string;
  workspaceId: string;
  notificationIds?: string[];
  nextStatus?: NotificationStatus;
  emittedAt: string;
}

export class NotificationSyncBus {
  private subscribers = new Set<(evt: NotificationCrossTabEvent) => void>();

  public subscribe(handler: (evt: NotificationCrossTabEvent) => void): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  public publish(evt: Omit<NotificationCrossTabEvent, 'eventId' | 'emittedAt'>): NotificationCrossTabEvent {
    const full: NotificationCrossTabEvent = {
      ...evt,
      eventId: `ntf-sync:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
      emittedAt: new Date().toISOString(),
    };
    for (const sub of this.subscribers) {
      sub(full);
    }
    return full;
  }

  public clearSubscribers(): void {
    this.subscribers.clear();
  }
}
