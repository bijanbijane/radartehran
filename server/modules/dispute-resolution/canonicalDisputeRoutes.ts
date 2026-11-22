/**
 * @file server/modules/dispute-resolution/canonicalDisputeRoutes.ts
 * @description RT-DISPUTE-CRITICAL-031 — Official Express Router for `/api/disputes/*`
 * backed strictly by CanonicalDisputeResolutionService + FirestoreDisputeResolutionStore.
 * Fails closed with 503 DISPUTE_RESOLUTION_DEPENDENCY_UNAVAILABLE when dependencies are unwired.
 */
import type { Express, Request, Response } from 'express';
import {
  extractSingleSecurityHeader,
  verifyAuthenticatedUserHeader,
} from '../../../src/utils/serverAdminAndTelegramSecurity';
import type { CaseStatus, DisputeCategory, ResolutionOutcomeType } from './disputeTypes';
import {
  CanonicalDisputeError,
  type CanonicalDisputeActor,
  type CanonicalDisputeResolutionService,
} from './canonicalDisputeService';

export interface MountDisputeResolutionRoutesOptions {
  service?: CanonicalDisputeResolutionService | null;
  verifyUser?: (
    headers: Record<string, string | string[] | undefined>,
  ) => Promise<{
    authorized: boolean;
    uid?: string;
    isAdmin?: boolean;
    serverRole?: 'MEDIATOR' | 'CASE_HANDLER' | 'AUTHORIZED_REVIEWER' | null;
    statusCode: number;
    reason?: string;
  }>;
}

const mountedApps = new WeakSet<Express>();

function handleDisputeError(res: Response, err: unknown): void {
  if (err instanceof CanonicalDisputeError) {
    res.status(err.statusCode || 400).json({ status: 'error', code: err.code, message: err.message });
    return;
  }
  const msg = err instanceof Error ? err.message : 'INTERNAL_DISPUTE_ERROR';
  res.status(500).json({ status: 'error', code: 'INTERNAL_DISPUTE_ERROR', message: msg });
}

function getIdempotencyKeyOrReject(req: Request, res: Response): string | null {
  const hdr = extractSingleSecurityHeader(req.headers as Record<string, string | string[] | undefined>, 'idempotency-key');
  const key =
    hdr.ok && hdr.value
      ? hdr.value.trim()
      : typeof req.body?.idempotencyKey === 'string'
        ? req.body.idempotencyKey.trim()
        : '';
  if (key.length < 6 || key.length > 128) {
    res.status(400).json({ status: 'error', code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'هدر Idempotency-Key الزامی است.' });
    return null;
  }
  return key;
}

export function registerDisputeResolutionRoutes(
  app: Express,
  options?: MountDisputeResolutionRoutesOptions,
): void {
  if (mountedApps.has(app)) return;
  mountedApps.add(app);

  const authUser = options?.verifyUser ?? ((h) => verifyAuthenticatedUserHeader(h));

  async function requireActorAndService(
    req: Request,
    res: Response,
  ): Promise<{ actor: CanonicalDisputeActor; service: CanonicalDisputeResolutionService } | null> {
    res.setHeader('Cache-Control', 'no-store');
    if (!options?.service) {
      res.status(503).json({
        status: 'error',
        code: 'DISPUTE_RESOLUTION_DEPENDENCY_UNAVAILABLE',
        message: 'زیرساخت پایدار حل اختلاف هنوز به وابستگی‌های رسمی متصل نشده است.',
      });
      return null;
    }
    const auth = await authUser(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      res.status(auth.statusCode || 401).json({ status: 'error', code: auth.reason || 'UNAUTHORIZED' });
      return null;
    }
    const actor: CanonicalDisputeActor = {
      uid: auth.uid,
      serverRole:
        'serverRole' in auth && auth.serverRole
          ? auth.serverRole
          : 'isAdmin' in auth && auth.isAdmin
            ? 'AUTHORIZED_REVIEWER'
            : null,
    };
    return { actor, service: options.service };
  }

  // 1. Create Dispute Case
  app.post('/api/disputes/cases', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const idempotencyKey = getIdempotencyKeyOrReject(req, res);
      if (!idempotencyKey) return;
      const out = await ctx.service.createDisputeCase(ctx.actor, {
        category: req.body?.category as DisputeCategory,
        titleFa: String(req.body?.titleFa || ''),
        descriptionFa: String(req.body?.descriptionFa || ''),
        respondentUid: String(req.body?.respondentUid || ''),
        propertyReferenceId: typeof req.body?.propertyReferenceId === 'string' ? req.body.propertyReferenceId : undefined,
        transactionReferenceId: typeof req.body?.transactionReferenceId === 'string' ? req.body.transactionReferenceId : undefined,
        assignedMediatorUid: typeof req.body?.assignedMediatorUid === 'string' ? req.body.assignedMediatorUid : undefined,
        idempotencyKey,
      });
      res.status(out.replayed ? 200 : 201).json({ status: 'ok', ...out });
    } catch (err) {
      handleDisputeError(res, err);
    }
  });

  // 2. List authenticated user's cases
  app.get('/api/disputes/my-cases', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const status = typeof req.query.status === 'string' ? (req.query.status as CaseStatus) : undefined;
      const cases = await ctx.service.store.listCasesForUser(ctx.actor.uid, status);
      res.status(200).json({ status: 'ok', cases, total: cases.length });
    } catch (err) {
      handleDisputeError(res, err);
    }
  });

  // 3. Get Case Summary (with confidentiality redaction)
  app.get('/api/disputes/cases/:caseId', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const summary = await ctx.service.getCaseSummary(ctx.actor, String(req.params.caseId));
      res.status(200).json({ status: 'ok', ...summary });
    } catch (err) {
      handleDisputeError(res, err);
    }
  });

  // 4. Add Claim
  app.post('/api/disputes/cases/:caseId/claims', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const claim = await ctx.service.addClaim(ctx.actor, String(req.params.caseId), {
        titleFa: String(req.body?.titleFa || ''),
        factualAccountFa: String(req.body?.factualAccountFa || ''),
        requestedRemedyFa: String(req.body?.requestedRemedyFa || ''),
        claimedAmountRials: typeof req.body?.claimedAmountRials === 'number' ? req.body.claimedAmountRials : undefined,
        expectedRevision: typeof req.body?.expectedRevision === 'number' ? req.body.expectedRevision : undefined,
      });
      res.status(201).json({ status: 'ok', claim });
    } catch (err) {
      handleDisputeError(res, err);
    }
  });

  // 5. Submit Claim Response
  app.post('/api/disputes/claims/:claimId/responses', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const response = await ctx.service.submitClaimResponse(ctx.actor, String(req.params.claimId), {
        stance: req.body?.stance || 'DENIED',
        statementFa: String(req.body?.statementFa || ''),
      });
      res.status(201).json({ status: 'ok', response });
    } catch (err) {
      handleDisputeError(res, err);
    }
  });

  // 6. Attach Evidence Reference
  app.post('/api/disputes/cases/:caseId/evidence', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const evidence = await ctx.service.attachEvidence(ctx.actor, String(req.params.caseId), {
        evidenceType: req.body?.evidenceType || 'CONTRACT',
        descriptionFa: String(req.body?.descriptionFa || ''),
        sourceMediaId: String(req.body?.sourceMediaId || ''),
        confidentiality: req.body?.confidentiality,
        claimId: typeof req.body?.claimId === 'string' ? req.body.claimId : undefined,
      });
      res.status(201).json({ status: 'ok', evidence });
    } catch (err) {
      handleDisputeError(res, err);
    }
  });

  // 7. Create Settlement Proposal
  app.post('/api/disputes/cases/:caseId/proposals', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const proposal = await ctx.service.createSettlementProposal(ctx.actor, String(req.params.caseId), {
        proposalTermsFa: String(req.body?.proposalTermsFa || ''),
        proposedFinancialRemedyRials:
          typeof req.body?.proposedFinancialRemedyRials === 'number' ? req.body.proposedFinancialRemedyRials : undefined,
        validUntilIso: String(req.body?.validUntilIso || new Date(Date.now() + 7 * 86_400_000).toISOString()),
      });
      res.status(201).json({ status: 'ok', proposal });
    } catch (err) {
      handleDisputeError(res, err);
    }
  });

  // 8. Accept Settlement Proposal (bilateral consent required)
  app.post('/api/disputes/proposals/:proposalId/accept', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const out = await ctx.service.acceptSettlementProposal(ctx.actor, String(req.params.proposalId), {
        expectedCaseRevision: typeof req.body?.expectedCaseRevision === 'number' ? req.body.expectedCaseRevision : undefined,
      });
      res.status(200).json({ status: 'ok', ...out });
    } catch (err) {
      handleDisputeError(res, err);
    }
  });

  // 9. Transition Case Status
  app.post('/api/disputes/cases/:caseId/transition', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const updated = await ctx.service.transitionCaseStatus(ctx.actor, String(req.params.caseId), {
        targetStatus: req.body?.targetStatus as CaseStatus,
        reasonFa: String(req.body?.reasonFa || ''),
        expectedRevision: typeof req.body?.expectedRevision === 'number' ? req.body.expectedRevision : undefined,
      });
      res.status(200).json({ status: 'ok', caseRecord: updated });
    } catch (err) {
      handleDisputeError(res, err);
    }
  });

  // 10. Record Final Resolution Outcome (Neutral Mediator / Reviewer only)
  app.post('/api/disputes/cases/:caseId/resolve', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const out = await ctx.service.recordResolutionOutcome(ctx.actor, String(req.params.caseId), {
        outcomeType: req.body?.outcomeType as ResolutionOutcomeType,
        explanationFa: String(req.body?.explanationFa || ''),
        settlementId: typeof req.body?.settlementId === 'string' ? req.body.settlementId : undefined,
        verifiedPaymentRef: typeof req.body?.verifiedPaymentRef === 'string' ? req.body.verifiedPaymentRef : undefined,
        expectedRevision: typeof req.body?.expectedRevision === 'number' ? req.body.expectedRevision : undefined,
      });
      res.status(200).json({ status: 'ok', ...out });
    } catch (err) {
      handleDisputeError(res, err);
    }
  });

  // 11. View Immutable Case Timeline
  app.get('/api/disputes/cases/:caseId/timeline', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      await ctx.service.getCaseSummary(ctx.actor, String(req.params.caseId));
      const page = await ctx.service.store.listHistoryForCase(String(req.params.caseId), {
        limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : 50,
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
      });
      res.status(200).json({ status: 'ok', timeline: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore });
    } catch (err) {
      handleDisputeError(res, err);
    }
  });
}
