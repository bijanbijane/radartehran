import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCanonicalCrossModuleAdapters,
  createNativeFirestoreBackingAdapter,
  createProductionRealEstateTransactionsModule,
  FirestoreRealEstateTransactionStore,
  type TransactionActorContext,
} from '../server/modules/real-estate-transactions';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST?.trim();

test(
  'RT-TRANSACTION-CRITICAL-030 (Emulator): native Firestore transaction & restart persistence',
  { skip: !EMULATOR_HOST ? 'FIRESTORE_EMULATOR_HOST not set (Java JRE / Firestore Emulator required)' : false },
  async () => {
    const { initializeApp, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const appName = `retx-emulator-${Date.now()}`;
    const app = getApps().find((a) => a.name === appName) ?? initializeApp({ projectId: 'radartehran-emulator-test' }, appName);
    const db = getFirestore(app);

    const engine = createNativeFirestoreBackingAdapter(db);
    const propId = `prop_emu_${Date.now()}`;
    await engine.setDoc('pr_canonical_properties', propId, { id: propId, status: 'ACTIVE' });

    const store = new FirestoreRealEstateTransactionStore(engine);
    const prod = createProductionRealEstateTransactionsModule({
      store,
      ...createCanonicalCrossModuleAdapters(engine),
    });

    const buyer: TransactionActorContext = { userId: 'emu_buyer', partyId: 'emu_buyer', role: 'BUYER' };
    const created = await prod.service.createTransactionCase(buyer, {
      transactionType: 'PROPERTY_SALE',
      propertyId: propId,
      jurisdictionCitySlug: 'tehran',
      sourceProvenance: 'firestore_emulator_test',
      idempotencyKey: `emu-idem-${Date.now()}`,
    });
    assert.equal(created.replayed, false);

    // Re-read with fresh store instance
    const store2 = new FirestoreRealEstateTransactionStore(createNativeFirestoreBackingAdapter(db));
    const persisted = await store2.getTransaction(created.transaction.id);
    assert.ok(persisted);
    assert.equal(persisted.propertyId, propId);
    assert.equal(persisted.status, 'INITIATED');
  },
);
