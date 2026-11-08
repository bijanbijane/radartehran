/**
 * Employee 68 — Real Estate Notification, Alert Orchestration & Communication Preferences Backend
 * (`server/modules/notification-orchestration/types.ts`)
 *
 * Exclusive ownership: `server/modules/notification-orchestration/`
 */

import type {
  AuditEventSink,
  AuthenticatedPrincipal,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../core/types';

export type OrchestrationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';

export type UnifiedNotificationCategory =
  | 'PROPERTY_AND_LISTING_UPDATES'
  | 'SAVED_SEARCH_ALERTS'
  | 'PRICE_CHANGES'
  | 'PROPERTY_AVAILABILITY_CHANGES'
  | 'TRANSACTION_UPDATES'
  | 'RENTAL_AND_TENANCY_UPDATES'
  | 'BROKERAGE_AND_AGENT_UPDATES'
  | 'VERIFICATION_UPDATES'
  | 'REVIEW_AND_REPUTATION_UPDATES'
  | 'SUPPORT_CASE_UPDATES'
  | 'BILLING_AND_SUBSCRIPTION_UPDATES'
  | 'DOCUMENT_STATUS_UPDATES'
  | 'SECURITY_AND_ACCOUNT_NOTIFICATIONS'
  | 'ADMINISTRATIVE_ANNOUNCEMENTS';

export type SourceEmployeeDomain =
  | 'EMP_53_TRANSACTIONS'
  | 'EMP_54_FINANCIAL_LEDGER'
  | 'EMP_55_RENTAL_TENANCY'
  | 'EMP_56_PROPERTY_MANAGEMENT'
  | 'EMP_57_BROKERAGE_AGENT'
  | 'EMP_58_LISTING_LIFECYCLE'
  | 'EMP_59_VALUATION'
  | 'EMP_60_MARKET_INTELLIGENCE'
  | 'EMP_61_GEOSPATIAL'
  | 'EMP_62_DATA_GOVERNANCE'
  | 'EMP_63_DOCUMENTS'
  | 'EMP_64_CUSTOMER_EXPERIENCE'
  | 'EMP_65_TRUST_VERIFICATION'
  | 'EMP_66_CUSTOMER_SUPPORT'
  | 'EMP_67_MARKETPLACE_BILLING'
  | 'ADMIN_SYSTEM';

export type NotificationPriorityLevel =
  | 'INFORMATIONAL'
  | 'NORMAL'
  | 'IMPORTANT'
  | 'URGENT'
  | 'SECURITY_CRITICAL';

export type NotificationLifecycleStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETRY_SCHEDULED'
  | 'EXPIRED'
  | 'CANCELED';

export type InAppReadStatus = 'UNREAD' | 'READ' | 'ARCHIVED';

export type DeliveryFrequencyMode = 'IMMEDIATE' | 'DAILY_DIGEST' | 'WEEKLY_DIGEST';

export type DeliveryFailureClassification =
  | 'NONE'
  | 'TRANSIENT_TIMEOUT'
  | 'TRANSIENT_PROVIDER_OUTAGE'
  | 'TRANSIENT_RATE_LIMITED'
  | 'PERMANENT_INVALID_RECIPIENT'
  | 'PERMANENT_TEMPLATE_ERROR'
  | 'PERMANENT_CONSENT_REVOKED';

export interface NotificationRelatedEntityRefs {
  propertyId?: string | null;
  listingId?: string | null;
  savedSearchId?: string | null;
  transactionDealId?: string | null;
  tenancyId?: string | null;
  brokerageId?: string | null;
  supportCaseId?: string | null;
  invoiceId?: string | null;
  subscriptionId?: string | null;
  documentId?: string | null;
}

export interface UnifiedNotificationRecord {
  notificationId: string;
  recipientUid: string;
  category: UnifiedNotificationCategory;
  sourceDomain: SourceEmployeeDomain;
  eventReferenceId: string;
  eventType: string;
  templateId: string;
  templateVersion: number;
  locale: 'fa' | 'en';
  title: string;
  structuredContent: {
    summary: string;
    body: string;
    actionLabel?: string;
    variablesSnapshot: Record<string, string | number | boolean>;
  };
  priority: NotificationPriorityLevel;
  isPromotional: boolean;
  requestedChannels: OrchestrationChannel[];
  eligibleChannels: OrchestrationChannel[];
  deliveredChannels: OrchestrationChannel[];
  failedChannels: OrchestrationChannel[];
  status: NotificationLifecycleStatus;
  readStatus: InAppReadStatus;
  relatedEntities: NotificationRelatedEntityRefs;
  deepLinkPath: string | null;
  deduplicationKey: string;
  retentionPolicyDays: number;
  scheduledForIso: string | null;
  digestBatchId: string | null;
  readAtIso: string | null;
  archivedAtIso: string | null;
  deliveredAtIso: string | null;
  expiresAtIso: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ChannelDeliveryAttemptRecord {
  attemptId: string;
  notificationId: string;
  recipientUid: string;
  channel: OrchestrationChannel;
  providerId: string;
  providerRequestId: string | null;
  idempotencyKey: string;
  status:
    | 'PENDING'
    | 'SCHEDULED'
    | 'PROCESSING'
    | 'DELIVERED'
    | 'RETRY_SCHEDULED'
    | 'FAILED_PERMANENT'
    | 'DEAD_LETTER'
    | 'CANCELED';
  attemptCount: number;
  maxAttempts: number;
  failureClassification: DeliveryFailureClassification;
  failureReason: string | null;
  nextRetryAtIso: string | null;
  latencyMs: number;
  lastAttemptAtIso: string | null;
  deliveredAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface NotificationTemplateVersionRecord {
  templateKey: string; // `${templateId}__${locale}__v${version}`
  templateId: string;
  category: UnifiedNotificationCategory;
  locale: 'fa' | 'en';
  version: number;
  subjectTemplate: string;
  summaryTemplate: string;
  bodyTemplate: string;
  actionLabelTemplate?: string;
  requiredVariables: string[];
  allowedVariables: string[];
  publicationStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  effectiveFromIso: string;
  effectiveToIso: string | null;
  fallbackLocale: 'fa';
  createdByUid: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UserCommunicationPreferenceRecord {
  uid: string;
  locale: 'fa' | 'en';
  timeZone: string;
  channelEnabled: Record<OrchestrationChannel, boolean>;
  categoryPreferences: Record<
    UnifiedNotificationCategory,
    {
      enabled: boolean;
      channels: OrchestrationChannel[];
      frequency: DeliveryFrequencyMode;
    }
  >;
  promotionalOptInGranted: boolean;
  promotionalConsentWithdrawnAtIso: string | null;
  quietHours: {
    enabled: boolean;
    startHourLocal: number; // 0..23
    endHourLocal: number; // 0..23
  };
  preferenceVersion: number;
  updatedAtIso: string;
}

export interface DigestBatchRecord {
  digestBatchId: string;
  recipientUid: string;
  frequency: 'DAILY_DIGEST' | 'WEEKLY_DIGEST';
  notificationIds: string[];
  channels: OrchestrationChannel[];
  status: 'PENDING' | 'DELIVERED' | 'CANCELED' | 'FAILED';
  scheduledWindowKey: string;
  deliveredAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface AdministrativeAnnouncementRecord {
  announcementId: string;
  title: string;
  body: string;
  targetAudience: 'ALL_OPTED_IN_USERS' | 'VERIFIED_PROFESSIONALS' | 'SPECIFIC_UIDS';
  targetRecipientUids: string[];
  requiresPromotionalConsent: boolean;
  priority: 'INFORMATIONAL' | 'NORMAL' | 'IMPORTANT';
  channels: OrchestrationChannel[];
  scheduledForIso: string;
  status: 'SCHEDULED' | 'DISPATCHED' | 'CANCELED';
  dispatchedNotificationCount: number;
  createdByAdminUid: string;
  canceledByAdminUid: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface AuthorizedDomainNotificationEventInput {
  eventId: string;
  eventReferenceId?: string;
  sourceDomain: SourceEmployeeDomain;
  eventType: string;
  category: UnifiedNotificationCategory;
  recipientUid: string;
  templateId?: string;
  priority?: NotificationPriorityLevel;
  isPromotional?: boolean;
  requestedChannels?: OrchestrationChannel[];
  variables: Record<string, string | number | boolean>;
  relatedEntities?: NotificationRelatedEntityRefs;
  deepLinkPath?: string | null;
  deduplicationKey?: string;
  scheduledForIso?: string | null;
  retentionPolicyDays?: number;
  occurredAtIso?: string;
}

export interface ChannelDeliveryProviderAdapter {
  readonly channel: OrchestrationChannel;
  readonly providerId: string;
  send(params: {
    notificationId: string;
    recipientUid: string;
    title: string;
    body: string;
    idempotencyKey: string;
    timeoutMs: number;
  }): Promise<{
    ok: boolean;
    providerRequestId?: string;
    failureClassification?: DeliveryFailureClassification;
    failureReason?: string;
    latencyMs: number;
  }>;
}

export interface EntityAccessAuthorizationAdapter {
  canRecipientAccessRelatedEntities(
    recipientUid: string,
    relatedEntities: NotificationRelatedEntityRefs,
  ): Promise<{
    allowed: boolean;
    sanitizedDeepLinkPath?: string | null;
    reason?: string;
  }>;
}

export interface NotificationOperationalAnalyticsView {
  generatedAtIso: string;
  totalNotificationsGenerated: number;
  totalNotificationsDelivered: number;
  totalDeliveryFailures: number;
  retryRateBasisPoints: number;
  readRateBasisPoints: number;
  digestBatchesDelivered: number;
  byChannel: Record<
    OrchestrationChannel,
    {
      attempts: number;
      delivered: number;
      failed: number;
      retriesScheduled: number;
      deadLettered: number;
      avgLatencyMs: number;
    }
  >;
  byCategory: Record<UnifiedNotificationCategory, number>;
  byFailureClassification: Record<DeliveryFailureClassification, number>;
}

export interface NotificationOrchestrationDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  auditSink: AuditEventSink;
  idempotencyStore?: IdempotencyStoreAdapter;
  primaryAdminEmails?: string[];
  channelAdapters?: Partial<Record<OrchestrationChannel, ChannelDeliveryProviderAdapter>>;
  entityAuthAdapter?: EntityAccessAuthorizationAdapter;
}
