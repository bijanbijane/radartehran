import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CoreApiError,
  type AuthenticatedPrincipal,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../../core';
import {
  createInvestmentIntelligenceService,
  INVESTMENT_INTELLIGENCE_ROUTE_REGISTRATION_SPEC,
  type AggregatedRentalOccupancySummary,
  type AuthoritativePropertyTransactionSnapshot,
  type AuthoritativePropertyValuationSnapshot,
  type CanonicalPropertySnapshot,
  type MarketBenchmarkSnapshot,
  type VerifiedInflationIndexRecord,
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

  const properties = new Map<string, CanonicalPropertySnapshot>([
    [
      'prop_res_tehran_1',
      {
        canonicalPropertyId: 'prop_res_tehran_1',
        cityId: 'tehran',
        districtId: 'd5',
        neighborhoodId: 'punak',
        propertyCategory: 'RESIDENTIAL',
        isResidential: true,
        usableAreaSqm: 100,
        buildingAgeYears: 4,
        status: 'ACTIVE',
      },
    ],
    [
      'prop_com_tehran_2',
      {
        canonicalPropertyId: 'prop_com_tehran_2',
        cityId: 'tehran',
        districtId: 'd2',
        neighborhoodId: 'saadat_abad',
        propertyCategory: 'COMMERCIAL',
        isResidential: false,
        usableAreaSqm: 150,
        buildingAgeYears: 25,
        status: 'ACTIVE',
      },
    ],
    [
      'prop_res_shiraz_3',
      {
        canonicalPropertyId: 'prop_res_shiraz_3',
        cityId: 'shiraz',
        districtId: 's_d1',
        propertyCategory: 'RESIDENTIAL',
        isResidential: true,
        usableAreaSqm: 120,
        buildingAgeYears: 8,
        status: 'ACTIVE',
      },
    ],
  ]);

  const valuations = new Map<string, AuthoritativePropertyValuationSnapshot>([
    [
      'prop_res_tehran_1',
      {
        valuationId: 'val_prop_1',
        canonicalPropertyId: 'prop_res_tehran_1',
        estimatedMarketValue: 12_000_000_000,
        currency: 'TOMAN',
        valuationDateIso: '2026-03-25T00:00:00.000Z',
        methodologyVersion: 'HEDONIC-2026.1',
        confidenceGrade: 'HIGH',
        isStale: false,
        limitations: ['Estimated market value; not a completed transaction price.'],
      },
    ],
    [
      'prop_com_tehran_2',
      {
        valuationId: 'val_prop_2_stale',
        canonicalPropertyId: 'prop_com_tehran_2',
        estimatedMarketValue: 30_000_000_000,
        currency: 'TOMAN',
        valuationDateIso: '2024-01-01T00:00:00.000Z',
        methodologyVersion: 'HEDONIC-2024.1',
        confidenceGrade: 'LOW',
        isStale: true, // Stale valuation must not be treated as current!
        limitations: ['Valuation is older than 180 days and marked stale.'],
      },
    ],
  ]);

  const pmSummaries = new Map<string, AggregatedRentalOccupancySummary>([
    [
      'prop_res_tehran_1',
      {
        canonicalPropertyId: 'prop_res_tehran_1',
        reportingPeriodStartIso: '2025-04-01T00:00:00.000Z',
        reportingPeriodEndIso: '2026-03-31T00:00:00.000Z',
        activeAgreementRefId: 'agr_101',
        agreementCommencementIso: '2025-04-01T00:00:00.000Z',
        agreementExpiryIso: '2026-03-31T00:00:00.000Z',
        currency: 'TOMAN',
        contractualMonthlyRent: 80_000_000,
        contractualSecurityDeposit: 1_000_000_000,
        scheduledRentObligationTotal: 960_000_000,
        tenantSelfReportedPaymentTotal: 80_000_000, // 1 month reported but unverified
        authoritativelyConfirmedCollectedRentTotal: 800_000_000, // 10 months confirmed collected
        occupiedDaysInPeriod: 335,
        vacantDaysInPeriod: 30,
        totalDaysInPeriod: 365,
        renewalEventsCount: 1,
        documentedManagementExpensesTotal: 40_000_000,
        documentedMaintenanceExpensesTotal: 20_000_000,
        activeLeaseCount: 1,
        singleLeaseConcentrationRatio: 1.0,
      },
    ],
  ]);

  const transactions = new Map<string, AuthoritativePropertyTransactionSnapshot>([
    [
      'tx_acq_confirmed_1',
      {
        transactionId: 'tx_acq_confirmed_1',
        canonicalPropertyId: 'prop_res_tehran_1',
        workflowType: 'ACQUISITION',
        workflowStage: 'COMPLETED_TRANSACTION',
        paymentSettlementStage: 'AUTHORITATIVELY_SETTLED',
        agreedPriceTotal: 9_800_000_000,
        confirmedSettledPriceTotal: 9_800_000_000,
        documentedBrokerageAndLegalCostsTotal: 100_000_000,
        currency: 'TOMAN',
        offerAcceptedAtIso: '2025-01-10T00:00:00.000Z',
        completedAtIso: '2025-01-25T00:00:00.000Z',
      },
    ],
    [
      'tx_acq_offer_only_2',
      {
        transactionId: 'tx_acq_offer_only_2',
        canonicalPropertyId: 'prop_com_tehran_2',
        workflowType: 'ACQUISITION',
        workflowStage: 'ACCEPTED_OFFER_PENDING_COMPLETION',
        paymentSettlementStage: 'UNSETTLED',
        agreedPriceTotal: 25_000_000_000,
        confirmedSettledPriceTotal: null,
        documentedBrokerageAndLegalCostsTotal: null,
        currency: 'TOMAN',
        offerAcceptedAtIso: '2025-06-01T00:00:00.000Z',
        completedAtIso: null,
      },
    ],
    [
      'tx_disp_confirmed_1',
      {
        transactionId: 'tx_disp_confirmed_1',
        canonicalPropertyId: 'prop_res_tehran_1',
        workflowType: 'DISPOSAL',
        workflowStage: 'COMPLETED_TRANSACTION',
        paymentSettlementStage: 'AUTHORITATIVELY_SETTLED',
        agreedPriceTotal: 12_500_000_000,
        confirmedSettledPriceTotal: 12_500_000_000,
        documentedBrokerageAndLegalCostsTotal: 50_000_000,
        currency: 'TOMAN',
        offerAcceptedAtIso: '2026-03-10T00:00:00.000Z',
        completedAtIso: '2026-03-28T00:00:00.000Z',
      },
    ],
  ]);

  const benchmarks = new Map<string, MarketBenchmarkSnapshot>([
    [
      'tehran__RESIDENTIAL__2026-Q1',
      {
        benchmarkId: 'bmk_teh_res_2026q1',
        geographicEntityId: 'tehran',
        propertyCategory: 'RESIDENTIAL',
        reportingPeriodKey: '2026-Q1',
        currency: 'TOMAN',
        medianGrossRentalYieldPct: 6.5,
        salePricePeriodChangePct: 18.2,
        rentalRatePeriodChangePct: 22.0,
        medianVacancyRatePct: 5.5,
        medianMonthsOfSupply: 4.2,
        sampleSize: 420,
        methodologyVersion: '1.2.0',
        sourceCoverageNote: 'Tehran Residential Apartment Benchmark Q1 2026',
      },
    ],
  ]);

  const inflationRecords = new Map<string, VerifiedInflationIndexRecord>([
    [
      '2025-Q1__TOMAN',
      {
        periodKey: '2025-Q1',
        currency: 'TOMAN',
        cpiIndexBase100: 100,
        sourceAuthority: 'CENTRAL_BANK_OFFICIAL_SERIES',
      },
    ],
    [
      '2026-Q1__TOMAN',
      {
        periodKey: '2026-Q1',
        currency: 'TOMAN',
        cpiIndexBase100: 130,
        sourceAuthority: 'CENTRAL_BANK_OFFICIAL_SERIES',
      },
    ],
  ]);

  const service = createInvestmentIntelligenceService({
    txRunner,
    primaryAdminEmails: ['admin@radartehran.ir'],
    nowFn: () => currentEpochMs,
    propertyRegistry: {
      async getCanonicalPropertyById(id) {
        return properties.get(id) ?? null;
      },
    },
    valuation: {
      async getLatestValuationForProperty(q) {
        return valuations.get(q.canonicalPropertyId) ?? null;
      },
    },
    propertyManagement: {
      async getAggregatedRentalAndOccupancySummary(q) {
        return pmSummaries.get(q.canonicalPropertyId) ?? null;
      },
    },
    transactions: {
      async getPropertyTransactionById(id) {
        return transactions.get(id) ?? null;
      },
    },
    marketBenchmarks: {
      async getMarketBenchmark(q) {
        return (
          benchmarks.get(`${q.geographicEntityId}__${q.propertyCategory}__${q.reportingPeriodKey}`) ??
          null
        );
      },
    },
    currencyAndInflation: {
      async getVerifiedExchangeRate() {
        return null;
      },
      async getInflationIndex(q) {
        return inflationRecords.get(`${q.periodKey}__${q.currency}`) ?? null;
      },
    },
  });

  const ownerPrincipal = makePrincipal('owner_1', 'owner1@example.com');
  const managerPrincipal = makePrincipal('mgr_1', 'mgr1@example.com');
  const outsiderPrincipal = makePrincipal('outsider_1', 'outsider@example.com');

  return {
    service,
    store,
    properties,
    valuations,
    pmSummaries,
    transactions,
    ownerPrincipal,
    managerPrincipal,
    outsiderPrincipal,
  };
}

test('1. Enforces portfolio ownership & manager boundaries, preserves membership history, and distinguishes confirmed transactions vs accepted offers vs user estimates', async () => {
  const h = createTestHarness();

  const portfolio = await h.service.createInvestmentPortfolio({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_port_1',
    name: 'Tehran & Shiraz Core Income Portfolio',
    portfolioType: 'MIXED_ASSET_PROPERTY_PORTFOLIO',
    authorizedManagerUids: ['mgr_1'],
    baseReportingCurrency: 'TOMAN',
  });

  // Outsider cannot view or mutate portfolio
  await assert.rejects(
    async () =>
      h.service.retrieveInvestmentPortfolio({
        principal: h.outsiderPrincipal,
        portfolioId: portfolio.portfolioId,
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN',
  );

  // Authorized manager can view and add assets
  const asset1 = await h.service.addInvestmentAssetReference({
    principal: h.managerPrincipal,
    idempotencyKey: 'idem_asset_1',
    portfolioId: portfolio.portfolioId,
    canonicalPropertyId: 'prop_res_tehran_1',
    investmentClassification: 'CORE_RENTAL',
    entryDateIso: '2025-01-25T00:00:00.000Z',
    acquisitionTransactionRefId: 'tx_acq_confirmed_1',
    initialRenovationCostEstimate: 100_000_000, // 9.8B price + 100M tx cost + 100M reno = 10.0B basis
  });

  assert.equal(
    asset1.acquisitionPriceClassification,
    'AUTHORITATIVELY_CONFIRMED_TRANSACTION',
  );
  assert.equal(asset1.acquisitionPrice, 9_800_000_000);
  assert.equal(asset1.initialTransactionCostEstimate, 100_000_000);
  assert.equal(asset1.provenance.classification, 'CONFIRMED');

  // Accepted offer pending completion is NOT classified as confirmed transaction
  const asset2 = await h.service.addInvestmentAssetReference({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_asset_2',
    portfolioId: portfolio.portfolioId,
    canonicalPropertyId: 'prop_com_tehran_2',
    investmentClassification: 'VALUE_ADD',
    entryDateIso: '2025-06-01T00:00:00.000Z',
    acquisitionTransactionRefId: 'tx_acq_offer_only_2',
  });

  assert.equal(
    asset2.acquisitionPriceClassification,
    'ACCEPTED_OFFER_NOT_YET_COMPLETED',
  );
  assert.equal(asset2.provenance.classification, 'REPORTED');

  // Remove asset2 and verify membership history is preserved
  const updatedPort = await h.service.removeInvestmentAssetReference({
    principal: h.ownerPrincipal,
    portfolioId: portfolio.portfolioId,
    investmentAssetId: asset2.investmentAssetId,
    reason: 'Offer did not close',
  });

  assert.equal(updatedPort.activeAssetIds.length, 1);
  assert.equal(updatedPort.membershipHistory.length, 3); // 2 ADDED + 1 REMOVED
  assert.equal(updatedPort.membershipHistory[2]!.action, 'REMOVED');
});

test('2. Calculates Gross and Net Rental Yield on both Acquisition Cost and Current Valuation bases, handling vacancy, partial periods, and stale valuations', async () => {
  const h = createTestHarness();

  const portfolio = await h.service.createInvestmentPortfolio({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_port_yield',
    name: 'Yield Test Portfolio',
    portfolioType: 'RENTAL_PROPERTY_PORTFOLIO',
    baseReportingCurrency: 'TOMAN',
  });

  const asset1 = await h.service.addInvestmentAssetReference({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_asset_yield_1',
    portfolioId: portfolio.portfolioId,
    canonicalPropertyId: 'prop_res_tehran_1',
    investmentClassification: 'CORE_RENTAL',
    entryDateIso: '2025-01-25T00:00:00.000Z',
    acquisitionTransactionRefId: 'tx_acq_confirmed_1',
    initialRenovationCostEstimate: 100_000_000, // Total acquisition basis = 10,000,000,000
  });

  // Record owner-paid property insurance (40M) + major CapEx (200M — must be excluded from operating yield)
  await h.service.recordFinancialEntryInformation({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_exp_ins_1',
    portfolioId: portfolio.portfolioId,
    investmentAssetId: asset1.investmentAssetId,
    majorClass: 'OPERATING_EXPENSE',
    subcategory: 'INSURANCE_COSTS',
    recurrence: 'RECURRING',
    periodStartIso: '2025-04-01T00:00:00.000Z',
    periodEndIso: '2026-03-31T00:00:00.000Z',
    amount: 40_000_000,
    currency: 'TOMAN',
    paymentStatus: 'AUTHORITATIVELY_CONFIRMED_CASH_MOVEMENT',
  });

  await h.service.recordFinancialEntryInformation({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_capex_1',
    portfolioId: portfolio.portfolioId,
    investmentAssetId: asset1.investmentAssetId,
    majorClass: 'CAPITAL_EXPENDITURE',
    subcategory: 'STRUCTURAL_IMPROVEMENT',
    recurrence: 'ONE_TIME',
    periodStartIso: '2025-09-01T00:00:00.000Z',
    periodEndIso: '2025-09-30T00:00:00.000Z',
    amount: 200_000_000,
    currency: 'TOMAN',
    paymentStatus: 'AUTHORITATIVELY_CONFIRMED_CASH_MOVEMENT',
  });

  const yieldRes = await h.service.retrieveRentalYieldAnalysis({
    principal: h.ownerPrincipal,
    portfolioId: portfolio.portfolioId,
    investmentAssetId: asset1.investmentAssetId,
    periodStartIso: '2025-04-01T00:00:00.000Z',
    periodEndIso: '2026-03-31T00:00:00.000Z',
    preferredValueBasis: 'ORIGINAL_ACQUISITION_COST_BASIS',
  });

  assert.equal(yieldRes.status, 'CALCULATED');
  assert.equal(yieldRes.vacantDaysInPeriod, 30);
  // Confirmed rent from PM = 800,000,000; OpEx = 40M (PM mgmt) + 20M (PM maint) + 40M (insurance) = 100,000,000; CapEx (200M) excluded!
  assert.equal(yieldRes.annualizedGrossRentalIncome, 800_000_000);
  assert.equal(yieldRes.annualizedOperatingExpenses, 100_000_000);
  assert.equal(yieldRes.annualizedNetOperatingIncome, 700_000_000);
  // On 10B acquisition cost basis: Gross = 8.0%, Net = 7.0%
  assert.equal(yieldRes.grossRentalYieldOnAcquisitionCostPct, 8);
  assert.equal(yieldRes.netRentalYieldOnAcquisitionCostPct, 7);
  // On 12B current valuation basis: Gross = 6.67%, Net = 5.83%
  assert.equal(yieldRes.grossRentalYieldOnCurrentValuationPct, 6.67);
  assert.equal(yieldRes.netRentalYieldOnCurrentValuationPct, 5.83);

  // Asset 2 has a STALE valuation: requesting CURRENT_VALUATION_ESTIMATE_BASIS must refuse to use stale value
  const asset2 = await h.service.addInvestmentAssetReference({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_asset_stale_val',
    portfolioId: portfolio.portfolioId,
    canonicalPropertyId: 'prop_com_tehran_2',
    investmentClassification: 'CORE_RENTAL',
    entryDateIso: '2025-01-01T00:00:00.000Z',
    acquisitionPrice: 20_000_000_000,
  });

  const staleYieldRes = await h.service.retrieveRentalYieldAnalysis({
    principal: h.ownerPrincipal,
    portfolioId: portfolio.portfolioId,
    investmentAssetId: asset2.investmentAssetId,
    periodStartIso: '2025-04-01T00:00:00.000Z',
    periodEndIso: '2026-03-31T00:00:00.000Z',
    preferredValueBasis: 'CURRENT_VALUATION_ESTIMATE_BASIS',
  });

  assert.equal(staleYieldRes.status, 'INSUFFICIENT_INCOME_OR_VALUE_BASIS');
  assert.equal(staleYieldRes.currentEstimatedValue, null);
  assert.equal(staleYieldRes.valuationIsStale, true);
});

test('3. Separates confirmed cash collections vs reported payments vs scheduled obligations, prevents double counting, and calculates unrealized vs realized ROI, CAGR, IRR, and CPI-deflated real returns', async () => {
  const h = createTestHarness();

  const portfolio = await h.service.createInvestmentPortfolio({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_port_roi',
    name: 'ROI & CashFlow Portfolio',
    portfolioType: 'PERSONAL_PROPERTY_PORTFOLIO',
    baseReportingCurrency: 'TOMAN',
  });

  const asset = await h.service.addInvestmentAssetReference({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_asset_roi_1',
    portfolioId: portfolio.portfolioId,
    canonicalPropertyId: 'prop_res_tehran_1',
    investmentClassification: 'CORE_RENTAL',
    entryDateIso: '2025-01-25T00:00:00.000Z',
    acquisitionTransactionRefId: 'tx_acq_confirmed_1',
    initialRenovationCostEstimate: 100_000_000, // Total acquisition basis = 10.0B
  });

  // User manually submits an unverified entry claiming to be AUTHORITATIVELY_CONFIRMED -> downgraded to REPORTED_UNVERIFIED_PAYMENT
  const manualEntry = await h.service.recordFinancialEntryInformation({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_manual_rent_1',
    portfolioId: portfolio.portfolioId,
    investmentAssetId: asset.investmentAssetId,
    majorClass: 'OPERATING_INCOME',
    subcategory: 'EXPLICIT_OTHER_PROPERTY_INCOME',
    recurrence: 'ONE_TIME',
    periodStartIso: '2025-07-01T00:00:00.000Z',
    periodEndIso: '2025-07-31T00:00:00.000Z',
    amount: 50_000_000,
    currency: 'TOMAN',
    paymentStatus: 'AUTHORITATIVELY_CONFIRMED_CASH_MOVEMENT', // Untrusted user input!
  });
  assert.equal(manualEntry.paymentStatus, 'REPORTED_UNVERIFIED_PAYMENT');
  assert.equal(manualEntry.provenance.classification, 'REPORTED');

  const cf = await h.service.retrieveCashFlowAnalysis({
    principal: h.ownerPrincipal,
    portfolioId: portfolio.portfolioId,
    investmentAssetId: asset.investmentAssetId,
    periodStartIso: '2025-04-01T00:00:00.000Z',
    periodEndIso: '2026-03-31T00:00:00.000Z',
  });

  assert.equal(cf.aggregateSummary.confirmedRentalIncome, 800_000_000);
  // 80M from PM self-reported + 50M manual user entry = 130M reported unverified
  assert.equal(cf.aggregateSummary.reportedUnverifiedRentalIncome, 130_000_000);
  assert.equal(cf.aggregateSummary.scheduledUnpaidRentalObligations, 80_000_000);
  assert.equal(cf.reconciliationMetadata.authoritativeBankAccessClaimed, false);

  // Calculate UNREALIZED Return (using 12.0B Valuation estimate)
  const unrealizedRoi = await h.service.calculateInvestmentReturn({
    principal: h.ownerPrincipal,
    portfolioId: portfolio.portfolioId,
    investmentAssetId: asset.investmentAssetId,
    periodStartIso: '2025-04-01T00:00:00.000Z',
    periodEndIso: '2026-03-31T00:00:00.000Z',
    startPeriodKeyForInflation: '2025-Q1',
    endPeriodKeyForInflation: '2026-Q1',
  });

  assert.equal(unrealizedRoi.returnRealizationStatus, 'UNREALIZED_ON_VALUATION_ESTIMATE');
  assert.equal(unrealizedRoi.terminalValueClassification, 'AUTHORITATIVE_VALUATION_ESTIMATE');
  assert.equal(unrealizedRoi.terminalValueUsed, 12_000_000_000);
  // Total return = (12.0B - 10.0B) + 740M NOI = 2.74B -> +27.4% nominal return
  assert.equal(unrealizedRoi.holdingPeriodTotalReturnPct, 27.4);
  assert.ok(unrealizedRoi.annualizedReturnCagrPct !== null);
  assert.equal(unrealizedRoi.irrStatus, 'CALCULATED');
  assert.ok((unrealizedRoi.internalRateOfReturnAnnualPct ?? 0) > 20);
  // Real inflation-adjusted return with CPI 100 -> 130 (+30% inflation): (1.274 / 1.30 - 1) = -2.0%
  assert.equal(unrealizedRoi.inflationAdjustedRealTotalReturnPct, -2);

  // Now record completed disposal transaction (12.5B confirmed sale price) -> switches to REALIZED return
  await h.service.recordInvestmentAcquisitionInformation({
    principal: h.ownerPrincipal,
    portfolioId: portfolio.portfolioId,
    investmentAssetId: asset.investmentAssetId,
    disposalTransactionRefId: 'tx_disp_confirmed_1',
  });

  const realizedRoi = await h.service.calculateInvestmentReturn({
    principal: h.ownerPrincipal,
    portfolioId: portfolio.portfolioId,
    investmentAssetId: asset.investmentAssetId,
    periodStartIso: '2025-04-01T00:00:00.000Z',
    periodEndIso: '2026-03-31T00:00:00.000Z',
  });

  assert.equal(realizedRoi.returnRealizationStatus, 'REALIZED_ON_COMPLETED_DISPOSAL');
  assert.equal(realizedRoi.terminalValueClassification, 'CONFIRMED_DISPOSAL_SALE_PRICE');
  assert.equal(realizedRoi.terminalValueUsed, 12_500_000_000);
  assert.equal(realizedRoi.holdingPeriodTotalReturnPct, 32.4);
});

test('4. Runs hypothetical investment scenarios separated from forecasts, and evaluates portfolio diversification, HHI concentration, missing asset values, risk indicators, and market benchmarks', async () => {
  const h = createTestHarness();

  const portfolio = await h.service.createInvestmentPortfolio({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_port_div',
    name: 'Diversification & Risk Portfolio',
    portfolioType: 'MIXED_ASSET_PROPERTY_PORTFOLIO',
    baseReportingCurrency: 'TOMAN',
  });

  const asset1 = await h.service.addInvestmentAssetReference({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_div_a1',
    portfolioId: portfolio.portfolioId,
    canonicalPropertyId: 'prop_res_tehran_1',
    investmentClassification: 'CORE_RENTAL',
    entryDateIso: '2025-01-25T00:00:00.000Z',
    acquisitionTransactionRefId: 'tx_acq_confirmed_1',
  });

  // Asset 2 has NO acquisition price (missing value must NOT be treated as 0; must be listed in assetsMissingValueIds)
  const asset2MissingVal = await h.service.addInvestmentAssetReference({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_div_a2_missing',
    portfolioId: portfolio.portfolioId,
    canonicalPropertyId: 'prop_com_tehran_2',
    investmentClassification: 'VALUE_ADD',
    entryDateIso: '2025-02-01T00:00:00.000Z',
  });

  // Asset 3 in Shiraz with acquisition price = 9.8B (equal to Asset 1)
  await h.service.addInvestmentAssetReference({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_div_a3_shiraz',
    portfolioId: portfolio.portfolioId,
    canonicalPropertyId: 'prop_res_shiraz_3',
    investmentClassification: 'CORE_RENTAL',
    entryDateIso: '2025-03-01T00:00:00.000Z',
    acquisitionPrice: 9_800_000_000,
  });

  const alloc = await h.service.retrievePortfolioAllocationAndConcentration({
    principal: h.ownerPrincipal,
    portfolioId: portfolio.portfolioId,
    periodStartIso: '2025-04-01T00:00:00.000Z',
    periodEndIso: '2026-03-31T00:00:00.000Z',
    valuationBasis: 'ORIGINAL_ACQUISITION_COST_BASIS',
  });

  assert.equal(alloc.totalAssetsCount, 3);
  assert.equal(alloc.assetsWithValidValueCount, 2);
  assert.deepEqual(alloc.assetsMissingValueIds, [asset2MissingVal.investmentAssetId]);
  // Two equal valued assets (50% each) -> HHI = (0.5^2 + 0.5^2) * 10000 = 5000
  assert.equal(alloc.concentrationMetrics.assetValueHerfindahlHirschmanIndex, 5000);
  assert.equal(alloc.geographicAllocationByCity.tehran?.sharePct, 50);
  assert.equal(alloc.geographicAllocationByCity.shiraz?.sharePct, 50);

  const risk = await h.service.retrieveInvestmentRiskIndicators({
    principal: h.ownerPrincipal,
    portfolioId: portfolio.portfolioId,
    periodStartIso: '2025-04-01T00:00:00.000Z',
    periodEndIso: '2026-03-31T00:00:00.000Z',
  });
  assert.ok(risk.indicators.length >= 5);
  assert.ok(risk.tenantPrivacyAndNonCreditworthinessDisclaimer.includes('never profile individual tenants'));

  // Scenario analysis vs Baseline
  const scn = await h.service.runInvestmentScenario({
    principal: h.ownerPrincipal,
    portfolioId: portfolio.portfolioId,
    investmentAssetId: asset1.investmentAssetId,
    scenarioName: 'Vacancy Spike + Maintenance Surge Stress Scenario',
    periodStartIso: '2025-04-01T00:00:00.000Z',
    periodEndIso: '2026-03-31T00:00:00.000Z',
    assumptions: {
      monthlyRentalIncomeChangePct: -10,
      additionalVacancyDaysPerYear: 45,
      maintenanceCostChangePct: 30,
      hypotheticalPropertyValueChangePct: -5,
      majorRenovationCapexAmount: 300_000_000,
      hypotheticalHoldingPeriodYears: 3,
      hypotheticalFutureSalePrice: null,
      financingCostDeltaPct: 0,
    },
  });

  assert.equal(
    scn.outputClassification,
    'HYPOTHETICAL_INVESTMENT_SCENARIO_NOT_A_FORECAST',
  );
  assert.ok(scn.projectedScenarioSummary.noiDeltaFromBaseline < 0);

  // Benchmark comparison
  const bmkCmp = await h.service.comparePortfolioWithMarketBenchmarks({
    principal: h.ownerPrincipal,
    portfolioId: portfolio.portfolioId,
    geographicEntityId: 'tehran',
    propertyCategory: 'RESIDENTIAL',
    reportingPeriodKey: '2026-Q1',
    periodStartIso: '2025-04-01T00:00:00.000Z',
    periodEndIso: '2026-03-31T00:00:00.000Z',
  });
  assert.equal(bmkCmp.compatible, true);
  assert.equal(bmkCmp.status, 'COMPATIBLE_COMPARISON');
});

test('5. Enforces idempotent performance snapshots, prevents partial snapshot publication on failure, retries transient contention, and supports cursor pagination', async () => {
  const h = createTestHarness({ abortFirstAttempts: 1 });

  const portfolio = await h.service.createInvestmentPortfolio({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_port_snap',
    name: 'Snapshot & Pagination Portfolio',
    portfolioType: 'RENTAL_PROPERTY_PORTFOLIO',
    baseReportingCurrency: 'TOMAN',
  });

  const a1 = await h.service.addInvestmentAssetReference({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_snap_a1',
    portfolioId: portfolio.portfolioId,
    canonicalPropertyId: 'prop_res_tehran_1',
    investmentClassification: 'CORE_RENTAL',
    entryDateIso: '2025-01-25T00:00:00.000Z',
    acquisitionTransactionRefId: 'tx_acq_confirmed_1',
  });

  await h.service.addInvestmentAssetReference({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_snap_a2',
    portfolioId: portfolio.portfolioId,
    canonicalPropertyId: 'prop_res_shiraz_3',
    investmentClassification: 'CORE_RENTAL',
    entryDateIso: '2025-02-01T00:00:00.000Z',
    acquisitionPrice: 8_000_000_000,
  });

  // Simulated mid-calculation failure must not persist partial snapshot
  await assert.rejects(
    async () =>
      h.service.generateAndRetrievePerformanceSnapshot({
        principal: h.ownerPrincipal,
        idempotencyKey: 'idem_snap_fail',
        portfolioId: portfolio.portfolioId,
        investmentAssetId: a1.investmentAssetId,
        reportingPeriodKey: '2025-ANNUAL',
        periodType: 'ANNUAL',
        observationWindowStartIso: '2025-04-01T00:00:00.000Z',
        observationWindowEndIso: '2026-03-31T00:00:00.000Z',
        simulateCalculationFailureForTesting: true,
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'INTERNAL_ERROR',
  );

  // Valid snapshot creation + idempotency deduplication
  const snap1 = await h.service.generateAndRetrievePerformanceSnapshot({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_snap_ok_1',
    portfolioId: portfolio.portfolioId,
    investmentAssetId: a1.investmentAssetId,
    reportingPeriodKey: '2025-ANNUAL',
    periodType: 'ANNUAL',
    observationWindowStartIso: '2025-04-01T00:00:00.000Z',
    observationWindowEndIso: '2026-03-31T00:00:00.000Z',
  });

  const snap2 = await h.service.generateAndRetrievePerformanceSnapshot({
    principal: h.ownerPrincipal,
    idempotencyKey: 'idem_snap_ok_2',
    portfolioId: portfolio.portfolioId,
    investmentAssetId: a1.investmentAssetId,
    reportingPeriodKey: '2025-ANNUAL',
    periodType: 'ANNUAL',
    observationWindowStartIso: '2025-04-01T00:00:00.000Z',
    observationWindowEndIso: '2026-03-31T00:00:00.000Z',
  });

  assert.equal(snap2.reusedExistingSnapshot, true);
  assert.equal(snap1.snapshot.snapshotId, snap2.snapshot.snapshotId);

  // Cursor pagination over portfolio assets
  const page1 = await h.service.retrievePortfolioAssets({
    principal: h.ownerPrincipal,
    portfolioId: portfolio.portfolioId,
    limit: 1,
  });
  assert.equal(page1.items.length, 1);
  assert.equal(page1.hasMore, true);
  assert.ok(page1.nextCursor);

  const page2 = await h.service.retrievePortfolioAssets({
    principal: h.ownerPrincipal,
    portfolioId: portfolio.portfolioId,
    limit: 1,
    cursor: page1.nextCursor!,
  });
  assert.equal(page2.items.length, 1);
  assert.notEqual(page1.items[0]!.investmentAssetId, page2.items[0]!.investmentAssetId);
  assert.equal(INVESTMENT_INTELLIGENCE_ROUTE_REGISTRATION_SPEC.length, 19);
});
