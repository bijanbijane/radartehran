/**
 * @file server/modules/payments/paymentRoutes.ts
 * @description Express routing factory for payments, callbacks, refunds, and wallet operations.
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
import type { PaymentEngine } from './paymentEngine';
import type { OriginatingBusinessModule, PaymentCurrency, PaymentPurpose } from './paymentTypes';

export function createPaymentRouter(
  engine: PaymentEngine,
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

  // 1. Create Payment Intent
  router.post('/intent', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const { businessModule, businessObjectId, purpose, amount, currency, descriptionFa, idempotencyKey, metadata } = req.body;

    const result = await engine.createPaymentIntent({
      customerUid: auth.principal.uid,
      businessModule: businessModule as OriginatingBusinessModule,
      businessObjectId,
      purpose: purpose as PaymentPurpose,
      amount: Number(amount),
      currency: (currency as PaymentCurrency) || 'IRR',
      descriptionFa: descriptionFa || 'پرداخت سفارش رادار تهران',
      idempotencyKey,
      metadata,
    });

    if (!result.success || !result.intent) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در ثبت سفارش پرداخت.', cid));
    }

    return res.status(result.replayed ? 200 : 201).json(
      buildSuccessEnvelope({ intent: result.intent, replayed: result.replayed }, cid),
    );
  });

  // 2. Start Payment Attempt
  router.post('/:intentId/attempt', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const intentId = req.params.intentId;
    const callbackUrl = req.body.callbackUrl || `https://radartehran.ir/api/payments/${intentId}/callback`;

    const result = await engine.startPaymentAttempt(intentId, callbackUrl);
    if (!result.success || !result.attempt) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در هدایت به درگاه پرداخت.', cid));
    }

    return res.json(buildSuccessEnvelope({ attempt: result.attempt, redirectUrl: result.redirectUrl }, cid));
  });

  // 3. Provider Callback & Verification Webhook
  router.post('/:intentId/callback', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const intentId = req.params.intentId;
    const providerRef = (req.body.providerTransactionReference as string) || (req.query.ref as string);

    if (!providerRef) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', 'شناسه مرجع تراکنش درگاه الزامی است.', cid));
    }

    const result = await engine.verifyAndProcessCallback({
      intentId,
      providerTransactionReference: providerRef,
      rawPayload: req.body,
    });

    if (!result.success || !result.intent) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'تایید تراکنش با خطا مواجه شد.', cid));
    }

    return res.json(
      buildSuccessEnvelope({ intent: result.intent, isDuplicateCallback: result.isDuplicateCallback }, cid),
    );
  });

  // 4. Request Refund
  router.post('/:intentId/refund', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const intentId = req.params.intentId;
    const { amount, reasonFa } = req.body;

    const result = await engine.executeRefund({
      paymentIntentId: intentId,
      amount: Number(amount),
      reasonFa: reasonFa || 'درخواست استرداد وجه',
      requestedByUid: auth.principal.uid,
    });

    if (!result.success || !result.refund) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در استرداد وجه.', cid));
    }

    return res.json(buildSuccessEnvelope({ refund: result.refund }, cid));
  });

  // 5. Wallet Balance
  router.get('/wallet/balance', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const currency = (req.query.currency as PaymentCurrency) || 'IRR';
    const balance = await engine.getWalletBalance(auth.principal.uid, currency);

    return res.json(buildSuccessEnvelope({ ownerUid: auth.principal.uid, currency, balance }, cid));
  });

  return router;
}
