import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CoreApiError,
  type AuditEventSink,
  type AuthenticatedPrincipal,
  type DelegatedAdminStoreAdapter,
  type FirebaseTokenVerifierAdapter,
  type StructuredAuditEvent,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../../core';
import {
  createBuyerAlertsService,
  type BuyerAlertQueryAdapter,
  type NeighborhoodDirectoryAdapter,
  type StoredBuyerAlertDocument,
  type SupportedCityId,
} from '../index';

function createMockBuyerAlertsFirestore(initialDocs: Record<string, Record<string, unknown>> = {}) {
  const store = new Map<string, Record<string, unknown>>(
    Object.entries(initialDocs).map(([k, v]) => [k, structuredClone(v)]),
  );
  let simulateFailure = false;

  const txRunner: TransactionRunnerAdapter = {
    async runTransaction<T>(updateFn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      if (simulateFailure) throw new Error('Firestore connection lost');
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

  function filterAndSlice(
    docs: StoredBuyerAlertDocument[],
    afterCursor: { sortEpochMs: number; docId: string } | null | undefined,
    limit: number,
  ) {
    docs.sort((a, b) => b.createdAt.epochMs - a.createdAt.epochMs || b.id.localeCompare(a.id));
    const filtered = afterCursor
      ? docs.filter(
          (d) =>
            d.createdAt.epochMs < afterCursor.sortEpochMs ||
            (d.createdAt.epochMs === afterCursor.sortEpochMs && d.id < afterCursor.docId),
        )
      : docs;
    return filtered.slice(0, limit);
  }

  const queryAdapter: BuyerAlertQueryAdapter = {
    async listByOwner({ ownerUid, limit, afterCursor }) {
      const all: StoredBuyerAlertDocument[] = [];
      for (const [path, raw] of store.entries()) {
        if (path.startsWith('buyerAlerts/') && raw.ownerUid === ownerUid) {
          all.push(structuredClone(raw) as unknown as StoredBuyerAlertDocument);
        }
      }
      return filterAndSlice(all, afterCursor, limit);
    },
    async listForAdminCrm({ cityId, hoodId, limit, afterCursor }) {
      const all: StoredBuyerAlertDocument[] = [];
      for (const [path, raw] of store.entries()) {
        if (!path.startsWith('buyerAlerts/')) continue;
        const doc = structuredClone(raw) as unknown as StoredBuyerAlertDocument;
        if (cityId && doc.cityId !== cityId) continue;
        if (hoodId !== undefined && doc.hoodId !== hoodId) continue;
        all.push(doc);
      }
      return filterAndSlice(all, afterCursor, limit);
    },
  };

  const directory: NeighborhoodDirectoryAdapter = {
    resolveCityNeighborhood(cityId: SupportedCityId, hoodId: number) {
      const catalog: Record<SupportedCityId, Record<number, string>> = {
        tehran: { 1: 'ونک', 2: 'سعادت‌آباد', 3: 'پونک' },
        karaj: { 1: 'مهرشهر', 101: 'گوهردشت' },
        mashhad: { 201: 'وکیل‌آباد' },
        isfahan: { 301: 'جلفا' },
        shiraz: { 401: 'قصرالدشت' },
      };
      const name = catalog[cityId]?.[hoodId];
      return name ? { cityId, hoodId, hoodName: name } : null;
    },
  };

  return {
    txRunner,
    queryAdapter,
    directory,
    getDoc: (path: string) => store.get(path),
    setSimulateFailure: (flag: boolean) => {
      simulateFailure = flag;
    },
  };
}

const buyerA: AuthenticatedPrincipal = {
  uid: 'buyer_tehran_a',
  email: 'buyer.a@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  claims: {},
};

const buyerB: AuthenticatedPrincipal = {
  uid: 'buyer_tehran_b',
  email: 'buyer.b@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  claims: {},
};

const adminPrincipal: AuthenticatedPrincipal = {
  uid: 'admin_crm_01',
  email: 'radio837isf@gmail.com',
  emailVerified: true,
  role: 'primary_admin',
  authMode: 'firebase_id_token',
  claims: {},
};

const dummyVerifier: FirebaseTokenVerifierAdapter = {
  async verifyIdToken() {
    return { uid: buyerA.uid, email: buyerA.email, email_verified: true };
  },
};

const dummyAdminStore: DelegatedAdminStoreAdapter = {
  async getDelegatedAdminByUid() {
    return null;
  },
};

test('1. Consent evidence & privacy validation: rejects bare privacyConsent without explicitUserAction or valid consentVersion', async () => {
  const env = createMockBuyerAlertsFirestore();
  const service = createBuyerAlertsService({
    tokenVerifier: dummyVerifier,
    adminStore: dummyAdminStore,
    txRunner: env.txRunner,
    neighborhoodDirectory: env.directory,
  });

  await assert.rejects(
    async () =>
      service.createBuyerAlert({
        principal: buyerA,
        idempotencyKey: 'idem_consent_missing_action',
        correlationId: 'corr_c1',
        rawBody: {
          cityId: 'tehran',
          hoodId: 1,
          fullName: 'سارا محمدی',
          phone: '09121112233',
          dealType: 'خرید',
          maxBudgetText: '۱۲ میلیارد تومان',
          privacyConsent: true,
          consentVersion: 'buyer-alert-2026-10-v1',
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED' && err.status === 400,
  );

  await assert.rejects(
    async () =>
      service.createBuyerAlert({
        principal: buyerA,
        idempotencyKey: 'idem_consent_bad_ver',
        correlationId: 'corr_c2',
        rawBody: {
          cityId: 'tehran',
          hoodId: 1,
          fullName: 'سارا محمدی',
          phone: '09121112233',
          dealType: 'خرید',
          maxBudgetText: '۱۲ میلیارد تومان',
          consentEvidence: {
            privacyConsent: true,
            consentVersion: 'outdated-2024-v0',
            explicitUserAction: 'checkbox_checked',
            acknowledgedRetentionDays: 90,
          },
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED' && err.status === 400,
  );
});

test('2 & 3. Idempotent creation, cross-city collision prevention, and configurable multiplicity policy', async () => {
  const env = createMockBuyerAlertsFirestore();
  const auditEvents: StructuredAuditEvent[] = [];
  const auditSink: AuditEventSink = { async writeAuditEvent(e) { auditEvents.push(e); } };

  const service = createBuyerAlertsService({
    tokenVerifier: dummyVerifier,
    adminStore: dummyAdminStore,
    txRunner: env.txRunner,
    neighborhoodDirectory: env.directory,
    auditSink,
    primaryAdminEmails: ['radio837isf@gmail.com'],
  });

  await assert.rejects(
    async () =>
      service.createBuyerAlert({
        principal: buyerA,
        idempotencyKey: 'idem_cross_city_mismatch',
        correlationId: 'corr_cc1',
        rawBody: {
          cityId: 'tehran',
          hoodId: 201,
          fullName: 'سارا محمدی',
          phone: '09121112233',
          dealType: 'خرید',
          maxBudgetText: '۱۰ میلیارد تومان',
          consentEvidence: {
            privacyConsent: true,
            consentVersion: 'buyer-alert-2026-10-v1',
            explicitUserAction: 'checkbox_checked',
            acknowledgedRetentionDays: 90,
          },
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED' && err.status === 400,
  );

  const tehranAlert = await service.createBuyerAlert({
    principal: buyerA,
    idempotencyKey: 'idem_tehran_hood1_create',
    correlationId: 'corr_cc2',
    rawBody: {
      cityId: 'tehran',
      hoodId: 1,
      fullName: 'سارا محمدی',
      contactChannels: [
        { channel: 'ir_mobile', value: '۰۹۱۲۱۱۱۲۲۳۳', primary: true },
        { channel: 'telegram', value: '@sara_tehran_buyer' },
      ],
      dealType: 'خرید',
      maxBudgetText: '۱۴ میلیارد تومان',
      consentEvidence: {
        privacyConsent: true,
        consentVersion: 'buyer-alert-2026-10-v1',
        explicitUserAction: 'checkbox_checked',
        acknowledgedRetentionDays: 60,
      },
    },
  });
  assert.equal(tehranAlert.replayed, false);
  assert.equal(tehranAlert.alert.id, 'buyer_tehran_a_tehran_hood_1');
  assert.equal(tehranAlert.alert.hoodName, 'ونک');
  assert.equal(tehranAlert.alert.contactChannels[0].value, '09121112233');

  const replayed = await service.createBuyerAlert({
    principal: buyerA,
    idempotencyKey: 'idem_tehran_hood1_create',
    correlationId: 'corr_cc3',
    rawBody: {
      cityId: 'tehran',
      hoodId: 1,
      fullName: 'سارا محمدی',
      contactChannels: [
        { channel: 'ir_mobile', value: '09121112233', primary: true },
        { channel: 'telegram', value: '@sara_tehran_buyer' },
      ],
      dealType: 'خرید',
      maxBudgetText: '۱۴ میلیارد تومان',
      consentEvidence: {
        privacyConsent: true,
        consentVersion: 'buyer-alert-2026-10-v1',
        explicitUserAction: 'checkbox_checked',
        acknowledgedRetentionDays: 60,
      },
    },
  });
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.alert.id, tehranAlert.alert.id);

  const karajAlert = await service.createBuyerAlert({
    principal: buyerA,
    idempotencyKey: 'idem_karaj_hood1_create',
    correlationId: 'corr_cc4',
    rawBody: {
      cityId: 'karaj',
      hoodId: 1,
      fullName: 'سارا محمدی',
      phone: '09121112233',
      dealType: 'اجاره',
      maxBudgetText: '۱.۵ میلیارد رهن کامل',
      consentEvidence: {
        privacyConsent: true,
        consentVersion: 'buyer-alert-2026-10-v1',
        explicitUserAction: 'modal_confirm_clicked',
        acknowledgedRetentionDays: 90,
      },
    },
  });
  assert.equal(karajAlert.alert.id, 'buyer_tehran_a_karaj_hood_1');
  assert.equal(karajAlert.alert.hoodName, 'مهرشهر');

  await assert.rejects(
    async () =>
      service.createBuyerAlert({
        principal: buyerA,
        idempotencyKey: 'idem_tehran_hood1_second',
        correlationId: 'corr_cc5',
        rawBody: {
          cityId: 'tehran',
          hoodId: 1,
          fullName: 'سارا محمدی',
          phone: '09121112233',
          dealType: 'خرید',
          maxBudgetText: '۱۶ میلیارد تومان',
          consentEvidence: {
            privacyConsent: true,
            consentVersion: 'buyer-alert-2026-10-v1',
            explicitUserAction: 'checkbox_checked',
            acknowledgedRetentionDays: 90,
          },
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT' && err.status === 409,
  );

  const auditJson = JSON.stringify(auditEvents);
  assert.equal(auditJson.includes('09121112233'), false);
  assert.equal(auditJson.includes('سارا محمدی'), false);
});

test('4, 5 & 6. Ownership isolation, immutable createdAt on update, withdrawal, expiration, pagination, and Firestore failure handling', async () => {
  let nowMs = Date.parse('2026-11-07T10:00:00.000Z');
  const env = createMockBuyerAlertsFirestore();
  const service = createBuyerAlertsService({
    tokenVerifier: dummyVerifier,
    adminStore: dummyAdminStore,
    txRunner: env.txRunner,
    queryAdapter: env.queryAdapter,
    neighborhoodDirectory: env.directory,
    primaryAdminEmails: ['radio837isf@gmail.com'],
    nowFn: () => nowMs,
  });

  const created = await service.createBuyerAlert({
    principal: buyerA,
    idempotencyKey: 'idem_lifecycle_alert_1',
    correlationId: 'corr_lc1',
    rawBody: {
      cityId: 'tehran',
      hoodId: 2,
      fullName: 'رضا کاظمی',
      phone: '09123334455',
      dealType: 'خرید',
      maxBudgetText: '۱۸ میلیارد تومان',
      requestedRetentionDays: 30,
      consentEvidence: {
        privacyConsent: true,
        consentVersion: 'buyer-alert-2026-10-v1',
        explicitUserAction: 'checkbox_checked',
        acknowledgedRetentionDays: 30,
      },
    },
  });
  const originalCreatedAtIso = created.alert.createdAtIso;
  const alertId = created.alert.id;

  await assert.rejects(
    async () => service.getOwnerBuyerAlert({ principal: buyerB, alertId, correlationId: 'corr_lc2' }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN' && err.status === 403,
  );

  nowMs += 2 * 60 * 60 * 1000;
  const updated = await service.updateOwnerBuyerAlert({
    principal: buyerA,
    alertId,
    rawBody: { expectedRevision: 1, maxBudgetText: '۱۹.۵ میلیارد تومان' },
    correlationId: 'corr_lc3',
  });
  assert.equal(updated.revision, 2);
  assert.equal(updated.maxBudgetText, '۱۹.۵ میلیارد تومان');
  assert.equal(updated.createdAtIso, originalCreatedAtIso);
  assert.notEqual(updated.updatedAtIso, originalCreatedAtIso);

  await assert.rejects(
    async () =>
      service.updateOwnerBuyerAlert({
        principal: buyerA,
        alertId,
        rawBody: { expectedRevision: 1, maxBudgetText: '۲۰ میلیارد تومان' },
        correlationId: 'corr_lc4',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT' && err.status === 409,
  );

  nowMs += 60_000;
  await service.createBuyerAlert({
    principal: buyerA,
    idempotencyKey: 'idem_lifecycle_alert_2',
    correlationId: 'corr_lc5',
    rawBody: {
      cityId: 'tehran',
      hoodId: 3,
      fullName: 'رضا کاظمی',
      phone: '09123334455',
      dealType: 'اجاره',
      maxBudgetText: '۲ میلیارد رهن',
      consentEvidence: {
        privacyConsent: true,
        consentVersion: 'buyer-alert-2026-10-v1',
        explicitUserAction: 'checkbox_checked',
        acknowledgedRetentionDays: 30,
      },
    },
  });

  await assert.rejects(
    async () => service.listAdminBuyerAlerts({ principal: buyerA, limit: 1, correlationId: 'corr_lc6' }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN' && err.status === 403,
  );

  const page1 = await service.listAdminBuyerAlerts({
    principal: adminPrincipal,
    cityId: 'tehran',
    limit: 1,
    correlationId: 'corr_lc7',
  });
  assert.equal(page1.items.length, 1);
  assert.equal(page1.hasMore, true);
  assert.ok(page1.nextCursor);

  const page2 = await service.listAdminBuyerAlerts({
    principal: adminPrincipal,
    cityId: 'tehran',
    limit: 1,
    cursor: page1.nextCursor,
    correlationId: 'corr_lc8',
  });
  assert.equal(page2.items.length, 1);
  assert.notEqual(page2.items[0].id, page1.items[0].id);

  const withdrawn = await service.withdrawBuyerAlert({
    principal: buyerA,
    alertId,
    rawBody: { expectedRevision: 2, reason: 'ملک مورد نظر خریداری شد' },
    correlationId: 'corr_lc9',
  });
  assert.equal(withdrawn.status, 'withdrawn');
  assert.equal(withdrawn.revision, 3);

  nowMs += 35 * 24 * 60 * 60 * 1000;
  const expiredRes = await service.expireBuyerAlertIfDue({
    alertId: 'buyer_tehran_a_tehran_hood_3',
    correlationId: 'corr_lc10',
  });
  assert.equal(expiredRes.expired, true);
  assert.equal(expiredRes.status, 'expired');

  env.setSimulateFailure(true);
  await assert.rejects(
    async () => service.getOwnerBuyerAlert({ principal: buyerA, alertId, correlationId: 'corr_fail' }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'PERSISTENCE_FAILED' && err.status === 503,
  );
});
