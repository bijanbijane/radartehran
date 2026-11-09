import crypto from 'crypto';
import {
  authorizePrincipal,
  CoreApiError,
  computeRequestPayloadHash,
  createFirestoreIdempotencyStoreAdapter,
  decodePaginationCursor,
  encodePaginationCursor,
  executeIdempotentMutation,
  normalizeFirestoreTimestamp,
  normalizePaginationParams,
  requireSafeFirestoreId,
  runDurableTransaction,
  sanitizeTextInput,
  type AuthenticatedPrincipal,
  type NormalizedTimestamp,
  type PaginationParams,
  type TransactionContextLike,
} from '../../core';
import type {
  CanonicalPropertyCategory,
  FinancialInputProvenance,
  InvestmentDataClassification,
  InvestmentIntelligenceModuleDependencies,
  SupportedCurrencyCode,
} from '../contracts/externalAdapters';
import type {
  AcquisitionPriceClassification,
  CashFlowAnalysisResult,
  DatedCashFlowPoint,
  ExpenseRecurrenceType,
  FinancialEntryMajorClass,
  FinancialSubcategory,
  InvestmentAssetRecord,
  InvestmentCalculationJobRecord,
  InvestmentFinancialEntryRecord,
  InvestmentPerformanceSnapshotRecord,
  InvestmentPortfolioRecord,
  InvestmentPortfolioType,
  InvestmentRiskAnalysisResult,
  InvestmentScenarioRecord,
  PortfolioAllocationAndConcentrationResult,
  PropertyValueBasisType,
  RentalYieldAnalysisResult,
  ReturnOnInvestmentAnalysisResult,
} from '../domain/types';
import {
  CANONICAL_INVESTMENT_METHODOLOGIES,
  CURRENT_INVESTMENT_METHODOLOGY_VERSION,
} from '../methodologies/methodologyRegistry';
import {
  calculatePropertyCashFlowAnalysis,
  calculateRentalYieldAnalysis,
  calculateReturnOnInvestmentAnalysis,
  evaluateHypotheticalInvestmentScenario,
} from '../returns/yieldsCashflowsAndReturnsEngine';
import {
  comparePortfolioAgainstMarketBenchmark,
  evaluatePortfolioDiversificationAndConcentration,
  evaluatePortfolioRiskIndicators,
  type AssetAnalyticalSummaryForPortfolio,
} from '../diversification/portfolioAnalyticsAndRiskEngine';

function requireValidId(raw: unknown, fieldName: string): string {
  const res = requireSafeFirestoreId()(raw, fieldName);
  if (!res.ok || !res.value) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Invalid Firestore ID for "${fieldName}".`,
      res.issues,
    );
  }
  return res.value;
}

async function appendToIndex(
  tx: TransactionContextLike,
  indexPath: string,
  id: string,
): Promise<void> {
  const snap = await tx.get<{ ids?: string[] }>(indexPath);
  const existing = snap.exists && Array.isArray(snap.data?.ids) ? snap.data!.ids : [];
  if (!existing.includes(id)) {
    tx.set(indexPath, { ids: [id, ...existing] });
  }
}

async function loadIndexedDocs<T>(
  tx: TransactionContextLike,
  indexPath: string,
  collectionPrefix: string,
): Promise<T[]> {
  const snap = await tx.get<{ ids?: string[] }>(indexPath);
  const ids = snap.exists && Array.isArray(snap.data?.ids) ? snap.data!.ids : [];
  const out: T[] = [];
  for (const id of ids) {
    const docSnap = await tx.get<T>(`${collectionPrefix}/${id}`);
    if (docSnap.exists && docSnap.data) out.push(docSnap.data);
  }
  return out;
}

function paginateItems<T extends { id: string; sortEpochMs: number }>(
  items: T[],
  pagination: PaginationParams,
): { items: T[]; hasMore: boolean; nextCursor: string | null; totalCount: number } {
  const sorted = [...items].sort((a, b) => {
    const diff =
      pagination.direction === 'asc'
        ? a.sortEpochMs - b.sortEpochMs
        : b.sortEpochMs - a.sortEpochMs;
    if (diff !== 0) return diff;
    return pagination.direction === 'asc'
      ? a.id.localeCompare(b.id)
      : b.id.localeCompare(a.id);
  });

  let filtered = sorted;
  if (pagination.cursor) {
    const decoded = decodePaginationCursor(pagination.cursor);
    if (!decoded) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid pagination cursor token.');
    }
    const cursorEpoch = Number(decoded.sortValue);
    filtered = sorted.filter((item) =>
      pagination.direction === 'asc'
        ? item.sortEpochMs > cursorEpoch ||
          (item.sortEpochMs === cursorEpoch && item.id > decoded.docId)
        : item.sortEpochMs < cursorEpoch ||
          (item.sortEpochMs === cursorEpoch && item.id < decoded.docId),
    );
  }

  const slice = filtered.slice(0, pagination.limit);
  const hasMore = filtered.length > pagination.limit;
  const lastItem = slice[slice.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodePaginationCursor({
          sortValue: lastItem.sortEpochMs,
          docId: lastItem.id,
          direction: pagination.direction,
        })
      : null;

  return { items: slice, hasMore, nextCursor, totalCount: sorted.length };
}

export function createInvestmentIntelligenceService(deps: InvestmentIntelligenceModuleDependencies) {
  const nowEpochMs = () => (deps.nowFn ? deps.nowFn() : Date.now());
  const nowTs = (): NormalizedTimestamp => normalizeFirestoreTimestamp(nowEpochMs())!;

  const retrySafeTxRunner = {
    runTransaction: <T>(workFn: (tx: TransactionContextLike) => Promise<T>) =>
      runDurableTransaction(
        deps.txRunner,
        {
          operationName: 'investment_intelligence_idempotency_tx',
          maxAttempts: 4,
          baseBackoffMs: 5,
        },
        workFn,
      ),
  };

  const idempotencyStore =
    deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(retrySafeTxRunner);

  async function requireVerifiedPrincipal(
    principal: AuthenticatedPrincipal | null | undefined,
  ): Promise<AuthenticatedPrincipal> {
    const decision = await authorizePrincipal(
      principal,
      { minimumRole: 'verified_user' },
      deps.adminStore,
      deps.primaryAdminEmails,
    );
    if (!decision.allowed || !principal) {
      throw new CoreApiError(
        decision.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
        decision.status === 401 ? 401 : 403,
        decision.reason ?? 'Authenticated verified user required.',
      );
    }
    return principal;
  }

  async function assertPortfolioAccess(
    portfolio: InvestmentPortfolioRecord,
    principal: AuthenticatedPrincipal | null | undefined,
    requireOwnerOnly = false,
  ): Promise<AuthenticatedPrincipal> {
    const actor = await requireVerifiedPrincipal(principal);
    const isPrimaryAdmin =
      actor.emailVerified &&
      actor.email &&
      (deps.primaryAdminEmails ?? ['admin@radartehran.ir'])
        .map((e) => e.toLowerCase())
        .includes(actor.email.toLowerCase());

    if (isPrimaryAdmin) return actor;
    if (portfolio.ownerUid === actor.uid) return actor;
    if (!requireOwnerOnly && portfolio.authorizedManagerUids.includes(actor.uid)) {
      return actor;
    }

    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Actor is not authorized to access or mutate this investment portfolio.',
    );
  }

  /**
   * 1. Create investment portfolio
   */
  async function createInvestmentPortfolio(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    idempotencyKey: string;
    name: string;
    portfolioType: InvestmentPortfolioType;
    authorizedManagerUids?: string[];
    description?: string;
    baseReportingCurrency: SupportedCurrencyCode;
  }): Promise<InvestmentPortfolioRecord> {
    const actor = await requireVerifiedPrincipal(params.principal);
    const cleanName = sanitizeTextInput(params.name).slice(0, 140);
    if (cleanName.length < 2) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Portfolio name must be at least 2 characters.');
    }

    const outcome = await executeIdempotentMutation<InvestmentPortfolioRecord>({
      store: idempotencyStore,
      idempotencyKey: params.idempotencyKey,
      operation: 'investment-intelligence:portfolio.create',
      actorUid: actor.uid,
      requestPayload: {
        name: cleanName,
        portfolioType: params.portfolioType,
        authorizedManagerUids: params.authorizedManagerUids ?? [],
        baseReportingCurrency: params.baseReportingCurrency,
      },
      nowEpochMs: nowEpochMs(),
      mutationFn: async () => {
        const ts = nowTs();
        const portfolioId = `invport_${crypto.randomBytes(6).toString('hex')}`;
        const record: InvestmentPortfolioRecord = {
          portfolioId,
          name: cleanName,
          portfolioType: params.portfolioType,
          ownerUid: actor.uid,
          authorizedManagerUids: (params.authorizedManagerUids ?? []).map((u) =>
            requireValidId(u, 'authorizedManagerUid'),
          ),
          description: sanitizeTextInput(params.description ?? '').slice(0, 500),
          baseReportingCurrency: params.baseReportingCurrency,
          portfolioCreationDateIso: ts.iso,
          status: 'ACTIVE',
          activeAssetIds: [],
          membershipHistory: [],
          nonLegalOwnershipDisclaimer:
            'PORTFOLIO_OWNERSHIP_BOUNDARY: Analytical portfolio membership does not establish or imply legal title or property ownership.',
          createdAt: ts,
          updatedAt: ts,
        };

        await runDurableTransaction(
          deps.txRunner,
          { operationName: 'inv.portfolio.create', maxAttempts: 3, baseBackoffMs: 5 },
          async (tx) => {
            tx.set(`inv_portfolios/${portfolioId}`, record as unknown as Record<string, unknown>);
          },
        );

        return { statusCode: 201, body: record };
      },
    });

    return outcome.body;
  }

  /**
   * 2. Retrieve investment portfolio
   */
  async function retrieveInvestmentPortfolio(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
  }): Promise<InvestmentPortfolioRecord> {
    const pId = requireValidId(params.portfolioId, 'portfolioId');
    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'inv.portfolio.get', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<InvestmentPortfolioRecord>(`inv_portfolios/${pId}`);
        if (!snap.exists || !snap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Investment portfolio "${pId}" not found.`);
        }
        await assertPortfolioAccess(snap.data, params.principal);
        return snap.data;
      },
    );
  }

  /**
   * 3. Add investment asset reference to a portfolio
   */
  async function addInvestmentAssetReference(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    idempotencyKey: string;
    portfolioId: string;
    canonicalPropertyId: string;
    investmentClassification: InvestmentAssetRecord['investmentClassification'];
    entryDateIso: string;
    acquisitionDateIso?: string | null;
    acquisitionPrice?: number | null;
    acquisitionCurrency?: SupportedCurrencyCode;
    acquisitionTransactionRefId?: string | null;
    initialTransactionCostEstimate?: number | null;
    initialRenovationCostEstimate?: number | null;
    financingRefId?: string | null;
    financedPrincipalAmount?: number | null;
    annualFinancingCostEstimate?: number | null;
  }): Promise<InvestmentAssetRecord> {
    const portfolioId = requireValidId(params.portfolioId, 'portfolioId');
    const canonicalPropertyId = requireValidId(params.canonicalPropertyId, 'canonicalPropertyId');
    const portfolio = await retrieveInvestmentPortfolio({
      principal: params.principal,
      portfolioId,
    });
    const actor = await assertPortfolioAccess(portfolio, params.principal);

    const outcome = await executeIdempotentMutation<InvestmentAssetRecord>({
      store: idempotencyStore,
      idempotencyKey: params.idempotencyKey,
      operation: 'investment-intelligence:asset.add',
      actorUid: actor.uid,
      requestPayload: {
        portfolioId,
        canonicalPropertyId,
        investmentClassification: params.investmentClassification,
        entryDateIso: params.entryDateIso,
        acquisitionPrice: params.acquisitionPrice ?? null,
        acquisitionTransactionRefId: params.acquisitionTransactionRefId ?? null,
      },
      nowEpochMs: nowEpochMs(),
      mutationFn: async () => {
        const propSnap = await deps.propertyRegistry.getCanonicalPropertyById(canonicalPropertyId);
        if (!propSnap) {
          throw new CoreApiError(
            'NOT_FOUND',
            404,
            `Canonical property "${canonicalPropertyId}" not found in Property Registry.`,
          );
        }

        let acquisitionPrice = params.acquisitionPrice ?? null;
        let acquisitionCurrency = params.acquisitionCurrency ?? portfolio.baseReportingCurrency;
        let acquisitionDateIso = params.acquisitionDateIso ?? null;
        let acquisitionPriceClassification: AcquisitionPriceClassification =
          acquisitionPrice !== null && acquisitionPrice > 0
            ? 'USER_ESTIMATED_ACQUISITION_PRICE'
            : 'UNAVAILABLE_ACQUISITION_PRICE';
        let txCostEstimate = params.initialTransactionCostEstimate ?? null;
        let provenanceSource: FinancialInputProvenance['sourceModule'] =
          'INVESTMENT_INTELLIGENCE_USER_INPUT';
        let verificationState: FinancialInputProvenance['verificationState'] =
          'USER_DECLARED_UNVERIFIED';
        let dataClassification: InvestmentDataClassification =
          acquisitionPrice !== null ? 'ESTIMATED' : 'UNAVAILABLE';

        if (params.acquisitionTransactionRefId && deps.transactions) {
          const txSnap = await deps.transactions.getPropertyTransactionById(
            params.acquisitionTransactionRefId,
          );
          if (txSnap && txSnap.canonicalPropertyId === canonicalPropertyId) {
            acquisitionCurrency = txSnap.currency;
            provenanceSource = 'PROPERTY_TRANSACTIONS';
            if (
              txSnap.workflowStage === 'COMPLETED_TRANSACTION' &&
              txSnap.paymentSettlementStage === 'AUTHORITATIVELY_SETTLED' &&
              txSnap.confirmedSettledPriceTotal !== null
            ) {
              acquisitionPrice = txSnap.confirmedSettledPriceTotal;
              acquisitionDateIso = txSnap.completedAtIso ?? acquisitionDateIso;
              acquisitionPriceClassification = 'AUTHORITATIVELY_CONFIRMED_TRANSACTION';
              verificationState = 'AUTHORITATIVELY_VERIFIED';
              dataClassification = 'CONFIRMED';
            } else {
              acquisitionPrice = txSnap.agreedPriceTotal;
              acquisitionDateIso = txSnap.offerAcceptedAtIso;
              acquisitionPriceClassification = 'ACCEPTED_OFFER_NOT_YET_COMPLETED';
              verificationState = 'UNVERIFIED';
              dataClassification = 'REPORTED';
            }
            if (txSnap.documentedBrokerageAndLegalCostsTotal !== null && txCostEstimate === null) {
              txCostEstimate = txSnap.documentedBrokerageAndLegalCostsTotal;
            }
          }
        }

        const ts = nowTs();
        const investmentAssetId = `invasset_${crypto.randomBytes(6).toString('hex')}`;
        const isPrePlatform =
          acquisitionDateIso !== null && Date.parse(acquisitionDateIso) < Date.parse('2024-01-01T00:00:00.000Z');

        const assetRecord: InvestmentAssetRecord = {
          investmentAssetId,
          portfolioId,
          canonicalPropertyId,
          propertyCategory: propSnap.propertyCategory,
          cityId: propSnap.cityId,
          ...(propSnap.districtId ? { districtId: propSnap.districtId } : {}),
          ...(propSnap.neighborhoodId ? { neighborhoodId: propSnap.neighborhoodId } : {}),
          usableAreaSqm: propSnap.usableAreaSqm,
          buildingAgeYears: propSnap.buildingAgeYears,
          investmentClassification: params.investmentClassification,
          acquisitionTransactionRefId: params.acquisitionTransactionRefId ?? null,
          disposalTransactionRefId: null,
          acquisitionDateIso,
          acquisitionPrice,
          acquisitionCurrency,
          acquisitionPriceClassification,
          initialTransactionCostEstimate: txCostEstimate,
          initialRenovationCostEstimate: params.initialRenovationCostEstimate ?? null,
          financingRefId: params.financingRefId ?? null,
          financedPrincipalAmount: params.financedPrincipalAmount ?? null,
          annualFinancingCostEstimate: params.annualFinancingCostEstimate ?? null,
          disposalDateIso: null,
          disposalPrice: null,
          disposalPriceClassification: 'NOT_DISPOSED',
          holdingStatus: isPrePlatform ? 'PRE_PLATFORM_HISTORICAL_HOLDING' : 'ACTIVE_HOLDING',
          entryDateIso: params.entryDateIso,
          exitDateIso: null,
          provenance: {
            sourceModule: provenanceSource,
            sourceRecordRefId: params.acquisitionTransactionRefId ?? null,
            originalAmount: acquisitionPrice,
            originalCurrency: acquisitionCurrency,
            observationDateIso: acquisitionDateIso ?? params.entryDateIso,
            recordedAtIso: ts.iso,
            classification: dataClassification,
            verificationState,
            calculationInclusionStatus: 'INCLUDED',
            knownLimitations:
              acquisitionPriceClassification === 'ACCEPTED_OFFER_NOT_YET_COMPLETED'
                ? ['Accepted purchase offer is not yet a completed and settled transaction.']
                : acquisitionPriceClassification === 'USER_ESTIMATED_ACQUISITION_PRICE'
                  ? ['User-entered acquisition price is not independently verified.']
                  : [],
          },
          nonLegalOwnershipDisclaimer:
            'ASSET_RECORD_BOUNDARY: Investment asset record links to canonical property reference for analytical evaluation only and never establishes legal title.',
          createdAt: ts,
          updatedAt: ts,
        };

        await runDurableTransaction(
          deps.txRunner,
          { operationName: 'inv.asset.add', maxAttempts: 4, baseBackoffMs: 5 },
          async (tx) => {
            const pSnap = await tx.get<InvestmentPortfolioRecord>(`inv_portfolios/${portfolioId}`);
            if (!pSnap.exists || !pSnap.data) {
              throw new CoreApiError('NOT_FOUND', 404, `Portfolio "${portfolioId}" not found.`);
            }
            const updatedPortfolio: InvestmentPortfolioRecord = {
              ...pSnap.data,
              activeAssetIds: [...pSnap.data.activeAssetIds, investmentAssetId],
              membershipHistory: [
                ...pSnap.data.membershipHistory,
                {
                  eventId: `mem_${crypto.randomBytes(4).toString('hex')}`,
                  investmentAssetId,
                  canonicalPropertyId,
                  action: 'ADDED',
                  actorUid: actor.uid,
                  occurredAt: ts,
                },
              ],
              updatedAt: ts,
            };

            tx.set(
              `inv_portfolios/${portfolioId}`,
              updatedPortfolio as unknown as Record<string, unknown>,
            );
            tx.set(
              `inv_assets/${investmentAssetId}`,
              assetRecord as unknown as Record<string, unknown>,
            );
            await appendToIndex(tx, `inv_portfolio_assets_index/${portfolioId}`, investmentAssetId);
          },
        );

        return { statusCode: 201, body: assetRecord };
      },
    });

    return outcome.body;
  }

  /**
   * 4. Remove investment asset reference from a portfolio (preserves membership history)
   */
  async function removeInvestmentAssetReference(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
    investmentAssetId: string;
    reason?: string;
  }): Promise<InvestmentPortfolioRecord> {
    const portfolioId = requireValidId(params.portfolioId, 'portfolioId');
    const investmentAssetId = requireValidId(params.investmentAssetId, 'investmentAssetId');

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'inv.asset.remove', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const pSnap = await tx.get<InvestmentPortfolioRecord>(`inv_portfolios/${portfolioId}`);
        if (!pSnap.exists || !pSnap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Portfolio "${portfolioId}" not found.`);
        }
        const actor = await assertPortfolioAccess(pSnap.data, params.principal);

        const aSnap = await tx.get<InvestmentAssetRecord>(`inv_assets/${investmentAssetId}`);
        if (!aSnap.exists || !aSnap.data || aSnap.data.portfolioId !== portfolioId) {
          throw new CoreApiError(
            'NOT_FOUND',
            404,
            `Investment asset "${investmentAssetId}" not found in portfolio "${portfolioId}".`,
          );
        }

        const ts = nowTs();
        const updatedAsset: InvestmentAssetRecord = {
          ...aSnap.data,
          holdingStatus: 'REMOVED_FROM_PORTFOLIO',
          exitDateIso: ts.iso,
          updatedAt: ts,
        };
        const updatedPortfolio: InvestmentPortfolioRecord = {
          ...pSnap.data,
          activeAssetIds: pSnap.data.activeAssetIds.filter((id) => id !== investmentAssetId),
          membershipHistory: [
            ...pSnap.data.membershipHistory,
            {
              eventId: `mem_${crypto.randomBytes(4).toString('hex')}`,
              investmentAssetId,
              canonicalPropertyId: aSnap.data.canonicalPropertyId,
              action: 'REMOVED',
              actorUid: actor.uid,
              occurredAt: ts,
              ...(params.reason ? { reason: sanitizeTextInput(params.reason).slice(0, 200) } : {}),
            },
          ],
          updatedAt: ts,
        };

        tx.set(`inv_assets/${investmentAssetId}`, updatedAsset as unknown as Record<string, unknown>);
        tx.set(
          `inv_portfolios/${portfolioId}`,
          updatedPortfolio as unknown as Record<string, unknown>,
        );
        return updatedPortfolio;
      },
    );
  }

  /**
   * 5. Retrieve portfolio assets (Cursor Paginated)
   */
  async function retrievePortfolioAssets(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
    includeRemoved?: boolean;
    limit?: number;
    cursor?: string;
    direction?: 'asc' | 'desc';
  }) {
    const portfolio = await retrieveInvestmentPortfolio({
      principal: params.principal,
      portfolioId: params.portfolioId,
    });
    const pagination = normalizePaginationParams({
      limit: params.limit,
      cursor: params.cursor,
      direction: params.direction ?? 'asc',
    });

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'inv.assets.list', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const assets = await loadIndexedDocs<InvestmentAssetRecord>(
          tx,
          `inv_portfolio_assets_index/${portfolio.portfolioId}`,
          'inv_assets',
        );
        const filtered = params.includeRemoved
          ? assets
          : assets.filter((a) => a.holdingStatus !== 'REMOVED_FROM_PORTFOLIO');
        const mapped = filtered.map((a) => ({
          ...a,
          id: a.investmentAssetId,
          sortEpochMs: a.createdAt.epochMs,
        }));
        const page = paginateItems(mapped, pagination);
        return {
          items: page.items.map(({ id: _id, sortEpochMs: _s, ...rest }) => rest),
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
          totalCount: page.totalCount,
        };
      },
    );
  }

  /**
   * 6. Record or update investment acquisition or disposal information
   */
  async function recordInvestmentAcquisitionInformation(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
    investmentAssetId: string;
    acquisitionDateIso?: string;
    acquisitionPrice?: number;
    acquisitionTransactionRefId?: string;
    initialTransactionCostEstimate?: number;
    initialRenovationCostEstimate?: number;
    disposalTransactionRefId?: string;
    disposalDateIso?: string;
    disposalPrice?: number;
  }): Promise<InvestmentAssetRecord> {
    const portfolio = await retrieveInvestmentPortfolio({
      principal: params.principal,
      portfolioId: params.portfolioId,
    });
    await assertPortfolioAccess(portfolio, params.principal);
    const assetId = requireValidId(params.investmentAssetId, 'investmentAssetId');

    let disposalClass: InvestmentAssetRecord['disposalPriceClassification'] | undefined;
    let verifiedDisposalPrice = params.disposalPrice;
    let verifiedDisposalDate = params.disposalDateIso;

    if (params.disposalTransactionRefId && deps.transactions) {
      const txSnap = await deps.transactions.getPropertyTransactionById(
        params.disposalTransactionRefId,
      );
      if (
        txSnap &&
        txSnap.workflowType === 'DISPOSAL' &&
        txSnap.workflowStage === 'COMPLETED_TRANSACTION' &&
        txSnap.paymentSettlementStage === 'AUTHORITATIVELY_SETTLED' &&
        txSnap.confirmedSettledPriceTotal !== null
      ) {
        disposalClass = 'AUTHORITATIVELY_CONFIRMED_DISPOSAL';
        verifiedDisposalPrice = txSnap.confirmedSettledPriceTotal;
        verifiedDisposalDate = txSnap.completedAtIso ?? verifiedDisposalDate;
      } else {
        disposalClass = 'USER_REPORTED_DISPOSAL';
      }
    } else if (typeof params.disposalPrice === 'number' && params.disposalPrice > 0) {
      disposalClass = 'USER_REPORTED_DISPOSAL';
    }

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'inv.asset.update_acquisition', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<InvestmentAssetRecord>(`inv_assets/${assetId}`);
        if (!snap.exists || !snap.data || snap.data.portfolioId !== portfolio.portfolioId) {
          throw new CoreApiError('NOT_FOUND', 404, `Asset "${assetId}" not found.`);
        }
        const ts = nowTs();
        const updated: InvestmentAssetRecord = {
          ...snap.data,
          ...(params.acquisitionDateIso !== undefined
            ? { acquisitionDateIso: params.acquisitionDateIso }
            : {}),
          ...(params.acquisitionPrice !== undefined
            ? {
                acquisitionPrice: params.acquisitionPrice,
                acquisitionPriceClassification: 'USER_ESTIMATED_ACQUISITION_PRICE',
              }
            : {}),
          ...(params.initialTransactionCostEstimate !== undefined
            ? { initialTransactionCostEstimate: params.initialTransactionCostEstimate }
            : {}),
          ...(params.initialRenovationCostEstimate !== undefined
            ? { initialRenovationCostEstimate: params.initialRenovationCostEstimate }
            : {}),
          ...(verifiedDisposalPrice !== undefined
            ? {
                disposalPrice: verifiedDisposalPrice,
                disposalDateIso: verifiedDisposalDate ?? ts.iso,
                disposalTransactionRefId: params.disposalTransactionRefId ?? null,
                disposalPriceClassification: disposalClass ?? 'USER_REPORTED_DISPOSAL',
                holdingStatus: 'DISPOSED_EXITED',
              }
            : {}),
          updatedAt: ts,
        };
        tx.set(`inv_assets/${assetId}`, updated as unknown as Record<string, unknown>);
        return updated;
      },
    );
  }

  /**
   * 7. Record operating expense, income, or capital expenditure information
   */
  async function recordFinancialEntryInformation(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    idempotencyKey: string;
    portfolioId: string;
    investmentAssetId: string;
    majorClass: FinancialEntryMajorClass;
    subcategory: FinancialSubcategory;
    recurrence: ExpenseRecurrenceType;
    periodStartIso: string;
    periodEndIso: string;
    amount: number;
    currency: SupportedCurrencyCode;
    paymentStatus: InvestmentFinancialEntryRecord['paymentStatus'];
    sourceModule?: FinancialInputProvenance['sourceModule'];
    sourceRecordRefId?: string | null;
    deduplicationKey?: string;
  }): Promise<InvestmentFinancialEntryRecord> {
    if (!Number.isFinite(params.amount) || params.amount < 0) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Financial entry amount must be non-negative.');
    }
    const portfolio = await retrieveInvestmentPortfolio({
      principal: params.principal,
      portfolioId: params.portfolioId,
    });
    const actor = await assertPortfolioAccess(portfolio, params.principal);
    const assetId = requireValidId(params.investmentAssetId, 'investmentAssetId');

    const outcome = await executeIdempotentMutation<InvestmentFinancialEntryRecord>({
      store: idempotencyStore,
      idempotencyKey: params.idempotencyKey,
      operation: 'investment-intelligence:financial-entry.record',
      actorUid: actor.uid,
      requestPayload: {
        portfolioId: portfolio.portfolioId,
        investmentAssetId: assetId,
        majorClass: params.majorClass,
        subcategory: params.subcategory,
        periodStartIso: params.periodStartIso,
        periodEndIso: params.periodEndIso,
        amount: params.amount,
        currency: params.currency,
      },
      nowEpochMs: nowEpochMs(),
      mutationFn: async () => {
        const ts = nowTs();
        const entryId = `invent_${crypto.randomBytes(6).toString('hex')}`;
        const sourceModule = params.sourceModule ?? 'INVESTMENT_INTELLIGENCE_USER_INPUT';

        // Section 7 & 20: Never classify an undocumented user-entered amount as AUTHORITATIVELY_CONFIRMED
        const isAuthoritativeSource =
          sourceModule === 'PROPERTY_TRANSACTIONS' ||
          sourceModule === 'AUTHORIZED_PAYMENT_SOURCE' ||
          sourceModule === 'PROPERTY_MANAGEMENT';

        const effectivePaymentStatus: InvestmentFinancialEntryRecord['paymentStatus'] =
          params.paymentStatus === 'AUTHORITATIVELY_CONFIRMED_CASH_MOVEMENT' &&
          !isAuthoritativeSource
            ? 'REPORTED_UNVERIFIED_PAYMENT'
            : params.paymentStatus;

        const classification: InvestmentDataClassification =
          effectivePaymentStatus === 'AUTHORITATIVELY_CONFIRMED_CASH_MOVEMENT'
            ? 'CONFIRMED'
            : effectivePaymentStatus === 'PROJECTED_FORECAST'
              ? 'FORECAST'
              : 'REPORTED';

        return runDurableTransaction(
          deps.txRunner,
          { operationName: 'inv.entry.record', maxAttempts: 3, baseBackoffMs: 5 },
          async (tx) => {
            const aSnap = await tx.get<InvestmentAssetRecord>(`inv_assets/${assetId}`);
            if (!aSnap.exists || !aSnap.data || aSnap.data.portfolioId !== portfolio.portfolioId) {
              throw new CoreApiError('NOT_FOUND', 404, `Asset "${assetId}" not found.`);
            }

            const dedupKey =
              params.deduplicationKey ??
              `${assetId}__${params.majorClass}__${params.subcategory}__${params.periodStartIso}__${params.amount}`;

            const entry: InvestmentFinancialEntryRecord = {
              entryId,
              portfolioId: portfolio.portfolioId,
              investmentAssetId: assetId,
              canonicalPropertyId: aSnap.data.canonicalPropertyId,
              majorClass: params.majorClass,
              subcategory: params.subcategory,
              recurrence: params.recurrence,
              periodStartIso: params.periodStartIso,
              periodEndIso: params.periodEndIso,
              amount: params.amount,
              currency: params.currency,
              paymentStatus: effectivePaymentStatus,
              deduplicationKey: dedupKey,
              provenance: {
                sourceModule,
                sourceRecordRefId: params.sourceRecordRefId ?? null,
                originalAmount: params.amount,
                originalCurrency: params.currency,
                observationDateIso: params.periodEndIso,
                recordedAtIso: ts.iso,
                classification,
                verificationState: isAuthoritativeSource
                  ? 'AUTHORITATIVELY_VERIFIED'
                  : 'USER_DECLARED_UNVERIFIED',
                calculationInclusionStatus: 'INCLUDED',
                knownLimitations: !isAuthoritativeSource
                  ? ['User-reported financial entry is not independently verified against bank or payment records.']
                  : [],
              },
              createdAt: ts,
            };

            tx.set(`inv_financial_entries/${entryId}`, entry as unknown as Record<string, unknown>);
            await appendToIndex(tx, `inv_asset_entries_index/${assetId}`, entryId);
            return { statusCode: 201, body: entry };
          },
        );
      },
    });

    return outcome.body;
  }

  async function loadAssetAndEntriesOrThrow(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
    investmentAssetId: string;
  }) {
    const portfolio = await retrieveInvestmentPortfolio({
      principal: params.principal,
      portfolioId: params.portfolioId,
    });
    const assetId = requireValidId(params.investmentAssetId, 'investmentAssetId');

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'inv.load_asset_and_entries', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const aSnap = await tx.get<InvestmentAssetRecord>(`inv_assets/${assetId}`);
        if (!aSnap.exists || !aSnap.data || aSnap.data.portfolioId !== portfolio.portfolioId) {
          throw new CoreApiError('NOT_FOUND', 404, `Investment asset "${assetId}" not found.`);
        }
        const entries = await loadIndexedDocs<InvestmentFinancialEntryRecord>(
          tx,
          `inv_asset_entries_index/${assetId}`,
          'inv_financial_entries',
        );
        return { portfolio, asset: aSnap.data, entries };
      },
    );
  }

  /**
   * 8. Retrieve rental-yield analysis
   */
  async function retrieveRentalYieldAnalysis(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
    investmentAssetId: string;
    periodStartIso: string;
    periodEndIso: string;
    preferredValueBasis?: PropertyValueBasisType;
  }): Promise<RentalYieldAnalysisResult> {
    const { asset, entries } = await loadAssetAndEntriesOrThrow(params);
    const [pmSummary, valuation] = await Promise.all([
      deps.propertyManagement
        ? deps.propertyManagement.getAggregatedRentalAndOccupancySummary({
            canonicalPropertyId: asset.canonicalPropertyId,
            periodStartIso: params.periodStartIso,
            periodEndIso: params.periodEndIso,
          })
        : Promise.resolve(null),
      deps.valuation
        ? deps.valuation.getLatestValuationForProperty({
            canonicalPropertyId: asset.canonicalPropertyId,
            asOfDateIso: params.periodEndIso,
          })
        : Promise.resolve(null),
    ]);

    const result = calculateRentalYieldAnalysis({
      asset,
      entries,
      pmSummary,
      valuation,
      periodStartIso: params.periodStartIso,
      periodEndIso: params.periodEndIso,
      preferredValueBasis: params.preferredValueBasis ?? 'ORIGINAL_ACQUISITION_COST_BASIS',
      nowTs: nowTs(),
    });

    await runDurableTransaction(
      deps.txRunner,
      { operationName: 'inv.yield.store', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        tx.set(`inv_yield_results/${result.analysisId}`, result as unknown as Record<string, unknown>);
      },
    );

    return result;
  }

  /**
   * 9. Retrieve cash-flow analysis
   */
  async function retrieveCashFlowAnalysis(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
    investmentAssetId: string;
    periodStartIso: string;
    periodEndIso: string;
  }): Promise<CashFlowAnalysisResult> {
    const { asset, entries } = await loadAssetAndEntriesOrThrow(params);
    const pmSummary = deps.propertyManagement
      ? await deps.propertyManagement.getAggregatedRentalAndOccupancySummary({
          canonicalPropertyId: asset.canonicalPropertyId,
          periodStartIso: params.periodStartIso,
          periodEndIso: params.periodEndIso,
        })
      : null;

    const result = calculatePropertyCashFlowAnalysis({
      portfolioId: asset.portfolioId,
      investmentAssetId: asset.investmentAssetId,
      baseCurrency: asset.acquisitionCurrency,
      entries,
      pmSummary,
      periodStartIso: params.periodStartIso,
      periodEndIso: params.periodEndIso,
      nowTs: nowTs(),
    });

    await runDurableTransaction(
      deps.txRunner,
      { operationName: 'inv.cashflow.store', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        tx.set(
          `inv_cashflow_results/${result.cashFlowAnalysisId}`,
          result as unknown as Record<string, unknown>,
        );
      },
    );

    return result;
  }

  /**
   * 10. Calculate investment return (ROI, CAGR, Cash-on-Cash, Equity Multiple, IRR, Real Inflation-Adjusted Return)
   */
  async function calculateInvestmentReturn(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
    investmentAssetId: string;
    periodStartIso: string;
    periodEndIso: string;
    datedCashFlows?: DatedCashFlowPoint[];
    startPeriodKeyForInflation?: string;
    endPeriodKeyForInflation?: string;
  }): Promise<ReturnOnInvestmentAnalysisResult> {
    const { asset } = await loadAssetAndEntriesOrThrow(params);
    const cashFlowResult = await retrieveCashFlowAnalysis(params);
    const valuation = deps.valuation
      ? await deps.valuation.getLatestValuationForProperty({
          canonicalPropertyId: asset.canonicalPropertyId,
          asOfDateIso: params.periodEndIso,
        })
      : null;

    const [startInf, endInf] = await Promise.all([
      params.startPeriodKeyForInflation && deps.currencyAndInflation
        ? deps.currencyAndInflation.getInflationIndex({
            periodKey: params.startPeriodKeyForInflation,
            currency: asset.acquisitionCurrency,
          })
        : Promise.resolve(null),
      params.endPeriodKeyForInflation && deps.currencyAndInflation
        ? deps.currencyAndInflation.getInflationIndex({
            periodKey: params.endPeriodKeyForInflation,
            currency: asset.acquisitionCurrency,
          })
        : Promise.resolve(null),
    ]);

    const roi = calculateReturnOnInvestmentAnalysis({
      asset,
      cashFlowResult,
      valuation,
      datedCashFlows: params.datedCashFlows,
      startCpiIndex: startInf?.cpiIndexBase100 ?? null,
      endCpiIndex: endInf?.cpiIndexBase100 ?? null,
      asOfDateIso: params.periodEndIso,
      nowTs: nowTs(),
    });

    await runDurableTransaction(
      deps.txRunner,
      { operationName: 'inv.roi.store', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        tx.set(`inv_roi_results/${roi.returnAnalysisId}`, roi as unknown as Record<string, unknown>);
      },
    );

    return roi;
  }

  /**
   * 11. Run hypothetical investment scenario
   */
  async function runInvestmentScenario(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
    investmentAssetId: string;
    scenarioName: string;
    periodStartIso: string;
    periodEndIso: string;
    assumptions: InvestmentScenarioRecord['explicitAssumptions'];
  }): Promise<InvestmentScenarioRecord> {
    const yieldRes = await retrieveRentalYieldAnalysis(params);
    const { asset } = await loadAssetAndEntriesOrThrow(params);

    const scenario = evaluateHypotheticalInvestmentScenario({
      portfolioId: params.portfolioId,
      investmentAssetId: params.investmentAssetId,
      scenarioName: sanitizeTextInput(params.scenarioName).slice(0, 120),
      currency: asset.acquisitionCurrency,
      baselineAnnualGrossRent: yieldRes.annualizedGrossRentalIncome ?? 0,
      baselineAnnualMaintenanceCost: yieldRes.annualizedOperatingExpenses * 0.4,
      baselineAnnualOtherOpEx: yieldRes.annualizedOperatingExpenses * 0.6,
      baselineAcquisitionAndCapexBasis: yieldRes.acquisitionCostBasisTotal,
      baselinePropertyValue:
        yieldRes.currentEstimatedValue ?? yieldRes.acquisitionCostBasisTotal,
      assumptions: params.assumptions,
      nowTs: nowTs(),
    });

    await runDurableTransaction(
      deps.txRunner,
      { operationName: 'inv.scenario.store', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        tx.set(
          `inv_scenarios/${scenario.scenarioId}`,
          scenario as unknown as Record<string, unknown>,
        );
        await appendToIndex(tx, `inv_portfolio_scenarios_index/${params.portfolioId}`, scenario.scenarioId);
      },
    );

    return scenario;
  }

  /**
   * 12. Compare investment scenarios against baseline
   */
  async function compareInvestmentScenarios(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
    scenarioIds: string[];
  }) {
    const portfolio = await retrieveInvestmentPortfolio({
      principal: params.principal,
      portfolioId: params.portfolioId,
    });

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'inv.scenarios.compare', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const scenarios: InvestmentScenarioRecord[] = [];
        for (const id of params.scenarioIds) {
          const sId = requireValidId(id, 'scenarioId');
          const snap = await tx.get<InvestmentScenarioRecord>(`inv_scenarios/${sId}`);
          if (!snap.exists || !snap.data || snap.data.portfolioId !== portfolio.portfolioId) {
            throw new CoreApiError('NOT_FOUND', 404, `Scenario "${sId}" not found in portfolio.`);
          }
          scenarios.push(snap.data);
        }
        return {
          portfolioId: portfolio.portfolioId,
          outputClassification: 'HYPOTHETICAL_SCENARIO_COMPARISON_NOT_A_FORECAST' as const,
          scenarios,
        };
      },
    );
  }

  async function buildPortfolioAssetSummaries(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
    periodStartIso: string;
    periodEndIso: string;
  }): Promise<{
    portfolio: InvestmentPortfolioRecord;
    summaries: AssetAnalyticalSummaryForPortfolio[];
  }> {
    const portfolio = await retrieveInvestmentPortfolio({
      principal: params.principal,
      portfolioId: params.portfolioId,
    });
    const assetsPage = await retrievePortfolioAssets({
      principal: params.principal,
      portfolioId: params.portfolioId,
      limit: 100,
    });

    const summaries: AssetAnalyticalSummaryForPortfolio[] = [];
    for (const asset of assetsPage.items) {
      const [yieldRes, pmSummary, valuation] = await Promise.all([
        retrieveRentalYieldAnalysis({
          principal: params.principal,
          portfolioId: params.portfolioId,
          investmentAssetId: asset.investmentAssetId,
          periodStartIso: params.periodStartIso,
          periodEndIso: params.periodEndIso,
        }),
        deps.propertyManagement
          ? deps.propertyManagement.getAggregatedRentalAndOccupancySummary({
              canonicalPropertyId: asset.canonicalPropertyId,
              periodStartIso: params.periodStartIso,
              periodEndIso: params.periodEndIso,
            })
          : Promise.resolve(null),
        deps.valuation
          ? deps.valuation.getLatestValuationForProperty({
              canonicalPropertyId: asset.canonicalPropertyId,
              asOfDateIso: params.periodEndIso,
            })
          : Promise.resolve(null),
      ]);

      summaries.push({
        asset,
        valuation,
        annualRentalIncome: yieldRes.annualizedGrossRentalIncome ?? 0,
        annualOperatingExpenses: yieldRes.annualizedOperatingExpenses,
        annualMaintenanceExpenses: pmSummary?.documentedMaintenanceExpensesTotal ?? 0,
        vacantDaysInPeriod: yieldRes.vacantDaysInPeriod,
        totalDaysInPeriod: yieldRes.observedDaysInPeriod,
        singleLeaseConcentrationRatio: pmSummary?.singleLeaseConcentrationRatio ?? null,
      });
    }

    return { portfolio, summaries };
  }

  /**
   * 13 & 14. Generate or retrieve asset and portfolio performance snapshots (Idempotent, immutable)
   */
  async function generateAndRetrievePerformanceSnapshot(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    idempotencyKey: string;
    portfolioId: string;
    investmentAssetId?: string | null;
    reportingPeriodKey: string;
    periodType: InvestmentPerformanceSnapshotRecord['periodType'];
    observationWindowStartIso: string;
    observationWindowEndIso: string;
    simulateCalculationFailureForTesting?: boolean;
  }): Promise<{
    job: InvestmentCalculationJobRecord;
    snapshot: InvestmentPerformanceSnapshotRecord;
    reusedExistingSnapshot: boolean;
  }> {
    const portfolio = await retrieveInvestmentPortfolio({
      principal: params.principal,
      portfolioId: params.portfolioId,
    });
    const actor = await assertPortfolioAccess(portfolio, params.principal);

    const outcome = await executeIdempotentMutation<{
      job: InvestmentCalculationJobRecord;
      snapshot: InvestmentPerformanceSnapshotRecord;
      reusedExistingSnapshot: boolean;
    }>({
      store: idempotencyStore,
      idempotencyKey: params.idempotencyKey,
      operation: 'investment-intelligence:performance.snapshot',
      actorUid: actor.uid,
      requestPayload: {
        portfolioId: portfolio.portfolioId,
        investmentAssetId: params.investmentAssetId ?? null,
        reportingPeriodKey: params.reportingPeriodKey,
        periodType: params.periodType,
        observationWindowStartIso: params.observationWindowStartIso,
        observationWindowEndIso: params.observationWindowEndIso,
      },
      nowEpochMs: nowEpochMs(),
      mutationFn: async () => {
        if (params.simulateCalculationFailureForTesting) {
          throw new CoreApiError(
            'INTERNAL_ERROR',
            500,
            'SIMULATED_CALCULATION_FAILURE: Aborted before persisting partial performance snapshot.',
          );
        }

        const targetAssetId =
          params.investmentAssetId ?? portfolio.activeAssetIds[0] ?? null;
        if (!targetAssetId) {
          throw new CoreApiError(
            'VALIDATION_FAILED',
            400,
            'Portfolio has no active assets to snapshot.',
          );
        }

        const [yieldRes, cfRes, roiRes] = await Promise.all([
          retrieveRentalYieldAnalysis({
            principal: params.principal,
            portfolioId: portfolio.portfolioId,
            investmentAssetId: targetAssetId,
            periodStartIso: params.observationWindowStartIso,
            periodEndIso: params.observationWindowEndIso,
          }),
          retrieveCashFlowAnalysis({
            principal: params.principal,
            portfolioId: portfolio.portfolioId,
            investmentAssetId: targetAssetId,
            periodStartIso: params.observationWindowStartIso,
            periodEndIso: params.observationWindowEndIso,
          }),
          calculateInvestmentReturn({
            principal: params.principal,
            portfolioId: portfolio.portfolioId,
            investmentAssetId: targetAssetId,
            periodStartIso: params.observationWindowStartIso,
            periodEndIso: params.observationWindowEndIso,
          }),
        ]);

        const inputHash = computeRequestPayloadHash({
          portfolioId: portfolio.portfolioId,
          targetAssetId,
          reportingPeriodKey: params.reportingPeriodKey,
          grossYield: yieldRes.grossRentalYieldOnAcquisitionCostPct,
          noi: cfRes.aggregateSummary.netOperatingCashFlowConfirmed,
          roi: roiRes.holdingPeriodTotalReturnPct,
        });

        const snapshotId = `invsnap_${portfolio.portfolioId}_${params.reportingPeriodKey}_${inputHash.slice(0, 10)}`;
        const ts = nowTs();

        const snapshot: InvestmentPerformanceSnapshotRecord = {
          snapshotId,
          portfolioId: portfolio.portfolioId,
          investmentAssetId: params.investmentAssetId ?? null,
          reportingPeriodKey: params.reportingPeriodKey,
          periodType: params.periodType,
          observationWindowStartIso: params.observationWindowStartIso,
          observationWindowEndIso: params.observationWindowEndIso,
          generatedAt: ts,
          currency: portfolio.baseReportingCurrency,
          inputSnapshotHash: inputHash,
          methodologyVersion: CURRENT_INVESTMENT_METHODOLOGY_VERSION,
          valuationRefIds: roiRes.valuationRefId ? [roiRes.valuationRefId] : [],
          dataQualityStatus:
            roiRes.missingFinancialInputs.length > 0 ? 'INCOMPLETE' : 'CONFIRMED',
          missingDataIndicators: roiRes.missingFinancialInputs,
          cashFlowSummary: cfRes.aggregateSummary,
          grossRentalYieldPct:
            yieldRes.grossRentalYieldOnCurrentValuationPct ??
            yieldRes.grossRentalYieldOnAcquisitionCostPct,
          netRentalYieldPct:
            yieldRes.netRentalYieldOnCurrentValuationPct ??
            yieldRes.netRentalYieldOnAcquisitionCostPct,
          unrealizedReturnPct:
            roiRes.returnRealizationStatus === 'UNREALIZED_ON_VALUATION_ESTIMATE'
              ? roiRes.holdingPeriodTotalReturnPct
              : null,
          realizedReturnPct:
            roiRes.returnRealizationStatus === 'REALIZED_ON_COMPLETED_DISPOSAL'
              ? roiRes.holdingPeriodTotalReturnPct
              : null,
        };

        const persisted = await runDurableTransaction(
          deps.txRunner,
          { operationName: 'inv.snapshot.store', maxAttempts: 4, baseBackoffMs: 5 },
          async (tx) => {
            const existing = await tx.get<InvestmentPerformanceSnapshotRecord>(
              `inv_performance_snapshots/${snapshotId}`,
            );
            const jobId = `invjob_${crypto.randomBytes(6).toString('hex')}`;
            const job: InvestmentCalculationJobRecord = {
              jobId,
              operation: 'GENERATE_PERFORMANCE_SNAPSHOT',
              portfolioId: portfolio.portfolioId,
              investmentAssetId: params.investmentAssetId ?? null,
              status: 'COMPLETED',
              producedArtifactId: snapshotId,
              inputHash,
              requestedByUid: actor.uid,
              createdAt: ts,
              updatedAt: ts,
            };
            tx.set(`inv_jobs/${jobId}`, job as unknown as Record<string, unknown>);

            if (existing.exists && existing.data) {
              return { job, snapshot: existing.data, reusedExistingSnapshot: true };
            }

            tx.set(
              `inv_performance_snapshots/${snapshotId}`,
              snapshot as unknown as Record<string, unknown>,
            );
            await appendToIndex(
              tx,
              `inv_portfolio_snapshots_index/${portfolio.portfolioId}`,
              snapshotId,
            );
            return { job, snapshot, reusedExistingSnapshot: false };
          },
        );

        return { statusCode: 201, body: persisted };
      },
    });

    return outcome.body;
  }

  /**
   * 15 & 16. Retrieve portfolio allocation and concentration analysis
   */
  async function retrievePortfolioAllocationAndConcentration(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
    periodStartIso: string;
    periodEndIso: string;
    valuationBasis?: PropertyValueBasisType;
  }): Promise<PortfolioAllocationAndConcentrationResult> {
    const { portfolio, summaries } = await buildPortfolioAssetSummaries(params);
    const result = evaluatePortfolioDiversificationAndConcentration({
      portfolioId: portfolio.portfolioId,
      reportingCurrency: portfolio.baseReportingCurrency,
      valuationBasis: params.valuationBasis ?? 'ORIGINAL_ACQUISITION_COST_BASIS',
      assetSummaries: summaries,
      nowTs: nowTs(),
    });

    await runDurableTransaction(
      deps.txRunner,
      { operationName: 'inv.allocation.store', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        tx.set(
          `inv_allocation_results/${result.analysisId}`,
          result as unknown as Record<string, unknown>,
        );
      },
    );

    return result;
  }

  /**
   * 17. Retrieve investment risk indicators
   */
  async function retrieveInvestmentRiskIndicators(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
    periodStartIso: string;
    periodEndIso: string;
    valuationBasis?: PropertyValueBasisType;
  }): Promise<InvestmentRiskAnalysisResult> {
    const { portfolio, summaries } = await buildPortfolioAssetSummaries(params);
    const allocation = evaluatePortfolioDiversificationAndConcentration({
      portfolioId: portfolio.portfolioId,
      reportingCurrency: portfolio.baseReportingCurrency,
      valuationBasis: params.valuationBasis ?? 'ORIGINAL_ACQUISITION_COST_BASIS',
      assetSummaries: summaries,
      nowTs: nowTs(),
    });

    const riskResult = evaluatePortfolioRiskIndicators({
      portfolioId: portfolio.portfolioId,
      allocation,
      assetSummaries: summaries,
      nowTs: nowTs(),
    });

    await runDurableTransaction(
      deps.txRunner,
      { operationName: 'inv.risk.store', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        tx.set(
          `inv_risk_results/${riskResult.riskAnalysisId}`,
          riskResult as unknown as Record<string, unknown>,
        );
      },
    );

    return riskResult;
  }

  /**
   * 18. Compare portfolio results with market benchmarks
   */
  async function comparePortfolioWithMarketBenchmarks(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
    geographicEntityId: string;
    propertyCategory: CanonicalPropertyCategory;
    reportingPeriodKey: string;
    periodStartIso: string;
    periodEndIso: string;
  }) {
    const allocation = await retrievePortfolioAllocationAndConcentration(params);
    const benchmark = deps.marketBenchmarks
      ? await deps.marketBenchmarks.getMarketBenchmark({
          geographicEntityId: params.geographicEntityId,
          propertyCategory: params.propertyCategory,
          reportingPeriodKey: params.reportingPeriodKey,
        })
      : null;

    const { summaries } = await buildPortfolioAssetSummaries(params);
    const totalRent = summaries.reduce((s, a) => s + a.annualRentalIncome, 0);
    const portfolioGrossYieldPct =
      allocation.totalValuedPortfolioAmount > 0
        ? Math.round((totalRent / allocation.totalValuedPortfolioAmount) * 10000) / 100
        : null;

    return comparePortfolioAgainstMarketBenchmark({
      portfolioId: params.portfolioId,
      portfolioCategory: params.propertyCategory,
      reportingPeriodKey: params.reportingPeriodKey,
      portfolioCurrency: allocation.reportingCurrency,
      portfolioGrossYieldPct,
      portfolioVacancyRatePct: allocation.concentrationMetrics.portfolioVacancyExposurePct,
      benchmark,
    });
  }

  /**
   * 19. Retrieve methodology definitions
   */
  async function retrieveMethodologyDefinitions() {
    return {
      currentMethodologyVersion: CURRENT_INVESTMENT_METHODOLOGY_VERSION,
      methodologies: CANONICAL_INVESTMENT_METHODOLOGIES,
    };
  }

  /**
   * 20. Retrieve data-quality and provenance metadata for an investment asset and its entries
   */
  async function retrieveDataQualityAndProvenanceMetadata(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    portfolioId: string;
    investmentAssetId: string;
  }) {
    const { asset, entries } = await loadAssetAndEntriesOrThrow(params);
    return {
      portfolioId: asset.portfolioId,
      investmentAssetId: asset.investmentAssetId,
      canonicalPropertyId: asset.canonicalPropertyId,
      acquisitionPriceClassification: asset.acquisitionPriceClassification,
      disposalPriceClassification: asset.disposalPriceClassification,
      assetProvenance: asset.provenance,
      financialEntriesProvenance: entries.map((e) => ({
        entryId: e.entryId,
        majorClass: e.majorClass,
        subcategory: e.subcategory,
        paymentStatus: e.paymentStatus,
        provenance: e.provenance,
      })),
    };
  }

  /**
   * 21. Retrieve calculation job status
   */
  async function retrieveCalculationJobStatus(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    jobId: string;
  }): Promise<InvestmentCalculationJobRecord> {
    await requireVerifiedPrincipal(params.principal);
    const jId = requireValidId(params.jobId, 'jobId');
    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'inv.job.get', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<InvestmentCalculationJobRecord>(`inv_jobs/${jId}`);
        if (!snap.exists || !snap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Investment calculation job "${jId}" not found.`);
        }
        return snap.data;
      },
    );
  }

  return {
    createInvestmentPortfolio,
    retrieveInvestmentPortfolio,
    addInvestmentAssetReference,
    removeInvestmentAssetReference,
    retrievePortfolioAssets,
    recordInvestmentAcquisitionInformation,
    recordFinancialEntryInformation,
    retrieveRentalYieldAnalysis,
    retrieveCashFlowAnalysis,
    calculateInvestmentReturn,
    runInvestmentScenario,
    compareInvestmentScenarios,
    generateAndRetrievePerformanceSnapshot,
    retrievePortfolioAllocationAndConcentration,
    retrieveInvestmentRiskIndicators,
    comparePortfolioWithMarketBenchmarks,
    retrieveMethodologyDefinitions,
    retrieveDataQualityAndProvenanceMetadata,
    retrieveCalculationJobStatus,
  };
}
