import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveAgreementVersion,
  assessAgreementCancellation,
  buildStage44FinancialExportCsv,
  calculateInvoiceTotals,
  canAccessTransactionDossier,
  computeProviderFinancialSummary,
  confirmPaymentAndIssueReceipt,
  convertQuoteToAgreementDraft,
  initiatePaymentAttempt,
  issueCorrectiveInvoice,
  numberToPersianWordsToman,
  proposeAgreementRevision,
  requestRefundSafely,
  splitMilestoneExecutionVsPayment,
} from '../services/serviceTransactionEngine';
import {
  EIGHT_FINANCIAL_CONCEPTS,
  STAGE44_DESIGN_COMPONENT_IDS,
  STAGE44_UX_EVENTS,
} from '../services/serviceTransactionTypes';
import { INITIAL_STAGE44_DOSSIER } from '../services/stage44TransactionFixtures';
import { INITIAL_STAGE43_QUOTES, INITIAL_STAGE43_REQUEST } from '../services/stage43MarketplaceFixtures';

test('Stage 44 (RT-UI-SERVICE-TRANSACTION-001): enforces Toman-only Persian words, immutable versioning, payment verification gates, and RBAC guards', () => {
  // Registries
  assert.equal(EIGHT_FINANCIAL_CONCEPTS.length, 8);
  assert.equal(STAGE44_DESIGN_COMPONENT_IDS.length, 30);
  assert.equal(STAGE44_UX_EVENTS.length, 14);

  // Test 1 & Test 12: Quote -> Agreement conversion without re-entry, Toman-only + Persian words
  const draft = convertQuoteToAgreementDraft({
    request: INITIAL_STAGE43_REQUEST,
    quote: INITIAL_STAGE43_QUOTES[0],
    platformFeeToman: 200_000,
    visitFeeToman: 500_000,
  });
  assert.equal(draft.versionLabel, 'V1');
  assert.ok(draft.amountToman > 0);
  assert.equal(numberToPersianWordsToman(5_200_000), 'پنج میلیون و دویست هزار تومان');

  // Test 2 & Test 3: Propose V2 keeps V1 intact & requires mutual re-approval; approval warns against equating button click with e-signature
  const revised = proposeAgreementRevision({
    dossier: INITIAL_STAGE44_DOSSIER,
    newAmountToman: 4_800_000,
    newScopeNoteFa: 'بررسی رطوبت‌سنجی پشت‌بام',
    reasonFa: 'توافق طرفین روی بازدید پشت‌بام',
    actorNameFa: INITIAL_STAGE44_DOSSIER.provider.displayNameFa,
  });
  assert.equal(revised.agreementVersions.length, 2);
  assert.equal(revised.agreementVersions[0].status, 'منسوخ‌شده');
  assert.equal(revised.agreementVersions[1].versionLabel, 'V2');
  assert.equal(revised.agreementVersions[1].applicantApproved, false);
  const partialApprove = approveAgreementVersion(revised, 'applicant');
  assert.ok(partialApprove.contractSignatureNoticeFa.includes('موافقم'));
  assert.equal(partialApprove.dossier.agreementVersions[1].status, 'آماده تأیید');

  // Test 4 & Test 5: Itemized invoice totals + corrective invoice retains original
  const totals = calculateInvoiceTotals({
    items: INITIAL_STAGE44_DOSSIER.invoices[0].items,
    discountToman: 0,
    platformFeeToman: 200_000,
    verifiedTaxToman: null,
  });
  assert.equal(totals.totalPayableToman, 5_200_000);
  const corrected = issueCorrectiveInvoice({
    dossier: INITIAL_STAGE44_DOSSIER,
    targetInvoiceId: 'inv-44-101',
    adjustedBaseAmountToman: 4_100_000,
    reasonFa: 'تخفیف اصلاحی',
  });
  assert.equal(corrected.invoices.length, 2);
  assert.equal(corrected.invoices[0].status, 'اصلاح‌شده');
  assert.ok(corrected.invoices[1].invoiceNumber.endsWith('-R1'));

  // Test 6, 7 & 13: Currency guard, duplicate payment guard, unverified return stays pending & issues no receipt
  const rejectedCurrency = initiatePaymentAttempt({
    dossier: INITIAL_STAGE44_DOSSIER,
    invoiceId: 'inv-44-101',
    amountToman: 1_000_000,
    methodId: 'shaparak_gateway',
    currencyUnit: 'rial',
  });
  assert.equal(rejectedCurrency.ok, false);

  const started = initiatePaymentAttempt({
    dossier: INITIAL_STAGE44_DOSSIER,
    invoiceId: 'inv-44-101',
    amountToman: 1_400_000,
    methodId: 'shaparak_gateway',
  });
  assert.equal(started.ok, true);
  assert.ok(started.createdPayment);

  const dup = initiatePaymentAttempt({
    dossier: started.dossier,
    invoiceId: 'inv-44-101',
    amountToman: 1_400_000,
    methodId: 'shaparak_gateway',
  });
  assert.equal(dup.ok, false);

  const unverifiedReturn = confirmPaymentAndIssueReceipt({
    dossier: started.dossier,
    paymentId: started.createdPayment!.paymentId,
    authoritativeVerified: false,
    trackingCode: 'FAKE-1',
  });
  assert.equal(unverifiedReturn.receiptIssued, false);

  const verifiedReturn = confirmPaymentAndIssueReceipt({
    dossier: started.dossier,
    paymentId: started.createdPayment!.paymentId,
    authoritativeVerified: true,
    trackingCode: 'SHP-551199',
  });
  assert.equal(verifiedReturn.receiptIssued, true);

  // Test 8, 9, 10, 11: Milestone separation, cancellation never auto-refunds, refund keeps original payment, provider summary separates collected vs settled
  const msSplit = splitMilestoneExecutionVsPayment(INITIAL_STAGE44_DOSSIER.milestones);
  assert.notEqual(msSplit.executedCount, msSplit.paidCount);

  const cancelCheck = assessAgreementCancellation({
    dossier: INITIAL_STAGE44_DOSSIER,
    scenario: 'cancel_agreement',
    reasonFa: 'تغییر تاریخ خرید',
  });
  assert.equal(cancelCheck.autoRefundTriggered, false);

  const refunded = requestRefundSafely({
    dossier: INITIAL_STAGE44_DOSSIER,
    paymentId: 'pay-44-901',
    requestedAmountToman: 1_300_000,
    reasonFa: 'بازپرداخت توافقی جزئی',
  });
  assert.equal(refunded.refunds.length, 1);
  assert.equal(refunded.receipts[0].receiptType, 'refund');
  assert.ok(buildStage44FinancialExportCsv(refunded).includes('تومان'));

  const providerSummary = computeProviderFinancialSummary(INITIAL_STAGE44_DOSSIER);
  assert.equal(providerSummary.collectedConfirmedToman, 2_600_000);
  assert.equal(providerSummary.settledAmountToman, 0);

  // Test 14: Unauthorized third party RBAC denial
  const blocked = canAccessTransactionDossier(INITIAL_STAGE44_DOSSIER, 'usr-stranger-99', 'unauthorized_third_party');
  assert.equal(blocked.allowed, false);
});
