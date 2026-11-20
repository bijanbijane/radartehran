import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  createCanonicalCrossModuleAdapters,
  createInMemoryRealEstateTransactionsModuleForTests,
  createProductionRealEstateTransactionsModule,
  createStrictFirestoreBackingAdapterForTests,
  FirestoreRealEstateTransactionStore,
  REAL_ESTATE_TRANSACTION_COLLECTIONS,
  RealEstateTransactionError,
  registerRealEstateTransactionsRoutes,
  type DurableFirestoreEngine,
  type TransactionActorContext,
} from '../server/modules/real-estate-transactions';

async function seedCanonicalFixtures(engine: DurableFirestoreEngine) {
  await engine.setDoc('pr_canonical_properties', 'prop_tehran_101', {
    id: 'prop_tehran_101',
    status: 'ACTIVE',
    citySlug: 'tehran',
  });
  await engine.setDoc('property_ownership_rights', 'own_seller_1', {
    id: 'own_seller_1',
    propertyId: 'prop_tehran_101',
    partyId: 'party_seller_1',
    rightType: 'OWNER',
    status: 'ACTIVE',
  });
  await engine.setDoc('media_object_metadata_v2', 'media_contract_1', {
    id: 'media_contract_1',
    lifecycleState: 'ACTIVE',
    mimeType: 'application/pdf',
  });
  await engine.setDoc('payment_intents', 'pay_intent_verified_1', {
    id: 'pay_intent_verified_1',
    status: 'SUCCEEDED',
    ledgerCommitted: true,
    amountRials: 15_000_000_000,
  });
  await engine.setDoc('property_ownership_transfers', 'trf_verified_1', {
    id: 'trf_verified_1',
    propertyId: 'prop_tehran_101',
    status: 'CONFIRMED',
  });
}

test('RT-TRANSACTION-CRITICAL-030: durable lifecycle survives restart and enforces idempotency + production gates', async () => {
  const sharedBacking = new Map<string, Map<string, Record<string, unknown>>>();
  const engine1 = createStrictFirestoreBackingAdapterForTests(sharedBacking);
  await seedCanonicalFixtures(engine1);

  const store1 = new FirestoreRealEstateTransactionStore(engine1);
  const adapters1 = createCanonicalCrossModuleAdapters(engine1);
  const prod = createProductionRealEstateTransactionsModule({ store: store1, ...adapters1 });

  const buyer: TransactionActorContext = { userId: 'u_buyer_1', partyId: 'party_buyer_1', role: 'BUYER' };
  const seller: TransactionActorContext = { userId: 'u_seller_1', partyId: 'party_seller_1', role: 'SELLER' };

  const created = await prod.service.createTransactionCase(buyer, {
    transactionType: 'PROPERTY_SALE',
    propertyId: 'prop_tehran_101',
    jurisdictionCitySlug: 'tehran',
    sourceProvenance: 'verified_test',
    idempotencyKey: 'idem-create-tx-001',
  });
  assert.equal(created.replayed, false);
  assert.equal(created.transaction.status, 'INITIATED');

  // Same idempotency key + same payload replays cleanly
  const replay = await prod.service.createTransactionCase(buyer, {
    transactionType: 'PROPERTY_SALE',
    propertyId: 'prop_tehran_101',
    jurisdictionCitySlug: 'tehran',
    sourceProvenance: 'verified_test',
    idempotencyKey: 'idem-create-tx-001',
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.transaction.id, created.transaction.id);

  // Same idempotency key + different payload -> 409 IDEMPOTENCY_CONFLICT
  await assert.rejects(
    () =>
      prod.service.createTransactionCase(buyer, {
        transactionType: 'PROPERTY_RENTAL',
        propertyId: 'prop_tehran_101',
        jurisdictionCitySlug: 'tehran',
        sourceProvenance: 'verified_test',
        idempotencyKey: 'idem-create-tx-001',
      }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.statusCode === 409 && err.code === 'IDEMPOTENCY_CONFLICT',
  );

  // Invite verified seller, accept invitation, submit offer, accept offer, execute contract, verify payment, complete
  const sellerPart = await prod.service.inviteParticipant(buyer, {
    transactionId: created.transaction.id,
    partyId: 'party_seller_1',
    role: 'SELLER',
    authorizationScope: 'sale_authority',
    idempotencyKey: 'idem-invite-seller-1',
  });
  assert.equal(sellerPart.authorityVerifiedByRegistryOrMandate, true);

  await prod.service.respondToParticipantInvitation(seller, {
    transactionId: created.transaction.id,
    participantId: sellerPart.id,
    response: 'ACCEPTED',
  });

  const offerRes = await prod.service.submitOfferOrCounteroffer(buyer, {
    transactionId: created.transaction.id,
    offerType: 'PURCHASE_OFFER',
    proposedPriceRials: 15_000_000_000,
    recipientPartyIds: ['party_seller_1'],
    idempotencyKey: 'idem-offer-1',
  });

  await prod.service.decideOnOffer(seller, {
    transactionId: created.transaction.id,
    offerId: offerRes.offer.id,
    decision: 'ACCEPTED',
  });

  const contract = await prod.service.upsertContractMetadata(seller, {
    transactionId: created.transaction.id,
    contractType: 'SALE_CONTRACT',
    mediaDocumentId: 'media_contract_1',
    contractingPartyIds: ['party_buyer_1', 'party_seller_1'],
  });
  await prod.service.transitionContractWorkflowState(seller, {
    transactionId: created.transaction.id,
    contractId: contract.id,
    executionStatus: 'FULLY_EXECUTED',
  });
  await prod.service.upsertClosingMilestone(seller, {
    transactionId: created.transaction.id,
    titleFa: 'تحویل کلید و تنظیم سند رسمی',
    epistemicStatus: 'COMPLETED_AND_VERIFIED',
  });
  await prod.service.recordVerifiedPaymentReference(buyer, {
    transactionId: created.transaction.id,
    paymentRef: 'pay_intent_verified_1',
  });
  const completed = await prod.service.completeTransactionCase(seller, {
    transactionId: created.transaction.id,
    finalPaymentRef: 'pay_intent_verified_1',
    ownershipTransferRef: 'trf_verified_1',
  });
  assert.equal(completed.transaction.status, 'COMPLETED');
  assert.equal(completed.completedRecord.finalAgreedPriceRials, 15_000_000_000);

  // Simulate full process restart with fresh engine/store/service over shared durable backing
  const engine2 = createStrictFirestoreBackingAdapterForTests(sharedBacking);
  const store2 = new FirestoreRealEstateTransactionStore(engine2);
  const prod2 = createProductionRealEstateTransactionsModule({
    store: store2,
    ...createCanonicalCrossModuleAdapters(engine2),
  });
  const afterRestart = await prod2.service.getTransactionCaseById(buyer, created.transaction.id);
  assert.equal(afterRestart.transaction.status, 'COMPLETED');
  assert.equal(afterRestart.participants.length, 1);
  assert.equal(afterRestart.offers.length, 1);
  const historyPage = await store2.listHistory(created.transaction.id, { limit: 20 });
  assert.ok(historyPage.items.length >= 5, 'Durable audit history must survive restart');
  const outboxDocs = await engine2.queryDocs('real_estate_transaction_outbox', [], { limit: 10 });
  assert.ok(outboxDocs.items.length >= 1, 'Notification outbox must persist durably');
  const completedDoc = await engine2.getDoc(
    REAL_ESTATE_TRANSACTION_COLLECTIONS.completedRecords,
    completed.completedRecord.id,
  );
  assert.ok(completedDoc, 'Completed record must exist in canonical Firestore collection');
});

test('RT-TRANSACTION-CRITICAL-030: production factory rejects missing deps (503) and blocks InMemory in production', async () => {
  assert.throws(
    () => createProductionRealEstateTransactionsModule({}),
    (err: unknown) =>
      err instanceof RealEstateTransactionError &&
      err.statusCode === 503 &&
      err.code === 'REAL_ESTATE_TRANSACTION_DEPENDENCY_UNAVAILABLE',
  );

  const prevNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.throws(
      () => createInMemoryRealEstateTransactionsModuleForTests(),
      (err: unknown) =>
        err instanceof RealEstateTransactionError &&
        err.statusCode === 503 &&
        err.code === 'REAL_ESTATE_TRANSACTION_DEPENDENCY_UNAVAILABLE',
    );
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
  }

  // Router mounted without wired production service must fail closed with 503
  const app = express();
  app.use(express.json());
  registerRealEstateTransactionsRoutes(app, { service: null });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/v1/real-estate-transactions/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'idem-fail-closed-1' },
      body: JSON.stringify({ transactionType: 'PROPERTY_SALE', propertyId: 'prop_1' }),
    });
    assert.equal(res.status, 503);
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, 'REAL_ESTATE_TRANSACTION_DEPENDENCY_UNAVAILABLE');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
