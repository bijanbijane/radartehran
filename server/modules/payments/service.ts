import crypto from 'crypto';
import {
  CoreApiError,
  createStructuredAuditEvent,
} from '../core';
import {
  buildPaymentJournalTransaction,
  buildRefundJournalTransaction,
  applyWalletCredit,
  applyWalletDebit,
  createDefaultWalletAccount,
} from './ledgerAndWalletEngine';
import {
  sanitizePaymentMetadata,
  validatePaymentTransition,
  validateRefundTransition,
} from './lifecycleAndValidation';
import {
  UnavailablePaymentProviderAdapter,
  resolvePaymentProvider,
} from './providerAdapters';
import {
  buildSettlementBatchRecord,
  executeReconciliationAudit,
} from './settlementAndReconciliation';
import type {
  BusinessModuleOrigin,
  PaymentLifecycleStatus,
  PaymentProviderAdapter,
  PaymentsModuleDependencies,
  ProviderCallbackVerificationParams,
  ProviderInitiateResult,
  ReconciliationDiscrepancy,
  ReconciliationReport,
  StoredPaymentAttempt,
  StoredPaymentIntent,
  StoredRefundRecord,
  StoredSettlementBatch,
  StoredWalletAccount,
  SupportedPaymentCurrency,
} from './types';

export class PaymentsService {
  private readonly defaultProvider: PaymentProviderAdapter;

  constructor(private readonly deps: PaymentsModuleDependencies) {
    this.defaultProvider = new UnavailablePaymentProviderAdapter();
  }

  private resolveProvider(providerId?: string | null): PaymentProviderAdapter {
    return resolvePaymentProvider({
      requestedProviderId: providerId,
      defaultProviderId: this.deps.defaultProviderId,
      adapters: this.deps.providerAdapters,
      fallback: this.defaultProvider,
    });
  }

  private nowIso(): string {
    return new Date(this.deps.nowFn ? this.deps.nowFn() : Date.now()).toISOString();
  }

  async createPaymentIntent(params: {
    customerUid: string;
    businessModuleId: BusinessModuleOrigin;
    businessObjectId: string;
    description?: string;
    currency?: SupportedPaymentCurrency;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<StoredPaymentIntent> {
    const verifiedEligibility = await this.deps.payableVerifier.verifyPayableEligibility({
      moduleId: params.businessModuleId,
      objectId: params.businessObjectId,
      customerUid: params.customerUid,
    });

    if (!verifiedEligibility.eligible) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        verifiedEligibility.reason ?? 'Referenced business object is not eligible for payment.',
      );
    }

    const nowIso = this.nowIso();
    const expiresAtIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const intentId = `pi_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const intent: StoredPaymentIntent = {
      id: intentId,
      customerAccountRef: params.customerUid,
      businessModuleId: params.businessModuleId,
      businessObjectId: params.businessObjectId,
      paymentPurpose: verifiedEligibility.purpose,
      amount: verifiedEligibility.expectedAmount,
      currency: params.currency ?? verifiedEligibility.expectedCurrency,
      description: params.description ?? `Payment for ${verifiedEligibility.purpose}`,
      providerId: null,
      providerTxRef: null,
      idempotencyKey: params.idempotencyKey,
      status: 'created',
      totalRefundedAmount: 0,
      expiresAtIso,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      metadata: sanitizePaymentMetadata(params.metadata),
    };

    await this.deps.repository.savePaymentIntent(intent);

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: { uid: params.customerUid, email: '', role: 'verified_user' },
        correlationId: `rt_pay_${intentId}`,
        action: 'payments.intent_created',
        targetCollection: 'paymentIntents',
        targetResourceId: intentId,
        outcome: 'SUCCESS',
        metadata: { amount: intent.amount, currency: intent.currency, module: intent.businessModuleId },
      }),
    );

    if (this.deps.eventPublisher) {
      await this.deps.eventPublisher.publishPaymentEvent({
        eventType: 'PaymentIntentCreated',
        paymentIntentId: intent.id,
        businessModuleId: intent.businessModuleId,
        businessObjectId: intent.businessObjectId,
        amount: intent.amount,
        currency: intent.currency,
        status: intent.status,
        occurredAtIso: nowIso,
      });
    }

    return intent;
  }

  async initiatePaymentAttempt(params: {
    paymentIntentId: string;
    customerUid: string;
    providerId?: string;
    callbackUrl?: string;
  }): Promise<{ attempt: StoredPaymentAttempt; redirectUrl?: string }> {
    const intent = await this.deps.repository.getPaymentIntent(params.paymentIntentId);
    if (!intent) {
      throw new CoreApiError('NOT_FOUND', 404, 'Payment intent not found.');
    }
    if (intent.customerAccountRef !== params.customerUid) {
      throw new CoreApiError('FORBIDDEN', 403, 'Cannot initiate attempt for another user.');
    }

    const nowIso = this.nowIso();
    if (Date.parse(intent.expiresAtIso) <= Date.now()) {
      intent.status = 'expired';
      intent.updatedAtIso = nowIso;
      await this.deps.repository.savePaymentIntent(intent);
      throw new CoreApiError('CONFLICT', 409, 'Payment intent has expired.');
    }

    const transition = validatePaymentTransition(intent.status, 'pending');
    if (!transition.allowed) {
      throw new CoreApiError('CONFLICT', 409, transition.reason ?? 'Cannot initiate attempt in current status.');
    }

    const provider = this.resolveProvider(params.providerId ?? intent.providerId);
    const existingAttempts = await this.deps.repository.getPaymentAttempts(intent.id);
    const attemptNumber = existingAttempts.length + 1;
    const attemptId = `pa_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const initiateRes = await provider.initiatePayment({
      paymentIntentId: intent.id,
      amount: intent.amount,
      currency: intent.currency,
      description: intent.description,
      callbackUrl: params.callbackUrl ?? `https://radartehran.ir/api/payments/callbacks/${provider.providerId}`,
      customerRef: params.customerUid,
    });

    const attempt: StoredPaymentAttempt = {
      id: attemptId,
      paymentIntentId: intent.id,
      providerId: provider.providerId,
      providerTxRef: initiateRes.providerTxRef ?? null,
      attemptNumber,
      startedAtIso: nowIso,
      completedAtIso: initiateRes.ok ? null : nowIso,
      result: initiateRes.ok ? 'pending' : 'failed',
      normalizedErrorCode: initiateRes.normalizedErrorCode ?? null,
      providerResponseRef: initiateRes.providerTxRef ?? null,
      verificationStatus: 'unverified',
    };

    await this.deps.repository.savePaymentAttempt(attempt);

    if (initiateRes.ok) {
      intent.status = initiateRes.redirectUrl ? 'redirect_required' : 'processing';
      intent.providerId = provider.providerId;
      intent.providerTxRef = initiateRes.providerTxRef ?? null;
      intent.updatedAtIso = nowIso;
    } else {
      intent.status = 'failed';
      intent.updatedAtIso = nowIso;
    }

    await this.deps.repository.savePaymentIntent(intent);

    return {
      attempt,
      redirectUrl: initiateRes.redirectUrl,
    };
  }

  async processProviderCallback(params: {
    providerId: string;
    callbackParams: ProviderCallbackVerificationParams;
    paymentIntentId: string;
    idempotencyKey?: string;
  }): Promise<{ verified: boolean; intent: StoredPaymentIntent }> {
    const provider = this.resolveProvider(params.providerId);
    const sigCheck = await provider.verifyCallbackSignature(params.callbackParams);
    if (!sigCheck.valid) {
      throw new CoreApiError('FORBIDDEN', 403, sigCheck.reason ?? 'Invalid callback signature.');
    }

    const intent = await this.deps.repository.getPaymentIntent(params.paymentIntentId);
    if (!intent) {
      throw new CoreApiError('NOT_FOUND', 404, 'Payment intent not found.');
    }

    // Idempotency: if already succeeded, replay without duplicating financial effects
    if (intent.status === 'succeeded') {
      return { verified: true, intent };
    }

    const nowIso = this.nowIso();
    const attempts = await this.deps.repository.getPaymentAttempts(intent.id);
    const latestAttempt = attempts[attempts.length - 1];
    const txRef = latestAttempt?.providerTxRef ?? intent.providerTxRef ?? 'tx_callback_missing';

    // Authoritative Server-to-Server Verification (never trust client or return URL blindly)
    const verification = await provider.verifyPayment({
      providerTxRef: txRef,
      expectedAmount: intent.amount,
      expectedCurrency: intent.currency,
      rawPayload: params.callbackParams.rawBody as Record<string, unknown>,
    });

    if (!verification.verified) {
      intent.status = 'failed';
      intent.updatedAtIso = nowIso;
      await this.deps.repository.savePaymentIntent(intent);

      if (latestAttempt) {
        latestAttempt.result = 'failed';
        latestAttempt.verificationStatus = 'failed_verification';
        latestAttempt.completedAtIso = nowIso;
        latestAttempt.normalizedErrorCode = verification.normalizedErrorCode ?? 'VERIFICATION_FAILED';
        await this.deps.repository.savePaymentAttempt(latestAttempt);
      }

      return { verified: false, intent };
    }

    // Double-check amount and currency match exactly
    if (verification.amount !== intent.amount || verification.currency !== intent.currency) {
      throw new CoreApiError('CONFLICT', 409, 'Payment verification amount or currency mismatch.');
    }

    // Safe state transition
    const transition = validatePaymentTransition(intent.status, 'succeeded');
    if (!transition.allowed) {
      throw new CoreApiError('CONFLICT', 409, transition.reason ?? 'Cannot transition payment to succeeded.');
    }

    intent.status = 'succeeded';
    intent.providerTxRef = verification.providerTxRef;
    intent.updatedAtIso = nowIso;
    await this.deps.repository.savePaymentIntent(intent);

    if (latestAttempt) {
      latestAttempt.result = 'succeeded';
      latestAttempt.verificationStatus = 'verified';
      latestAttempt.completedAtIso = nowIso;
      await this.deps.repository.savePaymentAttempt(latestAttempt);
    }

    // Post balanced double-entry ledger journal entry
    const journalTx = buildPaymentJournalTransaction({
      paymentIntentId: intent.id,
      amount: intent.amount,
      currency: intent.currency,
      businessModuleId: intent.businessModuleId,
      businessObjectId: intent.businessObjectId,
      customerAccountRef: intent.customerAccountRef,
      nowIso,
      idempotencyKey: params.idempotencyKey ?? `idem_jtx_${intent.id}`,
    });
    await this.deps.repository.saveJournalTransaction(journalTx);

    if (this.deps.eventPublisher) {
      await this.deps.eventPublisher.publishPaymentEvent({
        eventType: 'PaymentSucceeded',
        paymentIntentId: intent.id,
        businessModuleId: intent.businessModuleId,
        businessObjectId: intent.businessObjectId,
        amount: intent.amount,
        currency: intent.currency,
        status: intent.status,
        occurredAtIso: nowIso,
      });
    }

    return { verified: true, intent };
  }

  async requestRefund(params: {
    paymentIntentId: string;
    amount: number;
    reason: string;
    actorUid: string;
    isPrivilegedAdmin: boolean;
    idempotencyKey: string;
  }): Promise<StoredRefundRecord> {
    const intent = await this.deps.repository.getPaymentIntent(params.paymentIntentId);
    if (!intent) {
      throw new CoreApiError('NOT_FOUND', 404, 'Payment intent not found.');
    }

    if (intent.status !== 'succeeded' && intent.status !== 'partially_refunded') {
      throw new CoreApiError('CONFLICT', 409, 'Only succeeded or partially refunded payments can be refunded.');
    }

    const availableRefundable = intent.amount - intent.totalRefundedAmount;
    if (params.amount > availableRefundable) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        `Refund amount (${params.amount}) exceeds remaining refundable balance (${availableRefundable}).`,
      );
    }

    const nowIso = this.nowIso();
    const refundId = `ref_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const refundRecord: StoredRefundRecord = {
      id: refundId,
      paymentIntentId: intent.id,
      amount: params.amount,
      currency: intent.currency,
      reason: params.reason,
      requestedByUid: params.actorUid,
      authorizedByUid: params.isPrivilegedAdmin ? params.actorUid : null,
      status: params.isPrivilegedAdmin ? 'authorized' : 'requested',
      providerRefundRef: null,
      idempotencyKey: params.idempotencyKey,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    if (params.isPrivilegedAdmin) {
      const provider = this.resolveProvider(intent.providerId);
      refundRecord.status = 'executing';

      const refundResult = await provider.executeRefund({
        providerTxRef: intent.providerTxRef ?? '',
        amount: params.amount,
        reason: params.reason,
      });

      if (refundResult.ok) {
        refundRecord.status = 'succeeded';
        refundRecord.providerRefundRef = refundResult.providerRefundRef ?? null;
        intent.totalRefundedAmount += params.amount;
        intent.status = intent.totalRefundedAmount === intent.amount ? 'refunded' : 'partially_refunded';
        intent.updatedAtIso = nowIso;
        await this.deps.repository.savePaymentIntent(intent);

        // Balance ledger journal for refund
        const refundJournal = buildRefundJournalTransaction({
          refundId: refundRecord.id,
          paymentIntentId: intent.id,
          amount: params.amount,
          currency: intent.currency,
          businessModuleId: intent.businessModuleId,
          businessObjectId: intent.businessObjectId,
          nowIso,
          idempotencyKey: `idem_ref_jtx_${refundId}`,
        });
        await this.deps.repository.saveJournalTransaction(refundJournal);
      } else {
        refundRecord.status = 'failed';
      }
    }

    await this.deps.repository.saveRefundRecord(refundRecord);
    return refundRecord;
  }

  async getWalletAccount(
    ownerUid: string,
    currency: SupportedPaymentCurrency = 'IRT',
  ): Promise<StoredWalletAccount> {
    const existing = await this.deps.repository.getWalletAccount(ownerUid, currency);
    if (existing) return existing;

    const fresh = createDefaultWalletAccount(ownerUid, 'user', currency, this.nowIso());
    await this.deps.repository.saveWalletAccount(fresh);
    return fresh;
  }

  async creditWallet(params: {
    ownerUid: string;
    amount: number;
    currency: SupportedPaymentCurrency;
  }): Promise<StoredWalletAccount> {
    const wallet = await this.getWalletAccount(params.ownerUid, params.currency);
    const updated = applyWalletCredit(wallet, params.amount, this.nowIso());
    await this.deps.repository.saveWalletAccount(updated);
    return updated;
  }

  async debitWallet(params: {
    ownerUid: string;
    amount: number;
    currency: SupportedPaymentCurrency;
  }): Promise<StoredWalletAccount> {
    const wallet = await this.getWalletAccount(params.ownerUid, params.currency);
    const updated = applyWalletDebit(wallet, params.amount, this.nowIso());
    await this.deps.repository.saveWalletAccount(updated);
    return updated;
  }

  async createSettlementBatch(params: {
    payeeRef: string;
    payeeType: 'service_provider' | 'agency' | 'platform';
    periodStartIso: string;
    periodEndIso: string;
    grossAmount: number;
    commissionDeductions: number;
    refundDeductions: number;
    currency: SupportedPaymentCurrency;
  }): Promise<StoredSettlementBatch> {
    const batch = buildSettlementBatchRecord({
      ...params,
      nowIso: this.nowIso(),
    });
    await this.deps.repository.saveSettlementBatch(batch);
    return batch;
  }

  async runReconciliation(params: {
    periodStartIso: string;
    periodEndIso: string;
    providerReports?: Array<{ providerTxRef: string; amount: number; currency: string; status: string }>;
  }): Promise<ReconciliationReport> {
    return executeReconciliationAudit({
      repository: this.deps.repository,
      periodStartIso: params.periodStartIso,
      periodEndIso: params.periodEndIso,
      nowIso: this.nowIso(),
    });
  }
}
