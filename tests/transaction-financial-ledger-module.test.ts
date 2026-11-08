import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, it } from 'node:test';
import express from 'express';
import {
  CoreApiError,
  type AuditEventSink,
  type AuthenticatedPrincipal,
  type DelegatedAdminStoreAdapter,
  type FirebaseTokenVerifierAdapter,
  type StructuredAuditEvent,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../server/modules/core';
import {
  createTransactionFinancialLedgerRouter,
  createTransactionFinancialLedgerService,
  createTransactionsService,
  runTransactionFinancialReconciliation,
} from '../server/modules/transactions';

function createInMemoryFirestoreHarness() {
  const store = new Map<string, Record<string, unknown>>();
  const auditEvents: StructuredAuditEvent[] = [];

  const txRunner: TransactionRunnerAdapter = {
    async runTransaction<T>(callback: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<Doc = Record<string, unknown>>(docPath: string) {
          const val = staged.has(docPath) ? staged.get(docPath) : store.get(docPath);
          if (!val) return { exists: false };
          return { exists: true, data: structuredClone(val) as unknown as Doc };
        },
        set(docPath: string, data: Record<string, unknown>, options?: { merge?: boolean }) {
          if (options?.merge) {
            const existing = staged.get(docPath) ?? store.get(docPath) ?? {};
            staged.set(docPath, { ...structuredClone(existing), ...structuredClone(data) });
          } else {
            staged.set(docPath, structuredClone(data));
          }
        },
        update(docPath: string, partialData: Record<string, unknown>) {
          const existing = staged.get(docPath) ?? store.get(docPath);
          if (!existing) throw new Error(`Missing document ${docPath}`);
          staged.set(docPath, { ...structuredClone(existing), ...structuredClone(partialData) });
        },
        delete(docPath: string) {
          staged.set(docPath, null);
        },
      };
      const result = await callback(tx);
      for (const [k, v] of staged.entries()) {
        if (v === null) store.delete(k);
        else store.set(k, v);
      }
      return result;
    },
  };

  const principals: Record<string, AuthenticatedPrincipal> = {
    'tok-seller': {
      uid: 'uid_seller_1',
      email: 'seller@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    'tok-buyer': {
      uid: 'uid_buyer_1',
      email: 'buyer@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    'tok-broker': {
      uid: 'uid_broker_1',
      email: 'broker@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    'tok-landlord': {
      uid: 'uid_landlord_1',
      email: 'landlord@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    'tok-tenant': {
      uid: 'uid_tenant_1',
      email: 'tenant@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    'tok-outsider': {
      uid: 'uid_outsider_9',
      email: 'outsider@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    'tok-admin': {
      uid: 'uid_admin_1',
      email: 'admin@radartehran.ir',
      emailVerified: true,
      role: 'primary_admin',
      authMode: 'firebase_id_token',
      claims: {},
    },
  };

  const tokenAliases: Record<string, string> = {
    token_seller_valid_00001: 'tok-seller',
    token_buyer_valid_000001: 'tok-buyer',
    token_outsider_valid_0009: 'tok-outsider',
    token_admin_valid_000001: 'tok-admin',
  };

  const tokenVerifier: FirebaseTokenVerifierAdapter = {
    async verifyIdToken(token: string) {
      const p = principals[token] ?? principals[tokenAliases[token] ?? ''];
      if (!p) throw new Error('Invalid token');
      return {
        uid: p.uid,
        email: p.email,
        email_verified: p.emailVerified,
        ...p.claims,
      };
    },
  };

  const adminStore: DelegatedAdminStoreAdapter = {
    async getDelegatedAdminByUid() {
      return null;
    },
  };

  const auditSink: AuditEventSink = {
    async writeAuditEvent(event: StructuredAuditEvent) {
      auditEvents.push(event);
    },
  };

  return {
    store,
    txRunner,
    tokenVerifier,
    adminStore,
    auditSink,
    principals,
    auditEvents,
    primaryAdminEmails: ['admin@radartehran.ir'],
    trustedWebhookSecrets: ['whsec_trusted_provider_key_01'],
  };
}

describe('Employee 54 — Real Estate Transaction Financial Ledger & Settlement Integrity Suite', () => {
  it('1. Enforces obligation creation, currency matching, integer minor-unit precision, and double-entry ledger balance', async () => {
    const h = createInMemoryFirestoreHarness();
    const txService = createTransactionsService(h);
    const ledgerService = createTransactionFinancialLedgerService(h);

    await txService.createTransaction({
      principal: h.principals['tok-seller'],
      rawBody: {
        transactionId: 'tx_fin_sale_1',
        transactionType: 'SALE',
        propertyId: 'prop_tehran_101',
        cityId: 'tehran',
        hoodId: 12,
        initiatorRole: 'SELLER',
        askingAmount: 100_000_000_000,
        currency: 'IRR',
        brokerUid: 'uid_broker_1',
      },
      idempotencyKey: 'idem_tx_fin_sale_1',
      correlationId: 'corr_1',
    });

    await txService.inviteParticipant({
      principal: h.principals['tok-seller'],
      transactionId: 'tx_fin_sale_1',
      rawBody: { targetUserId: 'uid_buyer_1', role: 'BUYER', expectedVersion: 1 },
      correlationId: 'corr_2',
    });
    await txService.respondToInvitation({
      principal: h.principals['tok-buyer'],
      transactionId: 'tx_fin_sale_1',
      rawBody: { decision: 'ACCEPT', expectedVersion: 2 },
      correlationId: 'corr_3',
    });
    await txService.respondToInvitation({
      principal: h.principals['tok-broker'],
      transactionId: 'tx_fin_sale_1',
      rawBody: { decision: 'ACCEPT', expectedVersion: 3 },
      correlationId: 'corr_3b',
    });

    // Reject floating-point monetary amount
    await assert.rejects(
      () =>
        ledgerService.createObligation({
          principal: h.principals['tok-seller'],
          transactionId: 'tx_fin_sale_1',
          rawInput: {
            category: 'PURCHASE_PRICE',
            title: 'Float Price Obligation',
            amount: 1000.55,
            currency: 'IRR',
            payerUid: 'uid_buyer_1',
            payeeUid: 'uid_seller_1',
            dueDateIso: '2027-01-15T00:00:00.000Z',
          },
          idempotencyKey: 'idem_obl_float',
          correlationId: 'corr_float',
        }),
      (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED',
    );

    // Reject mismatched currency (IRT vs transaction IRR)
    await assert.rejects(
      () =>
        ledgerService.createObligation({
          principal: h.principals['tok-seller'],
          transactionId: 'tx_fin_sale_1',
          rawInput: {
            category: 'PURCHASE_PRICE',
            title: 'Mismatched Currency Obligation',
            amount: 10_000_000_000,
            currency: 'IRT',
            payerUid: 'uid_buyer_1',
            payeeUid: 'uid_seller_1',
            dueDateIso: '2027-01-15T00:00:00.000Z',
          },
          idempotencyKey: 'idem_obl_curr',
          correlationId: 'corr_curr',
        }),
      (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED',
    );

    // Reject untrusted client financial fields and sensitive card fields
    await assert.rejects(
      () =>
        ledgerService.createObligation({
          principal: h.principals['tok-seller'],
          transactionId: 'tx_fin_sale_1',
          rawInput: {
            category: 'PURCHASE_PRICE',
            title: 'Purchase Price',
            amount: 100_000_000_000,
            currency: 'IRR',
            payerUid: 'uid_buyer_1',
            payeeUid: 'uid_seller_1',
            dueDateIso: '2027-01-15T00:00:00.000Z',
            cardNumber: '6037991122334455',
          },
          idempotencyKey: 'idem_obl_card',
          correlationId: 'corr_card',
        }),
      (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED',
    );

    // Valid purchase price obligation
    const obRes = await ledgerService.createObligation({
      principal: h.principals['tok-seller'],
      transactionId: 'tx_fin_sale_1',
      rawInput: {
        obligationId: 'obl_purchase_1',
        category: 'PURCHASE_PRICE',
        title: 'Primary Purchase Obligation',
        amount: 100_000_000_000,
        currency: 'IRR',
        payerUid: 'uid_buyer_1',
        payeeUid: 'uid_seller_1',
        dueDateIso: '2027-01-15T00:00:00.000Z',
      },
      idempotencyKey: 'idem_obl_purchase_1',
      correlationId: 'corr_obl_1',
    });

    assert.equal(obRes.statusCode, 201);
    assert.equal(obRes.body.status, 'PENDING');

    // Idempotent replay check
    const replayRes = await ledgerService.createObligation({
      principal: h.principals['tok-seller'],
      transactionId: 'tx_fin_sale_1',
      rawInput: {
        obligationId: 'obl_purchase_1',
        category: 'PURCHASE_PRICE',
        title: 'Primary Purchase Obligation',
        amount: 100_000_000_000,
        currency: 'IRR',
        payerUid: 'uid_buyer_1',
        payeeUid: 'uid_seller_1',
        dueDateIso: '2027-01-15T00:00:00.000Z',
      },
      idempotencyKey: 'idem_obl_purchase_1',
      correlationId: 'corr_obl_1_replay',
    });
    assert.equal(replayRes.replayed, true);

    const view = await ledgerService.getFinancialSummaryAndRecords({
      principal: h.principals['tok-buyer'],
      transactionId: 'tx_fin_sale_1',
    });
    assert.equal(view.summary.ledgerBalanced, true);
    assert.equal(view.summary.totalPostedDebits, 100_000_000_000);
    assert.equal(view.summary.totalPostedCredits, 100_000_000_000);
    assert.equal(view.summary.outstandingBalance, 100_000_000_000);
  });

  it('2. Supports partial and full settlements, blocks untrusted client payment confirmations, enforces refund limits, and executes immutable ledger reversals', async () => {
    const h = createInMemoryFirestoreHarness();
    const txService = createTransactionsService(h);
    const ledgerService = createTransactionFinancialLedgerService(h);

    await txService.createTransaction({
      principal: h.principals['tok-seller'],
      rawBody: {
        transactionId: 'tx_stl_1',
        transactionType: 'SALE',
        propertyId: 'prop_tehran_202',
        cityId: 'tehran',
        hoodId: 5,
        initiatorRole: 'SELLER',
        askingAmount: 80_000_000_000,
        currency: 'IRR',
      },
      idempotencyKey: 'idem_tx_stl_1',
      correlationId: 'c1',
    });
    await txService.inviteParticipant({
      principal: h.principals['tok-seller'],
      transactionId: 'tx_stl_1',
      rawBody: { targetUserId: 'uid_buyer_1', role: 'BUYER', expectedVersion: 1 },
      correlationId: 'c2',
    });
    await txService.respondToInvitation({
      principal: h.principals['tok-buyer'],
      transactionId: 'tx_stl_1',
      rawBody: { decision: 'ACCEPT', expectedVersion: 2 },
      correlationId: 'c3',
    });

    await ledgerService.createObligation({
      principal: h.principals['tok-seller'],
      transactionId: 'tx_stl_1',
      rawInput: {
        obligationId: 'obl_sale_80b',
        category: 'PURCHASE_PRICE',
        title: 'Purchase Price 80B',
        amount: 80_000_000_000,
        currency: 'IRR',
        payerUid: 'uid_buyer_1',
        payeeUid: 'uid_seller_1',
        dueDateIso: '2027-02-01T00:00:00.000Z',
      },
      idempotencyKey: 'idem_obl_80b',
      correlationId: 'c4',
    });

    // Create payment status reference for partial tranche (30B)
    await ledgerService.createPaymentReference({
      principal: h.principals['tok-buyer'],
      transactionId: 'tx_stl_1',
      rawInput: {
        paymentRefId: 'pmr_tranche_1',
        obligationId: 'obl_sale_80b',
        initiationReference: 'INIT_SEP_001',
        externalProviderName: 'SHAPARAK_GATEWAY',
        amount: 30_000_000_000,
        currency: 'IRR',
        payerUid: 'uid_buyer_1',
        payeeUid: 'uid_seller_1',
      },
      idempotencyKey: 'idem_pmr_1',
      correlationId: 'c5',
    });

    // Client (buyer) attempting to confirm their own payment reference must be FORBIDDEN
    await assert.rejects(
      () =>
        ledgerService.updatePaymentReferenceStatus({
          principal: h.principals['tok-buyer'],
          transactionId: 'tx_stl_1',
          paymentRefId: 'pmr_tranche_1',
          rawInput: { status: 'CONFIRMED', confirmationReference: 'FAKE_CLIENT_CONF' },
          idempotencyKey: 'idem_fake_conf',
          correlationId: 'c_fake',
        }),
      (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN',
    );

    // Confirm payment reference via trusted provider webhook secret
    const confPayment = await ledgerService.updatePaymentReferenceStatus({
      principal: h.principals['tok-buyer'],
      transactionId: 'tx_stl_1',
      paymentRefId: 'pmr_tranche_1',
      rawInput: { status: 'CONFIRMED', confirmationReference: 'SHAPARAK_CONF_9981' },
      idempotencyKey: 'idem_webhook_conf_1',
      correlationId: 'c6',
      webhookSecretHeader: 'whsec_trusted_provider_key_01',
    });
    assert.equal(confPayment.body.status, 'CONFIRMED');

    // Create partial settlement (30B of 80B)
    const stl1 = await ledgerService.createSettlement({
      principal: h.principals['tok-buyer'],
      transactionId: 'tx_stl_1',
      rawInput: {
        settlementId: 'stl_tranche_1',
        allocations: [{ obligationId: 'obl_sale_80b', allocatedAmount: 30_000_000_000 }],
        currency: 'IRR',
        payerUid: 'uid_buyer_1',
        payeeUid: 'uid_seller_1',
        paymentRefId: 'pmr_tranche_1',
      },
      idempotencyKey: 'idem_stl_create_1',
      correlationId: 'c7',
    });
    assert.equal(stl1.body.status, 'CREATED');

    // Confirm partial settlement via admin
    const stlConf = await ledgerService.performSettlementAction({
      principal: h.principals['tok-admin'],
      transactionId: 'tx_stl_1',
      settlementId: 'stl_tranche_1',
      rawInput: { action: 'CONFIRM', paymentRefId: 'pmr_tranche_1' },
      idempotencyKey: 'idem_stl_conf_1',
      correlationId: 'c8',
    });
    assert.equal(stlConf.body.status, 'CONFIRMED');
    assert.equal(stlConf.body.confirmedAmount, 30_000_000_000);

    // Prevent duplicate confirmation of the same settlement
    await assert.rejects(
      () =>
        ledgerService.performSettlementAction({
          principal: h.principals['tok-admin'],
          transactionId: 'tx_stl_1',
          settlementId: 'stl_tranche_1',
          rawInput: { action: 'CONFIRM', paymentRefId: 'pmr_tranche_1' },
          idempotencyKey: 'idem_stl_conf_dup',
          correlationId: 'c8_dup',
        }),
      (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT',
    );

    const midView = await ledgerService.getFinancialSummaryAndRecords({
      principal: h.principals['tok-seller'],
      transactionId: 'tx_stl_1',
    });
    assert.equal(midView.obligations[0].status, 'PARTIALLY_SETTLED');
    assert.equal(midView.summary.outstandingBalance, 50_000_000_000);
    assert.equal(midView.summary.refundableBalance, 30_000_000_000);

    // Prevent unauthorized modification of settled/partially-settled obligation to SETTLED without settlement engine
    await assert.rejects(
      () =>
        ledgerService.updateObligation({
          principal: h.principals['tok-seller'],
          transactionId: 'tx_stl_1',
          obligationId: 'obl_sale_80b',
          rawInput: { targetStatus: 'SETTLED' },
          idempotencyKey: 'idem_illegal_settle',
          correlationId: 'c_ill',
        }),
      (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT',
    );

    // Reject refund exceeding confirmed amount (40B > 30B)
    await assert.rejects(
      () =>
        ledgerService.createRefund({
          principal: h.principals['tok-seller'],
          transactionId: 'tx_stl_1',
          rawInput: {
            settlementId: 'stl_tranche_1',
            obligationId: 'obl_sale_80b',
            amount: 40_000_000_000,
            currency: 'IRR',
            reason: 'Over-refund attempt',
          },
          idempotencyKey: 'idem_over_refund',
          correlationId: 'c_over_ref',
        }),
      (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED',
    );

    // Valid partial refund (10B)
    const rfdReq = await ledgerService.createRefund({
      principal: h.principals['tok-seller'],
      transactionId: 'tx_stl_1',
      rawInput: {
        refundId: 'rfd_10b',
        settlementId: 'stl_tranche_1',
        obligationId: 'obl_sale_80b',
        amount: 10_000_000_000,
        currency: 'IRR',
        reason: 'Mutual price adjustment refund',
      },
      idempotencyKey: 'idem_rfd_10b',
      correlationId: 'c9',
    });
    assert.equal(rfdReq.body.status, 'REQUESTED');

    const rfdConf = await ledgerService.decideRefund({
      principal: h.principals['tok-admin'],
      transactionId: 'tx_stl_1',
      refundId: 'rfd_10b',
      rawInput: { action: 'CONFIRM', externalRefundRef: 'BANK_REFUND_TX_777' },
      idempotencyKey: 'idem_rfd_conf_10b',
      correlationId: 'c10',
    });
    assert.equal(rfdConf.body.status, 'CONFIRMED');

    const afterRefundView = await ledgerService.getFinancialSummaryAndRecords({
      principal: h.principals['tok-seller'],
      transactionId: 'tx_stl_1',
    });
    assert.equal(afterRefundView.summary.outstandingBalance, 60_000_000_000);
    assert.equal(afterRefundView.summary.refundableBalance, 20_000_000_000);
    assert.equal(afterRefundView.summary.ledgerBalanced, true);

    // Post an adjustment double-entry and then reverse it with replacement amount
    const postAdj = await ledgerService.postLedgerEntryPair({
      principal: h.principals['tok-admin'],
      transactionId: 'tx_stl_1',
      rawInput: {
        postingGroupId: 'lpg_adj_custom_1',
        entryType: 'ADJUSTMENT_POSTING',
        debitAccount: 'ADJUSTMENT_CONTROL',
        creditAccount: 'OBLIGATION_CONTROL',
        amount: 500_000_000,
        currency: 'IRR',
        financialCategory: 'CLOSING_EXPENSE',
        responsiblePartyUid: 'uid_buyer_1',
        beneficiaryUid: 'uid_seller_1',
        note: 'Municipal closing tax estimate',
      },
      idempotencyKey: 'idem_post_adj_1',
      correlationId: 'c11',
    });
    assert.equal(postAdj.body.entries.length, 2);

    const revRes = await ledgerService.reverseLedgerPosting({
      principal: h.principals['tok-admin'],
      transactionId: 'tx_stl_1',
      rawInput: {
        postingGroupId: 'lpg_adj_custom_1',
        reason: 'Updated municipal tax receipt',
        replacementAmount: 350_000_000,
      },
      idempotencyKey: 'idem_rev_adj_1',
      correlationId: 'c12',
    });
    assert.equal(revRes.body.reversalPostingGroupId, 'lpg_rev_lpg_adj_custom_1');
    assert.equal(revRes.body.replacementPostingGroupId, 'lpg_repl_lpg_adj_custom_1');

    // Run reconciliation and verify RECONCILED state
    const recReport = await ledgerService.reconcileTransactionLedger({
      principal: h.principals['tok-admin'],
      transactionId: 'tx_stl_1',
      correlationId: 'c13',
    });
    assert.equal(recReport.status, 'RECONCILED');
    assert.equal(recReport.discrepancies.length, 0);
    assert.equal(recReport.totalLedgerDebits, recReport.totalLedgerCredits);
  });

  it('3. Supports rental schedules, broker commission privacy, financial dispute restrictions, and discrepancy detection', async () => {
    const h = createInMemoryFirestoreHarness();
    const txService = createTransactionsService(h);
    const ledgerService = createTransactionFinancialLedgerService(h);

    await txService.createTransaction({
      principal: h.principals['tok-landlord'],
      rawBody: {
        transactionId: 'tx_rent_1',
        transactionType: 'RENTAL',
        propertyId: 'prop_tehran_303',
        cityId: 'tehran',
        hoodId: 8,
        initiatorRole: 'LANDLORD',
        askingAmount: 5_000_000_000,
        depositAmount: 5_000_000_000,
        monthlyRentAmount: 150_000_000,
        currency: 'IRR',
        brokerUid: 'uid_broker_1',
      },
      idempotencyKey: 'idem_tx_rent_1',
      correlationId: 'r1',
    });
    await txService.inviteParticipant({
      principal: h.principals['tok-landlord'],
      transactionId: 'tx_rent_1',
      rawBody: { targetUserId: 'uid_tenant_1', role: 'TENANT', expectedVersion: 1 },
      correlationId: 'r2',
    });
    await txService.respondToInvitation({
      principal: h.principals['tok-tenant'],
      transactionId: 'tx_rent_1',
      rawBody: { decision: 'ACCEPT', expectedVersion: 2 },
      correlationId: 'r3',
    });
    await txService.respondToInvitation({
      principal: h.principals['tok-broker'],
      transactionId: 'tx_rent_1',
      rawBody: { decision: 'ACCEPT', expectedVersion: 3 },
      correlationId: 'r4',
    });

    // Generate 3-month rental schedule + security deposit
    const schedRes = await ledgerService.generateRentalSchedule({
      principal: h.principals['tok-landlord'],
      transactionId: 'tx_rent_1',
      rawInput: {
        scheduleId: 'rsc_rent_1',
        contractReferenceId: 'cnt_lease_01',
        tenantUid: 'uid_tenant_1',
        landlordUid: 'uid_landlord_1',
        currency: 'IRR',
        securityDepositAmount: 5_000_000_000,
        periodicRentAmount: 150_000_000,
        frequency: 'MONTHLY',
        installmentCount: 3,
        startDateIso: '2027-03-01T00:00:00.000Z',
      },
      idempotencyKey: 'idem_sched_1',
      correlationId: 'r5',
    });
    assert.equal(schedRes.statusCode, 201);
    assert.equal(schedRes.body.obligations.length, 4);

    // Prevent duplicate schedule generation for the same contractReferenceId
    await assert.rejects(
      () =>
        ledgerService.generateRentalSchedule({
          principal: h.principals['tok-landlord'],
          transactionId: 'tx_rent_1',
          rawInput: {
            contractReferenceId: 'cnt_lease_01',
            tenantUid: 'uid_tenant_1',
            landlordUid: 'uid_landlord_1',
            currency: 'IRR',
            securityDepositAmount: 5_000_000_000,
            periodicRentAmount: 150_000_000,
            frequency: 'MONTHLY',
            installmentCount: 3,
            startDateIso: '2027-03-01T00:00:00.000Z',
          },
          idempotencyKey: 'idem_sched_dup_contract',
          correlationId: 'r5_dup',
        }),
      (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT',
    );

    // Create broker commission paid by landlord (250 bps = 2.50% of 5,000,000,000 = 125,000,000)
    const commRes = await ledgerService.createCommission({
      principal: h.principals['tok-landlord'],
      transactionId: 'tx_rent_1',
      rawInput: {
        commissionId: 'com_landlord_1',
        brokerUid: 'uid_broker_1',
        payerUid: 'uid_landlord_1',
        calculationMode: 'BASIS_POINTS',
        baseTransactionAmount: 5_000_000_000,
        basisPoints: 250,
        currency: 'IRR',
        contractReferenceId: 'cnt_lease_01',
        dueDateIso: '2027-03-05T00:00:00.000Z',
      },
      idempotencyKey: 'idem_com_1',
      correlationId: 'r6',
    });
    assert.equal(commRes.body.commission.calculatedCommissionAmount, 125_000_000);

    // Verify commission privacy: Tenant does not see landlord's private broker commission
    const tenantView = await ledgerService.getFinancialSummaryAndRecords({
      principal: h.principals['tok-tenant'],
      transactionId: 'tx_rent_1',
    });
    assert.equal(tenantView.commissions.length, 0);
    assert.equal(tenantView.obligations.length, 4);

    // Broker and Landlord can see the commission
    const brokerView = await ledgerService.getFinancialSummaryAndRecords({
      principal: h.principals['tok-broker'],
      transactionId: 'tx_rent_1',
    });
    assert.equal(brokerView.commissions.length, 1);

    // Initiate financial dispute on installment #1 only; verify installment #2 remains unaffected and settleable
    const inst1Id = schedRes.body.obligations[1].obligationId;
    const inst2Id = schedRes.body.obligations[2].obligationId;

    const dispRes = await ledgerService.initiateFinancialDispute({
      principal: h.principals['tok-tenant'],
      transactionId: 'tx_rent_1',
      rawInput: {
        financialDisputeId: 'fnd_rent_inst1',
        disputedObligationIds: [inst1Id],
        disputedAmount: 150_000_000,
        currency: 'IRR',
        reason: 'First month utility meter discrepancy before handover',
      },
      idempotencyKey: 'idem_fnd_1',
      correlationId: 'r7',
    });
    assert.equal(dispRes.body.status, 'OPEN');

    // Attempting to create settlement on disputed installment #1 is blocked
    await assert.rejects(
      () =>
        ledgerService.createSettlement({
          principal: h.principals['tok-tenant'],
          transactionId: 'tx_rent_1',
          rawInput: {
            allocations: [{ obligationId: inst1Id, allocatedAmount: 150_000_000 }],
            currency: 'IRR',
            payerUid: 'uid_tenant_1',
            payeeUid: 'uid_landlord_1',
          },
          idempotencyKey: 'idem_stl_blocked',
          correlationId: 'r8',
        }),
      (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT',
    );

    // Unrelated obligation (installment #2) in the same transaction is NOT frozen and can be settled
    const unrelatedStl = await ledgerService.createSettlement({
      principal: h.principals['tok-tenant'],
      transactionId: 'tx_rent_1',
      rawInput: {
        allocations: [{ obligationId: inst2Id, allocatedAmount: 150_000_000 }],
        currency: 'IRR',
        payerUid: 'uid_tenant_1',
        payeeUid: 'uid_landlord_1',
      },
      idempotencyKey: 'idem_stl_inst2_ok',
      correlationId: 'r9',
    });
    assert.equal(unrelatedStl.statusCode, 201);

    // Admin resolves financial dispute and restores installment #1
    const resolvedDisp = await ledgerService.resolveFinancialDispute({
      principal: h.principals['tok-admin'],
      transactionId: 'tx_rent_1',
      financialDisputeId: 'fnd_rent_inst1',
      rawInput: {
        targetStatus: 'RESOLVED',
        resolutionReference: 'RES_METER_01',
        resolutionSummary: 'Meter reading verified and accepted by both parties',
        restoreObligationsAndSettlements: true,
      },
      idempotencyKey: 'idem_fnd_resolve_1',
      correlationId: 'r10',
    });
    assert.equal(resolvedDisp.body.status, 'RESOLVED');

    // Verify reconciliation detects unbalanced/mismatched records when fed corrupted data directly
    const mismatchReport = runTransactionFinancialReconciliation({
      reportId: 'rcp_test_mismatch',
      transactionId: 'tx_rent_1',
      currency: 'IRR',
      obligations: [],
      ledgerEntries: [
        {
          entryId: 'le_unbalanced_1',
          postingGroupId: 'lpg_bad',
          transactionId: 'tx_rent_1',
          entryType: 'ADJUSTMENT_POSTING',
          direction: 'DEBIT',
          accountType: 'ADJUSTMENT_CONTROL',
          amount: 1000,
          currency: 'IRR',
          financialCategory: 'OTHER',
          responsiblePartyUid: 'uid_tenant_1',
          createdAtIso: new Date().toISOString(),
          actorUid: 'uid_admin_1',
          status: 'POSTED',
          idempotencyReference: 'bad_1',
          metadata: {},
        },
      ],
      paymentRefs: [],
      settlements: [],
      refunds: [],
      financialDisputes: [],
      actorUid: 'uid_admin_1',
      nowIso: new Date().toISOString(),
    });
    assert.equal(mismatchReport.status, 'FAILED');
    assert.ok(mismatchReport.discrepancies.some((d) => d.code === 'UNBALANCED_LEDGER_GROUP'));
  });

  it('4. Serves Express HTTP routes with authentication, participant isolation, and analytics', async () => {
    const h = createInMemoryFirestoreHarness();
    const txService = createTransactionsService(h);
    await txService.createTransaction({
      principal: h.principals['tok-seller'],
      rawBody: {
        transactionId: 'tx_http_ledger_1',
        transactionType: 'SALE',
        propertyId: 'prop_http_1',
        cityId: 'tehran',
        hoodId: 1,
        initiatorRole: 'SELLER',
        askingAmount: 50_000_000_000,
        currency: 'IRR',
      },
      idempotencyKey: 'idem_http_tx_1',
      correlationId: 'h1',
    });
    await txService.inviteParticipant({
      principal: h.principals['tok-seller'],
      transactionId: 'tx_http_ledger_1',
      rawBody: { targetUserId: 'uid_buyer_1', role: 'BUYER', expectedVersion: 1 },
      correlationId: 'h2',
    });
    await txService.respondToInvitation({
      principal: h.principals['tok-buyer'],
      transactionId: 'tx_http_ledger_1',
      rawBody: { decision: 'ACCEPT', expectedVersion: 2 },
      correlationId: 'h3',
    });

    const app = express();
    app.use(express.json());
    app.use('/api/transactions', createTransactionFinancialLedgerRouter(h));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}/api/transactions`;

    try {
      // Outsider blocked with 403
      const outsiderRes = await fetch(`${baseUrl}/tx_http_ledger_1/ledger/summary`, {
        headers: { Authorization: 'Bearer token_outsider_valid_0009' },
      });
      assert.equal(outsiderRes.status, 403);

      // Create obligation via POST
      const createObRes = await fetch(`${baseUrl}/tx_http_ledger_1/ledger/obligations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_seller_valid_00001',
          'Idempotency-Key': 'http_idem_ob_1',
        },
        body: JSON.stringify({
          obligationId: 'obl_http_1',
          category: 'PURCHASE_PRICE',
          title: 'HTTP Sale Obligation',
          amount: 50_000_000_000,
          currency: 'IRR',
          payerUid: 'uid_buyer_1',
          payeeUid: 'uid_seller_1',
          dueDateIso: '2027-05-01T00:00:00.000Z',
        }),
      });
      assert.equal(createObRes.status, 201);

      // Reconcile via POST
      const recRes = await fetch(`${baseUrl}/tx_http_ledger_1/ledger/reconcile`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token_buyer_valid_000001' },
      });
      assert.equal(recRes.status, 200);
      const recJson = (await recRes.json()) as { ok: boolean; data: { status: string } };
      assert.equal(recJson.data.status, 'RECONCILED');

      // Analytics via GET
      const analyticsRes = await fetch(`${baseUrl}/ledger/analytics`, {
        headers: { Authorization: 'Bearer token_admin_valid_000001' },
      });
      assert.equal(analyticsRes.status, 200);
      const analyticsJson = (await analyticsRes.json()) as {
        ok: boolean;
        data: { totalObligationVolume: number };
      };
      assert.equal(analyticsJson.data.totalObligationVolume, 50_000_000_000);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
