import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeFirestoreBackingAdapter } from '../server/modules/real-estate-transactions';
import {
  createCanonicalDisputeAdapters,
  createProductionDisputeResolutionModule,
  FirestoreDisputeResolutionStore,
} from '../server/modules/dispute-resolution';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST?.trim();

test(
  'RT-DISPUTE-CRITICAL-031 (Emulator): native Firestore transaction & history survival',
  { skip: !EMULATOR_HOST ? 'FIRESTORE_EMULATOR_HOST not set (Java JRE / Firestore Emulator required)' : false },
  async () => {
    const { initializeApp, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const appName = `dispute-emulator-${Date.now()}`;
    const app = getApps().find((a) => a.name === appName) ?? initializeApp({ projectId: 'radartehran-emulator-test' }, appName);
    const db = getFirestore(app);

    const engine = createNativeFirestoreBackingAdapter(db);
    const txId = `retx_emu_${Date.now()}`;
    await engine.setDoc('real_estate_transactions', txId, {
      id: txId,
      propertyId: 'prop_emu_disp',
      initiatorPartyId: 'emu_claimant',
      participantIds: ['emu_claimant', 'emu_respondent'],
      status: 'NEGOTIATION',
    });

    const store = new FirestoreDisputeResolutionStore(engine);
    const prod = createProductionDisputeResolutionModule({
      store,
      ...createCanonicalDisputeAdapters(engine),
    });

    const created = await prod.service.createDisputeCase(
      { uid: 'emu_claimant' },
      {
        category: 'SALE_PURCHASE',
        titleFa: 'اختلاف آزمایشی امولاتور',
        descriptionFa: 'تست تراکنش واقعی Firestore Emulator برای پرونده اختلاف.',
        respondentUid: 'emu_respondent',
        transactionReferenceId: txId,
        idempotencyKey: `emu-disp-idem-${Date.now()}`,
      },
    );
    assert.equal(created.replayed, false);

    const store2 = new FirestoreDisputeResolutionStore(createNativeFirestoreBackingAdapter(db));
    const persisted = await store2.getCaseById(created.caseRecord.id);
    assert.ok(persisted);
    assert.equal(persisted.status, 'SUBMITTED');
  },
);
