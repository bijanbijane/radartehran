import {
  MunicipalChargeRecord,
  PropertyTaxError,
  PropertyTaxRecord,
  TaxAssessmentRecord,
  TaxAuthorityReferenceRecord,
  TaxBillRecord,
  TaxDeadlineRecord,
  TaxDisputeRecord,
  TaxDocumentReferenceRecord,
  TaxExemptionRecord,
  TaxHistoryEntryRecord,
  TaxObligationRecord,
  TaxPartyRelationshipRecord,
  TaxPaymentStatusReferenceRecord,
} from './types';

export interface PropertyRegistryTaxAdapter {
  verifyCanonicalPropertyExists(propertyId: string): Promise<boolean>;
}

export interface LegalRegulatoryTaxAdapter {
  verifyJurisdictionTaxRuleRef(citySlug: string, ruleRef: string): Promise<boolean>;
}

export interface PaymentsTaxAdapter {
  verifyAuthoritativePaymentConfirmation(externalPaymentRef: string): Promise<{
    confirmed: boolean;
    confirmedAmountRials?: number;
    authorityReceiptRef?: string;
  }>;
}

export interface MediaTaxAdapter {
  verifyMediaReferenceExists(mediaReferenceId: string): Promise<boolean>;
}

export interface NotificationsTaxAdapter {
  dispatchTaxDeadlineReminder(deadlineId: string, recipientPartyId: string): Promise<{ delivered: boolean }>;
}

export interface PropertyTaxCrossModuleAdapters {
  propertyRegistry: PropertyRegistryTaxAdapter;
  legalRegulatory: LegalRegulatoryTaxAdapter;
  payments: PaymentsTaxAdapter;
  media: MediaTaxAdapter;
  notifications: NotificationsTaxAdapter;
}

export function createDefaultPropertyTaxAdapters(): PropertyTaxCrossModuleAdapters {
  return {
    propertyRegistry: {
      async verifyCanonicalPropertyExists(propertyId: string) {
        return Boolean(propertyId && propertyId.trim().length > 0 && !propertyId.startsWith('invalid-'));
      },
    },
    legalRegulatory: {
      async verifyJurisdictionTaxRuleRef(citySlug: string, ruleRef: string) {
        return Boolean(citySlug && ruleRef && !ruleRef.startsWith('invalid-'));
      },
    },
    payments: {
      async verifyAuthoritativePaymentConfirmation(externalPaymentRef: string) {
        if (externalPaymentRef.startsWith('confirmed-')) {
          return { confirmed: true, authorityReceiptRef: `AUTH-RCPT-${externalPaymentRef}` };
        }
        return { confirmed: false };
      },
    },
    media: {
      async verifyMediaReferenceExists(mediaReferenceId: string) {
        return Boolean(mediaReferenceId && !mediaReferenceId.startsWith('missing-'));
      },
    },
    notifications: {
      async dispatchTaxDeadlineReminder(deadlineId: string, _recipientPartyId: string) {
        return { delivered: !deadlineId.startsWith('undelivered-') };
      },
    },
  };
}

export interface PaginatedTaxResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function clampTaxLimit(requestedLimit?: number): number {
  if (requestedLimit === undefined || requestedLimit === null || Number.isNaN(requestedLimit)) {
    return 20;
  }
  return Math.max(1, Math.min(50, Math.floor(requestedLimit)));
}

export function paginateTaxItems<T>(
  items: T[],
  limit?: number,
  offset?: number
): PaginatedTaxResult<T> {
  const safeLimit = clampTaxLimit(limit);
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

export class TransactionalPropertyTaxStore {
  private authorities = new Map<string, TaxAuthorityReferenceRecord>();
  private taxRecords = new Map<string, PropertyTaxRecord>();
  private assessments = new Map<string, TaxAssessmentRecord>();
  private obligations = new Map<string, TaxObligationRecord>();
  private bills = new Map<string, TaxBillRecord>();
  private municipalCharges = new Map<string, MunicipalChargeRecord>();
  private payments = new Map<string, TaxPaymentStatusReferenceRecord>();
  private deadlines = new Map<string, TaxDeadlineRecord>();
  private exemptions = new Map<string, TaxExemptionRecord>();
  private disputes = new Map<string, TaxDisputeRecord>();
  private partyRelationships = new Map<string, TaxPartyRelationshipRecord>();
  private documents = new Map<string, TaxDocumentReferenceRecord>();
  private history: TaxHistoryEntryRecord[] = [];
  private idempotencyRegistry = new Map<string, { scope: string; entityId: string }>();
  private simulatePersistenceFailureFlag = false;

  public setSimulatePersistenceFailure(fail: boolean): void {
    this.simulatePersistenceFailureFlag = fail;
  }

  private assertHealthyPersistence(): void {
    if (this.simulatePersistenceFailureFlag) {
      throw new PropertyTaxError(
        'PERSISTENCE_FAILURE',
        'Durable persistence layer failed to commit property tax transaction.',
        503
      );
    }
  }

  public async runTransaction<T>(work: (tx: this) => Promise<T> | T): Promise<T> {
    this.assertHealthyPersistence();
    const snapAuthorities = new Map(this.authorities);
    const snapTaxRecords = new Map(this.taxRecords);
    const snapAssessments = new Map(this.assessments);
    const snapObligations = new Map(this.obligations);
    const snapBills = new Map(this.bills);
    const snapCharges = new Map(this.municipalCharges);
    const snapPayments = new Map(this.payments);
    const snapDeadlines = new Map(this.deadlines);
    const snapExemptions = new Map(this.exemptions);
    const snapDisputes = new Map(this.disputes);
    const snapParties = new Map(this.partyRelationships);
    const snapDocuments = new Map(this.documents);
    const snapHistory = [...this.history];
    const snapIdempotency = new Map(this.idempotencyRegistry);

    try {
      const result = await work(this);
      this.assertHealthyPersistence();
      return result;
    } catch (err) {
      this.authorities = snapAuthorities;
      this.taxRecords = snapTaxRecords;
      this.assessments = snapAssessments;
      this.obligations = snapObligations;
      this.bills = snapBills;
      this.municipalCharges = snapCharges;
      this.payments = snapPayments;
      this.deadlines = snapDeadlines;
      this.exemptions = snapExemptions;
      this.disputes = snapDisputes;
      this.partyRelationships = snapParties;
      this.documents = snapDocuments;
      this.history = snapHistory;
      this.idempotencyRegistry = snapIdempotency;
      throw err;
    }
  }

  public getIdempotentEntityId(scope: string, key?: string): string | undefined {
    if (!key) return undefined;
    const hit = this.idempotencyRegistry.get(`${scope}:${key}`);
    return hit?.entityId;
  }

  public setIdempotentEntityId(scope: string, key: string | undefined, entityId: string): void {
    if (!key) return;
    this.idempotencyRegistry.set(`${scope}:${key}`, { scope, entityId });
  }

  public saveAuthority(record: TaxAuthorityReferenceRecord): void {
    this.authorities.set(record.id, { ...record });
  }
  public getAuthority(id: string): TaxAuthorityReferenceRecord | undefined {
    const r = this.authorities.get(id);
    return r ? { ...r } : undefined;
  }

  public saveTaxRecord(record: PropertyTaxRecord): void {
    this.taxRecords.set(record.id, { ...record });
  }
  public getTaxRecord(id: string): PropertyTaxRecord | undefined {
    const r = this.taxRecords.get(id);
    return r ? { ...r } : undefined;
  }
  public listTaxRecordsByProperty(propertyId: string): PropertyTaxRecord[] {
    return Array.from(this.taxRecords.values()).filter((r) => r.propertyId === propertyId);
  }

  public saveAssessment(record: TaxAssessmentRecord): void {
    this.assessments.set(record.id, { ...record });
  }
  public getAssessment(id: string): TaxAssessmentRecord | undefined {
    const r = this.assessments.get(id);
    return r ? { ...r } : undefined;
  }
  public listAssessmentsByProperty(propertyId: string): TaxAssessmentRecord[] {
    return Array.from(this.assessments.values()).filter((r) => r.propertyId === propertyId);
  }

  public saveObligation(record: TaxObligationRecord): void {
    this.obligations.set(record.id, { ...record });
  }
  public getObligation(id: string): TaxObligationRecord | undefined {
    const r = this.obligations.get(id);
    return r ? { ...r } : undefined;
  }
  public listObligationsByProperty(propertyId: string): TaxObligationRecord[] {
    return Array.from(this.obligations.values()).filter((r) => r.propertyId === propertyId);
  }

  public saveBill(record: TaxBillRecord): void {
    this.bills.set(record.id, { ...record });
  }
  public getBill(id: string): TaxBillRecord | undefined {
    const r = this.bills.get(id);
    return r ? { ...r } : undefined;
  }
  public listBillsByProperty(propertyId: string): TaxBillRecord[] {
    return Array.from(this.bills.values()).filter((r) => r.propertyId === propertyId);
  }

  public saveMunicipalCharge(record: MunicipalChargeRecord): void {
    this.municipalCharges.set(record.id, { ...record });
  }
  public listMunicipalChargesByProperty(propertyId: string): MunicipalChargeRecord[] {
    return Array.from(this.municipalCharges.values()).filter((r) => r.propertyId === propertyId);
  }

  public savePayment(record: TaxPaymentStatusReferenceRecord): void {
    this.payments.set(record.id, { ...record });
  }
  public getPayment(id: string): TaxPaymentStatusReferenceRecord | undefined {
    const r = this.payments.get(id);
    return r ? { ...r } : undefined;
  }
  public listPaymentsByObligation(obligationId: string): TaxPaymentStatusReferenceRecord[] {
    return Array.from(this.payments.values()).filter((r) => r.obligationId === obligationId);
  }

  public saveDeadline(record: TaxDeadlineRecord): void {
    this.deadlines.set(record.id, { ...record });
  }
  public getDeadline(id: string): TaxDeadlineRecord | undefined {
    const r = this.deadlines.get(id);
    return r ? { ...r } : undefined;
  }
  public listDeadlinesByProperty(propertyId: string): TaxDeadlineRecord[] {
    return Array.from(this.deadlines.values()).filter((r) => r.propertyId === propertyId);
  }

  public saveExemption(record: TaxExemptionRecord): void {
    this.exemptions.set(record.id, { ...record });
  }
  public getExemption(id: string): TaxExemptionRecord | undefined {
    const r = this.exemptions.get(id);
    return r ? { ...r } : undefined;
  }
  public listExemptionsByProperty(propertyId: string): TaxExemptionRecord[] {
    return Array.from(this.exemptions.values()).filter((r) => r.propertyId === propertyId);
  }

  public saveDispute(record: TaxDisputeRecord): void {
    this.disputes.set(record.id, { ...record });
  }
  public getDispute(id: string): TaxDisputeRecord | undefined {
    const r = this.disputes.get(id);
    return r ? { ...r } : undefined;
  }
  public listDisputesByProperty(propertyId: string): TaxDisputeRecord[] {
    return Array.from(this.disputes.values()).filter((r) => r.propertyId === propertyId);
  }

  public savePartyRelationship(record: TaxPartyRelationshipRecord): void {
    this.partyRelationships.set(record.id, { ...record });
  }
  public listPartyRelationshipsByProperty(propertyId: string): TaxPartyRelationshipRecord[] {
    return Array.from(this.partyRelationships.values()).filter((r) => r.propertyId === propertyId);
  }

  public saveDocument(record: TaxDocumentReferenceRecord): void {
    this.documents.set(record.id, { ...record });
  }
  public getDocument(id: string): TaxDocumentReferenceRecord | undefined {
    const r = this.documents.get(id);
    return r ? { ...r } : undefined;
  }

  public appendHistory(entry: TaxHistoryEntryRecord): void {
    this.history.push({ ...entry });
  }
  public listHistoryByProperty(propertyId: string): TaxHistoryEntryRecord[] {
    return this.history.filter((h) => h.propertyId === propertyId);
  }

  public attemptDirectCrossModuleWrite(targetCollectionName: string): never {
    throw new PropertyTaxError(
      'CROSS_MODULE_WRITE_FORBIDDEN',
      `Property Tax module is forbidden from writing directly to external collection "${targetCollectionName}".`,
      403
    );
  }
}
