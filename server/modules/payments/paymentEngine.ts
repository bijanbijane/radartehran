/**
 * @file server/modules/payments/paymentEngine.ts
 * @description Core business logic engine for payments, ledger posting, wallet balances,
 * refunds, commissions, and settlement payouts.
 */

import crypto from 'node:crypto';
import type { PaymentProviderAdapter } from './paymentAdapters';
import { FinancialLedgerEngine } from './paymentLedger';
import type { PaymentRepository } from './paymentStore';
import type {
  CommissionRecord,
  OriginatingBusinessModule,
  PaymentAttempt,
  PaymentCurrency,
  PaymentDomainEvent,
  PaymentIntent,
  PaymentPurpose,
  ReconciliationDiscrepancy,
  RefundRecord,
  SettlementRecord,
  WalletAccount,
} from './paymentTypes';

export class PaymentEngine {
  public readonly domainEvents: PaymentDomainEvent[] = [];

  constructor(
    private readonly store: PaymentRepository,
    private readonly ledger: FinancialLedgerEngine,
    private readonly provider: PaymentProviderAdapter,
  ) {}

  public async createPaymentIntent(params: {
    customerUid: string;
    businessModule: OriginatingBusinessModule;
    businessObjectId: string;
    purpose: PaymentPurpose;
    amount: number; // Integer minor units
    currency: PaymentCurrency;
    descriptionFa: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; errors?: string[]; intent?: PaymentIntent; replayed?: boolean }> {
    if (!params.customerUid) return { success: false, errors: ['CUSTOMER_UID_REQUIRED'] };
    if (!Number.isInteger(params.amount) || params.amount <= 0) {
      return { success: false, errors: ['INVALID_AMOUNT: مبلغ باید عدد صحیح مثبت باشد.'] };
    }
    if (params.currency !== 'IRR' && params.currency !== 'IRT') {
      return { success: false, errors: ['INVALID_CURRENCY: واحد پولی پشتیبانی نمی‌شود.'] };
    }

    const idempotencyKey = params.idempotencyKey || `idemp_pi_${crypto.randomBytes(6).toString('hex')}`;
    const existing = await this.store.getIntentByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.customerUid !== params.customerUid || existing.amount !== params.amount) {
        return { success: false, errors: ['IDEMPOTENCY_KEY_COLLISION'] };
      }
      return { success: true, intent: existing, replayed: true };
    }

    const nowIso = new Date().toISOString();
    const expiresAtIso = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes
    const intentId = `pi_${crypto.randomBytes(6).toString('hex')}`;

    const intent: PaymentIntent = {
      id: intentId,
      customerUid: params.customerUid,
      businessModule: params.businessModule,
      businessObjectId: params.businessObjectId,
      purpose: params.purpose,
      amount: params.amount,
      currency: params.currency,
      descriptionFa: params.descriptionFa,
      providerId: this.provider.providerId,
      idempotencyKey,
      lifecycleState: 'CREATED',
      expiresAtIso,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      metadata: params.metadata,
      refundedAmount: 0,
    };

    const saved = await this.store.saveIntent(intent);

    this.emitEvent({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'payment.intent_created',
      paymentIntentId: saved.id,
      customerUid: saved.customerUid,
      businessModule: saved.businessModule,
      businessObjectId: saved.businessObjectId,
      amount: saved.amount,
      currency: saved.currency,
      timestampIso: nowIso,
      summaryFa: `سفارش پرداخت ایجاد شد (${saved.amount} ${saved.currency}).`,
    });

    return { success: true, intent: saved };
  }

  public async startPaymentAttempt(
    intentId: string,
    callbackUrl: string,
    requesterUid: string,
  ): Promise<{ success: boolean; errors?: string[]; attempt?: PaymentAttempt; redirectUrl?: string }> {
    const intent = await this.store.getIntentById(intentId);
    if (!intent) return { success: false, errors: ['INTENT_NOT_FOUND'] };
    if (!requesterUid || intent.customerUid !== requesterUid) {
      return { success: false, errors: ['PAYMENT_INTENT_FORBIDDEN'] };
    }

    if (intent.lifecycleState === 'SUCCEEDED') {
      return { success: false, errors: ['PAYMENT_ALREADY_SUCCEEDED'] };
    }
    if (intent.lifecycleState === 'EXPIRED' || new Date(intent.expiresAtIso).getTime() < Date.now()) {
      return { success: false, errors: ['PAYMENT_INTENT_EXPIRED'] };
    }

    const previousAttempts = await this.store.getAttemptsForIntent(intentId);
    const attemptNumber = previousAttempts.length + 1;
    const nowIso = new Date().toISOString();

    const initResult = await this.provider.initiatePayment({
      intentId: intent.id,
      amount: intent.amount,
      currency: intent.currency,
      callbackUrl,
      customerUid: intent.customerUid,
      descriptionFa: intent.descriptionFa,
    });

    const attemptId = `att_${crypto.randomBytes(6).toString('hex')}`;
    const attempt: PaymentAttempt = {
      id: attemptId,
      intentId: intent.id,
      attemptNumber,
      providerId: this.provider.providerId,
      providerTransactionReference: initResult.providerTransactionReference,
      redirectUrl: initResult.redirectUrl,
      startedAtIso: nowIso,
      isSuccess: false,
      verificationStatus: 'PENDING',
      normalizedErrorCode: initResult.errorCode,
      errorMessageFa: initResult.errorMessageFa,
    };

    await this.store.saveAttempt(attempt);

    if (!initResult.success) {
      await this.store.saveIntent({
        ...intent,
        lifecycleState: 'FAILED',
        failureReasonFa: initResult.errorMessageFa,
        updatedAtIso: nowIso,
      });
      return { success: false, errors: [initResult.errorMessageFa || 'INITIATE_FAILED'], attempt };
    }

    await this.store.saveIntent({
      ...intent,
      lifecycleState: 'REDIRECT_REQUIRED',
      providerTransactionReference: initResult.providerTransactionReference,
      updatedAtIso: nowIso,
    });

    return {
      success: true,
      attempt,
      redirectUrl: initResult.redirectUrl,
    };
  }

  public async verifyAndProcessCallback(params: {
    intentId: string;
    providerTransactionReference: string;
    rawPayload?: Record<string, unknown>;
  }): Promise<{ success: boolean; errors?: string[]; intent?: PaymentIntent; isDuplicateCallback?: boolean }> {
    const intent = await this.store.getIntentById(params.intentId);
    if (!intent) return { success: false, errors: ['INTENT_NOT_FOUND'] };

    // Idempotent duplicate callback check
    if (intent.lifecycleState === 'SUCCEEDED') {
      return { success: true, intent, isDuplicateCallback: true };
    }

    const verifyResult = await this.provider.verifyPayment({
      intentId: intent.id,
      providerTransactionReference: params.providerTransactionReference,
      expectedAmount: intent.amount,
      expectedCurrency: intent.currency,
      rawCallbackPayload: params.rawPayload,
    });

    const nowIso = new Date().toISOString();

    if (!verifyResult.isSuccess) {
      const failed = await this.store.saveIntent({
        ...intent,
        lifecycleState: 'FAILED',
        failureReasonFa: verifyResult.errorMessageFa || 'خطا در تایید تراکنش بانکی',
        updatedAtIso: nowIso,
      });

      this.emitEvent({
        eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'payment.failed',
        paymentIntentId: failed.id,
        amount: failed.amount,
        currency: failed.currency,
        timestampIso: nowIso,
        summaryFa: 'پرداخت در درگاه بانکی ناموفق بود.',
      });

      return { success: false, errors: [verifyResult.errorMessageFa || 'VERIFICATION_FAILED'], intent: failed };
    }

    // Post double-entry balanced ledger transaction
    const ledgerTx = await this.ledger.postSimpleTransfer({
      transactionReference: intent.id,
      currency: intent.currency,
      descriptionFa: `تسویه ورودی درگاه بابت سفارش ${intent.id}`,
      sourceBusinessModule: intent.businessModule,
      sourceBusinessObjectId: intent.businessObjectId,
      idempotencyKey: `ledger_pay_${intent.id}`,
      debitAccount: `clearing:${this.provider.providerId}`,
      creditAccount: `escrow:${intent.customerUid}`,
      amount: intent.amount,
    });

    const succeeded = await this.store.saveIntent({
      ...intent,
      lifecycleState: 'SUCCEEDED',
      providerTransactionReference: params.providerTransactionReference,
      updatedAtIso: nowIso,
    });

    this.emitEvent({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'payment.succeeded',
      paymentIntentId: succeeded.id,
      customerUid: succeeded.customerUid,
      businessModule: succeeded.businessModule,
      businessObjectId: succeeded.businessObjectId,
      amount: succeeded.amount,
      currency: succeeded.currency,
      timestampIso: nowIso,
      summaryFa: `پرداخت با موفقیت تایید و در دفترکل ثبت شد (سند ${ledgerTx.transactionId}).`,
    });

    return { success: true, intent: succeeded };
  }

  public async executeRefund(params: {
    paymentIntentId: string;
    amount: number;
    reasonFa: string;
    requestedByUid: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; errors?: string[]; refund?: RefundRecord }> {
    const intent = await this.store.getIntentById(params.paymentIntentId);
    if (!intent) return { success: false, errors: ['INTENT_NOT_FOUND'] };
    if (!params.requestedByUid || intent.customerUid !== params.requestedByUid) {
      return { success: false, errors: ['PAYMENT_INTENT_FORBIDDEN'] };
    }

    if (intent.lifecycleState !== 'SUCCEEDED' && intent.lifecycleState !== 'PARTIALLY_REFUNDED') {
      return { success: false, errors: ['PAYMENT_NOT_REFUNDABLE'] };
    }

    const availableToRefund = intent.amount - intent.refundedAmount;
    if (params.amount <= 0 || params.amount > availableToRefund) {
      return { success: false, errors: [`INVALID_REFUND_AMOUNT: حداکثر مبلغ قابل استرداد ${availableToRefund} است.`] };
    }

    const refundId = `ref_${crypto.randomBytes(6).toString('hex')}`;
    const nowIso = new Date().toISOString();

    const providerResult = await this.provider.executeRefund({
      refundId,
      providerTransactionReference: intent.providerTransactionReference || intent.id,
      refundAmount: params.amount,
      currency: intent.currency,
      reasonFa: params.reasonFa,
    });

    if (!providerResult.isSuccess) {
      return { success: false, errors: [providerResult.errorMessageFa || 'PROVIDER_REFUND_FAILED'] };
    }

    // Post reversing ledger entry
    await this.ledger.postSimpleTransfer({
      transactionReference: refundId,
      currency: intent.currency,
      descriptionFa: `استرداد وجه بابت سفارش ${intent.id}: ${params.reasonFa}`,
      sourceBusinessModule: intent.businessModule,
      sourceBusinessObjectId: intent.businessObjectId,
      idempotencyKey: `ledger_ref_${refundId}`,
      debitAccount: `escrow:${intent.customerUid}`,
      creditAccount: `clearing:${this.provider.providerId}`,
      amount: params.amount,
    });

    const newRefundedTotal = intent.refundedAmount + params.amount;
    const nextState = newRefundedTotal >= intent.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    await this.store.saveIntent({
      ...intent,
      refundedAmount: newRefundedTotal,
      lifecycleState: nextState,
      updatedAtIso: nowIso,
    });

    const refundRecord: RefundRecord = {
      id: refundId,
      paymentIntentId: intent.id,
      amount: params.amount,
      currency: intent.currency,
      reasonFa: params.reasonFa,
      requestedByUid: params.requestedByUid,
      status: 'SUCCEEDED',
      providerRefundReference: providerResult.providerRefundReference,
      createdAtIso: nowIso,
      completedAtIso: nowIso,
    };

    const savedRefund = await this.store.saveRefund(refundRecord);

    this.emitEvent({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'payment.refund_succeeded',
      paymentIntentId: intent.id,
      amount: params.amount,
      currency: intent.currency,
      timestampIso: nowIso,
      summaryFa: `مبلغ ${params.amount} ${intent.currency} استرداد شد.`,
    });

    return { success: true, refund: savedRefund };
  }

  public calculateCommission(
    paymentIntentId: string,
    baseAmount: number,
    currency: PaymentCurrency,
    policy: { policyId: string; policyVersion: string; method: 'PERCENTAGE' | 'FIXED'; rateOrFee: number },
    relatedBusinessObjectId: string,
  ): CommissionRecord {
    let fee = 0;
    if (policy.method === 'PERCENTAGE') {
      fee = Math.round((baseAmount * policy.rateOrFee) / 100);
    } else {
      fee = policy.rateOrFee;
    }

    return {
      id: `comm_${crypto.randomBytes(6).toString('hex')}`,
      paymentIntentId,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      calculationMethod: policy.method,
      baseAmount,
      commissionAmount: fee,
      currency,
      effectiveTimestampIso: new Date().toISOString(),
      relatedBusinessObjectId,
    };
  }

  public async getWalletBalance(ownerUid: string, currency: PaymentCurrency): Promise<number> {
    return this.ledger.getAccountBalance(`wallet:${ownerUid}`, currency);
  }

  public async creditWallet(
    ownerUid: string,
    amount: number,
    currency: PaymentCurrency,
    descriptionFa: string,
    idempotencyKey: string,
  ): Promise<{ success: boolean; newBalance: number }> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('INVALID_WALLET_AMOUNT');
    }

    await this.ledger.postSimpleTransfer({
      transactionReference: `wal_${crypto.randomBytes(6).toString('hex')}`,
      currency,
      descriptionFa,
      sourceBusinessModule: 'WALLET',
      sourceBusinessObjectId: ownerUid,
      idempotencyKey,
      debitAccount: 'platform:funding',
      creditAccount: `wallet:${ownerUid}`,
      amount,
    });

    const balance = this.ledger.getAccountBalance(`wallet:${ownerUid}`, currency);
    return { success: true, newBalance: balance };
  }

  public async debitWallet(
    ownerUid: string,
    amount: number,
    currency: PaymentCurrency,
    descriptionFa: string,
    idempotencyKey: string,
  ): Promise<{ success: boolean; newBalance: number }> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('INVALID_WALLET_AMOUNT');
    }

    const currentBalance = this.ledger.getAccountBalance(`wallet:${ownerUid}`, currency);
    if (currentBalance < amount) {
      throw new Error('INSUFFICIENT_WALLET_BALANCE: موجودی کیف پول کافی نیست.');
    }

    await this.ledger.postSimpleTransfer({
      transactionReference: `wal_${crypto.randomBytes(6).toString('hex')}`,
      currency,
      descriptionFa,
      sourceBusinessModule: 'WALLET',
      sourceBusinessObjectId: ownerUid,
      idempotencyKey,
      debitAccount: `wallet:${ownerUid}`,
      creditAccount: 'platform:funding',
      amount,
    });

    const balance = this.ledger.getAccountBalance(`wallet:${ownerUid}`, currency);
    return { success: true, newBalance: balance };
  }

  public async reconcileTransactions(providerTransactions: readonly {
    ref: string;
    amount: number;
    currency: PaymentCurrency;
    status: 'SUCCEEDED' | 'FAILED';
  }[]): Promise<readonly ReconciliationDiscrepancy[]> {
    const discrepancies: ReconciliationDiscrepancy[] = [];

    for (const ptx of providerTransactions) {
      // Find matching internal intent
      let matchedIntent: PaymentIntent | undefined;
      const allIntents = await (this.store as any).intents.values();
      for (const i of allIntents) {
        if (i.providerTransactionReference === ptx.ref) {
          matchedIntent = i;
          break;
        }
      }

      const nowIso = new Date().toISOString();

      if (!matchedIntent) {
        const disc: ReconciliationDiscrepancy = {
          id: `disc_${crypto.randomBytes(4).toString('hex')}`,
          discrepancyType: 'MISSING_INTERNAL_RECORD',
          providerTransactionReference: ptx.ref,
          providerAmount: ptx.amount,
          providerStatus: ptx.status,
          detectedAtIso: nowIso,
          resolutionStatus: 'UNRESOLVED',
        };
        await this.store.saveDiscrepancy(disc);
        discrepancies.push(disc);
        continue;
      }

      if (matchedIntent.amount !== ptx.amount) {
        const disc: ReconciliationDiscrepancy = {
          id: `disc_${crypto.randomBytes(4).toString('hex')}`,
          discrepancyType: 'AMOUNT_MISMATCH',
          internalIntentId: matchedIntent.id,
          providerTransactionReference: ptx.ref,
          internalAmount: matchedIntent.amount,
          providerAmount: ptx.amount,
          detectedAtIso: nowIso,
          resolutionStatus: 'UNRESOLVED',
        };
        await this.store.saveDiscrepancy(disc);
        discrepancies.push(disc);
      }

      if (matchedIntent.lifecycleState === 'PENDING' && ptx.status === 'SUCCEEDED') {
        const disc: ReconciliationDiscrepancy = {
          id: `disc_${crypto.randomBytes(4).toString('hex')}`,
          discrepancyType: 'STATUS_MISMATCH',
          internalIntentId: matchedIntent.id,
          providerTransactionReference: ptx.ref,
          internalStatus: matchedIntent.lifecycleState,
          providerStatus: ptx.status,
          detectedAtIso: nowIso,
          resolutionStatus: 'UNRESOLVED',
        };
        await this.store.saveDiscrepancy(disc);
        discrepancies.push(disc);
      }
    }

    return discrepancies;
  }

  private emitEvent(event: PaymentDomainEvent): void {
    this.domainEvents.push(event);
  }
}
