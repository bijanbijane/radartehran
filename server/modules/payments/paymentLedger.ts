/**
 * @file server/modules/payments/paymentLedger.ts
 * @description Immutable double-entry financial ledger engine.
 * Invariant: For every balanced transaction, sum(DEBIT) == sum(CREDIT) within the same currency.
 * Floats are forbidden; all amounts are positive integer minor units.
 */

import crypto from 'node:crypto';
import type {
  JournalTransaction,
  LedgerEntry,
  OriginatingBusinessModule,
  PaymentCurrency,
} from './paymentTypes';

export interface PostJournalParams {
  readonly transactionReference: string;
  readonly currency: PaymentCurrency;
  readonly descriptionFa: string;
  readonly sourceBusinessModule: OriginatingBusinessModule;
  readonly sourceBusinessObjectId: string;
  readonly idempotencyKey: string;
  readonly debitAccount: string;
  readonly creditAccount: string;
  readonly amount: number; // Positive integer
}

export class FinancialLedgerEngine {
  private readonly entries: LedgerEntry[] = [];
  private readonly transactions = new Map<string, JournalTransaction>();
  private readonly idempotencyIndex = new Map<string, string>(); // idempotencyKey -> txId

  /**
   * Posts a balanced two-legged or multi-legged journal entry.
   * Throws if unbalanced, non-integer, or negative.
   */
  public async postSimpleTransfer(params: PostJournalParams): Promise<JournalTransaction> {
    if (this.idempotencyIndex.has(params.idempotencyKey)) {
      const existingTxId = this.idempotencyIndex.get(params.idempotencyKey)!;
      return this.transactions.get(existingTxId)!;
    }

    if (!Number.isInteger(params.amount) || params.amount <= 0) {
      throw new Error(`INVALID_LEDGER_AMOUNT: Amount must be a positive integer minor unit, got ${params.amount}`);
    }

    if (params.debitAccount === params.creditAccount) {
      throw new Error('INVALID_LEDGER_ACCOUNTS: Debit and Credit accounts must be distinct');
    }

    const nowIso = new Date().toISOString();
    const txId = `tx_${crypto.randomBytes(6).toString('hex')}`;

    const debitEntry: LedgerEntry = {
      id: `led_${crypto.randomBytes(6).toString('hex')}`,
      transactionReference: txId,
      accountId: params.debitAccount,
      entryType: 'DEBIT',
      amount: params.amount,
      currency: params.currency,
      timestampIso: nowIso,
      descriptionFa: params.descriptionFa,
      sourceBusinessModule: params.sourceBusinessModule,
      sourceBusinessObjectId: params.sourceBusinessObjectId,
    };

    const creditEntry: LedgerEntry = {
      id: `led_${crypto.randomBytes(6).toString('hex')}`,
      transactionReference: txId,
      accountId: params.creditAccount,
      entryType: 'CREDIT',
      amount: params.amount,
      currency: params.currency,
      timestampIso: nowIso,
      descriptionFa: params.descriptionFa,
      sourceBusinessModule: params.sourceBusinessModule,
      sourceBusinessObjectId: params.sourceBusinessObjectId,
    };

    const journal: JournalTransaction = {
      transactionId: txId,
      entries: [debitEntry, creditEntry],
      currency: params.currency,
      timestampIso: nowIso,
      idempotencyKey: params.idempotencyKey,
    };

    this.validateBalancedTransaction(journal);

    this.entries.push(debitEntry, creditEntry);
    this.transactions.set(txId, journal);
    this.idempotencyIndex.set(params.idempotencyKey, txId);

    return journal;
  }

  /**
   * Creates an explicit reversing journal transaction for a previous transaction.
   * Financial entries are never mutated or deleted in place.
   */
  public async postReversal(
    originalTxId: string,
    reasonFa: string,
    idempotencyKey: string,
  ): Promise<JournalTransaction> {
    if (this.idempotencyIndex.has(idempotencyKey)) {
      const existingId = this.idempotencyIndex.get(idempotencyKey)!;
      return this.transactions.get(existingId)!;
    }

    const original = this.transactions.get(originalTxId);
    if (!original) {
      throw new Error(`TRANSACTION_NOT_FOUND: Cannot reverse non-existent transaction ${originalTxId}`);
    }

    const nowIso = new Date().toISOString();
    const reversalTxId = `rev_${crypto.randomBytes(6).toString('hex')}`;

    // Swap Debits and Credits
    const reversalEntries: LedgerEntry[] = original.entries.map((entry) => ({
      id: `led_${crypto.randomBytes(6).toString('hex')}`,
      transactionReference: reversalTxId,
      accountId: entry.accountId,
      entryType: entry.entryType === 'DEBIT' ? 'CREDIT' : 'DEBIT',
      amount: entry.amount,
      currency: entry.currency,
      timestampIso: nowIso,
      descriptionFa: `برگشت تراکنش ${originalTxId}: ${reasonFa}`,
      sourceBusinessModule: entry.sourceBusinessModule,
      sourceBusinessObjectId: entry.sourceBusinessObjectId,
      reversalReference: originalTxId,
    }));

    const reversalJournal: JournalTransaction = {
      transactionId: reversalTxId,
      entries: reversalEntries,
      currency: original.currency,
      timestampIso: nowIso,
      idempotencyKey,
    };

    this.validateBalancedTransaction(reversalJournal);

    this.entries.push(...reversalEntries);
    this.transactions.set(reversalTxId, reversalJournal);
    this.idempotencyIndex.set(idempotencyKey, reversalTxId);

    return reversalJournal;
  }

  /**
   * Computes the net balance of an account from immutable posted entries.
   * For user/wallet accounts, normal balance is credits - debits.
   */
  public getAccountBalance(accountId: string, currency: PaymentCurrency): number {
    let balance = 0;
    for (const e of this.entries) {
      if (e.accountId === accountId && e.currency === currency) {
        if (e.entryType === 'CREDIT') {
          balance += e.amount;
        } else if (e.entryType === 'DEBIT') {
          balance -= e.amount;
        }
      }
    }
    return balance;
  }

  public getEntriesForAccount(accountId: string): readonly LedgerEntry[] {
    return this.entries.filter((e) => e.accountId === accountId);
  }

  public getAllEntries(): readonly LedgerEntry[] {
    return [...this.entries];
  }

  private validateBalancedTransaction(tx: JournalTransaction): void {
    let totalDebit = 0;
    let totalCredit = 0;

    for (const entry of tx.entries) {
      if (entry.currency !== tx.currency) {
        throw new Error(`CURRENCY_MISMATCH_IN_LEDGER: Entry currency ${entry.currency} does not match transaction ${tx.currency}`);
      }
      if (!Number.isInteger(entry.amount) || entry.amount <= 0) {
        throw new Error(`INVALID_LEDGER_ENTRY_AMOUNT: ${entry.amount}`);
      }
      if (entry.entryType === 'DEBIT') {
        totalDebit += entry.amount;
      } else if (entry.entryType === 'CREDIT') {
        totalCredit += entry.amount;
      }
    }

    if (totalDebit !== totalCredit) {
      throw new Error(`UNBALANCED_LEDGER_TRANSACTION: Debits (${totalDebit}) != Credits (${totalCredit})`);
    }
  }
}
