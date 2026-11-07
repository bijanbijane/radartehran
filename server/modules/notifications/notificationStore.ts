/**
 * @file server/modules/notifications/notificationStore.ts
 * @description Durable persistence and retrieval engine for notifications, user preferences, and delivery jobs.
 */

import crypto from 'node:crypto';
import type {
  CategoryPreferences,
  ChannelPreferences,
  ListNotificationsOptions,
  ListNotificationsResponse,
  NotificationDeliveryJob,
  NotificationDocument,
  NotificationLifecycleState,
  NotificationPreferencesDocument,
  NotificationReadState,
} from './notificationTypes';

const DEFAULT_CHANNELS: ChannelPreferences = {
  inApp: true,
  email: false,
  sms: false,
  push: false,
};

const DEFAULT_CATEGORIES: CategoryPreferences = {
  bargains: true,
  buyer_alerts: true,
  sponsorship: true,
  crowd_claims: true,
  security: true,
  system_announcement: true,
};

export class NotificationStore {
  private readonly notifications = new Map<string, NotificationDocument>();
  private readonly idempotencyIndex = new Map<string, string>(); // idempotencyKey -> notificationId
  private readonly preferences = new Map<string, NotificationPreferencesDocument>();
  private readonly deliveryJobs = new Map<string, NotificationDeliveryJob>();
  private readonly jobDeliveryIdempotency = new Map<string, string>(); // idempotencyKey -> jobId

  private readonly maxStorageRecords = 10000;

  /**
   * Creates a notification with idempotency protection.
   */
  public async createNotification(doc: Omit<NotificationDocument, 'id' | 'createdAtIso' | 'updatedAtIso' | 'schemaVersion'>): Promise<NotificationDocument> {
    if (doc.idempotencyKey && this.idempotencyIndex.has(doc.idempotencyKey)) {
      const existingId = this.idempotencyIndex.get(doc.idempotencyKey)!;
      const existing = this.notifications.get(existingId);
      if (existing) {
        return existing;
      }
    }

    const id = `ntf_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const nowIso = new Date().toISOString();

    const record: NotificationDocument = {
      ...doc,
      id,
      schemaVersion: 1,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    // Bounded storage protection
    if (this.notifications.size >= this.maxStorageRecords) {
      const oldestKey = this.notifications.keys().next().value;
      if (oldestKey) this.notifications.delete(oldestKey);
    }

    this.notifications.set(id, record);
    if (record.idempotencyKey) {
      this.idempotencyIndex.set(record.idempotencyKey, id);
    }

    return record;
  }

  /**
   * Retrieves a single notification enforcing recipient ownership.
   */
  public async getNotificationById(id: string, recipientUid: string): Promise<NotificationDocument | null> {
    const doc = this.notifications.get(id);
    if (!doc || doc.recipientUid !== recipientUid || doc.readState === 'deleted') {
      return null;
    }
    return doc;
  }

  /**
   * Retrieves paginated notifications for a recipient with cursor-based pagination.
   */
  public async listNotificationsForUser(
    recipientUid: string,
    options: ListNotificationsOptions = {},
  ): Promise<ListNotificationsResponse> {
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    const userDocs: NotificationDocument[] = [];
    let unreadCount = 0;

    for (const doc of this.notifications.values()) {
      if (doc.recipientUid !== recipientUid || doc.readState === 'deleted') {
        continue;
      }

      if (doc.readState === 'unread') {
        unreadCount++;
      }

      if (options.readState && doc.readState !== options.readState) {
        continue;
      }

      if (options.category && doc.category !== options.category) {
        continue;
      }

      userDocs.push(doc);
    }

    // Sort newest first
    userDocs.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));

    const totalCount = userDocs.length;
    let startIndex = 0;

    if (options.cursor) {
      const cursorIndex = userDocs.findIndex((d) => d.id === options.cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const items = userDocs.slice(startIndex, startIndex + limit);
    const nextCursor = (startIndex + limit < userDocs.length) ? items[items.length - 1].id : null;

    return {
      items,
      nextCursor,
      unreadCount,
      totalCount,
    };
  }

  /**
   * Computes unread count for a recipient.
   */
  public async getUnreadCount(recipientUid: string): Promise<number> {
    let unread = 0;
    for (const doc of this.notifications.values()) {
      if (doc.recipientUid === recipientUid && doc.readState === 'unread') {
        unread++;
      }
    }
    return unread;
  }

  /**
   * Updates read state for a specific notification.
   */
  public async setNotificationReadState(
    id: string,
    recipientUid: string,
    nextState: NotificationReadState,
  ): Promise<NotificationDocument | null> {
    const doc = this.notifications.get(id);
    if (!doc || doc.recipientUid !== recipientUid || doc.readState === 'deleted') {
      return null;
    }

    const nowIso = new Date().toISOString();
    const updated: NotificationDocument = {
      ...doc,
      readState: nextState,
      readAtIso: nextState === 'read' ? nowIso : doc.readAtIso,
      updatedAtIso: nowIso,
    };

    this.notifications.set(id, updated);
    return updated;
  }

  /**
   * Marks all unread notifications for a user as read.
   */
  public async markAllAsRead(recipientUid: string): Promise<{ count: number }> {
    let count = 0;
    const nowIso = new Date().toISOString();

    for (const [id, doc] of this.notifications.entries()) {
      if (doc.recipientUid === recipientUid && doc.readState === 'unread') {
        this.notifications.set(id, {
          ...doc,
          readState: 'read',
          readAtIso: nowIso,
          updatedAtIso: nowIso,
        });
        count++;
      }
    }

    return { count };
  }

  /**
   * Gets or initializes user preferences.
   */
  public async getPreferences(uid: string): Promise<NotificationPreferencesDocument> {
    const existing = this.preferences.get(uid);
    if (existing) {
      return existing;
    }

    const nowIso = new Date().toISOString();
    const defaultDoc: NotificationPreferencesDocument = {
      uid,
      channels: { ...DEFAULT_CHANNELS },
      categories: { ...DEFAULT_CATEGORIES },
      updatedAtIso: nowIso,
      schemaVersion: 1,
    };

    this.preferences.set(uid, defaultDoc);
    return defaultDoc;
  }

  /**
   * Saves user preferences.
   */
  public async setPreferences(doc: NotificationPreferencesDocument): Promise<NotificationPreferencesDocument> {
    this.preferences.set(doc.uid, doc);
    return doc;
  }

  /**
   * Creates a delivery job with idempotency.
   */
  public async createDeliveryJob(job: Omit<NotificationDeliveryJob, 'id' | 'createdAtIso' | 'updatedAtIso'>): Promise<NotificationDeliveryJob> {
    if (job.idempotencyKey && this.jobDeliveryIdempotency.has(job.idempotencyKey)) {
      const existingId = this.jobDeliveryIdempotency.get(job.idempotencyKey)!;
      const existing = this.deliveryJobs.get(existingId);
      if (existing) return existing;
    }

    const id = `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const nowIso = new Date().toISOString();

    const record: NotificationDeliveryJob = {
      ...job,
      id,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    this.deliveryJobs.set(id, record);
    if (record.idempotencyKey) {
      this.jobDeliveryIdempotency.set(record.idempotencyKey, id);
    }

    return record;
  }

  /**
   * Updates delivery job status and attempt counts.
   */
  public async updateDeliveryJob(
    jobId: string,
    updates: Partial<Pick<NotificationDeliveryJob, 'deliveryState' | 'attempts' | 'nextAttemptAtIso' | 'lastAttemptAtIso' | 'lastError'>>,
  ): Promise<NotificationDeliveryJob | null> {
    const existing = this.deliveryJobs.get(jobId);
    if (!existing) return null;

    const updated: NotificationDeliveryJob = {
      ...existing,
      ...updates,
      updatedAtIso: new Date().toISOString(),
    };

    this.deliveryJobs.set(jobId, updated);
    return updated;
  }

  /**
   * Lists pending delivery jobs for background worker dispatch.
   */
  public async listPendingDeliveryJobs(limit = 50): Promise<NotificationDeliveryJob[]> {
    const jobs: NotificationDeliveryJob[] = [];
    const nowMs = Date.now();

    for (const job of this.deliveryJobs.values()) {
      if (job.deliveryState === 'pending' || (job.deliveryState === 'processing' && job.nextAttemptAtIso && Date.parse(job.nextAttemptAtIso) <= nowMs)) {
        jobs.push(job);
        if (jobs.length >= limit) break;
      }
    }

    return jobs;
  }

  /**
   * Diagnostics: Clear store for isolated testing.
   */
  public clearAllForTesting(): void {
    this.notifications.clear();
    this.idempotencyIndex.clear();
    this.preferences.clear();
    this.deliveryJobs.clear();
    this.jobDeliveryIdempotency.clear();
  }
}

export const defaultNotificationStore = new NotificationStore();
