import { assertFinancingAccess } from './providerApplicationAndFinancingService';
import { PropertyFinancingCrossModuleAdapters, TransactionalPropertyFinancingStore } from './store';
import {
  CollateralLifecycleStatus,
  CollateralReferenceRecord,
  FinancingOfferRecord,
  FinancingOfferStage,
  InstallmentPaymentStatus,
  LtvCalculationRecord,
  LtvValuationBasis,
  PropertyFinancingActorContext,
  PropertyFinancingError,
  PropertyFinancingType,
  RepaymentInstallmentItem,
  RepaymentScheduleOrigin,
  RepaymentScheduleRecord,
} from './types';

function makeFinId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface FinancingOfferComparisonItem {
  offerId: string;
  providerId: string;
  annualInterestRatePercent: number;
  rateStructure: 'FIXED' | 'VARIABLE';
  durationMonths: number;
  documentedFeesRials: number;
  totalEstimatedSimpleRepaymentRials: number;
  repaymentAssumptions: string;
  requiredCollateralSummary: string;
  expirationDateIso: string;
  isExpiredAsOfComparison: boolean;
  missingInformationFlags: string[];
  sourceProvenance: string;
}

export interface FinancingOfferComparisonReport {
  comparedAtIso: string;
  offers: FinancingOfferComparisonItem[];
  guaranteesApplicantEligibility: false;
  guaranteesFinancialOutcome: false;
}

export class RepaymentCollateralLtvAndComparisonService {
  constructor(
    private readonly store: TransactionalPropertyFinancingStore,
    private readonly adapters: PropertyFinancingCrossModuleAdapters
  ) {}

  public async registerRepaymentSchedule(
    actor: PropertyFinancingActorContext,
    input: {
      financingId: string;
      scheduleOrigin: RepaymentScheduleOrigin;
      installments: RepaymentInstallmentItem[];
      sourceProvenance: string;
    }
  ): Promise<RepaymentScheduleRecord> {
    const fin = this.store.getFinancing(input.financingId);
    if (!fin) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Financing "${input.financingId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, fin.propertyId, fin.id);

    if (input.scheduleOrigin === 'CONTRACTUAL_SCHEDULE' && actor.role !== 'LENDER_OR_VERIFIER') {
      throw new PropertyFinancingError(
        'VALIDATION_FAILED',
        'CONTRACTUAL_SCHEDULE requires LENDER_OR_VERIFIER role; user-submitted schedules must use USER_ENTERED_SCHEDULE or ESTIMATED_SCHEDULE.'
      );
    }

    return this.store.runTransaction((tx) => {
      const priorSchedules = tx.listSchedulesByFinancing(fin.id);
      const now = new Date().toISOString();
      const schedule: RepaymentScheduleRecord = {
        id: makeFinId('fin_sched'),
        financingId: fin.id,
        propertyId: fin.propertyId,
        scheduleVersion: priorSchedules.length + 1,
        scheduleOrigin: input.scheduleOrigin,
        currency: 'IRR',
        installments: input.installments.map((inst) => ({ ...inst })),
        sourceProvenance: input.sourceProvenance,
        duplicatesPaymentsLedger: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveSchedule(schedule);
      tx.appendHistory({
        id: makeFinId('fhist'),
        propertyId: fin.propertyId,
        financingOrApplicationId: fin.id,
        entityType: 'REPAYMENT_SCHEDULE',
        actionSummary: `Registered repayment schedule v${schedule.scheduleVersion} (${schedule.scheduleOrigin}, ${schedule.installments.length} installments).`,
        actorUserId: actor.userId,
        provenanceReference: input.sourceProvenance,
        recordedAtIso: now,
      });
      return schedule;
    });
  }

  public async recordInstallmentStatusReference(
    actor: PropertyFinancingActorContext,
    input: {
      scheduleId: string;
      installmentNumber: number;
      targetStatus: InstallmentPaymentStatus;
      externalPaymentConfirmationRef?: string;
    }
  ): Promise<RepaymentScheduleRecord> {
    const schedule = this.store.getSchedule(input.scheduleId);
    if (!schedule) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Schedule "${input.scheduleId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, schedule.propertyId, schedule.financingId);

    // Do not claim a repayment is paid without authoritative payment confirmation
    if (
      input.targetStatus === 'PAID_CONFIRMED' ||
      input.targetStatus === 'PARTIALLY_PAID_CONFIRMED'
    ) {
      if (!input.externalPaymentConfirmationRef) {
        throw new PropertyFinancingError(
          'PAYMENT_CONFIRMATION_REQUIRED_FOR_INSTALLMENT_PAID',
          'Cannot mark an installment PAID_CONFIRMED without an externalPaymentConfirmationRef.'
        );
      }
      const check = await this.adapters.payments.verifyInstallmentOrPayoffPayment(
        input.externalPaymentConfirmationRef
      );
      if (!check.confirmed) {
        throw new PropertyFinancingError(
          'PAYMENT_CONFIRMATION_REQUIRED_FOR_INSTALLMENT_PAID',
          `Payments adapter could not confirm installment payment "${input.externalPaymentConfirmationRef}".`
        );
      }
    }

    return this.store.runTransaction((tx) => {
      const updatedInstallments = schedule.installments.map((inst) =>
        inst.installmentNumber === input.installmentNumber
          ? {
              ...inst,
              paymentStatus: input.targetStatus,
              externalPaymentConfirmationRef:
                input.externalPaymentConfirmationRef ?? inst.externalPaymentConfirmationRef,
            }
          : inst
      );
      const updated: RepaymentScheduleRecord = {
        ...schedule,
        installments: updatedInstallments,
        updatedAt: new Date().toISOString(),
      };
      tx.saveSchedule(updated);
      return updated;
    });
  }

  public async registerCollateralReference(
    actor: PropertyFinancingActorContext,
    input: {
      financingId: string;
      collateralType: CollateralReferenceRecord['collateralType'];
      documentedSecurityAmountRials?: number;
      securityRegistrationReference?: string;
      registrationAuthorityReference?: string;
      effectiveStartIso: string;
      requestedStatus: CollateralLifecycleStatus;
      sourceDocumentId?: string;
    }
  ): Promise<CollateralReferenceRecord> {
    const fin = this.store.getFinancing(input.financingId);
    if (!fin) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Financing "${input.financingId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, fin.propertyId, fin.id);

    // Do not infer that a lender has a registered mortgage merely because a financing application references the property
    if (input.requestedStatus === 'REGISTERED_SECURITY') {
      if (!input.securityRegistrationReference || !input.registrationAuthorityReference) {
        throw new PropertyFinancingError(
          'COLLATERAL_REGISTRATION_REQUIRES_OFFICIAL_REF',
          'REGISTERED_SECURITY requires securityRegistrationReference and registrationAuthorityReference.'
        );
      }
      const verifiedInRightsRegistry = await this.adapters.propertyOwnership.verifyRegisteredEncumbranceRef(
        fin.propertyId,
        input.securityRegistrationReference
      );
      if (!verifiedInRightsRegistry) {
        throw new PropertyFinancingError(
          'COLLATERAL_REGISTRATION_REQUIRES_OFFICIAL_REF',
          `Property Ownership & Rights registry could not verify encumbrance "${input.securityRegistrationReference}".`
        );
      }
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const collateral: CollateralReferenceRecord = {
        id: makeFinId('fin_collat'),
        financingId: fin.id,
        propertyId: fin.propertyId,
        collateralType: input.collateralType,
        documentedSecurityAmountRials: input.documentedSecurityAmountRials,
        currency: 'IRR',
        securityRegistrationReference: input.securityRegistrationReference,
        registrationAuthorityReference: input.registrationAuthorityReference,
        effectiveStartIso: input.effectiveStartIso,
        status: input.requestedStatus,
        sourceDocumentId: input.sourceDocumentId,
        verificationStatus:
          input.requestedStatus === 'REGISTERED_SECURITY' && actor.role === 'LENDER_OR_VERIFIER'
            ? 'LENDER_OR_AUTHORITY_VERIFIED'
            : 'UNVERIFIED_USER_REPORTED',
        determinesLegalPriorityOrEnforceability: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveCollateral(collateral);
      tx.appendHistory({
        id: makeFinId('fhist'),
        propertyId: fin.propertyId,
        financingOrApplicationId: fin.id,
        entityType: 'COLLATERAL',
        actionSummary: `Registered collateral reference (${collateral.collateralType}, status=${collateral.status}).`,
        actorUserId: actor.userId,
        provenanceReference: input.securityRegistrationReference ?? 'COLLATERAL_SUBMISSION',
        recordedAtIso: now,
      });
      return collateral;
    });
  }

  public async recordCollateralRelease(
    actor: PropertyFinancingActorContext,
    input: { collateralId: string; releaseConfirmationReference: string; effectiveEndIso: string }
  ): Promise<CollateralReferenceRecord> {
    const collateral = this.store.getCollateral(input.collateralId);
    if (!collateral) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Collateral "${input.collateralId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, collateral.propertyId, collateral.financingId);
    if (actor.role !== 'LENDER_OR_VERIFIER' || !input.releaseConfirmationReference.trim()) {
      throw new PropertyFinancingError(
        'COLLATERAL_REGISTRATION_REQUIRES_OFFICIAL_REF',
        'Releasing collateral security requires LENDER_OR_VERIFIER role and an official releaseConfirmationReference.',
        403
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const updated: CollateralReferenceRecord = {
        ...collateral,
        status: 'RELEASED_SECURITY',
        releaseConfirmationReference: input.releaseConfirmationReference.trim(),
        effectiveEndIso: input.effectiveEndIso,
        verificationStatus: 'LENDER_OR_AUTHORITY_VERIFIED',
        updatedAt: now,
      };
      tx.saveCollateral(updated);
      return updated;
    });
  }

  public async calculateLtvFromVerifiedInputs(
    actor: PropertyFinancingActorContext,
    input: {
      financingId: string;
      loanAmountBasis: 'ORIGINAL_LOAN_AMOUNT' | 'CURRENT_OUTSTANDING_BALANCE';
      propertyValuationReference: string;
      valuationBasis: LtvValuationBasis;
    }
  ): Promise<LtvCalculationRecord> {
    const fin = this.store.getFinancing(input.financingId);
    if (!fin) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Financing "${input.financingId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, fin.propertyId, fin.id);

    // Do not use an asking price as if it were a verified valuation
    if (input.valuationBasis === 'UNVERIFIED_ASKING_PRICE') {
      throw new PropertyFinancingError(
        'ASKING_PRICE_NOT_VALID_VALUATION',
        'Listing asking prices must never be used as a property valuation input for LTV calculations.'
      );
    }

    const valCheck = await this.adapters.propertyValuation.verifyValuationRecord(input.propertyValuationReference);
    if (!valCheck.valid || !valCheck.valueRials || valCheck.valueRials <= 0 || valCheck.isStale) {
      throw new PropertyFinancingError(
        'STALE_OR_MISSING_VALUATION',
        `Valuation reference "${input.propertyValuationReference}" is missing, invalid, or stale.`
      );
    }

    const loanAmountUsed =
      input.loanAmountBasis === 'CURRENT_OUTSTANDING_BALANCE' &&
      fin.verifiedCurrentPrincipalBalanceRials !== undefined
        ? fin.verifiedCurrentPrincipalBalanceRials
        : fin.originalPrincipalRials;

    const rawLtv = (loanAmountUsed / valCheck.valueRials) * 100;
    const ltvPercentage = Math.round(rawLtv * 100) / 100;

    return this.store.runTransaction((tx) => {
      const calc: LtvCalculationRecord = {
        id: makeFinId('fin_ltv'),
        financingId: fin.id,
        propertyId: fin.propertyId,
        loanAmountUsedRials: loanAmountUsed,
        loanAmountBasis: input.loanAmountBasis,
        propertyValueUsedRials: valCheck.valueRials!,
        propertyValuationReference: input.propertyValuationReference,
        valuationBasis: input.valuationBasis as Exclude<LtvValuationBasis, 'UNVERIFIED_ASKING_PRICE'>,
        valuationDateIso: valCheck.valuationDateIso!,
        currency: 'IRR',
        calculatedAtIso: new Date().toISOString(),
        formulaVersion: 'LTV_STANDARD_V1',
        ltvPercentage,
        dataProvenance: `Valuation:${input.propertyValuationReference}`,
        limitations: [
          'Informational LTV ratio only; not an official lender underwriting ratio or loan eligibility approval.',
        ],
        isOfficialLenderUnderwritingRatio: false,
        decidesFinancingEligibility: false,
      };
      tx.saveLtvCalculation(calc);
      return calc;
    });
  }

  public async registerFinancingOffer(
    actor: PropertyFinancingActorContext,
    input: {
      providerId: string;
      propertyId?: string;
      financingType: PropertyFinancingType;
      principalAmountRials: number;
      annualInterestRatePercent: number;
      rateStructure: 'FIXED' | 'VARIABLE';
      durationMonths: number;
      documentedFeesRials: number;
      requiredCollateralSummary: string;
      eligibilityConditions: string[];
      expirationDateIso: string;
      offerStage: FinancingOfferStage;
      sourceReference: string;
    }
  ): Promise<FinancingOfferRecord> {
    if (actor.role === 'UNRELATED_USER') {
      throw new PropertyFinancingError('UNAUTHORIZED_FINANCING_ACCESS', 'Unauthorized user cannot register offers.', 403);
    }
    return this.store.runTransaction((tx) => {
      const offer: FinancingOfferRecord = {
        id: makeFinId('fin_offer'),
        providerId: input.providerId,
        propertyId: input.propertyId,
        financingType: input.financingType,
        principalAmountRials: input.principalAmountRials,
        annualInterestRatePercent: input.annualInterestRatePercent,
        rateStructure: input.rateStructure,
        durationMonths: input.durationMonths,
        documentedFeesRials: input.documentedFeesRials,
        requiredCollateralSummary: input.requiredCollateralSummary,
        eligibilityConditions: input.eligibilityConditions,
        expirationDateIso: input.expirationDateIso,
        offerStage: input.offerStage,
        sourceReference: input.sourceReference,
        verificationStatus:
          actor.role === 'LENDER_OR_VERIFIER' ? 'LENDER_OR_AUTHORITY_VERIFIED' : 'DOCUMENT_SUPPORTED_UNVERIFIED',
        createdAt: new Date().toISOString(),
      };
      tx.saveOffer(offer);
      return offer;
    });
  }

  public compareDocumentedFinancingOffers(
    actor: PropertyFinancingActorContext,
    offerIds: string[],
    asOfIso?: string
  ): FinancingOfferComparisonReport {
    if (actor.role === 'UNRELATED_USER') {
      throw new PropertyFinancingError('UNAUTHORIZED_FINANCING_ACCESS', 'Unauthorized user cannot compare offers.', 403);
    }
    const nowIso = asOfIso ?? new Date().toISOString();
    const nowMs = new Date(nowIso).getTime();

    const items: FinancingOfferComparisonItem[] = offerIds.map((id) => {
      const offer = this.store.getOffer(id);
      if (!offer) {
        throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Financing offer "${id}" not found.`, 404);
      }
      const years = offer.durationMonths / 12;
      const simpleInterestRials = Math.round(
        offer.principalAmountRials * (offer.annualInterestRatePercent / 100) * years
      );
      const totalEstimatedSimpleRepaymentRials =
        offer.principalAmountRials + simpleInterestRials + offer.documentedFeesRials;
      const missingFlags: string[] = [];
      if (!offer.requiredCollateralSummary.trim()) missingFlags.push('MISSING_COLLATERAL_DETAILS');
      if (offer.eligibilityConditions.length === 0) missingFlags.push('MISSING_ELIGIBILITY_CONDITIONS');

      return {
        offerId: offer.id,
        providerId: offer.providerId,
        annualInterestRatePercent: offer.annualInterestRatePercent,
        rateStructure: offer.rateStructure,
        durationMonths: offer.durationMonths,
        documentedFeesRials: offer.documentedFeesRials,
        totalEstimatedSimpleRepaymentRials,
        repaymentAssumptions: 'Simple non-compounded baseline comparison (principal + annualRate * years + documentedFees)',
        requiredCollateralSummary: offer.requiredCollateralSummary,
        expirationDateIso: offer.expirationDateIso,
        isExpiredAsOfComparison: new Date(offer.expirationDateIso).getTime() < nowMs,
        missingInformationFlags: missingFlags,
        sourceProvenance: offer.sourceReference,
      };
    });

    return {
      comparedAtIso: nowIso,
      offers: items,
      guaranteesApplicantEligibility: false,
      guaranteesFinancialOutcome: false,
    };
  }
}
