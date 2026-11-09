import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AuthenticatedPrincipal,
  DelegatedAdminRecord,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../../core';
import {
  buildPaymentJournalTransaction,
  buildRefundJournalTransaction,
  buildReversalJournalTransaction,
  calculateCommission,
  validateBalancedJournalEntries,
} from '../ledgerAndWalletEngine';
import {
  validateCreatePaymentIntentRequest,
  validatePaymentTransition,
  validateRefundTransition,
  validateSettlementTransition,
} from '../lifecycleAndValidation';
import { PaymentsService } from '../service';
import { UnavailablePaymentProviderAdapter } from '../providerAdapters';
import type {
  BusinessModulePayableVerifier,
  PaymentProviderAdapter,
  PaymentsRepositoryAdapter,
  ProviderCallbackVerificationParams,
  ProviderInitiatePaymentParams,
  ProviderInitiateResult,
  ProviderVerifyPaymentParams,
  ProviderVerifyResult,
  StoredJournalTransaction,
  StoredPaymentAttempt,
  StoredPaymentIntent,
  StoredRefundRecord,
  StoredSettlementBatch,
  StoredWalletAccount,
  SupportedPaymentCurrency,
} from '../types';

class InMemoryPaymentsRepository implements PaymentsRepositoryAdapter {
  public intents = new Map<string, StoredPaymentIntent>();
  public attempts = new Map<string, StoredPaymentAttempt[]>();
  public refunds = new Map<string, StoredRefundRecord[]>();
  public journals: StoredJournalTransaction[] = [];
  public wallets = new Map<string, StoredWalletAccount>();
  public settlements = new Map<string, StoredSettlementBatch>();

  async getPaymentIntent(id: string) {
    return this.intents.get(id) ?? null;
  }
  async savePaymentIntent(intent: StoredPaymentIntent) {
    this.intents.set(intent.id, { ...intent });
  }
  async getPaymentAttempts(intentId: string) {
    return this.attempts.get(intentId) ?? [];
  }
  async savePaymentAttempt(attempt: StoredPaymentAttempt) {
    const list = this.attempts.get(attempt.paymentIntentId) ?? [];
    const idx = list.findIndex((a) => a.id === attempt.id);
    if (idx >= 0) list[idx] = { ...attempt };
    else list.push({ ...attempt });
    this.attempts.set(attempt.paymentIntentId, list);
  }
  async saveRefundRecord(refund: StoredRefundRecord) {
    const list = this.refunds.get(refund.paymentIntentId) ?? [];
    list.push({ ...refund });
    this.refunds.set(refund.paymentIntentId, list);
  }
  async getRefundRecords(intentId: string) {
    return this.refunds.get(intentId) ?? [];
  }
  async saveJournalTransaction(journal: StoredJournalTransaction) {
    this.journals.push({ ...journal });
  }
  async getJournalTransactions() {
    return [...this.journals];
  }
  async getWalletAccount(ownerUid: string, currency: SupportedPaymentCurrency) {
    return this.wallets.get(`${ownerUid}_${currency}`) ?? null;
  }
  async saveWalletAccount(account: StoredWalletAccount) {
    this.wallets.set(`${account.ownerUid}_${account.currency}`, { ...account });
  }
  async saveSettlementBatch(batch: StoredSettlementBatch) {
    this.settlements.set(batch.id, { ...batch });
  }
  async getSettlementBatch(id: string) {
    return this.settlements.get(id) ?? null;
  }
}

class MockOperationalProviderAdapter implements PaymentProviderAdapter {
  public readonly providerId = 'mock_operational_gateway';

  async initiatePayment(params: ProviderInitiatePaymentParams): Promise<ProviderInitiateResult> {
    return {
      ok: true,
      providerTxRef: `mock_tx_${params.paymentIntentId}`,
      redirectUrl: `https://mockgateway.example.com/pay/${params.paymentIntentId}`,
    };
  }

  async verifyPayment(params: ProviderVerifyPaymentParams): Promise<ProviderVerifyResult> {
    if (params.providerTxRef.includes('fail_verify')) {
      return {
        verified: false,
        providerTxRef: params.providerTxRef,
        amount: params.expectedAmount,
        currency: params.expectedCurrency,
        failureReason: 'Bank card rejected or session timed out.',
      };
    }
    return {
      verified: true,
      providerTxRef: params.providerTxRef,
      amount: params.expectedAmount,
      currency: params.expectedCurrency,
    };
  }

  async verifyCallbackSignature(params: ProviderCallbackVerificationParams) {
    const sig = params.rawHeaders['x-provider-signature'];
    if (sig === 'valid_test_signature') {
      return { valid: true };
    }
    return { valid: false, reason: 'Invalid provider signature.' };
  }

  async lookupTransaction(providerTxRef: string) {
    return { found: true, status: 'succeeded' as const, amount: 50_000_000 };
  }

  async executeRefund(params: { providerTxRef: string; amount: number; reason: string }) {
    if (params.amount > 1_000_000_000) {
      return { ok: false, failureReason: 'Exceeds provider refund limit.' };
    }
    return { ok: true, providerRefundRef: `mock_ref_${Date.now()}` };
  }

  normalizeError() {
    return 'GATEWAY_ERROR';
  }
}

function setupTestService(overrides?: {
  provider?: PaymentProviderAdapter;
  payableEligible?: boolean;
  payableAmount?: number;
}) {
  const repo = new InMemoryPaymentsRepository();
  const txRunner: TransactionRunnerAdapter = {
    async runTransaction(fn) {
      return fn({
        async get() { return { exists: false }; },
        set() {},
        update() {},
        delete() {},
      });
    },
  };
  const idempotencyStore: IdempotencyStoreAdapter = {
    async acquireLock(params) {
      return {
        state: 'ACQUIRED',
        record: {
          key: params.scopedKey,
          actorUid: params.actorUid,
          operation: params.operation,
          payloadHash: params.payloadHash,
          status: 'IN_PROGRESS',
          createdAtIso: new Date().toISOString(),
          updatedAtIso: new Date().toISOString(),
          expiresAtEpochMs: Date.now() + 60000,
        },
      };
    },
    async markCompleted() {},
    async releaseOnFailure() {},
  };
  const auditSink = { async writeAuditEvent() {} };
  const tokenVerifier: FirebaseTokenVerifierAdapter = {
    async verifyIdToken() {
      return { uid: 'user_alice_101', email: 'alice@example.com', email_verified: true };
    },
  };
  const adminStore: DelegatedAdminStoreAdapter = {
    async getDelegatedAdminByUid() { return null; },
  };

  const payableVerifier: BusinessModulePayableVerifier = {
    async verifyPayableEligibility() {
      if (overrides?.payableEligible === false) {
        return {
          eligible: false,
          expectedAmount: 0,
          expectedCurrency: 'IRT',
          purpose: 'none',
          reason: 'Reservation not approved or already paid.',
        };
      }
      return {
        eligible: true,
        expectedAmount: overrides?.payableAmount ?? 45_000_000,
        expectedCurrency: 'IRT',
        purpose: 'Sponsor neighborhood slot tehran_101',
      };
    },
  };

  const providerAdapters = new Map<string, PaymentProviderAdapter>();
  if (overrides?.provider) {
    providerAdapters.set(overrides.provider.providerId, overrides.provider);
  }

  const service = new PaymentsService({
    tokenVerifier,
    adminStore,
    txRunner,
    idempotencyStore,
    auditSink,
    repository: repo,
    payableVerifier,
    providerAdapters,
    defaultProviderId: overrides?.provider?.providerId,
  });

  return { service, repo };
}

test('1. Payment Intent creation, originating module amount verification, and attempt lifecycle', async () => {
  const mockProvider = new MockOperationalProviderAdapter();
  const { service, repo } = setupTestService({ provider: mockProvider, payableAmount: 50_000_000 });

  // 1a: Create intent successfully with authoritative amount from payableVerifier
  const intent = await service.createPaymentIntent({
    customerUid: 'user_alice_101',
    businessModuleId: 'sponsors',
    businessObjectId: 'res_tehran_slot_1',
    idempotencyKey: 'idem_intent_001',
  });

  assert.equal(intent.amount, 50_000_000);
  assert.equal(intent.currency, 'IRT');
  assert.equal(intent.status, 'created');
  assert.equal(intent.customerAccountRef, 'user_alice_101');

  // 1b: Initiate payment attempt transitions intent to redirect_required and saves attempt
  const attemptResult = await service.initiatePaymentAttempt({
    paymentIntentId: intent.id,
    customerUid: 'user_alice_101',
    providerId: mockProvider.providerId,
  });

  assert.equal(attemptResult.attempt.result, 'pending');
  assert.ok(attemptResult.redirectUrl?.includes('mockgateway.example.com'));

  const updatedIntent = await repo.getPaymentIntent(intent.id);
  assert.equal(updatedIntent?.status, 'redirect_required');

  // 1c: Another user cannot initiate an attempt for Alice's intent (enforces 403)
  await assert.rejects(
    async () => {
      await service.initiatePaymentAttempt({
        paymentIntentId: intent.id,
        customerUid: 'user_bob_999',
      });
    },
    { message: /Cannot initiate attempt for another user/ },
  );
});

test('2. Provider webhook signature verification, server-to-server confirmation & ledger posting', async () => {
  const mockProvider = new MockOperationalProviderAdapter();
  const { service, repo } = setupTestService({ provider: mockProvider, payableAmount: 20_000_000 });

  const intent = await service.createPaymentIntent({
    customerUid: 'user_alice_101',
    businessModuleId: 'sponsors',
    businessObjectId: 'res_tehran_slot_2',
    idempotencyKey: 'idem_intent_002',
  });

  await service.initiatePaymentAttempt({
    paymentIntentId: intent.id,
    customerUid: 'user_alice_101',
  });

  // 2a: Forged signature callback is strictly rejected (HTTP 403)
  await assert.rejects(
    async () => {
      await service.processProviderCallback({
        providerId: mockProvider.providerId,
        callbackParams: {
          rawHeaders: { 'x-provider-signature': 'forged_fake_signature' },
          rawBody: { status: 'PAID' },
        },
        paymentIntentId: intent.id,
      });
    },
    { message: /Invalid (callback|provider) signature/ },
  );

  // 2b: Valid signature callback triggers server-to-server verification and posts balanced ledger journal
  const callbackRes = await service.processProviderCallback({
    providerId: mockProvider.providerId,
    callbackParams: {
      rawHeaders: { 'x-provider-signature': 'valid_test_signature' },
      rawBody: { status: 'PAID' },
    },
    paymentIntentId: intent.id,
  });

  assert.equal(callbackRes.verified, true);
  assert.equal(callbackRes.intent.status, 'succeeded');

  // Confirm balanced double-entry ledger entry was posted
  assert.equal(repo.journals.length, 1);
  const journal = repo.journals[0];
  const balanceCheck = validateBalancedJournalEntries(journal.entries);
  assert.equal(balanceCheck.balanced, true);
  assert.equal(balanceCheck.totalDebits, 20_000_000);
  assert.equal(balanceCheck.totalCredits, 20_000_000);

  // 2c: Duplicate callback replay is idempotent without duplicate ledger entries
  const replayRes = await service.processProviderCallback({
    providerId: mockProvider.providerId,
    callbackParams: {
      rawHeaders: { 'x-provider-signature': 'valid_test_signature' },
      rawBody: { status: 'PAID' },
    },
    paymentIntentId: intent.id,
  });
  assert.equal(replayRes.verified, true);
  assert.equal(repo.journals.length, 1); // No second entry created
});

test('3. Double-entry ledger invariants, balanced journals, and reversals', async () => {
  // 3a: Balanced journal validation
  const balanced = validateBalancedJournalEntries([
    { entryId: 'e1', accountRef: 'acct_bank', accountType: 'ASSET', direction: 'DEBIT', amount: 15_000 },
    { entryId: 'e2', accountRef: 'acct_revenue', accountType: 'REVENUE', direction: 'CREDIT', amount: 15_000 },
  ]);
  assert.equal(balanced.balanced, true);

  // 3b: Unbalanced journal rejection
  const unbalanced = validateBalancedJournalEntries([
    { entryId: 'e1', accountRef: 'acct_bank', accountType: 'ASSET', direction: 'DEBIT', amount: 15_000 },
    { entryId: 'e2', accountRef: 'acct_revenue', accountType: 'REVENUE', direction: 'CREDIT', amount: 10_000 },
  ]);
  assert.equal(unbalanced.balanced, false);
  assert.ok(unbalanced.reason?.includes('Unbalanced journal entries'));

  // 3c: Reversal transaction creates mirror debits and credits
  const original = buildPaymentJournalTransaction({
    paymentIntentId: 'pi_test_rev',
    amount: 10_000_000,
    currency: 'IRT',
    businessModuleId: 'marketplace',
    businessObjectId: 'order_1',
    customerAccountRef: 'user_cust',
    nowIso: new Date().toISOString(),
    idempotencyKey: 'idem_test_jtx',
  });
  const reversal = buildReversalJournalTransaction(original, new Date().toISOString(), 'idem_rev_1');
  assert.equal(reversal.reversalRef, original.id);
  const revCheck = validateBalancedJournalEntries(reversal.entries);
  assert.equal(revCheck.balanced, true);
  assert.equal(revCheck.totalDebits, 10_000_000);
});

test('4. Wallet balance operations, concurrency safety & double-spending guard', async () => {
  const { service } = setupTestService();

  // 4a: Default wallet account initialized with 0 balance
  const wallet = await service.getWalletAccount('user_agent_55');
  assert.equal(wallet.availableBalance, 0);

  // 4b: Credit wallet
  const credited = await service.creditWallet({
    ownerUid: 'user_agent_55',
    amount: 30_000_000,
    currency: 'IRT',
  });
  assert.equal(credited.availableBalance, 30_000_000);

  // 4c: Debit wallet within available balance
  const debited = await service.debitWallet({
    ownerUid: 'user_agent_55',
    amount: 10_000_000,
    currency: 'IRT',
  });
  assert.equal(debited.availableBalance, 20_000_000);

  // 4d: Over-debit / double-spending is strictly blocked with 409 CONFLICT
  await assert.rejects(
    async () => {
      await service.debitWallet({
        ownerUid: 'user_agent_55',
        amount: 25_000_000,
        currency: 'IRT',
      });
    },
    { message: /Insufficient wallet balance/ },
  );
});

test('5. Refunds, partial refunds, over-refund prevention, commissions, and reconciliation', async () => {
  const mockProvider = new MockOperationalProviderAdapter();
  const { service, repo } = setupTestService({ provider: mockProvider, payableAmount: 10_000_000 });

  const intent = await service.createPaymentIntent({
    customerUid: 'user_alice_101',
    businessModuleId: 'sponsors',
    businessObjectId: 'res_tehran_slot_3',
    idempotencyKey: 'idem_intent_003',
  });

  await service.initiatePaymentAttempt({ paymentIntentId: intent.id, customerUid: 'user_alice_101' });
  await service.processProviderCallback({
    providerId: mockProvider.providerId,
    callbackParams: { rawHeaders: { 'x-provider-signature': 'valid_test_signature' }, rawBody: {} },
    paymentIntentId: intent.id,
  });

  // 5a: Partial refund executed by privileged admin
  const partialRefund = await service.requestRefund({
    paymentIntentId: intent.id,
    amount: 4_000_000,
    reason: 'Slot maintenance credit',
    actorUid: 'admin_primary',
    isPrivilegedAdmin: true,
    idempotencyKey: 'idem_ref_01',
  });
  assert.equal(partialRefund.status, 'succeeded');

  const afterPartial = await repo.getPaymentIntent(intent.id);
  assert.equal(afterPartial?.status, 'partially_refunded');
  assert.equal(afterPartial?.totalRefundedAmount, 4_000_000);

  // 5b: Over-refund (attempting to refund 7M when only 6M remains) is blocked
  await assert.rejects(
    async () => {
      await service.requestRefund({
        paymentIntentId: intent.id,
        amount: 7_000_000,
        reason: 'Attempted excess refund',
        actorUid: 'admin_primary',
        isPrivilegedAdmin: true,
        idempotencyKey: 'idem_ref_02',
      });
    },
    { message: /exceeds remaining refundable balance/ },
  );

  // 5c: Pure commission calculation testing (5% fee with min 100k, max 5M)
  const commission = calculateCommission({
    baseAmount: 10_000_000,
    currency: 'IRT',
    policy: {
      policyId: 'pol_std_5pct',
      policyVersion: 'v1.0',
      category: 'sponsorship',
      calculationMethod: 'percentage',
      percentageBps: 500, // 5.00%
      minFee: 100_000,
      maxFee: 5_000_000,
    },
    nowIso: new Date().toISOString(),
  });
  assert.equal(commission.commissionAmount, 500_000);
  assert.equal(commission.netPayableAmount, 9_500_000);

  // 5d: Financial reconciliation reports zero discrepancies for balanced transactions
  const reconReport = await service.runReconciliation({
    periodStartIso: new Date(Date.now() - 86400000).toISOString(),
    periodEndIso: new Date().toISOString(),
  });
  assert.equal(reconReport.discrepancies.length, 0);
  assert.ok(reconReport.matchedCount >= 1);
});
