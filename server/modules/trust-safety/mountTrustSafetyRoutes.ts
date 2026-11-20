/**
 * @file server/modules/trust-safety/mountTrustSafetyRoutes.ts
 * @description Stage 5 + RT-TS-CRITICAL-026..029 Mounted /api/v1/trust-safety Fail-Closed Routes.
 * Enforces mandatory Idempotency-Key on report creation, strict runtime TargetType validation,
 * authoritative server-derived actor roles (never hardcoded), cursor pagination, and Appeal + SoD endpoints.
 */
import type { Express, Request, Response } from 'express';
import {
  extractSingleSecurityHeader,
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
import { assertValidModerationTargetType } from './moderationTargetResolver';
import { resolveAuthoritativeModerationRole } from './moderationLifecycleHelpers';

export interface MountTrustSafetyOptions {
  lifecycle?: SocialModerationLifecycleService;
  checkRateLimit?: (ip: string, bucket: 'general', max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
  verifyUser?: (
    headers: Record<string, string | string[] | undefined>,
  ) => Promise<{ authorized: boolean; uid?: string; statusCode: number; reason?: string }>;
  verifyAdmin?: (
    headers: Record<string, string | string[] | undefined>,
  ) => Promise<{ authorized: boolean; uid?: string; email?: string; role?: string; statusCode: number; reason?: string }>;
}

const VALID_DECISIONS = new Set<SocialModerationDecision>([
  'dismiss',
  'hide',
  'lock',
  'soft_delete',
  'warn_author',
  'escalate',
]);
const mountedApps = new WeakSet<Express>();

function parsePositiveLimit(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function parseSortDirection(raw: unknown): 'asc' | 'desc' {
  return raw === 'asc' ? 'asc' : 'desc';
}

function extractValidIdempotencyKey(headers: Record<string, string | string[] | undefined>): string | null {
  const res = extractSingleSecurityHeader(headers, 'idempotency-key');
  if (!res.ok || !res.value) return null;
  const trimmed = res.value.trim();
  if (trimmed.length < 8 || trimmed.length > 128 || /[^a-zA-Z0-9._:-]/.test(trimmed)) return null;
  return trimmed;
}

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
      const headers = req.headers as Record<string, string | string[] | undefined>;
      const auth = await authUser(headers);
      if (!auth.authorized || !auth.uid) {
        recordAbuseSignal(getIp(req), 'auth_failure');
        res.status(auth.statusCode || 401).json({ status: 'error', code: auth.reason || 'UNAUTHORIZED' });
        return;
      }
      const idempotencyKey = extractValidIdempotencyKey(headers);
      if (!idempotencyKey) {
        res.status(400).json({
          status: 'error',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          messageFa: 'ارسال هدر معتبر Idempotency-Key (حداقل ۸ کاراکتر) برای ثبت گزارش الزامی است.',
        });
        return;
      }
      const targetType = assertValidModerationTargetType(req.body?.targetType);
      const out = await lifecycle.submitReport({
        reporterUid: auth.uid,
        targetType,
        targetId: String(req.body?.targetId || ''),
        reason: String(req.body?.reason || 'other'),
        detailsFa: String(req.body?.detailsFa || ''),
        idempotencyKey,
      });
      res.status(out.replayed ? 200 : 201).json({ status: 'ok', ...out });
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
      const page = await lifecycle.listCases({
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        limit: parsePositiveLimit(req.query.limit),
        cursor: typeof req.query.cursor === 'string' && req.query.cursor.trim() ? req.query.cursor.trim() : null,
        sortDirection: parseSortDirection(req.query.sortDirection),
      });
      res.status(200).json({
        status: 'ok',
        items: page.items,
        cases: page.items,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      });
    } catch (err) {
      handleCommunityRouteError(res, err);
    }
  });

  app.get('/api/v1/trust-safety/cases/:id/reports', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const auth = await authAdmin(req.headers as Record<string, string | string[] | undefined>);
      if (!auth.authorized) {
        res.status(auth.statusCode || 403).json({ status: 'error', code: auth.reason || 'FORBIDDEN' });
        return;
      }
      const page = await lifecycle.listCaseReports(String(req.params.id), {
        limit: parsePositiveLimit(req.query.limit),
        cursor: typeof req.query.cursor === 'string' && req.query.cursor.trim() ? req.query.cursor.trim() : null,
        sortDirection: parseSortDirection(req.query.sortDirection),
      });
      res.status(200).json({
        status: 'ok',
        items: page.items,
        reports: page.items,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      });
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
      const page = await lifecycle.listCaseEvents(String(req.params.id), {
        limit: parsePositiveLimit(req.query.limit),
        cursor: typeof req.query.cursor === 'string' && req.query.cursor.trim() ? req.query.cursor.trim() : null,
        sortDirection: parseSortDirection(req.query.sortDirection),
      });
      res.status(200).json({
        status: 'ok',
        items: page.items,
        events: page.items,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      });
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
      const actorRole = resolveAuthoritativeModerationRole(auth);
      const modCase = await lifecycle.claimCase(String(req.params.id), auth.uid, 5 * 60_000, actorRole);
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
      const actorRole = resolveAuthoritativeModerationRole(auth);
      const expectedRevision =
        typeof req.body?.expectedRevision === 'number' ? req.body.expectedRevision : undefined;
      const modCase = await lifecycle.applyDecision({
        caseId: String(req.params.id),
        adminUid: auth.uid,
        actorRole,
        decision,
        reasonFa: String(req.body?.reasonFa || ''),
        expectedRevision,
      });
      res.status(200).json({ status: 'ok', case: modCase });
    } catch (err) {
      handleCommunityRouteError(res, err);
    }
  });

  app.post('/api/v1/trust-safety/cases/:id/appeals', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      if (!allowRate(getIp(req), 'general', 20, 60_000)) {
        res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
        return;
      }
      const auth = await authUser(req.headers as Record<string, string | string[] | undefined>);
      if (!auth.authorized || !auth.uid) {
        recordAbuseSignal(getIp(req), 'auth_failure');
        res.status(auth.statusCode || 401).json({ status: 'error', code: auth.reason || 'UNAUTHORIZED' });
        return;
      }
      const out = await lifecycle.submitAppeal({
        caseId: String(req.params.id),
        appellantUid: auth.uid,
        reasonFa: String(req.body?.reasonFa || ''),
        evidenceRefs: Array.isArray(req.body?.evidenceRefs) ? req.body.evidenceRefs : [],
      });
      res.status(201).json({ status: 'ok', ...out });
    } catch (err) {
      handleCommunityRouteError(res, err);
    }
  });

  app.post('/api/v1/trust-safety/appeals/:appealId/resolve', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const auth = await authAdmin(req.headers as Record<string, string | string[] | undefined>);
      if (!auth.authorized || !auth.uid) {
        res.status(auth.statusCode || 403).json({ status: 'error', code: auth.reason || 'FORBIDDEN' });
        return;
      }
      const decision =
        req.body?.decision === 'overturned' ? 'overturned' : req.body?.decision === 'upheld' ? 'upheld' : null;
      if (!decision) {
        res.status(400).json({ status: 'error', code: 'INVALID_APPEAL_DECISION' });
        return;
      }
      const reviewerRole = resolveAuthoritativeModerationRole(auth);
      const out = await lifecycle.resolveAppealById({
        appealId: String(req.params.appealId),
        reviewerUid: auth.uid,
        reviewerRole,
        decision,
        reviewerNoteFa: String(req.body?.reviewerNoteFa || ''),
        expectedCaseRevision:
          typeof req.body?.expectedCaseRevision === 'number' ? req.body.expectedCaseRevision : undefined,
      });
      res.status(200).json({ status: 'ok', appeal: out.appeal, case: out.moderationCase });
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
      const decision =
        req.body?.decision === 'overturned' ? 'overturned' : req.body?.decision === 'upheld' ? 'upheld' : null;
      if (!decision) {
        res.status(400).json({ status: 'error', code: 'INVALID_APPEAL_DECISION' });
        return;
      }
      const reviewerRole = resolveAuthoritativeModerationRole(auth);
      const modCase = await lifecycle.resolveAppealWithSoD({
        caseId: String(req.params.id),
        appealId: typeof req.body?.appealId === 'string' ? req.body.appealId : undefined,
        reviewerUid: auth.uid,
        reviewerRole,
        decision,
        reviewerNoteFa: String(req.body?.reviewerNoteFa || ''),
      });
      res.status(200).json({ status: 'ok', case: modCase });
    } catch (err) {
      handleCommunityRouteError(res, err);
    }
  });
}
