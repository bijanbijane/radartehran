import assert from 'node:assert/strict';
import {
  createPropertyFinancingModuleFacade,
  PropertyFinancingActorContext,
  PropertyFinancingError,
} from '../index';

const lenderActor: PropertyFinancingActorContext = {
  userId: 'user-lender-1',
  role: 'LENDER_OR_VERIFIER',
  partyId: 'party-lender-1',
};
const borrowerActor: PropertyFinancingActorContext = {
  userId: 'user-borrower-1',
  role: 'PRIMARY_BORROWER',
  partyId: 'party-borrower-1',
  authorizedPropertyIds: ['prop-tehran-202'],
};
const brokerActor: PropertyFinancingActorContext = {
  userId: 'user-broker-1',
  role: 'AUTHORIZED_INTERMEDIARY_OR_BROKER',
  partyId: 'party-broker-1',
  authorizedPropertyIds: ['prop-tehran-202'],
};
const unrelatedActor: PropertyFinancingActorContext = {
  userId: 'user-stranger-99',
  role: 'UNRELATED_USER',
  partyId: 'party-stranger-99',
};

async function runPropertyFinancingTests(): Promise<void> {
  const facade = createPropertyFinancingModuleFacade();
  const {
    providerApplicationAndFinancingService,
    repaymentCollateralLtvAndComparisonService,
    refinancingPayoffRiskAndHistoryService,
    store,
  } = facade;

  // 3. Provider reference validation & 21. Idempotency
  const provider = await providerApplicationAndFinancingService.registerFinancingProviderReference(lenderActor, {
    providerName: 'Synthetic Housing Bank (Test Fixture)',
    providerType: 'BANK',
    jurisdictionCitySlug: 'tehran',
    officialRegistrationReference: 'CBI-SYNTH-REG-202',
    requestedVerificationStatus: 'VERIFIED_PROVIDER',
    sourceProvenance: 'SYNTHETIC_TEST_FIXTURE',
    isSyntheticTestFixture: true,
    idempotencyKey: 'idem-prov-1',
  });
  assert.equal(provider.verificationStatus, 'VERIFIED_PROVIDER');

  const providerDup = await providerApplicationAndFinancingService.registerFinancingProviderReference(lenderActor, {
    providerName: 'Synthetic Housing Bank (Test Fixture)',
    providerType: 'BANK',
    jurisdictionCitySlug: 'tehran',
    officialRegistrationReference: 'CBI-SYNTH-REG-202',
    requestedVerificationStatus: 'VERIFIED_PROVIDER',
    sourceProvenance: 'SYNTHETIC_TEST_FIXTURE',
    idempotencyKey: 'idem-prov-1',
  });
  assert.equal(providerDup.id, provider.id);

  await assert.rejects(
    () =>
      providerApplicationAndFinancingService.registerFinancingProviderReference(borrowerActor, {
        providerName: 'Unverified Self-Claimed Bank',
        providerType: 'BANK',
        jurisdictionCitySlug: 'tehran',
        requestedVerificationStatus: 'VERIFIED_PROVIDER',
        sourceProvenance: 'USER_INPUT',
      }),
    (err: unknown) => err instanceof PropertyFinancingError && err.code === 'INVALID_PROVIDER_REFERENCE'
  );

  // 4. Financing application lifecycle & 5. Preliminary vs final approval
  const app = await providerApplicationAndFinancingService.createFinancingApplication(borrowerActor, {
    propertyId: 'prop-tehran-202',
    providerId: provider.id,
    applicantPartyId: borrowerActor.partyId,
    financingType: 'RESIDENTIAL_MORTGAGE',
    jurisdictionCitySlug: 'tehran',
    requestedPrincipalRials: 15_000_000_000,
    isSyntheticTestFixture: true,
    idempotencyKey: 'idem-app-1',
  });
  assert.equal(app.status, 'DRAFT');
  assert.equal(app.preApprovalGuaranteesFinancing, false);

  await providerApplicationAndFinancingService.recordApplicationStatus(borrowerActor, {
    applicationId: app.id,
    targetStatus: 'SUBMITTED',
    reason: 'Applicant submitted forms',
  });
  await providerApplicationAndFinancingService.recordApplicationStatus(lenderActor, {
    applicationId: app.id,
    targetStatus: 'UNDER_REVIEW',
    reason: 'Underwriting started',
  });
  const preApprovedApp = await providerApplicationAndFinancingService.recordApplicationStatus(lenderActor, {
    applicationId: app.id,
    targetStatus: 'PRE_APPROVED',
    reason: 'Preliminary income review',
  });
  assert.equal(preApprovedApp.status, 'PRE_APPROVED');
  assert.equal(preApprovedApp.preApprovalGuaranteesFinancing, false);

  // Applicant cannot self-approve a loan
  await assert.rejects(
    () =>
      providerApplicationAndFinancingService.recordApplicationStatus(borrowerActor, {
        applicationId: app.id,
        targetStatus: 'APPROVED',
        reason: 'Self approval attempt',
      }),
    (err: unknown) =>
      err instanceof PropertyFinancingError &&
      err.code === 'LENDER_CONFIRMATION_REQUIRED_FOR_APPROVAL_OR_FUNDING'
  );

  const approvedApp = await providerApplicationAndFinancingService.recordApplicationStatus(lenderActor, {
    applicationId: app.id,
    targetStatus: 'APPROVED',
    lenderConfirmationReference: 'SYNTH-LENDER-APPROVAL-501',
    reason: 'Credit committee approval',
  });
  assert.equal(approvedApp.status, 'APPROVED');

  // 1. Financing record creation & 2. Invalid property reference
  await assert.rejects(
    () =>
      providerApplicationAndFinancingService.registerFinancingRecord(borrowerActor, {
        propertyId: 'invalid-prop-404',
        providerId: provider.id,
        primaryBorrowerPartyId: borrowerActor.partyId,
        financingType: 'RESIDENTIAL_MORTGAGE',
        jurisdictionCitySlug: 'tehran',
        originalPrincipalRials: 15_000_000_000,
        durationMonths: 120,
        originationDateIso: '2026-02-01T00:00:00.000Z',
        maturityDateIso: '2036-02-01T00:00:00.000Z',
      }),
    (err: unknown) => err instanceof PropertyFinancingError && err.code === 'INVALID_PROPERTY_REFERENCE'
  );

  const financing = await providerApplicationAndFinancingService.registerFinancingRecord(lenderActor, {
    propertyId: 'prop-tehran-202',
    providerId: provider.id,
    applicationId: approvedApp.id,
    primaryBorrowerPartyId: borrowerActor.partyId,
    financingType: 'RESIDENTIAL_MORTGAGE',
    jurisdictionCitySlug: 'tehran',
    loanAccountReference: 'SYNTH-LOAN-202',
    originalPrincipalRials: 15_000_000_000,
    verifiedCurrentPrincipalBalanceRials: 15_000_000_000,
    durationMonths: 120,
    originationDateIso: '2026-02-01T00:00:00.000Z',
    maturityDateIso: '2036-02-01T00:00:00.000Z',
    isSyntheticTestFixture: true,
    idempotencyKey: 'idem-fin-1',
  });
  assert.equal(financing.provesPropertyOwnership, false);
  assert.equal(financing.verificationStatus, 'LENDER_OR_AUTHORITY_VERIFIED');

  // 22. Concurrent loan updates
  await providerApplicationAndFinancingService.updateFinancingPrincipalBalance(lenderActor, {
    financingId: financing.id,
    expectedVersion: 1,
    newVerifiedBalanceRials: 14_500_000_000,
    sourceReference: 'LEDGER-SYNC-1',
  });
  await assert.rejects(
    () =>
      providerApplicationAndFinancingService.updateFinancingPrincipalBalance(lenderActor, {
        financingId: financing.id,
        expectedVersion: 1,
        newVerifiedBalanceRials: 14_000_000_000,
        sourceReference: 'STALE-SYNC',
      }),
    (err: unknown) => err instanceof PropertyFinancingError && err.code === 'CONCURRENCY_CONFLICT'
  );

  // 6. Borrower relationship authorization (guarantor requires contractual document)
  await assert.rejects(
    () =>
      providerApplicationAndFinancingService.registerBorrowerRelationship(lenderActor, {
        financingId: financing.id,
        partyId: 'party-guarantor-1',
        role: 'GUARANTOR',
        effectiveStartIso: '2026-02-01T00:00:00.000Z',
        authorizationReference: 'AUTH-GUAR-1',
      }),
    (err: unknown) => err instanceof PropertyFinancingError && err.code === 'GUARANTOR_REQUIRES_CONTRACTUAL_DOCUMENT'
  );

  const guarantorRel = await providerApplicationAndFinancingService.registerBorrowerRelationship(lenderActor, {
    financingId: financing.id,
    partyId: 'party-guarantor-1',
    role: 'GUARANTOR',
    effectiveStartIso: '2026-02-01T00:00:00.000Z',
    authorizationReference: 'AUTH-GUAR-1',
    contractualGuaranteeDocumentId: 'doc-guar-contract-1',
  });
  assert.equal(guarantorRel.assumesOwnerIsBorrower, false);
  assert.equal(guarantorRel.assumesBorrowerIsOwner, false);

  // 7. Loan term validation (protecting contractual terms from silent overwrite)
  await providerApplicationAndFinancingService.recordLoanTerms(lenderActor, {
    financingId: financing.id,
    termCategory: 'PREPAYMENT_CONDITIONS',
    termValue: '2% penalty within first 24 months',
    effectiveStartIso: '2026-02-01T00:00:00.000Z',
    epistemicStage: 'CONTRACTUAL_TERMS',
  });
  await assert.rejects(
    () =>
      providerApplicationAndFinancingService.recordLoanTerms(lenderActor, {
        financingId: financing.id,
        termCategory: 'PREPAYMENT_CONDITIONS',
        termValue: 'Updated promotional quote',
        effectiveStartIso: '2026-03-01T00:00:00.000Z',
        epistemicStage: 'QUOTED_TERMS',
        attemptOverwriteContractualInPlace: true,
      }),
    (err: unknown) =>
      err instanceof PropertyFinancingError &&
      err.code === 'CONTRACTUAL_TERMS_CANNOT_BE_SILENTLY_OVERWRITTEN'
  );

  // 8. Interest rate classification
  await assert.rejects(
    () =>
      providerApplicationAndFinancingService.recordInterestRate(borrowerActor, {
        financingId: financing.id,
        annualRatePercent: 23,
        rateStructure: 'FIXED',
        rateBasis: 'Borrower Estimate',
        effectiveDateIso: '2026-02-01T00:00:00.000Z',
        epistemicStage: 'CONTRACTUAL_RATE',
        isEstimatedRate: true,
        sourceReference: 'USER_ESTIMATE',
      }),
    (err: unknown) =>
      err instanceof PropertyFinancingError && err.code === 'ESTIMATED_RATE_CANNOT_BE_MARKED_CONTRACTUAL'
  );

  const contractualRate = await providerApplicationAndFinancingService.recordInterestRate(lenderActor, {
    financingId: financing.id,
    annualRatePercent: 23,
    rateStructure: 'FIXED',
    rateBasis: 'CBI Housing Facility Tier 1',
    effectiveDateIso: '2026-02-01T00:00:00.000Z',
    epistemicStage: 'CONTRACTUAL_RATE',
    sourceReference: 'SYNTH-CONTRACT-202',
  });
  assert.equal(contractualRate.epistemicStage, 'CONTRACTUAL_RATE');

  // 9. Repayment schedule creation & 10. Contractual vs estimated schedule distinction
  await assert.rejects(
    () =>
      repaymentCollateralLtvAndComparisonService.registerRepaymentSchedule(borrowerActor, {
        financingId: financing.id,
        scheduleOrigin: 'CONTRACTUAL_SCHEDULE',
        installments: [],
        sourceProvenance: 'BORROWER_UPLOAD',
      }),
    (err: unknown) => err instanceof PropertyFinancingError && err.code === 'VALIDATION_FAILED'
  );

  const estimatedSched = await repaymentCollateralLtvAndComparisonService.registerRepaymentSchedule(borrowerActor, {
    financingId: financing.id,
    scheduleOrigin: 'ESTIMATED_SCHEDULE',
    installments: [
      {
        installmentNumber: 1,
        dueDateIso: '2026-03-01T00:00:00.000Z',
        principalComponentRials: 50_000_000,
        interestComponentRials: 280_000_000,
        documentedFeesComponentRials: 0,
        totalInstallmentRials: 330_000_000,
        remainingPrincipalReferenceRials: 14_950_000_000,
        paymentStatus: 'SCHEDULED',
      },
    ],
    sourceProvenance: 'BORROWER_CALCULATION',
  });
  assert.equal(estimatedSched.scheduleOrigin, 'ESTIMATED_SCHEDULE');

  const contractualSched = await repaymentCollateralLtvAndComparisonService.registerRepaymentSchedule(lenderActor, {
    financingId: financing.id,
    scheduleOrigin: 'CONTRACTUAL_SCHEDULE',
    installments: estimatedSched.installments,
    sourceProvenance: 'SYNTH-LENDER-SCHEDULE-202',
  });
  assert.equal(contractualSched.scheduleOrigin, 'CONTRACTUAL_SCHEDULE');

  await assert.rejects(
    () =>
      repaymentCollateralLtvAndComparisonService.recordInstallmentStatusReference(borrowerActor, {
        scheduleId: contractualSched.id,
        installmentNumber: 1,
        targetStatus: 'PAID_CONFIRMED',
      }),
    (err: unknown) =>
      err instanceof PropertyFinancingError &&
      err.code === 'PAYMENT_CONFIRMATION_REQUIRED_FOR_INSTALLMENT_PAID'
  );

  const paidSched = await repaymentCollateralLtvAndComparisonService.recordInstallmentStatusReference(lenderActor, {
    scheduleId: contractualSched.id,
    installmentNumber: 1,
    targetStatus: 'PAID_CONFIRMED',
    externalPaymentConfirmationRef: 'confirmed-inst-1',
  });
  assert.equal(paidSched.installments[0].paymentStatus, 'PAID_CONFIRMED');

  // 11. Collateral registration reference
  await assert.rejects(
    () =>
      repaymentCollateralLtvAndComparisonService.registerCollateralReference(borrowerActor, {
        financingId: financing.id,
        collateralType: 'MORTGAGE_DEED',
        effectiveStartIso: '2026-02-01T00:00:00.000Z',
        requestedStatus: 'REGISTERED_SECURITY',
      }),
    (err: unknown) =>
      err instanceof PropertyFinancingError && err.code === 'COLLATERAL_REGISTRATION_REQUIRES_OFFICIAL_REF'
  );

  const collateral = await repaymentCollateralLtvAndComparisonService.registerCollateralReference(lenderActor, {
    financingId: financing.id,
    collateralType: 'MORTGAGE_DEED',
    documentedSecurityAmountRials: 20_000_000_000,
    securityRegistrationReference: 'SYNTH-DEED-REG-901',
    registrationAuthorityReference: 'NOTARY-OFFICE-112',
    effectiveStartIso: '2026-02-01T00:00:00.000Z',
    requestedStatus: 'REGISTERED_SECURITY',
  });
  assert.equal(collateral.status, 'REGISTERED_SECURITY');
  assert.equal(collateral.determinesLegalPriorityOrEnforceability, false);

  // 12. LTV calculation with verified inputs & 13. LTV with missing/stale valuation or asking price
  await assert.rejects(
    () =>
      repaymentCollateralLtvAndComparisonService.calculateLtvFromVerifiedInputs(borrowerActor, {
        financingId: financing.id,
        loanAmountBasis: 'ORIGINAL_LOAN_AMOUNT',
        propertyValuationReference: 'val-tehran-202',
        valuationBasis: 'UNVERIFIED_ASKING_PRICE',
      }),
    (err: unknown) => err instanceof PropertyFinancingError && err.code === 'ASKING_PRICE_NOT_VALID_VALUATION'
  );

  await assert.rejects(
    () =>
      repaymentCollateralLtvAndComparisonService.calculateLtvFromVerifiedInputs(borrowerActor, {
        financingId: financing.id,
        loanAmountBasis: 'ORIGINAL_LOAN_AMOUNT',
        propertyValuationReference: 'stale-val-2020',
        valuationBasis: 'VERIFIED_PROPERTY_VALUE',
      }),
    (err: unknown) => err instanceof PropertyFinancingError && err.code === 'STALE_OR_MISSING_VALUATION'
  );

  const ltvCalc = await repaymentCollateralLtvAndComparisonService.calculateLtvFromVerifiedInputs(borrowerActor, {
    financingId: financing.id,
    loanAmountBasis: 'ORIGINAL_LOAN_AMOUNT',
    propertyValuationReference: 'val-tehran-202',
    valuationBasis: 'OFFICIAL_LENDER_VALUATION',
  });
  assert.equal(ltvCalc.ltvPercentage, 30); // 15B / 50B * 100 = 30%
  assert.equal(ltvCalc.isOfficialLenderUnderwritingRatio, false);
  assert.equal(ltvCalc.decidesFinancingEligibility, false);

  // 14. Financing offer comparison
  const offerA = await repaymentCollateralLtvAndComparisonService.registerFinancingOffer(lenderActor, {
    providerId: provider.id,
    financingType: 'RESIDENTIAL_MORTGAGE',
    principalAmountRials: 15_000_000_000,
    annualInterestRatePercent: 23,
    rateStructure: 'FIXED',
    durationMonths: 120,
    documentedFeesRials: 150_000_000,
    requiredCollateralSummary: 'First-ranking residential mortgage deed',
    eligibilityConditions: ['Bond holding period completed'],
    expirationDateIso: '2027-01-01T00:00:00.000Z',
    offerStage: 'PERSONALIZED_QUOTE',
    sourceReference: 'SYNTH-OFFER-A',
  });
  const offerB = await repaymentCollateralLtvAndComparisonService.registerFinancingOffer(lenderActor, {
    providerId: provider.id,
    financingType: 'RESIDENTIAL_MORTGAGE',
    principalAmountRials: 15_000_000_000,
    annualInterestRatePercent: 20,
    rateStructure: 'VARIABLE',
    durationMonths: 60,
    documentedFeesRials: 250_000_000,
    requiredCollateralSummary: '',
    eligibilityConditions: [],
    expirationDateIso: '2025-01-01T00:00:00.000Z',
    offerStage: 'ADVERTISED_OFFER',
    sourceReference: 'SYNTH-OFFER-B',
  });
  const comparison = repaymentCollateralLtvAndComparisonService.compareDocumentedFinancingOffers(
    borrowerActor,
    [offerA.id, offerB.id],
    '2026-06-01T00:00:00.000Z'
  );
  assert.equal(comparison.guaranteesApplicantEligibility, false);
  assert.equal(comparison.offers[1].isExpiredAsOfComparison, true);
  assert.ok(comparison.offers[1].missingInformationFlags.includes('MISSING_COLLATERAL_DETAILS'));

  // 15. Refinancing lifecycle (approving refinancing does NOT close old loan)
  const refi = await refinancingPayoffRiskAndHistoryService.createRefinancingRecord(borrowerActor, {
    existingFinancingId: financing.id,
    currentTermsSummary: '23% fixed 120m',
    proposedNewTermsSummary: '18% fixed 96m',
    estimatedCostsRials: 120_000_000,
    documentedFeesRials: 80_000_000,
    sourceReference: 'SYNTH-REFI-1',
  });
  const refiApproved = await refinancingPayoffRiskAndHistoryService.recordRefinancingOutcome(lenderActor, {
    refinancingId: refi.id,
    targetStatus: 'APPROVED',
    sourceReference: 'SYNTH-REFI-APPROVAL-1',
  });
  assert.equal(refiApproved.refinancing.status, 'APPROVED');
  assert.equal(refiApproved.existingLoan.status, 'ACTIVE');

  // 16. Payoff quote vs confirmed payoff, 17. Loan closure authorization, & 18. Collateral release distinction
  const payoffSubmitted = await refinancingPayoffRiskAndHistoryService.createPayoffRecord(borrowerActor, {
    financingId: financing.id,
    payoffQuoteReference: 'SYNTH-PAYOFF-QUOTE-1',
    outstandingPrincipalRials: 14_500_000_000,
    accruedInterestRials: 90_000_000,
    documentedFeesRials: 10_000_000,
    documentedPenaltiesRials: 0,
    requestedStatus: 'PAYOFF_PAYMENT_SUBMITTED',
  });
  assert.equal(payoffSubmitted.financing.status, 'ACTIVE'); // Not closed on payment submission!

  await assert.rejects(
    () =>
      refinancingPayoffRiskAndHistoryService.recordLoanClosure(borrowerActor, {
        payoffId: payoffSubmitted.payoff.id,
        externalPaymentConfirmationRef: 'confirmed-payoff-1',
        providerClosureConfirmationRef: 'SELF-CLOSE',
        payoffDateIso: '2026-07-01T00:00:00.000Z',
      }),
    (err: unknown) => err instanceof PropertyFinancingError && err.code === 'CLOSURE_REQUIRES_PROVIDER_CONFIRMATION'
  );

  const closureResult = await refinancingPayoffRiskAndHistoryService.recordLoanClosure(lenderActor, {
    payoffId: payoffSubmitted.payoff.id,
    externalPaymentConfirmationRef: 'confirmed-payoff-1',
    providerClosureConfirmationRef: 'SYNTH-BANK-CLOSURE-CERT-77',
    payoffDateIso: '2026-07-01T00:00:00.000Z',
  });
  assert.equal(closureResult.financing.status, 'CLOSED');
  assert.equal(closureResult.collateralAutomaticallyReleased, false);
  assert.equal(store.getCollateral(collateral.id)?.status, 'REGISTERED_SECURITY');

  const releasedCollateral = await repaymentCollateralLtvAndComparisonService.recordCollateralRelease(lenderActor, {
    collateralId: collateral.id,
    releaseConfirmationReference: 'SYNTH-NOTARY-RELEASE-901',
    effectiveEndIso: '2026-07-05T00:00:00.000Z',
  });
  assert.equal(releasedCollateral.status, 'RELEASED_SECURITY');

  // 19. Unauthorized financing access prevention & 20. Sensitive financial data protection
  const restrictedDoc = await refinancingPayoffRiskAndHistoryService.registerFinancingDocumentReference(borrowerActor, {
    financingId: financing.id,
    documentCategory: 'MORTGAGE_CONTRACT',
    issuingProviderName: 'Synthetic Housing Bank',
    sourceProvenance: 'SIGNED_CONTRACT_SCAN',
    mediaReferenceId: 'media-mortgage-contract-1',
    restrictedConfidentiality: true,
  });
  assert.throws(
    () => refinancingPayoffRiskAndHistoryService.retrieveFinancingDocumentReference(brokerActor, restrictedDoc.id),
    (err: unknown) => err instanceof PropertyFinancingError && err.code === 'RESTRICTED_DOCUMENT_ACCESS_DENIED'
  );
  assert.throws(
    () => providerApplicationAndFinancingService.retrieveFinancingApplication(unrelatedActor, app.id),
    (err: unknown) => err instanceof PropertyFinancingError && err.code === 'UNAUTHORIZED_FINANCING_ACCESS'
  );

  // 23. Persistence failure handling, 24. Pagination limits, & 25. Prevention of cross-module direct writes
  const histPage = refinancingPayoffRiskAndHistoryService.retrieveFinancingHistory(
    borrowerActor,
    'prop-tehran-202',
    500,
    0
  );
  assert.equal(histPage.limit, 50);
  assert.ok(histPage.total >= 6);

  store.setSimulatePersistenceFailure(true);
  await assert.rejects(
    () =>
      refinancingPayoffRiskAndHistoryService.recordFinancingRiskIndicator(lenderActor, {
        financingId: financing.id,
        category: 'VARIABLE_RATE_EXPOSURE',
        severity: 'MODERATE',
        epistemicNature: 'POTENTIAL_RISK',
        ruleReference: 'RULE-VAR-1',
        inputProvenance: 'CONTRACT_RATE',
        limitations: 'Test rollback',
      }),
    (err: unknown) => err instanceof PropertyFinancingError && err.code === 'PERSISTENCE_FAILURE'
  );
  store.setSimulatePersistenceFailure(false);

  assert.throws(
    () => store.attemptDirectCrossModuleWrite('properties'),
    (err: unknown) => err instanceof PropertyFinancingError && err.code === 'CROSS_MODULE_WRITE_FORBIDDEN'
  );

  console.log('All 25 Property Mortgage & Financing Backend tests passed!');
}

runPropertyFinancingTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
