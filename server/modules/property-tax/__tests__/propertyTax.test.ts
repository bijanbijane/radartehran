import assert from 'node:assert/strict';
import { createPropertyTaxModuleFacade, PropertyTaxActorContext, PropertyTaxError } from '../index';

const adminActor: PropertyTaxActorContext = {
  userId: 'user-tax-admin-1',
  role: 'AUTHORITY_VERIFIER_OR_ADMIN',
  partyId: 'party-admin-1',
};
const ownerActor: PropertyTaxActorContext = {
  userId: 'user-owner-1',
  role: 'PROPERTY_OWNER',
  partyId: 'party-owner-1',
  authorizedPropertyIds: ['prop-tehran-101'],
};
const managerActor: PropertyTaxActorContext = {
  userId: 'user-mgr-1',
  role: 'PROPERTY_MANAGER',
  partyId: 'party-mgr-1',
  authorizedPropertyIds: ['prop-tehran-101'],
};
const unrelatedActor: PropertyTaxActorContext = {
  userId: 'user-stranger-99',
  role: 'UNRELATED_USER',
  partyId: 'party-stranger-99',
};
const period1404 = {
  fiscalYearLabel: '1404',
  periodStartIso: '2025-03-21T00:00:00.000Z',
  periodEndIso: '2026-03-20T23:59:59.000Z',
};

async function runPropertyTaxTests(): Promise<void> {
  const facade = createPropertyTaxModuleFacade();
  const { authorityAndAssessmentService, obligationBillPaymentService, exemptionDisputeReportingService, store } =
    facade;

  // 3. Authority reference validation (verified vs user-reported)
  const verifiedAuth = await authorityAndAssessmentService.registerTaxAuthorityReference(adminActor, {
    authorityName: 'Tehran Municipal Revenue Authority (Synthetic Fixture)',
    authorityType: 'MUNICIPAL_GOVERNMENT',
    jurisdiction: { citySlug: 'tehran', districtCode: '03', legalRegulatorySourceRef: 'rule-mun-1404' },
    officialSourceReference: 'rule-mun-1404',
    requestedVerificationStatus: 'VERIFIED_AUTHORITY',
    sourceProvenance: 'SYNTHETIC_TEST_FIXTURE',
    isSyntheticTestFixture: true,
    idempotencyKey: 'idem-auth-1',
  });
  assert.equal(verifiedAuth.verificationStatus, 'VERIFIED_AUTHORITY');

  await assert.rejects(
    () =>
      authorityAndAssessmentService.registerTaxAuthorityReference(ownerActor, {
        authorityName: 'Unverified Claimed Authority',
        authorityType: 'NATIONAL_TAX_AUTHORITY',
        jurisdiction: { citySlug: 'tehran' },
        requestedVerificationStatus: 'VERIFIED_AUTHORITY',
        sourceProvenance: 'USER_INPUT',
      }),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'INVALID_AUTHORITY_REFERENCE'
  );

  // 1. Tax record creation & 22. Idempotency
  const taxRec1 = await authorityAndAssessmentService.registerPropertyTaxRecord(ownerActor, {
    propertyId: 'prop-tehran-101',
    taxAuthorityId: verifiedAuth.id,
    jurisdiction: { citySlug: 'tehran', districtCode: '03' },
    taxCategory: 'ANNUAL_PROPERTY_TAX',
    taxpayerPartyId: ownerActor.partyId,
    taxPeriod: period1404,
    taxAccountReference: 'SYNTH-ACCT-101',
    isSyntheticTestFixture: true,
    idempotencyKey: 'idem-taxrec-1',
  });
  assert.equal(taxRec1.provesLegalOwnership, false);
  assert.equal(taxRec1.verificationStatus, 'UNVERIFIED_USER_REPORTED');

  const taxRecDup = await authorityAndAssessmentService.registerPropertyTaxRecord(ownerActor, {
    propertyId: 'prop-tehran-101',
    taxAuthorityId: verifiedAuth.id,
    jurisdiction: { citySlug: 'tehran', districtCode: '03' },
    taxCategory: 'ANNUAL_PROPERTY_TAX',
    taxpayerPartyId: ownerActor.partyId,
    taxPeriod: period1404,
    idempotencyKey: 'idem-taxrec-1',
  });
  assert.equal(taxRecDup.id, taxRec1.id);

  // 2. Invalid property reference
  await assert.rejects(
    () =>
      authorityAndAssessmentService.registerPropertyTaxRecord(ownerActor, {
        propertyId: 'invalid-prop-999',
        taxAuthorityId: verifiedAuth.id,
        jurisdiction: { citySlug: 'tehran' },
        taxCategory: 'ANNUAL_PROPERTY_TAX',
        taxpayerPartyId: ownerActor.partyId,
        taxPeriod: period1404,
      }),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'INVALID_PROPERTY_REFERENCE'
  );

  // 4. Assessment record creation & 5. Official vs estimated assessment distinction
  await assert.rejects(
    () =>
      authorityAndAssessmentService.registerTaxAssessment(adminActor, {
        propertyTaxRecordId: taxRec1.id,
        assessmentPeriod: period1404,
        assessmentDateIso: '2026-01-10T00:00:00.000Z',
        assessedAmountRials: 85_000_000,
        assessmentBasis: 'Hedonic Model Output',
        officialAssessmentIdentifier: 'SYNTH-ASSESS-01',
        classification: 'OFFICIAL_ASSESSMENT',
        derivedFromPlatformValuationModel: true,
      }),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'PLATFORM_VALUATION_NOT_OFFICIAL_ASSESSMENT'
  );

  const estimatedAssess = await authorityAndAssessmentService.registerTaxAssessment(ownerActor, {
    propertyTaxRecordId: taxRec1.id,
    assessmentPeriod: period1404,
    assessmentDateIso: '2026-01-10T00:00:00.000Z',
    assessedAmountRials: 70_000_000,
    assessmentBasis: 'Owner Estimate',
    classification: 'ESTIMATED_ASSESSMENT',
  });
  assert.equal(estimatedAssess.classification, 'ESTIMATED_ASSESSMENT');
  assert.equal(estimatedAssess.verificationStatus, 'UNVERIFIED_USER_REPORTED');

  const officialAssess = await authorityAndAssessmentService.registerTaxAssessment(adminActor, {
    propertyTaxRecordId: taxRec1.id,
    assessmentPeriod: period1404,
    assessmentDateIso: '2026-01-15T00:00:00.000Z',
    documentedTaxableValueRials: 8_500_000_000,
    assessedAmountRials: 85_000_000,
    assessmentBasis: 'Municipal Statutory Formula Block 12',
    officialAssessmentIdentifier: 'SYNTH-OFFICIAL-ASSESS-1404',
    classification: 'OFFICIAL_ASSESSMENT',
    idempotencyKey: 'idem-assess-1',
  });
  assert.equal(officialAssess.verificationStatus, 'OFFICIALLY_VERIFIED');
  assert.equal(officialAssess.usesPlatformValuationAsOfficialAssessment, false);
  assert.equal(officialAssess.assumesMarketValueEqualsTaxableValue, false);

  // 19. Corrected and superseded assessments & 23. Concurrent assessment updates
  const { supersededAssessment, replacementAssessment } =
    await authorityAndAssessmentService.correctOrSupersedeTaxAssessment(adminActor, {
      priorAssessmentId: officialAssess.id,
      expectedVersion: 1,
      newAssessedAmountRials: 80_000_000,
      newOfficialAssessmentIdentifier: 'SYNTH-OFFICIAL-ASSESS-1404-REV2',
      correctionReason: 'Clerical area adjustment from 142m2 to 136m2',
      classification: 'OFFICIAL_ASSESSMENT',
    });
  assert.equal(supersededAssessment.status, 'SUPERSEDED');
  assert.equal(supersededAssessment.assessedAmountRials, 85_000_000);
  assert.equal(replacementAssessment.status, 'CORRECTED');
  assert.equal(replacementAssessment.assessedAmountRials, 80_000_000);

  await assert.rejects(
    () =>
      authorityAndAssessmentService.correctOrSupersedeTaxAssessment(adminActor, {
        priorAssessmentId: officialAssess.id,
        expectedVersion: 1,
        newAssessedAmountRials: 75_000_000,
        correctionReason: 'Stale concurrent update',
        classification: 'OFFICIAL_ASSESSMENT',
      }),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'CONCURRENCY_CONFLICT'
  );

  // 6. Obligation lifecycle transitions (and blocking user-reported from being declared DUE)
  await assert.rejects(
    () =>
      obligationBillPaymentService.registerTaxObligation(ownerActor, {
        propertyTaxRecordId: taxRec1.id,
        taxCategory: 'ANNUAL_PROPERTY_TAX',
        taxPeriod: period1404,
        originalAmountRials: 50_000_000,
        dueDateIso: '2026-06-01T00:00:00.000Z',
        requestedStatus: 'DUE',
        epistemicClassification: 'USER_REPORTED_OBLIGATION',
        sourceReference: 'USER_ENTRY',
      }),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'USER_REPORTED_AMOUNT_NOT_LEGALLY_DUE'
  );

  const userReportedOb = await obligationBillPaymentService.registerTaxObligation(ownerActor, {
    propertyTaxRecordId: taxRec1.id,
    taxCategory: 'ANNUAL_PROPERTY_TAX',
    taxPeriod: period1404,
    originalAmountRials: 50_000_000,
    dueDateIso: '2026-06-01T00:00:00.000Z',
    requestedStatus: 'REPORTED',
    epistemicClassification: 'USER_REPORTED_OBLIGATION',
    sourceReference: 'USER_ENTRY',
  });
  assert.equal(userReportedOb.status, 'REPORTED');

  const officialOb = await obligationBillPaymentService.registerTaxObligation(adminActor, {
    propertyTaxRecordId: taxRec1.id,
    assessmentId: replacementAssessment.id,
    taxCategory: 'ANNUAL_PROPERTY_TAX',
    taxPeriod: period1404,
    originalAmountRials: 80_000_000,
    dueDateIso: '2026-03-01T00:00:00.000Z',
    requestedStatus: 'ASSESSED',
    epistemicClassification: 'OFFICIALLY_ASSESSED_OBLIGATION',
    sourceReference: replacementAssessment.officialAssessmentIdentifier!,
    idempotencyKey: 'idem-ob-1',
  });
  const dueOb = await obligationBillPaymentService.transitionTaxObligationStatus(adminActor, {
    obligationId: officialOb.id,
    targetStatus: 'DUE',
    reason: 'Billing notice issued',
  });
  assert.equal(dueOb.status, 'DUE');

  // 7. Bill registration (with idempotency)
  const bill1 = await obligationBillPaymentService.registerTaxBill(ownerActor, {
    propertyTaxRecordId: taxRec1.id,
    obligationId: dueOb.id,
    taxPeriod: period1404,
    issueDateIso: '2026-01-20T00:00:00.000Z',
    dueDateIso: '2026-03-01T00:00:00.000Z',
    originalAmountRials: 80_000_000,
    officiallyDocumentedFeesRials: 2_000_000,
    billKind: 'INITIAL',
    idempotencyKey: 'idem-bill-1',
  });
  assert.equal(bill1.totalPayableRials, 82_000_000);
  assert.equal(bill1.isAuthenticByUploadAlone, false);
  const billDup = await obligationBillPaymentService.registerTaxBill(ownerActor, {
    propertyTaxRecordId: taxRec1.id,
    taxPeriod: period1404,
    issueDateIso: '2026-01-20T00:00:00.000Z',
    dueDateIso: '2026-03-01T00:00:00.000Z',
    originalAmountRials: 80_000_000,
    idempotencyKey: 'idem-bill-1',
  });
  assert.equal(billDup.id, bill1.id);

  // 8. Municipal charge classification
  await assert.rejects(
    () =>
      obligationBillPaymentService.recordMunicipalCharge(ownerActor, {
        propertyId: 'prop-tehran-101',
        taxAuthorityId: verifiedAuth.id,
        chargeCategory: 'WASTE_COLLECTION_CHARGE',
        financialNature: 'TAX',
        chargePeriod: period1404,
        amountRials: 15_000_000,
        dueDateIso: '2026-04-01T00:00:00.000Z',
        chargeBasis: 'Annual Municipal Waste Service Tariff',
        sourceSupportsTaxClassification: false,
        sourceReference: 'MUN-WASTE-1404',
      }),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'INVALID_MUNICIPAL_CHARGE_CLASSIFICATION'
  );

  const wasteCharge = await obligationBillPaymentService.recordMunicipalCharge(adminActor, {
    propertyId: 'prop-tehran-101',
    taxAuthorityId: verifiedAuth.id,
    chargeCategory: 'WASTE_COLLECTION_CHARGE',
    financialNature: 'MUNICIPAL_SERVICE_CHARGE',
    chargePeriod: period1404,
    amountRials: 15_000_000,
    dueDateIso: '2026-04-01T00:00:00.000Z',
    chargeBasis: 'Annual Municipal Waste Service Tariff',
    sourceSupportsTaxClassification: false,
    sourceReference: 'MUN-WASTE-1404',
  });
  assert.equal(wasteCharge.financialNature, 'MUNICIPAL_SERVICE_CHARGE');

  // 10. Uploaded receipt not automatically confirming payment
  const uploadedReceiptResult = await obligationBillPaymentService.recordPaymentStatusReference(ownerActor, {
    obligationId: dueOb.id,
    billId: bill1.id,
    amountRials: 80_000_000,
    paymentDateIso: '2026-02-01T10:00:00.000Z',
    paymentMethodReference: 'BANK_TRANSFER_RECEIPT_SCAN',
    receiptDocumentId: 'doc-receipt-scan-1',
    requestedStatus: 'PAYMENT_RECEIPT_UPLOADED',
    sourceProvenance: 'USER_UPLOADED_RECEIPT',
  });
  assert.equal(uploadedReceiptResult.paymentReference.paymentStatus, 'PAYMENT_RECEIPT_UPLOADED');
  assert.equal(uploadedReceiptResult.updatedObligation.status, 'DUE');

  await assert.rejects(
    () =>
      obligationBillPaymentService.recordPaymentStatusReference(ownerActor, {
        obligationId: dueOb.id,
        amountRials: 80_000_000,
        paymentDateIso: '2026-02-01T10:00:00.000Z',
        paymentMethodReference: 'SELF_CLAIMED',
        requestedStatus: 'PAYMENT_CONFIRMED_BY_AUTHORITY',
        sourceProvenance: 'USER_CLAIM',
      }),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'RECEIPT_UPLOAD_DOES_NOT_CONFIRM_PAYMENT'
  );

  await assert.rejects(
    () =>
      obligationBillPaymentService.recordPaymentStatusReference(adminActor, {
        obligationId: dueOb.id,
        amountRials: 80_000_000,
        paymentDateIso: '2026-02-01T10:00:00.000Z',
        paymentMethodReference: 'GATEWAY_REF',
        externalPaymentsModuleRef: 'unconfirmed-pay-999',
        requestedStatus: 'PAYMENT_CONFIRMED_BY_AUTHORITY',
        sourceProvenance: 'PAYMENTS_ADAPTER',
      }),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'PAYMENT_VERIFICATION_FAILED'
  );

  // 9. Payment status verification
  const partialConfirmed = await obligationBillPaymentService.recordPaymentStatusReference(adminActor, {
    obligationId: dueOb.id,
    billId: bill1.id,
    amountRials: 30_000_000,
    paymentDateIso: '2026-02-05T10:00:00.000Z',
    paymentMethodReference: 'SHAPARAK_TREASURY',
    externalPaymentsModuleRef: 'confirmed-pay-101',
    requestedStatus: 'PAYMENT_PARTIALLY_CONFIRMED',
    sourceProvenance: 'PAYMENTS_MODULE_VERIFIED',
    idempotencyKey: 'idem-pay-1',
  });
  assert.equal(partialConfirmed.updatedObligation.status, 'PARTIALLY_PAID');
  assert.equal(partialConfirmed.updatedObligation.confirmedPaidAmountRials, 30_000_000);

  // 11. Deadline validation
  await assert.rejects(
    () =>
      obligationBillPaymentService.recordTaxDeadline(ownerActor, {
        propertyId: 'prop-tehran-101',
        relatedRecordType: 'OBLIGATION',
        relatedRecordId: dueOb.id,
        deadlineType: 'ASSESSMENT_PAYMENT_DEADLINE',
        dueDateIso: '2027-03-01T00:00:00.000Z',
        jurisdiction: { citySlug: 'tehran' },
        epistemicBasis: 'OFFICIAL_DEADLINE',
        sourceReference: 'USER_GUESS',
        reminderEligible: true,
      }),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'UNVERIFIED_OFFICIAL_DEADLINE_REJECTED'
  );

  const officialDeadline = await obligationBillPaymentService.recordTaxDeadline(adminActor, {
    propertyId: 'prop-tehran-101',
    relatedRecordType: 'OBLIGATION',
    relatedRecordId: dueOb.id,
    deadlineType: 'ASSESSMENT_PAYMENT_DEADLINE',
    dueDateIso: '2027-03-01T00:00:00.000Z',
    jurisdiction: { citySlug: 'tehran', legalRegulatorySourceRef: 'rule-mun-1404' },
    epistemicBasis: 'OFFICIAL_DEADLINE',
    sourceReference: 'STATUTORY_DEADLINE_1404',
    reminderEligible: true,
    dispatchReminderForPartyId: ownerActor.partyId,
  });
  assert.equal(officialDeadline.reminderConfirmedByNotificationsModule, true);

  // 12. Exemption application, 13. Exemption approval authorization, & 14. Exemption expiration
  const exempApp = await exemptionDisputeReportingService.registerExemptionApplication(ownerActor, {
    propertyTaxRecordId: taxRec1.id,
    exemptionCategory: 'OWNER_OCCUPIER_RELIEF',
    eligibilityCriteriaReference: 'STATUTE_OWNER_OCCUPIER_ART_4',
    applicationDateIso: '2025-04-01T00:00:00.000Z',
    effectivePeriod: period1404,
    documentedExemptionPercentage: 25,
  });
  assert.equal(exempApp.status, 'APPLICATION_SUBMITTED');
  assert.equal(exempApp.determinedFromDemographicsAlone, false);

  await assert.rejects(
    () =>
      exemptionDisputeReportingService.recordExemptionDecision(ownerActor, {
        exemptionId: exempApp.id,
        decision: 'APPROVED_EXEMPTION',
        officialApprovalReference: 'SELF_APPROVAL',
      }),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'EXEMPTION_APPROVAL_REQUIRES_VERIFIER'
  );

  const approvedExemp = await exemptionDisputeReportingService.recordExemptionDecision(adminActor, {
    exemptionId: exempApp.id,
    decision: 'APPROVED_EXEMPTION',
    officialApprovalReference: 'SYNTH-EXEMP-APPROVAL-77',
  });
  assert.equal(approvedExemp.status, 'APPROVED_EXEMPTION');

  const expiredExemp = await exemptionDisputeReportingService.evaluateExemptionExpiration(
    adminActor,
    approvedExemp.id,
    '2027-01-01T00:00:00.000Z'
  );
  assert.equal(expiredExemp.status, 'EXPIRED_EXEMPTION');

  // 15. Tax dispute creation, 16. Appeal lifecycle validation, & 17. Dispute vs payment-obligation distinction
  const dispute = await exemptionDisputeReportingService.createTaxDispute(ownerActor, {
    propertyId: 'prop-tehran-101',
    relatedRecordType: 'OBLIGATION',
    relatedRecordId: dueOb.id,
    taxAuthorityId: verifiedAuth.id,
    disputeCategory: 'FLOOR_AREA_CALCULATION_APPEAL',
    groundsReference: 'Surveyor certificate shows 130m2 vs 136m2',
    supportingDocumentIds: ['doc-survey-1'],
    sourceProvenance: 'OWNER_APPEAL_DRAFT',
  });
  assert.equal(dispute.status, 'PREPARING');
  assert.equal(dispute.suspensionConfirmedByAuthority, false);

  const submittedDispute = await exemptionDisputeReportingService.recordAppealSubmissionReference(ownerActor, {
    disputeId: dispute.id,
    submissionDateIso: '2026-02-10T00:00:00.000Z',
    officialCaseReference: 'SYNTH-APPEAL-CASE-882',
    suspensionConfirmedByAuthority: false,
  });
  assert.equal(submittedDispute.status, 'SUBMITTED');
  assert.equal(store.getObligation(dueOb.id)?.status, 'PARTIALLY_PAID');

  const resolvedDispute = await exemptionDisputeReportingService.recordDisputeResolution(adminActor, {
    disputeId: dispute.id,
    resolutionStatus: 'PARTIALLY_ACCEPTED',
    resolutionReference: 'SYNTH-COMMISSION-RULING-91',
    resolutionSummary: 'Reduced taxable area by 4m2',
  });
  assert.equal(resolvedDispute.status, 'PARTIALLY_ACCEPTED');

  // 20. Sensitive tax data access & 21. Unauthorized taxpayer access prevention
  const restrictedDoc = await authorityAndAssessmentService.registerTaxDocumentReference(ownerActor, {
    propertyId: 'prop-tehran-101',
    relatedTaxRecordId: taxRec1.id,
    documentCategory: 'TAX_ASSESSMENT_NOTICE',
    issuingAuthorityName: 'Tehran Municipal Revenue Authority',
    sourceProvenance: 'OFFICIAL_NOTICE_SCAN',
    mediaReferenceId: 'media-tax-notice-1',
    restrictedConfidentiality: true,
  });
  assert.equal(restrictedDoc.isAuthenticWithoutVerification, false);

  assert.throws(
    () => authorityAndAssessmentService.retrieveTaxDocumentReference(managerActor, restrictedDoc.id),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'RESTRICTED_TAX_DOCUMENT_DENIED'
  );
  const ownerDocView = authorityAndAssessmentService.retrieveTaxDocumentReference(ownerActor, restrictedDoc.id);
  assert.equal(ownerDocView.id, restrictedDoc.id);

  assert.throws(
    () => authorityAndAssessmentService.retrievePropertyTaxRecord(unrelatedActor, taxRec1.id),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'UNAUTHORIZED_TAX_ACCESS'
  );

  await assert.rejects(
    () =>
      authorityAndAssessmentService.registerTaxPartyRelationship(ownerActor, {
        propertyTaxRecordId: taxRec1.id,
        partyId: 'party-tenant-1',
        role: 'TENANT_LEGALLY_RELEVANT',
        effectiveStartIso: '2025-03-21T00:00:00.000Z',
        authorizationReference: 'LEASE-101',
      }),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'TENANT_LIABILITY_REQUIRES_LEGAL_SOURCE'
  );

  // 18. Tax history preservation & 25. Pagination limits
  const historyPage = exemptionDisputeReportingService.retrieveTaxHistory(ownerActor, 'prop-tehran-101', 999, 0);
  assert.equal(historyPage.limit, 50);
  assert.ok(historyPage.total >= 8);

  const summary = exemptionDisputeReportingService.retrieveTaxReportingSummary(ownerActor, 'prop-tehran-101');
  assert.equal(summary.officiallyVerifiedObligationsTotalRials, 80_000_000);
  assert.equal(summary.officiallyConfirmedPaidTotalRials, 30_000_000);
  assert.equal(summary.officiallyConfirmedUnpaidTotalRials, 50_000_000);
  assert.equal(summary.userReportedUnverifiedObligationsTotalRials, 50_000_000);
  assert.equal(summary.missingRecordsMeanNoTaxLiability, false);

  // 24. Persistence failure handling
  store.setSimulatePersistenceFailure(true);
  await assert.rejects(
    () =>
      obligationBillPaymentService.registerTaxObligation(ownerActor, {
        propertyTaxRecordId: taxRec1.id,
        taxCategory: 'LAND_TAX',
        taxPeriod: period1404,
        originalAmountRials: 10_000_000,
        dueDateIso: '2026-09-01T00:00:00.000Z',
        requestedStatus: 'REPORTED',
        epistemicClassification: 'USER_REPORTED_OBLIGATION',
        sourceReference: 'FAIL_TEST',
      }),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'PERSISTENCE_FAILURE'
  );
  store.setSimulatePersistenceFailure(false);

  // 26. Prevention of cross-module direct writes
  assert.throws(
    () => store.attemptDirectCrossModuleWrite('properties'),
    (err: unknown) => err instanceof PropertyTaxError && err.code === 'CROSS_MODULE_WRITE_FORBIDDEN'
  );

  console.log('All 26 Property Tax & Municipal Charges Backend tests passed!');
}

runPropertyTaxTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
