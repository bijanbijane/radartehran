import { assertFinancingAccess } from './providerApplicationAndFinancingService';
import {
  PaginatedFinancingResult,
  paginateFinancingItems,
  PropertyFinancingCrossModuleAdapters,
  TransactionalPropertyFinancingStore,
} from './store';
import {
  FinancingDocumentReferenceRecord,
  FinancingHistoryEntryRecord,
  FinancingRiskCategory,
  FinancingRiskIndicatorRecord,
  LoanPayoffAndClosureRecord,
  PayoffLifecycleStatus,
  PropertyFinancingActorContext,
  PropertyFinancingError,
  PropertyFinancingRecord,
  RefinancingStatus,
  RefinancingWorkflowRecord,
} from './types';

function makeFinId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class RefinancingPayoffRiskAndHistoryService {
  constructor(
    private readonly store: TransactionalPropertyFinancingStore,
    private readonly adapters: PropertyFinancingCrossModuleAdapters
  ) {}

  public async createRefinancingRecord(
    actor: PropertyFinancingActorContext,
    input: {
      existingFinancingId: string;
      proposedNewFinancingId?: string;
      currentTermsSummary: string;
      proposedNewTermsSummary: string;
      estimatedCostsRials: number;
      documentedFeesRials: number;
      prepaymentPenaltyReference?: string;
      sourceReference: string;
    }
  ): Promise<RefinancingWorkflowRecord> {
    const existingFin = this.store.getFinancing(input.existingFinancingId);
    if (!existingFin) {
      throw new PropertyFinancingError(
        'RESOURCE_NOT_FOUND',
        `Existing financing "${input.existingFinancingId}" not found.`,
        404
      );
    }
    assertFinancingAccess(this.store, actor, existingFin.propertyId, existingFin.id);

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const refi: RefinancingWorkflowRecord = {
        id: makeFinId('fin_refi'),
        propertyId: existingFin.propertyId,
        existingFinancingId: existingFin.id,
        proposedNewFinancingId: input.proposedNewFinancingId,
        currentTermsSummary: input.currentTermsSummary,
        proposedNewTermsSummary: input.proposedNewTermsSummary,
        estimatedCostsRials: input.estimatedCostsRials,
        documentedFeesRials: input.documentedFeesRials,
        prepaymentPenaltyReference: input.prepaymentPenaltyReference,
        status: 'EVALUATING',
        sourceReference: input.sourceReference,
        verificationStatus: 'UNVERIFIED_USER_REPORTED',
        automaticallyClosesExistingLoanOnApproval: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveRefinancing(refi);
      tx.appendHistory({
        id: makeFinId('fhist'),
        propertyId: refi.propertyId,
        financingOrApplicationId: existingFin.id,
        entityType: 'REFINANCING',
        actionSummary: `Created refinancing evaluation record for existing loan ${existingFin.id}.`,
        actorUserId: actor.userId,
        provenanceReference: input.sourceReference,
        recordedAtIso: now,
      });
      return refi;
    });
  }

  public async recordRefinancingOutcome(
    actor: PropertyFinancingActorContext,
    input: {
      refinancingId: string;
      targetStatus: RefinancingStatus;
      proposedNewFinancingId?: string;
      sourceReference: string;
    }
  ): Promise<{ refinancing: RefinancingWorkflowRecord; existingLoan: PropertyFinancingRecord }> {
    const refi = this.store.getRefinancing(input.refinancingId);
    if (!refi) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Refinancing "${input.refinancingId}" not found.`, 404);
    }
    const existingLoan = this.store.getFinancing(refi.existingFinancingId);
    if (!existingLoan) {
      throw new PropertyFinancingError(
        'RESOURCE_NOT_FOUND',
        `Existing financing "${refi.existingFinancingId}" not found.`,
        404
      );
    }
    assertFinancingAccess(this.store, actor, refi.propertyId, existingLoan.id);

    // Do not mark the old loan closed merely because a refinancing application is approved
    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const updatedRefi: RefinancingWorkflowRecord = {
        ...refi,
        status: input.targetStatus,
        proposedNewFinancingId: input.proposedNewFinancingId ?? refi.proposedNewFinancingId,
        verificationStatus:
          actor.role === 'LENDER_OR_VERIFIER' ? 'LENDER_OR_AUTHORITY_VERIFIED' : refi.verificationStatus,
        version: refi.version + 1,
        updatedAt: now,
      };
      tx.saveRefinancing(updatedRefi);
      tx.appendHistory({
        id: makeFinId('fhist'),
        propertyId: refi.propertyId,
        financingOrApplicationId: existingLoan.id,
        entityType: 'REFINANCING',
        actionSummary: `Updated refinancing ${refi.id} to ${updatedRefi.status}; existing loan status remains ${existingLoan.status}.`,
        actorUserId: actor.userId,
        provenanceReference: input.sourceReference,
        recordedAtIso: now,
      });
      return { refinancing: updatedRefi, existingLoan };
    });
  }

  public async createPayoffRecord(
    actor: PropertyFinancingActorContext,
    input: {
      financingId: string;
      payoffQuoteReference?: string;
      quoteExpirationDateIso?: string;
      outstandingPrincipalRials: number;
      accruedInterestRials: number;
      documentedFeesRials: number;
      documentedPenaltiesRials: number;
      requestedStatus: Extract<
        PayoffLifecycleStatus,
        'ESTIMATED_PAYOFF' | 'LENDER_ISSUED_PAYOFF_QUOTE' | 'PAYOFF_PAYMENT_SUBMITTED'
      >;
    }
  ): Promise<{ payoff: LoanPayoffAndClosureRecord; financing: PropertyFinancingRecord }> {
    const fin = this.store.getFinancing(input.financingId);
    if (!fin) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Financing "${input.financingId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, fin.propertyId, fin.id);

    if (input.requestedStatus === 'LENDER_ISSUED_PAYOFF_QUOTE' && !input.payoffQuoteReference) {
      throw new PropertyFinancingError(
        'VALIDATION_FAILED',
        'LENDER_ISSUED_PAYOFF_QUOTE requires a payoffQuoteReference.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const totalPayoffAmountRials =
        input.outstandingPrincipalRials +
        input.accruedInterestRials +
        input.documentedFeesRials +
        input.documentedPenaltiesRials;

      // Do not mark a loan closed solely because a payoff payment was initiated
      const payoff: LoanPayoffAndClosureRecord = {
        id: makeFinId('fin_payoff'),
        financingId: fin.id,
        propertyId: fin.propertyId,
        payoffQuoteReference: input.payoffQuoteReference,
        quoteExpirationDateIso: input.quoteExpirationDateIso,
        outstandingPrincipalRials: input.outstandingPrincipalRials,
        accruedInterestRials: input.accruedInterestRials,
        documentedFeesRials: input.documentedFeesRials,
        documentedPenaltiesRials: input.documentedPenaltiesRials,
        totalPayoffAmountRials,
        currency: 'IRR',
        status: input.requestedStatus,
        processedByFinancingModule: false,
        assumesCollateralReleasedOnPayoff: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.savePayoff(payoff);
      tx.appendHistory({
        id: makeFinId('fhist'),
        propertyId: fin.propertyId,
        financingOrApplicationId: fin.id,
        entityType: 'PAYOFF',
        actionSummary: `Recorded payoff record (${payoff.status}, total=${payoff.totalPayoffAmountRials} IRR); loan status=${fin.status}.`,
        actorUserId: actor.userId,
        provenanceReference: input.payoffQuoteReference ?? 'PAYOFF_RECORD',
        recordedAtIso: now,
      });
      return { payoff, financing: fin };
    });
  }

  public async recordLoanClosure(
    actor: PropertyFinancingActorContext,
    input: {
      payoffId: string;
      externalPaymentConfirmationRef: string;
      providerClosureConfirmationRef: string;
      payoffDateIso: string;
    }
  ): Promise<{
    payoff: LoanPayoffAndClosureRecord;
    financing: PropertyFinancingRecord;
    collateralAutomaticallyReleased: boolean;
  }> {
    const payoff = this.store.getPayoff(input.payoffId);
    if (!payoff) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Payoff "${input.payoffId}" not found.`, 404);
    }
    const fin = this.store.getFinancing(payoff.financingId);
    if (!fin) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Financing "${payoff.financingId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, fin.propertyId, fin.id);

    if (actor.role !== 'LENDER_OR_VERIFIER' || !input.providerClosureConfirmationRef.trim()) {
      throw new PropertyFinancingError(
        'CLOSURE_REQUIRES_PROVIDER_CONFIRMATION',
        'Closing a loan requires LENDER_OR_VERIFIER role and an official providerClosureConfirmationRef.',
        403
      );
    }

    const paymentCheck = await this.adapters.payments.verifyInstallmentOrPayoffPayment(
      input.externalPaymentConfirmationRef
    );
    if (!paymentCheck.confirmed) {
      throw new PropertyFinancingError(
        'PAYOFF_INITIATION_DOES_NOT_CLOSE_LOAN',
        `Payoff payment "${input.externalPaymentConfirmationRef}" could not be confirmed by the Payments adapter. Loan remains open.`
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const updatedPayoff: LoanPayoffAndClosureRecord = {
        ...payoff,
        payoffDateIso: input.payoffDateIso,
        externalPaymentConfirmationRef: input.externalPaymentConfirmationRef,
        providerClosureConfirmationRef: input.providerClosureConfirmationRef.trim(),
        status: 'LOAN_CLOSED',
        version: payoff.version + 1,
        updatedAt: now,
      };
      const updatedFin: PropertyFinancingRecord = {
        ...fin,
        verifiedCurrentPrincipalBalanceRials: 0,
        status: 'CLOSED',
        version: fin.version + 1,
        updatedAt: now,
      };
      tx.savePayoff(updatedPayoff);
      tx.saveFinancing(updatedFin);

      // Do not assume collateral has been released when the loan is paid
      const collaterals = tx.listCollateralsByFinancing(fin.id);
      const anyAutoReleased = collaterals.some((c) => c.status === 'RELEASED_SECURITY');

      tx.appendHistory({
        id: makeFinId('fhist'),
        propertyId: fin.propertyId,
        financingOrApplicationId: fin.id,
        entityType: 'LOAN_CLOSURE',
        actionSummary: `Closed loan ${fin.id} with provider confirmation ${updatedPayoff.providerClosureConfirmationRef}; collateral requires separate release.`,
        actorUserId: actor.userId,
        provenanceReference: updatedPayoff.providerClosureConfirmationRef!,
        recordedAtIso: now,
      });

      return {
        payoff: updatedPayoff,
        financing: updatedFin,
        collateralAutomaticallyReleased: anyAutoReleased,
      };
    });
  }

  public async registerFinancingDocumentReference(
    actor: PropertyFinancingActorContext,
    input: {
      financingId: string;
      documentCategory: FinancingDocumentReferenceRecord['documentCategory'];
      issuingProviderName: string;
      issueDateIso?: string;
      sourceProvenance: string;
      mediaReferenceId: string;
      restrictedConfidentiality?: boolean;
    }
  ): Promise<FinancingDocumentReferenceRecord> {
    const fin = this.store.getFinancing(input.financingId);
    if (!fin) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Financing "${input.financingId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, fin.propertyId, fin.id);
    if (!(await this.adapters.media.verifyMediaReferenceExists(input.mediaReferenceId))) {
      throw new PropertyFinancingError('VALIDATION_FAILED', `Media reference "${input.mediaReferenceId}" not found.`);
    }

    return this.store.runTransaction((tx) => {
      const doc: FinancingDocumentReferenceRecord = {
        id: makeFinId('fin_doc'),
        financingId: fin.id,
        propertyId: fin.propertyId,
        documentCategory: input.documentCategory,
        issuingProviderName: input.issuingProviderName,
        issueDateIso: input.issueDateIso,
        sourceProvenance: input.sourceProvenance,
        verificationStatus: 'DOCUMENT_SUPPORTED_UNVERIFIED',
        mediaReferenceId: input.mediaReferenceId,
        restrictedConfidentiality: Boolean(input.restrictedConfidentiality),
        isAuthenticWithoutVerification: false,
        version: 1,
        createdAt: new Date().toISOString(),
      };
      tx.saveDocument(doc);
      return doc;
    });
  }

  public retrieveFinancingDocumentReference(
    actor: PropertyFinancingActorContext,
    documentId: string
  ): FinancingDocumentReferenceRecord {
    const doc = this.store.getDocument(documentId);
    if (!doc) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Document "${documentId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, doc.propertyId, doc.financingId);
    if (
      doc.restrictedConfidentiality &&
      actor.role !== 'PRIMARY_BORROWER' &&
      actor.role !== 'LENDER_OR_VERIFIER'
    ) {
      throw new PropertyFinancingError(
        'RESTRICTED_DOCUMENT_ACCESS_DENIED',
        `Actor "${actor.userId}" with role "${actor.role}" is not permitted to access restricted financing document "${documentId}".`,
        403
      );
    }
    return doc;
  }

  public async recordFinancingRiskIndicator(
    actor: PropertyFinancingActorContext,
    input: {
      financingId: string;
      category: FinancingRiskCategory;
      severity: FinancingRiskIndicatorRecord['severity'];
      epistemicNature: FinancingRiskIndicatorRecord['epistemicNature'];
      ruleReference: string;
      inputProvenance: string;
      limitations: string;
    }
  ): Promise<FinancingRiskIndicatorRecord> {
    const fin = this.store.getFinancing(input.financingId);
    if (!fin) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Financing "${input.financingId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, fin.propertyId, fin.id);

    return this.store.runTransaction((tx) => {
      const indicator: FinancingRiskIndicatorRecord = {
        id: makeFinId('fin_risk'),
        financingId: fin.id,
        propertyId: fin.propertyId,
        category: input.category,
        severity: input.severity,
        epistemicNature: input.epistemicNature,
        ruleReference: input.ruleReference,
        inputProvenance: input.inputProvenance,
        limitations: input.limitations,
        inventsDefaultProbabilityOrCreditScore: false,
        recordedAtIso: new Date().toISOString(),
      };
      tx.saveRiskIndicator(indicator);
      return indicator;
    });
  }

  public retrieveFinancingRiskIndicators(
    actor: PropertyFinancingActorContext,
    financingId: string,
    limit?: number,
    offset?: number
  ): PaginatedFinancingResult<FinancingRiskIndicatorRecord> {
    const fin = this.store.getFinancing(financingId);
    if (!fin) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Financing "${financingId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, fin.propertyId, fin.id);
    return paginateFinancingItems(this.store.listRiskIndicatorsByFinancing(fin.id), limit, offset);
  }

  public retrieveFinancingHistory(
    actor: PropertyFinancingActorContext,
    propertyId: string,
    limit?: number,
    offset?: number
  ): PaginatedFinancingResult<FinancingHistoryEntryRecord> {
    assertFinancingAccess(this.store, actor, propertyId);
    return paginateFinancingItems(this.store.listHistoryByProperty(propertyId), limit, offset);
  }

  public retrieveFinancingObligations(
    actor: PropertyFinancingActorContext,
    propertyId: string,
    limit?: number,
    offset?: number
  ): PaginatedFinancingResult<PropertyFinancingRecord> {
    assertFinancingAccess(this.store, actor, propertyId);
    return paginateFinancingItems(this.store.listFinancingsByProperty(propertyId), limit, offset);
  }

  public retrieveLoanMaturityDeadlines(
    actor: PropertyFinancingActorContext,
    propertyId: string
  ): Array<{ financingId: string; maturityDateIso: string; status: PropertyFinancingRecord['status'] }> {
    assertFinancingAccess(this.store, actor, propertyId);
    return this.store
      .listFinancingsByProperty(propertyId)
      .map((f) => ({ financingId: f.id, maturityDateIso: f.maturityDateIso, status: f.status }));
  }

  public retrieveRefinancingHistory(
    actor: PropertyFinancingActorContext,
    propertyId: string,
    limit?: number,
    offset?: number
  ): PaginatedFinancingResult<RefinancingWorkflowRecord> {
    assertFinancingAccess(this.store, actor, propertyId);
    return paginateFinancingItems(this.store.listRefinancingsByProperty(propertyId), limit, offset);
  }
}
