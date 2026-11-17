/** @file server/modules/trust-safety/mountTrustSafetyRoutes.ts — Stage 5 Mounted /api/v1/trust-safety Fail-Closed Routes */
import type { Express, Request, Response } from 'express';
import {
  verifyAdminApiAuthorization,
  verifyAuthenticatedUserHeader,
} from '../../../src/utils/serverAdminAndTelegramSecurity';
import { recordAbuseSignal } from '../../../src/utils/serverDeliveryAndAbuseGuard';
import { handleCommunityRouteError } from '../community/communityRoutesHandlers';
import {
  defaultSocialModerationLifecycle,
  SocialModerationLifecycleService,
  type SocialModerationDecision,
} from './socialModerationLifecycle';

export interface MountTrustSafetyOptions {
  lifecycle?: SocialModerationLifecycleService;
  checkRateLimit?: (ip: string, bucket: 'general', max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
  verifyUser?: (headers: Record<string, string | string[] | undefined>) => Promise<{ authorized: boolean; uid?: string; statusCode: number; reason?: string }>;
  verifyAdmin?: (headers: Record<string, string | string[] | undefined>) => Promise<{ authorized: boolean; uid?: string; email?: string; statusCode: number; reason?: string }>;
}

const VALID_DECISIONS = new Set<SocialModerationDecision>(['dismiss', 'hide', 'lock', 'soft_delete', 'warn_author', 'escalate']);
const mountedApps = new WeakSet<Express>();

export function registerTrustSafetyV1Routes(app: Express, options?: MountTrustSafetyOptions): void {
  if (mountedApps.has(app)) return;
  mountedApps.add(app);

  const lifecycle = options?.lifecycle ?? defaultSocialModerationLifecycle;
  const getIp = options?.getClientIp ?? ((req: Request) => req.ip || '127.0.0.1');
  const allowRate = options?.checkRateLimit ?? (() => true);
  const authUser = options?.verifyUser ?? ((h) => verifyAuthenticatedUserHeader(h));
  const authAdmin = options?.verifyAdmin ?? ((h) => verifyAdminApiAuthorization(h, process.env, { disallowStaticToken: true }));

  app.post('/api/v1/trust-safety/reports', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      if (!allowRate(getIp(req), 'general', 30, 60_000)) {
        res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
        return;
      }
      const auth = await authUser(req.headers as Record<string, string | string[] | undefined>);
      if (!auth.authorized || !auth.uid) {
        recordAbuseSignal(getIp(req), 'auth_failure');
        res.status(auth.statusCode || 401).json({ status: 'error', code: auth.reason || 'UNAUTHORIZED' });
        return;
      }
      const out = await lifecycle.submitReport({
        reporterUid: auth.uid,
        targetType: req.body?.targetType || 'discussion_post',
        targetId: String(req.body?.targetId || ''),
        reason: String(req.body?.reason || 'other'),
        detailsFa: String(req.body?.detailsFa || ''),
      });
      res.status(201).json({ status: 'ok', ...out });
    } catch (err) {
      handleCommunityRouteError(res, err);
    }
  });

  app.get('/api/v1/trust-safety/cases', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const auth = await authAdmin(req.headers as Record<string, string | string[] | undefined>);
      if (!auth.authorized) {
        recordAbuseSignal(getIp(req), 'auth_failure');
        res.status(auth.statusCode || 403).json({ status: 'error', code: auth.reason || 'FORBIDDEN' });
        return;
      }
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const cases = await lifecycle.listCases(status);
      res.status(200).json({ status: 'ok', cases });
    } catch (err) {
      handleCommunityRouteError(res, err);
    }
  });

  app.get('/api/v1/trust-safety/cases/:id/events', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const auth = await authAdmin(req.headers as Record<string, string | string[] | undefined>);
      if (!auth.authorized) {
        res.status(auth.statusCode || 403).json({ status: 'error', code: auth.reason || 'FORBIDDEN' });
        return;
      }
      const events = await lifecycle.listCaseEvents(String(req.params.id));
      res.status(200).json({ status: 'ok', events });
    } catch (err) {
      handleCommunityRouteError(res, err);
    }
  });

  app.post('/api/v1/trust-safety/cases/:id/claim', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const auth = await authAdmin(req.headers as Record<string, string | string[] | undefined>);
      if (!auth.authorized || !auth.uid) {
        res.status(auth.statusCode || 403).json({ status: 'error', code: auth.reason || 'FORBIDDEN' });
        return;
      }
      const modCase = await lifecycle.claimCase(String(req.params.id), auth.uid);
      res.status(200).json({ status: 'ok', case: modCase });
    } catch (err) {
      handleCommunityRouteError(res, err);
    }
  });

  app.post('/api/v1/trust-safety/cases/:id/decision', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const auth = await authAdmin(req.headers as Record<string, string | string[] | undefined>);
      if (!auth.authorized || !auth.uid) {
        res.status(auth.statusCode || 403).json({ status: 'error', code: auth.reason || 'FORBIDDEN' });
        return;
      }
      const decision = String(req.body?.decision || '') as SocialModerationDecision;
      if (!VALID_DECISIONS.has(decision)) {
        res.status(400).json({ status: 'error', code: 'INVALID_MODERATION_DECISION' });
        return;
      }
      const modCase = await lifecycle.applyDecision({
        caseId: String(req.params.id),
        adminUid: auth.uid,
        actorRole: 'delegated_admin',
        decision,
        reasonFa: String(req.body?.reasonFa || ''),
      });
      res.status(200).json({ status: 'ok', case: modCase });
    } catch (err) {
      handleCommunityRouteError(res, err);
    }
  });

  app.post('/api/v1/trust-safety/cases/:id/appeal-resolve', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const auth = await authAdmin(req.headers as Record<string, string | string[] | undefined>);
      if (!auth.authorized || !auth.uid) {
        res.status(auth.statusCode || 403).json({ status: 'error', code: auth.reason || 'FORBIDDEN' });
        return;
      }
      const decision = req.body?.decision === 'overturned' ? 'overturned' : req.body?.decision === 'upheld' ? 'upheld' : null;
      if (!decision) {
        res.status(400).json({ status: 'error', code: 'INVALID_APPEAL_DECISION' });
        return;
      }
      const modCase = await lifecycle.resolveAppealWithSoD({
        caseId: String(req.params.id),
        reviewerUid: auth.uid,
        reviewerRole: 'delegated_admin',
        decision,
        reviewerNoteFa: String(req.body?.reviewerNoteFa || ''),
      });
      res.status(200).json({ status: 'ok', case: modCase });
    } catch (err) {
      handleCommunityRouteError(res, err);
    }
  });
}
