/**
 * @file server/modules/real-estate-transactions/routes.ts
 * @description RT-TRANSACTION-CRITICAL-030 — Official Express Router for all 13 Real Estate
 * Transactions endpoints (REAL_ESTATE_TRANSACTIONS_ROUTE_REGISTRATION_SPEC).
 * Enforces fail-closed auth, participant authorization, Idempotency-Key, CAS, and 503 dependency gating.
 */
import type { Express, Request, Response } from 'express';
import {
  extractSingleSecurityHeader,
  verifyAuthenticatedUserHeader,
} from '../../../src/utils/serverAdminAndTelegramSecurity';
import { RealEstateTransactionError, type TransactionActorContext } from './types';
import type { DurableRealEstateTransactionService } from './firestoreStore';

export interface MountRealEstateTransactionsRoutesOptions {
  service?: DurableRealEstateTransactionService | null;
  verifyUser?: (
    headers: Record<string, string | string[] | undefined>,
  ) => Promise<{ authorized: boolean; uid?: string; isAdmin?: boolean; statusCode: number; reason?: string }>;
}

const mountedApps = new WeakSet<Express>();

function handleTxError(res: Response, err: unknown): void {
  if (err instanceof RealEstateTransactionError) {
    res.status(err.statusCode || 400).json({ status: 'error', code: err.code, message: err.message });
    return;
  }
  const msg = err instanceof Error ? err.message : 'INTERNAL_ERROR';
  res.status(500).json({ status: 'error', code: 'INTERNAL_TRANSACTION_ERROR', message: msg });
}

function getIdempotencyKeyOrReject(req: Request, res: Response): string | null {
  const hdr = extractSingleSecurityHeader(req.headers as Record<string, string | string[] | undefined>, 'idempotency-key');
  const key = hdr.ok && hdr.value ? hdr.value.trim() : typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
  if (key.length < 6 || key.length > 128) {
    res.status(400).json({ status: 'error', code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'هدر Idempotency-Key الزامی است.' });
    return null;
  }
  return key;
}

export function registerRealEstateTransactionsRoutes(
  app: Express,
  options?: MountRealEstateTransactionsRoutesOptions,
): void {
  if (mountedApps.has(app)) return;
  mountedApps.add(app);

  const authUser = options?.verifyUser ?? ((h) => verifyAuthenticatedUserHeader(h));

  async function requireActorAndService(
    req: Request,
    res: Response,
  ): Promise<{ actor: TransactionActorContext; service: DurableRealEstateTransactionService } | null> {
    res.setHeader('Cache-Control', 'no-store');
    if (!options?.service) {
      res.status(503).json({
        status: 'error',
        code: 'REAL_ESTATE_TRANSACTION_DEPENDENCY_UNAVAILABLE',
        message: 'زیرساخت پایدار معاملات ملکی هنوز به وابستگی‌های رسمی متصل نشده است.',
      });
      return null;
    }
    const auth = await authUser(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) {
      res.status(auth.statusCode || 401).json({ status: 'error', code: auth.reason || 'UNAUTHORIZED' });
      return null;
    }
    const actor: TransactionActorContext = {
      userId: auth.uid,
      partyId: auth.uid,
      role: 'isAdmin' in auth && auth.isAdmin ? 'PLATFORM_VERIFIER_OR_ADMIN' : 'PARTICIPANT',
    };
    return { actor, service: options.service };
  }

  // 1. Create Transaction Case
  app.post('/api/v1/real-estate-transactions/cases', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const idempotencyKey = getIdempotencyKeyOrReject(req, res);
      if (!idempotencyKey) return;
      const out = await ctx.service.createTransactionCase(ctx.actor, {
        transactionType: req.body?.transactionType,
        propertyId: String(req.body?.propertyId || ''),
        jurisdictionCitySlug: String(req.body?.jurisdictionCitySlug || 'tehran'),
        sourceProvenance: String(req.body?.sourceProvenance || 'api_v1'),
        listingReferenceId: typeof req.body?.listingReferenceId === 'string' ? req.body.listingReferenceId : undefined,
        listingAskingPriceRials: typeof req.body?.listingAskingPriceRials === 'number' ? req.body.listingAskingPriceRials : undefined,
        idempotencyKey,
      });
      res.status(out.replayed ? 200 : 201).json({ status: 'ok', ...out });
    } catch (err) {
      handleTxError(res, err);
    }
  });

  // 2. Get Transaction Case
  app.get('/api/v1/real-estate-transactions/cases/:transactionId', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const out = await ctx.service.getTransactionCaseById(ctx.actor, String(req.params.transactionId));
      res.status(200).json({ status: 'ok', ...out });
    } catch (err) {
      handleTxError(res, err);
    }
  });

  // 3. Invite Participant
  app.post('/api/v1/real-estate-transactions/cases/:transactionId/participants', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const idempotencyKey = getIdempotencyKeyOrReject(req, res);
      if (!idempotencyKey) return;
      const participant = await ctx.service.inviteParticipant(ctx.actor, {
        transactionId: String(req.params.transactionId),
        partyId: String(req.body?.partyId || ''),
        role: req.body?.role,
        authorizationScope: String(req.body?.authorizationScope || 'standard'),
        supportingEvidenceReference: typeof req.body?.supportingEvidenceReference === 'string' ? req.body.supportingEvidenceReference : undefined,
        expectedRevision: typeof req.body?.expectedRevision === 'number' ? req.body.expectedRevision : undefined,
        idempotencyKey,
      });
      res.status(201).json({ status: 'ok', participant });
    } catch (err) {
      handleTxError(res, err);
    }
  });

  // 4. Respond to Participant Invitation
  app.post('/api/v1/real-estate-transactions/cases/:transactionId/participants/:participantId/respond', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const participant = await ctx.service.respondToParticipantInvitation(ctx.actor, {
        transactionId: String(req.params.transactionId),
        participantId: String(req.params.participantId),
        response: req.body?.response === 'DECLINED' ? 'DECLINED' : 'ACCEPTED',
      });
      res.status(200).json({ status: 'ok', participant });
    } catch (err) {
      handleTxError(res, err);
    }
  });

  // 5. Submit Offer / Counteroffer
  app.post('/api/v1/real-estate-transactions/cases/:transactionId/offers', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const idempotencyKey = getIdempotencyKeyOrReject(req, res);
      if (!idempotencyKey) return;
      const out = await ctx.service.submitOfferOrCounteroffer(ctx.actor, {
        transactionId: String(req.params.transactionId),
        offerType: req.body?.offerType || 'PURCHASE_OFFER',
        proposedPriceRials: Number(req.body?.proposedPriceRials),
        recipientPartyIds: Array.isArray(req.body?.recipientPartyIds) ? req.body.recipientPartyIds : [],
        conditions: Array.isArray(req.body?.conditions) ? req.body.conditions : [],
        supersedesOfferId: typeof req.body?.supersedesOfferId === 'string' ? req.body.supersedesOfferId : undefined,
        idempotencyKey,
      });
      res.status(out.replayed ? 200 : 201).json({ status: 'ok', ...out });
    } catch (err) {
      handleTxError(res, err);
    }
  });

  // 6. Decide on Offer
  app.post('/api/v1/real-estate-transactions/cases/:transactionId/offers/:offerId/decision', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const out = await ctx.service.decideOnOffer(ctx.actor, {
        transactionId: String(req.params.transactionId),
        offerId: String(req.params.offerId),
        decision: req.body?.decision,
        expectedRevision: typeof req.body?.expectedRevision === 'number' ? req.body.expectedRevision : undefined,
      });
      res.status(200).json({ status: 'ok', ...out });
    } catch (err) {
      handleTxError(res, err);
    }
  });

  // 7. Upsert Contract Metadata
  app.post('/api/v1/real-estate-transactions/cases/:transactionId/contract-metadata', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const contract = await ctx.service.upsertContractMetadata(ctx.actor, {
        transactionId: String(req.params.transactionId),
        contractType: req.body?.contractType || 'SALE_CONTRACT',
        mediaDocumentId: String(req.body?.mediaDocumentId || ''),
        contractingPartyIds: Array.isArray(req.body?.contractingPartyIds) ? req.body.contractingPartyIds : [ctx.actor.partyId],
      });
      res.status(201).json({ status: 'ok', contract });
    } catch (err) {
      handleTxError(res, err);
    }
  });

  // 8. Transition Contract Workflow State
  app.post('/api/v1/real-estate-transactions/cases/:transactionId/contract-metadata/transition', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const contract = await ctx.service.transitionContractWorkflowState(ctx.actor, {
        transactionId: String(req.params.transactionId),
        contractId: String(req.body?.contractId || ''),
        executionStatus: req.body?.executionStatus,
      });
      res.status(200).json({ status: 'ok', contract });
    } catch (err) {
      handleTxError(res, err);
    }
  });

  // 9. Upsert Closing Milestone
  app.post('/api/v1/real-estate-transactions/cases/:transactionId/milestones', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const milestone = await ctx.service.upsertClosingMilestone(ctx.actor, {
        transactionId: String(req.params.transactionId),
        titleFa: String(req.body?.titleFa || 'مرحله تکمیل'),
        epistemicStatus: req.body?.epistemicStatus || 'PLANNED_MILESTONE',
        evidenceReferences: Array.isArray(req.body?.evidenceReferences) ? req.body.evidenceReferences : [],
      });
      res.status(201).json({ status: 'ok', milestone });
    } catch (err) {
      handleTxError(res, err);
    }
  });

  // 10. Record Verified Payment Reference
  app.post('/api/v1/real-estate-transactions/cases/:transactionId/payment-references', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const paymentReference = await ctx.service.recordVerifiedPaymentReference(ctx.actor, {
        transactionId: String(req.params.transactionId),
        paymentRef: String(req.body?.paymentRef || ''),
      });
      res.status(201).json({ status: 'ok', paymentReference });
    } catch (err) {
      handleTxError(res, err);
    }
  });

  // 11. Complete Transaction Case
  app.post('/api/v1/real-estate-transactions/cases/:transactionId/complete', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const out = await ctx.service.completeTransactionCase(ctx.actor, {
        transactionId: String(req.params.transactionId),
        finalPaymentRef: String(req.body?.finalPaymentRef || ''),
        ownershipTransferRef: typeof req.body?.ownershipTransferRef === 'string' ? req.body.ownershipTransferRef : undefined,
        expectedRevision: typeof req.body?.expectedRevision === 'number' ? req.body.expectedRevision : undefined,
      });
      res.status(200).json({ status: 'ok', ...out });
    } catch (err) {
      handleTxError(res, err);
    }
  });

  // 12. Record Cancellation / Termination / Dispute
  app.post('/api/v1/real-estate-transactions/cases/:transactionId/cancellation-or-dispute', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const mode = req.body?.mode === 'DISPUTED' ? 'DISPUTED' : req.body?.mode === 'TERMINATED' ? 'TERMINATED' : 'CANCELLED';
      const out = await ctx.service.recordCancellationTerminationOrDispute(ctx.actor, {
        transactionId: String(req.params.transactionId),
        mode,
        reasonFa: String(req.body?.reasonFa || 'ثبت لغو یا اختلاف'),
      });
      res.status(200).json({ status: 'ok', ...out });
    } catch (err) {
      handleTxError(res, err);
    }
  });

  // 13. Query Property Transaction History
  app.get('/api/v1/real-estate-transactions/properties/:canonicalPropertyId/history', async (req: Request, res: Response) => {
    try {
      const ctx = await requireActorAndService(req, res);
      if (!ctx) return;
      const page = await ctx.service.store.listTransactionsByProperty(String(req.params.canonicalPropertyId), {
        limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : 20,
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
      });
      // Filter to transactions where caller is a participant or platform admin
      const visible = ctx.actor.role === 'PLATFORM_VERIFIER_OR_ADMIN'
        ? page.items
        : page.items.filter((t) => t.initiatorPartyId === ctx.actor.partyId || t.participantIds.includes(ctx.actor.partyId));
      res.status(200).json({ status: 'ok', items: visible, nextCursor: page.nextCursor, hasMore: page.hasMore });
    } catch (err) {
      handleTxError(res, err);
    }
  });
}
