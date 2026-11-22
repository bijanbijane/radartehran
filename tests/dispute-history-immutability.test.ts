import test from 'node:test';
import assert from 'node:assert/strict';
import { createStrictFirestoreBackingAdapterForTests } from '../server/modules/real-estate-transactions';
import {
  CanonicalDisputeError,
  createCanonicalDisputeAdapters,
  createProductionDisputeResolutionModule,
  FirestoreDisputeResolutionStore,
} from '../server/modules/dispute-resolution';

test('RT-DISPUTE-CRITICAL-031: audit timeline is append-only, revision-monotonic, rollback-safe, and survives restart', async () => {
  const sharedBacking = new Map<string, Map<string, Record<string, unknown>>>();
  const engine1 = createStrictFirestoreBackingAdapterForTests(sharedBacking);
  await engine1.setDoc('real_estate_transactions', 'tx_hist_1', {
    id: 'tx_hist_1',
    propertyId: 'prop_hist_1',
    initiatorPartyId: 'u_c1',
    participantIds: ['u_c1', 'u_r1'],
  });

  const store1 = new FirestoreDisputeResolutionStore(engine1);
  // Repository must NOT expose any update/delete API for caseHistory
  assert.equal('updateHistory' in store1, false);
  assert.equal('deleteHistory' in store1, false);

  const prod1 = createProductionDisputeResolutionModule({
    store: store1,
    ...createCanonicalDisputeAdapters(engine1),
  });

  const { caseRecord } = await prod1.service.createDisputeCase(
    { uid: 'u_c1' },
    {
      category: 'CONTRACT_PERFORMANCE',
      titleFa: 'تست تاریخچه غیرقابل ویرایش',
      descriptionFa: 'بررسی تداوم، یکنواختی نسخه و عدم ثبت رکورد یتیم هنگام خطا.',
      respondentUid: 'u_r1',
      transactionReferenceId: 'tx_hist_1',
      idempotencyKey: 'idem-hist-1',
    },
  );

  await prod1.service.transitionCaseStatus({ uid: 'u_c1' }, caseRecord.id, {
    targetStatus: 'NEGOTIATION',
    reasonFa: 'آغاز مذاکره',
    expectedRevision: 1,
  });

  // Failed CAS transition MUST roll back cleanly with ZERO orphan history entry
  await assert.rejects(
    () =>
      prod1.service.transitionCaseStatus({ uid: 'u_c1' }, caseRecord.id, {
        targetStatus: 'MEDIATION',
        reasonFa: 'نسخه قدیمی نباید تاریخچه بسازد',
        expectedRevision: 1,
      }),
    (err: unknown) => err instanceof CanonicalDisputeError && err.statusCode === 409 && err.code === 'CASE_REVISION_CONFLICT',
  );

  // Restart with fresh store/engine over shared durable backing
  const engine2 = createStrictFirestoreBackingAdapterForTests(sharedBacking);
  const store2 = new FirestoreDisputeResolutionStore(engine2);
  const timeline = await store2.listHistoryForCase(caseRecord.id);
  assert.equal(timeline.items.length, 2, 'Exactly 2 committed history entries (zero orphan from rolled-back CAS failure)');
  assert.ok(timeline.items.every((e) => e.immutable === true));
  const revisions = timeline.items.map((e) => e.caseRevision).sort((a, b) => a - b);
  assert.deepEqual(revisions, [1, 2]);
});
