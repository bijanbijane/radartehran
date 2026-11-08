/**
 * @file server/modules/trust-safety/trustSafetyRoutes.ts
 * @description Express routing factory for Trust & Safety reporting, moderation, enforcement, and appeals.
 */

import { Router, type Request, type Response } from 'express';
import {
  buildErrorEnvelope,
  buildSuccessEnvelope,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  type CanonicalApiErrorCode,
  type FirebaseTokenVerifierAdapter,
} from '../core';
import type { TrustSafetyEngine } from './trustSafetyEngine';
import type {
  EnforcementActionType,
  ModerationCaseStatus,
  ReportCategory,
  ReportTargetType,
  RiskDimension,
  RiskLevel,
} from './trustSafetyTypes';

export function createTrustSafetyRouter(
  engine: TrustSafetyEngine,
  tokenVerifier?: FirebaseTokenVerifierAdapter,
): Router {
  const router = Router();

  async function resolvePrincipal(req: Request) {
    if (!tokenVerifier) {
      const uid = (req.headers['x-test-uid'] as string) || (req.headers['x-user-id'] as string);
      const role = (req.headers['x-test-role'] as string) || 'verified_user';
      if (uid) {
        return {
          ok: true,
          principal: {
            uid,
            email: `${uid}@example.com`,
            emailVerified: true,
            role: role as any,
            authMode: 'firebase_id_token' as const,
            claims: {},
          },
        };
      }
      return { ok: false, status: 401, failureCode: 'UNAUTHENTICATED' as CanonicalApiErrorCode, reason: 'احراز هویت الزامی است.' };
    }
    const ext = await extractAuthenticatedPrincipal(req, tokenVerifier, { requireVerifiedEmail: true });
    return {
      ok: ext.ok,
      principal: ext.principal,
      status: ext.status ?? 401,
      failureCode: 'UNAUTHENTICATED' as CanonicalApiErrorCode,
      reason: ext.reason ?? 'احراز هویت الزامی است.',
    };
  }

  // 1. Submit User Report (Reporter identity is kept confidential)
  router.post('/reports', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const { targetType, targetId, category, descriptionFa, evidenceMediaIds, idempotencyKey } = req.body;

    const result = await engine.submitUserReport({
      reporterUid: auth.principal.uid,
      targetType: targetType as ReportTargetType,
      targetId,
      category: category as ReportCategory,
      descriptionFa,
      evidenceMediaIds,
      idempotencyKey,
    });

    if (!result.success || !result.report) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در ثبت گزارش.', cid));
    }

    // Sanitize response: do not expose internal case structure to reporter
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
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
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

  // 3. List Moderation Cases (Moderator only)
  router.get('/cases', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const store = (engine as any).store;
    const status = req.query.status as ModerationCaseStatus | undefined;
    const cases = await store.listCases({ status });

    return res.json(buildSuccessEnvelope({ cases }, cid));
  });

  // 4. Request Enforcement
  router.post('/enforcement', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const { caseId, targetType, targetId, actionType, reasonFa, policyVersion, evidenceIds } = req.body;

    const result = await engine.requestEnforcement({
      caseId,
      targetType: targetType as ReportTargetType,
      targetId,
      actionType: actionType as EnforcementActionType,
      reasonFa,
      policyVersion: policyVersion || 'v1.0',
      evidenceIds: evidenceIds || [],
      issuingAuthorityUid: auth.principal.uid,
    });

    if (!result.success || !result.decision) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در اعمال محدودیت.', cid));
    }

    return res.status(201).json(buildSuccessEnvelope({ decision: result.decision }, cid));
  });

  // 5. Submit Appeal
  router.post('/appeals', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const { enforcementDecisionId, appealReasonFa, supportingEvidenceMediaIds } = req.body;

    const result = await engine.submitAppeal({
      enforcementDecisionId,
      appellantUid: auth.principal.uid,
      appealReasonFa,
      supportingEvidenceMediaIds,
    });

    if (!result.success || !result.appeal) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در ثبت تجدیدنظر.', cid));
    }

    return res.status(201).json(buildSuccessEnvelope({ appeal: result.appeal }, cid));
  });

  // 6. Review Appeal (Strict Separation of Duties: reviewer != original decider)
  router.post('/appeals/:appealId/review', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const { decision, reviewNotesFa } = req.body;

    const result = await engine.reviewAppeal({
      appealId: req.params.appealId,
      reviewerUid: auth.principal.uid,
      decision: decision as 'ACCEPTED' | 'REJECTED',
      reviewNotesFa: reviewNotesFa || 'بررسی تجدیدنظر انجام شد.',
    });

    if (!result.success || !result.appeal) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در بررسی تجدیدنظر.', cid));
    }

    return res.json(buildSuccessEnvelope({ appeal: result.appeal }, cid));
  });

  return router;
}
