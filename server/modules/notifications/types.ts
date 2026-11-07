/**
 * Employee 13 — Notifications and Messaging Backend (`server/modules/notifications/types.ts`)
 *
 * Exclusive ownership: `server/modules/notifications/`
 *
 * Defines contracts for:
 *  1. Notification event contracts across all 8 domain sources.
 *  2. User notification preferences & channel-level consent / opt-out controls.
 *  3. In-app notifications & read/unread/archived state transitions.
 *  4. Durable outbox entries & delivery jobs surviving process restarts.
 *  5. Email, SMS, and Push delivery provider adapter interfaces.
 *  6. Template management & privacy-safe rendering contracts.
 *  7. Four-stage delivery lifecycle:
 *     (Event Creation -> Notification Generation -> Delivery Attempt -> Delivery Confirmation).
 */
import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  NormalizedTimestamp,
  TransactionRunnerAdapter,
} from '../core';

export type NotificationEventSource =
  | 'BARGAINS'
  | 'BUYER_ALERTS'
  | 'SPONSORSHIP'
  | 'SERVICE_MARKETPLACE'
  | 'PROFESSIONAL_VERIFICATION'
  | 'CROWD_CLAIMS'
  | 'MARKET_ANALYTICS'
  | 'ACCOUNT_LIFECYCLE';

export const ALL_NOTIFICATION_EVENT_SOURCES: readonly NotificationEventSource[] = [
  'BARGAINS',
  'BUYER_ALERTS',
  'SPONSORSHIP',
  'SERVICE_MARKETPLACE',
  'PROFESSIONAL_VERIFICATION',
  'CROWD_CLAIMS',
  'MARKET_ANALYTICS',
  'ACCOUNT_LIFECYCLE',
] as const;

export type NotificationEventType =
  | 'BARGAIN_PUBLISHED'
  | 'BARGAIN_PRICE_DROP'
  | 'BUYER_ALERT_MATCH_FOUND'
  | 'SPONSOR_CAMPAIGN_APPROVED'
  | 'SPONSOR_CAMPAIGN_EXPIRING'
  | 'SERVICE_QUOTE_RECEIVED'
  | 'PRO_VERIFICATION_APPROVED'
  | 'PRO_VERIFICATION_REJECTED'
  | 'CROWD_CLAIM_MODERATED'
  | 'MARKET_PULSE_ANOMALY_DETECTED'
  | 'ACCOUNT_EXPORT_READY'
  | 'ACCOUNT_DELETION_INITIATED';

export type NotificationCategoryClass =
  | 'CRITICAL_TRANSACTIONAL'
  | 'SERVICE_TRANSACTIONAL'
  | 'MARKET_ALERT'
  | 'PROMOTIONAL_SPONSORSHIP';

export type NotificationChannel =
  | 'IN_APP'
  | 'EMAIL'
  | 'SMS'
  | 'PUSH'
  | 'in_app'
  | 'email'
  | 'sms'
  | 'push';
export type StrictUpperNotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';
export type ExternalDeliveryChannel = 'EMAIL' | 'SMS' | 'PUSH';

export const ALL_EXTERNAL_DELIVERY_CHANNELS: readonly ExternalDeliveryChannel[] = [
  'EMAIL',
  'SMS',
  'PUSH',
] as const;

export interface NotificationActorContext {
  uid: string;
  isAdmin: boolean;
}

export interface NotificationDomainEventInput {
  source: NotificationEventSource;
  eventType: NotificationEventType;
  idempotencyKey: string;
  recipientUid: string;
  templateId?: string;
  requestedChannels?: NotificationChannel[];
  occurredAtIso?: string;
  variables: Record<string, string | number | boolean>;
  correlationId?: string;
}

export type OutboxEntryStatus =
  | 'PENDING_GENERATION'
  | 'GENERATED'
  | 'FAILED_GENERATION';

export interface NotificationOutboxEntry {
  outboxId: string;
  deduplicationKey: string;
  source: NotificationEventSource;
  eventType: NotificationEventType;
  categoryClass: NotificationCategoryClass;
  recipientUid: string;
  templateId: string;
  requestedChannels: NotificationChannel[];
  sanitizedVariables: Record<string, string | number | boolean>;
  status: OutboxEntryStatus;
  generatedInAppNotificationId: string | null;
  generatedDeliveryJobIds: string[];
  failureReason?: string;
  occurredAtIso: string;
  createdAtIso: string;
  processedAtIso: string | null;
  revision: number;
}

export interface UserNotificationPreferences {
  userUid: string;
  channelEnabled: Record<StrictUpperNotificationChannel, boolean> &
    Partial<Record<NotificationChannel, boolean>>;
  categoryEnabled: Record<NotificationCategoryClass, boolean>;
  sourceMuted: Partial<Record<NotificationEventSource, boolean>>;
  quietHoursUtc?: {
    enabled: boolean;
    startHourUtc: number; // 0..23
    endHourUtc: number;   // 0..23
  };
  updatedAtIso: string;
  revision: number;
}

export interface UserConsentAndOptOutRecord {
  userUid: string;
  globalOptOutAllNonCritical: boolean;
  emailConsentGranted: boolean;
  smsConsentGranted: boolean;
  pushConsentGranted: boolean;
  marketingSponsorshipConsentGranted: boolean;
  hasConfiguredEmailDestination: boolean;
  hasConfiguredSmsDestination: boolean;
  hasConfiguredPushToken: boolean;
  consentUpdatedAtIso: string;
  optOutReason?: string;
  revision: number;
}

export type InAppReadState = 'UNREAD' | 'READ' | 'ARCHIVED';

export interface InAppNotificationRecord {
  notificationId: string;
  outboxId: string;
  deduplicationKey: string;
  recipientUid: string;
  source: NotificationEventSource;
  eventType: NotificationEventType;
  categoryClass: NotificationCategoryClass;
  titleFa: string;
  previewFa: string;
  bodyFa: string;
  actionPath?: string;
  readState: InAppReadState;
  readAtIso: string | null;
  archivedAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
  revision: number;
}

/**
 * Delivery status tracking state machine.
 * Note the strict distinction between `PROVIDER_ACCEPTED_AWAITING_RECEIPT`
 * (provider API returned 200/202) and `DELIVERED_CONFIRMED` (delivery receipt confirmed).
 */
export type DeliveryJobStatus =
  | 'QUEUED_OUTBOX'
  | 'DISPATCHING'
  | 'PROVIDER_ACCEPTED_AWAITING_RECEIPT'
  | 'DELIVERED_CONFIRMED'
  | 'RETRY_SCHEDULED'
  | 'FAILED_PERMANENT'
  | 'SUPPRESSED_PREFERENCE_OR_CONSENT';

export interface DeliveryAttemptAuditRecord {
  attemptNumber: number;
  attemptedAtIso: string;
  outcome:
    | 'PROVIDER_ACCEPTED'
    | 'TRANSIENT_ERROR'
    | 'PERMANENT_ERROR'
    | 'UNCONFIGURED_PROVIDER_BLOCKED';
  providerId: string;
  providerMessageId?: string;
  redactedDiagnostic: string;
}

export interface DurableNotificationDeliveryJob {
  jobId: string;
  outboxId: string;
  deduplicationKey: string;
  recipientUid: string;
  source: NotificationEventSource;
  eventType: NotificationEventType;
  categoryClass: NotificationCategoryClass;
  channel: ExternalDeliveryChannel;
  templateId: string;
  renderedSubjectFa: string;
  renderedPreviewFa: string;
  renderedBodyFa: string;
  status: DeliveryJobStatus;
  /**
   * Explicitly false until Stage 4 (`confirmDeliveryReceipt`) verifies actual delivery.
   */
  isConfirmedDelivered: boolean;
  suppressionReason?: string;
  providerId: string | null;
  providerMessageId: string | null;
  attempts: number;
  maxAttempts: number;
  nextAttemptAtIso: string;
  attemptHistory: DeliveryAttemptAuditRecord[];
  lastErrorRedacted: string | null;
  providerAcceptedAtIso: string | null;
  confirmedDeliveredAtIso: string | null;
  failedPermanentlyAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
  revision: number;
}

export interface NotificationTemplateDefinition {
  templateId: string;
  source: NotificationEventSource;
  eventType: NotificationEventType;
  categoryClass: NotificationCategoryClass;
  requiredVariables: readonly string[];
  subjectTemplateFa: string;
  previewTemplateFa: string;
  bodyTemplateFa: string;
  defaultActionPath?: string;
  version: number;
}

export interface RenderedNotificationContent {
  templateId: string;
  subjectFa: string;
  previewFa: string;
  bodyFa: string;
  actionPath?: string;
}

export interface ProviderDispatchRequest {
  jobId: string;
  deduplicationKey: string;
  recipientUid: string;
  channel: ExternalDeliveryChannel;
  subjectFa: string;
  previewFa: string;
  bodyFa: string;
}

export interface ProviderDispatchResponse {
  providerId: string;
  outcome:
    | 'ACCEPTED_BY_PROVIDER'
    | 'TRANSIENT_FAILURE'
    | 'PERMANENT_FAILURE'
    | 'PROVIDER_NOT_CONFIGURED';
  providerMessageId?: string;
  diagnosticMessage: string;
}

export interface EmailDeliveryProviderAdapter {
  readonly channel: 'EMAIL';
  readonly providerId: string;
  isConfiguredAndApproved(): boolean;
  sendEmail(request: ProviderDispatchRequest): Promise<ProviderDispatchResponse>;
}

export interface SmsDeliveryProviderAdapter {
  readonly channel: 'SMS';
  readonly providerId: string;
  isConfiguredAndApproved(): boolean;
  sendSms(request: ProviderDispatchRequest): Promise<ProviderDispatchResponse>;
}

export interface PushDeliveryProviderAdapter {
  readonly channel: 'PUSH';
  readonly providerId: string;
  isConfiguredAndApproved(): boolean;
  sendPush(request: ProviderDispatchRequest): Promise<ProviderDispatchResponse>;
}

export interface DeliveryReceiptConfirmationInput {
  providerId: string;
  providerMessageId: string;
  receiptStatus: 'DELIVERED' | 'BOUNCED_PERMANENT' | 'TEMPORARY_FAILURE';
  confirmedAtIso?: string;
  diagnosticNote?: string;
}

export interface RedactedOperationalLogEntry {
  logId: string;
  timestampIso: string;
  stage: 'EVENT_INGESTION' | 'NOTIFICATION_GENERATION' | 'DELIVERY_ATTEMPT' | 'DELIVERY_CONFIRMATION' | 'PREFERENCE_UPDATE';
  recipientUidHash: string;
  outboxId?: string;
  jobId?: string;
  channel?: NotificationChannel;
  status: string;
  redactedMessage: string;
}

export type NotificationErrorCode =
  | 'UNAUTHORIZED_ACTOR'
  | 'FORBIDDEN_CROSS_USER_ACCESS'
  | 'INVALID_EVENT_CONTRACT'
  | 'TEMPLATE_NOT_FOUND'
  | 'MISSING_TEMPLATE_VARIABLE'
  | 'PRIVACY_CONTACT_LEAK_IN_PREVIEW'
  | 'NOT_FOUND'
  | 'CONCURRENT_MODIFICATION_CONFLICT'
  | 'INVALID_STATE_TRANSITION';

export class NotificationDomainError extends Error {
  public readonly code: NotificationErrorCode;
  public readonly httpStatus: number;

  constructor(code: NotificationErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.name = 'NotificationDomainError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// Core Transactional Notifications Service & Router Contracts (`service.ts`, `routes.ts`, `templatesAndValidation.ts`)
export type DeliveryJobLifecycleState =
  | 'queued'
  | 'attempted'
  | 'delivered'
  | 'failed'
  | 'cancelled';

export interface NotificationEventPayload {
  eventId: string;
  eventType: string;
  recipientUid: string;
  variables: Record<string, unknown>;
  idempotencyKey?: string;
  correlationId?: string;
  deepLinkParams?: Record<string, string>;
}

export interface StoredNotification {
  id: string;
  recipientUid: string;
  templateId: string;
  category: string;
  eventType: string;
  titleFa: string;
  bodyFa: string;
  variables: Record<string, string>;
  deepLink?: string;
  read: boolean;
  readAt?: NormalizedTimestamp;
  archived: boolean;
  archivedAt?: NormalizedTimestamp;
  lifecycleState: 'pending' | 'delivered' | 'failed';
  requestedChannels: NotificationChannel[];
  eventId: string;
  correlationId: string;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export interface StoredNotificationDeliveryJob {
  id: string;
  notificationId: string;
  recipientUid: string;
  channel: NotificationChannel;
  lifecycleState: DeliveryJobLifecycleState;
  attemptCount: number;
  maxRetries: number;
  lastAttemptAt?: NormalizedTimestamp;
  deliveredAt?: NormalizedTimestamp;
  providerReferenceId?: string;
  failureReason?: string;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export interface StoredNotificationPreferences {
  recipientUid: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  securityAlertsEnabled: boolean;
  promotionalEnabled: boolean;
  updatedAt: NormalizedTimestamp;
}

export interface StoredNotificationTemplate {
  id: string;
  templateVersion: string;
  category: string;
  eventType: string;
  titlePatternFa: string;
  bodyPatternFa: string;
  allowedVariables: string[];
  defaultChannels: NotificationChannel[];
  deepLinkPattern?: string;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export interface SendDirectNotificationInput {
  recipientUid: string;
  templateId: string;
  variables: Record<string, string | number>;
  channels?: NotificationChannel[];
}

export interface SendAdminAnnouncementInput {
  titleFa: string;
  bodyFa: string;
  broadcastToAll: boolean;
  targetRecipientUids?: string[];
  deepLink?: string;
}

export interface UpdateNotificationPreferencesInput {
  inAppEnabled?: boolean;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  promotionalEnabled?: boolean;
}

export interface ExternalChannelDeliveryProviderAdapter {
  sendChannelMessage: (params: {
    jobId: string;
    notificationId: string;
    recipientUid: string;
    channel: NotificationChannel;
    titleFa: string;
    bodyFa: string;
    deepLink?: string;
  }) => Promise<{
    delivered: boolean;
    providerReferenceId?: string;
    failureReason?: string;
  }>;
}

export interface NotificationsModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore?: DelegatedAdminStoreAdapter;
  primaryAdminEmails?: string[];
  txRunner: TransactionRunnerAdapter;
  idempotencyStore?: IdempotencyStoreAdapter;
  deliveryAdapter?: ExternalChannelDeliveryProviderAdapter;
  auditSink?: AuditEventSink;
  nowFn?: () => number;
}

