import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  createStrictFirestoreBackingAdapterForTests,
  type DurableFirestoreEngine,
} from '../server/modules/real-estate-transactions';
import {
  CanonicalDisputeError,
  createCanonicalDisputeAdapters,
  createInMemoryDisputeResolutionModuleForTests,
  createProductionDisputeResolutionModule,
  DISPUTE_RESOLUTION_COLLECTIONS,
  FirestoreDisputeResolutionStore,
  registerDisputeResolutionRoutes,
} from '../server/modules/dispute-resolution';

async function seedDisputeFixtures(engine: DurableFirestoreEngine) {
  await engine.setDoc('pr_canonical_properties', 'prop_disp_1', { id: 'prop_disp_1', status: 'ACTIVE' });
  await engine.setDoc('real_estate_transactions', 'retx_disp_1', {
    id: 'retx_disp_1',
    propertyId: 'prop_disp_1',
    initiatorPartyId: 'uid_claimant_1',
    participantIds: ['uid_claimant_1', 'uid_respondent_1'],
    status: 'NEGOTIATION',
  });
  await engine.setDoc('media_object_metadata_v2', 'media_ev_1', {
    id: 'media_ev_1',
    lifecycleState: 'ACTIVE',
  });
}

test('RT-DISPUTE-CRITICAL-031: durable case/claim/response/evidence survive restart with idempotency', async () => {
  const sharedBacking = new Map<string, Map<string, Record<string, unknown>>>();
  const engine1 = createStrictFirestoreBackingAdapterForTests(sharedBacking);
  await seedDisputeFixtures(engine1);

  const store1 = new FirestoreDisputeResolutionStore(engine1);
  const prod1 = createProductionDisputeResolutionModule({
    store: store1,
    ...createCanonicalDisputeAdapters(engine1),
  });

  const created = await prod1.service.createDisputeCase(
    { uid: 'uid_claimant_1' },
    {
      category: 'DEPOSIT_REFUND',
      titleFa: 'اختلاف بر سر استرداد ودیعه اجاره',
      descriptionFa: 'موجر پس از تحویل ملک از استرداد کامل ودیعه خودداری کرده است.',
      respondentUid: 'uid_respondent_1',
      transactionReferenceId: 'retx_disp_1',
      idempotencyKey: 'idem-disp-create-1',
    },
  );
  assert.equal(created.replayed, false);
  assert.equal(created.caseRecord.status, 'SUBMITTED');
  assert.equal(created.caseRecord.revision, 1);

  // Idempotent replay returns exact same case
  const replay = await prod1.service.createDisputeCase(
    { uid: 'uid_claimant_1' },
    {
      category: 'DEPOSIT_REFUND',
      titleFa: 'اختلاف بر سر استرداد ودیعه اجاره',
      descriptionFa: 'موجر پس از تحویل ملک از استرداد کامل ودیعه خودداری کرده است.',
      respondentUid: 'uid_respondent_1',
      transactionReferenceId: 'retx_disp_1',
      idempotencyKey: 'idem-disp-create-1',
    },
  );
  assert.equal(replay.replayed, true);
  assert.equal(replay.caseRecord.id, created.caseRecord.id);

  // Reused idempotency key with different payload -> 409
  await assert.rejects(
    () =>
      prod1.service.createDisputeCase(
        { uid: 'uid_claimant_1' },
        {
          category: 'PROPERTY_DEFECT',
          titleFa: 'عنوان متفاوت برای همان کلید',
          descriptionFa: 'شرح متفاوت برای بررسی خطای هم‌پوشانی کلید یکتا.',
          respondentUid: 'uid_respondent_1',
          transactionReferenceId: 'retx_disp_1',
          idempotencyKey: 'idem-disp-create-1',
        },
      ),
    (err: unknown) => err instanceof CanonicalDisputeError && err.statusCode === 409 && err.code === 'IDEMPOTENCY_CONFLICT',
  );

  const claim = await prod1.service.addClaim({ uid: 'uid_claimant_1' }, created.caseRecord.id, {
    titleFa: 'مطالبه ودیعه',
    factualAccountFa: 'ملک در تاریخ مقرر بدون خسارت تحویل داده شد.',
    requestedRemedyFa: 'استرداد کامل ودیعه',
    claimedAmountRials: 500_000_000,
  });
  await prod1.service.submitClaimResponse({ uid: 'uid_respondent_1' }, claim.id, {
    stance: 'PARTIALLY_ADMITTED',
    statementFa: 'بخشی از ودیعه بابت قبوض کسر شده است.',
  });
  await prod1.service.attachEvidence({ uid: 'uid_claimant_1' }, created.caseRecord.id, {
    evidenceType: 'RECEIPT',
    descriptionFa: 'رسید تحویل کلید',
    sourceMediaId: 'media_ev_1',
    confidentiality: 'PARTIES_VISIBLE',
  });

  // Restart with fresh engine/store/service over same shared backing
  const engine2 = createStrictFirestoreBackingAdapterForTests(sharedBacking);
  const store2 = new FirestoreDisputeResolutionStore(engine2);
  const prod2 = createProductionDisputeResolutionModule({
    store: store2,
    ...createCanonicalDisputeAdapters(engine2),
  });

  const summary = await prod2.service.getCaseSummary({ uid: 'uid_claimant_1' }, created.caseRecord.id);
  assert.equal(summary.caseRecord.revision, 4);
  assert.equal(summary.claims.length, 1);
  assert.equal(summary.evidence.length, 1);
  const hist = await store2.listHistoryForCase(created.caseRecord.id);
  assert.equal(hist.items.length, 4);
  const outbox = await engine2.queryDocs(DISPUTE_RESOLUTION_COLLECTIONS.outbox, [], { limit: 10 });
  assert.ok(outbox.items.length >= 4);
});

test('RT-DISPUTE-CRITICAL-031: production factory enforces 503 gate and blocks InMemory in production', async () => {
  assert.throws(
    () => createProductionDisputeResolutionModule({}),
    (err: unknown) =>
      err instanceof CanonicalDisputeError &&
      err.statusCode === 503 &&
      err.code === 'DISPUTE_RESOLUTION_DEPENDENCY_UNAVAILABLE',
  );

  const prev = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.throws(
      () => createInMemoryDisputeResolutionModuleForTests(),
      (err: unknown) =>
        err instanceof CanonicalDisputeError &&
        err.statusCode === 503 &&
        err.code === 'DISPUTE_RESOLUTION_DEPENDENCY_UNAVAILABLE',
    );
  } finally {
    process.env.NODE_ENV = prev;
  }

  const app = express();
  app.use(express.json());
  registerDisputeResolutionRoutes(app, { service: null });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/disputes/my-cases`);
    assert.equal(res.status, 503);
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, 'DISPUTE_RESOLUTION_DEPENDENCY_UNAVAILABLE');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
