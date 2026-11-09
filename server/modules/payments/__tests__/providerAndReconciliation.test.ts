import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../../core';
import {
  calculateCommission,
  releaseWalletReservation,
  reserveWalletFunds,
} from '../ledgerAndWalletEngine';
import {
  requirePositiveIntegerAmount,
  validateCreatePaymentIntentRequest,
  validateCreateSettlementBatchInput,
  validatePaymentTransition,
} from '../lifecycleAndValidation';
import { UnavailablePaymentProviderAdapter } from '../providerAdapters';
import { PaymentsService } from '../service';
import type {
  BusinessModulePayableVerifier,
  PaymentsRepositoryAdapter,
  StoredJournalTransaction,
  StoredPaymentAttempt,
  StoredPaymentIntent,
  StoredRefundRecord,
  StoredSettlementBatch,
  StoredWalletAccount,
  SupportedPaymentCurrency,
} from '../types';

class MinimalTestRepo implements PaymentsRepositoryAdapter {
  public intents = new Map<string, StoredPaymentIntent>();
  public attempts = new Map<string, StoredPaymentAttempt[]>();
  public refunds = new Map<string, StoredRefundRecord[]>();
  public journals: StoredJournalTransaction[] = [];
  public wallets = new Map<string, StoredWalletAccount>();
  public settlements = new Map<string, StoredSettlementBatch>();

  async getPaymentIntent(id: string) { return this.intents.get(id) ?? null; }
  async savePaymentIntent(intent: StoredPaymentIntent) { this.intents.set(intent.id, { ...intent }); }
  async getPaymentAttempts(intentId: string) { return this.attempts.get(intentId) ?? []; }
  async savePaymentAttempt(attempt: StoredPaymentAttempt) {
    const list = this.attempts.get(attempt.paymentIntentId) ?? [];
    list.push({ ...attempt });
    this.attempts.set(attempt.paymentIntentId, list);
  }
  async saveRefundRecord(refund: StoredRefundRecord) {
    const list = this.refunds.get(refund.paymentIntentId) ?? [];
    list.push({ ...refund });
    this.refunds.set(refund.paymentIntentId, list);
  }
  async getRefundRecords(intentId: string) { return this.refunds.get(intentId) ?? []; }
  async saveJournalTransaction(journal: StoredJournalTransaction) { this.journals.push({ ...journal }); }
  async getJournalTransactions() { return [...this.journals]; }
  async getWalletAccount(ownerUid: string, currency: SupportedPaymentCurrency) {
    return this.wallets.get(`${ownerUid}_${currency}`) ?? null;
  }
  async saveWalletAccount(account: StoredWalletAccount) {
    this.wallets.set(`${account.ownerUid}_${account.currency}`, { ...account });
  }
  async saveSettlementBatch(batch: StoredSettlementBatch) { this.settlements.set(batch.id, { ...batch }); }
  async getSettlementBatch(id: string) { return this.settlements.get(id) ?? null; }
}

test('6. Unavailable provider adapter fallback behaves deterministically without inventing success', async () => {
  const repo = new MinimalTestRepo();
  const txRunner: TransactionRunnerAdapter = {
    async runTransaction(fn) { return fn({ async get() { return { exists: false }; }, set() {}, update() {}, delete() {} }); },
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
    async verifyIdToken() { return { uid: 'user_u1', email_verified: true }; },
  };
  const adminStore = { async getDelegatedAdminByUid() { return null; } };

  const payableVerifier: BusinessModulePayableVerifier = {
    async verifyPayableEligibility() {
      return { eligible: true, expectedAmount: 25_000_000, expectedCurrency: 'IRT', purpose: 'Listing boost' };
    },
  };

  // Service initialized without any active operational gateway
  const service = new PaymentsService({
    tokenVerifier,
    adminStore,
    txRunner,
    idempotencyStore,
    auditSink,
    repository: repo,
    payableVerifier,
  });

  const intent = await service.createPaymentIntent({
    customerUid: 'user_u1',
    businessModuleId: 'listings',
    businessObjectId: 'list_101',
    idempotencyKey: 'idem_unavail_01',
  });

  // Attempt initiated against unconfigured gateway
  const attemptRes = await service.initiatePaymentAttempt({
    paymentIntentId: intent.id,
    customerUid: 'user_u1',
  });

  assert.equal(attemptRes.attempt.result, 'failed');
  assert.equal(attemptRes.attempt.normalizedErrorCode, 'PROVIDER_NOT_CONFIGURED');
  assert.equal(attemptRes.redirectUrl, undefined);

  const storedIntent = await repo.getPaymentIntent(intent.id);
  assert.equal(storedIntent?.status, 'failed');
});

test('7. Validation invariants: float rejection, negative amounts, and settlement checks', async () => {
  const validator = requirePositiveIntegerAmount();

  // 7a: Integer positive is valid
  assert.equal(validator(5000, 'amount').ok, true);

  // 7b: Floating-point number is rejected
  const floatRes = validator(5000.75, 'amount');
  assert.equal(floatRes.ok, false);
  assert.equal(floatRes.issues[0]?.code, 'INVALID_FORMAT');

  // 7c: Negative number is rejected
  const negRes = validator(-100, 'amount');
  assert.equal(negRes.ok, false);

  // 7d: Settlement batch with deductions exceeding gross is rejected
  const badSettlement = validateCreateSettlementBatchInput({
    payeeRef: 'payee_01',
    payeeType: 'agency',
    periodStartIso: '2026-01-01T00:00:00Z',
    periodEndIso: '2026-01-31T23:59:59Z',
    grossAmount: 10_000_000,
    commissionDeductions: 8_000_000,
    refundDeductions: 3_000_000, // 8M + 3M = 11M > 10M
    currency: 'IRT',
  });
  assert.equal(badSettlement.ok, false);
  assert.equal(badSettlement.issues[0]?.field, 'netPayableAmount');
});

test('8. Tiered commission calculation and wallet funds reservation', async () => {
  // 8a: Tiered commission: 0-10M @ 5%, 10M-50M @ 3%
  const tiered = calculateCommission({
    baseAmount: 30_000_000,
    currency: 'IRT',
    policy: {
      policyId: 'pol_tiered_01',
      policyVersion: 'v1.0',
      category: 'property_services',
      calculationMethod: 'tiered',
      percentageBps: 300,
      tierThresholds: [
        { upToAmount: 10_000_000, rateBps: 500 }, // 5% on first 10M = 500,000
        { upToAmount: 50_000_000, rateBps: 300 }, // 3% on remaining 20M = 600,000
      ],
    },
    nowIso: new Date().toISOString(),
  });
  assert.equal(tiered.commissionAmount, 1_100_000);
  assert.equal(tiered.netPayableAmount, 28_900_000);

  // 8b: Wallet reservation and release
  const initialWallet = {
    id: 'wlt_user_1',
    ownerUid: 'user_1',
    ownerType: 'user' as const,
    currency: 'IRT' as const,
    availableBalance: 50_000_000,
    reservedBalance: 0,
    pendingBalance: 0,
    createdAtIso: new Date().toISOString(),
    updatedAtIso: new Date().toISOString(),
  };

  const reserved = reserveWalletFunds(initialWallet, 15_000_000, new Date().toISOString());
  assert.equal(reserved.availableBalance, 35_000_000);
  assert.equal(reserved.reservedBalance, 15_000_000);

  const released = releaseWalletReservation(reserved, 15_000_000, new Date().toISOString());
  assert.equal(released.availableBalance, 50_000_000);
  assert.equal(released.reservedBalance, 0);
});
