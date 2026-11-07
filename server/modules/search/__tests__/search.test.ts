import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CoreApiError,
  type AuthenticatedPrincipal,
  type FirebaseTokenVerifierAdapter,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../../core';
import {
  createSearchService,
  type DiscoverablePublicListing,
  type ListingReadDataSourceAdapter,
  type StoredSavedSearch,
} from '../index';

function createMockFirestoreAdapter() {
  const docs = new Map<string, Record<string, unknown>>();

  const txRunner: TransactionRunnerAdapter = {
    async runTransaction<T>(fn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
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

  return { docs, txRunner };
}

const dummyTokenVerifier: FirebaseTokenVerifierAdapter = {
  async verifyIdToken() {
    throw new Error('Not used in direct service tests');
  },
};

const userA: AuthenticatedPrincipal = {
  uid: 'user_searcher_a',
  email: 'searchera@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  issuedAtSeconds: 1700000000,
  expiresAtSeconds: 1700003600,
  claims: {},
};

const userB: AuthenticatedPrincipal = {
  uid: 'user_searcher_b',
  email: 'searcherb@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  issuedAtSeconds: 1700000000,
  expiresAtSeconds: 1700003600,
  claims: {},
};

const sampleListings: DiscoverablePublicListing[] = [
  {
    id: 'list_1',
    cityId: 'tehran',
    hoodId: 1,
    hoodName: 'نیاوران',
    title: 'آپارتمان ۱۲۰ متری نیاوران فول امکانات',
    type: 'خرید',
    sqm: 120,
    priceText: '۱۸ میلیارد تومان',
    priceNumericMillion: 18000,
    discountPercent: 15,
    buyerProfitText: '۲.۷ میلیارد زیر قیمت کارشناسی',
    street: 'خیابان باهنر',
    createdAtIso: '2026-10-01T10:00:00.000Z',
    approvedAtIso: '2026-10-01T12:00:00.000Z',
  },
  {
    id: 'list_2',
    cityId: 'tehran',
    hoodId: 2,
    hoodName: 'سعادت‌آباد',
    title: 'واحد ۸۵ متری نوساز سعادت‌آباد',
    type: 'خرید',
    sqm: 85,
    priceText: '۱۲.۵ میلیارد تومان',
    priceNumericMillion: 12500,
    discountPercent: 12,
    buyerProfitText: '۱.۵ میلیارد سود خریدار',
    street: 'خیابان سرو غربی',
    createdAtIso: '2026-10-02T10:00:00.000Z',
    approvedAtIso: '2026-10-02T12:00:00.000Z',
  },
  {
    id: 'list_3',
    cityId: 'tehran',
    hoodId: 2,
    hoodName: 'سعادت‌آباد',
    title: 'رهن کامل آپارتمان ۱۰۰ متری',
    type: 'اجاره',
    sqm: 100,
    priceText: '۲ میلیارد رهن کامل',
    rentNumericMillion: 2000,
    discountPercent: 8,
    buyerProfitText: '۳۰۰ میلیون تخفیف',
    street: 'خیابان علامه',
    createdAtIso: '2026-10-03T10:00:00.000Z',
    approvedAtIso: '2026-10-03T12:00:00.000Z',
  },
  {
    id: 'list_expired',
    cityId: 'tehran',
    hoodId: 1,
    hoodName: 'نیاوران',
    title: 'آگهی منقضی شده',
    type: 'خرید',
    sqm: 90,
    priceText: '۱۰ میلیارد',
    priceNumericMillion: 10000,
    discountPercent: 20,
    buyerProfitText: '۲ میلیارد',
    street: 'نیاوران',
    createdAtIso: '2026-09-01T10:00:00.000Z',
    approvedAtIso: '2026-09-01T12:00:00.000Z',
    expiresAtIso: '2026-09-15T00:00:00.000Z', // Expired
  },
];

const mockListingDataSource: ListingReadDataSourceAdapter = {
  async queryPublicApprovedListings() {
    return sampleListings;
  },
};

test('1. Public listing filtering, keyword search & exclusion of expired/unapproved records', async () => {
  const db = createMockFirestoreAdapter();
  const service = createSearchService({
    tokenVerifier: dummyTokenVerifier,
    txRunner: db.txRunner,
    listingDataSource: mockListingDataSource,
    nowFn: () => Date.parse('2026-10-15T00:00:00.000Z'),
  });

  // Filter by type: 'خرید'
  const buyRes = await service.searchPublicListings({ type: 'خرید' });
  assert.equal(buyRes.items.length, 2);
  assert.equal(buyRes.items.every((i) => i.type === 'خرید'), true);
  // Expired listing is strictly excluded
  assert.equal(buyRes.items.some((i) => i.id === 'list_expired'), false);

  // Keyword filter: 'سعادت‌آباد'
  const kwRes = await service.searchPublicListings({ keyword: 'سعادت‌آباد' });
  assert.equal(kwRes.items.length, 2);
  assert.equal(kwRes.items.every((i) => i.hoodName === 'سعادت‌آباد'), true);

  // Combined filters: hoodId 1, price <= 20000, sqm >= 100
  const combined = await service.searchPublicListings({
    hoodIds: '1',
    maxPriceMillion: 20000,
    minSqm: 100,
  });
  assert.equal(combined.items.length, 1);
  assert.equal(combined.items[0].id, 'list_1');
});

test('2. Deterministic sorting and cursor-based pagination', async () => {
  const db = createMockFirestoreAdapter();
  const service = createSearchService({
    tokenVerifier: dummyTokenVerifier,
    txRunner: db.txRunner,
    listingDataSource: mockListingDataSource,
    nowFn: () => Date.parse('2026-10-15T00:00:00.000Z'),
  });

  // Page 1 with limit: 1, sort: newest
  const page1 = await service.searchPublicListings({ limit: 1, sort: 'newest' });
  assert.equal(page1.items.length, 1);
  assert.equal(page1.items[0].id, 'list_3'); // approved 2026-10-03
  assert.ok(page1.nextCursor);

  // Page 2 using cursor
  const page2 = await service.searchPublicListings({ limit: 1, sort: 'newest', cursor: page1.nextCursor });
  assert.equal(page2.items.length, 1);
  assert.equal(page2.items[0].id, 'list_2'); // approved 2026-10-02
  assert.ok(page2.nextCursor);

  // Page 3 using cursor
  const page3 = await service.searchPublicListings({ limit: 1, sort: 'newest', cursor: page2.nextCursor });
  assert.equal(page3.items.length, 1);
  assert.equal(page3.items[0].id, 'list_1'); // approved 2026-10-01
  assert.equal(page3.nextCursor, undefined); // End of list

  // Malformed cursor throws 400 VALIDATION_FAILED
  await assert.rejects(
    async () => service.searchPublicListings({ cursor: 'invalid_base64_string' }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED' && err.status === 400,
  );
});

test('3. Saved search configuration ownership, idempotency and privacy isolation', async () => {
  const db = createMockFirestoreAdapter();
  const service = createSearchService({
    tokenVerifier: dummyTokenVerifier,
    txRunner: db.txRunner,
    listingDataSource: mockListingDataSource,
  });

  const savePayload = {
    titleFa: 'آپارتمان نیاوران زیر قیمت',
    filterQuery: { cityId: 'tehran' as const, hoodIds: [1], maxPriceMillion: 20000 },
  };

  const firstSave = await service.saveSearchConfig({
    principal: userA,
    idempotencyKey: 'idem_save_srch_1',
    rawBody: savePayload,
  });
  assert.equal(firstSave.replayed, false);
  assert.equal(firstSave.savedSearch.ownerUid, userA.uid);

  // Replay returns replayed: true
  const replaySave = await service.saveSearchConfig({
    principal: userA,
    idempotencyKey: 'idem_save_srch_1',
    rawBody: savePayload,
  });
  assert.equal(replaySave.replayed, true);
  assert.equal(replaySave.savedSearch.id, firstSave.savedSearch.id);

  // Populate user index for userA
  const stored = db.docs.get(`savedSearches/${firstSave.savedSearch.id}`) as unknown as StoredSavedSearch;
  db.docs.set(`userSavedSearchesIndex/${userA.uid}`, { items: [stored] });

  // User B cannot view or delete User A's saved search
  const userBSearches = await service.getUserSavedSearches({ principal: userB });
  assert.equal(userBSearches.savedSearches.length, 0);

  await assert.rejects(
    async () => service.deleteSavedSearch({ principal: userB, savedSearchId: firstSave.savedSearch.id }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN' && err.status === 403,
  );

  // User A can delete their own saved search
  const deleteResult = await service.deleteSavedSearch({ principal: userA, savedSearchId: firstSave.savedSearch.id });
  assert.equal(deleteResult.deleted, true);
});
