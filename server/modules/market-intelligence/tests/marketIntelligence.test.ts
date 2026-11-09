import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CoreApiError,
  type AuthenticatedPrincipal,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../../core';
import {
  createMarketIntelligenceService,
  MARKET_INTELLIGENCE_ROUTE_REGISTRATION_SPEC,
  type CanonicalMarketGeographicEntity,
  type RawMarketDemandSignal,
  type RawMarketListingObservation,
  type RawMarketTransactionObservation,
  type VerifiedMacroeconomicPeriodRecord,
} from '../index';

function makePrincipal(
  uid: string,
  email = `${uid}@radartehran.ir`,
  role: AuthenticatedPrincipal['role'] = 'verified_user',
): AuthenticatedPrincipal {
  return {
    uid,
    email,
    emailVerified: true,
    role,
    authMode: 'firebase_id_token',
    claims: { uid, email, email_verified: true },
  };
}

function createInMemoryDurableTransactionRunner(options?: {
  failAllWrites?: boolean;
  abortFirstAttempts?: number;
}) {
  const store = new Map<string, Record<string, unknown>>();
  let remainingAborts = options?.abortFirstAttempts ?? 0;

  const txRunner: TransactionRunnerAdapter = {
    async runTransaction<T>(workFn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      if (options?.failAllWrites) {
        throw new Error('Firestore durable storage unreachable');
      }
      if (remainingAborts > 0) {
        remainingAborts--;
        const abortErr = new Error('10 ABORTED: cross-transaction contention') as Error & {
          code: string;
        };
        abortErr.code = 'ABORTED';
        throw abortErr;
      }

      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<Doc = Record<string, unknown>>(docPath: string) {
          if (staged.has(docPath)) {
            const val = staged.get(docPath);
            return val
              ? { exists: true, id: docPath.split('/').pop()!, data: structuredClone(val) as Doc }
              : { exists: false, id: docPath.split('/').pop()! };
          }
          const raw = store.get(docPath);
          return raw
            ? { exists: true, id: docPath.split('/').pop()!, data: structuredClone(raw) as Doc }
            : { exists: false, id: docPath.split('/').pop()! };
        },
        set(docPath: string, data: Record<string, unknown>, setOpts?: { merge?: boolean }) {
          if (setOpts?.merge && store.has(docPath)) {
            staged.set(docPath, { ...store.get(docPath)!, ...structuredClone(data) });
          } else {
            staged.set(docPath, structuredClone(data));
          }
        },
        update(docPath: string, partial: Record<string, unknown>) {
          const base = staged.get(docPath) ?? store.get(docPath) ?? {};
          staged.set(docPath, { ...structuredClone(base), ...structuredClone(partial) });
        },
        delete(docPath: string) {
          staged.set(docPath, null);
        },
      };

      const result = await workFn(tx);
      for (const [k, v] of staged.entries()) {
        if (v === null) store.delete(k);
        else store.set(k, v);
      }
      return result;
    },
  };

  return { store, txRunner };
}

function createTestHarness(txOpts?: { failAllWrites?: boolean; abortFirstAttempts?: number }) {
  const { store, txRunner } = createInMemoryDurableTransactionRunner(txOpts);
  const currentEpochMs = Date.parse('2026-04-01T10:00:00.000Z');

  const geographies = new Map<string, CanonicalMarketGeographicEntity>([
    [
      'tehran_district_5',
      {
        geographicEntityId: 'tehran_district_5',
        cityId: 'tehran',
        provinceId: 'tehran_prov',
        districtId: 'd5',
        level: 'DISTRICT',
        nameFa: 'منطقه ۵ تهران',
        nameEn: 'Tehran District 5',
        boundaryVersion: 'GEO-2026.1',
        crs: 'EPSG:4326',
      },
    ],
    [
      'tehran_district_2',
      {
        geographicEntityId: 'tehran_district_2',
        cityId: 'tehran',
        provinceId: 'tehran_prov',
        districtId: 'd2',
        level: 'DISTRICT',
        nameFa: 'منطقه ۲ تهران',
        nameEn: 'Tehran District 2',
        boundaryVersion: 'GEO-2026.1',
        crs: 'EPSG:4326',
      },
    ],
    [
      'shiraz_district_1',
      {
        geographicEntityId: 'shiraz_district_1',
        cityId: 'shiraz',
        provinceId: 'fars_prov',
        districtId: 's_d1',
        level: 'DISTRICT',
        nameFa: 'منطقه ۱ شیراز',
        nameEn: 'Shiraz District 1',
        boundaryVersion: 'GEO-2026.1',
        crs: 'EPSG:4326',
      },
    ],
  ]);

  const listings: RawMarketListingObservation[] = [];
  const transactions: RawMarketTransactionObservation[] = [];
  const demandSignals: RawMarketDemandSignal[] = [];
  const macroRecords = new Map<string, VerifiedMacroeconomicPeriodRecord>([
    [
      '2025-Q1',
      {
        reportingPeriodKey: '2025-Q1',
        basePeriodKey: '2025-Q1',
        cpiIndexBase100: 100,
        constructionCostIndexBase100: 100,
        referenceAnnualInterestRatePct: 23,
        usdExchangeRateToman: 60_000,
        sourceAuthority: 'CENTRAL_BANK_OFFICIAL_SERIES',
        observedAtIso: '2025-03-31T00:00:00.000Z',
        verified: true,
      },
    ],
    [
      '2026-Q1',
      {
        reportingPeriodKey: '2026-Q1',
        basePeriodKey: '2025-Q1',
        cpiIndexBase100: 140,
        constructionCostIndexBase100: 138,
        referenceAnnualInterestRatePct: 23,
        usdExchangeRateToman: 80_000,
        sourceAuthority: 'CENTRAL_BANK_OFFICIAL_SERIES',
        observedAtIso: '2026-03-31T00:00:00.000Z',
        verified: true,
      },
    ],
  ]);

  const service = createMarketIntelligenceService({
    txRunner,
    primaryAdminEmails: ['admin@radartehran.ir'],
    nowFn: () => currentEpochMs,
    geography: {
      async resolveMarketGeography(lookup) {
        if (lookup.nameFa === 'ولیعصر' && !lookup.cityId && !lookup.geographicEntityId) {
          return {
            resolved: false,
            ambiguous: true,
            candidateEntityIds: ['tehran_valiasr', 'tabriz_valiasr'],
          };
        }
        const id = lookup.geographicEntityId ?? '';
        const ent = geographies.get(id);
        if (!ent) return { resolved: false, ambiguous: false };
        return { resolved: true, ambiguous: false, entity: ent };
      },
    },
    listingSupply: {
      async listListingObservations(q) {
        return listings.filter(
          (l) =>
            l.geographicEntityId === q.geographicEntityId &&
            l.reportingPeriodKey === q.reportingPeriodKey &&
            (!q.marketType || l.marketType === q.marketType),
        );
      },
    },
    transactions: {
      async listTransactionObservations(q) {
        return transactions.filter(
          (t) =>
            t.geographicEntityId === q.geographicEntityId &&
            t.reportingPeriodKey === q.reportingPeriodKey &&
            (!q.marketType || t.marketType === q.marketType),
        );
      },
    },
    demandSignals: {
      async listDemandSignals(q) {
        return demandSignals.filter(
          (d) =>
            d.geographicEntityId === q.geographicEntityId &&
            d.reportingPeriodKey === q.reportingPeriodKey &&
            (!q.marketType || d.marketType === q.marketType),
        );
      },
    },
    macroeconomic: {
      async getMacroeconomicRecord(periodKey) {
        return macroRecords.get(periodKey) ?? null;
      },
    },
  });

  const adminPrincipal = makePrincipal('admin_1', 'admin@radartehran.ir', 'primary_admin');
  const regularUserPrincipal = makePrincipal('user_1', 'user1@example.com', 'verified_user');

  return {
    service,
    store,
    listings,
    transactions,
    demandSignals,
    macroRecords,
    adminPrincipal,
    regularUserPrincipal,
  };
}

test('1. Deduplicates duplicate listings by canonicalPropertyRefId, separates asking vs agreed vs confirmed prices, and tracks right-censored & reactivated liquidity', async () => {
  const h = createTestHarness();

  // Two ads for prop_A (duplicate) + active prop_B + reactivated prop_C + withdrawn prop_D
  h.listings.push(
    {
      listingId: 'ad_dup_1',
      canonicalPropertyRefId: 'prop_A',
      geographicEntityId: 'tehran_district_5',
      reportingPeriodKey: '2026-Q1',
      marketType: 'SALE',
      propertyUse: 'RESIDENTIAL',
      propertyForm: 'APARTMENT',
      constructionStage: 'EXISTING_PROPERTY',
      listedAreaSqm: 100,
      verifiedAreaSqm: 100,
      constructionAgeYears: 4,
      lifecycleState: 'ACTIVE',
      publishedAtIso: '2026-01-10T00:00:00.000Z',
      firstObservedAtIso: '2026-01-10T00:00:00.000Z',
      currency: 'TOMAN',
      initialSaleAskingTotal: 11_000_000_000,
      currentSaleAskingTotal: 10_500_000_000,
      sourceDatasetId: 'ds_listings_2026q1',
      sourceObservedAtIso: '2026-03-01T00:00:00.000Z',
    },
    {
      listingId: 'ad_dup_2',
      canonicalPropertyRefId: 'prop_A', // Same canonical property
      geographicEntityId: 'tehran_district_5',
      reportingPeriodKey: '2026-Q1',
      marketType: 'SALE',
      propertyUse: 'RESIDENTIAL',
      propertyForm: 'APARTMENT',
      constructionStage: 'EXISTING_PROPERTY',
      listedAreaSqm: 100,
      verifiedAreaSqm: 100,
      constructionAgeYears: 4,
      lifecycleState: 'ACTIVE',
      publishedAtIso: '2026-01-12T00:00:00.000Z',
      firstObservedAtIso: '2026-01-12T00:00:00.000Z',
      currency: 'TOMAN',
      initialSaleAskingTotal: 10_500_000_000,
      currentSaleAskingTotal: 10_000_000_000,
      sourceDatasetId: 'ds_listings_2026q1',
      sourceObservedAtIso: '2026-03-20T00:00:00.000Z', // Later observation wins
    },
    {
      listingId: 'ad_b',
      canonicalPropertyRefId: 'prop_B',
      geographicEntityId: 'tehran_district_5',
      reportingPeriodKey: '2026-Q1',
      marketType: 'SALE',
      propertyUse: 'RESIDENTIAL',
      propertyForm: 'APARTMENT',
      constructionStage: 'NEW_CONSTRUCTION',
      listedAreaSqm: 85,
      verifiedAreaSqm: 85,
      constructionAgeYears: 0,
      lifecycleState: 'ACTIVE',
      publishedAtIso: '2026-02-01T00:00:00.000Z',
      firstObservedAtIso: '2026-02-01T00:00:00.000Z',
      currency: 'TOMAN',
      initialSaleAskingTotal: 9_350_000_000,
      currentSaleAskingTotal: 9_350_000_000,
      sourceDatasetId: 'ds_listings_2026q1',
      sourceObservedAtIso: '2026-03-15T00:00:00.000Z',
    },
    {
      listingId: 'ad_c_reactivated',
      canonicalPropertyRefId: 'prop_C',
      geographicEntityId: 'tehran_district_5',
      reportingPeriodKey: '2026-Q1',
      marketType: 'SALE',
      propertyUse: 'RESIDENTIAL',
      propertyForm: 'APARTMENT',
      constructionStage: 'EXISTING_PROPERTY',
      listedAreaSqm: 120,
      verifiedAreaSqm: 120,
      constructionAgeYears: 6,
      lifecycleState: 'REACTIVATED',
      publishedAtIso: '2025-11-01T00:00:00.000Z',
      firstObservedAtIso: '2025-11-01T00:00:00.000Z',
      reactivatedAtIso: '2026-03-01T00:00:00.000Z',
      priorActiveDaysBeforeReactivation: 45,
      currency: 'TOMAN',
      initialSaleAskingTotal: 14_400_000_000,
      currentSaleAskingTotal: 13_800_000_000,
      sourceDatasetId: 'ds_listings_2026q1',
      sourceObservedAtIso: '2026-03-25T00:00:00.000Z',
    },
    {
      listingId: 'ad_d_withdrawn',
      canonicalPropertyRefId: 'prop_D',
      geographicEntityId: 'tehran_district_5',
      reportingPeriodKey: '2026-Q1',
      marketType: 'SALE',
      propertyUse: 'RESIDENTIAL',
      propertyForm: 'APARTMENT',
      constructionStage: 'EXISTING_PROPERTY',
      listedAreaSqm: 95,
      verifiedAreaSqm: 95,
      constructionAgeYears: 5,
      lifecycleState: 'WITHDRAWN',
      publishedAtIso: '2026-01-05T00:00:00.000Z',
      firstObservedAtIso: '2026-01-05T00:00:00.000Z',
      withdrawnOrExpiredAtIso: '2026-02-20T00:00:00.000Z',
      currency: 'TOMAN',
      initialSaleAskingTotal: 10_000_000_000,
      currentSaleAskingTotal: 10_000_000_000,
      sourceDatasetId: 'ds_listings_2026q1',
      sourceObservedAtIso: '2026-02-20T00:00:00.000Z',
    },
  );

  // 3 Confirmed completed transactions + 3 Agreed pending transactions
  for (let i = 1; i <= 3; i++) {
    h.transactions.push({
      transactionId: `tx_conf_${i}`,
      canonicalPropertyRefId: `prop_tx_conf_${i}`,
      geographicEntityId: 'tehran_district_5',
      reportingPeriodKey: '2026-Q1',
      marketType: 'SALE',
      propertyUse: 'RESIDENTIAL',
      propertyForm: 'APARTMENT',
      constructionStage: 'EXISTING_PROPERTY',
      listedAreaSqm: 100,
      verifiedAreaSqm: 100,
      constructionAgeYears: 4,
      verificationClassification: 'AUTHORITATIVELY_CONFIRMED_COMPLETED',
      currency: 'TOMAN',
      askingPriceTotal: 10_000_000_000,
      agreedPriceTotal: 9_200_000_000,
      confirmedTransactionPriceTotal: 9_000_000_000 + i * 100_000_000, // ~90M/sqm (vs 100M-115M asking)
      listingPublishedAtIso: '2026-01-10T00:00:00.000Z',
      firstOfferSubmittedAtIso: '2026-01-20T00:00:00.000Z',
      agreementReachedAtIso: '2026-01-25T00:00:00.000Z',
      completedAtIso: '2026-02-09T00:00:00.000Z', // 30 days on market
      sourceDatasetId: 'ds_tx_2026q1',
      sourceObservedAtIso: '2026-02-10T00:00:00.000Z',
    });

    h.transactions.push({
      transactionId: `tx_agreed_${i}`,
      canonicalPropertyRefId: `prop_tx_agreed_${i}`,
      geographicEntityId: 'tehran_district_5',
      reportingPeriodKey: '2026-Q1',
      marketType: 'SALE',
      propertyUse: 'RESIDENTIAL',
      propertyForm: 'APARTMENT',
      constructionStage: 'EXISTING_PROPERTY',
      listedAreaSqm: 100,
      verifiedAreaSqm: 100,
      constructionAgeYears: 4,
      verificationClassification: 'AGREED_PENDING_COMPLETION',
      currency: 'TOMAN',
      askingPriceTotal: 10_000_000_000,
      agreedPriceTotal: 9_500_000_000,
      confirmedTransactionPriceTotal: null,
      sourceDatasetId: 'ds_tx_2026q1',
      sourceObservedAtIso: '2026-03-10T00:00:00.000Z',
    });
  }

  // Demand signals: 6 unique actors + repeat inquiry by actor_1 + raw page views
  for (let i = 1; i <= 6; i++) {
    h.demandSignals.push({
      signalId: `sig_${i}`,
      actorUidHash: `actor_${i}`,
      geographicEntityId: 'tehran_district_5',
      reportingPeriodKey: '2026-Q1',
      marketType: 'SALE',
      propertyUse: 'RESIDENTIAL',
      propertyForm: 'APARTMENT',
      signalType: 'QUALIFIED_INQUIRY',
      occurredAtIso: '2026-02-15T00:00:00.000Z',
      sourceModule: 'BARGAINS',
    });
  }
  // Repeat inquiry by actor_1
  h.demandSignals.push({
    signalId: 'sig_repeat_actor_1',
    actorUidHash: 'actor_1',
    geographicEntityId: 'tehran_district_5',
    reportingPeriodKey: '2026-Q1',
    marketType: 'SALE',
    propertyUse: 'RESIDENTIAL',
    propertyForm: 'APARTMENT',
    signalType: 'SUBMITTED_INQUIRY',
    occurredAtIso: '2026-02-16T00:00:00.000Z',
    sourceModule: 'BARGAINS',
  });
  // Raw page view telemetry (must be ignored from demand count)
  h.demandSignals.push({
    signalId: 'sig_pageview_1',
    actorUidHash: 'actor_99',
    geographicEntityId: 'tehran_district_5',
    reportingPeriodKey: '2026-Q1',
    marketType: 'SALE',
    propertyUse: 'RESIDENTIAL',
    propertyForm: 'APARTMENT',
    signalType: 'RAW_PAGE_VIEW_TELEMETRY',
    occurredAtIso: '2026-02-16T00:00:00.000Z',
    sourceModule: 'TELEMETRY',
  });

  const res = await h.service.generateOrRecalculateMarketSnapshot({
    principal: h.adminPrincipal,
    idempotencyKey: 'idem_d5_sale_2026q1',
    geographyLookup: { geographicEntityId: 'tehran_district_5' },
    segmentId: 'seg_res_apt_sale_all',
    reportingPeriodKey: '2026-Q1',
    observationWindowStartIso: '2026-01-01T00:00:00.000Z',
    observationWindowEndIso: '2026-03-31T00:00:00.000Z',
  });

  assert.equal(res.reusedExistingImmutableSnapshot, false);
  const snap = res.snapshot;

  // Supply checks
  assert.equal(snap.supply.rawAdvertisementCount, 5);
  assert.equal(snap.supply.duplicateAdvertisementsRemovedCount, 1);
  assert.equal(snap.supply.deduplicatedActiveInventoryCount, 3); // prop_A, prop_B, prop_C
  assert.equal(snap.supply.withdrawnListingCount, 1); // prop_D (not counted as sold!)
  assert.equal(snap.supply.reactivatedListingCount, 1); // prop_C

  // Demand checks
  assert.equal(snap.demand.privacySuppressionApplied, false);
  assert.equal(snap.demand.ignoredRawTelemetryPageViewsCount, 1);
  assert.equal(snap.demand.totalSubmittedInquiriesCount, 7);
  assert.equal(snap.demand.uniqueInquiringActorsCount, 6);
  assert.ok((snap.demand.repeatInquiryRatePct ?? 0) > 0);

  // Sale market checks: asking vs agreed vs confirmed strictly separated
  assert.ok(snap.saleMarket);
  assert.equal(snap.saleMarket.confirmedTransactionCount, 3);
  assert.equal(snap.saleMarket.askingPricePerSqmDistribution.median, 110_000_000);
  assert.equal(snap.saleMarket.agreedPendingPricePerSqmDistribution.median, 95_000_000);
  assert.equal(snap.saleMarket.confirmedTransactionPricePerSqmDistribution.median, 92_000_000);
  assert.ok((snap.saleMarket.medianNegotiatedDiscountFromAskingPct ?? 0) > 0);

  // Liquidity & Absorption checks
  assert.equal(snap.liquidity.observedCompletedSampleCount, 3);
  assert.equal(snap.liquidity.medianDaysOnMarketObserved, 30);
  assert.equal(snap.liquidity.rightCensoredActiveListingCount, 3);
  assert.equal(snap.absorption.absorptionStatus, 'AVAILABLE_OBSERVED');
  assert.equal(snap.absorption.monthsOfSupply, 1); // 3 active / 3 confirmed tx

  // Endpoint retrieval verification
  const askingDist = await h.service.retrieveAskingPriceDistributions({
    geographyLookup: { geographicEntityId: 'tehran_district_5' },
  });
  assert.equal(askingDist.priceClassification, 'PUBLIC_ASKING_PRICE_ONLY');

  const confirmedDist = await h.service.retrieveConfirmedTransactionPriceDistributions({
    geographyLookup: { geographicEntityId: 'tehran_district_5' },
  });
  assert.equal(
    confirmedDist.priceClassification,
    'AUTHORITATIVELY_CONFIRMED_COMPLETED_TRANSACTION_PRICE',
  );
});

test('2. Enforces privacy threshold (< 5 unique actors), blocks unauthorized mutations, and rejects ambiguous geographic lookups', async () => {
  const h = createTestHarness();

  // Only 3 unique actors inquiring in District 2
  for (let i = 1; i <= 3; i++) {
    h.demandSignals.push({
      signalId: `sig_d2_${i}`,
      actorUidHash: `actor_d2_${i}`,
      geographicEntityId: 'tehran_district_2',
      reportingPeriodKey: '2026-Q1',
      marketType: 'SALE',
      propertyUse: 'RESIDENTIAL',
      propertyForm: 'APARTMENT',
      signalType: 'QUALIFIED_INQUIRY',
      occurredAtIso: '2026-02-10T00:00:00.000Z',
      sourceModule: 'BARGAINS',
    });
  }

  // Non-admin user cannot trigger snapshot calculation
  await assert.rejects(
    async () =>
      h.service.generateOrRecalculateMarketSnapshot({
        principal: h.regularUserPrincipal,
        idempotencyKey: 'idem_unauth_user',
        geographyLookup: { geographicEntityId: 'tehran_district_2' },
        segmentId: 'seg_res_apt_sale_all',
        reportingPeriodKey: '2026-Q1',
        observationWindowStartIso: '2026-01-01T00:00:00.000Z',
        observationWindowEndIso: '2026-03-31T00:00:00.000Z',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN',
  );

  // Ambiguous neighborhood name across cities is rejected
  await assert.rejects(
    async () =>
      h.service.generateOrRecalculateMarketSnapshot({
        principal: h.adminPrincipal,
        idempotencyKey: 'idem_ambiguous_geo',
        geographyLookup: { nameFa: 'ولیعصر' },
        segmentId: 'seg_res_apt_sale_all',
        reportingPeriodKey: '2026-Q1',
        observationWindowStartIso: '2026-01-01T00:00:00.000Z',
        observationWindowEndIso: '2026-03-31T00:00:00.000Z',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED',
  );

  const { snapshot } = await h.service.generateOrRecalculateMarketSnapshot({
    principal: h.adminPrincipal,
    idempotencyKey: 'idem_d2_privacy_2026q1',
    geographyLookup: { geographicEntityId: 'tehran_district_2' },
    segmentId: 'seg_res_apt_sale_all',
    reportingPeriodKey: '2026-Q1',
    observationWindowStartIso: '2026-01-01T00:00:00.000Z',
    observationWindowEndIso: '2026-03-31T00:00:00.000Z',
  });

  // Privacy suppression applied because unique actors (3) < 5
  assert.equal(snapshot.demand.privacySuppressionApplied, true);
  assert.equal(snapshot.demand.uniqueInquiringActorsCount, null);
  assert.equal(snapshot.demand.totalSubmittedInquiriesCount, null);
  // Zero transactions edge case
  assert.equal(snapshot.absorption.absorptionStatus, 'UNAVAILABLE_ZERO_TRANSACTIONS');
  assert.equal(snapshot.absorption.monthsOfSupply, null);
});

test('3. Evaluates rental market keeping monthly rent and security deposit strictly separate, with documented analytical equivalent-rent reference', async () => {
  const h = createTestHarness();

  for (let i = 1; i <= 4; i++) {
    h.listings.push({
      listingId: `rent_ad_${i}`,
      canonicalPropertyRefId: `rent_prop_${i}`,
      geographicEntityId: 'tehran_district_5',
      reportingPeriodKey: '2026-Q1',
      marketType: 'RENTAL',
      propertyUse: 'RESIDENTIAL',
      propertyForm: 'APARTMENT',
      constructionStage: 'EXISTING_PROPERTY',
      listedAreaSqm: 100,
      verifiedAreaSqm: 100,
      constructionAgeYears: 5,
      lifecycleState: 'ACTIVE',
      publishedAtIso: '2026-01-15T00:00:00.000Z',
      firstObservedAtIso: '2026-01-15T00:00:00.000Z',
      currency: 'TOMAN',
      monthlyAskingRent: 20_000_000 + i * 2_000_000,
      askingSecurityDeposit: 500_000_000 + i * 50_000_000,
      sourceDatasetId: 'ds_rent_2026q1',
      sourceObservedAtIso: '2026-03-10T00:00:00.000Z',
    });
  }

  const { snapshot } = await h.service.generateOrRecalculateMarketSnapshot({
    principal: h.adminPrincipal,
    idempotencyKey: 'idem_d5_rental_2026q1',
    geographyLookup: { geographicEntityId: 'tehran_district_5' },
    segmentId: 'seg_res_apt_rental_all',
    reportingPeriodKey: '2026-Q1',
    observationWindowStartIso: '2026-01-01T00:00:00.000Z',
    observationWindowEndIso: '2026-03-31T00:00:00.000Z',
    equivalentRentAnnualRatePct: 30,
  });

  assert.ok(snapshot.rentalMarket);
  assert.equal(snapshot.rentalMarket.askingMonthlyRentDistribution.sufficientSample, true);
  assert.equal(snapshot.rentalMarket.askingSecurityDepositDistribution.sufficientSample, true);
  assert.equal(
    snapshot.rentalMarket.analyticalEquivalentRentReference?.documentedAnnualConversionRatePct,
    30,
  );
  assert.ok(
    snapshot.rentalMarket.analyticalEquivalentRentReference?.medianAskingEquivalentMonthlyRent,
  );

  const trends = await h.service.retrieveRentalMarketTrends({
    geographyLookup: { geographicEntityId: 'tehran_district_5' },
  });
  assert.equal(trends.points.length, 1);
  assert.ok(trends.points[0]!.askingMonthlyRentMedian);
  assert.ok(trends.points[0]!.askingSecurityDepositMedian);
});

test('4. Computes Stratified Mix-Adjusted Laspeyres Price Index controlling for sample size-composition shift and deflating by CPI', async () => {
  const h = createTestHarness();

  // Base period (2025-Q1): small (<75m) = 80M/sqm, medium (75-130m) = 100M/sqm, large (>130m) = 120M/sqm
  // Reporting period (2026-Q1): every stratum increased by exactly +20% (96M, 120M, 144M), even though large units doubled in sample count
  const strataSpec = [
    { area: 60, baseSqm: 80_000_000, currSqm: 96_000_000, baseCount: 2, currCount: 2 },
    { area: 100, baseSqm: 100_000_000, currSqm: 120_000_000, baseCount: 2, currCount: 2 },
    { area: 150, baseSqm: 120_000_000, currSqm: 144_000_000, baseCount: 2, currCount: 6 },
  ];

  let seq = 0;
  for (const s of strataSpec) {
    for (let i = 0; i < s.baseCount; i++) {
      seq++;
      h.listings.push({
        listingId: `base_l_${seq}`,
        canonicalPropertyRefId: `base_p_${seq}`,
        geographicEntityId: 'tehran_district_5',
        reportingPeriodKey: '2025-Q1',
        marketType: 'SALE',
        propertyUse: 'RESIDENTIAL',
        propertyForm: 'APARTMENT',
        constructionStage: 'EXISTING_PROPERTY',
        listedAreaSqm: s.area,
        verifiedAreaSqm: s.area,
        constructionAgeYears: 3,
        lifecycleState: 'ACTIVE',
        publishedAtIso: '2025-01-15T00:00:00.000Z',
        firstObservedAtIso: '2025-01-15T00:00:00.000Z',
        currency: 'TOMAN',
        currentSaleAskingTotal: s.area * s.baseSqm,
        sourceDatasetId: 'ds_2025q1',
        sourceObservedAtIso: '2025-03-15T00:00:00.000Z',
      });
    }
    for (let i = 0; i < s.currCount; i++) {
      seq++;
      h.listings.push({
        listingId: `curr_l_${seq}`,
        canonicalPropertyRefId: `curr_p_${seq}`,
        geographicEntityId: 'tehran_district_5',
        reportingPeriodKey: '2026-Q1',
        marketType: 'SALE',
        propertyUse: 'RESIDENTIAL',
        propertyForm: 'APARTMENT',
        constructionStage: 'EXISTING_PROPERTY',
        listedAreaSqm: s.area,
        verifiedAreaSqm: s.area,
        constructionAgeYears: 3,
        lifecycleState: 'ACTIVE',
        publishedAtIso: '2026-01-15T00:00:00.000Z',
        firstObservedAtIso: '2026-01-15T00:00:00.000Z',
        currency: 'TOMAN',
        currentSaleAskingTotal: s.area * s.currSqm,
        sourceDatasetId: 'ds_2026q1',
        sourceObservedAtIso: '2026-03-15T00:00:00.000Z',
      });
    }
  }

  const indexRec = await h.service.computeAndRetrievePriceAndRentIndex({
    geographyLookup: { geographicEntityId: 'tehran_district_5' },
    segmentId: 'seg_res_apt_sale_all',
    indexType: 'SALE_ASKING_PRICE_SQM_INDEX',
    basePeriodKey: '2025-Q1',
    reportingPeriodKey: '2026-Q1',
    previousNominalIndexValue: 100,
  });

  assert.equal(indexRec.status, 'PUBLISHED');
  // Fixed Laspeyres weights ensure composition shift toward large units does not inflate index above 120.00
  assert.equal(indexRec.nominalIndexValueBase100, 120);
  assert.equal(indexRec.nominalPeriodChangePct, 20);
  // Real index deflated by CPI ratio (140 / 100 = 1.40) -> 120 / 1.40 = 85.71
  assert.equal(indexRec.realInflationAdjustedIndexValueBase100, 85.71);
});

test('5. Enforces forecast chronological backtesting, blocks future data leakage, compares against naive baseline, and separates hypothetical scenarios from forecasts', async () => {
  const h = createTestHarness();

  const series = [
    { periodKey: '2024-Q3', observedAtIso: '2024-09-30T00:00:00.000Z', value: 100_000_000 },
    { periodKey: '2024-Q4', observedAtIso: '2024-12-31T00:00:00.000Z', value: 104_000_000 },
    { periodKey: '2025-Q1', observedAtIso: '2025-03-31T00:00:00.000Z', value: 108_000_000 },
    { periodKey: '2025-Q2', observedAtIso: '2025-06-30T00:00:00.000Z', value: 112_000_000 },
    { periodKey: '2025-Q3', observedAtIso: '2025-09-30T00:00:00.000Z', value: 116_000_000 },
    { periodKey: '2025-Q4', observedAtIso: '2025-12-31T00:00:00.000Z', value: 120_000_000 },
    { periodKey: '2026-Q1', observedAtIso: '2026-03-31T00:00:00.000Z', value: 124_000_000 },
  ];

  // Future data leakage check: cutoff is 2025-Q4 but series contains 2026-Q1
  await assert.rejects(
    async () =>
      h.service.requestMarketForecast({
        principal: h.adminPrincipal,
        geographyLookup: { geographicEntityId: 'tehran_district_5' },
        segmentId: 'seg_res_apt_sale_all',
        targetMetric: 'SALE_ASKING_PRICE_SQM_MEDIAN',
        historicalSeries: series,
        trainingCutoffPeriodKey: '2025-Q4',
        horizonPeriods: 3,
      }),
    (err: unknown) =>
      err instanceof CoreApiError && err.message.includes('FUTURE_DATA_LEAKAGE_DETECTED'),
  );

  // Valid chronological forecast
  const forecast = await h.service.requestMarketForecast({
    principal: h.adminPrincipal,
    geographyLookup: { geographicEntityId: 'tehran_district_5' },
    segmentId: 'seg_res_apt_sale_all',
    targetMetric: 'SALE_ASKING_PRICE_SQM_MEDIAN',
    historicalSeries: series,
    trainingCutoffPeriodKey: '2026-Q1',
    horizonPeriods: 3,
  });

  assert.equal(forecast.status, 'COMPLETED');
  assert.equal(forecast.outputClassification, 'STATISTICAL_FORECAST_WITH_UNCERTAINTY');
  assert.equal(forecast.forecasts.length, 3);
  assert.ok(forecast.forecasts[0]!.interval80Lower < forecast.forecasts[0]!.pointEstimate);
  assert.ok(forecast.forecasts[0]!.interval95Upper > forecast.forecasts[0]!.interval80Upper);
  assert.ok(forecast.evaluation?.beatsOrMatchesBaseline);

  const evalSummary = await h.service.retrieveForecastEvaluation({
    forecastId: forecast.forecastId,
  });
  assert.equal(evalSummary.forecastId, forecast.forecastId);

  // Generate baseline snapshot and run hypothetical scenario
  await h.service.generateOrRecalculateMarketSnapshot({
    principal: h.adminPrincipal,
    idempotencyKey: 'idem_scenario_base',
    geographyLookup: { geographicEntityId: 'tehran_district_5' },
    segmentId: 'seg_res_apt_sale_all',
    reportingPeriodKey: '2026-Q1',
    observationWindowStartIso: '2026-01-01T00:00:00.000Z',
    observationWindowEndIso: '2026-03-31T00:00:00.000Z',
  });

  const scenario = await h.service.runHypotheticalScenario({
    principal: h.adminPrincipal,
    geographyLookup: { geographicEntityId: 'tehran_district_5' },
    segmentId: 'seg_res_apt_sale_all',
    reportingPeriodKey: '2026-Q1',
    scenarioName: 'High Construction Cost + Supply Contraction Shock',
    supplyShockPct: -15,
    demandInquiryShockPct: 10,
    constructionCostShockPct: 25,
    financingRateDeltaBps: -100,
  } as Parameters<typeof h.service.runHypotheticalScenario>[0]);

  assert.equal(scenario.outputClassification, 'HYPOTHETICAL_SCENARIO_NOT_A_FORECAST');
  assert.equal(scenario.projectedScenarioMetrics.projectedDirectionalPressure, 'UPWARD_PRESSURE');
});

test('6. Prevents partial snapshots on mid-calculation failure, enforces idempotency & snapshot deduplication, and retries transient transaction contention', async () => {
  const h = createTestHarness({ abortFirstAttempts: 1 });

  // Simulated mid-calculation failure after DEMAND stage must not persist any partial snapshot
  await assert.rejects(
    async () =>
      h.service.generateOrRecalculateMarketSnapshot({
        principal: h.adminPrincipal,
        idempotencyKey: 'idem_partial_failure',
        geographyLookup: { geographicEntityId: 'tehran_district_5' },
        segmentId: 'seg_res_apt_sale_all',
        reportingPeriodKey: '2026-Q1',
        observationWindowStartIso: '2026-01-01T00:00:00.000Z',
        observationWindowEndIso: '2026-03-31T00:00:00.000Z',
        simulateStageFailureForTesting: 'AFTER_DEMAND',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'INTERNAL_ERROR',
  );

  await assert.rejects(
    async () =>
      h.service.retrieveMarketOverview({
        geographyLookup: { geographicEntityId: 'tehran_district_5' },
        segmentId: 'seg_res_apt_sale_all',
        reportingPeriodKey: '2026-Q1',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'NOT_FOUND',
  );

  // Succeeds after retrying transient ABORTED contention
  const run1 = await h.service.generateOrRecalculateMarketSnapshot({
    principal: h.adminPrincipal,
    idempotencyKey: 'idem_retry_ok_1',
    geographyLookup: { geographicEntityId: 'tehran_district_5' },
    segmentId: 'seg_res_apt_sale_all',
    reportingPeriodKey: '2026-Q1',
    observationWindowStartIso: '2026-01-01T00:00:00.000Z',
    observationWindowEndIso: '2026-03-31T00:00:00.000Z',
  });

  // Same idempotencyKey returns cached result
  const run2 = await h.service.generateOrRecalculateMarketSnapshot({
    principal: h.adminPrincipal,
    idempotencyKey: 'idem_retry_ok_1',
    geographyLookup: { geographicEntityId: 'tehran_district_5' },
    segmentId: 'seg_res_apt_sale_all',
    reportingPeriodKey: '2026-Q1',
    observationWindowStartIso: '2026-01-01T00:00:00.000Z',
    observationWindowEndIso: '2026-03-31T00:00:00.000Z',
  });
  assert.equal(run1.snapshot.snapshotId, run2.snapshot.snapshotId);
  assert.equal(run1.job.jobId, run2.job.jobId);

  // Different idempotencyKey with identical underlying inputs reuses existing immutable snapshot without duplication
  const run3 = await h.service.generateOrRecalculateMarketSnapshot({
    principal: h.adminPrincipal,
    idempotencyKey: 'idem_retry_ok_2',
    geographyLookup: { geographicEntityId: 'tehran_district_5' },
    segmentId: 'seg_res_apt_sale_all',
    reportingPeriodKey: '2026-Q1',
    observationWindowStartIso: '2026-01-01T00:00:00.000Z',
    observationWindowEndIso: '2026-03-31T00:00:00.000Z',
  });
  assert.equal(run3.reusedExistingImmutableSnapshot, true);
  assert.equal(run3.snapshot.snapshotId, run1.snapshot.snapshotId);
});

test('7. Compares geographic markets with segment compatibility checks, exposes provenance metadata, and paginates segments and history', async () => {
  const h = createTestHarness();

  const s1 = await h.service.generateOrRecalculateMarketSnapshot({
    principal: h.adminPrincipal,
    idempotencyKey: 'idem_cmp_tehran',
    geographyLookup: { geographicEntityId: 'tehran_district_5' },
    segmentId: 'seg_res_apt_sale_all',
    reportingPeriodKey: '2026-Q1',
    observationWindowStartIso: '2026-01-01T00:00:00.000Z',
    observationWindowEndIso: '2026-03-31T00:00:00.000Z',
  });

  await h.service.generateOrRecalculateMarketSnapshot({
    principal: h.adminPrincipal,
    idempotencyKey: 'idem_cmp_shiraz',
    geographyLookup: { geographicEntityId: 'shiraz_district_1' },
    segmentId: 'seg_res_apt_sale_all',
    reportingPeriodKey: '2026-Q1',
    observationWindowStartIso: '2026-01-01T00:00:00.000Z',
    observationWindowEndIso: '2026-03-31T00:00:00.000Z',
  });

  const cmp = await h.service.compareGeographicMarkets({
    targets: [
      {
        geographyLookup: { geographicEntityId: 'tehran_district_5' },
        segmentId: 'seg_res_apt_sale_all',
        reportingPeriodKey: '2026-Q1',
      },
      {
        geographyLookup: { geographicEntityId: 'shiraz_district_1' },
        segmentId: 'seg_res_apt_sale_all',
        reportingPeriodKey: '2026-Q1',
      },
    ],
  });
  assert.equal(cmp.segmentsCompatible, true);
  assert.equal(cmp.reportingPeriodsAligned, true);

  const prov = await h.service.retrieveDataQualityAndProvenanceMetadata({
    snapshotId: s1.snapshot.snapshotId,
  });
  assert.equal(prov.snapshotId, s1.snapshot.snapshotId);
  assert.equal(prov.boundaryVersion, 'GEO-2026.1');

  const segPage1 = await h.service.retrieveMarketSegmentDefinitions({ limit: 2 });
  assert.equal(segPage1.items.length, 2);
  assert.equal(segPage1.hasMore, true);
  assert.ok(segPage1.nextCursor);

  const segPage2 = await h.service.retrieveMarketSegmentDefinitions({
    limit: 2,
    cursor: segPage1.nextCursor!,
  });
  assert.equal(segPage2.items.length, 1);
  assert.equal(MARKET_INTELLIGENCE_ROUTE_REGISTRATION_SPEC.length, 22);
});
