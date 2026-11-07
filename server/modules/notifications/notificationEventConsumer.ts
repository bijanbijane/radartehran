/**
 * @file server/modules/notifications/notificationEventConsumer.ts
 * @description Event-driven notification consumer mapping domain events to versioned templates and delivery jobs.
 */

import { renderNotificationTemplate } from './notificationTemplates';
import type { NotificationDeliveryEngine } from './notificationDeliveryEngine';
import type { NotificationStore } from './notificationStore';
import type {
  NotificationDocument,
  NotificationEventPayload,
} from './notificationTypes';
import { validateNotificationEventPayload } from './notificationValidator';

export interface ConsumeEventOutcome {
  readonly success: boolean;
  readonly duplicate: boolean;
  readonly notification?: NotificationDocument;
  readonly errors?: string[];
}

export class NotificationEventConsumer {
  private readonly processedEventIds = new Set<string>();

  constructor(
    private readonly store: NotificationStore,
    private readonly deliveryEngine: NotificationDeliveryEngine,
  ) {}

  /**
   * Consumes an incoming domain event, renders its template, persists the notification, and schedules delivery.
   */
  public async consumeEvent(rawPayload: unknown): Promise<ConsumeEventOutcome> {
    const validation = validateNotificationEventPayload(rawPayload);
    if (!validation.valid || !validation.sanitizedPayload) {
      return {
        success: false,
        duplicate: false,
        errors: validation.errors,
      };
    }

    const payload: NotificationEventPayload = validation.sanitizedPayload;

    // In-memory quick check + persistent idempotency key check
    const idempotencyKey = payload.idempotencyKey || `ntf_evt_${payload.eventId}`;
    if (this.processedEventIds.has(payload.eventId)) {
      return {
        success: true,
        duplicate: true,
      };
    }

    // Render template (default version 1)
    const rendered = renderNotificationTemplate(
      payload.eventType,
      1,
      payload.variables,
      payload.priorityOverride,
    );

    // Persist notification
    const doc = await this.store.createNotification({
      recipientUid: payload.recipientUid,
      category: rendered.category,
      templateId: payload.eventType,
      templateVersion: rendered.templateVersion,
      priority: rendered.priority,
      titleFa: rendered.titleFa,
      bodyFa: rendered.bodyFa,
      deepLink: payload.deepLink,
      readState: 'unread',
      idempotencyKey,
    });

    // Schedule delivery jobs across enabled channels
    await this.deliveryEngine.scheduleDeliveryJobs(doc);

    // Mark event processed
    this.processedEventIds.add(payload.eventId);
    if (this.processedEventIds.size > 5000) {
      const oldest = this.processedEventIds.keys().next().value;
      if (oldest) this.processedEventIds.delete(oldest);
    }

    return {
      success: true,
      duplicate: false,
      notification: doc,
    };
  }

  /**
   * Broadcasts an administrative system announcement to multiple recipients.
   * Requires verified admin role!
   */
  public async broadcastAdministrativeAnnouncement(params: {
    adminUid: string;
    titleFa: string;
    messageFa: string;
    recipientUids: readonly string[];
  }): Promise<{ dispatchedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let dispatchedCount = 0;

    for (const uid of params.recipientUids) {
      const eventId = `admin_annc_${Date.now()}_${uid}`;
      const outcome = await this.consumeEvent({
        eventId,
        eventType: 'system.administrative_announcement',
        recipientUid: uid,
        variables: {
          announcementTitle: params.titleFa,
          announcementMessage: params.messageFa,
          senderName: 'تیم پشتیبانی رادار تهران',
        },
        priorityOverride: 'high',
        idempotencyKey: `annc_${params.titleFa}_${uid}`,
        timestampIso: new Date().toISOString(),
      });

      if (outcome.success) {
        dispatchedCount++;
      } else if (outcome.errors) {
        errors.push(...outcome.errors);
      }
    }

    return { dispatchedCount, errors };
  }
}
