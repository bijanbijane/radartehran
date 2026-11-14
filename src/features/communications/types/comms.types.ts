/** @file src/features/communications/types/comms.types.ts — RT-UI-COMMS-001 Canonical Domain Types */
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';

export type CommsCategoryCode =
  | 'LISTING'
  | 'SERVICE'
  | 'PROPERTY'
  | 'MARKET'
  | 'VALUATION'
  | 'COMMUNITY'
  | 'CONTRIBUTION'
  | 'KNOWLEDGE'
  | 'ACCOUNT'
  | 'SECURITY'
  | 'SUPPORT'
  | 'SYSTEM'
  | 'ADMIN';

export type CommsEventCode =
  | 'LISTING.APPROVED'
  | 'LISTING.REJECTED'
  | 'LISTING.PRICE_DROPPED'
  | 'SERVICE.REQUEST_CREATED'
  | 'SERVICE.PROPOSAL_RECEIVED'
  | 'PROPERTY.WATCHLIST_MATCH'
  | 'MARKET.ALERT_TRIGGERED'
  | 'VALUATION.REPORT_READY'
  | 'COMMUNITY.REPLY_RECEIVED'
  | 'CONTRIBUTION.PROPOSAL_APPROVED'
  | 'CONTRIBUTION.PROPOSAL_REJECTED'
  | 'KNOWLEDGE.PUBLICATION_UPDATED'
  | 'ACCOUNT.PROFILE_EXPORT_READY'
  | 'SECURITY.NEW_LOGIN'
  | 'SECURITY.PASSWORD_CHANGED'
  | 'SUPPORT.TICKET_REPLIED'
  | 'SYSTEM.MAINTENANCE_NOTICE'
  | 'ADMIN.ESCALATION_FLAGGED';

export type SeverityLevel = 'INFO' | 'NOTICE' | 'WARNING' | 'CRITICAL';
export type UrgencyLevel = 'LOW' | 'NORMAL' | 'HIGH' | 'IMMEDIATE';
export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DeliveryChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH' | 'INTERNAL_INBOX';
export type NotificationStatus = 'UNREAD' | 'READ' | 'ARCHIVED' | 'DISMISSED' | 'EXPIRED';
export type DeliveryAttemptStatus =
  | 'QUEUED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_PERMANENT'
  | 'DEAD_LETTERED'
  | 'SKIPPED_BY_PREFERENCE'
  | 'SUPPRESSED_BY_POLICY';

export type CommsQueueName =
  | 'comms.critical'
  | 'comms.transactional'
  | 'comms.standard'
  | 'comms.digest'
  | 'comms.retry'
  | 'comms.dead-letter';

export type ConversationType =
  | 'SERVICE_REQUEST'
  | 'LISTING_INQUIRY'
  | 'SUPPORT'
  | 'ADMIN_CASE'
  | 'SYSTEM_CONVERSATION';

export type SenderType = 'USER' | 'SYSTEM' | 'SUPPORT_AGENT' | 'ADMIN';
export type MessageStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'REDACTED';

export interface EventPolicyDefinition {
  eventCode: CommsEventCode;
  category: CommsCategoryCode;
  severity: SeverityLevel;
  urgency: UrgencyLevel;
  defaultPriority: PriorityLevel;
  queueName: CommsQueueName;
  defaultChannels: DeliveryChannel[];
  requiresUserAction: boolean;
  mandatoryNonOptOut: boolean;
  bypassQuietHours: boolean;
  dedupeWindowMinutes: number;
  expiresInHours: number | null;
  fallbackChannel?: DeliveryChannel;
  descriptionFa: string;
}

export interface CommsTemplateVersion {
  templateCode: string;
  eventCode: CommsEventCode;
  version: number;
  locale: 'fa-IR';
  titleTemplateFa: string;
  bodyTemplateFa: string;
  shortPreviewFa: string;
  ctaLabelFa: string;
  requiredVariables: string[];
  active: boolean;
}

export interface CommunicationEventInput {
  eventId?: string;
  idempotencyKey: string;
  eventCode: CommsEventCode;
  recipientUid: string;
  recipientActive?: boolean;
  transactionCommitted?: boolean;
  payload: Record<string, string | number | boolean>;
  deepLinkPath?: string;
  targetView?: PrimaryViewId;
  targetSubTab?: ModuleSubTabId;
  entityType?: string;
  entityId?: string;
  createdAtIso?: string;
}

export interface NotificationRecord {
  id: string;
  eventId: string;
  idempotencyKey: string;
  recipientUid: string;
  eventCode: CommsEventCode;
  category: CommsCategoryCode;
  severity: SeverityLevel;
  urgency: UrgencyLevel;
  priority: PriorityLevel;
  titleFa: string;
  bodyFa: string;
  shortPreviewFa: string;
  ctaLabelFa: string;
  deepLinkPath: string;
  targetView: PrimaryViewId;
  targetSubTab?: ModuleSubTabId;
  entityType?: string;
  entityId?: string;
  requiresUserAction: boolean;
  status: NotificationStatus;
  readAtIso: string | null;
  archivedAtIso: string | null;
  expiresAtIso: string | null;
  createdAtIso: string;
}

export interface QuietHoursSetting {
  enabled: boolean;
  timezone: 'Asia/Tehran';
  startHourLocal: number; // e.g. 23
  endHourLocal: number;   // e.g. 8
}

export interface CategoryChannelMatrixRule {
  category: CommsCategoryCode;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
  lockedMandatory?: boolean;
}

export interface CommunicationConsentRecord {
  consentType: 'TRANSACTIONAL_SERVICE' | 'SECURITY_MANDATORY' | 'MARKETING_UPDATES' | 'DIGEST_ALERTS';
  granted: boolean;
  updatedAtIso: string;
  sourceFa: string;
}

export interface UserCommsPreferences {
  recipientUid: string;
  channels: {
    inApp: boolean;
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  quietHours: QuietHoursSetting;
  digestFrequency: 'instant' | 'daily_evening' | 'weekly';
  categoryRules: CategoryChannelMatrixRule[];
  consents: CommunicationConsentRecord[];
  updatedAtIso: string;
}

export interface DeviceTokenRecord {
  deviceId: string;
  ownerUid: string;
  platform: 'WEB_PUSH' | 'PWA_MOBILE';
  labelFa: string;
  tokenMasked: string;
  active: boolean;
  registeredAtIso: string;
  revokedAtIso: string | null;
}

export interface DeliveryAttemptRecord {
  attemptId: string;
  notificationId: string;
  eventCode: CommsEventCode;
  recipientUid: string;
  channel: DeliveryChannel;
  queueName: CommsQueueName;
  status: DeliveryAttemptStatus;
  attemptNumber: number;
  errorCode: string | null;
  errorClass: 'TRANSIENT' | 'PERMANENT' | null;
  createdAtIso: string;
}

export interface DeadLetterRecord {
  dlqId: string;
  attemptId: string;
  notificationId: string;
  eventCode: CommsEventCode;
  channel: DeliveryChannel;
  recipientUid: string;
  reasonCode: string;
  reasonFa: string;
  retryCount: number;
  replayed: boolean;
  replayedAtIso: string | null;
  createdAtIso: string;
}

export interface ConversationParticipantRecord {
  uid: string;
  displayNameFa: string;
  roleLabelFa: string;
  senderType: SenderType;
  muted: boolean;
  archived: boolean;
  blockedOtherParticipant: boolean;
}

export interface MessageAttachmentMeta {
  attachmentId: string;
  fileName: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
}

export interface MessageRecord {
  messageId: string;
  conversationId: string;
  senderUid: string;
  senderType: SenderType;
  senderLabelFa: string;
  bodyFa: string;
  attachments: MessageAttachmentMeta[];
  status: MessageStatus;
  readByUids: string[];
  createdAtIso: string;
  redactedReasonFa?: string;
}

export interface ConversationRecord {
  conversationId: string;
  type: ConversationType;
  contextEntityType: 'service_request' | 'listing' | 'support_ticket' | 'admin_case' | 'system';
  contextEntityId: string;
  contextTitleFa: string;
  status: 'OPEN' | 'RESOLVED' | 'ARCHIVED';
  participants: ConversationParticipantRecord[];
  messages: MessageRecord[];
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CommsAbuseReportRecord {
  reportId: string;
  conversationId: string;
  messageId?: string;
  reporterUid: string;
  reasonFa: string;
  status: 'PENDING' | 'REVIEWED' | 'DISMISSED';
  createdAtIso: string;
}

export interface CommsAuditRecord {
  auditId: string;
  actorUid: string;
  actionCode: string;
  targetType: string;
  targetId: string;
  summaryFa: string;
  createdAtIso: string;
}
