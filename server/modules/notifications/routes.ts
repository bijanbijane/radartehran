import { Router, type Request, type Response } from 'express';
import {
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  withStandardErrorBoundary,
  type AuthenticatedPrincipal,
} from '../core';
import { createNotificationsService } from './service';
import type { NotificationsModuleDependencies } from './types';

/**
 * Standalone Express router factory for Employee 8 — Notifications and Messaging Module.
 * Exported explicitly without modifying `server.ts` or global route files.
 */
export function createNotificationsRouter(deps: NotificationsModuleDependencies): Router {
  const router = Router();
  const service = createNotificationsService(deps);

  async function requireVerifiedPrincipal(req: Request): Promise<AuthenticatedPrincipal> {
    const authResult = await extractAuthenticatedPrincipal(req, deps.tokenVerifier, {
      requireVerifiedEmail: true,
    });
    if (!authResult.ok || !authResult.principal) {
      throw new CoreApiError(
        'UNAUTHENTICATED',
        authResult.status ?? 401,
        authResult.reason ?? 'Authentication required.',
      );
    }
    return authResult.principal;
  }

  // GET / — Retrieve user notifications with pagination & unread count
  router.get(
    '/',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const unreadOnly = req.query.unreadOnly === 'true';
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const cursorCreatedAtIso = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

      const result = await service.getUserNotifications({
        principal,
        unreadOnly,
        limit,
        cursorCreatedAtIso,
      });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // POST /:id/read — Mark single notification read or unread
  router.post(
    '/:id/read',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const read = req.body?.read !== false; // Default true
      const notif = await service.markNotificationRead({
        principal,
        notificationId: String(req.params.id ?? ''),
        read,
      });
      res.status(200).json(buildSuccessEnvelope({ notification: notif }, correlationId));
    }),
  );

  // POST /mark-all-read — Mark all user notifications as read
  router.post(
    '/mark-all-read',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const result = await service.markAllNotificationsRead({ principal });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // DELETE /:id — Archive notification
  router.delete(
    '/:id',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const notif = await service.archiveNotification({
        principal,
        notificationId: String(req.params.id ?? ''),
      });
      res.status(200).json(buildSuccessEnvelope({ notification: notif }, correlationId));
    }),
  );

  // GET /preferences — Get recipient notification preferences
  router.get(
    '/preferences',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const preferences = await service.getNotificationPreferences({ principal });
      res.status(200).json(buildSuccessEnvelope({ preferences }, correlationId));
    }),
  );

  // PUT /preferences — Update recipient notification preferences
  router.put(
    '/preferences',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const preferences = await service.updateNotificationPreferences({
        principal,
        rawBody: req.body,
      });
      res.status(200).json(buildSuccessEnvelope({ preferences }, correlationId));
    }),
  );

  // POST /admin/announcements — Broadcast announcement (Admin only)
  router.post(
    '/admin/announcements',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const result = await service.broadcastAdminAnnouncement({
        principal,
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  return router;
}
