import test from 'node:test';
import assert from 'node:assert/strict';
import { createStrictFirestoreBackingAdapterForTests } from '../server/modules/real-estate-transactions';
import {
  CanonicalDisputeError,
  createCanonicalDisputeAdapters,
  createProductionDisputeResolutionModule,
  FirestoreDisputeResolutionStore,
} from '../server/modules/dispute-resolution';

test('RT-DISPUTE-CRITICAL-031: enforces bilateral settlement, blocks invalid transitions & forged payments, and preserves legal boundaries', async () => {
  const engine = createStrictFirestoreBackingAdapterForTests();
  await engine.setDoc('real_estate_transactions', 'tx_set_1', {
    id: 'tx_set_1',
    propertyId: 'prop_set_1',
    initiatorPartyId: 'u_claimant',
    participantIds: ['u_claimant', 'u_respondent'],
  });
  await engine.setDoc('payment_intents', 'pay_real_verified', {
    id: 'pay_real_verified',
    status: 'SUCCEEDED',
    ledgerCommitted: true,
  });

  const store = new FirestoreDisputeResolutionStore(engine);
  const prod = createProductionDisputeResolutionModule({
    store,
    ...createCanonicalDisputeAdapters(engine),
  });

  const { caseRecord } = await prod.service.createDisputeCase(
    { uid: 'u_claimant' },
    {
      category: 'DEPOSIT_REFUND',
      titleFa: 'توافق سازش استرداد ودیعه',
      descriptionFa: 'پرونده جهت بررسی الزام پذیرش دوطرفه و مرزبندی حقوقی.',
      respondentUid: 'u_respondent',
      transactionReferenceId: 'tx_set_1',
      assignedMediatorUid: 'u_mediator',
      idempotencyKey: 'idem-set-integrity-1',
    },
  );

  // Invalid state transition (SUBMITTED -> RESOLVED directly) must fail with 409
  await assert.rejects(
    () =>
      prod.service.transitionCaseStatus({ uid: 'u_claimant' }, caseRecord.id, {
        targetStatus: 'RESOLVED',
        reasonFa: 'تلاش میانبر به وضعیت مختومه',
      }),
    (err: unknown) => err instanceof CanonicalDisputeError && err.statusCode === 409 && err.code === 'INVALID_CASE_TRANSITION',
  );

  // Create settlement proposal
  const proposal = await prod.service.createSettlementProposal({ uid: 'u_claimant' }, caseRecord.id, {
    proposalTermsFa: 'استرداد ۸۰ درصد ودیعه طی ۷ روز کاری',
    proposedFinancialRemedyRials: 400_000_000,
    validUntilIso: '2099-01-01T00:00:00.000Z',
  });

  // Single-party acceptance MUST NOT create settlement agreement!
  const firstAccept = await prod.service.acceptSettlementProposal({ uid: 'u_claimant' }, proposal.id);
  assert.equal(firstAccept.proposal.status, 'PARTIALLY_ACCEPTED');
  assert.equal(firstAccept.settlement, null, 'Single-party acceptance must NOT finalize settlement');

  // Same party cannot accept twice to fake bilateral acceptance
  await assert.rejects(
    () => prod.service.acceptSettlementProposal({ uid: 'u_claimant' }, proposal.id),
    (err: unknown) => err instanceof CanonicalDisputeError && err.statusCode === 409 && err.code === 'ALREADY_ACCEPTED_BY_PARTY',
  );

  // Mediator cannot record AGREEMENT_REACHED before bilateral acceptance
  await assert.rejects(
    () =>
      prod.service.recordResolutionOutcome(
        { uid: 'u_mediator', serverRole: 'MEDIATOR' },
        caseRecord.id,
        {
          outcomeType: 'AGREEMENT_REACHED',
          explanationFa: 'تلاش ثبت توافق پیش از تایید طرف مقابل',
        },
      ),
    (err: unknown) => err instanceof CanonicalDisputeError && err.statusCode === 409 && err.code === 'BILATERAL_SETTLEMENT_REQUIRED',
  );

  // Respondent accepts -> NOW bilateral settlement is atomically finalized!
  const secondAccept = await prod.service.acceptSettlementProposal({ uid: 'u_respondent' }, proposal.id);
  assert.equal(secondAccept.proposal.status, 'MUTUALLY_ACCEPTED');
  assert.ok(secondAccept.settlement, 'Bilateral acceptance must generate CanonicalSettlementRecord');
  assert.equal(secondAccept.settlement.partyAcceptances.length, 2);
  // Strict legal boundaries enforced on settlement record
  assert.equal(secondAccept.settlement.legalBoundary.isBindingCourtOrder, false);
  assert.equal(secondAccept.settlement.legalBoundary.isOfficialElectronicSignature, false);
  assert.equal(secondAccept.settlement.legalBoundary.isFinalLegalContract, false);
  assert.equal(secondAccept.settlement.legalBoundary.confirmsPaymentAlone, false);
  assert.equal(secondAccept.settlement.legalBoundary.transfersOwnershipAlone, false);

  // Forged legacy payment prefix "confirmed-pay-fake" MUST BE REJECTED!
  await assert.rejects(
    () =>
      prod.service.recordResolutionOutcome(
        { uid: 'u_mediator', serverRole: 'MEDIATOR' },
        caseRecord.id,
        {
          outcomeType: 'AGREEMENT_REACHED',
          explanationFa: 'تلاش ثبت پرداخت جعلی',
          verifiedPaymentRef: 'confirmed-pay-fake',
        },
      ),
    (err: unknown) => err instanceof CanonicalDisputeError && err.statusCode === 409 && err.code === 'UNVERIFIED_PAYMENT_REFERENCE',
  );

  // Claimant (non-mediator) cannot record final resolution -> 403
  await assert.rejects(
    () =>
      prod.service.recordResolutionOutcome(
        { uid: 'u_claimant' },
        caseRecord.id,
        {
          outcomeType: 'AGREEMENT_REACHED',
          explanationFa: 'ثبت نتیجه توسط شاکی غیرمجاز است',
        },
      ),
    (err: unknown) => err instanceof CanonicalDisputeError && err.statusCode === 403 && err.code === 'FORBIDDEN_RESOLUTION',
  );

  // Mediator records final outcome with real verified payment -> succeeds with explicit legal boundaries
  const resolved = await prod.service.recordResolutionOutcome(
    { uid: 'u_mediator', serverRole: 'MEDIATOR' },
    caseRecord.id,
    {
      outcomeType: 'AGREEMENT_REACHED',
      explanationFa: 'توافق دوطرفه داخلی با مرجع پرداخت تاییدشده ثبت شد.',
      verifiedPaymentRef: 'pay_real_verified',
    },
  );
  assert.equal(resolved.caseRecord.status, 'RESOLVED');
  assert.equal(resolved.outcome.legalBoundary.isBindingCourtOrder, false);
  assert.equal(resolved.outcome.legalBoundary.transfersOwnershipAlone, false);
});
