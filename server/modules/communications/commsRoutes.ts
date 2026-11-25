/** @file server/modules/communications/commsRoutes.ts — Hardened Express REST Routes for RT-UI-COMMS-001 */
import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { sanitizeInput } from '../../../src/utils/security';
import { verifyAdminApiAuthorization, verifyAuthenticatedUserHeader } from '../../../src/utils/serverAdminAndTelegramSecurity';
import { recordAbuseSignal } from '../../../src/utils/serverDeliveryAndAbuseGuard';
import { COMMS_TEMPLATE_REGISTRY, EVENT_POLICY_REGISTRY } from '../../../src/features/communications/registries/eventPolicyAndTemplateRegistry';
import type { ConversationRecord, ConversationType, MessageAttachmentMeta, MessageRecord } from '../../../src/features/communications/types/comms.types';
import {
  paginateNotifications,
  scrubCommsAdminStats,
  validateWebPushSubscriptionPayload,
} from './commsRepository';
import {
  ensureServerCommsHydrated,
  persistServerCommsNow,
  serverCommsEngine,
} from './commsStore';

export interface CommunicationsRoutesOptions {
  checkRateLimit?: (ip: string, bucket: 'general', max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
  /**
   * Server-side resolver for non-support conversations. It must load the
   * referenced entity, verify creator access, and return the canonical counterparty UID.
   * Client-supplied counterpartyUid is never an identity source.
   */
  resolveContextCounterpartyUid?: (input: {
    type: ConversationType;
    contextEntityType: ConversationRecord['contextEntityType'];
    contextEntityId: string;
    creatorUid: string;
  }) => Promise<{ uid: string; displayNameFa?: string; contextTitleFa?: string } | null>;
  /** Verifies attachment ownership and returns canonical metadata for this sender. */
  resolveOwnedConversationAttachments?: (uid: string, attachmentIds: string[]) => Promise<MessageAttachmentMeta[]>;
}

const registeredCommsApps = new WeakSet<Express>();

export function registerCommunicationsRoutes(app: Express, options?: CommunicationsRoutesOptions): void {
  if (registeredCommsApps.has(app)) return;
  registeredCommsApps.add(app);
  ensureServerCommsHydrated();

  const getIp = options?.getClientIp ?? ((req: Request) => req.ip || '127.0.0.1');
  const allowRate = options?.checkRateLimit ?? (() => true);

  async function requireUser(req: Request, res: Response): Promise<string | null> {
    if (!allowRate(getIp(req), 'general', 120, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' }); return null;
    }
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      recordAbuseSignal(getIp(req), 'auth_failure');
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return null;
    }
    return auth.uid;
  }

export function toConversationSummary(conversation: ConversationRecord, viewerUid: string) {
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  return {
    conversationId: conversation.conversationId,
    type: conversation.type,
    contextEntityType: conversation.contextEntityType,
    contextEntityId: conversation.contextEntityId,
    contextTitleFa: conversation.contextTitleFa,
    status: conversation.status,
    participants: conversation.participants.map((participant) => ({
      uid: participant.uid,
      displayNameFa: participant.displayNameFa,
      roleLabelFa: participant.roleLabelFa,
      senderType: participant.senderType,
      ...(participant.uid === viewerUid
        ? {
            muted: participant.muted,
            archived: participant.archived,
            blockedOtherParticipant: participant.blockedOtherParticipant,
          }
        : {}),
    })),
    lastMessage: lastMessage
      ? {
          messageId: lastMessage.messageId,
          senderUid: lastMessage.senderUid,
          senderLabelFa: lastMessage.senderLabelFa,
          bodyFa: lastMessage.bodyFa,
          status: lastMessage.status,
          createdAtIso: lastMessage.createdAtIso,
          attachmentCount: lastMessage.attachments.length,
        }
      : null,
    messageCount: conversation.messages.length,
    unreadCount: conversation.messages.filter((message) => !message.readByUids.includes(viewerUid)).length,
    createdAtIso: conversation.createdAtIso,
    updatedAtIso: conversation.updatedAtIso,
  };
}

export function paginateConversationMessages(
  messages: MessageRecord[],
  limit: number,
  beforeMessageId?: string,
): { ok: true; items: MessageRecord[]; hasMore: boolean; nextCursor: string | null } | { ok: false } {
  const beforeIndex = beforeMessageId
    ? messages.findIndex((message) => message.messageId === beforeMessageId)
    : messages.length;
  if (beforeIndex < 0) return { ok: false };
  const startIndex = Math.max(0, beforeIndex - limit);
  return {
    ok: true,
    items: messages.slice(startIndex, beforeIndex),
    hasMore: startIndex > 0,
    nextCursor: startIndex > 0 ? messages[startIndex - 1].messageId : null,
  };
}

  async function requireAdmin(req: Request, res: Response): Promise<string | null> {
    const auth = await verifyAdminApiAuthorization(
      req.headers as Record<string, string | string[] | undefined>,
      process.env,
      { requirePrimaryBootstrapAdmin: true, disallowStaticToken: true },
    );
    if (!auth.authorized) {
      recordAbuseSignal(getIp(req), 'auth_failure');
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return null;
    }
    return auth.actorUid || auth.uid || 'verified-primary-admin';
  }

  app.get('/api/v1/notifications', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
    const categoryFilter = typeof req.query.category === 'string' ? req.query.category.toUpperCase() : '';
    const filtered = serverCommsEngine.notifications.filter(
      (n) => n.recipientUid === uid && (!statusFilter || n.status === statusFilter) && (!categoryFilter || n.category === categoryFilter),
    );
    const paged = paginateNotifications(filtered, {
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 25,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ status: 'ok', ...paged });
  });

  app.get('/api/v1/notifications/unread-count', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const unreadCount = serverCommsEngine.notifications.filter((n) => n.recipientUid === uid && n.status === 'UNREAD').length;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ status: 'ok', unreadCount });
  });

  app.get('/api/v1/notifications/preferences', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ status: 'ok', preferences: serverCommsEngine.getOrCreatePreferences(uid) });
  });

  app.patch('/api/v1/notifications/preferences', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const qh = req.body?.quietHours;
    if (qh && typeof qh === 'object') {
      const sh = Number(qh.startHourLocal);
      const eh = Number(qh.endHourLocal);
      if ((qh.startHourLocal !== undefined && (!Number.isInteger(sh) || sh < 0 || sh > 23)) ||
          (qh.endHourLocal !== undefined && (!Number.isInteger(eh) || eh < 0 || eh > 23))) {
        res.status(400).json({ status: 'error', code: 'INVALID_QUIET_HOURS', messageFa: 'ساعت سکوت باید عدد صحیح بین ۰ تا ۲۳ باشد.' });
        return;
      }
    }
    const updated = serverCommsEngine.updatePreferences(uid, req.body ?? {});
    persistServerCommsNow();
    res.status(200).json({ status: 'ok', preferences: updated });
  });

  app.post('/api/v1/notifications/read-all', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const markedCount = serverCommsEngine.markAllRead(uid);
    persistServerCommsNow();
    res.status(200).json({ status: 'ok', markedCount });
  });

  app.get('/api/v1/notifications/:id', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const found = serverCommsEngine.notifications.find((n) => n.id === req.params.id);
    if (!found) { res.status(404).json({ status: 'error', code: 'NOTIFICATION_NOT_FOUND' }); return; }
    if (found.recipientUid !== uid) { res.status(403).json({ status: 'error', code: 'IDOR_FORBIDDEN' }); return; }
    res.status(200).json({ status: 'ok', item: found });
  });

  app.post('/api/v1/notifications/:id/read', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const result = serverCommsEngine.mutateNotificationStatus(req.params.id, uid, 'READ');
    if (!result.ok) { res.status(result.statusCode).json({ status: 'error' }); return; }
    persistServerCommsNow();
    res.status(200).json({ status: 'ok', item: result.notification });
  });

  app.post('/api/v1/notifications/:id/archive', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const result = serverCommsEngine.mutateNotificationStatus(req.params.id, uid, 'ARCHIVED');
    if (!result.ok) { res.status(result.statusCode).json({ status: 'error' }); return; }
    persistServerCommsNow();
    res.status(200).json({ status: 'ok', item: result.notification });
  });

  app.post('/api/v1/notifications/:id/dismiss', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const result = serverCommsEngine.mutateNotificationStatus(req.params.id, uid, 'DISMISSED');
    if (!result.ok) { res.status(result.statusCode).json({ status: 'error' }); return; }
    persistServerCommsNow();
    res.status(200).json({ status: 'ok', item: result.notification });
  });

  app.get('/api/v1/conversations', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const rawLimit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (!Number.isInteger(rawLimit) || rawLimit < 1) {
      res.status(400).json({ status: 'error', code: 'INVALID_PAGE_LIMIT' });
      return;
    }
    const limit = Math.min(rawLimit, 100);
    const cursor = req.query.before === undefined ? '' : sanitizeInput(String(req.query.before), 120);
    const conversations = serverCommsEngine.conversations
      .filter((conversation) => conversation.participants.some((participant) => participant.uid === uid))
      .sort((a, b) => Date.parse(b.updatedAtIso) - Date.parse(a.updatedAtIso));
    const beforeIndex = cursor ? conversations.findIndex((conversation) => conversation.conversationId === cursor) : conversations.length;
    if (beforeIndex < 0) {
      res.status(400).json({ status: 'error', code: 'INVALID_CONVERSATION_CURSOR' });
      return;
    }
    const startIndex = Math.max(0, beforeIndex - limit);
    const page = conversations.slice(startIndex, beforeIndex);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      status: 'ok',
      items: page.map((conversation) => toConversationSummary(conversation, uid)),
      hasMore: startIndex > 0,
      nextCursor: startIndex > 0 ? conversations[startIndex - 1].conversationId : null,
      limit,
    });
  });

  app.post('/api/v1/conversations', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const rawType = req.body?.type === undefined ? 'SUPPORT' : String(req.body.type);
    const allowedTypes: readonly ConversationType[] = ['SUPPORT', 'LISTING_INQUIRY', 'SERVICE_REQUEST', 'ADMIN_CASE'];
    if (!allowedTypes.includes(rawType as ConversationType)) {
      res.status(400).json({ status: 'error', code: 'INVALID_CONVERSATION_TYPE' });
      return;
    }
    const convType = rawType as ConversationType;
    const expectedContextType: Record<Exclude<ConversationType, 'SYSTEM_CONVERSATION'>, ConversationRecord['contextEntityType']> = {
      SUPPORT: 'support_ticket',
      LISTING_INQUIRY: 'listing',
      SERVICE_REQUEST: 'service_request',
      ADMIN_CASE: 'admin_case',
    };
    const contextEntityType = expectedContextType[convType as Exclude<ConversationType, 'SYSTEM_CONVERSATION'>];
    const suppliedContextType = req.body?.contextEntityType === undefined
      ? contextEntityType
      : String(req.body.contextEntityType);
    const contextEntityId = sanitizeInput(String(req.body?.contextEntityId || ''), 64).trim();
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(contextEntityId) || suppliedContextType !== contextEntityType) {
      res.status(400).json({ status: 'error', code: 'INVALID_CONVERSATION_CONTEXT', messageFa: 'نوع یا شناسه پرونده معتبر نیست.' });
      return;
    }

    let counterparty: { uid: string; displayNameFa?: string; contextTitleFa?: string } | null = null;
    if (convType === 'SUPPORT') {
      counterparty = { uid: 'support-desk', displayNameFa: 'پشتیبانی رادار' };
      const requestedCounterparty = sanitizeInput(String(req.body?.counterpartyUid || ''), 64).trim();
      if (requestedCounterparty && requestedCounterparty !== counterparty.uid) {
        res.status(403).json({ status: 'error', code: 'COUNTERPARTY_MISMATCH' });
        return;
      }
    } else {
      if (!options?.resolveContextCounterpartyUid) {
        res.status(503).json({ status: 'error', code: 'CONTEXT_OWNER_RESOLVER_UNAVAILABLE' });
        return;
      }
      try {
        counterparty = await options.resolveContextCounterpartyUid({
          type: convType,
          contextEntityType,
          contextEntityId,
          creatorUid: uid,
        });
      } catch {
        res.status(503).json({ status: 'error', code: 'CONTEXT_OWNER_LOOKUP_FAILED' });
        return;
      }
      if (!counterparty?.uid || counterparty.uid === uid) {
        res.status(403).json({ status: 'error', code: 'CONTEXT_ACCESS_FORBIDDEN' });
        return;
      }
      const requestedCounterparty = sanitizeInput(String(req.body?.counterpartyUid || ''), 64).trim();
      if (requestedCounterparty && requestedCounterparty !== counterparty.uid) {
        res.status(403).json({ status: 'error', code: 'COUNTERPARTY_MISMATCH' });
        return;
      }
    }

    const result = serverCommsEngine.createScopedConversation({
      type: convType,
      contextEntityType,
      contextEntityId,
      contextTitleFa: counterparty.contextTitleFa
        ? sanitizeInput(counterparty.contextTitleFa, 120)
        : convType === 'SUPPORT'
          ? sanitizeInput(String(req.body?.contextTitleFa || 'گفت‌وگوی مرتبط با پرونده'), 120)
          : 'گفت‌وگوی مرتبط با پرونده',
      creatorUid: uid,
      participants: [
        { uid, displayNameFa: 'کاربر احرازشده', roleLabelFa: 'عضو', senderType: 'USER', muted: false, archived: false, blockedOtherParticipant: false },
        {
          uid: counterparty.uid,
          displayNameFa: convType === 'SUPPORT' ? 'پشتیبانی رادار' : sanitizeInput(String(counterparty.displayNameFa || 'طرف پرونده'), 64),
          roleLabelFa: convType === 'SUPPORT' ? 'کارشناس پشتیبانی' : 'طرف پرونده',
          senderType: convType === 'SUPPORT' ? 'SUPPORT_AGENT' : 'USER',
          muted: false, archived: false, blockedOtherParticipant: false,
        },
      ],
    });
    if (!result.ok) { res.status(400).json({ status: 'error', code: result.errorCode }); return; }
    persistServerCommsNow();
    res.status(201).json({ status: 'ok', conversation: toConversationSummary(result.conversation!, uid) });
  });

  app.get('/api/v1/conversations/:id', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const conv = serverCommsEngine.conversations.find((c) => c.conversationId === req.params.id);
    if (!conv) { res.status(404).json({ status: 'error', code: 'CONVERSATION_NOT_FOUND' }); return; }
    if (!conv.participants.some((p) => p.uid === uid)) { res.status(403).json({ status: 'error', code: 'IDOR_FORBIDDEN' }); return; }
    res.status(200).json({ status: 'ok', conversation: toConversationSummary(conv, uid) });
  });

  app.get('/api/v1/conversations/:id/messages', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const conv = serverCommsEngine.conversations.find((c) => c.conversationId === req.params.id);
    if (!conv) { res.status(404).json({ status: 'error', code: 'CONVERSATION_NOT_FOUND' }); return; }
    if (!conv.participants.some((p) => p.uid === uid)) { res.status(403).json({ status: 'error', code: 'IDOR_FORBIDDEN' }); return; }
    const rawLimit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (!Number.isInteger(rawLimit) || rawLimit < 1) {
      res.status(400).json({ status: 'error', code: 'INVALID_PAGE_LIMIT' });
      return;
    }
    const limit = Math.min(rawLimit, 100);
    const beforeMessageId = req.query.before === undefined ? undefined : sanitizeInput(String(req.query.before), 120);
    const page = paginateConversationMessages(conv.messages, limit, beforeMessageId);
    if (!page.ok) {
      res.status(400).json({ status: 'error', code: 'INVALID_MESSAGE_CURSOR' });
      return;
    }
    res.status(200).json({ status: 'ok', ...page, limit });
  });

  app.post('/api/v1/conversations/:id/messages', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const requestedAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    if (requestedAttachments.length > 5 || requestedAttachments.some((item: unknown) => !item || typeof item !== 'object' || typeof (item as any).attachmentId !== 'string')) {
      res.status(400).json({ status: 'error', code: 'INVALID_ATTACHMENT_METADATA' });
      return;
    }
    let verifiedAttachments: MessageAttachmentMeta[] = [];
    if (requestedAttachments.length > 0) {
      if (!options?.resolveOwnedConversationAttachments) {
        res.status(503).json({ status: 'error', code: 'ATTACHMENT_OWNERSHIP_RESOLVER_UNAVAILABLE' });
        return;
      }
      const attachmentIds = requestedAttachments.map((item: any) => sanitizeInput(item.attachmentId, 120));
      if (attachmentIds.some((id: string) => !/^[A-Za-z0-9_-]{1,120}$/.test(id)) || new Set(attachmentIds).size !== attachmentIds.length) {
        res.status(400).json({ status: 'error', code: 'INVALID_ATTACHMENT_IDS' });
        return;
      }
      try {
        verifiedAttachments = await options.resolveOwnedConversationAttachments(uid, attachmentIds);
      } catch {
        res.status(503).json({ status: 'error', code: 'ATTACHMENT_OWNERSHIP_LOOKUP_FAILED' });
        return;
      }
      const verifiedIds = new Set(verifiedAttachments.map((item) => item.attachmentId));
      if (verifiedAttachments.length !== attachmentIds.length || attachmentIds.some((id: string) => !verifiedIds.has(id))) {
        res.status(403).json({ status: 'error', code: 'ATTACHMENT_OWNERSHIP_FORBIDDEN' });
        return;
      }
    }
    const result = serverCommsEngine.sendMessage({
      conversationId: req.params.id, senderUid: uid, bodyFa: String(req.body?.bodyFa || ''),
      attachments: verifiedAttachments,
    });
    if (!result.ok) { res.status(result.statusCode).json({ status: 'error', code: result.errorCode }); return; }
    persistServerCommsNow();
    res.status(201).json({ status: 'ok', message: result.message });
  });

  app.post('/api/v1/conversations/:id/read', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const conv = serverCommsEngine.conversations.find((c) => c.conversationId === req.params.id);
    if (!conv || !conv.participants.some((p) => p.uid === uid)) { res.status(403).json({ status: 'error', code: 'IDOR_FORBIDDEN' }); return; }
    conv.messages.forEach((m) => { if (!m.readByUids.includes(uid)) { m.readByUids.push(uid); m.status = 'READ'; } });
    persistServerCommsNow();
    res.status(200).json({ status: 'ok' });
  });

  app.post(['/api/v1/conversations/:id/mute', '/api/v1/conversations/:id/archive', '/api/v1/conversations/:id/block'], async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const conv = serverCommsEngine.conversations.find((c) => c.conversationId === req.params.id);
    const participant = conv?.participants.find((p) => p.uid === uid);
    if (!conv || !participant) { res.status(403).json({ status: 'error', code: 'IDOR_FORBIDDEN' }); return; }
    if (req.path.endsWith('/mute')) participant.muted = req.body?.muted !== false;
    else if (req.path.endsWith('/archive')) participant.archived = req.body?.archived !== false;
    else if (req.path.endsWith('/block')) participant.blockedOtherParticipant = req.body?.blocked !== false;
    persistServerCommsNow();
    res.status(200).json({ status: 'ok', participant });
  });

  app.post('/api/v1/conversations/:id/report', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const conv = serverCommsEngine.conversations.find((c) => c.conversationId === req.params.id);
    if (!conv || !conv.participants.some((p) => p.uid === uid)) { res.status(403).json({ status: 'error', code: 'IDOR_FORBIDDEN' }); return; }
    const messageId = typeof req.body?.messageId === 'string' && req.body.messageId.trim() ? req.body.messageId.trim() : undefined;
    if (messageId && !conv.messages.some((m) => m.messageId === messageId)) {
      res.status(400).json({ status: 'error', code: 'INVALID_MESSAGE_ID' }); return;
    }
    const alreadyReported = serverCommsEngine.reports.some(
      (r) => r.conversationId === conv.conversationId && r.reporterUid === uid && r.messageId === messageId,
    );
    if (alreadyReported) { res.status(409).json({ status: 'error', code: 'DUPLICATE_REPORT' }); return; }
    const report = {
      reportId: `rep-${crypto.randomUUID().slice(0, 10)}`, conversationId: conv.conversationId, messageId,
      reporterUid: uid, reasonFa: sanitizeInput(String(req.body?.reasonFa || 'گزارش نقض قوانین ارتباطی'), 200),
      status: 'PENDING' as const, createdAtIso: new Date().toISOString(),
    };
    serverCommsEngine.reports.unshift(report);
    persistServerCommsNow();
    res.status(201).json({ status: 'ok', report });
  });

  app.post('/api/v1/conversations/:id/participants', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const conv = serverCommsEngine.conversations.find((c) => c.conversationId === req.params.id);
    if (!conv || !conv.participants.some((p) => p.uid === uid)) { res.status(403).json({ status: 'error', code: 'IDOR_FORBIDDEN' }); return; }
    res.status(200).json({ status: 'ok', participants: conv.participants });
  });

  app.get('/api/v1/devices', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    res.status(200).json({ status: 'ok', items: serverCommsEngine.devices.filter((d) => d.ownerUid === uid) });
  });

  app.post('/api/v1/devices/register', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const validated = validateWebPushSubscriptionPayload(req.body);
    if (!validated.valid || !validated.tokenMasked) {
      res.status(400).json({ status: 'error', code: validated.errorCode || 'INVALID_PUSH_SUBSCRIPTION', messageFa: 'توکن معتبر Web Push یا کلید اشتراک مرورگر ارسال نشده است.' });
      return;
    }
    const rec = {
      deviceId: `dev-${crypto.randomUUID().slice(0, 10)}`, ownerUid: uid, platform: validated.platform,
      labelFa: sanitizeInput(validated.labelFa, 60), tokenMasked: validated.tokenMasked,
      active: true, registeredAtIso: new Date().toISOString(), revokedAtIso: null,
    };
    serverCommsEngine.devices.unshift(rec);
    persistServerCommsNow();
    res.status(201).json({ status: 'ok', device: rec });
  });

  app.post('/api/v1/devices/revoke', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const dev = serverCommsEngine.devices.find((d) => d.deviceId === req.body?.deviceId && d.ownerUid === uid);
    if (!dev) { res.status(404).json({ status: 'error', code: 'DEVICE_NOT_FOUND' }); return; }
    dev.active = false; dev.revokedAtIso = new Date().toISOString();
    persistServerCommsNow();
    res.status(200).json({ status: 'ok', device: dev });
  });

  app.delete('/api/v1/devices/:deviceId', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res); if (!uid) return;
    const idx = serverCommsEngine.devices.findIndex((d) => d.deviceId === req.params.deviceId && d.ownerUid === uid);
    if (idx === -1) { res.status(404).json({ status: 'error', code: 'DEVICE_NOT_FOUND' }); return; }
    serverCommsEngine.devices.splice(idx, 1);
    persistServerCommsNow();
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/admin/communications/overview', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      status: 'ok',
      totals: {
        notifications: serverCommsEngine.notifications.length,
        deliveries: serverCommsEngine.deliveries.length,
        deadLettersPending: serverCommsEngine.deadLetters.filter((d) => !d.replayed).length,
        pendingReports: serverCommsEngine.reports.filter((r) => r.status === 'PENDING').length,
        ...scrubCommsAdminStats(serverCommsEngine.conversations),
      },
      channelAdapters: {
        IN_APP: 'ACTIVE', INTERNAL_INBOX: 'ACTIVE',
        PUSH: serverCommsEngine.devices.some((d) => d.active) ? 'READY_WEB_PUSH' : 'NO_ACTIVE_SUBSCRIPTIONS',
        EMAIL: process.env.SMTP_HOST ? 'CONFIGURED' : 'NOT_CONFIGURED',
        SMS: process.env.SMS_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
      },
    });
  });

  app.get('/api/admin/communications/deliveries', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    res.status(200).json({ status: 'ok', items: serverCommsEngine.deliveries.slice(0, 100) });
  });

  app.get('/api/admin/communications/queues', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    res.status(200).json({
      status: 'ok',
      queues: [
        { name: 'comms.critical', pendingCount: serverCommsEngine.deliveries.filter((d) => d.queueName === 'comms.critical' && d.status === 'QUEUED').length, healthStatus: 'ONLINE' },
        { name: 'comms.transactional', pendingCount: serverCommsEngine.deliveries.filter((d) => d.queueName === 'comms.transactional' && d.status === 'QUEUED').length, healthStatus: 'ONLINE' },
        { name: 'comms.standard', pendingCount: serverCommsEngine.deliveries.filter((d) => d.queueName === 'comms.standard' && d.status === 'QUEUED').length, healthStatus: 'ONLINE' },
        { name: 'comms.digest', pendingCount: serverCommsEngine.deliveries.filter((d) => d.queueName === 'comms.digest' && d.status === 'QUEUED').length, healthStatus: 'ONLINE' },
        { name: 'comms.retry', pendingCount: serverCommsEngine.deliveries.filter((d) => d.status === 'FAILED_RETRYABLE').length, healthStatus: 'ONLINE' },
        { name: 'comms.dead-letter', pendingCount: serverCommsEngine.deadLetters.filter((d) => !d.replayed).length, healthStatus: serverCommsEngine.deadLetters.some((d) => !d.replayed) ? 'ATTENTION_REQUIRED' : 'CLEAR' },
      ],
      deadLetters: serverCommsEngine.deadLetters,
    });
  });

  app.post('/api/admin/communications/dlq/replay', async (req: Request, res: Response) => {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const result = serverCommsEngine.replayDeadLetter(String(req.body?.dlqId || ''), admin);
    if (!result.ok) { res.status(404).json({ status: 'error', code: result.reasonCode }); return; }
    persistServerCommsNow();
    res.status(200).json({ status: 'ok', reasonCode: result.reasonCode || 'REPLAYED' });
  });

  app.get('/api/admin/communications/templates', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    res.status(200).json({ status: 'ok', templates: Object.values(COMMS_TEMPLATE_REGISTRY) });
  });

  app.get('/api/admin/communications/policies', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    res.status(200).json({ status: 'ok', policies: Object.values(EVENT_POLICY_REGISTRY) });
  });

  app.get('/api/admin/communications/reports', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    res.status(200).json({ status: 'ok', items: serverCommsEngine.reports });
  });

  app.get('/api/admin/communications/audit', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    res.status(200).json({ status: 'ok', items: serverCommsEngine.audits });
  });
}
