/**
 * @file server/modules/notifications/notificationTypes.ts
 * @description Canonical data models, schemas, and lifecycle states for Notifications & Messaging backend.
 */

export type NotificationCategory =
  | 'bargains'
  | 'buyer_alerts'
  | 'sponsorship'
  | 'crowd_claims'
  | 'security'
  | 'system_announcement';

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

export type NotificationLifecycleState =
  | 'pending'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'suppressed';

export type NotificationReadState = 'unread' | 'read' | 'archived' | 'deleted';

export interface NotificationDeepLink {
  readonly actionUrl: string;
  readonly view?: string;
  readonly entityId?: string;
  readonly cityId?: string;
  readonly hoodId?: number;
}

export interface NotificationDocument {
  readonly id: string;
  readonly recipientUid: string;
  readonly category: NotificationCategory;
  readonly templateId: string;
  readonly templateVersion: number;
  readonly priority: NotificationPriority;
  readonly titleFa: string;
  readonly bodyFa: string;
  readonly deepLink?: NotificationDeepLink;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly readState: NotificationReadState;
  readonly readAtIso?: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly idempotencyKey: string;
  readonly schemaVersion: number;
}

export interface ChannelPreferences {
  readonly inApp: boolean;
  readonly email: boolean;
  readonly sms: boolean;
  readonly push: boolean;
}

export interface CategoryPreferences {
  readonly bargains: boolean;
  readonly buyer_alerts: boolean;
  readonly sponsorship: boolean;
  readonly crowd_claims: boolean;
  readonly security: boolean;
  readonly system_announcement: boolean;
}

export interface NotificationPreferencesDocument {
  readonly uid: string;
  readonly channels: ChannelPreferences;
  readonly categories: CategoryPreferences;
  readonly emailAddress?: string;
  readonly mobilePhone?: string;
  readonly updatedAtIso: string;
  readonly schemaVersion: number;
}

export interface NotificationDeliveryJob {
  readonly id: string;
  readonly notificationId: string;
  readonly recipientUid: string;
  readonly channel: NotificationChannel;
  readonly targetDestinationMasked?: string;
  readonly deliveryState: NotificationLifecycleState;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly nextAttemptAtIso?: string;
  readonly lastAttemptAtIso?: string;
  readonly lastError?: string;
  readonly idempotencyKey: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface NotificationTemplateDefinition {
  readonly id: string;
  readonly version: number;
  readonly category: NotificationCategory;
  readonly titleTemplateFa: string;
  readonly bodyTemplateFa: string;
  readonly allowedVariables: readonly string[];
  readonly defaultPriority: NotificationPriority;
}

export type NotificationEventType =
  | 'bargain.submitted'
  | 'bargain.approved'
  | 'bargain.rejected'
  | 'bargain.status_changed'
  | 'buyer_alert.created_or_updated'
  | 'buyer_alert.matched'
  | 'sponsor.application_submitted'
  | 'sponsor.application_approved_or_rejected'
  | 'crowd_claim.accepted_or_rejected'
  | 'account.security_alert'
  | 'system.administrative_announcement'
  | 'social.post.created.v1'
  | 'social.comment.created.v1'
  | 'social.question.answered.v1'
  | 'social.moderation.decided.v1';

export interface NotificationEventPayload {
  readonly eventId: string;
  readonly eventType: NotificationEventType;
  readonly recipientUid: string;
  readonly targetEmail?: string;
  readonly targetMobilePhone?: string;
  readonly variables: Readonly<Record<string, string | number>>;
  readonly deepLink?: NotificationDeepLink;
  readonly priorityOverride?: NotificationPriority;
  readonly idempotencyKey?: string;
  readonly timestampIso: string;
}

export interface ListNotificationsOptions {
  readonly limit?: number;
  readonly cursor?: string | null;
  readonly readState?: NotificationReadState;
  readonly category?: NotificationCategory;
}

export interface ListNotificationsResponse {
  readonly items: readonly NotificationDocument[];
  readonly nextCursor: string | null;
  readonly unreadCount: number;
  readonly totalCount: number;
}
