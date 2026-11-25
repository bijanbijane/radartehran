/**
 * @file server/modules/payments/paymentRoutes.ts
 * @description Express routing factory for payments, callbacks, refunds, and wallet operations.
 */

import crypto from 'node:crypto';
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

export interface PaymentRouterSecurityOptions {
  readonly webhookHmacSecret?: string;
}

export function computePaymentCallbackHmac(rawPayload: unknown, secret: string): string {
  const serialized = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload ?? {});
  return crypto.createHmac('sha256', secret).update(serialized, 'utf8').digest('hex');
}

export function verifyPaymentCallbackHmac(
  req: Request,
  secret: string | undefined,
): { valid: boolean; reason?: string } {
  if (!secret || secret.trim().length < 16) {
    return { valid: false, reason: 'WEBHOOK_SECRET_NOT_CONFIGURED' };
  }
  const sigHeader = req.headers['x-payment-signature'] ?? req.headers['x-webhook-signature'];
  const supplied = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
  if (!supplied || typeof supplied !== 'string') {
    return { valid: false, reason: 'MISSING_WEBHOOK_SIGNATURE' };
  }
  const cleaned = supplied.replace(/^sha256=/i, '').trim();
  const expected = computePaymentCallbackHmac(req.body, secret);
  if (cleaned.length !== expected.length) {
    return { valid: false, reason: 'INVALID_WEBHOOK_SIGNATURE' };
  }
  const matched = crypto.timingSafeEqual(Buffer.from(cleaned, 'utf8'), Buffer.from(expected, 'utf8'));
  return matched ? { valid: true } : { valid: false, reason: 'INVALID_WEBHOOK_SIGNATURE' };
}

export function createPaymentRouter(
  engine: PaymentEngine,
  tokenVerifier?: FirebaseTokenVerifierAdapter | null,
  securityOptions?: PaymentRouterSecurityOptions,
): Router {
  const router = Router();
  const webhookSecret = securityOptions?.webhookHmacSecret ?? process.env.PAYMENT_WEBHOOK_SECRET;

  async function resolvePrincipal(req: Request) {
    if (!tokenVerifier || typeof tokenVerifier.verifyIdToken !== 'function') {
      return {
        ok: false,
        status: 503,
        failureCode: 'INTERNAL_ERROR' as CanonicalApiErrorCode,
        reason: 'سرویس احراز هویت پرداخت در دسترس نیست (Fail-Closed).',
      };
    }
    const ext = await extractAuthenticatedPrincipal(req, tokenVerifier, { requireVerifiedEmail: true });
    return {
      ok: ext.ok,
      principal: ext.principal,
      status: ext.status ?? 401,
      failureCode: (ext.status === 403 ? 'FORBIDDEN' : 'UNAUTHENTICATED') as CanonicalApiErrorCode,
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

    const result = await engine.startPaymentAttempt(intentId, callbackUrl, auth.principal.uid);
    if (!result.success || !result.attempt) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در هدایت به درگاه پرداخت.', cid));
    }

    return res.json(buildSuccessEnvelope({ attempt: result.attempt, redirectUrl: result.redirectUrl }, cid));
  });

  // 3. Provider Callback & Verification Webhook (HMAC-SHA256 fail-closed)
  router.post('/:intentId/callback', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const sigCheck = verifyPaymentCallbackHmac(req, webhookSecret);
    if (!sigCheck.valid) {
      const status = sigCheck.reason === 'WEBHOOK_SECRET_NOT_CONFIGURED' ? 503 : 401;
      return res.status(status).json(
        buildErrorEnvelope('UNAUTHENTICATED', 'امضای دیجیتال وب‌هوک درگاه پرداخت معتبر نیست.', cid, {
          reasonCode: sigCheck.reason,
        }),
      );
    }

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
