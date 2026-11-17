/** @file src/features/communications/services/commsEngine.ts — Hardened Deterministic Communications Core Engine (< 290 lines) */
import { sanitizeInput } from '../../../utils/security';
import {
  COMMS_CATEGORY_META, COMMS_TEMPLATE_REGISTRY, EVENT_POLICY_REGISTRY, renderSafeTemplateText,
} from '../registries/eventPolicyAndTemplateRegistry';
import type {
  CommsAbuseReportRecord, CommsAuditRecord, CommsEventCode, CommunicationEventInput,
  ConversationParticipantRecord, ConversationRecord, ConversationType, DeadLetterRecord,
  DeliveryAttemptRecord, DeliveryAttemptStatus, DeliveryChannel, DeviceTokenRecord, MessageAttachmentMeta,
  MessageRecord, NotificationRecord, UserCommsPreferences,
} from '../types/comms.types';

export const ALLOWED_DIRECT_CONVERSATION_TYPES: readonly ConversationType[] = [
  'SERVICE_REQUEST', 'LISTING_INQUIRY', 'SUPPORT', 'ADMIN_CASE', 'SYSTEM_CONVERSATION',
] as const;
export const ALLOWED_ATTACHMENT_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_MESSAGES_PER_MINUTE_STANDARD = 12;

function generateSecureId(prefix: string): string {
  const rand = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().slice(0, 12)
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${rand}`;
}

export function getTehranLocalHour(date: Date = new Date()): number {
  try {
    const str = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', hour: 'numeric', hour12: false }).format(date);
    const parsed = Number.parseInt(str, 10);
    return Number.isFinite(parsed) ? ((parsed % 24) + 24) % 24 : 12;
  } catch {
    return (date.getUTCHours() + 3) % 24;
  }
}

export function createDefaultUserCommsPreferences(recipientUid: string): UserCommsPreferences {
  const now = new Date().toISOString();
  return {
    recipientUid,
    channels: { inApp: true, email: false, sms: false, push: false },
    quietHours: { enabled: true, timezone: 'Asia/Tehran', startHourLocal: 23, endHourLocal: 8 },
    digestFrequency: 'daily_evening',
    categoryRules: COMMS_CATEGORY_META.map((cat) => ({
      category: cat.code, inApp: true,
      email: cat.code === 'SECURITY' || cat.code === 'SERVICE' || cat.code === 'ACCOUNT',
      sms: cat.code === 'SECURITY',
      push: cat.code === 'SECURITY' || cat.code === 'SERVICE',
      lockedMandatory: cat.code === 'SECURITY',
    })),
    consents: [
      { consentType: 'SECURITY_MANDATORY', granted: true, updatedAtIso: now, sourceFa: 'سیاست امنیتی سامانه (اجباری)' },
      { consentType: 'TRANSACTIONAL_SERVICE', granted: true, updatedAtIso: now, sourceFa: 'تأیید تراکنش‌های کاربری' },
      { consentType: 'DIGEST_ALERTS', granted: false, updatedAtIso: now, sourceFa: 'خلاصه دیده‌بان بازار' },
      { consentType: 'MARKETING_UPDATES', granted: false, updatedAtIso: now, sourceFa: 'اطلاع‌رسانی قابلیت‌ها' },
    ],
    updatedAtIso: now,
  };
}

export function isLocalHourInQuietHours(localHour: number, quietHours: UserCommsPreferences['quietHours']): boolean {
  if (!quietHours.enabled) return false;
  const h = ((Math.floor(localHour) % 24) + 24) % 24;
  if (quietHours.startHourLocal > quietHours.endHourLocal) return h >= quietHours.startHourLocal || h < quietHours.endHourLocal;
  return h >= quietHours.startHourLocal && h < quietHours.endHourLocal;
}

export function sanitizeInternalDeepLink(rawPath?: string): string {
  if (!rawPath || typeof rawPath !== 'string') return '/account/notifications';
  const trimmed = rawPath.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || /^https?:/i.test(trimmed)) return '/account/notifications';
  return trimmed.slice(0, 140);
}

export function resolveEligibleChannels(params: {
  eventCode: CommsEventCode; prefs: UserCommsPreferences; localTehranHour: number; activeDeviceCount: number;
}): { deliverChannels: DeliveryChannel[]; deferredChannels: DeliveryChannel[]; suppressedReason: string | null } {
  const policy = EVENT_POLICY_REGISTRY[params.eventCode];
  if (policy.mandatoryNonOptOut) return { deliverChannels: [...policy.defaultChannels], deferredChannels: [], suppressedReason: null };
  const catRule = params.prefs.categoryRules.find((r) => r.category === policy.category);
  const deliverChannels: DeliveryChannel[] = [], deferredChannels: DeliveryChannel[] = [];
  const inQuiet = isLocalHourInQuietHours(params.localTehranHour, params.prefs.quietHours);

  for (const ch of policy.defaultChannels) {
    if (ch === 'IN_APP' && params.prefs.channels.inApp && (catRule?.inApp ?? true)) { deliverChannels.push('IN_APP'); continue; }
    if (ch === 'INTERNAL_INBOX') { deliverChannels.push('INTERNAL_INBOX'); continue; }
    if (ch === 'EMAIL' && params.prefs.channels.email && (catRule?.email ?? false)) {
      if (inQuiet && !policy.bypassQuietHours && policy.urgency === 'LOW') deferredChannels.push(ch); else deliverChannels.push(ch);
    }
    if (ch === 'SMS' && params.prefs.channels.sms && (catRule?.sms ?? false)) {
      if (inQuiet && !policy.bypassQuietHours) deferredChannels.push(ch); else deliverChannels.push(ch);
    }
    if (ch === 'PUSH' && params.prefs.channels.push && (catRule?.push ?? false) && params.activeDeviceCount > 0) {
      if (inQuiet && !policy.bypassQuietHours) deferredChannels.push(ch); else deliverChannels.push(ch);
    }
  }
  if (deliverChannels.length === 0 && deferredChannels.length === 0 && policy.fallbackChannel === 'IN_APP') deliverChannels.push('IN_APP');
  const suppressedReason = deliverChannels.length === 0 ? (deferredChannels.length > 0 ? 'DEFERRED_FOR_QUIET_HOURS' : 'SKIPPED_BY_USER_PREFERENCE') : null;
  return { deliverChannels, deferredChannels, suppressedReason };
}

export function classifyNotificationDateBucketFa(createdAtIso: string, nowIso = new Date().toISOString()): 'امروز' | 'دیروز' | 'هفته جاری' | 'قدیمی‌تر' {
  const diffDays = Math.floor((Date.parse(nowIso) - Date.parse(createdAtIso)) / 86_400_000);
  if (Number.isNaN(diffDays) || diffDays <= 0) return 'امروز';
  if (diffDays === 1) return 'دیروز';
  if (diffDays <= 7) return 'هفته جاری';
  return 'قدیمی‌تر';
}

export class CommsCoreStateEngine {
  private readonly outboxEventKeys = new Set<string>();
  notifications: NotificationRecord[] = [];
  preferencesByUid = new Map<string, UserCommsPreferences>();
  devices: DeviceTokenRecord[] = [];
  deliveries: DeliveryAttemptRecord[] = [];
  deadLetters: DeadLetterRecord[] = [];
  conversations: ConversationRecord[] = [];
  reports: CommsAbuseReportRecord[] = [];
  audits: CommsAuditRecord[] = [];

  hydrateOutboxKeys(keys: string[]): void { this.outboxEventKeys.clear(); keys.forEach((k) => this.outboxEventKeys.add(k)); }
  exportOutboxKeys(): string[] { return Array.from(this.outboxEventKeys); }

  getOrCreatePreferences(uid: string): UserCommsPreferences {
    const existing = this.preferencesByUid.get(uid);
    if (existing) return existing;
    const created = createDefaultUserCommsPreferences(uid);
    this.preferencesByUid.set(uid, created);
    return created;
  }

  updatePreferences(uid: string, patch: Partial<UserCommsPreferences>): UserCommsPreferences {
    const curr = this.getOrCreatePreferences(uid);
    const nextCategoryRules = (patch.categoryRules ?? curr.categoryRules).map((rule) =>
      rule.category === 'SECURITY' ? { ...rule, inApp: true, email: true, sms: true, lockedMandatory: true } : rule,
    );
    const rawStart = patch.quietHours?.startHourLocal ?? curr.quietHours.startHourLocal;
    const rawEnd = patch.quietHours?.endHourLocal ?? curr.quietHours.endHourLocal;
    const startHourLocal = Number.isInteger(rawStart) && rawStart >= 0 && rawStart <= 23 ? rawStart : curr.quietHours.startHourLocal;
    const endHourLocal = Number.isInteger(rawEnd) && rawEnd >= 0 && rawEnd <= 23 ? rawEnd : curr.quietHours.endHourLocal;

    const next: UserCommsPreferences = {
      ...curr,
      channels: patch.channels ? { ...curr.channels, ...patch.channels } : curr.channels,
      quietHours: {
        enabled: patch.quietHours?.enabled ?? curr.quietHours.enabled,
        timezone: 'Asia/Tehran',
        startHourLocal,
        endHourLocal,
      },
      digestFrequency: patch.digestFrequency ?? curr.digestFrequency,
      categoryRules: nextCategoryRules,
      consents: (patch.consents ?? curr.consents).map((c) => (c.consentType === 'SECURITY_MANDATORY' ? { ...c, granted: true } : c)),
      updatedAtIso: new Date().toISOString(),
    };
    this.preferencesByUid.set(uid, next);
    return next;
  }

  ingestEvent(input: CommunicationEventInput, nowTehranHour = getTehranLocalHour(), externalAdapterReady = false): {
    accepted: boolean; deduplicated: boolean; reasonCode: string | null; notification: NotificationRecord | null; deliveries: DeliveryAttemptRecord[];
  } {
    if (input.transactionCommitted === false) return { accepted: false, deduplicated: false, reasonCode: 'UNCOMMITTED_TRANSACTION', notification: null, deliveries: [] };
    if (input.recipientActive === false) return { accepted: false, deduplicated: false, reasonCode: 'INACTIVE_RECIPIENT', notification: null, deliveries: [] };
    const policy = EVENT_POLICY_REGISTRY[input.eventCode], tpl = COMMS_TEMPLATE_REGISTRY[input.eventCode];
    if (!policy || !tpl || !tpl.active) return { accepted: false, deduplicated: false, reasonCode: 'UNKNOWN_EVENT_OR_INACTIVE_TEMPLATE', notification: null, deliveries: [] };
    const dedupeKey = `${input.idempotencyKey}:${input.recipientUid}:${input.eventCode}`;
    if (this.outboxEventKeys.has(dedupeKey)) return { accepted: true, deduplicated: true, reasonCode: 'IDEMPOTENT_DUPLICATE_SUPPRESSED', notification: null, deliveries: [] };
    this.outboxEventKeys.add(dedupeKey);

    const prefs = this.getOrCreatePreferences(input.recipientUid);
    const activeDevices = this.devices.filter((d) => d.ownerUid === input.recipientUid && d.active).length;
    const { deliverChannels } = resolveEligibleChannels({ eventCode: input.eventCode, prefs, localTehranHour: nowTehranHour, activeDeviceCount: activeDevices });
    const createdAtIso = input.createdAtIso ?? new Date().toISOString();
    const expiresAtIso = policy.expiresInHours ? new Date(Date.parse(createdAtIso) + policy.expiresInHours * 3_600_000).toISOString() : null;

    const notif: NotificationRecord = {
      id: generateSecureId('ntf'), eventId: input.eventId || generateSecureId('evt'),
      idempotencyKey: input.idempotencyKey, recipientUid: input.recipientUid, eventCode: input.eventCode,
      category: policy.category, severity: policy.severity, urgency: policy.urgency, priority: policy.defaultPriority,
      titleFa: renderSafeTemplateText(tpl.titleTemplateFa, input.payload),
      bodyFa: renderSafeTemplateText(tpl.bodyTemplateFa, input.payload),
      shortPreviewFa: renderSafeTemplateText(tpl.shortPreviewFa, input.payload),
      ctaLabelFa: tpl.ctaLabelFa, deepLinkPath: sanitizeInternalDeepLink(input.deepLinkPath),
      targetView: input.targetView ?? 'userspace', targetSubTab: input.targetSubTab ?? 'notifications',
      entityType: input.entityType, entityId: input.entityId, requiresUserAction: policy.requiresUserAction,
      status: 'UNREAD', readAtIso: null, archivedAtIso: null, expiresAtIso, createdAtIso,
    };
    this.notifications.unshift(notif);
    const createdAttempts: DeliveryAttemptRecord[] = deliverChannels.map((ch) => {
      const isInApp = ch === 'IN_APP' || ch === 'INTERNAL_INBOX';
      const status: DeliveryAttemptStatus = isInApp ? 'DELIVERED' : externalAdapterReady ? 'QUEUED' : 'SUPPRESSED_BY_POLICY';
      return {
        attemptId: generateSecureId('dlv'), notificationId: notif.id,
        eventCode: input.eventCode, recipientUid: input.recipientUid, channel: ch, queueName: policy.queueName,
        status, attemptNumber: 1, errorCode: isInApp || externalAdapterReady ? null : 'EXTERNAL_ADAPTER_NOT_CONFIGURED',
        errorClass: null, createdAtIso,
      };
    });
    this.deliveries.unshift(...createdAttempts);
    return { accepted: true, deduplicated: false, reasonCode: null, notification: notif, deliveries: createdAttempts };
  }

  mutateNotificationStatus(notificationId: string, actorUid: string, nextStatus: 'READ' | 'ARCHIVED' | 'DISMISSED'): {
    ok: boolean; statusCode: 200 | 403 | 404; notification?: NotificationRecord;
  } {
    const target = this.notifications.find((n) => n.id === notificationId);
    if (!target) return { ok: false, statusCode: 404 };
    if (target.recipientUid !== actorUid) return { ok: false, statusCode: 403 };
    const now = new Date().toISOString();
    if (nextStatus === 'READ') { target.status = 'READ'; target.readAtIso = target.readAtIso ?? now; }
    else if (nextStatus === 'ARCHIVED') { target.status = 'ARCHIVED'; target.archivedAtIso = target.archivedAtIso ?? now; }
    else target.status = 'DISMISSED';
    return { ok: true, statusCode: 200, notification: target };
  }

  markAllRead(actorUid: string): number {
    const now = new Date().toISOString();
    let count = 0;
    for (const n of this.notifications) {
      if (n.recipientUid === actorUid && n.status === 'UNREAD') { n.status = 'READ'; n.readAtIso = now; count += 1; }
    }
    return count;
  }

  handleDeliveryFailure(params: {
    attemptId: string; errorCode: string; errorClass: 'TRANSIENT' | 'PERMANENT'; maxAttempts?: number; deviceIdToRevoke?: string;
  }): { status: DeliveryAttemptRecord['status']; dlqCreated: boolean } {
    const attempt = this.deliveries.find((d) => d.attemptId === params.attemptId);
    if (!attempt) return { status: 'FAILED_PERMANENT', dlqCreated: false };
    attempt.errorCode = params.errorCode; attempt.errorClass = params.errorClass;
    const maxAttempts = params.maxAttempts ?? 3;
    if (params.errorClass === 'PERMANENT') {
      attempt.status = 'FAILED_PERMANENT';
      if (params.deviceIdToRevoke) {
        const dev = this.devices.find((d) => d.deviceId === params.deviceIdToRevoke);
        if (dev) { dev.active = false; dev.revokedAtIso = new Date().toISOString(); }
      }
      return { status: 'FAILED_PERMANENT', dlqCreated: false };
    }
    if (attempt.attemptNumber < maxAttempts) { attempt.status = 'FAILED_RETRYABLE'; attempt.attemptNumber += 1; return { status: 'FAILED_RETRYABLE', dlqCreated: false }; }
    attempt.status = 'DEAD_LETTERED';
    this.deadLetters.unshift({
      dlqId: generateSecureId('dlq'), attemptId: attempt.attemptId,
      notificationId: attempt.notificationId, eventCode: attempt.eventCode, channel: attempt.channel, recipientUid: attempt.recipientUid,
      reasonCode: params.errorCode, reasonFa: `حداکثر تلاش ناموفق (${params.errorCode})`,
      retryCount: attempt.attemptNumber, replayed: false, replayedAtIso: null, createdAtIso: new Date().toISOString(),
    });
    return { status: 'DEAD_LETTERED', dlqCreated: true };
  }

  replayDeadLetter(dlqId: string, adminUid: string): { ok: boolean; reasonCode?: string } {
    const item = this.deadLetters.find((d) => d.dlqId === dlqId);
    if (!item) return { ok: false, reasonCode: 'DLQ_NOT_FOUND' };
    if (item.replayed) return { ok: true, reasonCode: 'ALREADY_REPLAYED_IDEMPOTENT' };
    const now = new Date().toISOString();
    item.replayed = true; item.replayedAtIso = now;
    this.deliveries.unshift({
      attemptId: generateSecureId('dlv-replay'), notificationId: item.notificationId, eventCode: item.eventCode,
      recipientUid: item.recipientUid, channel: item.channel, queueName: 'comms.retry', status: 'QUEUED',
      attemptNumber: item.retryCount + 1, errorCode: null, errorClass: null, createdAtIso: now,
    });
    this.audits.unshift({
      auditId: generateSecureId('aud'), actorUid: adminUid, actionCode: 'COMMS_DLQ_REPLAY',
      targetType: 'dead_letter', targetId: dlqId, summaryFa: `بازارسال کنترل‌شده رکورد DLQ برای رویداد ${item.eventCode}`, createdAtIso: now,
    });
    return { ok: true };
  }

  createScopedConversation(input: {
    type: ConversationType; contextEntityType: ConversationRecord['contextEntityType']; contextEntityId: string;
    contextTitleFa: string; creatorUid: string; participants: ConversationParticipantRecord[];
  }): { ok: boolean; errorCode?: string; conversation?: ConversationRecord } {
    if (!ALLOWED_DIRECT_CONVERSATION_TYPES.includes(input.type) || !input.contextEntityId.trim()) return { ok: false, errorCode: 'CONTEXT_REQUIRED_NO_OPEN_CHAT' };
    if (!input.participants || input.participants.length < 2) return { ok: false, errorCode: 'PARTICIPANTS_REQUIRED' };
    const existing = this.conversations.find(
      (c) => c.type === input.type && c.contextEntityId === input.contextEntityId && c.participants.some((p) => p.uid === input.creatorUid),
    );
    if (existing) return { ok: true, conversation: existing };
    const now = new Date().toISOString();
    const conv: ConversationRecord = {
      conversationId: generateSecureId('conv'), type: input.type,
      contextEntityType: input.contextEntityType, contextEntityId: sanitizeInput(input.contextEntityId, 64),
      contextTitleFa: sanitizeInput(input.contextTitleFa, 120), status: 'OPEN', participants: input.participants,
      messages: [], createdAtIso: now, updatedAtIso: now,
    };
    this.conversations.unshift(conv);
    return { ok: true, conversation: conv };
  }

  sendMessage(input: {
    conversationId: string; senderUid: string; bodyFa: string; attachments?: MessageAttachmentMeta[];
  }): { ok: boolean; statusCode: 201 | 400 | 403 | 404 | 429; errorCode?: string; message?: MessageRecord } {
    const conv = this.conversations.find((c) => c.conversationId === input.conversationId);
    if (!conv) return { ok: false, statusCode: 404, errorCode: 'CONVERSATION_NOT_FOUND' };
    const sender = conv.participants.find((p) => p.uid === input.senderUid);
    if (!sender) return { ok: false, statusCode: 403, errorCode: 'IDOR_FORBIDDEN_NON_PARTICIPANT' };
    if (sender.blockedOtherParticipant || conv.participants.some((p) => p.uid !== input.senderUid && p.blockedOtherParticipant)) {
      return { ok: false, statusCode: 403, errorCode: 'CONVERSATION_BLOCKED_BY_RECIPIENT' };
    }
    const recentSentCount = conv.messages.filter((m) => m.senderUid === input.senderUid && Date.now() - Date.parse(m.createdAtIso) < 60_000).length;
    if (recentSentCount >= MAX_MESSAGES_PER_MINUTE_STANDARD) return { ok: false, statusCode: 429, errorCode: 'MESSAGE_RATE_LIMIT_EXCEEDED' };
    const cleanBody = sanitizeInput(input.bodyFa, 1200);
    if (cleanBody.length < 2) return { ok: false, statusCode: 400, errorCode: 'EMPTY_OR_UNSAFE_MESSAGE' };
    const safeAttachments = (input.attachments ?? []).filter((a) => ALLOWED_ATTACHMENT_MIMES.has(a.mimeType) && a.sizeBytes > 0 && a.sizeBytes <= MAX_ATTACHMENT_SIZE_BYTES);
    const now = new Date().toISOString();
    const msg: MessageRecord = {
      messageId: generateSecureId('msg'), conversationId: conv.conversationId,
      senderUid: sender.uid, senderType: sender.senderType, senderLabelFa: sender.displayNameFa,
      bodyFa: cleanBody, attachments: safeAttachments, status: 'SENT', readByUids: [sender.uid], createdAtIso: now,
    };
    conv.messages.push(msg); conv.updatedAtIso = now;
    return { ok: true, statusCode: 201, message: msg };
  }

  redactMessage(conversationId: string, messageId: string, adminUid: string, reasonFa: string): boolean {
    const conv = this.conversations.find((c) => c.conversationId === conversationId);
    const msg = conv?.messages.find((m) => m.messageId === messageId);
    if (!msg) return false;
    msg.status = 'REDACTED'; msg.bodyFa = '[این پیام توسط ممیز حاکمیتی مخفی شد]';
    msg.redactedReasonFa = sanitizeInput(reasonFa, 160);
    this.audits.unshift({
      auditId: generateSecureId('aud'), actorUid: adminUid, actionCode: 'COMMS_MESSAGE_REDACTED',
      targetType: 'message', targetId: messageId, summaryFa: `پاکسازی پیام به‌دلیل گزارش تخلف (${msg.redactedReasonFa})`, createdAtIso: new Date().toISOString(),
    });
    return true;
  }
}
