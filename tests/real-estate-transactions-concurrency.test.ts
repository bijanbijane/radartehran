import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCanonicalCrossModuleAdapters,
  createProductionRealEstateTransactionsModule,
  createStrictFirestoreBackingAdapterForTests,
  FirestoreRealEstateTransactionStore,
  RealEstateTransactionError,
  type TransactionActorContext,
} from '../server/modules/real-estate-transactions';

test('RT-TRANSACTION-CRITICAL-030: concurrent rival offer acceptance guarantees single winner, blocks duplicate offers & premature completion', async () => {
  const engine = createStrictFirestoreBackingAdapterForTests();
  await engine.setDoc('pr_canonical_properties', 'prop_conc_1', { id: 'prop_conc_1', status: 'ACTIVE' });
  await engine.setDoc('property_ownership_rights', 'own_c1', {
    id: 'own_c1',
    propertyId: 'prop_conc_1',
    partyId: 'seller_c1',
    rightType: 'OWNER',
    status: 'ACTIVE',
  });
  await engine.setDoc('payment_intents', 'pay_c1', {
    id: 'pay_c1',
    status: 'SUCCEEDED',
    ledgerCommitted: true,
  });
  await engine.setDoc('property_ownership_transfers', 'trf_c1', {
    id: 'trf_c1',
    propertyId: 'prop_conc_1',
    status: 'CONFIRMED',
  });

  const store = new FirestoreRealEstateTransactionStore(engine);
  const prod = createProductionRealEstateTransactionsModule({
    store,
    ...createCanonicalCrossModuleAdapters(engine),
  });

  const buyerA: TransactionActorContext = { userId: 'u_buyer_a', partyId: 'buyer_a', role: 'BUYER' };
  const buyerB: TransactionActorContext = { userId: 'u_buyer_b', partyId: 'buyer_b', role: 'BUYER' };
  const seller: TransactionActorContext = { userId: 'u_seller_c1', partyId: 'seller_c1', role: 'SELLER' };

  const { transaction } = await prod.service.createTransactionCase(buyerA, {
    transactionType: 'PROPERTY_SALE',
    propertyId: 'prop_conc_1',
    jurisdictionCitySlug: 'tehran',
    sourceProvenance: 'concurrency_test',
    idempotencyKey: 'idem-conc-create',
  });

  await prod.service.inviteParticipant(buyerA, {
    transactionId: transaction.id,
    partyId: 'seller_c1',
    role: 'SELLER',
    authorizationScope: 'sale',
    idempotencyKey: 'idem-conc-seller',
  });
  await prod.service.inviteParticipant(buyerA, {
    transactionId: transaction.id,
    partyId: 'buyer_b',
    role: 'BUYER',
    authorizationScope: 'co_buyer',
    idempotencyKey: 'idem-conc-buyerb',
  });

  // Premature completion without accepted offer or executed contract -> 409
  await assert.rejects(
    () =>
      prod.service.completeTransactionCase(seller, {
        transactionId: transaction.id,
        finalPaymentRef: 'pay_c1',
        ownershipTransferRef: 'trf_c1',
      }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.statusCode === 409 && err.code === 'COMPLETION_PREREQUISITES_UNMET',
  );

  // Submit Offer 1 from Buyer A
  const offerA = await prod.service.submitOfferOrCounteroffer(buyerA, {
    transactionId: transaction.id,
    offerType: 'PURCHASE_OFFER',
    proposedPriceRials: 12_000_000_000,
    recipientPartyIds: ['seller_c1'],
    idempotencyKey: 'idem-offer-a1',
  });

  // Duplicate active offer from Buyer A at same price -> 409 DUPLICATE_ACTIVE_OFFER
  await assert.rejects(
    () =>
      prod.service.submitOfferOrCounteroffer(buyerA, {
        transactionId: transaction.id,
        offerType: 'PURCHASE_OFFER',
        proposedPriceRials: 12_000_000_000,
        recipientPartyIds: ['seller_c1'],
        idempotencyKey: 'idem-offer-a1-dup',
      }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.statusCode === 409 && err.code === 'DUPLICATE_ACTIVE_OFFER',
  );

  // Submit competing Offer 2 from Buyer B
  const offerB = await prod.service.submitOfferOrCounteroffer(buyerB, {
    transactionId: transaction.id,
    offerType: 'PURCHASE_OFFER',
    proposedPriceRials: 12_500_000_000,
    recipientPartyIds: ['seller_c1'],
    idempotencyKey: 'idem-offer-b1',
  });

  // Stale CAS expectedRevision -> 409 CONCURRENT_MODIFICATION_CONFLICT
  await assert.rejects(
    () =>
      prod.service.decideOnOffer(seller, {
        transactionId: transaction.id,
        offerId: offerA.offer.id,
        decision: 'ACCEPTED',
        expectedRevision: 1,
      }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.statusCode === 409 && err.code === 'CONCURRENT_MODIFICATION_CONFLICT',
  );

  // Fire two concurrent acceptances simultaneously: STRICTLY ONE must succeed!
  const results = await Promise.allSettled([
    prod.service.decideOnOffer(seller, {
      transactionId: transaction.id,
      offerId: offerA.offer.id,
      decision: 'ACCEPTED',
    }),
    prod.service.decideOnOffer(seller, {
      transactionId: transaction.id,
      offerId: offerB.offer.id,
      decision: 'ACCEPTED',
    }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'Exactly one competing offer acceptance must succeed');
  assert.equal(rejected.length, 1, 'The losing concurrent offer acceptance must be rejected');

  const finalOffers = await store.listOffers(transaction.id);
  const acceptedCount = finalOffers.filter((o) => o.status === 'ACCEPTED').length;
  const supersededCount = finalOffers.filter((o) => o.status === 'SUPERSEDED').length;
  assert.equal(acceptedCount, 1);
  assert.equal(supersededCount, 1);
});
