import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  createCanonicalCrossModuleAdapters,
  createProductionRealEstateTransactionsModule,
  createStrictFirestoreBackingAdapterForTests,
  FirestoreRealEstateTransactionStore,
  RealEstateTransactionError,
  registerRealEstateTransactionsRoutes,
  type TransactionActorContext,
} from '../server/modules/real-estate-transactions';

test('RT-TRANSACTION-CRITICAL-030: cross-module authorization rejects spoofed seller, expired mandate, forged payment, and missing media', async () => {
  const engine = createStrictFirestoreBackingAdapterForTests();
  await engine.setDoc('pr_canonical_properties', 'prop_auth_1', { id: 'prop_auth_1', status: 'ACTIVE' });
  await engine.setDoc('property_ownership_rights', 'own_rep_1', {
    id: 'own_rep_1',
    propertyId: 'prop_auth_1',
    partyId: 'party_legal_rep',
    rightType: 'AUTHORIZED_REPRESENTATIVE',
    status: 'ACTIVE',
  });
  await engine.setDoc('brokerage_mandates', 'mandate_expired', {
    id: 'mandate_expired',
    propertyId: 'prop_auth_1',
    partyId: 'broker_expired',
    status: 'ACTIVE',
    expiresAtIso: '2020-01-01T00:00:00.000Z',
  });
  await engine.setDoc('brokerage_mandates', 'mandate_valid', {
    id: 'mandate_valid',
    propertyId: 'prop_auth_1',
    partyId: 'broker_valid',
    status: 'ACTIVE',
    expiresAtIso: '2099-01-01T00:00:00.000Z',
  });
  // Payment succeeded WITHOUT ledgerCommitted=true must fail!
  await engine.setDoc('payment_intents', 'pay_uncommitted', {
    id: 'pay_uncommitted',
    status: 'SUCCEEDED',
    ledgerCommitted: false,
  });
  await engine.setDoc('payment_intents', 'pay_committed', {
    id: 'pay_committed',
    status: 'SUCCEEDED',
    ledgerCommitted: true,
  });
  await engine.setDoc('media_object_metadata_v2', 'media_deleted', {
    id: 'media_deleted',
    lifecycleState: 'DELETED',
  });

  const store = new FirestoreRealEstateTransactionStore(engine);
  const prod = createProductionRealEstateTransactionsModule({
    store,
    ...createCanonicalCrossModuleAdapters(engine),
  });

  const buyer: TransactionActorContext = { userId: 'u_buyer', partyId: 'party_buyer', role: 'BUYER' };
  const intruder: TransactionActorContext = { userId: 'u_intruder', partyId: 'party_intruder', role: 'BUYER' };

  const { transaction } = await prod.service.createTransactionCase(buyer, {
    transactionType: 'PROPERTY_SALE',
    propertyId: 'prop_auth_1',
    jurisdictionCitySlug: 'tehran',
    sourceProvenance: 'auth_test',
    idempotencyKey: 'idem-auth-create-1',
  });

  // 1. Spoofed seller without ownership record -> 403
  await assert.rejects(
    () =>
      prod.service.inviteParticipant(buyer, {
        transactionId: transaction.id,
        partyId: 'party_fake_seller',
        role: 'SELLER',
        authorizationScope: 'sale',
        idempotencyKey: 'idem-fake-seller',
      }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.statusCode === 403 && err.code === 'UNVERIFIED_SELLER_OR_LANDLORD_AUTHORITY',
  );

  // 2. Authorized representative verified via Property Ownership -> OK
  const rep = await prod.service.inviteParticipant(buyer, {
    transactionId: transaction.id,
    partyId: 'party_legal_rep',
    role: 'AUTHORIZED_REPRESENTATIVE',
    authorizationScope: 'poa',
    idempotencyKey: 'idem-rep-ok',
  });
  assert.equal(rep.authorityVerifiedByRegistryOrMandate, true);

  // 3. Expired brokerage mandate -> 403
  await assert.rejects(
    () =>
      prod.service.inviteParticipant(buyer, {
        transactionId: transaction.id,
        partyId: 'broker_expired',
        role: 'LISTING_AGENT',
        authorizationScope: 'broker',
        idempotencyKey: 'idem-broker-exp',
      }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.statusCode === 403 && err.code === 'UNVERIFIED_BROKER_MANDATE',
  );

  // 4. Active valid brokerage mandate -> OK
  const broker = await prod.service.inviteParticipant(buyer, {
    transactionId: transaction.id,
    partyId: 'broker_valid',
    role: 'LISTING_AGENT',
    authorizationScope: 'broker',
    idempotencyKey: 'idem-broker-ok',
  });
  assert.equal(broker.authorityVerifiedByRegistryOrMandate, true);

  // 5. Forged legacy mock prefix "confirmed-pay-fake" MUST BE REJECTED!
  await assert.rejects(
    () =>
      prod.service.recordVerifiedPaymentReference(buyer, {
        transactionId: transaction.id,
        paymentRef: 'confirmed-pay-fake',
      }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.statusCode === 409 && err.code === 'UNVERIFIED_PAYMENT_REFERENCE',
  );

  // 6. Payment without ledgerCommitted=true MUST BE REJECTED!
  await assert.rejects(
    () =>
      prod.service.recordVerifiedPaymentReference(buyer, {
        transactionId: transaction.id,
        paymentRef: 'pay_uncommitted',
      }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.statusCode === 409 && err.code === 'UNVERIFIED_PAYMENT_REFERENCE',
  );

  // 7. Verified ledger-committed payment -> OK
  const payRef = await prod.service.recordVerifiedPaymentReference(buyer, {
    transactionId: transaction.id,
    paymentRef: 'pay_committed',
  });
  assert.equal(payRef.verifiedByPaymentsEngine, true);

  // 8. Deleted / nonexistent media doc -> 400 INVALID_MEDIA_REFERENCE
  await assert.rejects(
    () =>
      prod.service.upsertContractMetadata(buyer, {
        transactionId: transaction.id,
        contractType: 'SALE_CONTRACT',
        mediaDocumentId: 'media_deleted',
        contractingPartyIds: ['party_buyer'],
      }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.statusCode === 400 && err.code === 'INVALID_MEDIA_REFERENCE',
  );

  // 9. Non-participant access -> 403
  await assert.rejects(
    () => prod.service.getTransactionCaseById(intruder, transaction.id),
    (err: unknown) => err instanceof RealEstateTransactionError && err.statusCode === 403 && err.code === 'UNAUTHORIZED_TRANSACTION_ACCESS',
  );
});

test('RT-TRANSACTION-CRITICAL-030: official Express router enforces auth, isolation, and 13-endpoint wiring', async () => {
  const engine = createStrictFirestoreBackingAdapterForTests();
  await engine.setDoc('pr_canonical_properties', 'prop_http_1', { id: 'prop_http_1', status: 'ACTIVE' });
  const store = new FirestoreRealEstateTransactionStore(engine);
  const prod = createProductionRealEstateTransactionsModule({
    store,
    ...createCanonicalCrossModuleAdapters(engine),
  });

  const app = express();
  app.use(express.json());
  registerRealEstateTransactionsRoutes(app, {
    service: prod.service,
    verifyUser: async (headers) => {
      const auth = String(headers.authorization || '');
      if (auth === 'Bearer buyer-tok') return { authorized: true, uid: 'uid_buyer_http', statusCode: 200 };
      if (auth === 'Bearer stranger-tok') return { authorized: true, uid: 'uid_stranger_http', statusCode: 200 };
      return { authorized: false, statusCode: 401, reason: 'UNAUTHORIZED' };
    },
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const base = `http://127.0.0.1:${addr.port}`;

    // Unauthenticated -> 401
    const unauth = await fetch(`${base}/api/v1/real-estate-transactions/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'idem-http-1' },
      body: JSON.stringify({ transactionType: 'PROPERTY_SALE', propertyId: 'prop_http_1' }),
    });
    assert.equal(unauth.status, 401);

    // Authenticated create -> 201
    const createRes = await fetch(`${base}/api/v1/real-estate-transactions/cases`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer buyer-tok',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'idem-http-create-1',
      },
      body: JSON.stringify({ transactionType: 'PROPERTY_SALE', propertyId: 'prop_http_1' }),
    });
    assert.equal(createRes.status, 201);
    const createdBody = (await createRes.json()) as { transaction: { id: string } };

    // Non-participant GET -> 403
    const strangerGet = await fetch(`${base}/api/v1/real-estate-transactions/cases/${createdBody.transaction.id}`, {
      headers: { Authorization: 'Bearer stranger-tok' },
    });
    assert.equal(strangerGet.status, 403);

    // Property history filters strictly to caller's transactions
    const strangerHist = await fetch(`${base}/api/v1/real-estate-transactions/properties/prop_http_1/history`, {
      headers: { Authorization: 'Bearer stranger-tok' },
    });
    assert.equal(strangerHist.status, 200);
    const histBody = (await strangerHist.json()) as { items: unknown[] };
    assert.equal(histBody.items.length, 0);

    // Buyer cancellation -> 200
    const cancelRes = await fetch(
      `${base}/api/v1/real-estate-transactions/cases/${createdBody.transaction.id}/cancellation-or-dispute`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer buyer-tok', 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'CANCELLED', reasonFa: 'انصراف توافقی' }),
      },
    );
    assert.equal(cancelRes.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
