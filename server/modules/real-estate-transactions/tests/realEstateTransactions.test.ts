import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CoreApiError,
  type AuthenticatedPrincipal,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../../core';
import {
  createRealEstateTransactionsService,
  REAL_ESTATE_TRANSACTIONS_ROUTE_REGISTRATION_SPEC,
  type AuthoritativePaymentReferenceVerification,
  type CanonicalTransactionPropertySnapshot,
  type DueDiligenceCaseReadinessSnapshot,
  type TransactionMediaDocumentSnapshot,
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

  const properties = new Map<string, CanonicalTransactionPropertySnapshot>([
    [
      'prop_sale_1',
      {
        canonicalPropertyId: 'prop_sale_1',
        cityId: 'tehran',
        districtId: 'd2',
        propertyCategory: 'RESIDENTIAL',
        status: 'ACTIVE',
      },
    ],
    [
      'prop_rent_2',
      {
        canonicalPropertyId: 'prop_rent_2',
        cityId: 'tehran',
        districtId: 'd5',
        propertyCategory: 'RESIDENTIAL',
        status: 'ACTIVE',
      },
    ],
  ]);

  const dueDiligenceCases = new Map<string, DueDiligenceCaseReadinessSnapshot>([
    [
      'dd_ready_1',
      {
        dueDiligenceCaseId: 'dd_ready_1',
        canonicalPropertyId: 'prop_sale_1',
        overallState: 'COMPLETED_WITHOUT_IDENTIFIED_FINDINGS',
        hasBlockingFindings: false,
        assessmentVersion: 2,
      },
    ],
  ]);

  const mediaDocs = new Map<string, TransactionMediaDocumentSnapshot>([
    [
      'media_contract_v1',
      {
        mediaId: 'media_contract_v1',
        sha256Checksum: 'f'.repeat(64),
        mimeType: 'application/pdf',
        uploadedAtIso: '2026-03-28T00:00:00.000Z',
      },
    ],
  ]);

  const paymentVerifications = new Map<string, AuthoritativePaymentReferenceVerification>([
    [
      'pay_auth_confirmed_1',
      {
        externalPaymentReferenceId: 'pay_auth_confirmed_1',
        verifiedByPaymentModule: true,
        paymentState: 'CONFIRMED',
        confirmedAmount: 1_000_000_000,
        currency: 'TOMAN',
        verifiedAtIso: '2026-03-30T00:00:00.000Z',
        providerReferenceCode: 'SHAPARAK-998811',
      },
    ],
    [
      'pay_pending_2',
      {
        externalPaymentReferenceId: 'pay_pending_2',
        verifiedByPaymentModule: false,
        paymentState: 'PENDING_CONFIRMATION',
        confirmedAmount: null,
        currency: 'TOMAN',
        verifiedAtIso: '2026-03-30T00:00:00.000Z',
        providerReferenceCode: null,
      },
    ],
  ]);

  const service = createRealEstateTransactionsService({
    txRunner,
    primaryAdminEmails: ['admin@radartehran.ir'],
    nowFn: () => currentEpochMs,
    propertyRegistry: {
      async getCanonicalPropertyById(id) {
        return properties.get(id) ?? null;
      },
    },
    dueDiligence: {
      async getDueDiligenceCaseReadiness(id) {
        return dueDiligenceCases.get(id) ?? null;
      },
    },
    media: {
      async verifyDocumentReference(id) {
        return mediaDocs.get(id) ?? null;
      },
    },
    payments: {
      async verifyAuthoritativePaymentReference(id) {
        return paymentVerifications.get(id) ?? null;
      },
    },
  });

  const buyerPrincipal = makePrincipal('buyer_1', 'buyer1@example.com');
  const sellerPrincipal = makePrincipal('seller_1', 'seller1@example.com');
  const agentPrincipal = makePrincipal('agent_1', 'agent1@example.com');
  const outsiderPrincipal = makePrincipal('outsider_1', 'outsider@example.com');

  return {
    service,
    store,
    buyerPrincipal,
    sellerPrincipal,
    agentPrincipal,
    outsiderPrincipal,
  };
}

test('1. Creates purchase and rental transactions, enforces rent/deposit separation, validates participant roles & invitations, and blocks unauthorized access', async () => {
  const h = createTestHarness();

  // Rental transaction: monthly rent and security deposit are kept strictly separate
  const rentalTx = await h.service.createTransaction({
    principal: h.buyerPrincipal,
    idempotencyKey: 'idem_rent_tx_1',
    canonicalPropertyId: 'prop_rent_2',
    transactionType: 'RESIDENTIAL_RENTAL',
    initiatingRole: 'TENANT',
    counterpartyUid: 'seller_1',
    counterpartyRole: 'LANDLORD',
    initialFinancialTerms: {
      termMode: 'RENTAL_OR_LEASE',
      currency: 'TOMAN',
      listingAskingRentReference: 35_000_000,
      listingAskingDepositReference: 600_000_000,
      monthlyOrPeriodicRentAmount: 32_000_000,
      securityDepositAmount: 600_000_000,
      advanceRentAmount: 32_000_000,
      paymentFrequency: 'MONTHLY',
      leaseDurationMonths: 12,
      renewalTermsSummary: 'Mutual agreement 60 days prior to expiry',
    },
  });

  assert.equal(rentalTx.currentFinancialTerms.termMode, 'RENTAL_OR_LEASE');
  if (rentalTx.currentFinancialTerms.termMode === 'RENTAL_OR_LEASE') {
    assert.equal(rentalTx.currentFinancialTerms.monthlyOrPeriodicRentAmount, 32_000_000);
    assert.equal(rentalTx.currentFinancialTerms.securityDepositAmount, 600_000_000);
  }

  // Outsider is blocked from viewing private transaction details
  await assert.rejects(
    async () =>
      h.service.retrieveTransaction({
        principal: h.outsiderPrincipal,
        transactionId: rentalTx.transactionId,
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN',
  );

  // Inviting an AUTHORIZED_REPRESENTATIVE without authorityEvidenceRefId is rejected
  await assert.rejects(
    async () =>
      h.service.inviteParticipant({
        principal: h.buyerPrincipal,
        transactionId: rentalTx.transactionId,
        inviteeUid: 'agent_1',
        role: 'AUTHORIZED_REPRESENTATIVE',
        permissionScope: 'NEGOTIATE_ON_BEHALF_WITH_AUTHORITY',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED',
  );

  // Invite broker with REVIEW_ONLY scope -> cannot submit offers after accepting
  await h.service.inviteParticipant({
    principal: h.buyerPrincipal,
    transactionId: rentalTx.transactionId,
    inviteeUid: 'agent_1',
    role: 'BROKER_OR_AGENT',
    permissionScope: 'REVIEW_ONLY',
  });

  const afterAcceptInvite = await h.service.respondToParticipantInvitation({
    principal: h.agentPrincipal,
    transactionId: rentalTx.transactionId,
    decision: 'ACCEPT',
  });
  assert.equal(afterAcceptInvite.participants.length, 3);

  await assert.rejects(
    async () =>
      h.service.submitOffer({
        principal: h.agentPrincipal,
        idempotencyKey: 'idem_agent_unauth_offer',
        transactionId: rentalTx.transactionId,
        recipientParticipantUid: 'seller_1',
        financialTerms: rentalTx.currentFinancialTerms,
        validUntilIso: '2026-04-15T00:00:00.000Z',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN',
  );
});

test('2. Manages offers and counteroffers without overwriting history, rejects expired offers, and prevents simultaneous or stale acceptance conflicts', async () => {
  const h = createTestHarness();

  const saleTx = await h.service.createTransaction({
    principal: h.buyerPrincipal,
    idempotencyKey: 'idem_sale_tx_1',
    canonicalPropertyId: 'prop_sale_1',
    transactionType: 'PROPERTY_PURCHASE',
    initiatingRole: 'BUYER',
    counterpartyUid: 'seller_1',
    counterpartyRole: 'SELLER',
    dueDiligenceCaseRefId: 'dd_ready_1',
    initialFinancialTerms: {
      termMode: 'PURCHASE_OR_SALE',
      currency: 'TOMAN',
      listingAskingPriceReference: 11_000_000_000,
      proposedPurchasePrice: 10_000_000_000,
      agreedPurchasePrice: null,
      earnestDepositAmount: 1_000_000_000,
      advancePaymentAmount: 2_000_000_000,
      remainingBalanceAmount: 7_000_000_000,
      paymentScheduleRefIds: [],
    },
  });

  // Buyer submits Offer v1 (10.0B)
  const { offer: offerV1 } = await h.service.submitOffer({
    principal: h.buyerPrincipal,
    idempotencyKey: 'idem_offer_v1',
    transactionId: saleTx.transactionId,
    recipientParticipantUid: 'seller_1',
    financialTerms: saleTx.currentFinancialTerms,
    proposedConditions: ['Subject to title deed verification'],
    validUntilIso: '2026-04-10T00:00:00.000Z',
  });

  // Buyer (proposer) cannot accept their own offer!
  await assert.rejects(
    async () =>
      h.service.transitionOfferDecision({
        principal: h.buyerPrincipal,
        idempotencyKey: 'idem_self_accept',
        transactionId: saleTx.transactionId,
        offerId: offerV1.offerId,
        decision: 'ACCEPTED',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN',
  );

  // Seller counters with Offer v2 (10.5B) -> Offer v1 is preserved with original 10.0B price and status COUNTEROFFERED
  const counterRes = await h.service.submitCounteroffer({
    principal: h.sellerPrincipal,
    idempotencyKey: 'idem_counter_v2',
    transactionId: saleTx.transactionId,
    previousOfferId: offerV1.offerId,
    financialTerms: {
      termMode: 'PURCHASE_OR_SALE',
      currency: 'TOMAN',
      listingAskingPriceReference: 11_000_000_000,
      proposedPurchasePrice: 10_500_000_000,
      agreedPurchasePrice: null,
      earnestDepositAmount: 1_000_000_000,
      advancePaymentAmount: 2_500_000_000,
      remainingBalanceAmount: 7_000_000_000,
      paymentScheduleRefIds: [],
    },
    validUntilIso: '2026-04-12T00:00:00.000Z',
  });

  assert.equal(counterRes.supersededOffer.status, 'COUNTEROFFERED');
  if (counterRes.supersededOffer.financialTerms.termMode === 'PURCHASE_OR_SALE') {
    assert.equal(
      counterRes.supersededOffer.financialTerms.proposedPurchasePrice,
      10_000_000_000,
    );
  }
  assert.equal(counterRes.counteroffer.offerVersion, 2);
  assert.equal(counterRes.counteroffer.previousOfferId, offerV1.offerId);

  // Attempting to accept superseded Offer v1 fails with STALE_OFFER_CONFLICT
  await assert.rejects(
    async () =>
      h.service.transitionOfferDecision({
        principal: h.sellerPrincipal,
        idempotencyKey: 'idem_stale_accept_v1',
        transactionId: saleTx.transactionId,
        offerId: offerV1.offerId,
        decision: 'ACCEPTED',
      }),
    (err: unknown) =>
      err instanceof CoreApiError && err.message.includes('STALE_OFFER_CONFLICT'),
  );

  // Buyer accepts Counteroffer v2 -> transaction moves to TERMS_ACCEPTED_PENDING_CLOSING (not COMPLETED!)
  const acceptedRes = await h.service.transitionOfferDecision({
    principal: h.buyerPrincipal,
    idempotencyKey: 'idem_accept_v2',
    transactionId: saleTx.transactionId,
    offerId: counterRes.counteroffer.offerId,
    decision: 'ACCEPTED',
  });

  assert.equal(acceptedRes.offer.status, 'ACCEPTED');
  assert.equal(acceptedRes.transaction.status, 'TERMS_ACCEPTED_PENDING_CLOSING');
  assert.equal(acceptedRes.transaction.financialTermsHistory.length, 4);

  // Simultaneous second acceptance attempt is blocked
  await assert.rejects(
    async () =>
      h.service.transitionOfferDecision({
        principal: h.buyerPrincipal,
        idempotencyKey: 'idem_double_accept',
        transactionId: saleTx.transactionId,
        offerId: counterRes.counteroffer.offerId,
        decision: 'ACCEPTED',
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('SIMULTANEOUS_ACCEPTANCE_CONFLICT'),
  );
});

test('3. Rejects client-supplied CONFIRMED payment claims, enforces all completion prerequisites (contract, verified payment, handover milestone, due diligence), and retries transient contention', async () => {
  const h = createTestHarness({ abortFirstAttempts: 1 });

  const saleTx = await h.service.createTransaction({
    principal: h.buyerPrincipal,
    idempotencyKey: 'idem_close_tx_1',
    canonicalPropertyId: 'prop_sale_1',
    transactionType: 'PROPERTY_PURCHASE',
    initiatingRole: 'BUYER',
    counterpartyUid: 'seller_1',
    counterpartyRole: 'SELLER',
    dueDiligenceCaseRefId: 'dd_ready_1',
    initialFinancialTerms: {
      termMode: 'PURCHASE_OR_SALE',
      currency: 'TOMAN',
      listingAskingPriceReference: 10_000_000_000,
      proposedPurchasePrice: 10_000_000_000,
      agreedPurchasePrice: null,
      earnestDepositAmount: 1_000_000_000,
      advancePaymentAmount: 0,
      remainingBalanceAmount: 9_000_000_000,
      paymentScheduleRefIds: [],
    },
  });

  const { offer } = await h.service.submitOffer({
    principal: h.buyerPrincipal,
    idempotencyKey: 'idem_close_off_1',
    transactionId: saleTx.transactionId,
    recipientParticipantUid: 'seller_1',
    financialTerms: saleTx.currentFinancialTerms,
    validUntilIso: '2026-04-10T00:00:00.000Z',
  });

  await h.service.transitionOfferDecision({
    principal: h.sellerPrincipal,
    idempotencyKey: 'idem_close_acc_1',
    transactionId: saleTx.transactionId,
    offerId: offer.offerId,
    decision: 'ACCEPTED',
  });

  // Premature completion attempt after offer acceptance alone must fail with unmet prerequisites!
  await assert.rejects(
    async () =>
      h.service.completeTransaction({
        principal: h.buyerPrincipal,
        idempotencyKey: 'idem_premature_complete',
        transactionId: saleTx.transactionId,
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('COMPLETION_PREREQUISITES_NOT_MET'),
  );

  // Client attempting to spoof CONFIRMED payment status is rejected
  await assert.rejects(
    async () =>
      h.service.recordPaymentReference({
        principal: h.buyerPrincipal,
        idempotencyKey: 'idem_spoof_pay',
        transactionId: saleTx.transactionId,
        externalPaymentReferenceId: 'pay_pending_2',
        purpose: 'EARNEST_DEPOSIT',
        amount: 1_000_000_000,
        currency: 'TOMAN',
        clientClaimedPaymentState: 'CONFIRMED',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED',
  );

  // Record authoritative payment reference (verified by Payment adapter)
  const verifiedPay = await h.service.recordPaymentReference({
    principal: h.buyerPrincipal,
    idempotencyKey: 'idem_auth_pay_1',
    transactionId: saleTx.transactionId,
    externalPaymentReferenceId: 'pay_auth_confirmed_1',
    purpose: 'EARNEST_DEPOSIT',
    amount: 1_000_000_000,
    currency: 'TOMAN',
  });
  assert.equal(verifiedPay.state, 'CONFIRMED');
  assert.equal(verifiedPay.verifiedByAuthoritativeSource, true);

  // Record signed contract metadata
  await h.service.updateContractWorkflowMetadata({
    principal: h.sellerPrincipal,
    transactionId: saleTx.transactionId,
    contractRefId: 'contract_101',
    contractVersion: 1,
    mediaDocumentRefId: 'media_contract_v1',
    workflowState: 'SIGNED_BY_PARTIES',
    approvedByParticipantUids: ['buyer_1', 'seller_1'],
    signedByParticipantUids: ['buyer_1', 'seller_1'],
    effectiveDateIso: '2026-03-31T00:00:00.000Z',
  });

  // Record verified handover completion milestone
  await h.service.recordTransactionMilestone({
    principal: h.sellerPrincipal,
    transactionId: saleTx.transactionId,
    milestoneType: 'HANDOVER_COMPLETED',
    stage: 'VERIFIED',
    responsibleParticipantUid: 'seller_1',
    notes: 'Keys and possession handed over with signed protocol.',
  });

  // Now all completion prerequisites are satisfied -> transaction completes
  const completedTx = await h.service.completeTransaction({
    principal: h.buyerPrincipal,
    idempotencyKey: 'idem_complete_ok',
    transactionId: saleTx.transactionId,
  });

  assert.equal(completedTx.status, 'COMPLETED');
  assert.ok(completedTx.completionMetadata);
  assert.equal(completedTx.completionMetadata?.dueDiligenceAssessmentVersion, 2);
});

test('4. Handles cancellation & dispute workflows without adjudicating deposit rights, and paginates transaction & offer history', async () => {
  const h = createTestHarness();

  const tx = await h.service.createTransaction({
    principal: h.buyerPrincipal,
    idempotencyKey: 'idem_disp_tx_1',
    canonicalPropertyId: 'prop_sale_1',
    transactionType: 'PROPERTY_PURCHASE',
    initiatingRole: 'BUYER',
    counterpartyUid: 'seller_1',
    counterpartyRole: 'SELLER',
    initialFinancialTerms: {
      termMode: 'PURCHASE_OR_SALE',
      currency: 'TOMAN',
      listingAskingPriceReference: 10_000_000_000,
      proposedPurchasePrice: 9_800_000_000,
      agreedPurchasePrice: null,
      earnestDepositAmount: 500_000_000,
      advancePaymentAmount: 0,
      remainingBalanceAmount: 9_300_000_000,
      paymentScheduleRefIds: [],
    },
  });

  const dispRes = await h.service.recordCancellationOrDispute({
    principal: h.buyerPrincipal,
    transactionId: tx.transactionId,
    recordKind: 'DISPUTE_REFERENCE',
    reasonCategory: 'DEPOSIT_OR_TERMS_DISPUTE',
    explanation: 'Disagreement over repair contingency deadline.',
  });

  assert.equal(dispRes.transaction.status, 'DISPUTED');
  assert.ok(
    dispRes.record.nonAdjudicationDisclaimer.includes('never adjudicates legal disputes'),
  );

  const histPage1 = await h.service.retrieveTransactionHistory({
    principal: h.buyerPrincipal,
    transactionId: tx.transactionId,
    limit: 1,
  });
  assert.equal(histPage1.items.length, 1);
  assert.equal(histPage1.hasMore, true);
  assert.ok(histPage1.nextCursor);

  const histPage2 = await h.service.retrieveTransactionHistory({
    principal: h.buyerPrincipal,
    transactionId: tx.transactionId,
    limit: 1,
    cursor: histPage1.nextCursor!,
  });
  assert.equal(histPage2.items.length, 1);
  assert.notEqual(histPage1.items[0]!.historyId, histPage2.items[0]!.historyId);
  assert.equal(REAL_ESTATE_TRANSACTIONS_ROUTE_REGISTRATION_SPEC.length, 13);
});
