import {
  CollateralReferenceRecord,
  FinancingApplicationRecord,
  FinancingDocumentReferenceRecord,
  FinancingHistoryEntryRecord,
  FinancingInterestRateRecord,
  FinancingOfferRecord,
  FinancingPartyRelationshipRecord,
  FinancingProviderReferenceRecord,
  FinancingRiskIndicatorRecord,
  FinancingTermRecord,
  LoanPayoffAndClosureRecord,
  LtvCalculationRecord,
  PropertyFinancingError,
  PropertyFinancingRecord,
  RefinancingWorkflowRecord,
  RepaymentScheduleRecord,
} from './types';

export interface PropertyRegistryFinancingAdapter {
  verifyCanonicalPropertyExists(propertyId: string): Promise<boolean>;
}

export interface PropertyOwnershipFinancingAdapter {
  verifyRegisteredEncumbranceRef(propertyId: string, securityRegistrationRef: string): Promise<boolean>;
}

export interface PropertyValuationFinancingAdapter {
  verifyValuationRecord(valuationRef: string): Promise<{
    valid: boolean;
    valueRials?: number;
    valuationDateIso?: string;
    isStale?: boolean;
  }>;
}

export interface LegalRegulatoryFinancingAdapter {
  verifyLenderRegistrationRef(citySlug: string, registrationRef: string): Promise<boolean>;
}

export interface PaymentsFinancingAdapter {
  verifyInstallmentOrPayoffPayment(externalPaymentRef: string): Promise<{
    confirmed: boolean;
    confirmedAmountRials?: number;
  }>;
}

export interface MediaFinancingAdapter {
  verifyMediaReferenceExists(mediaReferenceId: string): Promise<boolean>;
}

export interface NotificationsFinancingAdapter {
  notifyFinancingEvent(eventType: string, targetPartyId: string): Promise<{ delivered: boolean }>;
}

export interface PropertyFinancingCrossModuleAdapters {
  propertyRegistry: PropertyRegistryFinancingAdapter;
  propertyOwnership: PropertyOwnershipFinancingAdapter;
  propertyValuation: PropertyValuationFinancingAdapter;
  legalRegulatory: LegalRegulatoryFinancingAdapter;
  payments: PaymentsFinancingAdapter;
  media: MediaFinancingAdapter;
  notifications: NotificationsFinancingAdapter;
}

export function createDefaultPropertyFinancingAdapters(): PropertyFinancingCrossModuleAdapters {
  return {
    propertyRegistry: {
      async verifyCanonicalPropertyExists(propertyId: string) {
        return Boolean(propertyId && propertyId.trim().length > 0 && !propertyId.startsWith('invalid-'));
      },
    },
    propertyOwnership: {
      async verifyRegisteredEncumbranceRef(_propertyId: string, securityRegistrationRef: string) {
        return Boolean(securityRegistrationRef && !securityRegistrationRef.startsWith('unregistered-'));
      },
    },
    propertyValuation: {
      async verifyValuationRecord(valuationRef: string) {
        if (!valuationRef || valuationRef.startsWith('missing-')) {
          return { valid: false };
        }
        if (valuationRef.startsWith('stale-')) {
          return { valid: true, valueRials: 50_000_000_000, valuationDateIso: '2020-01-01T00:00:00.000Z', isStale: true };
        }
        return { valid: true, valueRials: 50_000_000_000, valuationDateIso: '2026-10-01T00:00:00.000Z', isStale: false };
      },
    },
    legalRegulatory: {
      async verifyLenderRegistrationRef(citySlug: string, registrationRef: string) {
        return Boolean(citySlug && registrationRef && !registrationRef.startsWith('invalid-'));
      },
    },
    payments: {
      async verifyInstallmentOrPayoffPayment(externalPaymentRef: string) {
        return { confirmed: externalPaymentRef.startsWith('confirmed-') };
      },
    },
    media: {
      async verifyMediaReferenceExists(mediaReferenceId: string) {
        return Boolean(mediaReferenceId && !mediaReferenceId.startsWith('missing-'));
      },
    },
    notifications: {
      async notifyFinancingEvent(_eventType: string, targetPartyId: string) {
        return { delivered: !targetPartyId.startsWith('undelivered-') };
      },
    },
  };
}

export interface PaginatedFinancingResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function clampFinancingLimit(requestedLimit?: number): number {
  if (requestedLimit === undefined || requestedLimit === null || Number.isNaN(requestedLimit)) {
    return 20;
  }
  return Math.max(1, Math.min(50, Math.floor(requestedLimit)));
}

export function paginateFinancingItems<T>(
  items: T[],
  limit?: number,
  offset?: number
): PaginatedFinancingResult<T> {
  const safeLimit = clampFinancingLimit(limit);
  const safeOffset = Math.max(0, Math.floor(offset ?? 0));
  const slice = items.slice(safeOffset, safeOffset + safeLimit);
  return {
    items: slice,
    total: items.length,
    limit: safeLimit,
    offset: safeOffset,
    hasMore: safeOffset + safeLimit < items.length,
  };
}

export class TransactionalPropertyFinancingStore {
  private providers = new Map<string, FinancingProviderReferenceRecord>();
  private applications = new Map<string, FinancingApplicationRecord>();
  private financings = new Map<string, PropertyFinancingRecord>();
  private partyRelationships = new Map<string, FinancingPartyRelationshipRecord>();
  private loanTerms = new Map<string, FinancingTermRecord>();
  private interestRates = new Map<string, FinancingInterestRateRecord>();
  private schedules = new Map<string, RepaymentScheduleRecord>();
  private collaterals = new Map<string, CollateralReferenceRecord>();
  private ltvCalculations = new Map<string, LtvCalculationRecord>();
  private offers = new Map<string, FinancingOfferRecord>();
  private refinancings = new Map<string, RefinancingWorkflowRecord>();
  private payoffs = new Map<string, LoanPayoffAndClosureRecord>();
  private riskIndicators = new Map<string, FinancingRiskIndicatorRecord>();
  private documents = new Map<string, FinancingDocumentReferenceRecord>();
  private history: FinancingHistoryEntryRecord[] = [];
  private idempotencyRegistry = new Map<string, { scope: string; entityId: string }>();
  private simulatePersistenceFailureFlag = false;

  public setSimulatePersistenceFailure(fail: boolean): void {
    this.simulatePersistenceFailureFlag = fail;
  }

  private assertHealthyPersistence(): void {
    if (this.simulatePersistenceFailureFlag) {
      throw new PropertyFinancingError(
        'PERSISTENCE_FAILURE',
        'Durable persistence layer failed to commit property financing transaction.',
        503
      );
    }
  }

  public async runTransaction<T>(work: (tx: this) => Promise<T> | T): Promise<T> {
    this.assertHealthyPersistence();
    const snapProviders = new Map(this.providers);
    const snapApps = new Map(this.applications);
    const snapFin = new Map(this.financings);
    const snapParties = new Map(this.partyRelationships);
    const snapTerms = new Map(this.loanTerms);
    const snapRates = new Map(this.interestRates);
    const snapScheds = new Map(this.schedules);
    const snapCollat = new Map(this.collaterals);
    const snapLtv = new Map(this.ltvCalculations);
    const snapOffers = new Map(this.offers);
    const snapRefi = new Map(this.refinancings);
    const snapPayoffs = new Map(this.payoffs);
    const snapRisks = new Map(this.riskIndicators);
    const snapDocs = new Map(this.documents);
    const snapHist = [...this.history];
    const snapIdem = new Map(this.idempotencyRegistry);

    try {
      const result = await work(this);
      this.assertHealthyPersistence();
      return result;
    } catch (err) {
      this.providers = snapProviders;
      this.applications = snapApps;
      this.financings = snapFin;
      this.partyRelationships = snapParties;
      this.loanTerms = snapTerms;
      this.interestRates = snapRates;
      this.schedules = snapScheds;
      this.collaterals = snapCollat;
      this.ltvCalculations = snapLtv;
      this.offers = snapOffers;
      this.refinancings = snapRefi;
      this.payoffs = snapPayoffs;
      this.riskIndicators = snapRisks;
      this.documents = snapDocs;
      this.history = snapHist;
      this.idempotencyRegistry = snapIdem;
      throw err;
    }
  }

  public getIdempotentEntityId(scope: string, key?: string): string | undefined {
    if (!key) return undefined;
    return this.idempotencyRegistry.get(`${scope}:${key}`)?.entityId;
  }

  public setIdempotentEntityId(scope: string, key: string | undefined, entityId: string): void {
    if (!key) return;
    this.idempotencyRegistry.set(`${scope}:${key}`, { scope, entityId });
  }

  public saveProvider(r: FinancingProviderReferenceRecord): void {
    this.providers.set(r.id, { ...r });
  }
  public getProvider(id: string): FinancingProviderReferenceRecord | undefined {
    const r = this.providers.get(id);
    return r ? { ...r } : undefined;
  }

  public saveApplication(r: FinancingApplicationRecord): void {
    this.applications.set(r.id, { ...r });
  }
  public getApplication(id: string): FinancingApplicationRecord | undefined {
    const r = this.applications.get(id);
    return r ? { ...r } : undefined;
  }

  public saveFinancing(r: PropertyFinancingRecord): void {
    this.financings.set(r.id, { ...r });
  }
  public getFinancing(id: string): PropertyFinancingRecord | undefined {
    const r = this.financings.get(id);
    return r ? { ...r } : undefined;
  }
  public listFinancingsByProperty(propertyId: string): PropertyFinancingRecord[] {
    return Array.from(this.financings.values()).filter((r) => r.propertyId === propertyId);
  }

  public savePartyRelationship(r: FinancingPartyRelationshipRecord): void {
    this.partyRelationships.set(r.id, { ...r });
  }
  public listPartyRelationshipsByFinancing(financingId: string): FinancingPartyRelationshipRecord[] {
    return Array.from(this.partyRelationships.values()).filter((r) => r.financingId === financingId);
  }

  public saveLoanTerm(r: FinancingTermRecord): void {
    this.loanTerms.set(r.id, { ...r });
  }
  public listLoanTermsByFinancing(financingId: string): FinancingTermRecord[] {
    return Array.from(this.loanTerms.values()).filter((r) => r.financingId === financingId);
  }

  public saveInterestRate(r: FinancingInterestRateRecord): void {
    this.interestRates.set(r.id, { ...r });
  }
  public listInterestRatesByFinancing(financingId: string): FinancingInterestRateRecord[] {
    return Array.from(this.interestRates.values()).filter((r) => r.financingId === financingId);
  }

  public saveSchedule(r: RepaymentScheduleRecord): void {
    this.schedules.set(r.id, { ...r, installments: r.installments.map((i) => ({ ...i })) });
  }
  public getSchedule(id: string): RepaymentScheduleRecord | undefined {
    const r = this.schedules.get(id);
    return r ? { ...r, installments: r.installments.map((i) => ({ ...i })) } : undefined;
  }
  public listSchedulesByFinancing(financingId: string): RepaymentScheduleRecord[] {
    return Array.from(this.schedules.values()).filter((r) => r.financingId === financingId);
  }

  public saveCollateral(r: CollateralReferenceRecord): void {
    this.collaterals.set(r.id, { ...r });
  }
  public getCollateral(id: string): CollateralReferenceRecord | undefined {
    const r = this.collaterals.get(id);
    return r ? { ...r } : undefined;
  }
  public listCollateralsByFinancing(financingId: string): CollateralReferenceRecord[] {
    return Array.from(this.collaterals.values()).filter((r) => r.financingId === financingId);
  }

  public saveLtvCalculation(r: LtvCalculationRecord): void {
    this.ltvCalculations.set(r.id, { ...r });
  }

  public saveOffer(r: FinancingOfferRecord): void {
    this.offers.set(r.id, { ...r });
  }
  public getOffer(id: string): FinancingOfferRecord | undefined {
    const r = this.offers.get(id);
    return r ? { ...r } : undefined;
  }

  public saveRefinancing(r: RefinancingWorkflowRecord): void {
    this.refinancings.set(r.id, { ...r });
  }
  public getRefinancing(id: string): RefinancingWorkflowRecord | undefined {
    const r = this.refinancings.get(id);
    return r ? { ...r } : undefined;
  }
  public listRefinancingsByProperty(propertyId: string): RefinancingWorkflowRecord[] {
    return Array.from(this.refinancings.values()).filter((r) => r.propertyId === propertyId);
  }

  public savePayoff(r: LoanPayoffAndClosureRecord): void {
    this.payoffs.set(r.id, { ...r });
  }
  public getPayoff(id: string): LoanPayoffAndClosureRecord | undefined {
    const r = this.payoffs.get(id);
    return r ? { ...r } : undefined;
  }

  public saveRiskIndicator(r: FinancingRiskIndicatorRecord): void {
    this.riskIndicators.set(r.id, { ...r });
  }
  public listRiskIndicatorsByFinancing(financingId: string): FinancingRiskIndicatorRecord[] {
    return Array.from(this.riskIndicators.values()).filter((r) => r.financingId === financingId);
  }

  public saveDocument(r: FinancingDocumentReferenceRecord): void {
    this.documents.set(r.id, { ...r });
  }
  public getDocument(id: string): FinancingDocumentReferenceRecord | undefined {
    const r = this.documents.get(id);
    return r ? { ...r } : undefined;
  }

  public appendHistory(entry: FinancingHistoryEntryRecord): void {
    this.history.push({ ...entry });
  }
  public listHistoryByProperty(propertyId: string): FinancingHistoryEntryRecord[] {
    return this.history.filter((h) => h.propertyId === propertyId);
  }

  public attemptDirectCrossModuleWrite(targetCollectionName: string): never {
    throw new PropertyFinancingError(
      'CROSS_MODULE_WRITE_FORBIDDEN',
      `Property Financing module is forbidden from writing directly to external collection "${targetCollectionName}".`,
      403
    );
  }
}
