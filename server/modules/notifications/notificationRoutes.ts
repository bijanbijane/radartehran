/**
 * @file server/modules/notifications/notificationRoutes.ts
 * @description Express routing layer for in-app notifications, user preferences, and administrative announcements.
 */

import type { Express, Request, Response } from 'express';
import { NotificationDeliveryEngine } from './notificationDeliveryEngine';
import { NotificationEventConsumer } from './notificationEventConsumer';
import { defaultNotificationStore, type NotificationStore } from './notificationStore';
import type { NotificationCategory, NotificationReadState } from './notificationTypes';
import { validateNotificationPreferencesUpdate } from './notificationValidator';

export interface NotificationModuleOptions {
  store?: NotificationStore;
  deliveryEngine?: NotificationDeliveryEngine;
  eventConsumer?: NotificationEventConsumer;
  verifyUserAuth?: (req: Request) => Promise<string | null> | string | null;
  verifyAdminAuth?: (req: Request) => Promise<boolean> | boolean;
  checkRateLimit?: (ip: string, bucket: string, max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
}

const registeredApps = new WeakSet<Express>();

/**
 * Default fallback auth extractor for development / test environments:
 * Extracts verified uid from req.headers['x-user-uid'] or Bearer token header.
 */
function defaultVerifyUserAuth(req: Request): string | null {
  const headerUid = req.headers['x-user-uid'];
  if (typeof headerUid === 'string' && headerUid.trim().length > 0) {
    return headerUid.trim();
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.startsWith('user_')) return token;
  }
  return null;
}

function defaultVerifyAdminAuth(req: Request): boolean {
  return req.headers['x-admin-role'] === 'super_admin' || req.headers['x-admin-secret'] === 'admin_verified';
}

export function registerNotificationRoutes(app: Express, options?: NotificationModuleOptions): void {
  if (registeredApps.has(app)) return;
  registeredApps.add(app);

  const store = options?.store || defaultNotificationStore;
  const deliveryEngine = options?.deliveryEngine || new NotificationDeliveryEngine(store);
  const eventConsumer = options?.eventConsumer || new NotificationEventConsumer(store, deliveryEngine);

  const verifyUserAuth = options?.verifyUserAuth || defaultVerifyUserAuth;
  const verifyAdminAuth = options?.verifyAdminAuth || defaultVerifyAdminAuth;
  const getClientIp = options?.getClientIp || ((req: Request) => req.ip || '127.0.0.1');
  const checkRateLimit = options?.checkRateLimit || ((_ip: string, _bucket: string, _max: number, _windowMs: number) => true);

  // 1. GET /api/v2/notifications
  app.get('/api/v2/notifications', async (req: Request, res: Response) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(ip, 'notifications_list', 100, 60 * 1000)) {
      res.status(429).json({ ok: false, error: 'RATE_LIMIT_EXCEEDED' });
      return;
    }

    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_NOTIFICATION_ACCESS' });
      return;
    }

    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    const readState = req.query.readState as NotificationReadState | undefined;
    const category = req.query.category as NotificationCategory | undefined;

    const outcome = await store.listNotificationsForUser(uid, {
      limit: isNaN(limit) ? 20 : limit,
      cursor,
      readState,
      category,
    });

    res.status(200).json({ ok: true, ...outcome });
  });

  // 2. GET /api/v2/notifications/unread-count
  app.get('/api/v2/notifications/unread-count', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_NOTIFICATION_ACCESS' });
      return;
    }

    const unreadCount = await store.getUnreadCount(uid);
    res.status(200).json({ ok: true, unreadCount });
  });

  // 3. PATCH /api/v2/notifications/:id/read
  app.patch('/api/v2/notifications/:id/read', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_NOTIFICATION_ACCESS' });
      return;
    }

    const updated = await store.setNotificationReadState(req.params.id, uid, 'read');
    if (!updated) {
      res.status(404).json({ ok: false, error: 'NOTIFICATION_NOT_FOUND_OR_FORBIDDEN' });
      return;
    }

    res.status(200).json({ ok: true, notification: updated });
  });

  // 4. PATCH /api/v2/notifications/:id/unread
  app.patch('/api/v2/notifications/:id/unread', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_NOTIFICATION_ACCESS' });
      return;
    }

    const updated = await store.setNotificationReadState(req.params.id, uid, 'unread');
    if (!updated) {
      res.status(404).json({ ok: false, error: 'NOTIFICATION_NOT_FOUND_OR_FORBIDDEN' });
      return;
    }

    res.status(200).json({ ok: true, notification: updated });
  });

  // 5. POST /api/v2/notifications/mark-all-read
  app.post('/api/v2/notifications/mark-all-read', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_NOTIFICATION_ACCESS' });
      return;
    }

    const result = await store.markAllAsRead(uid);
    res.status(200).json({ ok: true, markedCount: result.count });
  });

  // 6. DELETE /api/v2/notifications/:id
  app.delete('/api/v2/notifications/:id', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_NOTIFICATION_ACCESS' });
      return;
    }

    const updated = await store.setNotificationReadState(req.params.id, uid, 'deleted');
    if (!updated) {
      res.status(404).json({ ok: false, error: 'NOTIFICATION_NOT_FOUND_OR_FORBIDDEN' });
      return;
    }

    res.status(200).json({ ok: true, message: 'Notification deleted successfully' });
  });

  // 7. GET /api/v2/notifications/preferences
  app.get('/api/v2/notifications/preferences', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_NOTIFICATION_ACCESS' });
      return;
    }

    const prefs = await store.getPreferences(uid);
    res.status(200).json({ ok: true, preferences: prefs });
  });

  // 8. PUT /api/v2/notifications/preferences
  app.put('/api/v2/notifications/preferences', async (req: Request, res: Response) => {
    const uid = await verifyUserAuth(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_NOTIFICATION_ACCESS' });
      return;
    }

    const current = await store.getPreferences(uid);
    const validation = validateNotificationPreferencesUpdate(current, req.body);
    if (!validation.valid || !validation.sanitized) {
      res.status(400).json({ ok: false, errors: validation.errors });
      return;
    }

    const saved = await store.setPreferences(validation.sanitized);
    res.status(200).json({ ok: true, preferences: saved });
  });

  // 9. POST /api/v2/notifications/admin/broadcast
  app.post('/api/v2/notifications/admin/broadcast', async (req: Request, res: Response) => {
    const isAdmin = await verifyAdminAuth(req);
    if (!isAdmin) {
      res.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ACCESS_REQUIRED' });
      return;
    }

    const body = (req.body || {}) as { titleFa?: string; messageFa?: string; recipientUids?: string[] };
    const titleFa = String(body.titleFa || '').trim();
    const messageFa = String(body.messageFa || '').trim();
    const recipientUids = Array.isArray(body.recipientUids) ? body.recipientUids.map(String) : [];

    if (!titleFa || !messageFa || recipientUids.length === 0) {
      res.status(400).json({ ok: false, error: 'INVALID_ADMIN_BROADCAST_PAYLOAD' });
      return;
    }

    const outcome = await eventConsumer.broadcastAdministrativeAnnouncement({
      adminUid: 'admin_caller',
      titleFa,
      messageFa,
      recipientUids,
    });

    res.status(202).json({ ok: true, ...outcome });
  });
}
