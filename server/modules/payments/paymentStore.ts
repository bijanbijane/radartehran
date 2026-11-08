/**
 * @file server/modules/payments/paymentStore.ts
 * @description Storage repository interfaces and memory implementation for payments, wallets, and settlements.
 */

import type {
  PaymentAttempt,
  PaymentCurrency,
  PaymentIntent,
  ReconciliationDiscrepancy,
  RefundRecord,
  SettlementRecord,
  WalletAccount,
} from './paymentTypes';

export interface PaymentRepository {
  saveIntent(intent: PaymentIntent): Promise<PaymentIntent>;
  getIntentById(id: string): Promise<PaymentIntent | undefined>;
  getIntentByIdempotencyKey(key: string): Promise<PaymentIntent | undefined>;
  listCustomerIntents(customerUid: string): Promise<readonly PaymentIntent[]>;

  saveAttempt(attempt: PaymentAttempt): Promise<PaymentAttempt>;
  getAttemptsForIntent(intentId: string): Promise<readonly PaymentAttempt[]>;

  saveRefund(refund: RefundRecord): Promise<RefundRecord>;
  getRefundById(id: string): Promise<RefundRecord | undefined>;
  listRefundsForIntent(intentId: string): Promise<readonly RefundRecord[]>;

  saveWallet(wallet: WalletAccount): Promise<WalletAccount>;
  getWalletByOwner(ownerUid: string, currency: PaymentCurrency): Promise<WalletAccount | undefined>;

  saveSettlement(settlement: SettlementRecord): Promise<SettlementRecord>;
  getSettlementById(id: string): Promise<SettlementRecord | undefined>;
  listSettlementsForPayee(payeeUid: string): Promise<readonly SettlementRecord[]>;

  saveDiscrepancy(disc: ReconciliationDiscrepancy): Promise<ReconciliationDiscrepancy>;
  listDiscrepancies(): Promise<readonly ReconciliationDiscrepancy[]>;
}

export class MemoryPaymentStore implements PaymentRepository {
  private readonly intents = new Map<string, PaymentIntent>();
  private readonly intentIdempotency = new Map<string, string>(); // idempotencyKey -> intentId
  private readonly attempts = new Map<string, PaymentAttempt[]>(); // intentId -> attempts
  private readonly refunds = new Map<string, RefundRecord>();
  private readonly wallets = new Map<string, WalletAccount>(); // "ownerUid:currency" -> wallet
  private readonly settlements = new Map<string, SettlementRecord>();
  private readonly discrepancies = new Map<string, ReconciliationDiscrepancy>();

  public async saveIntent(intent: PaymentIntent): Promise<PaymentIntent> {
    this.intents.set(intent.id, intent);
    this.intentIdempotency.set(intent.idempotencyKey, intent.id);
    return intent;
  }

  public async getIntentById(id: string): Promise<PaymentIntent | undefined> {
    return this.intents.get(id);
  }

  public async getIntentByIdempotencyKey(key: string): Promise<PaymentIntent | undefined> {
    const id = this.intentIdempotency.get(key);
    if (!id) return undefined;
    return this.intents.get(id);
  }

  public async listCustomerIntents(customerUid: string): Promise<readonly PaymentIntent[]> {
    return Array.from(this.intents.values()).filter((i) => i.customerUid === customerUid);
  }

  public async saveAttempt(attempt: PaymentAttempt): Promise<PaymentAttempt> {
    const list = this.attempts.get(attempt.intentId) ?? [];
    list.push(attempt);
    this.attempts.set(attempt.intentId, list);
    return attempt;
  }

  public async getAttemptsForIntent(intentId: string): Promise<readonly PaymentAttempt[]> {
    return this.attempts.get(intentId) ?? [];
  }

  public async saveRefund(refund: RefundRecord): Promise<RefundRecord> {
    this.refunds.set(refund.id, refund);
    return refund;
  }

  public async getRefundById(id: string): Promise<RefundRecord | undefined> {
    return this.refunds.get(id);
  }

  public async listRefundsForIntent(intentId: string): Promise<readonly RefundRecord[]> {
    return Array.from(this.refunds.values()).filter((r) => r.paymentIntentId === intentId);
  }

  public async saveWallet(wallet: WalletAccount): Promise<WalletAccount> {
    this.wallets.set(`${wallet.ownerUid}:${wallet.currency}`, wallet);
    return wallet;
  }

  public async getWalletByOwner(ownerUid: string, currency: PaymentCurrency): Promise<WalletAccount | undefined> {
    return this.wallets.get(`${ownerUid}:${currency}`);
  }

  public async saveSettlement(settlement: SettlementRecord): Promise<SettlementRecord> {
    this.settlements.set(settlement.id, settlement);
    return settlement;
  }

  public async getSettlementById(id: string): Promise<SettlementRecord | undefined> {
    return this.settlements.get(id);
  }

  public async listSettlementsForPayee(payeeUid: string): Promise<readonly SettlementRecord[]> {
    return Array.from(this.settlements.values()).filter((s) => s.payeeUid === payeeUid);
  }

  public async saveDiscrepancy(disc: ReconciliationDiscrepancy): Promise<ReconciliationDiscrepancy> {
    this.discrepancies.set(disc.id, disc);
    return disc;
  }

  public async listDiscrepancies(): Promise<readonly ReconciliationDiscrepancy[]> {
    return Array.from(this.discrepancies.values());
  }
}
