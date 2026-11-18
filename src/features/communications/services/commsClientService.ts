/** @file src/features/communications/services/commsClientService.ts — Client Communications State & Sync Bridge (< 260 lines) */
import { readAccountJson, writeAccountJson, updateNotificationChannels } from '../../account/services/accountSettingsStorageService';
import { CommsCoreStateEngine, createDefaultUserCommsPreferences } from './commsEngine';
import type {
  CommsAbuseReportRecord, CommsAuditRecord, CommsCategoryCode, ConversationRecord,
  DeadLetterRecord, DeliveryAttemptRecord, DeviceTokenRecord, NotificationRecord, UserCommsPreferences,
} from '../types/comms.types';

const COMMS_STATE_KEY = 'radar_comms_workspace_v1';

export interface PersistedCommsWorkspace {
  notifications: NotificationRecord[];
  preferences: UserCommsPreferences;
  devices: DeviceTokenRecord[];
  conversations: ConversationRecord[];
  deliveries: DeliveryAttemptRecord[];
  deadLetters: DeadLetterRecord[];
  reports: CommsAbuseReportRecord[];
  audits: CommsAuditRecord[];
}

function buildInitialSeedState(uid = 'local-user'): PersistedCommsWorkspace {
  const nowMs = Date.now();
  const isoAgo = (hours: number) => new Date(nowMs - hours * 3_600_000).toISOString();
  const engine = new CommsCoreStateEngine();
  engine.devices = [{
    deviceId: 'dev-web-primary', ownerUid: uid, platform: 'WEB_PUSH',
    labelFa: 'مرورگر فعلی دسکتاپ', tokenMasked: 'wp_••••_84f2', active: true, registeredAtIso: isoAgo(72), revokedAtIso: null,
  }];

  const seededEvents = [
    {
      idempotencyKey: 'seed-sec-login-1', eventCode: 'SECURITY.NEW_LOGIN' as const, recipientUid: uid,
      payload: { deviceSummary: 'مرورگر وب در تهران (IP محدوده غرب)' },
      deepLinkPath: '/account/settings', targetView: 'userspace' as const, targetSubTab: 'settings' as const, createdAtIso: isoAgo(1),
    },
    {
      idempotencyKey: 'seed-srv-prop-1', eventCode: 'SERVICE.PROPOSAL_RECEIVED' as const, recipientUid: uid,
      payload: { providerName: 'کارشناس مهندس کاظمی', offeringTitle: 'کارشناسی فنی و بازدید تأسیسات', priceFa: '۲.۸ میلیون تومان' },
      deepLinkPath: '/services', targetView: 'services' as const, entityType: 'service_request', entityId: 'srv-req-104', createdAtIso: isoAgo(3),
    },
    {
      idempotencyKey: 'seed-val-ready-1', eventCode: 'VALUATION.REPORT_READY' as const, recipientUid: uid,
      payload: { hoodName: 'سعادت‌آباد', rangeFa: '۱۶.۴ تا ۱۷.۸ میلیارد تومان', modelVersion: 'Hedonic v1405.1' },
      deepLinkPath: '/tools/valuation', targetView: 'tools' as const, targetSubTab: 'valuation' as const, createdAtIso: isoAgo(26),
    },
    {
      idempotencyKey: 'seed-comm-rep-1', eventCode: 'COMMUNITY.REPLY_RECEIVED' as const, recipientUid: uid,
      payload: { threadTitle: 'وضعیت دسترسی مترو و ترافیک خیابان سرو', authorName: 'مهشید (ساکن)', hoodName: 'سعادت‌آباد' },
      deepLinkPath: '/community/discussions', targetView: 'contributions' as const, targetSubTab: 'discussions' as const, createdAtIso: isoAgo(52),
    },
    {
      idempotencyKey: 'seed-contrib-app-1', eventCode: 'CONTRIBUTION.PROPOSAL_APPROVED' as const, recipientUid: uid,
      payload: { hoodName: 'پونک', versionId: 'DATA-V1405.08' },
      deepLinkPath: '/community/contributions', targetView: 'contributions' as const, targetSubTab: 'contributions' as const, createdAtIso: isoAgo(120),
    },
  ];
  for (const ev of seededEvents) engine.ingestEvent(ev, 14);
  if (engine.notifications[3]) { engine.notifications[3].status = 'READ'; engine.notifications[3].readAtIso = isoAgo(48); }
  if (engine.notifications[4]) { engine.notifications[4].status = 'READ'; engine.notifications[4].readAtIso = isoAgo(100); }

  engine.deliveries.push({
    attemptId: 'dlv-seed-fail-1', notificationId: engine.notifications[1]?.id || 'ntf-seed-2',
    eventCode: 'SERVICE.PROPOSAL_RECEIVED', recipientUid: uid, channel: 'SMS', queueName: 'comms.dead-letter',
    status: 'DEAD_LETTERED', attemptNumber: 3, errorCode: 'SMS_GATEWAY_TIMEOUT', errorClass: 'TRANSIENT', createdAtIso: isoAgo(2),
  });
  engine.deadLetters.push({
    dlqId: 'dlq-seed-1', attemptId: 'dlv-seed-fail-1', notificationId: engine.notifications[1]?.id || 'ntf-seed-2',
    eventCode: 'SERVICE.PROPOSAL_RECEIVED', channel: 'SMS', recipientUid: uid,
    reasonCode: 'SMS_GATEWAY_TIMEOUT', reasonFa: 'انقضای مهلت پاسخ اپراتور پیامک (قابل ارسال مجدد)',
    retryCount: 3, replayed: false, replayedAtIso: null, createdAtIso: isoAgo(2),
  });

  const conv1 = engine.createScopedConversation({
    type: 'SERVICE_REQUEST', contextEntityType: 'service_request', contextEntityId: 'srv-req-104',
    contextTitleFa: 'کارشناسی فنی واحد ۹۵ متری · سعادت‌آباد', creatorUid: uid,
    participants: [
      { uid, displayNameFa: 'شما (درخواست‌دهنده)', roleLabelFa: 'متقاضی خدمت', senderType: 'USER', muted: false, archived: false, blockedOtherParticipant: false },
      { uid: 'provider-kazemi', displayNameFa: 'مهندس کاظمی', roleLabelFa: 'کارشناس فنی', senderType: 'USER', muted: false, archived: false, blockedOtherParticipant: false },
    ],
  });
  if (conv1.conversation) {
    conv1.conversation.messages.push(
      {
        messageId: 'msg-seed-1', conversationId: conv1.conversation.conversationId, senderUid: 'system',
        senderType: 'SYSTEM', senderLabelFa: 'پیام سامانه',
        bodyFa: 'گفت‌وگوی مرتبط با پرونده کارشناسی srv-req-104 باز شد. شماره تماس فقط با رضایت شما نمایش داده می‌شود.',
        attachments: [], status: 'DELIVERED', readByUids: [uid], createdAtIso: isoAgo(4),
      },
      {
        messageId: 'msg-seed-2', conversationId: conv1.conversation.conversationId, senderUid: 'provider-kazemi',
        senderType: 'USER', senderLabelFa: 'مهندس کاظمی',
        bodyFa: 'سلام، فردا بین ساعت ۱۰ تا ۱۲ امکان بازدید فنی و بررسی کنتورها و فشار آب در سعادت‌آباد را دارم.',
        attachments: [], status: 'DELIVERED', readByUids: [], createdAtIso: isoAgo(2),
      },
    );
  }
  const conv2 = engine.createScopedConversation({
    type: 'LISTING_INQUIRY', contextEntityType: 'listing', contextEntityId: 'lst-208',
    contextTitleFa: 'استعلام فایل آپارتمان ۱۱۰ متری · پونک', creatorUid: uid,
    participants: [
      { uid, displayNameFa: 'شما (خریدار)', roleLabelFa: 'خریدار', senderType: 'USER', muted: false, archived: false, blockedOtherParticipant: false },
      { uid: 'owner-rahimi', displayNameFa: 'آقای رحیمی', roleLabelFa: 'ثبت‌کننده فایل', senderType: 'USER', muted: false, archived: false, blockedOtherParticipant: false },
    ],
  });
  if (conv2.conversation) {
    conv2.conversation.messages.push({
      messageId: 'msg-seed-3', conversationId: conv2.conversation.conversationId, senderUid: 'owner-rahimi',
      senderType: 'USER', senderLabelFa: 'آقای رحیمی',
      bodyFa: 'سند تک‌برگ آماده انتقال است و پارکینگ سندی در طبقه همکف قرار دارد.',
      attachments: [], status: 'READ', readByUids: [uid, 'owner-rahimi'], createdAtIso: isoAgo(28),
    });
  }

  return {
    notifications: engine.notifications, preferences: createDefaultUserCommsPreferences(uid),
    devices: engine.devices, conversations: engine.conversations,
    deliveries: engine.deliveries, deadLetters: engine.deadLetters, reports: [],
    audits: [{
      auditId: 'aud-seed-1', actorUid: 'system-policy-guard', actionCode: 'POLICY_SECURITY_LOCKED',
      targetType: 'policy', targetId: 'SECURITY.*',
      summaryFa: 'تضمین ارسال اجباری هشدارهای امنیتی فارغ از تنظیمات کاربر', createdAtIso: isoAgo(24),
    }],
  };
}

function emitCommsUpdate(): void {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent('radar:comms-updated')); } catch { /* ignore */ }
}

export function loadCommsWorkspaceState(uid = 'local-user'): PersistedCommsWorkspace {
  const loaded = readAccountJson<PersistedCommsWorkspace | null>(COMMS_STATE_KEY, null);
  if (loaded && Array.isArray(loaded.notifications) && loaded.preferences) return loaded;
  const seeded = buildInitialSeedState(uid);
  writeAccountJson(COMMS_STATE_KEY, seeded);
  return seeded;
}

function saveCommsWorkspaceState(state: PersistedCommsWorkspace): PersistedCommsWorkspace {
  writeAccountJson(COMMS_STATE_KEY, state); emitCommsUpdate(); return state;
}

export function getUnreadNotificationsCount(uid = 'local-user'): number {
  return loadCommsWorkspaceState(uid).notifications.filter((n) => n.status === 'UNREAD').length;
}

export function markCommsNotificationStatus(id: string, status: 'READ' | 'ARCHIVED' | 'DISMISSED', uid = 'local-user'): PersistedCommsWorkspace {
  const state = loadCommsWorkspaceState(uid);
  const now = new Date().toISOString();
  state.notifications = state.notifications.map((n) =>
    n.id !== id
      ? n
      : { ...n, status, readAtIso: status === 'READ' ? (n.readAtIso ?? now) : n.readAtIso, archivedAtIso: status === 'ARCHIVED' ? (n.archivedAtIso ?? now) : n.archivedAtIso },
  );
  return saveCommsWorkspaceState(state);
}

export function markAllCommsNotificationsRead(uid = 'local-user'): PersistedCommsWorkspace {
  const state = loadCommsWorkspaceState(uid);
  const now = new Date().toISOString();
  state.notifications = state.notifications.map((n) => (n.status === 'UNREAD' ? { ...n, status: 'READ', readAtIso: now } : n));
  return saveCommsWorkspaceState(state);
}

export function updateCommsPreferencesClient(patch: Partial<UserCommsPreferences>, uid = 'local-user'): PersistedCommsWorkspace {
  const state = loadCommsWorkspaceState(uid);
  const engine = new CommsCoreStateEngine();
  engine.preferencesByUid.set(uid, state.preferences);
  const updated = engine.updatePreferences(uid, patch);
  state.preferences = updated;
  updateNotificationChannels({ inApp: updated.channels.inApp, email: updated.channels.email, sms: updated.channels.sms, browserPush: updated.channels.push });
  return saveCommsWorkspaceState(state);
}

export function toggleCategoryChannelRule(
  category: CommsCategoryCode, channelKey: 'inApp' | 'email' | 'sms' | 'push', value: boolean, uid = 'local-user',
): PersistedCommsWorkspace {
  const state = loadCommsWorkspaceState(uid);
  if (category === 'SECURITY') return state;
  const nextRules = state.preferences.categoryRules.map((r) => (r.category === category ? { ...r, [channelKey]: value } : r));
  return updateCommsPreferencesClient({ categoryRules: nextRules }, uid);
}

export function registerOrRevokeDeviceClient(action: 'register' | 'revoke', labelOrId: string, uid = 'local-user'): PersistedCommsWorkspace {
  const state = loadCommsWorkspaceState(uid);
  if (action === 'register') {
    state.devices.unshift({
      deviceId: `dev-${Date.now()}`, ownerUid: uid, platform: 'WEB_PUSH',
      labelFa: labelOrId || 'دستگاه وب جدید', tokenMasked: `wp_••••_${Math.random().toString(36).slice(2, 6)}`,
      active: true, registeredAtIso: new Date().toISOString(), revokedAtIso: null,
    });
  } else {
    state.devices = state.devices.map((d) => (d.deviceId === labelOrId ? { ...d, active: false, revokedAtIso: new Date().toISOString() } : d));
  }
  return saveCommsWorkspaceState(state);
}

export function sendScopedConversationMessage(
  conversationId: string, bodyFa: string, uid = 'local-user',
): { ok: boolean; errorFa?: string; state: PersistedCommsWorkspace } {
  const safeUid = String(uid ?? '').trim();
  if (!safeUid || safeUid === 'system' || safeUid === 'admin-spoof') {
    return { ok: false, errorFa: 'ارسال پیام نیازمند شناسه نشست معتبر کاربر است.', state: loadCommsWorkspaceState('local-user') };
  }
  const state = loadCommsWorkspaceState(safeUid);
  const engine = new CommsCoreStateEngine();
  engine.conversations = state.conversations;
  const res = engine.sendMessage({ conversationId, senderUid: safeUid, bodyFa });
  if (!res.ok) {
    return {
      ok: false,
      errorFa: res.errorCode === 'CONVERSATION_BLOCKED_BY_RECIPIENT'
        ? 'امکان ارسال پیام در گفت‌وگوی مسدودشده وجود ندارد.'
        : res.errorCode === 'MESSAGE_RATE_LIMIT_EXCEEDED'
          ? 'تعداد پیام ارسالی در دقیقه بیش از حد مجاز است.'
          : 'متن پیام باید معتبر و حداقل ۲ کاراکتر باشد.',
      state,
    };
  }
  state.conversations = engine.conversations;
  return { ok: true, state: saveCommsWorkspaceState(state) };
}

export function mutateConversationControl(
  conversationId: string, action: 'mute' | 'archive' | 'block' | 'mark_read' | 'report', uid = 'local-user', reasonFa?: string,
): PersistedCommsWorkspace {
  const state = loadCommsWorkspaceState(uid);
  state.conversations = state.conversations.map((c) => {
    if (c.conversationId !== conversationId) return c;
    const nextParticipants = c.participants.map((p) => {
      if (p.uid !== uid) return p;
      if (action === 'mute') return { ...p, muted: !p.muted };
      if (action === 'archive') return { ...p, archived: !p.archived };
      if (action === 'block') return { ...p, blockedOtherParticipant: !p.blockedOtherParticipant };
      return p;
    });
    const nextMessages = action === 'mark_read'
      ? c.messages.map((m) => (m.readByUids.includes(uid) ? m : { ...m, status: 'READ' as const, readByUids: [...m.readByUids, uid] }))
      : c.messages;
    return { ...c, participants: nextParticipants, messages: nextMessages };
  });
  if (action === 'report' && reasonFa) {
    state.reports.unshift({ reportId: `rep-msg-${Date.now()}`, conversationId, reporterUid: uid, reasonFa, status: 'PENDING', createdAtIso: new Date().toISOString() });
  }
  return saveCommsWorkspaceState(state);
}

export function replayDeadLetterClient(dlqId: string, adminUid = 'admin-operator'): PersistedCommsWorkspace {
  const state = loadCommsWorkspaceState();
  const engine = new CommsCoreStateEngine();
  engine.deadLetters = state.deadLetters; engine.deliveries = state.deliveries; engine.audits = state.audits;
  engine.replayDeadLetter(dlqId, adminUid);
  state.deadLetters = engine.deadLetters; state.deliveries = engine.deliveries; state.audits = engine.audits;
  return saveCommsWorkspaceState(state);
}
