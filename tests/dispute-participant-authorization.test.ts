import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createStrictFirestoreBackingAdapterForTests } from '../server/modules/real-estate-transactions';
import {
  CanonicalDisputeError,
  createCanonicalDisputeAdapters,
  createProductionDisputeResolutionModule,
  FirestoreDisputeResolutionStore,
  registerDisputeResolutionRoutes,
} from '../server/modules/dispute-resolution';

test('RT-DISPUTE-CRITICAL-031: verifies party linkage against Transaction/Registry, blocks spoofed respondent, and redacts MEDIATOR_ONLY evidence', async () => {
  const engine = createStrictFirestoreBackingAdapterForTests();
  await engine.setDoc('pr_canonical_properties', 'prop_p1', { id: 'prop_p1', status: 'ACTIVE' });
  await engine.setDoc('property_ownership_rights', 'own_p1', {
    id: 'own_p1',
    propertyId: 'prop_p1',
    partyId: 'uid_real_owner',
    rightType: 'OWNER',
    status: 'ACTIVE',
  });
  await engine.setDoc('real_estate_transactions', 'tx_p1', {
    id: 'tx_p1',
    propertyId: 'prop_p1',
    initiatorPartyId: 'uid_buyer',
    participantIds: ['uid_buyer', 'uid_real_owner'],
    status: 'NEGOTIATION',
  });
  await engine.setDoc('media_object_metadata_v2', 'media_pub', { id: 'media_pub', lifecycleState: 'ACTIVE' });
  await engine.setDoc('media_object_metadata_v2', 'media_priv', { id: 'media_priv', lifecycleState: 'ACTIVE' });

  const store = new FirestoreDisputeResolutionStore(engine);
  const prod = createProductionDisputeResolutionModule({
    store,
    ...createCanonicalDisputeAdapters(engine),
  });

  // 1. Spoofed respondentUid NOT part of tx_p1 MUST be rejected (403)
  await assert.rejects(
    () =>
      prod.service.createDisputeCase(
        { uid: 'uid_buyer' },
        {
          category: 'SALE_PURCHASE',
          titleFa: 'ادعای ساختگی علیه شخص نامرتبط',
          descriptionFa: 'تلاش برای ثبت پرونده علیه کاربری که در معامله حضور نداشته است.',
          respondentUid: 'uid_innocent_bystander',
          transactionReferenceId: 'tx_p1',
          idempotencyKey: 'idem-spoof-resp-1',
        },
      ),
    (err: unknown) => err instanceof CanonicalDisputeError && err.statusCode === 403 && err.code === 'UNVERIFIED_DISPUTE_PARTY_LINKAGE',
  );

  // 2. Unlinked property claim (neither party owns property) -> rejected (403)
  await assert.rejects(
    () =>
      prod.service.createDisputeCase(
        { uid: 'uid_stranger_a' },
        {
          category: 'OWNERSHIP_AUTHORITY',
          titleFa: 'ادعای نامرتبط با ملک',
          descriptionFa: 'تلاش برای ثبت پرونده روی ملکی که هیچ ارتباطی با طرفین ندارد.',
          respondentUid: 'uid_stranger_b',
          propertyReferenceId: 'prop_p1',
          idempotencyKey: 'idem-spoof-prop-1',
        },
      ),
    (err: unknown) => err instanceof CanonicalDisputeError && err.statusCode === 403 && err.code === 'UNVERIFIED_DISPUTE_PARTY_LINKAGE',
  );

  // 3. Valid Transaction-linked dispute -> succeeds
  const { caseRecord } = await prod.service.createDisputeCase(
    { uid: 'uid_buyer' },
    {
      category: 'SALE_PURCHASE',
      titleFa: 'اختلاف رسمی معامله ملک',
      descriptionFa: 'طرفین هر دو عضو تاییدشده معامله tx_p1 هستند.',
      respondentUid: 'uid_real_owner',
      transactionReferenceId: 'tx_p1',
      assignedMediatorUid: 'uid_mediator_1',
      idempotencyKey: 'idem-valid-disp-1',
    },
  );

  // Attach PARTIES_VISIBLE and MEDIATOR_ONLY evidence
  await prod.service.attachEvidence({ uid: 'uid_buyer' }, caseRecord.id, {
    evidenceType: 'CONTRACT',
    descriptionFa: 'نسخه مبایعه‌نامه قابل رویت طرفین',
    sourceMediaId: 'media_pub',
    confidentiality: 'PARTIES_VISIBLE',
  });
  await prod.service.attachEvidence({ uid: 'uid_mediator_1', serverRole: 'MEDIATOR' }, caseRecord.id, {
    evidenceType: 'OFFICIAL_DOCUMENT',
    descriptionFa: 'گزارش محرمانه میانجی‌گر',
    sourceMediaId: 'media_priv',
    confidentiality: 'MEDIATOR_ONLY',
  });

  // Claimant & Respondent MUST NOT see MEDIATOR_ONLY evidence
  const buyerView = await prod.service.getCaseSummary({ uid: 'uid_buyer' }, caseRecord.id);
  assert.equal(buyerView.evidence.length, 1);
  assert.equal(buyerView.evidence[0].confidentiality, 'PARTIES_VISIBLE');

  const ownerView = await prod.service.getCaseSummary({ uid: 'uid_real_owner' }, caseRecord.id);
  assert.equal(ownerView.evidence.length, 1);

  // Assigned Mediator sees BOTH
  const mediatorView = await prod.service.getCaseSummary({ uid: 'uid_mediator_1', serverRole: 'MEDIATOR' }, caseRecord.id);
  assert.equal(mediatorView.evidence.length, 2);

  // Non-participant intruder -> 403
  await assert.rejects(
    () => prod.service.getCaseSummary({ uid: 'uid_intruder' }, caseRecord.id),
    (err: unknown) => err instanceof CanonicalDisputeError && err.statusCode === 403 && err.code === 'FORBIDDEN_CASE_ACCESS',
  );

  // Verify HTTP endpoint confidentiality & authorization
  const app = express();
  app.use(express.json());
  registerDisputeResolutionRoutes(app, {
    service: prod.service,
    verifyUser: async (headers) => {
      const a = String(headers.authorization || '');
      if (a === 'Bearer buyer') return { authorized: true, uid: 'uid_buyer', statusCode: 200 };
      if (a === 'Bearer intruder') return { authorized: true, uid: 'uid_intruder', statusCode: 200 };
      return { authorized: false, statusCode: 401 };
    },
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const intruderRes = await fetch(`http://127.0.0.1:${addr.port}/api/disputes/cases/${caseRecord.id}`, {
      headers: { Authorization: 'Bearer intruder' },
    });
    assert.equal(intruderRes.status, 403);

    const buyerRes = await fetch(`http://127.0.0.1:${addr.port}/api/disputes/cases/${caseRecord.id}`, {
      headers: { Authorization: 'Bearer buyer' },
    });
    assert.equal(buyerRes.status, 200);
    const body = (await buyerRes.json()) as { evidence: Array<{ confidentiality: string }> };
    assert.equal(body.evidence.length, 1);
    assert.equal(body.evidence[0].confidentiality, 'PARTIES_VISIBLE');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
