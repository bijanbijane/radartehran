import assert from 'node:assert/strict';
import {
  createRealEstateTransactionsModuleFacade,
  RealEstateTransactionError,
  TransactionActorContext,
} from '../index';

const buyerActor: TransactionActorContext = {
  userId: 'user-buyer-1',
  partyId: 'party-buyer-1',
  role: 'PARTICIPANT',
};
const sellerActor: TransactionActorContext = {
  userId: 'user-seller-1',
  partyId: 'party-seller-1',
  role: 'PARTICIPANT',
};
const brokerActor: TransactionActorContext = {
  userId: 'user-broker-1',
  partyId: 'party-broker-1',
  brokerageId: 'brokerage-alpha-1',
  role: 'BROKER_AGENT',
};
const unrelatedActor: TransactionActorContext = {
  userId: 'user-stranger-99',
  partyId: 'party-stranger-99',
  role: 'UNRELATED_USER',
};

async function runRealEstateTransactionsTests(): Promise<void> {
  const facade = createRealEstateTransactionsModuleFacade();
  const {
    transactionParticipantOfferAndNegotiationService,
    termsConditionsMilestonesAndContractService,
    closingHandoverCompletionAndReportingService,
    store,
  } = facade;

  // 1. Transaction creation, 2. Invalid property reference, 3. Transaction type validation, & 27. Idempotency
  await assert.rejects(
    () =>
      transactionParticipantOfferAndNegotiationService.createTransaction(buyerActor, {
        transactionType: 'PROPERTY_SALE',
        propertyId: 'invalid-prop-404',
        jurisdictionCitySlug: 'tehran',
        sourceProvenance: 'SYNTHETIC_TEST',
      }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.code === 'INVALID_PROPERTY_REFERENCE'
  );

  const saleTx = await transactionParticipantOfferAndNegotiationService.createTransaction(buyerActor, {
    transactionType: 'PROPERTY_SALE',
    propertyId: 'prop-tehran-303',
    listingAskingPriceRials: 62_000_000_000,
    jurisdictionCitySlug: 'tehran',
    sourceProvenance: 'SYNTHETIC_TEST_FIXTURE',
    isSyntheticTestFixture: true,
    idempotencyKey: 'idem-tx-1',
  });
  assert.equal(saleTx.workflowCompletionEqualsLegalCompletion, false);
  const saleTxDup = await transactionParticipantOfferAndNegotiationService.createTransaction(buyerActor, {
    transactionType: 'PROPERTY_SALE',
    propertyId: 'prop-tehran-303',
    jurisdictionCitySlug: 'tehran',
    sourceProvenance: 'SYNTHETIC_TEST_FIXTURE',
    idempotencyKey: 'idem-tx-1',
  });
  assert.equal(saleTxDup.id, saleTx.id);

  // 4. Participant role validation, 5. Unauthorized participant access prevention, & 6. Seller authority validation
  assert.throws(
    () => transactionParticipantOfferAndNegotiationService.retrieveTransaction(unrelatedActor, saleTx.id),
    (err: unknown) => err instanceof RealEstateTransactionError && err.code === 'UNAUTHORIZED_TRANSACTION_ACCESS'
  );

  await assert.rejects(
    () =>
      transactionParticipantOfferAndNegotiationService.registerTransactionParticipant(buyerActor, {
        transactionId: saleTx.id,
        partyId: 'party-tenant-1',
        role: 'TENANT', // Incompatible with PROPERTY_SALE!
        effectiveStartIso: '2026-03-01T00:00:00.000Z',
        authorizationScope: 'LEASE_SIGNER',
      }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.code === 'INCOMPATIBLE_PARTICIPANT_ROLE'
  );

  await assert.rejects(
    () =>
      transactionParticipantOfferAndNegotiationService.registerTransactionParticipant(buyerActor, {
        transactionId: saleTx.id,
        partyId: sellerActor.partyId,
        role: 'SELLER',
        effectiveStartIso: '2026-03-01T00:00:00.000Z',
        authorizationScope: 'FULL_SALE_AUTHORITY',
        supportingEvidenceReference: 'unverified-claim-1',
      }),
    (err: unknown) =>
      err instanceof RealEstateTransactionError && err.code === 'UNVERIFIED_SELLER_OR_LANDLORD_AUTHORITY'
  );

  const sellerParticipant = await transactionParticipantOfferAndNegotiationService.registerTransactionParticipant(
    buyerActor,
    {
      transactionId: saleTx.id,
      partyId: sellerActor.partyId,
      role: 'SELLER',
      effectiveStartIso: '2026-03-01T00:00:00.000Z',
      authorizationScope: 'FULL_SALE_AUTHORITY',
      supportingEvidenceReference: 'verified-ownership-deed-303',
    }
  );
  assert.equal(sellerParticipant.authorityVerifiedByRegistryOrMandate, true);
  assert.equal(sellerParticipant.infersAuthorityFromTransactionCreationAlone, false);

  await transactionParticipantOfferAndNegotiationService.registerTransactionParticipant(buyerActor, {
    transactionId: saleTx.id,
    partyId: brokerActor.partyId,
    role: 'LISTING_AGENT',
    effectiveStartIso: '2026-03-01T00:00:00.000Z',
    authorizationScope: 'MARKETING_AND_NEGOTIATION',
    supportingEvidenceReference: 'mandate-303',
  });

  // 7. Offer submission, 8. Offer expiration, 9. Counteroffer versioning, 10. Offer acceptance authz, & 11. Concurrent acceptance
  const expiredOffer = await transactionParticipantOfferAndNegotiationService.submitOffer(buyerActor, {
    transactionId: saleTx.id,
    recipientPartyIds: [sellerActor.partyId],
    offerType: 'PURCHASE_OFFER',
    proposedAmountRials: 58_000_000_000,
    proposedEffectiveDateIso: '2026-03-01T00:00:00.000Z',
    expirationDateIso: '2025-01-01T00:00:00.000Z',
  });
  await assert.rejects(
    () =>
      transactionParticipantOfferAndNegotiationService.acceptOffer(sellerActor, {
        offerId: expiredOffer.id,
        asOfIso: '2026-03-02T00:00:00.000Z',
      }),
    (err: unknown) =>
      err instanceof RealEstateTransactionError &&
      err.code === 'EXPIRED_OR_SUPERSEDED_OFFER_CANNOT_BE_ACCEPTED'
  );

  const offer1 = await transactionParticipantOfferAndNegotiationService.submitOffer(buyerActor, {
    transactionId: saleTx.id,
    recipientPartyIds: [sellerActor.partyId],
    offerType: 'PURCHASE_OFFER',
    proposedAmountRials: 59_000_000_000,
    proposedEffectiveDateIso: '2026-03-01T00:00:00.000Z',
    expirationDateIso: '2027-01-01T00:00:00.000Z',
    idempotencyKey: 'idem-offer-1',
  });
  assert.equal(offer1.isLegallyExecutedContractByAcceptanceAlone, false);
  assert.equal(offer1.isCompletedSalePrice, false);

  const { supersededOffer, counteroffer } =
    await transactionParticipantOfferAndNegotiationService.submitCounteroffer(sellerActor, {
      priorOfferId: offer1.id,
      proposedAmountRials: 60_500_000_000,
      proposedEffectiveDateIso: '2026-03-02T00:00:00.000Z',
      expirationDateIso: '2027-01-01T00:00:00.000Z',
    });
  assert.equal(supersededOffer.status, 'SUPERSEDED');
  assert.equal(counteroffer.version, 2);

  // Superseded offer cannot be accepted
  await assert.rejects(
    () => transactionParticipantOfferAndNegotiationService.acceptOffer(sellerActor, { offerId: offer1.id }),
    (err: unknown) =>
      err instanceof RealEstateTransactionError &&
      err.code === 'EXPIRED_OR_SUPERSEDED_OFFER_CANNOT_BE_ACCEPTED'
  );

  // Non-recipient cannot accept counteroffer
  await assert.rejects(
    () => transactionParticipantOfferAndNegotiationService.acceptOffer(sellerActor, { offerId: counteroffer.id }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.code === 'UNAUTHORIZED_OFFER_ACCEPTANCE'
  );

  const acceptedResult = await transactionParticipantOfferAndNegotiationService.acceptOffer(buyerActor, {
    offerId: counteroffer.id,
    asOfIso: '2026-03-03T00:00:00.000Z',
  });
  assert.equal(acceptedResult.acceptedOffer.status, 'ACCEPTED');
  assert.equal(acceptedResult.transaction.status, 'OFFER_ACCEPTED');

  // Competing offer cannot also be accepted
  const competingOffer = await transactionParticipantOfferAndNegotiationService.submitOffer(buyerActor, {
    transactionId: saleTx.id,
    recipientPartyIds: [sellerActor.partyId],
    offerType: 'REVISED_COMMERCIAL_OFFER',
    proposedAmountRials: 61_000_000_000,
    proposedEffectiveDateIso: '2026-03-04T00:00:00.000Z',
    expirationDateIso: '2027-01-01T00:00:00.000Z',
  });
  await assert.rejects(
    () => transactionParticipantOfferAndNegotiationService.acceptOffer(sellerActor, { offerId: competingOffer.id }),
    (err: unknown) =>
      err instanceof RealEstateTransactionError && err.code === 'CONCURRENT_OFFER_ACCEPTANCE_CONFLICT'
  );

  // 12. Negotiation history preservation & 13. Private note access restrictions
  await transactionParticipantOfferAndNegotiationService.registerNegotiationEntry(buyerActor, {
    transactionId: saleTx.id,
    relatedOfferId: counteroffer.id,
    visibilityScope: 'SHARED_PARTICIPANTS',
    negotiationCategory: 'PRICE_NEGOTIATION',
    structuredProposalSummary: 'Agreed on 60.5B Rials subject to inspection',
  });
  await transactionParticipantOfferAndNegotiationService.registerNegotiationEntry(sellerActor, {
    transactionId: saleTx.id,
    visibilityScope: 'PRIVATE_PARTICIPANT_NOTE',
    negotiationCategory: 'PRICE_NEGOTIATION',
    structuredProposalSummary: 'Seller private reserve note: would accept 60B',
  });
  await transactionParticipantOfferAndNegotiationService.registerNegotiationEntry(brokerActor, {
    transactionId: saleTx.id,
    visibilityScope: 'INTERNAL_BROKERAGE_NOTE',
    negotiationCategory: 'CLOSING_DATE',
    structuredProposalSummary: 'Internal brokerage note: coordinate notary slot',
  });

  const buyerVisibleNeg = transactionParticipantOfferAndNegotiationService.retrieveNegotiationEntries(
    buyerActor,
    saleTx.id
  );
  assert.equal(buyerVisibleNeg.length, 1); // Cannot see seller private note or internal brokerage note!

  // 14. Deal term versioning
  const termV1 = await termsConditionsMilestonesAndContractService.recordAgreedDealTerm(buyerActor, {
    transactionId: saleTx.id,
    termCategory: 'PURCHASE_PRICE',
    termValue: 60_500_000_000,
    unitOrCurrency: 'IRR',
    effectivePeriodSummary: 'Closing Q2 2026',
    epistemicStage: 'NEGOTIATED_TERM',
    sourceProvenance: counteroffer.id,
  });
  const termV2 = await termsConditionsMilestonesAndContractService.recordAgreedDealTerm(sellerActor, {
    transactionId: saleTx.id,
    termCategory: 'PURCHASE_PRICE',
    termValue: 60_500_000_000,
    unitOrCurrency: 'IRR',
    effectivePeriodSummary: 'Closing Q2 2026',
    epistemicStage: 'CONTRACTUAL_TERM',
    supportingEvidenceReference: 'contract-303',
    sourceProvenance: 'contract-303',
  });
  assert.equal(termV1.version, 1);
  assert.equal(termV2.version, 2);
  assert.equal(termV2.supersedesTermId, termV1.id);
  assert.equal(termV2.isLegallyBindingWithoutContractEvidence, false);

  // 15. Transaction condition lifecycle & 16. Milestone confirmation requirements
  const ddCondition = await termsConditionsMilestonesAndContractService.registerTransactionCondition(buyerActor, {
    transactionId: saleTx.id,
    conditionCategory: 'PROPERTY_DUE_DILIGENCE',
    description: 'Complete due diligence verification case',
    responsiblePartyId: buyerActor.partyId,
    requiredCompletionDateIso: '2026-04-01T00:00:00.000Z',
  });
  await assert.rejects(
    () =>
      termsConditionsMilestonesAndContractService.updateConditionStatusFromAuthorizedSource(buyerActor, {
        conditionId: ddCondition.id,
        targetStatus: 'SATISFIED', // Missing evidenceReference!
      }),
    (err: unknown) =>
      err instanceof RealEstateTransactionError && err.code === 'CONDITION_SATISFACTION_REQUIRES_EVIDENCE'
  );
  const satisfiedCond = await termsConditionsMilestonesAndContractService.updateConditionStatusFromAuthorizedSource(
    buyerActor,
    {
      conditionId: ddCondition.id,
      targetStatus: 'SATISFIED',
      evidenceReference: 'dd-report-303',
      verificationSourceModule: 'property-due-diligence',
    }
  );
  assert.equal(satisfiedCond.status, 'SATISFIED');

  const plannedMile = await termsConditionsMilestonesAndContractService.registerTransactionMilestone(buyerActor, {
    transactionId: saleTx.id,
    milestoneType: 'DUE_DILIGENCE_COMPLETED',
    expectedDateIso: '2026-04-01T00:00:00.000Z',
    responsiblePartyId: buyerActor.partyId,
    sourceProvenance: 'DEAL_SCHEDULE',
  });
  assert.equal(plannedMile.plannedEqualsCompleted, false);
  await assert.rejects(
    () =>
      termsConditionsMilestonesAndContractService.confirmTransactionMilestone(buyerActor, {
        milestoneId: plannedMile.id,
        targetStatus: 'CONFIRMED_MILESTONE',
        actualDateIso: '2026-03-28T00:00:00.000Z',
        evidenceReferences: [],
      }),
    (err: unknown) =>
      err instanceof RealEstateTransactionError &&
      err.code === 'PLANNED_MILESTONE_NOT_COMPLETED_WITHOUT_EVIDENCE'
  );

  // 17. Contract uploaded vs contract executed distinction
  const uploadedContract = await termsConditionsMilestonesAndContractService.recordContractReference(buyerActor, {
    transactionId: saleTx.id,
    contractType: 'MOBAYEENAMEH_SALE_AGREEMENT',
    contractVersion: 1,
    contractingPartyIds: [buyerActor.partyId, sellerActor.partyId],
    contractDateIso: '2026-03-15T00:00:00.000Z',
    effectiveDateIso: '2026-03-15T00:00:00.000Z',
    mediaDocumentId: 'media-contract-pdf-1',
    provenanceStage: 'UPLOADED_CONTRACT_UNVERIFIED',
  });
  assert.equal(uploadedContract.executionStatus, 'PREPARED');
  assert.equal(uploadedContract.provesLegalValidityFromPdfImageAlone, false);

  await assert.rejects(
    () =>
      termsConditionsMilestonesAndContractService.recordContractReference(buyerActor, {
        transactionId: saleTx.id,
        contractType: 'MOBAYEENAMEH_SALE_AGREEMENT',
        contractVersion: 2,
        contractingPartyIds: [buyerActor.partyId, sellerActor.partyId],
        contractDateIso: '2026-03-16T00:00:00.000Z',
        effectiveDateIso: '2026-03-16T00:00:00.000Z',
        mediaDocumentId: 'media-contract-pdf-2',
        provenanceStage: 'OFFICIALLY_REGISTERED_CONTRACT',
      }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.code === 'UPLOADED_PDF_NOT_EXECUTED_CONTRACT'
  );

  const registeredContract = await termsConditionsMilestonesAndContractService.recordContractReference(sellerActor, {
    transactionId: saleTx.id,
    contractType: 'MOBAYEENAMEH_SALE_AGREEMENT',
    contractVersion: 2,
    contractingPartyIds: [buyerActor.partyId, sellerActor.partyId],
    contractDateIso: '2026-03-16T00:00:00.000Z',
    effectiveDateIso: '2026-03-16T00:00:00.000Z',
    mediaDocumentId: 'media-contract-pdf-2',
    provenanceStage: 'OFFICIALLY_REGISTERED_CONTRACT',
    officialRegistrationReference: 'SYNTH-RAHbord-CODE-303',
  });
  assert.equal(registeredContract.executionStatus, 'FULLY_SIGNED');

  // 18. Closing lifecycle, 19. Payment confirmation dependency, & 20. Ownership transfer dependency
  const closing = await closingHandoverCompletionAndReportingService.createClosingWorkflow(buyerActor, {
    transactionId: saleTx.id,
    expectedClosingDateIso: '2026-04-15T00:00:00.000Z',
    requiredConditionIds: [satisfiedCond.id],
    responsiblePartyIds: [buyerActor.partyId, sellerActor.partyId],
  });

  await assert.rejects(
    () =>
      closingHandoverCompletionAndReportingService.recordClosingConfirmation(buyerActor, {
        closingId: closing.id,
        finalContractReferenceId: registeredContract.id,
        finalPaymentConfirmationRef: 'unconfirmed-pay-99',
        ownershipTransferConfirmationRef: 'confirmed-transfer-303',
        actualClosingDateIso: '2026-04-15T00:00:00.000Z',
      }),
    (err: unknown) =>
      err instanceof RealEstateTransactionError &&
      err.code === 'CLOSING_REQUIRES_PAYMENT_AND_OWNERSHIP_CONFIRMATION'
  );

  await assert.rejects(
    () =>
      closingHandoverCompletionAndReportingService.recordClosingConfirmation(buyerActor, {
        closingId: closing.id,
        finalContractReferenceId: registeredContract.id,
        finalPaymentConfirmationRef: 'confirmed-pay-303',
        ownershipTransferConfirmationRef: 'unconfirmed-transfer-99',
        actualClosingDateIso: '2026-04-15T00:00:00.000Z',
      }),
    (err: unknown) =>
      err instanceof RealEstateTransactionError &&
      err.code === 'CLOSING_REQUIRES_PAYMENT_AND_OWNERSHIP_CONFIRMATION'
  );

  const completedClosing = await closingHandoverCompletionAndReportingService.recordClosingConfirmation(buyerActor, {
    closingId: closing.id,
    finalContractReferenceId: registeredContract.id,
    finalPaymentConfirmationRef: 'confirmed-pay-303',
    ownershipTransferConfirmationRef: 'confirmed-transfer-303',
    actualClosingDateIso: '2026-04-15T00:00:00.000Z',
  });
  assert.equal(completedClosing.status, 'COMPLETED');

  // 21. Handover lifecycle
  const handover = await closingHandoverCompletionAndReportingService.createHandoverRecord(sellerActor, {
    transactionId: saleTx.id,
    handoverDateIso: '2026-04-16T00:00:00.000Z',
    participantPartyIds: [buyerActor.partyId, sellerActor.partyId],
    meterReadingReferences: ['meter-elec-303', 'meter-gas-303'],
  });
  assert.equal(handover.provesLegalPossessionTransferAlone, false);
  const completedHandover = await closingHandoverCompletionAndReportingService.recordHandoverCompletion(sellerActor, {
    handoverId: handover.id,
    keyHandoverReference: 'key-receipt-303',
  });
  assert.equal(completedHandover.status, 'COMPLETED');

  // 23. Completed transaction verification, 24. Asking price vs final price distinction, & 25. Rental vs deposit distinction
  await assert.rejects(
    () =>
      closingHandoverCompletionAndReportingService.recordCompletedTransaction(buyerActor, {
        transactionId: saleTx.id,
        closingId: completedClosing.id,
        finalAgreedAmountRials: 62_000_000_000,
        priceClassification: 'ASKING_PRICE',
        completionEvidenceRefs: ['deed-transfer-303'],
      }),
    (err: unknown) =>
      err instanceof RealEstateTransactionError &&
      err.code === 'ASKING_PRICE_OR_OFFER_NOT_VERIFIED_COMPLETED_PRICE'
  );

  const completedSale = await closingHandoverCompletionAndReportingService.recordCompletedTransaction(buyerActor, {
    transactionId: saleTx.id,
    closingId: completedClosing.id,
    finalAgreedAmountRials: 60_500_000_000,
    priceClassification: 'VERIFIED_COMPLETED_TRANSACTION_AMOUNT',
    completionEvidenceRefs: ['deed-transfer-303', 'confirmed-pay-303'],
  });
  assert.equal(completedSale.verificationStatus, 'VERIFIED_COMPLETED');
  assert.equal(completedSale.listingAskingPriceRials, 62_000_000_000);
  assert.equal(completedSale.publiclyPublishableWithoutConsent, false);

  // Completed transaction is immutable
  await assert.rejects(
    () =>
      closingHandoverCompletionAndReportingService.recordCompletedTransaction(buyerActor, {
        transactionId: saleTx.id,
        closingId: completedClosing.id,
        finalAgreedAmountRials: 50_000_000_000,
        priceClassification: 'VERIFIED_COMPLETED_TRANSACTION_AMOUNT',
        completionEvidenceRefs: ['overwrite-attempt'],
      }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.code === 'COMPLETED_TRANSACTION_IMMUTABLE'
  );

  // 22. Cancellation and termination distinction & 25. Rental breakdown
  const rentalTx = await transactionParticipantOfferAndNegotiationService.createTransaction(buyerActor, {
    transactionType: 'RESIDENTIAL_RENTAL',
    propertyId: 'prop-tehran-304',
    jurisdictionCitySlug: 'tehran',
    sourceProvenance: 'SYNTHETIC_RENTAL_FIXTURE',
    isSyntheticTestFixture: true,
  });
  const rentalOffer = await transactionParticipantOfferAndNegotiationService.submitOffer(buyerActor, {
    transactionId: rentalTx.id,
    recipientPartyIds: [sellerActor.partyId],
    offerType: 'RENTAL_OFFER',
    proposedAmountRials: 360_000_000,
    monthlyRentRials: 30_000_000,
    securityDepositRials: 5_000_000_000,
    proposedEffectiveDateIso: '2026-05-01T00:00:00.000Z',
    expirationDateIso: '2027-01-01T00:00:00.000Z',
  });
  assert.equal(rentalOffer.monthlyRentRials, 30_000_000);
  assert.equal(rentalOffer.securityDepositRials, 5_000_000_000);

  const cancelledRental = await closingHandoverCompletionAndReportingService.cancelTransaction(buyerActor, {
    transactionId: rentalTx.id,
    reasonCategory: 'MUTUAL_PRE_CONTRACT_WITHDRAWAL',
    explanation: 'Parties decided not to proceed before signing lease',
  });
  assert.equal(cancelledRental.termination.distinctionType, 'CANCELLED_BEFORE_AGREEMENT');
  assert.equal(cancelledRental.termination.autoCalculatesLegalPenalties, false);
  assert.equal(cancelledRental.termination.autoRefundsDeposits, false);

  // 28. Persistence failure handling, 29. Pagination limits, & 30. Prevention of cross-module direct writes
  const histPage = closingHandoverCompletionAndReportingService.retrieveTransactionHistory(
    buyerActor,
    saleTx.id,
    500,
    0
  );
  assert.equal(histPage.limit, 50);

  store.setSimulatePersistenceFailure(true);
  await assert.rejects(
    () =>
      transactionParticipantOfferAndNegotiationService.createTransaction(buyerActor, {
        transactionType: 'PROPERTY_SALE',
        propertyId: 'prop-tehran-305',
        jurisdictionCitySlug: 'tehran',
        sourceProvenance: 'FAIL_TEST',
      }),
    (err: unknown) => err instanceof RealEstateTransactionError && err.code === 'PERSISTENCE_FAILURE'
  );
  store.setSimulatePersistenceFailure(false);

  assert.throws(
    () => store.attemptDirectCrossModuleWrite('properties'),
    (err: unknown) => err instanceof RealEstateTransactionError && err.code === 'CROSS_MODULE_WRITE_FORBIDDEN'
  );

  console.log('All 30 Real Estate Transactions & Deal Management Backend tests passed!');
}

runRealEstateTransactionsTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
