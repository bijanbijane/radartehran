/** @file src/features/onboarding/services/serviceTransactionPaymentsEngine.ts — Stage 44 Payment, Receipt, Refund, Cancellation & Provider Summary Helpers */
import { toPersianNum } from '../../../data/neighborhoods';
import { formatTomanCurrency } from './serviceTransactionFormatters';
import type {
  AgreementVersionRecord,
  CancellationScenarioKind,
  MilestonePaymentItem,
  PaymentOperationRecord,
  PaymentReceiptRecord,
  RefundRequestRecord,
  ServiceTransactionDossier,
} from './serviceTransactionTypes';

function getActiveAgreementVer(dossier: ServiceTransactionDossier): AgreementVersionRecord {
  return dossier.agreementVersions.find((v) => v.versionId === dossier.activeVersionId) || dossier.agreementVersions[dossier.agreementVersions.length - 1];
}

export function initiatePaymentAttempt(params: {
  dossier: ServiceTransactionDossier;
  invoiceId: string;
  amountToman: number;
  methodId: 'shaparak_gateway' | 'bank_transfer_declared';
  currencyUnit?: string;
}): { ok: boolean; errorFa?: string; dossier: ServiceTransactionDossier; createdPayment?: PaymentOperationRecord } {
  if (params.currencyUnit && params.currencyUnit !== 'toman') {
    return { ok: false, errorFa: 'واحد پول ناسازگار مسدود شد: تنها پرداخت با واحد شفاف تومان مجاز است.', dossier: params.dossier };
  }
  const hasPendingOrInFlight = params.dossier.payments.some(
    (p) => p.invoiceId === params.invoiceId && (p.status === 'در حال انتقال' || p.status === 'در انتظار تأیید'),
  );
  if (hasPendingOrInFlight) {
    return {
      ok: false,
      errorFa: 'جلوگیری از پرداخت تکراری: یک تراکنش در حال انتقال یا در انتظار تأیید برای این صورت‌حساب وجود دارد. ابتدا وضعیت آن را بررسی کنید.',
      dossier: params.dossier,
    };
  }
  const invoice = params.dossier.invoices.find((i) => i.invoiceId === params.invoiceId);
  if (!invoice || params.amountToman <= 0) {
    return { ok: false, errorFa: 'صورت‌حساب یا مبلغ معتبر نیست.', dossier: params.dossier };
  }
  const createdPayment: PaymentOperationRecord = {
    paymentId: `pay-${Date.now()}`,
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    createdAtFa: '۱۴ آبان ۱۴۰۵ · ۱۳:۱۰',
    amountToman: Math.min(params.amountToman, invoice.remainingToman || params.amountToman),
    currencyUnit: 'toman',
    methodId: params.methodId,
    methodLabelFa: params.methodId === 'shaparak_gateway' ? 'درگاه پرداخت شاپرک' : 'انتقال بانکی اعلام‌شده (خارج از سامانه)',
    status: 'در انتظار تأیید',
    isPartialPayment: params.amountToman < invoice.totalPayableToman,
    gatewayVerifiedSourceFa: params.methodId === 'shaparak_gateway' ? 'بازگشت کاربر از درگاه (هنوز از منبع معتبر تأیید نشده)' : 'اعلام رسید توسط پرداخت‌کننده (نیازمند تأیید دریافت)',
    offlineVerificationState: params.methodId === 'bank_transfer_declared' ? 'اعلام‌شده توسط پرداخت‌کننده' : undefined,
    idempotencyKey: `idem-${invoice.invoiceId}-${params.amountToman}`,
  };
  return {
    ok: true,
    createdPayment,
    dossier: { ...params.dossier, payments: [createdPayment, ...params.dossier.payments] },
  };
}

export function confirmPaymentAndIssueReceipt(params: {
  dossier: ServiceTransactionDossier;
  paymentId: string;
  authoritativeVerified: boolean;
  trackingCode: string;
}): { dossier: ServiceTransactionDossier; receiptIssued: boolean; messageFa: string } {
  const target = params.dossier.payments.find((p) => p.paymentId === params.paymentId);
  if (!target) return { dossier: params.dossier, receiptIssued: false, messageFa: 'تراکنش یافت نشد.' };
  if (!params.authoritativeVerified) {
    return {
      dossier: params.dossier,
      receiptIssued: false,
      messageFa: 'بازگشت از درگاه بدون تأیید منبع معتبر کافی نیست؛ وضعیت «در انتظار تأیید» باقی ماند و رسید صادر نشد.',
    };
  }
  const updatedPayments = params.dossier.payments.map((p) =>
    p.paymentId === params.paymentId
      ? {
          ...p,
          status: 'موفق' as const,
          finalizedAtFa: '۱۴ آبان ۱۴۰۵ · ۱۳:۱۲',
          gatewayVerifiedSourceFa: 'تأیید استعلام رسمی سرویس پرداخت',
          trackingCode: params.trackingCode,
          offlineVerificationState: p.methodId === 'bank_transfer_declared' ? ('دریافت وجه تأییدشده توسط ارائه‌دهنده' as const) : undefined,
        }
      : p,
  );
  const updatedInvoices = params.dossier.invoices.map((inv) => {
    if (inv.invoiceId !== target.invoiceId) return inv;
    const paidToman = inv.paidToman + target.amountToman;
    const remainingToman = Math.max(0, inv.totalPayableToman - paidToman);
    return { ...inv, paidToman, remainingToman, status: remainingToman === 0 ? ('پرداخت‌شده' as const) : ('بخشی پرداخت‌شده' as const) };
  });
  const receipt: PaymentReceiptRecord = {
    receiptId: `rcp-${Date.now()}`,
    receiptType: 'payment',
    paymentId: target.paymentId,
    invoiceId: target.invoiceId,
    agreementVersionLabel: getActiveAgreementVer(params.dossier).versionLabel,
    issuedAtFa: '۱۴ آبان ۱۴۰۵ · ۱۳:۱۲',
    payerNameFa: params.dossier.applicant.displayNameFa,
    payeeNameFa: params.dossier.provider.displayNameFa,
    serviceTitleFa: params.dossier.serviceTitleFa,
    amountToman: target.amountToman,
    currencyUnit: 'toman',
    methodLabelFa: target.methodLabelFa,
    trackingCode: params.trackingCode,
    statusLabelFa: target.isPartialPayment ? 'پرداخت جزئی تأییدشده' : 'پرداخت کامل تأییدشده',
    isPartial: target.isPartialPayment,
  };
  return {
    dossier: { ...params.dossier, payments: updatedPayments, invoices: updatedInvoices, receipts: [receipt, ...params.dossier.receipts] },
    receiptIssued: true,
    messageFa: `پرداخت به مبلغ ${formatTomanCurrency(target.amountToman)} تأیید و رسید ${receipt.receiptId} صادر شد.`,
  };
}

export function requestRefundSafely(params: {
  dossier: ServiceTransactionDossier;
  paymentId: string;
  requestedAmountToman: number;
  reasonFa: string;
}): ServiceTransactionDossier {
  const pay = params.dossier.payments.find((p) => p.paymentId === params.paymentId && p.status === 'موفق');
  if (!pay) return params.dossier;
  const clamped = Math.max(0, Math.min(pay.amountToman, Math.round(params.requestedAmountToman)));
  const isPartial = clamped < pay.amountToman;
  const refund: RefundRequestRecord = {
    refundId: `ref-${Date.now()}`,
    originalPaymentId: pay.paymentId,
    originalAmountToman: pay.amountToman,
    requestedAmountToman: clamped,
    approvedAmountToman: clamped,
    reasonFa: params.reasonFa.trim() || 'توافق طرفین برای بازگشت وجه',
    requestedAtFa: '۱۴ آبان ۱۴۰۵ · ۱۳:۳۰',
    status: isPartial ? 'بازپرداخت جزئی' : 'انجام‌شده',
    refundTrackingCode: `RF-${toPersianNum(8421)}`,
  };
  const refundReceipt: PaymentReceiptRecord = {
    receiptId: `rcp-ref-${Date.now()}`,
    receiptType: 'refund',
    paymentId: pay.paymentId,
    invoiceId: pay.invoiceId,
    agreementVersionLabel: getActiveAgreementVer(params.dossier).versionLabel,
    issuedAtFa: '۱۴ آبان ۱۴۰۵ · ۱۳:۳۱',
    payerNameFa: params.dossier.provider.displayNameFa,
    payeeNameFa: params.dossier.applicant.displayNameFa,
    serviceTitleFa: `بازپرداخت — ${params.dossier.serviceTitleFa}`,
    amountToman: clamped,
    currencyUnit: 'toman',
    methodLabelFa: 'برگشت به مبدا پرداخت',
    trackingCode: refund.refundTrackingCode || 'RF-8421',
    statusLabelFa: isPartial ? 'رسید بازپرداخت جزئی (پرداخت اولیه محفوظ است)' : 'رسید بازپرداخت کامل',
    isPartial,
  };
  return {
    ...params.dossier,
    payments: params.dossier.payments.map((p) =>
      p.paymentId === pay.paymentId ? { ...p, status: isPartial ? ('بازپرداخت جزئی' as const) : ('بازپرداخت‌شده' as const) } : p,
    ),
    refunds: [refund, ...params.dossier.refunds],
    receipts: [refundReceipt, ...params.dossier.receipts],
  };
}

export function assessAgreementCancellation(params: {
  dossier: ServiceTransactionDossier;
  scenario: CancellationScenarioKind;
  reasonFa: string;
}): { scenarioLabelFa: string; paidToman: number; outstandingToman: number; autoRefundTriggered: false; noticeFa: string } {
  const paidToman = params.dossier.payments.filter((p) => p.status === 'موفق' || p.status === 'بازپرداخت جزئی').reduce((s, p) => s + p.amountToman, 0);
  const invoicedToman = params.dossier.invoices.filter((i) => i.status !== 'اصلاح‌شده' && i.status !== 'لغوشده').reduce((s, i) => s + i.totalPayableToman, 0);
  const outstandingToman = Math.max(0, invoicedToman - paidToman);
  const labels: Record<CancellationScenarioKind, string> = {
    cancel_request: 'لغو درخواست پیش از توافق',
    reject_quote: 'رد پیشنهاد قیمت',
    cancel_agreement: 'لغو توافق پذیرفته‌شده',
    pause_service: 'توقف موقت اجرا',
    revise_agreement: 'اصلاح توافق (ایجاد نسخه جدید)',
    request_refund: 'درخواست بازپرداخت مستقل',
  };
  return {
    scenarioLabelFa: labels[params.scenario],
    paidToman,
    outstandingToman,
    autoRefundTriggered: false,
    noticeFa: `لغو توافق به دلیل «${params.reasonFa}» به‌معنی بازپرداخت خودکار نیست؛ وضعیت مالی باید جداگانه بررسی و در بخش بازپرداخت ثبت شود.`,
  };
}

export function computeProviderFinancialSummary(dossier: ServiceTransactionDossier): {
  agreedAmountToman: number;
  invoicedAmountToman: number;
  collectedConfirmedToman: number;
  pendingAmountToman: number;
  refundedAmountToman: number;
  platformFeeToman: number;
  settledAmountToman: number;
} {
  const activeVer = getActiveAgreementVer(dossier);
  const agreedAmountToman = activeVer.amountToman + activeVer.sideCostsToman - activeVer.discountToman;
  const activeInvoices = dossier.invoices.filter((i) => i.status !== 'اصلاح‌شده' && i.status !== 'لغوشده');
  const invoicedAmountToman = activeInvoices.reduce((s, i) => s + i.totalPayableToman, 0);
  const collectedConfirmedToman = dossier.payments
    .filter((p) => p.status === 'موفق' || p.status === 'بازپرداخت جزئی' || p.status === 'بازپرداخت‌شده')
    .reduce((s, p) => s + p.amountToman, 0);
  const pendingAmountToman = dossier.payments.filter((p) => p.status === 'در انتظار تأیید' || p.status === 'در حال انتقال').reduce((s, p) => s + p.amountToman, 0);
  const refundedAmountToman = dossier.refunds.reduce((s, r) => s + r.approvedAmountToman, 0);
  return {
    agreedAmountToman,
    invoicedAmountToman,
    collectedConfirmedToman,
    pendingAmountToman,
    refundedAmountToman,
    platformFeeToman: activeVer.platformFeeToman,
    settledAmountToman: dossier.settlement.settledAmountToman,
  };
}

export function splitMilestoneExecutionVsPayment(milestones: MilestonePaymentItem[]): { executedCount: number; paidCount: number; totalCount: number } {
  return {
    executedCount: milestones.filter((m) => m.executionStatus === 'انجام‌شده' || m.executionStatus === 'تأییدشده').length,
    paidCount: milestones.filter((m) => m.paymentStatus === 'پرداخت‌شده').length,
    totalCount: milestones.length,
  };
}
