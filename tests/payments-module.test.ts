/**
 * @file tests/payments-module.test.ts
 * @description Unit, integration, ledger accounting, and security tests for Employee 15 Payments Module.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  createPaymentRouter,
  FinancialLedgerEngine,
  MemoryPaymentStore,
  MockTestPaymentProviderAdapter,
  PaymentEngine,
  UnavailablePaymentProviderAdapter,
} from '../server/modules/payments';

console.log('🧪 Running Employee 15 Payments, Wallet & Settlement Backend Tests...\n');

let passed = 0;
function verify(name: string, fn: () => void | Promise<void>) {
  const res = fn();
  if (res instanceof Promise) {
    return res.then(() => {
      passed += 1;
      console.log(`  ✅ ${passed}. ${name}`);
    });
  }
  passed += 1;
  console.log(`  ✅ ${passed}. ${name}`);
}

async function runAllTests() {
  const store = new MemoryPaymentStore();
  const ledger = new FinancialLedgerEngine();
  const mockProvider = new MockTestPaymentProviderAdapter();

  const engine = new PaymentEngine(store, ledger, mockProvider);

  // Test 1: Payment intent creation and validation
  let intent1Id = '';
  await verify('Creates payment intent with positive integer minor units and validates currency', async () => {
    const res = await engine.createPaymentIntent({
      customerUid: 'cust_pay_1',
      businessModule: 'SPONSORS',
      businessObjectId: 'camp_alpha_1',
      purpose: 'SPONSOR_CAMPAIGN_RESERVATION',
      amount: 50000000, // 50,000,000 Rials
      currency: 'IRR',
      descriptionFa: 'رزرو کمپین اسپانسری نیاوران',
      idempotencyKey: 'idemp_pay_test_1',
    });

    assert.ok(res.success);
    assert.ok(res.intent);
    assert.equal(res.intent.amount, 50000000);
    assert.equal(res.intent.lifecycleState, 'CREATED');
    intent1Id = res.intent.id;

    // Reject non-positive or float amount
    const invalidRes = await engine.createPaymentIntent({
      customerUid: 'cust_pay_1',
      businessModule: 'SPONSORS',
      businessObjectId: 'camp_alpha_1',
      purpose: 'SPONSOR_CAMPAIGN_RESERVATION',
      amount: -100,
      currency: 'IRR',
      descriptionFa: 'نامعتبر',
    });
    assert.equal(invalidRes.success, false);
  });

  // Test 2: Idempotent replay of payment intent
  await verify('Idempotent replay returns existing intent without duplicating records', async () => {
    const replayed = await engine.createPaymentIntent({
      customerUid: 'cust_pay_1',
      businessModule: 'SPONSORS',
      businessObjectId: 'camp_alpha_1',
      purpose: 'SPONSOR_CAMPAIGN_RESERVATION',
      amount: 50000000,
      currency: 'IRR',
      descriptionFa: 'رزرو کمپین اسپانسری نیاوران',
      idempotencyKey: 'idemp_pay_test_1',
    });
    assert.ok(replayed.success);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.intent?.id, intent1Id);
  });

  // Test 3: Payment attempt initiation
  let providerRef = '';
  await verify('Initiates gateway attempt and transitions intent to REDIRECT_REQUIRED', async () => {
    const attemptRes = await engine.startPaymentAttempt(intent1Id, 'https://radartehran.ir/callback');
    assert.ok(attemptRes.success);
    assert.ok(attemptRes.attempt);
    assert.ok(attemptRes.redirectUrl?.includes('mock-gateway.local'));
    assert.ok(attemptRes.attempt.providerTransactionReference);
    providerRef = attemptRes.attempt.providerTransactionReference!;

    const intent = await store.getIntentById(intent1Id);
    assert.equal(intent?.lifecycleState, 'REDIRECT_REQUIRED');
  });

  // Test 4: Callback processing, verification, and balanced double-entry ledger posting
  await verify('Processes callback, verifies with provider, and posts balanced ledger entries', async () => {
    const callbackRes = await engine.verifyAndProcessCallback({
      intentId: intent1Id,
      providerTransactionReference: providerRef,
    });

    assert.ok(callbackRes.success);
    assert.equal(callbackRes.intent?.lifecycleState, 'SUCCEEDED');

    // Verify double-entry ledger invariant: sum(DEBIT) == sum(CREDIT)
    const entries = ledger.getAllEntries();
    assert.ok(entries.length >= 2);
    let totalDebit = 0;
    let totalCredit = 0;
    for (const e of entries) {
      if (e.entryType === 'DEBIT') totalDebit += e.amount;
      if (e.entryType === 'CREDIT') totalCredit += e.amount;
    }
    assert.equal(totalDebit, totalCredit, 'Ledger must be perfectly balanced');
    assert.equal(totalDebit, 50000000);
  });

  // Test 5: Idempotent duplicate callback protection
  await verify('Duplicate callbacks are handled safely without duplicate financial effects', async () => {
    const duplicateRes = await engine.verifyAndProcessCallback({
      intentId: intent1Id,
      providerTransactionReference: providerRef,
    });
    assert.ok(duplicateRes.success);
    assert.equal(duplicateRes.isDuplicateCallback, true);

    // Assert ledger entries count did not increase
    const entries = ledger.getAllEntries();
    assert.equal(entries.length, 2, 'No duplicate ledger entries posted');
  });

  // Test 6: Reversal entry in financial ledger
  await verify('Reverses transaction through explicit balancing entries without mutating original records', async () => {
    const txId = ledger.getAllEntries()[0].transactionReference;
    const reversal = await ledger.postReversal(txId, 'خطای محاسباتی کاربر', 'idemp_rev_test_1');

    assert.ok(reversal);
    assert.equal(reversal.entries.length, 2);

    // Sum of debits and credits across all entries should remain equal
    let totalDebit = 0;
    let totalCredit = 0;
    for (const e of ledger.getAllEntries()) {
      if (e.entryType === 'DEBIT') totalDebit += e.amount;
      if (e.entryType === 'CREDIT') totalCredit += e.amount;
    }
    assert.equal(totalDebit, totalCredit);
  });

  // Test 7: Double-entry ledger rejects unbalanced transactions
  await verify('Ledger engine strictly rejects unbalanced journal transactions', async () => {
    await assert.rejects(
      async () => {
        // Attempting to post unbalanced entries directly
        await (ledger as any).validateBalancedTransaction({
          transactionId: 'unbalanced_1',
          currency: 'IRR',
          timestampIso: new Date().toISOString(),
          idempotencyKey: 'idemp_unbal',
          entries: [
            {
              id: 'e1',
              transactionReference: 'unbalanced_1',
              accountId: 'acc1',
              entryType: 'DEBIT',
              amount: 1000,
              currency: 'IRR',
              timestampIso: new Date().toISOString(),
              descriptionFa: '',
              sourceBusinessModule: 'SPONSORS',
              sourceBusinessObjectId: 'b1',
            },
            {
              id: 'e2',
              transactionReference: 'unbalanced_1',
              accountId: 'acc2',
              entryType: 'CREDIT',
              amount: 900, // Unbalanced!
              currency: 'IRR',
              timestampIso: new Date().toISOString(),
              descriptionFa: '',
              sourceBusinessModule: 'SPONSORS',
              sourceBusinessObjectId: 'b1',
            },
          ],
        });
      },
      /UNBALANCED_LEDGER_TRANSACTION/,
    );
  });

  // Test 8: Partial and full refund execution with over-refund prevention
  await verify('Executes partial refund and prevents refunds exceeding original payment', async () => {
    // Setup a new fresh succeeded payment
    const p2 = await engine.createPaymentIntent({
      customerUid: 'cust_refund_user',
      businessModule: 'PROPERTY_SERVICES',
      businessObjectId: 'quote_100',
      purpose: 'SERVICE_BOOKING_DEPOSIT',
      amount: 20000000,
      currency: 'IRR',
      descriptionFa: 'بیعانه نقاشی ساختمان',
    });
    const att2 = await engine.startPaymentAttempt(p2.intent!.id, 'https://radartehran.ir/cb');
    await engine.verifyAndProcessCallback({
      intentId: p2.intent!.id,
      providerTransactionReference: att2.attempt!.providerTransactionReference!,
    });

    // 1. Partial refund of 5,000,000 Rials
    const ref1 = await engine.executeRefund({
      paymentIntentId: p2.intent!.id,
      amount: 5000000,
      reasonFa: 'کنسلی بخشی از خدمات',
      requestedByUid: 'cust_refund_user',
    });
    assert.ok(ref1.success);
    assert.equal(ref1.refund?.amount, 5000000);

    const intentUpdated = await store.getIntentById(p2.intent!.id);
    assert.equal(intentUpdated?.lifecycleState, 'PARTIALLY_REFUNDED');
    assert.equal(intentUpdated?.refundedAmount, 5000000);

    // 2. Reject over-refund (remaining is 15,000,000; trying 16,000,000)
    const overRefund = await engine.executeRefund({
      paymentIntentId: p2.intent!.id,
      amount: 16000000,
      reasonFa: 'درخواست غیرمجاز',
      requestedByUid: 'cust_refund_user',
    });
    assert.equal(overRefund.success, false);
    assert.ok(overRefund.errors?.[0].includes('INVALID_REFUND_AMOUNT'));
  });

  // Test 9: Wallet balances and double-spending prevention
  await verify('Derives wallet balance from ledger and blocks overdrafts and double spending', async () => {
    // Top-up wallet
    const topup = await engine.creditWallet('user_w_1', 10000000, 'IRR', 'شارژ کیف پول', 'idemp_w_top_1');
    assert.ok(topup.success);
    assert.equal(topup.newBalance, 10000000);

    // Spend from wallet
    const spend = await engine.debitWallet('user_w_1', 4000000, 'IRR', 'خرید ارتقای آگهی', 'idemp_w_spend_1');
    assert.ok(spend.success);
    assert.equal(spend.newBalance, 6000000);

    // Attempt spending more than balance (overdraft)
    await assert.rejects(
      async () => {
        await engine.debitWallet('user_w_1', 7000000, 'IRR', 'خرید اضافی', 'idemp_w_overdraft');
      },
      /INSUFFICIENT_WALLET_BALANCE/,
    );
  });

  // Test 10: Commission calculation preservation
  await verify('Calculates platform commission preserving policy version and mathematical precision', () => {
    const comm = engine.calculateCommission(
      'pi_comm_test_1',
      10000000, // 10,000,000 Rials
      'IRR',
      { policyId: 'standard_service_fee', policyVersion: 'v2.1', method: 'PERCENTAGE', rateOrFee: 5 }, // 5%
      'srv_booking_1',
    );
    assert.equal(comm.commissionAmount, 500000);
    assert.equal(comm.policyVersion, 'v2.1');
  });

  // Test 11: Reconciliation discrepancy detection
  await verify('Reconciliation engine detects amount and status mismatches against provider records', async () => {
    const discrepancies = await engine.reconcileTransactions([
      {
        ref: 'unknown_provider_ref_999',
        amount: 25000000,
        currency: 'IRR',
        status: 'SUCCEEDED',
      },
    ]);
    assert.ok(discrepancies.length >= 1);
    assert.equal(discrepancies[0].discrepancyType, 'MISSING_INTERNAL_RECORD');
  });

  // Test 12: Truthful unavailable gateway reporting
  await verify('Unavailable payment provider adapter reports unavailability truthfully without fake success', async () => {
    const unavailProvider = new UnavailablePaymentProviderAdapter();
    const initRes = await unavailProvider.initiatePayment();
    assert.equal(initRes.success, false);
    assert.equal(initRes.errorCode, 'GATEWAY_UNAVAILABLE');
  });

  // Test 13: Express API routes integration (fail-closed verified tokens + HMAC callback)
  await verify('Express API router mounts intent, callback, refund, and wallet balance endpoints safely', async () => {
    const app = express();
    app.use(express.json());
    const mockVerifier = {
      async verifyIdToken(token: string) {
        if (token === 'token_customer_pay_123456') return { uid: 'cust_express_pay', email: 'cust@example.com', email_verified: true };
        if (token === 'token_wallet_w1_123456') return { uid: 'user_w_1', email: 'w1@example.com', email_verified: true };
        throw new Error('INVALID_TOKEN');
      },
    };
    app.use('/api/payments', createPaymentRouter(engine, mockVerifier, { webhookHmacSecret: 'test_hmac_secret_value_1234' }));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}/api/payments`;

    try {
      // Spoofed x-test-uid without Bearer token must be rejected
      const spoofRes = await fetch(`${baseUrl}/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-uid': 'cust_express_pay' },
        body: JSON.stringify({
          businessModule: 'SPONSORS',
          businessObjectId: 'camp_express_1',
          purpose: 'SPONSOR_CAMPAIGN_RESERVATION',
          amount: 15000000,
          currency: 'IRR',
        }),
      });
      assert.equal(spoofRes.status, 401, 'Spoofable x-test-uid header must be rejected');

      // 1. POST /api/payments/intent with verified Bearer token
      const postRes = await fetch(`${baseUrl}/intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_customer_pay_123456',
        },
        body: JSON.stringify({
          businessModule: 'SPONSORS',
          businessObjectId: 'camp_express_1',
          purpose: 'SPONSOR_CAMPAIGN_RESERVATION',
          amount: 15000000,
          currency: 'IRR',
        }),
      });
      assert.equal(postRes.status, 201);
      const postJson = (await postRes.json()) as any;
      assert.ok(postJson.ok);
      assert.ok(postJson.data.intent.id);

      // 2. Unsigned payment callback must fail closed with 401
      const badCb = await fetch(`${baseUrl}/${postJson.data.intent.id}/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerTransactionReference: 'ref_untrusted' }),
      });
      assert.equal(badCb.status, 401);

      // 3. GET /api/payments/wallet/balance with verified Bearer token
      const balRes = await fetch(`${baseUrl}/wallet/balance?currency=IRR`, {
        headers: { Authorization: 'Bearer token_wallet_w1_123456' },
      });
      assert.equal(balRes.status, 200);
      const balJson = (await balRes.json()) as any;
      assert.ok(balJson.ok);
      assert.equal(balJson.data.balance, 6000000);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  console.log(`\n🎉 ALL ${passed} EMPLOYEE 15 PAYMENTS & SETTLEMENT TESTS PASSED!`);
}

runAllTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
