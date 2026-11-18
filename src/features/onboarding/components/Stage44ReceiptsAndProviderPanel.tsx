/** @file src/features/onboarding/components/Stage44ReceiptsAndProviderPanel.tsx — Stage 44 Receipts, Cancellation, Refunds & Provider Summary */
import React, { useState } from 'react';
import {
  assessAgreementCancellation,
  buildStage44FinancialExportCsv,
  computeProviderFinancialSummary,
  formatTomanCurrency,
  requestRefundSafely,
} from '../services/serviceTransactionEngine';
import type { CancellationScenarioKind, ServiceTransactionDossier } from '../services/serviceTransactionTypes';

export interface Stage44ReceiptsAndProviderPanelProps {
  section: 'receipts' | 'provider';
  dossier: ServiceTransactionDossier;
  onUpdateDossier: (next: ServiceTransactionDossier) => void;
  onFeedbackFa: (msg: string) => void;
}

export const Stage44ReceiptsAndProviderPanel: React.FC<Stage44ReceiptsAndProviderPanelProps> = ({
  section,
  dossier,
  onUpdateDossier,
  onFeedbackFa,
}) => {
  const [cancelScenario, setCancelScenario] = useState<CancellationScenarioKind>('cancel_agreement');
  const [receiptFilter, setReceiptFilter] = useState<'all' | 'payment' | 'refund'>('all');
  const [csvPreview, setCsvPreview] = useState<string>('');

  const handleRefundLastConfirmed = () => {
    const confirmed = dossier.payments.find((p) => p.status === 'موفق');
    if (!confirmed) {
      onFeedbackFa('تراکنش موفق قابل بازپرداخت یافت نشد.');
      return;
    }
    const next = requestRefundSafely({
      dossier,
      paymentId: confirmed.paymentId,
      requestedAmountToman: Math.round(confirmed.amountToman / 2),
      reasonFa: 'توافق بر بازپرداخت جزئی ۵۰٪ هزینه مرحله باقی‌مانده',
      awaitServerConfirmation: true,
    });
    onUpdateDossier(next);
    onFeedbackFa('درخواست بازپرداخت جزئی با وضعیت «درخواست ثبت‌شده» (REFUND_PENDING) ثبت شد و تا تأیید نهایی سرور، رسید بازپرداخت قطعی صادر نمی‌شود.');
  };

  if (section === 'receipts') {
    const cancelPreview = assessAgreementCancellation({ dossier, scenario: cancelScenario, reasonFa: 'تغییر زمان یا شرایط توافق' });
    const filteredReceipts = dossier.receipts.filter((r) => receiptFilter === 'all' || r.receiptType === receiptFilter);
    return (
      <div className="space-y-3 text-[11px]" data-testid="txn-receipts-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
          <div className="flex gap-1.5">
            {(['all', 'payment', 'refund'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setReceiptFilter(f)} className={`rounded px-2.5 py-1 font-bold cursor-pointer ${receiptFilter === f ? 'bg-cyan-600 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-700'}`}>
                {f === 'all' ? 'همه رسیدها' : f === 'payment' ? 'رسیدهای پرداخت' : 'رسیدهای بازپرداخت'}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button type="button" data-testid="txn-request-refund-btn" onClick={handleRefundLastConfirmed} className="rounded border border-rose-600 bg-rose-950/40 px-2.5 py-1 font-bold text-rose-200 cursor-pointer">
              ثبت درخواست بازپرداخت جزئی (نیازمند تأیید سرور)
            </button>
            <button type="button" data-testid="txn-export-csv-btn" onClick={() => setCsvPreview(buildStage44FinancialExportCsv(dossier))} className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 font-bold text-slate-200 cursor-pointer">
              پیش‌نمایش خروجی CSV (مرحله ۴۰)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {filteredReceipts.map((r) => (
            <div key={r.receiptId} className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
              <div className="flex items-center justify-between font-bold">
                <span className={r.receiptType === 'refund' ? 'text-rose-300' : 'text-emerald-300'}>
                  {r.statusLabelFa} ({r.receiptId}) {r.isDemoFixture ? '· [DEMO]' : ''}
                </span>
                <span className="text-white tabular-nums">{formatTomanCurrency(r.amountToman)}</span>
              </div>
              <div className="text-slate-300">پرداخت‌کننده: {r.payerNameFa} ← دریافت‌کننده: {r.payeeNameFa}</div>
              <div className="text-slate-400">کد پیگیری: <span dir="ltr">{r.trackingCode}</span> · نسخه: {r.agreementVersionLabel} · {r.issuedAtFa}</div>
            </div>
          ))}
        </div>

        {csvPreview && (
          <pre data-testid="txn-csv-preview" dir="ltr" className="overflow-x-auto rounded border border-slate-800 bg-slate-950 p-2.5 text-[10px] text-emerald-300">
            {csvPreview}
          </pre>
        )}

        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-white">۶ سناریوی لغو و توقف (بدون بازپرداخت خودکار — TXN-18)</span>
            <select aria-label="سناریوی لغو توافق" value={cancelScenario} onChange={(e) => setCancelScenario(e.target.value as CancellationScenarioKind)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
              <option value="cancel_request">لغو درخواست پیش از توافق</option>
              <option value="reject_quote">رد پیشنهاد قیمت</option>
              <option value="cancel_agreement">لغو توافق پذیرفته‌شده</option>
              <option value="pause_service">توقف موقت اجرا</option>
              <option value="revise_agreement">اصلاح توافق</option>
              <option value="request_refund">درخواست بازپرداخت مستقل</option>
            </select>
          </div>
          <p className="text-amber-200">{cancelPreview.noticeFa} (پرداخت‌شده تاکنون: {formatTomanCurrency(cancelPreview.paidToman)})</p>
        </div>
      </div>
    );
  }

  const summary = computeProviderFinancialSummary(dossier);
  return (
    <div className="space-y-3 text-[11px]" data-testid="txn-provider-dashboard">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[
          ['مبلغ توافق‌شده', summary.agreedAmountToman, 'text-white'],
          ['مبلغ صورت‌حساب‌شده', summary.invoicedAmountToman, 'text-cyan-300'],
          ['دریافتی قطعی مشتری', summary.collectedConfirmedToman, 'text-emerald-300'],
          ['در انتظار تأیید', summary.pendingAmountToman, 'text-amber-300'],
          ['بازپرداخت‌شده', summary.refundedAmountToman, 'text-rose-300'],
          ['کارمزد رادار تهران', summary.platformFeeToman, 'text-slate-300'],
          ['مبلغ تسویه‌شده با ارائه‌دهنده', summary.settledAmountToman, 'text-slate-400'],
        ].map(([label, val, cls]) => (
          <div key={String(label)} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="text-[10px] text-slate-400">{label}</div>
            <div className={`mt-1 text-xs font-bold tabular-nums ${cls}`}>{formatTomanCurrency(Number(val))}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-amber-600/40 bg-amber-950/20 p-2.5 text-amber-200">
        وضعیت تسویه ارائه‌دهنده: <strong>{dossier.settlement.statusFa}</strong> — {dossier.settlement.noteFa}
      </div>
    </div>
  );
};
