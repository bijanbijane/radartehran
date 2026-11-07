import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CoreApiError,
  type AuthenticatedPrincipal,
  type DelegatedAdminStoreAdapter,
  type FirebaseTokenVerifierAdapter,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../../core';
import {
  computeCanonicalSponsorTariff,
  createSponsorsService,
  type PaymentVerificationAdapter,
  type SponsorAuditHistoryRecord,
  type SponsorSlotLockRecord,
  type StoredSponsorReservation,
} from '../index';

function createMockFirestoreAdapter(options?: { failNextTransaction?: boolean }) {
  const docs = new Map<string, Record<string, unknown>>();
  let shouldFail = options?.failNextTransaction ?? false;

  const txRunner: TransactionRunnerAdapter = {
    async runTransaction<T>(fn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      if (shouldFail) {
        throw new Error('SIMULATED_FIRESTORE_OUTAGE');
      }
      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<D = Record<string, unknown>>(docPath: string) {
          const current = staged.has(docPath) ? staged.get(docPath) : docs.get(docPath);
          if (!current) return { exists: false, id: docPath.split('/').pop() ?? '', data: undefined };
          return {
            exists: true,
            id: docPath.split('/').pop() ?? '',
            data: structuredClone(current) as D,
          };
        },
        set(docPath: string, data: Record<string, unknown>, setOpts?: { merge?: boolean }) {
          const existing = (staged.has(docPath) ? staged.get(docPath) : docs.get(docPath)) ?? {};
          staged.set(
            docPath,
            setOpts?.merge ? { ...structuredClone(existing), ...structuredClone(data) } : structuredClone(data),
          );
        },
        update(docPath: string, data: Record<string, unknown>) {
          const existing = (staged.has(docPath) ? staged.get(docPath) : docs.get(docPath)) ?? {};
          staged.set(docPath, { ...structuredClone(existing), ...structuredClone(data) });
        },
        delete(docPath: string) {
          staged.set(docPath, null);
        },
      };
      const result = await fn(tx);
      for (const [k, v] of staged.entries()) {
        if (v === null) docs.delete(k);
        else docs.set(k, v);
      }
      return result;
    },
  };

  return {
    docs,
    txRunner,
    setFailNextTransaction(val: boolean) {
      shouldFail = val;
    },
  };
}

const dummyTokenVerifier: FirebaseTokenVerifierAdapter = {
  async verifyIdToken() {
    throw new Error('Not used in direct service tests');
  },
};

const adminStore: DelegatedAdminStoreAdapter = {
  async getDelegatedAdminByUid(uid: string) {
    if (uid === 'admin_mod_1') {
      return { uid, email: 'mod@radartehran.ir', role: 'delegated_admin', active: true };
    }
    return null;
  },
};

const sponsorA: AuthenticatedPrincipal = {
  uid: 'sponsor_agency_1',
  email: 'agency1@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  issuedAtSeconds: 1700000000,
  expiresAtSeconds: 1700003600,
  claims: {},
};

const sponsorB: AuthenticatedPrincipal = {
  uid: 'sponsor_agency_2',
  email: 'agency2@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  issuedAtSeconds: 1700000000,
  expiresAtSeconds: 1700003600,
  claims: {},
};

const adminPrincipal: AuthenticatedPrincipal = {
  uid: 'admin_mod_1',
  email: 'mod@radartehran.ir',
  emailVerified: true,
  role: 'delegated_admin',
  authMode: 'firebase_id_token',
  issuedAtSeconds: 1700000000,
  expiresAtSeconds: 1700003600,
  claims: {},
};

test('1. Duplicate reservations, idempotency, slot availability & anti-spoofing validation', async () => {
  const db = createMockFirestoreAdapter();
  const nowMs = 1_750_000_000_000;
  const service = createSponsorsService({
    tokenVerifier: dummyTokenVerifier,
    adminStore,
    txRunner: db.txRunner,
    nowFn: () => nowMs,
  });

  // Initially slot is available
  const initialAvail = await service.checkSlotAvailability({ cityId: 'tehran', hoodId: 1 });
  assert.equal(initialAvail.availability, 'available');

  // Reject client attempts to spoof paymentStatus, totalPayableMillion, ownerUid, or status
  await assert.rejects(
    async () =>
      service.submitSponsorReservation({
        principal: sponsorA,
        idempotencyKey: 'idem_spoof_001',
        rawBody: {
          cityId: 'tehran',
          hoodId: 1,
          agencyName: 'آژانس املاک الف',
          phone: '09121112233',
          specialty: 'آپارتمان لوکس',
          experienceYears: 10,
          planMonths: 3,
          paymentStatus: 'paid_verified',
          totalPayableMillion: 0,
          ownerUid: 'someone_else',
        },
        correlationId: 'corr_spoof',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED' && err.status === 400,
  );

  // Canonical tariff check: hood 1 has baseMonthlyTariffMillion=15; 3-month plan = 15 * 2.4 = 36
  const tariff3m = computeCanonicalSponsorTariff(15, 3);
  assert.equal(tariff3m.totalPayableMillion, 36);

  const validPayload = {
    cityId: 'tehran',
    hoodId: 1,
    agencyName: 'آژانس املاک الف',
    phone: '09121112233',
    specialty: 'آپارتمان لوکس',
    experienceYears: 10,
    planMonths: 3,
  };

  const firstSubmit = await service.submitSponsorReservation({
    principal: sponsorA,
    idempotencyKey: 'idem_submit_sponsor_a_001',
    rawBody: validPayload,
    correlationId: 'corr_1',
  });
  assert.equal(firstSubmit.replayed, false);
  assert.equal(firstSubmit.statusCode, 201);
  assert.equal(firstSubmit.reservation.ownerUid, sponsorA.uid);
  assert.equal(firstSubmit.reservation.status, 'pending_review');
  assert.equal(firstSubmit.reservation.paymentStatus, 'unpaid');
  assert.equal(firstSubmit.reservation.totalPayableMillion, 36);

  // Slot is now reserved_pending
  const pendingAvail = await service.checkSlotAvailability({ cityId: 'tehran', hoodId: 1 });
  assert.equal(pendingAvail.availability, 'reserved_pending');

  // Idempotent retry with same key and payload replays without duplicate reservation error
  const replaySubmit = await service.submitSponsorReservation({
    principal: sponsorA,
    idempotencyKey: 'idem_submit_sponsor_a_001',
    rawBody: validPayload,
    correlationId: 'corr_2',
  });
  assert.equal(replaySubmit.replayed, true);
  assert.equal(replaySubmit.reservation.id, firstSubmit.reservation.id);
  assert.equal(replaySubmit.reservation.trackingCode, firstSubmit.reservation.trackingCode);

  // Second sponsor attempting to reserve the same neighborhood slot gets 409 CONFLICT
  await assert.rejects(
    async () =>
      service.submitSponsorReservation({
        principal: sponsorB,
        idempotencyKey: 'idem_submit_sponsor_b_001',
        rawBody: {
          ...validPayload,
          agencyName: 'آژانس املاک ب',
          phone: '09123334455',
        },
        correlationId: 'corr_3',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT' && err.status === 409,
  );
});

test('2. Authorization boundaries & strict public/private placement projection', async () => {
  const db = createMockFirestoreAdapter();
  const nowMs = 1_750_000_000_000;
  const service = createSponsorsService({
    tokenVerifier: dummyTokenVerifier,
    adminStore,
    txRunner: db.txRunner,
    nowFn: () => nowMs,
  });

  const created = await service.submitSponsorReservation({
    principal: sponsorA,
    idempotencyKey: 'idem_authz_001',
    rawBody: {
      cityId: 'tehran',
      hoodId: 2,
      agencyName: 'املاک نیاوران',
      phone: '09122223344',
      specialty: 'پنت‌هاوس و ویلایی',
      experienceYears: 12,
      planMonths: 1,
    },
    correlationId: 'corr_authz_1',
  });

  // Non-owner cannot view or cancel sponsorA's reservation
  await assert.rejects(
    async () =>
      service.getOwnerReservation({
        principal: sponsorB,
        reservationId: created.reservation.id,
        correlationId: 'corr_authz_2',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN' && err.status === 403,
  );

  await assert.rejects(
    async () =>
      service.cancelSponsorReservation({
        principal: sponsorB,
        reservationId: created.reservation.id,
        rawBody: { expectedRevision: 1 },
        correlationId: 'corr_authz_3',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN' && err.status === 403,
  );

  // Non-admin cannot moderate reservation
  await assert.rejects(
    async () =>
      service.moderateSponsorReservation({
        principal: sponsorB,
        reservationId: created.reservation.id,
        rawBody: { decision: 'approve' },
        correlationId: 'corr_authz_4',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN' && err.status === 403,
  );

  // Public placement returns null while pending_review
  const publicWhilePending = await service.getPublicActivePlacement({ cityId: 'tehran', hoodId: 2 });
  assert.equal(publicWhilePending, null);
});

test('3. Moderation transitions, verified payment activation, cancellation, expiration & audit history', async () => {
  const db = createMockFirestoreAdapter();
  let currentClockMs = 1_750_000_000_000;

  const paymentVerifier: PaymentVerificationAdapter = {
    async verifyPaymentEvent(event, expectedAmountMillion) {
      if (event.verificationSignature !== 'VALID_HMAC_SIG') {
        return { verified: false, reason: 'Invalid payment webhook signature.' };
      }
      if (event.amountMillionToman !== expectedAmountMillion) {
        return { verified: false, reason: 'Amount mismatch.' };
      }
      return { verified: true };
    },
  };

  const service = createSponsorsService({
    tokenVerifier: dummyTokenVerifier,
    adminStore,
    txRunner: db.txRunner,
    paymentVerifier,
    nowFn: () => currentClockMs,
  });

  const submitted = await service.submitSponsorReservation({
    principal: sponsorA,
    idempotencyKey: 'idem_lifecycle_001',
    rawBody: {
      cityId: 'tehran',
      hoodId: 3,
      agencyName: 'املاک سعادت‌آباد',
      phone: '09124445566',
      specialty: 'پیش‌فروش و نوساز',
      experienceYears: 8,
      planMonths: 1,
    },
    correlationId: 'corr_lc_1',
  });
  const resId = submitted.reservation.id;

  // Admin approval without payment waiver transitions pending_review -> approved_awaiting_payment
  const approvedAwaitingPayment = await service.moderateSponsorReservation({
    principal: adminPrincipal,
    reservationId: resId,
    rawBody: { decision: 'approve', expectedRevision: 1 },
    correlationId: 'corr_lc_2',
  });
  assert.equal(approvedAwaitingPayment.status, 'approved_awaiting_payment');
  assert.equal(approvedAwaitingPayment.paymentStatus, 'unpaid');
  assert.equal(approvedAwaitingPayment.revision, 2);

  // Still not publicly active before verified payment
  assert.equal(await service.getPublicActivePlacement({ cityId: 'tehran', hoodId: 3 }), null);

  // Forged payment event signature is rejected (never marks reservation paid without verified event)
  await assert.rejects(
    async () =>
      service.recordVerifiedPaymentEvent({
        rawEvent: {
          eventId: 'pay_evt_forged',
          reservationId: resId,
          amountMillionToman: submitted.reservation.totalPayableMillion,
          externalReferenceId: 'ref_forged_1',
          verificationSignature: 'INVALID_SIG',
          occurredAtIso: new Date(currentClockMs).toISOString(),
        },
        correlationId: 'corr_lc_forged',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN' && err.status === 403,
  );

  // Verified payment event transitions approved_awaiting_payment -> active and updates slot lock
  const paidAndActive = await service.recordVerifiedPaymentEvent({
    rawEvent: {
      eventId: 'pay_evt_valid_001',
      reservationId: resId,
      amountMillionToman: submitted.reservation.totalPayableMillion,
      externalReferenceId: 'ref_verified_999',
      verificationSignature: 'VALID_HMAC_SIG',
      occurredAtIso: new Date(currentClockMs).toISOString(),
    },
    correlationId: 'corr_lc_paid',
  });
  assert.equal(paidAndActive.status, 'active');
  assert.equal(paidAndActive.paymentStatus, 'paid_verified');
  assert.equal(paidAndActive.revision, 3);
  assert.ok(paidAndActive.expiresAtIso);

  // Slot is now active_occupied and public projection hides private sponsor/billing fields
  const activeAvail = await service.checkSlotAvailability({ cityId: 'tehran', hoodId: 3 });
  assert.equal(activeAvail.availability, 'active_occupied');

  const publicProj = await service.getPublicActivePlacement({ cityId: 'tehran', hoodId: 3 });
  assert.ok(publicProj);
  assert.equal(publicProj.agencyName, 'املاک سعادت‌آباد');
  assert.equal('ownerUid' in publicProj, false);
  assert.equal('ownerEmail' in publicProj, false);
  assert.equal('trackingCode' in publicProj, false);
  assert.equal('paymentStatus' in publicProj, false);
  assert.equal('totalPayableMillion' in publicProj, false);

  // Advance clock past 1-month expiration (31 days) and run expireSponsorReservationIfDue
  currentClockMs += 31 * 24 * 60 * 60 * 1000;
  const expiredResult = await service.expireSponsorReservationIfDue({ reservationId: resId });
  assert.equal(expiredResult.expired, true);
  assert.equal(expiredResult.status, 'expired');
  assert.equal(expiredResult.revision, 4);

  // Slot lock is released and public active placement is null
  const availAfterExpiry = await service.checkSlotAvailability({ cityId: 'tehran', hoodId: 3 });
  assert.equal(availAfterExpiry.availability, 'available');
  assert.equal(await service.getPublicActivePlacement({ cityId: 'tehran', hoodId: 3 }), null);

  // Verify durable audit history records for all 4 revisions exist in /sponsorAuditTrail/*
  for (let rev = 1; rev <= 4; rev++) {
    const auditDoc = db.docs.get(`sponsorAuditTrail/sp_aud_${resId}_r${rev}`) as unknown as
      | SponsorAuditHistoryRecord
      | undefined;
    assert.ok(auditDoc, `Expected audit record for revision ${rev}`);
    assert.equal(auditDoc.revision, rev);
  }
});

test('4. Persistence failure handling & slot lock release on cancellation', async () => {
  const db = createMockFirestoreAdapter();
  const service = createSponsorsService({
    tokenVerifier: dummyTokenVerifier,
    adminStore,
    txRunner: db.txRunner,
  });

  const sub = await service.submitSponsorReservation({
    principal: sponsorA,
    idempotencyKey: 'idem_cancel_001',
    rawBody: {
      cityId: 'tehran',
      hoodId: 4,
      agencyName: 'املاک پاسداران',
      phone: '09127778899',
      specialty: 'رهن و اجاره',
      experienceYears: 5,
      planMonths: 1,
    },
    correlationId: 'corr_c_1',
  });

  const cancelled = await service.cancelSponsorReservation({
    principal: sponsorA,
    reservationId: sub.reservation.id,
    rawBody: { expectedRevision: 1, reason: 'تغییر برنامه تبلیغاتی' },
    correlationId: 'corr_c_2',
  });
  assert.equal(cancelled.status, 'cancelled');

  const lockAfterCancel = db.docs.get('sponsorSlotLocks/tehran_hood_4') as unknown as
    | SponsorSlotLockRecord
    | undefined;
  assert.equal(lockAfterCancel?.status, 'released');

  // Simulate Firestore transaction outage and verify 503 PERSISTENCE_FAILED
  db.setFailNextTransaction(true);
  await assert.rejects(
    async () =>
      service.submitSponsorReservation({
        principal: sponsorB,
        idempotencyKey: 'idem_outage_001',
        rawBody: {
          cityId: 'tehran',
          hoodId: 5,
          agencyName: 'املاک ونک',
          phone: '09128889900',
          specialty: 'اداری و تجاری',
          experienceYears: 9,
          planMonths: 1,
        },
        correlationId: 'corr_outage',
      }),
    (err: unknown) => {
      assert.ok(err instanceof CoreApiError);
      assert.equal(err.code, 'PERSISTENCE_FAILED');
      assert.equal(err.status, 503);
      return true;
    },
  );
  assert.equal(db.docs.has(`sponsorRequests/${sponsorB.uid}_tehran_hood_5`), false);
});
