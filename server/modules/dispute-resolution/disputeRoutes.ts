/**
 * @file server/modules/dispute-resolution/disputeRoutes.ts
 * @description Express routing factory for Dispute Resolution and Case Management endpoints.
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
import type { DisputeResolutionEngine } from './disputeEngine';
import type { DisputeRepository } from './disputeStore';
import type { CaseStatus, DisputeCategory, ResolutionOutcomeType } from './disputeTypes';

export function createDisputeRouter(
  engine: DisputeResolutionEngine,
  store: DisputeRepository,
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

  // 1. Create Dispute Case
  router.post('/cases', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode || 'UNAUTHENTICATED', auth.reason || 'احراز هویت الزامی است.', correlationId));
    }

    try {
      const { category, titleFa, descriptionFa, respondentUid, propertyReferenceId, transactionReferenceId, idempotencyKey } = req.body;
      const result = await engine.createDisputeCase(auth.principal.uid, {
        category: category as DisputeCategory,
        titleFa,
        descriptionFa,
        respondentUid,
        propertyReferenceId,
        transactionReferenceId,
        idempotencyKey,
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
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode || 'UNAUTHENTICATED', auth.reason || 'احراز هویت الزامی است.', correlationId));
    }

    try {
      const status = req.query.status as CaseStatus | undefined;
      const cases = await store.listCasesForUser(auth.principal.uid, { status });
      return res.json(buildSuccessEnvelope({ cases, total: cases.length }, correlationId));
    } catch (err: any) {
      return res.status(500).json(buildErrorEnvelope('INTERNAL_ERROR', err.message, correlationId));
    }
  });

  // 3. Get Case Details & Summary
  router.get('/cases/:caseId', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode || 'UNAUTHENTICATED', auth.reason || 'احراز هویت الزامی است.', correlationId));
    }

    try {
      const isStaffOrMediator = auth.principal.role === 'admin' || auth.principal.role === 'support' || auth.principal.role === 'mediator';
      const summary = await engine.getCaseSummary(auth.principal.uid, req.params.caseId, isStaffOrMediator);
      return res.json(buildSuccessEnvelope(summary, correlationId));
    } catch (err: any) {
      const isForbidden = err.message?.includes('FORBIDDEN');
      return res.status(isForbidden ? 403 : 404).json(buildErrorEnvelope(isForbidden ? 'FORBIDDEN' : 'NOT_FOUND', err.message, correlationId));
    }
  });

  // 4. Add Claim to Case
  router.post('/cases/:caseId/claims', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode || 'UNAUTHENTICATED', auth.reason || 'احراز هویت الزامی است.', correlationId));
    }

    try {
      const { titleFa, factualAccountFa, requestedRemedyFa, claimedAmountRials, currency } = req.body;
      const claim = await engine.addClaim(auth.principal.uid, req.params.caseId, {
        titleFa,
        factualAccountFa,
        requestedRemedyFa,
        claimedAmountRials,
        currency,
      });
      return res.status(201).json(buildSuccessEnvelope(claim, correlationId));
    } catch (err: any) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', err.message, correlationId));
    }
  });

  // 5. Submit Response to Claim
  router.post('/claims/:claimId/responses', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode || 'UNAUTHENTICATED', auth.reason || 'احراز هویت الزامی است.', correlationId));
    }

    try {
      const { stance, statementFa, counterClaimId } = req.body;
      const response = await engine.submitClaimResponse(auth.principal.uid, req.params.claimId, {
        stance,
        statementFa,
        counterClaimId,
      });
      return res.status(201).json(buildSuccessEnvelope(response, correlationId));
    } catch (err: any) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', err.message, correlationId));
    }
  });

  // 6. Attach Evidence Reference
  router.post('/cases/:caseId/evidence', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode || 'UNAUTHENTICATED', auth.reason || 'احراز هویت الزامی است.', correlationId));
    }

    try {
      const { evidenceType, descriptionFa, sourceMediaId, confidentiality, claimId } = req.body;
      const evidence = await engine.attachEvidence(auth.principal.uid, req.params.caseId, {
        evidenceType,
        descriptionFa,
        sourceMediaId,
        confidentiality,
        claimId,
      });
      return res.status(201).json(buildSuccessEnvelope(evidence, correlationId));
    } catch (err: any) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', err.message, correlationId));
    }
  });

  // 7. Create Negotiation Proposal
  router.post('/cases/:caseId/proposals', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode || 'UNAUTHENTICATED', auth.reason || 'احراز هویت الزامی است.', correlationId));
    }

    try {
      const { proposalTermsFa, proposedFinancialRemedyRials, validUntilIso } = req.body;
      const proposal = await engine.createNegotiationProposal(auth.principal.uid, req.params.caseId, {
        proposalTermsFa,
        proposedFinancialRemedyRials,
        validUntilIso,
      });
      return res.status(201).json(buildSuccessEnvelope(proposal, correlationId));
    } catch (err: any) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', err.message, correlationId));
    }
  });

  // 8. Accept Proposal (Generates bilateral SettlementAgreement on dual signatures)
  router.post('/proposals/:proposalId/accept', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode || 'UNAUTHENTICATED', auth.reason || 'احراز هویت الزامی است.', correlationId));
    }

    try {
      const outcome = await engine.acceptProposal(auth.principal.uid, req.params.proposalId);
      return res.json(buildSuccessEnvelope(outcome, correlationId));
    } catch (err: any) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', err.message, correlationId));
    }
  });

  // 9. Transition Case Status
  router.post('/cases/:caseId/transition', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode || 'UNAUTHENTICATED', auth.reason || 'احراز هویت الزامی است.', correlationId));
    }

    try {
      const { targetStatus, reasonFa } = req.body;
      const updated = await engine.transitionCaseStatus(auth.principal.uid, req.params.caseId, targetStatus as CaseStatus, reasonFa || '');
      return res.json(buildSuccessEnvelope(updated, correlationId));
    } catch (err: any) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', err.message, correlationId));
    }
  });

  // 10. Record Final Resolution Outcome
  router.post('/cases/:caseId/resolve', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode || 'UNAUTHENTICATED', auth.reason || 'احراز هویت الزامی است.', correlationId));
    }

    try {
      const { outcomeType, explanationFa, settlementAgreementId } = req.body;
      const resolved = await engine.recordResolutionOutcome(auth.principal.uid, req.params.caseId, {
        outcomeType: outcomeType as ResolutionOutcomeType,
        explanationFa,
        settlementAgreementId,
      });
      return res.json(buildSuccessEnvelope(resolved, correlationId));
    } catch (err: any) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', err.message, correlationId));
    }
  });

  // 11. View Case Timeline
  router.get('/cases/:caseId/timeline', async (req: Request, res: Response) => {
    const correlationId = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode || 'UNAUTHENTICATED', auth.reason || 'احراز هویت الزامی است.', correlationId));
    }

    try {
      const timeline = await store.getTimelineForCase(req.params.caseId);
      return res.json(buildSuccessEnvelope({ timeline, count: timeline.length }, correlationId));
    } catch (err: any) {
      return res.status(500).json(buildErrorEnvelope('INTERNAL_ERROR', err.message, correlationId));
    }
  });

  return router;
}
