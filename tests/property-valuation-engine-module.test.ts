import test from 'node:test';
import assert from 'node:assert/strict';
import { CoreApiError } from '../server/modules/core';
import {
  createValuationService,
  validateValuationInput,
  type ValuationDataConsumerAdapter,
} from '../server/modules/valuation';

const mockDataConsumer: ValuationDataConsumerAdapter = {
  async getNeighborhoodBenchmark(params) {
    if (params.cityId === 'tehran' && params.hoodId === 1) {
      return {
        basePricePerSqmMillion: 150,
        baseRahn80mMillion: 1600,
        hoodName: 'نیاوران',
        zone: '1',
        lastUpdatedIso: '2026-10-20T00:00:00.000Z',
      };
    }
    if (params.cityId === 'tehran' && params.hoodId === 2) {
      return {
        basePricePerSqmMillion: 120,
        baseRahn80mMillion: 1280,
        hoodName: 'سعادت‌آباد',
        zone: '2',
        lastUpdatedIso: '2026-10-20T00:00:00.000Z',
      };
    }
    return null;
  },
  async queryComparableListings(params) {
    if (params.cityId === 'tehran' && params.hoodId === 1 && params.propertyCategory === 'residential') {
      return [
        {
          id: 'comp_v1',
          sqm: 105,
          priceNumericMillion: 16200,
          buildYear: 1403,
          hoodId: 1,
          distanceMeters: 350,
          sourceType: 'VERIFIED_COMPLETED_TRANSACTION',
          observedAtIso: '2026-10-10T00:00:00.000Z',
          isVerifiedTransaction: true,
        },
        {
          id: 'comp_a1',
          sqm: 98,
          priceNumericMillion: 15800,
          buildYear: 1402,
          hoodId: 1,
          distanceMeters: 600,
          sourceType: 'ACTIVE_PUBLISHED_LISTING',
          observedAtIso: '2026-10-15T00:00:00.000Z',
        },
        {
          id: 'comp_far',
          sqm: 100,
          priceNumericMillion: 15500,
          buildYear: 1402,
          hoodId: 1,
          distanceMeters: 9500, // Exceeds maxComparableDistanceMeters
          sourceType: 'ACTIVE_PUBLISHED_LISTING',
          observedAtIso: '2026-10-15T00:00:00.000Z',
        },
      ];
    }
    return [];
  },
};

test('Employee 59 — 1. Feature validation, extended categories, missing inputs & prohibited personal attributes', () => {
  // Reject prohibited personal/demographic attributes
  const prohibitedRes = validateValuationInput({
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 100,
    ownerEthnicity: 'any',
  });
  assert.equal(prohibitedRes.ok, false);
  assert.ok(prohibitedRes.issues.some((i) => i.code === 'PROHIBITED_PERSONAL_ATTRIBUTE'));

  // Reject contradictory floor > totalFloors
  const badFloor = validateValuationInput({
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 100,
    floor: 12,
    totalFloors: 5,
  });
  assert.equal(badFloor.ok, false);

  // Accept extended categories (villa_garden, industrial, land_development, agricultural)
  const landVal = validateValuationInput({
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'land_development',
    transactionType: 'sale',
    sqm: 500,
    floorAreaRatio: 4.5,
  });
  assert.equal(landVal.ok, true);
});

test('Employee 59 — 2. Hedonic sale & rental valuation, interaction effects, temporal adjustments & explainability', async () => {
  const service = createValuationService({
    dataConsumer: mockDataConsumer,
    now: () => new Date('2026-11-01T00:00:00.000Z'),
  });

  // High floor WITHOUT elevator triggers interaction penalty
  const walkupVal = await service.estimatePropertyValue(
    {
      cityId: 'tehran',
      hoodId: 1,
      propertyCategory: 'residential',
      transactionType: 'sale',
      sqm: 100,
      buildYear: 1395,
      floor: 4,
      totalFloors: 4,
      hasElevator: false,
      hasParking: true,
      hasStorage: true,
      deedType: 'single_page',
      asOfHistoricalDateIso: '2026-08-01T00:00:00.000Z',
      valuationDateIso: '2026-11-01T00:00:00.000Z',
    },
    { includeDiagnostics: true },
  );

  assert.ok(
    walkupVal.adjustments.some((a) => a.factorId === 'interaction_high_floor_no_elevator' && a.weightPct < 0),
  );
  assert.ok((walkupVal.temporalTrendPct ?? 0) > 0);
  assert.ok(walkupVal.estimatedTotalMillion > (walkupVal.nominalTotalMillion ?? 0));
  assert.ok(walkupVal.explanation.positiveDriversFa.length > 0);
  assert.ok(walkupVal.explanation.negativeDriversFa.length > 0);
  assert.ok(walkupVal.diagnostics?.reproducibleInputHash);

  // Geographic distance filter excludes comp_far
  const farComp = walkupVal.comparables.find((c) => c.listingId === 'comp_far');
  assert.equal(farComp?.included, false);
  assert.match(farComp?.exclusionReason ?? '', /فاصله مکانی/);

  // Rental valuation with furnished premium and short-term lease adjustment
  const furnishedRent = await service.estimatePropertyValue({
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'rent',
    sqm: 90,
    buildYear: 1403,
    furnishedStatus: 'furnished',
    leaseDurationMonths: 3,
    requestedDepositMillion: 800,
  });
  assert.equal(furnishedRent.transactionType, 'rent');
  assert.equal(furnishedRent.estimatedDepositMillion, 800);
  assert.ok((furnishedRent.estimatedMonthlyRentMillion ?? 0) > 0);
  assert.ok((furnishedRent.fullRahnEquivalentMillion ?? 0) > 800);
  assert.ok(furnishedRent.adjustments.some((a) => a.factorId === 'rental_furnished'));
  assert.ok(furnishedRent.adjustments.some((a) => a.factorId === 'lease_duration_short'));
});

test('Employee 59 — 3. Evidence normalization, deduplication, outlier review overrides, baselines & privacy filtering', async () => {
  const service = createValuationService({
    dataConsumer: mockDataConsumer,
    now: () => new Date('2026-11-01T00:00:00.000Z'),
  });

  // Ingest verified transaction in IRR (Rials) -> normalized to Million Toman
  // 150,000,000,000 IRR = 15,000 Million Toman
  const ev1 = await service.ingestMarketEvidence({
    sourceType: 'VERIFIED_COMPLETED_TRANSACTION',
    sourceRecordId: 'tx_1001',
    cityId: 'tehran',
    districtId: 'd1',
    hoodId: 1,
    subNeighborhoodId: 'sub_niavaran_north',
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 100,
    buildYear: 1402,
    rawCurrencyUnit: 'IRR',
    rawTotalAmount: 150_000_000_000,
    privateParticipantRef: 'buyer_national_id_secret',
    confidentialNotes: 'Private notary deed #99182',
  });
  assert.equal(ev1.normalizedTotalMillion, 15000);
  assert.equal(ev1.normalizedPricePerSqmMillion, 150);
  assert.equal(ev1.isCompletedTransaction, true);
  assert.equal(ev1.isAskingPrice, false);

  // A source classified as a completed transaction is not baseline-eligible
  // until an independent reviewer approves the evidence record.
  const approvedTransaction = await service.reviewMarketEvidence({
    actorUid: 'admin_reviewer_1',
    decision: {
      evidenceId: ev1.id,
      action: 'APPROVE',
      reason: 'Verified transaction source reviewed for baseline eligibility',
    },
  });
  assert.equal(approvedTransaction.verificationStatus, 'VERIFIED');

  // Duplicate evidence detection
  const evDup = await service.ingestMarketEvidence({
    sourceType: 'ACTIVE_PUBLISHED_LISTING',
    sourceRecordId: 'lst_dup_1001',
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 100,
    buildYear: 1402,
    rawCurrencyUnit: 'IRT_MILLION',
    rawTotalAmount: 15002,
  });
  assert.equal(evDup.duplicateOfEvidenceId, ev1.id);

  // Outlier evidence detection & reviewer override (CORRECT / RESTORE)
  const evOutlier = await service.ingestMarketEvidence({
    sourceType: 'APPROVED_MANUAL_OBSERVATION',
    sourceRecordId: 'obs_outlier_1',
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 100,
    rawCurrencyUnit: 'IRT_MILLION',
    rawTotalAmount: 300_000, // 3000M/sqm -> exceeds maxPricePerSqmMillion
  });
  assert.equal(evOutlier.outlierFlag, true);
  assert.equal(evOutlier.verificationStatus, 'FLAGGED_OUTLIER');

  const corrected = await service.reviewMarketEvidence({
    actorUid: 'admin_reviewer_1',
    decision: {
      evidenceId: evOutlier.id,
      action: 'CORRECT',
      reason: 'Extra zero in manual entry corrected',
      correctedTotalMillion: 15600,
    },
  });
  assert.equal(corrected.outlierFlag, false);
  assert.equal(corrected.verificationStatus, 'CORRECTED');
  assert.equal(corrected.normalizedTotalMillion, 15600);
  assert.equal(corrected.correctionHistory?.length, 1);

  // Public evidence list strips privateParticipantRef and confidentialNotes
  const publicList = service.listMarketEvidence({ cityId: 'tehran', hoodId: 1, includePrivateFields: false });
  assert.ok(publicList.length >= 3);
  assert.equal(publicList.find((e) => e.id === ev1.id)?.privateParticipantRef, undefined);
  assert.equal(publicList.find((e) => e.id === ev1.id)?.confidentialNotes, undefined);

  // Neighborhood baseline distinguishes verified vs asking prices
  const baseline = await service.computeNeighborhoodBaseline({
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
  });
  assert.equal(baseline.verifiedSampleCount, 1);
  assert.ok(baseline.weightedPricePerSqmMillion > 0);
});

test('Employee 59 — 4. Model versioning, configuration rollback, snapshot reproducibility & idempotent recalculation', async () => {
  const service = createValuationService({
    dataConsumer: mockDataConsumer,
    now: () => new Date('2026-11-01T00:00:00.000Z'),
  });

  const input = {
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential' as const,
    transactionType: 'sale' as const,
    sqm: 110,
    buildYear: 1403,
    floor: 3,
    hasElevator: true,
    hasParking: true,
    valuationDateIso: '2026-11-01T00:00:00.000Z',
  };

  const valV1 = await service.estimatePropertyValue(input);
  const snapV1 = await service.persistValuationSnapshot({
    input,
    result: valV1,
    ownerUid: 'user_59',
  });
  assert.ok(snapV1);

  // Update model configuration to v2.3.0 with higher parking weight
  const cfgV2 = await service.upsertModelConfiguration({
    actorUid: 'admin_1',
    modelVersion: 'hedonic_ir_v2.3.0',
    changeReason: 'Increase parking weight for winter quarter',
    updates: {
      parkingWeightPct: 9.5,
    },
  });
  assert.equal(cfgV2.modelVersion, 'hedonic_ir_v2.3.0');
  assert.equal(cfgV2.configVersion, 2);

  const valV2 = await service.estimatePropertyValue(input);
  assert.equal(valV2.modelVersion, 'hedonic_ir_v2.3.0');
  assert.ok(valV2.estimatedTotalMillion > valV1.estimatedTotalMillion);

  // Historical snapshot reproduction uses original modelVersion & remains deterministic
  const reproduced = await service.reproduceHistoricalValuation(snapV1.id);
  assert.equal(reproduced.isDeterministicMatch, true);
  assert.equal(reproduced.reproducedResult.modelVersion, valV1.modelVersion);
  assert.equal(reproduced.reproducedResult.estimatedTotalMillion, valV1.estimatedTotalMillion);

  // Rollback model configuration to v2.2.0
  const rolledBack = await service.rollbackModelConfiguration({
    actorUid: 'admin_1',
    reason: 'Revert parking weight adjustment',
  });
  assert.equal(rolledBack.status, 'ACTIVE');
  assert.equal(rolledBack.parkingWeightPct, 5.5);

  // Idempotent recalculation job
  const job1 = await service.runRecalculationJob({
    actorUid: 'admin_1',
    idempotencyKey: 'recalc_key_001',
    cityId: 'tehran',
    hoodId: 1,
    reason: 'Evidence update batch',
  });
  const job2 = await service.runRecalculationJob({
    actorUid: 'admin_1',
    idempotencyKey: 'recalc_key_001',
    cityId: 'tehran',
    hoodId: 1,
    reason: 'Evidence update batch duplicate call',
  });
  assert.equal(job1.id, job2.id);
  assert.equal(job1.status, 'COMPLETED');
});


test('coordinate-based valuation fails closed without canonical spatial resolution', async () => {
  const input = {
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential' as const,
    transactionType: 'sale' as const,
    sqm: 100,
    coordinates: { lat: 35.8, lng: 51.4 },
  };

  const unconfiguredService = createValuationService({ dataConsumer: mockDataConsumer });
  await assert.rejects(
    () => unconfiguredService.estimatePropertyValue(input),
    (error: unknown) => error instanceof CoreApiError && error.status === 409,
  );

  let resolverCalls = 0;
  const configuredService = createValuationService({
    dataConsumer: mockDataConsumer,
    valuationLocationResolver: {
      getValuationLocationFeatures(params) {
        resolverCalls += 1;
        assert.deepEqual(params, {
          coordinates: input.coordinates,
          cityId: input.cityId,
          hoodId: input.hoodId,
        });
        return {
          cityId: 'tehran',
          hoodId: 1,
          districtId: 'district-1',
          subNeighborhoodId: 'sub-neighborhood-1',
        };
      },
    },
  });
  const result = await configuredService.estimatePropertyValue(input);
  assert.equal(resolverCalls, 1);
  assert.ok(result.estimatedTotalMillion > 0);

  const mismatchedService = createValuationService({
    dataConsumer: mockDataConsumer,
    valuationLocationResolver: {
      getValuationLocationFeatures() {
        return { cityId: 'tehran', hoodId: 2 };
      },
    },
  });
  await assert.rejects(
    () => mismatchedService.estimatePropertyValue(input),
    (error: unknown) => error instanceof CoreApiError && error.status === 409,
  );
});
