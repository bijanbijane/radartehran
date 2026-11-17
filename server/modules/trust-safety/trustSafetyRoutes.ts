/**
 * @file server/modules/trust-safety/trustSafetyRoutes.ts
 * @description Express routing factory for Trust & Safety reporting, moderation, enforcement, and appeals.
 * Fail-closed authentication via FirebaseTokenVerifierAdapter + server-derived RBAC checks.
 */

import { Router, type Request, type Response } from 'express';
import {
  applyNoStoreSecurityHeaders,
  authorizePrincipal,
  buildErrorEnvelope,
  buildSuccessEnvelope,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  type AuthenticatedPrincipal,
  type CanonicalApiErrorCode,
  type DelegatedAdminStoreAdapter,
  type FirebaseTokenVerifierAdapter,
} from '../core';
import type { TrustSafetyEngine } from './trustSafetyEngine';
import type {
  EnforcementActionType,
  ModerationCaseStatus,
  ReportCategory,
  ReportTargetType,
} from './trustSafetyTypes';

export interface TrustSafetyRouterOptions {
  readonly adminStore?: DelegatedAdminStoreAdapter | null;
  readonly primaryAdminEmails?: readonly string[];
}

export function createTrustSafetyRouter(
  engine: TrustSafetyEngine,
  tokenVerifier?: FirebaseTokenVerifierAdapter | null,
  options?: TrustSafetyRouterOptions,
): Router {
  const router = Router();

  async function resolvePrincipal(req: Request): Promise<{
    ok: boolean;
    principal?: AuthenticatedPrincipal;
    status: number;
    failureCode: CanonicalApiErrorCode;
    reasonCode?: string;
    reason: string;
  }> {
    if (!tokenVerifier || typeof tokenVerifier.verifyIdToken !== 'function') {
      return {
        ok: false,
        status: 503,
        failureCode: 'INTERNAL_ERROR',
        reasonCode: 'AUTH_PROVIDER_UNAVAILABLE',
        reason: 'سرویس تایید هویت در دسترس نیست (Fail-Closed).',
      };
    }

    const ext = await extractAuthenticatedPrincipal(req, tokenVerifier, { requireVerifiedEmail: true });
    if (ext.ok && ext.principal) {
      return {
        ok: true,
        principal: ext.principal,
        status: 200,
        failureCode: 'UNAUTHENTICATED',
        reason: '',
      };
    }

    const status = ext.status ?? 401;
    const failureCode: CanonicalApiErrorCode =
      status === 403 ? 'FORBIDDEN' : status >= 500 ? 'INTERNAL_ERROR' : 'UNAUTHENTICATED';

    return {
      ok: false,
      status,
      failureCode,
      reasonCode: ext.failureCode,
      reason: ext.reason ?? 'احراز هویت الزامی است.',
    };
  }

  async function requireModeratorRole(principal: AuthenticatedPrincipal): Promise<{
    allowed: boolean;
    status: number;
    failureCode: CanonicalApiErrorCode;
    reason: string;
  }> {
    const decision = await authorizePrincipal(
      principal,
      { minimumRole: 'delegated_admin' },
      options?.adminStore,
      options?.primaryAdminEmails ? [...options.primaryAdminEmails] : undefined,
    );
    if (decision.allowed) {
      return { allowed: true, status: 200, failureCode: 'FORBIDDEN', reason: '' };
    }
    return {
      allowed: false,
      status: decision.status >= 500 ? decision.status : 403,
      failureCode: decision.status >= 500 ? 'INTERNAL_ERROR' : 'FORBIDDEN',
      reason: decision.reason || 'دسترسی ناظر برای این عملیات الزامی است.',
    };
  }

  // 1. Submit User Report (Reporter identity is kept confidential and strictly derived from Firebase token)
  router.post('/reports', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, cid);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, cid, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const { targetType, targetId, category, descriptionFa, evidenceMediaIds, idempotencyKey } = body;

    const result = await engine.submitUserReport({
      reporterUid: auth.principal.uid,
      targetType: targetType as ReportTargetType,
      targetId: String(targetId || ''),
      category: category as ReportCategory,
      descriptionFa: String(descriptionFa || ''),
      evidenceMediaIds: Array.isArray(evidenceMediaIds) ? (evidenceMediaIds as string[]) : undefined,
      idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
    });

    if (!result.success || !result.report) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در ثبت گزارش.', cid));
    }

    return res.status(result.replayed ? 200 : 201).json(
      buildSuccessEnvelope(
        {
          reportId: result.report.id,
          targetType: result.report.targetType,
          targetId: result.report.targetId,
          status: result.report.status,
          replayed: result.replayed,
        },
        cid,
      ),
    );
  });

  // 2. List Reporter's Own Reports
  router.get('/my-reports', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, cid);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, cid, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    const store = (engine as any).store;
    const reports = await store.listReportsByReporter(auth.principal.uid);

    return res.json(
      buildSuccessEnvelope(
        {
          reports: reports.map((r: any) => ({
            id: r.id,
            targetType: r.targetType,
            targetId: r.targetId,
            category: r.category,
            status: r.status,
            createdAtIso: r.createdAtIso,
          })),
        },
        cid,
      ),
    );
  });

  // 3. List Moderation Cases (Server-verified Moderator / Admin only)
  router.get('/cases', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, cid);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, cid, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    const modAuthz = await requireModeratorRole(auth.principal);
    if (!modAuthz.allowed) {
      return res.status(modAuthz.status).json(buildErrorEnvelope(modAuthz.failureCode, modAuthz.reason, cid));
    }

    const store = (engine as any).store;
    const status = req.query.status as ModerationCaseStatus | undefined;
    const cases = await store.listCases({ status });

    return res.json(buildSuccessEnvelope({ cases }, cid));
  });

  // 4. Request Enforcement (Server-verified Moderator / Admin only)
  router.post('/enforcement', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, cid);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, cid, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    const modAuthz = await requireModeratorRole(auth.principal);
    if (!modAuthz.allowed) {
      return res.status(modAuthz.status).json(buildErrorEnvelope(modAuthz.failureCode, modAuthz.reason, cid));
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const { caseId, targetType, targetId, actionType, reasonFa, policyVersion, evidenceIds } = body;

    const result = await engine.requestEnforcement({
      caseId: String(caseId || ''),
      targetType: targetType as ReportTargetType,
      targetId: String(targetId || ''),
      actionType: actionType as EnforcementActionType,
      reasonFa: String(reasonFa || ''),
      policyVersion: typeof policyVersion === 'string' && policyVersion ? policyVersion : 'v1.0',
      evidenceIds: Array.isArray(evidenceIds) ? (evidenceIds as string[]) : [],
      issuingAuthorityUid: auth.principal.uid,
    });

    if (!result.success || !result.decision) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در اعمال محدودیت.', cid));
    }

    return res.status(201).json(buildSuccessEnvelope({ decision: result.decision }, cid));
  });

  // 5. Submit Appeal (Appellant derived strictly from Firebase token)
  router.post('/appeals', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, cid);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, cid, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const { enforcementDecisionId, appealReasonFa, supportingEvidenceMediaIds } = body;

    const result = await engine.submitAppeal({
      enforcementDecisionId: String(enforcementDecisionId || ''),
      appellantUid: auth.principal.uid,
      appealReasonFa: String(appealReasonFa || ''),
      supportingEvidenceMediaIds: Array.isArray(supportingEvidenceMediaIds)
        ? (supportingEvidenceMediaIds as string[])
        : undefined,
    });

    if (!result.success || !result.appeal) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در ثبت تجدیدنظر.', cid));
    }

    return res.status(201).json(buildSuccessEnvelope({ appeal: result.appeal }, cid));
  });

  // 6. Review Appeal (Server-verified Moderator / Admin + Strict Separation of Duties)
  router.post('/appeals/:appealId/review', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, cid);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, cid, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    const modAuthz = await requireModeratorRole(auth.principal);
    if (!modAuthz.allowed) {
      return res.status(modAuthz.status).json(buildErrorEnvelope(modAuthz.failureCode, modAuthz.reason, cid));
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const { decision, reviewNotesFa } = body;

    const result = await engine.reviewAppeal({
      appealId: req.params.appealId,
      reviewerUid: auth.principal.uid,
      decision: decision as 'ACCEPTED' | 'REJECTED',
      reviewNotesFa: typeof reviewNotesFa === 'string' && reviewNotesFa ? reviewNotesFa : 'بررسی تجدیدنظر انجام شد.',
    });

    if (!result.success || !result.appeal) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در بررسی تجدیدنظر.', cid));
    }

    return res.json(buildSuccessEnvelope({ appeal: result.appeal }, cid));
  });

  return router;
}
