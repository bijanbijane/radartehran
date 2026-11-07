import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CoreApiError,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../../core';
import {
  createValuationService,
  type ValuationDataConsumerAdapter,
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

const mockDataConsumer: ValuationDataConsumerAdapter = {
  async getNeighborhoodBenchmark(params) {
    if (params.cityId === 'tehran' && params.hoodId === 1) {
      return {
        basePricePerSqmMillion: 150,
        baseRahn80mMillion: 1500,
        hoodName: 'نیاوران',
        zone: '1',
        lastUpdatedIso: '2026-10-15T00:00:00.000Z',
      };
    }
    return null;
  },
  async queryComparableListings() {
    return [
      { id: 'comp_1', sqm: 100, priceNumericMillion: 15500, buildYear: 1403, hoodId: 1 },
      { id: 'comp_2', sqm: 110, priceNumericMillion: 16800, buildYear: 1402, hoodId: 1 },
      { id: 'comp_outlier', sqm: 100, priceNumericMillion: 5000, buildYear: 1400, hoodId: 1 }, // Outlier
      { id: 'comp_huge', sqm: 300, priceNumericMillion: 45000, buildYear: 1401, hoodId: 1 }, // Size mismatch (>50%)
    ];
  },
};

test('1. Property valuation estimation, hedonic factor adjustments, and explainability', async () => {
  const service = createValuationService({
    dataConsumer: mockDataConsumer,
  });

  const res = await service.estimatePropertyValue({
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 100,
    buildYear: 1405, // Brand new (+6.5%)
    floor: 4, // Mid-high floor (+3.0%)
    hasElevator: true,
    hasParking: true,
    hasStorage: true,
  });

  assert.equal(res.cityId, 'tehran');
  assert.equal(res.hoodId, 1);
  assert.equal(res.hoodName, 'نیاوران');
  assert.equal(res.sqm, 100);
  assert.ok(res.estimatedPricePerSqmMillion > 150); // Adjusted above base
  assert.ok(res.estimatedTotalMillion > 15000);
  assert.ok(res.fastSaleTotalMillion);
  assert.equal(res.methodology, 'hedonic_regression');
  assert.ok(res.adjustments.length >= 2);
  assert.match(res.summaryExplanationFa, /نیاوران/);

  // Check comparable inclusion & exclusion reasons
  assert.equal(res.comparables.length, 4);
  const outlier = res.comparables.find((c) => c.listingId === 'comp_outlier');
  assert.equal(outlier?.included, false);
  assert.match(outlier?.exclusionReason ?? '', /پرت آماری/);

  const huge = res.comparables.find((c) => c.listingId === 'comp_huge');
  assert.equal(huge?.included, false);
  assert.match(huge?.exclusionReason ?? '', /تفاوت متراژ/);
});

test('2. Rental transaction valuation & separate commercial property category model', async () => {
  const service = createValuationService({
    dataConsumer: mockDataConsumer,
  });

  // Rental estimation
  const rentVal = await service.estimatePropertyValue({
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'rent',
    sqm: 80,
  });
  assert.equal(rentVal.transactionType, 'rent');
  assert.ok(rentVal.estimatedDepositMillion);
  assert.ok(rentVal.estimatedMonthlyRentMillion);

  // Commercial estimation with commercial premium model
  const commVal = await service.estimatePropertyValue({
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'commercial',
    transactionType: 'sale',
    sqm: 50,
  });
  assert.equal(commVal.propertyCategory, 'commercial');
  assert.ok(commVal.adjustments.some((a) => a.factorId === 'category_commercial'));
  assert.ok(commVal.estimatedPricePerSqmMillion > 150);
});

test('3. Neighborhood market intelligence indicators and snapshot reproducibility', async () => {
  const db = createMockFirestoreAdapter();
  const service = createValuationService({
    dataConsumer: mockDataConsumer,
    txRunner: db.txRunner,
  });

  const indicators = await service.getNeighborhoodMarketIndicators({
    cityId: 'tehran',
    hoodId: 1,
  });
  assert.equal(indicators.hoodName, 'نیاوران');
  assert.ok(indicators.medianAskingPricePerSqmMillion > 0);
  assert.ok(indicators.averageAskingPricePerSqmMillion > 0);
  assert.equal(indicators.sampleSufficiency, 'limited');

  // Persist valuation snapshot
  const valResult = await service.estimatePropertyValue({
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 90,
  });

  const snap = await service.persistValuationSnapshot({
    input: {
      cityId: 'tehran',
      hoodId: 1,
      propertyCategory: 'residential',
      transactionType: 'sale',
      sqm: 90,
    },
    result: valResult,
    ownerUid: 'user_123',
  });
  assert.ok(snap);
  assert.ok(snap.reproducibleHash);
  assert.equal(db.docs.has(`valuationSnapshots/${valResult.id}`), true);

  // Missing benchmark throws 404 NOT_FOUND
  await assert.rejects(
    async () => service.estimatePropertyValue({ cityId: 'tehran', hoodId: 999, propertyCategory: 'residential', transactionType: 'sale', sqm: 100 }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'NOT_FOUND' && err.status === 404,
  );
});
