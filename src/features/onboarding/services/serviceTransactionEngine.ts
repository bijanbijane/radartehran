/** @file src/features/onboarding/services/serviceTransactionEngine.ts — Stage 44 Agreement, Versioning & Invoice Engine */
import type { ServiceQuoteRecord, ServiceRequestItem } from './proMarketplaceEngine';
import {
  buildStage44FinancialExportCsv,
  formatTomanCurrency,
  numberToPersianWordsToman,
} from './serviceTransactionFormatters';
import {
  assessAgreementCancellation,
  computeProviderFinancialSummary,
  confirmPaymentAndIssueReceipt,
  initiatePaymentAttempt,
  requestRefundSafely,
  splitMilestoneExecutionVsPayment,
} from './serviceTransactionPaymentsEngine';
import type {
  AgreementVersionRecord,
  InvoiceLineItem,
  ServiceInvoiceRecord,
  ServiceTransactionDossier,
  TransactionViewerRole,
} from './serviceTransactionTypes';

export {
  assessAgreementCancellation,
  buildStage44FinancialExportCsv,
  computeProviderFinancialSummary,
  confirmPaymentAndIssueReceipt,
  formatTomanCurrency,
  initiatePaymentAttempt,
  numberToPersianWordsToman,
  requestRefundSafely,
  splitMilestoneExecutionVsPayment,
};

export function canAccessTransactionDossier(
  dossier: ServiceTransactionDossier,
  viewerUserId: string,
  viewerRole: TransactionViewerRole,
): { allowed: boolean; reasonFa: string } {
  if (viewerRole === 'admin') {
    return { allowed: true, reasonFa: 'دسترسی ممیزی مدیر سامانه با ثبت لاگ برقرار است.' };
  }
  if (viewerUserId === dossier.applicant.userId || viewerUserId === dossier.provider.userId) {
    return { allowed: true, reasonFa: 'دسترسی مجاز برای طرفین پرونده خدمت.' };
  }
  return {
    allowed: false,
    reasonFa: 'دسترسی مسدود شد: مشاهده صورت‌حساب، توافق و جزئیات تراکنش برای کاربران خارج از طرفین توافق مجاز نیست.',
  };
}

export function dossierActiveVersion(dossier: ServiceTransactionDossier): AgreementVersionRecord {
  return dossier.agreementVersions.find((v) => v.versionId === dossier.activeVersionId) || dossier.agreementVersions[dossier.agreementVersions.length - 1];
}

export function convertQuoteToAgreementDraft(params: {
  request: ServiceRequestItem;
  quote: ServiceQuoteRecord;
  platformFeeToman: number;
  visitFeeToman: number;
}): AgreementVersionRecord {
  const baseToman = Math.round(params.quote.amountM * 1_000_000);
  return {
    versionId: `agr-v1-${params.quote.quoteId}`,
    versionNumber: 1,
    versionLabel: 'V1',
    status: 'پیشنهاد اولیه',
    createdAtFa: '۱۴ آبان ۱۴۰۵ · ۱۰:۳۰',
    createdByFa: params.quote.providerNameFa,
    changeSummaryFa: `ایجاد مستقیم از پیشنهاد قیمت ${params.quote.quoteId} بدون ورود مجدد اطلاعات (درخواست ${params.request.requestId})`,
    changesFromPreviousFa: ['نسخه پایه برگرفته از پیشنهاد مرحله ۴۳'],
    subjectTitleFa: params.quote.scopeIncludedFa,
    scopeIncludedFa: [params.quote.scopeIncludedFa, 'تحویل گزارش مکتوب در پرونده خدمت'],
    outOfScopeFa: [params.quote.outOfScopeCostsFa, 'آزمایش‌های تخریب‌محور یا اخذ مجوزهای ثبتی خارج از دامنه'],
    timelineFa: {
      proposedStartDateFa: '۱۶ آبان ۱۴۰۵',
      estimatedDurationFa: params.quote.durationLabelFa,
      executionStagesFa: ['بازدید حضوری', 'بررسی فنی و ثبت مشاهدات', 'تدوین و تحویل گزارش نهایی'],
      deliveryDeadlineFa: '۴۸ ساعت پس از بازدید',
      rescheduleConditionFa: 'تغییر زمان با توافق کتبی طرفین تا ۲۴ ساعت پیش از بازدید',
    },
    amountToman: baseToman,
    sideCostsToman: params.visitFeeToman,
    discountToman: 0,
    platformFeeToman: params.platformFeeToman,
    paymentTermsFa: 'پرداخت مطابق صورت‌حساب صادرشده در تومان و صرفاً از روش‌های پشتیبانی‌شده.',
    supplementaryTermsFa: {
      cancellationFa: params.quote.cancellationTermsFa,
      scopeChangeFa: 'هر تغییر در مبلغ یا دامنه، نسخه جدید توافق و تأیید مجدد طرفین را می‌طلبد.',
      delayFa: 'تأخیر بیش از ۴۸ ساعت بدون عذر موجه، حق بررسی و لغو بدون جریمه ایجاد می‌کند.',
      deliveryAndReviewFa: 'درخواست‌کننده تا ۴۸ ساعت پس از تحویل گزارش حق ثبت درخواست اصلاح دارد.',
      disputeResolutionFa: 'رسیدگی مستند از مسیر ثبت اختلاف مالی در پرونده خدمت.',
    },
    applicantApproved: false,
    providerApproved: true,
    providerApprovedAtFa: '۱۴ آبان ۱۴۰۵ · ۱۰:۳۰',
  };
}

export function proposeAgreementRevision(params: {
  dossier: ServiceTransactionDossier;
  newAmountToman: number;
  newScopeNoteFa: string;
  reasonFa: string;
  actorNameFa: string;
}): ServiceTransactionDossier {
  const current = dossierActiveVersion(params.dossier);
  const nextNum = params.dossier.agreementVersions.length + 1;
  const diffs: string[] = [];
  if (params.newAmountToman !== current.amountToman) {
    diffs.push(`تغییر مبلغ پایه خدمت از ${formatTomanCurrency(current.amountToman)} به ${formatTomanCurrency(params.newAmountToman)}`);
  }
  if (params.newScopeNoteFa.trim() && !current.scopeIncludedFa.includes(params.newScopeNoteFa.trim())) {
    diffs.push(`افزودن بند جدید به دامنه خدمت: «${params.newScopeNoteFa.trim()}»`);
  }
  const nextVersion: AgreementVersionRecord = {
    ...current,
    versionId: `agr-v${nextNum}-${Date.now()}`,
    versionNumber: nextNum,
    versionLabel: `V${nextNum}`,
    status: 'آماده تأیید',
    createdAtFa: '۱۴ آبان ۱۴۰۵ · ۱۲:۱۵',
    createdByFa: params.actorNameFa,
    changeSummaryFa: params.reasonFa.trim() || 'اصلاح شرایط و مبلغ توافق',
    changesFromPreviousFa: diffs.length > 0 ? diffs : ['به‌روزرسانی شرایط تکمیلی توافق'],
    scopeIncludedFa: params.newScopeNoteFa.trim() ? [...current.scopeIncludedFa, params.newScopeNoteFa.trim()] : current.scopeIncludedFa,
    amountToman: Math.max(0, Math.round(params.newAmountToman)),
    applicantApproved: false,
    applicantApprovedAtFa: undefined,
    providerApproved: false,
    providerApprovedAtFa: undefined,
  };
  const updatedVersions = params.dossier.agreementVersions.map((v) =>
    v.versionId === current.versionId && v.status === 'پذیرفته‌شده' ? { ...v, status: 'منسوخ‌شده' as const } : v,
  );
  return {
    ...params.dossier,
    agreementVersions: [...updatedVersions, nextVersion],
    activeVersionId: nextVersion.versionId,
    auditHistoryFa: [
      { id: `aud-${Date.now()}`, timestampFa: '۱۴ آبان ۱۴۰۵ · ۱۲:۱۵', actorFa: params.actorNameFa, actionFa: `نسخه ${nextVersion.versionLabel} ایجاد شد (نسخه قبلی محفوظ ماند؛ نیازمند تأیید مجدد طرفین).` },
      ...params.dossier.auditHistoryFa,
    ],
  };
}

export function approveAgreementVersion(
  dossier: ServiceTransactionDossier,
  approverRole: 'applicant' | 'provider',
): { dossier: ServiceTransactionDossier; contractSignatureNoticeFa: string } {
  const versions = dossier.agreementVersions.map((v) => {
    if (v.versionId !== dossier.activeVersionId) return v;
    const nextApplicant = approverRole === 'applicant' ? true : v.applicantApproved;
    const nextProvider = approverRole === 'provider' ? true : v.providerApproved;
    const bothApproved = nextApplicant && nextProvider;
    return {
      ...v,
      applicantApproved: nextApplicant,
      applicantApprovedAtFa: approverRole === 'applicant' ? '۱۴ آبان ۱۴۰۵ · ۱۲:۳۰' : v.applicantApprovedAtFa,
      providerApproved: nextProvider,
      providerApprovedAtFa: approverRole === 'provider' ? '۱۴ آبان ۱۴۰۵ · ۱۲:۳۰' : v.providerApprovedAtFa,
      status: bothApproved ? ('پذیرفته‌شده' as const) : ('آماده تأیید' as const),
    };
  });
  return {
    dossier: {
      ...dossier,
      agreementVersions: versions,
      auditHistoryFa: [
        { id: `aud-${Date.now()}`, timestampFa: '۱۴ آبان ۱۴۰۵ · ۱۲:۳۰', actorFa: approverRole === 'applicant' ? dossier.applicant.displayNameFa : dossier.provider.displayNameFa, actionFa: 'نسخه فعال توافق تأیید شد.' },
        ...dossier.auditHistoryFa,
      ],
    },
    contractSignatureNoticeFa: 'تأیید توافق در پرونده ثبت شد؛ توجه: فشردن «موافقم» بدون الزامات قانونی و امضای معتبر، جایگزین قرارداد رسمی امضاشده نیست.',
  };
}

export function calculateInvoiceTotals(params: {
  items: InvoiceLineItem[];
  discountToman: number;
  platformFeeToman: number;
  verifiedTaxToman?: number | null;
}): { mandatorySubtotalToman: number; optionalSubtotalToman: number; hasEstimatedItems: boolean; totalPayableToman: number } {
  const mandatorySubtotalToman = params.items.filter((i) => i.isMandatory).reduce((s, i) => s + i.amountToman, 0);
  const optionalSubtotalToman = params.items.filter((i) => !i.isMandatory).reduce((s, i) => s + i.amountToman, 0);
  const hasEstimatedItems = params.items.some((i) => i.isEstimated);
  const tax = params.verifiedTaxToman ?? 0;
  const totalPayableToman = Math.max(0, mandatorySubtotalToman + optionalSubtotalToman - params.discountToman + params.platformFeeToman + tax);
  return { mandatorySubtotalToman, optionalSubtotalToman, hasEstimatedItems, totalPayableToman };
}

export function issueCorrectiveInvoice(params: {
  dossier: ServiceTransactionDossier;
  targetInvoiceId: string;
  adjustedBaseAmountToman: number;
  reasonFa: string;
}): ServiceTransactionDossier {
  const oldInv = params.dossier.invoices.find((inv) => inv.invoiceId === params.targetInvoiceId);
  if (!oldInv) return params.dossier;
  const updatedItems = oldInv.items.map((it) =>
    it.category === 'base_service' ? { ...it, amountToman: Math.max(0, Math.round(params.adjustedBaseAmountToman)) } : it,
  );
  const totals = calculateInvoiceTotals({ items: updatedItems, discountToman: oldInv.discountToman, platformFeeToman: oldInv.platformFeeToman, verifiedTaxToman: oldInv.verifiedTaxToman });
  const newInv: ServiceInvoiceRecord = {
    ...oldInv,
    invoiceId: `inv-corr-${Date.now()}`,
    invoiceNumber: `${oldInv.invoiceNumber}-R1`,
    issuedAtFa: '۱۴ آبان ۱۴۰۵ · ۱۳:۰۰',
    items: updatedItems,
    totalPayableToman: totals.totalPayableToman,
    remainingToman: Math.max(0, totals.totalPayableToman - oldInv.paidToman),
    status: 'صادرشده',
    supersedesInvoiceId: oldInv.invoiceId,
    revisionReasonFa: params.reasonFa.trim() || 'اصلاح مبلغ صورت‌حساب',
  };
  return {
    ...params.dossier,
    invoices: [...params.dossier.invoices.map((i) => (i.invoiceId === oldInv.invoiceId ? { ...i, status: 'اصلاح‌شده' as const } : i)), newInv],
    auditHistoryFa: [
      { id: `aud-${Date.now()}`, timestampFa: '۱۴ آبان ۱۴۰۵ · ۱۳:۰۰', actorFa: 'سیستم مالی پرونده', actionFa: `نسخه اصلاحی ${newInv.invoiceNumber} صادر شد و صورت‌حساب قبلی ${oldInv.invoiceNumber} در سوابق حفظ گردید.` },
      ...params.dossier.auditHistoryFa,
    ],
  };
}
