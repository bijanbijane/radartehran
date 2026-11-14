/** @file server/modules/communications/commsRoutes.ts — Express REST Routes for RT-UI-COMMS-001 */
import type { Express, Request, Response } from 'express';
import { sanitizeInput } from '../../../src/utils/security';
import { verifyAdminApiAuthorization, verifyAuthenticatedUserHeader } from '../../../src/utils/serverAdminAndTelegramSecurity';
import { recordAbuseSignal } from '../../../src/utils/serverDeliveryAndAbuseGuard';
import {
  COMMS_TEMPLATE_REGISTRY,
  EVENT_POLICY_REGISTRY,
} from '../../../src/features/communications/registries/eventPolicyAndTemplateRegistry';
import type { ConversationType } from '../../../src/features/communications/types/comms.types';
import { ensureServerCommsSeeded, serverCommsEngine } from './commsStore';

export interface CommunicationsRoutesOptions {
  checkRateLimit?: (ip: string, bucket: 'general', max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
}

const registeredCommsApps = new WeakSet<Express>();

export function registerCommunicationsRoutes(app: Express, options?: CommunicationsRoutesOptions): void {
  if (registeredCommsApps.has(app)) return;
  registeredCommsApps.add(app);
  ensureServerCommsSeeded();

  const getIp = options?.getClientIp ?? ((req: Request) => req.ip || '127.0.0.1');
  const allowRate = options?.checkRateLimit ?? (() => true);

  async function requireUser(req: Request, res: Response): Promise<string | null> {
    if (!allowRate(getIp(req), 'general', 120, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return null;
    }
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      recordAbuseSignal(getIp(req), 'auth_failure');
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
      return null;
    }
    return auth.uid;
  }

  async function requireAdmin(req: Request, res: Response): Promise<string | null> {
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) {
      recordAbuseSignal(getIp(req), 'auth_failure');
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason });
      return null;
    }
    return auth.email || 'admin-operator';
  }

  // Notifications API
  app.get('/api/v1/notifications', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
    const categoryFilter = typeof req.query.category === 'string' ? req.query.category.toUpperCase() : '';
    const items = serverCommsEngine.notifications.filter(
      (n) =>
        n.recipientUid === uid &&
        (!statusFilter || n.status === statusFilter) &&
        (!categoryFilter || n.category === categoryFilter),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ status: 'ok', items, total: items.length });
  });

  app.get('/api/v1/notifications/unread-count', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const unreadCount = serverCommsEngine.notifications.filter((n) => n.recipientUid === uid && n.status === 'UNREAD').length;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ status: 'ok', unreadCount });
  });

  app.get('/api/v1/notifications/preferences', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    res.status(200).json({ status: 'ok', preferences: serverCommsEngine.getOrCreatePreferences(uid) });
  });

  app.patch('/api/v1/notifications/preferences', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const updated = serverCommsEngine.updatePreferences(uid, req.body ?? {});
    res.status(200).json({ status: 'ok', preferences: updated });
  });

  app.post('/api/v1/notifications/read-all', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const markedCount = serverCommsEngine.markAllRead(uid);
    res.status(200).json({ status: 'ok', markedCount });
  });

  app.get('/api/v1/notifications/:id', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const found = serverCommsEngine.notifications.find((n) => n.id === req.params.id);
    if (!found) { res.status(404).json({ status: 'error', code: 'NOTIFICATION_NOT_FOUND' }); return; }
    if (found.recipientUid !== uid) { res.status(403).json({ status: 'error', code: 'IDOR_FORBIDDEN' }); return; }
    res.status(200).json({ status: 'ok', item: found });
  });

  app.post('/api/v1/notifications/:id/read', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const result = serverCommsEngine.mutateNotificationStatus(req.params.id, uid, 'READ');
    if (!result.ok) { res.status(result.statusCode).json({ status: 'error' }); return; }
    res.status(200).json({ status: 'ok', item: result.notification });
  });

  app.post('/api/v1/notifications/:id/archive', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const result = serverCommsEngine.mutateNotificationStatus(req.params.id, uid, 'ARCHIVED');
    if (!result.ok) { res.status(result.statusCode).json({ status: 'error' }); return; }
    res.status(200).json({ status: 'ok', item: result.notification });
  });

  app.post('/api/v1/notifications/:id/dismiss', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const result = serverCommsEngine.mutateNotificationStatus(req.params.id, uid, 'DISMISSED');
    if (!result.ok) { res.status(result.statusCode).json({ status: 'error' }); return; }
    res.status(200).json({ status: 'ok', item: result.notification });
  });

  // Scoped Direct Messaging API
  app.get('/api/v1/conversations', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const items = serverCommsEngine.conversations.filter((c) => c.participants.some((p) => p.uid === uid));
    res.status(200).json({ status: 'ok', items });
  });

  app.post('/api/v1/conversations', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const result = serverCommsEngine.createScopedConversation({
      type: (req.body?.type as ConversationType) || 'SUPPORT',
      contextEntityType: req.body?.contextEntityType || 'support_ticket',
      contextEntityId: String(req.body?.contextEntityId || ''),
      contextTitleFa: String(req.body?.contextTitleFa || 'گفت‌وگوی مرتبط'),
      creatorUid: uid,
      participants: [
        { uid, displayNameFa: 'کاربر', roleLabelFa: 'عضو', senderType: 'USER', muted: false, archived: false, blockedOtherParticipant: false },
        {
          uid: sanitizeInput(String(req.body?.counterpartyUid || 'support-desk'), 64),
          displayNameFa: sanitizeInput(String(req.body?.counterpartyLabelFa || 'پشتیبانی رادار'), 64),
          roleLabelFa: 'طرف گفت‌وگو',
          senderType: req.body?.type === 'SUPPORT' ? 'SUPPORT_AGENT' : 'USER',
          muted: false,
          archived: false,
          blockedOtherParticipant: false,
        },
      ],
    });
    if (!result.ok) { res.status(400).json({ status: 'error', code: result.errorCode }); return; }
    res.status(201).json({ status: 'ok', conversation: result.conversation });
  });

  app.get('/api/v1/conversations/:id', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const conv = serverCommsEngine.conversations.find((c) => c.conversationId === req.params.id);
    if (!conv) { res.status(404).json({ status: 'error', code: 'CONVERSATION_NOT_FOUND' }); return; }
    if (!conv.participants.some((p) => p.uid === uid)) { res.status(403).json({ status: 'error', code: 'IDOR_FORBIDDEN' }); return; }
    res.status(200).json({ status: 'ok', conversation: conv });
  });

  app.get('/api/v1/conversations/:id/messages', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const conv = serverCommsEngine.conversations.find((c) => c.conversationId === req.params.id);
    if (!conv) { res.status(404).json({ status: 'error', code: 'CONVERSATION_NOT_FOUND' }); return; }
    if (!conv.participants.some((p) => p.uid === uid)) { res.status(403).json({ status: 'error', code: 'IDOR_FORBIDDEN' }); return; }
    res.status(200).json({ status: 'ok', items: conv.messages });
  });

  app.post('/api/v1/conversations/:id/messages', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const result = serverCommsEngine.sendMessage({
      conversationId: req.params.id,
      senderUid: uid,
      bodyFa: String(req.body?.bodyFa || ''),
      attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
    });
    if (!result.ok) { res.status(result.statusCode).json({ status: 'error', code: result.errorCode }); return; }
    res.status(201).json({ status: 'ok', message: result.message });
  });

  app.post('/api/v1/conversations/:id/read', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const conv = serverCommsEngine.conversations.find((c) => c.conversationId === req.params.id);
    if (!conv || !conv.participants.some((p) => p.uid === uid)) { res.status(403).json({ status: 'error', code: 'IDOR_FORBIDDEN' }); return; }
    conv.messages.forEach((m) => { if (!m.readByUids.includes(uid)) { m.readByUids.push(uid); m.status = 'READ'; } });
    res.status(200).json({ status: 'ok' });
  });

  app.post(['/api/v1/conversations/:id/mute', '/api/v1/conversations/:id/archive', '/api/v1/conversations/:id/block'], async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const conv = serverCommsEngine.conversations.find((c) => c.conversationId === req.params.id);
    const participant = conv?.participants.find((p) => p.uid === uid);
    if (!conv || !participant) { res.status(403).json({ status: 'error', code: 'IDOR_FORBIDDEN' }); return; }
    if (req.path.endsWith('/mute')) participant.muted = req.body?.muted !== false;
    else if (req.path.endsWith('/archive')) participant.archived = req.body?.archived !== false;
    else if (req.path.endsWith('/block')) participant.blockedOtherParticipant = req.body?.blocked !== false;
    res.status(200).json({ status: 'ok', participant });
  });

  app.post('/api/v1/conversations/:id/report', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const conv = serverCommsEngine.conversations.find((c) => c.conversationId === req.params.id);
    if (!conv || !conv.participants.some((p) => p.uid === uid)) { res.status(403).json({ status: 'error', code: 'IDOR_FORBIDDEN' }); return; }
    const report = {
      reportId: `rep-msg-${Date.now()}`,
      conversationId: conv.conversationId,
      messageId: typeof req.body?.messageId === 'string' ? req.body.messageId : undefined,
      reporterUid: uid,
      reasonFa: sanitizeInput(String(req.body?.reasonFa || 'گزارش نقض قوانین ارتباطی'), 200),
      status: 'PENDING' as const,
      createdAtIso: new Date().toISOString(),
    };
    serverCommsEngine.reports.unshift(report);
    res.status(201).json({ status: 'ok', report });
  });

  app.post('/api/v1/conversations/:id/participants', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const conv = serverCommsEngine.conversations.find((c) => c.conversationId === req.params.id);
    if (!conv || !conv.participants.some((p) => p.uid === uid)) { res.status(403).json({ status: 'error', code: 'IDOR_FORBIDDEN' }); return; }
    res.status(200).json({ status: 'ok', participants: conv.participants });
  });

  // Device Token API
  app.get('/api/v1/devices', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    res.status(200).json({ status: 'ok', items: serverCommsEngine.devices.filter((d) => d.ownerUid === uid) });
  });

  app.post('/api/v1/devices/register', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const rec = {
      deviceId: `dev-${Date.now()}`,
      ownerUid: uid,
      platform: req.body?.platform === 'PWA_MOBILE' ? ('PWA_MOBILE' as const) : ('WEB_PUSH' as const),
      labelFa: sanitizeInput(String(req.body?.labelFa || 'دستگاه وب'), 60),
      tokenMasked: `wp_••••_${Math.random().toString(36).slice(2, 6)}`,
      active: true,
      registeredAtIso: new Date().toISOString(),
      revokedAtIso: null,
    };
    serverCommsEngine.devices.unshift(rec);
    res.status(201).json({ status: 'ok', device: rec });
  });

  app.post('/api/v1/devices/revoke', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const dev = serverCommsEngine.devices.find((d) => d.deviceId === req.body?.deviceId && d.ownerUid === uid);
    if (!dev) { res.status(404).json({ status: 'error', code: 'DEVICE_NOT_FOUND' }); return; }
    dev.active = false;
    dev.revokedAtIso = new Date().toISOString();
    res.status(200).json({ status: 'ok', device: dev });
  });

  app.delete('/api/v1/devices/:deviceId', async (req: Request, res: Response) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const idx = serverCommsEngine.devices.findIndex((d) => d.deviceId === req.params.deviceId && d.ownerUid === uid);
    if (idx === -1) { res.status(404).json({ status: 'error', code: 'DEVICE_NOT_FOUND' }); return; }
    serverCommsEngine.devices.splice(idx, 1);
    res.status(200).json({ status: 'ok' });
  });

  // Admin Operations Center APIs (Zero access to raw private conversations)
  app.get('/api/admin/communications/overview', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    res.status(200).json({
      status: 'ok',
      totals: {
        notifications: serverCommsEngine.notifications.length,
        deliveries: serverCommsEngine.deliveries.length,
        deadLettersPending: serverCommsEngine.deadLetters.filter((d) => !d.replayed).length,
        pendingReports: serverCommsEngine.reports.filter((r) => r.status === 'PENDING').length,
      },
    });
  });

  app.get('/api/admin/communications/deliveries', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    res.status(200).json({ status: 'ok', items: serverCommsEngine.deliveries.slice(0, 100) });
  });

  app.get('/api/admin/communications/queues', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    const dlqItems = serverCommsEngine.deadLetters;
    res.status(200).json({
      status: 'ok',
      queues: ['comms.critical', 'comms.transactional', 'comms.standard', 'comms.digest', 'comms.retry', 'comms.dead-letter'],
      deadLetters: dlqItems,
    });
  });

  app.post('/api/admin/communications/dlq/replay', async (req: Request, res: Response) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const result = serverCommsEngine.replayDeadLetter(String(req.body?.dlqId || ''), admin);
    if (!result.ok) { res.status(404).json({ status: 'error', code: result.reasonCode }); return; }
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
