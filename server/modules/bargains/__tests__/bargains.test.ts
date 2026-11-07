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
  createBargainsService,
  type BargainQueryReaderAdapter,
  type StoredBargainDocument,
} from '../index';

function createMockFirestoreEnvironment(initialDocs: Record<string, Record<string, unknown>> = {}) {
  const store = new Map<string, Record<string, unknown>>(
    Object.entries(initialDocs).map(([k, v]) => [k, structuredClone(v)]),
  );
  let simulateFailure = false;

  const txRunner: TransactionRunnerAdapter = {
    async runTransaction<T>(updateFn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      if (simulateFailure) {
        throw new Error('Firestore backend unavailable');
      }
      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<D = Record<string, unknown>>(docPath: string) {
          const val = staged.has(docPath) ? staged.get(docPath) : store.get(docPath);
          return val ? { exists: true, data: structuredClone(val) as unknown as D } : { exists: false };
        },
        set(docPath: string, data: Record<string, unknown>, options?: { merge?: boolean }) {
          if (options?.merge && store.has(docPath)) {
            staged.set(docPath, { ...(store.get(docPath) ?? {}), ...structuredClone(data) });
          } else {
            staged.set(docPath, structuredClone(data));
          }
        },
        update(docPath: string, data: Record<string, unknown>) {
          const existing = staged.has(docPath) ? staged.get(docPath) : store.get(docPath);
          if (!existing) throw new Error(`Document ${docPath} does not exist`);
          staged.set(docPath, { ...existing, ...structuredClone(data) });
        },
        delete(docPath: string) {
          staged.set(docPath, null);
        },
      };
      const out = await updateFn(tx);
      for (const [k, v] of staged.entries()) {
        if (v === null) store.delete(k);
        else store.set(k, v);
      }
      return out;
    },
  };

  const queryReader: BargainQueryReaderAdapter = {
    async listBargainsByHood({ hoodId, limit }) {
      const matches: StoredBargainDocument[] = [];
      for (const [path, doc] of store.entries()) {
        if (path.startsWith('bargains/') && doc.hoodId === hoodId) {
          matches.push(structuredClone(doc) as unknown as StoredBargainDocument);
        }
      }
      return matches.slice(0, limit);
    },
  };

  return {
    txRunner,
    queryReader,
    getDoc: (path: string) => store.get(path),
    deleteDocRaw: (path: string) => store.delete(path),
    setSimulateFailure: (flag: boolean) => {
      simulateFailure = flag;
    },
  };
}

const ownerPrincipal: AuthenticatedPrincipal = {
  uid: 'owner_uid_tehran_1',
  email: 'owner1@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  claims: {},
};

const attackerPrincipal: AuthenticatedPrincipal = {
  uid: 'attacker_uid_99',
  email: 'attacker@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  claims: {},
};

const adminPrincipal: AuthenticatedPrincipal = {
  uid: 'admin_uid_01',
  email: 'radio837isf@gmail.com',
  emailVerified: true,
  role: 'primary_admin',
  authMode: 'firebase_id_token',
  claims: {},
};

const dummyVerifier: FirebaseTokenVerifierAdapter = {
  async verifyIdToken() {
    return { uid: ownerPrincipal.uid, email: ownerPrincipal.email, email_verified: true };
  },
};

const dummyAdminStore: DelegatedAdminStoreAdapter = {
  async getDelegatedAdminByUid() {
    return null;
  },
};

test('1. Ownership spoofing & 1:1 ownership invariant: rejects client UIDs, enforces strict owner access, and detects missing ownership records', async () => {
  const env = createMockFirestoreEnvironment();
  const service = createBargainsService({
    tokenVerifier: dummyVerifier,
    adminStore: dummyAdminStore,
    txRunner: env.txRunner,
    queryReader: env.queryReader,
    primaryAdminEmails: ['radio837isf@gmail.com'],
  });

  // Attempt to spoof userId / ownerUid / status in creation body is rejected
  await assert.rejects(
    async () => {
      await service.createBargain({
        principal: ownerPrincipal,
        idempotencyKey: 'idem_spoof_attempt_01',
        correlationId: 'corr_1',
        rawBody: {
          hoodId: 12,
          title: 'آپارتمان اکازیون ونک',
          type: 'خرید',
          sqm: 110,
          priceText: '۱۳.۲ میلیارد تومان',
          discountPercent: 18,
          buyerProfitText: '۲.۴ میلیارد زیر قیمت منطقه',
          street: 'ملاصدرا',
          userId: 'spoofed_uid',
          status: 'approved',
        },
      });
    },
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED' && err.status === 400,
  );

  // Valid creation establishes 1:1 /bargains/{id} and /bargainOwners/{id}
  const created = await service.createBargain({
    principal: ownerPrincipal,
    idempotencyKey: 'idem_valid_create_01',
    correlationId: 'corr_2',
    rawBody: {
      bargainId: 'bg_vanak_101',
      hoodId: 12,
      title: 'آپارتمان اکازیون ونک',
      type: 'خرید',
      sqm: 110,
      priceText: '۱۳.۲ میلیارد تومان',
      discountPercent: 18,
      buyerProfitText: '۲.۴ میلیارد زیر قیمت منطقه',
      street: 'ملاصدرا',
    },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.bargain.ownerUid, 'owner_uid_tehran_1');
  assert.equal(created.bargain.status, 'pending');
  assert.equal(created.bargain.revision, 1);

  const storedOwner = env.getDoc('bargainOwners/bg_vanak_101');
  assert.equal(storedOwner?.userId, 'owner_uid_tehran_1');
  assert.equal(storedOwner?.bargainId, 'bg_vanak_101');

  // Non-owner cannot retrieve owner view, update, or withdraw
  await assert.rejects(
    async () =>
      service.getOwnerBargain({
        principal: attackerPrincipal,
        bargainId: 'bg_vanak_101',
        correlationId: 'corr_3',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN' && err.status === 403,
  );

  await assert.rejects(
    async () =>
      service.updateOwnerBargain({
        principal: attackerPrincipal,
        bargainId: 'bg_vanak_101',
        rawBody: { expectedRevision: 1, title: 'Hijacked title' },
        correlationId: 'corr_4',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN' && err.status === 403,
  );

  // If ownership record is corrupted/missing, fails closed with 503 PERSISTENCE_FAILED
  env.deleteDocRaw('bargainOwners/bg_vanak_101');
  await assert.rejects(
    async () =>
      service.getOwnerBargain({
        principal: ownerPrincipal,
        bargainId: 'bg_vanak_101',
        correlationId: 'corr_5',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'PERSISTENCE_FAILED' && err.status === 503,
  );
});

test('2. Duplicate submissions & idempotency: replays identical create requests and blocks payload mismatches', async () => {
  const env = createMockFirestoreEnvironment();
  const service = createBargainsService({
    tokenVerifier: dummyVerifier,
    adminStore: dummyAdminStore,
    txRunner: env.txRunner,
    primaryAdminEmails: ['radio837isf@gmail.com'],
  });

  const payload = {
    hoodId: 5,
    title: 'واحد ۹۵ متری پونک',
    type: 'خرید' as const,
    sqm: 95,
    priceText: '۹.۸ میلیارد تومان',
    discountPercent: 15,
    buyerProfitText: '۱.۵ میلیارد سود خریدار',
    street: 'اشرفی اصفهانی',
  };

  const first = await service.createBargain({
    principal: ownerPrincipal,
    idempotencyKey: 'idem_create_punak_01',
    correlationId: 'corr_idem_1',
    rawBody: payload,
  });
  assert.equal(first.replayed, false);

  const replay = await service.createBargain({
    principal: ownerPrincipal,
    idempotencyKey: 'idem_create_punak_01',
    correlationId: 'corr_idem_2',
    rawBody: { ...payload },
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.bargain.id, first.bargain.id);

  // Different payload with same Idempotency-Key throws 409 IDEMPOTENCY_PAYLOAD_MISMATCH
  await assert.rejects(
    async () =>
      service.createBargain({
        principal: ownerPrincipal,
        idempotencyKey: 'idem_create_punak_01',
        correlationId: 'corr_idem_3',
        rawBody: { ...payload, sqm: 120 },
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'IDEMPOTENCY_PAYLOAD_MISMATCH' && err.status === 409,
  );
});

test('3, 4 & 6. Concurrent updates, moderation transitions, public/private separation, and expiration', async () => {
  let currentNowMs = Date.parse('2026-11-07T10:00:00.000Z');
  const env = createMockFirestoreEnvironment();
  const service = createBargainsService({
    tokenVerifier: dummyVerifier,
    adminStore: dummyAdminStore,
    txRunner: env.txRunner,
    queryReader: env.queryReader,
    primaryAdminEmails: ['radio837isf@gmail.com'],
    nowFn: () => currentNowMs,
  });

  const created = await service.createBargain({
    principal: ownerPrincipal,
    idempotencyKey: 'idem_lifecycle_01',
    correlationId: 'corr_lc_1',
    rawBody: {
      bargainId: 'bg_saadat_01',
      hoodId: 8,
      title: 'واحد ۱۲۵ متری سعادت‌آباد',
      type: 'خرید',
      sqm: 125,
      priceText: '۱۸.۵ میلیارد تومان (توافقی)',
      discountPercent: 20,
      buyerProfitText: '۳.۵ میلیارد زیر قیمت کارشناسی',
      street: 'بلوار دریا',
      expiresAtIso: '2026-11-20T10:00:00.000Z',
    },
  });
  assert.equal(created.bargain.revision, 1);

  // Pending listing is NOT visible in public projections
  await assert.rejects(
    async () => service.getPublicBargainById('bg_saadat_01'),
    (err: unknown) => err instanceof CoreApiError && err.code === 'NOT_FOUND' && err.status === 404,
  );
  assert.equal((await service.listPublicBargainsByHood(8)).length, 0);

  // Client-supplied fromStatus is rejected in moderation
  await assert.rejects(
    async () =>
      service.moderateBargain({
        principal: adminPrincipal,
        bargainId: 'bg_saadat_01',
        rawBody: { targetStatus: 'approved', fromStatus: 'pending' },
        correlationId: 'corr_lc_2',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED' && err.status === 400,
  );

  // Admin approves listing (revision 1 -> 2)
  const modApproved = await service.moderateBargain({
    principal: adminPrincipal,
    bargainId: 'bg_saadat_01',
    rawBody: { targetStatus: 'approved', expectedRevision: 1 },
    correlationId: 'corr_lc_3',
  });
  assert.equal(modApproved.moderationStatus, 'approved');
  assert.equal(modApproved.revision, 2);

  // Stale moderation (expectedRevision: 1 or redundant approved -> approved) is blocked with 409 CONFLICT
  await assert.rejects(
    async () =>
      service.moderateBargain({
        principal: adminPrincipal,
        bargainId: 'bg_saadat_01',
        rawBody: { targetStatus: 'approved' },
        correlationId: 'corr_lc_4',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT' && err.status === 409,
  );

  // Public projection now returns approved listing and strips private fields
  const publicProj = await service.getPublicBargainById('bg_saadat_01');
  assert.equal(publicProj.id, 'bg_saadat_01');
  assert.equal(publicProj.priceText, '۱۸.۵ میلیارد تومان (توافقی)');
  assert.equal('ownerUid' in publicProj, false);
  assert.equal('approvedBy' in publicProj, false);
  assert.equal('revision' in publicProj, false);
  assert.equal('status' in publicProj, false);

  // Stale owner update (expectedRevision: 1 when stored revision is 2) is rejected with 409 CONFLICT
  await assert.rejects(
    async () =>
      service.updateOwnerBargain({
        principal: ownerPrincipal,
        bargainId: 'bg_saadat_01',
        rawBody: { expectedRevision: 1, street: 'خیابان صرافها' },
        correlationId: 'corr_lc_5',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT' && err.status === 409,
  );

  // Valid owner update with expectedRevision: 2 resets status to 'pending' and increments revision to 3
  const ownerUpdated = await service.updateOwnerBargain({
    principal: ownerPrincipal,
    bargainId: 'bg_saadat_01',
    rawBody: { expectedRevision: 2, street: 'خیابان صرافهای جنوبی' },
    correlationId: 'corr_lc_6',
  });
  assert.equal(ownerUpdated.status, 'pending');
  assert.equal(ownerUpdated.revision, 3);
  assert.equal(ownerUpdated.street, 'خیابان صرافهای جنوبی');

  // Once reset to pending, listing is immediately removed from public projection
  assert.equal((await service.listPublicBargainsByHood(8)).length, 0);

  // Admin rejects with reason (revision 3 -> 4); owner sees rejectionReason, public does not
  await service.moderateBargain({
    principal: adminPrincipal,
    bargainId: 'bg_saadat_01',
    rawBody: {
      targetStatus: 'rejected',
      expectedRevision: 3,
      rejectionReason: 'نیاز به تصویر واضح‌تر از سند و نما',
    },
    correlationId: 'corr_lc_7',
  });
  const ownerAfterReject = await service.getOwnerBargain({
    principal: ownerPrincipal,
    bargainId: 'bg_saadat_01',
    correlationId: 'corr_lc_8',
  });
  assert.equal(ownerAfterReject.status, 'rejected');
  assert.equal(ownerAfterReject.rejectionReason, 'نیاز به تصویر واضح‌تر از سند و نما');

  // Admin re-approves (revision 4 -> 5), then advance clock past expiresAtIso
  await service.moderateBargain({
    principal: adminPrincipal,
    bargainId: 'bg_saadat_01',
    rawBody: { targetStatus: 'approved', expectedRevision: 4 },
    correlationId: 'corr_lc_9',
  });
  currentNowMs = Date.parse('2026-11-25T00:00:00.000Z');
  assert.equal((await service.listPublicBargainsByHood(8)).length, 0);

  const expiredRes = await service.expireBargainIfDue({
    bargainId: 'bg_saadat_01',
    correlationId: 'corr_lc_10',
  });
  assert.equal(expiredRes.expired, true);
  assert.equal(expiredRes.status, 'expired');
  assert.equal(expiredRes.revision, 6);
});

test('5 & 7. Transaction failure handling & data integrity (no synthetic numeric price invention)', async () => {
  const env = createMockFirestoreEnvironment();
  const service = createBargainsService({
    tokenVerifier: dummyVerifier,
    adminStore: dummyAdminStore,
    txRunner: env.txRunner,
    primaryAdminEmails: ['radio837isf@gmail.com'],
  });

  // Rejects client attempts to inject synthetic numericPrice / priceMillionToman
  await assert.rejects(
    async () =>
      service.createBargain({
        principal: ownerPrincipal,
        idempotencyKey: 'idem_numeric_reject_01',
        correlationId: 'corr_num_1',
        rawBody: {
          hoodId: 3,
          title: 'واحد نیاوران',
          type: 'خرید',
          sqm: 140,
          priceText: 'توافقی تماس بگیرید',
          discountPercent: 12,
          buyerProfitText: '۱۰ درصد زیر قیمت',
          street: 'یاسر',
          numericPrice: 25000,
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED' && err.status === 400,
  );

  // When Firestore transaction fails, returns 503 PERSISTENCE_FAILED and never reports false success
  env.setSimulateFailure(true);
  await assert.rejects(
    async () =>
      service.createBargain({
        principal: ownerPrincipal,
        idempotencyKey: 'idem_tx_fail_01',
        correlationId: 'corr_tx_fail',
        rawBody: {
          hoodId: 3,
          title: 'واحد نیاوران',
          type: 'خرید',
          sqm: 140,
          priceText: 'توافقی تماس بگیرید',
          discountPercent: 12,
          buyerProfitText: '۱۰ درصد زیر قیمت',
          street: 'یاسر',
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'PERSISTENCE_FAILED' && err.status === 503,
  );
});
