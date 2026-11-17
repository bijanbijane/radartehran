/**
 * @file server/modules/dispute-resolution/disputeRoutes.ts
 * @description Express routing factory for Dispute Resolution and Case Management endpoints.
 * Enforces fail-closed Firebase ID Token verification, server-derived staff checks, and strict case ownership checks.
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
import type { DisputeResolutionEngine } from './disputeEngine';
import type { DisputeRepository } from './disputeStore';
import type { CaseStatus, DisputeCategory, ResolutionOutcomeType } from './disputeTypes';

export interface DisputeRouterOptions {
  readonly adminStore?: DelegatedAdminStoreAdapter | null;
  readonly primaryAdminEmails?: readonly string[];
}

export function createDisputeRouter(
  engine: DisputeResolutionEngine,
  store: DisputeRepository,
  tokenVerifier?: FirebaseTokenVerifierAdapter | null,
  options?: DisputeRouterOptions,
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
      return { ok: true, principal: ext.principal, status: 200, failureCode: 'UNAUTHENTICATED', reason: '' };
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

  async function isServerVerifiedStaff(principal: AuthenticatedPrincipal): Promise<boolean> {
    if (!options?.adminStore && (!options?.primaryAdminEmails || options.primaryAdminEmails.length === 0)) {
      return false;
    }
    const decision = await authorizePrincipal(
      principal,
      { minimumRole: 'delegated_admin' },
      options?.adminStore,
      options?.primaryAdminEmails ? [...options.primaryAdminEmails] : undefined,
    );
    return decision.allowed;
  }

  // 1. Create Dispute Case
  router.post('/cases', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, correlationId);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, correlationId, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const { category, titleFa, descriptionFa, respondentUid, propertyReferenceId, transactionReferenceId, idempotencyKey } = body;
      const result = await engine.createDisputeCase(auth.principal.uid, {
        category: category as DisputeCategory,
        titleFa: String(titleFa || ''),
        descriptionFa: String(descriptionFa || ''),
        respondentUid: String(respondentUid || ''),
        propertyReferenceId: typeof propertyReferenceId === 'string' ? propertyReferenceId : undefined,
        transactionReferenceId: typeof transactionReferenceId === 'string' ? transactionReferenceId : undefined,
        idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
      });

      return res.status(result.isExisting ? 200 : 201).json(
        buildSuccessEnvelope(
          {
            caseId: result.caseRecord.id,
            status: result.caseRecord.status,
            titleFa: result.caseRecord.titleFa,
            isExisting: result.isExisting,
            createdAtIso: result.caseRecord.createdAtIso,
          },
          correlationId,
        ),
      );
    } catch (err: any) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', err.message || 'خطا در ثبت پرونده اختلاف.', correlationId));
    }
  });

  // 2. List Cases for authenticated user
  router.get('/my-cases', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, correlationId);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, correlationId, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    try {
      const status = req.query.status as CaseStatus | undefined;
      const cases = await store.listCasesForUser(auth.principal.uid, { status });
      return res.json(buildSuccessEnvelope({ cases, total: cases.length }, correlationId));
    } catch (err: any) {
      return res.status(500).json(buildErrorEnvelope('INTERNAL_ERROR', err.message, correlationId));
    }
  });

  // 3. Get Case Details & Summary (Party or server-verified staff only)
  router.get('/cases/:caseId', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, correlationId);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, correlationId, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    try {
      const isStaff = await isServerVerifiedStaff(auth.principal);
      const summary = await engine.getCaseSummary(auth.principal.uid, req.params.caseId, isStaff);
      return res.json(buildSuccessEnvelope(summary, correlationId));
    } catch (err: any) {
      const isForbidden = String(err.message || '').includes('FORBIDDEN');
      return res.status(isForbidden ? 403 : 404).json(buildErrorEnvelope(isForbidden ? 'FORBIDDEN' : 'NOT_FOUND', err.message, correlationId));
    }
  });

  // 4. Add Claim to Case
  router.post('/cases/:caseId/claims', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, correlationId);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, correlationId, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    try {
      const { titleFa, factualAccountFa, requestedRemedyFa, claimedAmountRials, currency } = req.body || {};
      const claim = await engine.addClaim(auth.principal.uid, req.params.caseId, {
        titleFa,
        factualAccountFa,
        requestedRemedyFa,
        claimedAmountRials,
        currency,
      });
      return res.status(201).json(buildSuccessEnvelope(claim, correlationId));
    } catch (err: any) {
      const msg = String(err.message || '');
      const status = msg.includes('FORBIDDEN') ? 403 : msg.includes('CASE_NOT_FOUND') ? 404 : 400;
      return res.status(status).json(buildErrorEnvelope(status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED', msg, correlationId));
    }
  });

  // 5. Submit Response to Claim
  router.post('/claims/:claimId/responses', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, correlationId);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, correlationId, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    try {
      const { stance, statementFa, counterClaimId } = req.body || {};
      const response = await engine.submitClaimResponse(auth.principal.uid, req.params.claimId, {
        stance,
        statementFa,
        counterClaimId,
      });
      return res.status(201).json(buildSuccessEnvelope(response, correlationId));
    } catch (err: any) {
      const msg = String(err.message || '');
      const status = msg.includes('FORBIDDEN') ? 403 : msg.includes('NOT_FOUND') ? 404 : 400;
      return res.status(status).json(buildErrorEnvelope(status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED', msg, correlationId));
    }
  });

  // 6. Attach Evidence Reference
  router.post('/cases/:caseId/evidence', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, correlationId);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, correlationId, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    try {
      const { evidenceType, descriptionFa, sourceMediaId, confidentiality, claimId } = req.body || {};
      const evidence = await engine.attachEvidence(auth.principal.uid, req.params.caseId, {
        evidenceType,
        descriptionFa,
        sourceMediaId,
        confidentiality,
        claimId,
      });
      return res.status(201).json(buildSuccessEnvelope(evidence, correlationId));
    } catch (err: any) {
      const msg = String(err.message || '');
      const status = msg.includes('FORBIDDEN') ? 403 : msg.includes('CASE_NOT_FOUND') ? 404 : 400;
      return res.status(status).json(buildErrorEnvelope(status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED', msg, correlationId));
    }
  });

  // 7. Create Negotiation Proposal
  router.post('/cases/:caseId/proposals', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, correlationId);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, correlationId, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    try {
      const { proposalTermsFa, proposedFinancialRemedyRials, validUntilIso } = req.body || {};
      const proposal = await engine.createNegotiationProposal(auth.principal.uid, req.params.caseId, {
        proposalTermsFa,
        proposedFinancialRemedyRials,
        validUntilIso,
      });
      return res.status(201).json(buildSuccessEnvelope(proposal, correlationId));
    } catch (err: any) {
      const msg = String(err.message || '');
      const status = msg.includes('FORBIDDEN') ? 403 : msg.includes('CASE_NOT_FOUND') ? 404 : 400;
      return res.status(status).json(buildErrorEnvelope(status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED', msg, correlationId));
    }
  });

  // 8. Accept Proposal (Generates bilateral SettlementAgreement on dual signatures)
  router.post('/proposals/:proposalId/accept', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, correlationId);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, correlationId, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    try {
      const outcome = await engine.acceptProposal(auth.principal.uid, req.params.proposalId);
      return res.json(buildSuccessEnvelope(outcome, correlationId));
    } catch (err: any) {
      const msg = String(err.message || '');
      const status = msg.includes('FORBIDDEN') ? 403 : msg.includes('NOT_FOUND') ? 404 : 400;
      return res.status(status).json(buildErrorEnvelope(status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED', msg, correlationId));
    }
  });

  // 9. Transition Case Status (Party/Assigned handler or Server-Verified Staff)
  router.post('/cases/:caseId/transition', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, correlationId);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, correlationId, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    try {
      const isStaff = await isServerVerifiedStaff(auth.principal);
      const { targetStatus, reasonFa } = req.body || {};
      const updated = await engine.transitionCaseStatus(
        auth.principal.uid,
        req.params.caseId,
        targetStatus as CaseStatus,
        reasonFa || '',
        isStaff,
      );
      return res.json(buildSuccessEnvelope(updated, correlationId));
    } catch (err: any) {
      const msg = String(err.message || '');
      const status = msg.includes('FORBIDDEN_CASE_TRANSITION') ? 403 : msg.includes('CASE_NOT_FOUND') ? 404 : 400;
      return res.status(status).json(buildErrorEnvelope(status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED', msg, correlationId));
    }
  });

  // 10. Record Final Resolution Outcome (Assigned Mediator/Handler or Server-Verified Staff)
  router.post('/cases/:caseId/resolve', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, correlationId);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, correlationId, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    try {
      const isStaff = await isServerVerifiedStaff(auth.principal);
      const { outcomeType, explanationFa, settlementAgreementId } = req.body || {};
      const resolved = await engine.recordResolutionOutcome(
        auth.principal.uid,
        req.params.caseId,
        {
          outcomeType: outcomeType as ResolutionOutcomeType,
          explanationFa,
          settlementAgreementId,
        },
        isStaff,
      );
      return res.json(buildSuccessEnvelope(resolved, correlationId));
    } catch (err: any) {
      const msg = String(err.message || '');
      const status = msg.includes('FORBIDDEN_RESOLUTION') ? 403 : msg.includes('CASE_NOT_FOUND') ? 404 : 400;
      return res.status(status).json(buildErrorEnvelope(status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED', msg, correlationId));
    }
  });

  // 11. View Case Timeline (Strictly guarded by Party/Staff authorization check)
  router.get('/cases/:caseId/timeline', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    applyNoStoreSecurityHeaders(res, correlationId);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res
        .status(auth.status)
        .json(buildErrorEnvelope(auth.failureCode, auth.reason, correlationId, auth.reasonCode ? { reasonCode: auth.reasonCode } : undefined));
    }

    try {
      const isStaff = await isServerVerifiedStaff(auth.principal);
      await engine.getCaseSummary(auth.principal.uid, req.params.caseId, isStaff);
      const timeline = await store.getTimelineForCase(req.params.caseId);
      return res.json(buildSuccessEnvelope({ timeline, count: timeline.length }, correlationId));
    } catch (err: any) {
      const msg = String(err.message || '');
      const isForbidden = msg.includes('FORBIDDEN');
      const isNotFound = msg.includes('CASE_NOT_FOUND');
      return res
        .status(isForbidden ? 403 : isNotFound ? 404 : 500)
        .json(buildErrorEnvelope(isForbidden ? 'FORBIDDEN' : isNotFound ? 'NOT_FOUND' : 'INTERNAL_ERROR', msg, correlationId));
    }
  });

  return router;
}
