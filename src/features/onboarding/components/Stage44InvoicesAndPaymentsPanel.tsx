/** @file src/features/onboarding/components/Stage44InvoicesAndPaymentsPanel.tsx — Stage 44 Invoices, Payments & Milestones */
import React, { useState } from 'react';
import {
  confirmPaymentAndIssueReceipt,
  formatTomanCurrency,
  initiatePaymentAttempt,
  issueCorrectiveInvoice,
  numberToPersianWordsToman,
  splitMilestoneExecutionVsPayment,
} from '../services/serviceTransactionEngine';
import type { ServiceTransactionDossier } from '../services/serviceTransactionTypes';
import { Stage44ReceiptsAndProviderPanel } from './Stage44ReceiptsAndProviderPanel';

export interface Stage44InvoicesAndPaymentsPanelProps {
  section: 'invoices' | 'payments' | 'receipts' | 'provider';
  dossier: ServiceTransactionDossier;
  onUpdateDossier: (next: ServiceTransactionDossier) => void;
  onFeedbackFa: (msg: string) => void;
}

export const Stage44InvoicesAndPaymentsPanel: React.FC<Stage44InvoicesAndPaymentsPanelProps> = ({
  section,
  dossier,
  onUpdateDossier,
  onFeedbackFa,
}) => {
  const activeInvoice = dossier.invoices.find((i) => i.status !== 'اصلاح‌شده' && i.status !== 'لغوشده') || dossier.invoices[0];
  const [payAmount, setPayAmount] = useState(String(activeInvoice?.remainingToman || 1_400_000));
  const [payMethod, setPayMethod] = useState<'shaparak_gateway' | 'bank_transfer_declared'>('shaparak_gateway');

  if (section === 'receipts' || section === 'provider') {
    return <Stage44ReceiptsAndProviderPanel section={section} dossier={dossier} onUpdateDossier={onUpdateDossier} onFeedbackFa={onFeedbackFa} />;
  }

  const handleCorrectiveInvoice = () => {
    const next = issueCorrectiveInvoice({
      dossier,
      targetInvoiceId: activeInvoice.invoiceId,
      adjustedBaseAmountToman: Math.max(1_000_000, activeInvoice.totalPayableToman - 400_000),
      reasonFa: 'تخفیف توافق‌شده به‌دلیل عدم نیاز به بازدید موتورخانه',
    });
    onUpdateDossier(next);
    onFeedbackFa('صورت‌حساب اصلاحی صادر شد و صورت‌حساب قبلی با وضعیت «اصلاح‌شده» در تاریخچه حفظ گردید.');
  };

  const handleStartPayment = () => {
    const num = Number(payAmount.replace(/[^0-9]/g, ''));
    const res = initiatePaymentAttempt({ dossier, invoiceId: activeInvoice.invoiceId, amountToman: num, methodId: payMethod });
    onUpdateDossier(res.dossier);
    onFeedbackFa(res.ok ? 'تراکنش ایجاد شد و تا تأیید رسمی سرور در وضعیت «در انتظار تأیید» قرار دارد.' : (res.errorFa || 'خطا در شروع پرداخت'));
  };

  const handleServerStatusInquiry = (paymentId: string, simulateTimeout: boolean) => {
    const res = confirmPaymentAndIssueReceipt({
      dossier,
      paymentId,
      authoritativeVerified: false,
      trackingCode: '',
      networkTimedOut: simulateTimeout,
    });
    onUpdateDossier(res.dossier);
    onFeedbackFa(res.messageFa);
  };

  if (section === 'invoices') {
    return (
      <div className="space-y-3" data-testid="txn-invoices-panel">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5 text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-amber-300">پیش‌فاکتور برآوردی ({dossier.proforma.proformaId}) — مطالبه قطعی وجه نیست (TXN-08)</span>
            <span className="tabular-nums text-slate-300">{formatTomanCurrency(dossier.proforma.estimatedTotalToman)}</span>
          </div>
          <p className="text-slate-400">{dossier.proforma.scopeSummaryFa} · {dossier.proforma.limitationsFa}</p>
        </div>

        {dossier.invoices.map((inv) => (
          <div key={inv.invoiceId} className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2.5 text-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div>
                <span className="font-bold text-white">{inv.invoiceNumber}</span>
                <span className="mx-2 text-slate-500">·</span>
                <span className="text-cyan-300">نسخه توافق: {inv.agreementVersionLabel}</span>
                <span className="mx-2 text-slate-500">·</span>
                <span className="font-bold text-emerald-300">{inv.status}</span>
              </div>
              <button
                type="button"
                data-testid="txn-issue-corrective-invoice-btn"
                onClick={handleCorrectiveInvoice}
                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-slate-200 hover:border-cyan-500 cursor-pointer"
              >
                صدور صورت‌حساب اصلاحی (حفظ نسخه قبلی)
              </button>
            </div>
            <div className="space-y-1">
              {inv.items.map((it) => (
                <div key={it.itemId} className="flex items-center justify-between rounded bg-slate-900/70 px-2.5 py-1.5">
                  <div>
                    <span className="font-bold text-slate-200">{it.titleFa}</span>
                    <span className="mr-2 text-[10px] text-slate-400">({it.isMandatory ? 'الزامی' : 'اختیاری'})</span>
                  </div>
                  <span className="font-bold text-white tabular-nums">{formatTomanCurrency(it.amountToman)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between rounded bg-slate-900/70 px-2.5 py-1.5 text-slate-300">
                <span>کارمزد خدمات رادار تهران (مبنا: ۴٪ تعرفه شفاف پرونده)</span>
                <span className="tabular-nums">{formatTomanCurrency(inv.platformFeeToman)}</span>
              </div>
            </div>
            <div className="rounded border border-emerald-700/40 bg-emerald-950/20 p-2 space-y-1">
              <div className="flex flex-wrap items-center justify-between font-bold text-emerald-200 tabular-nums">
                <span>جمع قابل پرداخت: {formatTomanCurrency(inv.totalPayableToman)}</span>
                <span>باقی‌مانده: {formatTomanCurrency(inv.remainingToman)}</span>
              </div>
              <div className="text-[10px] text-emerald-300">به حروف: {numberToPersianWordsToman(inv.totalPayableToman)}</div>
              <div className="text-[10px] text-slate-400">{inv.taxNoteFa}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const msSummary = splitMilestoneExecutionVsPayment(dossier.milestones);
  const pendingPay = dossier.payments.find(
    (p) => p.status === 'در انتظار تأیید' || p.status === 'در حال انتقال' || p.status === 'وضعیت نامشخص — نیازمند استعلام مجدد از سرور',
  );
  return (
    <div className="space-y-4" data-testid="txn-payments-panel">
      <div
        data-testid="txn-financial-trust-boundary-banner"
        className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200"
      >
        <strong>مرز اعتماد مالی (RT-FE-REBUILD-017):</strong>{' '}
        {dossier.isFixtureDemo ? 'نمایشی — بدون تراکنش واقعی (DEMO) · ' : ''}
        درگاه پرداخت در حال حاضر فعال نیست (UNAVAILABLE). هیچ دکمه‌ای در مرورگر مجاز به تأیید نهایی پرداخت یا تولید کد رهگیری تصادفی نیست؛ صدور رسید صرفاً با مدرک امضاشده سرور انجام می‌شود.
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[11px]">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2.5">
          <div className="text-xs font-bold text-white">شروع پرداخت شفاف به تومان (محافظت در برابر پرداخت تکراری)</div>
          <div className="space-y-1.5">
            <label className="block text-slate-300">
              <span>روش پرداخت پشتیبانی‌شده:</span>
              <select
                aria-label="روش پرداخت"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as 'shaparak_gateway' | 'bank_transfer_declared')}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-white"
              >
                {dossier.supportedPaymentMethods.map((m) => (
                  <option key={m.id} value={m.id}>{m.labelFa}</option>
                ))}
              </select>
            </label>
            <label className="block text-slate-300">
              <span>مبلغ پرداخت (تومان):</span>
              <input
                type="text"
                aria-label="مبلغ پرداخت به تومان"
                data-testid="txn-payment-amount-input"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-white tabular-nums"
              />
            </label>
          </div>
          <button type="button" data-testid="txn-start-payment-btn" onClick={handleStartPayment} className="w-full rounded-lg bg-[var(--color-brand-600)] hover:bg-emerald-500 px-3 py-1.5 font-bold text-slate-950 cursor-pointer">
            ایجاد تراکنش پرداخت
          </button>

          {pendingPay && (
            <div className="rounded border border-amber-600/50 bg-amber-950/20 p-2.5 space-y-2" data-testid="txn-pending-payment-guard">
              <div className="font-bold text-amber-200">
                وضعیت تراکنش: {pendingPay.status} ({formatTomanCurrency(pendingPay.amountToman)})
              </div>
              <div className="text-slate-300">{pendingPay.gatewayVerifiedSourceFa}</div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  data-testid="txn-unverified-return-btn"
                  onClick={() => handleServerStatusInquiry(pendingPay.paymentId, false)}
                  className="rounded border border-amber-500 bg-slate-900 px-2 py-1 font-bold text-amber-200 cursor-pointer"
                >
                  استعلام وضعیت از سرور (بدون تأیید کلاینت)
                </button>
                <button
                  type="button"
                  data-testid="txn-timeout-inquiry-btn"
                  onClick={() => handleServerStatusInquiry(pendingPay.paymentId, true)}
                  className="rounded border border-slate-600 bg-slate-900 px-2 py-1 font-bold text-slate-200 cursor-pointer"
                >
                  ثبت حالت نامشخص (UNKNOWN در صورت Timeout)
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">پرداخت مرحله‌ای (تفکیک پیشرفت اجرا از پرداخت)</span>
            <span className="text-[10px] text-cyan-300 tabular-nums">
              اجرا: {msSummary.executedCount}/{msSummary.totalCount} · پرداخت: {msSummary.paidCount}/{msSummary.totalCount}
            </span>
          </div>
          <div className="space-y-1.5">
            {dossier.milestones.map((m) => (
              <div key={m.milestoneId} className="rounded border border-slate-800 bg-slate-900/70 p-2 flex items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-200">{m.titleFa}</div>
                  <div className="text-[10px] text-slate-400">وضعیت اجرا: {m.executionStatus} · وضعیت پرداخت: {m.paymentStatus}</div>
                </div>
                <span className="font-bold text-white tabular-nums whitespace-nowrap">{formatTomanCurrency(m.amountToman)}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-400">
            تأیید پرداخت یک مرحله صرفاً وضعیت مالی همان مرحله را مشخص می‌کند و به معنی تکمیل پروژه یا وجود «وجه امانی تضمینی» بدون زیرساخت حقوقی نیست.
          </div>
        </div>
      </div>
    </div>
  );
};
