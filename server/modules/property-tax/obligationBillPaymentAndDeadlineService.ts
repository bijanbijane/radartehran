import { assertPropertyTaxAccess } from './authorityTaxRecordAndAssessmentService';
import { PropertyTaxCrossModuleAdapters, TransactionalPropertyTaxStore } from './store';
import {
  MunicipalChargeCategory,
  MunicipalChargeRecord,
  MunicipalFinancialNature,
  PropertyTaxActorContext,
  PropertyTaxCategory,
  PropertyTaxError,
  TaxBillRecord,
  TaxDeadlineEpistemicBasis,
  TaxDeadlineRecord,
  TaxDeadlineType,
  TaxJurisdictionRef,
  TaxObligationEpistemicClassification,
  TaxObligationRecord,
  TaxObligationStatus,
  TaxPaymentStatusClassification,
  TaxPaymentStatusReferenceRecord,
  TaxPeriodRange,
  TaxRecordVerificationStatus,
} from './types';

function makeTaxId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const VALID_OBLIGATION_TRANSITIONS: Record<TaxObligationStatus, TaxObligationStatus[]> = {
  DRAFT: ['REPORTED', 'ASSESSED', 'CANCELLED'],
  REPORTED: ['ASSESSED', 'DISPUTED', 'CANCELLED', 'UNKNOWN'],
  ASSESSED: ['DUE', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'DISPUTED', 'SUSPENDED', 'WAIVED', 'CANCELLED'],
  DUE: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'DISPUTED', 'SUSPENDED', 'WAIVED', 'CANCELLED'],
  PARTIALLY_PAID: ['PAID', 'OVERDUE', 'DISPUTED', 'SUSPENDED', 'WAIVED'],
  OVERDUE: ['PARTIALLY_PAID', 'PAID', 'DISPUTED', 'SUSPENDED', 'WAIVED'],
  DISPUTED: ['ASSESSED', 'DUE', 'PARTIALLY_PAID', 'PAID', 'SUSPENDED', 'WAIVED', 'CANCELLED'],
  SUSPENDED: ['DUE', 'OVERDUE', 'DISPUTED', 'WAIVED', 'CANCELLED'],
  PAID: ['DISPUTED'],
  WAIVED: [],
  CANCELLED: [],
  UNKNOWN: ['REPORTED', 'ASSESSED', 'CANCELLED'],
};

export class ObligationBillPaymentAndDeadlineService {
  constructor(
    private readonly store: TransactionalPropertyTaxStore,
    private readonly adapters: PropertyTaxCrossModuleAdapters
  ) {}

  public async registerTaxObligation(
    actor: PropertyTaxActorContext,
    input: {
      propertyTaxRecordId: string;
      assessmentId?: string;
      taxCategory: PropertyTaxCategory;
      taxPeriod: TaxPeriodRange;
      originalAmountRials: number;
      dueDateIso: string;
      requestedStatus: TaxObligationStatus;
      epistemicClassification: TaxObligationEpistemicClassification;
      sourceReference: string;
      idempotencyKey?: string;
    }
  ): Promise<TaxObligationRecord> {
    const taxRecord = this.store.getTaxRecord(input.propertyTaxRecordId);
    if (!taxRecord) {
      throw new PropertyTaxError('RESOURCE_NOT_FOUND', `Tax record "${input.propertyTaxRecordId}" not found.`, 404);
    }
    assertPropertyTaxAccess(this.store, actor, taxRecord.propertyId);

    if (
      (input.requestedStatus === 'DUE' || input.requestedStatus === 'ASSESSED') &&
      input.epistemicClassification === 'USER_REPORTED_OBLIGATION'
    ) {
      throw new PropertyTaxError(
        'USER_REPORTED_AMOUNT_NOT_LEGALLY_DUE',
        'A user-reported tax obligation cannot be declared legally ASSESSED or DUE without an official assessment or authoritative source.'
      );
    }

    return this.store.runTransaction((tx) => {
      const existingId = tx.getIdempotentEntityId('obligation', input.idempotencyKey);
      if (existingId) {
        const existing = tx.getObligation(existingId);
        if (existing) return existing;
      }
      const verificationStatus: TaxRecordVerificationStatus =
        input.epistemicClassification === 'OFFICIALLY_ASSESSED_OBLIGATION' &&
        actor.role === 'AUTHORITY_VERIFIER_OR_ADMIN'
          ? 'OFFICIALLY_VERIFIED'
          : 'UNVERIFIED_USER_REPORTED';

      const now = new Date().toISOString();
      const obligation: TaxObligationRecord = {
        id: makeTaxId('tax_ob'),
        propertyId: taxRecord.propertyId,
        propertyTaxRecordId: taxRecord.id,
        assessmentId: input.assessmentId,
        taxCategory: input.taxCategory,
        taxPeriod: input.taxPeriod,
        originalAmountRials: input.originalAmountRials,
        confirmedPaidAmountRials: 0,
        currency: 'IRR',
        dueDateIso: input.dueDateIso,
        status: input.requestedStatus,
        epistemicClassification: input.epistemicClassification,
        sourceReference: input.sourceReference,
        verificationStatus,
        collectionSuspendedByAuthority: false,
        isLegallyDueByUserEntryAlone: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveObligation(obligation);
      tx.setIdempotentEntityId('obligation', input.idempotencyKey, obligation.id);
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: obligation.propertyId,
        entityType: 'OBLIGATION',
        entityId: obligation.id,
        historyClassification: 'ORIGINAL_RECORD',
        actionSummary: `Registered tax obligation (${obligation.status}, ${obligation.epistemicClassification}) for ${obligation.originalAmountRials} IRR.`,
        actorUserId: actor.userId,
        newSnapshot: { ...obligation },
        provenanceReference: input.sourceReference,
        recordedAtIso: now,
      });
      return obligation;
    });
  }

  public async transitionTaxObligationStatus(
    actor: PropertyTaxActorContext,
    input: { obligationId: string; targetStatus: TaxObligationStatus; reason: string }
  ): Promise<TaxObligationRecord> {
    const obligation = this.store.getObligation(input.obligationId);
    if (!obligation) {
      throw new PropertyTaxError('RESOURCE_NOT_FOUND', `Obligation "${input.obligationId}" not found.`, 404);
    }
    assertPropertyTaxAccess(this.store, actor, obligation.propertyId);

    const allowed = VALID_OBLIGATION_TRANSITIONS[obligation.status] ?? [];
    if (!allowed.includes(input.targetStatus)) {
      throw new PropertyTaxError(
        'INVALID_OBLIGATION_TRANSITION',
        `Cannot transition tax obligation from "${obligation.status}" to "${input.targetStatus}".`
      );
    }
    if (input.targetStatus === 'PAID' && actor.role !== 'AUTHORITY_VERIFIER_OR_ADMIN') {
      throw new PropertyTaxError(
        'RECEIPT_UPLOAD_DOES_NOT_CONFIRM_PAYMENT',
        'Direct transition to PAID requires authoritative payment verification.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const updated: TaxObligationRecord = {
        ...obligation,
        status: input.targetStatus,
        version: obligation.version + 1,
        updatedAt: now,
      };
      tx.saveObligation(updated);
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: updated.propertyId,
        entityType: 'OBLIGATION',
        entityId: updated.id,
        historyClassification: 'CORRECTED_RECORD',
        actionSummary: `Transitioned obligation from ${obligation.status} to ${updated.status}: ${input.reason}`,
        actorUserId: actor.userId,
        previousSnapshot: { ...obligation },
        newSnapshot: { ...updated },
        provenanceReference: input.reason,
        recordedAtIso: now,
      });
      return updated;
    });
  }

  public async registerTaxBill(
    actor: PropertyTaxActorContext,
    input: {
      propertyTaxRecordId: string;
      obligationId?: string;
      taxAccountReference?: string;
      taxPeriod: TaxPeriodRange;
      issueDateIso: string;
      dueDateIso: string;
      originalAmountRials: number;
      adjustmentsRials?: number;
      officiallyDocumentedPenaltiesRials?: number;
      officiallyDocumentedFeesRials?: number;
      billKind?: 'INITIAL' | 'CORRECTED' | 'SUPPLEMENTAL' | 'REISSUED';
      replacesBillId?: string;
      sourceDocumentId?: string;
      idempotencyKey?: string;
    }
  ): Promise<TaxBillRecord> {
    const taxRecord = this.store.getTaxRecord(input.propertyTaxRecordId);
    if (!taxRecord) {
      throw new PropertyTaxError('RESOURCE_NOT_FOUND', `Tax record "${input.propertyTaxRecordId}" not found.`, 404);
    }
    assertPropertyTaxAccess(this.store, actor, taxRecord.propertyId);

    return this.store.runTransaction((tx) => {
      const existingId = tx.getIdempotentEntityId('bill', input.idempotencyKey);
      if (existingId) {
        const existing = tx.getBill(existingId);
        if (existing) return existing;
      }
      const adjustments = input.adjustmentsRials ?? 0;
      const penalties = input.officiallyDocumentedPenaltiesRials ?? 0;
      const fees = input.officiallyDocumentedFeesRials ?? 0;
      const totalPayableRials = Math.max(0, input.originalAmountRials + adjustments + penalties + fees);
      const now = new Date().toISOString();

      const bill: TaxBillRecord = {
        id: makeTaxId('tax_bill'),
        taxAuthorityId: taxRecord.taxAuthorityId,
        propertyId: taxRecord.propertyId,
        propertyTaxRecordId: taxRecord.id,
        obligationId: input.obligationId,
        taxpayerPartyId: taxRecord.taxpayerPartyId,
        taxAccountReference: input.taxAccountReference ?? taxRecord.taxAccountReference,
        taxPeriod: input.taxPeriod,
        issueDateIso: input.issueDateIso,
        dueDateIso: input.dueDateIso,
        originalAmountRials: input.originalAmountRials,
        adjustmentsRials: adjustments,
        officiallyDocumentedPenaltiesRials: penalties,
        officiallyDocumentedFeesRials: fees,
        totalPayableRials,
        currency: 'IRR',
        billKind: input.billKind ?? 'INITIAL',
        replacesBillId: input.replacesBillId,
        sourceDocumentId: input.sourceDocumentId,
        verificationStatus:
          actor.role === 'AUTHORITY_VERIFIER_OR_ADMIN'
            ? 'OFFICIALLY_VERIFIED'
            : input.sourceDocumentId
              ? 'DOCUMENT_SUPPORTED_UNVERIFIED'
              : 'UNVERIFIED_USER_REPORTED',
        status:
          actor.role === 'AUTHORITY_VERIFIER_OR_ADMIN'
            ? 'VERIFIED_ISSUED'
            : input.billKind === 'SUPPLEMENTAL'
              ? 'SUPPLEMENTAL'
              : input.billKind === 'REISSUED'
                ? 'REISSUED'
                : 'REGISTERED_UNVERIFIED',
        isAuthenticByUploadAlone: false,
        duplicatesPaymentsLedger: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveBill(bill);
      tx.setIdempotentEntityId('bill', input.idempotencyKey, bill.id);
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: bill.propertyId,
        entityType: 'BILL',
        entityId: bill.id,
        historyClassification: 'ORIGINAL_RECORD',
        actionSummary: `Registered ${bill.billKind} tax bill (${bill.totalPayableRials} IRR, status=${bill.status}).`,
        actorUserId: actor.userId,
        newSnapshot: { ...bill },
        provenanceReference: input.sourceDocumentId ?? 'USER_BILL_REGISTRATION',
        recordedAtIso: now,
      });
      return bill;
    });
  }

  public async recordMunicipalCharge(
    actor: PropertyTaxActorContext,
    input: {
      propertyId: string;
      taxAuthorityId: string;
      chargeCategory: MunicipalChargeCategory;
      financialNature: MunicipalFinancialNature;
      chargePeriod: TaxPeriodRange;
      amountRials: number;
      dueDateIso: string;
      chargeBasis: string;
      sourceSupportsTaxClassification: boolean;
      sourceReference: string;
    }
  ): Promise<MunicipalChargeRecord> {
    assertPropertyTaxAccess(this.store, actor, input.propertyId);
    if (input.financialNature === 'TAX' && !input.sourceSupportsTaxClassification) {
      throw new PropertyTaxError(
        'INVALID_MUNICIPAL_CHARGE_CLASSIFICATION',
        'A municipal charge cannot be classified as a TAX unless its authoritative source supports that classification.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const charge: MunicipalChargeRecord = {
        id: makeTaxId('mun_chg'),
        taxAuthorityId: input.taxAuthorityId,
        propertyId: input.propertyId,
        chargeCategory: input.chargeCategory,
        financialNature: input.financialNature,
        chargePeriod: input.chargePeriod,
        amountRials: input.amountRials,
        currency: 'IRR',
        dueDateIso: input.dueDateIso,
        chargeBasis: input.chargeBasis,
        sourceSupportsTaxClassification: input.sourceSupportsTaxClassification,
        sourceReference: input.sourceReference,
        verificationStatus:
          actor.role === 'AUTHORITY_VERIFIER_OR_ADMIN' ? 'OFFICIALLY_VERIFIED' : 'UNVERIFIED_USER_REPORTED',
        status: actor.role === 'AUTHORITY_VERIFIER_OR_ADMIN' ? 'VERIFIED_DUE' : 'REPORTED',
        duplicatesUtilityBillingSystem: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveMunicipalCharge(charge);
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: charge.propertyId,
        entityType: 'MUNICIPAL_CHARGE',
        entityId: charge.id,
        historyClassification: 'ORIGINAL_RECORD',
        actionSummary: `Recorded municipal charge (${charge.chargeCategory}, nature=${charge.financialNature}).`,
        actorUserId: actor.userId,
        newSnapshot: { ...charge },
        provenanceReference: input.sourceReference,
        recordedAtIso: now,
      });
      return charge;
    });
  }

  public async recordPaymentStatusReference(
    actor: PropertyTaxActorContext,
    input: {
      obligationId: string;
      billId?: string;
      amountRials: number;
      paymentDateIso: string;
      paymentMethodReference: string;
      externalPaymentsModuleRef?: string;
      receiptDocumentId?: string;
      requestedStatus: TaxPaymentStatusClassification;
      sourceProvenance: string;
      idempotencyKey?: string;
    }
  ): Promise<{ paymentReference: TaxPaymentStatusReferenceRecord; updatedObligation: TaxObligationRecord }> {
    const obligation = this.store.getObligation(input.obligationId);
    if (!obligation) {
      throw new PropertyTaxError('RESOURCE_NOT_FOUND', `Obligation "${input.obligationId}" not found.`, 404);
    }
    assertPropertyTaxAccess(this.store, actor, obligation.propertyId);

    const existingId = this.store.getIdempotentEntityId('payment', input.idempotencyKey);
    if (existingId) {
      const existingPayment = this.store.getPayment(existingId);
      if (existingPayment) return { paymentReference: existingPayment, updatedObligation: obligation };
    }

    if (
      input.requestedStatus === 'PAYMENT_CONFIRMED_BY_AUTHORITY' &&
      !input.externalPaymentsModuleRef &&
      actor.role !== 'AUTHORITY_VERIFIER_OR_ADMIN'
    ) {
      throw new PropertyTaxError(
        'RECEIPT_UPLOAD_DOES_NOT_CONFIRM_PAYMENT',
        'Uploading a receipt or user report cannot mark a payment as PAYMENT_CONFIRMED_BY_AUTHORITY.'
      );
    }

    let authorityReceiptReference: string | undefined;
    let verificationStatus: TaxRecordVerificationStatus =
      input.receiptDocumentId ? 'DOCUMENT_SUPPORTED_UNVERIFIED' : 'UNVERIFIED_USER_REPORTED';

    if (
      input.requestedStatus === 'PAYMENT_CONFIRMED_BY_AUTHORITY' ||
      input.requestedStatus === 'PAYMENT_PARTIALLY_CONFIRMED'
    ) {
      if (!input.externalPaymentsModuleRef) {
        throw new PropertyTaxError(
          'PAYMENT_VERIFICATION_FAILED',
          'Confirmed payment status requires an externalPaymentsModuleRef verified against the Payments adapter.'
        );
      }
      const verification = await this.adapters.payments.verifyAuthoritativePaymentConfirmation(
        input.externalPaymentsModuleRef
      );
      if (!verification.confirmed) {
        throw new PropertyTaxError(
          'PAYMENT_VERIFICATION_FAILED',
          `Payments adapter could not confirm external payment reference "${input.externalPaymentsModuleRef}". Obligation remains unpaid.`
        );
      }
      authorityReceiptReference = verification.authorityReceiptRef;
      verificationStatus = 'OFFICIALLY_VERIFIED';
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const paymentReference: TaxPaymentStatusReferenceRecord = {
        id: makeTaxId('tax_pay'),
        propertyId: obligation.propertyId,
        obligationId: obligation.id,
        billId: input.billId,
        amountRials: input.amountRials,
        currency: 'IRR',
        paymentDateIso: input.paymentDateIso,
        paymentMethodReference: input.paymentMethodReference,
        authorityReceiptReference,
        externalPaymentsModuleRef: input.externalPaymentsModuleRef,
        receiptDocumentId: input.receiptDocumentId,
        paymentStatus: input.requestedStatus,
        sourceProvenance: input.sourceProvenance,
        verificationStatus,
        processedByTaxModule: false,
        storesPaymentCredentials: false,
        createdAt: now,
        updatedAt: now,
      };

      let updatedObligation = obligation;
      if (
        input.requestedStatus === 'PAYMENT_CONFIRMED_BY_AUTHORITY' ||
        input.requestedStatus === 'PAYMENT_PARTIALLY_CONFIRMED'
      ) {
        const newPaidTotal = obligation.confirmedPaidAmountRials + input.amountRials;
        const newStatus: TaxObligationStatus =
          newPaidTotal >= obligation.originalAmountRials ? 'PAID' : 'PARTIALLY_PAID';
        updatedObligation = {
          ...obligation,
          confirmedPaidAmountRials: newPaidTotal,
          status: newStatus,
          version: obligation.version + 1,
          updatedAt: now,
        };
        tx.saveObligation(updatedObligation);
      }
      tx.savePayment(paymentReference);
      tx.setIdempotentEntityId('payment', input.idempotencyKey, paymentReference.id);
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: obligation.propertyId,
        entityType: 'PAYMENT',
        entityId: paymentReference.id,
        historyClassification: 'ORIGINAL_RECORD',
        actionSummary: `Recorded payment reference (${paymentReference.paymentStatus}) for ${paymentReference.amountRials} IRR; obligation status=${updatedObligation.status}.`,
        actorUserId: actor.userId,
        newSnapshot: { ...paymentReference },
        provenanceReference: input.sourceProvenance,
        recordedAtIso: now,
      });
      return { paymentReference, updatedObligation };
    });
  }

  public async recordTaxDeadline(
    actor: PropertyTaxActorContext,
    input: {
      propertyId: string;
      relatedRecordType: TaxDeadlineRecord['relatedRecordType'];
      relatedRecordId: string;
      deadlineType: TaxDeadlineType;
      dueDateIso: string;
      jurisdiction: TaxJurisdictionRef;
      epistemicBasis: TaxDeadlineEpistemicBasis;
      sourceReference: string;
      reminderEligible: boolean;
      dispatchReminderForPartyId?: string;
    }
  ): Promise<TaxDeadlineRecord> {
    assertPropertyTaxAccess(this.store, actor, input.propertyId);
    if (input.epistemicBasis === 'OFFICIAL_DEADLINE') {
      if (!input.jurisdiction.legalRegulatorySourceRef) {
        throw new PropertyTaxError(
          'UNVERIFIED_OFFICIAL_DEADLINE_REJECTED',
          'OFFICIAL_DEADLINE requires a jurisdiction.legalRegulatorySourceRef verified by Legal & Regulatory Intelligence.'
        );
      }
      const ruleOk = await this.adapters.legalRegulatory.verifyJurisdictionTaxRuleRef(
        input.jurisdiction.citySlug,
        input.jurisdiction.legalRegulatorySourceRef
      );
      if (!ruleOk) {
        throw new PropertyTaxError(
          'UNVERIFIED_OFFICIAL_DEADLINE_REJECTED',
          `Legal & Regulatory Intelligence rejected deadline rule "${input.jurisdiction.legalRegulatorySourceRef}".`
        );
      }
    }

    const deadlineId = makeTaxId('tax_dl');
    let reminderConfirmed = false;
    if (input.reminderEligible && input.dispatchReminderForPartyId) {
      const dispatch = await this.adapters.notifications.dispatchTaxDeadlineReminder(
        deadlineId,
        input.dispatchReminderForPartyId
      );
      reminderConfirmed = dispatch.delivered;
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const isOverdue = new Date(input.dueDateIso).getTime() < Date.now();
      const deadline: TaxDeadlineRecord = {
        id: deadlineId,
        propertyId: input.propertyId,
        relatedRecordType: input.relatedRecordType,
        relatedRecordId: input.relatedRecordId,
        deadlineType: input.deadlineType,
        dueDateIso: input.dueDateIso,
        jurisdiction: input.jurisdiction,
        epistemicBasis: input.epistemicBasis,
        sourceReference: input.sourceReference,
        verificationStatus:
          input.epistemicBasis === 'OFFICIAL_DEADLINE' ? 'OFFICIALLY_VERIFIED' : 'UNVERIFIED_USER_REPORTED',
        reminderEligible: input.reminderEligible,
        reminderConfirmedByNotificationsModule: reminderConfirmed,
        extensionConfirmedByAuthoritativeSource: false,
        status: isOverdue ? 'OVERDUE' : 'UPCOMING',
        createdAt: now,
        updatedAt: now,
      };
      tx.saveDeadline(deadline);
      return deadline;
    });
  }
}
