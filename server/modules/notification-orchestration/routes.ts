/**
 * Employee 68 — Notification, Alert Orchestration & Communication Preferences Express Router
 * (`server/modules/notification-orchestration/routes.ts`)
 *
 * Exclusive ownership: `server/modules/notification-orchestration/`
 */

import express, { type Request, type Response, type Router } from 'express';
import {
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  withStandardErrorBoundary,
} from '../core';
import type { AuthenticatedPrincipal } from '../core/types';
import { NotificationOrchestrationService } from './service';
import type {
  InAppReadStatus,
  NotificationOrchestrationDependencies,
  UnifiedNotificationCategory,
} from './types';

export function createNotificationOrchestrationRouter(
  deps: NotificationOrchestrationDependencies,
  existingService?: NotificationOrchestrationService,
): Router {
  const router = express.Router();
  const service = existingService ?? new NotificationOrchestrationService(deps);

  const requireAuth = async (req: Request): Promise<AuthenticatedPrincipal> => {
    const extraction = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
    if (!extraction.ok || !extraction.principal) {
      throw new CoreApiError(
        'UNAUTHENTICATED',
        extraction.status ?? 401,
        extraction.reason ?? 'Authentication required for notification operations.',
      );
    }
    return extraction.principal;
  };

  const sendOk = <T>(res: Response, status: number, data: T, correlationId: string): void => {
    res.status(status).json(buildSuccessEnvelope(data, correlationId));
  };

  router.get(
    '/center',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.listUserNotifications(principal, {
        category:
          typeof req.query.category === 'string'
            ? (req.query.category as UnifiedNotificationCategory)
            : undefined,
        readStatus:
          typeof req.query.readStatus === 'string'
            ? (req.query.readStatus as InAppReadStatus)
            : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 25,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      });
      sendOk(res, 200, result, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/center/:notificationId/read-status',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const readStatus = (req.body?.readStatus ?? 'READ') as InAppReadStatus;
      const notification = await service.markNotificationReadStatus(
        principal,
        String(req.params.notificationId),
        readStatus,
      );
      sendOk(res, 200, { notification }, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/center/mark-all-read',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.markAllNotificationsAsRead(principal);
      sendOk(res, 200, result, resolveCorrelationId(req));
    }),
  );

  router.delete(
    '/center/:notificationId',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.deleteNotification(principal, String(req.params.notificationId));
      sendOk(res, 200, result, resolveCorrelationId(req));
    }),
  );

  router.get(
    '/preferences',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const preferences = await service.getUserPreferences(principal);
      sendOk(res, 200, { preferences }, resolveCorrelationId(req));
    }),
  );

  router.patch(
    '/preferences',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const preferences = await service.updateUserPreferences(principal, req.body);
      sendOk(res, 200, { preferences }, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/admin/templates',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const template = await service.upsertTemplateVersion(principal, req.body);
      sendOk(res, 201, { template }, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/admin/announcements',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.createAdministrativeAnnouncement(principal, req.body);
      sendOk(res, 201, result, resolveCorrelationId(req));
    }),
  );

  router.get(
    '/admin/analytics',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const analytics = await service.getOperationalAnalytics(principal);
      sendOk(res, 200, { analytics }, resolveCorrelationId(req));
    }),
  );

  return router;
}
